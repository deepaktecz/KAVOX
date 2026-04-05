'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * SELLER MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: Seller management, earnings, performance, inventory, payouts
 */

// ─── Seller Profile Schema ───────────────────────────────────────────────
const sellerProfileSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
  
  // Business Info
  businessName: { type: String, required: true },
  businessDescription: String,
  businessCategory: String,
  businessLogo: String,
  businessBanner: String,

  // Contact
  contactEmail: String,
  contactPhone: String,
  supportEmail: String,

  // Address
  address: {
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },

  // Banking
  bankAccount: String,
  bankIFSC: String,
  bankHolder: String,
  upiId: String,

  // Policies
  refundPolicy: String,
  shippingPolicy: String,
  returnPolicy: String,

  // Performance
  totalProducts: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 },
  totalRevenue: { type: Number, default: 0 },
  totalEarnings: { type: Number, default: 0 },
  averageRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },

  // Margin settings
  defaultMargin: { type: Number, default: 30 }, // 30% default margin
  marginByCategory: [
    {
      category: String,
      margin: Number,
    },
  ],

  // Status
  status: { type: String, enum: ['pending', 'active', 'suspended', 'closed'], default: 'pending' },
  verificationStatus: { type: String, enum: ['pending', 'verified', 'rejected'], default: 'pending' },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const SellerProfile = mongoose.model('SellerProfile', sellerProfileSchema);

