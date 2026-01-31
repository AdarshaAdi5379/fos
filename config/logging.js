const winston = require('winston');
const DailyRotateFile = require('winston-daily-rotate-file');
const config = require('./environment');

// Create logs directory if it doesn't exist
const fs = require('fs');
const path = require('path');

const logsDir = path.join(__dirname, '../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// Custom log format
const logFormat = winston.format.combine(
  winston.format.timestamp({
    format: 'YYYY-MM-DD HH:mm:ss'
  }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
  winston.format.printf(({ timestamp, level, message, stack, ...meta }) => {
    let log = `${timestamp} [${level.toUpperCase()}]: ${message}`;
    
    // Add meta data if present
    if (Object.keys(meta).length > 0) {
      log += ` ${JSON.stringify(meta)}`;
    }
    
    // Add stack trace for errors
    if (stack) {
      log += `\n${stack}`;
    }
    
    return log;
  })
);

// Create logger
const logger = winston.createLogger({
  level: config.logging.level,
  format: logFormat,
  defaultMeta: { service: 'unbound-api' },
  transports: [
    // Error log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'error-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      level: 'error',
      maxSize: '20m',
      maxFiles: '14d'
    }),
    
    // Combined log file
    new DailyRotateFile({
      filename: path.join(logsDir, 'combined-%DATE%.log'),
      datePattern: 'YYYY-MM-DD',
      maxSize: '20m',
      maxFiles: '14d'
    })
  ]
});

// Add console transport for development
if (config.isDevelopment) {
  logger.add(new winston.transports.Console({
    format: winston.format.combine(
      winston.format.colorize(),
      winston.format.simple(),
      winston.format.printf(({ timestamp, level, message, ...meta }) => {
        let log = `${timestamp} [${level}]: ${message}`;
        if (Object.keys(meta).length > 0) {
          log += ` ${JSON.stringify(meta)}`;
        }
        return log;
      })
    )
  }));
}

// Metrics collection
const metrics = {
  requests: 0,
  errors: 0,
  posts: 0,
  edits: 0,
  websockets: 0,
  startTime: Date.now()
};

// Middleware for request logging
const requestLogger = (req, res, next) => {
  const start = Date.now();
  const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  
  // Add request ID to response headers
  res.setHeader('X-Request-ID', requestId);
  
  // Log request
  logger.info('Request started', {
    requestId,
    method: req.method,
    url: req.url,
    ip: req.ip,
    userAgent: req.get('User-Agent')
  });
  
  // Increment request counter
  metrics.requests++;
  
  // Log response
  res.on('finish', () => {
    const duration = Date.now() - start;
    
    logger.info('Request completed', {
      requestId,
      statusCode: res.statusCode,
      duration,
      method: req.method,
      url: req.url
    });
    
    // Log slow requests
    if (duration > 1000) {
      logger.warn('Slow request detected', {
        requestId,
        duration,
        method: req.method,
        url: req.url,
        statusCode: res.statusCode
      });
    }
  });
  
  // Log errors
  res.on('error', (error) => {
    logger.error('Response error', {
      requestId,
      error: error.message,
      stack: error.stack
    });
    metrics.errors++;
  });
  
  next();
};

// Metrics endpoint
const getMetrics = () => {
  const uptime = Date.now() - metrics.startTime;
  
  return {
    uptime,
    uptimeHuman: `${Math.floor(uptime / 1000)}s`,
    requests: metrics.requests,
    errors: metrics.errors,
    posts: metrics.posts,
    edits: metrics.edits,
    websockets: metrics.websockets,
    errorRate: metrics.requests > 0 ? (metrics.errors / metrics.requests * 100).toFixed(2) + '%' : '0%',
    requestsPerSecond: (metrics.requests / (uptime / 1000)).toFixed(2)
  };
};

// Performance monitoring
const performanceLogger = {
  logSlowQuery(query, duration) {
    if (duration > 100) { // Log queries taking more than 100ms
      logger.warn('Slow database query', {
        query: query.substring(0, 200), // Truncate long queries
        duration
      });
    }
  },
  
  logMemoryUsage() {
    const usage = process.memoryUsage();
    logger.info('Memory usage', {
      rss: `${Math.round(usage.rss / 1024 / 1024)}MB`,
      heapTotal: `${Math.round(usage.heapTotal / 1024 / 1024)}MB`,
      heapUsed: `${Math.round(usage.heapUsed / 1024 / 1024)}MB`,
      external: `${Math.round(usage.external / 1024 / 1024)}MB`
    });
  },
  
  logCpuUsage() {
    const usage = process.cpuUsage();
    logger.info('CPU usage', {
      user: usage.user,
      system: usage.system
    });
  }
};

// Start periodic metrics logging
if (config.logging.enableMetrics) {
  setInterval(() => {
    logger.info('Application metrics', getMetrics());
    performanceLogger.logMemoryUsage();
  }, 60000); // Every minute
}

// Error tracking
const errorLogger = {
  logError(error, context = {}) {
    logger.error('Application error', {
      message: error.message,
      stack: error.stack,
      context
    });
    metrics.errors++;
  },
  
  logUnhandledError(error) {
    logger.error('Unhandled error', {
      message: error.message,
      stack: error.stack
    });
    metrics.errors++;
  }
};

// Track unhandled errors
process.on('uncaughtException', (error) => {
  errorLogger.logUnhandledError(error);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  errorLogger.logUnhandledError(new Error(`Unhandled Rejection at: ${promise}, reason: ${reason}`));
});

module.exports = {
  logger,
  requestLogger,
  getMetrics,
  performanceLogger,
  errorLogger,
  metrics
};