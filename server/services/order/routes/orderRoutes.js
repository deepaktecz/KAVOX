'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/orderController');
const { protect, restrictTo } = require('../../auth/middleware/authMiddleware');

// Public order tracking
router.get('/track', ctrl.trackOrder);

// Protected
router.use(protect);

// User routes
router.post('/', ctrl.placeOrder);
router.get('/my-orders', ctrl.getMyOrders);
router.get('/my-orders/:id', ctrl.getOrder);
router.post('/my-orders/:id/cancel', ctrl.cancelOrder);
router.post('/my-orders/:id/return', ctrl.requestReturn);

// Seller routes
router.get('/seller/orders', restrictTo('seller', 'admin'), ctrl.getSellerOrders);

// Admin routes
router.get('/admin/all', restrictTo('admin', 'super_admin'), ctrl.adminGetOrders);
router.get('/admin/analytics', restrictTo('admin', 'super_admin'), ctrl.getAnalytics);
router.patch('/admin/:id/status', restrictTo('admin', 'super_admin'), ctrl.updateOrderStatus);
router.get('/admin/:id', restrictTo('admin', 'super_admin'), ctrl.getOrder);

module.exports = router;
