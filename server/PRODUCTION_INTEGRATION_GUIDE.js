'use strict';

/**
 * PRODUCTION INTEGRATION GUIDE
 * ═══════════════════════════════════════════════════════════════════════════
 * Complete guide for integrating all new services into KAVOX platform
 * 
 * This file contains code examples and integration points for all new
 * production-ready services created in this implementation phase.
 */

/**
 * STEP 1: UPDATE SERVER.JS
 * ═══════════════════════════════════════════════════════════════════════════
 * Integrate all services into main server initialization
 */

const SERVER_UPDATE = `
// At the top of server.js, add imports:
const EmailService = require('./services/email/email.service');
const EventLoggingService = require('./services/logging/event.logging.service');
const InventorySyncService = require('./services/inventory/inventory.sync.service');
const ErrorRecoveryService = require('./services/error/error.recovery.service');

// Add security middleware imports:
const { 
  validateAndSanitize, 
  securityHeaders, 
  rateLimit, 
  logRequest 
} = require('./middleware/security.middleware');

// After app = express(), add middleware:
app.use(securityHeaders); // Add security headers
app.use(rateLimit(100, 60000)); // Rate limit: 100 requests per minute
app.use(validateAndSanitize); // Validate and sanitize all inputs
app.use(logRequest); // Log all requests

// Add routes:
app.use('/api/seller', require('./routes/seller/sellerRoutes'));
app.use('/api/returns', require('./routes/returns/returnRoutes'));
app.use('/api/inventory', require('./routes/inventory/inventoryRoutes'));

// Start inventory sync on server startup:
InventorySyncService.startAutoSync(3600000); // Sync every 1 hour
logger.info('Inventory auto-sync started');

// Start event logging cleanup (optional):
setInterval(() => {
  EventLoggingService.clearOldEvents(30); // Keep last 30 days
}, 24 * 60 * 60 * 1000);
`;

/**
 * STEP 2: UPDATE PAYMENT CONTROLLER
 * ═══════════════════════════════════════════════════════════════════════════
 * Integrate email notifications and event logging into payment verification
 */

const PAYMENT_CONTROLLER_UPDATE = `
// In paymentController.js, update verifyPayment method:

const OrderIntegrationService = require('../../services/order/order.integration.service');

async verifyPayment(req, res) {
  try {
    const { razorpayOrderId, razorpayPaymentId, razorpaySignature } = req.body;
    
    // ... existing signature verification code ...
    
    const order = await Order.findOne({ razorpayOrderId });
    
    // Use integration service for all post-payment actions:
    const result = await OrderIntegrationService.handlePaymentConfirmed(
      order._id,
      {
        paymentId: razorpayPaymentId,
        amount: order.totalAmount,
      },
      order.userId
    );
    
    // result includes:
    // - updated order
    // - email sent confirmation
    // - inventory deducted
    // - event logged
    
    res.json({
      success: true,
      order: result.order,
      message: result.message,
    });
  } catch (error) {
    logger.error('Payment verification failed:', error);
    res.status(400).json({ error: 'Payment verification failed' });
  }
}
`;

/**
 * STEP 3: UPDATE ORDER CONTROLLER
 * ═══════════════════════════════════════════════════════════════════════════
 * Integrate orders with email, returns, and inventory services
 */

const ORDER_CONTROLLER_UPDATE = `
// In orderController.js, add/update methods:

const OrderIntegrationService = require('../../services/order/order.integration.service');

// Create order with email notification:
async createOrder(req, res) {
  try {
    const result = await OrderIntegrationService.createOrderWithNotification(
      req.body,
      req.user.id
    );
    
    res.json({
      success: true,
      order: result.order,
      message: result.message,
    });
  } catch (error) {
    logger.error('Order creation failed:', error);
    res.status(400).json({ error: 'Order creation failed' });
  }
}

// Cancel order with refund:
async cancelOrder(req, res) {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;
    
    const result = await OrderIntegrationService.handleOrderCancellation(
      orderId,
      req.user.id,
      reason
    );
    
    res.json({
      success: true,
      order: result.order,
      message: result.message,
    });
  } catch (error) {
    logger.error('Order cancellation failed:', error);
    res.status(400).json({ error: 'Order cancellation failed' });
  }
}

// Get order with full history:
async getOrder(req, res) {
  try {
    const { orderId } = req.params;
    
    const result = await OrderIntegrationService.getOrderWithHistory(
      orderId,
      req.user.id // Validate ownership
    );
    
    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    res.status(error.message === 'Unauthorized' ? 403 : 404).json({
      error: error.message,
    });
  }
}

// Request return:
async requestReturn(req, res) {
  try {
    const { orderId } = req.params;
    
    const result = await OrderIntegrationService.handleReturnRequest(
      orderId,
      req.user.id,
      req.body
    );
    
    res.json({
      success: true,
      returnRequest: result.returnRequest,
      message: result.message,
    });
  } catch (error) {
    res.status(400).json({ error: error.message });
  }
}
`;

