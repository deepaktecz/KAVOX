'use strict';

/**
 * CUSTOM DESIGN BUILDER CONTROLLER
 * ──────────────────────────────────
 * Feature 3: Upload design → Cloudinary
 *            Save in MongoDB Design model
 *            Link design with product
 *            Send custom design to Qikink with order
 */

const cloudinary = require('cloudinary').v2;
const Design = require('../models/Design');
const Product = require('../../product/models/Product');
const { logger } = require('../../auth/utils/logger');

// ─── Cloudinary config (shared from env) ─────────────────────
cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET,
});

// ─── Helpers ──────────────────────────────────────────────────
const catchAsync = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const ok = (res, data, msg = 'Success', code = 200) =>
  res.status(code).json({ success: true, message: msg, ...data, timestamp: new Date().toISOString() });

const fail = (res, msg, code = 400) =>
  res.status(code).json({ success: false, message: msg, timestamp: new Date().toISOString() });

// ═══════════════════════════════════════════════════════════════
// UPLOAD DESIGN IMAGE TO CLOUDINARY + SAVE IN DB
// POST /api/v1/designs
// Body: multipart/form-data  file=<image>
//       name, productId, selectedSize, selectedColor, printArea,
//       textLayers (JSON string), canvasState (JSON string)
// ═══════════════════════════════════════════════════════════════
const createDesign = catchAsync(async (req, res) => {
  if (!req.file) return fail(res, 'Design image file is required', 400);

  const {
    name,
    productId,
    qikinkProductId,
    selectedSize,
    selectedColor,
    printArea = 'front',
    textLayers,
    canvasState,
  } = req.body;

  // Parse JSON fields sent as strings
  let parsedTextLayers = [];
  if (textLayers) {
    try { parsedTextLayers = JSON.parse(textLayers); } catch (_) {}
  }

  let parsedCanvasState = null;
  if (canvasState) {
    try { parsedCanvasState = JSON.parse(canvasState); } catch (_) {}
  }

  let parsedColor = null;
  if (selectedColor) {
    try { parsedColor = JSON.parse(selectedColor); } catch (_) {
      parsedColor = { name: selectedColor };
    }
  }

  // Validate product (if provided)
  if (productId) {
    const product = await Product.findById(productId).select('_id isPOD qikinkProductId');
    if (!product) return fail(res, 'Product not found', 404);
  }

  // Cloudinary upload
  // req.file.path is set by multer-storage-cloudinary (already uploaded)
  // OR if using memoryStorage, upload stream manually
  let cloudinaryResult;

  if (req.file.path && req.file.path.startsWith('http')) {
    // multer-storage-cloudinary already uploaded it
    cloudinaryResult = {
      secure_url: req.file.path,
      public_id: req.file.filename,
    };
  } else {
    // Upload from buffer (memoryStorage)
    cloudinaryResult = await new Promise((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder: 'kavox/designs',
          resource_type: 'image',
          transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        },
        (err, result) => {
          if (err) return reject(err);
          resolve(result);
        }
      );
      stream.end(req.file.buffer);
    });
  }

  // Create design document
  const design = await Design.create({
    user: req.user._id,
    name: name || 'My Design',
    designImageUrl: cloudinaryResult.secure_url,
    designPublicId: cloudinaryResult.public_id,
    textLayers: parsedTextLayers,
    selectedSize,
    selectedColor: parsedColor,
    printArea,
    product: productId || undefined,
    qikinkProductId: qikinkProductId || undefined,
    status: 'draft',
    canvasState: parsedCanvasState,
  });

  logger.info(`Design created: ${design._id} by user ${req.user._id}`);

  return ok(res, { data: { design } }, 'Design uploaded and saved', 201);
});

// ═══════════════════════════════════════════════════════════════
// GET USER'S DESIGNS
// GET /api/v1/designs
// ═══════════════════════════════════════════════════════════════
const getMyDesigns = catchAsync(async (req, res) => {
  const { page = 1, limit = 12, status } = req.query;
  const skip = (parseInt(page) - 1) * parseInt(limit);

  const filter = { user: req.user._id };
  if (status) filter.status = status;

  const [designs, total] = await Promise.all([
    Design.find(filter)
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(parseInt(limit))
      .populate('product', 'name slug images sellingPrice')
      .lean(),
    Design.countDocuments(filter),
  ]);

  return ok(res, {
    data: { designs },
    meta: { total, page: parseInt(page), limit: parseInt(limit), pages: Math.ceil(total / parseInt(limit)) },
  });
});

