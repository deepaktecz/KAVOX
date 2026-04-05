'use strict';

/**
 * ╔══════════════════════════════════════════════════════════════╗
 * ║        KAVOX — QIKINK ROUTES (qikinkRoutes.js)              ║
 * ║                                                              ║
 * ║  Mounted at: /api/v1/qikink  (see server/gateway/index.js)  ║
 * ╚══════════════════════════════════════════════════════════════╝
 *
 * Route summary
 * ─────────────────────────────────────────────────────────────
 *  PUBLIC (no auth)
 *    POST  /webhook               ← Qikink push notifications
 *
 *  SELLER + ADMIN
 *    GET   /catalog               ← Browse raw Qikink catalog
 *    POST  /designs/:id/upload    ← Upload design to Qikink
 *
 *  ADMIN ONLY
 *    POST  /sync-products         ← Sync full catalog → MongoDB
 *    POST  /poll-status           ← Batch refresh all pending orders
 *    POST  /orders/:id/submit     ← Manual re-submit to Qikink
 *    GET   /orders/:id/status     ← Fetch + refresh single order status
 */

const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/qikinkController');
const { protect, restrictTo } = require('../../auth/middleware/authMiddleware');

// ──────────────────────────────────────────────────────────────
// PUBLIC: Webhook endpoint
//   Must be before protect middleware.
//   Qikink sends POST requests here to push order updates.
//   Signature verified inside the controller.
// ──────────────────────────────────────────────────────────────
router.post('/webhook', ctrl.handleWebhook);

// ──────────────────────────────────────────────────────────────
// All routes below require a valid JWT
// ──────────────────────────────────────────────────────────────
router.use(protect);

// ──────────────────────────────────────────────────────────────
// SELLER + ADMIN: Catalog browsing
// ──────────────────────────────────────────────────────────────

/**
 * GET /api/v1/qikink/catalog
 * Browse the raw Qikink product catalog so sellers can import
 * Query params: page, per_page, category
 */
router.get(
  '/catalog',
  restrictTo('seller', 'admin', 'super_admin'),
  ctrl.getQikinkCatalog
);

/**
 * POST /api/v1/qikink/designs/:designId/upload
 * Upload a saved design to Qikink design library.
 * Returns qikinkDesignId which is later sent with the order.
 */
router.post(
  '/designs/:designId/upload',
  restrictTo('seller', 'admin', 'super_admin'),
  ctrl.uploadDesignToQikink
);

// ──────────────────────────────────────────────────────────────
// ADMIN ONLY: Catalog sync + order management
// ──────────────────────────────────────────────────────────────

/**
 * POST /api/v1/qikink/sync-products
 * Pull full Qikink catalog and upsert into MongoDB.
 * Long-running — returns when complete.
 */
router.post(
  '/sync-products',
  restrictTo('admin', 'super_admin'),
  ctrl.syncProducts
);

/**
 * POST /api/v1/qikink/poll-status
 * Iterate every in-flight Qikink order and refresh status in DB.
 * Safe to call from a cron job or manually from the admin panel.
 */
router.post(
  '/poll-status',
  restrictTo('admin', 'super_admin'),
  ctrl.pollAllQikinkOrders
);

/**
 * POST /api/v1/qikink/orders/:orderId/submit
 * Admin retry: force-submit an order that failed to reach Qikink.
 * Normal flow: paymentController calls _submitToQikinkInternal automatically.
 */
router.post(
  '/orders/:orderId/submit',
  restrictTo('admin', 'super_admin'),
  ctrl.submitOrderToQikink
);

/**
 * GET /api/v1/qikink/orders/:orderId/status
 * Fetch latest status for a specific order from Qikink API
 * and sync it to MongoDB + emit Socket.io event.
 */
router.get(
  '/orders/:orderId/status',
  restrictTo('admin', 'super_admin'),
  ctrl.fetchQikinkOrderStatus
);

module.exports = router;
