'use strict';

const axios = require('axios');
const Product = require('../../models/Product');
const logger = require('../../utils/logger');

/**
 * INVENTORY SYNC SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Sync inventory from Qikink and keep product stock up-to-date
 */

class InventorySyncService {
  constructor() {
    this.isRunning = false;
    this.lastSyncTime = null;
    this.syncInterval = null;
    this.batchSize = 50;
  }

  /**
   * Start automatic inventory sync
   */
  startAutoSync(intervalMs = 3600000) {
    // Default: sync every 1 hour
    if (this.isRunning) {
      logger.warn('Inventory sync already running');
      return;
    }

    this.isRunning = true;
    logger.info(`Starting inventory sync every ${intervalMs / 1000}s`);

    // Run immediately
    this.syncAllInventory();

    // Then run periodically
    this.syncInterval = setInterval(() => {
      this.syncAllInventory().catch(error => {
        logger.error('Scheduled inventory sync failed:', error);
      });
    }, intervalMs);
  }

  /**
   * Stop automatic inventory sync
   */
  stopAutoSync() {
    if (!this.isRunning) return;

    this.isRunning = false;
    clearInterval(this.syncInterval);
    this.syncInterval = null;
    logger.info('Inventory sync stopped');
  }

  /**
   * Sync all POD products from Qikink
   */
  async syncAllInventory() {
    try {
      logger.info('Starting full inventory sync');

      const podProducts = await Product.find({ isPOD: true });
      logger.info(`Found ${podProducts.length} POD products to sync`);

      let syncedCount = 0;
      let failedCount = 0;

      // Process in batches
      for (let i = 0; i < podProducts.length; i += this.batchSize) {
        const batch = podProducts.slice(i, i + this.batchSize);

        const results = await Promise.allSettled(
          batch.map(product => this.syncProductInventory(product))
        );

        results.forEach((result, index) => {
          if (result.status === 'fulfilled') {
            syncedCount++;
          } else {
            failedCount++;
            logger.error(`Failed to sync ${batch[index].name}:`, result.reason);
          }
        });
      }

      this.lastSyncTime = new Date();
      logger.info('Inventory sync completed', {
        synced: syncedCount,
        failed: failedCount,
        total: podProducts.length,
      });

      return { syncedCount, failedCount, totalCount: podProducts.length };
    } catch (error) {
      logger.error('Inventory sync failed:', error);
      throw error;
    }
  }

