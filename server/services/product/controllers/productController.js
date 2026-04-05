'use strict';

const Product = require('../models/Product');
const { logger } = require('../../auth/utils/logger');

// ─── Response helpers ─────────────────────────────────────────
const ok = (res, data, message = 'Success', code = 200) =>
  res.status(code).json({ success: true, message, ...data, timestamp: new Date().toISOString() });

const err = (res, message, code = 500, errors = null) => {
  const body = { success: false, message, code: code.toString(), timestamp: new Date().toISOString() };
  if (errors) body.errors = errors;
  return res.status(typeof code === 'number' ? code : 500).json(body);
};

const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

// ─── Cache helpers (if Redis available) ──────────────────────
let redisClient = null;
try { redisClient = require('../config/redis').getRedis?.(); } catch (_) {}

const cacheGet = async (key) => {
  try { if (redisClient) return JSON.parse(await redisClient.get(`prod:${key}`)); } catch (_) {}
  return null;
};
const cacheSet = async (key, value, ttl = 300) => {
  try { if (redisClient) await redisClient.setex(`prod:${key}`, ttl, JSON.stringify(value)); } catch (_) {}
};
const cacheDel = async (...keys) => {
  try { if (redisClient) await Promise.all(keys.map((k) => redisClient.del(`prod:${k}`))); } catch (_) {}
};

// ═══════════════════════════════════════════════════════════════
// CREATE PRODUCT
// ═══════════════════════════════════════════════════════════════
const createProduct = catchAsync(async (req, res) => {
  const {
    name, description, shortDescription, brand, category, subcategory, tags,
    basePrice, sellingPrice, discountedPrice, gstPercent,
    availableSizes, fabric, fit, occasion, washCare, weight,
    isPOD, qikinkProductId, qikinkCatalogId,
    deliveryDays, freeShippingAbove, lowStockThreshold,
  } = req.body;

  // Parse variants if sent as string
  let variants = req.body.variants;
  if (typeof variants === 'string') {
    try { variants = JSON.parse(variants); } catch (_) { variants = []; }
  }

  // Process uploaded images
  const images = [];
  if (req.files && req.files.length > 0) {
    req.files.forEach((file, idx) => {
      images.push({
        url: file.path || file.secure_url,
        publicId: file.filename || file.public_id,
        alt: `${name} - image ${idx + 1}`,
        isMain: idx === 0,
        sortOrder: idx,
      });
    }); 
  }

  // Auto-generate SKU
  const timestamp = Date.now().toString(36).toUpperCase();
  const sku = `KVX-${category.substring(0, 3).toUpperCase()}-${timestamp}`;

  const product = await Product.create({
    name, description, shortDescription,
    brand: brand || 'KAVOX',
    category, subcategory,
    tags: Array.isArray(tags) ? tags : (tags ? tags.split(',').map(t => t.trim()) : []),
    basePrice: Number(basePrice),
    sellingPrice: Number(sellingPrice),
    discountedPrice: discountedPrice ? Number(discountedPrice) : undefined,
    gstPercent: Number(gstPercent || 12),
    images,
    variants: variants || [],
    availableSizes: Array.isArray(availableSizes) ? availableSizes : [],
    fabric, fit,
    occasion: Array.isArray(occasion) ? occasion : (occasion ? [occasion] : []),
    washCare, weight: weight ? Number(weight) : undefined,
    isPOD: Boolean(isPOD),
    qikinkProductId, qikinkCatalogId,
    deliveryDays: Number(deliveryDays || 7),
    freeShippingAbove: Number(freeShippingAbove || 499),
    lowStockThreshold: Number(lowStockThreshold || 5),
    sku,
    seller: req.user._id,
    status: req.user.role === 'admin' ? 'active' : 'pending_review',
  });

  await cacheDel('featured', 'categories', `seller:${req.user._id}`);

  logger.info(`Product created: ${product._id} by seller ${req.user._id}`);
  return ok(res, { data: { product } }, 'Product created successfully', 201);
});

