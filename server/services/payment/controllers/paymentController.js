'use strict';

const Razorpay = require('razorpay');
const crypto = require('crypto');
const Order = require('../../order/models/Order');
const { logger } = require('../../auth/utils/logger');
const { deductStock } = require('../../order/controllers/orderController');
const { _submitToQikinkInternal } = require('../../qikink/controllers/qikinkController');

const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({ success: true, message: msg, ...data, timestamp: new Date().toISOString() });
const fail = (res, msg, code = 400) =>
  res.status(code).json({ success: false, message: msg, timestamp: new Date().toISOString() });

// Initialize Razorpay - all payments go to admin account
const razorpay = new Razorpay({
  key_id: process.env.RAZORPAY_KEY_ID,
  key_secret: process.env.RAZORPAY_KEY_SECRET,
});

// ═══════════════════════════════════════════════════════════════
// CREATE RAZORPAY ORDER
// ═══════════════════════════════════════════════════════════════
const createRazorpayOrder = catchAsync(async (req, res) => {
  const { orderId } = req.body;

  const order = await Order.findOne({ _id: orderId, user: req.user._id });
  if (!order) return fail(res, 'Order not found', 404);
  if (order.paymentStatus !== 'pending') return fail(res, 'Order already paid or payment not pending', 400);

  // Create Razorpay order - money goes to admin's Razorpay account
  const razorpayOrder = await razorpay.orders.create({
    amount: Math.round(order.totalAmount * 100), // in paise
    currency: 'INR',
    receipt: order.orderNumber,
    notes: {
      kavoxOrderId: order._id.toString(),
      kavoxOrderNumber: order.orderNumber,
      userId: req.user._id.toString(),
    },
  });

  // Save Razorpay order ID
  order.razorpayOrderId = razorpayOrder.id;
  await order.save({ validateBeforeSave: false });

  logger.info(`Razorpay order created: ${razorpayOrder.id} for KAVOX order ${order.orderNumber}`);

  return ok(res, {
    data: {
      razorpayOrderId: razorpayOrder.id,
      amount: razorpayOrder.amount,
      currency: razorpayOrder.currency,
      keyId: process.env.RAZORPAY_KEY_ID,
      orderNumber: order.orderNumber,
      prefill: {
        name: req.user.firstName + ' ' + req.user.lastName,
        email: req.user.email,
        contact: req.user.phone || '',
      },
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// VERIFY PAYMENT & CONFIRM ORDER
// ═══════════════════════════════════════════════════════════════
const verifyPayment = catchAsync(async (req, res) => {
  const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = req.body;

  if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature || !orderId) {
    return fail(res, 'Missing payment verification data', 400);
  }

  // Verify signature
  const body = `${razorpay_order_id}|${razorpay_payment_id}`;
  const expectedSignature = crypto
    .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
    .update(body)
    .digest('hex');

  if (expectedSignature !== razorpay_signature) {
    logger.warn(`Payment signature mismatch for order ${orderId}`);
    return fail(res, 'Payment verification failed. Invalid signature.', 400);
  }

  // Find and update order
  const order = await Order.findOne({ _id: orderId, user: req.user._id, razorpayOrderId: razorpay_order_id });
  if (!order) return fail(res, 'Order not found', 404);

  if (order.paymentStatus === 'paid') {
    return ok(res, { data: { order } }, 'Payment already confirmed');
  }

  // Mark as paid
  order.paymentStatus = 'paid';
  order.razorpayPaymentId = razorpay_payment_id;
  order.razorpaySignature = razorpay_signature;
  order.paidAt = new Date();
  order.status = 'confirmed';
  order.trackingEvents.push({
    status: 'confirmed',
    message: 'Payment received successfully. Order confirmed.',
    timestamp: new Date(),
    updatedBy: 'system',
  });

  await order.save();

  // Deduct stock after payment confirmation
  await deductStock(order.items);

  // Send to Qikink if POD order (using the dedicated Qikink service)
  const hasPODItems = order.items.some((item) => item.isPOD);
  if (hasPODItems) {
    const podItems = order.items.filter((item) => item.isPOD);
    _submitToQikinkInternal(order, podItems).catch((err) =>
      logger.error('Qikink submission failed:', err.message)
    );
  }

  // Emit socket event
  const io = req.app?.get('io');
  if (io) {
    io.to(`user:${req.user._id}`).emit('payment_confirmed', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
    });
    io.to('admin').emit('new_paid_order', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      amount: order.totalAmount,
      profit: order.totalProfit,
    });
  }

  logger.info(`Payment confirmed: ${order.orderNumber} | ₹${order.totalAmount} | Razorpay: ${razorpay_payment_id}`);

  return ok(res, { data: { order } }, 'Payment successful! Order confirmed.');
});

// ═══════════════════════════════════════════════════════════════
// RAZORPAY WEBHOOK (server-to-server, no auth required)
// ═══════════════════════════════════════════════════════════════
const handleWebhook = catchAsync(async (req, res) => {
  const webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  const signature = req.headers['x-razorpay-signature'];

  if (webhookSecret) {
    const expectedSig = crypto
      .createHmac('sha256', webhookSecret)
      .update(JSON.stringify(req.body))
      .digest('hex');

    if (expectedSig !== signature) {
      logger.warn('Invalid Razorpay webhook signature');
      return res.status(400).json({ error: 'Invalid signature' });
    }
  }

  const { event, payload } = req.body;
  logger.info(`Razorpay webhook: ${event}`);

  if (event === 'payment.captured') {
    const notes = payload.payment?.entity?.notes;
    if (notes?.kavoxOrderId) {
      const order = await Order.findById(notes.kavoxOrderId);
      if (order && order.paymentStatus !== 'paid') {
        order.paymentStatus = 'paid';
        order.razorpayPaymentId = payload.payment.entity.id;
        order.paidAt = new Date();
        order.status = 'confirmed';
        await order.save();
        await deductStock(order.items);
        logger.info(`Order confirmed via webhook: ${order.orderNumber}`);
      }
    }
  }

  if (event === 'payment.failed') {
    const notes = payload.payment?.entity?.notes;
    if (notes?.kavoxOrderId) {
      await Order.findByIdAndUpdate(notes.kavoxOrderId, { paymentStatus: 'failed' });
    }
  }

  if (event === 'refund.created') {
    const paymentId = payload.refund?.entity?.payment_id;
    const order = await Order.findOne({ razorpayPaymentId: paymentId });
    if (order) {
      order.paymentStatus = 'refunded';
      order.refundAmount = (payload.refund?.entity?.amount || 0) / 100;
      order.refundedAt = new Date();
      await order.save();
    }
  }

  res.json({ received: true });
});

// ═══════════════════════════════════════════════════════════════
// INITIATE REFUND
// ═══════════════════════════════════════════════════════════════
const initiateRefund = catchAsync(async (req, res) => {
  const { orderId, amount, reason } = req.body;

  const order = await Order.findById(orderId);
  if (!order) return fail(res, 'Order not found', 404);
  if (!order.razorpayPaymentId) return fail(res, 'No payment found for this order', 400);
  if (order.paymentStatus !== 'paid') return fail(res, 'Order is not in paid status', 400);

  const refundAmount = amount ? Math.round(amount * 100) : Math.round(order.totalAmount * 100);

  const refund = await razorpay.payments.refund(order.razorpayPaymentId, {
    amount: refundAmount,
    speed: 'normal',
    notes: {
      reason: reason || 'Customer request',
      orderId: order._id.toString(),
      orderNumber: order.orderNumber,
    },
  });

  order.paymentStatus = amount && amount < order.totalAmount ? 'partially_refunded' : 'refunded';
  order.refundAmount = (order.refundAmount || 0) + refundAmount / 100;
  order.refundedAt = new Date();
  await order.save();

  logger.info(`Refund initiated: ${order.orderNumber} | ₹${refundAmount / 100} | Razorpay refund: ${refund.id}`);

  return ok(res, { data: { refund, order } }, 'Refund initiated successfully');
});

// ═══════════════════════════════════════════════════════════════
// GET PAYMENT STATUS
// ═══════════════════════════════════════════════════════════════
const getPaymentStatus = catchAsync(async (req, res) => {
  const order = await Order.findOne({
    _id: req.params.orderId,
    user: req.user._id,
  }).select('orderNumber paymentStatus paymentMethod totalAmount paidAt razorpayPaymentId razorpayOrderId');

  if (!order) return fail(res, 'Order not found', 404);
  return ok(res, { data: { payment: order } });
});

module.exports = {
  createRazorpayOrder,
  verifyPayment,
  handleWebhook,
  initiateRefund,
  getPaymentStatus,
};