  /**
   * Sync inventory for a single product
   */
  async syncProductInventory(product) {
    if (!product.qikinkProductId) {
      logger.warn(`Product ${product._id} has no Qikink ID`);
      return { success: false, reason: 'No Qikink ID' };
    }

    try {
      // Fetch product details from Qikink API
      const qikinkProduct = await this.fetchQikinkProductDetails(product.qikinkProductId);

      if (!qikinkProduct) {
        logger.warn(`Qikink product ${product.qikinkProductId} not found`);
        return { success: false, reason: 'Product not found in Qikink' };
      }

      // Update product stock for each variant
      if (qikinkProduct.variants && Array.isArray(qikinkProduct.variants)) {
        product.variants.forEach(variant => {
          const qikinkVariant = qikinkProduct.variants.find(
            v => v.sku === variant.sku
          );

          if (qikinkVariant) {
            const oldStock = variant.stock;
            variant.stock = qikinkVariant.stock || 0;

            if (oldStock !== variant.stock) {
              logger.info(`Stock updated: ${product.name} - ${variant.sku}`, {
                old: oldStock,
                new: variant.stock,
              });
            }
          }
        });
      }

      // Update base product stock as total
      product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);
      product.lastInventorySyncAt = new Date();

      await product.save();

      return { success: true, product: product._id };
    } catch (error) {
      logger.error(`Inventory sync failed for product ${product._id}:`, error);
      return { success: false, reason: error.message };
    }
  }

  /**
   * Fetch product details from Qikink API
   */
  async fetchQikinkProductDetails(qikinkProductId, retries = 3) {
    const qikinkApiUrl = process.env.QIKINK_API_URL;
    const qikinkApiKey = process.env.QIKINK_API_KEY;

    if (!qikinkApiUrl || !qikinkApiKey) {
      logger.error('Qikink credentials not configured');
      return null;
    }

    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const response = await axios.get(
          `${qikinkApiUrl}/products/${qikinkProductId}`,
          {
            headers: { Authorization: `Bearer ${qikinkApiKey}` },
            timeout: 10000,
          }
        );

        return response.data.product;
      } catch (error) {
        logger.warn(
          `Qikink API request failed (attempt ${attempt}/${retries}):`,
          error.message
        );

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    return null;
  }

  /**
   * Sync specific product inventory
   */
  async syncProductById(productId) {
    try {
      const product = await Product.findById(productId);

      if (!product) {
        throw new Error('Product not found');
      }

      if (!product.isPOD) {
        throw new Error('Product is not a POD product');
      }

      const result = await this.syncProductInventory(product);
      return result;
    } catch (error) {
      logger.error('Failed to sync product inventory:', error);
      throw error;
    }
  }

  /**
   * Check if variant is in stock
   */
  async isVariantInStock(productId, variantSku, quantity = 1) {
    try {
      const product = await Product.findById(productId);

      if (!product || !product.isPOD) {
        return { inStock: true, reason: 'Non-POD product' };
      }

      const variant = product.variants.find(v => v.sku === variantSku);

      if (!variant) {
        return { inStock: false, reason: 'Variant not found' };
      }

      const available = variant.stock >= quantity;

      return {
        inStock: available,
        available: variant.stock,
        required: quantity,
        reason: available ? 'In stock' : 'Insufficient stock',
      };
    } catch (error) {
      logger.error('Stock check failed:', error);
      return { inStock: false, reason: 'Stock check error' };
    }
  }

  /**
   * Deduct stock after order
   */
  async deductStock(productId, variantSku, quantity = 1) {
    try {
      const product = await Product.findById(productId);

      if (!product || !product.isPOD) {
        return { success: true, reason: 'Non-POD product' };
      }

      const variant = product.variants.find(v => v.sku === variantSku);

      if (!variant) {
        throw new Error('Variant not found');
      }

      if (variant.stock < quantity) {
        throw new Error('Insufficient stock');
      }

      variant.stock -= quantity;
      product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);

      await product.save();

      logger.info('Stock deducted:', {
        product: product.name,
        variant: variantSku,
        quantity,
        remaining: variant.stock,
      });

      return { success: true, remainingStock: variant.stock };
    } catch (error) {
      logger.error('Stock deduction failed:', error);
      throw error;
    }
  }

  /**
   * Restore stock (for order cancellation)
   */
  async restoreStock(productId, variantSku, quantity = 1) {
    try {
      const product = await Product.findById(productId);

      if (!product || !product.isPOD) {
        return { success: true, reason: 'Non-POD product' };
      }

      const variant = product.variants.find(v => v.sku === variantSku);

      if (!variant) {
        throw new Error('Variant not found');
      }

      variant.stock += quantity;
      product.stock = product.variants.reduce((sum, v) => sum + (v.stock || 0), 0);

      await product.save();

      logger.info('Stock restored:', {
        product: product.name,
        variant: variantSku,
        quantity,
        newStock: variant.stock,
      });

      return { success: true, newStock: variant.stock };
    } catch (error) {
      logger.error('Stock restoration failed:', error);
      throw error;
    }
  }

  /**
   * Get stock status for all variants of a product
   */
  async getVariantStocks(productId) {
    try {
      const product = await Product.findById(productId);

      if (!product) {
        throw new Error('Product not found');
      }

      return {
        productId: product._id,
        productName: product.name,
        isPOD: product.isPOD,
        totalStock: product.stock,
        variants: product.variants.map(v => ({
          sku: v.sku,
          color: v.color?.name,
          size: v.size,
          stock: v.stock,
          price: v.additionalPrice,
        })),
        lastSyncAt: product.lastInventorySyncAt,
      };
    } catch (error) {
      logger.error('Failed to get variant stocks:', error);
      throw error;
    }
  }

  /**
   * Get sync status
   */
  getSyncStatus() {
    return {
      isRunning: this.isRunning,
      lastSyncTime: this.lastSyncTime,
      nextSyncEstimate: this.isRunning
        ? new Date(this.lastSyncTime.getTime() + 3600000)
        : null,
    };
  }

  /**
   * Force immediate sync (bypasses interval)
   */
  async forceSync() {
    try {
      logger.info('Force sync triggered');
      return await this.syncAllInventory();
    } catch (error) {
      logger.error('Force sync failed:', error);
      throw error;
    }
  }
}

module.exports = new InventorySyncService();
