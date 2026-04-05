'use strict';

/**
 * ORDER-REALTIME INTEGRATION
 * ──────────────────────────
 * Helper to emit real-time events whenever order status changes
 * Integrates Socket.io with order operations
 */

const socketService = require('./socket.service');
const { logger } = require('../auth/utils/logger');

class OrderRealtimeIntegration {
  /**
   * Emit event when order is created
   * Call this after Order.create()
   * @param {object} order - Order document
   */
  static emitOrderCreated(order) {
    try {
      socketService.emitOrderCreated(order.user.toString(), order);
      logger.info(`Realtime: Order created event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order created): ${err.message}`);
    }
  }

  /**
   * Emit event when payment is confirmed
   * Call this after payment verification
   * @param {object} order - Order document (populated with user)
   */
  static emitPaymentConfirmed(order) {
    try {
      socketService.emitOrderConfirmed(order.user.toString(), order);
      logger.info(`Realtime: Payment confirmed event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (payment confirmed): ${err.message}`);
    }
  }

  /**
   * Emit event when order starts processing
   * Call this when sending to Qikink or starting fulfillment
   * @param {object} order - Order document
   */
  static emitOrderProcessing(order) {
    try {
      socketService.emitOrderProcessing(order.user.toString(), order);
      logger.info(`Realtime: Order processing event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order processing): ${err.message}`);
    }
  }

  /**
   * Emit event when printing starts (Qikink callback)
   * Call this when receiving printing status from Qikink
   * @param {object} order - Order document
   */
  static emitOrderPrinting(order) {
    try {
      socketService.emitOrderPrinting(order.user.toString(), order);
      logger.info(`Realtime: Order printing event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order printing): ${err.message}`);
    }
  }

  /**
   * Emit event when order is packed
   * @param {object} order - Order document
   */
  static emitOrderPacked(order) {
    try {
      socketService.emitOrderPacked(order.user.toString(), order);
      logger.info(`Realtime: Order packed event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order packed): ${err.message}`);
    }
  }

  /**
   * Emit event when order is shipped
   * Call this when shipping info is available
   * @param {object} order - Order document
   */
  static emitOrderShipped(order) {
    try {
      socketService.emitOrderShipped(order.user.toString(), order);
      logger.info(`Realtime: Order shipped event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order shipped): ${err.message}`);
    }
  }

  /**
   * Emit event when order is out for delivery
   * @param {object} order - Order document
   */
  static emitOrderOutForDelivery(order) {
    try {
      socketService.emitOrderOutForDelivery(order.user.toString(), order);
      logger.info(`Realtime: Out for delivery event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (out for delivery): ${err.message}`);
    }
  }

  /**
   * Emit event when order is delivered
   * @param {object} order - Order document
   */
  static emitOrderDelivered(order) {
    try {
      socketService.emitOrderDelivered(order.user.toString(), order);
      logger.info(`Realtime: Order delivered event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order delivered): ${err.message}`);
    }
  }

  /**
   * Emit event when order is cancelled
   * @param {object} order - Order document
   */
  static emitOrderCancelled(order) {
    try {
      socketService.emitOrderCancelled(order.user.toString(), order);
      logger.info(`Realtime: Order cancelled event emitted - ${order.orderNumber}`);
    } catch (err) {
      logger.error(`Realtime error (order cancelled): ${err.message}`);
    }
  }

  /**
   * Emit generic status update with custom data
   * @param {object} order - Order document
   * @param {string} status - Status name
   * @param {object} metadata - Additional metadata
   */
  static emitOrderStatus(order, status, metadata = {}) {
    try {
      socketService.emitOrderStatus(order.user.toString(), order._id.toString(), {
        status,
        ...metadata,
      });
      logger.info(`Realtime: Order status update - ${order.orderNumber}: ${status}`);
    } catch (err) {
      logger.error(`Realtime error (order status): ${err.message}`);
    }
  }

  /**
   * Emit tracking event from courier update
   * Call this when receiving tracking updates from courier
   * @param {object} order - Order document
   * @param {object} trackingEvent - Tracking event object
   */
  static emitTrackingUpdate(order, trackingEvent) {
    try {
      socketService.emitTrackingEvent(
        order.user.toString(),
        order._id.toString(),
        trackingEvent
      );
      logger.info(`Realtime: Tracking update - ${order.orderNumber}: ${trackingEvent.status}`);
    } catch (err) {
      logger.error(`Realtime error (tracking): ${err.message}`);
    }
  }

  /**
   * Emit notification to user
   * @param {string} userId - User ID
   * @param {string} message - Notification message
   * @param {object} data - Additional data
   */
  static emitNotification(userId, message, data = {}) {
    try {
      socketService.emitNotification(userId, message, data);
      logger.info(`Realtime: Notification sent to user ${userId}`);
    } catch (err) {
      logger.error(`Realtime error (notification): ${err.message}`);
    }
  }

