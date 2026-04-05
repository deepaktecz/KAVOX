'use strict';

const Redis = require('ioredis');
const { logger } = require('../utils/logger');

let redisClient = null;

const REDIS_OPTIONS = {
  host: process.env.REDIS_HOST || 'localhost',
  port: parseInt(process.env.REDIS_PORT) || 6379,
  password: process.env.REDIS_PASSWORD || undefined,
  db: parseInt(process.env.REDIS_DB) || 0,
  maxRetriesPerRequest: 3,
  retryStrategy(times) {
    if (times > 10) {
      logger.error('Redis: Max retries reached. Giving up.');
      return null;
    }
    const delay = Math.min(times * 100, 3000);
    return delay;
  },
  reconnectOnError(err) {
    const targetErrors = ['READONLY', 'ECONNRESET', 'ETIMEDOUT'];
    return targetErrors.some((e) => err.message.includes(e));
  },
  lazyConnect: true,
};

async function connectRedis() {
  if (process.env.NODE_ENV === 'test') {
    logger.info('Redis: Skipping in test environment');
    return;
  }

  try {
    redisClient = new Redis(REDIS_OPTIONS);

    redisClient.on('connect', () => logger.info('✅ Redis connected'));
    redisClient.on('ready', () => logger.info('Redis ready'));
    redisClient.on('error', (err) => logger.error('Redis error:', err.message));
    redisClient.on('close', () => logger.warn('Redis connection closed'));
    redisClient.on('reconnecting', () => logger.info('Redis reconnecting...'));

    await redisClient.connect();
  } catch (err) {
    logger.error('Redis connection failed:', err.message);
    logger.warn('Continuing without Redis (cache disabled)');
    redisClient = null;
  }
}

function getRedis() {
  return redisClient;
}

// ─── Cache helpers ────────────────────────────────────────────
const TTL = parseInt(process.env.REDIS_TTL) || 3600;

async function setCache(key, value, ttlSeconds = TTL) {
  if (!redisClient) return false;
  try {
    const serialized = JSON.stringify(value);
    await redisClient.setex(`kavox:auth:${key}`, ttlSeconds, serialized);
    return true;
  } catch (err) {
    logger.error('Redis setCache error:', err.message);
    return false;
  }
}

async function getCache(key) {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(`kavox:auth:${key}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.error('Redis getCache error:', err.message);
    return null;
  }
}

async function deleteCache(key) {
  if (!redisClient) return false;
  try {
    await redisClient.del(`kavox:auth:${key}`);
    return true;
  } catch (err) {
    logger.error('Redis deleteCache error:', err.message);
    return false;
  }
}

async function deleteCachePattern(pattern) {
  if (!redisClient) return false;
  try {
    const keys = await redisClient.keys(`kavox:auth:${pattern}*`);
    if (keys.length > 0) {
      await redisClient.del(...keys);
    }
    return true;
  } catch (err) {
    logger.error('Redis deleteCachePattern error:', err.message);
    return false;
  }
}

// Blacklist JWT (logout / token invalidation)
async function blacklistToken(jti, ttlSeconds) {
  if (!redisClient) return false;
  try {
    await redisClient.setex(`kavox:blacklist:${jti}`, ttlSeconds, '1');
    return true;
  } catch (err) {
    logger.error('Redis blacklistToken error:', err.message);
    return false;
  }
}

async function isTokenBlacklisted(jti) {
  if (!redisClient) return false;
  try {
    const exists = await redisClient.exists(`kavox:blacklist:${jti}`);
    return exists === 1;
  } catch (err) {
    logger.error('Redis isTokenBlacklisted error:', err.message);
    return false;
  }
}

// OTP storage with attempt tracking
async function storeOTP(userId, otp, ttlSeconds) {
  if (!redisClient) return false;
  try {
    const key = `kavox:otp:${userId}`;
    await redisClient.setex(key, ttlSeconds, JSON.stringify({ otp, attempts: 0 }));
    return true;
  } catch (err) {
    logger.error('Redis storeOTP error:', err.message);
    return false;
  }
}

async function getOTP(userId) {
  if (!redisClient) return null;
  try {
    const data = await redisClient.get(`kavox:otp:${userId}`);
    return data ? JSON.parse(data) : null;
  } catch (err) {
    logger.error('Redis getOTP error:', err.message);
    return null;
  }
}

async function incrementOTPAttempts(userId) {
  if (!redisClient) return 0;
  try {
    const key = `kavox:otp:${userId}`;
    const data = await redisClient.get(key);
    if (!data) return 0;
    const parsed = JSON.parse(data);
    parsed.attempts += 1;
    const ttl = await redisClient.ttl(key);
    if (ttl > 0) {
      await redisClient.setex(key, ttl, JSON.stringify(parsed));
    }
    return parsed.attempts;
  } catch (err) {
    logger.error('Redis incrementOTPAttempts error:', err.message);
    return 0;
  }
}

async function deleteOTP(userId) {
  if (!redisClient) return false;
  try {
    await redisClient.del(`kavox:otp:${userId}`);
    return true;
  } catch (err) {
    return false;
  }
}

// Refresh token storage
async function storeRefreshToken(userId, tokenId, ttlSeconds) {
  if (!redisClient) return false;
  try {
    await redisClient.setex(`kavox:refresh:${userId}:${tokenId}`, ttlSeconds, '1');
    return true;
  } catch (err) {
    return false;
  }
}

async function revokeRefreshToken(userId, tokenId) {
  if (!redisClient) return false;
  try {
    await redisClient.del(`kavox:refresh:${userId}:${tokenId}`);
    return true;
  } catch (err) {
    return false;
  }
}

async function revokeAllUserTokens(userId) {
  if (!redisClient) return false;
  try {
    const keys = await redisClient.keys(`kavox:refresh:${userId}:*`);
    if (keys.length > 0) await redisClient.del(...keys);
    return true;
  } catch (err) {
    return false;
  }
}

module.exports = {
  connectRedis,
  getRedis,
  setCache,
  getCache,
  deleteCache,
  deleteCachePattern,
  blacklistToken,
  isTokenBlacklisted,
  storeOTP,
  getOTP,
  incrementOTPAttempts,
  deleteOTP,
  storeRefreshToken,
  revokeRefreshToken,
  revokeAllUserTokens,
};
