'use strict';

const express = require('express');
const logger = require('../../utils/logger');

/**
 * MICROSERVICE BASE CLASS
 * ═══════════════════════════════════════════════════════════════════════════
 * Base structure for all microservices
 * Provides: express setup, middleware, error handling, health checks
 */

class MicroService {
  constructor(config) {
    this.config = {
      name: config.name || 'microservice',
      port: config.port || 3001,
      version: config.version || '1.0.0',
      ...config,
    };

    this.app = express();
    this.router = express.Router();
    this.setupMiddleware();
  }

  /**
   * Setup common middleware
   */
  setupMiddleware() {
    // Parsing
    this.app.use(express.json({ limit: '50mb' }));
    this.app.use(express.urlencoded({ limit: '50mb', extended: true }));

    // Request ID
    this.app.use((req, res, next) => {
      req.id = `${this.config.name}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      res.set('X-Request-ID', req.id);
      next();
    });

    // Logging
    this.app.use((req, res, next) => {
      const start = Date.now();
      res.on('finish', () => {
        const duration = Date.now() - start;
        logger.info(`${req.method} ${req.path} - ${res.statusCode} (${duration}ms)`, {
          requestId: req.id,
          service: this.config.name,
        });
      });
      next();
    });

    // Error handling middleware
    this.app.use(this.errorHandler.bind(this));
  }

  /**
   * Add routes to the service
   */
  addRoutes(routes) {
    routes.forEach(({ path, router: routerFn }) => {
      const routeRouter = routerFn();
      this.app.use(path, routeRouter);
      logger.info(`Registered route: ${path}`);
    });
  }

  /**
   * Health check endpoint
   */
  addHealthCheck(dbConnection = null) {
    this.app.get('/health', async (req, res) => {
      const health = {
        status: 'operational',
        service: this.config.name,
        version: this.config.version,
        timestamp: new Date(),
        uptime: process.uptime(),
      };

      if (dbConnection) {
        try {
          health.database = await this.checkDatabaseHealth(dbConnection);
        } catch (error) {
          health.database = 'unhealthy';
          health.status = 'degraded';
        }
      }

      const statusCode = health.status === 'operational' ? 200 : 503;
      res.status(statusCode).json(health);
    });
  }

  /**
   * Check database connection
   */
  async checkDatabaseHealth(connection) {
    try {
      if (connection.connection && connection.connection.db) {
        await connection.connection.db.admin().ping();
        return 'healthy';
      }
      return 'unknown';
    } catch (error) {
      return 'unhealthy';
    }
  }

  /**
   * Global error handler
   */
  errorHandler(err, req, res, next) {
    const statusCode = err.statusCode || err.status || 500;
    const errorResponse = {
      error: err.name || 'Error',
      message: err.message,
      requestId: req.id,
      service: this.config.name,
      timestamp: new Date(),
    };

    if (process.env.NODE_ENV === 'development') {
      errorResponse.stack = err.stack;
    }

    logger.error(`[${this.config.name}] ${err.message}`, {
      requestId: req.id,
      statusCode,
      stack: err.stack,
    });

    res.status(statusCode).json(errorResponse);
  }

  /**
   * 404 handler
   */
  add404Handler() {
    this.app.use((req, res) => {
      res.status(404).json({
        error: 'Not Found',
        path: req.path,
        service: this.config.name,
        requestId: req.id,
      });
    });
  }

  /**
   * Start the microservice
   */
  start() {
    this.add404Handler();

    const server = this.app.listen(this.config.port, () => {
      logger.info(`🚀 ${this.config.name} running on port ${this.config.port}`);
      logger.info(`📌 Service version: ${this.config.version}`);
      logger.info(`🔗 Health check: http://localhost:${this.config.port}/health`);
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      logger.info(`Shutting down ${this.config.name} gracefully...`);
      server.close(() => {
        logger.info(`${this.config.name} stopped`);
        process.exit(0);
      });
    });

    return server;
  }

  /**
   * Get express app instance
   */
  getApp() {
    return this.app;
  }
}

module.exports = MicroService;
