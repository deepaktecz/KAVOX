'use strict';

/**
 * DESIGN SERVICE
 * ──────────────
 * Business logic for custom design builder
 * Handles:
 * - Design CRUD operations
 * - Cloudinary integration
 * - Qikink design upload
 * - Order integration
 * - Canvas state management
 */

const cloudinary = require('cloudinary').v2;
const axios = require('axios');
const Design = require('./models/Design');
const Product = require('../product/models/Product');
const Order = require('../order/models/Order');
const { logger } = require('../auth/utils/logger');

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ═══════════════════════════════════════════════════════════════
// DESIGN SERVICE CLASS
// ═══════════════════════════════════════════════════════════════

class DesignService {
  /**
   * Create a new design with image upload to Cloudinary
   * @param {string} userId - User ID
   * @param {object} designData - Design metadata
   * @param {buffer} imageBuffer - Image file buffer
   * @returns {object} Created design
   */
  async createDesign(userId, designData, imageBuffer) {
    try {
      const {
        name = 'My Design',
        productId,
        qikinkProductId,
        selectedSize,
        selectedColor,
        printArea = 'front',
        textLayers = [],
        canvasState,
      } = designData;

      // Validate product if provided
      if (productId) {
        const product = await Product.findById(productId).select('_id isPOD qikinkProductId status');
        if (!product) throw new Error('Product not found');
        if (product.status !== 'active') throw new Error('Product is not active');
      }

      // Upload design image to Cloudinary
      const cloudinaryResult = await this._uploadToCloudinary(imageBuffer, 'kavox/designs');

      // Parse color if necessary
      let parsedColor = null;
      if (selectedColor) {
        if (typeof selectedColor === 'string') {
          parsedColor = { name: selectedColor };
        } else {
          parsedColor = selectedColor;
        }
      }

      // Create design document
      const design = await Design.create({
        user: userId,
        name,
        designImageUrl: cloudinaryResult.secure_url,
        designPublicId: cloudinaryResult.public_id,
        textLayers: Array.isArray(textLayers) ? textLayers : [],
        selectedSize,
        selectedColor: parsedColor,
        printArea,
        product: productId || undefined,
        qikinkProductId: qikinkProductId || undefined,
        canvasState: canvasState || null,
        status: 'draft',
      });

      logger.info(`Design created: ${design._id} by user ${userId}`);
      return design;
    } catch (err) {
      logger.error(`Create design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get user's designs with pagination
   * @param {string} userId - User ID
   * @param {object} filters - Status, product filters
   * @param {number} page - Page number
   * @param {number} limit - Items per page
   * @returns {object} Designs with pagination metadata
   */
  async getUserDesigns(userId, filters = {}, page = 1, limit = 12) {
    try {
      const skip = (page - 1) * limit;
      const query = { user: userId };

      if (filters.status) query.status = filters.status;
      if (filters.productId) query.product = filters.productId;
      if (filters.isUploadedToQikink !== undefined) query.isUploadedToQikink = filters.isUploadedToQikink;

      const [designs, total] = await Promise.all([
        Design.find(query)
          .sort({ createdAt: -1 })
          .skip(skip)
          .limit(parseInt(limit))
          .populate('product', 'name slug images sellingPrice basePrice')
          .lean(),
        Design.countDocuments(query),
      ]);

      return {
        designs,
        pagination: {
          total,
          page: parseInt(page),
          limit: parseInt(limit),
          pages: Math.ceil(total / limit),
        },
      };
    } catch (err) {
      logger.error(`Get user designs error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get single design with ownership check
   * @param {string} designId - Design ID
   * @param {string} userId - User ID (for ownership check)
   * @returns {object} Design document
   */
  async getDesign(designId, userId) {
    try {
      const design = await Design.findOne({ _id: designId, user: userId }).populate(
        'product',
        'name slug images sellingPrice basePrice qikinkProductId'
      );

      if (!design) throw new Error('Design not found or not authorized');
      return design;
    } catch (err) {
      logger.error(`Get design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Update design (text, color, size, canvas state)
   * @param {string} designId - Design ID
   * @param {string} userId - User ID (ownership check)
   * @param {object} updateData - Fields to update
   * @returns {object} Updated design
   */
  async updateDesign(designId, userId, updateData) {
    try {
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) throw new Error('Design not found or not authorized');

      // Can't edit ordered designs
      if (design.status === 'ordered') {
        throw new Error('Cannot edit a design that has already been ordered');
      }

      const {
        name,
        selectedSize,
        selectedColor,
        printArea,
        textLayers,
        canvasState,
        status,
      } = updateData;

      if (name !== undefined) design.name = name;
      if (selectedSize !== undefined) design.selectedSize = selectedSize;
      if (selectedColor !== undefined) design.selectedColor = selectedColor;
      if (printArea !== undefined) design.printArea = printArea;
      if (textLayers !== undefined) design.textLayers = textLayers;
      if (canvasState !== undefined) design.canvasState = canvasState;

      // Only allow status change to 'draft' or 'ready'
      if (status && ['draft', 'ready'].includes(status)) {
        design.status = status;
      }

      await design.save();

      logger.info(`Design ${designId} updated by user ${userId}`);
      return design;
    } catch (err) {
      logger.error(`Update design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Delete design (remove from Cloudinary and DB)
   * @param {string} designId - Design ID
   * @param {string} userId - User ID (ownership check)
   * @returns {boolean} Success
   */
  async deleteDesign(designId, userId) {
    try {
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) throw new Error('Design not found or not authorized');

      if (design.status === 'ordered') {
        throw new Error('Cannot delete a design that has been used in an order');
      }

      // Clean up Cloudinary assets
      try {
        if (design.designPublicId) await cloudinary.uploader.destroy(design.designPublicId);
        if (design.previewPublicId) await cloudinary.uploader.destroy(design.previewPublicId);
      } catch (cdnErr) {
        logger.warn(`Cloudinary cleanup warning for design ${designId}: ${cdnErr.message}`);
      }

      await design.deleteOne();

      logger.info(`Design ${designId} deleted by user ${userId}`);
      return true;
    } catch (err) {
      logger.error(`Delete design error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Upload design to Qikink platform
   * Gets Qikink design ID for use in orders
   * @param {string} designId - Design ID
   * @param {string} userId - User ID (ownership check)
   * @returns {object} Design with qikinkDesignId
   */
  async uploadDesignToQikink(designId, userId) {
    try {
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) throw new Error('Design not found or not authorized');

      // Don't re-upload if already on Qikink
      if (design.isUploadedToQikink && design.qikinkDesignId) {
        logger.info(`Design ${designId} already uploaded to Qikink`);
        return design;
      }

      const QIKINK_BASE = process.env.QIKINK_BASE_URL || 'https://api.qikink.com';
      const QIKINK_KEY = process.env.QIKINK_API_KEY;

      if (!QIKINK_KEY) {
        throw new Error('Qikink API not configured');
      }

      // Build Qikink design payload
      const payload = {
        design_url: design.designImageUrl,
        print_area: design.printArea,
        external_reference: design._id.toString(),
      };

      if (design.selectedColor?.name) {
        payload.color = design.selectedColor.name;
      }
      if (design.qikinkProductId) {
        payload.product_id = design.qikinkProductId;
      }

      // Text layers for Qikink
      if (design.textLayers && design.textLayers.length > 0) {
        payload.text_layers = design.textLayers.map((layer) => ({
          text: layer.content,
          font_family: layer.fontFamily,
          font_size: layer.fontSize,
          color: layer.color,
          x: layer.positionX,
          y: layer.positionY,
          rotation: layer.rotation,
        }));
      }

      const response = await axios.post(`${QIKINK_BASE}/v2/designs`, payload, {
        headers: {
          Authorization: `Bearer ${QIKINK_KEY}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      });

      // Extract design ID from response
      const qikinkDesignId = response.data.design_id || response.data.id || response.data.data?.id;

      if (!qikinkDesignId) {
        throw new Error('No design ID returned from Qikink');
      }

      // Update design document
      design.qikinkDesignId = qikinkDesignId;
      design.isUploadedToQikink = true;
      design.status = 'ready';
      await design.save();

      logger.info(`Design ${designId} uploaded to Qikink: ${qikinkDesignId}`);
      return design;
    } catch (err) {
      logger.error(`Upload to Qikink error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Link design to order
   * Called when user places order with custom design
   * @param {string} orderId - Order ID
   * @param {string} designId - Design ID
   * @param {string} userId - User ID (ownership check)
   * @returns {object} Order with design linked
   */
  async linkDesignToOrder(orderId, designId, userId) {
    try {
      // Validate design ownership
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) throw new Error('Design not found or not authorized');

      // Upload to Qikink if not already done
      if (!design.isUploadedToQikink) {
        await this.uploadDesignToQikink(designId, userId);
      }

      // Fetch updated design
      const updatedDesign = await Design.findById(designId);

      // Update order: add design reference + Qikink design ID
      const order = await Order.findByIdAndUpdate(
        orderId,
        {
          customDesign: {
            designId: designId,
            qikinkDesignId: updatedDesign.qikinkDesignId,
            imageUrl: updatedDesign.designImageUrl,
            printArea: updatedDesign.printArea,
            selectedColor: updatedDesign.selectedColor,
            selectedSize: updatedDesign.selectedSize,
            textLayers: updatedDesign.textLayers,
          },
        },
        { new: true }
      );

      // Mark design as ordered
      design.status = 'ordered';
      await design.save();

      logger.info(`Design ${designId} linked to order ${orderId}`);
      return order;
    } catch (err) {
      logger.error(`Link design to order error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Generate design preview/mockup
   * Renders design on product image
   * @param {string} designId - Design ID
   * @param {string} userId - User ID
   * @returns {object} Design with preview URL
   */
  async generatePreview(designId, userId) {
    try {
      const design = await Design.findOne({ _id: designId, user: userId });

      if (!design) throw new Error('Design not found or not authorized');

      // If already has preview, return it
      if (design.previewImageUrl) {
        return design;
      }

      // use Cloudinary transformations to create preview
      const previewUrl = cloudinary.url(design.designPublicId, {
        transformation: [
          { width: 500, height: 500, crop: 'fit' },
          { quality: 'auto', fetch_format: 'auto' },
        ],
      });

      design.previewImageUrl = previewUrl;
      await design.save();

      logger.info(`Preview generated for design ${designId}`);
      return design;
    } catch (err) {
      logger.error(`Generate preview error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get design analytics
   * Count designs created, uploaded to Qikink, used in orders
   * @param {string} userId - User ID
   * @returns {object} Design statistics
   */
  async getDesignStats(userId) {
    try {
      const [
        totalDesigns,
        draftDesigns,
        readyDesigns,
        orderedDesigns,
        qikinkUploaded,
      ] = await Promise.all([
        Design.countDocuments({ user: userId }),
        Design.countDocuments({ user: userId, status: 'draft' }),
        Design.countDocuments({ user: userId, status: 'ready' }),
        Design.countDocuments({ user: userId, status: 'ordered' }),
        Design.countDocuments({ user: userId, isUploadedToQikink: true }),
      ]);

      return {
        totalDesigns,
        draftDesigns,
        readyDesigns,
        orderedDesigns,
        uploadedToQikink: qikinkUploaded,
        readyForOrder: readyDesigns + orderedDesigns,
      };
    } catch (err) {
      logger.error(`Get design stats error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get recommended print areas for product
   * @param {string} productId - Product ID
   * @returns {array} Print area options
   */
  async getProductPrintAreas(productId) {
    try {
      const product = await Product.findById(productId).select('printAreas');

      if (!product) throw new Error('Product not found');

      // Default areas for print-on-demand
      const defaultAreas = ['front', 'back', 'left-sleeve', 'right-sleeve', 'front-back'];

      return product.printAreas || defaultAreas;
    } catch (err) {
      logger.error(`Get product print areas error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get color options for design
   * @param {string} productId - Product ID
   * @returns {array} Color options
   */
  async getProductColors(productId) {
    try {
      const product = await Product.findById(productId).select('colors availableColors');

      if (!product) throw new Error('Product not found');

      // Default colors
      const defaultColors = [
        { name: 'White', hexCode: '#FFFFFF' },
        { name: 'Black', hexCode: '#000000' },
        { name: 'Red', hexCode: '#FF0000' },
        { name: 'Navy', hexCode: '#000080' },
        { name: 'Navy Blue', hexCode: '#001F3F' },
      ];

      return product.colors || product.availableColors || defaultColors;
    } catch (err) {
      logger.error(`Get product colors error: ${err.message}`);
      throw err;
    }
  }

  /**
   * Get size options for design
   * @param {string} productId - Product ID
   * @returns {array} Size options
   */
  async getProductSizes(productId) {
    try {
      const product = await Product.findById(productId).select('sizes availableSizes');

      if (!product) throw new Error('Product not found');

      // Default sizes
      const defaultSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL'];

      return product.sizes || product.availableSizes || defaultSizes;
    } catch (err) {
      logger.error(`Get product sizes error: ${err.message}`);
      throw err;
    }
  }

  // ═══════════════════════════════════════════════════════════════
  // HELPER METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Upload image buffer to Cloudinary
   * @private
   * @param {buffer} imageBuffer - Image file buffer
   * @param {string} folder - Cloudinary folder path
   * @returns {object} Cloudinary upload result
   */
  async _uploadToCloudinary(imageBuffer, folder) {
    return new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
      stream.end(imageBuffer);
    });
  }

  /**
   * Validate design data
   * @private
   * @param {object} designData - Design metadata
   * @returns {object} Validation error or null
   */
  _validateDesignData(designData) {
    const errors = [];

    if (!designData.selectedSize) errors.push('Size is required');
    if (!designData.selectedColor) errors.push('Color is required');
    if (!designData.printArea) errors.push('Print area is required');

    return errors.length > 0 ? { valid: false, errors } : { valid: true };
  }
}

module.exports = new DesignService();
