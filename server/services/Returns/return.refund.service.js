'use strict';

const Order = require('../../models/Order');
const Razorpay = require('razorpay');
const logger = require('../../utils/logger');
const EmailService = require('../email/email.service');

/**
 * RETURN & REFUND WORKFLOW SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Handle order returns, refund requests, and refund processing
 */

class ReturnRefundService {
  constructor() {
    this.razorpay = new Razorpay({
      key_id: process.env.RAZORPAY_KEY_ID,
      key_secret: process.env.RAZORPAY_KEY_SECRET,
    });
  }

  /**
   * Get return policy details
   */
  getReturnPolicy() {
    return {
      returnWindow: 30, // days
      refundDays: 5, // business days
      conditions: [
        'Product must be in original condition',
        'All packaging and tags must be intact',
        'Must have valid proof of purchase',
        'No signs of wear or damage',
      ],
      nonReturnable: [
        'Custom designs or personalized items',
        'Clearance or final sale items',
        'Items without original tags',
        'Damaged items',
      ],
    };
  }

  /**
   * Create return request
   */
  async createReturnRequest(orderId, userId, returnData) {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      if (order.userId.toString() !== userId) {
        throw new Error('Unauthorized: This order does not belong to you');
      }

      // Check if order is eligible for return
      const returnPolicy = this.getReturnPolicy();
      const daysSinceDelivery = Math.floor(
        (Date.now() - new Date(order.deliveredAt).getTime()) / (1000 * 60 * 60 * 24)
      );

      if (daysSinceDelivery > returnPolicy.returnWindow) {
        throw new Error(`Return window expired. Returns allowed within ${returnPolicy.returnWindow} days of delivery.`);
      }

      if (!['delivered', 'completed'].includes(order.status)) {
        throw new Error('Only delivered orders can be returned');
      }

      // Validate return items
      if (!returnData.items || returnData.items.length === 0) {
        throw new Error('At least one item must be selected for return');
      }

      // Create return record
      const returnRequest = {
        orderId: order._id,
        userId: order.userId,
        items: returnData.items.map(item => {
          const orderItem = order.items.find(oi => oi._id.toString() === item.itemId);
          if (!orderItem) {
            throw new Error(`Item ${item.itemId} not found in order`);
          }

          return {
            itemId: item.itemId,
            reason: item.reason,
            quantity: item.quantity || orderItem.quantity,
            refundAmount: (item.quantity || orderItem.quantity) * orderItem.price,
          };
        }),
        reason: returnData.reason || 'Customer requested return',
        comments: returnData.comments || '',
        createdAt: new Date(),
        status: 'pending', // pending → approved → shipped → received → refunded
        totalRefundAmount: 0,
      };

      // Calculate total refund
      returnRequest.totalRefundAmount = returnRequest.items.reduce(
        (sum, item) => sum + item.refundAmount,
        0
      );

      // Update order with return status
      order.returnStatus = 'pending';
      order.returnRequest = returnRequest;

      await order.save();

      logger.info('Return request created:', {
        orderId: order._id,
        userId,
        totalRefund: returnRequest.totalRefundAmount,
      });

      return {
        success: true,
        returnId: order._id,
        returnRequest,
      };
    } catch (error) {
      logger.error('Failed to create return request:', error);
      throw error;
    }
  }

  /**
   * Get return requests (for customer or admin)
   */
  async getReturnRequests(userId = null, adminFilter = false) {
    try {
      const query = {};

      if (!adminFilter && userId) {
        query.userId = userId;
      }

      const orders = await Order.find({
        'returnRequest.status': { $exists: true, $ne: null },
        ...query,
      }).select('_id orderNumber returnRequest items shippingAddress createdAt');

      return orders.map(order => ({
        orderId: order._id,
        orderNumber: order.orderNumber,
        returnStatus: order.returnRequest?.status,
        totalRefund: order.returnRequest?.totalRefundAmount,
        itemsCount: order.returnRequest?.items?.length,
        reason: order.returnRequest?.reason,
        createdAt: order.returnRequest?.createdAt,
      }));
    } catch (error) {
      logger.error('Failed to get return requests:', error);
      throw error;
    }
  }

  /**
   * Approve return request (admin)
   */
  async approveReturn(orderId, approvalData) {
    try {
      const order = await Order.findById(orderId);

      if (!order || !order.returnRequest) {
        throw new Error('Return request not found');
      }

      const returnRequest = order.returnRequest;
      returnRequest.status = 'approved';
      returnRequest.approvedAt = new Date();
      returnRequest.approvedBy = approvalData.approvedBy;
      returnRequest.shippingLabel = approvalData.shippingLabel || null;

      order.returnStatus = 'approved';

      await order.save();

      logger.info('Return request approved:', {
        orderId,
        refundAmount: returnRequest.totalRefundAmount,
      });

      // TODO: Send email to customer with shipping label

      return { success: true, message: 'Return approved' };
    } catch (error) {
      logger.error('Failed to approve return:', error);
      throw error;
    }
  }

  /**
   * Reject return request (admin)
   */
  async rejectReturn(orderId, rejectionData) {
    try {
      const order = await Order.findById(orderId);

      if (!order || !order.returnRequest) {
        throw new Error('Return request not found');
      }

      const returnRequest = order.returnRequest;
      returnRequest.status = 'rejected';
      returnRequest.rejectionReason = rejectionData.reason;
      returnRequest.rejectedAt = new Date();

      order.returnStatus = 'rejected';

      await order.save();

      logger.info('Return request rejected:', { orderId });

      // TODO: Send email to customer explaining rejection

      return { success: true, message: 'Return rejected' };
    } catch (error) {
      logger.error('Failed to reject return:', error);
      throw error;
    }
  }

  /**
   * Mark return as shipped (customer ships back)
   */
  async markReturnShipped(orderId, trackingNumber) {
    try {
      const order = await Order.findById(orderId);

      if (!order || !order.returnRequest) {
        throw new Error('Return request not found');
      }

      if (order.returnRequest.status !== 'approved') {
        throw new Error('Return must be approved before shipping back');
      }

      order.returnRequest.status = 'shipped';
      order.returnRequest.returnTrackingNumber = trackingNumber;
      order.returnRequest.shippedAt = new Date();
      order.returnStatus = 'shipped';

      await order.save();

      logger.info('Return marked as shipped:', {
        orderId,
        trackingNumber,
      });

      return { success: true, message: 'Return shipped back' };
    } catch (error) {
      logger.error('Failed to mark return as shipped:', error);
      throw error;
    }
  }

  /**
   * Mark return as received (warehouse confirms receipt)
   */
  async markReturnReceived(orderId) {
    try {
      const order = await Order.findById(orderId);

      if (!order || !order.returnRequest) {
        throw new Error('Return request not found');
      }

      if (order.returnRequest.status !== 'shipped') {
        throw new Error('Return must be shipped before marking as received');
      }

      order.returnRequest.status = 'received';
      order.returnRequest.receivedAt = new Date();
      order.returnStatus = 'received';

      await order.save();

      logger.info('Return marked as received:', { orderId });

      // Automatically process refund
      await this.processRefund(orderId);

      return { success: true, message: 'Return received' };
    } catch (error) {
      logger.error('Failed to mark return as received:', error);
      throw error;
    }
  }

  /**
   * Process refund to customer
   */
  async processRefund(orderId, refundData = {}) {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      const refundAmount = refundData.amount || order.returnRequest?.totalRefundAmount || order.totalAmount;

      // Validate refund amount
      if (refundAmount <= 0 || refundAmount > order.totalAmount) {
        throw new Error('Invalid refund amount');
      }

      // Create Razorpay refund
      const razorpayRefund = await this.razorpay.payments.refund(order.razorpayPaymentId, {
        amount: Math.round(refundAmount * 100), // Convert to paise
        speed: 'optimized',
        notes: {
          orderId: order._id.toString(),
          returnId: order.returnRequest?._id?.toString() || 'N/A',
          reason: refundData.reason || 'Customer return',
        },
      });

      // Update order
      if (!order.refunds) {
        order.refunds = [];
      }

      order.refunds.push({
        refundId: razorpayRefund.id,
        amount: refundAmount,
        reason: refundData.reason || 'Return refund',
        status: razorpayRefund.status,
        processedAt: new Date(),
      });

      order.paymentStatus = 'refunded';

      if (order.returnRequest) {
        order.returnRequest.status = 'refunded';
        order.returnRequest.refundId = razorpayRefund.id;
        order.returnRequest.refundProcessedAt = new Date();
      }

      await order.save();

      logger.info('Refund processed:', {
        orderId,
        refundId: razorpayRefund.id,
        amount: refundAmount,
      });

      // Send refund confirmation email
      const user = await require('../../models/User').findById(order.userId);
      if (user) {
        await EmailService.sendRefundNotification(user, order, {
          refundId: razorpayRefund.id,
          amount: refundAmount,
        });
      }

      return {
        success: true,
        refundId: razorpayRefund.id,
        amount: refundAmount,
        message: 'Refund processed successfully',
      };
    } catch (error) {
      logger.error('Refund processing failed:', error);
      throw error;
    }
  }

  /**
   * Get refund status
   */
  async getRefundStatus(orderId) {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      return {
        orderId: order._id,
        orderNumber: order.orderNumber,
        refunds: order.refunds || [],
        totalRefunded: (order.refunds || []).reduce((sum, r) => sum + r.amount, 0),
        paymentStatus: order.paymentStatus,
      };
    } catch (error) {
      logger.error('Failed to get refund status:', error);
      throw error;
    }
  }

  /**
   * Cancel refund (if needed)
   */
  async cancelRefund(orderId, refundId) {
    try {
      const order = await Order.findById(orderId);

      if (!order) {
        throw new Error('Order not found');
      }

      const refund = order.refunds?.find(r => r.refundId === refundId);

      if (!refund) {
        throw new Error('Refund not found');
      }

      // Try to reverse the refund via Razorpay
      try {
        await this.razorpay.refunds.edit(refundId, { status: 'cancelled' });
      } catch (razorpayError) {
        logger.warn('Could not cancel Razorpay refund (may already be processed):', razorpayError.message);
      }

      // Update order
      refund.status = 'cancelled';
      refund.cancelledAt = new Date();

      await order.save();

      logger.info('Refund cancellation requested:', { orderId, refundId });

      return { success: true, message: 'Refund cancellation requested' };
    } catch (error) {
      logger.error('Failed to cancel refund:', error);
      throw error;
    }
  }

  /**
   * Get refund analytics (admin)
   */
  async getRefundAnalytics(days = 30) {
    try {
      const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

      const orders = await Order.find({
        'refunds.0': { $exists: true },
        'refunds.processedAt': { $gte: startDate },
      });

      let totalRefundsAmount = 0;
      let totalRefundsCount = 0;
      const refundsByReason = {};
      const refundsByStatus = {};

      orders.forEach(order => {
        order.refunds.forEach(refund => {
          if (refund.processedAt >= startDate) {
            totalRefundsAmount += refund.amount;
            totalRefundsCount++;

            refundsByReason[refund.reason] = (refundsByReason[refund.reason] || 0) + 1;
            refundsByStatus[refund.status] = (refundsByStatus[refund.status] || 0) + 1;
          }
        });
      });

      return {
        totalRefunds: totalRefundsCount,
        totalRefundAmount: parseFloat(totalRefundsAmount.toFixed(2)),
        averageRefund: totalRefundsCount > 0 ? parseFloat((totalRefundsAmount / totalRefundsCount).toFixed(2)) : 0,
        refundsByReason,
        refundsByStatus,
        periodDays: days,
      };
    } catch (error) {
      logger.error('Failed to get refund analytics:', error);
      throw error;
    }
  }
}

module.exports = new ReturnRefundService();
