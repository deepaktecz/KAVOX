'use strict';

const Order = require('../../models/Order');
const User = require('../../models/User');
const logger = require('../../utils/logger');
const EmailService = require('../email/email.service');
const ReturnRefundService = require('../Returns/return.refund.service');
const InventorySyncService = require('../inventory/inventory.sync.service');
const EventLoggingService = require('../logging/event.logging.service');
const ErrorRecoveryService = require('../error/error.recovery.service');

/**
 * ORDER INTEGRATION SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Integrate orders with emails, refunds, inventory, and notifications
 */

class OrderIntegrationService {
  /**
   * Handle order creation with email notification
   */
  static async createOrderWithNotification(orderData, userId) {
    try {
      // Create order
      const order = await Order.create(orderData);

      // Log event
      await EventLoggingService.logOrderEvent(
        order._id,
        'CREATED',
        { orderNumber: order.orderNumber, amount: order.totalAmount },
        { userId }
      );

      // Get user for email
      const user = await User.findById(userId);

      if (user && user.email) {
        // Send confirmation email (async, non-blocking)
        EmailService.sendOrderConfirmation(user, order).catch(error => {
          logger.error('Failed to send order confirmation email:', error);
        });
      }

      logger.info('Order created successfully:', { orderId: order._id, orderNumber: order.orderNumber });

      return {
        success: true,
        order,
        message: 'Order created successfully. Confirmation email sent.',
      };
    } catch (error) {
      logger.error('Order creation failed:', error);
      await EventLoggingService.logOrderEvent(
        null,
        'CREATION_FAILED',
        { error: error.message, data: orderData },
        { userId }
      );
      throw error;
    }
  }

  /**
   * Handle payment confirmation with notifications and inventory deduction
   */
  static async handlePaymentConfirmed(orderId, paymentDetails, userId) {
    try {
      const order = await Order.findByIdAndUpdate(
        orderId,
        {
          paymentStatus: 'paid',
          paidAt: new Date(),
          razorpayPaymentId: paymentDetails.paymentId,
          status: 'confirmed',
        },
        { new: true }
      );

      if (!order) {
        throw new Error('Order not found');
      }

      // Deduct inventory for POD products
      for (const item of order.items) {
        if (item.isPOD && item.variant.sku) {
          try {
            await InventorySyncService.deductStock(
              item.product,
              item.variant.sku,
              item.quantity
            );
          } catch (inventoryError) {
            logger.error('Inventory deduction failed:', inventoryError);
            // Don't throw - order is already paid, we can handle inventory separately
          }
        }
      }

      // Log event
      await EventLoggingService.logPaymentEvent(
        paymentDetails.paymentId,
        'CONFIRMED',
        { orderId: order._id, amount: paymentDetails.amount },
        { userId }
      );

      // Send payment confirmation email
      const user = await User.findById(userId);

      if (user && user.email) {
        EmailService.sendPaymentConfirmation(user, order, paymentDetails).catch(error => {
          logger.error('Failed to send payment confirmation email:', error);
        });
      }

      logger.info('Payment confirmed for order:', { orderId, paymentId: paymentDetails.paymentId });

      return {
        success: true,
        order,
        message: 'Payment confirmed. Confirmation email sent.',
      };
    } catch (error) {
      logger.error('Payment confirmation failed:', error);
      await EventLoggingService.logPaymentEvent(
        paymentDetails.paymentId,
        'CONFIRMATION_FAILED',
        { orderId, error: error.message },
        { userId }
      );
      throw error;
    }
  }

  /**
   * Handle Qikink order status update
   */
  static async handleQikinkStatusUpdate(qikinkOrderId, status, trackingDetails = {}) {
    try {
      const order = await Order.findOne({ qikinkOrderId });

      if (!order) {
        logger.warn('Order not found for Qikink order:', { qikinkOrderId });
        return { success: false, error: 'Order not found' };
      }

      let previousStatus = order.status;
      let emailSent = false;

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

      const newStatus = statusMap[status] || order.status;

      // Update order
      order.status = newStatus;
      order.qikinkFulfillmentStatus = status;

      if (trackingDetails.trackingNumber) {
        order.trackingNumber = trackingDetails.trackingNumber;
      }

      if (trackingDetails.courierName) {
        order.courierName = trackingDetails.courierName;
      }

      if (trackingDetails.estimatedDelivery) {
        order.estimatedDelivery = trackingDetails.estimatedDelivery;
      }

      if (status === 'delivered') {
        order.deliveredAt = new Date();
        order.status = 'delivered';
      }

      await order.save();

      // Log event
      await EventLoggingService.logIntegrationEvent(
        'QIKINK',
        'STATUS_UPDATE',
        { qikinkStatus: status, internalStatus: newStatus, orderId: order._id },
        { orderId: order._id }
      );

      // Send shipping notification if status changed to shipped
      if (newStatus === 'shipped' && previousStatus !== 'shipped') {
        const user = await User.findById(order.userId);

        if (user && user.email) {
          EmailService.sendShippingNotification(user, order, trackingDetails).catch(error => {
            logger.error('Failed to send shipping email:', error);
          });

          emailSent = true;
        }
      }

      // Send delivery notification if delivered
      if (newStatus === 'delivered' && previousStatus !== 'delivered') {
        const user = await User.findById(order.userId);

        if (user && user.email) {
          EmailService.sendDeliveryNotification(user, order).catch(error => {
            logger.error('Failed to send delivery email:', error);
          });

          emailSent = true;
        }
      }

      logger.info('Qikink status update processed:', {
        orderId: order._id,
        qikinkStatus: status,
        internalStatus: newStatus,
      });

      return {
        success: true,
        order,
        statusChanged: previousStatus !== newStatus,
        emailSent,
      };
    } catch (error) {
      logger.error('Failed to process Qikink status update:', error);
      await EventLoggingService.logIntegrationEvent(
        'QIKINK',
        'STATUS_UPDATE_FAILED',
        { qikinkOrderId, error: error.message }
      );
      throw error;
    }
  }

