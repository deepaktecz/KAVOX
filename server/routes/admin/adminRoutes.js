'use strict';

/**
 * ADMIN ROUTES
 * ────────────
 * Feature 4: Complete admin dashboard APIs
 *   - Dashboard stats: revenue, Qikink cost, profit, total orders
 *   - Orders list with payment + qikink status
 *   - Products CRUD with margin setting
 */

const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');

const Order = require('../../services/order/models/Order');
const Product = require('../../services/product/models/Product');
const Design = require('../../services/design/models/Design');
const { protect, restrictTo } = require('../../services/auth/middleware/authMiddleware');
const { logger } = require('../../services/auth/utils/logger');

// ─── Helpers ──────────────────────────────────────────────────
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({ success: true, message: msg, ...data, timestamp: new Date().toISOString() });

const fail = (res, msg, code = 400) =>
  res.status(code).json({ success: false, message: msg, timestamp: new Date().toISOString() });

// All admin routes require admin role
router.use(protect, restrictTo('admin', 'super_admin'));

// ═══════════════════════════════════════════════════════════════
// DASHBOARD: SUMMARY STATS
// GET /api/v1/admin/dashboard
// ═══════════════════════════════════════════════════════════════
router.get('/dashboard', catchAsync(async (req, res) => {
  const { period = '30' } = req.query;
  const days = Math.min(Math.max(parseInt(period) || 30, 1), 365);
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const prevSince = new Date(since.getTime() - days * 24 * 60 * 60 * 1000);

  const [
    currentStats,
    prevStats,
    pendingOrders,
    totalOrders,
    totalProducts,
    statusBreakdown,
    dailyRevenue,
    qikinkStats,
  ] = await Promise.all([
    // Current period revenue / profit / qikink cost
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalQikinkCost: { $sum: '$totalBasePrice' },
          totalProfit: { $sum: '$totalProfit' },
          orderCount: { $sum: 1 },
          avgOrderValue: { $avg: '$totalAmount' },
        },
      },
    ]),

    // Previous period for growth %
    Order.aggregate([
      { $match: { createdAt: { $gte: prevSince, $lt: since }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: null,
          totalRevenue: { $sum: '$totalAmount' },
          totalProfit: { $sum: '$totalProfit' },
          orderCount: { $sum: 1 },
        },
      },
    ]),

    // Orders awaiting action
    Order.countDocuments({ status: { $in: ['confirmed', 'processing'] } }),

    // Total orders in period
    Order.countDocuments({ createdAt: { $gte: since } }),

    // Active products
    Product.countDocuments({ status: 'active' }),

    // Orders by status
    Order.aggregate([
      { $match: { createdAt: { $gte: since } } },
      { $group: { _id: '$status', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),

    // Daily revenue chart (last `days` days)
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          qikinkCost: { $sum: '$totalBasePrice' },
          profit: { $sum: '$totalProfit' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),

    // Qikink fulfillment stats
    Order.aggregate([
      { $match: { qikinkOrderId: { $exists: true, $ne: null }, createdAt: { $gte: since } } },
      { $group: { _id: '$qikinkFulfillmentStatus', count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]),
  ]);

  const cur = currentStats[0] || { totalRevenue: 0, totalQikinkCost: 0, totalProfit: 0, orderCount: 0, avgOrderValue: 0 };
  const prev = prevStats[0] || { totalRevenue: 0, totalProfit: 0, orderCount: 0 };

  const growth = (curr, previous) =>
    previous === 0 ? null : parseFloat((((curr - previous) / previous) * 100).toFixed(1));

  return ok(res, {
    data: {
      summary: {
        totalRevenue: cur.totalRevenue,
        totalQikinkCost: cur.totalQikinkCost,
        totalProfit: cur.totalProfit,
        profitMargin: cur.totalRevenue > 0 ? parseFloat(((cur.totalProfit / cur.totalRevenue) * 100).toFixed(1)) : 0,
        totalOrders,
        paidOrders: cur.orderCount,
        avgOrderValue: parseFloat((cur.avgOrderValue || 0).toFixed(2)),
        pendingOrders,
        totalProducts,
        // Growth vs previous period
        revenueGrowth: growth(cur.totalRevenue, prev.totalRevenue),
        profitGrowth: growth(cur.totalProfit, prev.totalProfit),
        orderGrowth: growth(cur.orderCount, prev.orderCount),
      },
      statusBreakdown,
      qikinkStats,
      dailyRevenue,
      period: { days, since },
    },
  });
}));

// ═══════════════════════════════════════════════════════════════
// ORDERS: LIST ALL WITH FILTERS
// GET /api/v1/admin/orders
// ═══════════════════════════════════════════════════════════════
router.get('/orders', catchAsync(async (req, res) => {
  const {
    page = 1,
    limit = 20,
    status,
    paymentStatus,
    qikinkStatus,
    startDate,
    endDate,
    search,
    sortBy = 'createdAt',
    order: sortOrder = 'desc',
  } = req.query;

  const skip = (parseInt(page) - 1) * parseInt(limit);
  const filter = {};

  if (status) filter.status = status;
  if (paymentStatus) filter.paymentStatus = paymentStatus;
  if (qikinkStatus) filter.qikinkFulfillmentStatus = qikinkStatus;

  if (startDate || endDate) {
    filter.createdAt = {};
    if (startDate) filter.createdAt.$gte = new Date(startDate);
    if (endDate) {
      const end = new Date(endDate);
      end.setHours(23, 59, 59, 999);
      filter.createdAt.$lte = end;
    }
  }

  if (search) {
    filter.$or = [
      { orderNumber: { $regex: search, $options: 'i' } },
      { 'shippingAddress.fullName': { $regex: search, $options: 'i' } },
      { 'shippingAddress.phone': { $regex: search, $options: 'i' } },
    ];
  }

  const sortField = ['createdAt', 'totalAmount', 'totalProfit', 'status'].includes(sortBy) ? sortBy : 'createdAt';
  const sortDir = sortOrder === 'asc' ? 1 : -1;

  const [orders, total] = await Promise.all([
    Order.find(filter)
      .sort({ [sortField]: sortDir })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email phone')
      .select('-qikinkRawResponse -razorpaySignature')
      .lean(),
    Order.countDocuments(filter),
  ]);

  // Attach profit margin per order
  const enriched = orders.map((o) => ({
    ...o,
    profitMargin: o.totalAmount > 0 ? parseFloat(((o.totalProfit / o.totalAmount) * 100).toFixed(1)) : 0,
  }));

  return ok(res, {
    data: { orders: enriched },
    meta: {
      total,
      page: parseInt(page),
      limit: parseInt(limit),
      pages: Math.ceil(total / parseInt(limit)),
    },
  });
}));

// ═══════════════════════════════════════════════════════════════
// ORDERS: SINGLE ORDER DETAIL
// GET /api/v1/admin/orders/:id
// ═══════════════════════════════════════════════════════════════
router.get('/orders/:id', catchAsync(async (req, res) => {
  const order = await Order.findById(req.params.id)
    .populate('user', 'firstName lastName email phone')
    .populate('items.product', 'name slug images basePrice sellingPrice qikinkProductId')
    .lean();

  if (!order) return fail(res, 'Order not found', 404);
  return ok(res, { data: { order } });
}));

// ═══════════════════════════════════════════════════════════════
// PRODUCTS: LIST ALL WITH MARGIN DATA
// GET /api/v1/admin/products
// ═══════════════════════════════════════════════════════════════
router.get('/products', catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status, category, search, isPOD } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (status) filter.status = status;
  if (category) filter.category = category;
  if (isPOD !== undefined) filter.isPOD = isPOD === 'true';
  if (search) {
    filter.$or = [
      { name: { $regex: search, $options: 'i' } },
      { sku: { $regex: search, $options: 'i' } },
      { brand: { $regex: search, $options: 'i' } },
    ];
  }

  const [products, total] = await Promise.all([
    Product.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('seller', 'firstName lastName email')
      .lean(),
    Product.countDocuments(filter),
  ]);

  // Enrich with margin info
  const enriched = products.map((p) => ({
    ...p,
    margin: p.sellingPrice > 0
      ? parseFloat((((p.sellingPrice - p.basePrice) / p.sellingPrice) * 100).toFixed(1))
      : 0,
    grossProfit: p.sellingPrice - p.basePrice,
  }));

  return ok(res, {
    data: { products: enriched },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
}));

