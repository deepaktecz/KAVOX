'use strict';

const express = require('express');
const router = express.Router();
const ctrl = require('../controllers/paymentController');
const { protect, restrictTo } = require('../../auth/middleware/authMiddleware');

// Webhook - no auth (verified by Razorpay signature)
router.post('/webhook', express.raw({ type: 'application/json' }), ctrl.handleWebhook);

// Protected
router.use(protect);

router.post('/create-order', ctrl.createRazorpayOrder);
router.post('/verify', ctrl.verifyPayment);
router.get('/status/:orderId', ctrl.getPaymentStatus);

// Admin
router.post('/refund', restrictTo('admin', 'super_admin'), ctrl.initiateRefund);

module.exports = router;
