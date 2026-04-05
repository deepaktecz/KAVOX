'use strict';

const { logger } = require('../utils/logger');

class AppError extends Error {
  constructor(message, statusCode, code = null) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Error.captureStackTrace(this, this.constructor);
  }
}

// ─── 404 Handler ──────────────────────────────────────────────
function notFoundHandler(req, res, next) {
  next(new AppError(`Route ${req.method} ${req.originalUrl} not found`, 404, 'ROUTE_NOT_FOUND'));
}

// ─── Global Error Handler ─────────────────────────────────────
function errorHandler(err, req, res, next) { // eslint-disable-line no-unused-vars
  let statusCode = err.statusCode || 500;
  let message = err.message || 'Internal Server Error';
  let code = err.code || 'INTERNAL_ERROR';
  let errors = null;

  // ── Mongoose Validation Error ──────────────────────────
  if (err.name === 'ValidationError') {
    statusCode = 400;
    code = 'VALIDATION_ERROR';
    errors = Object.values(err.errors).map((e) => ({
      field: e.path,
      message: e.message,
    }));
    message = 'Validation failed';
  }

  // ── Mongoose Duplicate Key ─────────────────────────────
  if (err.code === 11000) {
    statusCode = 409;
    code = 'DUPLICATE_KEY';
    const field = Object.keys(err.keyValue || {})[0];
    message = field === 'email'
      ? 'An account with this email already exists'
      : `${field} already in use`;
  }

  // ── Mongoose Cast Error (invalid ObjectId) ─────────────
  if (err.name === 'CastError') {
    statusCode = 400;
    code = 'INVALID_ID';
    message = `Invalid ${err.path}: ${err.value}`;
  }

  // ── JWT Errors ─────────────────────────────────────────
  if (err.name === 'JsonWebTokenError') {
    statusCode = 401;
    code = 'INVALID_TOKEN';
    message = 'Invalid authentication token';
  }

  if (err.name === 'TokenExpiredError') {
    statusCode = 401;
    code = 'TOKEN_EXPIRED';
    message = 'Authentication token has expired';
  }

  // ── Express Validator ──────────────────────────────────
  if (err.code === 'VALIDATION_ERRORS') {
    statusCode = 422;
    code = 'VALIDATION_ERROR';
  }

  // Log errors
  if (statusCode >= 500) {
    logger.error('Unhandled error:', {
      message: err.message,
      stack: err.stack,
      url: req.originalUrl,
      method: req.method,
      ip: req.ip,
    });
  } else {
    logger.warn('Client error:', {
      message: err.message,
      code,
      url: req.originalUrl,
      method: req.method,
    });
  }

  const response = {
    success: false,
    message,
    code,
    timestamp: new Date().toISOString(),
  };

  if (errors) response.errors = errors;

  // Stack trace only in development
  if (process.env.NODE_ENV === 'development' && statusCode >= 500) {
    response.stack = err.stack;
  }

  return res.status(statusCode).json(response);
}

module.exports = { AppError, notFoundHandler, errorHandler };