// ═══════════════════════════════════════════════════════════════
// PRODUCTS: UPDATE (admin can edit any product)
// PATCH /api/v1/admin/products/:id
// ═══════════════════════════════════════════════════════════════
router.patch('/products/:id', catchAsync(async (req, res) => {
  const allowedFields = [
    'name', 'description', 'shortDescription', 'category', 'subcategory', 'tags',
    'basePrice', 'sellingPrice', 'discountedPrice', 'gstPercent',
    'status', 'isPOD', 'qikinkProductId', 'qikinkCatalogId',
    'availableSizes', 'fabric', 'fit', 'brand',
    'freeShippingAbove', 'deliveryDays', 'lowStockThreshold',
    'marginPercent', // Admin can set a target margin
  ];

  const updates = {};
  for (const field of allowedFields) {
    if (req.body[field] !== undefined) updates[field] = req.body[field];
  }

  // If admin sets marginPercent, compute sellingPrice from basePrice
  if (req.body.marginPercent !== undefined && req.body.basePrice !== undefined) {
    const base = Number(req.body.basePrice);
    const margin = Number(req.body.marginPercent) / 100;
    updates.sellingPrice = parseFloat((base / (1 - margin)).toFixed(2));
  } else if (req.body.marginPercent !== undefined) {
    // Get current basePrice from DB
    const product = await Product.findById(req.params.id).select('basePrice');
    if (product) {
      const margin = Number(req.body.marginPercent) / 100;
      updates.sellingPrice = parseFloat((product.basePrice / (1 - margin)).toFixed(2));
    }
  }

  const product = await Product.findByIdAndUpdate(
    req.params.id,
    { $set: updates },
    { new: true, runValidators: true }
  );

  if (!product) return fail(res, 'Product not found', 404);

  logger.info(`Admin ${req.user._id} updated product ${product._id}`);
  return ok(res, { data: { product } }, 'Product updated');
}));

