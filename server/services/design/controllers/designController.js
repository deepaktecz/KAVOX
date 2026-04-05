'use strict';

/**
 * CUSTOM DESIGN BUILDER CONTROLLER
 * ──────────────────────────────────
 * Feature 3: Upload design → Cloudinary
 *            Save in MongoDB Design model
 *            Link design with product
 *            Send custom design to Qikink with order
 */

const designService = require('../design.service');
const { logger } = require('../../auth/utils/logger');

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

  const designData = {
    name,
    productId,
    qikinkProductId,
    selectedSize,
    selectedColor: parsedColor,
    printArea,
    textLayers: parsedTextLayers,
    canvasState: parsedCanvasState,
  };

  const design = await designService.createDesign(req.user._id, designData, req.file.buffer);

  logger.info(`Design created: ${design._id} by user ${req.user._id}`);

  return ok(res, { data: { design } }, 'Design uploaded and saved', 201);
});

// ═══════════════════════════════════════════════════════════════
// GET USER'S DESIGNS
// GET /api/v1/designs
// ═══════════════════════════════════════════════════════════════
const getMyDesigns = catchAsync(async (req, res) => {
  const { page = 1, limit = 12, status } = req.query;

  const filters = { status };
  const result = await designService.getUserDesigns(req.user._id, filters, page, limit);

  return ok(res, {
    data: { designs: result.designs },
    meta: result.pagination,
  });
});

// ═══════════════════════════════════════════════════════════════
// GET SINGLE DESIGN
// GET /api/v1/designs/:id
// ═══════════════════════════════════════════════════════════════
const getDesign = catchAsync(async (req, res) => {
  const design = await designService.getDesign(req.params.id, req.user._id);
  return ok(res, { data: { design } });
});

// ═══════════════════════════════════════════════════════════════
// UPDATE DESIGN (text layers, canvas state, selections)
// PATCH /api/v1/designs/:id
// ═══════════════════════════════════════════════════════════════
const updateDesign = catchAsync(async (req, res) => {
  const { name, selectedSize, selectedColor, printArea, textLayers, canvasState, status } = req.body;

  // Parse JSON fields if needed
  let parsedColor = selectedColor;
  if (selectedColor && typeof selectedColor === 'string') {
    try { parsedColor = JSON.parse(selectedColor); } catch (_) {
      parsedColor = { name: selectedColor };
    }
  }

  let parsedTextLayers = textLayers;
  if (textLayers && typeof textLayers === 'string') {
    try { parsedTextLayers = JSON.parse(textLayers); } catch (_) {}
  }

  let parsedCanvasState = canvasState;
  if (canvasState && typeof canvasState === 'string') {
    try { parsedCanvasState = JSON.parse(canvasState); } catch (_) {}
  }

  const updateData = {
    name,
    selectedSize,
    selectedColor: parsedColor,
    printArea,
    textLayers: parsedTextLayers,
    canvasState: parsedCanvasState,
    status,
  };

  const design = await designService.updateDesign(req.params.id, req.user._id, updateData);

  return ok(res, { data: { design } }, 'Design updated');
});

// ═══════════════════════════════════════════════════════════════
// DELETE DESIGN
// DELETE /api/v1/designs/:id
// ═══════════════════════════════════════════════════════════════
const deleteDesign = catchAsync(async (req, res) => {
  await designService.deleteDesign(req.params.id, req.user._id);
  return ok(res, {}, 'Design deleted');
});

// ═══════════════════════════════════════════════════════════════
// UPLOAD DESIGN TO QIKINK (get qikinkDesignId)
// POST /api/v1/designs/:id/upload-to-qikink
// Prepares design for inclusion in Qikink orders
// ═══════════════════════════════════════════════════════════════
const uploadDesignToQikink = catchAsync(async (req, res) => {
  const design = await designService.uploadDesignToQikink(req.params.id, req.user._id);
  return ok(res, { data: { design } }, 'Design uploaded to Qikink');
});

// ═══════════════════════════════════════════════════════════════
// LINK DESIGN TO ORDER
// POST /api/v1/designs/:id/link-to-order
// Called when user includes design in order
// ═══════════════════════════════════════════════════════════════
const linkDesignToOrder = catchAsync(async (req, res) => {
  const { orderId } = req.body;

  if (!orderId) return fail(res, 'Order ID is required', 400);

  const order = await designService.linkDesignToOrder(orderId, req.params.id, req.user._id);

  logger.info(`Design ${req.params.id} linked to order ${orderId}`);
  return ok(res, { data: { order } }, 'Design linked to order', 201);
});

// ═══════════════════════════════════════════════════════════════
// GENERATE PREVIEW/MOCKUP
// POST /api/v1/designs/:id/preview
// ═══════════════════════════════════════════════════════════════
const generatePreview = catchAsync(async (req, res) => {
  const design = await designService.generatePreview(req.params.id, req.user._id);
  return ok(res, { data: { design } }, 'Preview generated');
});

// ═══════════════════════════════════════════════════════════════
// GET DESIGN STATISTICS
// GET /api/v1/designs/stats
// ═══════════════════════════════════════════════════════════════
const getDesignStats = catchAsync(async (req, res) => {
  const stats = await designService.getDesignStats(req.user._id);
  return ok(res, { data: { stats } });
});

// ═══════════════════════════════════════════════════════════════
// GET PRODUCT CONFIGURATION OPTIONS
// GET /api/v1/designs/product/:productId/config
// ═══════════════════════════════════════════════════════════════
const getProductConfig = catchAsync(async (req, res) => {
  const [printAreas, colors, sizes] = await Promise.all([
    designService.getProductPrintAreas(req.params.productId),
    designService.getProductColors(req.params.productId),
    designService.getProductSizes(req.params.productId),
  ]);

  return ok(res, { data: { printAreas, colors, sizes } }, 'Product config retrieved');
});

// ─── Export ────────────────────────────────────────────────────
module.exports = {
  createDesign,
  getMyDesigns,
  getDesign,
  updateDesign,
  deleteDesign,
  uploadDesignToQikink,
  linkDesignToOrder,
  generatePreview,
  getDesignStats,
  getProductConfig,
};
