'use strict';

/**
 * ADMIN ROUTES
 * ────────────
 * Feature 4: Complete admin dashboard APIs with MVC pattern
 *   - Dashboard stats: revenue, Qikink cost, profit, total orders
 *   - Orders list with payment + qikink status
 *   - Products CRUD with margin setting
 *   - Analytics: profit, revenue, product performance
 *   - Payments & refunds management
 *   - User management
 *
 * Controller: ../../services/admin/admin.controller.js
 * Service: ../../services/admin/admin.service.js
 */

const express = require('express');
const router = express.Router();

const adminController = require('../../services/admin/admin.controller');
const { protect, restrictTo } = require('../../services/auth/middleware/authMiddleware');

// All admin routes require admin role
router.use(protect, restrictTo('admin', 'super_admin'));

// ═══════════════════════════════════════════════════════════════
// DASHBOARD: SUMMARY STATS
// GET /api/v1/admin/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', adminController.getDashboard);

// ═══════════════════════════════════════════════════════════════
// ORDERS: MANAGEMENT
// ═══════════════════════════════════════════════════════════════
router.get('/orders', adminController.getAllOrders);
router.get('/orders/:id', adminController.getOrderDetail);
router.patch('/orders/:id/status', adminController.updateOrderStatus);
router.get('/orders-stats', adminController.getOrdersStats);

// ═══════════════════════════════════════════════════════════════
// PRODUCTS: CRUD & MANAGEMENT
// ═══════════════════════════════════════════════════════════════
router.post('/products', adminController.createProduct);
router.get('/products', adminController.getProducts);
router.get('/products/:id', adminController.getProductDetail);
router.patch('/products/:id', adminController.updateProduct);
router.delete('/products/:id', adminController.deleteProduct);

// ═══════════════════════════════════════════════════════════════
// ANALYTICS: INSIGHTS & METRICS
// ═══════════════════════════════════════════════════════════════
router.get('/analytics/daily-sales', adminController.getDailySalesAnalytics);
router.get('/analytics/profit', adminController.getProfitAnalytics);
router.get('/analytics/revenue', adminController.getRevenueAnalytics);
router.get('/analytics/products', adminController.getProductAnalytics);

// ═══════════════════════════════════════════════════════════════
// PAYMENTS & REFUNDS
// ═══════════════════════════════════════════════════════════════
router.get('/payments/status', adminController.getPaymentStatus);
router.get('/refunds', adminController.getRefunds);
router.post('/refunds/:id', adminController.initiateRefund);

// ═══════════════════════════════════════════════════════════════
// USERS: MANAGEMENT
// ═══════════════════════════════════════════════════════════════
router.get('/users', adminController.getUsers);
router.get('/users/:id', adminController.getUserDetail);
router.patch('/users/:id/status', adminController.updateUserStatus);

module.exports = router;

