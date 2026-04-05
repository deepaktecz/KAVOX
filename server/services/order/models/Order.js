'use strict';

const mongoose = require('mongoose');

// ─── Order Item Sub-schema ────────────────────────────────────
const orderItemSchema = new mongoose.Schema({
  product: { type: mongoose.Schema.Types.ObjectId, ref: 'Product', required: true },
  seller: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  name: { type: String, required: true },
  slug: { type: String },
  image: { type: String, required: true },
  variant: {
    variantId: mongoose.Schema.Types.ObjectId,
    sku: String,
    color: { name: String, hexCode: String },
    size: String,
  },
  quantity: { type: Number, required: true, min: 1 },
  // Pricing snapshot at time of order
  basePrice: { type: Number, required: true },
  sellingPrice: { type: Number, required: true },
  discountedPrice: { type: Number },
  effectivePrice: { type: Number, required: true }, // final price paid
  gstPercent: { type: Number, default: 12 },
  gstAmount: { type: Number, default: 0 },
  totalItemPrice: { type: Number, required: true },
  profit: { type: Number, required: true }, // effectivePrice - basePrice
  // Qikink fulfillment
  isPOD: { type: Boolean, default: false },
  qikinkOrderItemId: { type: String },
  qikinkStatus: { type: String, enum: ['pending', 'processing', 'printed', 'dispatched', 'delivered', 'failed', ''], default: '' },
  // Return/refund
  isReturned: { type: Boolean, default: false },
  returnReason: { type: String },
  returnedAt: { type: Date },
  refundAmount: { type: Number, default: 0 },
}, { _id: true });

// ─── Tracking Event Sub-schema ────────────────────────────────
const trackingEventSchema = new mongoose.Schema({
  status: { type: String, required: true },
  message: { type: String, required: true },
  location: { type: String },
  timestamp: { type: Date, default: Date.now },
  updatedBy: { type: String, enum: ['system', 'seller', 'admin', 'qikink'], default: 'system' },
}, { _id: false });

// ─── Main Order Schema ────────────────────────────────────────
const orderSchema = new mongoose.Schema({
  // ── Identity ─────────────────────────────────────────
  orderNumber: { type: String, unique: true, index: true },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },

  // ── Items ─────────────────────────────────────────────
  items: { type: [orderItemSchema], required: true, validate: [(v) => v.length > 0, 'Order must have items'] },

  // ── Shipping Address ──────────────────────────────────
  shippingAddress: {
    fullName: { type: String, required: true },
    phone: { type: String, required: true },
    addressLine1: { type: String, required: true },
    addressLine2: { type: String },
    city: { type: String, required: true },
    state: { type: String, required: true },
    pincode: { type: String, required: true },
    country: { type: String, default: 'India' },
  },

  // ── Pricing ───────────────────────────────────────────
  subtotal: { type: Number, required: true },
  shippingCharge: { type: Number, default: 0 },
  gstTotal: { type: Number, default: 0 },
  discountAmount: { type: Number, default: 0 },
  couponCode: { type: String },
  couponDiscount: { type: Number, default: 0 },
  totalAmount: { type: Number, required: true },
  // Profit tracking (admin view)
  totalBasePrice: { type: Number, required: true },
  totalProfit: { type: Number, required: true },

  // ── Payment ───────────────────────────────────────────
  paymentMethod: {
    type: String,
    required: true,
    enum: ['razorpay', 'cod', 'wallet', 'upi'],
    default: 'razorpay',
  },
  paymentStatus: {
    type: String,
    enum: ['pending', 'paid', 'failed', 'refunded', 'partially_refunded'],
    default: 'pending',
    index: true,
  },
  razorpayOrderId: { type: String, index: true, sparse: true },
  razorpayPaymentId: { type: String, sparse: true },
  razorpaySignature: { type: String },
  paidAt: { type: Date },

  // ── Order Status ──────────────────────────────────────
  status: {
    type: String,
    enum: [
      'pending_payment',
      'confirmed',
      'processing',
      'packed',
      'shipped',
      'out_for_delivery',
      'delivered',
      'cancelled',
      'return_requested',
      'returned',
    ],
    default: 'pending_payment',
    index: true,
  },

  // ── Qikink Integration ────────────────────────────────
  qikinkOrderId: { type: String, sparse: true, index: true },
  qikinkFulfillmentStatus: { type: String },
  qikinkRawResponse: { type: mongoose.Schema.Types.Mixed },

  // ── Tracking ──────────────────────────────────────────
  trackingEvents: [trackingEventSchema],
  courierName: { type: String },
  trackingNumber: { type: String },
  estimatedDelivery: { type: Date },
  deliveredAt: { type: Date },

  // ── Cancellation / Return ─────────────────────────────
  cancelledAt: { type: Date },
  cancellationReason: { type: String },
  cancelledBy: { type: String, enum: ['user', 'seller', 'admin', 'system'] },
  
  // ── Return Management ──────────────────────────────────
  returnStatus: { 
    type: String, 
    enum: ['pending', 'approved', 'rejected', 'shipped', 'received', 'refunded'],
    sparse: true 
  },
  returnRequest: {
    orderId: mongoose.Schema.Types.ObjectId,
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    items: [{
      itemId: mongoose.Schema.Types.ObjectId,
      reason: String,
      quantity: Number,
      refundAmount: Number,
    }],
    reason: String,
    comments: String,
    totalRefundAmount: Number,
    status: String,
    approvedAt: Date,
    approvedBy: String,
    rejectionReason: String,
    rejectedAt: Date,
    shippingLabel: String,
    returnTrackingNumber: String,
    shippedAt: Date,
    receivedAt: Date,
    refundId: String,
    refundProcessedAt: Date,
    createdAt: { type: Date, default: Date.now },
  },

  // ── Refunds Management ─────────────────────────────────
  refunds: [{
    refundId: String,
    amount: Number,
    reason: String,
    status: String,
    processedAt: Date,
    cancelledAt: Date,
  }],

  // ── Custom Design (if applicable) ─────────────────────
  customDesign: {
    designId: { type: mongoose.Schema.Types.ObjectId, ref: 'Design' },
    qikinkDesignId: { type: String },
    imageUrl: { type: String },
    printArea: { type: String, enum: ['front', 'back', 'left-sleeve', 'right-sleeve', 'front-back'] },
    selectedColor: { name: String, hexCode: String },
    selectedSize: { type: String },
    textLayers: { type: mongoose.Schema.Types.Mixed },
  },

  // ── Notes ─────────────────────────────────────────────
  userNote: { type: String, maxlength: 500 },
  adminNote: { type: String },

  // ── Invoice ───────────────────────────────────────────
  invoiceUrl: { type: String },
  invoiceNumber: { type: String },

}, {
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true },
});

