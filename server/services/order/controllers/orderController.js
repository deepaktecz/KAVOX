'use strict';

const Order = require('../models/Order');
const Product = require('../../product/models/Product');
const { logger } = require('../../auth/utils/logger');

const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
const ok = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({ success: true, message: msg, ...data, timestamp: new Date().toISOString() });
const fail = (res, msg, code = 400) =>
  res.status(code).json({ success: false, message: msg, timestamp: new Date().toISOString() });

// ═══════════════════════════════════════════════════════════════
// PLACE ORDER (COD flow; payment route handles Razorpay)
// ═══════════════════════════════════════════════════════════════
const placeOrder = catchAsync(async (req, res) => {
  const { items, shippingAddress, paymentMethod = 'razorpay', couponCode, userNote } = req.body;

  if (!items || items.length === 0) return fail(res, 'Order must have at least one item');
  if (!shippingAddress) return fail(res, 'Shipping address is required');

  const orderItems = [];
  let subtotal = 0;
  let totalBasePrice = 0;

  // Validate and build order items
  for (const item of items) {
    const product = await Product.findOne({ _id: item.productId, status: 'active' });
    if (!product) return fail(res, `Product not found: ${item.productId}`, 404);

    // Check variant stock
    let selectedVariant = null;
    if (item.variantId) {
      selectedVariant = product.variants.id(item.variantId);
      if (!selectedVariant || !selectedVariant.isActive) return fail(res, `Variant not available for ${product.name}`, 400);
      if (selectedVariant.stock < item.quantity) return fail(res, `Insufficient stock for ${product.name} (${selectedVariant.size}/${selectedVariant.color.name})`, 400);
    } else {
      if (product.totalStock < item.quantity) return fail(res, `Insufficient stock for ${product.name}`, 400);
    }

    const effectivePrice = product.discountedPrice || product.sellingPrice;
    const variantAdditional = selectedVariant?.additionalPrice || 0;
    const finalPrice = effectivePrice + variantAdditional;
    const gstAmount = Math.round(finalPrice * (product.gstPercent / 100));
    const totalItemPrice = (finalPrice + gstAmount) * item.quantity;
    const itemBasePrice = product.basePrice;
    const itemProfit = (finalPrice - itemBasePrice) * item.quantity;

    orderItems.push({
      product: product._id,
      seller: product.seller,
      name: product.name,
      slug: product.slug,
      image: product.mainImage || product.images[0]?.url,
      variant: selectedVariant ? {
        variantId: selectedVariant._id,
        sku: selectedVariant.sku,
        color: selectedVariant.color,
        size: selectedVariant.size,
      } : null,
      quantity: item.quantity,
      basePrice: itemBasePrice,
      sellingPrice: product.sellingPrice,
      discountedPrice: product.discountedPrice,
      effectivePrice: finalPrice,
      gstPercent: product.gstPercent,
      gstAmount: gstAmount * item.quantity,
      totalItemPrice,
      profit: itemProfit,
      isPOD: product.isPOD,
    });

    subtotal += finalPrice * item.quantity;
    totalBasePrice += itemBasePrice * item.quantity;
  }

  // Shipping calculation
  const shippingCharge = subtotal >= 499 ? 0 : 49;
  const gstTotal = orderItems.reduce((s, i) => s + i.gstAmount, 0);
  const couponDiscount = 0; // TODO: coupon validation
  const totalAmount = subtotal + shippingCharge + gstTotal - couponDiscount;
  const totalProfit = totalAmount - totalBasePrice - shippingCharge - gstTotal;

  // Create order
  const order = await Order.create({
    user: req.user._id,
    items: orderItems,
    shippingAddress,
    paymentMethod,
    subtotal,
    shippingCharge,
    gstTotal,
    couponCode,
    couponDiscount,
    totalAmount,
    totalBasePrice,
    totalProfit,
    userNote,
    status: paymentMethod === 'cod' ? 'confirmed' : 'pending_payment',
    paymentStatus: paymentMethod === 'cod' ? 'pending' : 'pending',
    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
    trackingEvents: [{
      status: paymentMethod === 'cod' ? 'confirmed' : 'pending_payment',
      message: paymentMethod === 'cod' ? 'Order confirmed. Pay on delivery.' : 'Order placed. Awaiting payment.',
      timestamp: new Date(),
    }],
  });

  // Deduct stock (for COD; for online payment, deduct after payment confirmation)
  if (paymentMethod === 'cod') {
    await deductStock(order.items);
  }

  logger.info(`Order created: ${order.orderNumber} by user ${req.user._id}`);

  // Emit socket event for real-time tracking
  const io = req.app?.get('io');
  if (io) {
    io.to(`seller:${order.items.map(i => i.seller).join(',')}`).emit('new_order', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      totalAmount: order.totalAmount,
    });
  }

  return ok(res, { data: { order } }, 'Order placed successfully', 201);
});