/**
 * STEP 4: UPDATE QIKINK WEBHOOK HANDLER
 * ═══════════════════════════════════════════════════════════════════════════
 * Integrate Qikink webhook with order notifications
 */

const QIKINK_WEBHOOK_UPDATE = `
// In qikinkController.js, update webhook handler:

const OrderIntegrationService = require('../../services/order/order.integration.service');

async handleQikinkWebhook(req, res) {
  try {
    const { order_id, status, tracking_number, courier_partner } = req.body;
    
    // Verify webhook signature (existing code)
    // ...
    
    // Use integration service to handle status update:
    const result = await OrderIntegrationService.handleQikinkStatusUpdate(
      order_id,
      status,
      {
        trackingNumber: tracking_number,
        courierName: courier_partner,
      }
    );
    
    res.json({
      success: true,
      message: 'Webhook processed successfully',
      statusChanged: result.statusChanged,
      emailSent: result.emailSent,
    });
  } catch (error) {
    logger.error('Webhook processing failed:', error);
    res.status(500).json({ error: 'Webhook processing failed' });
  }
}
`;

/**
 * STEP 5: ADD INPUT VALIDATION TO EXISTING ROUTES
 * ═══════════════════════════════════════════════════════════════════════════
 * Apply security middleware to protect routes
 */

const ROUTE_VALIDATION_UPDATE = `
// In existing route files, add security middleware:

const { 
  requireAuth, 
  requireAdmin, 
  validateFields,
  validateAndSanitize 
} = require('../../middleware/security.middleware');

// Example: Protect user routes
router.get('/me', requireAuth, async (req, res) => {
  // User is already authenticated
  res.json({ user: req.user });
});

// Example: Protect admin routes
router.get('/all-orders', requireAuth, requireAdmin, async (req, res) => {
  // Only admins can access
});

// Example: Validate specific fields
router.post('/create-order',
  requireAuth,
  validateFields([
    { name: 'items', type: 'string', required: true },
    { name: 'totalAmount', type: 'amount', required: true },
  ]),
  async (req, res) => {
    // Fields are validated before reaching handler
  }
);
`;

/**
 * STEP 6: ENVIRONMENT VARIABLES
 * ═══════════════════════════════════════════════════════════════════════════
 * Add required environment variables to .env file
 */

const ENV_VARIABLES = `
# Email Configuration
EMAIL_SERVICE=gmail
EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_SECURE=false
EMAIL_USER=your-email@gmail.com
EMAIL_PASSWORD=your-app-password
EMAIL_FROM_NAME=KAVOX

# Inventory Configuration
QIKINK_API_URL=https://api.qikink.com
QIKINK_API_KEY=your-qikink-api-key

# Security
ALLOWED_ORIGINS=http://localhost:3000,https://yourdomain.com
`;

/**
 * STEP 7: ACTIVATE SERVICES ON SERVER START
 * ═══════════════════════════════════════════════════════════════════════════
 * Initialize services when server starts
 */

const SERVICE_INITIALIZATION = `
// Add to server startup section:

// Initialize Email Service
logger.info('Email service initialized');
logger.info('Email configured for:', process.env.EMAIL_USER);

// Initialize Inventory Sync
const InventorySyncService = require('./services/inventory/inventory.sync.service');
if (process.env.NODE_ENV === 'production' || process.env.ENABLE_INVENTORY_SYNC === 'true') {
  InventorySyncService.startAutoSync(3600000); // Hourly sync
  logger.info('Inventory auto-sync enabled (1 hour interval)');
}

// Initialize Event Logging Cleanup
setInterval(() => {
  const result = EventLoggingService.clearOldEvents(30);
  logger.info('Event log cleanup completed', result);
}, 24 * 60 * 60 * 1000); // Daily cleanup

// Log server info
logger.info('🚀 Production features enabled:');
logger.info('  ✓ Email notifications');
logger.info('  ✓ Inventory management');
logger.info('  ✓ Return & refund workflow');
logger.info('  ✓ Event logging & audit trail');
logger.info('  ✓ Input validation & security');
logger.info('  ✓ Error recovery & retry logic');
`;

