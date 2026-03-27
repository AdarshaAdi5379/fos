/**
 * Enhanced Security Configuration
 * 
 * Additional security improvements and validation
 */

const crypto = require('crypto');
const rateLimit = require('express-rate-limit');

class SecurityConfig {
  /**
   * Validate environment variables
   */
  static validateEnvironment() {
    const required = ['PORT', 'NODE_ENV'];
    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }

    // In production, JWT secrets MUST be explicitly set and strong
    if (process.env.NODE_ENV === 'production') {
      const accessSecret = process.env.JWT_ACCESS_SECRET;
      const refreshSecret = process.env.JWT_REFRESH_SECRET;
      
      if (!accessSecret || accessSecret.length < 64) {
        throw new Error('JWT_ACCESS_SECRET must be at least 64 characters in production');
      }
      
      if (!refreshSecret || refreshSecret.length < 64) {
        throw new Error('JWT_REFRESH_SECRET must be at least 64 characters in production');
      }
    } else {
      // In development, warn if secrets are missing but don't crash
      if (!process.env.JWT_ACCESS_SECRET) {
        console.warn('⚠️  JWT_ACCESS_SECRET not set. A random secret will be generated (not persisted across restarts).');
      }
      if (!process.env.JWT_REFRESH_SECRET) {
        console.warn('⚠️  JWT_REFRESH_SECRET not set. A random secret will be generated (not persisted across restarts).');
      }
    }

    // Validate port
    const port = parseInt(process.env.PORT);
    if (isNaN(port) || port < 1 || port > 65535) {
      throw new Error('PORT must be a valid port number (1-65535)');
    }

    return true;
  }

  /**
   * Get strict auth rate limiter
   */
  static getAuthRateLimiter() {
    return rateLimit({
      windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_ATTEMPTS) || 5, // 5 attempts
      message: {
        error: 'Too many authentication attempts',
        code: 'AUTH_RATE_LIMIT_EXCEEDED',
        retryAfter: '15 minutes'
      },
      standardHeaders: true,
      legacyHeaders: false,
      skipSuccessfulRequests: true
    });
  }

  /**
   * Get allowed origins
   */
  static getAllowedOrigins() {
    const origins = process.env.ALLOWED_ORIGINS || 'http://localhost:5174';
    return origins.split(',').map(origin => origin.trim());
  }

  /**
   * Validate nested objects
   */
  static validateNestedObject(obj, maxDepth = 5) {
    const depth = (obj) => {
      if (typeof obj !== 'object' || obj === null) return 0;
      return 1 + Math.max(0, ...Object.values(obj).map(depth));
    };
    
    if (depth(obj) > maxDepth) {
      throw new Error(`Object depth exceeds maximum allowed depth of ${maxDepth}`);
    }
    
    return true;
  }

  /**
   * Sanitize error messages
   */
  static sanitizeError(err, isDevelopment = false) {
    const baseError = {
      error: 'Internal server error',
      code: 'INTERNAL_ERROR',
      timestamp: new Date().toISOString(),
      requestId: err.requestId || 'unknown'
    };

    // Only show detailed errors in development
    if (isDevelopment) {
      baseError.details = err.message;
      baseError.stack = err.stack;
      baseError.debug = {
        name: err.name,
        code: err.code,
        errno: err.errno,
        sqlState: err.sqlState
      };
    } else {
      // In production, provide generic error messages for security
      if (err.name === 'ValidationError') {
        baseError.error = 'Invalid input provided';
        baseError.code = 'VALIDATION_ERROR';
      } else if (err.name === 'UnauthorizedError') {
        baseError.error = 'Authentication required';
        baseError.code = 'AUTH_REQUIRED';
      } else if (err.message && err.message.includes('timeout')) {
        baseError.error = 'Request timeout';
        baseError.code = 'TIMEOUT_ERROR';
      }
    }

    return baseError;
  }

  /**
   * Generate secure random string
   */
  static generateSecureRandom(length = 64) {
    return crypto.randomBytes(length).toString('hex');
  }

  /**
   * Validate file type (for future file uploads)
   */
  static isValidFileType(mimetype) {
    const allowedTypes = [
      'image/jpeg',
      'image/png', 
      'image/gif',
      'text/plain',
      'application/json'
    ];
    return allowedTypes.includes(mimetype);
  }

  /**
   * Check for dependency vulnerabilities
   */
  static checkDependencies() {
    const vulnerablePatterns = [
      'request@',
      'tar@<6',
      'qs@<6',
      'semver@<5.7'
    ];

    const fs = require('fs');
    try {
      const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
      const warnings = [];

      Object.entries(packageJson.dependencies || {}).forEach(([name, version]) => {
        vulnerablePatterns.forEach(pattern => {
          if (name.includes(pattern.split('@')[0])) {
            warnings.push({ package: name, version, pattern });
          }
        });
      });

      return warnings;
    } catch (error) {
      console.warn('Could not check dependencies:', error.message);
      return [];
    }
  }

  /**
   * Enhanced helmet configuration
   */
  static getHelmetConfig() {
    const isDevelopment = process.env.NODE_ENV === 'development';
    
    return {
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: isDevelopment ? 
            ["'self'"] : 
            ["'self'"], // Remove unsafe-inline in production
          styleSrc: isDevelopment ? 
            ["'self'", "'unsafe-inline'"] : 
            ["'self'"], // Remove unsafe-inline in production, use nonce or hashes
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'", "wss:", "ws:"],
          fontSrc: ["'self'"],
          objectSrc: ["'none'"],
          mediaSrc: ["'self'"],
          frameSrc: ["'none'"],
          childSrc: ["'none'"],
          workerSrc: ["'self'"],
          manifestSrc: ["'self'"],
          upgradeInsecureRequests: process.env.NODE_ENV === 'production' ? [] : null
        },
      },
      hsts: process.env.NODE_ENV === 'production' ? {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      } : false,
      crossOriginEmbedderPolicy: false, // For sqlite3 compatibility
      crossOriginOpenerPolicy: {
        policy: "same-origin"
      },
      crossOriginResourcePolicy: { policy: "cross-origin" },
      // Additional security headers
      referrerPolicy: { policy: "strict-origin-when-cross-origin" },
      permittedCrossDomainPolicies: false,
      ieNoOpen: true,
      originAgentCluster: true
    };
  }

  /**
   * Database connection security config
   */
  static getDatabaseConfig() {
    return {
      connectionTimeoutMillis: parseInt(process.env.DB_CONNECTION_TIMEOUT) || 10000,
      idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT) || 30000,
      maxLifetimeMillis: parseInt(process.env.DB_MAX_LIFETIME) || 3600000,
      max: 20,
      min: 2
    };
  }
}

module.exports = SecurityConfig;