// ─── Earnings Schema ───────────────────────────────────────────────────────
const earningsSchema = new mongoose.Schema({
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order' },

  amount: { type: Number, required: true },
  baseAmount: Number,
  commissionRate: { type: Number, default: 0 }, // Platform commission %
  commission: Number,
  netAmount: Number, // amount - commission

  status: { type: String, enum: ['pending', 'credited', 'refunded'], default: 'pending' },
  payoutId: String,

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

const Earnings = mongoose.model('Earnings', earningsSchema);

// ─── Payout Schema ────────────────────────────────────────────────────────
const payoutSchema = new mongoose.Schema({
  payoutId: { type: String, unique: true, required: true, index: true },
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  amount: { type: Number, required: true },
  currency: { type: String, default: 'INR' },
  
  status: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' },
  
  bankAccount: String,
  bankDetails: String,
  
  transactionId: String,
  processedAt: Date,
  failureReason: String,

  earningIds: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Earnings' }],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Payout = mongoose.model('Payout', payoutSchema);

// ─── Seller Service Class ───────────────────────────────────────────────
class SellerService extends MicroService {
  constructor() {
    super({
      name: 'seller-service',
      port: process.env.SELLER_SERVICE_PORT || 3008,
      version: '1.0.0',
    });

    this.setupRoutes();
  }

  /**
   * Generate payout ID
   */
  generatePayoutId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `PAYOUT-${date}-${random}`;
  }

  /**
   * Calculate seller earnings from order
   */
  calculateEarnings(orderAmount, baseAmount, defaultMargin) {
    const commission = (orderAmount * (process.env.PLATFORM_COMMISSION || 5)) / 100;
    const netAmount = orderAmount - commission;

    return {
      amount: orderAmount,
      baseAmount,
      commission,
      commissionRate: process.env.PLATFORM_COMMISSION || 5,
      netAmount,
    };
  }

  /**
   * Setup seller routes
   */
  setupRoutes() {
    // Create seller profile
    this.app.post('/api/seller/profile', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'seller') {
          return res.status(403).json({ error: 'Seller access required' });
        }

        const { businessName, businessCategory, address, bankDetails } = req.body;

        const existingProfile = await SellerProfile.findOne({ userId: req.user.id });

        if (existingProfile) {
          return res.status(400).json({ error: 'Profile already exists' });
        }

        const profile = new SellerProfile({
          userId: req.user.id,
          businessName,
          businessCategory,
          address,
          bankAccount: bankDetails?.bankAccount,
          bankIFSC: bankDetails?.bankIFSC,
          bankHolder: bankDetails?.bankHolder,
          status: 'pending',
          verificationStatus: 'pending',
        });

        await profile.save();

        res.status(201).json({
          success: true,
          profile,
          message: 'Seller profile created. Awaiting verification.',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get seller profile
    this.app.get('/api/seller/profile', requireAuth, async (req, res, next) => {
      try {
        const profile = await SellerProfile.findOne({ userId: req.user.id });

        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }

        res.json({ success: true, profile });
      } catch (error) {
        next(error);
      }
    });

    // Update seller profile
    this.app.put('/api/seller/profile', requireAuth, async (req, res, next) => {
      try {
        const profile = await SellerProfile.findOne({ userId: req.user.id });

        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }

        Object.assign(profile, req.body);
        profile.updatedAt = new Date();

        await profile.save();

        res.json({
          success: true,
          profile,
          message: 'Profile updated successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get seller dashboard
    this.app.get('/api/seller/dashboard', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'seller') {
          return res.status(403).json({ error: 'Seller access required' });
        }

        const profile = await SellerProfile.findOne({ userId: req.user.id });

        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }

        // Get earnings stats
        const totalEarnings = await Earnings.aggregate([
          { $match: { sellerId: req.user.id, status: 'credited' } },
          { $group: { _id: null, total: { $sum: '$netAmount' } } },
        ]);

        const pendingEarnings = await Earnings.aggregate([
          { $match: { sellerId: req.user.id, status: 'pending' } },
          { $group: { _id: null, total: { $sum: '$netAmount' } } },
        ]);

        // Get last 5 orders
        const recentOrders = await Earnings.find({ sellerId: req.user.id })
          .sort('-createdAt')
          .limit(5)
          .populate('orderId', 'orderId totalAmount status');

        // Get monthly earnings chart data
        const monthlyEarnings = await Earnings.aggregate([
          { $match: { sellerId: req.user.id } },
          {
            $group: {
              _id: { $dateToString: { format: '%Y-%m', date: '$createdAt' } },
              amount: { $sum: '$netAmount' },
            },
          },
          { $sort: { _id: 1 } },
          { $limit: 12 },
        ]);

        res.json({
          success: true,
          dashboard: {
            profile,
            stats: {
              totalEarnings: totalEarnings[0]?.total || 0,
              pendingEarnings: pendingEarnings[0]?.total || 0,
              totalProducts: profile.totalProducts,
              totalOrders: profile.totalOrders,
              averageRating: profile.averageRating,
            },
            recentOrders,
            monthlyEarnings,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Get seller earnings history
    this.app.get('/api/seller/earnings', requireAuth, async (req, res, next) => {
      try {
        const { page = 1, limit = 20, status } = req.query;
        const skip = (page - 1) * limit;

        const query = { sellerId: req.user.id };
        if (status) query.status = status;

        const earnings = await Earnings.find(query)
          .populate('orderId', 'orderId totalAmount')
          .sort('-createdAt')
          .skip(skip)
          .limit(parseInt(limit));

        const total = await Earnings.countDocuments(query);

        res.json({
          success: true,
          earnings,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        next(error);
      }
    });

    // Request payout
    this.app.post('/api/seller/payout/request', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'seller') {
          return res.status(403).json({ error: 'Seller access required' });
        }

        const { amount } = req.body;

        const profile = await SellerProfile.findOne({ userId: req.user.id });

        if (!profile) {
          return res.status(404).json({ error: 'Profile not found' });
        }

        if (!profile.bankAccount) {
          return res.status(400).json({ error: 'Bank account required for payout' });
        }

        // Get pending earnings
        const pendingEarnings = await Earnings.find({
          sellerId: req.user.id,
          status: 'pending',
        });

        const totalPending = pendingEarnings.reduce((sum, e) => sum + e.netAmount, 0);

        if (!amount || amount > totalPending) {
          return res.status(400).json({
            error: `Amount must be between 0 and ${totalPending}`,
          });
        }

        // Create payout
        const payout = new Payout({
          payoutId: this.generatePayoutId(),
          sellerId: req.user.id,
          amount,
          status: 'pending',
          bankAccount: profile.bankAccount,
          earningIds: pendingEarnings.slice(0, Math.ceil((amount / totalPending) * pendingEarnings.length)).map(e => e._id),
        });

        await payout.save();

        res.status(201).json({
          success: true,
          payout,
          message: 'Payout request submitted',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get payout history
    this.app.get('/api/seller/payouts', requireAuth, async (req, res, next) => {
      try {
        const { page = 1, limit = 10 } = req.query;
        const skip = (page - 1) * limit;

        const payouts = await Payout.find({ sellerId: req.user.id })
          .sort('-createdAt')
          .skip(skip)
          .limit(parseInt(limit));

        const total = await Payout.countDocuments({ sellerId: req.user.id });

        res.json({
          success: true,
          payouts,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        next(error);
      }
    });

    // Seller products
    this.app.get('/api/seller/products', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'seller') {
          return res.status(403).json({ error: 'Seller access required' });
        }

        const { page = 1, limit = 20 } = req.query;
        const skip = (page - 1) * limit;

        // Call product service to get seller products
        const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

        const response = await axios.get(`${productServiceUrl}/api/products`, {
          params: { page, limit },
          headers: { 'X-Seller-Id': req.user.id },
        });

        res.json(response.data);
      } catch (error) {
        logger.error('Failed to fetch seller products:', error.message);
        res.status(500).json({ error: 'Failed to fetch products' });
      }
    });

    // Admin: Get seller stats
    this.app.get('/api/seller/admin/stats', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const totalSellers = await SellerProfile.countDocuments({ status: 'active' });
        const activeSellers = await SellerProfile.countDocuments({ verificationStatus: 'verified' });
        const totalPaid = await Payout.aggregate([
          { $match: { status: 'completed' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const topSellers = await SellerProfile.find({ status: 'active' })
          .sort('-totalEarnings')
          .limit(10)
          .select('businessName totalEarnings totalProducts averageRating');

        res.json({
          success: true,
          stats: {
            totalSellers,
            activeSellers,
            totalPaid: totalPaid[0]?.total || 0,
            topSellers,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Verify seller profile
    this.app.post('/api/seller/admin/verify/:sellerId', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const { status, notes } = req.body;

        const profile = await SellerProfile.findOneAndUpdate(
          { userId: req.params.sellerId },
          {
            verificationStatus: status,
            status: status === 'verified' ? 'active' : 'suspended',
          },
          { new: true }
        );

        res.json({
          success: true,
          profile,
          message: `Seller ${status}`,
        });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Approve payout
    this.app.post('/api/seller/admin/payout/:payoutId/approve', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const { transactionId, notes } = req.body;

        const payout = await Payout.findByIdAndUpdate(
          req.params.payoutId,
          {
            status: 'completed',
            transactionId,
            processedAt: new Date(),
          },
          { new: true }
        );

        // Update earnings status
        await Earnings.updateMany({ _id: { $in: payout.earningIds } }, { status: 'credited' });

        res.json({
          success: true,
          payout,
          message: 'Payout approved',
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start seller service with database
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
  const sellerService = new SellerService();
  sellerService.startWithDatabase();
}

module.exports = SellerService;
