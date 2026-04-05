'use strict';

const rateLimit = require('express-rate-limit');

// ─── Message factory ──────────────────────────────────────────
const rateLimitMessage = (windowMs, max) => ({
  success: false,
  message: `Too many requests. You can make ${max} requests per ${windowMs / 60000} minutes. Please try again later.`,
  code: 'RATE_LIMIT_EXCEEDED',
  timestamp: new Date().toISOString(),
});

// ─── Global rate limiter (all routes) ─────────────────────────
const globalRateLimiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: rateLimitMessage(
    parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 900000,
    parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100
  ),
});

// ─── Auth routes limiter (stricter) ───────────────────────────
const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: parseInt(process.env.AUTH_RATE_LIMIT_MAX) || 10,
  standardHeaders: true,
  legacyHeaders: false,
  skipSuccessfulRequests: false,
  message: rateLimitMessage(900000, 10),
  keyGenerator: (req) => {
    // Rate limit by IP + email combination for auth routes
    const email = req.body?.email || '';
    return `${req.ip}:${email.toLowerCase()}`;
  },
});

// ─── OTP rate limiter (very strict) ───────────────────────────
const otpRateLimiter = rateLimit({
  windowMs: 5 * 60 * 1000, // 5 minutes
  max: 3,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(300000, 3),
});

// ─── Password reset limiter ────────────────────────────────────
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // 1 hour
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: rateLimitMessage(3600000, 5),
});

module.exports = {
  globalRateLimiter,
  authRateLimiter,
  otpRateLimiter,
  passwordResetLimiter,
};
