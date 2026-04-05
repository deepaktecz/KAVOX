'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const twilio = require('twilio');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * AUTH MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: user registration, login, OTP verification, JWT token management
 * Role-based access: User, Seller, Admin
 */

// ─── User Schema ───────────────────────────────────────────────────────────
const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true, lowercase: true },
  phone: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: {
    type: String,
    enum: ['user', 'seller', 'admin'],
    default: 'user',
  },
  profilePhoto: { type: String },
  isActive: { type: Boolean, default: true },
  emailVerified: { type: Boolean, default: false },
  phoneVerified: { type: Boolean, default: false },
  otp: {
    code: String,
    expiresAt: Date,
    attempts: { type: Number, default: 0 },
  },
  refreshTokens: [{ token: String, createdAt: Date }],
  lastLogin: { type: Date },
  createdAt: { type: Date, default: Date.now },
});

const User = mongoose.model('User', userSchema);

// ─── Auth Service Class ───────────────────────────────────────────────────
class AuthService extends MicroService {
  constructor() {
    super({
      name: 'auth-service',
      port: process.env.AUTH_SERVICE_PORT || 3001,
      version: '1.0.0',
    });

    this.initializeTwilio();
    this.setupRoutes();
  }

  /**
   * Initialize Twilio for OTP
   */
  initializeTwilio() {
    if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      logger.info('✓ Twilio initialized for OTP');
    } else {
      logger.warn('⚠ Twilio credentials not configured');
    }
  }

  /**
   * Setup authentication routes
   */
  setupRoutes() {
    // Register
    this.app.post('/api/auth/register', async (req, res, next) => {
      try {
        const { name, email, phone, password, role } = req.body;

        // Validation
        if (!name || !email || !phone || !password) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Check existing user
        const existingUser = await User.findOne({
          $or: [{ email }, { phone }],
        });

        if (existingUser) {
          return res.status(409).json({ error: 'Email or phone already registered' });
        }

        // Hash password
        const hashedPassword = await bcrypt.hash(password, 12);

        // Create user
        const user = new User({
          name,
          email,
          phone,
          password: hashedPassword,
          role: role || 'user',
        });

        await user.save();

        // Generate tokens
        const tokens = this.generateTokens(user);

        res.status(201).json({
          success: true,
          message: 'Registration successful',
          user: this.sanitizeUser(user),
          ...tokens,
        });

        logger.info(`New user registered: ${email}`);
      } catch (error) {
        next(error);
      }
    });

    // Login with email & password
    this.app.post('/api/auth/login', async (req, res, next) => {
      try {
        const { email, password } = req.body;

        if (!email || !password) {
          return res.status(400).json({ error: 'Email and password required' });
        }

        const user = await User.findOne({ email });

        if (!user || !(await bcrypt.compare(password, user.password))) {
          return res.status(401).json({ error: 'Invalid credentials' });
        }

        if (!user.isActive) {
          return res.status(403).json({ error: 'Account is inactive' });
        }

        // Generate tokens
        const tokens = this.generateTokens(user);

        // Update last login
        user.lastLogin = new Date();
        await user.save();

        res.json({
          success: true,
          message: 'Login successful',
          user: this.sanitizeUser(user),
          ...tokens,
        });

        logger.info(`User logged in: ${email}`);
      } catch (error) {
        next(error);
      }
    });

    // Send OTP
    this.app.post('/api/auth/send-otp', async (req, res, next) => {
      try {
        const { phone } = req.body;

        if (!phone) {
          return res.status(400).json({ error: 'Phone number required' });
        }

        const user = await User.findOne({ phone });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Generate 6-digit OTP
        const otp = Math.floor(100000 + Math.random() * 900000).toString();

        // Save OTP
        user.otp = {
          code: otp,
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
          attempts: 0,
        };

        await user.save();

        // Send via Twilio
        if (this.twilioClient) {
          try {
            await this.twilioClient.messages.create({
              body: `Your KAVOX verification code is: ${otp}. Valid for 10 minutes.`,
              from: process.env.TWILIO_PHONE_NUMBER,
              to: phone,
            });

            logger.info(`OTP sent to ${phone}`);
            res.json({ success: true, message: 'OTP sent successfully' });
          } catch (twilioError) {
            logger.error('Failed to send OTP via Twilio:', twilioError);
            // In development, we can return the OTP for testing
            if (process.env.NODE_ENV === 'development') {
              res.json({ success: true, message: 'OTP sent', otp });
            } else {
              throw twilioError;
            }
          }
        } else {
          // Fallback for development
          logger.warn(`OTP for ${phone}: ${otp}`);
          res.json({
            success: true,
            message: 'OTP sent',
            otp: process.env.NODE_ENV === 'development' ? otp : undefined,
          });
        }
      } catch (error) {
        next(error);
      }
    });

    // Verify OTP & Login
    this.app.post('/api/auth/verify-otp', async (req, res, next) => {
      try {
        const { phone, otp } = req.body;

        if (!phone || !otp) {
          return res.status(400).json({ error: 'Phone and OTP required' });
        }

        const user = await User.findOne({ phone });

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        // Validate OTP
        if (!user.otp || user.otp.code !== otp) {
          user.otp.attempts = (user.otp.attempts || 0) + 1;
          await user.save();

          if (user.otp.attempts > 5) {
            return res.status(429).json({
              error: 'Too many incorrect attempts. Request new OTP.',
            });
          }

          return res.status(401).json({ error: 'Invalid OTP' });
        }

        // Check if OTP expired
        if (new Date() > user.otp.expiresAt) {
          return res.status(401).json({ error: 'OTP expired' });
        }

        // Clear OTP and mark phone as verified
        user.otp = {};
        user.phoneVerified = true;
        user.lastLogin = new Date();
        await user.save();

        // Generate tokens
        const tokens = this.generateTokens(user);

        res.json({
          success: true,
          message: 'OTP verified successfully',
          user: this.sanitizeUser(user),
          ...tokens,
        });

        logger.info(`Phone verified and login successful: ${phone}`);
      } catch (error) {
        next(error);
      }
    });

    // Refresh Token
    this.app.post('/api/auth/refresh', async (req, res, next) => {
      try {
        const { refreshToken } = req.body;

        if (!refreshToken) {
          return res.status(400).json({ error: 'Refresh token required' });
        }

        const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        // Check if refresh token exists
        const tokenExists = user.refreshTokens.some(t => t.token === refreshToken);

        if (!tokenExists) {
          return res.status(401).json({ error: 'Refresh token invalid' });
        }

        // Generate new tokens
        const tokens = this.generateTokens(user);

        res.json({
          success: true,
          message: 'Token refreshed',
          ...tokens,
        });
      } catch (error) {
        if (error.name === 'TokenExpiredError') {
          return res.status(401).json({ error: 'Refresh token expired' });
        }
        next(error);
      }
    });

    // Get Current User
    this.app.get('/api/auth/me', requireAuth, async (req, res, next) => {
      try {
        const user = await User.findById(req.user.id);

        if (!user) {
          return res.status(404).json({ error: 'User not found' });
        }

        res.json({
          success: true,
          user: this.sanitizeUser(user),
        });
      } catch (error) {
        next(error);
      }
    });

    // Logout
    this.app.post('/api/auth/logout', requireAuth, async (req, res, next) => {
      try {
        const { refreshToken } = req.body;
        const user = await User.findById(req.user.id);

        if (user && refreshToken) {
          user.refreshTokens = user.refreshTokens.filter(t => t.token !== refreshToken);
          await user.save();
        }

        res.json({ success: true, message: 'Logged out successfully' });
      } catch (error) {
        next(error);
      }
    });

    // Verify Token (for gateway)
    this.app.post('/api/auth/verify', async (req, res, next) => {
      try {
        const { token } = req.body;

        if (!token) {
          return res.status(400).json({ error: 'Token required' });
        }

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const user = await User.findById(decoded.userId);

        if (!user) {
          return res.status(401).json({ error: 'User not found' });
        }

        res.json({
          success: true,
          valid: true,
          user: this.sanitizeUser(user),
        });
      } catch (error) {
        res.status(401).json({
          success: false,
          valid: false,
          error: error.message,
        });
      }
    });

    this.addHealthCheck();
  }

  /**
   * Generate JWT tokens
   */
  generateTokens(user) {
    const accessToken = jwt.sign(
      {
        userId: user._id,
        email: user.email,
        role: user.role,
      },
      process.env.JWT_SECRET,
      { expiresIn: '24h' }
    );

    const refreshToken = jwt.sign(
      { userId: user._id },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: '7d' }
    );

    // Store refresh token
    if (!user.refreshTokens) {
      user.refreshTokens = [];
    }

    user.refreshTokens.push({
      token: refreshToken,
      createdAt: new Date(),
    });

    // Keep only last 5 refresh tokens
    if (user.refreshTokens.length > 5) {
      user.refreshTokens = user.refreshTokens.slice(-5);
    }

    user.save().catch(err => logger.error('Failed to save refresh token:', err));

    return {
      accessToken,
      refreshToken,
      expiresIn: '24h',
    };
  }

  /**
   * Sanitize user object for response
   */
  sanitizeUser(user) {
    const userObj = user.toObject();
    delete userObj.password;
    delete userObj.otp;
    delete userObj.refreshTokens;
    return userObj;
  }

  /**
   * Start auth service with MongoDB connection
   */
  async startWithDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kavox');
      logger.info('✓ Connected to MongoDB');

      this.addHealthCheck(mongoose);
      this.start();
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }
}

// ─── Start Service ────────────────────────────────────────────────────────
if (require.main === module) {
  const authService = new AuthService();
  authService.startWithDatabase();
}

module.exports = AuthService;