// ═══════════════════════════════════════════════════════════════
// PRODUCTS: DELETE
// DELETE /api/v1/admin/products/:id
// ═══════════════════════════════════════════════════════════════
router.delete('/products/:id', catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return fail(res, 'Product not found', 404);

  // Soft delete
  product.status = 'archived';
  await product.save({ validateBeforeSave: false });

  logger.info(`Admin ${req.user._id} archived product ${product._id}`);
  return ok(res, {}, 'Product archived');
}));

// ═══════════════════════════════════════════════════════════════
// PRODUCTS: SET MARGIN (bulk or single)
// POST /api/v1/admin/products/set-margin
// Body: { productIds: [...], marginPercent: 30 }
//    OR { category: 'T-Shirts', marginPercent: 25 }
// ═══════════════════════════════════════════════════════════════
router.post('/products/set-margin', catchAsync(async (req, res) => {
  const { productIds, category, marginPercent } = req.body;

  if (marginPercent === undefined || marginPercent < 0 || marginPercent >= 100) {
    return fail(res, 'marginPercent must be between 0 and 99', 400);
  }

  const filter = {};
  if (productIds && productIds.length > 0) {
    filter._id = { $in: productIds };
  } else if (category) {
    filter.category = category;
  } else {
    return fail(res, 'Provide either productIds or category', 400);
  }

  // Fetch products to compute new sellingPrice per basePrice
  const products = await Product.find(filter).select('_id basePrice sellingPrice');
  const margin = Number(marginPercent) / 100;

  let updatedCount = 0;
  for (const p of products) {
    if (p.basePrice > 0) {
      const newSellingPrice = parseFloat((p.basePrice / (1 - margin)).toFixed(2));
      await Product.findByIdAndUpdate(p._id, { $set: { sellingPrice: newSellingPrice } });
      updatedCount++;
    }
  }

  logger.info(`Admin ${req.user._id} set ${marginPercent}% margin on ${updatedCount} products`);
  return ok(res, { data: { updated: updatedCount, marginPercent } }, `Margin set to ${marginPercent}% on ${updatedCount} products`);
}));

