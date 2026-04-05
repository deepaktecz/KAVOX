'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const InventorySyncService = require('../../services/inventory/inventory.sync.service');
const { requireAuth, requireAdmin } = require('../../middleware/security.middleware');

/**
 * INVENTORY ROUTES
 * ═════════════════════════════════════════════════════════════════
 * Manage inventory sync and stock management
 */

/**
 * GET /api/inventory/status
 * Get inventory sync status
 */
router.get('/status', requireAuth, requireAdmin, (req, res) => {
  try {
    const status = InventorySyncService.getSyncStatus();

    res.json({
      success: true,
      status,
    });
  } catch (error) {
    logger.error('Failed to fetch inventory sync status:', error);
    res.status(500).json({ error: 'Failed to fetch sync status' });
  }
});

/**
 * POST /api/inventory/sync
 * Trigger immediate inventory sync
 */
router.post('/sync', requireAuth, requireAdmin, async (req, res) => {
  try {
    const result = await InventorySyncService.forceSync();

    res.json({
      success: true,
      result,
      message: 'Inventory sync completed',
    });
  } catch (error) {
    logger.error('Failed to sync inventory:', error);
    res.status(500).json({ error: 'Failed to sync inventory' });
  }
});

/**
 * POST /api/inventory/sync/:productId
 * Sync specific product inventory
 */
router.post('/sync/:productId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { productId } = req.params;

    const result = await InventorySyncService.syncProductById(productId);

    res.json({
      success: true,
      result,
      message: 'Product inventory synced',
    });
  } catch (error) {
    logger.error('Failed to sync product inventory:', error);
    res.status(400).json({ error: error.message || 'Failed to sync product inventory' });
  }
});

/**
 * POST /api/inventory/start-auto-sync
 * Start automatic inventory sync
 */
router.post('/start-auto-sync', requireAuth, requireAdmin, (req, res) => {
  try {
    const { intervalHours = 1 } = req.body;
    const intervalMs = intervalHours * 60 * 60 * 1000;

    InventorySyncService.startAutoSync(intervalMs);

    res.json({
      success: true,
      message: `Automatic inventory sync started (every ${intervalHours} hour(s))`,
    });
  } catch (error) {
    logger.error('Failed to start auto sync:', error);
    res.status(500).json({ error: 'Failed to start auto sync' });
  }
});

/**
 * POST /api/inventory/stop-auto-sync
 * Stop automatic inventory sync
 */
router.post('/stop-auto-sync', requireAuth, requireAdmin, (req, res) => {
  try {
    InventorySyncService.stopAutoSync();

    res.json({
      success: true,
      message: 'Automatic inventory sync stopped',
    });
  } catch (error) {
    logger.error('Failed to stop auto sync:', error);
    res.status(500).json({ error: 'Failed to stop auto sync' });
  }
});

/**
 * GET /api/inventory/stock/:productId/:variantSku
 * Check stock for specific variant
 */
router.get('/stock/:productId/:variantSku', requireAuth, async (req, res) => {
  try {
    const { productId, variantSku } = req.params;
    const { quantity = 1 } = req.query;

    const stockStatus = await InventorySyncService.isVariantInStock(
      productId,
      variantSku,
      parseInt(quantity)
    );

    res.json({
      success: true,
      stock: stockStatus,
    });
  } catch (error) {
    logger.error('Failed to check stock:', error);
    res.status(400).json({ error: 'Failed to check stock' });
  }
});

/**
 * GET /api/inventory/stocks/:productId
 * Get all variant stocks for a product
 */
router.get('/stocks/:productId', requireAuth, async (req, res) => {
  try {
    const { productId } = req.params;

    const stocks = await InventorySyncService.getVariantStocks(productId);

    res.json({
      success: true,
      stocks,
    });
  } catch (error) {
    logger.error('Failed to fetch variant stocks:', error);
    res.status(400).json({ error: 'Failed to fetch variant stocks' });
  }
});

/**
 * POST /api/inventory/deduct
 * Deduct stock for order (internal use)
 */
router.post('/deduct', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { productId, variantSku, quantity = 1 } = req.body;

    if (!productId || !variantSku) {
      return res.status(400).json({ error: 'Product ID and variant SKU are required' });
    }

    const result = await InventorySyncService.deductStock(productId, variantSku, quantity);

    res.json({
      success: true,
      result,
      message: 'Stock deducted successfully',
    });
  } catch (error) {
    logger.error('Failed to deduct stock:', error);
    res.status(400).json({ error: error.message || 'Failed to deduct stock' });
  }
});

/**
 * POST /api/inventory/restore
 * Restore stock for cancelled order (internal use)
 */
router.post('/restore', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { productId, variantSku, quantity = 1 } = req.body;

    if (!productId || !variantSku) {
      return res.status(400).json({ error: 'Product ID and variant SKU are required' });
    }

    const result = await InventorySyncService.restoreStock(productId, variantSku, quantity);

    res.json({
      success: true,
      result,
      message: 'Stock restored successfully',
    });
  } catch (error) {
    logger.error('Failed to restore stock:', error);
    res.status(400).json({ error: error.message || 'Failed to restore stock' });
  }
});

module.exports = router;
