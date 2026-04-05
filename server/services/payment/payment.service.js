'use strict';

const crypto = require('crypto');
const Razorpay = require('razorpay');
const Order = require('../order/models/Order');
const { logger } = require('../auth/utils/logger');

// ═══════════════════════════════════════════════════════════════
// PAYMENT SERVICE - Secure Razorpay Integration
// ═══════════════════════════════════════════════════════════════
// This service handles all payment verification and processing logic
// to ensure PCI compliance and prevent payment fraud.
// ═══════════════════════════════════════════════════════════════

/**
 * Initialize Razorpay instance with admin credentials
 * All customer payments go to admin's Razorpay account
 */
class PaymentService {
  constructor() {
    if (!process.env.RAZORPAY_KEY_ID || !process.env.RAZORPAY_KEY_SECRET) {
      throw new Error('Razorpay credentials not configured in environment');
    }

    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });

    this.webhookSecret = process.env.RAZORPAY_WEBHOOK_SECRET;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔐 SECURE SIGNATURE VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  /**
   * Verify Razorpay payment signature using HMAC SHA256
   * This is the most critical security function - prevents fake payments
   *
   * @param {string} razorpayOrderId - Order ID from Razorpay
   * @param {string} razorpayPaymentId - Payment ID from Razorpay
   * @param {string} razorpaySignature - Signature from client
   * @returns {boolean} - True if signature is valid
   * @throws {Error} - If signature verification fails
   */
  verifyPaymentSignature(razorpayOrderId, razorpayPaymentId, razorpaySignature) {
    try {
      // Validate inputs
      if (!razorpayOrderId || typeof razorpayOrderId !== 'string') {
        throw new Error('Invalid razorpay_order_id: must be a non-empty string');
      }
      if (!razorpayPaymentId || typeof razorpayPaymentId !== 'string') {
        throw new Error('Invalid razorpay_payment_id: must be a non-empty string');
      }
      if (!razorpaySignature || typeof razorpaySignature !== 'string') {
        throw new Error('Invalid razorpay_signature: must be a non-empty string');
      }

      // Signature should be 64 hex characters (SHA256)
      if (!/^[a-f0-9]{64}$/i.test(razorpaySignature)) {
        throw new Error('Invalid razorpay_signature format: not a valid SHA256 hash');
      }

      // Create the body string in exact same format as Razorpay
      const body = `${razorpayOrderId}|${razorpayPaymentId}`;

      // Generate expected signature using our secret key
      const expectedSignature = crypto
        .createHmac('sha256', process.env.RAZORPAY_KEY_SECRET)
        .update(body)
        .digest('hex');

      // CRITICAL: Use constant-time comparison to prevent timing attacks
      const isValid = this.constantTimeCompare(expectedSignature, razorpaySignature);

      if (!isValid) {
        logger.warn(
          `[SECURITY] Payment signature mismatch | OrderId: ${razorpayOrderId} | PaymentId: ${razorpayPaymentId}`
        );
        return false;
      }

      logger.info(`[PAYMENT] Signature verified successfully | PaymentId: ${razorpayPaymentId}`);
      return true;
    } catch (err) {
      logger.error(`[PAYMENT] Signature verification error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Timing-safe string comparison to prevent timing attacks
   * @private
   */
  constantTimeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') {
      return false;
    }

    if (a.length !== b.length) {
      return false;
    }

    let result = 0;
    for (let i = 0; i < a.length; i++) {
      result |= a.charCodeAt(i) ^ b.charCodeAt(i);
    }

    return result === 0;
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔐 WEBHOOK SIGNATURE VERIFICATION
  // ═══════════════════════════════════════════════════════════════
  /**
   * Verify Razorpay webhook signature
   * Ensures webhook events are actually from Razorpay
   *
   * @param {string} body - Raw request body as string
   * @param {string} signature - X-Razorpay-Signature header
   * @returns {boolean} - True if webhook is authentic
   */
  verifyWebhookSignature(body, signature) {
    try {
      if (!this.webhookSecret) {
        logger.warn('[WEBHOOK] Webhook secret not configured - skipping verification');
        return false;
      }

      if (!body || typeof body !== 'string') {
        throw new Error('Invalid webhook body');
      }

      if (!signature || typeof signature !== 'string') {
        throw new Error('Invalid webhook signature header');
      }

      const expectedSignature = crypto
        .createHmac('sha256', this.webhookSecret)
        .update(body)
        .digest('hex');

      const isValid = this.constantTimeCompare(expectedSignature, signature);

      if (!isValid) {
        logger.warn('[SECURITY] Webhook signature mismatch - possible forgery attempt');
        return false;
      }

      logger.info('[WEBHOOK] Signature verified successfully');
      return true;
    } catch (err) {
      logger.error(`[WEBHOOK] Signature verification error: ${err.message}`);
      return false;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 💳 CREATE RAZORPAY ORDER
  // ═══════════════════════════════════════════════════════════════
  /**
   * Create a Razorpay order for a given KAVOX order
   * The actual payment goes to admin's Razorpay account
   *
   * @param {object} order - KAVOX Order object from DB
   * @returns {object} - Razorpay order details
   */
  async createRazorpayOrder(order) {
    try {
      if (!order._id || !order.totalAmount) {
        throw new Error('Invalid order: missing _id or totalAmount');
      }

      if (order.paymentStatus !== 'pending') {
        throw new Error(`Order cannot be paid: current status is ${order.paymentStatus}`);
      }

      // Validate amount (minimum ₹1, maximum ₹5,00,000)
      const amountInPaise = Math.round(order.totalAmount * 100);
      if (amountInPaise < 100 || amountInPaise > 50000000) {
        throw new Error(`Invalid amount: ₹${order.totalAmount}. Must be between ₹1 and ₹5,00,000`);
      }

      const razorpayOrder = await this.razorpay.orders.create({
        amount: amountInPaise,
        currency: 'INR',
        receipt: order.orderNumber,
        notes: {
          kavoxOrderId: order._id.toString(),
          kavoxOrderNumber: order.orderNumber,
          userId: order.user.toString(),
          totalAmount: order.totalAmount,
        },
      });

      if (!razorpayOrder.id) {
        throw new Error('Razorpay API did not return order ID');
      }

      logger.info(
        `[PAYMENT] Razorpay order created | RzpOrderId: ${razorpayOrder.id} | KAVOX: ${order.orderNumber} | Amount: ₹${order.totalAmount}`
      );

      return {
        razorpayOrderId: razorpayOrder.id,
        amount: razorpayOrder.amount,
        currency: razorpayOrder.currency,
        status: razorpayOrder.status,
      };
    } catch (err) {
      logger.error(`[PAYMENT] Failed to create Razorpay order: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // ✅ VERIFY & CONFIRM PAYMENT
  // ═══════════════════════════════════════════════════════════════
  /**
   * Verify payment signature and mark order as paid
   * Called after user completes payment on client
   *
   * @param {object} verificationData - Contains razorpay_order_id, razorpay_payment_id, razorpay_signature
   * @param {string} orderId - KAVOX order ID
   * @param {string} userId - User ID (for authorization)
   * @returns {object} - Verified order object
   */
  async verifyAndConfirmPayment(verificationData, orderId, userId) {
    try {
      const { razorpay_order_id, razorpay_payment_id, razorpay_signature } = verificationData;

      // Validate inputs
      if (!razorpay_order_id || !razorpay_payment_id || !razorpay_signature) {
        throw new Error('Missing payment verification data');
      }

      // ✅ Step 1: Verify signature (CRITICAL SECURITY CHECK)
      const isSignatureValid = this.verifyPaymentSignature(
        razorpay_order_id,
        razorpay_payment_id,
        razorpay_signature
      );

      if (!isSignatureValid) {
        logger.warn(`[SECURITY] Payment verification failed for order ${orderId}`);
        throw new Error('Payment verification failed: Invalid signature');
      }

      // ✅ Step 2: Find order and verify authorization
      const order = await Order.findOne({
        _id: orderId,
        user: userId,
        razorpayOrderId: razorpay_order_id,
      });

      if (!order) {
        logger.warn(`[SECURITY] Order not found or user mismatch | OrderId: ${orderId} | UserId: ${userId}`);
        throw new Error('Order not found or unauthorized');
      }

      // ✅ Step 3: Check if already paid (prevent duplicate payment processing)
      if (order.paymentStatus === 'paid') {
        logger.info(`[PAYMENT] Order already paid (idempotent request) | OrderId: ${orderId}`);
        return order;
      }

      if (order.paymentStatus !== 'pending') {
        throw new Error(`Order cannot be paid: current status is ${order.paymentStatus}`);
      }

      // ✅ Step 4: Check for duplicate payment_id (security check)
      const duplicatePayment = await Order.findOne({
        razorpayPaymentId: razorpay_payment_id,
        _id: { $ne: orderId },
      });

      if (duplicatePayment) {
        logger.warn(
          `[SECURITY] Duplicate payment attempt | PaymentId: ${razorpay_payment_id} | OrderIds: ${orderId}, ${duplicatePayment._id}`
        );
        throw new Error('Payment already used for another order');
      }

      // ✅ Step 5: Fetch payment details from Razorpay API for additional verification
      const paymentDetails = await this.getPaymentDetails(razorpay_payment_id);
      if (!paymentDetails) {
        throw new Error('Could not fetch payment details from Razorpay');
      }

      // Verify amount matches
      const expectedAmount = Math.round(order.totalAmount * 100);
      if (paymentDetails.amount !== expectedAmount) {
        logger.error(
          `[SECURITY] Payment amount mismatch | Expected: ${expectedAmount}, Got: ${paymentDetails.amount}`
        );
        throw new Error('Payment amount does not match order total');
      }

      // ✅ Step 6: Update order with payment details
      order.paymentStatus = 'paid';
      order.razorpayPaymentId = razorpay_payment_id;
      order.razorpaySignature = razorpay_signature;
      order.paidAt = new Date();
      order.status = 'confirmed';

      order.trackingEvents.push({
        status: 'confirmed',
        message: 'Payment received and verified. Order confirmed.',
        timestamp: new Date(),
        updatedBy: 'system',
      });

      await order.save();

      logger.info(
        `[PAYMENT] Payment verified and confirmed | OrderId: ${orderId} | Amount: ₹${order.totalAmount} | PaymentId: ${razorpay_payment_id}`
      );

      return order;
    } catch (err) {
      logger.error(`[PAYMENT] Payment verification failed: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🔍 FETCH PAYMENT DETAILS FROM RAZORPAY
  // ═══════════════════════════════════════════════════════════════
  /**
   * Fetch payment details from Razorpay API
   * Used for additional verification and reconciliation
   *
   * @param {string} paymentId - Razorpay payment ID
   * @returns {object} - Payment details
   */
  async getPaymentDetails(paymentId) {
    try {
      if (!paymentId) {
        throw new Error('Payment ID is required');
      }

      const payment = await this.razorpay.payments.fetch(paymentId);

      return {
        id: payment.id,
        amount: payment.amount,
        currency: payment.currency,
        status: payment.status,
        method: payment.method,
        captured: payment.captured,
        description: payment.description,
        email: payment.email,
        contact: payment.contact,
        fee: payment.fee,
        tax: payment.tax,
        notes: payment.notes,
      };
    } catch (err) {
      logger.error(`[PAYMENT] Failed to fetch payment details: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 💰 PROFIT CALCULATION
  // ═══════════════════════════════════════════════════════════════
  /**
   * Calculate profit for an order
   * Profit = (Selling Price - Base Cost) for each item
   *
   * @param {array} orderItems - Array of order items
   * @returns {object} - Profit breakdown
   */
  calculateProfitBreakdown(orderItems) {
    try {
      if (!Array.isArray(orderItems)) {
        throw new Error('Order items must be an array');
      }

      let totalProfit = 0;
      let totalBasePrice = 0;
      let totalSellingPrice = 0;
      const itemProfits = [];

      for (const item of orderItems) {
        if (!item.basePrice || !item.effectivePrice) {
          throw new Error(`Missing pricing data for item: ${item.name}`);
        }

        const itemProfit = (item.effectivePrice - item.basePrice) * item.quantity;
        const itemBaseCost = item.basePrice * item.quantity;
        const itemSellingValue = item.effectivePrice * item.quantity;

        totalProfit += itemProfit;
        totalBasePrice += itemBaseCost;
        totalSellingPrice += itemSellingValue;

        itemProfits.push({
          productId: item.product,
          productName: item.name,
          quantity: item.quantity,
          basePrice: item.basePrice,
          sellingPrice: item.effectivePrice,
          profit: itemProfit,
          profitMargin: ((itemProfit / itemSellingValue) * 100).toFixed(2) + '%',
        });
      }

      return {
        totalProfit: Math.round(totalProfit * 100) / 100,
        totalBasePrice: Math.round(totalBasePrice * 100) / 100,
        totalSellingPrice: Math.round(totalSellingPrice * 100) / 100,
        profitMargin: totalSellingPrice > 0 ? ((totalProfit / totalSellingPrice) * 100).toFixed(2) + '%' : '0%',
        itemProfits,
      };
    } catch (err) {
      logger.error(`[PROFIT] Profit calculation error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 💳 INITIATE REFUND
  // ═══════════════════════════════════════════════════════════════
  /**
   * Initiate refund for a paid order
   *
   * @param {object} order - Order object from DB
   * @param {number} amount - Optional: amount to refund (decimal)
   * @param {string} reason - Reason for refund
   * @returns {object} - Refund details
   */
  async initiateRefund(order, amount, reason = 'Customer request') {
    try {
      if (!order.razorpayPaymentId) {
        throw new Error('No payment found for this order');
      }

      if (order.paymentStatus !== 'paid') {
        throw new Error(`Order is not in paid status (current: ${order.paymentStatus})`);
      }

      // Validate refund amount
      const refundAmount = amount || order.totalAmount;
      if (refundAmount <= 0 || refundAmount > order.totalAmount) {
        throw new Error(`Invalid refund amount: ₹${refundAmount}`);
      }

      const refundAmountInPaise = Math.round(refundAmount * 100);

      const refund = await this.razorpay.payments.refund(order.razorpayPaymentId, {
        amount: refundAmountInPaise,
        speed: 'normal',
        notes: {
          reason,
          orderId: order._id.toString(),
          orderNumber: order.orderNumber,
          timestamp: new Date().toISOString(),
        },
      });

      if (!refund.id) {
        throw new Error('Razorpay API did not return refund ID');
      }

      logger.info(
        `[REFUND] Refund initiated | OrderId: ${order._id} | Amount: ₹${refundAmount} | RefundId: ${refund.id}`
      );

      return {
        refundId: refund.id,
        amount: refund.amount / 100,
        status: refund.status,
        createdAt: new Date(refund.created_at * 1000),
      };
    } catch (err) {
      logger.error(`[REFUND] Failed to initiate refund: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // 🎯 VALIDATE PAYMENT REQUEST
  // ═══════════════════════════════════════════════════════════════
  /**
   * Validate payment verification request body
   *
   * @param {object} body - Request body
   * @returns {object} - Validated data
   */
  validatePaymentRequest(body) {
    const { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId } = body;

    const errors = [];

    if (!razorpay_order_id || typeof razorpay_order_id !== 'string' || razorpay_order_id.trim() === '') {
      errors.push('razorpay_order_id: must be a non-empty string');
    }

    if (!razorpay_payment_id || typeof razorpay_payment_id !== 'string' || razorpay_payment_id.trim() === '') {
      errors.push('razorpay_payment_id: must be a non-empty string');
    }

    if (!razorpay_signature || typeof razorpay_signature !== 'string' || razorpay_signature.trim() === '') {
      errors.push('razorpay_signature: must be a non-empty string');
    }

    if (!orderId || typeof orderId !== 'string' || orderId.trim() === '') {
      errors.push('orderId: must be a non-empty string');
    }

    if (errors.length > 0) {
      const error = new Error(`Validation failed: ${errors.join('; ')}`);
      error.statusCode = 400;
      error.details = errors;
      throw error;
    }

    return { razorpay_order_id, razorpay_payment_id, razorpay_signature, orderId };
  }
}

module.exports = new PaymentService();