// ═══════════════════════════════════════════════════════════════
// PROFIT REPORT
// GET /api/v1/admin/profit-report
// ═══════════════════════════════════════════════════════════════
router.get('/profit-report', catchAsync(async (req, res) => {
  const { period = '30' } = req.query;
  const days = parseInt(period) || 30;
  const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

  const [profitByCategory, profitBySeller, topProfitProducts, profitTrend] = await Promise.all([
    // Profit by product category
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
      { $unwind: '$items' },
      {
        $lookup: {
          from: 'products',
          localField: 'items.product',
          foreignField: '_id',
          as: 'productInfo',
        },
      },
      { $unwind: { path: '$productInfo', preserveNullAndEmpty: true } },
      {
        $group: {
          _id: '$productInfo.category',
          revenue: { $sum: '$items.totalItemPrice' },
          qikinkCost: { $sum: { $multiply: ['$items.basePrice', '$items.quantity'] } },
          profit: { $sum: '$items.profit' },
          units: { $sum: '$items.quantity' },
        },
      },
      { $sort: { profit: -1 } },
    ]),

    // Profit by seller
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.seller',
          revenue: { $sum: '$items.totalItemPrice' },
          qikinkCost: { $sum: { $multiply: ['$items.basePrice', '$items.quantity'] } },
          profit: { $sum: '$items.profit' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { profit: -1 } },
      { $limit: 10 },
    ]),

    // Top profitable products
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
      { $unwind: '$items' },
      {
        $group: {
          _id: '$items.product',
          name: { $first: '$items.name' },
          revenue: { $sum: '$items.totalItemPrice' },
          qikinkCost: { $sum: { $multiply: ['$items.basePrice', '$items.quantity'] } },
          profit: { $sum: '$items.profit' },
          units: { $sum: '$items.quantity' },
        },
      },
      { $sort: { profit: -1 } },
      { $limit: 10 },
    ]),

    // Weekly profit trend
    Order.aggregate([
      { $match: { createdAt: { $gte: since }, paymentStatus: 'paid' } },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%W', date: '$createdAt' } },
          revenue: { $sum: '$totalAmount' },
          qikinkCost: { $sum: '$totalBasePrice' },
          profit: { $sum: '$totalProfit' },
          orders: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]),
  ]);

  return ok(res, {
    data: {
      profitByCategory,
      profitBySeller,
      topProfitProducts,
      profitTrend,
      period: { days, since },
    },
  });
}));

// ═══════════════════════════════════════════════════════════════
// DESIGNS: ADMIN VIEW ALL DESIGNS
// GET /api/v1/admin/designs
// ═══════════════════════════════════════════════════════════════
router.get('/designs', catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = {};
  if (status) filter.status = status;

  const [designs, total] = await Promise.all([
    Design.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('user', 'firstName lastName email')
      .populate('product', 'name slug')
      .lean(),
    Design.countDocuments(filter),
  ]);

  return ok(res, {
    data: { designs },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
}));

// ─── 404 fallback ─────────────────────────────────────────────
router.use((req, res) => {
  fail(res, `Admin route ${req.method} ${req.originalUrl} not found`, 404);
});

module.exports = router;