// ═══════════════════════════════════════════════════════════════
// GET SINGLE DESIGN
// GET /api/v1/designs/:id
// ═══════════════════════════════════════════════════════════════
const getDesign = catchAsync(async (req, res) => {
  const design = await Design.findOne({ _id: req.params.id, user: req.user._id })
    .populate('product', 'name slug images sellingPrice basePrice qikinkProductId');

  if (!design) return fail(res, 'Design not found', 404);
  return ok(res, { data: { design } });
});

// ═══════════════════════════════════════════════════════════════
// UPDATE DESIGN (text layers, canvas state, selections)
// PATCH /api/v1/designs/:id
// ═══════════════════════════════════════════════════════════════
const updateDesign = catchAsync(async (req, res) => {
  const design = await Design.findOne({ _id: req.params.id, user: req.user._id });
  if (!design) return fail(res, 'Design not found', 404);

  if (design.status === 'ordered') {
    return fail(res, 'Cannot edit a design that has already been ordered', 400);
  }

  const { name, selectedSize, selectedColor, printArea, textLayers, canvasState, status } = req.body;

  if (name !== undefined) design.name = name;
  if (selectedSize !== undefined) design.selectedSize = selectedSize;
  if (selectedColor !== undefined) {
    try { design.selectedColor = JSON.parse(selectedColor); } catch (_) { design.selectedColor = { name: selectedColor }; }
  }
  if (printArea !== undefined) design.printArea = printArea;
  if (textLayers !== undefined) {
    try { design.textLayers = JSON.parse(textLayers); } catch (_) {}
  }
  if (canvasState !== undefined) {
    try { design.canvasState = JSON.parse(canvasState); } catch (_) {}
  }
  if (status && ['draft', 'ready'].includes(status)) {
    design.status = status;
  }

  await design.save();

  return ok(res, { data: { design } }, 'Design updated');
});

// ═══════════════════════════════════════════════════════════════
// DELETE DESIGN
// DELETE /api/v1/designs/:id
// ═══════════════════════════════════════════════════════════════
const deleteDesign = catchAsync(async (req, res) => {
  const design = await Design.findOne({ _id: req.params.id, user: req.user._id });
  if (!design) return fail(res, 'Design not found', 404);

  if (design.status === 'ordered') {
    return fail(res, 'Cannot delete a design that has been used in an order', 400);
  }

  // Remove from Cloudinary
  try {
    await cloudinary.uploader.destroy(design.designPublicId);
    if (design.previewPublicId) await cloudinary.uploader.destroy(design.previewPublicId);
  } catch (cdnErr) {
    logger.warn(`Cloudinary cleanup failed for design ${design._id}: ${cdnErr.message}`);
  }

  await design.deleteOne();

  return ok(res, {}, 'Design deleted');
});

// ═══════════════════════════════════════════════════════════════
// UPLOAD DESIGN TO QIKINK (get qikinkDesignId)
// POST /api/v1/designs/:id/upload-to-qikink
// Prepares design for inclusion in Qikink orders
// ═══════════════════════════════════════════════════════════════
const uploadDesignToQikink = catchAsync(async (req, res) => {
  const design = await Design.findOne({ _id: req.params.id, user: req.user._id });
  if (!design) return fail(res, 'Design not found', 404);

  if (design.isUploadedToQikink && design.qikinkDesignId) {
    return ok(res, { data: { design } }, 'Design already uploaded to Qikink');
  }

  const axios = require('axios');
  const QIKINK_BASE = process.env.QIKINK_BASE_URL || 'https://api.qikink.com';
  const QIKINK_KEY = process.env.QIKINK_API_KEY;

  if (!QIKINK_KEY) return fail(res, 'Qikink API not configured', 500);

  const payload = {
    design_url: design.designImageUrl,
    print_area: design.printArea,
    external_reference: design._id.toString(),
  };

  if (design.selectedColor?.name) payload.color = design.selectedColor.name;
  if (design.qikinkProductId) payload.product_id = design.qikinkProductId;

  const { data } = await axios.post(`${QIKINK_BASE}/v2/designs`, payload, {
    headers: {
      Authorization: `Bearer ${QIKINK_KEY}`,
      'Content-Type': 'application/json',
    },
    timeout: 15000,
  });

  design.qikinkDesignId = data.design_id || data.id || data.data?.id;
  design.isUploadedToQikink = true;
  design.status = 'ready';
  await design.save();

  logger.info(`Design ${design._id} uploaded to Qikink: ${design.qikinkDesignId}`);

  return ok(res, { data: { design } }, 'Design uploaded to Qikink');
});

// ─── Export ────────────────────────────────────────────────────
module.exports = {
  createDesign,
  getMyDesigns,
  getDesign,
  updateDesign,
  deleteDesign,
  uploadDesignToQikink,
};
