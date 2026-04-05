'use strict';

require('dotenv').config();
const { Client } = require('@elastic/elasticsearch');
const logger = require('../../utils/logger');
const MicroService = require('../base/microservice.base.js');

/**
 * SEARCH MICROSERVICE
 * ═════════════════════════════════════════════════════════════════════════════
 * Handles: Full-text search, autocomplete, typo correction, filters, suggestions
 */

// ─── Search Service Class ───────────────────────────────────────────────
class SearchService extends MicroService {
  constructor() {
    super({
      name: 'search-service',
      port: process.env.SEARCH_SERVICE_PORT || 3006,
      version: '1.0.0',
    });

    // Initialize Elasticsearch client
    this.esClient = new Client({
      node: process.env.ELASTICSEARCH_URL || 'http://localhost:9200',
      requestTimeout: 30000,
    });

    this.indexName = 'products';
    this.initializeIndex();
    this.setupRoutes();
  }

  /**
   * Initialize Elasticsearch index with mapping
   */
  async initializeIndex() {
    try {
      const indexExists = await this.esClient.indices.exists({ index: this.indexName });

      if (!indexExists) {
        await this.esClient.indices.create({
          index: this.indexName,
          body: {
            settings: {
              number_of_shards: 1,
              number_of_replicas: 0,
              analysis: {
                analyzer: {
                  autocomplete_analyzer: {
                    type: 'custom',
                    tokenizer: 'standard',
                    filter: ['lowercase', 'stop'],
                  },
                },
                normalizer: {
                  lowercase_normalizer: {
                    type: 'custom',
                    filter: ['lowercase'],
                  },
                },
              },
            },
            mappings: {
              properties: {
                productId: { type: 'keyword' },
                name: {
                  type: 'text',
                  fields: {
                    keyword: { type: 'keyword' },
                    autocomplete: { type: 'text', analyzer: 'autocomplete_analyzer' },
                  },
                },
                description: { type: 'text' },
                category: { type: 'keyword' },
                subCategory: { type: 'keyword' },
                tags: { type: 'keyword' },
                price: { type: 'float' },
                rating: { type: 'float' },
                reviews: { type: 'integer' },
                stock: { type: 'integer' },
                seller: { type: 'keyword' },
                thumbnail: { type: 'keyword' },
                colors: { type: 'keyword' },
                sizes: { type: 'keyword' },
                isPOD: { type: 'boolean' },
                createdAt: { type: 'date' },
              },
            },
          },
        });

        logger.info(`✓ Created Elasticsearch index: ${this.indexName}`);
      }
    } catch (error) {
      logger.error('Failed to initialize Elasticsearch index:', error);
    }
  }

  /**
   * Index a product in Elasticsearch
   */
  async indexProduct(product) {
    try {
      await this.esClient.index({
        index: this.indexName,
        id: product._id.toString(),
        body: {
          productId: product._id,
          name: product.name,
          description: product.description,
          category: product.category,
          subCategory: product.subCategory,
          tags: product.tags || [],
          price: product.sellingPrice,
          rating: product.averageRating || 0,
          reviews: product.reviewCount || 0,
          stock: product.stock,
          seller: product.sellerId?.toString(),
          thumbnail: product.thumbnail,
          colors: product.availableColors?.map(c => c.name) || [],
          sizes: product.availableSizes || [],
          isPOD: product.isPOD,
          createdAt: product.createdAt,
        },
      });

      logger.info(`Indexed product: ${product.name}`);
    } catch (error) {
      logger.error('Failed to index product:', error);
    }
  }

  /**
   * Delete product from index
   */
  async deleteProduct(productId) {
    try {
      await this.esClient.delete({
        index: this.indexName,
        id: productId,
      });

      logger.info(`Deleted product from index: ${productId}`);
    } catch (error) {
      logger.error('Failed to delete product from index:', error);
    }
  }