/**
 * STEP 8: TESTING ENDPOINTS
 * ═══════════════════════════════════════════════════════════════════════════
 * Test new endpoints after integration
 */

const TEST_ENDPOINTS = `
// Test Email Service
POST /api/returns/request/:orderId
{
  "items": [
    { "itemId": "item_id_1", "reason": "Defective product", "quantity": 1 }
  ],
  "reason": "Product arrived damaged",
  "comments": "Item has visible defect"
}

// Test Inventory Sync
POST /api/inventory/sync
// Force immediate sync of all products

POST /api/inventory/sync/:productId
// Sync specific product

GET /api/inventory/stock/:productId/:variantSku?quantity=2
// Check if stock available

// Test Seller Dashboard
GET /api/seller/dashboard
// Get seller overview

GET /api/seller/orders?page=1&limit=20&status=confirmed
// Get seller's orders

GET /api/seller/profits?days=30
// Get profit analysis

// Test Return Workflow
GET /api/returns/policy
// Get return policy

POST /api/returns/request/:orderId
{
  "items": [...],
  "reason": "Not as described" 
}
// Create return request

// Test Security
POST /api/protected-endpoint
Content-Type: application/json
Authorization: Bearer <valid_token>
// All requests are now validated & sanitized
`;

/**
 * STEP 9: IMPLEMENTATION CHECKLIST
 * ═══════════════════════════════════════════════════════════════════════════
 */

const IMPLEMENTATION_CHECKLIST = `
✅ Email Service
  □ Add EMAIL_* variables to .env
  □ Test email delivery
  □ Verify templates render correctly

✅ Inventory Management  
  □ Add QIKINK_API_URL and QIKINK_API_KEY to .env
  □ Run initial sync: POST /api/inventory/sync
  □ Enable auto-sync on production
  □ Monitor sync status: GET /api/inventory/status

✅ Return & Refund Workflow
  □ Test return request creation
  □ Test admin approval/rejection
  □ Verify refund processing
  □ Check email notifications

✅ Seller Dashboard
  □ Add seller routes to server.js
  □ Verify seller can see own orders
  □ Test analytics calculations
  □ Check profit calculations

✅ Input Validation & Security
  □ All routes now validate input
  □ Rate limiting enabled
  □ Security headers added
  □ Test with invalid data

✅ Event Logging
  □ Monitor event log growth
  □ Verify events are persisted
  □ Set up daily cleanup
  □ Export events for audit

✅ Error Recovery
  □ Test retry logic with simulated failures
  □ Monitor queued operations
  □ Verify circuit breaker works
  □ Check error logs

✅ Integration Testing
  □ Create order → Payment → Email
  □ Order created → Qikink → Status update → Email
  □ Order cancellation → Refund → Email
  □ Return request → Approval → Refund
`;

/**
 * STEP 10: MONITORING & MAINTENANCE
 * ═══════════════════════════════════════════════════════════════════════════
 */

const MONITORING_GUIDE = `
// Monitor key metrics:

// 1. Check sync status
const status = InventorySyncService.getSyncStatus();
console.log(status);
// Output: { isRunning: true, lastSyncTime: Date, nextSyncEstimate: Date }

// 2. Get event statistics
const stats = EventLoggingService.getEventStats(24); // last 24 hours
console.log(stats);

// 3. Check critical events
const critical = EventLoggingService.getCriticalEvents();
console.log(critical);

// 4. Monitor refund status
const analytics = ReturnRefundService.getRefundAnalytics(7);
console.log(analytics);

// 5. Monitor error queue
const queueStatus = await ErrorRecoveryService.processQueue('refunds', processor);
console.log(queueStatus);

// 6. Check inventory health
const health = {
  lastSync: InventorySyncService.lastSyncTime,
  isRunning: InventorySyncService.isRunning,
  recentErrors: EventLoggingService.getCriticalEvents(10),
};
`;

module.exports = {
  IMPLEMENTATION_CHECKLIST,
  SERVER_UPDATE,
  PAYMENT_CONTROLLER_UPDATE,
  ORDER_CONTROLLER_UPDATE,
  QIKINK_WEBHOOK_UPDATE,
  ROUTE_VALIDATION_UPDATE,
  ENV_VARIABLES,
  SERVICE_INITIALIZATION,
  TEST_ENDPOINTS,
  MONITORING_GUIDE,
};
