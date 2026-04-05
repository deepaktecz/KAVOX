'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║      KAVOX — QIKINK CONTROLLER (qikinkController.js)        ║
 * ║                                                              ║
 * ║  Thin HTTP layer — delegates ALL business logic to           ║
 * ║  qikink.service.js. Never calls Qikink API directly.        ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const Order   = require('../../order/models/Order');
const Design  = require('../../design/models/Design');
const { logger } = require('../../auth/utils/logger');
const QikinkService = require('../qikink.service');

// ─── Response helpers ─────────────────────────────────────────
const catchAsync = (fn) => (req, res, next) =>
  Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({
    success   : true,
    message   : msg,
    ...data,
    timestamp : new Date().toISOString(),
  });

const fail = (res, msg, code = 400) =>
  res.status(code).json({
    success   : false,
    message   : msg,
    timestamp : new Date().toISOString(),
  });

// ═══════════════════════════════════════════════════════════════
// 1. SYNC PRODUCTS
//    POST /api/v1/qikink/sync-products   (admin only)
//    Pulls full Qikink catalog → upserts into MongoDB
// ═══════════════════════════════════════════════════════════════
const syncProducts = catchAsync(async (req, res) => {
  const stats = await QikinkService.syncProductCatalog();
  return ok(res, { data: stats }, 'Qikink catalog synced successfully');
});

// ═══════════════════════════════════════════════════════════════
// 2. BROWSE CATALOG
//    GET /api/v1/qikink/catalog          (seller + admin)
//    Returns paginated raw Qikink catalog for seller to import
// ═══════════════════════════════════════════════════════════════
const getQikinkCatalog = catchAsync(async (req, res) => {
  const { page = 1, per_page = 20, category } = req.query;

  const result = await QikinkService.fetchCatalogPage({
    page     : Number(page),
    per_page : Number(per_page),
    category,
  });

  return ok(res, { data: result.products, meta: result.meta });
});

// ═══════════════════════════════════════════════════════════════
// 3. SUBMIT ORDER TO QIKINK
//    POST /api/v1/qikink/orders/:orderId/submit  (admin retry)
//    Normal flow: payment controller calls _submitToQikinkInternal
// ═══════════════════════════════════════════════════════════════
const submitOrderToQikink = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId).populate('items.product');
  if (!order) return fail(res, 'Order not found', 404);

  if (order.paymentStatus !== 'paid') {
    return fail(res, 'Cannot submit unpaid order to Qikink', 400);
  }

  if (order.qikinkOrderId) {
    return ok(res,
      { data: { qikinkOrderId: order.qikinkOrderId, alreadySubmitted: true } },
      'Order already submitted to Qikink'
    );
  }

  const podItems = order.items.filter(i => i.isPOD);
  if (!podItems.length) return fail(res, 'No POD items in this order', 400);

  const result = await QikinkService.submitOrder(order, podItems);
  return ok(res, { data: result }, 'Order submitted to Qikink');
});

// ═══════════════════════════════════════════════════════════════
// 4. FETCH ORDER STATUS
//    GET /api/v1/qikink/orders/:orderId/status  (admin)
//    Pulls latest status from Qikink and updates MongoDB + Socket
// ═══════════════════════════════════════════════════════════════
const fetchQikinkOrderStatus = catchAsync(async (req, res) => {
  const { orderId } = req.params;

  const order = await Order.findById(orderId);
  if (!order)              return fail(res, 'Order not found', 404);
  if (!order.qikinkOrderId) return fail(res, 'This order has not been submitted to Qikink yet', 400);

  const io     = req.app?.get('io');
  const result = await QikinkService.fetchOrderStatus(order, io);
  return ok(res, { data: result });
});

// ═══════════════════════════════════════════════════════════════
// 5. BATCH POLL ALL PENDING ORDERS
//    POST /api/v1/qikink/poll-status   (admin only)
//    Iterates every in-flight Qikink order and refreshes status
// ═══════════════════════════════════════════════════════════════
const pollAllQikinkOrders = catchAsync(async (req, res) => {
  const io     = req.app?.get('io');
  const stats  = await QikinkService.pollAllOrders(io);
  return ok(res, { data: stats }, 'Qikink status poll complete');
});

// ═══════════════════════════════════════════════════════════════
// 6. UPLOAD DESIGN TO QIKINK
//    POST /api/v1/qikink/designs/:designId/upload  (seller + admin)
//    Sends design image to Qikink design library → saves qikinkDesignId
// ═══════════════════════════════════════════════════════════════
const uploadDesignToQikink = catchAsync(async (req, res) => {
  const { designId } = req.params;

  const design = await Design.findById(designId);
  if (!design) return fail(res, 'Design not found', 404);

  // Ownership check (sellers can only upload their own designs)
  if (req.user.role === 'seller' && String(design.user) !== String(req.user._id)) {
    return fail(res, 'Not authorised to upload this design', 403);
  }

  if (design.isUploadedToQikink && design.qikinkDesignId) {
    return ok(res,
      { data: { qikinkDesignId: design.qikinkDesignId, alreadyUploaded: true } },
      'Design already uploaded to Qikink'
    );
  }

  const qikinkDesignId = await QikinkService.uploadDesignToQikink(design);

  design.qikinkDesignId      = qikinkDesignId;
  design.isUploadedToQikink  = true;
  design.status              = 'ready';
  await design.save();

  logger.info(`Design ${design._id} uploaded to Qikink: ${qikinkDesignId}`);
  return ok(res, { data: { qikinkDesignId } }, 'Design uploaded to Qikink successfully');
});

// ═══════════════════════════════════════════════════════════════
// 7. WEBHOOK HANDLER
//    POST /api/v1/qikink/webhook   (public — Qikink server)
//    Receives push updates from Qikink about order status changes
// ═══════════════════════════════════════════════════════════════
const handleWebhook = catchAsync(async (req, res) => {
  const signature = req.headers['x-qikink-signature'] || req.headers['x-webhook-signature'] || '';

  // Verify signature (raw body needed — see gateway/index.js notes below)
  const rawBody = req.rawBody || JSON.stringify(req.body);
  const valid   = QikinkService.verifyWebhookSignature(rawBody, signature);

  if (!valid) {
    logger.warn('Qikink webhook: invalid signature rejected');
    return res.status(401).json({ success: false, message: 'Invalid webhook signature' });
  }

  const event   = req.body.event || req.body.type || 'order.status_changed';
  const payload = req.body.payload || req.body.data || req.body;

  logger.info(`Qikink webhook received: ${event}`);

  const io     = req.app?.get('io');
  const result = await QikinkService.processWebhookEvent(event, payload, io);

  // Always respond 200 quickly to Qikink
  return res.status(200).json({ received: true, ...result });
});

// ═══════════════════════════════════════════════════════════════
// 8. INTERNAL — used by paymentController after payment success
//    Not an Express handler — called programmatically
// ═══════════════════════════════════════════════════════════════
async function _submitToQikinkInternal(order, podItems) {
  try {
    const result = await QikinkService.submitOrder(order, podItems);
    return result;
  } catch (err) {
    logger.error(`_submitToQikinkInternal failed for ${order.orderNumber}: ${err.message}`);
    throw err;
  }
}

// ─── Export ───────────────────────────────────────────────────
module.exports = {
  syncProducts,
  getQikinkCatalog,
  submitOrderToQikink,
  fetchQikinkOrderStatus,
  pollAllQikinkOrders,
  uploadDesignToQikink,
  handleWebhook,
  _submitToQikinkInternal,  // consumed by paymentController
};
