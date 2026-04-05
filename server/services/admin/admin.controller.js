'use strict';

const adminService = require('./admin.service');
const { logger } = require('../auth/utils/logger');

// ═══════════════════════════════════════════════════════════════
// ADMIN CONTROLLER
// ═══════════════════════════════════════════════════════════════
// Route handlers for admin dashboard endpoints
// Uses adminService for business logic
// ═══════════════════════════════════════════════════════════════

/**
 * Wrapper for async route handlers
 * Eliminates try/catch boilerplate
 */
const catchAsync = (fn) => (req, res, next) => {
  fn(req, res, next).catch(next);
};

/**
 * Success response helper
 */
const ok = (res, statusCode = 200, message = 'Success', data = null) => {
  const response = { success: true, message };
  if (data) response.data = data;
  return res.status(statusCode).json(response);
};

/**
 * Error response helper
 */
const fail = (res, statusCode = 400, message = 'Error') => {
  return res.status(statusCode).json({ success: false, message });
};

// ═══════════════════════════════════════════════════════════════
// DASHBOARD
// ═══════════════════════════════════════════════════════════════

exports.getDashboard = catchAsync(async (req, res) => {
  const days = req.query.days || 30;
  const metrics = await adminService.getDashboardMetrics(days);

  logger.info(`Admin dashboard accessed - ${days} days`);
  ok(res, 200, 'Dashboard metrics retrieved', metrics);
});

// ═══════════════════════════════════════════════════════════════
// ORDERS
// ═══════════════════════════════════════════════════════════════

exports.getAllOrders = catchAsync(async (req, res) => {
  const { status, paymentStatus, qikinkStatus, dateFrom, dateTo, minAmount, maxAmount, page = 1, limit = 20 } = req.query;

  const filters = {
    status,
    paymentStatus,
    qikinkStatus,
    dateFrom,
    dateTo,
    minAmount,
    maxAmount,
  };

  const result = await adminService.getAllOrders(filters, page, limit);

  logger.info(`Admin retrieved orders - Page ${page}, Limit ${limit}`);
  ok(res, 200, 'Orders retrieved', result);
});

exports.getOrderDetail = catchAsync(async (req, res) => {
  const { id } = req.params;
  const order = await adminService.getOrderDetail(id);

  logger.info(`Admin viewed order detail: ${id}`);
  ok(res, 200, 'Order detail retrieved', order);
});

exports.updateOrderStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return fail(res, 400, 'Status is required');
  }

  const order = await adminService.updateOrderStatus(id, status);

  logger.info(`Admin updated order ${id} status to ${status}`);
  ok(res, 200, `Order status updated to ${status}`, order);
});

exports.getOrdersStats = catchAsync(async (req, res) => {
  const stats = await adminService.getOrdersStats();

  ok(res, 200, 'Order statistics retrieved', stats);
});

// ═══════════════════════════════════════════════════════════════
// PRODUCTS
// ═══════════════════════════════════════════════════════════════

exports.createProduct = catchAsync(async (req, res) => {
  const { name, basePrice, sellingPrice, category, description, images, sku, tags, variants } = req.body;

  if (!name || !basePrice || !sellingPrice) {
    return fail(res, 400, 'Name, basePrice, and sellingPrice are required');
  }

  const product = await adminService.createProduct({
    name,
    basePrice: parseFloat(basePrice),
    sellingPrice: parseFloat(sellingPrice),
    category,
    description,
    images,
    sku,
    tags,
    variants,
  });

  logger.info(`Admin created product: ${product._id}`);
  ok(res, 201, 'Product created', product);
});

exports.getProducts = catchAsync(async (req, res) => {
  const { status, minPrice, maxPrice, page = 1, limit = 20 } = req.query;

  const filters = { status, minPrice, maxPrice };
  const result = await adminService.getProducts(filters, page, limit);

  ok(res, 200, 'Products retrieved', result);
});

exports.getProductDetail = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.getProductDetail(id);

  logger.info(`Admin viewed product detail: ${id}`);
  ok(res, 200, 'Product detail retrieved', result);
});

