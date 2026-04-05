'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║          KAVOX — QIKINK SERVICE (qikink.service.js)         ║
 * ║                                                              ║
 * ║  Centralised layer for ALL Qikink API communication.         ║
 * ║  Controllers call this service; never call Qikink directly.  ║
 * ║                                                              ║
 * ║  Capabilities:                                               ║
 * ║    1. HTTP client factory (auth, retry, timeout)             ║
 * ║    2. Product catalog sync                                   ║
 * ║    3. Design upload to Qikink                                ║
 * ║    4. Order submission                                        ║
 * ║    5. Order status polling + status mapping                  ║
 * ║    6. Batch status poll (for cron)                           ║
 * ║    7. Webhook signature verification                          ║
 * ╚══════════════════════════════════════════════════════════════╝
 */

const axios = require('axios');
const crypto = require('crypto');
const Order  = require('../order/models/Order');
const Product = require('../product/models/Product');
const { logger } = require('../auth/utils/logger');

// ─── Constants ────────────────────────────────────────────────
const QIKINK_BASE_URL  = process.env.QIKINK_BASE_URL  || 'https://api.qikink.com';
const QIKINK_API_KEY   = process.env.QIKINK_API_KEY;
const REQUEST_TIMEOUT  = 15_000;   // 15 s per request
const MAX_RETRIES      = 3;
const RETRY_DELAY_BASE = 1_000;    // 1 s, doubles each retry
const CATALOG_PER_PAGE = 50;

// ─────────────────────────────────────────────────────────────
// 1. HTTP CLIENT FACTORY
//    Creates an Axios instance with auth headers.
//    Throws on missing API key so failures are explicit.
// ─────────────────────────────────────────────────────────────
function buildClient() {
  if (!QIKINK_API_KEY) {
    throw new QikinkConfigError('QIKINK_API_KEY is not set in environment variables');
  }
  return axios.create({
    baseURL : QIKINK_BASE_URL,
    timeout : REQUEST_TIMEOUT,
    headers : {
      Authorization : `Bearer ${QIKINK_API_KEY}`,
      'Content-Type': 'application/json',
      Accept        : 'application/json',
      'X-Source'    : 'kavox-platform',
    },
  });
}

// ─── Retry-aware HTTP helper ──────────────────────────────────
async function qikinkRequest(method, path, options = {}) {
  const client = buildClient();
  let lastErr;

  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const response = await client[method](path, options);
      return response.data;
    } catch (err) {
      lastErr = err;
      const status  = err.response?.status;
      const isRetry = !status || status >= 500 || status === 429;

      if (!isRetry || attempt === MAX_RETRIES) break;

      const delay = RETRY_DELAY_BASE * Math.pow(2, attempt - 1);
      logger.warn(`Qikink ${method.toUpperCase()} ${path} attempt ${attempt} failed (${status}). Retrying in ${delay}ms…`);
      await sleep(delay);
    }
  }

  throw new QikinkApiError(
    lastErr.response?.data?.message || lastErr.message,
    lastErr.response?.status || 0,
    lastErr.response?.data
  );
}

// ─────────────────────────────────────────────────────────────
// 2. STATUS MAPS
// ─────────────────────────────────────────────────────────────

/** Map Qikink order-level status → KAVOX order status */
const ORDER_STATUS_MAP = {
  new        : 'processing',
  pending    : 'processing',
  processing : 'processing',
  printing   : 'processing',
  printed    : 'packed',
  dispatched : 'shipped',
  shipped    : 'shipped',
  transit    : 'shipped',
  out_for_delivery: 'out_for_delivery',
  delivered  : 'delivered',
  cancelled  : 'cancelled',
  failed     : 'cancelled',
  returned   : 'returned',
};

/** Map Qikink line-item status → KAVOX item qikinkStatus enum */
const ITEM_STATUS_MAP = {
  new        : 'processing',
  pending    : 'processing',
  processing : 'processing',
  printing   : 'processing',
  printed    : 'printed',
  dispatched : 'dispatched',
  shipped    : 'dispatched',
  delivered  : 'delivered',
  cancelled  : 'failed',
  failed     : 'failed',
};