// ═══════════════════════════════════════════════════════════════
// GET ALL PRODUCTS (with filters, sort, pagination)
// ═══════════════════════════════════════════════════════════════
const getAllProducts = catchAsync(async (req, res) => {
  const {
    page = 1, limit = 20, sort = '-createdAt',
    category, minPrice, maxPrice, rating,
    size, color, search, inStock, isPOD,
    seller, status, isFeatures,
  } = req.query;

  const pageNum = Math.max(1, parseInt(page));
  const limitNum = Math.min(100, Math.max(1, parseInt(limit)));
  const skip = (pageNum - 1) * limitNum;

  // Build filter
  const filter = {};

  // Only admins can see non-active products
  if (!req.user || req.user.role === 'user') {
    filter.status = 'active';
  } else if (status) {
    filter.status = status;
  }

  if (category) filter.category = { $in: category.split(',') };
  if (seller) filter.seller = seller;
  if (isFeatures !== undefined) filter.isFeatures = isFeatures === 'true';
  if (isPOD !== undefined) filter.isPOD = isPOD === 'true';

  // Price range
  if (minPrice || maxPrice) {
    filter.$or = [
      { discountedPrice: { $exists: true, ...(minPrice && { $gte: Number(minPrice) }), ...(maxPrice && { $lte: Number(maxPrice) }) } },
      { sellingPrice: { ...(minPrice && { $gte: Number(minPrice) }), ...(maxPrice && { $lte: Number(maxPrice) }) } },
    ];
  }

  // Rating filter
  if (rating) filter.rating = { $gte: Number(rating) };

  // Size filter
  if (size) filter.availableSizes = { $in: size.split(',') };

  // Color filter
  if (color) filter['availableColors.name'] = { $in: color.split(',') };

  // Stock filter
  if (inStock === 'true') filter.totalStock = { $gt: 0 };

  // Text search (fallback to regex if no text index)
  if (search) {
    filter.$text = { $search: search };
  }

  // Sort options
  const sortMap = {
    '-createdAt': { createdAt: -1 },
    'createdAt': { createdAt: 1 },
    '-price': { sellingPrice: -1 },
    'price': { sellingPrice: 1 },
    '-rating': { rating: -1 },
    '-sales': { salesCount: -1 },
    '-discount': { discountPercent: -1 },
    'name': { name: 1 },
  };
  const sortObj = sortMap[sort] || { createdAt: -1 };

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select('name slug images sellingPrice discountedPrice discountPercent rating reviewCount availableColors availableSizes totalStock isFeatures isPOD category brand createdAt salesCount status')
      .sort(sortObj)
      .skip(skip)
      .limit(limitNum)
      .lean(),
    Product.countDocuments(filter),
  ]);

  return ok(res, {
    data: { products },
    meta: {
      total,
      page: pageNum,
      limit: limitNum,
      pages: Math.ceil(total / limitNum),
      hasNextPage: pageNum < Math.ceil(total / limitNum),
      hasPrevPage: pageNum > 1,
    },
  });
});

// ═══════════════════════════════════════════════════════════════
// GET SINGLE PRODUCT
// ═══════════════════════════════════════════════════════════════
const getProduct = catchAsync(async (req, res) => {
  const { slugOrId } = req.params;

  // Try cache first
  const cached = await cacheGet(`product:${slugOrId}`);
  if (cached) return ok(res, { data: { product: cached } });

  const isId = slugOrId.match(/^[0-9a-fA-F]{24}$/);
  const query = isId ? { _id: slugOrId } : { slug: slugOrId };

  const product = await Product.findOne(query)
    .populate('seller', 'firstName lastName sellerProfile.brandName sellerProfile.rating')
    .lean();

  if (!product) return err(res, 'Product not found', 404);

  // Check visibility
  if (product.status !== 'active' && (!req.user || (req.user.role === 'user' && product.seller._id.toString() !== req.user._id.toString()))) {
    return err(res, 'Product not found', 404);
  }

  // Increment view count (non-blocking)
  Product.findByIdAndUpdate(product._id, { $inc: { viewCount: 1 } }).exec();

  await cacheSet(`product:${slugOrId}`, product, 300);
  return ok(res, { data: { product } });
});

