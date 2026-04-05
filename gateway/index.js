'use strict';

require('dotenv').config();
const express = require('express');
const httpProxy = require('express-http-proxy');
const logger = require('../utils/logger');
const { validateAndSanitize, securityHeaders, rateLimit, logRequest } = require('../middleware/security.middleware');

/**
 * API GATEWAY
 * ═══════════════════════════════════════════════════════════════════════════
 * Central routing layer for all microservices
 * Handles: request routing, load balancing, rate limiting, authentication
 */

const app = express();

// ─── Global Middleware ─────────────────────────────────────────────────────
app.use(express.json({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));
app.use(securityHeaders);
app.use(rateLimit(1000, 60000)); // 1000 requests per minute
app.use(validateAndSanitize);
app.use(logRequest);

// ─── Service Configuration ────────────────────────────────────────────────
const SERVICES = {
  AUTH: process.env.AUTH_SERVICE_URL || 'http://localhost:3001',
  PRODUCT: process.env.PRODUCT_SERVICE_URL || 'http://localhost:3002',
  ORDER: process.env.ORDER_SERVICE_URL || 'http://localhost:3003',
  PAYMENT: process.env.PAYMENT_SERVICE_URL || 'http://localhost:3004',
  QIKINK: process.env.QIKINK_SERVICE_URL || 'http://localhost:3005',
  SEARCH: process.env.SEARCH_SERVICE_URL || 'http://localhost:3006',
  RECOMMENDATION: process.env.RECOMMENDATION_SERVICE_URL || 'http://localhost:3007',
  SELLER: process.env.SELLER_SERVICE_URL || 'http://localhost:3008',
  ADMIN: process.env.ADMIN_SERVICE_URL || 'http://localhost:3009',
};

// ─── Service Health Check ──────────────────────────────────────────────────
const serviceHealth = new Map();

const checkServiceHealth = async () => {
  for (const [name, url] of Object.entries(SERVICES)) {
    try {
      const response = await fetch(`${url}/health`, { timeout: 5000 });
      serviceHealth.set(name, response.ok);
      if (response.ok) {
        logger.info(`✓ ${name} service is healthy`);
      } else {
        logger.warn(`✗ ${name} service returned status ${response.status}`);
      }
    } catch (error) {
      serviceHealth.set(name, false);
      logger.warn(`✗ ${name} service is unavailable:`, error.message);
    }
  }
};

// Check health every 30 seconds
setInterval(checkServiceHealth, 30000);
checkServiceHealth(); // Initial check

// ─── Health Status Endpoint ───────────────────────────────────────────────
app.get('/health', (req, res) => {
  const allHealthy = Array.from(serviceHealth.values()).every(v => v);

  res.status(allHealthy ? 200 : 503).json({
    status: allHealthy ? 'healthy' : 'degraded',
    timestamp: new Date(),
    services: Object.fromEntries(serviceHealth),
  });
});

// ─── Service Status Endpoint ──────────────────────────────────────────────
app.get('/status', (req, res) => {
  const status = {
    gateway: 'operational',
    services: Object.fromEntries(
      Array.from(serviceHealth).map(([name, healthy]) => [
        name,
        { status: healthy ? 'healthy' : 'unhealthy', url: SERVICES[name] },
      ])
    ),
    timestamp: new Date(),
  };

  res.json(status);
});

// ─── Proxy Configuration ──────────────────────────────────────────────────

/**
 * Auth Service Routes
 */
app.use(
  '/api/auth',
  httpProxy(SERVICES.AUTH, {
    proxyReqPathResolver: req => `/api/auth${req.url}`,
    userResDecorator: (proxyRes, proxyResData, req, res) => {
      res.set('X-Via-Gateway', 'true');
      return proxyResData;
    },
  })
);

/**
 * Product Service Routes
 */
app.use(
  '/api/products',
  httpProxy(SERVICES.PRODUCT, {
    proxyReqPathResolver: req => `/api/products${req.url}`,
  })
);

/**
 * Order Service Routes
 */
app.use(
  '/api/orders',
  httpProxy(SERVICES.ORDER, {
    proxyReqPathResolver: req => `/api/orders${req.url}`,
  })
);

/**
 * Payment Service Routes
 */
app.use(
  '/api/payments',
  httpProxy(SERVICES.PAYMENT, {
    proxyReqPathResolver: req => `/api/payments${req.url}`,
  })
);

/**
 * Qikink Service Routes
 */
app.use(
  '/api/qikink',
  httpProxy(SERVICES.QIKINK, {
    proxyReqPathResolver: req => `/api/qikink${req.url}`,
  })
);

/**
 * Search Service Routes
 */
app.use(
  '/api/search',
  httpProxy(SERVICES.SEARCH, {
    proxyReqPathResolver: req => `/api/search${req.url}`,
  })
);

/**
 * Recommendation Service Routes
 */
app.use(
  '/api/recommendations',
  httpProxy(SERVICES.RECOMMENDATION, {
    proxyReqPathResolver: req => `/api/recommendations${req.url}`,
  })
);

/**
 * Seller Service Routes
 */
app.use(
  '/api/seller',
  httpProxy(SERVICES.SELLER, {
    proxyReqPathResolver: req => `/api/seller${req.url}`,
  })
);

/**
 * Admin Service Routes
 */
app.use(
  '/api/admin',
  httpProxy(SERVICES.ADMIN, {
    proxyReqPathResolver: req => `/api/admin${req.url}`,
  })
);

// ─── Error Handling ───────────────────────────────────────────────────────
app.use((err, req, res, next) => {
  logger.error('Gateway Error:', err);

  res.status(err.status || 500).json({
    error: 'Gateway error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Internal server error',
    requestId: req.id,
  });
});

// ─── 404 Handler ──────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Not found',
    path: req.path,
    availableEndpoints: Object.keys(SERVICES).map(
      service => `/api/${service.toLowerCase()}`
    ),
  });
});

// ─── Start Server ─────────────────────────────────────────────────────────
const PORT = process.env.GATEWAY_PORT || 3000;

app.listen(PORT, () => {
  logger.info(`🚀 API Gateway running on port ${PORT}`);
  logger.info('📡 Connected services:');
  Object.entries(SERVICES).forEach(([name, url]) => {
    logger.info(`   ├─ ${name}: ${url}`);
  });
});

module.exports = app;
