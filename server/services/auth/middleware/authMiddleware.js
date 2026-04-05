'use strict';

const { verifyAccessToken } = require('../utils/jwtUtils');
const { isTokenBlacklisted } = require('../config/redis');
const { AppError } = require('./errorMiddleware');
const User = require('../models/User');
const { logger } = require('../utils/logger');

/**
 * Protect routes - verify JWT access token
 */
async function protect(req, res, next) {
  try {
    let token = null;

    // Check Authorization header
    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    }
    // Check cookie as fallback
    else if (req.cookies?.kavox_access_token) {
      token = req.cookies.kavox_access_token;
    }

    if (!token) {
      return next(new AppError('Authentication required. Please log in.', 401, 'NO_TOKEN'));
    }

    // Verify token
    const decoded = verifyAccessToken(token);

    // Check token type
    if (decoded.type !== 'access') {
      return next(new AppError('Invalid token type.', 401, 'INVALID_TOKEN_TYPE'));
    }

    // Check if token is blacklisted (logged out)
    const blacklisted = await isTokenBlacklisted(decoded.jti);
    if (blacklisted) {
      return next(new AppError('Token has been revoked. Please log in again.', 401, 'TOKEN_REVOKED'));
    }

    // Get user from DB - check still exists and active
    const user = await User.findById(decoded.sub).select('+passwordChangedAt');
    if (!user) {
      return next(new AppError('User no longer exists.', 401, 'USER_NOT_FOUND'));
    }

    if (!user.isActive || user.isBanned) {
      return next(new AppError(
        user.isBanned ? `Account banned: ${user.banReason || 'Policy violation'}` : 'Account deactivated.',
        403,
        user.isBanned ? 'ACCOUNT_BANNED' : 'ACCOUNT_INACTIVE'
      ));
    }

    // Check if password was changed after token was issued
    if (user.changedPasswordAfter(decoded.iat)) {
      return next(new AppError('Password was recently changed. Please log in again.', 401, 'PASSWORD_CHANGED'));
    }

    // Attach to request
    req.user = user;
    req.tokenJti = decoded.jti;
    req.tokenIat = decoded.iat;

    next();
  } catch (err) {
    logger.debug('protect middleware error:', err.message);
    if (err.name === 'TokenExpiredError') {
      return next(new AppError('Session expired. Please log in again.', 401, 'TOKEN_EXPIRED'));
    }
    if (err.name === 'JsonWebTokenError') {
      return next(new AppError('Invalid token. Please log in again.', 401, 'INVALID_TOKEN'));
    }
    next(err);
  }
}

/**
 * Restrict to specific roles
 * Usage: restrictTo('admin', 'seller')
 */
function restrictTo(...roles) {
  return (req, res, next) => {
    if (!req.user) {
      return next(new AppError('Authentication required.', 401, 'NO_AUTH'));
    }

    if (!roles.includes(req.user.role)) {
      return next(new AppError(
        `Access denied. Required role: ${roles.join(' or ')}. Your role: ${req.user.role}`,
        403,
        'INSUFFICIENT_ROLE'
      ));
    }

    next();
  };
}

/**
 * Optional auth - attach user if token present but don't fail if not
 */
async function optionalAuth(req, res, next) {
  try {
    let token = null;

    if (req.headers.authorization?.startsWith('Bearer ')) {
      token = req.headers.authorization.split(' ')[1];
    } else if (req.cookies?.kavox_access_token) {
      token = req.cookies.kavox_access_token;
    }

    if (!token) return next();

    const decoded = verifyAccessToken(token);
    const blacklisted = await isTokenBlacklisted(decoded.jti);
    if (blacklisted) return next();

    const user = await User.findById(decoded.sub);
    if (user && user.isActive && !user.isBanned) {
      req.user = user;
      req.tokenJti = decoded.jti;
    }
  } catch (_err) {
    // Silently fail - optional auth
  }
  next();
}

/**
 * Verify inter-service requests from API Gateway
 */
function verifyServiceSecret(req, res, next) {
  const secret = req.headers['x-service-secret'];
  if (!secret || secret !== process.env.GATEWAY_SECRET) {
    return next(new AppError('Unauthorized service request.', 403, 'INVALID_SERVICE_SECRET'));
  }
  next();
}

/**
 * Check if email is verified
 */
function requireEmailVerification(req, res, next) {
  if (!req.user?.isEmailVerified) {
    return next(new AppError(
      'Please verify your email address before proceeding.',
      403,
      'EMAIL_NOT_VERIFIED'
    ));
  }
  next();
}

module.exports = {
  protect,
  restrictTo,
  optionalAuth,
  verifyServiceSecret,
  requireEmailVerification,
};
