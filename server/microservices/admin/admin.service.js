'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * ADMIN MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: Admin dashboard, analytics, user management, platform stats
 */

// ─── Admin Analytics Schema ───────────────────────────────────────────────
const analyticsSchema = new mongoose.Schema({
  date: { type: Date, default: Date.now, index: true },
  
  // Orders
  totalOrders: Number,
  completedOrders: Number,
  cancelledOrders: Number,
  returnedOrders: Number,
  
  // Revenue
  totalRevenue: Number,
  totalProfit: Number,
  averageOrderValue: Number,
  
  // Users
  newUsers: Number,
  totalUsers: Number,
  
  // Products
  totalProducts: Number,
  activeSellers: Number,
  
  // Performance
  conversionRate: Number,
  cartAbandonmentRate: Number,
  
  // Payment
  successfulPayments: Number,
  failedPayments: Number,
  refundedPayments: Number,
});

const Analytics = mongoose.model('Analytics', analyticsSchema);

// ─── Admin Service Class ───────────────────────────────────────────────
class AdminService extends MicroService {
  constructor() {
    super({
      name: 'admin-service',
      port: process.env.ADMIN_SERVICE_PORT || 3009,
      version: '1.0.0',
    });

    this.setupRoutes();
  }

  /**
   * Check admin authorization
   */
  requireAdmin(req, res, next) {
    if (req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Admin access required' });
    }
    next();
  }

  /**
   * Fetch stats from multiple services
   */
  async fetchServiceStats() {
    const stats = {};

    try {
      // Order stats
      const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';
      const orderResponse = await axios.get(`${orderServiceUrl}/api/orders/admin/stats`, {
        headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
      });
      stats.orders = orderResponse.data.stats;
    } catch (error) {
      logger.error('Failed to fetch order stats:', error.message);
    }

    try {
      // Payment stats
      const paymentServiceUrl = process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004';
      const paymentResponse = await axios.get(`${paymentServiceUrl}/api/payments/admin/stats`, {
        headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
      });
      stats.payments = paymentResponse.data.stats;
    } catch (error) {
      logger.error('Failed to fetch payment stats:', error.message);
    }

    try {
      // Product stats
      const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';
      const productResponse = await axios.get(`${productServiceUrl}/api/products/admin/stats`, {
        headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
      });
      stats.products = productResponse.data.stats;
    } catch (error) {
      logger.error('Failed to fetch product stats:', error.message);
    }

    try {
      // Seller stats
      const sellerServiceUrl = process.env.SELLER_SERVICE_URL || 'http://localhost:3008';
      const sellerResponse = await axios.get(`${sellerServiceUrl}/api/seller/admin/stats`, {
        headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
      });
      stats.sellers = sellerResponse.data.stats;
    } catch (error) {
      logger.error('Failed to fetch seller stats:', error.message);
    }

    return stats;
  }

