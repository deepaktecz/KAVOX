'use strict';

/**
 * SERVER.JS INTEGRATION HELPER
 * ─────────────────────────────────────────────────────────────
 * Ready-to-use code snippets for integrating Socket.io into your server
 * Copy and adapt these examples to your existing server file
 */

/**
 * STEP 1: Add required imports at the TOP of server.js
 * ═══════════════════════════════════════════════════════════════
 */

// Add these lines to your imports section:
const http = require('http');
const SocketService = require('./services/realtime/socket.service');
const OrderRealtimeIntegration = require('./services/order/order-realtime.integration');

/**
 * STEP 2: REPLACE your server initialization
 * ═══════════════════════════════════════════════════════════════
 * 
 * BEFORE (standard Express):
 * ─────────────────────────
 *   const app = express();
 *   const PORT = process.env.PORT || 3000;
 *   app.listen(PORT, () => {
 *     console.log(`Server running on port ${PORT}`);
 *   });
 * 
 * 
 * AFTER (with Socket.io):
 * ──────────────────────
 */

const example_after_initialization = `
  const app = express();
  const PORT = process.env.PORT || 3000;

  // Create HTTP server (required for Socket.io)
  const httpServer = http.createServer(app);

  // Initialize Socket.io service
  const socketService = SocketService.getInstance();
  socketService.initialize(httpServer);

  // Pass Socket.io to controllers via middleware
  app.use((req, res, next) => {
    req.socketService = socketService;
    req.orderRealtimeIntegration = OrderRealtimeIntegration;
    next();
  });

  // Start server
  httpServer.listen(PORT, () => {
    console.log(\`Server running on port \${PORT}\`);
    console.log('Socket.io initialized for real-time order tracking');
  });
`;

/**
 * STEP 3: INTEGRATE with Order Creation
 * ═══════════════════════════════════════════════════════════════
 * In your order service or controller, after creating an order:
 */

const order_creation_integration = `
  // In orderService.createOrder() or orderController.createOrder()
  const order = await Order.create(orderData);

  // Emit order created event to user in real-time
  const OrderRealtimeIntegration = require('../order/order-realtime.integration');
  OrderRealtimeIntegration.emitOrderCreated(order._id, order.userId, {
    orderId: order._id,
    estimatedDelivery: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
    amount: order.totalAmount,
    items: order.items.map(item => ({
      name: item.productId.name,
      quantity: item.quantity,
      hasDesign: !!item.customDesign,
    })),
  });

  return order;
`;

/**
 * STEP 4: INTEGRATE with Payment Confirmation
 * ═══════════════════════════════════════════════════════════════
 * In your payment verification webhook:
 */

const payment_verification_integration = `
  // In paymentController.verifyPayment() webhook
  
  // ... existing verification code ...
  
  // After updating order status to 'confirmed'
  const order = await Order.findByIdAndUpdate(orderId, { status: 'confirmed' }, { new: true });
  
  // Emit payment confirmed event
  const OrderRealtimeIntegration = require('../order/order-realtime.integration');
  OrderRealtimeIntegration.emitPaymentConfirmed(order.userId, {
    orderId: order._id,
    confirmationNumber: order.orderNumber,
    amount: order.totalAmount,
    estimatedProcessing: '24-48 hours',
  });
`;

/**
 * STEP 5: INTEGRATE with Qikink Webhook Handler
 * ═══════════════════════════════════════════════════════════════
 * In your existing Qikink webhook handler:
 */

const qikink_webhook_integration = `
  // In your POST /api/webhooks/qikink route
  router.post('/qikink', async (req, res) => {
    try {
      const { order_id, status, tracking_number, courier_partner } = req.body;
      
      // Handle the status update with real-time events
      const OrderRealtimeIntegration = require('../../services/order/order-realtime.integration');
      await OrderRealtimeIntegration.handleQikinkStatusUpdate(order_id, status, {
        trackingNumber: tracking_number,
        courierName: courier_partner,
      });
      
      res.json({ success: true, message: 'Status updated' });
    } catch (error) {
      logger.error('Qikink webhook error:', error);
      res.status(500).json({ error: 'Webhook processing failed' });
    }
  });
`;

/**
 * STEP 6: INTEGRATE with Admin Status Updates
 * ═══════════════════════════════════════════════════════════════
 * In your admin controller when updating order status manually:
 */

const admin_status_update_integration = `
  // In adminController.updateOrderStatus()
  
  const previousOrder = await Order.findById(orderId);
  const previousStatus = previousOrder.status;
  
  // Update the status
  const updatedOrder = await Order.findByIdAndUpdate(
    orderId,
    { status: newStatus },
    { new: true }
  );
  
  // Emit status change event to customer
  const OrderRealtimeIntegration = require('../../services/order/order-realtime.integration');
  OrderRealtimeIntegration.emitStatusChangeEvent(updatedOrder, previousStatus);
`;

