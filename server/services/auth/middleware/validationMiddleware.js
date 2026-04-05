'use strict';

const { body, param, validationResult } = require('express-validator');

/**
 * Process validation results
 */
function handleValidationErrors(req, res, next) {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    const formattedErrors = errors.array().map((err) => ({
      field: err.path,
      message: err.msg,
      value: err.value,
    }));

    return res.status(422).json({
      success: false,
      message: 'Validation failed',
      code: 'VALIDATION_ERROR',
      errors: formattedErrors,
      timestamp: new Date().toISOString(),
    });
  }
  next();
}

// ─── Register Validation ──────────────────────────────────────
const validateRegister = [
  body('firstName')
    .trim()
    .notEmpty().withMessage('First name is required')
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('First name can only contain letters, spaces, hyphens, and apostrophes'),

  body('lastName')
    .trim()
    .notEmpty().withMessage('Last name is required')
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Last name can only contain letters'),

  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email address')
    .normalizeEmail()
    .isLength({ max: 255 }).withMessage('Email too long'),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[A-Z]/).withMessage('Password must contain at least one uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain at least one lowercase letter')
    .matches(/\d/).withMessage('Password must contain at least one number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Password must contain at least one special character'),

  body('confirmPassword')
    .notEmpty().withMessage('Please confirm your password')
    .custom((value, { req }) => {
      if (value !== req.body.password) {
        throw new Error('Passwords do not match');
      }
      return true;
    }),

  body('role')
    .optional()
    .isIn(['user', 'seller']).withMessage('Role must be user or seller'),

  body('phone')
    .optional()
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage('Please provide a valid 10-digit Indian mobile number'),

  handleValidationErrors,
];

// ─── Login Validation ─────────────────────────────────────────
const validateLogin = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  body('password')
    .notEmpty().withMessage('Password is required')
    .isLength({ max: 128 }).withMessage('Invalid password'),

  handleValidationErrors,
];

// ─── OTP Validation ───────────────────────────────────────────
const validateOTP = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Invalid email')
    .normalizeEmail(),

  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isLength({ min: 4, max: 8 }).withMessage('Invalid OTP length')
    .isNumeric().withMessage('OTP must be numeric'),

  handleValidationErrors,
];

// ─── Forgot Password Validation ───────────────────────────────
const validateForgotPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().withMessage('Please provide a valid email')
    .normalizeEmail(),

  handleValidationErrors,
];

// ─── Reset Password Validation ────────────────────────────────
const validateResetPassword = [
  body('email')
    .trim()
    .notEmpty().withMessage('Email is required')
    .isEmail().normalizeEmail(),

  body('otp')
    .trim()
    .notEmpty().withMessage('OTP is required')
    .isNumeric().withMessage('Invalid OTP'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[A-Z]/).withMessage('Password must contain uppercase letter')
    .matches(/[a-z]/).withMessage('Password must contain lowercase letter')
    .matches(/\d/).withMessage('Password must contain a number')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/)
    .withMessage('Password must contain special character'),

  body('confirmPassword')
    .custom((value, { req }) => {
      if (value !== req.body.newPassword) throw new Error('Passwords do not match');
      return true;
    }),

  handleValidationErrors,
];

// ─── Change Password Validation ───────────────────────────────
const validateChangePassword = [
  body('currentPassword')
    .notEmpty().withMessage('Current password is required'),

  body('newPassword')
    .notEmpty().withMessage('New password is required')
    .isLength({ min: 8, max: 128 }).withMessage('Password must be 8-128 characters')
    .matches(/[A-Z]/).withMessage('Uppercase required')
    .matches(/[a-z]/).withMessage('Lowercase required')
    .matches(/\d/).withMessage('Number required')
    .matches(/[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/).withMessage('Special character required')
    .custom((value, { req }) => {
      if (value === req.body.currentPassword) {
        throw new Error('New password must be different from current password');
      }
      return true;
    }),

  handleValidationErrors,
];

// ─── Update Profile Validation ────────────────────────────────
const validateUpdateProfile = [
  body('firstName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('First name must be 2-50 characters')
    .matches(/^[a-zA-Z\s'-]+$/).withMessage('Invalid characters in first name'),

  body('lastName')
    .optional()
    .trim()
    .isLength({ min: 2, max: 50 }).withMessage('Last name must be 2-50 characters'),

  body('phone')
    .optional()
    .trim()
    .matches(/^[6-9]\d{9}$/).withMessage('Invalid phone number'),

  body('dateOfBirth')
    .optional()
    .isISO8601().withMessage('Invalid date format')
    .custom((value) => {
      const dob = new Date(value);
      const minAge = new Date();
      minAge.setFullYear(minAge.getFullYear() - 13);
      if (dob > minAge) throw new Error('Must be at least 13 years old');
      return true;
    }),

  body('gender')
    .optional()
    .isIn(['male', 'female', 'non-binary', 'prefer-not-to-say', ''])
    .withMessage('Invalid gender value'),

  handleValidationErrors,
];

// ─── Address Validation ───────────────────────────────────────
const validateAddress = [
  body('fullName').trim().notEmpty().withMessage('Full name required').isLength({ max: 100 }),
  body('phone').trim().matches(/^[6-9]\d{9}$/).withMessage('Valid 10-digit phone required'),
  body('addressLine1').trim().notEmpty().withMessage('Address line 1 required').isLength({ max: 200 }),
  body('city').trim().notEmpty().withMessage('City required').isLength({ max: 100 }),
  body('state').trim().notEmpty().withMessage('State required').isLength({ max: 100 }),
  body('pincode').trim().matches(/^\d{6}$/).withMessage('Valid 6-digit pincode required'),
  body('label').optional().isIn(['home', 'work', 'other']).withMessage('Invalid label'),
  handleValidationErrors,
];

module.exports = {
  validateRegister,
  validateLogin,
  validateOTP,
  validateForgotPassword,
  validateResetPassword,
  validateChangePassword,
  validateUpdateProfile,
  validateAddress,
  handleValidationErrors,
};