  /**
   * Handle order cancellation
   */
  static async handleOrderCancellation(orderId, userId, reason = 'User request') {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      if (!['pending_payment', 'confirmed', 'processing'].includes(order.status)) {
        throw new Error(`Cannot cancel order with status: ${order.status}`);
      }

      const previousStatus = order.status;

      // Update order
      order.status = 'cancelled';
      order.cancellationReason = reason;
      order.cancelledAt = new Date();
      order.cancelledBy = 'user';

      await order.save();

      // Restore inventory for POD products
      for (const item of order.items) {
        if (item.isPOD && item.variant.sku) {
          try {
            await InventorySyncService.restoreStock(
              item.product,
              item.variant.sku,
              item.quantity
            );
          } catch (error) {
            logger.error('Inventory restoration failed:', error);
          }
        }
      }

      // Log event
      await EventLoggingService.logOrderEvent(
        orderId,
        'CANCELLED',
        { reason, previousStatus },
        { userId }
      );

      // Send cancellation email
      const user = await User.findById(userId);

      if (user && user.email) {
        EmailService.sendCancellationNotification(user, order, reason).catch(error => {
          logger.error('Failed to send cancellation email:', error);
        });
      }

      // Process refund if payment was made
      if (order.paymentStatus === 'paid' && order.razorpayPaymentId) {
        try {
          await ReturnRefundService.processRefund(orderId, {
            reason: `Order cancelled: ${reason}`,
            amount: order.totalAmount,
          });
        } catch (refundError) {
          logger.error('Refund processing failed during cancellation:', refundError);
          // Queue for retry
          await ErrorRecoveryService.queueForRetry(
            { action: 'refund', orderId, amount: order.totalAmount, reason },
            'refunds'
          );
        }
      }

      logger.info('Order cancelled successfully:', { orderId, reason });

      return {
        success: true,
        order,
        message: 'Order cancelled successfully.',
      };
    } catch (error) {
      logger.error('Order cancellation failed:', error);
      await EventLoggingService.logOrderEvent(
        orderId,
        'CANCELLATION_FAILED',
        { error: error.message, reason },
        { userId }
      );
      throw error;
    }
  }

  /**
   * Handle return request
   */
  static async handleReturnRequest(orderId, userId, returnData) {
    try {
      const result = await ReturnRefundService.createReturnRequest(
        orderId,
        userId,
        returnData
      );

      // Log event
      await EventLoggingService.logOrderEvent(
        orderId,
        'RETURN_REQUESTED',
        { totalRefund: result.returnRequest.totalRefundAmount },
        { userId }
      );

      logger.info('Return request created:', { orderId, userId });

      return {
        success: true,
        returnRequest: result.returnRequest,
        message: 'Return request submitted successfully. We will review and get back to you soon.',
      };
    } catch (error) {
      logger.error('Return request failed:', error);
      await EventLoggingService.logOrderEvent(
        orderId,
        'RETURN_REQUEST_FAILED',
        { error: error.message },
        { userId }
      );
      throw error;
    }
  }

  /**
   * Get order with full history
   */
  static async getOrderWithHistory(orderId, userId = null) {
    try {
      const order = await Order.findById(orderId)
        .populate('userId', 'name email phone')
        .populate('items.product', 'name image price');

      if (!order) {
        throw new Error('Order not found');
      }

      if (userId && order.userId._id.toString() !== userId) {
        throw new Error('Unauthorized');
      }

      const timeline = await EventLoggingService.getOrderTimeline(orderId);
      const returnStatus = await ReturnRefundService.getRefundStatus(orderId);

      return {
        order,
        timeline,
        returnStatus,
        returnPolicy: ReturnRefundService.getReturnPolicy(),
      };
    } catch (error) {
      logger.error('Failed to get order history:', error);
      throw error;
    }
  }

  /**
   * Sync inventory and check stock
   */
  static async checkAndSyncInventory(productId, variantSku, quantity = 1) {
    try {
      // Check current stock
      const stockStatus = await InventorySyncService.isVariantInStock(
        productId,
        variantSku,
        quantity
      );

      if (!stockStatus.inStock) {
        // Try to sync latest from Qikink
        logger.info('Stock insufficient, syncing from Qikink...');
        await InventorySyncService.syncProductById(productId);

        // Check again
        const updatedStatus = await InventorySyncService.isVariantInStock(
          productId,
          variantSku,
          quantity
        );

        return updatedStatus;
      }

      return stockStatus;
    } catch (error) {
      logger.error('Inventory check failed:', error);
      return { inStock: true, reason: 'Could not verify stock, allowing purchase' };
    }
  }
}

module.exports = OrderIntegrationService;
