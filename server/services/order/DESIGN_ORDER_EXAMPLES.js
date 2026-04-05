'use strict';

/**
 * EXAMPLE: CREATE ORDER WITH CUSTOM DESIGN
 * ──────────────────────────────────────────
 * Complete flow showing how to integrate custom design builder
 * into your existing order creation endpoint
 * 
 * This is reference code - adapt to your exact order service implementation
 */

const Order = require('../order/models/Order');
const designOrderIntegration = require('../order/design-order.integration');
const { logger } = require('../auth/utils/logger');

/**
 * POST /api/v1/orders/create-with-design
 * 
 * Body:
 * {
 *   "items": [...order items...],
 *   "shippingAddress": {...},
 *   "paymentMethod": "razorpay",
 *   "designId": "design_id",  // OPTIONAL - custom design
 *   "couponCode": "SAVE10"
 * }
 * 
 * Response:
 * {
 *   "success": true,
 *   "message": "Order created with custom design",
 *   "data": {
 *     "order": {
 *       "_id": "order_id",
 *       "orderNumber": "KVX260405XXXXX",
 *       "customDesign": {
 *         "designId": "design_id",
 *         "qikinkDesignId": "qikink_design_123",
 *         "imageUrl": "https://...",
 *         "printArea": "front",
 *         "selectedSize": "M",
 *         "selectedColor": { "name": "Black" }
 *       },
 *       "status": "pending_payment",
 *       "paymentStatus": "pending"
 *     }
 *   }
 * }
 */

const createOrderWithDesign = async (req, res, next) => {
  try {
    const { items, shippingAddress, paymentMethod = 'razorpay', designId, couponCode } = req.body;
    const userId = req.user._id;

    // ────────────────────────────────────────────────────────────
    // 1. VALIDATE DESIGN (if provided)
    // ────────────────────────────────────────────────────────────
    let designData = null;

    if (designId) {
      const designValidation = await designOrderIntegration.validateDesignForOrder(
        designId,
        userId
      );

      if (!designValidation.valid) {
        return res.status(400).json({
          success: false,
          message: designValidation.error,
        });
      }

      designData = designValidation.design;
      logger.info(`Design ${designId} validated for order creation`);
    }

    // ────────────────────────────────────────────────────────────
    // 2. CALCULATE ORDER TOTALS
    // ────────────────────────────────────────────────────────────
    let subtotal = 0;
    let totalBasePrice = 0;
    let gstTotal = 0;

    const processedItems = items.map((item) => {
      const basePrice = item.basePrice;
      const effectivePrice = item.discountedPrice || item.sellingPrice;
      const gstPercent = item.gstPercent || 12;
      const gstAmount = (effectivePrice * gstPercent) / 100;

      const totalItemPrice = effectivePrice * item.quantity;
      const profit = (effectivePrice - basePrice) * item.quantity;

      subtotal += totalItemPrice;
      totalBasePrice += basePrice * item.quantity;
      gstTotal += gstAmount * item.quantity;

      return {
        ...item,
        effectivePrice,
        gstPercent,
        gstAmount,
        totalItemPrice,
        profit,
        // Enrich with design if applicable
        ...(designData && {
          customDesign: {
            designImageUrl: designData.designImageUrl,
            printArea: designData.printArea,
            selectedSize: designData.selectedSize,
          },
        }),
      };
    });

    const shippingCharge = 99; // Example: flat shipping
    const discountAmount = 0; // Handle coupon logic separately
    const totalAmount = subtotal + shippingCharge + gstTotal - discountAmount;
    const totalProfit = totalAmount - totalBasePrice;

    // ────────────────────────────────────────────────────────────
    // 3. CREATE ORDER DOCUMENT
    // ────────────────────────────────────────────────────────────
    const orderData = {
      user: userId,
      items: processedItems,
      shippingAddress,
      paymentMethod,
      paymentStatus: 'pending',
      status: 'pending_payment',
      subtotal,
      shippingCharge,
      gstTotal,
      discountAmount,
      couponCode,
      couponDiscount: discountAmount,
      totalAmount,
      totalBasePrice,
      totalProfit,
    };

    const order = await Order.create(orderData);

    logger.info(`Order created: ${order.orderNumber} by user ${userId}`);

    // ────────────────────────────────────────────────────────────
    // 4. LINK DESIGN TO ORDER (if provided)
    // ────────────────────────────────────────────────────────────
    if (designId && designData) {
      try {
        const updatedOrder = await designOrderIntegration.addDesignToOrder(
          order._id,
          designId,
          userId
        );

        logger.info(`Design ${designId} linked to order ${order.orderNumber}`);

        return res.status(201).json({
          success: true,
          message: 'Order created with custom design',
          data: { order: updatedOrder },
        });
      } catch (designErr) {
        logger.error(`Failed to link design: ${designErr.message}`);
        // Continue without design rather than failing entire order
        return res.status(201).json({
          success: true,
          message: 'Order created (design linking failed, but order succeeded)',
          data: { order },
          warning: `Could not link design: ${designErr.message}`,
        });
      }
    }

    // ────────────────────────────────────────────────────────────
    // 5. RETURN ORDER WITHOUT DESIGN
    // ────────────────────────────────────────────────────────────
    return res.status(201).json({
      success: true,
      message: 'Order created successfully',
      data: { order },
    });
  } catch (err) {
    logger.error(`Create order error: ${err.message}`);
    next(err);
  }
};