  /**
   * Bulk index products
   */
  async bulkIndexProducts(products) {
    try {
      const operations = [];

      for (const product of products) {
        operations.push({ index: { _index: this.indexName, _id: product._id.toString() } });
        operations.push({
          productId: product._id,
          name: product.name,
          description: product.description,
          category: product.category,
          subCategory: product.subCategory,
          tags: product.tags || [],
          price: product.sellingPrice,
          rating: product.averageRating || 0,
          reviews: product.reviewCount || 0,
          stock: product.stock,
          seller: product.sellerId?.toString(),
          thumbnail: product.thumbnail,
          colors: product.availableColors?.map(c => c.name) || [],
          sizes: product.availableSizes || [],
          isPOD: product.isPOD,
          createdAt: product.createdAt,
        });
      }

      const result = await this.esClient.bulk({ operations });

      logger.info(`Bulk indexed ${products.length} products`);

      return { success: true, indexed: products.length, errors: result.errors ? result.items.filter(i => i.index?.error) : [] };
    } catch (error) {
      logger.error('Bulk indexing failed:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Setup search routes
   */
  setupRoutes() {
    // Full-text search
    this.app.post('/api/search', async (req, res, next) => {
      try {
        const { query, category, minPrice, maxPrice, sort, page = 1, limit = 20 } = req.body;

        if (!query) {
          return res.status(400).json({ error: 'Search query required' });
        }

        const from = (page - 1) * limit;

        const filters = [];

        if (category) filters.push({ term: { category } });
        if (minPrice || maxPrice) {
          const priceFilter = {};
          if (minPrice) priceFilter.gte = minPrice;
          if (maxPrice) priceFilter.lte = maxPrice;
          filters.push({ range: { price: priceFilter } });
        }

        // Fuzzy search with typo correction
        const searchBody = {
          size: limit,
          from,
          query: {
            bool: {
              must: [
                {
                  multi_match: {
                    query,
                    fields: ['name^3', 'description^2', 'tags'],
                    fuzziness: 'AUTO',
                    prefix_length: 1,
                  },
                },
              ],
              filter: filters,
            },
          },
          sort: sort === 'price-asc' ? [{ price: 'asc' }] : sort === 'price-desc' ? [{ price: 'desc' }] : [{ _score: 'desc' }],
        };

        const response = await this.esClient.search({
          index: this.indexName,
          body: searchBody,
        });

        const products = response.hits.hits.map(hit => ({
          id: hit._id,
          score: hit._score,
          ...hit._source,
        }));

        res.json({
          success: true,
          products,
          total: response.hits.total.value,
          pages: Math.ceil(response.hits.total.value / limit),
        });
      } catch (error) {
        logger.error('Search failed:', error);
        res.status(500).json({ error: 'Search failed' });
      }
    });

    // Autocomplete suggestions
    this.app.get('/api/search/suggest', async (req, res, next) => {
      try {
        const { q } = req.query;

        if (!q || q.length < 2) {
          return res.json({ suggestions: [] });
        }

        const response = await this.esClient.search({
          index: this.indexName,
          size: 10,
          query: {
            match: {
              'name.autocomplete': {
                query: q,
                fuzziness: 'AUTO',
              },
            },
          },
          _source: ['name', 'thumbnail'],
        });

        const suggestions = response.hits.hits.map(hit => ({
          name: hit._source.name,
          thumbnail: hit._source.thumbnail,
        }));

        res.json({
          success: true,
          suggestions: Array.from(new Map(suggestions.map(s => [s.name, s])).values()).slice(0, 5),
        });
      } catch (error) {
        logger.error('Autocomplete failed:', error);
        res.status(500).json({ error: 'Autocomplete failed' });
      }
    });

    // Get categories
    this.app.get('/api/search/categories', async (req, res, next) => {
      try {
        const response = await this.esClient.search({
          index: this.indexName,
          size: 0,
          aggs: {
            categories: {
              terms: { field: 'category', size: 100 },
            },
          },
        });

        const categories = response.aggregations.categories.buckets.map(b => ({
          name: b.key,
          count: b.doc_count,
        }));

        res.json({ success: true, categories });
      } catch (error) {
        logger.error('Failed to fetch categories:', error);
        res.status(500).json({ error: 'Failed to fetch categories' });
      }
    });

    // Get prices range
    this.app.get('/api/search/prices', async (req, res, next) => {
      try {
        const response = await this.esClient.search({
          index: this.indexName,
          size: 0,
          aggs: {
            min_price: { min: { field: 'price' } },
            max_price: { max: { field: 'price' } },
          },
        });

        const minPrice = Math.floor(response.aggregations.min_price.value);
        const maxPrice = Math.ceil(response.aggregations.max_price.value);

        res.json({ success: true, minPrice, maxPrice });
      } catch (error) {
        logger.error('Failed to fetch price range:', error);
        res.status(500).json({ error: 'Failed to fetch price range' });
      }
    });

    // Index product (internal - called by product service)
    this.app.post('/api/search/index', async (req, res, next) => {
      try {
        const { product } = req.body;

        if (!product) {
          return res.status(400).json({ error: 'Product data required' });
        }

        await this.indexProduct(product);

        res.json({ success: true, message: 'Product indexed' });
      } catch (error) {
        next(error);
      }
    });

    // Bulk index (internal)
    this.app.post('/api/search/bulk-index', async (req, res, next) => {
      try {
        const { products } = req.body;

        if (!products || !Array.isArray(products)) {
          return res.status(400).json({ error: 'Products array required' });
        }

        const result = await this.bulkIndexProducts(products);

        res.json(result);
      } catch (error) {
        next(error);
      }
    });

    // Delete product from index
    this.app.delete('/api/search/index/:productId', async (req, res, next) => {
      try {
        await this.deleteProduct(req.params.productId);

        res.json({ success: true, message: 'Product removed from index' });
      } catch (error) {
        next(error);
      }
    });

    // Search health check
    this.app.get('/api/search/health', async (req, res, next) => {
      try {
        const health = await this.esClient.cluster.health();

        res.json({
          success: true,
          elasticsearch: {
            status: health.status,
            activeShards: health.active_shards,
            indices: health.number_of_indices,
          },
        });
      } catch (error) {
        res.status(500).json({ success: false, error: 'Elasticsearch unavailable' });
      }
    });

    // Trending products
    this.app.get('/api/search/trending', async (req, res, next) => {
      try {
        const response = await this.esClient.search({
          index: this.indexName,
          size: 15,
          query: {
            bool: {
              filter: [{ range: { reviews: { gte: 5 } } }],
            },
          },
          sort: [{ reviews: 'desc' }, { rating: 'desc' }],
        });

        const products = response.hits.hits.map(hit => ({
          id: hit._id,
          ...hit._source,
        }));

        res.json({ success: true, products });
      } catch (error) {
        logger.error('Failed to fetch trending products:', error);
        res.status(500).json({ error: 'Failed to fetch trending products' });
      }
    });

    this.addHealthCheck();
  }

  /**
   * Start search service
   */
  start() {
    this.app.listen(this.config.port, () => {
      logger.info(`🚀 ${this.config.name} running on port ${this.config.port}`);
      logger.info(`📍 Elasticsearch: ${process.env.ELASTICSEARCH_URL || 'http://localhost:9200'}`);
    });

    process.on('SIGTERM', () => {
      logger.info(`⏹️  ${this.config.name} shutting down...`);
      process.exit(0);
    });
  }
}

// ─── Start Service ────────────────────────────────────────────────────────
if (require.main === module) {
  const searchService = new SearchService();
  searchService.start();
}

module.exports = SearchService;
