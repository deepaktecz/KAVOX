'use strict';

/**
 * REAL-TIME ORDER TRACKING INTEGRATION GUIDE
 * ──────────────────────────────────────────
 * Complete examples of integrating Socket.io with order system
 * Shows setup, usage, and integration points
 */

// ═══════════════════════════════════════════════════════════════
// 1. SERVER.JS INTEGRATION
// ═══════════════════════════════════════════════════════════════

/**
 * In your main server.js file, add Socket.io initialization:
 * 
 * const express = require('express');
 * const http = require('http');
 * const socketService = require('./services/realtime/socket.service');
 * 
 * const app = express();
 * const server = http.createServer(app);
 * 
 * // Initialize Socket.io
 * socketService.initialize(server);
 * 
 * // Your routes
 * app.use('/api/v1', require('./routes'));
 * 
 * // Start server
 * const PORT = process.env.PORT || 3000;
 * server.listen(PORT, () => {
 *   console.log(`Server running on port ${PORT}`);
 *   console.log(`WebSocket enabled`);
 * });
 */

// ═══════════════════════════════════════════════════════════════
// 2. ORDER CREATION WITH REALTIME EVENT
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Create order endpoint
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * 
 * const createOrder = async (req, res) => {
 *   try {
 *     // Create order
 *     const order = await Order.create({
 *       user: req.user._id,
 *       items: req.body.items,
 *       shippingAddress: req.body.shippingAddress,
 *       paymentMethod: req.body.paymentMethod,
 *     });
 * 
 *     // Emit realtime event
 *     OrderRealtimeIntegration.emitOrderCreated(order);
 * 
 *     res.status(201).json({ success: true, data: { order } });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 3. PAYMENT VERIFICATION WITH REALTIME EVENT
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Payment verification (Razorpay webhook)
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * const paymentService = require('../services/payment/payment.service');
 * 
 * const verifyPayment = async (req, res) => {
 *   try {
 *     const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
 * 
 *     // Verify signature
 *     const isValid = paymentService.verifyPaymentSignature(
 *       razorpayOrderId,
 *       razorpayPaymentId,
 *       razorpaySignature
 *     );
 * 
 *     if (!isValid) {
 *       return res.status(400).json({ success: false, message: 'Invalid signature' });
 *     }
 * 
 *     // Find and update order
 *     const order = await Order.findOne({ razorpayOrderId })
 *       .populate('user');
 * 
 *     order.paymentStatus = 'paid';
 *     order.status = 'confirmed';
 *     order.razorpayPaymentId = razorpayPaymentId;
 *     order.paidAt = new Date();
 *     await order.save();
 * 
 *     // Emit realtime event to user - PAYMENT CONFIRMED
 *     OrderRealtimeIntegration.emitPaymentConfirmed(order);
 * 
 *     res.json({ success: true, message: 'Payment verified' });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 4. SEND ORDER TO QIKINK WITH REALTIME EVENT
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Submit order to Qikink for fulfillment
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * const axios = require('axios');
 * 
 * const sendToQikink = async (req, res) => {
 *   try {
 *     const { orderId } = req.params;
 *     const order = await Order.findById(orderId)
 *       .populate('user')
 *       .populate('items.product');
 * 
 *     // Build Qikink payload
 *     const payload = {
 *       order_id: order.orderNumber,
 *       customer_name: order.shippingAddress.fullName,
 *       customer_phone: order.shippingAddress.phone,
 *       items: order.items.map(item => ({
 *         product_id: item.product.qikinkProductId,
 *         quantity: item.quantity,
 *       })),
 *     };
 * 
 *     // Send to Qikink
 *     const response = await axios.post('https://api.qikink.com/v2/orders', payload, {
 *       headers: { Authorization: `Bearer ${process.env.QIKINK_API_KEY}` }
 *     });
 * 
 *     // Update order with Qikink ID
 *     order.qikinkOrderId = response.data.order_id;
 *     order.status = 'processing';
 *     await order.save();
 * 
 *     // Emit realtime event - ORDER PROCESSING
 *     OrderRealtimeIntegration.emitOrderProcessing(order);
 * 
 *     res.json({ success: true, data: { order } });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 5. QIKINK WEBHOOK HANDLING WITH REALTIME UPDATES
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Qikink status webhook
 * 
 * POST /api/v1/webhooks/qikink
 * Body: {
 *   "order_id": "qikink_order_123",
 *   "status": "printed",
 *   "message": "Order has been printed",
 *   "tracking_number": "TRACK123"
 * }
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * 
 * const handleQikinkWebhook = async (req, res) => {
 *   try {
 *     const { order_id, status, message, tracking_number } = req.body;
 * 
 *     // Handle status update and emit realtime events
 *     await OrderRealtimeIntegration.handleQikinkStatusUpdate(
 *       order_id,
 *       status,
 *       {
 *         message,
 *         tracking_number,
 *         location: message,
 *       }
 *     );
 * 
 *     res.json({ success: true });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 6. UPDATE ORDER STATUS (ANY TRIGGER)
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Generic status update with realtime event
 * Use this hook pattern in your order update endpoints
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * 
 * const updateOrderStatus = async (req, res) => {
 *   try {
 *     const { orderId } = req.params;
 *     const { newStatus } = req.body;
 * 
 *     const order = await Order.findById(orderId).populate('user');
 *     const previousStatus = order.status;
 * 
 *     // Update status
 *     order.status = newStatus;
 *     await order.save();
 * 
 *     // Emit realtime event based on status change
 *     OrderRealtimeIntegration.emitStatusChangeEvent(order, previousStatus);
 * 
 *     res.json({ success: true, data: { order } });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 7. MANUAL TRACKING UPDATES (FROM COURIER)
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Add tracking event from courier system
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * 
 * const addTrackingEvent = async (req, res) => {
 *   try {
 *     const { orderId } = req.params;
 *     const { status, message, location } = req.body;
 * 
 *     const order = await Order.findById(orderId).populate('user');
 * 
 *     // Add tracking event
 *     order.trackingEvents.push({
 *       status,
 *       message,
 *       location,
 *       updatedBy: 'admin',
 *       timestamp: new Date(),
 *     });
 *     await order.save();
 * 
 *     // Emit realtime tracking update
 *     OrderRealtimeIntegration.emitTrackingUpdate(order, {
 *       status,
 *       message,
 *       location,
 *       updatedBy: 'admin',
 *     });
 * 
 *     res.json({ success: true, data: { order } });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 8. CANCEL ORDER WITH REALTIME EVENT
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Cancel order
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * 
 * const cancelOrder = async (req, res) => {
 *   try {
 *     const { orderId } = req.params;
 *     const { reason } = req.body;
 * 
 *     const order = await Order.findById(orderId).populate('user');
 * 
 *     order.status = 'cancelled';
 *     order.cancelledAt = new Date();
 *     order.cancellationReason = reason;
 *     order.cancelledBy = 'user';
 *     await order.save();
 * 
 *     // Emit cancellation event
 *     OrderRealtimeIntegration.emitOrderCancelled(order);
 * 
 *     res.json({ success: true, message: 'Order cancelled' });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 9. SEND NOTIFICATION TO USER
// ═══════════════════════════════════════════════════════════════

/**
 * Example: Send custom notification
 * 
 * const OrderRealtimeIntegration = require('../services/realtime/order-realtime.integration');
 * 
 * const sendNotification = async (req, res) => {
 *   try {
 *     const { userId, message } = req.body;
 * 
 *     OrderRealtimeIntegration.emitNotification(
 *       userId,
 *       message,
 *       { type: 'info', timestamp: new Date() }
 *     );
 * 
 *     res.json({ success: true, message: 'Notification sent' });
 *   } catch (err) {
 *     res.status(500).json({ success: false, message: err.message });
 *   }
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 10. FRONTEND SOCKET.IO CLIENT SETUP
// ═══════════════════════════════════════════════════════════════

/**
 * Frontend: React/Vue component
 * 
 * import { useEffect, useState } from 'react';
 * import io from 'socket.io-client';
 * 
 * const OrderTracker = ({ orderId }) => {
 *   const [order, setOrder] = useState(null);
 *   const [status, setStatus] = useState('pending');
 * 
 *   useEffect(() => {
 *     // Connect to Socket.io
 *     const socket = io('http://localhost:3000', {
 *       auth: {
 *         token: localStorage.getItem('authToken'),
 *       },
 *     });
 * 
 *     // Listen for order events
 *     socket.on('order_created', (data) => {
 *       console.log('Order created:', data);
 *       setStatus('Order Created');
 *     });
 * 
 *     socket.on('order_confirmed', (data) => {
 *       console.log('Payment confirmed:', data);
 *       setStatus('Payment Confirmed');
 *     });
 * 
 *     socket.on('order_processing', (data) => {
 *       console.log('Order processing:', data);
 *       setStatus('Processing');
 *     });
 * 
 *     socket.on('order_printing', (data) => {
 *       console.log('Printing started:', data);
 *       setStatus('Printing');
 *     });
 * 
 *     socket.on('order_packed', (data) => {
 *       console.log('Order packed:', data);
 *       setStatus('Packed');
 *     });
 * 
 *     socket.on('order_shipped', (data) => {
 *       console.log('Order shipped:', data);
 *       setStatus(`Shipped - Tracking: ${data.trackingNumber}`);
 *     });
 * 
 *     socket.on('order_out_for_delivery', (data) => {
 *       console.log('Out for delivery:', data);
 *       setStatus('Out for Delivery');
 *     });
 * 
 *     socket.on('order_delivered', (data) => {
 *       console.log('Order delivered:', data);
 *       setStatus('Delivered');
 *     });
 * 
 *     socket.on('order_cancelled', (data) => {
 *       console.log('Order cancelled:', data);
 *       setStatus('Cancelled');
 *     });
 * 
 *     socket.on('tracking_update', (data) => {
 *       console.log('Tracking update:', data);
 *       setStatus(data.message);
 *     });
 * 
 *     socket.on('notification', (data) => {
 *       console.log('Notification:', data.message);
 *     });
 * 
 *     socket.on('error', (data) => {
 *       console.error('Error:', data.message);
 *     });
 * 
 *     // Cleanup on unmount
 *     return () => socket.disconnect();
 *   }, [orderId]);
 * 
 *   return <div>Order Status: {status}</div>;
 * };
 */

// ═══════════════════════════════════════════════════════════════
// 11. ENVIRONMENT VARIABLES
// ═══════════════════════════════════════════════════════════════

/**
 * Add to .env:
 * 
 * # Socket.io
 * FRONTEND_URL=http://localhost:3000
 * JWT_SECRET=your-secret-key
 * 
 * # Qikink
 * QIKINK_API_KEY=qikink-api-key
 * QIKINK_BASE_URL=https://api.qikink.com
 * QIKINK_WEBHOOK_SECRET=webhook-secret
 */

// ═══════════════════════════════════════════════════════════════
// 12. EVENT SUMMARY
// ═══════════════════════════════════════════════════════════════

/**
 * EVENTS EMITTED TO FRONTEND:
 * 
 * order_created:
 *   - Emitted when order is created
 *   - Data: { orderId, orderNumber, totalAmount, itemCount }
 * 
 * order_confirmed:
 *   - Emitted when payment is confirmed
 *   - Data: { orderId, orderNumber, paymentStatus }
 * 
 * order_processing:
 *   - Emitted when order sent to Qikink
 *   - Data: { orderId, orderNumber, qikinkOrderId }
 * 
 * order_printing:
 *   - Emitted when printing starts
 *   - Data: { orderId, orderNumber, qikinkFulfillmentStatus, message }
 * 
 * order_packed:
 *   - Emitted when order is packed
 *   - Data: { orderId, orderNumber, message }
 * 
 * order_shipped:
 *   - Emitted when order is shipped
 *   - Data: { orderId, orderNumber, courierName, trackingNumber, estimatedDelivery }
 * 
 * order_out_for_delivery:
 *   - Emitted when out for delivery
 *   - Data: { orderId, orderNumber, trackingNumber, estimatedDelivery }
 * 
 * order_delivered:
 *   - Emitted when delivered
 *   - Data: { orderId, orderNumber, deliveredAt, message }
 * 
 * order_cancelled:
 *   - Emitted when cancelled
 *   - Data: { orderId, orderNumber, cancellationReason, message }
 * 
 * tracking_update:
 *   - Emitted for intermediate tracking events
 *   - Data: { orderId, status, message, location }
 * 
 * order_status_update:
 *   - Generic status update
 *   - Data: { orderId, ...customData }
 * 
 * notification:
 *   - General notification
 *   - Data: { message, ...data }
 * 
 * error:
 *   - Error notification
 *   - Data: { message, severity }
 */

module.exports = {
  description: 'Real-time order tracking integration guide',
};
