'use strict';

const Order = require('../../models/Order');
const Product = require('../../models/Product');
const logger = require('../../utils/logger');

/**
 * SELLER DASHBOARD SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Seller-specific analytics and order management
 */

class SellerDashboardService {
  /**
   * Get seller dashboard overview
   */
  async getDashboard(sellerId) {
    try {
      const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      // Get metrics from last 30 days
      const orders = await Order.find({
        'items.sellerId': sellerId,
        createdAt: { $gte: thirtyDaysAgo },
      });

      const totalRevenue = orders.reduce((sum, order) => {
        const sellerItems = order.items.filter(item => item.sellerId?.toString() === sellerId);
        return sum + sellerItems.reduce((itemSum, item) => itemSum + item.price * item.quantity, 0);
      }, 0);

      const totalOrders = orders.length;
      const cancelledOrders = orders.filter(o => o.status === 'cancelled').length;
      const completedOrders = orders.filter(o => o.status === 'delivered').length;
      const processingOrders = orders.filter(o => ['confirmed', 'processing', 'printed', 'packed', 'shipped', 'out_for_delivery'].includes(o.status)).length;

      // Get seller products 
      const products = await Product.find({ sellerId });
      const totalProducts = products.length;
      const activeProducts = products.filter(p => p.status === 'active').length;

      // Calculate average order value
      const averageOrderValue = totalOrders > 0 ? totalRevenue / totalOrders : 0;

      // Get top products
      const topProducts = await this.getTopProducts(sellerId, fifDaysAgo, 5);

      // Get daily revenue data
      const dailyRevenue = await this.getDailyRevenue(sellerId, thirtyDaysAgo);

      // Calculate growth
      const previousThirtyDaysAgo = new Date(thirtyDaysAgo.getTime() - 30 * 24 * 60 * 60 * 1000);
      const previousOrders = await Order.find({
        'items.sellerId': sellerId,
        createdAt: { $gte: previousThirtyDaysAgo, $lt: thirtyDaysAgo },
      });

      const previousRevenue = previousOrders.reduce((sum, order) => {
        const sellerItems = order.items.filter(item => item.sellerId?.toString() === sellerId);
        return sum + sellerItems.reduce((itemSum, item) => itemSum + item.price * item.quantity, 0);
      }, 0);

      const revenueGrowth = previousRevenue > 0 ? ((totalRevenue - previousRevenue) / previousRevenue * 100).toFixed(2) : 0;

      return {
        overview: {
          totalRevenue: parseFloat(totalRevenue.toFixed(2)),
          totalOrders,
          totalProducts,
          activeProducts,
          completedOrders,
          processingOrders,
          cancelledOrders,
          averageOrderValue: parseFloat(averageOrderValue.toFixed(2)),
          revenueGrowth: parseFloat(revenueGrowth),
        },
        topProducts,
        dailyRevenue,
        lastUpdated: new Date(),
      };
    } catch (error) {
      logger.error('Dashboard calculation failed:', error);
      throw error;
    }
  }

  /**
   * Get top selling products for seller
   */
  async getTopProducts(sellerId, startDate, limit = 5) {
    try {
      const orders = await Order.find({
        'items.sellerId': sellerId,
        createdAt: { $gte: startDate },
      }).populate('items.productId');

      const productMap = {};

      orders.forEach(order => {
        order.items
          .filter(item => item.sellerId?.toString() === sellerId)
          .forEach(item => {
            if (item.productId) {
              const key = item.productId._id.toString();
              if (!productMap[key]) {
                productMap[key] = {
                  productId: item.productId._id,
                  productName: item.productId.name,
                  totalSold: 0,
                  totalRevenue: 0,
                  avgPrice: 0,
                };
              }
              productMap[key].totalSold += item.quantity;
              productMap[key].totalRevenue += item.price * item.quantity;
            }
          });
      });

      const topProducts = Object.values(productMap)
        .map(p => ({
          ...p,
          totalRevenue: parseFloat(p.totalRevenue.toFixed(2)),
          avgPrice: parseFloat((p.totalRevenue / p.totalSold).toFixed(2)),
        }))
        .sort((a, b) => b.totalRevenue - a.totalRevenue)
        .slice(0, limit);

      return topProducts;
    } catch (error) {
      logger.error('Top products calculation failed:', error);
      return [];
    }
  }

  /**
   * Get daily revenue breakdown
   */
  async getDailyRevenue(sellerId, startDate) {
    try {
      const orders = await Order.find({
        'items.sellerId': sellerId,
        createdAt: { $gte: startDate },
      });

      const dailyMap = {};

      // Initialize last 30 days
      for (let i = 0; i < 30; i++) {
        const date = new Date(startDate);
        date.setDate(date.getDate() + i);
        const dateKey = date.toISOString().split('T')[0];
        dailyMap[dateKey] = { revenue: 0, orders: 0 };
      }

      // Aggregate data
      orders.forEach(order => {
        const dateKey = new Date(order.createdAt).toISOString().split('T')[0];
        if (dailyMap[dateKey]) {
          const sellerItems = order.items.filter(item => item.sellerId?.toString() === sellerId);
          const dayRevenue = sellerItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
          dailyMap[dateKey].revenue += dayRevenue;
          dailyMap[dateKey].orders += 1;
        }
      });

      return Object.keys(dailyMap)
        .sort()
        .map(date => ({
          date,
          revenue: parseFloat(dailyMap[date].revenue.toFixed(2)),
          orders: dailyMap[date].orders,
        }));
    } catch (error) {
      logger.error('Daily revenue calculation failed:', error);
      return [];
    }
  }

