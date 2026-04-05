'use strict';

/**
 * REAL-TIME SOCKET.IO SERVICE
 * ────────────────────────────
 * Handles real-time order status updates
 * Manages user connections, rooms, and event emissions
 * Integrates with order system for live tracking
 */

const jwt = require('jsonwebtoken');
const { logger } = require('../auth/utils/logger');

class SocketService {
  constructor() {
    this.io = null;
    this.connectedUsers = new Map(); // Map of userId -> Set of socketIds
    this.userSockets = new Map(); // Map of socketId -> userId
  }

  /**
   * Initialize Socket.io with HTTP server
   * @param {http.Server} httpServer - Express HTTP server
   * @returns {io.Server} Socket.io instance
   */
  initialize(httpServer) {
    const socketIO = require('socket.io');

    this.io = new socketIO(httpServer, {
      cors: {
        origin: process.env.FRONTEND_URL || 'http://localhost:3000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    this.setupMiddleware();
    this.setupEventHandlers();

    logger.info('Socket.io initialized successfully');
    return this.io;
  }

  /**
   * Setup authentication middleware for socket connections
   * @private
   */
  setupMiddleware() {
    // Authenticate socket connections using JWT
    this.io.use((socket, next) => {
      const token = socket.handshake.auth.token || socket.handshake.headers.authorization;

      if (!token) {
        return next(new Error('Authentication token missing'));
      }

      try {
        // Extract token from "Bearer XXX" format if needed
        const cleanToken = token.startsWith('Bearer ') ? token.slice(7) : token;

        const decoded = jwt.verify(cleanToken, process.env.JWT_SECRET || 'your-secret-key');
        socket.userId = decoded.id || decoded._id;
        socket.user = decoded;

        logger.info(`Socket authenticated: ${socket.id} for user ${socket.userId}`);
        next();
      } catch (err) {
        logger.warn(`Socket authentication failed: ${err.message}`);
        next(new Error('Authentication failed'));
      }
    });
  }

  /**
   * Setup default socket event handlers
   * @private
   */
  setupEventHandlers() {
    this.io.on('connection', (socket) => {
      logger.info(`User connected: ${socket.userId} (socket: ${socket.id})`);

      // ─────────────────────────────────────────────────────────
      // JOIN USER ROOM
      // ─────────────────────────────────────────────────────────
      socket.on('join_room', (data) => {
        this.handleUserRoomJoin(socket, data);
      });

      // Automatically join user room on connection
      socket.join(`user_${socket.userId}`);
      this.trackUserConnection(socket.userId, socket.id);

      // ─────────────────────────────────────────────────────────
      // DISCONNECT
      // ─────────────────────────────────────────────────────────
      socket.on('disconnect', () => {
        this.handleDisconnect(socket);
      });

      // ─────────────────────────────────────────────────────────
      // PING/PONG (for connection health check)
      // ─────────────────────────────────────────────────────────
      socket.on('ping', () => {
        socket.emit('pong', { timestamp: new Date().toISOString() });
      });

      // ─────────────────────────────────────────────────────────
      // REQUEST ORDER STATUS
      // ─────────────────────────────────────────────────────────
      socket.on('request_order_status', (data) => {
        this.handleOrderStatusRequest(socket, data);
      });

      // ─────────────────────────────────────────────────────────
      // ERROR HANDLER
      // ─────────────────────────────────────────────────────────
      socket.on('error', (error) => {
        logger.error(`Socket error for user ${socket.userId}: ${error}`);
      });
    });
  }

  /**
   * Track user connection in memory
   * @private
   * @param {string} userId - User ID
   * @param {string} socketId - Socket ID
   */
  trackUserConnection(userId, socketId) {
    if (!this.connectedUsers.has(userId)) {
      this.connectedUsers.set(userId, new Set());
    }
    this.connectedUsers.get(userId).add(socketId);
    this.userSockets.set(socketId, userId);

    logger.info(`User ${userId} connected. Active connections: ${this.connectedUsers.get(userId).size}`);
  }

  /**
   * Handle user room join
   * @private
   * @param {socket} socket - Socket instance
   * @param {object} data - Room data
   */
  handleUserRoomJoin(socket, data) {
    const { orderId, orderNumber } = data;

    if (!orderId && !orderNumber) {
      socket.emit('error', { message: 'Order ID or order number required' });
      return;
    }

    const roomName = orderId ? `order_${orderId}` : `order_${orderNumber}`;
    socket.join(roomName);

    logger.info(`Socket ${socket.id} (user: ${socket.userId}) joined room: ${roomName}`);

    socket.emit('room_joined', {
      room: roomName,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Handle disconnect
   * @private
   * @param {socket} socket - Socket instance
   */
  handleDisconnect(socket) {
    const userId = this.userSockets.get(socket.id);

    if (userId) {
      const userConnections = this.connectedUsers.get(userId);
      if (userConnections) {
        userConnections.delete(socket.id);
        if (userConnections.size === 0) {
          this.connectedUsers.delete(userId);
        }
      }
      this.userSockets.delete(socket.id);
    }

    logger.info(`User disconnected: ${userId} (socket: ${socket.id})`);
  }

  /**
   * Handle order status request
   * @private
   * @param {socket} socket - Socket instance
   * @param {object} data - Request data
   */
  handleOrderStatusRequest(socket, data) {
    const { orderId } = data;

    if (!orderId) {
      socket.emit('error', { message: 'Order ID required' });
      return;
    }

    logger.info(`Status request from user ${socket.userId} for order ${orderId}`);

    // Response should be sent by the order service
    socket.emit('order_status_requested', {
      orderId,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * Check if user is connected
   * @param {string} userId - User ID
   * @returns {boolean} Is connected
   */
  isUserConnected(userId) {
    return this.connectedUsers.has(userId) && this.connectedUsers.get(userId).size > 0;
  }

  /**
   * Get number of user connections
   * @param {string} userId - User ID
   * @returns {number} Number of connections
   */
  getUserConnectionCount(userId) {
    const connections = this.connectedUsers.get(userId);
    return connections ? connections.size : 0;
  }

  /**
   * Get total connected users
   * @returns {number} Number of connected users
   */
  getTotalConnectedUsers() {
    return this.connectedUsers.size;
  }

  // ═══════════════════════════════════════════════════════════════
  // ORDER EVENT EMISSION METHODS
  // ═══════════════════════════════════════════════════════════════

  /**
   * Emit order created event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderCreated(userId, orderData) {
    if (!this.io) {
      logger.warn('Socket.io not initialized');
      return;
    }

    const event = {
      timestamp: new Date().toISOString(),
      status: 'created',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      totalAmount: orderData.totalAmount,
      itemCount: orderData.items.length,
    };

    this.io.to(`user_${userId}`).emit('order_created', event);
    logger.info(`Order created event sent to user ${userId}: ${orderData.orderNumber}`);
  }

  /**
   * Emit order confirmed event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderConfirmed(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'confirmed',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      paymentStatus: orderData.paymentStatus,
      message: 'Payment received and order confirmed',
    };

    this.io.to(`user_${userId}`).emit('order_confirmed', event);
    this.io.to(`order_${orderData._id}`).emit('order_confirmed', event);
    logger.info(`Order confirmed event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit order processing event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderProcessing(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'processing',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      qikinkOrderId: orderData.qikinkOrderId,
      message: 'Order is being processed',
    };

    this.io.to(`user_${userId}`).emit('order_processing', event);
    this.io.to(`order_${orderData._id}`).emit('order_processing', event);
    logger.info(`Order processing event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit printing started event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderPrinting(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'printed',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      qikinkFulfillmentStatus: orderData.qikinkFulfillmentStatus,
      message: 'Your order has started printing',
    };

    this.io.to(`user_${userId}`).emit('order_printing', event);
    this.io.to(`order_${orderData._id}`).emit('order_printing', event);
    logger.info(`Printing event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit order packed event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderPacked(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'packed',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      message: 'Order has been packed and is ready for dispatch',
    };

    this.io.to(`user_${userId}`).emit('order_packed', event);
    this.io.to(`order_${orderData._id}`).emit('order_packed', event);
    logger.info(`Order packed event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit order shipped event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data with tracking info
   */
  emitOrderShipped(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'shipped',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      courierName: orderData.courierName,
      trackingNumber: orderData.trackingNumber,
      estimatedDelivery: orderData.estimatedDelivery,
      message: `Your order has been shipped via ${orderData.courierName || 'courier'}`,
    };

    this.io.to(`user_${userId}`).emit('order_shipped', event);
    this.io.to(`order_${orderData._id}`).emit('order_shipped', event);
    logger.info(`Order shipped event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit out for delivery event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderOutForDelivery(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'out_for_delivery',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      trackingNumber: orderData.trackingNumber,
      estimatedDelivery: orderData.estimatedDelivery,
      message: 'Your order is out for delivery today',
    };

    this.io.to(`user_${userId}`).emit('order_out_for_delivery', event);
    this.io.to(`order_${orderData._id}`).emit('order_out_for_delivery', event);
    logger.info(`Out for delivery event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit order delivered event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderDelivered(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'delivered',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      deliveredAt: orderData.deliveredAt,
      message: 'Your order has been delivered successfully',
    };

    this.io.to(`user_${userId}`).emit('order_delivered', event);
    this.io.to(`order_${orderData._id}`).emit('order_delivered', event);
    logger.info(`Order delivered event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit order cancelled event
   * @param {string} userId - User ID
   * @param {object} orderData - Order data
   */
  emitOrderCancelled(userId, orderData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      status: 'cancelled',
      orderId: orderData._id,
      orderNumber: orderData.orderNumber,
      cancellationReason: orderData.cancellationReason,
      message: `Order has been cancelled${orderData.cancellationReason ? ': ' + orderData.cancellationReason : ''}`,
    };

    this.io.to(`user_${userId}`).emit('order_cancelled', event);
    this.io.to(`order_${orderData._id}`).emit('order_cancelled', event);
    logger.info(`Order cancelled event sent for ${orderData.orderNumber}`);
  }

  /**
   * Emit generic order status update
   * @param {string} userId - User ID
   * @param {string} orderId - Order ID
   * @param {object} statusData - Status data
   */
  emitOrderStatus(userId, orderId, statusData) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      orderId,
      ...statusData,
    };

    this.io.to(`user_${userId}`).emit('order_status_update', event);
    this.io.to(`order_${orderId}`).emit('order_status_update', event);
    logger.info(`Order status update sent for ${orderId}`);
  }

  /**
   * Emit tracking event (intermediate status from courier)
   * @param {string} userId - User ID
   * @param {string} orderId - Order ID
   * @param {object} trackingEvent - Tracking event data
   */
  emitTrackingEvent(userId, orderId, trackingEvent) {
    if (!this.io) return;

    const event = {
      timestamp: new Date().toISOString(),
      orderId,
      status: trackingEvent.status,
      message: trackingEvent.message,
      location: trackingEvent.location,
      updatedBy: trackingEvent.updatedBy,
    };

    this.io.to(`user_${userId}`).emit('tracking_update', event);
    this.io.to(`order_${orderId}`).emit('tracking_update', event);
    logger.info(`Tracking event sent for ${orderId}: ${trackingEvent.status}`);
  }

  /**
   * Emit error event to user
   * @param {string} userId - User ID
   * @param {string} message - Error message
   */
  emitError(userId, message) {
    if (!this.io) return;

    this.io.to(`user_${userId}`).emit('error', {
      timestamp: new Date().toISOString(),
      message,
      severity: 'error',
    });
  }

  /**
   * Emit info notification to user
   * @param {string} userId - User ID
   * @param {string} message - Notification message
   * @param {object} data - Additional data
   */
  emitNotification(userId, message, data = {}) {
    if (!this.io) return;

    this.io.to(`user_${userId}`).emit('notification', {
      timestamp: new Date().toISOString(),
      message,
      ...data,
    });
  }

  /**
   * Emit to specific order room
   * @param {string} orderId - Order ID
   * @param {string} eventName - Event name
   * @param {object} data - Event data
   */
  emitToOrder(orderId, eventName, data) {
    if (!this.io) return;

    this.io.to(`order_${orderId}`).emit(eventName, {
      timestamp: new Date().toISOString(),
      orderId,
      ...data,
    });
  }

  /**
   * Broadcast to all connected clients
   * @param {string} eventName - Event name
   * @param {object} data - Event data
   */
  broadcast(eventName, data) {
    if (!this.io) return;

    this.io.emit(eventName, {
      timestamp: new Date().toISOString(),
      ...data,
    });
  }

  /**
   * Disconnect a user (remove all their socket connections)
   * @param {string} userId - User ID
   */
  disconnectUser(userId) {
    const socketIds = this.connectedUsers.get(userId);

    if (socketIds) {
      socketIds.forEach((socketId) => {
        const socket = this.io.sockets.sockets.get(socketId);
        if (socket) {
          socket.disconnect();
        }
      });
      this.connectedUsers.delete(userId);
    }

    logger.info(`Disconnected all sockets for user ${userId}`);
  }

  /**
   * Get socket.io instance
   * @returns {io.Server} Socket.io instance
   */
  getIO() {
    return this.io;
  }
}

// Export singleton instance
module.exports = new SocketService();
