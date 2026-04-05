'use strict';

const mongoose = require('mongoose');
const Order = require('../order/models/Order');
const Product = require('../product/models/Product');
const User = require('../auth/models/User');
const { logger } = require('../auth/utils/logger');

// ═══════════════════════════════════════════════════════════════
// ADMIN SERVICE
// ═══════════════════════════════════════════════════════════════
// Handles all admin dashboard operations including analytics,
// order management, product management, and profit tracking
// ═══════════════════════════════════════════════════════════════

class AdminService {
  // ═══════════════════════════════════════════════════════════════
  // DASHBOARD METRICS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get comprehensive dashboard metrics
   * @param {number} days - Number of days to analyze (default 30)
   * @returns {object} Dashboard data with metrics
   */
  async getDashboardMetrics(days = 30) {
    try {
      const validDays = Math.min(Math.max(parseInt(days) || 30, 1), 365);
      const since = new Date(Date.now() - validDays * 24 * 60 * 60 * 1000);
      const prevSince = new Date(since.getTime() - validDays * 24 * 60 * 60 * 1000);

      // Parallel queries for performance
      const [
        currentStats,
        prevStats,
        pendingOrders,
        totalOrdersInPeriod,
        totalActiveProducts,
        orderStatusBreakdown,
        dailyRevenue,
        qikinkStats,
        paymentStats,
      ] = await Promise.all([
        // Current period metrics (paid orders only)
        Order.aggregate([
          { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalAmount' },
              totalBasePrice: { $sum: '$totalBasePrice' },
              totalProfit: { $sum: '$totalProfit' },
              orderCount: { $sum: 1 },
              avgOrderValue: { $avg: '$totalAmount' },
              totalGST: { $sum: '$gstTotal' },
              totalShipping: { $sum: '$shippingCharge' },
            },
          },
        ]),

        // Previous period for growth percentage
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: prevSince, $lt: since },
              paymentStatus: 'paid',
            },
          },
          {
            $group: {
              _id: null,
              totalRevenue: { $sum: '$totalAmount' },
              totalProfit: { $sum: '$totalProfit' },
              orderCount: { $sum: 1 },
            },
          },
        ]),

        // Pending orders (need action)
        Order.countDocuments({
          status: { $in: ['confirmed', 'processing'] },
        }),

        // Total orders in period
        Order.countDocuments({ createdAt: { $gte: since } }),

        // Active products
        Product.countDocuments({ status: 'active' }),

        // Orders by status
        Order.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: '$status',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ]),

        // Daily revenue (for chart)
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          {
            $group: {
              _id: {
                $dateToString: {
                  format: '%Y-%m-%d',
                  date: '$createdAt',
                },
              },
              revenue: { $sum: '$totalAmount' },
              basePrice: { $sum: '$totalBasePrice' },
              profit: { $sum: '$totalProfit' },
              orders: { $sum: 1 },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Qikink fulfillment stats
        Order.aggregate([
          {
            $match: {
              qikinkOrderId: { $exists: true, $ne: null },
              createdAt: { $gte: since },
            },
          },
          {
            $group: {
              _id: '$qikinkFulfillmentStatus',
              count: { $sum: 1 },
            },
          },
          { $sort: { count: -1 } },
        ]),

        // Payment method breakdown
        Order.aggregate([
          { $match: { createdAt: { $gte: since } } },
          {
            $group: {
              _id: '$paymentMethod',
              count: { $sum: 1 },
              totalAmount: { $sum: '$totalAmount' },
            },
          },
          { $sort: { count: -1 } },
        ]),
      ]);

      const current = currentStats[0] || {
        totalRevenue: 0,
        totalBasePrice: 0,
        totalProfit: 0,
        orderCount: 0,
        avgOrderValue: 0,
      };
      const previous = prevStats[0] || {
        totalRevenue: 0,
        totalProfit: 0,
        orderCount: 0,
      };

      // Calculate growth percentages
      const calculateGrowth = (current, previous) => {
        if (previous === 0) return current === 0 ? 0 : 100;
        return parseFloat((((current - previous) / previous) * 100).toFixed(1));
      };

      return {
        summary: {
          totalRevenue: parseFloat((current.totalRevenue || 0).toFixed(2)),
          totalBasePrice: parseFloat((current.totalBasePrice || 0).toFixed(2)),
          totalProfit: parseFloat((current.totalProfit || 0).toFixed(2)),
          profitMargin:
            current.totalRevenue > 0
              ? parseFloat(((current.totalProfit / current.totalRevenue) * 100).toFixed(1))
              : 0,
          totalOrders: totalOrdersInPeriod,
          paidOrders: current.orderCount,
          avgOrderValue: parseFloat((current.avgOrderValue || 0).toFixed(2)),
          pendingOrders,
          totalActiveProducts,
          totalGST: parseFloat((current.totalGST || 0).toFixed(2)),
          totalShipping: parseFloat((current.totalShipping || 0).toFixed(2)),
        },
        growth: {
          revenueGrowth: calculateGrowth(current.totalRevenue, previous.totalRevenue),
          profitGrowth: calculateGrowth(current.totalProfit, previous.totalProfit),
          orderGrowth: calculateGrowth(current.orderCount, previous.orderCount),
        },
        breakdown: {
          byStatus: orderStatusBreakdown,
          byPaymentMethod: paymentStats,
          qikinkFulfillment: qikinkStats,
        },
        chart: {
          dailyRevenue,
        },
        period: {
          days: validDays,
          since: since.toISOString(),
        },
      };
    } catch (err) {
      logger.error(`Dashboard metrics error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ORDER MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get all orders with filters and pagination
   * @param {object} filters - Status, payment status, date range, etc.
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {object} Orders list with metadata
   */
  async getAllOrders(filters = {}, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      // Build query based on filters
      if (filters.status) query.status = filters.status;
      if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;
      if (filters.qikinkStatus) query.qikinkFulfillmentStatus = filters.qikinkStatus;

      if (filters.dateFrom || filters.dateTo) {
        query.createdAt = {};
        if (filters.dateFrom) query.createdAt.$gte = new Date(filters.dateFrom);
        if (filters.dateTo) query.createdAt.$lte = new Date(filters.dateTo);
      }

      if (filters.minAmount) query.totalAmount = { $gte: parseFloat(filters.minAmount) };
      if (filters.maxAmount) {
        query.totalAmount = { ...query.totalAmount, $lte: parseFloat(filters.maxAmount) };
      }

      const [orders, total] = await Promise.all([
        Order.find(query)
          .populate('user', 'firstName lastName email phone')
          .select('orderNumber totalAmount totalProfit paymentStatus status qikinkOrderId createdAt items.name items.profit')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Order.countDocuments(query),
      ]);

      return {
        orders,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error(`Get orders error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get order detail with complete information
   * @param {string} orderId - Order ID
   * @returns {object} Order details
   */
  async getOrderDetail(orderId) {
    try {
      const order = await Order.findById(orderId)
        .populate('user')
        .populate('items.product', 'name slug basePrice sellingPrice')
        .populate('items.seller', 'firstName lastName email');

      if (!order) {
        throw new Error('Order not found');
      }

      return order;
    } catch (err) {
      logger.error(`Get order detail error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update order status
   * @param {string} orderId - Order ID
   * @param {string} newStatus - New status
   * @returns {object} Updated order
   */
  async updateOrderStatus(orderId, newStatus) {
    try {
      const validStatuses = [
        'pending_payment',
        'confirmed',
        'processing',
        'packed',
        'shipped',
        'out_for_delivery',
        'delivered',
        'cancelled',
        'returned',
      ];

      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }

      const order = await Order.findById(orderId);
      if (!order) throw new Error('Order not found');

      order.status = newStatus;
      order.trackingEvents.push({
        status: newStatus,
        message: `Order status updated to ${newStatus}`,
        timestamp: new Date(),
        updatedBy: 'admin',
      });

      await order.save();
      logger.info(`Order ${orderId} status updated to ${newStatus}`);

      return order;
    } catch (err) {
      logger.error(`Update order status error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get orders statistics
   * @returns {object} Order stats
   */
  async getOrdersStats() {
    try {
      const stats = await Order.aggregate([
        {
          $facet: {
            totalOrders: [{ $count: 'count' }],
            byStatus: [
              {
                $group: {
                  _id: '$status',
                  count: { $sum: 1 },
                },
              },
            ],
            byPaymentStatus: [
              {
                $group: {
                  _id: '$paymentStatus',
                  count: { $sum: 1 },
                },
              },
            ],
            avgOrderValue: [
              {
                $group: {
                  _id: null,
                  avg: { $avg: '$totalAmount' },
                },
              },
            ],
            totalRevenue: [
              {
                $match: { paymentStatus: 'paid' },
              },
              {
                $group: {
                  _id: null,
                  total: { $sum: '$totalAmount' },
                },
              },
            ],
          },
        },
      ]);

      return stats[0];
    } catch (err) {
      logger.error(`Get orders stats error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PRODUCT MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Create new product
   * @param {object} productData - Product details
   * @returns {object} Created product
   */
  async createProduct(productData) {
    try {
      // Validate required fields
      if (!productData.name || !productData.basePrice || !productData.sellingPrice) {
        throw new Error('Missing required fields: name, basePrice, sellingPrice');
      }

      const product = await Product.create({
        ...productData,
        status: 'active',
      });

      logger.info(`Product created: ${product._id}`);
      return product;
    } catch (err) {
      logger.error(`Create product error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update product
   * @param {string} productId - Product ID
   * @param {object} updateData - Data to update
   * @returns {object} Updated product
   */
  async updateProduct(productId, updateData) {
    try {
      const product = await Product.findByIdAndUpdate(productId, updateData, {
        new: true,
        runValidators: true,
      });

      if (!product) throw new Error('Product not found');

      logger.info(`Product ${productId} updated`);
      return product;
    } catch (err) {
      logger.error(`Update product error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Delete product
   * @param {string} productId - Product ID
   * @returns {boolean} Success
   */
  async deleteProduct(productId) {
    try {
      const product = await Product.findById(productId);

      if (!product) throw new Error('Product not found');

      // Don't physically delete, just mark as inactive
      product.status = 'inactive';
      await product.save();

      logger.info(`Product ${productId} marked as inactive`);
      return true;
    } catch (err) {
      logger.error(`Delete product error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get products list
   * @param {object} filters - Status, price range, etc.
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {object} Products with pagination
   */
  async getProducts(filters = {}, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      if (filters.status) query.status = filters.status;
      else query.status = { $ne: 'inactive' };

      if (filters.minPrice) query.sellingPrice = { $gte: parseFloat(filters.minPrice) };
      if (filters.maxPrice) {
        query.sellingPrice = { ...query.sellingPrice, $lte: parseFloat(filters.maxPrice) };
      }

      const [products, total] = await Promise.all([
        Product.find(query)
          .select('name slug basePrice sellingPrice status totalStock salesCount')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Product.countDocuments(query),
      ]);

      // Add profit margin to each product
      const productsWithMargin = products.map((p) => ({
        ...p,
        profitMargin: p.sellingPrice > 0 ? ((p.sellingPrice - p.basePrice) / p.sellingPrice * 100).toFixed(1) : 0,
      }));

      return {
        products: productsWithMargin,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error(`Get products error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get product detail
   * @param {string} productId - Product ID
   * @returns {object} Product details
   */
  async getProductDetail(productId) {
    try {
      const product = await Product.findById(productId);

      if (!product) throw new Error('Product not found');

      // Get sales data for this product
      const salesData = await Order.aggregate([
        { $unwind: '$items' },
        { $match: { 'items.product': product._id } },
        {
          $group: {
            _id: null,
            totalSold: { $sum: '$items.quantity' },
            totalRevenue: { $sum: '$items.totalItemPrice' },
            totalProfit: { $sum: '$items.profit' },
          },
        },
      ]);

      return {
        product,
        sales: salesData[0] || { totalSold: 0, totalRevenue: 0, totalProfit: 0 },
      };
    } catch (err) {
      logger.error(`Get product detail error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ANALYTICS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get daily sales analytics
   * @param {number} days - Number of days to analyze
   * @returns {array} Daily sales data
   */
  async getDailySalesAnalytics(days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const analytics = await Order.aggregate([
        { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
        {
          $group: {
            _id: {
              $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
            },
            totalRevenue: { $sum: '$totalAmount' },
            totalProfit: { $sum: '$totalProfit' },
            totalOrders: { $sum: 1 },
            avgOrderValue: { $avg: '$totalAmount' },
          },
        },
        { $sort: { _id: 1 } },
      ]);

      return analytics;
    } catch (err) {
      logger.error(`Get daily sales analytics error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get profit analytics
   * @param {number} days - Number of days to analyze
   * @returns {object} Profit data
   */
  async getProfitAnalytics(days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [profitByProduct, profitByPaymentMethod, profitTrend] = await Promise.all([
        // Profit by product
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              totalProfit: { $sum: '$items.profit' },
              totalRevenue: { $sum: '$items.totalItemPrice' },
              quantitySold: { $sum: '$items.quantity' },
            },
          },
          {
            $lookup: {
              from: 'products',
              localField: '_id',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $sort: { totalProfit: -1 } },
          { $limit: 10 },
        ]),

        // Profit by payment method
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          {
            $group: {
              _id: '$paymentMethod',
              totalProfit: { $sum: '$totalProfit' },
              orderCount: { $sum: 1 },
              avgProfit: { $avg: '$totalProfit' },
            },
          },
          { $sort: { totalProfit: -1 } },
        ]),

        // Profit trend over time
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              totalProfit: { $sum: '$totalProfit' },
              orderCount: { $sum: 1 },
              avgProfit: { $avg: '$totalProfit' },
            },
          },
          { $sort: { _id: 1 } },
        ]),
      ]);

      return {
        topProductsByProfit: profitByProduct,
        byPaymentMethod: profitByPaymentMethod,
        trend: profitTrend,
      };
    } catch (err) {
      logger.error(`Get profit analytics error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get revenue analytics
   * @param {number} days - Number of days to analyze
   * @returns {object} Revenue data
   */
  async getRevenueAnalytics(days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [revenueOverTime, revenueByCategory, revenueByPaymentMethod] = await Promise.all([
        // Revenue over time
        Order.aggregate([
          { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
          {
            $group: {
              _id: {
                $dateToString: { format: '%Y-%m-%d', date: '$createdAt' },
              },
              totalRevenue: { $sum: '$totalAmount' },
              orderCount: { $sum: 1 },
              avgValue: { $avg: '$totalAmount' },
            },
          },
          { $sort: { _id: 1 } },
        ]),

        // Revenue by product
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              totalRevenue: { $sum: '$items.totalItemPrice' },
              quantitySold: { $sum: '$items.quantity' },
            },
          },
          {
            $lookup: {
              from: 'products',
              localField: '_id',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $sort: { totalRevenue: -1 } },
          { $limit: 10 },
        ]),

        // Revenue by payment method
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          {
            $group: {
              _id: '$paymentMethod',
              totalRevenue: { $sum: '$totalAmount' },
              orderCount: { $sum: 1 },
              avgRevenue: { $avg: '$totalAmount' },
            },
          },
          { $sort: { totalRevenue: -1 } },
        ]),
      ]);

      return {
        overTime: revenueOverTime,
        topProducts: revenueByCategory,
        byPaymentMethod: revenueByPaymentMethod,
      };
    } catch (err) {
      logger.error(`Get revenue analytics error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get product analytics
   * @param {number} days - Number of days to analyze
   * @returns {object} Product performance data
   */
  async getProductAnalytics(days = 30) {
    try {
      const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const [topSellers, topProfitable, slowMoving] = await Promise.all([
        // Top selling products
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              totalQuantity: { $sum: '$items.quantity' },
              totalRevenue: { $sum: '$items.totalItemPrice' },
            },
          },
          {
            $lookup: {
              from: 'products',
              localField: '_id',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $sort: { totalQuantity: -1 } },
          { $limit: 10 },
        ]),

        // Most profitable products
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              totalProfit: { $sum: '$items.profit' },
              profitMargin: { $avg: { $divide: ['$items.profit', '$items.totalItemPrice'] } },
            },
          },
          {
            $lookup: {
              from: 'products',
              localField: '_id',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $sort: { totalProfit: -1 } },
          { $limit: 10 },
        ]),

        // Slow moving products
        Order.aggregate([
          {
            $match: {
              createdAt: { $gte: since },
              paymentStatus: 'paid',
            },
          },
          { $unwind: '$items' },
          {
            $group: {
              _id: '$items.product',
              totalQuantity: { $sum: '$items.quantity' },
            },
          },
          {
            $lookup: {
              from: 'products',
              localField: '_id',
              foreignField: '_id',
              as: 'productInfo',
            },
          },
          { $sort: { totalQuantity: 1 } },
          { $limit: 10 },
        ]),
      ]);

      return {
        topSellersbyQuantity: topSellers,
        mostProfitable: topProfitable,
        slowMoving: slowMoving,
      };
    } catch (err) {
      logger.error(`Get product analytics error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // PAYMENT & REFUNDS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get payment status overview
   * @returns {object} Payment stats
   */
  async getPaymentStatus() {
    try {
      const stats = await Order.aggregate([
        {
          $group: {
            _id: '$paymentStatus',
            count: { $sum: 1 },
            totalAmount: { $sum: '$totalAmount' },
          },
        },
        { $sort: { count: -1 } },
      ]);

      return stats;
    } catch (err) {
      logger.error(`Get payment status error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get refunds list
   * @param {object} filters - Filters for refunds
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {object} Refunds with pagination
   */
  async getRefunds(filters = {}, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = { refundedAt: { $exists: true, $ne: null } };

      if (filters.paymentStatus) query.paymentStatus = filters.paymentStatus;

      const [refunds, total] = await Promise.all([
        Order.find(query)
          .populate('user', 'firstName lastName email')
          .select('orderNumber totalAmount refundAmount paymentStatus refundedAt')
          .sort({ refundedAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        Order.countDocuments(query),
      ]);

      return {
        refunds,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error(`Get refunds error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Initiate refund for order
   * @param {string} orderId - Order ID
   * @param {number} amount - Refund amount (optional)
   * @param {string} reason - Refund reason
   * @returns {object} Refund details
   */
  async initiateRefund(orderId, amount, reason) {
    try {
      const order = await Order.findById(orderId);

      if (!order) throw new Error('Order not found');

      if (order.paymentStatus !== 'paid') {
        throw new Error(`Cannot refund order with payment status: ${order.paymentStatus}`);
      }

      const refundAmount = amount || order.totalAmount;

      if (refundAmount > order.totalAmount) {
        throw new Error(`Refund amount exceeds order total`);
      }

      order.paymentStatus = refundAmount === order.totalAmount ? 'refunded' : 'partially_refunded';
      order.refundAmount = (order.refundAmount || 0) + refundAmount;
      order.refundedAt = new Date();

      order.trackingEvents.push({
        status: 'refunded',
        message: `Refund of ₹${refundAmount} initiated. Reason: ${reason}`,
        timestamp: new Date(),
        updatedBy: 'admin',
      });

      await order.save();
      logger.info(`Refund initiated for order ${orderId}: ₹${refundAmount}`);

      return {
        orderId,
        refundAmount,
        totalRefunded: order.refundAmount,
        status: order.paymentStatus,
      };
    } catch (err) {
      logger.error(`Initiate refund error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // USERS MANAGEMENT
  // ═══════════════════════════════════════════════════════════════

  /**
   * Get users list
   * @param {object} filters - Status, role filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {object} Users with pagination
   */
  async getUsers(filters = {}, page = 1, limit = 20) {
    try {
      const skip = (page - 1) * limit;
      const query = {};

      if (filters.role) query.role = filters.role;
      if (filters.status) query.accountStatus = filters.status;

      const [users, total] = await Promise.all([
        User.find(query)
          .select('firstName lastName email phone role accountStatus totalOrders totalSpent createdAt')
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .lean(),
        User.countDocuments(query),
      ]);

      return {
        users,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error(`Get users error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get user detail with order history
   * @param {string} userId - User ID
   * @returns {object} User details with stats
   */
  async getUserDetail(userId) {
    try {
      const [user, orderStats] = await Promise.all([
        User.findById(userId),
        Order.aggregate([
          { $match: { user: mongoose.Types.ObjectId(userId) } },
          {
            $group: {
              _id: null,
              totalOrders: { $sum: 1 },
              totalSpent: { $sum: '$totalAmount' },
              totalProfit: { $sum: '$totalProfit' },
              avgOrderValue: { $avg: '$totalAmount' },
            },
          },
        ]),
      ]);

      if (!user) throw new Error('User not found');

      return {
        user,
        stats: orderStats[0] || { totalOrders: 0, totalSpent: 0, totalProfit: 0, avgOrderValue: 0 },
      };
    } catch (err) {
      logger.error(`Get user detail error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update user status
   * @param {string} userId - User ID
   * @param {string} newStatus - New status (active/inactive/banned)
   * @returns {object} Updated user
   */
  async updateUserStatus(userId, newStatus) {
    try {
      const validStatuses = ['active', 'inactive', 'banned'];

      if (!validStatuses.includes(newStatus)) {
        throw new Error(`Invalid status: ${newStatus}`);
      }

      const user = await User.findByIdAndUpdate(
        userId,
        { accountStatus: newStatus },
        { new: true }
      );

      if (!user) throw new Error('User not found');

      logger.info(`User ${userId} status updated to ${newStatus}`);
      return user;
    } catch (err) {
      logger.error(`Update user status error: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new AdminService();
