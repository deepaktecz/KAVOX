'use strict';

const nodemailer = require('nodemailer');
const logger = require('../../utils/logger');

/**
 * EMAIL SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Handles all email notifications for orders, payments, and shipping
 */

class EmailService {
  constructor() {
    this.transporter = null;
    this.initialize();
  }

  initialize() {
    try {
      this.transporter = nodemailer.createTransport({
        service: process.env.EMAIL_SERVICE || 'gmail',
        host: process.env.EMAIL_HOST,
        port: process.env.EMAIL_PORT || 587,
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
          user: process.env.EMAIL_USER,
          pass: process.env.EMAIL_PASSWORD,
        },
      });

      logger.info('Email service initialized');
    } catch (error) {
      logger.error('Email service initialization failed:', error);
    }
  }

  async sendEmail(to, subject, htmlContent, retries = 3) {
    if (!this.transporter) {
      logger.warn('Email transporter not initialized');
      return { success: false, error: 'Email service not configured' };
    }

    if (!to || !subject || !htmlContent) {
      logger.error('Missing email parameters:', { to, subject });
      return { success: false, error: 'Invalid email parameters' };
    }

    let lastError;
    for (let attempt = 1; attempt <= retries; attempt++) {
      try {
        const result = await this.transporter.sendMail({
          from: `"${process.env.EMAIL_FROM_NAME || 'KAVOX'}" <${process.env.EMAIL_USER}>`,
          to,
          subject,
          html: htmlContent,
        });

        logger.info(`Email sent to ${to}:`, { subject, messageId: result.messageId });
        return { success: true, messageId: result.messageId };
      } catch (error) {
        lastError = error;
        logger.warn(`Email send attempt ${attempt}/${retries} failed for ${to}:`, error.message);

        if (attempt < retries) {
          await new Promise(resolve => setTimeout(resolve, 1000 * attempt));
        }
      }
    }

    logger.error(`Email send failed after ${retries} attempts for ${to}:`, lastError);
    return { success: false, error: lastError.message };
  }

  async sendOrderConfirmation(user, order) {
    const subject = `Order Confirmed - #${order.orderNumber}`;
    const itemsHTML = order.items
      .map(
        item => `
      <tr>
        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${item.productId?.name || 'Product'}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: center;">${item.quantity}</td>
        <td style="padding: 10px; border-bottom: 1px solid #ddd; text-align: right;">₹${item.price}</td>
      </tr>
    `
      )
      .join('');

    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #2c3e50; color: white; padding: 20px; text-align: center; }
            .order-number { font-size: 24px; font-weight: bold; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #007bff; }
            .section h3 { margin-top: 0; color: #2c3e50; }
            table { width: 100%; border-collapse: collapse; }
            .total { font-size: 18px; font-weight: bold; color: #007bff; }
            .footer { text-align: center; margin-top: 30px; color: #666; font-size: 12px; }
            .button { display: inline-block; padding: 10px 20px; background: #007bff; color: white; text-decoration: none; border-radius: 5px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="order-number">Order #${order.orderNumber}</div>
              <p>Thank you for your order!</p>
            </div>

            <div class="section">
              <h3>📦 Order Details</h3>
              <p><strong>Order ID:</strong> ${order._id}</p>
              <p><strong>Order Date:</strong> ${new Date(order.createdAt).toLocaleDateString()}</p>
              <p><strong>Status:</strong> <span style="color: #28a745;">${order.status.toUpperCase()}</span></p>
            </div>

            <div class="section">
              <h3>📋 Items</h3>
              <table>
                <thead>
                  <tr style="background: #e9ecef;">
                    <th style="padding: 10px; text-align: left;">Product</th>
                    <th style="padding: 10px; text-align: center;">Qty</th>
                    <th style="padding: 10px; text-align: right;">Price</th>
                  </tr>
                </thead>
                <tbody>
                  ${itemsHTML}
                </tbody>
              </table>
            </div>

            <div class="section">
              <h3>💰 Payment Summary</h3>
              <table style="width: auto;">
                <tr>
                  <td style="padding: 5px 10px;">Subtotal:</td>
                  <td style="padding: 5px 10px; text-align: right;">₹${order.subtotal}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 10px;">Shipping:</td>
                  <td style="padding: 5px 10px; text-align: right;">₹${order.shippingCost || 0}</td>
                </tr>
                <tr>
                  <td style="padding: 5px 10px;">Discount:</td>
                  <td style="padding: 5px 10px; text-align: right;">-₹${order.discountAmount || 0}</td>
                </tr>
                <tr style="border-top: 2px solid #ddd; font-weight: bold;">
                  <td style="padding: 5px 10px;">Total:</td>
                  <td style="padding: 5px 10px; text-align: right; font-size: 18px;">₹${order.totalAmount}</td>
                </tr>
              </table>
            </div>

            <div class="section">
              <h3>📍 Delivery Address</h3>
              <p>
                ${order.shippingAddress.name}<br>
                ${order.shippingAddress.street}<br>
                ${order.shippingAddress.city}, ${order.shippingAddress.state} ${order.shippingAddress.zipCode}<br>
                ${order.shippingAddress.phone}
              </p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/orders/${order._id}" class="button">Track Order</a>
            </div>

            <div class="footer">
              <p>© ${new Date().getFullYear()} KAVOX. All rights reserved.</p>
              <p>If you have any questions, contact us at support@kavox.com</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, htmlContent);
  }

  async sendPaymentConfirmation(user, order, paymentDetails) {
    const subject = `Payment Received - Order #${order.orderNumber}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #28a745; }
            .success-badge { background: #28a745; color: white; padding: 10px 20px; border-radius: 5px; display: inline-block; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-badge">✓ Payment Successful</div>
              <p>Order #${order.orderNumber}</p>
            </div>

            <div class="section">
              <h3>Payment Details</h3>
              <p><strong>Order ID:</strong> ${order._id}</p>
              <p><strong>Amount Paid:</strong> ₹${paymentDetails.amount}</p>
              <p><strong>Payment ID:</strong> ${paymentDetails.paymentId}</p>
              <p><strong>Date:</strong> ${new Date(paymentDetails.timestamp || Date.now()).toLocaleDateString()}</p>
              <p><strong>Status:</strong> <span style="color: #28a745;">SUCCESSFUL</span></p>
            </div>

            <div class="section">
              <h3>What's Next?</h3>
              <p>Your order is being processed and will be dispatched shortly. You'll receive another email once your items ship.</p>
              <p><strong>Estimated Delivery:</strong> ${order.estimatedDelivery ? new Date(order.estimatedDelivery).toLocaleDateString() : '5-7 business days'}</p>
            </div>

            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL}/orders/${order._id}" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">View Order</a>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} KAVOX. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, htmlContent);
  }

  async sendShippingNotification(user, order, trackingDetails) {
    const subject = `Your Order is On Its Way - #${order.orderNumber}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #0066cc; color: white; padding: 20px; text-align: center; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #0066cc; }
            .tracking-box { background: white; border: 2px solid #0066cc; padding: 15px; border-radius: 5px; margin: 10px 0; }
            .tracking-number { font-size: 20px; font-weight: bold; font-family: monospace; color: #0066cc; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>📦 Order Shipped!</h2>
              <p>Order #${order.orderNumber}</p>
            </div>

            <div class="section">
              <h3>Tracking Information</h3>
              <div class="tracking-box">
                <p><strong>Courier:</strong> ${trackingDetails.courierName}</p>
                <p><strong>Tracking Number:</strong></p>
                <div class="tracking-number">${trackingDetails.trackingNumber}</div>
                <p><strong>Estimated Delivery:</strong> ${new Date(trackingDetails.estimatedDelivery).toLocaleDateString()}</p>
              </div>
            </div>

            <div class="section">
              <h3>Track Your Package</h3>
              <p>Click the button below to track your package in real-time:</p>
              <a href="${process.env.FRONTEND_URL}/track/${order._id}" style="display: inline-block; padding: 10px 20px; background: #0066cc; color: white; text-decoration: none; border-radius: 5px;">Track Package</a>
            </div>

            <div class="section">
              <h3>Order Details</h3>
              <p><strong>Shipped From:</strong> ${trackingDetails.warehouseLocation || 'KAVOX Warehouse'}</p>
              <p><strong>Delivery Address:</strong><br>
                ${order.shippingAddress.name}<br>
                ${order.shippingAddress.street}<br>
                ${order.shippingAddress.city}, ${order.shippingAddress.state}
              </p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} KAVOX. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, htmlContent);
  }

  async sendDeliveryNotification(user, order) {
    const subject = `Delivery Complete - Order #${order.orderNumber}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #28a745; }
            .success-badge { font-size: 48px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <div class="success-badge">✓</div>
              <h2>Order Delivered!</h2>
              <p>Order #${order.orderNumber}</p>
            </div>

            <div class="section">
              <h3>Thank You for Your Purchase!</h3>
              <p>Your order has been successfully delivered. We hope you're satisfied with your purchase!</p>
            </div>

            <div class="section">
              <h3>What's Next?</h3>
              <p>We'd love to hear from you! Please share your feedback and rate your experience.</p>
              <a href="${process.env.FRONTEND_URL}/orders/${order._id}/review" style="display: inline-block; padding: 10px 20px; background: #28a745; color: white; text-decoration: none; border-radius: 5px;">Leave a Review</a>
            </div>

            <div class="section">
              <p>If you have any issues with your order, please contact us immediately at support@kavox.com</p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} KAVOX. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, htmlContent);
  }

  async sendCancellationNotification(user, order, reason) {
    const subject = `Order Cancelled - Refund Process Started #${order.orderNumber}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #dc3545; color: white; padding: 20px; text-align: center; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #dc3545; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Order Cancelled</h2>
              <p>Order #${order.orderNumber}</p>
            </div>

            <div class="section">
              <h3>Cancellation Details</h3>
              <p><strong>Reason:</strong> ${reason}</p>
              <p><strong>Refund Amount:</strong> ₹${order.totalAmount}</p>
              <p><strong>Status:</strong> Refund initiated</p>
            </div>

            <div class="section">
              <h3>Timeline</h3>
              <p>Your refund will be processed within 5-7 business days. You'll receive a confirmation email once the refund is completed.</p>
            </div>

            <div class="section">
              <h3>Need Help?</h3>
              <p>If you have any questions about this cancellation, please contact our support team at support@kavox.com</p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} KAVOX. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, htmlContent);
  }

  async sendRefundNotification(user, order, refundDetails) {
    const subject = `Refund Processed - #${order.orderNumber}`;
    const htmlContent = `
      <!DOCTYPE html>
      <html>
        <head>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #28a745; color: white; padding: 20px; text-align: center; }
            .section { margin: 20px 0; padding: 15px; background: #f8f9fa; border-left: 4px solid #28a745; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h2>Refund Successful</h2>
              <p>Order #${order.orderNumber}</p>
            </div>

            <div class="section">
              <h3>Refund Confirmation</h3>
              <p><strong>Refund Amount:</strong> ₹${refundDetails.amount}</p>
              <p><strong>Refund ID:</strong> ${refundDetails.refundId}</p>
              <p><strong>Date Processed:</strong> ${new Date().toLocaleDateString()}</p>
            </div>

            <div class="section">
              <h3>Timeline</h3>
              <p>The refund has been initiated and will appear in your original payment source within 5-7 business days, depending on your bank.</p>
            </div>

            <div style="text-align: center; margin-top: 30px; color: #666; font-size: 12px;">
              <p>© ${new Date().getFullYear()} KAVOX. All rights reserved.</p>
            </div>
          </div>
        </body>
      </html>
    `;

    return this.sendEmail(user.email, subject, htmlContent);
  }
}

module.exports = new EmailService();
