'use strict';

/**
 * DESIGN-ORDER INTEGRATION
 * ────────────────────────
 * Helpers for integrating custom designs with order creation
 * Handles:
 * - Adding design data to order
 * - Preparing design for Qikink order submission
 * - Converting design to Qikink format
 */

const Design = require('../../design/models/Design');
const Order = require('../models/Order');
const designService = require('../../design/design.service');
const { logger } = require('../../auth/utils/logger');

class DesignOrderIntegration {
  /**
   * Add design to order during creation
   * @param {string} orderId - Order ID
   * @param {string} designId - Design ID
   * @param {string} userId - User ID (ownership verification)
   * @returns {object} Updated order
   */
  async addDesignToOrder(orderId, designId, userId) {
    try {
      // Get design with ownership check
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) {
        throw new Error('Design not found or not authorized');
      }

      // Get order
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      // Upload design to Qikink if needed
      if (!design.isUploadedToQikink) {
        await designService.uploadDesignToQikink(designId, userId);
        // Refresh design after upload
        const updatedDesign = await Design.findById(designId);
        design.qikinkDesignId = updatedDesign.qikinkDesignId;
        design.isUploadedToQikink = updatedDesign.isUploadedToQikink;
      }

      // Add design to order
      order.customDesign = {
        designId: design._id,
        qikinkDesignId: design.qikinkDesignId,
        imageUrl: design.designImageUrl,
        printArea: design.printArea,
        selectedColor: design.selectedColor,
        selectedSize: design.selectedSize,
        textLayers: design.textLayers,
      };

      await order.save();

      // Mark design as ordered
      design.status = 'ordered';
      await design.save();

      logger.info(`Design ${designId} added to order ${orderId}`);

      return order;
    } catch (err) {
      logger.error(`Add design to order error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get Qikink design payload from order
   * Formats order's custom design for Qikink API
   * @param {object} order - Order document
   * @returns {object} Qikink design format
   */
  async getQikinkDesignPayload(order) {
    try {
      if (!order.customDesign || !order.customDesign.qikinkDesignId) {
        return null;
      }

      const design = order.customDesign;

      const payload = {
        design_id: design.qikinkDesignId,
        print_area: design.printArea,
        color: design.selectedColor?.name || 'White',
        size: design.selectedSize || 'M',
      };

      // Add text layers if present
      if (design.textLayers && Array.isArray(design.textLayers) && design.textLayers.length > 0) {
        payload.text_layers = design.textLayers.map((layer) => ({
          text: layer.content,
          font_family: layer.fontFamily || 'Arial',
          font_size: layer.fontSize || 24,
          color: layer.color || '#000000',
          x: layer.positionX || 0,
          y: layer.positionY || 0,
        }));
      }

      return payload;
    } catch (err) {
      logger.error(`Get Qikink design payload error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Validate design before order creation
   * @param {string} designId - Design ID
   * @param {string} userId - User ID
   * @returns {object} Validation result
   */
  async validateDesignForOrder(designId, userId) {
    try {
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) {
        return { valid: false, error: 'Design not found or not authorized' };
      }

      if (design.status === 'ordered') {
        return { valid: false, error: 'Design has already been used in another order' };
      }

      if (!design.selectedSize) {
        return { valid: false, error: 'Please select a size for your design' };
      }

      if (!design.printArea) {
        return { valid: false, error: 'Please select a print area' };
      }

      return { valid: true, design };
    } catch (err) {
      logger.error(`Validate design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Enrich order items with design information
   * Updates item prices/variants based on design selections
   * @param {array} items - Order items
   * @param {object} design - Design document
   * @returns {array} Enriched items
   */
  async enrichItemsWithDesign(items, design) {
    try {
      return items.map((item) => {
        // Add design metadata to item
        item.customDesign = {
          designImageUrl: design.designImageUrl,
          printArea: design.printArea,
          selectedSize: design.selectedSize,
          selectedColor: design.selectedColor,
        };

        // Update item variant with design selections
        if (!item.variant) item.variant = {};
        item.variant.size = design.selectedSize || item.variant.size;
        item.variant.color = design.selectedColor || item.variant.color;

        return item;
      });
    } catch (err) {
      logger.error(`Enrich items with design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Create order with custom design
   * Complete flow: validate → create order → add design
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   * @param {string} designId - Design ID (optional)
   * @returns {object} Created order
   */
  async createOrderWithDesign(userId, orderData, designId = null) {
    try {
      // If design provided, validate it first
      if (designId) {
        const validation = await this.validateDesignForOrder(designId, userId);
        if (!validation.valid) {
          throw new Error(validation.error);
        }
      }

      // Create order (implementation in order service)
      // This is a helper; actual order creation happens in orderService
      // Return structure for order service to use

      return {
        withDesign: !!designId,
        designId,
        orderData,
      };
    } catch (err) {
      logger.error(`Create order with design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get design item variants
   * Returns available options for a product with custom design
   * @param {string} productId - Product ID
   * @returns {object} Design configuration options
   */
  async getDesignProductConfig(productId) {
    try {
      const [printAreas, colors, sizes] = await Promise.all([
        designService.getProductPrintAreas(productId),
        designService.getProductColors(productId),
        designService.getProductSizes(productId),
      ]);

      return {
        printAreas,
        colors,
        sizes,
        supported: true,
      };
    } catch (err) {
      logger.error(`Get design product config error: ${err.message}`);
      return {
        supported: false,
        error: err.message,
      };
    }
  }

  /**
   * Cancel design when order is cancelled
   * Revert design status back to 'ready'
   * @param {string} orderId - Order ID
   * @returns {boolean} Success
   */
  async cancelDesignFromOrder(orderId) {
    try {
      const order = await Order.findById(orderId).select('customDesign');

      if (!order || !order.customDesign || !order.customDesign.designId) {
        return false;
      }

      const design = await Design.findById(order.customDesign.designId);

      if (design && design.status === 'ordered') {
        design.status = 'ready';
        await design.save();

        logger.info(`Design ${design._id} reverted from order ${orderId}`);
      }

      return true;
    } catch (err) {
      logger.error(`Cancel design from order error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Copy order design to new design
   * For users who want to reuse/modify an ordered design
   * @param {string} orderId - Order ID
   * @param {string} userId - User ID
   * @param {string} newName - New design name
   * @returns {object} New design document
   */
  async copyOrderDesignToNew(orderId, userId, newName = 'Copy of Design') {
    try {
      const order = await Order.findById(orderId).select('customDesign user');

      if (!order || order.user.toString() !== userId) {
        throw new Error('Order not found or not authorized');
      }

      if (!order.customDesign || !order.customDesign.designId) {
        throw new Error('Order does not have a custom design');
      }

      const originalDesign = await Design.findById(order.customDesign.designId);

      if (!originalDesign) {
        throw new Error('Original design not found');
      }

      // Create new design as draft copy
      const newDesign = await Design.create({
        user: userId,
        name: newName,
        designImageUrl: originalDesign.designImageUrl,
        designPublicId: originalDesign.designPublicId,
        textLayers: JSON.parse(JSON.stringify(originalDesign.textLayers || [])),
        selectedSize: originalDesign.selectedSize,
        selectedColor: JSON.parse(JSON.stringify(originalDesign.selectedColor || {})),
        printArea: originalDesign.printArea,
        product: originalDesign.product,
        qikinkProductId: originalDesign.qikinkProductId,
        canvasState: originalDesign.canvasState,
        status: 'draft',
      });

      logger.info(`Design copied from order ${orderId} to new design ${newDesign._id}`);

      return newDesign;
    } catch (err) {
      logger.error(`Copy order design error: ${err.message}`);
      throw err;
    }
  }
}

module.exports = new DesignOrderIntegration();
