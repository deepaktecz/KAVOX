'use strict';

const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const BCRYPT_ROUNDS = parseInt(process.env.BCRYPT_ROUNDS) || 12;

// ─── Address Sub-schema ───────────────────────────────────────
const addressSchema = new mongoose.Schema({
  label: {
    type: String,
    enum: ['home', 'work', 'other'],
    default: 'home',
  },
  fullName: { type: String, required: true, trim: true, maxlength: 100 },
  phone: { type: String, required: true, trim: true },
  addressLine1: { type: String, required: true, trim: true, maxlength: 200 },
  addressLine2: { type: String, trim: true, maxlength: 200 },
  city: { type: String, required: true, trim: true, maxlength: 100 },
  state: { type: String, required: true, trim: true, maxlength: 100 },
  pincode: { type: String, required: true, trim: true },
  country: { type: String, default: 'India', trim: true },
  isDefault: { type: Boolean, default: false },
}, { _id: true, timestamps: true });

// ─── Main User Schema ─────────────────────────────────────────
const userSchema = new mongoose.Schema({
  // ── Identity ──────────────────────────────────────────
  firstName: {
    type: String,
    required: [true, 'First name is required'],
    trim: true,
    minlength: [2, 'First name must be at least 2 characters'],
    maxlength: [50, 'First name cannot exceed 50 characters'],
  },
  lastName: {
    type: String,
    required: [true, 'Last name is required'],
    trim: true,
    minlength: [2, 'Last name must be at least 2 characters'],
    maxlength: [50, 'Last name cannot exceed 50 characters'],
  },
  email: {
    type: String,
    required: [true, 'Email is required'],
    unique: true,
    lowercase: true,
    trim: true,
    match: [
      /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/,
      'Please provide a valid email',
    ],
  },
  phone: {
    type: String,
    trim: true,
    match: [/^[6-9]\d{9}$/, 'Please provide a valid 10-digit Indian mobile number'],
    sparse: true,
  },

  // ── Auth ──────────────────────────────────────────────
  password: {
    type: String,
    minlength: [8, 'Password must be at least 8 characters'],
    select: false, // Never returned in queries by default
  },
  role: {
    type: String,
    enum: ['user', 'seller', 'admin', 'super_admin'],
    default: 'user',
    index: true,
  },
  authProvider: {
    type: String,
    enum: ['local', 'google', 'facebook'],
    default: 'local',
  },
  googleId: { type: String, sparse: true },
  facebookId: { type: String, sparse: true },

  // ── Verification ──────────────────────────────────────
  isEmailVerified: { type: Boolean, default: false, index: true },
  isPhoneVerified: { type: Boolean, default: false },
  isActive: { type: Boolean, default: true, index: true },
  isBanned: { type: Boolean, default: false },
  banReason: { type: String },

  // ── Profile ───────────────────────────────────────────
  avatar: {
    url: { type: String },
    publicId: { type: String },
  },
  dateOfBirth: { type: Date },
  gender: {
    type: String,
    enum: ['male', 'female', 'non-binary', 'prefer-not-to-say', ''],
  },
  addresses: [addressSchema],

  // ── Seller specific ───────────────────────────────────
  sellerProfile: {
    brandName: { type: String, trim: true, maxlength: 100 },
    brandDescription: { type: String, maxlength: 1000 },
    gstNumber: { type: String, trim: true },
    panNumber: { type: String, trim: true },
    bankAccountNumber: { type: String, select: false },
    bankIFSC: { type: String },
    isApproved: { type: Boolean, default: false },
    approvedAt: { type: Date },
    approvedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    totalEarnings: { type: Number, default: 0 },
    pendingPayout: { type: Number, default: 0 },
    rating: { type: Number, default: 0, min: 0, max: 5 },
    totalOrders: { type: Number, default: 0 },
  },

  // ── Security / Sessions ───────────────────────────────
  passwordChangedAt: { type: Date },
  passwordResetToken: { type: String, select: false },
  passwordResetExpires: { type: Date, select: false },
  failedLoginAttempts: { type: Number, default: 0, select: false },
  lockUntil: { type: Date, select: false },
  lastLoginAt: { type: Date },
  lastLoginIP: { type: String },
  activeSessionCount: { type: Number, default: 0 },

  // ── Preferences ───────────────────────────────────────
  preferences: {
    newsletter: { type: Boolean, default: true },
    smsAlerts: { type: Boolean, default: false },
    pushNotifications: { type: Boolean, default: true },
    language: { type: String, default: 'en' },
    currency: { type: String, default: 'INR' },
  },

  // ── Stats ─────────────────────────────────────────────
  totalOrders: { type: Number, default: 0 },
  totalSpent: { type: Number, default: 0 },
  loyaltyPoints: { type: Number, default: 0 },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ──────────────────────────────────────────────────
userSchema.index({ email: 1 }, { unique: true });
userSchema.index({ phone: 1 }, { sparse: true });
userSchema.index({ role: 1, isActive: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ 'sellerProfile.isApproved': 1 }, { sparse: true });

// ─── Virtuals ─────────────────────────────────────────────────
userSchema.virtual('fullName').get(function () {
  return `${this.firstName} ${this.lastName}`;
});

userSchema.virtual('isLocked').get(function () {
  return !!(this.lockUntil && this.lockUntil > Date.now());
});

// ─── Pre-save Hooks ───────────────────────────────────────────
userSchema.pre('save', async function (next) {
  // Hash password only if modified
  if (!this.isModified('password')) return next();
  if (!this.password) return next();

  try {
    const salt = await bcrypt.genSalt(BCRYPT_ROUNDS);
    this.password = await bcrypt.hash(this.password, salt);

    // Update passwordChangedAt if not new document
    if (!this.isNew) {
      this.passwordChangedAt = new Date(Date.now() - 1000);
    }
    next();
  } catch (err) {
    next(err);
  }
});

// Ensure only one default address
userSchema.pre('save', function (next) {
  if (!this.isModified('addresses')) return next();

  const defaultAddresses = this.addresses.filter((a) => a.isDefault);
  if (defaultAddresses.length > 1) {
    // Keep only the last one as default
    this.addresses.forEach((a, i) => {
      a.isDefault = i === this.addresses.length - 1 ? true : false;
    });
  }
  if (this.addresses.length > 0 && defaultAddresses.length === 0) {
    this.addresses[0].isDefault = true;
  }
  next();
});

// ─── Instance Methods ─────────────────────────────────────────
userSchema.methods.comparePassword = async function (candidatePassword) {
  if (!this.password) return false;
  return bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.changedPasswordAfter = function (JWTTimestamp) {
  if (this.passwordChangedAt) {
    const changedTimestamp = parseInt(this.passwordChangedAt.getTime() / 1000);
    return JWTTimestamp < changedTimestamp;
  }
  return false;
};

userSchema.methods.incLoginAttempts = async function () {
  // Reset if lock has expired
  if (this.lockUntil && this.lockUntil < Date.now()) {
    return this.updateOne({
      $set: { failedLoginAttempts: 1 },
      $unset: { lockUntil: 1 },
    });
  }

  const updates = { $inc: { failedLoginAttempts: 1 } };

  // Lock after 5 failed attempts for 1 hour
  if (this.failedLoginAttempts + 1 >= 5 && !this.isLocked) {
    updates.$set = { lockUntil: Date.now() + 60 * 60 * 1000 };
  }

  return this.updateOne(updates);
};

userSchema.methods.resetLoginAttempts = function () {
  return this.updateOne({
    $set: { failedLoginAttempts: 0, lastLoginAt: new Date() },
    $unset: { lockUntil: 1 },
  });
};

// Sanitize output - remove sensitive fields
userSchema.methods.toSafeObject = function () {
  const obj = this.toObject();
  delete obj.password;
  delete obj.passwordResetToken;
  delete obj.passwordResetExpires;
  delete obj.failedLoginAttempts;
  delete obj.lockUntil;
  delete obj.__v;
  if (obj.sellerProfile) {
    delete obj.sellerProfile.bankAccountNumber;
  }
  return obj;
};

// ─── Static Methods ───────────────────────────────────────────
userSchema.statics.findByEmail = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() });
};

userSchema.statics.findByEmailWithPassword = function (email) {
  return this.findOne({ email: email.toLowerCase().trim() }).select('+password +failedLoginAttempts +lockUntil');
};

const User = mongoose.model('User', userSchema);

module.exports = User;