/**
 * POST /api/v1/orders/:orderId/send-to-qikink
 * 
 * Submits order to Qikink with custom design (if applicable)
 * 
 * This should be called after payment confirmation
 */

const sendOrderToQikink = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const axios = require('axios');

    const QIKINK_BASE = process.env.QIKINK_BASE_URL || 'https://api.qikink.com';
    const QIKINK_KEY = process.env.QIKINK_API_KEY;

    if (!QIKINK_KEY) {
      return res.status(500).json({
        success: false,
        message: 'Qikink API not configured',
      });
    }

    // ────────────────────────────────────────────────────────────
    // Get order with design
    // ────────────────────────────────────────────────────────────
    const order = await Order.findById(orderId)
      .populate('user')
      .populate('items.product');

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // ────────────────────────────────────────────────────────────
    // Build Qikink payload
    // ────────────────────────────────────────────────────────────
    const qikinkItems = order.items.map((item) => ({
      product_id: item.product.qikinkProductId,
      quantity: item.quantity,
      sku: item.variant?.sku || '',
      // Add design data if present
      ...(order.customDesign && {
        design_id: order.customDesign.qikinkDesignId,
        print_area: order.customDesign.printArea,
        color: order.customDesign.selectedColor?.name || 'White',
        size: order.customDesign.selectedSize || 'M',
      }),
    }));

    const qikinkPayload = {
      order_id: order.orderNumber,
      customer_name: order.shippingAddress.fullName,
      customer_email: order.user.email,
      customer_phone: order.shippingAddress.phone,
      items: qikinkItems,
      shipping_address: {
        address: order.shippingAddress.addressLine1,
        city: order.shippingAddress.city,
        state: order.shippingAddress.state,
        zip: order.shippingAddress.pincode,
        country: 'IN',
      },
      amount: order.totalAmount,
    };

    // ────────────────────────────────────────────────────────────
    // Send to Qikink API
    // ────────────────────────────────────────────────────────────
    const qikinkResponse = await axios.post(`${QIKINK_BASE}/v2/orders`, qikinkPayload, {
      headers: {
        Authorization: `Bearer ${QIKINK_KEY}`,
        'Content-Type': 'application/json',
      },
      timeout: 30000,
    });

    // ────────────────────────────────────────────────────────────
    // Update order with Qikink response
    // ────────────────────────────────────────────────────────────
    order.qikinkOrderId = qikinkResponse.data.order_id || qikinkResponse.data.id;
    order.status = 'confirmed';
    order.qikinkRawResponse = qikinkResponse.data;

    // Update item statuses
    if (qikinkResponse.data.items) {
      order.items.forEach((item, idx) => {
        if (qikinkResponse.data.items[idx]) {
          item.qikinkOrderItemId = qikinkResponse.data.items[idx].item_id;
          item.qikinkStatus = 'pending';
        }
      });
    }

    await order.save();

    logger.info(`Order ${order.orderNumber} sent to Qikink: ${order.qikinkOrderId}`);

    return res.status(200).json({
      success: true,
      message: 'Order sent to Qikink successfully',
      data: {
        order,
        qikinkOrderId: order.qikinkOrderId,
      },
    });
  } catch (err) {
    logger.error(`Send to Qikink error: ${err.message}`);
    res.status(500).json({
      success: false,
      message: `Failed to send order to Qikink: ${err.message}`,
    });
  }
};

/**
 * POST /api/v1/orders/:orderId/cancel
 * 
 * Cancel order and revert design status
 */

const cancelOrder = async (req, res, next) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    const order = await Order.findById(orderId);

    if (!order) {
      return res.status(404).json({
        success: false,
        message: 'Order not found',
      });
    }

    // ────────────────────────────────────────────────────────────
    // Revert design status if order had custom design
    // ────────────────────────────────────────────────────────────
    if (order.customDesign && order.customDesign.designId) {
      await designOrderIntegration.cancelDesignFromOrder(orderId);
      logger.info(`Design reverted from cancelled order ${orderId}`);
    }

    // Cancel order
    order.status = 'cancelled';
    order.cancelledAt = new Date();
    order.cancellationReason = reason;
    await order.save();

    logger.info(`Order ${orderId} cancelled by user`);

    return res.status(200).json({
      success: true,
      message: 'Order cancelled successfully',
      data: { order },
    });
  } catch (err) {
    logger.error(`Cancel order error: ${err.message}`);
    next(err);
  }
};

module.exports = {
  createOrderWithDesign,
  sendOrderToQikink,
  cancelOrder,
};

/**
 * USAGE IN EXPRESS ROUTER:
 * 
 * const router = require('express').Router();
 * const { protect } = require('../auth/middleware/authMiddleware');
 * const orderController = require('./orderController');
 * 
 * // Create order with optional design
 * router.post(
 *   '/create-with-design',
 *   protect,
 *   orderController.createOrderWithDesign
 * );
 * 
 * // Send to Qikink after payment
 * router.post(
 *   '/:orderId/send-to-qikink',
 *   protect,
 *   orderController.sendOrderToQikink
 * );
 * 
 * // Cancel order (reverts design)
 * router.post(
 *   '/:orderId/cancel',
 *   protect,
 *   orderController.cancelOrder
 * );
 */