function mapOrderStatus(raw)  { return ORDER_STATUS_MAP[(raw || '').toLowerCase()] || 'processing'; }
function mapItemStatus(raw)   { return ITEM_STATUS_MAP[(raw  || '').toLowerCase()] || 'processing'; }

// ─────────────────────────────────────────────────────────────
// 3. PRODUCT CATALOG SYNC
//    Fetches all pages of Qikink catalog and upserts into
//    MongoDB. Only updates basePrice / sizes / colors on
//    existing products — never overwrites seller pricing.
// ─────────────────────────────────────────────────────────────
async function syncProductCatalog() {
  let page       = 1;
  let hasMore    = true;
  let allItems   = [];

  // Paginate until exhausted
  while (hasMore) {
    const data = await qikinkRequest('get', '/v2/products', {
      params: { page, per_page: CATALOG_PER_PAGE },
    });

    const items = extractArray(data, ['products', 'data', 'items']);
    if (!items.length) { hasMore = false; break; }

    allItems = allItems.concat(items);
    hasMore  = items.length === CATALOG_PER_PAGE;
    page++;
  }

  const stats = { total: allItems.length, synced: 0, skipped: 0, errors: [] };

  for (const qp of allItems) {
    try {
      await upsertProductFromCatalog(qp);
      stats.synced++;
    } catch (err) {
      stats.skipped++;
      stats.errors.push({ id: qp.id, error: err.message });
      logger.warn(`Catalog sync skipped product ${qp.id}: ${err.message}`);
    }
  }

  logger.info(`Qikink catalog sync — total: ${stats.total}, synced: ${stats.synced}, skipped: ${stats.skipped}`);
  return stats;
}

/** Build + upsert one catalog product into MongoDB */
async function upsertProductFromCatalog(qp) {
  const qikinkProductId = String(qp.id || qp.product_id);
  const sizes  = normaliseArray(qp.sizes || qp.available_sizes);
  const colors = normaliseArray(qp.colors || qp.available_colors);

  // Build variant combinations
  const variants = [];
  if (colors.length && sizes.length) {
    for (const color of colors) {
      for (const size of sizes) {
        const colorName = color.name || String(color);
        const hexCode   = color.hex_code || color.hex || '#000000';
        variants.push({
          sku           : `QIK-${qikinkProductId}-${colorName.replace(/\s/g, '').toUpperCase()}-${size}`,
          color         : { name: colorName, hexCode },
          size,
          stock         : 9999, // POD = effectively unlimited
          additionalPrice: 0,
          qikinkSkuId   : color.sku_id || color.variant_id || `${qikinkProductId}-${colorName}-${size}`,
          isActive      : true,
        });
      }
    }
  }

  const existing = await Product.findOne({ qikinkProductId });

  if (existing) {
    // Safe partial update — preserve seller-set sellingPrice / discountedPrice
    existing.basePrice      = Number(qp.base_price || qp.price || existing.basePrice || 0);
    existing.availableSizes = sizes.length ? sizes : existing.availableSizes;
    existing.availableColors = colors.length
      ? colors.map(c => ({ name: c.name || String(c), hexCode: c.hex_code || c.hex || '#000000' }))
      : existing.availableColors;
    existing.isPOD          = true;
    existing.qikinkCatalogId = qp.catalog_id || qp.category_id || existing.qikinkCatalogId || '';

    // Only add variants if the product has none yet
    if (!existing.variants.length && variants.length) {
      existing.variants = variants;
    }

    await existing.save({ validateBeforeSave: false });
    logger.debug(`Qikink catalog update: ${existing.name} (${qikinkProductId})`);
  } else {
    // Log as imported catalog item (not a storefront product yet)
    logger.info(`Qikink new catalog item: ${qp.name} (${qikinkProductId}) — awaiting seller import`);
  }
}

// ─────────────────────────────────────────────────────────────
// 4. FETCH RAW CATALOG (for seller browse UI)
// ─────────────────────────────────────────────────────────────
async function fetchCatalogPage({ page = 1, per_page = 20, category } = {}) {
  const params = { page, per_page };
  if (category) params.category = category;

  const data = await qikinkRequest('get', '/v2/products', { params });
  const items = extractArray(data, ['products', 'data', 'items']);

  return {
    products: items.map(normaliseCatalogItem),
    meta: {
      page     : Number(page),
      per_page : Number(per_page),
      total    : data.total || data.count || items.length,
    },
  };
}

