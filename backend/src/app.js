// =============================================================
// 🪙 الليرة الآن - Main Application Entry Point
// =============================================================
'use strict';

require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');

const logger = require('./config/logger');
const db = require('./config/database');
const redisClient = require('./config/redis');
const { initAdminUser } = require('./services/authService');
const { startPriceFetcher } = require('./jobs/priceFetcher');

// ---- Routes ----
const authRoutes = require('./routes/auth');
const currenciesRoutes = require('./routes/currencies');
const goldRoutes = require('./routes/gold');
const silverRoutes = require('./routes/silver');
const historyRoutes = require('./routes/history');
const activityRoutes = require('./routes/activityLog');
const adsRoutes = require('./routes/ads');
const settingsRoutes = require('./routes/settings');
const publicRoutes = require('./routes/public');

const app = express();
const PORT = process.env.PORT || 3001;

// =============================================================
// Security & Middleware
// =============================================================
app.use(helmet({
  contentSecurityPolicy: false, // We'll configure this in Nginx
  crossOriginEmbedderPolicy: false,
}));

// CORS
const allowedOrigins = (process.env.ALLOWED_ORIGINS || 'http://localhost:3000').split(',');
app.use(cors({
  origin: (origin, callback) => {
    if (!origin || allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// HTTP Logging
app.use(morgan('combined', {
  stream: { write: (message) => logger.http(message.trim()) },
  skip: (req) => req.url === '/health',
}));

// Rate Limiting
const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 min
  max: parseInt(process.env.RATE_LIMIT_MAX) || 100,
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests, please try again later.' },
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 min
  max: 10,                    // Max 10 login attempts
  message: { error: 'Too many login attempts, please try again after 15 minutes.' },
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);

// Trust proxy (for rate limiting behind Nginx)
app.set('trust proxy', 1);

// =============================================================
// Routes
// =============================================================

// Health Check (public, no auth)
app.get('/health', async (req, res) => {
  try {
    await db.query('SELECT 1');
    await redisClient.ping();
    res.json({
      status: 'healthy',
      timestamp: new Date().toISOString(),
      services: { database: 'ok', redis: 'ok' },
      version: '1.0.0',
    });
  } catch (err) {
    res.status(503).json({ status: 'unhealthy', error: err.message });
  }
});

// Public API (no auth required) — for mobile app & web app
app.use('/api/v1', publicRoutes);

// Protected Admin API (JWT required)
app.use('/api/admin/auth', authRoutes);
app.use('/api/admin/currencies', currenciesRoutes);
app.use('/api/admin/gold', goldRoutes);
app.use('/api/admin/silver', silverRoutes);
app.use('/api/admin/history', historyRoutes);
app.use('/api/admin/activity-log', activityRoutes);
app.use('/api/admin/ads', adsRoutes);
app.use('/api/admin/settings', settingsRoutes);

// 404 Handler
app.use((req, res) => {
  res.status(404).json({ error: 'Route not found', path: req.path });
});

// Global Error Handler
app.use((err, req, res, next) => {
  logger.error(`${err.status || 500} - ${err.message} - ${req.originalUrl} - ${req.method} - ${req.ip}`);
  res.status(err.status || 500).json({
    error: process.env.NODE_ENV === 'production' ? 'Internal Server Error' : err.message,
  });
});

// =============================================================
// Server Startup
// =============================================================
async function startServer() {
  try {
    // Test Database Connection
    await db.query('SELECT NOW()');
    logger.info('✅ PostgreSQL connected successfully');

    // Test Redis Connection
    await redisClient.ping();
    logger.info('✅ Redis connected successfully');

    // Initialize admin user (first boot)
    await initAdminUser();
    logger.info('✅ Admin user initialized');

    // Start Price Fetcher Cron Job
    startPriceFetcher();
    logger.info('✅ Price fetcher cron job started');

    // Start HTTP Server
    app.listen(PORT, '0.0.0.0', () => {
      logger.info(`🚀 الليرة الآن API running on port ${PORT} [${process.env.NODE_ENV}]`);
    });

  } catch (err) {
    logger.error('❌ Failed to start server:', err);
    process.exit(1);
  }
}

// Graceful Shutdown
process.on('SIGTERM', async () => {
  logger.info('SIGTERM received, shutting down gracefully...');
  await db.end();
  await redisClient.quit();
  process.exit(0);
});

process.on('SIGINT', async () => {
  logger.info('SIGINT received, shutting down...');
  await db.end();
  await redisClient.quit();
  process.exit(0);
});

startServer();

module.exports = app;
