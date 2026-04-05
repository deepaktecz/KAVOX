'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const multer = require('multer');
const path = require('path');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * QIKINK MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: Design uploads, Qikink API integration, POD fulfillment, tracking
 */

// ─── Design Schema ───────────────────────────────────────────────────────
const designSchema = new mongoose.Schema({
  designId: { type: String, unique: true, required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },

  name: { type: String, required: true },
  description: String,
  imageUrl: { type: String, required: true },
  publicId: String, // Cloudinary public ID

  // Design specifications
  printArea: { type: String, enum: ['front', 'back', 'left-sleeve', 'right-sleeve', 'full'], required: true },
  printWidth: Number,
  printHeight: Number,
  printTechnique: { type: String, enum: ['screen-print', 'dtg', 'embroidery'], default: 'dtg' },

  // Qikink
  qikinkDesignId: String,
  qikinkProductId: String,

  // Mockups
  mockups: [{
    color: String,
    colorCode: String,
    mockupImageUrl: String,
    publicId: String,
  }],

  // Status
  status: { type: String, enum: ['draft', 'approved', 'rejected'], default: 'draft' },
  approvalNotes: String,

  // Metadata
  tags: [String],
  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

const Design = mongoose.model('Design', designSchema);

// ─── Qikink Order Schema ───────────────────────────────────────────────
const qikinkOrderSchema = new mongoose.Schema({
  qikinkOrderId: { type: String, unique: true, required: true, index: true },
  orderId: { type: mongoose.Schema.Types.ObjectId, ref: 'Order', required: true, index: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },

  // Item details
  productId: mongoose.Schema.Types.ObjectId,
  designId: { type: mongoose.Schema.Types.ObjectId, ref: 'Design' },
  quantity: Number,
  color: String,
  size: String,

  // Qikink status
  status: {
    type: String,
    enum: ['submitted', 'confirmed', 'printing', 'quality-check', 'shipped', 'delivered', 'failed'],
    default: 'submitted',
  },

  // Tracking
  trackingNumber: String,
  carrier: String,
  estimatedDelivery: Date,
  
  // Timeline
  timeline: [{
    timestamp: Date,
    status: String,
    message: String,
    details: String,
  }],

  // Qikink response
  qikinkResponse: mongoose.Schema.Types.Mixed,

  createdAt: { type: Date, default: Date.now, index: true },
  updatedAt: { type: Date, default: Date.now },
});

const QikinkOrder = mongoose.model('QikinkOrder', qikinkOrderSchema);

// ─── Qikink Service Class ───────────────────────────────────────────────
class QikinkService extends MicroService {
  constructor() {
    super({
      name: 'qikink-service',
      port: process.env.QIKINK_SERVICE_PORT || 3005,
      version: '1.0.0',
    });

    // Setup file upload
    const upload = multer({ dest: path.join(__dirname, '../../uploads/designs') });
    this.upload = upload;

    this.qikinkUrl = process.env.QIKINK_API_URL;
    this.qikinkKey = process.env.QIKINK_API_KEY;

    this.setupRoutes();
  }

  /**
   * Generate unique design ID
   */
  generateDesignId() {
    return `DESIGN-${Date.now()}-${Math.random().toString(36).substring(2, 8).toUpperCase()}`;
  }

  /**
   * Upload design to Qikink
   */
  async uploadDesignToQikink(designUrl, printArea, printWidth, printHeight) {
    try {
      if (!this.qikinkUrl || !this.qikinkKey) {
        return { success: false, error: 'Qikink not configured' };
      }

      const response = await axios.post(
        `${this.qikinkUrl}/designs`,
        {
          imageUrl: designUrl,
          printArea,
          printWidth,
          printHeight,
        },
        { headers: { Authorization: `Bearer ${this.qikinkKey}` } }
      );

      return { success: true, designId: response.data.designId };
    } catch (error) {
      logger.error('Failed to upload design to Qikink:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Submit order to Qikink
   */
  async submitOrderToQikink(orderData) {
    try {
      if (!this.qikinkUrl || !this.qikinkKey) {
        return { success: false, error: 'Qikink not configured' };
      }

      const response = await axios.post(
        `${this.qikinkUrl}/orders`,
        orderData,
        { headers: { Authorization: `Bearer ${this.qikinkKey}` } }
      );

      return { success: true, qikinkOrderId: response.data.orderId };
    } catch (error) {
      logger.error('Failed to submit order to Qikink:', error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get Qikink order status
   */
  async getQikinkOrderStatus(qikinkOrderId) {
    try {
      if (!this.qikinkUrl || !this.qikinkKey) {
        return { success: false, error: 'Qikink not configured' };
      }

      const response = await axios.get(`${this.qikinkUrl}/orders/${qikinkOrderId}`, {
        headers: { Authorization: `Bearer ${this.qikinkKey}` },
      });

      return { success: true, orderStatus: response.data };
    } catch (error) {
      logger.error(`Failed to get Qikink order status for ${qikinkOrderId}:`, error.message);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup Qikink routes
   */
  setupRoutes() {
    // Upload design
    this.app.post('/api/qikink/designs/upload', requireAuth, this.upload.single('design'), async (req, res, next) => {
      try {
        if (!req.file) {
          return res.status(400).json({ error: 'Design file required' });
        }

        const { name, description, printArea, printWidth, printHeight, productId } = req.body;

        // In production, upload to Cloudinary
        // For now, use local file
        const designUrl = `http://localhost:3005/uploads/designs/${req.file.filename}`;

        const designId = this.generateDesignId();

        const design = new Design({
          designId,
          userId: req.user.id,
          productId,
          name,
          description,
          imageUrl: designUrl,
          printArea,
          printWidth: parseInt(printWidth),
          printHeight: parseInt(printHeight),
          status: 'draft',
        });

        await design.save();

        res.status(201).json({
          success: true,
          design,
          message: 'Design uploaded successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get user designs
    this.app.get('/api/qikink/designs', requireAuth, async (req, res, next) => {
      try {
        const designs = await Design.find({ userId: req.user.id }).sort('-createdAt');

        res.json({ success: true, designs });
      } catch (error) {
        next(error);
      }
    });

    // Get design by ID
    this.app.get('/api/qikink/designs/:id', async (req, res, next) => {
      try {
        const design = await Design.findOne({ designId: req.params.id });

        if (!design) {
          return res.status(404).json({ error: 'Design not found' });
        }

        res.json({ success: true, design });
      } catch (error) {
        next(error);
      }
    });

    // Upload design to Qikink (generate mockups)
    this.app.post('/api/qikink/designs/:id/publish', requireAuth, async (req, res, next) => {
      try {
        const design = await Design.findOne({ designId: req.params.id });

        if (!design) {
          return res.status(404).json({ error: 'Design not found' });
        }

        if (design.userId.toString() !== req.user.id && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized' });
        }

        // Upload to Qikink
        const result = await this.uploadDesignToQikink(
          design.imageUrl,
          design.printArea,
          design.printWidth,
          design.printHeight
        );

        if (!result.success) {
          return res.status(500).json({ error: result.error });
        }

        design.qikinkDesignId = result.designId;
        design.status = 'approved';
        await design.save();

        res.json({
          success: true,
          design,
          message: 'Design published to Qikink',
        });
      } catch (error) {
        next(error);
      }
    });

    // Submit order to Qikink
    this.app.post('/api/qikink/orders/submit', requireAuth, async (req, res, next) => {
      try {
        const { orderId, items } = req.body;

        if (!orderId || !items || items.length === 0) {
          return res.status(400).json({ error: 'Order ID and items required' });
        }

        const qikinkOrderIds = [];

        for (const item of items) {
          const design = await Design.findOne({ designId: item.designId });

          if (!design || !design.qikinkDesignId) {
            return res.status(400).json({ error: `Design ${item.designId} not published to Qikink` });
          }

          // Submit to Qikink
          const submitResult = await this.submitOrderToQikink({
            designId: design.qikinkDesignId,
            productId: design.qikinkProductId,
            quantity: item.quantity,
            color: item.color,
            size: item.size,
            shippingAddress: item.shippingAddress,
          });

          if (!submitResult.success) {
            return res.status(500).json({ error: submitResult.error });
          }

          // Save Qikink order record
          const qikinkOrder = new QikinkOrder({
            qikinkOrderId: submitResult.qikinkOrderId,
            orderId,
            userId: req.user.id,
            designId: design._id,
            quantity: item.quantity,
            color: item.color,
            size: item.size,
            status: 'submitted',
            timeline: [{ timestamp: new Date(), status: 'submitted', message: 'Order submitted to Qikink' }],
          });

          await qikinkOrder.save();
          qikinkOrderIds.push(submitResult.qikinkOrderId);
        }

        res.json({
          success: true,
          qikinkOrderIds,
          message: 'Orders submitted to Qikink',
        });
      } catch (error) {
        next(error);
      }
    });

    // Track Qikink order
    this.app.get('/api/qikink/orders/:qikinkOrderId/track', async (req, res, next) => {
      try {
        const qikinkOrder = await QikinkOrder.findOne({ qikinkOrderId: req.params.qikinkOrderId }).populate('designId');

        if (!qikinkOrder) {
          return res.status(404).json({ error: 'Order not found' });
        }

        // Get latest status from Qikink
        const statusResult = await this.getQikinkOrderStatus(req.params.qikinkOrderId);

        if (statusResult.success) {
          qikinkOrder.status = statusResult.orderStatus.status;
          qikinkOrder.trackingNumber = statusResult.orderStatus.trackingNumber;
          qikinkOrder.carrier = statusResult.orderStatus.carrier;
          qikinkOrder.estimatedDelivery = statusResult.orderStatus.estimatedDelivery;

          qikinkOrder.timeline.push({
            timestamp: new Date(),
            status: statusResult.orderStatus.status,
            message: `Status updated from Qikink: ${statusResult.orderStatus.status}`,
          });

          await qikinkOrder.save();
        }

        res.json({
          success: true,
          tracking: {
            qikinkOrderId: qikinkOrder.qikinkOrderId,
            status: qikinkOrder.status,
            trackingNumber: qikinkOrder.trackingNumber,
            carrier: qikinkOrder.carrier,
            estimatedDelivery: qikinkOrder.estimatedDelivery,
            design: qikinkOrder.designId,
            timeline: qikinkOrder.timeline.sort((a, b) => b.timestamp - a.timestamp),
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Webhook from Qikink (status updates)
    this.app.post('/api/qikink/webhook', async (req, res, next) => {
      try {
        const { qikinkOrderId, status, trackingNumber, carrier, message } = req.body;

        const qikinkOrder = await QikinkOrder.findOne({ qikinkOrderId });

        if (!qikinkOrder) {
          return res.status(404).json({ error: 'Order not found' });
        }

        qikinkOrder.status = status;
        if (trackingNumber) qikinkOrder.trackingNumber = trackingNumber;
        if (carrier) qikinkOrder.carrier = carrier;

        qikinkOrder.timeline.push({
          timestamp: new Date(),
          status,
          message: message || `Status updated to ${status}`,
        });

        await qikinkOrder.save();

        logger.info(`Qikink webhook: Order ${qikinkOrderId} status updated to ${status}`);

        res.json({ success: true });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Get Qikink stats
    this.app.get('/api/qikink/admin/stats', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const totalDesigns = await Design.countDocuments();
        const totalOrders = await QikinkOrder.countDocuments();
        const statusBreakdown = await QikinkOrder.aggregate([
          { $group: { _id: '$status', count: { $sum: 1 } } },
        ]);

        res.json({
          success: true,
          stats: {
            totalDesigns,
            totalOrders,
            statusBreakdown,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start Qikink service with database
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
  const qikinkService = new QikinkService();
  qikinkService.startWithDatabase();
}

module.exports = QikinkService;