exports.updateProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { name, basePrice, sellingPrice, description, images, status, category } = req.body;

  const updateData = {};
  if (name) updateData.name = name;
  if (basePrice) updateData.basePrice = parseFloat(basePrice);
  if (sellingPrice) updateData.sellingPrice = parseFloat(sellingPrice);
  if (description) updateData.description = description;
  if (images) updateData.images = images;
  if (status) updateData.status = status;
  if (category) updateData.category = category;

  if (Object.keys(updateData).length === 0) {
    return fail(res, 400, 'No fields to update');
  }

  const product = await adminService.updateProduct(id, updateData);

  logger.info(`Admin updated product: ${id}`);
  ok(res, 200, 'Product updated', product);
});

exports.deleteProduct = catchAsync(async (req, res) => {
  const { id } = req.params;
  await adminService.deleteProduct(id);

  logger.info(`Admin deleted product: ${id}`);
  ok(res, 200, 'Product deleted');
});

// ═══════════════════════════════════════════════════════════════
// ANALYTICS
// ═══════════════════════════════════════════════════════════════

exports.getDailySalesAnalytics = catchAsync(async (req, res) => {
  const days = req.query.days || 30;
  const analytics = await adminService.getDailySalesAnalytics(days);

  ok(res, 200, 'Daily sales analytics retrieved', { days, data: analytics });
});

exports.getProfitAnalytics = catchAsync(async (req, res) => {
  const days = req.query.days || 30;
  const analytics = await adminService.getProfitAnalytics(days);

  ok(res, 200, 'Profit analytics retrieved', { days, data: analytics });
});

exports.getRevenueAnalytics = catchAsync(async (req, res) => {
  const days = req.query.days || 30;
  const analytics = await adminService.getRevenueAnalytics(days);

  ok(res, 200, 'Revenue analytics retrieved', { days, data: analytics });
});

exports.getProductAnalytics = catchAsync(async (req, res) => {
  const days = req.query.days || 30;
  const analytics = await adminService.getProductAnalytics(days);

  ok(res, 200, 'Product analytics retrieved', { days, data: analytics });
});

// ═══════════════════════════════════════════════════════════════
// PAYMENTS & REFUNDS
// ═══════════════════════════════════════════════════════════════

exports.getPaymentStatus = catchAsync(async (req, res) => {
  const stats = await adminService.getPaymentStatus();

  ok(res, 200, 'Payment status retrieved', stats);
});

exports.getRefunds = catchAsync(async (req, res) => {
  const { page = 1, limit = 20 } = req.query;
  const result = await adminService.getRefunds({}, page, limit);

  ok(res, 200, 'Refunds retrieved', result);
});

exports.initiateRefund = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  if (!reason) {
    return fail(res, 400, 'Refund reason is required');
  }

  const refund = await adminService.initiateRefund(id, amount, reason);

  logger.info(`Admin initiated refund for order: ${id}`);
  ok(res, 200, 'Refund initiated', refund);
});

// ═══════════════════════════════════════════════════════════════
// USERS
// ═══════════════════════════════════════════════════════════════

exports.getUsers = catchAsync(async (req, res) => {
  const { role, status, page = 1, limit = 20 } = req.query;

  const filters = { role, status };
  const result = await adminService.getUsers(filters, page, limit);

  ok(res, 200, 'Users retrieved', result);
});

exports.getUserDetail = catchAsync(async (req, res) => {
  const { id } = req.params;
  const result = await adminService.getUserDetail(id);

  logger.info(`Admin viewed user detail: ${id}`);
  ok(res, 200, 'User detail retrieved', result);
});

exports.updateUserStatus = catchAsync(async (req, res) => {
  const { id } = req.params;
  const { status } = req.body;

  if (!status) {
    return fail(res, 400, 'Status is required');
  }

  const user = await adminService.updateUserStatus(id, status);

  logger.info(`Admin updated user ${id} status to ${status}`);
  ok(res, 200, `User status updated to ${status}`, user);
});
