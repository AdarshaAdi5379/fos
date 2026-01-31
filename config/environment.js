// Environment configuration validation
const dotenv = require('dotenv');

// Load environment variables
dotenv.config();

class Config {
  constructor() {
    this.validateEnvironment();
  }

  validateEnvironment() {
    const required = [
      'PORT',
      'NODE_ENV',
      'DATABASE_URL'
    ];

    const missing = required.filter(key => !process.env[key]);
    
    if (missing.length > 0) {
      throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
    }
  }

  get port() {
    return parseInt(process.env.PORT) || 3000;
  }

  get nodeEnv() {
    return process.env.NODE_ENV || 'development';
  }

  get isDevelopment() {
    return this.nodeEnv === 'development';
  }

  get isProduction() {
    return this.nodeEnv === 'production';
  }

  get isTest() {
    return this.nodeEnv === 'test';
  }

  get database() {
    const url = process.env.DATABASE_URL;
    
    if (url.startsWith('sqlite:')) {
      return {
        type: 'sqlite',
        path: url.replace('sqlite:', '')
      };
    }
    
    if (url.startsWith('postgresql:')) {
      return {
        type: 'postgresql',
        url: url,
        host: process.env.DB_HOST || 'localhost',
        port: parseInt(process.env.DB_PORT) || 5432,
        database: process.env.DB_NAME,
        username: process.env.DB_USER,
        password: process.env.DB_PASSWORD
      };
    }
    
    throw new Error('Unsupported database type');
  }

  get cors() {
    return {
      origin: process.env.CORS_ORIGIN || 'http://localhost:5174',
      credentials: true
    };
  }

  get jwt() {
    return {
      secret: process.env.JWT_SECRET || 'fallback_secret_change_in_production',
      expiresIn: '24h'
    };
  }

  get rateLimits() {
    return {
      posts: parseInt(process.env.RATE_LIMIT_POSTS) || 10,
      edits: parseInt(process.env.RATE_LIMIT_EDITS) || 20,
      general: parseInt(process.env.RATE_LIMIT_GENERAL) || 100,
      windowMs: 15 * 60 * 1000 // 15 minutes
    };
  }

  get webSocket() {
    return {
      path: process.env.WS_PATH || '/socket.io'
    };
  }

  get logging() {
    return {
      level: process.env.LOG_LEVEL || 'info',
      enableMetrics: process.env.ENABLE_METRICS === 'true'
    };
  }

  get redis() {
    if (process.env.REDIS_URL) {
      return {
        url: process.env.REDIS_URL
      };
    }
    
    if (process.env.REDIS_HOST) {
      return {
        host: process.env.REDIS_HOST,
        port: parseInt(process.env.REDIS_PORT) || 6379,
        password: process.env.REDIS_PASSWORD
      };
    }
    
    return null; // Redis not configured
  }

  get contentModeration() {
    return {
      maxLength: parseInt(process.env.MAX_CONTENT_LENGTH) || 10000,
      enabled: process.env.ENABLE_CONTENT_MODERATION !== 'false'
    };
  }

  get ssl() {
    return {
      enabled: !!(process.env.SSL_CERT_PATH && process.env.SSL_KEY_PATH),
      certPath: process.env.SSL_CERT_PATH,
      keyPath: process.env.SSL_KEY_PATH
    };
  }

  get backup() {
    return {
      interval: parseInt(process.env.BACKUP_INTERVAL) || 3600000, // 1 hour
      path: process.env.BACKUP_PATH || './backups'
    };
  }
}

module.exports = new Config();