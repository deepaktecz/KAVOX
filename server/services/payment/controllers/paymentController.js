'use strict';

const Order = require('../../order/models/Order');
const { logger } = require('../../auth/utils/logger');
const { deductStock } = require('../../order/controllers/orderController');
const { _submitToQikinkInternal } = require('../../qikink/controllers/qikinkController');
const paymentService = require('../payment.service');

// ═══════════════════════════════════════════════════════════════
// RESPONSE HELPERS
// ═══════════════════════════════════════════════════════════════
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({ success: true, message: msg, ...data, timestamp: new Date().toISOString() });

const fail = (res, msg, code = 400, details = null) =>
  res.status(code).json({
    success: false,
    message: msg,
    ...(details && { details }),
    timestamp: new Date().toISOString(),
  });


// ═══════════════════════════════════════════════════════════════
// 1️⃣ CREATE RAZORPAY ORDER
// ═══════════════════════════════════════════════════════════════
const createRazorpayOrder = catchAsync(async (req, res) => {
  try {
    const { orderId } = req.body;

    // Input validation
    if (!orderId) {
      return fail(res, 'Order ID is required', 400);
    }

    // Authorization check: verify user owns this order
    const order = await Order.findOne({ _id: orderId, user: req.user._id });
    if (!order) {
      return fail(res, 'Order not found or unauthorized', 404);
    }

    if (order.paymentStatus !== 'pending') {
      return fail(res, `Cannot pay for order in ${order.paymentStatus} status`, 400);
    }

    // Create Razorpay order using service
    const razorpayOrder = await paymentService.createRazorpayOrder(order);

    // Update order with Razorpay order ID
    order.razorpayOrderId = razorpayOrder.razorpayOrderId;
    await order.save({ validateBeforeSave: false });

    logger.info(`Razorpay order created for KAVOX order: ${order.orderNumber}`);

    return ok(
      res,
      {
        data: {
          razorpayOrderId: razorpayOrder.razorpayOrderId,
          amount: razorpayOrder.amount,
          currency: razorpayOrder.currency,
          keyId: process.env.RAZORPAY_KEY_ID,
          orderNumber: order.orderNumber,
          prefill: {
            name: req.user.firstName && req.user.lastName ? `${req.user.firstName} ${req.user.lastName}` : req.user.email,
            email: req.user.email,
            contact: req.user.phone || '',
          },
        },
      },
      'Razorpay order created successfully',
      200
    );
  } catch (err) {
    logger.error(`Create Razorpay order error: ${err.message}`);
    return fail(res, err.message || 'Failed to create payment order', 500);
  }
});



// ═══════════════════════════════════════════════════════════════
// 2️⃣ VERIFY PAYMENT & CONFIRM ORDER (Client-initiated verification)
// ═══════════════════════════════════════════════════════════════
/**
 * Endpoint: POST /payment/verify
 * Called AFTER user completes payment on Razorpay checkout form
 * Verifies signature and marks order as paid
 */
const verifyPayment = catchAsync(async (req, res) => {
  try {
    // Validate input
    const verificationData = paymentService.validatePaymentRequest(req.body);
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = verificationData;

    // Verify & confirm payment using service
    const order = await paymentService.verifyAndConfirmPayment(verificationData, orderId, req.user._id);

    // Deduct stock after payment confirmation
    await deductStock(order.items);

    // Send to Qikink if POD order
    const hasPODItems = order.items.some((item) => item.isPOD);
    if (hasPODItems) {
      const podItems = order.items.filter((item) => item.isPOD);
      _submitToQikinkInternal(order, podItems).catch((err) => {
        logger.error(`Qikink submission failed: ${err.message}`);
      });
    }

    // Emit socket events
    const io = req.app?.get('io');
    if (io) {
      // Notify user
      io.to(`user:${req.user._id}`).emit('payment_confirmed', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        profit: order.totalProfit,
      });

      // Notify admin
      io.to('admin').emit('new_paid_order', {
        orderId: order._id,
        orderNumber: order.orderNumber,
        amount: order.totalAmount,
        basePrice: order.totalBasePrice,
        profit: order.totalProfit,
        profitMargin: ((order.totalProfit / order.totalAmount) * 100).toFixed(2) + '%',
      });

      // Notify sellers
      const sellerIds = [...new Set(order.items.map((item) => item.seller.toString()))];
      sellerIds.forEach((sellerId) => {
        io.to(`seller:${sellerId}`).emit('payment_confirmed_for_seller', {
          orderId: order._id,
          orderNumber: order.orderNumber,
          amount: order.totalAmount,
        });
      });
    }

    logger.info(`Payment verified and confirmed: ${order.orderNumber} | Amount: ₹${order.totalAmount}`);

    return ok(res, { data: { order } }, 'Payment verified successfully! Order confirmed.', 200);
  } catch (err) {
    if (err.statusCode === 400) {
      return fail(res, err.message, 400, err.details);
    }
    logger.error(`Payment verification error: ${err.message}`);
    return fail(res, err.message || 'Payment verification failed', 400);
  }
});