  /**
   * Setup admin routes
   */
  setupRoutes() {
    // Dashboard overview
    this.app.get('/api/admin/dashboard', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const stats = await this.fetchServiceStats();

        const recentAnalytics = await Analytics.findOne().sort('-date');

        res.json({
          success: true,
          dashboard: {
            stats,
            lastAnalyticsUpdate: recentAnalytics?.date,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Get analytics
    this.app.get('/api/admin/analytics', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const analytics = await Analytics.find({ date: { $gte: startDate } }).sort('date').limit(parseInt(days));

        res.json({ success: true, analytics });
      } catch (error) {
        next(error);
      }
    });

    // Get users (admin)
    this.app.get('/api/admin/users', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { page = 1, limit = 20, role, search } = req.query;
        const skip = (page - 1) * limit;

        // Call auth service to get users
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

        const response = await axios.get(`${authServiceUrl}/api/auth/admin/users`, {
          params: { page, limit, role, search },
          headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
        });

        res.json(response.data);
      } catch (error) {
        logger.error('Failed to fetch users:', error.message);
        res.status(500).json({ error: 'Failed to fetch users' });
      }
    });

    // Get all orders
    this.app.get('/api/admin/orders', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { page = 1, limit = 20, status } = req.query;

        // Call order service
        const orderServiceUrl = process.env.ORDER_SERVICE_URL || 'http://localhost:3003';

        const response = await axios.get(`${orderServiceUrl}/api/orders/admin/list`, {
          params: { page, limit, status },
          headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
        });

        res.json(response.data);
      } catch (error) {
        logger.error('Failed to fetch orders:', error.message);
        res.status(500).json({ error: 'Failed to fetch orders' });
      }
    });

    // Get all products
    this.app.get('/api/admin/products', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { page = 1, limit = 20 } = req.query;

        // Call product service
        const productServiceUrl = process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002';

        const response = await axios.get(`${productServiceUrl}/api/products`, {
          params: { page, limit },
          headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
        });

        res.json(response.data);
      } catch (error) {
        logger.error('Failed to fetch products:', error.message);
        res.status(500).json({ error: 'Failed to fetch products' });
      }
    });

    // Get all sellers
    this.app.get('/api/admin/sellers', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { page = 1, limit = 20 } = req.query;

        // Call seller service
        const sellerServiceUrl = process.env.SELLER_SERVICE_URL || 'http://localhost:3008';

        const response = await axios.get(`${sellerServiceUrl}/api/seller/admin/sellers`, {
          params: { page, limit },
          headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY },
        });

        res.json(response.data);
      } catch (error) {
        logger.error('Failed to fetch sellers:', error.message);
        res.status(500).json({ error: 'Failed to fetch sellers' });
      }
    });

    // Get revenue report
    this.app.get('/api/admin/reports/revenue', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { startDate, endDate, groupBy = 'day' } = req.query;

        const analytics = await Analytics.find({
          date: {
            $gte: new Date(startDate),
            $lte: new Date(endDate),
          },
        }).sort('date');

        const groupedData = {};

        analytics.forEach(record => {
          let key;
          if (groupBy === 'day') {
            key = record.date.toISOString().split('T')[0];
          } else if (groupBy === 'week') {
            const d = new Date(record.date);
            const week = Math.ceil(d.getDate() / 7);
            key = `${d.getFullYear()}-W${week}`;
          } else if (groupBy === 'month') {
            key = record.date.toISOString().slice(0, 7);
          }

          if (!groupedData[key]) {
            groupedData[key] = { revenue: 0, profit: 0, orders: 0 };
          }

          groupedData[key].revenue += record.totalRevenue || 0;
          groupedData[key].profit += record.totalProfit || 0;
          groupedData[key].orders += record.totalOrders || 0;
        });

        res.json({
          success: true,
          report: Object.entries(groupedData).map(([date, data]) => ({
            date,
            ...data,
          })),
        });
      } catch (error) {
        next(error);
      }
    });

    // Get user engagement report
    this.app.get('/api/admin/reports/engagement', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { days = 30 } = req.query;
        const startDate = new Date();
        startDate.setDate(startDate.getDate() - parseInt(days));

        const analytics = await Analytics.find({ date: { $gte: startDate } }).sort('date');

        const report = analytics.map(record => ({
          date: record.date.toISOString().split('T')[0],
          newUsers: record.newUsers,
          conversionRate: record.conversionRate,
          cartAbandonmentRate: record.cartAbandonmentRate,
          totalUsers: record.totalUsers,
        }));

        res.json({ success: true, report });
      } catch (error) {
        next(error);
      }
    });

    // Suspend/unsuspend user
    this.app.post('/api/admin/users/:userId/suspend', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const { reason } = req.body;

        // Call auth service to suspend user
        const authServiceUrl = process.env.AUTH_SERVICE_URL || 'http://localhost:3001';

        const response = await axios.post(
          `${authServiceUrl}/api/auth/admin/users/${req.params.userId}/suspend`,
          { reason },
          { headers: { 'X-Service-Auth': process.env.SERVICE_AUTH_KEY } }
        );

        res.json(response.data);
      } catch (error) {
        logger.error('Failed to suspend user:', error.message);
        res.status(500).json({ error: 'Failed to suspend user' });
      }
    });

    // Get platform metrics
    this.app.get('/api/admin/metrics', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const latestAnalytics = await Analytics.findOne().sort('-date');

        if (!latestAnalytics) {
          return res.json({
            success: true,
            metrics: {
              revenue: 0,
              profit: 0,
              orders: 0,
              users: 0,
              products: 0,
              sellers: 0,
            },
          });
        }

        res.json({
          success: true,
          metrics: {
            revenue: latestAnalytics.totalRevenue,
            profit: latestAnalytics.totalProfit,
            orders: latestAnalytics.totalOrders,
            users: latestAnalytics.totalUsers,
            products: latestAnalytics.totalProducts,
            sellers: latestAnalytics.activeSellers,
            averageOrderValue: latestAnalytics.averageOrderValue,
            conversionRate: latestAnalytics.conversionRate,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Manual analytics record
    this.app.post('/api/admin/analytics/record', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        const analyticsData = req.body;

        const record = new Analytics({
          ...analyticsData,
          date: new Date(),
        });

        await record.save();

        res.status(201).json({
          success: true,
          record,
          message: 'Analytics recorded',
        });
      } catch (error) {
        next(error);
      }
    });

    // Get activity logs
    this.app.get('/api/admin/logs', requireAuth, this.requireAdmin, async (req, res, next) => {
      try {
        // This would connect to a centralized logging service
        res.json({
          success: true,
          message: 'Logging service not configured',
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start admin service with database
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
  const adminService = new AdminService();
  adminService.startWithDatabase();
}

module.exports = AdminService;
