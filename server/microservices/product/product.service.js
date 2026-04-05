'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const axios = require('axios');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * PRODUCT MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: product catalog, variants, reviews, Qikink sync, filtering
 */

// ─── Product Schema ───────────────────────────────────────────────────────
const productSchema = new mongoose.Schema({
  name: { type: String, required: true, index: true },
  slug: { type: String, required: true, unique: true },
  description: { type: String },
  category: { type: String, index: true },
  subCategory: { type: String },
  
  // Pricing
  basePrice: { type: Number, required: true }, // Qikink cost
  sellingPrice: { type: Number, required: true }, // Display price
  margin: { type: Number, default: 0 }, // Profit margin
  profit: { type: Number, default: 0 }, // Per unit profit

  // Inventory
  stock: { type: Number, default: 0 },
  isPOD: { type: Boolean, default: true }, // Print on Demand

  // Images
  images: [{ url: String, publicId: String }],
  thumbnail: String,

  // Variants
  variants: [{
    sku: String,
    color: { name: String, hexCode: String },
    size: String,
    stock: Number,
    additionalPrice: { type: Number, default: 0 },
    images: [String],
  }],

  // Qikink Integration
  qikinkProductId: { type: String, sparse: true, index: true },
  qikinkCatalogId: String,
  printAreas: [String], // 'front', 'back', 'left-sleeve', etc
  availableSizes: [String],
  availableColors: [{ name: String, hexCode: String }],

  // Design
  design: {
    designImageUrl: String,
    printArea: String,
    printWidth: Number,
    printHeight: Number,
    qikinkDesignId: String,
    mockupImages: [{ color: String, url: String, publicId: String }],
  },

  // Reviews & Ratings
  reviews: [{
    userId: mongoose.Schema.Types.ObjectId,
    rating: Number,
    title: String,
    content: String,
    images: [String],
    helpful: { type: Number, default: 0 },
    createdAt: Date,
  }],
  averageRating: { type: Number, default: 0 },
  reviewCount: { type: Number, default: 0 },

  // Seller Info
  sellerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  status: { type: String, enum: ['active', 'inactive', 'deleted'], default: 'active' },
  tags: [String],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

const Product = mongoose.model('Product', productSchema);

// ─── Product Service Class ───────────────────────────────────────────────
class ProductService extends MicroService {
  constructor() {
    super({
      name: 'product-service',
      port: process.env.PRODUCT_SERVICE_PORT || 3002,
      version: '1.0.0',
    });

    this.setupRoutes();
  }

  /**
   * Setup product routes
   */
  setupRoutes() {
    // Get all products (with filters, pagination, sorting)
    this.app.get('/api/products', async (req, res, next) => {
      try {
        const {
          page = 1,
          limit = 20,
          category,
          minPrice,
          maxPrice,
          sort = '-createdAt',
          search,
        } = req.query;

        const skip = (page - 1) * limit;
        const query = { status: 'active' };

        if (category) query.category = category;
        if (minPrice || maxPrice) {
          query.sellingPrice = {};
          if (minPrice) query.sellingPrice.$gte = parseInt(minPrice);
          if (maxPrice) query.sellingPrice.$lte = parseInt(maxPrice);
        }
        if (search) {
          query.$or = [
            { name: { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
          ];
        }

        const products = await Product.find(query)
          .select('-reviews')
          .sort(sort)
          .skip(skip)
          .limit(parseInt(limit));

        const total = await Product.countDocuments(query);

        res.json({
          success: true,
          products,
          pagination: { page, limit, total, pages: Math.ceil(total / limit) },
        });
      } catch (error) {
        next(error);
      }
    });

    // Get product by ID
    this.app.get('/api/products/:id', async (req, res, next) => {
      try {
        const product = await Product.findById(req.params.id);

        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        res.json({
          success: true,
          product,
        });
      } catch (error) {
        next(error);
      }
    });

    // Search products
    this.app.get('/api/products/search/query', async (req, res, next) => {
      try {
        const { q, limit = 10 } = req.query;

        if (!q) {
          return res.status(400).json({ error: 'Search query required' });
        }

        const products = await Product.find(
          {
            $text: { $search: q },
            status: 'active',
          },
          { score: { $meta: 'textScore' } }
        )
          .sort({ score: { $meta: 'textScore' } })
          .limit(parseInt(limit));

        res.json({
          success: true,
          results: products,
        });
      } catch (error) {
        next(error);
      }
    });

    // Get product categories
    this.app.get('/api/products/categories', async (req, res, next) => {
      try {
        const categories = await Product.distinct('category', { status: 'active' });

        res.json({
          success: true,
          categories,
        });
      } catch (error) {
        next(error);
      }
    });

    // Create product (seller/admin)
    this.app.post('/api/products', requireAuth, async (req, res, next) => {
      try {
        const { name, description, category, basePrice, sellingPrice, images } = req.body;

        if (!name || !basePrice || !sellingPrice) {
          return res.status(400).json({
            error: 'Name, basePrice, and sellingPrice are required',
          });
        }

        const slug = name.toLowerCase().replace(/\s+/g, '-');
        const margin = Math.round(((sellingPrice - basePrice) / basePrice) * 100);

        const product = new Product({
          name,
          slug,
          description,
          category,
          basePrice,
          sellingPrice,
          margin,
          profit: sellingPrice - basePrice,
          images: images || [],
          sellerId: req.user.id,
          status: req.user.role === 'admin' ? 'active' : 'inactive',
        });

        await product.save();

        res.status(201).json({
          success: true,
          product,
          message: 'Product created successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Update product
    this.app.put('/api/products/:id', requireAuth, async (req, res, next) => {
      try {
        const product = await Product.findById(req.params.id);

        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        if (product.sellerId.toString() !== req.user.id && req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Unauthorized' });
        }

        Object.assign(product, req.body);
        product.updatedAt = new Date();

        await product.save();

        res.json({
          success: true,
          product,
          message: 'Product updated successfully',
        });
      } catch (error) {
        next(error);
      }
    });

    // Add product review
    this.app.post('/api/products/:id/reviews', requireAuth, async (req, res, next) => {
      try {
        const { rating, title, content } = req.body;

        if (!rating || rating < 1 || rating > 5) {
          return res.status(400).json({ error: 'Rating must be between 1 and 5' });
        }

        const product = await Product.findById(req.params.id);

        if (!product) {
          return res.status(404).json({ error: 'Product not found' });
        }

        const review = {
          userId: req.user.id,
          rating,
          title,
          content,
          createdAt: new Date(),
        };

        product.reviews.push(review);

        // Update average rating
        const totalRating = product.reviews.reduce((sum, r) => sum + r.rating, 0);
        product.averageRating = (totalRating / product.reviews.length).toFixed(1);
        product.reviewCount = product.reviews.length;

        await product.save();

        res.status(201).json({
          success: true,
          message: 'Review added successfully',
          averageRating: product.averageRating,
        });
      } catch (error) {
        next(error);
      }
    });

    // Sync products from Qikink
    this.app.post('/api/products/qikink/sync', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const qikinkUrl = process.env.QIKINK_API_URL;
        const qikinkKey = process.env.QIKINK_API_KEY;

        if (!qikinkUrl || !qikinkKey) {
          return res.status(500).json({ error: 'Qikink credentials not configured' });
        }

        // Fetch products from Qikink
        const response = await axios.get(`${qikinkUrl}/products`, {
          headers: { Authorization: `Bearer ${qikinkKey}` },
        });

        let synced = 0;
        let skipped = 0;

        for (const qikinkProduct of response.data.products) {
          const existingProduct = await Product.findOne({
            qikinkProductId: qikinkProduct.id,
          });

          if (existingProduct) {
            skipped++;
            continue;
          }

          // Create new product
          const product = new Product({
            name: qikinkProduct.name,
            slug: qikinkProduct.name.toLowerCase().replace(/\s+/g, '-'),
            description: qikinkProduct.description,
            basePrice: qikinkProduct.basePrice,
            sellingPrice: qikinkProduct.basePrice + (qikinkProduct.basePrice * 0.3), // 30% margin
            margin: 30,
            profit: qikinkProduct.basePrice * 0.3,
            images: qikinkProduct.images || [],
            qikinkProductId: qikinkProduct.id,
            availableSizes: qikinkProduct.sizes || [],
            availableColors: qikinkProduct.colors || [],
            printAreas: qikinkProduct.printAreas || [],
            isPOD: true,
            status: 'active',
          });

          await product.save();
          synced++;
        }

        res.json({
          success: true,
          message: 'Sync completed',
          synced,
          skipped,
        });

        logger.info(`Qikink sync: ${synced} products synced, ${skipped} skipped`);
      } catch (error) {
        next(error);
      }
    });

    // Get product stats (admin)
    this.app.get('/api/products/admin/stats', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const totalProducts = await Product.countDocuments({ status: 'active' });
        const totalRevenue = await Product.aggregate([
          { $match: { status: 'active' } },
          { $group: { _id: null, total: { $sum: '$profit' } } },
        ]);

        const topProducts = await Product.find({ status: 'active' })
          .sort('-reviewCount')
          .limit(10)
          .select('name reviews Count sellingPrice');

        res.json({
          success: true,
          stats: {
            totalProducts,
            totalPotentialRevenue: totalRevenue[0]?.total || 0,
            topProducts,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start product service with database
   */
  async startWithDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kavox');
      logger.info('✓ Connected to MongoDB');

      // Create text index for search
      await Product.collection.createIndex({ name: 'text', description: 'text' });

      this.addHealthCheck(mongoose);
      this.start();
    } catch (error) {
      logger.error('Failed to connect to MongoDB:', error);
      process.exit(1);
    }
  }
}

// ─── Start Service ────────────────────────────────────────────────────────
if (require.main === module) {
  const productService = new ProductService();
  productService.startWithDatabase();
}

module.exports = ProductService;
