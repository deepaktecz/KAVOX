'use strict';

const express = require('express');
const router = express.Router();
const logger = require('../../utils/logger');
const ReturnRefundService = require('../../services/Returns/return.refund.service');
const { requireAuth, requireAdmin, validateFields } = require('../../middleware/security.middleware');

/**
 * RETURN & REFUND ROUTES
 * ═════════════════════════════════════════════════════════════════
 * Manage order returns and refunds
 */

/**
 * GET /api/returns/policy
 * Get return policy details
 */
router.get('/policy', (req, res) => {
  try {
    const policy = ReturnRefundService.getReturnPolicy();

    res.json({
      success: true,
      policy,
    });
  } catch (error) {
    logger.error('Failed to fetch return policy:', error);
    res.status(500).json({ error: 'Failed to fetch return policy' });
  }
});

/**
 * POST /api/returns/request/:orderId
 * Create a return request for an order
 */
router.post(
  '/request/:orderId',
  requireAuth,
  validateFields([
    { name: 'items', type: 'string', required: true },
    { name: 'reason', type: 'string', required: false },
  ]),
  async (req, res) => {
    try {
      const { orderId } = req.params;
      const { items, reason, comments } = req.body;

      // Parse items if it's a JSON string
      const parseditems = typeof items === 'string' ? JSON.parse(items) : items;

      const result = await ReturnRefundService.createReturnRequest(
        orderId,
        req.user.id,
        {
          items: parseditems,
          reason,
          comments,
        }
      );

      res.json({
        success: true,
        returnRequest: result.returnRequest,
        message: 'Return request created successfully',
      });
    } catch (error) {
      logger.error('Failed to create return request:', error);
      res.status(error.message.includes('Unauthorized') ? 403 : 400).json({
        error: error.message || 'Failed to create return request',
      });
    }
  }
);

/**
 * GET /api/returns/requests
 * Get all return requests (user or admin)
 */
router.get('/requests', requireAuth, async (req, res) => {
  try {
    const isAdmin = req.user.role === 'admin';
    const requests = await ReturnRefundService.getReturnRequests(
      isAdmin ? null : req.user.id,
      isAdmin
    );

    res.json({
      success: true,
      returns: requests,
    });
  } catch (error) {
    logger.error('Failed to fetch return requests:', error);
    res.status(500).json({ error: 'Failed to fetch return requests' });
  }
});

/**
 * GET /api/returns/requests/:orderId
 * Get specific return request
 */
router.get('/requests/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const requests = await ReturnRefundService.getReturnRequests(req.user.id);
    const returnRequest = requests.find(r => r.orderId === orderId);

    if (!returnRequest) {
      return res.status(404).json({ error: 'Return request not found' });
    }

    res.json({
      success: true,
      returnRequest,
    });
  } catch (error) {
    logger.error('Failed to fetch return request:', error);
    res.status(500).json({ error: 'Failed to fetch return request' });
  }
});

/**
 * POST /api/returns/approve/:orderId
 * Approve return request (admin only)
 */
router.post('/approve/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { shippingLabel } = req.body;

    const result = await ReturnRefundService.approveReturn(orderId, {
      approvedBy: req.user.id,
      shippingLabel,
    });

    res.json({
      success: true,
      message: 'Return request approved',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to approve return:', error);
    res.status(400).json({ error: error.message || 'Failed to approve return' });
  }
});

/**
 * POST /api/returns/reject/:orderId
 * Reject return request (admin only)
 */
router.post('/reject/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { reason } = req.body;

    if (!reason) {
      return res.status(400).json({ error: 'Rejection reason is required' });
    }

    const result = await ReturnRefundService.rejectReturn(orderId, { reason });

    res.json({
      success: true,
      message: 'Return request rejected',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to reject return:', error);
    res.status(400).json({ error: error.message || 'Failed to reject return' });
  }
});

/**
 * POST /api/returns/shipped/:orderId
 * Mark return as shipped by customer
 */
router.post('/shipped/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { trackingNumber } = req.body;

    if (!trackingNumber) {
      return res.status(400).json({ error: 'Tracking number is required' });
    }

    const result = await ReturnRefundService.markReturnShipped(orderId, trackingNumber);

    res.json({
      success: true,
      message: 'Return marked as shipped',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to mark return as shipped:', error);
    res.status(400).json({ error: error.message || 'Failed to mark return as shipped' });
  }
});

/**
 * POST /api/returns/received/:orderId
 * Mark return as received by warehouse (admin only)
 */
router.post('/received/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;

    const result = await ReturnRefundService.markReturnReceived(orderId);

    res.json({
      success: true,
      message: 'Return marked as received and refund initiated',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to mark return as received:', error);
    res.status(400).json({ error: error.message || 'Failed to mark return as received' });
  }
});

/**
 * POST /api/returns/refund/:orderId
 * Process refund (admin only)
 */
router.post('/refund/:orderId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId } = req.params;
    const { amount, reason } = req.body;

    const result = await ReturnRefundService.processRefund(orderId, { amount, reason });

    res.json({
      success: true,
      message: 'Refund processed successfully',
      ...result,
    });
  } catch (error) {
    logger.error('Failed to process refund:', error);
    res.status(400).json({ error: error.message || 'Failed to process refund' });
  }
});

/**
 * GET /api/returns/refund-status/:orderId
 * Get refund status for order
 */
router.get('/refund-status/:orderId', requireAuth, async (req, res) => {
  try {
    const { orderId } = req.params;

    const status = await ReturnRefundService.getRefundStatus(orderId);

    res.json({
      success: true,
      ...status,
    });
  } catch (error) {
    logger.error('Failed to fetch refund status:', error);
    res.status(400).json({ error: error.message || 'Failed to fetch refund status' });
  }
});

/**
 * POST /api/returns/cancel-refund/:orderId/:refundId
 * Cancel refund (admin only)
 */
router.post('/cancel-refund/:orderId/:refundId', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { orderId, refundId } = req.params;

    const result = await ReturnRefundService.cancelRefund(orderId, refundId);

    res.json({
      success: true,
      ...result,
    });
  } catch (error) {
    logger.error('Failed to cancel refund:', error);
    res.status(400).json({ error: error.message || 'Failed to cancel refund' });
  }
});

/**
 * GET /api/returns/analytics
 * Get refund analytics (admin only)
 */
router.get('/analytics', requireAuth, requireAdmin, async (req, res) => {
  try {
    const { days = 30 } = req.query;

    const analytics = await ReturnRefundService.getRefundAnalytics(parseInt(days));

    res.json({
      success: true,
      analytics,
    });
  } catch (error) {
    logger.error('Failed to fetch refund analytics:', error);
    res.status(500).json({ error: 'Failed to fetch analytics' });
  }
});

module.exports = router;
