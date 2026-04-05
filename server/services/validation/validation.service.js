'use strict';

const logger = require('../../utils/logger');

/**
 * INPUT VALIDATION SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Comprehensive input validation and sanitization for all routes
 */

class ValidationService {
  /**
   * Validate email format
   */
  static isValidEmail(email) {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return typeof email === 'string' && emailRegex.test(email);
  }

  /**
   * Validate phone number (supports Indian format)
   */
  static isValidPhone(phone) {
    const phoneRegex = /^([0-9]{10}|[+][9][1][0-9]{10})$/;
    return typeof phone === 'string' && phoneRegex.test(phone.replace(/\s+/g, ''));
  }

  /**
   * Validate password (min 8 chars, 1 uppercase, 1 number, 1 special char)
   */
  static isValidPassword(password) {
    if (typeof password !== 'string' || password.length < 8) return false;
    const hasUpperCase = /[A-Z]/.test(password);
    const hasNumber = /[0-9]/.test(password);
    const hasSpecialChar = /[!@#$%^&*]/.test(password);
    return hasUpperCase && hasNumber && hasSpecialChar;
  }

  /**
   * Validate URL format
   */
  static isValidURL(url) {
    try {
      new URL(url);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Validate MongoDB ObjectId
   */
  static isValidObjectId(id) {
    return /^[0-9a-f]{24}$/.test(id);
  }

  /**
   * Sanitize string inputs (remove HTML, trim whitespace)
   */
  static sanitizeString(str) {
    if (typeof str !== 'string') return '';
    return str
      .trim()
      .replace(/<[^>]*>/g, '') // Remove HTML tags
      .substring(0, 500); // Limit length
  }

  /**
   * Sanitize object (traverse and sanitize all string values)
   */
  static sanitizeObject(obj) {
    if (typeof obj !== 'object' || obj === null) return obj;

    const sanitized = Array.isArray(obj) ? [] : {};

    for (const key in obj) {
      if (typeof obj[key] === 'string') {
        sanitized[key] = this.sanitizeString(obj[key]);
      } else if (typeof obj[key] === 'object' && obj[key] !== null) {
        sanitized[key] = this.sanitizeObject(obj[key]);
      } else {
        sanitized[key] = obj[key];
      }
    }

    return sanitized;
  }

  /**
   * Validate pagination parameters
   */
  static validatePagination(page, limit) {
    const pageNum = Math.max(1, parseInt(page || 1));
    const limitNum = Math.min(100, Math.max(1, parseInt(limit || 10)));
    return { page: pageNum, limit: limitNum };
  }

  /**
   * Validate address object
   */
  static isValidAddress(address) {
    if (!address || typeof address !== 'object') return false;

    const required = ['street', 'city', 'state', 'zipCode', 'phone'];
    const hasAllFields = required.every(field => address[field] && typeof address[field] === 'string');

    if (!hasAllFields) return false;

    const validZipCode = /^[0-9]{6}$/.test(address.zipCode);
    const validPhone = this.isValidPhone(address.phone);

    return validZipCode && validPhone;
  }

  /**
   * Validate payment amount
   */
  static isValidAmount(amount) {
    const num = parseFloat(amount);
    return !isNaN(num) && num > 0 && num <= 999999;
  }

  /**
   * Validate item quantity
   */
  static isValidQuantity(quantity) {
    const num = parseInt(quantity);
    return !isNaN(num) && num > 0 && num <= 999;
  }

  /**
   * Validate color hex code
   */
  static isValidHexColor(color) {
    return /^#[0-9A-F]{6}$/i.test(color);
  }

  /**
   * Validate enum value
   */
  static isValidEnum(value, allowedValues) {
    return allowedValues.includes(value);
  }

  /**
   * Validate file upload (size and type)
   */
  static isValidFileUpload(file, maxSizeMB = 10, allowedMimes = ['image/jpeg', 'image/png', 'image/webp']) {
    if (!file) return false;

    const maxSizeBytes = maxSizeMB * 1024 * 1024;
    const isValidSize = file.size <= maxSizeBytes;
    const isValidType = allowedMimes.includes(file.mimetype);

    return isValidSize && isValidType;
  }

  /**
   * Validate product data
   */
  static isValidProductData(product) {
    const errors = [];

    if (!product.name || typeof product.name !== 'string' || product.name.length < 3) {
      errors.push('Product name must be at least 3 characters');
    }

    if (!product.description || typeof product.description !== 'string' || product.description.length < 10) {
      errors.push('Product description must be at least 10 characters');
    }

    if (!this.isValidAmount(product.price)) {
      errors.push('Product price must be a valid amount');
    }

    if (product.discountPrice && !this.isValidAmount(product.discountPrice)) {
      errors.push('Discount price must be a valid amount');
    }

    if (product.stock && !Number.isInteger(product.stock)) {
      errors.push('Stock must be an integer');
    }

    if (product.category && typeof product.category !== 'string') {
      errors.push('Category must be a string');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate user registration data
   */
  static isValidRegistrationData(data) {
    const errors = [];

    if (!data.email || !this.isValidEmail(data.email)) {
      errors.push('Valid email is required');
    }

    if (!data.password || !this.isValidPassword(data.password)) {
      errors.push('Password must be at least 8 characters with uppercase, number, and special character');
    }

    if (!data.name || typeof data.name !== 'string' || data.name.length < 3) {
      errors.push('Name must be at least 3 characters');
    }

    if (data.phone && !this.isValidPhone(data.phone)) {
      errors.push('Valid phone number is required');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Validate order data
   */
  static isValidOrderData(order) {
    const errors = [];

    if (!order.items || !Array.isArray(order.items) || order.items.length === 0) {
      errors.push('Order must have at least one item');
    }

    if (order.items && order.items.length > 0) {
      order.items.forEach((item, index) => {
        if (!this.isValidObjectId(item.productId)) {
          errors.push(`Item ${index + 1}: Invalid product ID`);
        }

        if (!this.isValidQuantity(item.quantity)) {
          errors.push(`Item ${index + 1}: Invalid quantity`);
        }

        if (!this.isValidAmount(item.price)) {
          errors.push(`Item ${index + 1}: Invalid price`);
        }
      });
    }

    if (!order.shippingAddress || !this.isValidAddress(order.shippingAddress)) {
      errors.push('Valid shipping address is required');
    }

    if (order.billingAddress && !this.isValidAddress(order.billingAddress)) {
      errors.push('Invalid billing address');
    }

    if (!this.isValidAmount(order.totalAmount)) {
      errors.push('Valid order total is required');
    }

    return { isValid: errors.length === 0, errors };
  }

  /**
   * Middleware: Apply validation and sanitization to request body
   */
  static validateAndSanitize(req, res, next) {
    try {
      // Sanitize all string fields
      if (req.body) {
        req.body = ValidationService.sanitizeObject(req.body);
      }

      // Log suspicious patterns
      if (req.body && JSON.stringify(req.body).length > 10000) {
        logger.warn('Large request body detected:', {
          path: req.path,
          size: JSON.stringify(req.body).length,
          ip: req.ip,
        });
      }

      next();
    } catch (error) {
      logger.error('Validation error:', error);
      res.status(400).json({ error: 'Invalid request data' });
    }
  }

  /**
   * Middleware: Validate user authentication
   */
  static validateAuthUser(req, res, next) {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!this.isValidObjectId(req.user.id)) {
      return res.status(401).json({ error: 'Invalid user ID' });
    }

    next();
  }

  /**
   * Middleware: Validate admin access
   */
  static validateAdminAccess(req, res, next) {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (req.user.role !== 'admin') {
      logger.warn('Unauthorized admin access attempted:', {
        userId: req.user.id,
        path: req.path,
        ip: req.ip,
      });
      return res.status(403).json({ error: 'Admin access required' });
    }

    next();
  }

  /**
   * Middleware: Validate seller access
   */
  static validateSellerAccess(req, res, next) {
    if (!req.user || !req.user.id) {
      return res.status(401).json({ error: 'Authentication required' });
    }

    if (!['admin', 'seller'].includes(req.user.role)) {
      logger.warn('Unauthorized seller access attempted:', {
        userId: req.user.id,
        path: req.path,
        ip: req.ip,
      });
      return res.status(403).json({ error: 'Seller access required' });
    }

    next();
  }

  /**
   * Rate limiting helper (basic implementation)
   */
  static checkRateLimit(key, maxAttempts = 10, windowMs = 60000) {
    if (!this.rateLimitMap) {
      this.rateLimitMap = new Map();
    }

    const now = Date.now();
    if (!this.rateLimitMap.has(key)) {
      this.rateLimitMap.set(key, []);
    }

    const requests = this.rateLimitMap.get(key).filter(timestamp => timestamp > now - windowMs);

    if (requests.length >= maxAttempts) {
      return false;
    }

    requests.push(now);
    this.rateLimitMap.set(key, requests);
    return true;
  }

  /**
   * Get validation error message
   */
  static getErrorMessage(field, type) {
    const messages = {
      email: 'Valid email address is required',
      password: 'Password must be at least 8 characters with uppercase, number, and special character',
      phone: 'Valid phone number is required',
      amount: 'Valid amount is required',
      quantity: 'Valid quantity is required',
      objectId: 'Valid ID is required',
      required: `${field} is required`,
      invalid: `${field} is invalid`,
    };

    return messages[type] || 'Invalid input';
  }
}

module.exports = ValidationService;
