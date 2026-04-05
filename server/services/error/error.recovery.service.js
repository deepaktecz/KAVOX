'use strict';

const logger = require('../../utils/logger');

/**
 * ERROR RECOVERY SERVICE
 * ═════════════════════════════════════════════════════════════════
 * Handle API failures, retries, and error recovery patterns
 */

class ErrorRecoveryService {
  /**
   * Retry an async operation with exponential backoff
   */
  static async retryWithBackoff(operation, options = {}) {
    const {
      maxRetries = 3,
      initialDelayMs = 1000,
      maxDelayMs = 30000,
      backoffMultiplier = 2,
      timeout = 30000,
      name = 'Operation',
    } = options;

    let lastError;

    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        const result = await Promise.race([
          operation(),
          new Promise((_, reject) =>
            setTimeout(
              () => reject(new Error(`${name} operation timeout after ${timeout}ms`)),
              timeout
            )
          ),
        ]);

        if (attempt > 1) {
          logger.info(`${name} succeeded after ${attempt} attempt(s)`);
        }

        return { success: true, data: result, attempts: attempt };
      } catch (error) {
        lastError = error;

        if (attempt < maxRetries) {
          const delayMs = Math.min(
            initialDelayMs * Math.pow(backoffMultiplier, attempt - 1),
            maxDelayMs
          );

          logger.warn(`${name} failed (attempt ${attempt}/${maxRetries}), retrying in ${delayMs}ms:`, error.message);

          await new Promise(resolve => setTimeout(resolve, delayMs));
        } else {
          logger.error(`${name} failed after ${maxRetries} attempts:`, error.message);
        }
      }
    }

    return { success: false, error: lastError, attempts: maxRetries };
  }

  /**
   * Execute operation with fallback
   */
  static async executeWithFallback(primary, fallback, name = 'Operation') {
    try {
      logger.debug(`Executing primary operation: ${name}`);
      const result = await primary();
      return { success: true, data: result, source: 'primary' };
    } catch (primaryError) {
      logger.warn(`Primary operation failed for ${name}, trying fallback:`, primaryError.message);

      try {
        const fallbackResult = await fallback();
        return { success: true, data: fallbackResult, source: 'fallback' };
      } catch (fallbackError) {
        logger.error(`Both primary and fallback operations failed for ${name}:`, {
          primary: primaryError.message,
          fallback: fallbackError.message,
        });

        return {
          success: false,
          error: new Error(`${name} failed in both primary and fallback`),
          primaryError,
          fallbackError,
        };
      }
    }
  }

  /**
   * Queue operation for retry (async processing)
   */
  static async queueForRetry(operationData, queue = 'default') {
    try {
      if (!this.operationQueues) {
        this.operationQueues = {};
      }

      if (!this.operationQueues[queue]) {
        this.operationQueues[queue] = [];
      }

      const queuedOperation = {
        id: `${Date.now()}-${Math.random()}`,
        data: operationData,
        queuedAt: new Date(),
        attempts: 0,
        maxAttempts: operationData.maxAttempts || 5,
        status: 'pending',
      };

      this.operationQueues[queue].push(queuedOperation);

      logger.info(`Operation queued for retry in queue "${queue}":`, {
        operationId: queuedOperation.id,
        queueLength: this.operationQueues[queue].length,
      });

      return { success: true, operationId: queuedOperation.id };
    } catch (error) {
      logger.error('Failed to queue operation:', error);
      return { success: false, error };
    }
  }

  /**
   * Process queued operations
   */
  static async processQueue(queue = 'default', processor) {
    if (!this.operationQueues || !this.operationQueues[queue]) {
      return { processed: 0, failed: 0 };
    }

    const operations = this.operationQueues[queue];
    let processedCount = 0;
    let failedCount = 0;

    for (let i = operations.length - 1; i >= 0; i--) {
      const operation = operations[i];

      if (operation.status !== 'pending') continue;

      try {
        await processor(operation.data);
        operation.status = 'completed';
        operations.splice(i, 1);
        processedCount++;

        logger.info(`Queued operation processed successfully:`, { operationId: operation.id });
      } catch (error) {
        operation.attempts++;

        if (operation.attempts >= operation.maxAttempts) {
          operation.status = 'failed';
          operations.splice(i, 1);
          failedCount++;

          logger.error(`Queued operation failed after ${operation.maxAttempts} attempts:`, {
            operationId: operation.id,
            error: error.message,
          });
        } else {
          logger.warn(`Queued operation attempt ${operation.attempts}/${operation.maxAttempts} failed:`, {
            operationId: operation.id,
            error: error.message,
          });
        }
      }
    }

    return { processed: processedCount, failed: failedCount, remaining: operations.length };
  }

  /**
   * Handle API error response
   */
  static handleApiError(error, context = {}) {
    const errorInfo = {
      message: error.message,
      code: error.code,
      status: error.response?.status,
      context,
      timestamp: new Date(),
    };

    // Determine if error is retryable
    const isRetryable =
      !error.response || // Network error
      [408, 429, 500, 502, 503, 504].includes(error.response?.status); // Specific HTTP codes

    logger.error('API Error:', errorInfo);

    return {
      isRetryable,
      shouldNotify: error.response?.status >= 400,
      errorInfo,
      userMessage: this.getErrorMessage(error.response?.status),
    };
  }

  /**
   * Get user-friendly error message
   */
  static getErrorMessage(statusCode) {
    const messages = {
      400: 'Invalid request. Please check your input.',
      401: 'Authentication failed. Please login again.',
      403: 'You do not have permission to perform this action.',
      404: 'The requested resource was not found.',
      408: 'Request timeout. Please try again.',
      429: 'Too many requests. Please try again later.',
      500: 'Server error. Please try again later.',
      502: 'Service temporarily unavailable. Please try again.',
      503: 'Service maintenance. Please try again later.',
      504: 'Request timeout. Please try again.',
    };

    return messages[statusCode] || 'An error occurred. Please try again.';
  }

  /**
   * Validate operation before retry
   */
  static canRetry(operation) {
    if (!operation) return false;
    if (operation.isManuallyFailed) return false;
    if (operation.attempts >= (operation.maxAttempts || 3)) return false;

    return true;
  }

  /**
   * Circuit breaker pattern (prevent cascading failures)
   */
  static createCircuitBreaker(options = {}) {
    const {
      failureThreshold = 5,
      successThreshold = 2,
      timeout = 60000,
      name = 'CircuitBreaker',
    } = options;

    return {
      state: 'CLOSED', // CLOSED, OPEN, HALF_OPEN
      failureCount: 0,
      successCount: 0,
      nextAttemptTime: null,
      name,

      async execute(operation) {
        const breaker = this;

        if (breaker.state === 'OPEN') {
          if (Date.now() < breaker.nextAttemptTime) {
            throw new Error(`${breaker.name} is OPEN. Circuit breaker active.`);
          }

          breaker.state = 'HALF_OPEN';
          logger.info(`${breaker.name} transitioned to HALF_OPEN`);
        }

        try {
          const result = await operation();

          if (breaker.state === 'HALF_OPEN') {
            breaker.successCount++;

            if (breaker.successCount >= successThreshold) {
              breaker.state = 'CLOSED';
              breaker.failureCount = 0;
              breaker.successCount = 0;

              logger.info(`${breaker.name} transitioned to CLOSED`);
            }
          }

          return result;
        } catch (error) {
          breaker.failureCount++;

          if (breaker.failureCount >= failureThreshold) {
            breaker.state = 'OPEN';
            breaker.nextAttemptTime = Date.now() + timeout;

            logger.error(`${breaker.name} transitioned to OPEN after ${failureThreshold} failures`);
          }

          throw error;
        }
      },

      getStatus() {
        return {
          state: this.state,
          failureCount: this.failureCount,
          successCount: this.successCount,
          nextAttemptTime: this.state === 'OPEN' ? new Date(this.nextAttemptTime) : null,
        };
      },
    };
  }

  /**
   * Panic mode - fallback to readonly mode or manual processing
   */
  static enterPanicMode(reason) {
    logger.error('PANIC MODE ACTIVATED:', reason);

    return {
      panicMode: true,
      reason,
      activatedAt: new Date(),
      recommendations: [
        'Check service dependencies (Qikink, Razorpay, Cloudinary)',
        'Review error logs',
        'Check database connectivity',
        'Monitor API rate limits',
        'Enable manual processing mode if available',
      ],
      getStatus: function() {
        return {
          panicMode: this.panicMode,
          duration: Date.now() - this.activatedAt.getTime(),
        };
      },
    };
  }
}

module.exports = ErrorRecoveryService;
