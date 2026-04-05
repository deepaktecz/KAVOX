'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');

const ctrl = require('../controllers/productController');

// ─── Middleware imports ────────────────────────────────────────
// Reuse auth middleware from auth service (in real microservices, this would be a shared package)
const { protect, restrictTo, optionalAuth } = require('../../auth/middleware/authMiddleware');

// Temporary multer storage (real app uses Cloudinary storage)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 10 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Only images allowed'), false);
  },
});

// ─── Public Routes ────────────────────────────────────────────

// Search (before /:slugOrId to avoid conflict)
router.get('/search', ctrl.searchProducts);

// Special collections
router.get('/featured', ctrl.getFeaturedProducts);
router.get('/trending', ctrl.getTrending);
router.get('/new-arrivals', ctrl.getNewArrivals);
router.get('/categories', ctrl.getCategories);

// AI Recommendations
router.get('/recommendations', ctrl.getRecommendations);

// Product listing
router.get('/', optionalAuth, ctrl.getAllProducts);

// Single product
router.get('/:slugOrId', optionalAuth, ctrl.getProduct);

// Related products
router.get('/:id/related', ctrl.getRelatedProducts);

// ─── Protected Routes ─────────────────────────────────────────
router.use(protect);

// Wishlist
router.post('/:id/wishlist', ctrl.toggleWishlist);

// Reviews
router.post('/:id/reviews', upload.array('images', 5), ctrl.addReview);
router.delete('/:id/reviews/:reviewId', ctrl.deleteReview);

// ─── Seller Routes ────────────────────────────────────────────
router.post('/', restrictTo('seller', 'admin'), upload.array('images', 10), ctrl.createProduct);
router.get('/seller/my-products', restrictTo('seller', 'admin'), ctrl.getSellerProducts);
router.put('/:id', restrictTo('seller', 'admin'), upload.array('images', 10), ctrl.updateProduct);
router.patch('/:id', restrictTo('seller', 'admin'), upload.array('images', 10), ctrl.updateProduct);
router.delete('/:id', restrictTo('seller', 'admin'), ctrl.deleteProduct);

// ─── Admin Routes ─────────────────────────────────────────────
router.patch('/:id/review', restrictTo('admin'), ctrl.reviewProduct);

module.exports = router;
