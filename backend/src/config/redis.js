// =============================================================
// Redis Client Configuration
// =============================================================
'use strict';

const Redis = require('ioredis');
const logger = require('./logger');

const redisClient = new Redis(process.env.REDIS_URL, {
  maxRetriesPerRequest: 3,
  retryStrategy: (times) => {
    const delay = Math.min(times * 50, 2000);
    return delay;
  },
  reconnectOnError: (err) => {
    logger.error('Redis reconnect error:', err.message);
    return true;
  },
  lazyConnect: false,
  enableReadyCheck: true,
});

redisClient.on('connect', () => logger.info('Redis connecting...'));
redisClient.on('ready', () => logger.info('✅ Redis ready'));
redisClient.on('error', (err) => logger.error('Redis error:', err.message));
redisClient.on('close', () => logger.warn('Redis connection closed'));
redisClient.on('reconnecting', () => logger.info('Redis reconnecting...'));

// Cache helper functions
const cache = {
  // Get value from cache
  async get(key) {
    try {
      const value = await redisClient.get(key);
      return value ? JSON.parse(value) : null;
    } catch (err) {
      logger.error('Cache get error:', err.message);
      return null;
    }
  },

  // Set value in cache with TTL (seconds)
  async set(key, value, ttlSeconds = 60) {
    try {
      await redisClient.setex(key, ttlSeconds, JSON.stringify(value));
      return true;
    } catch (err) {
      logger.error('Cache set error:', err.message);
      return false;
    }
  },

  // Delete key(s) from cache
  async del(...keys) {
    try {
      await redisClient.del(...keys);
      return true;
    } catch (err) {
      logger.error('Cache del error:', err.message);
      return false;
    }
  },

  // Delete keys matching pattern
  async delPattern(pattern) {
    try {
      const keys = await redisClient.keys(pattern);
      if (keys.length > 0) {
        await redisClient.del(...keys);
      }
      return true;
    } catch (err) {
      logger.error('Cache delPattern error:', err.message);
      return false;
    }
  },

  // Get or set (cache-aside pattern)
  async getOrSet(key, fetchFn, ttlSeconds = 60) {
    const cached = await cache.get(key);
    if (cached !== null) return cached;
    
    const fresh = await fetchFn();
    await cache.set(key, fresh, ttlSeconds);
    return fresh;
  },
};

// Cache TTL constants (in seconds)
const CACHE_TTL = {
  CURRENCIES: 30,        // 30 seconds - fresh prices
  GOLD: 30,
  SILVER: 30,
  HISTORY_1H: 60,        // 1 minute
  HISTORY_1D: 300,       // 5 minutes
  HISTORY_1W: 900,       // 15 minutes
  HISTORY_1M: 1800,      // 30 minutes
  SETTINGS: 300,         // 5 minutes
  ADS: 3600,             // 1 hour
};

module.exports = { ...redisClient, cache, CACHE_TTL, ping: () => redisClient.ping(), quit: () => redisClient.quit() };