// ═══════════════════════════════════════════════════════════════
// UPDATE PRODUCT
// ═══════════════════════════════════════════════════════════════
const updateProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return err(res, 'Product not found', 404);

  // Authorization
  if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
    return err(res, 'Not authorized to update this product', 403);
  }

  const allowedUpdates = [
    'name', 'description', 'shortDescription', 'brand', 'category', 'subcategory',
    'tags', 'sellingPrice', 'discountedPrice', 'gstPercent',
    'variants', 'availableSizes', 'fabric', 'fit', 'occasion', 'washCare', 'weight',
    'deliveryDays', 'freeShippingAbove', 'lowStockThreshold', 'washCare',
    'metaTitle', 'metaDescription',
  ];

  allowedUpdates.forEach((field) => {
    if (req.body[field] !== undefined) {
      product[field] = req.body[field];
    }
  });

  // Admin-only fields
  if (req.user.role === 'admin') {
    if (req.body.status) product.status = req.body.status;
    if (req.body.isFeatures !== undefined) product.isFeatures = req.body.isFeatures;
    if (req.body.basePrice) product.basePrice = Number(req.body.basePrice);
    if (req.body.rejectionReason) product.rejectionReason = req.body.rejectionReason;
  }

  // Handle new image uploads
  if (req.files && req.files.length > 0) {
    const newImages = req.files.map((file, idx) => ({
      url: file.path || file.secure_url,
      publicId: file.filename || file.public_id,
      alt: `${product.name} - image`,
      isMain: product.images.length === 0 && idx === 0,
      sortOrder: product.images.length + idx,
    }));
    product.images.push(...newImages);
  }

  if (req.user.role === 'seller') {
    product.status = 'pending_review';
  }

  await product.save();
  await cacheDel(`product:${product.slug}`, `product:${product._id}`, 'featured');

  return ok(res, { data: { product } }, 'Product updated successfully');
});

// ═══════════════════════════════════════════════════════════════
// DELETE PRODUCT
// ═══════════════════════════════════════════════════════════════
const deleteProduct = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return err(res, 'Product not found', 404);

  if (req.user.role !== 'admin' && product.seller.toString() !== req.user._id.toString()) {
    return err(res, 'Not authorized', 403);
  }

  // Soft delete - archive instead of hard delete
  product.status = 'archived';
  await product.save();

  await cacheDel(`product:${product.slug}`, `product:${product._id}`);
  logger.info(`Product archived: ${product._id}`);

  return ok(res, {}, 'Product deleted successfully');
});

// ═══════════════════════════════════════════════════════════════
// ADD REVIEW
// ═══════════════════════════════════════════════════════════════
const addReview = catchAsync(async (req, res) => {
  const { rating, title, comment } = req.body;

  const product = await Product.findOne({ _id: req.params.id, status: 'active' });
  if (!product) return err(res, 'Product not found', 404);

  // Check existing review
  const existingReview = product.reviews.find(
    (r) => r.user.toString() === req.user._id.toString()
  );
  if (existingReview) return err(res, 'You have already reviewed this product', 400);

  // Add review images if uploaded
  const reviewImages = req.files?.map((f) => ({ url: f.path, publicId: f.filename })) || [];

  product.reviews.push({
    user: req.user._id,
    userName: `${req.user.firstName} ${req.user.lastName}`,
    userAvatar: req.user.avatar?.url,
    rating: Number(rating),
    title,
    comment,
    images: reviewImages,
    isVerifiedPurchase: false, // Would check against orders in real impl
  });

  product.updateRating();
  await product.save();
  await cacheDel(`product:${product.slug}`, `product:${product._id}`);

  return ok(res, { data: { rating: product.rating, reviewCount: product.reviewCount } }, 'Review added', 201);
});

