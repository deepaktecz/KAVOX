'use strict';

require('dotenv').config({ path: '../.env' });

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const helmet = require('helmet');
const cors = require('cors');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
const morgan = require('morgan');

// ─── Shared config (MongoDB + Redis) ─────────────────────────
const mongoose = require('mongoose');
const { logger } = require('../services/auth/utils/logger');

// ─── Service routes ───────────────────────────────────────────
const authRoutes = require('../services/auth/routes/authRoutes');
const productRoutes = require('../services/product/routes/productRoutes');
const orderRoutes = require('../services/order/routes/orderRoutes');
const paymentRoutes = require('../services/payment/routes/paymentRoutes');
const qikinkRoutes = require('../services/qikink/routes/qikinkRoutes');
const designRoutes = require('../services/design/routes/designRoutes');
const adminRoutes = require('../routes/admin/adminRoutes');

// ─── App ──────────────────────────────────────────────────────
const app = express();
const server = http.createServer(app);

// ─── Socket.io setup ──────────────────────────────────────────
const io = new Server(server, {
  cors: {
    origin: process.env.ALLOWED_ORIGINS?.split(',') || ['http://localhost:3000'],
    credentials: true,
  },
  pingTimeout: 60000,
  transports: ['websocket', 'polling'],
});

// Attach io to app so controllers can emit events
app.set('io', io);

// ─── Socket handlers ──────────────────────────────────────────
io.use((socket, next) => {
  const token = socket.handshake.auth?.token || socket.handshake.headers?.authorization?.replace('Bearer ', '');
  if (token) {
    try {
      const { verifyAccessToken } = require('../services/auth/utils/jwtUtils');
      const decoded = verifyAccessToken(token);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
    } catch (_) {}
  }
  next();
});

io.on('connection', (socket) => {
  logger.info(`Socket connected: ${socket.id} (user: ${socket.userId || 'anonymous'})`);

  // Join user-specific room
  if (socket.userId) {
    socket.join(`user:${socket.userId}`);
    if (socket.userRole === 'admin' || socket.userRole === 'super_admin') {
      socket.join('admin');
    }
    if (socket.userRole === 'seller') {
      socket.join(`seller:${socket.userId}`);
    }
  }

  // Track specific order
  socket.on('track_order', ({ orderId }) => {
    if (orderId) socket.join(`order:${orderId}`);
  });

  socket.on('disconnect', () => {
    logger.info(`Socket disconnected: ${socket.id}`);
  });
});

// ─── Security ─────────────────────────────────────────────────
app.use(helmet({
  contentSecurityPolicy: false,
  crossOriginEmbedderPolicy: false,
}));

const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, cb) => {
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(new Error(`CORS: ${origin} not allowed`));
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Service-Secret'],
}));

app.use(compression());

// ── Raw body capture for Qikink webhook signature verification ──
// Must be before express.json() so the raw buffer is preserved.
app.use('/api/v1/qikink/webhook', express.raw({ type: 'application/json' }), (req, _res, next) => {
  if (Buffer.isBuffer(req.body)) {
    req.rawBody = req.body.toString('utf8');
    try { req.body = JSON.parse(req.rawBody); } catch (_) { req.body = {}; }
  }
  next();
});

app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

if (process.env.NODE_ENV !== 'test') {
  app.use(morgan('dev'));
}

// Global rate limiter
app.use(rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 200,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests. Try again later.' },
}));

// ─── Health Check ─────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    success: true,
    service: 'KAVOX API Gateway',
    status: 'healthy',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    env: process.env.NODE_ENV,
    db: mongoose.connection.readyState === 1 ? 'connected' : 'disconnected',
  });
});

// ─── Mount service routes ─────────────────────────────────────
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/products', productRoutes);
app.use('/api/v1/orders', orderRoutes);
app.use('/api/v1/payments', paymentRoutes);
app.use('/api/v1/qikink', qikinkRoutes);
app.use('/api/v1/designs', designRoutes);
app.use('/api/v1/admin', adminRoutes);

// ─── Socket: extended real-time tracking events ───────────────
io.on('connection', (socket) => {
  // (base connection/room-join logic is above in io.on)
  // Additional: join design room for live preview status
  socket.on('track_design', ({ designId }) => {
    if (designId) socket.join(`design:${designId}`);
  });
  // Admin joins global admin room (already handled above)
});

// ─── 404 ─────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    success: false,
    message: `Route ${req.method} ${req.originalUrl} not found`,
    availableEndpoints: {
      auth: '/api/v1/auth',
      products: '/api/v1/products',
      orders: '/api/v1/orders',
      payments: '/api/v1/payments',
      qikink: '/api/v1/qikink',
      designs: '/api/v1/designs',
      admin: '/api/v1/admin',
    },
  });
});

// ─── Global error handler ────────────────────────────────────
app.use((err, req, res, next) => { // eslint-disable-line no-unused-vars
  const { errorHandler } = require('../services/auth/middleware/errorMiddleware');
  errorHandler(err, req, res, next);
});

// ─── Start ───────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

async function start() {
  try {
    // Connect DB
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/kavox', {
      maxPoolSize: 10, serverSelectionTimeoutMS: 5000,
    });
    logger.info('✅ MongoDB connected');

    // Try Redis
    try {
      const { connectRedis } = require('../services/auth/config/redis');
      await connectRedis();
    } catch (_) {
      logger.warn('Redis unavailable - caching disabled');
    }

    server.listen(PORT, () => {
      logger.info(`🚀 KAVOX API Gateway on :${PORT} [${process.env.NODE_ENV || 'development'}]`);
      logger.info(`📡 API:    http://localhost:${PORT}/api/v1`);
      logger.info(`❤️  Health: http://localhost:${PORT}/health`);
    });

    // ── Qikink auto-poll cron (every 30 min in production) ──────
    if (process.env.NODE_ENV !== 'test') {
      const POLL_INTERVAL_MS = parseInt(process.env.QIKINK_POLL_INTERVAL_MS || '1800000'); // 30 min
      const qikinkService    = require('../services/qikink/qikink.service');

      const runPoll = async () => {
        try {
          logger.info('Qikink auto-poll: starting batch status refresh…');
          const stats = await qikinkService.pollAllOrders(io);
          logger.info(`Qikink auto-poll done — updated:${stats.updated} failed:${stats.failed} total:${stats.total}`);
        } catch (err) {
          logger.error(`Qikink auto-poll error: ${err.message}`);
        }
      };

      // Wait 60 s after startup before first poll
      setTimeout(() => {
        runPoll();
        setInterval(runPoll, POLL_INTERVAL_MS);
      }, 60_000);

      logger.info(`🔄 Qikink auto-poll scheduled every ${POLL_INTERVAL_MS / 60000} min`);
    }

    const shutdown = (sig) => {
      logger.info(`${sig} → shutting down...`);
      server.close(() => process.exit(0));
      setTimeout(() => process.exit(1), 10000);
    };
    process.on('SIGTERM', () => shutdown('SIGTERM'));
    process.on('SIGINT', () => shutdown('SIGINT'));
  } catch (e) {
    logger.error('Gateway startup failed:', e);
    process.exit(1);
  }
}

if (require.main === module) start();

module.exports = { app, server, io };
