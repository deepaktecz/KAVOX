'use strict';

const express = require('express');
const router = express.Router();
const multer = require('multer');
const ctrl = require('../controllers/designController');
const { protect } = require('../../auth/middleware/authMiddleware');

// ─── Multer config ─────────────────────────────────────────────
// Strategy: try cloudinary storage first; fall back to memory
let upload;

try {
  const cloudinary = require('cloudinary').v2;
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  cloudinary.config({
    cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
    api_key: process.env.CLOUDINARY_API_KEY,
    api_secret: process.env.CLOUDINARY_API_SECRET,
  });

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'kavox/designs',
      resource_type: 'image',
      allowed_formats: ['jpg', 'jpeg', 'png', 'webp', 'gif'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB max
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) return cb(null, true);
      cb(new Error('Only image files are allowed'));
    },
  });
} catch (_) {
  // Fallback: memory storage (controller will upload to Cloudinary from buffer)
  upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
      if (file.mimetype.startsWith('image/')) return cb(null, true);
      cb(new Error('Only image files are allowed'));
    },
  });
}

// All design routes require auth
router.use(protect);

// POST /api/v1/designs                         → Upload + create design
router.post('/', upload.single('file'), ctrl.createDesign);

// GET  /api/v1/designs                         → List my designs
router.get('/', ctrl.getMyDesigns);

// GET  /api/v1/designs/:id                     → Get single design
router.get('/:id', ctrl.getDesign);

// PATCH /api/v1/designs/:id                    → Update design metadata
router.patch('/:id', ctrl.updateDesign);

// DELETE /api/v1/designs/:id                   → Delete design
router.delete('/:id', ctrl.deleteDesign);

// POST /api/v1/designs/:id/upload-to-qikink   → Push design to Qikink
router.post('/:id/upload-to-qikink', ctrl.uploadDesignToQikink);

module.exports = router;