// ═══════════════════════════════════════════════════════════════
// DELETE REVIEW
// ═══════════════════════════════════════════════════════════════
const deleteReview = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id);
  if (!product) return err(res, 'Product not found', 404);

  const review = product.reviews.id(req.params.reviewId);
  if (!review) return err(res, 'Review not found', 404);

  if (req.user.role !== 'admin' && review.user.toString() !== req.user._id.toString()) {
    return err(res, 'Not authorized to delete this review', 403);
  }

  review.deleteOne();
  product.updateRating();
  await product.save();
  await cacheDel(`product:${product.slug}`);

  return ok(res, {}, 'Review deleted');
});

// ═══════════════════════════════════════════════════════════════
// GET FEATURED PRODUCTS
// ═══════════════════════════════════════════════════════════════
const getFeaturedProducts = catchAsync(async (req, res) => {
  const cached = await cacheGet('featured');
  if (cached) return ok(res, { data: { products: cached } });

  const products = await Product.getFeatured(parseInt(req.query.limit) || 8);
  await cacheSet('featured', products, 600);

  return ok(res, { data: { products } });
});

// ═══════════════════════════════════════════════════════════════
// GET CATEGORIES WITH COUNT
// ═══════════════════════════════════════════════════════════════
const getCategories = catchAsync(async (req, res) => {
  const cached = await cacheGet('categories');
  if (cached) return ok(res, { data: { categories: cached } });

  const categories = await Product.aggregate([
    { $match: { status: 'active' } },
    { $group: { _id: '$category', count: { $sum: 1 }, avgRating: { $avg: '$rating' } } },
    { $sort: { count: -1 } },
    { $project: { name: '$_id', count: 1, avgRating: { $round: ['$avgRating', 1] }, _id: 0 } },
  ]);

  await cacheSet('categories', categories, 3600);
  return ok(res, { data: { categories } });
});

