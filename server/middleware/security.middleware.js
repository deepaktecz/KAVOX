'use strict';

const ValidationService = require('../../services/validation/validation.service');
const logger = require('../../utils/logger');
const EventLoggingService = require('../../services/logging/event.logging.service');

/**
 * SECURITY MIDDLEWARE
 * ═════════════════════════════════════════════════════════════════
 * Comprehensive security checks and input validation middleware
 */

/**
 * Apply validation and sanitization to all requests
 */
const validateAndSanitize = (req, res, next) => {
  try {
    // Sanitize all string fields in request body
    if (req.body) {
      req.body = ValidationService.sanitizeObject(req.body);
    }

    // Check for suspicious patterns
    const bodyString = JSON.stringify(req.body || {});

    if (bodyString.length > 50000) {
      logger.warn('Suspiciously large request body:', {
        path: req.path,
        size: bodyString.length,
        ip: req.ip,
      });

      return res.status(400).json({ error: 'Request too large' });
    }

    // Check for injection patterns
    const injectionPatterns = ['<script', 'javascript:', 'onerror=', 'onload=', 'eval('];
    if (
      injectionPatterns.some(pattern =>
        bodyString.toLowerCase().includes(pattern.toLowerCase())
      )
    ) {
      logger.warn('Potential injection attack detected:', {
        path: req.path,
        ip: req.ip,
      });

      EventLoggingService.logSecurityEvent('INJECTION_ATTEMPT_DETECTED', {
        path: req.path,
      }, { ip: req.ip });

      return res.status(400).json({ error: 'Invalid request' });
    }

    next();
  } catch (error) {
    logger.error('Validation error:', error);
    res.status(400).json({ error: 'Invalid request format' });
  }
};

/**
 * Require authenticated user
 */
const requireAuth = (req, res, next) => {
  if (!req.user || !req.user.id) {
    logger.warn('Unauthorized access attempt:', {
      path: req.path,
      ip: req.ip,
      method: req.method,
    });

    EventLoggingService.logSecurityEvent('UNAUTHORIZED_ACCESS_ATTEMPT', {
      path: req.path,
      method: req.method,
    }, { ip: req.ip });

    return res.status(401).json({ error: 'Authentication required' });
  }

  if (!ValidationService.isValidObjectId(req.user.id)) {
    logger.error('Invalid user ID in token:', { userId: req.user.id });
    return res.status(401).json({ error: 'Invalid authentication' });
  }

  // Attach to request
  req.userId = req.user.id;
  next();
};

/**
 * Require admin role
 */
const requireAdmin = (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    logger.warn('Unauthorized admin access attempt:', {
      userId: req.user?.id,
      path: req.path,
      ip: req.ip,
    });

    EventLoggingService.logSecurityEvent('ADMIN_ACCESS_DENIED', {
      userId: req.user?.id,
      path: req.path,
    }, { ip: req.ip, userId: req.user?.id });

    return res.status(403).json({ error: 'Admin access required' });
  }

  next();
};

/**
 * Require seller or admin role
 */
const requireSellerOrAdmin = (req, res, next) => {
  if (!req.user || !['seller', 'admin'].includes(req.user.role)) {
    logger.warn('Unauthorized seller access attempt:', {
      userId: req.user?.id,
      path: req.path,
      ip: req.ip,
    });

    EventLoggingService.logSecurityEvent('SELLER_ACCESS_DENIED', {
      userId: req.user?.id,
      path: req.path,
    }, { ip: req.ip, userId: req.user?.id });

    return res.status(403).json({ error: 'Seller access required' });
  }

  next();
};

/**
 * Rate limiting middleware
 */
const rateLimit = (maxAttempts = 100, windowMs = 60000) => {
  const ipAttempts = new Map();

  return (req, res, next) => {
    const ip = req.ip || req.connection.remoteAddress;
    const now = Date.now();

    if (!ipAttempts.has(ip)) {
      ipAttempts.set(ip, []);
    }

    const attempts = ipAttempts.get(ip);
    const recentAttempts = attempts.filter(timestamp => timestamp > now - windowMs);

    if (recentAttempts.length >= maxAttempts) {
      logger.warn('Rate limit exceeded:', { ip, attempts: recentAttempts.length });

      EventLoggingService.logSecurityEvent('RATE_LIMIT_EXCEEDED', {
        ip,
        attempts: recentAttempts.length,
      });

      return res.status(429).json({
        error: 'Too many requests. Please try again later.',
        retryAfter: Math.ceil(windowMs / 1000),
      });
    }

    recentAttempts.push(now);
    ipAttempts.set(ip, recentAttempts);

    next();
  };
};

/**
 * CORS security headers
 */
const securityHeaders = (req, res, next) => {
  const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
  const origin = req.headers.origin;

  if (allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
  }

  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, PATCH, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Requested-With');
  res.setHeader('Access-Control-Allow-Credentials', 'true');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Strict-Transport-Security', 'max-age=31536000; includeSubDomains');
  res.setHeader('Content-Security-Policy', "default-src 'self'");

  next();
};

/**
 * Validate pagination parameters
 */
const validatePagination = (req, res, next) => {
  const { page, limit } = req.query;
  const validated = ValidationService.validatePagination(page, limit);

  req.pagination = validated;
  next();
};

/**
 * Validate specific fields
 */
const validateFields = (fields) => {
  return (req, res, next) => {
    const errors = [];

    fields.forEach(({ name, type, required = false, validate = null }) => {
      const value = req.body[name];

      if (required && !value) {
        errors.push(`${name} is required`);
        return;
      }

      if (!value) return;

      // Type validation
      switch (type) {
        case 'email':
          if (!ValidationService.isValidEmail(value)) {
            errors.push(`${name} must be a valid email`);
          }
          break;

        case 'phone':
          if (!ValidationService.isValidPhone(value)) {
            errors.push(`${name} must be a valid phone number`);
          }
          break;

        case 'amount':
          if (!ValidationService.isValidAmount(value)) {
            errors.push(`${name} must be a valid amount`);
          }
          break;

        case 'objectId':
          if (!ValidationService.isValidObjectId(value)) {
            errors.push(`${name} must be a valid ID`);
          }
          break;

        case 'url':
          if (!ValidationService.isValidURL(value)) {
            errors.push(`${name} must be a valid URL`);
          }
          break;

        case 'string':
          if (typeof value !== 'string') {
            errors.push(`${name} must be a string`);
          }
          break;

        case 'number':
          if (typeof value !== 'number') {
            errors.push(`${name} must be a number`);
          }
          break;

        case 'boolean':
          if (typeof value !== 'boolean') {
            errors.push(`${name} must be a boolean`);
          }
          break;
      }

      // Custom validation
      if (validate && !validate(value)) {
        errors.push(`${name} validation failed`);
      }
    });

    if (errors.length > 0) {
      return res.status(400).json({ errors });
    }

    next();
  };
};

/**
 * Log request details
 */
const logRequest = (req, res, next) => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;

    logger.info('HTTP Request', {
      method: req.method,
      path: req.path,
      status: res.statusCode,
      duration: `${duration}ms`,
      ip: req.ip,
      userId: req.user?.id || 'anonymous',
    });
  });

  next();
};

module.exports = {
  validateAndSanitize,
  requireAuth,
  requireAdmin,
  requireSellerOrAdmin,
  rateLimit,
  securityHeaders,
  validatePagination,
  validateFields,
  logRequest,
};
