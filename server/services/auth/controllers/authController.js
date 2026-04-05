'use strict';

const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { AppError } = require('../middleware/errorMiddleware');
const { logger } = require('../utils/logger');
const { successResponse, errorResponse, setRefreshTokenCookie, clearRefreshTokenCookie } = require('../utils/responseUtils');
const { generateTokenPair, verifyRefreshToken, getTokenTTL, REFRESH_TTL_SECONDS } = require('../utils/jwtUtils');
const { generateOTP, hashOTP, compareOTP } = require('../utils/otpUtils');
const { sendOTPEmail, sendWelcomeEmail, sendPasswordChangedEmail } = require('../utils/emailUtils');
const {
  storeOTP, getOTP, deleteOTP, incrementOTPAttempts,
  blacklistToken, isTokenBlacklisted,
  storeRefreshToken, revokeRefreshToken, revokeAllUserTokens,
} = require('../config/redis');

const MAX_OTP_ATTEMPTS = parseInt(process.env.MAX_OTP_ATTEMPTS) || 3;
const OTP_TTL = (parseInt(process.env.OTP_EXPIRE_MINUTES) || 10) * 60;

// ═══════════════════════════════════════════════════════════════
// REGISTER
// ═══════════════════════════════════════════════════════════════
async function register(req, res, next) {
  try {
    const { firstName, lastName, email, password, role = 'user', phone } = req.body;

    // Check existing user
    const existingUser = await User.findByEmail(email);
    if (existingUser) {
      return next(new AppError('An account with this email already exists.', 409, 'EMAIL_EXISTS'));
    }

    // Create user
    const user = await User.create({
      firstName,
      lastName,
      email,
      password,
      phone,
      role: ['user', 'seller'].includes(role) ? role : 'user',
      authProvider: 'local',
    });

    // Generate and send OTP for email verification
    const otp = generateOTP();
    const hashedOTP = hashOTP(otp);

    // Store OTP in Redis with TTL
    const otpStored = await storeOTP(user._id.toString(), hashedOTP, OTP_TTL);

    if (!otpStored) {
      // Fallback: store in DB if Redis unavailable
      logger.warn('Redis unavailable, storing OTP in DB');
      user.passwordResetToken = hashedOTP;
      user.passwordResetExpires = new Date(Date.now() + OTP_TTL * 1000);
      await user.save({ validateBeforeSave: false });
    }

    // Send verification email (non-blocking)
    sendOTPEmail(email, firstName, otp, 'verification').catch((err) =>
      logger.error('Failed to send verification email:', err.message)
    );

    logger.info(`User registered: ${user._id} (${email}) role=${role}`);

    return successResponse(res, {
      statusCode: 201,
      message: 'Account created! Please check your email for the OTP to verify your account.',
      data: {
        userId: user._id,
        email: user.email,
        requiresVerification: true,
      },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// VERIFY EMAIL OTP
// ═══════════════════════════════════════════════════════════════
async function verifyEmail(req, res, next) {
  try {
    const { email, otp } = req.body;

    const user = await User.findByEmail(email).select('+passwordResetToken +passwordResetExpires');
    if (!user) {
      return next(new AppError('Account not found.', 404, 'USER_NOT_FOUND'));
    }

    if (user.isEmailVerified) {
      return next(new AppError('Email is already verified.', 400, 'ALREADY_VERIFIED'));
    }

    // Get OTP from Redis
    let otpData = await getOTP(user._id.toString());
    let storedHashedOTP = null;

    if (otpData) {
      // Check max attempts
      if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
        await deleteOTP(user._id.toString());
        return next(new AppError(
          'Maximum OTP attempts exceeded. Please request a new OTP.',
          429,
          'OTP_MAX_ATTEMPTS'
        ));
      }
      storedHashedOTP = otpData.otp;
    } else if (user.passwordResetToken && user.passwordResetExpires > new Date()) {
      // Fallback: check DB
      storedHashedOTP = user.passwordResetToken;
    }

    if (!storedHashedOTP) {
      return next(new AppError('OTP has expired. Please request a new one.', 400, 'OTP_EXPIRED'));
    }

    // Validate OTP
    const isValid = compareOTP(otp, storedHashedOTP);
    if (!isValid) {
      await incrementOTPAttempts(user._id.toString());
      return next(new AppError('Invalid OTP. Please try again.', 400, 'INVALID_OTP'));
    }

    // Mark email as verified
    user.isEmailVerified = true;
    user.passwordResetToken = undefined;
    user.passwordResetExpires = undefined;
    await user.save({ validateBeforeSave: false });

    // Clean up OTP
    await deleteOTP(user._id.toString());

    // Generate tokens and log user in
    const { accessToken, accessJti, refreshToken, refreshJti } = generateTokenPair({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    await storeRefreshToken(user._id.toString(), refreshJti, REFRESH_TTL_SECONDS);

    // Send welcome email
    sendWelcomeEmail(user.email, user.firstName, user.role).catch(() => {});

    setRefreshTokenCookie(res, refreshToken);

    logger.info(`Email verified and user logged in: ${user._id}`);

    return successResponse(res, {
      statusCode: 200,
      message: 'Email verified successfully! Welcome to KAVOX.',
      data: {
        user: user.toSafeObject(),
        accessToken,
        tokenType: 'Bearer',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// RESEND OTP
// ═══════════════════════════════════════════════════════════════
async function resendOTP(req, res, next) {
  try {
    const { email, purpose = 'verification' } = req.body;

    const user = await User.findByEmail(email);
    if (!user) {
      // Security: Don't reveal if email exists
      return successResponse(res, {
        message: 'If this email is registered, an OTP has been sent.',
        data: { sent: true },
      });
    }

    if (purpose === 'verification' && user.isEmailVerified) {
      return next(new AppError('Email is already verified.', 400, 'ALREADY_VERIFIED'));
    }

    const otp = generateOTP();
    const hashedOTP = hashOTP(otp);

    await storeOTP(user._id.toString(), hashedOTP, OTP_TTL);

    sendOTPEmail(email, user.firstName, otp, purpose).catch((err) =>
      logger.error('Resend OTP email failed:', err.message)
    );

    logger.info(`OTP resent for ${purpose} to: ${email}`);

    return successResponse(res, {
      message: 'OTP sent successfully. Please check your email.',
      data: { sent: true, expiresInMinutes: parseInt(process.env.OTP_EXPIRE_MINUTES) || 10 },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGIN
// ═══════════════════════════════════════════════════════════════
async function login(req, res, next) {
  try {
    const { email, password } = req.body;

    // Get user with password
    const user = await User.findByEmailWithPassword(email);

    if (!user) {
      return next(new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS'));
    }

    // Check if account is active
    if (!user.isActive) {
      return next(new AppError('Your account has been deactivated. Contact support.', 403, 'ACCOUNT_INACTIVE'));
    }

    if (user.isBanned) {
      return next(new AppError(`Account suspended: ${user.banReason || 'Policy violation'}`, 403, 'ACCOUNT_BANNED'));
    }

    // Check account lock
    if (user.isLocked) {
      const unlockTime = new Date(user.lockUntil);
      return next(new AppError(
        `Account temporarily locked. Try again after ${unlockTime.toLocaleTimeString()}.`,
        423,
        'ACCOUNT_LOCKED'
      ));
    }

    // Verify password
    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      await user.incLoginAttempts();
      return next(new AppError('Invalid email or password.', 401, 'INVALID_CREDENTIALS'));
    }

    // Check email verification
    if (!user.isEmailVerified) {
      // Send new OTP
      const otp = generateOTP();
      await storeOTP(user._id.toString(), hashOTP(otp), OTP_TTL);
      sendOTPEmail(email, user.firstName, otp, 'verification').catch(() => {});

      return next(new AppError(
        'Please verify your email. A new OTP has been sent.',
        403,
        'EMAIL_NOT_VERIFIED'
      ));
    }

    // Reset failed attempts
    await user.resetLoginAttempts();

    // Generate tokens
    const { accessToken, accessJti, refreshToken, refreshJti } = generateTokenPair({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    // Store refresh token in Redis
    await storeRefreshToken(user._id.toString(), refreshJti, REFRESH_TTL_SECONDS);

    // Update last login
    User.findByIdAndUpdate(user._id, {
      lastLoginAt: new Date(),
      lastLoginIP: req.ip,
    }).catch(() => {});

    setRefreshTokenCookie(res, refreshToken);

    logger.info(`Login success: ${user._id} (${email}) from ${req.ip}`);

    return successResponse(res, {
      message: 'Login successful. Welcome back!',
      data: {
        user: user.toSafeObject(),
        accessToken,
        tokenType: 'Bearer',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// REFRESH ACCESS TOKEN
// ═══════════════════════════════════════════════════════════════
async function refreshAccessToken(req, res, next) {
  try {
    // Get refresh token from cookie or body
    const refreshToken = req.cookies?.kavox_refresh_token || req.body?.refreshToken;

    if (!refreshToken) {
      return next(new AppError('Refresh token not provided.', 401, 'NO_REFRESH_TOKEN'));
    }

    // Verify refresh token
    let decoded;
    try {
      decoded = verifyRefreshToken(refreshToken);
    } catch (err) {
      clearRefreshTokenCookie(res);
      return next(new AppError('Invalid or expired refresh token. Please log in again.', 401, 'INVALID_REFRESH_TOKEN'));
    }

    if (decoded.type !== 'refresh') {
      return next(new AppError('Invalid token type.', 401, 'INVALID_TOKEN_TYPE'));
    }

    // Check if blacklisted
    const blacklisted = await isTokenBlacklisted(decoded.jti);
    if (blacklisted) {
      clearRefreshTokenCookie(res);
      return next(new AppError('Refresh token revoked. Please log in again.', 401, 'TOKEN_REVOKED'));
    }

    // Get user
    const user = await User.findById(decoded.sub);
    if (!user || !user.isActive || user.isBanned) {
      clearRefreshTokenCookie(res);
      return next(new AppError('User not found or inactive.', 401, 'USER_INACTIVE'));
    }

    // Revoke old refresh token (rotation)
    await revokeRefreshToken(user._id.toString(), decoded.jti);

    // Generate new token pair
    const { accessToken, refreshToken: newRefreshToken, refreshJti } = generateTokenPair({
      userId: user._id,
      email: user.email,
      role: user.role,
    });

    await storeRefreshToken(user._id.toString(), refreshJti, REFRESH_TTL_SECONDS);
    setRefreshTokenCookie(res, newRefreshToken);

    return successResponse(res, {
      message: 'Token refreshed successfully.',
      data: {
        accessToken,
        tokenType: 'Bearer',
      },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGOUT
// ═══════════════════════════════════════════════════════════════
async function logout(req, res, next) {
  try {
    const { user, tokenJti } = req;

    // Blacklist current access token
    if (tokenJti) {
      const ttl = getTokenTTL(
        req.headers.authorization?.split(' ')[1] || req.cookies?.kavox_access_token || ''
      );
      await blacklistToken(tokenJti, ttl || 900);
    }

    // Get refresh token from cookie to revoke
    const refreshToken = req.cookies?.kavox_refresh_token;
    if (refreshToken) {
      try {
        const decoded = verifyRefreshToken(refreshToken);
        await revokeRefreshToken(user._id.toString(), decoded.jti);
      } catch (_err) {
        // Ignore - already expired or invalid
      }
    }

    clearRefreshTokenCookie(res);

    logger.info(`Logout: ${user._id}`);

    return successResponse(res, { message: 'Logged out successfully.' });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// LOGOUT ALL DEVICES
// ═══════════════════════════════════════════════════════════════
async function logoutAllDevices(req, res, next) {
  try {
    const { user, tokenJti } = req;

    if (tokenJti) {
      const ttl = getTokenTTL(req.headers.authorization?.split(' ')[1] || '');
      await blacklistToken(tokenJti, ttl || 900);
    }

    await revokeAllUserTokens(user._id.toString());
    clearRefreshTokenCookie(res);

    logger.info(`Logout all devices: ${user._id}`);

    return successResponse(res, { message: 'Logged out from all devices.' });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// FORGOT PASSWORD
// ═══════════════════════════════════════════════════════════════
async function forgotPassword(req, res, next) {
  try {
    const { email } = req.body;

    const user = await User.findByEmail(email);

    // Security: Always return success even if user not found
    if (!user || !user.isActive) {
      return successResponse(res, {
        message: 'If this email is registered, a password reset OTP has been sent.',
        data: { sent: true },
      });
    }

    const otp = generateOTP();
    const hashedOTP = hashOTP(otp);

    await storeOTP(`reset_${user._id}`, hashedOTP, OTP_TTL);

    sendOTPEmail(email, user.firstName, otp, 'password-reset').catch((err) =>
      logger.error('Forgot password email failed:', err.message)
    );

    logger.info(`Password reset OTP sent: ${user._id} (${email})`);

    return successResponse(res, {
      message: 'Password reset OTP sent to your email.',
      data: { sent: true, expiresInMinutes: parseInt(process.env.OTP_EXPIRE_MINUTES) || 10 },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// RESET PASSWORD
// ═══════════════════════════════════════════════════════════════
async function resetPassword(req, res, next) {
  try {
    const { email, otp, newPassword } = req.body;

    const user = await User.findByEmail(email);
    if (!user) {
      return next(new AppError('Invalid or expired reset session.', 400, 'INVALID_RESET'));
    }

    // Get stored OTP
    const otpData = await getOTP(`reset_${user._id}`);
    if (!otpData) {
      return next(new AppError('OTP has expired. Please request a new password reset.', 400, 'OTP_EXPIRED'));
    }

    if (otpData.attempts >= MAX_OTP_ATTEMPTS) {
      await deleteOTP(`reset_${user._id}`);
      return next(new AppError('Too many invalid attempts. Please request a new OTP.', 429, 'OTP_MAX_ATTEMPTS'));
    }

    const isValid = compareOTP(otp, otpData.otp);
    if (!isValid) {
      await incrementOTPAttempts(`reset_${user._id}`);
      return next(new AppError('Invalid OTP.', 400, 'INVALID_OTP'));
    }

    // Update password
    user.password = newPassword;
    user.passwordChangedAt = new Date();
    await user.save();

    // Clean up
    await deleteOTP(`reset_${user._id}`);

    // Revoke all sessions (security)
    await revokeAllUserTokens(user._id.toString());

    // Send notification email
    sendPasswordChangedEmail(user.email, user.firstName).catch(() => {});

    clearRefreshTokenCookie(res);

    logger.info(`Password reset: ${user._id}`);

    return successResponse(res, {
      message: 'Password reset successfully. Please log in with your new password.',
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// CHANGE PASSWORD (authenticated)
// ═══════════════════════════════════════════════════════════════
async function changePassword(req, res, next) {
  try {
    const { currentPassword, newPassword } = req.body;
    const user = await User.findById(req.user._id).select('+password');

    const isCurrentValid = await user.comparePassword(currentPassword);
    if (!isCurrentValid) {
      return next(new AppError('Current password is incorrect.', 400, 'WRONG_PASSWORD'));
    }

    user.password = newPassword;
    await user.save();

    // Revoke all other sessions
    if (req.tokenJti) {
      const ttl = getTokenTTL(req.headers.authorization?.split(' ')[1] || '');
      await blacklistToken(req.tokenJti, ttl || 900);
    }
    await revokeAllUserTokens(user._id.toString());

    sendPasswordChangedEmail(user.email, user.firstName).catch(() => {});
    clearRefreshTokenCookie(res);

    logger.info(`Password changed: ${user._id}`);

    return successResponse(res, {
      message: 'Password changed successfully. Please log in again.',
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// GET CURRENT USER PROFILE
// ═══════════════════════════════════════════════════════════════
async function getMe(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) {
      return next(new AppError('User not found.', 404, 'USER_NOT_FOUND'));
    }

    return successResponse(res, {
      data: { user: user.toSafeObject() },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// UPDATE PROFILE
// ═══════════════════════════════════════════════════════════════
async function updateProfile(req, res, next) {
  try {
    const allowedFields = ['firstName', 'lastName', 'phone', 'dateOfBirth', 'gender', 'preferences'];
    const updates = {};

    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        updates[field] = req.body[field];
      }
    });

    // Seller can update seller profile
    if (req.user.role === 'seller' && req.body.sellerProfile) {
      const sellerFields = ['brandName', 'brandDescription', 'gstNumber'];
      sellerFields.forEach((field) => {
        if (req.body.sellerProfile[field] !== undefined) {
          updates[`sellerProfile.${field}`] = req.body.sellerProfile[field];
        }
      });
    }

    const user = await User.findByIdAndUpdate(
      req.user._id,
      { $set: updates },
      { new: true, runValidators: true }
    );

    if (!user) return next(new AppError('User not found.', 404));

    logger.info(`Profile updated: ${user._id}`);

    return successResponse(res, {
      message: 'Profile updated successfully.',
      data: { user: user.toSafeObject() },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// ADD / UPDATE ADDRESS
// ═══════════════════════════════════════════════════════════════
async function addAddress(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return next(new AppError('User not found.', 404));

    const { label, fullName, phone, addressLine1, addressLine2, city, state, pincode, country, isDefault } = req.body;

    const newAddress = { label, fullName, phone, addressLine1, addressLine2, city, state, pincode, country: country || 'India', isDefault: isDefault || false };

    // If setting as default, unset others
    if (newAddress.isDefault) {
      user.addresses.forEach((addr) => { addr.isDefault = false; });
    }

    user.addresses.push(newAddress);

    // Auto-set default if first address
    if (user.addresses.length === 1) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    return successResponse(res, {
      statusCode: 201,
      message: 'Address added successfully.',
      data: { addresses: user.addresses },
    });
  } catch (err) {
    next(err);
  }
}

async function updateAddress(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return next(new AppError('Address not found.', 404));

    const allowedFields = ['label', 'fullName', 'phone', 'addressLine1', 'addressLine2', 'city', 'state', 'pincode', 'country', 'isDefault'];
    allowedFields.forEach((field) => {
      if (req.body[field] !== undefined) address[field] = req.body[field];
    });

    if (req.body.isDefault === true) {
      user.addresses.forEach((addr) => { if (addr.id !== req.params.addressId) addr.isDefault = false; });
    }

    await user.save();

    return successResponse(res, {
      message: 'Address updated.',
      data: { addresses: user.addresses },
    });
  } catch (err) {
    next(err);
  }
}

async function deleteAddress(req, res, next) {
  try {
    const user = await User.findById(req.user._id);
    const address = user.addresses.id(req.params.addressId);
    if (!address) return next(new AppError('Address not found.', 404));

    const wasDefault = address.isDefault;
    address.deleteOne();

    // Set new default if needed
    if (wasDefault && user.addresses.length > 0) {
      user.addresses[0].isDefault = true;
    }

    await user.save();

    return successResponse(res, {
      message: 'Address deleted.',
      data: { addresses: user.addresses },
    });
  } catch (err) {
    next(err);
  }
}

// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLERS
// ═══════════════════════════════════════════════════════════════
async function getAllUsers(req, res, next) {
  try {
    const { page = 1, limit = 20, role, search, isActive, sort = '-createdAt' } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const filter = {};
    if (role) filter.role = role;
    if (isActive !== undefined) filter.isActive = isActive === 'true';
    if (search) {
      filter.$or = [
        { firstName: { $regex: search, $options: 'i' } },
        { lastName: { $regex: search, $options: 'i' } },
        { email: { $regex: search, $options: 'i' } },
      ];
    }

    const [users, total] = await Promise.all([
      User.find(filter)
        .select('-password -passwordResetToken -passwordResetExpires -failedLoginAttempts -lockUntil')
        .sort(sort)
        .skip(skip)
        .limit(parseInt(limit))
        .lean(),
      User.countDocuments(filter),
    ]);

    return successResponse(res, {
      data: { users },
      meta: {
        total,
        page: parseInt(page),
        limit: parseInt(limit),
        pages: Math.ceil(total / parseInt(limit)),
      },
    });
  } catch (err) {
    next(err);
  }
}

async function getUserById(req, res, next) {
  try {
    const user = await User.findById(req.params.userId)
      .select('-password -passwordResetToken -failedLoginAttempts -lockUntil');
    if (!user) return next(new AppError('User not found.', 404));
    return successResponse(res, { data: { user } });
  } catch (err) {
    next(err);
  }
}

async function toggleUserStatus(req, res, next) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return next(new AppError('User not found.', 404));

    if (user.role === 'super_admin') {
      return next(new AppError('Cannot modify super admin.', 403));
    }

    user.isActive = !user.isActive;
    await user.save({ validateBeforeSave: false });

    if (!user.isActive) {
      await revokeAllUserTokens(user._id.toString());
    }

    logger.info(`User ${user.isActive ? 'activated' : 'deactivated'}: ${user._id} by admin ${req.user._id}`);

    return successResponse(res, {
      message: `User ${user.isActive ? 'activated' : 'deactivated'} successfully.`,
      data: { userId: user._id, isActive: user.isActive },
    });
  } catch (err) {
    next(err);
  }
}

async function approveSeller(req, res, next) {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) return next(new AppError('User not found.', 404));
    if (user.role !== 'seller') return next(new AppError('User is not a seller.', 400));

    user.sellerProfile.isApproved = true;
    user.sellerProfile.approvedAt = new Date();
    user.sellerProfile.approvedBy = req.user._id;
    await user.save({ validateBeforeSave: false });

    logger.info(`Seller approved: ${user._id} by admin ${req.user._id}`);

    return successResponse(res, {
      message: 'Seller account approved.',
      data: { userId: user._id, sellerProfile: user.sellerProfile },
    });
  } catch (err) {
    next(err);
  }
}

// Internal endpoint for other microservices to verify user
async function verifyUserInternal(req, res, next) {
  try {
    const { userId } = req.params;
    const user = await User.findById(userId).select('_id email role isActive isBanned isEmailVerified');
    if (!user) return res.status(404).json({ valid: false, message: 'User not found' });
    if (!user.isActive || user.isBanned) return res.status(403).json({ valid: false, message: 'User inactive or banned' });

    return res.json({
      valid: true,
      user: {
        _id: user._id,
        email: user.email,
        role: user.role,
        isEmailVerified: user.isEmailVerified,
      },
    });
  } catch (err) {
    next(err);
  }
}

module.exports = {
  register,
  verifyEmail,
  resendOTP,
  login,
  refreshAccessToken,
  logout,
  logoutAllDevices,
  forgotPassword,
  resetPassword,
  changePassword,
  getMe,
  updateProfile,
  addAddress,
  updateAddress,
  deleteAddress,
  getAllUsers,
  getUserById,
  toggleUserStatus,
  approveSeller,
  verifyUserInternal,
};