  /**
   * Get seller orders with pagination
   */
  async getSellerOrders(sellerId, page = 1, limit = 20, status = null, sort = '-createdAt') {
    try {
      const query = { 'items.sellerId': sellerId };

      if (status) {
        query.status = status;
      }

      const skip = (page - 1) * limit;

      const totalOrders = await Order.countDocuments(query);
      const orders = await Order.find(query)
        .populate('userId', 'email name')
        .populate('items.productId', 'name')
        .sort(sort)
        .skip(skip)
        .limit(limit);

      // Filter items to only show seller's items
      const sellerOrders = orders.map(order => ({
        ...order.toObject(),
        items: order.items.filter(item => item.sellerId?.toString() === sellerId),
      }));

      return {
        orders: sellerOrders,
        pagination: {
          page,
          limit,
          totalOrders,
          totalPages: Math.ceil(totalOrders / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get seller orders:', error);
      throw error;
    }
  }

  /**
   * Get seller products with pagination
   */
  async getSellerProducts(sellerId, page = 1, limit = 20, filters = {}) {
    try {
      const query = { sellerId };

      if (filters.status) {
        query.status = filters.status;
      }

      if (filters.category) {
        query.category = filters.category;
      }

      if (filters.searchTerm) {
        query.$or = [
          { name: { $regex: filters.searchTerm, $options: 'i' } },
          { description: { $regex: filters.searchTerm, $options: 'i' } },
        ];
      }

      const skip = (page - 1) * limit;

      const totalProducts = await Product.countDocuments(query);
      const products = await Product.find(query)
        .select('name description price stock status category createdAt')
        .sort('-createdAt')
        .skip(skip)
        .limit(limit);

      return {
        products,
        pagination: {
          page,
          limit,
          totalProducts,
          totalPages: Math.ceil(totalProducts / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get seller products:', error);
      throw error;
    }
  }

  /**
   * Get seller's order statistics
   */
  async getOrderStats(sellerId, days = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const orders = await Order.find({
        'items.sellerId': sellerId,
        createdAt: { $gte: startDate },
      });

      const stats = {
        total: orders.length,
        statuses: {},
        totalRevenue: 0,
        averageOrderValue: 0,
      };

      // Count by status
      const statusMap = {};
      orders.forEach(order => {
        if (!statusMap[order.status]) {
          statusMap[order.status] = 0;
        }
        statusMap[order.status]++;

        // Calculate revenue
        const sellerItems = order.items.filter(item => item.sellerId?.toString() === sellerId);
        const orderRevenue = sellerItems.reduce((sum, item) => sum + item.price * item.quantity, 0);
        stats.totalRevenue += orderRevenue;
      });

      stats.statuses = statusMap;
      stats.totalRevenue = parseFloat(stats.totalRevenue.toFixed(2));
      stats.averageOrderValue = orders.length > 0 ? parseFloat((stats.totalRevenue / orders.length).toFixed(2)) : 0;

      return stats;
    } catch (error) {
      logger.error('Failed to get order stats:', error);
      throw error;
    }
  }

  /**
   * Get seller's payment and payout info
   */
  async getPayoutInfo(sellerId, limit = 20) {
    try {
      const orders = await Order.find({ 'items.sellerId': sellerId })
        .select('totalAmount paymentStatus items')
        .sort('-createdAt')
        .limit(limit);

      let totalEarnings = 0;
      let paidOut = 0;
      let pending = 0;

      orders.forEach(order => {
        const sellerItems = order.items.filter(item => item.sellerId?.toString() === sellerId);
        const amount = sellerItems.reduce((sum, item) => sum + item.price * item.quantity, 0);

        totalEarnings += amount;

        if (order.paymentStatus === 'paid') {
          paidOut += amount;
        } else if (order.paymentStatus === 'pending') {
          pending += amount;
        }
      });

      return {
        totalEarnings: parseFloat(totalEarnings.toFixed(2)),
        paidOut: parseFloat(paidOut.toFixed(2)),
        pending: parseFloat(pending.toFixed(2)),
        transactions: orders.map(o => ({
          orderId: o._id,
          amount: parseFloat(o.totalAmount.toFixed(2)),
          status: o.paymentStatus,
          date: o.createdAt,
        })),
      };
    } catch (error) {
      logger.error('Failed to get payout info:', error);
      throw error;
    }
  }

  /**
   * Get profit margins
   */
  async getProfitAnalysis(sellerId, days = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const orders = await Order.find({
        'items.sellerId': sellerId,
        createdAt: { $gte: startDate },
      }).populate('items.productId', 'basePrice');

      let totalRevenue = 0;
      let totalCost = 0;
      let totalProfit = 0;

      orders.forEach(order => {
        order.items
          .filter(item => item.sellerId?.toString() === sellerId)
          .forEach(item => {
            const revenue = item.price * item.quantity;
            const cost = (item.productId?.basePrice || 0) * item.quantity;
            const profit = revenue - cost;

            totalRevenue += revenue;
            totalCost += cost;
            totalProfit += profit;
          });
      });

      const profitMargin = totalRevenue > 0 ? ((totalProfit / totalRevenue) * 100).toFixed(2) : 0;

      return {
        totalRevenue: parseFloat(totalRevenue.toFixed(2)),
        totalCost: parseFloat(totalCost.toFixed(2)),
        totalProfit: parseFloat(totalProfit.toFixed(2)),
        profitMargin: parseFloat(profitMargin),
        daysAnalyzed: days,
      };
    } catch (error) {
      logger.error('Failed to get profit analysis:', error);
      throw error;
    }
  }
}

module.exports = new SellerDashboardService();
