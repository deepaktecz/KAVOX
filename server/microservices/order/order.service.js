'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * ORDER MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: order creation, fulfillment, status tracking, Qikink integration
 */

// ─── Order Schema ───────────────────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  orderId: { type: String, unique: true, required: true, index: true }, // E.g., 'ORDER-20240115-12345'
  
  // Customer Info
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  email: String,
  phone: String,

  // Order Items
  items: [{
    productId: mongoose.Schema.Types.ObjectId,
    productName: String,
    sku: String,
    quantity: Number,
    basePrice: Number, // Qikink cost
    sellingPrice: Number,
    totalPrice: Number,
    color: String,
    size: String,
    printArea: String,
    designImageUrl: String,
    status: {
      type: String,
      enum: ['pending', 'confirmed', 'printing', 'shipped', 'delivered', 'cancelled', 'failed'],
      default: 'pending',
    },
    qikinkOrderId: String, // For POD tracking
  }],

  // Order Status
  status: {
    type: String,
    enum: ['pending', 'confirmed', 'processing', 'printing', 'shipped', 'delivered', 'cancelled', 'refunded'],
    default: 'pending',
  },
  
  // Pricing
  subtotal: Number,
  shippingCharge: { type: Number, default: 0 },
  tax: { type: Number, default: 0 },
  discountCode: String,
  discountAmount: { type: Number, default: 0 },
  totalAmount: Number,
  
  // Profits
  totalCost: Number, // Sum of basePrice * quantity
  totalProfit: Number, // totalAmount - totalCost - shippingCharge - tax

  // Shipping
  shippingAddress: {
    name: String,
    email: String,
    phone: String,
    street: String,
    city: String,
    state: String,
    postalCode: String,
    country: String,
  },
  trackingNumber: { type: String, sparse: true, index: true },
  carrier: String,
  
  // Payment
  paymentMethod: { type: String, default: 'razorpay' },
  paymentStatus: { type: String, enum: ['pending', 'paid', 'failed'], default: 'pending' },
  razorpayOrderId: String,
  transactionId: String,

  // Qikink POD
  qikinkSubmitted: { type: Boolean, default: false },
  qikinkOrderIds: [String], // Multiple if multiple items are POD

  // Returns & Refunds
  returnStatus: { type: String, enum: ['none', 'requested', 'approved', 'rejected', 'in-transit', 'received'], default: 'none' },
  returnRequest: {
    requestedAt: Date,
    reason: String,
    images: [String],
  },
  refundStatus: { type: String, enum: ['none', 'pending', 'processed', 'rejected'], default: 'none' },
  refundAmount: Number,

  // Timeline
  notes: [{ timestamp: Date, status: String, message: String }],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
  lastStatusUpdate: Date,
});

const Order = mongoose.model('Order', orderSchema);

// ─── Order Service Class ───────────────────────────────────────────────
class OrderService extends MicroService {
  constructor() {
    super({
      name: 'order-service',
      port: process.env.ORDER_SERVICE_PORT || 3003,
      version: '1.0.0',
    });

    this.setupRoutes();
  }

  /**
   * Generate unique order ID
   */
  generateOrderId() {
    const date = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `ORDER-${date}-${random}`;
  }

  /**
   * Calculate order totals
   */
  calculateTotals(items, shippingCharge = 0, discount = 0) {
    const subtotal = items.reduce((sum, item) => sum + item.totalPrice, 0);
    const tax = Math.round(subtotal * 0.05); // 5% tax
    const totalAmount = subtotal + shippingCharge + tax - discount;
    const totalCost = items.reduce((sum, item) => sum + item.basePrice * item.quantity, 0);
    const totalProfit = totalAmount - totalCost - shippingCharge - tax;

    return { subtotal, shippingCharge, tax, discount, totalAmount, totalCost, totalProfit };
  }