function normaliseCatalogItem(p) {
  return {
    id          : p.id || p.product_id,
    name        : p.name,
    category    : p.category || p.product_type || '',
    base_price  : Number(p.base_price || p.price || 0),
    sizes       : normaliseArray(p.sizes || p.available_sizes),
    colors      : normaliseArray(p.colors || p.available_colors).map(c => ({
      name    : c.name || String(c),
      hexCode : c.hex_code || c.hex || '#000000',
      sku_id  : c.sku_id || c.variant_id || '',
    })),
    print_areas : normaliseArray(p.print_areas || p.available_print_areas, ['front']),
    images      : normaliseArray(p.images || p.mockup_images),
    description : p.description || '',
    fabric      : p.fabric || p.material || '',
  };
}

// ─────────────────────────────────────────────────────────────
// 5. DESIGN UPLOAD TO QIKINK
//    Sends a design image (Cloudinary URL) to Qikink design
//    library and returns the Qikink design_id.
// ─────────────────────────────────────────────────────────────
async function uploadDesignToQikink(design) {
  if (!design.designImageUrl) {
    throw new QikinkApiError('Design has no image URL to upload');
  }

  const payload = {
    design_url  : design.designImageUrl,
    print_area  : design.printArea || 'front',
    name        : design.name || 'Custom Design',
  };
  if (design.qikinkProductId) payload.product_id = design.qikinkProductId;

  const data = await qikinkRequest('post', '/v2/designs', payload);

  const qikinkDesignId = data.design_id || data.id || data.data?.id;
  if (!qikinkDesignId) {
    throw new QikinkApiError('Qikink did not return a design_id', 0, data);
  }

  logger.info(`Design uploaded to Qikink: designId=${qikinkDesignId}`);
  return qikinkDesignId;
}

// ─────────────────────────────────────────────────────────────
// 6. SUBMIT ORDER TO QIKINK
//    Called by paymentController after payment verification.
//    Only processes items where isPOD === true.
//    Stores qikinkOrderId + initial status on the KAVOX order.
// ─────────────────────────────────────────────────────────────
async function submitOrder(kavoxOrder, podItems) {
  if (!kavoxOrder) throw new Error('kavoxOrder is required');
  if (!podItems || podItems.length === 0) throw new Error('No POD items provided');

  // Guard: don't double-submit
  if (kavoxOrder?.qikinkOrderId) {
    logger.warn(`Order ${kavoxOrder.orderNumber} already submitted as ${kavoxOrder.qikinkOrderId}`);
    return { qikinkOrderId: kavoxOrder.qikinkOrderId, alreadySubmitted: true };
  }

  const lineItems = podItems.map(item => buildLineItem(item));

  const payload = {
    external_reference : kavoxOrder.orderNumber,
    shipping_address   : buildShippingAddress(kavoxOrder.shippingAddress),
    line_items         : lineItems,
  };

  const data = await qikinkRequest('post', '/v2/orders', payload);

  const qikinkOrderId    = String(data.id || data.order_id || data.order?.id || '');
  const qikinkRawStatus  = data.status || 'new';
  const kavoxStatus      = mapOrderStatus(qikinkRawStatus);

  if (!qikinkOrderId) {
    throw new QikinkApiError('Qikink did not return an order id', 0, data);
  }

  // Persist to DB
  await Order.findByIdAndUpdate(kavoxOrder._id, {
    qikinkOrderId,
    qikinkFulfillmentStatus : kavoxStatus,
    qikinkRawResponse       : data,
    // Per-item status update using arrayFilters
    $set: buildItemStatusSetOp(data.line_items, 'new'),
  });

  logger.info(`KAVOX ${kavoxOrder.orderNumber} → Qikink ${qikinkOrderId} [${qikinkRawStatus}]`);

  return {
    qikinkOrderId,
    qikinkRawStatus,
    kavoxStatus,
    lineItemCount : lineItems.length,
  };
}

