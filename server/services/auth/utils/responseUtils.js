'use strict';

/**
 * Standard success response
 */
function successResponse(res, { statusCode = 200, message = 'Success', data = null, meta = null }) {
  const response = {
    success: true,
    message,
    timestamp: new Date().toISOString(),
  };
  if (data !== null) response.data = data;
  if (meta !== null) response.meta = meta;
  return res.status(statusCode).json(response);
}

/**
 * Standard error response
 */
function errorResponse(res, { statusCode = 500, message = 'Internal Server Error', errors = null, code = null }) {
  const response = {
    success: false,
    message,
    timestamp: new Date().toISOString(),
  };
  if (errors) response.errors = errors;
  if (code) response.code = code;
  return res.status(statusCode).json(response);
}

/**
 * Set secure HTTP-only cookie for refresh token
 */
function setRefreshTokenCookie(res, refreshToken) {
  const isProduction = process.env.NODE_ENV === 'production';
  const maxAge = 7 * 24 * 60 * 60 * 1000; // 7 days

  res.cookie('kavox_refresh_token', refreshToken, {
    httpOnly: true,
    secure: isProduction || process.env.COOKIE_SECURE === 'true',
    sameSite: process.env.COOKIE_SAME_SITE || 'lax',
    maxAge,
    path: '/api/v1/auth',
  });
}

/**
 * Clear refresh token cookie
 */
function clearRefreshTokenCookie(res) {
  res.clearCookie('kavox_refresh_token', {
    httpOnly: true,
    path: '/api/v1/auth',
  });
}

module.exports = {
  successResponse,
  errorResponse,
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
};
