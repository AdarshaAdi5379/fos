const rateLimit = require('express-rate-limit');
const config = require('../config/environment');

// Redis store for rate limiting (if Redis is configured)
let RedisStore;
let redisClient;

if (config.redis) {
  try {
    const Redis = require('redis');
    const { RedisStore } = require('rate-limit-redis');
    
    redisClient = Redis.createClient(config.redis);
    redisClient.connect();
    
    RedisStore = require('rate-limit-redis').RedisStore;
  } catch (error) {
    console.warn('Redis not available for rate limiting, falling back to memory store');
  }
}

const createRateLimiter = (windowMs, max, message) => {
  const limiterOptions = {
    windowMs,
    max,
    message: { error: message },
    standardHeaders: true,
    legacyHeaders: false,
    keyGenerator: (req) => {
      // Use IP address as key
      return req.ip || req.connection.remoteAddress || 'unknown';
    },
    skip: (req) => {
      // Skip rate limiting for health checks
      return req.path === '/api/health';
    }
  };

  // Use Redis store if available
  if (RedisStore && redisClient) {
    limiterOptions.store = new RedisStore({
      sendCommand: (...args) => redisClient.sendCommand(args),
    });
  }

  return rateLimit(limiterOptions);
};

const rateLimits = config.rateLimits;

const postLimiter = createRateLimiter(
  rateLimits.windowMs,
  rateLimits.posts,
  'Too many posts created, please try again later'
);

const editLimiter = createRateLimiter(
  rateLimits.windowMs,
  rateLimits.edits,
  'Too many edits, please try again later'
);

const generalLimiter = createRateLimiter(
  rateLimits.windowMs,
  rateLimits.general,
  'Too many requests, please try again later'
);

// Admin rate limiter (more restrictive for sensitive operations)
const adminLimiter = createRateLimiter(
  rateLimits.windowMs,
  Math.max(1, Math.floor(rateLimits.general / 10)), // 10% of general limit
  'Too many admin requests, please try again later'
);

module.exports = {
  postLimiter,
  editLimiter,
  generalLimiter,
  adminLimiter,
  createRateLimiter
};