/** Build a single Qikink line_item from a KAVOX order item */
function buildLineItem(item) {
  const li = {
    product_id : item.qikinkProductId || item.product?.qikinkProductId || item.product,
    quantity   : item.quantity,
  };

  if (item.variant?.size)         li.size  = item.variant.size;
  if (item.variant?.color?.name)  li.color = item.variant.color.name;
  if (item.variant?.sku)          li.variant_sku = item.variant.sku;

  // Custom design
  if (item.qikinkDesignId)  li.design_id  = item.qikinkDesignId;
  if (item.designUrl)       li.design_url = item.designUrl;
  if (item.printArea)       li.print_area = item.printArea;

  return li;
}

/** Build Qikink shipping_address from KAVOX shippingAddress */
function buildShippingAddress(addr) {
  return {
    name     : addr.fullName,
    phone    : addr.phone,
    address1 : addr.addressLine1,
    address2 : addr.addressLine2 || '',
    city     : addr.city,
    state    : addr.state,
    zip      : addr.pincode,
    country  : addr.country || 'India',
    email    : addr.email || '',
  };
}

// ─────────────────────────────────────────────────────────────
// 7. FETCH SINGLE ORDER STATUS FROM QIKINK
//    Polls Qikink for a specific order and syncs to MongoDB.
//    Emits Socket.io events for real-time UI updates.
// ─────────────────────────────────────────────────────────────
async function fetchOrderStatus(kavoxOrder, io = null) {
  if (!kavoxOrder?.qikinkOrderId) {
    throw new Error(`Order ${kavoxOrder._id} has no qikinkOrderId`);
  }

  const data = await qikinkRequest('get', `/v2/orders/${kavoxOrder.qikinkOrderId}`);

  const rawStatus  = data.status || data.fulfillment_status || 'processing';
  const kavoxStatus = mapOrderStatus(rawStatus);

  const tracking = {
    courier        : data.courier_name || data.shipping_carrier || '',
    trackingNumber : data.tracking_number || data.awb || '',
    estimatedDelivery: data.estimated_delivery || data.delivery_date || null,
  };

  // Build DB update
  const update = {
    qikinkFulfillmentStatus : kavoxStatus,
    qikinkRawResponse       : data,
  };
  if (tracking.courier)         update.courierName        = tracking.courier;
  if (tracking.trackingNumber)  update.trackingNumber     = tracking.trackingNumber;
  if (tracking.estimatedDelivery) update.estimatedDelivery = new Date(tracking.estimatedDelivery);

  // Advance KAVOX order status only when it changes
  const STATUS_ADVANCE = { processing:1, packed:2, shipped:3, out_for_delivery:4, delivered:5 };
  const currentRank    = STATUS_ADVANCE[kavoxOrder.status] || 0;
  const newRank        = STATUS_ADVANCE[kavoxStatus]       || 0;

  let statusChanged = false;
  if (newRank > currentRank || (kavoxStatus === 'cancelled' && kavoxOrder.status !== 'cancelled')) {
    update.status  = kavoxStatus;
    statusChanged  = true;
    if (kavoxStatus === 'delivered') update.deliveredAt = new Date();

    // Append tracking event
    kavoxOrder.trackingEvents.push({
      status    : kavoxStatus,
      message   : buildTrackingMessage(kavoxStatus, tracking),
      timestamp : new Date(),
      updatedBy : 'qikink',
    });
    update.trackingEvents = kavoxOrder.trackingEvents;
  }

  // Sync per-item statuses
  if (Array.isArray(data.line_items) && data.line_items.length) {
    for (const li of data.line_items) {
      const itemStatus = mapItemStatus(li.status);
      await Order.updateOne(
        { _id: kavoxOrder._id, 'items.qikinkOrderItemId': String(li.id) },
        { $set: { 'items.$.qikinkStatus': itemStatus } }
      );
    }
  }

  await Order.findByIdAndUpdate(kavoxOrder._id, update);

  // Real-time push
  if (io && statusChanged) {
    const payload = {
      orderId       : kavoxOrder._id,
      orderNumber   : kavoxOrder.orderNumber,
      qikinkStatus  : rawStatus,
      kavoxStatus,
      tracking,
    };
    io.to(`order:${kavoxOrder._id}`).emit('order_status_updated', payload);
    io.to(`user:${kavoxOrder.user}`).emit('order_status_updated', payload);
  }

  return {
    orderId        : kavoxOrder._id,
    orderNumber    : kavoxOrder.orderNumber,
    qikinkOrderId  : kavoxOrder.qikinkOrderId,
    rawStatus,
    kavoxStatus,
    tracking,
    statusChanged,
  };
}

