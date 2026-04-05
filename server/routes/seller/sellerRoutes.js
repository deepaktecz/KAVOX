'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const SellerDashboardService = require('../../services/seller/seller.dashboard.service');
const { requireAuth, requireSellerOrAdmin, validateFields } = require('../../middleware/security.middleware');

/**
 * SELLER ROUTES
 * ═════════════════════════════════════════════════════════════════
 * Seller dashboard and analytics endpoints
 */

/**
 * GET /api/seller/dashboard
 * Get seller dashboard overview
 */
router.get('/dashboard', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const dashboard = await SellerDashboardService.getDashboard(req.user.id);

    res.json({
      success: true,
      dashboard,
    });
  } catch (error) {
    logger.error('Failed to fetch seller dashboard:', error);
    res.status(500).json({ error: 'Failed to fetch dashboard' });
  }
});

/**
 * GET /api/seller/orders
 * Get seller's orders with pagination and filters
 */
router.get('/orders', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = null, sort = '-createdAt' } = req.query;

    const result = await SellerDashboardService.getSellerOrders(
      req.user.id,
      parseInt(page),
      parseInt(limit),
      status,
      sort
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to fetch seller orders:', error);
    res.status(500).json({ error: 'Failed to fetch orders' });
  }
});

/**
 * GET /api/seller/products
 * Get seller's products with pagination and filters
 */
router.get('/products', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { page = 1, limit = 20, status = null, category = null, searchTerm = null } = req.query;

    const result = await SellerDashboardService.getSellerProducts(
      req.user.id,
      parseInt(page),
      parseInt(limit),
      { status, category, searchTerm }
    );

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to fetch seller products:', error);
    res.status(500).json({ error: 'Failed to fetch products' });
  }
});

/**
 * GET /api/seller/orders/stats
 * Get order statistics for seller
 */
router.get('/orders/stats', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const stats = await SellerDashboardService.getOrderStats(req.user.id, parseInt(days));

    res.json({
      success: true,
      stats,
    });
  } catch (error) {
    logger.error('Failed to fetch order stats:', error);
    res.status(500).json({ error: 'Failed to fetch statistics' });
  }
});

/**
 * GET /api/seller/payout
 * Get payout and payment information
 */
router.get('/payout', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { limit = 20 } = req.query;

    const payoutInfo = await SellerDashboardService.getPayoutInfo(req.user.id, parseInt(limit));

    res.json({
      success: true,
      payoutInfo,
    });
  } catch (error) {
    logger.error('Failed to fetch payout info:', error);
    res.status(500).json({ error: 'Failed to fetch payout information' });
  }
});

/**
 * GET /api/seller/profits
 * Get profit analysis for seller
 */
router.get('/profits', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const profits = await SellerDashboardService.getProfitAnalysis(req.user.id, parseInt(days));

    res.json({
      success: true,
      profits,
    });
  } catch (error) {
    logger.error('Failed to fetch profit analysis:', error);
    res.status(500).json({ error: 'Failed to fetch profit analysis' });
  }
});

/**
 * GET /api/seller/top-products
 * Get top selling products for seller
 */
router.get('/top-products', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { days = 30, limit = 10 } = req.query;
    const thirtyDaysAgo = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const topProducts = await SellerDashboardService.getTopProducts(
      req.user.id,
      thirtyDaysAgo,
      parseInt(limit)
    );

    res.json({
      success: true,
      topProducts,
    });
  } catch (error) {
    logger.error('Failed to fetch top products:', error);
    res.status(500).json({ error: 'Failed to fetch top products' });
  }
});

/**
 * GET /api/seller/daily-revenue
 * Get daily revenue breakdown
 */
router.get('/daily-revenue', requireAuth, requireSellerOrAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;
    const startDate = new Date(Date.now() - parseInt(days) * 24 * 60 * 60 * 1000);

    const dailyRevenue = await SellerDashboardService.getDailyRevenue(req.user.id, startDate);

    res.json({
      success: true,
      dailyRevenue,
    });
  } catch (error) {
    logger.error('Failed to fetch daily revenue:', error);
    res.status(500).json({ error: 'Failed to fetch daily revenue' });
  }
});

module.exports = router;
