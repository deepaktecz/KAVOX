'use strict';

require('dotenv').config();
const mongoose = require('mongoose');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');
const { requireAuth } = require('../../middleware/security.middleware');

/**
 * RECOMMENDATION MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: AI recommendations, collaborative filtering, frequently bought together
 */

// ─── User Interaction Schema ───────────────────────────────────────────────
const interactionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  productId: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  
  interactionType: { type: String, enum: ['view', 'click', 'add-to-cart', 'purchase', 'wishlist'], required: true },
  weight: {
    type: Number,
    default: function() {
      const weights = { view: 1, click: 2, 'add-to-cart': 3, purchase: 5, wishlist: 4 };
      return weights[this.interactionType] || 1;
    },
  },

  createdAt: { type: Date, default: Date.now, index: true },
});

const Interaction = mongoose.model('Interaction', interactionSchema);

// ─── Product Pair Schema (for frequently bought together) ───────────────
const productPairSchema = new mongoose.Schema({
  product1Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  product2Id: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true, index: true },
  
  frequency: { type: Number, default: 1 },
  coOccurrenceRate: { type: Number, default: 0 }, // Percentage of times bought together
  
  lastUpdated: { type: Date, default: Date.now },
});

const ProductPair = mongoose.model('ProductPair', productPairSchema);

// ─── Recommendation Cache ───────────────────────────────────────────────
const recommendationCacheSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  recommendations: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Product' }],
  type: { type: String, enum: ['collaborative', 'content', 'trending', 'frequently-bought'] },
  
  createdAt: { type: Date, default: Date.now, expires: 86400 }, // 24 hour TTL
});

const RecommendationCache = mongoose.model('RecommendationCache', recommendationCacheSchema);

// ─── Recommendation Service Class ───────────────────────────────────────
class RecommendationService extends MicroService {
  constructor() {
    super({
      name: 'recommendation-service',
      port: process.env.RECOMMENDATION_SERVICE_PORT || 3007,
      version: '1.0.0',
    });

    this.setupRoutes();
  }

  /**
   * Calculate cosine similarity between two users
   */
  cosineSimilarity(vec1, vec2) {
    const dotProduct = Object.keys(vec1).reduce((sum, key) => sum + (vec1[key] || 0) * (vec2[key] || 0), 0);
    const norm1 = Math.sqrt(Object.values(vec1).reduce((sum, val) => sum + val * val, 0));
    const norm2 = Math.sqrt(Object.values(vec2).reduce((sum, val) => sum + val * val, 0));

    return norm1 && norm2 ? dotProduct / (norm1 * norm2) : 0;
  }

  /**
   * Get user interaction vector
   */
  async getUserInteractionVector(userId) {
    const interactions = await Interaction.find({ userId }).populate('productId');

    const vector = {};
    interactions.forEach(i => {
      vector[i.productId._id.toString()] = (vector[i.productId._id.toString()] || 0) + i.weight;
    });

    return vector;
  }