// ─────────────────────────────────────────────────────────────
// 8. BATCH STATUS POLL
//    Iterates all in-flight Qikink orders and calls
//    fetchOrderStatus for each. Safe to run as a cron job.
// ─────────────────────────────────────────────────────────────
async function pollAllOrders(io = null) {
  const orders = await Order.find({
    qikinkOrderId : { $exists: true, $ne: null, $ne: '' },
    status        : { $in: ['confirmed', 'processing', 'packed', 'shipped', 'out_for_delivery'] },
  }).select('_id orderNumber qikinkOrderId status user trackingEvents courierName trackingNumber');

  const stats = { total: orders.length, updated: 0, unchanged: 0, failed: 0 };

  for (const order of orders) {
    try {
      const result = await fetchOrderStatus(order, io);
      result.statusChanged ? stats.updated++ : stats.unchanged++;
    } catch (err) {
      stats.failed++;
      logger.warn(`Qikink poll failed — order ${order.orderNumber}: ${err.message}`);
    }

    // Small throttle to avoid hammering Qikink
    await sleep(200);
  }

  logger.info(`Qikink batch poll complete — total:${stats.total} updated:${stats.updated} failed:${stats.failed}`);
  return stats;
}

// ─────────────────────────────────────────────────────────────
// 9. WEBHOOK SIGNATURE VERIFICATION
//    Qikink signs webhook payloads with HMAC-SHA256.
//    Call this before processing any webhook event.
// ─────────────────────────────────────────────────────────────
function verifyWebhookSignature(rawBody, signature) {
  const secret = process.env.QIKINK_WEBHOOK_SECRET;
  if (!secret) {
    logger.warn('QIKINK_WEBHOOK_SECRET not set — skipping webhook signature check');
    return true; // warn but allow in dev
  }
  const expected = crypto
    .createHmac('sha256', secret)
    .update(typeof rawBody === 'string' ? rawBody : JSON.stringify(rawBody))
    .digest('hex');
  return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature || ''));
}

// ─────────────────────────────────────────────────────────────
// 10. PROCESS WEBHOOK EVENT
//     Handles Qikink-pushed status changes:
//       order.status_changed
//       order.shipped
//       order.delivered
//       order.cancelled
// ─────────────────────────────────────────────────────────────
async function processWebhookEvent(event, payload, io = null) {
  const supportedEvents = [
    'order.status_changed',
    'order.processing',
    'order.printed',
    'order.shipped',
    'order.delivered',
    'order.cancelled',
  ];

  if (!supportedEvents.includes(event)) {
    logger.debug(`Qikink webhook: unhandled event "${event}" — ignoring`);
    return { handled: false };
  }

  const externalRef = payload.external_reference || payload.order?.external_reference;
  const qikinkId    = String(payload.order_id || payload.id || payload.order?.id || '');

  // Resolve KAVOX order
  let order = null;
  if (externalRef) {
    order = await Order.findOne({ orderNumber: externalRef });
  }
  if (!order && qikinkId) {
    order = await Order.findOne({ qikinkOrderId: qikinkId });
  }

  if (!order) {
    logger.warn(`Qikink webhook "${event}": no KAVOX order found (ref=${externalRef}, qikinkId=${qikinkId})`);
    return { handled: false, reason: 'order_not_found' };
  }

  // Determine new status
  const rawStatus   = payload.status || payload.fulfillment_status || deriveStatusFromEvent(event);
  const kavoxStatus = mapOrderStatus(rawStatus);
  const tracking    = {
    courier        : payload.courier_name || payload.shipping_carrier || '',
    trackingNumber : payload.tracking_number || payload.awb || '',
    estimatedDelivery: payload.estimated_delivery || null,
  };

  const update = {
    qikinkFulfillmentStatus : kavoxStatus,
    qikinkRawResponse       : payload,
  };

  const STATUS_ADVANCE = { processing:1, packed:2, shipped:3, out_for_delivery:4, delivered:5 };
  const currentRank    = STATUS_ADVANCE[order.status] || 0;
  const newRank        = STATUS_ADVANCE[kavoxStatus]  || 0;

  let statusChanged = false;
  if (newRank > currentRank || kavoxStatus === 'cancelled') {
    update.status  = kavoxStatus;
    statusChanged  = true;
    if (kavoxStatus === 'delivered') update.deliveredAt = new Date();
    if (tracking.courier)         update.courierName     = tracking.courier;
    if (tracking.trackingNumber)  update.trackingNumber  = tracking.trackingNumber;
    if (tracking.estimatedDelivery) update.estimatedDelivery = new Date(tracking.estimatedDelivery);

    order.trackingEvents.push({
      status    : kavoxStatus,
      message   : buildTrackingMessage(kavoxStatus, tracking),
      timestamp : new Date(),
      updatedBy : 'qikink',
    });
    update.trackingEvents = order.trackingEvents;
  }

  await Order.findByIdAndUpdate(order._id, update);

  // Real-time push
  if (io && statusChanged) {
    const socketPayload = { orderId: order._id, orderNumber: order.orderNumber, kavoxStatus, tracking };
    io.to(`order:${order._id}`).emit('order_status_updated', socketPayload);
    io.to(`user:${order.user}`).emit('order_status_updated', socketPayload);
  }

  logger.info(`Qikink webhook "${event}" → order ${order.orderNumber} → ${kavoxStatus}`);

  return { handled: true, orderId: order._id, kavoxStatus, statusChanged };
}

