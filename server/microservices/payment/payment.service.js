'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const Razorpay = require('razorpay');
const crypto = require('crypto');
const axios = require('axios');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * PAYMENT MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: Razorpay integration, payment processing, reconciliation
 */

// ─── Payment Schema ───────────────────────────────────────────────────────
const paymentSchema = new mongoose.Schema({
  transactionId: { type: String, unique: true, sparse: true, index: true },
  razorpayOrderId: { type: String, unique: true, required: true, index: true },
  razorpayPaymentId: { type: String, sparse: true, index: true },
  razorpaySignature: String,

  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  amount: { type: Number, required: true }, // In paise
  amountFormatted: String, // ₹XXX.XX
  currency: { type: String, default: 'INR' },

  // Payment status
  status: {
    type: String,
    enum: ['pending', 'authorized', 'captured', 'failed', 'refunded', 'cancelled'],
    default: 'pending',
  },

  // Settlement
  adminAccountId: String, // Where payment settles
  settlementStatus: { type: String, default: null }, // pending, settled, failed
  settlementAmount: Number,
  settlementDate: Date,
  gst: { type: Number, default: 0 }, // Calculated GST
  platformFee: { type: Number, default: 0 }, // Platform fee (2-3%)
  netAmount: Number, // Amount after GST and fees

  // Customer info
  email: String,
  phone: String,
  
  // Refund info
  refundStatus: { type: String, default: null },
  refundAmount: Number,
  refundTransactionId: String,
  refundDate: Date,
  refundReason: String,

  // Metadata
  description: String,
  notes: String,
  
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, index: true }, // For pending orders (10 mins)
});

const Payment = mongoose.model('Payment', paymentSchema);

// ─── Settlement Schema ───────────────────────────────────────────────────
const settlementSchema = new mongoose.Schema({
  settlementId: { type: String, unique: true },
  status: { type: String, enum: ['pending', 'processing', 'settled', 'failed'], default: 'pending' },
  totalAmount: Number,
  gstAmount: Number,
  platformFee: Number,
  netAmount: Number,
  paymentCount: Number,
  bankAccount: String,
  utrNumber: String, // Unique Transaction Reference
  settlementDate: Date,
  createdAt: { type: Date, default: Date.now },
});

const Settlement = mongoose.model('Settlement', settlementSchema);

// ─── Payment Service Class ───────────────────────────────────────────────
class PaymentService extends MicroService {
  constructor() {
    super({
      name: 'payment-service',
      port: process.env.PAYMENT_SERVICE_PORT || 3004,
      version: '1.0.0',
    });

    // Initialize Razorpay
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    this.setupRoutes();
  }

  /**
   * Create Razorpay order
   */
  async createRazorpayOrder(amount, orderId, email, phone) {
    try {
      const amountInPaise = Math.round(amount * 100);

      const order = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: orderId,
        notes: {
          orderId,
          email,
          platform: 'kavox',
        },
      });

