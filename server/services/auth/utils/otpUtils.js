'use strict';

const crypto = require('crypto');

/**
 * Generate cryptographically secure OTP
 */
function generateOTP(length = 6) {
  const len = parseInt(process.env.OTP_LENGTH) || length;
  // Use crypto for secure random numbers
  const max = Math.pow(10, len);
  const randomBytes = crypto.randomBytes(4);
  const randomNum = randomBytes.readUInt32BE(0) % max;
  return String(randomNum).padStart(len, '0');
}

/**
 * Hash OTP before storing in DB (extra security layer)
 */
function hashOTP(otp) {
  return crypto
    .createHash('sha256')
    .update(otp + (process.env.JWT_ACCESS_SECRET || 'kavox'))
    .digest('hex');
}

/**
 * Compare plain OTP with hashed version
 */
function compareOTP(plainOTP, hashedOTP) {
  return hashOTP(plainOTP) === hashedOTP;
}

module.exports = { generateOTP, hashOTP, compareOTP };
