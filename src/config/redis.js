const Redis = require('ioredis');
const { logger } = require('../utils/logger');

// Initialize Redis client
const redis = process.env.REDIS_URL
  ? new Redis(process.env.REDIS_URL, {
      maxRetriesPerRequest: 3,
      enableReadyCheck: true,
      retryStrategy(times) {
        const delay = Math.min(times * 50, 2000);
        return delay;
      }
    })
  : null;

if (redis) {
  redis.on('connect', () => {
    logger.info('✅ Redis connected successfully');
  });

  redis.on('error', (err) => {
    logger.error('❌ Redis connection error', { error: err.message });
  });

  redis.on('ready', () => {
    logger.info('Redis client ready');
  });
} else {
  logger.warn('⚠️  Redis not configured - REDIS_URL environment variable not set');
}

module.exports = redis;