// Helper: deduct stock after order confirmation
async function deductStock(items) {
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) continue;

    if (item.variant?.variantId) {
      const variant = product.variants.id(item.variant.variantId);
      if (variant) {
        variant.stock = Math.max(0, variant.stock - item.quantity);
      }
    }
    product.totalStock = Math.max(0, product.totalStock - item.quantity);
    product.salesCount += item.quantity;
    await product.save();
  }
}

// ═══════════════════════════════════════════════════════════════
// GET MY ORDERS (User)
// ═══════════════════════════════════════════════════════════════
const getMyOrders = catchAsync(async (req, res) => {
  const { page = 1, limit = 10, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select('-qikinkRawResponse -razorpaySignature -totalBasePrice -totalProfit')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('items.product', 'name slug images')
      .lean(),
    Order.countDocuments(filter),
  ]);

  return ok(res, {
    data: { orders },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════
// GET SINGLE ORDER
// ═══════════════════════════════════════════════════════════════
const getOrder = catchAsync(async (req, res) => {
  const query = { _id: req.params.id };

  // Non-admins can only see their own orders
  if (!['admin', 'super_admin'].includes(req.user.role)) {
    query.user = req.user._id;
  }

  const order = await Order.findOne(query)
    .populate('user', 'firstName lastName email phone')
    .populate('items.product', 'name slug images')
    .lean();

  if (!order) return fail(res, 'Order not found', 404);
  return ok(res, { data: { order } });
});

// ═══════════════════════════════════════════════════════════════
// CANCEL ORDER
// ═══════════════════════════════════════════════════════════════
const cancelOrder = catchAsync(async (req, res) => {
  const { reason } = req.body;

  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return fail(res, 'Order not found', 404);

  if (!order.canCancel) {
    return fail(res, `Cannot cancel order in "${order.status}" status. Orders can only be cancelled before shipping.`, 400);
  }

  order.status = 'cancelled';
  order.cancelledAt = new Date();
  order.cancellationReason = reason || 'Cancelled by customer';
  order.cancelledBy = 'user';

  // Restore stock
  await restoreStock(order.items);

  // Trigger refund if already paid
  if (order.paymentStatus === 'paid') {
    order.refundAmount = order.totalAmount;
    // Real app: trigger Razorpay refund here
    logger.info(`Refund needed for order ${order.orderNumber}: ₹${order.totalAmount}`);
  }

  await order.save();

  const io = req.app?.get('io');
  if (io) {
    io.to(`user:${req.user._id}`).emit('order_cancelled', { orderId: order._id, orderNumber: order.orderNumber });
  }

  return ok(res, { data: { order } }, 'Order cancelled successfully');
});

async function restoreStock(items) {
  for (const item of items) {
    const product = await Product.findById(item.product);
    if (!product) continue;
    if (item.variant?.variantId) {
      const variant = product.variants.id(item.variant.variantId);
      if (variant) variant.stock += item.quantity;
    }
    product.totalStock += item.quantity;
    product.salesCount = Math.max(0, product.salesCount - item.quantity);
    await product.save();
  }
}

// ═══════════════════════════════════════════════════════════════
// REQUEST RETURN
// ═══════════════════════════════════════════════════════════════
const requestReturn = catchAsync(async (req, res) => {
  const { reason } = req.body;

  const order = await Order.findOne({ _id: req.params.id, user: req.user._id });
  if (!order) return fail(res, 'Order not found', 404);

  if (!order.canReturn) {
    return fail(res, 'Return window has expired (7 days from delivery) or order not delivered yet', 400);
  }

  order.status = 'return_requested';
  order.returnRequestedAt = new Date();
  order.returnReason = reason;
  await order.save();

  return ok(res, { data: { order } }, 'Return request submitted');
});

// ═══════════════════════════════════════════════════════════════
// SELLER: GET MY ORDERS
// ═══════════════════════════════════════════════════════════════
const getSellerOrders = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { 'items.seller': req.user._id };
  if (status) filter.status = status;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .select('-qikinkRawResponse -razorpaySignature')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email phone')
      .lean(),
    Order.countDocuments(filter),
  ]);

  return ok(res, {
    data: { orders },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: GET ALL ORDERS
// ═══════════════════════════════════════════════════════════════
const adminGetOrders = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, paymentStatus, startDate, endDate, search } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) filter.createdAt.$lte = new Date(endDate);
  }
  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
    ];
  }

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email phone')
      .lean(),
    Order.countDocuments(filter),
  ]);

  return ok(res, {
    data: { orders },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: UPDATE ORDER STATUS
// ═══════════════════════════════════════════════════════════════
const updateOrderStatus = catchAsync(async (req, res) => {
  const { status, message, courierName, trackingNumber, adminNote } = req.body;

  const validStatuses = ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery', 'delivered', 'cancelled', 'returned'];
  if (!validStatuses.includes(status)) return fail(res, 'Invalid status', 400);

  const order = await Order.findById(req.params.id);
  if (!order) return fail(res, 'Order not found', 404);

  order.status = status;
  if (courierName) order.courierName = courierName;
  if (trackingNumber) order.trackingNumber = trackingNumber;
  if (adminNote) order.adminNote = adminNote;
  if (status === 'delivered') order.deliveredAt = new Date();
  if (status === 'shipped') order.estimatedDelivery = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000);

  // Custom tracking message
  if (message) {
    order.trackingEvents.push({ status, message, timestamp: new Date(), updatedBy: 'admin' });
  }

  await order.save();

  // Emit real-time update
  const io = req.app?.get('io');
  if (io) {
    io.to(`order:${order._id}`).emit('order_status_updated', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
      trackingNumber: order.trackingNumber,
      message: message || `Order status: ${status}`,
    });
    io.to(`user:${order.user}`).emit('order_status_updated', {
      orderId: order._id,
      orderNumber: order.orderNumber,
      status: order.status,
    });
  }

  logger.info(`Order ${order.orderNumber} status updated to ${status} by admin ${req.user._id}`);
  return ok(res, { data: { order } }, 'Order status updated');
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: ANALYTICS
// ═══════════════════════════════════════════════════════════════
const getAnalytics = catchAsync(async (req, res) => {
  const { period = '30' } = req.query;
  const daysAgo = new Date(Date.now() - parseInt(period) * 24 * 60 * 60 * 1000);

  const [
    totalOrders,
    revenueStats,
    statusBreakdown,
    dailyRevenue,
    topProducts,
    topSellers,
  ] = await Promise.all([
    // Total orders
    Order.countDocuments({ createdAt: { $gte: daysAgo } }),

    // Revenue & profit
    Order.aggregate([
      { $match: { createdAt: { $gte: daysAgo }, paymentStatus: { $in: ['paid'] } } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalProfit: { $sum: '$totalProfit' },
          totalOrders: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
        },
      },
    ]),

    // Status breakdown
    Order.aggregate([
      { $match: { createdAt: { $gte: daysAgo } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // Daily revenue chart
    Order.aggregate([
      { $match: { createdAt: { $gte: daysAgo }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          profit: { $sum: '$totalProfit' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Top products
    Order.aggregate([
      { $match: { createdAt: { $gte: daysAgo } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          totalSold: { $sum: '$items.quantity' },
          revenue: { $sum: '$items.totalItemPrice' },
          profit: { $sum: '$items.profit' },
        },
      },
      { $sort: { totalSold: -1 } },
      { $limit: 10 },
    ]),

    // Top sellers
    Order.aggregate([
      { $match: { createdAt: { $gte: daysAgo } } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.seller',
          totalOrders: { $sum: 1 },
          revenue: { $sum: '$items.totalItemPrice' },
          profit: { $sum: '$items.profit' },
        },
      },
      { $sort: { revenue: -1 } },
      { $limit: 10 },
    ]),
  ]);

  return ok(res, {
    data: {
      summary: revenueStats[0] || { totalRevenue: 0, totalProfit: 0, totalOrders: 0, avgOrderValue: 0 },
      totalOrders,
      statusBreakdown,
      dailyRevenue,
      topProducts,
      topSellers,
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// TRACK ORDER (public with order number + phone)
// ═══════════════════════════════════════════════════════════════
const trackOrder = catchAsync(async (req, res) => {
  const { orderNumber, phone } = req.query;
  if (!orderNumber || !phone) return fail(res, 'Order number and phone required', 400);

  const order = await Order.findOne({ orderNumber })
    .select('orderNumber status trackingEvents courierName trackingNumber estimatedDelivery deliveredAt shippingAddress.fullName items.name items.quantity totalAmount paymentMethod createdAt')
    .lean();

  if (!order) return fail(res, 'Order not found. Check your order number.', 404);

  return ok(res, { data: { order } });
});

module.exports = {
  placeOrder,
  getMyOrders,
  getOrder,
  cancelOrder,
  requestReturn,
  getSellerOrders,
  adminGetOrders,
  updateOrderStatus,
  getAnalytics,
  trackOrder,
  deductStock,
};