  /**
   * Submit order to Qikink
   */
  async submitToQikink(order) {
    try {
      const qikinkUrl = process.env.QIKINK_API_URL;
      const qikinkKey = process.env.QIKINK_API_KEY;

      if (!qikinkUrl || !qikinkKey) {
        logger.error('Qikink credentials not configured');
        return { success: false, error: 'Qikink config missing' };
      }

      const qikinkOrderIds = [];

      for (const item of order.items) {
        if (!item.designImageUrl) {
          logger.warn(`Item ${item.sku} missing design image, skipping Qikink`);
          continue;
        }

        try {
          const response = await axios.post(
            `${qikinkUrl}/orders`,
            {
              productId: item.productId,
              quantity: item.quantity,
              designs: [{ image: item.designImageUrl, printArea: item.printArea }],
              shipping: order.shippingAddress,
              customerEmail: order.email,
            },
            { headers: { Authorization: `Bearer ${qikinkKey}` } }
          );

          qikinkOrderIds.push(response.data.orderId);

          // Update item status
          item.qikinkOrderId = response.data.orderId;
          item.status = 'confirmed';
        } catch (error) {
          logger.error(`Failed to submit item ${item.sku} to Qikink:`, error.message);
          return { success: false, error: 'Qikink submission failed' };
        }
      }

      order.qikinkOrderIds = qikinkOrderIds;
      order.qikinkSubmitted = true;
      
      return { success: true, qikinkOrderIds };
    } catch (error) {
      logger.error('Qikink integration error:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup order routes
   */
  setupRoutes() {
    // Create order
    this.app.post('/api/orders', requireAuth, async (req, res, next) => {
      try {
        const { items, shippingAddress, discountCode } = req.body;

        if (!items || items.length === 0) {
          return res.status(400).json({ error: 'No items in order' });
        }

        if (!shippingAddress) {
          return res.status(400).json({ error: 'Shipping address required' });
        }

        // Calculate totals
        const totals = this.calculateTotals(
          items,
          0, // shipping
          discountCode ? 100 : 0 // 100 discount if code exists
        );

        const order = new Order({
          orderId: this.generateOrderId(),
          userId: req.user.id,
          email: req.user.email,
          phone: req.user.phone,
          items,
          shippingAddress,
          discountCode,
          ...totals,
          status: 'pending',
          lastStatusUpdate: new Date(),
        });

        await order.save();

        res.status(201).json({
          success: true,
          order,
          message: 'Order created successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get user orders
    this.app.get('/api/orders/user/me', requireAuth, async (req, res, next) => {
      try {
        const { page = 1, limit = 10, status } = req.query;
        const skip = (page - 1) * limit;

        const query = { userId: req.user.id };
        if (status) query.status = status;

        const orders = await Order.find(query)
          .sort('-createdAt')
          .skip(skip)
          .limit(parseInt(limit));

        const total = await Order.countDocuments(query);

        res.json({
          success: true,
          orders,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        next(error);
      }
    });

    // Get order by ID
    this.app.get('/api/orders/:id', async (req, res, next) => {
      try {
        const order = await Order.findById(req.params.id);

        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        res.json({ success: true, order });
      } catch (error) {
        next(error);
      }
    });

    // Track order
    this.app.get('/api/orders/:id/track', async (req, res, next) => {
      try {
        const order = await Order.findById(req.params.id).select(
          'orderId status trackingNumber carrier items qikinkOrderIds notes'
        );

        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        // Fetch Qikink status for POD items
        const qikinkStatuses = [];
        if (order.qikinkOrderIds.length > 0) {
          const qikinkUrl = process.env.QIKINK_API_URL;
          const qikinkKey = process.env.QIKINK_API_KEY;

          for (const qikinkOrderId of order.qikinkOrderIds) {
            try {
              const response = await axios.get(`${qikinkUrl}/orders/${qikinkOrderId}`, {
                headers: { Authorization: `Bearer ${qikinkKey}` },
              });
              qikinkStatuses.push({
                qikinkOrderId,
                status: response.data.status,
                tracking: response.data.tracking,
              });
            } catch (error) {
              logger.error(`Failed to fetch Qikink order ${qikinkOrderId}:`, error.message);
            }
          }
        }

        res.json({
          success: true,
          tracking: {
            orderId: order.orderId,
            status: order.status,
            trackingNumber: order.trackingNumber,
            carrier: order.carrier,
            qikinkStatuses,
            timeline: order.notes.sort((a, b) => b.timestamp - a.timestamp),
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Submit order to Qikink
    this.app.post('/api/orders/:id/submit-qikink', requireAuth, async (req, res, next) => {
      try {
        const order = await Order.findById(req.params.id);

        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        if (order.userId.toString() !== req.user.id && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized' });
        }

        if (order.qikinkSubmitted) {
          return res.status(400).json({ error: 'Order already submitted to Qikink' });
        }

        const result = await this.submitToQikink(order);

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        order.status = 'processing';
        order.lastStatusUpdate = new Date();
        order.notes.push({
          timestamp: new Date(),
          status: 'processing',
          message: `Order submitted to Qikink with order IDs: ${result.qikinkOrderIds.join(', ')}`,
        });

        await order.save();

        res.json({
          success: true,
          message: 'Order submitted to Qikink',
          qikinkOrderIds: result.qikinkOrderIds,
        });
      } catch (error) {
        next(error);
      }
    });

    // Update order status
    this.app.patch('/api/orders/:id/status', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const { status, trackingNumber, carrier, message } = req.body;

        const order = await Order.findByIdAndUpdate(
          req.params.id,
          {
            status,
            trackingNumber,
            carrier,
            lastStatusUpdate: new Date(),
            $push: {
              notes: {
                timestamp: new Date(),
                status,
                message: message || `Order status updated to ${status}`,
              },
            },
          },
          { new: true }
        );

        res.json({ success: true, order, message: 'Order status updated' });
      } catch (error) {
        next(error);
      }
    });

    // Request return
    this.app.post('/api/orders/:id/return', requireAuth, async (req, res, next) => {
      try {
        const { reason } = req.body;

        const order = await Order.findById(req.params.id);

        if (!order) {
          return res.status(404).json({ error: 'Order not found' });
        }

        if (order.userId.toString() !== req.user.id) {
          return res.status(403).json({ error: 'Unauthorized' });
        }

        if (order.returnStatus !== 'none') {
          return res.status(400).json({ error: 'Return already requested' });
        }

        order.returnStatus = 'requested';
        order.returnRequest = { requestedAt: new Date(), reason };
        order.notes.push({
          timestamp: new Date(),
          status: 'return_requested',
          message: `Return requested: ${reason}`,
        });

        await order.save();

        res.json({ success: true, message: 'Return request submitted' });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Approve return and process refund
    this.app.post('/api/orders/:id/approve-return', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const order = await Order.findById(req.params.id);

        if (!order || order.returnStatus !== 'requested') {
          return res.status(400).json({ error: 'Invalid return request' });
        }

        order.returnStatus = 'approved';
        order.refundStatus = 'pending';
        order.refundAmount = order.totalAmount * 0.95; // 5% deduction
        order.notes.push({
          timestamp: new Date(),
          status: 'return_approved',
          message: `Return approved. Refund: ₹${order.refundAmount}`,
        });

        await order.save();

        res.json({
          success: true,
          message: 'Return approved and refund initiated',
          refundAmount: order.refundAmount,
        });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Order stats
    this.app.get('/api/orders/admin/stats', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const totalOrders = await Order.countDocuments();
        const totalRevenue = await Order.aggregate([
          { $match: { paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$totalAmount' } } },
        ]);

        const totalProfit = await Order.aggregate([
          { $match: { paymentStatus: 'paid' } },
          { $group: { _id: null, total: { $sum: '$totalProfit' } } },
        ]);

        const ordersByStatus = await Order.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        res.json({
          success: true,
          stats: {
            totalOrders,
            totalRevenue: totalRevenue[0]?.total || 0,
            totalProfit: totalProfit[0]?.total || 0,
            averageOrderValue: (totalRevenue[0]?.total || 0) / totalOrders || 0,
            ordersByStatus,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start order service with database
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
  const orderService = new OrderService();
  orderService.startWithDatabase();
}

module.exports = OrderService;
