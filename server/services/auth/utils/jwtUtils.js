'use strict';

const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const { logger } = require('./logger');

const ACCESS_SECRET = process.env.JWT_ACCESS_SECRET;
const REFRESH_SECRET = process.env.JWT_REFRESH_SECRET;
const ACCESS_EXPIRE = process.env.JWT_ACCESS_EXPIRE || '15m';
const REFRESH_EXPIRE = process.env.JWT_REFRESH_EXPIRE || '7d';
const ISSUER = process.env.JWT_ISSUER || 'kavox-platform';

/**
 * Generate Access Token
 * Short-lived, contains user identity + role
 */
function generateAccessToken(payload) {
  if (!ACCESS_SECRET) throw new Error('JWT_ACCESS_SECRET not configured');

  const jti = uuidv4();

  return {
    token: jwt.sign(
      {
        sub: payload.userId,
        email: payload.email,
        role: payload.role,
        jti,
        type: 'access',
      },
      ACCESS_SECRET,
      {
        expiresIn: ACCESS_EXPIRE,
        issuer: ISSUER,
        audience: 'kavox-client',
      }
    ),
    jti,
  };
}

/**
 * Generate Refresh Token
 * Long-lived, used to get new access tokens
 */
function generateRefreshToken(payload) {
  if (!REFRESH_SECRET) throw new Error('JWT_REFRESH_SECRET not configured');

  const jti = uuidv4();

  return {
    token: jwt.sign(
      {
        sub: payload.userId,
        jti,
        type: 'refresh',
        role: payload.role,
      },
      REFRESH_SECRET,
      {
        expiresIn: REFRESH_EXPIRE,
        issuer: ISSUER,
        audience: 'kavox-client',
      }
    ),
    jti,
  };
}

/**
 * Generate both tokens as a pair
 */
function generateTokenPair(payload) {
  const accessTokenData = generateAccessToken(payload);
  const refreshTokenData = generateRefreshToken(payload);
  return {
    accessToken: accessTokenData.token,
    accessJti: accessTokenData.jti,
    refreshToken: refreshTokenData.token,
    refreshJti: refreshTokenData.jti,
  };
}

/**
 * Verify Access Token
 */
function verifyAccessToken(token) {
  try {
    return jwt.verify(token, ACCESS_SECRET, {
      issuer: ISSUER,
      audience: 'kavox-client',
    });
  } catch (err) {
    logger.debug('Access token verification failed:', err.message);
    throw err;
  }
}

/**
 * Verify Refresh Token
 */
function verifyRefreshToken(token) {
  try {
    return jwt.verify(token, REFRESH_SECRET, {
      issuer: ISSUER,
      audience: 'kavox-client',
    });
  } catch (err) {
    logger.debug('Refresh token verification failed:', err.message);
    throw err;
  }
}

/**
 * Decode token without verifying (for getting expiry etc.)
 */
function decodeToken(token) {
  return jwt.decode(token, { complete: true });
}

/**
 * Get seconds until token expiry for Redis TTL
 */
function getTokenTTL(token) {
  try {
    const decoded = jwt.decode(token);
    if (!decoded || !decoded.exp) return 0;
    const now = Math.floor(Date.now() / 1000);
    return Math.max(0, decoded.exp - now);
  } catch {
    return 0;
  }
}

/**
 * Parse expiry string to seconds (e.g., '7d' -> 604800)
 */
function parseExpireToSeconds(expireStr) {
  const units = { s: 1, m: 60, h: 3600, d: 86400, w: 604800 };
  const match = expireStr.match(/^(\d+)([smhdw])$/);
  if (!match) return 3600;
  return parseInt(match[1]) * (units[match[2]] || 3600);
}

const REFRESH_TTL_SECONDS = parseExpireToSeconds(REFRESH_EXPIRE);
const ACCESS_TTL_SECONDS = parseExpireToSeconds(ACCESS_EXPIRE);

module.exports = {
  generateAccessToken,
  generateRefreshToken,
  generateTokenPair,
  verifyAccessToken,
  verifyRefreshToken,
  decodeToken,
  getTokenTTL,
  REFRESH_TTL_SECONDS,
  ACCESS_TTL_SECONDS,
};
