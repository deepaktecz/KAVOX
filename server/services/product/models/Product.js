'use strict';

const mongoose = require('mongoose');
const slugify = require('slugify');

// ─── Review Sub-schema ────────────────────────────────────────
const reviewSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  userName: { type: String, required: true },
  userAvatar: { type: String },
  rating: { type: Number, required: true, min: 1, max: 5 },
  title: { type: String, trim: true, maxlength: 120 },
  comment: { type: String, required: true, trim: true, maxlength: 1500 },
  images: [{ url: String, publicId: String }],
  isVerifiedPurchase: { type: Boolean, default: false },
  helpfulVotes: { type: Number, default: 0 },
  reportCount: { type: Number, default: 0, select: false },
  isVisible: { type: Boolean, default: true },
}, { timestamps: true });

// ─── Variant Sub-schema ───────────────────────────────────────
const variantSchema = new mongoose.Schema({
  sku: { type: String, required: true, uppercase: true, trim: true },
  color: {
    name: { type: String, required: true, trim: true },
    hexCode: { type: String, trim: true },
  },
  size: { type: String, required: true, enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'] },
  stock: { type: Number, required: true, default: 0, min: 0 },
  additionalPrice: { type: Number, default: 0 },
  images: [{ url: String, publicId: String, alt: String }],
  weight: { type: Number },
  qikinkSkuId: { type: String },
  isActive: { type: Boolean, default: true },
}, { _id: true });

// ─── Design Sub-schema (for custom/POD products) ──────────────
const designSchema = new mongoose.Schema({
  designImageUrl: { type: String },
  designPublicId: { type: String },
  printArea: {
    type: String,
    enum: ['front', 'back', 'left-sleeve', 'right-sleeve', 'front-back'],
    default: 'front',
  },
  printWidth: { type: Number },
  printHeight: { type: Number },
  qikinkDesignId: { type: String },
  mockupImages: [{
    color: String,
    url: String,
    publicId: String,
  }],
}, { _id: false });

// ─── Main Product Schema ──────────────────────────────────────
const productSchema = new mongoose.Schema({
  // ── Core Info ────────────────────────────────────────
  name: {
    type: String,
    required: [true, 'Product name is required'],
    trim: true,
    minlength: [5, 'Name must be at least 5 characters'],
    maxlength: [200, 'Name cannot exceed 200 characters'],
  },
  slug: { type: String, unique: true, lowercase: true, index: true },
  description: {
    type: String,
    required: [true, 'Description is required'],
    trim: true,
    minlength: [20, 'Description must be at least 20 characters'],
    maxlength: [5000, 'Description cannot exceed 5000 characters'],
  },
  shortDescription: { type: String, trim: true, maxlength: 300 },
  brand: { type: String, trim: true, default: 'KAVOX', maxlength: 100 },
  sku: { type: String, unique: true, uppercase: true, trim: true, sparse: true },

  // ── Seller ───────────────────────────────────────────
  seller: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: [true, 'Seller is required'],
    index: true,
  },

  // ── Category ─────────────────────────────────────────
  category: {
    type: String,
    required: [true, 'Category is required'],
    enum: [
      'T-Shirts', 'Oversized T-Shirts', 'Polo T-Shirts', 'Graphic Tees',
      'Hoodies', 'Sweatshirts', 'Jackets', 'Shirts',
      'Shorts', 'Joggers', 'Caps & Hats', 'Accessories', 'Custom Design',
    ],
    index: true,
  },
  subcategory: { type: String, trim: true },
  tags: [{ type: String, trim: true, lowercase: true }],

  // ── Pricing ──────────────────────────────────────────
  basePrice: {
    type: Number,
    required: true,
    min: [0, 'Base price cannot be negative'],
    comment: 'Qikink cost / manufacturing cost',
  },
  sellingPrice: {
    type: Number,
    required: true,
    min: [1, 'Selling price must be positive'],
  },
  discountedPrice: {
    type: Number,
    min: [0, 'Discounted price cannot be negative'],
    validate: {
      validator: function (v) { return !v || v <= this.sellingPrice; },
      message: 'Discounted price must be less than selling price',
    },
  },
  discountPercent: { type: Number, min: 0, max: 100 },
  gstPercent: { type: Number, default: 12, enum: [0, 5, 12, 18, 28] },

  // ── Images ───────────────────────────────────────────
  images: [{
    url: { type: String, required: true },
    publicId: { type: String },
    alt: { type: String },
    isMain: { type: Boolean, default: false },
    sortOrder: { type: Number, default: 0 },
  }],

  // ── Variants (Size + Color combinations) ─────────────
  variants: [variantSchema],
  availableSizes: [{
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'],
  }],
  availableColors: [{
    name: String,
    hexCode: String,
  }],

  // ── Inventory ────────────────────────────────────────
  totalStock: { type: Number, default: 0, min: 0, index: true },
  lowStockThreshold: { type: Number, default: 5 },
  trackInventory: { type: Boolean, default: true },

  // ── Physical attributes ───────────────────────────────
  weight: { type: Number, comment: 'in grams' },
  fabric: { type: String, trim: true, maxlength: 200 },
  fit: { type: String, enum: ['Regular', 'Slim', 'Oversized', 'Relaxed', ''] },
  occasion: [{ type: String }],
  washCare: { type: String, maxlength: 500 },

  // ── Qikink / Print-on-Demand ──────────────────────────
  isPOD: { type: Boolean, default: false, index: true },
  qikinkProductId: { type: String, sparse: true },
  qikinkCatalogId: { type: String },
  design: designSchema,

  // ── Ratings & Reviews ─────────────────────────────────
  reviews: [reviewSchema],
  rating: { type: Number, default: 0, min: 0, max: 5, index: true },
  reviewCount: { type: Number, default: 0 },
  ratingDistribution: {
    1: { type: Number, default: 0 },
    2: { type: Number, default: 0 },
    3: { type: Number, default: 0 },
    4: { type: Number, default: 0 },
    5: { type: Number, default: 0 },
  },

  // ── Stats ─────────────────────────────────────────────
  salesCount: { type: Number, default: 0, index: true },
  viewCount: { type: Number, default: 0 },
  wishlistCount: { type: Number, default: 0 },

  // ── Status ────────────────────────────────────────────
  status: {
    type: String,
    enum: ['draft', 'pending_review', 'active', 'inactive', 'rejected', 'archived'],
    default: 'pending_review',
    index: true,
  },
  rejectionReason: { type: String },
  isFeatures: { type: Boolean, default: false, index: true },
  isTrending: { type: Boolean, default: false },
  isNewArrival: { type: Boolean, default: false },

  // ── SEO ───────────────────────────────────────────────
  metaTitle: { type: String, maxlength: 70 },
  metaDescription: { type: String, maxlength: 160 },

  // ── Delivery ─────────────────────────────────────────
  deliveryDays: { type: Number, default: 7, min: 1 },
  freeShippingAbove: { type: Number, default: 499 },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ──────────────────────────────────────────────────
productSchema.index({ name: 'text', description: 'text', tags: 'text', brand: 'text' });
productSchema.index({ category: 1, status: 1 });
productSchema.index({ seller: 1, status: 1 });
productSchema.index({ sellingPrice: 1 });
productSchema.index({ rating: -1, reviewCount: -1 });
productSchema.index({ salesCount: -1 });
productSchema.index({ createdAt: -1 });
productSchema.index({ isFeatures: 1, status: 1 });
productSchema.index({ isPOD: 1, status: 1 });

// ─── Virtuals ─────────────────────────────────────────────────
productSchema.virtual('effectivePrice').get(function () {
  return this.discountedPrice || this.sellingPrice;
});

productSchema.virtual('profit').get(function () {
  return this.effectivePrice - this.basePrice;
});

productSchema.virtual('profitMargin').get(function () {
  if (!this.effectivePrice) return 0;
  return Math.round(((this.effectivePrice - this.basePrice) / this.effectivePrice) * 100);
});

productSchema.virtual('isInStock').get(function () {
  if (!this.trackInventory) return true;
  return this.totalStock > 0;
});

productSchema.virtual('isLowStock').get(function () {
  return this.totalStock > 0 && this.totalStock <= this.lowStockThreshold;
});

productSchema.virtual('mainImage').get(function () {
  const main = this.images.find((img) => img.isMain);
  return main ? main.url : this.images[0]?.url || null;
});

// ─── Pre-save Hooks ───────────────────────────────────────────
productSchema.pre('save', async function (next) {
  // Auto-generate slug
  if (this.isNew || this.isModified('name')) {
    let baseSlug = slugify(this.name, { lower: true, strict: true });
    let slug = baseSlug;
    let count = 0;
    while (await Product.findOne({ slug, _id: { $ne: this._id } })) {
      count++;
      slug = `${baseSlug}-${count}`;
    }
    this.slug = slug;
  }

  // Calculate discount percent
  if (this.discountedPrice && this.sellingPrice) {
    this.discountPercent = Math.round(
      ((this.sellingPrice - this.discountedPrice) / this.sellingPrice) * 100
    );
  }

  // Set first image as main if none set
  if (this.images.length > 0 && !this.images.some((img) => img.isMain)) {
    this.images[0].isMain = true;
  }

  // Recalculate totalStock from variants if has variants
  if (this.variants.length > 0) {
    this.totalStock = this.variants
      .filter((v) => v.isActive)
      .reduce((sum, v) => sum + (v.stock || 0), 0);
  }

  // Build available sizes/colors from variants
  if (this.variants.length > 0) {
    this.availableSizes = [...new Set(this.variants.filter((v) => v.isActive).map((v) => v.size))];
    const colorMap = {};
    this.variants.filter((v) => v.isActive).forEach((v) => {
      if (!colorMap[v.color.name]) colorMap[v.color.name] = v.color.hexCode;
    });
    this.availableColors = Object.entries(colorMap).map(([name, hexCode]) => ({ name, hexCode }));
  }

  next();
});

// ─── Instance Methods ─────────────────────────────────────────
productSchema.methods.updateRating = function () {
  const visibleReviews = this.reviews.filter((r) => r.isVisible);
  const count = visibleReviews.length;

  if (count === 0) {
    this.rating = 0;
    this.reviewCount = 0;
    this.ratingDistribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
    return;
  }

  const distribution = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
  const sum = visibleReviews.reduce((acc, r) => {
    distribution[r.rating] = (distribution[r.rating] || 0) + 1;
    return acc + r.rating;
  }, 0);

  this.rating = Math.round((sum / count) * 10) / 10;
  this.reviewCount = count;
  this.ratingDistribution = distribution;
};

productSchema.methods.getVariantBySizeColor = function (size, colorName) {
  return this.variants.find(
    (v) => v.size === size && v.color.name === colorName && v.isActive
  );
};

productSchema.methods.updateStockForVariant = async function (variantId, quantity) {
  const variant = this.variants.id(variantId);
  if (!variant) throw new Error('Variant not found');
  if (variant.stock < quantity) throw new Error(`Insufficient stock. Available: ${variant.stock}`);
  variant.stock -= quantity;
  await this.save();
  return variant;
};

// ─── Static Methods ───────────────────────────────────────────
productSchema.statics.getActiveProducts = function (filter = {}) {
  return this.find({ ...filter, status: 'active' });
};

productSchema.statics.getFeatured = function (limit = 8) {
  return this.find({ status: 'active', isFeatures: true })
    .sort({ salesCount: -1 })
    .limit(limit)
    .select('name slug images sellingPrice discountedPrice discountPercent rating reviewCount availableColors availableSizes totalStock');
};

const Product = mongoose.model('Product', productSchema);
module.exports = Product;