      return { success: true, order };
    } catch (error) {
      logger.error('Failed to create Razorpay order:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Verify payment signature
   */
  verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, signature) {
    try {
      const message = razorpayOrderId + '|' + razorpayPaymentId;
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(message)
        .digest('hex');

      return expectedSignature === signature;
    } catch (error) {
      logger.error('Signature verification failed:', error);
      return false;
    }
  }

  /**
   * Capture payment
   */
  async capturePayment(razorpayPaymentId, amount) {
    try {
      const amountInPaise = Math.round(amount * 100);

      const payment = await this.razorpay.payments.capture(razorpayPaymentId, amountInPaise);

      return { success: true, payment };
    } catch (error) {
      logger.error('Failed to capture payment:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Calculate settlement amounts
   */
  calculateSettlement(amount) {
    const gst = amount * 0.18; // 18% GST
    const platformFee = amount * 0.03; // 3% platform fee
    const netAmount = amount - gst - platformFee - 10; // -10 for Razorpay processing fee

    return { gst, platformFee, netAmount };
  }

  /**
   * Process refund
   */
  async processRefund(razorpayPaymentId, amount, reason) {
    try {
      const amountInPaise = Math.round(amount * 100);

      const refund = await this.razorpay.payments.refund(razorpayPaymentId, {
        amount: amountInPaise,
        notes: { reason },
      });

      return { success: true, refund };
    } catch (error) {
      logger.error('Failed to process refund:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup payment routes
   */
  setupRoutes() {
    // Initiate payment
    this.app.post('/api/payments/initiate', requireAuth, async (req, res, next) => {
      try {
        const { orderId, amount, email, phone } = req.body;

        if (!orderId || !amount) {
          return res.status(400).json({ error: 'Order ID and amount required' });
        }

        // Create Razorpay order
        const result = await this.createRazorpayOrder(amount, orderId, email || req.user.email, phone || req.user.phone);

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        // Save payment record
        const payment = new Payment({
          razorpayOrderId: result.order.id,
          orderId,
          userId: req.user.id,
          amount: result.order.amount,
          amountFormatted: `₹${(result.order.amount / 100).toFixed(2)}`,
          email: email || req.user.email,
          phone: phone || req.user.phone,
          status: 'pending',
          expiresAt: new Date(Date.now() + 10 * 60 * 1000), // 10 minutes
        });

        await payment.save();

        res.json({
          success: true,
          razorpayOrderId: result.order.id,
          amount: result.order.amount / 100,
          currency: 'INR',
          key: process.env.RAZORPAY_KEY_ID,
        });
      } catch (error) {
        next(error);
      }
    });

    // Verify payment
    this.app.post('/api/payments/verify', async (req, res, next) => {
      try {
        const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;

        if (!razorpayOrderId || !razorpayPaymentId || !razorpaySignature) {
          return res.status(400).json({ error: 'Missing payment details' });
        }

        // Verify signature
        if (!this.verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature)) {
          return res.status(401).json({ error: 'Invalid payment signature' });
        }

        // Find payment
        let payment = await Payment.findOne({ razorpayOrderId });

        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        // Capture payment
        const captureResult = await this.capturePayment(razorpayPaymentId, payment.amountFormatted.replace(/[^\d.]/g, ''));

        if (!captureResult.success) {
          payment.status = 'failed';
          await payment.save();
          return res.status(500).json({ error: 'Failed to capture payment' });
        }

        // Update payment
        payment.razorpayPaymentId = razorpayPaymentId;
        payment.razorpaySignature = razorpaySignature;
        payment.status = 'captured';
        payment.transactionId = `TXN-${Date.now()}`;

        // Calculate settlement
        const amountValue = parseFloat(payment.amountFormatted.replace(/[^\d.]/g, ''));
        const settlement = this.calculateSettlement(amountValue);
        payment.gst = settlement.gst;
        payment.platformFee = settlement.platformFee;
        payment.netAmount = settlement.netAmount;

        await payment.save();

        // Update order payment status
        try {
          const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';
          await axios.patch(
            `${orderServiceUrl}/api/orders/${payment.orderId}/payment-confirmed`,
            {
              paymentStatus: 'paid',
              transactionId: payment.transactionId,
              razorpayPaymentId,
            },
            { headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY } }
          );
        } catch (error) {
          logger.error('Failed to update order payment status:', error.message);
        }

        res.json({
          success: true,
          transactionId: payment.transactionId,
          message: 'Payment verified successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get payment status
    this.app.get('/api/payments/:transactionId', async (req, res, next) => {
      try {
        const payment = await Payment.findOne({ transactionId: req.params.transactionId });

        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        res.json({ success: true, payment });
      } catch (error) {
        next(error);
      }
    });

    // Request refund
    this.app.post('/api/payments/:transactionId/refund', requireAuth, async (req, res, next) => {
      try {
        const { amount, reason } = req.body;

        const payment = await Payment.findOne({ transactionId: req.params.transactionId });

        if (!payment) {
          return res.status(404).json({ error: 'Payment not found' });
        }

        if (payment.userId.toString() !== req.user.id && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized' });
        }

        if (payment.status !== 'captured') {
          return res.status(400).json({ error: 'Cannot refund non-captured payment' });
        }

        // Process refund
        const refundResult = await this.processRefund(payment.razorpayPaymentId, amount || parseFloat(payment.amountFormatted.replace(/[^\d.]/g, '')), reason);

        if (!refundResult.success) {
          return res.status(500).json({ error: refundResult.error });
        }

        // Update payment
        payment.refundStatus = 'processed';
        payment.refundAmount = refundResult.refund.amount / 100;
        payment.refundTransactionId = refundResult.refund.id;
        payment.refundDate = new Date();
        payment.refundReason = reason;
        payment.status = 'refunded';

        await payment.save();

        res.json({
          success: true,
          refundId: refundResult.refund.id,
          message: 'Refund processed successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Razorpay webhook
    this.app.post('/api/payments/webhook', async (req, res, next) => {
      try {
        const { event, payload } = req.body;

        logger.info(`Received webhook event: ${event}`);

        if (event === 'payment.authorized') {
          const { payment } = payload;
          const dbPayment = await Payment.findOne({ razorpayPaymentId: payment.id });

          if (dbPayment) {
            dbPayment.status = 'authorized';
            await dbPayment.save();
            logger.info(`Payment ${payment.id} authorized`);
          }
        }

        if (event === 'payment.failed') {
          const { payment } = payload;
          const dbPayment = await Payment.findOne({ razorpayPaymentId: payment.id });

          if (dbPayment) {
            dbPayment.status = 'failed';
            await dbPayment.save();
            logger.error(`Payment ${payment.id} failed`);
          }
        }

        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Get settlements
    this.app.get('/api/payments/admin/settlements', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const settlements = await Settlement.find().sort('-createdAt').limit(20);

        res.json({ success: true, settlements });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Dashboard stats
    this.app.get('/api/payments/admin/stats', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const totalPayments = await Payment.countDocuments({ status: 'captured' });
        const totalRevenue = await Payment.aggregate([
          { $match: { status: 'captured' } },
          { $group: { _id: null, total: { $sum: '$amount' } } },
        ]);

        const totalGST = await Payment.aggregate([
          { $match: { status: 'captured' } },
          { $group: { _id: null, total: { $sum: '$gst' } } },
        ]);

        const netSettlement = await Payment.aggregate([
          { $match: { status: 'captured' } },
          { $group: { _id: null, total: { $sum: '$netAmount' } } },
        ]);

        res.json({
          success: true,
          stats: {
            totalPayments,
            totalRevenue: (totalRevenue[0]?.total || 0) / 100, // Convert paise to rupees
            totalGST: totalGST[0]?.total || 0,
            netSettlement: netSettlement[0]?.total || 0,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Settlement report
    this.app.post('/api/payments/admin/settle', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        // Get unsettled payments
        const unsettledPayments = await Payment.find({ settlementStatus: null, status: 'captured' });

        if (unsettledPayments.length === 0) {
          return res.status(400).json({ error: 'No unsettled payments' });
        }

        let totalAmount = 0;
        let totalGST = 0;
        let totalFee = 0;

        unsettledPayments.forEach(p => {
          totalAmount += p.amountFormatted ? parseFloat(p.amountFormatted.replace(/[^\d.]/g, '')) : 0;
          totalGST += p.gst || 0;
          totalFee += p.platformFee || 0;
        });

        const netAmount = totalAmount - totalGST - totalFee;

        const settlement = new Settlement({
          settlementId: `SETTLE-${Date.now()}`,
          totalAmount,
          gstAmount: totalGST,
          platformFee: totalFee,
          netAmount,
          paymentCount: unsettledPayments.length,
          status: 'pending',
        });

        await settlement.save();

        // Mark payments as settled
        await Payment.updateMany({ _id: { $in: unsettledPayments.map(p => p._id) } }, { settlementStatus: 'pending' });

        res.json({
          success: true,
          settlement,
          message: 'Settlement created successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start payment service with database
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
  const paymentService = new PaymentService();
  paymentService.startWithDatabase();
}

module.exports = PaymentService;