  /**
   * Emit error to user
   * @param {string} userId - User ID
   * @param {string} message - Error message
   */
  static emitError(userId, message) {
    try {
      socketService.emitError(userId, message);
      logger.info(`Realtime: Error event sent to user ${userId}`);
    } catch (err) {
      logger.error(`Realtime error (error event): ${err.message}`);
    }
  }

  /**
   * Handle Qikink webhook status update
   * This should be called from the Qikink webhook handler
   * @param {string} qikinkOrderId - Qikink order ID
   * @param {string} status - Qikink status
   * @param {object} metadata - Metadata from Qikink
   */
  static async handleQikinkStatusUpdate(qikinkOrderId, status, metadata = {}) {
    try {
      const Order = require('../order/models/Order');

      // Find order by Qikink ID
      const order = await Order.findOne({ qikinkOrderId })
        .populate('user');

      if (!order) {
        logger.warn(`Qikink order not found: ${qikinkOrderId}`);
        return;
      }

      // Map Qikink status to internal status
      const statusMap = {
        pending: 'processing',
        processing: 'processing',
        printed: 'packed',
        printed_and_packed: 'packed',
        dispatched: 'shipped',
        in_transit: 'shipped',
        out_for_delivery: 'out_for_delivery',
        delivered: 'delivered',
        failed: 'cancelled',
      };

      const newStatus = statusMap[status] || status;

      // Update order status
      if (order.status !== newStatus) {
        order.qikinkFulfillmentStatus = status;
        order.status = newStatus;

        // Add tracking event
        if (metadata.message) {
          order.trackingEvents.push({
            status: newStatus,
            message: metadata.message || `Status updated: ${status}`,
            location: metadata.location,
            updatedBy: 'qikink',
            timestamp: new Date(),
          });
        }

        await order.save();
      }

      // Emit appropriate event based on status
      switch (newStatus) {
        case 'processing':
          this.emitOrderProcessing(order);
          break;
        case 'packed':
          if (status === 'printed' || status === 'printed_and_packed') {
            this.emitOrderPrinting(order); // Print started
          }
          break;
        case 'shipped':
          order.courierName = metadata.courier_name || order.courierName;
          order.trackingNumber = metadata.tracking_number || order.trackingNumber;
          await order.save();
          this.emitOrderShipped(order);
          break;
        case 'out_for_delivery':
          this.emitOrderOutForDelivery(order);
          break;
        case 'delivered':
          order.deliveredAt = new Date();
          await order.save();
          this.emitOrderDelivered(order);
          break;
        case 'cancelled':
          if (!order.cancelledAt) {
            order.cancelledAt = new Date();
            order.cancelledBy = 'qikink';
            await order.save();
          }
          this.emitOrderCancelled(order);
          break;
        default:
          this.emitTrackingUpdate(order, {
            status: newStatus,
            message: metadata.message || `Status: ${status}`,
            location: metadata.location,
            updatedBy: 'qikink',
          });
      }

      logger.info(`Qikink update processed: ${qikinkOrderId} -> ${newStatus}`);
    } catch (err) {
      logger.error(`Qikink status update error: ${err.message}`);
    }
  }

  /**
   * Handle order status change middleware
   * Call this hook when order status changes from anywhere
   * Example: hook -> find oldStatus !== newStatus -> emit event
   * @param {object} order - Updated order document
   * @param {string} previousStatus - Previous status
   */
  static emitStatusChangeEvent(order, previousStatus) {
    try {
      const currentStatus = order.status;

      if (previousStatus === currentStatus) {
        return;
      }

      // Emit appropriate event based on new status
      switch (currentStatus) {
        case 'confirmed':
          this.emitOrderConfirmed(order);
          break;
        case 'processing':
          this.emitOrderProcessing(order);
          break;
        case 'packed':
          this.emitOrderPacked(order);
          break;
        case 'shipped':
          this.emitOrderShipped(order);
          break;
        case 'out_for_delivery':
          this.emitOrderOutForDelivery(order);
          break;
        case 'delivered':
          this.emitOrderDelivered(order);
          break;
        case 'cancelled':
          this.emitOrderCancelled(order);
          break;
        default:
          this.emitOrderStatus(order, currentStatus);
          break;
      }

      logger.info(`Status change event emitted: ${order.orderNumber} ${previousStatus} -> ${currentStatus}`);
    } catch (err) {
      logger.error(`Status change event error: ${err.message}`);
    }
  }

  /**
   * Get Socket.io instance
   * Useful for custom emissions
   * @returns {io.Server} Socket.io instance
   */
  static getSocketIO() {
    return socketService.getIO();
  }

  /**
   * Check if user is connected
   * @param {string} userId - User ID
   * @returns {boolean}
   */
  static isUserConnected(userId) {
    return socketService.isUserConnected(userId);
  }
}

module.exports = OrderRealtimeIntegration;