  /**
   * Collaborative filtering: Find similar users
   */
  async findSimilarUsers(userId, limit = 10) {
    const targetVector = await this.getUserInteractionVector(userId);

    const allUsers = await Interaction.distinct('userId');
    const similarities = [];

    for (const otherUserId of allUsers) {
      if (otherUserId.equals(userId)) continue;

      const otherVector = await this.getUserInteractionVector(otherUserId);
      const similarity = this.cosineSimilarity(targetVector, otherVector);

      if (similarity > 0.5) {
        similarities.push({ userId: otherUserId, similarity });
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity).slice(0, limit);
  }

  /**
   * Get recommendations using collaborative filtering
   */
  async getCollaborativeRecommendations(userId, limit = 10) {
    const userInteractions = await Interaction.find({ userId }).select('productId');
    const userProducts = userInteractions.map(i => i.productId.toString());

    // Find similar users
    const similarUsers = await this.findSimilarUsers(userId, 5);

    if (similarUsers.length === 0) {
      return [];
    }

    // Get products that similar users liked but target user hasn't seen
    const similarUserIds = similarUsers.map(u => u.userId);
    const recommendedProducts = await Interaction.aggregate([
      { $match: { userId: { $in: similarUserIds }, interactionType: { $in: ['purchase', 'wishlist'] } } },
      { $group: { _id: '$productId', score: { $sum: '$weight' } } },
      { $sort: { score: -1 } },
      { $limit: limit * 2 },
    ]);

    return recommendedProducts
      .filter(p => !userProducts.includes(p._id.toString()))
      .slice(0, limit)
      .map(p => p._id);
  }

  /**
   * Get frequently bought together
   */
  async getFrequentlyBoughtTogether(productId, limit = 5) {
    const pairs = await ProductPair.find({
      $or: [{ product1Id: productId }, { product2Id: productId }],
    })
      .sort('-coOccurrenceRate')
      .limit(limit);

    return pairs.map(p => (p.product1Id.toString() === productId.toString() ? p.product2Id : p.product1Id));
  }

  /**
   * Get trending products
   */
  async getTrendingProducts(limit = 10) {
    const now = new Date();
    const sevenDaysAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const trendingProducts = await Interaction.aggregate([
      { $match: { createdAt: { $gte: sevenDaysAgo }, interactionType: { $in: ['view', 'purchase'] } } },
      { $group: { _id: '$productId', score: { $sum: '$weight' } } },
      { $sort: { score: -1 } },
      { $limit: limit },
    ]);

    return trendingProducts.map(p => p._id);
  }

  /**
   * Setup recommendation routes
   */
  setupRoutes() {
    // Get recommendations for user
    this.app.get('/api/recommendations/user', requireAuth, async (req, res, next) => {
      try {
        const { limit = 10 } = req.query;

        // Check cache first
        const cached = await RecommendationCache.findOne({
          userId: req.user.id,
          type: 'collaborative',
        });

        if (cached) {
          return res.json({ success: true, recommendations: cached.recommendations, source: 'cache' });
        }

        // Get collaborative recommendations
        const recommendations = await this.getCollaborativeRecommendations(req.user.id, parseInt(limit));

        // Cache results
        if (recommendations.length > 0) {
          await RecommendationCache.create({
            userId: req.user.id,
            recommendations,
            type: 'collaborative',
          });
        }

        res.json({ success: true, recommendations, source: 'computed' });
      } catch (error) {
        next(error);
      }
    });

    // Get frequently bought together
    this.app.get('/api/recommendations/frequently-bought/:productId', async (req, res, next) => {
      try {
        const { limit = 5 } = req.query;

        const products = await this.getFrequentlyBoughtTogether(req.params.productId, parseInt(limit));

        res.json({ success: true, products });
      } catch (error) {
        next(error);
      }
    });

    // Get trending products
    this.app.get('/api/recommendations/trending', async (req, res, next) => {
      try {
        const { limit = 10 } = req.query;

        const products = await this.getTrendingProducts(parseInt(limit));

        res.json({ success: true, products });
      } catch (error) {
        next(error);
      }
    });

    // Track user interaction (internal - called by other services)
    this.app.post('/api/recommendations/track', async (req, res, next) => {
      try {
        const { userId, productId, interactionType } = req.body;

        if (!userId || !productId || !interactionType) {
          return res.status(400).json({ error: 'Missing required fields' });
        }

        // Record interaction
        const interaction = new Interaction({
          userId,
          productId,
          interactionType,
        });

        await interaction.save();

        // If purchase, update product pairs
        if (interactionType === 'purchase') {
          const userOrders = await Interaction.find({
            userId,
            interactionType: 'purchase',
          }).select('productId');

          for (let i = 0; i < userOrders.length - 1; i++) {
            for (let j = i + 1; j < userOrders.length; j++) {
              const product1 = userOrders[i].productId.toString();
              const product2 = userOrders[j].productId.toString();

              let pair = await ProductPair.findOne({
                $or: [
                  { product1Id: product1, product2Id: product2 },
                  { product1Id: product2, product2Id: product1 },
                ],
              });

              if (!pair) {
                pair = new ProductPair({
                  product1Id: product1,
                  product2Id: product2,
                  frequency: 1,
                });
              } else {
                pair.frequency++;
              }

              // Calculate co-occurrence rate
              const totalOrders = await Interaction.countDocuments({
                productId: product1,
                interactionType: 'purchase',
              });

              pair.coOccurrenceRate = (pair.frequency / totalOrders) * 100;
              pair.lastUpdated = new Date();

              await pair.save();
            }
          }
        }

        res.json({ success: true, message: 'Interaction tracked' });
      } catch (error) {
        next(error);
      }
    });

    // Get user interactions (for debugging)
    this.app.get('/api/recommendations/user/interactions', requireAuth, async (req, res, next) => {
      try {
        const { limit = 20 } = req.query;

        const interactions = await Interaction.find({ userId: req.user.id })
          .populate('productId', 'name sellingPrice thumbnail')
          .sort('-createdAt')
          .limit(parseInt(limit));

        res.json({ success: true, interactions });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Get stats
    this.app.get('/api/recommendations/admin/stats', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const totalInteractions = await Interaction.countDocuments();
        const totalUsers = await Interaction.distinct('userId');
        const totalProducts = await Interaction.distinct('productId');
        const interactionTypes = await Interaction.aggregate([
          { $group: { _id: '$interactionType', count: { $sum: 1 } } },
        ]);

        res.json({
          success: true,
          stats: {
            totalInteractions,
            totalUsers: totalUsers.length,
            totalProducts: totalProducts.length,
            interactionTypes,
          },
        });
      } catch (error) {
        next(error);
      }
    });

    // Admin: Rebuild recommendation cache
    this.app.post('/api/recommendations/admin/rebuild-cache', requireAuth, async (req, res, next) => {
      try {
        if (req.user.role !== 'admin') {
          return res.status(403).json({ error: 'Admin access required' });
        }

        const users = await Interaction.distinct('userId');
        let cached = 0;

        for (const userId of users) {
          const recommendations = await this.getCollaborativeRecommendations(userId, 10);

          if (recommendations.length > 0) {
            await RecommendationCache.updateOne(
              { userId, type: 'collaborative' },
              {
                userId,
                recommendations,
                type: 'collaborative',
              },
              { upsert: true }
            );
            cached++;
          }
        }

        res.json({
          success: true,
          message: `Cache rebuilt for ${cached} users`,
        });
      } catch (error) {
        next(error);
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start recommendation service with database
   */
  async startWithDatabase() {
    try {
      await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/kavox');
      logger.info('✓ Connected to MongoDB');

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
  const recommendationService = new RecommendationService();
  recommendationService.startWithDatabase();
}

module.exports = RecommendationService;