// ─── Indexes ──────────────────────────────────────────────────
orderSchema.index({ user: 1, createdAt: -1 });
orderSchema.index({ 'items.seller': 1, createdAt: -1 });
orderSchema.index({ status: 1, createdAt: -1 });
orderSchema.index({ paymentStatus: 1 });
orderSchema.index({ createdAt: -1 });

// ─── Pre-save: Generate order number ─────────────────────────
orderSchema.pre('save', async function (next) {
  if (this.isNew && !this.orderNumber) {
    const date = new Date();
    const yy = String(date.getFullYear()).slice(-2);
    const mm = String(date.getMonth() + 1).padStart(2, '0');
    const dd = String(date.getDate()).padStart(2, '0');
    const rand = Math.floor(10000 + Math.random() * 90000);
    this.orderNumber = `KVX${yy}${mm}${dd}${rand}`;
  }

  // Add tracking event when status changes
  if (this.isModified('status') && !this.isNew) {
    const messages = {
      confirmed: 'Order confirmed and payment received',
      processing: 'Your order is being processed',
      packed: 'Order packed and ready for dispatch',
      shipped: `Order shipped via ${this.courierName || 'courier'}`,
      out_for_delivery: 'Out for delivery',
      delivered: 'Order delivered successfully',
      cancelled: `Order cancelled${this.cancellationReason ? ': ' + this.cancellationReason : ''}`,
      return_requested: 'Return requested',
      returned: 'Order returned and refund initiated',
    };

    if (messages[this.status]) {
      this.trackingEvents.push({
        status: this.status,
        message: messages[this.status],
        timestamp: new Date(),
      });
    }
  }

  next();
});

// ─── Virtuals ─────────────────────────────────────────────────
orderSchema.virtual('isDelivered').get(function () {
  return this.status === 'delivered';
});

orderSchema.virtual('canCancel').get(function () {
  return ['pending_payment', 'confirmed', 'processing'].includes(this.status);
});

orderSchema.virtual('canReturn').get(function () {
  if (this.status !== 'delivered') return false;
  if (!this.deliveredAt) return false;
  const daysSinceDelivery = (Date.now() - this.deliveredAt.getTime()) / (1000 * 60 * 60 * 24);
  return daysSinceDelivery <= 7;
});

const Order = mongoose.model('Order', orderSchema);
module.exports = Order;
