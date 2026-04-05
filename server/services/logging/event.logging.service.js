'use strict';

const fs = require('fs');
const path = require('path');
const logger = require('../../utils/logger');

/**
 * EVENT LOGGING SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Track important business events for audit trail and analytics
 */

class EventLoggingService {
  constructor() {
    this.eventLog = [];
    this.maxEvents = 10000;
    this.eventsFile = path.join(__dirname, '../../logs/events.json');
  }

  /**
   * Log business event
   */
  async logEvent(eventType, eventData, metadata = {}) {
    try {
      const event = {
        id: `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        type: eventType,
        data: eventData,
        metadata: {
          userId: metadata.userId,
          orderId: metadata.orderId,
          ip: metadata.ip,
          userAgent: metadata.userAgent,
          ...metadata,
        },
        timestamp: new Date(),
      };

      this.eventLog.push(event);

      // Keep in-memory log size manageable
      if (this.eventLog.length > this.maxEvents) {
        this.eventLog = this.eventLog.slice(-this.maxEvents);
      }

      // Log to file asynchronously
      this.persistEvent(event).catch(error => {
        logger.error('Failed to persist event:', error);
      });

      return event.id;
    } catch (error) {
      logger.error('Event logging failed:', error);
      return null;
    }
  }

  /**
   * Persist event to file
   */
  async persistEvent(event) {
    try {
      const logDir = path.dirname(this.eventsFile);

      if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir, { recursive: true });
      }

      const timestamp = new Date().toISOString().split('T')[0];
      const dailyFile = path.join(
        logDir,
        `events-${timestamp}.json`
      );

      let events = [];

      if (fs.existsSync(dailyFile)) {
        const content = fs.readFileSync(dailyFile, 'utf8');
        events = JSON.parse(content || '[]');
      }

      events.push(event);

      fs.writeFileSync(dailyFile, JSON.stringify(events, null, 2));
    } catch (error) {
      logger.error('Failed to persist event to file:', error);
    }
  }

  /**
   * Log order event
   */
  async logOrderEvent(orderId, eventType, details = {}, metadata = {}) {
    return this.logEvent('ORDER_' + eventType, {
      orderId,
      ...details,
    }, metadata);
  }

  /**
   * Log payment event
   */
  async logPaymentEvent(paymentId, eventType, details = {}, metadata = {}) {
    return this.logEvent('PAYMENT_' + eventType, {
      paymentId,
      ...details,
    }, metadata);
  }

  /**
   * Log user event
   */
  async logUserEvent(userId, eventType, details = {}, metadata = {}) {
    return this.logEvent('USER_' + eventType, {
      userId,
      ...details,
    }, { userId, ...metadata });
  }

  /**
   * Log security event
   */
  async logSecurityEvent(eventType, details = {}, metadata = {}) {
    return this.logEvent('SECURITY_' + eventType, details, metadata);
  }

  /**
   * Log integration event (Qikink, Razorpay, etc.)
   */
  async logIntegrationEvent(service, eventType, details = {}, metadata = {}) {
    return this.logEvent(`INTEGRATION_${service}_${eventType}`, details, metadata);
  }

  /**
   * Get events by type
   */
  getEventsByType(eventType, limit = 100) {
    return this.eventLog
      .filter(event => event.type === eventType || event.type.includes(eventType))
      .reverse()
      .slice(0, limit);
  }

  /**
   * Get events by user
   */
  getEventsByUser(userId, limit = 100) {
    return this.eventLog
      .filter(event => event.metadata.userId === userId)
      .reverse()
      .slice(0, limit);
  }

  /**
   * Get events by order
   */
  getEventsByOrder(orderId, limit = 100) {
    return this.eventLog
      .filter(event => event.metadata.orderId === orderId || event.data.orderId === orderId)
      .reverse()
      .slice(0, limit);
  }

  /**
   * Get recent events
   */
  getRecentEvents(limit = 100) {
    return this.eventLog.slice(-limit).reverse();
  }

  /**
   * Get event timeline for order (for tracking history)
   */
  async getOrderTimeline(orderId) {
    const events = this.getEventsByOrder(orderId, 1000);

    return events
      .sort((a, b) => new Date(a.timestamp) - new Date(b.timestamp))
      .map(event => ({
        timestamp: event.timestamp,
        type: event.type,
        description: this.getEventDescription(event.type, event.data),
        details: event.data,
      }));
  }

  /**
   * Get human-readable description for event
   */
  getEventDescription(eventType, data) {
    const descriptions = {
      'ORDER_CREATED': `Order #${data.orderId} created`,
      'ORDER_CONFIRMED': `Order #${data.orderId} confirmed`,
      'ORDER_PROCESSING': `Order #${data.orderId} is being processed`,
      'ORDER_PACKED': `Order #${data.orderId} packed and ready`,
      'ORDER_SHIPPED': `Order #${data.orderId} shipped`,
      'ORDER_DELIVERED': `Order #${data.orderId} delivered`,
      'ORDER_CANCELLED': `Order #${data.orderId} cancelled`,
      'PAYMENT_INITIATED': `Payment initiated for order #${data.orderId}`,
      'PAYMENT_CONFIRMED': `Payment confirmed for order #${data.orderId}`,
      'PAYMENT_FAILED': `Payment failed for order #${data.orderId}`,
      'PAYMENT_REFUNDED': `Refund processed for order #${data.orderId}`,
      'USER_REGISTERED': `User registered`,
      'USER_LOGIN': `User logged in`,
      'SECURITY_FAILED_LOGIN': `Failed login attempt`,
      'SECURITY_SUSPICIOUS_ACTIVITY': `Suspicious activity detected`,
      'INTEGRATION_QIKINK_SUBMITTED': `Order submitted to Qikink`,
      'INTEGRATION_QIKINK_STATUS_UPDATE': `Qikink status updated`,
      'INTEGRATION_RAZORPAY_WEBHOOK': `Razorpay webhook received`,
    };

    return descriptions[eventType] || eventType;
  }

  /**
   * Get event statistics
   */
  getEventStats(hours = 24) {
    const cutoffTime = Date.now() - hours * 60 * 60 * 1000;
    const recentEvents = this.eventLog.filter(
      event => new Date(event.timestamp).getTime() > cutoffTime
    );

    const stats = {
      totalEvents: recentEvents.length,
      eventTypes: {},
      timeRange: { from: new Date(cutoffTime), to: new Date() },
    };

    recentEvents.forEach(event => {
      const type = event.type;
      stats.eventTypes[type] = (stats.eventTypes[type] || 0) + 1;
    });

    return stats;
  }

  /**
   * Search events
   */
  searchEvents(query, limit = 100) {
    const lowerQuery = query.toLowerCase();

    return this.eventLog
      .filter(
        event =>
          event.type.toLowerCase().includes(lowerQuery) ||
          JSON.stringify(event.data).toLowerCase().includes(lowerQuery) ||
          JSON.stringify(event.metadata).toLowerCase().includes(lowerQuery)
      )
      .reverse()
      .slice(0, limit);
  }

  /**
   * Clear old events (run periodically)
   */
  clearOldEvents(daysToKeep = 30) {
    const cutoffTime = Date.now() - daysToKeep * 24 * 60 * 60 * 1000;

    const initialCount = this.eventLog.length;
    this.eventLog = this.eventLog.filter(
      event => new Date(event.timestamp).getTime() > cutoffTime
    );

    const deletedCount = initialCount - this.eventLog.length;
    logger.info(`Cleared ${deletedCount} old events (kept last ${daysToKeep} days)`);

    return { deletedCount, remainingCount: this.eventLog.length };
  }

  /**
   * Export events to CSV
   */
  async exportEventsToCsv(eventTypes = [], outputPath = '/tmp/events.csv') {
    try {
      let events = this.eventLog;

      if (eventTypes.length > 0) {
        events = events.filter(e => eventTypes.includes(e.type));
      }

      const csv = [['ID', 'Type', 'Timestamp', 'User ID', 'Order ID', 'Data']];

      events.forEach(event => {
        csv.push([
          event.id,
          event.type,
          event.timestamp,
          event.metadata.userId || '',
          event.metadata.orderId || '',
          JSON.stringify(event.data),
        ]);
      });

      const csvContent = csv
        .map(row =>
          row
            .map(cell => `"${String(cell).replace(/"/g, '""')}"`)
            .join(',')
        )
        .join('\n');

      fs.writeFileSync(outputPath, csvContent);

      logger.info(`Events exported to ${outputPath}`);
      return { success: true, count: events.length, path: outputPath };
    } catch (error) {
      logger.error('Failed to export events:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Get critical events (errors, failures, security issues)
   */
  getCriticalEvents(limit = 50) {
    const criticalTypes = [
      'PAYMENT_FAILED',
      'ORDER_CANCELLED',
      'SECURITY_FAILED_LOGIN',
      'SECURITY_SUSPICIOUS_ACTIVITY',
      'INTEGRATION_ERROR',
    ];

    return this.eventLog
      .filter(event =>
        criticalTypes.some(type => event.type.includes(type))
      )
      .reverse()
      .slice(0, limit);
  }
}

module.exports = new EventLoggingService();
