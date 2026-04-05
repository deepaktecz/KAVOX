'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const { protect, restrictTo } = require('../../auth/middleware/authMiddleware');

// ═══════════════════════════════════════════════════════════════
// PUBLIC ROUTES (no auth required)
// ═══════════════════════════════════════════════════════════════
// Webhook - verified by Razorpay signature
router.post('/webhook', express.raw({ type: 'application/json' }), ctrl.handleWebhook);

// ═══════════════════════════════════════════════════════════════
// PROTECTED ROUTES (authentication required)
// ═══════════════════════════════════════════════════════════════
router.use(protect);

// User routes
router.post('/create-order', ctrl.createRazorpayOrder);
router.post('/verify', ctrl.verifyPayment);
router.get('/status/:orderId', ctrl.getPaymentStatus);

// ═══════════════════════════════════════════════════════════════
// ADMIN ROUTES (admin/super_admin only)
// ═══════════════════════════════════════════════════════════════
router.post('/refund', restrictTo('admin', 'super_admin'), ctrl.initiateRefund);
router.get('/profit/:orderId', restrictTo('admin', 'super_admin'), ctrl.getProfitAnalysis);

module.exports = router;