// ═══════════════════════════════════════════════════════════════
// GET SELLER'S PRODUCTS
// ═══════════════════════════════════════════════════════════════
const getSellerProducts = catchAsync(async (req, res) => {
  const { page = 1, limit = 20, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { seller: req.user._id };
  if (status) filter.status = status;

  const [products, total] = await Promise.all([
    Product.find(filter)
      .select('name slug images sellingPrice discountedPrice totalStock status rating reviewCount salesCount createdAt category')
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit)),
    Product.countDocuments(filter),
  ]);

  return ok(res, {
    data: { products },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════
// ADMIN: APPROVE / REJECT PRODUCT
// ═══════════════════════════════════════════════════════════════
const reviewProduct = catchAsync(async (req, res) => {
  const { action, rejectionReason } = req.body; // action: 'approve' | 'reject'

  const product = await Product.findById(req.params.id);
  if (!product) return err(res, 'Product not found', 404);

  if (action === 'approve') {
    product.status = 'active';
    product.rejectionReason = undefined;
  } else if (action === 'reject') {
    product.status = 'rejected';
    product.rejectionReason = rejectionReason;
  } else {
    return err(res, 'Invalid action. Use "approve" or "reject"', 400);
  }

  await product.save();
  await cacheDel(`product:${product.slug}`);

  logger.info(`Product ${action}d: ${product._id} by admin ${req.user._id}`);
  return ok(res, { data: { product } }, `Product ${action}d`);
});

// ═══════════════════════════════════════════════════════════════
// GET RELATED PRODUCTS
// ═══════════════════════════════════════════════════════════════
const getRelatedProducts = catchAsync(async (req, res) => {
  const product = await Product.findById(req.params.id).select('category tags');
  if (!product) return err(res, 'Product not found', 404);

  const related = await Product.find({
    _id: { $ne: product._id },
    status: 'active',
    $or: [
      { category: product.category },
      { tags: { $in: product.tags } },
    ],
  })
    .select('name slug images sellingPrice discountedPrice discountPercent rating reviewCount availableColors availableSizes totalStock')
    .sort({ salesCount: -1, rating: -1 })
    .limit(8)
    .lean();

  return ok(res, { data: { products: related } });
});

// ═══════════════════════════════════════════════════════════════
// SEARCH PRODUCTS
// ═══════════════════════════════════════════════════════════════
const searchProducts = catchAsync(async (req, res) => {
  const { q, limit = 10 } = req.query;
  if (!q || q.trim().length < 2) return ok(res, { data: { products: [], suggestions: [] } });

  const products = await Product.find(
    { $text: { $search: q }, status: 'active' },
    { score: { $meta: 'textScore' } }
  )
    .select('name slug images sellingPrice discountedPrice rating reviewCount category')
    .sort({ score: { $meta: 'textScore' } })
    .limit(parseInt(limit))
    .lean();

  // Auto-suggestions from category/name
  const suggestions = [...new Set(products.map((p) => p.name).slice(0, 5))];

  return ok(res, { data: { products, suggestions, query: q } });
});

// ═══════════════════════════════════════════════════════════════
// WISHLIST TOGGLE
// ═══════════════════════════════════════════════════════════════
const toggleWishlist = catchAsync(async (req, res) => {
  // This would typically be handled in user service but kept here for simplicity
  const product = await Product.findById(req.params.id);
  if (!product || product.status !== 'active') return err(res, 'Product not found', 404);

  // In real app, would update user's wishlist array in user service
  // For now just return product info
  return ok(res, { data: { product: { _id: product._id, name: product.name } } }, 'Wishlist updated');
});

// ═══════════════════════════════════════════════════════════════
// GET TRENDING / NEW ARRIVALS
// ═══════════════════════════════════════════════════════════════
const getTrending = catchAsync(async (req, res) => {
  const cached = await cacheGet('trending');
  if (cached) return ok(res, { data: { products: cached } });

  const products = await Product.find({ status: 'active', totalStock: { $gt: 0 } })
    .select('name slug images sellingPrice discountedPrice discountPercent rating reviewCount availableColors availableSizes')
    .sort({ salesCount: -1, viewCount: -1 })
    .limit(12)
    .lean();

  await cacheSet('trending', products, 900);
  return ok(res, { data: { products } });
});

const getNewArrivals = catchAsync(async (req, res) => {
  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

  const products = await Product.find({
    status: 'active',
    createdAt: { $gte: sevenDaysAgo },
    totalStock: { $gt: 0 },
  })
    .select('name slug images sellingPrice discountedPrice discountPercent rating reviewCount availableColors availableSizes createdAt')
    .sort({ createdAt: -1 })
    .limit(12)
    .lean();

  return ok(res, { data: { products } });
});

// ═══════════════════════════════════════════════════════════════
// AI RECOMMENDATION (Basic collaborative filtering)
// ═══════════════════════════════════════════════════════════════
const getRecommendations = catchAsync(async (req, res) => {
  const { productId, userId } = req.query;
  let recommendations = [];

  if (productId) {
    // Content-based: same category + tags
    const source = await Product.findById(productId).select('category tags sellingPrice');
    if (source) {
      recommendations = await Product.find({
        _id: { $ne: productId },
        status: 'active',
        totalStock: { $gt: 0 },
        $or: [
          { category: source.category },
          { tags: { $in: source.tags || [] } },
          {
            sellingPrice: {
              $gte: source.sellingPrice * 0.7,
              $lte: source.sellingPrice * 1.3,
            },
          },
        ],
      })
        .select('name slug images sellingPrice discountedPrice rating reviewCount availableColors availableSizes')
        .sort({ salesCount: -1, rating: -1 })
        .limit(8)
        .lean();
    }
  }

  if (recommendations.length < 8) {
    // Fill with bestsellers
    const bestsellers = await Product.find({ status: 'active', totalStock: { $gt: 0 } })
      .select('name slug images sellingPrice discountedPrice rating reviewCount availableColors')
      .sort({ salesCount: -1 })
      .limit(8 - recommendations.length)
      .lean();
    recommendations.push(...bestsellers);
  }

  return ok(res, { data: { products: recommendations } });
});

module.exports = {
  createProduct,
  getAllProducts,
  getProduct,
  updateProduct,
  deleteProduct,
  addReview,
  deleteReview,
  getFeaturedProducts,
  getCategories,
  getSellerProducts,
  reviewProduct,
  getRelatedProducts,
  searchProducts,
  toggleWishlist,
  getTrending,
  getNewArrivals,
  getRecommendations,
};
