'use strict';

const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const { protect, restrictTo, verifyServiceSecret } = require('../middleware/authMiddleware');
const {
  validateRegister,
  validateLogin,
  validateOTP,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateUpdateProfile,
  validateAddress,
} = require('../middleware/validationMiddleware');
const { authRateLimiter, otpRateLimiter, passwordResetLimiter } = require('../middleware/rateLimiter');

// ─── Public Routes ────────────────────────────────────────────
/**
 * @route   POST /api/v1/auth/register
 * @desc    Register new user or seller
 * @access  Public
 * @body    { firstName, lastName, email, password, confirmPassword, role?, phone? }
 */
router.post(
  '/register',
  authRateLimiter,
  validateRegister,
  authController.register
);

/**
 * @route   POST /api/v1/auth/verify-email
 * @desc    Verify email with OTP
 * @access  Public
 * @body    { email, otp }
 */
router.post(
  '/verify-email',
  otpRateLimiter,
  validateOTP,
  authController.verifyEmail
);

/**
 * @route   POST /api/v1/auth/resend-otp
 * @desc    Resend OTP for email verification or password reset
 * @access  Public
 * @body    { email, purpose: 'verification' | 'password-reset' }
 */
router.post(
  '/resend-otp',
  otpRateLimiter,
  authController.resendOTP
);

/**
 * @route   POST /api/v1/auth/login
 * @desc    Login with email & password
 * @access  Public
 * @body    { email, password }
 */
router.post(
  '/login',
  authRateLimiter,
  validateLogin,
  authController.login
);

/**
 * @route   POST /api/v1/auth/refresh-token
 * @desc    Refresh access token using refresh token (cookie or body)
 * @access  Public (requires valid refresh token)
 */
router.post(
  '/refresh-token',
  authController.refreshAccessToken
);

/**
 * @route   POST /api/v1/auth/forgot-password
 * @desc    Request password reset OTP
 * @access  Public
 * @body    { email }
 */
router.post(
  '/forgot-password',
  passwordResetLimiter,
  validateForgotPassword,
  authController.forgotPassword
);

/**
 * @route   POST /api/v1/auth/reset-password
 * @desc    Reset password using OTP
 * @access  Public
 * @body    { email, otp, newPassword, confirmPassword }
 */
router.post(
  '/reset-password',
  passwordResetLimiter,
  validateResetPassword,
  authController.resetPassword
);

// ─── Protected Routes (requires valid access token) ───────────
router.use(protect);

/**
 * @route   POST /api/v1/auth/logout
 * @desc    Logout current session
 * @access  Private
 */
router.post('/logout', authController.logout);

/**
 * @route   POST /api/v1/auth/logout-all
 * @desc    Logout from all devices
 * @access  Private
 */
router.post('/logout-all', authController.logoutAllDevices);

/**
 * @route   GET /api/v1/auth/me
 * @desc    Get current user profile
 * @access  Private
 */
router.get('/me', authController.getMe);

/**
 * @route   PATCH /api/v1/auth/me
 * @desc    Update user profile
 * @access  Private
 * @body    { firstName?, lastName?, phone?, dateOfBirth?, gender?, preferences? }
 */
router.patch(
  '/me',
  validateUpdateProfile,
  authController.updateProfile
);

/**
 * @route   POST /api/v1/auth/change-password
 * @desc    Change password (authenticated)
 * @access  Private
 * @body    { currentPassword, newPassword, confirmPassword }
 */
router.post(
  '/change-password',
  validateChangePassword,
  authController.changePassword
);

// ─── Address Routes ───────────────────────────────────────────
/**
 * @route   POST /api/v1/auth/addresses
 * @desc    Add new address
 * @access  Private
 */
router.post(
  '/addresses',
  validateAddress,
  authController.addAddress
);

/**
 * @route   PATCH /api/v1/auth/addresses/:addressId
 * @desc    Update address
 * @access  Private
 */
router.patch(
  '/addresses/:addressId',
  authController.updateAddress
);

/**
 * @route   DELETE /api/v1/auth/addresses/:addressId
 * @desc    Delete address
 * @access  Private
 */
router.delete(
  '/addresses/:addressId',
  authController.deleteAddress
);

// ─── Admin Routes ─────────────────────────────────────────────
router.use('/admin', restrictTo('admin', 'super_admin'));

/**
 * @route   GET /api/v1/auth/admin/users
 * @desc    Get all users with pagination & filters
 * @access  Admin
 * @query   page, limit, role, search, isActive, sort
 */
router.get('/admin/users', authController.getAllUsers);

/**
 * @route   GET /api/v1/auth/admin/users/:userId
 * @desc    Get single user by ID
 * @access  Admin
 */
router.get('/admin/users/:userId', authController.getUserById);

/**
 * @route   PATCH /api/v1/auth/admin/users/:userId/toggle-status
 * @desc    Activate or deactivate user
 * @access  Admin
 */
router.patch('/admin/users/:userId/toggle-status', authController.toggleUserStatus);

/**
 * @route   PATCH /api/v1/auth/admin/sellers/:userId/approve
 * @desc    Approve seller account
 * @access  Admin
 */
router.patch('/admin/sellers/:userId/approve', authController.approveSeller);

// ─── Internal Service Routes (API Gateway only) ───────────────
/**
 * @route   GET /api/v1/auth/internal/users/:userId/verify
 * @desc    Verify user exists and is active (for other microservices)
 * @access  Internal (Gateway Secret)
 */
router.get(
  '/internal/users/:userId/verify',
  verifyServiceSecret,
  authController.verifyUserInternal
);

module.exports = router;
