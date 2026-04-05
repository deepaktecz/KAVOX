'use strict';

const mongoose = require('mongoose');

// ─── Text Layer Sub-schema ────────────────────────────────────
const textLayerSchema = new mongoose.Schema({
  content: { type: String, required: true, maxlength: 200 },
  fontFamily: { type: String, default: 'Arial' },
  fontSize: { type: Number, default: 24 },
  fontWeight: { type: String, enum: ['normal', 'bold'], default: 'normal' },
  color: { type: String, default: '#000000' },
  positionX: { type: Number, default: 0 }, // % from left
  positionY: { type: Number, default: 0 }, // % from top
  rotation: { type: Number, default: 0 },
}, { _id: false });

// ─── Main Design Schema ───────────────────────────────────────
const designSchema = new mongoose.Schema({
  // ── Identity ─────────────────────────────────────────
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  name: {
    type: String,
    trim: true,
    maxlength: 120,
    default: 'My Design',
  },

  // ── Design Image (uploaded to Cloudinary) ─────────────
  designImageUrl: { type: String, required: true },
  designPublicId: { type: String, required: true }, // Cloudinary public_id

  // ── Text Overlays ─────────────────────────────────────
  textLayers: [textLayerSchema],

  // ── Product Configuration ─────────────────────────────
  selectedSize: {
    type: String,
    enum: ['XS', 'S', 'M', 'L', 'XL', 'XXL', '3XL', 'Free Size'],
  },
  selectedColor: {
    name: { type: String },
    hexCode: { type: String },
  },
  printArea: {
    type: String,
    enum: ['front', 'back', 'left-sleeve', 'right-sleeve', 'front-back'],
    default: 'front',
  },

  // ── Linked Product ────────────────────────────────────
  // Which KAVOX/Qikink product this design is for
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', index: true },
  qikinkProductId: { type: String }, // Qikink catalog product ID

  // ── Qikink ────────────────────────────────────────────
  qikinkDesignId: { type: String, sparse: true }, // After upload to Qikink
  isUploadedToQikink: { type: Boolean, default: false },

  // ── Status ────────────────────────────────────────────
  status: {
    type: String,
    enum: ['draft', 'ready', 'ordered'],
    default: 'draft',
  },

  // ── Preview ───────────────────────────────────────────
  previewImageUrl: { type: String }, // Mockup render URL
  previewPublicId: { type: String },

  // ── Canvas State ──────────────────────────────────────
  // Store the full fabric.js/konva canvas JSON for client-side reload
  canvasState: { type: mongoose.Schema.Types.Mixed },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

designSchema.index({ user: 1, createdAt: -1 });
designSchema.index({ product: 1 });

const Design = mongoose.model('Design', designSchema);
module.exports = Design;