// ─────────────────────────────────────────────────────────────
// PRIVATE UTILITIES
// ─────────────────────────────────────────────────────────────

function buildTrackingMessage(status, tracking) {
  const msgs = {
    processing      : 'Your order is being processed by our print partner',
    packed          : 'Order has been printed and packed for dispatch',
    shipped         : `Order shipped via ${tracking.courier || 'courier'}${tracking.trackingNumber ? ` · AWB: ${tracking.trackingNumber}` : ''}`,
    out_for_delivery: 'Your order is out for delivery',
    delivered       : 'Order delivered successfully 🎉',
    cancelled       : 'Order cancelled by print partner',
    returned        : 'Order has been returned',
  };
  return msgs[status] || `Order status updated to ${status}`;
}

function deriveStatusFromEvent(event) {
  const map = {
    'order.processing' : 'processing',
    'order.printed'    : 'printed',
    'order.shipped'    : 'shipped',
    'order.delivered'  : 'delivered',
    'order.cancelled'  : 'cancelled',
  };
  return map[event] || 'processing';
}

function buildItemStatusSetOp(lineItems, fallbackStatus) {
  if (!Array.isArray(lineItems) || !lineItems.length) return {};
  const ops = {};
  lineItems.forEach((li, idx) => {
    if (li.id) {
      ops[`items.${idx}.qikinkOrderItemId`] = String(li.id);
      ops[`items.${idx}.qikinkStatus`]      = mapItemStatus(li.status || fallbackStatus);
    }
  });
  return ops;
}

function extractArray(data, keys) {
  for (const key of keys) {
    if (data && Array.isArray(data[key]) && data[key].length) return data[key];
  }
  return Array.isArray(data) ? data : [];
}

function normaliseArray(val, fallback = []) {
  if (!val) return fallback;
  return Array.isArray(val) ? val : fallback;
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

// ─── Custom Error Classes ─────────────────────────────────────
class QikinkConfigError extends Error {
  constructor(msg) { super(msg); this.name = 'QikinkConfigError'; this.isQikinkError = true; }
}

class QikinkApiError extends Error {
  constructor(msg, status = 0, body = null) {
    super(msg);
    this.name          = 'QikinkApiError';
    this.isQikinkError = true;
    this.httpStatus    = status;
    this.responseBody  = body;
  }
}

// ─── Exports ──────────────────────────────────────────────────
module.exports = {
  // Core
  buildClient,

  // Product
  syncProductCatalog,
  fetchCatalogPage,
  normaliseCatalogItem,

  // Design
  uploadDesignToQikink,

  // Order
  submitOrder,
  fetchOrderStatus,
  pollAllOrders,

  // Webhook
  verifyWebhookSignature,
  processWebhookEvent,

  // Status helpers (exported for testing)
  mapOrderStatus,
  mapItemStatus,

  // Errors
  QikinkConfigError,
  QikinkApiError,
};