/**
 * STEP 7: INTEGRATE with Order Cancellation
 * ═══════════════════════════════════════════════════════════════
 * When cancelling an order:
 */

const order_cancellation_integration = `
  // In order cancellation handler
  
  const order = await Order.findByIdAndUpdate(
    orderId,
    { status: 'cancelled', cancelledAt: new Date() },
    { new: true }
  );
  
  // Notify user of cancellation
  const OrderRealtimeIntegration = require('../../services/order/order-realtime.integration');
  OrderRealtimeIntegration.emitOrderCancelled(order.userId, {
    orderId: order._id,
    reason: cancellationReason,
    refundAmount: order.totalAmount,
    refundStatus: 'initiated',
  });
`;

/**
 * STEP 8: FULL SERVER.JS EXAMPLE
 * ═══════════════════════════════════════════════════════════════
 */

const full_server_example = `
'use strict';

const express = require('express');
const http = require('http');
const mongoose = require('mongoose');
require('dotenv').config();
const logger = require('./utils/logger');

// Import Socket.io services
const SocketService = require('./services/realtime/socket.service');
const OrderRealtimeIntegration = require('./services/order/order-realtime.integration');

// Import routes
const authRoutes = require('./routes/auth/authRoutes');
const productRoutes = require('./routes/product/productRoutes');
const orderRoutes = require('./routes/order/orderRoutes');
const paymentRoutes = require('./routes/payment/paymentRoutes');
const designRoutes = require('./routes/design/designRoutes');
const adminRoutes = require('./routes/admin/adminRoutes');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Socket.io middleware
const httpServer = http.createServer(app);
const socketService = SocketService.getInstance();
socketService.initialize(httpServer);

// Pass Socket.io services to requests
app.use((req, res, next) => {
  req.socketService = socketService;
  req.OrderRealtimeIntegration = OrderRealtimeIntegration;
  next();
});

// Database connection
mongoose.connect(process.env.MONGODB_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
}).then(() => {
  logger.info('Connected to MongoDB');
}).catch(err => {
  logger.error('MongoDB connection error:', err);
  process.exit(1);
});

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/payments', paymentRoutes);
app.use('/api/designs', designRoutes);
app.use('/api/admin', adminRoutes);

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', socketConnected: socketService.getConnectedUsers().size > 0 });
});

// Error handling middleware
app.use((err, req, res, next) => {
  logger.error('Unhandled error:', err);
  res.status(500).json({ error: 'Internal server error' });
});

// Start server
httpServer.listen(PORT, () => {
  logger.info(\`🚀 Server running on port \${PORT}\`);
  logger.info('📡 Socket.io initialized for real-time tracking');
});

module.exports = httpServer;
`;

/**
 * STEP 9: ENVIRONMENT VARIABLES NEEDED
 * ═══════════════════════════════════════════════════════════════
 * Add to your .env file:
 */

const env_variables = `
# Socket.io
FRONTEND_URL=http://localhost:3000  # or your frontend URL

# Existing variables
MONGODB_URI=mongodb://...
JWT_SECRET=your_secret_key
NODE_ENV=development
`;

/**
 * COMPLETION CHECKLIST
 * ═══════════════════════════════════════════════════════════════
 * 
 * ✅ Import Socket.io files:
 *    - socket.service.js in services/realtime/
 *    - order-realtime.integration.js in services/order/
 * 
 * ✅ Update server initialization:
 *    - Replace app.listen() with http.createServer() + httpServer.listen()
 *    - Call socketService.initialize(httpServer)
 *    - Add middleware to attach services to requests
 * 
 * ✅ Integrate in order creation:
 *    - Call OrderRealtimeIntegration.emitOrderCreated() after creating order
 * 
 * ✅ Integrate in payment confirmation:
 *    - Call OrderRealtimeIntegration.emitPaymentConfirmed() after payment success
 * 
 * ✅ Integrate in Qikink webhook:
 *    - Call OrderRealtimeIntegration.handleQikinkStatusUpdate() for status changes
 * 
 * ✅ Integrate in admin status updates:
 *    - Call OrderRealtimeIntegration.emitStatusChangeEvent() for manual updates
 * 
 * ✅ Integrate in order cancellation:
 *    - Call OrderRealtimeIntegration.emitOrderCancelled()
 * 
 * ✅ Set environment variables:
 *    - Add FRONTEND_URL to .env
 * 
 * ✅ Test with frontend:
 *    - Use Socket.io client library (socket.io-client)
 *    - Listen to events: order_created, payment_confirmed, order_shipped, etc.
 */