// ═══════════════════════════════════════════════════════════════
// 3️⃣ RAZORPAY WEBHOOK (server-to-server, no auth required)
// ═══════════════════════════════════════════════════════════════
/**
 * Webhook endpoint: POST /payment/webhook
 * Razorpay sends payment events here
 * SECURITY: Verify signature before processing
 */
const handleWebhook = catchAsync(async (req, res) => {
  try {
    const signature = req.headers['x-razorpay-signature'];
    const rawBody = req.body;

    // Verify webhook signature
    const isValid = paymentService.verifyWebhookSignature(
      typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody),
      signature
    );

    if (!isValid && process.env.RAZORPAY_WEBHOOK_SECRET) {
      logger.warn('[SECURITY] Invalid webhook signature - rejecting');
      return res.status(401).json({ error: 'Invalid signature' });
    }

    const { event, payload } = typeof rawBody === 'string' ? JSON.parse(rawBody) : rawBody;

    logger.info(`[WEBHOOK] Razorpay event received: ${event}`);

    // Handle payment.captured (most common)
    if (event === 'payment.captured') {
      const notes = payload.payment?.entity?.notes;
      if (notes?.kavoxOrderId) {
        const order = await Order.findById(notes.kavoxOrderId);
        if (order && order.paymentStatus !== 'paid') {
          order.paymentStatus = 'paid';
          order.razorpayPaymentId = payload.payment.entity.id;
          order.paidAt = new Date();
          order.status = 'confirmed';
          order.trackingEvents.push({
            status: 'confirmed',
            message: 'Payment captured via webhook. Order confirmed.',
            timestamp: new Date(),
            updatedBy: 'system',
          });
          await order.save();

          // Deduct stock
          await deductStock(order.items);

          logger.info(`[WEBHOOK] Order confirmed via payment.captured: ${order.orderNumber}`);

          // Notify via socket
          const io = req.app?.get('io');
          if (io) {
            io.to('admin').emit('new_paid_order', {
              orderId: order._id,
              orderNumber: order.orderNumber,
              amount: order.totalAmount,
              profit: order.totalProfit,
            });
          }
        }
      }
    }

    // Handle payment.failed
    if (event === 'payment.failed') {
      const notes = payload.payment?.entity?.notes;
      if (notes?.kavoxOrderId) {
        const order = await Order.findByIdAndUpdate(notices?.kavoxOrderId, { paymentStatus: 'failed' });
        logger.info(`[WEBHOOK] Payment failed for order: ${order?.orderNumber}`);
      }
    }

    // Handle refund.created
    if (event === 'refund.created') {
      const paymentId = payload.refund?.entity?.payment_id;
      const order = await Order.findOne({ razorpayPaymentId: paymentId });
      if (order) {
        const refundAmount = (payload.refund?.entity?.amount || 0) / 100;
        order.paymentStatus = order.paymentStatus === 'paid' || refundAmount < order.totalAmount ? 'partially_refunded' : 'refunded';
        order.refundAmount = (order.refundAmount || 0) + refundAmount;
        order.refundedAt = new Date();
        order.trackingEvents.push({
          status: 'refunded',
          message: `Refund of ₹${refundAmount} processed.`,
          timestamp: new Date(),
          updatedBy: 'system',
        });
        await order.save();
        logger.info(`[WEBHOOK] Refund processed for order: ${order.orderNumber} | Amount: ₹${refundAmount}`);
      }
    }

    // Handle refund.failed
    if (event === 'refund.failed') {
      const paymentId = payload.refund?.entity?.payment_id;
      const order = await Order.findOne({ razorpayPaymentId: paymentId });
      logger.warn(`[WEBHOOK] Refund failed for order: ${order?.orderNumber}`);
    }

    res.json({ received: true });
  } catch (err) {
    logger.error(`[WEBHOOK] Error processing webhook: ${err.message}`);
    // Always return 200 to prevent Razorpay retries
    res.status(200).json({ received: true, error: err.message });
  }
});



// ═══════════════════════════════════════════════════════════════
// 4️⃣ INITIATE REFUND (Admin only)
// ═══════════════════════════════════════════════════════════════
const initiateRefund = catchAsync(async (req, res) => {
  try {
    const { orderId, amount, reason = 'Customer request' } = req.body;

    if (!orderId) {
      return fail(res, 'Order ID is required', 400);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return fail(res, 'Order not found', 404);
    }

    // Initiate refund using service
    const refundData = await paymentService.initiateRefund(order, amount, reason);

    // Update order status
    order.paymentStatus = amount && amount < order.totalAmount ? 'partially_refunded' : 'refunded';
    order.refundAmount = (order.refundAmount || 0) + (amount || order.totalAmount);
    order.refundedAt = new Date();
    order.trackingEvents.push({
      status: 'refunded',
      message: `Refund of ₹${amount || order.totalAmount} initiated. Reason: ${reason}`,
      timestamp: new Date(),
      updatedBy: 'admin',
    });
    await order.save();

    logger.info(`Refund initiated: ${order.orderNumber} | Amount: ₹${amount || order.totalAmount}`);

    return ok(
      res,
      { data: { refund: refundData, order } },
      'Refund initiated successfully',
      200
    );
  } catch (err) {
    logger.error(`Refund initiation error: ${err.message}`);
    return fail(res, err.message || 'Failed to initiate refund', 400);
  }
});

// ═══════════════════════════════════════════════════════════════
// 5️⃣ GET PAYMENT STATUS
// ═══════════════════════════════════════════════════════════════
const getPaymentStatus = catchAsync(async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return fail(res, 'Order ID is required', 400);
    }

    const order = await Order.findOne({
      _id: orderId,
      user: req.user._id,
    }).select(
      'orderNumber paymentStatus paymentMethod totalAmount paidAt razorpayPaymentId razorpayOrderId totalBasePrice totalProfit refundAmount refundedAt'
    );

    if (!order) {
      return fail(res, 'Order not found', 404);
    }

    // Calculate profit margin
    const profitMargin = order.totalAmount > 0 ? ((order.totalProfit / order.totalAmount) * 100).toFixed(2) : 0;

    return ok(
      res,
      {
        data: {
          payment: {
            ...order.toObject(),
            profitMargin: `${profitMargin}%`,
          },
        },
      },
      'Payment status retrieved successfully',
      200
    );
  } catch (err) {
    logger.error(`Get payment status error: ${err.message}`);
    return fail(res, 'Failed to retrieve payment status', 500);
  }
});

// ═══════════════════════════════════════════════════════════════
// 6️⃣ GET PROFIT ANALYSIS (Admin endpoint)
// ═══════════════════════════════════════════════════════════════
const getProfitAnalysis = catchAsync(async (req, res) => {
  try {
    const { orderId } = req.params;

    if (!orderId) {
      return fail(res, 'Order ID is required', 400);
    }

    const order = await Order.findById(orderId);
    if (!order) {
      return fail(res, 'Order not found', 404);
    }

    // Calculate profit using service
    const profitData = paymentService.calculateProfitBreakdown(order.items);

    return ok(
      res,
      {
        data: {
          orderNumber: order.orderNumber,
          totalAmount: order.totalAmount,
          totalBasePrice: profitData.totalBasePrice,
          totalProfit: profitData.totalProfit,
          profitMargin: profitData.profitMargin,
          itemProfits: profitData.itemProfits,
        },
      },
      'Profit analysis retrieved successfully',
      200
    );
  } catch (err) {
    logger.error(`Get profit analysis error: ${err.message}`);
    return fail(res, err.message || 'Failed to calculate profit', 400);
  }
});

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  handleWebhook,
  initiateRefund,
  getPaymentStatus,
  getProfitAnalysis,
};
