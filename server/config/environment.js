// Environment configuration validation
const dotenv = require('dotenv');
const SecurityConfig = require('./security');

// Load environment variables
dotenv.config();

class Config {
  constructor() {
    this.validateEnvironment();
  }

  validateEnvironment() {
    // Use enhanced security validation
    SecurityConfig.validateEnvironment();
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
    
    if (!url) {
      // Default to SQLite in current directory
      return {
        type: 'sqlite',
        path: require('path').join(__dirname, '..', 'unbound.db')
      };
    }
    
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
    const origins = process.env.ALLOWED_ORIGINS || 'http://localhost:5174';
    return {
      origin: origins.split(',').map(o => o.trim()),
      credentials: true
    };
  }

  get jwt() {
    return {
      accessSecret: process.env.JWT_ACCESS_SECRET,
      refreshSecret: process.env.JWT_REFRESH_SECRET,
      sessionSecret: process.env.SESSION_SECRET || 'fallback_secret_change_in_production'
    };
  }

  get contentModeration() {
    return {
      enabled: process.env.ENABLE_CONTENT_MODERATION === 'true',
      maxContentLength: parseInt(process.env.MAX_CONTENT_LENGTH) || 10000
    };
  }

  get rateLimiting() {
    return {
      windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000, // 15 minutes
      posts: parseInt(process.env.RATE_LIMIT_POSTS) || 10,
      edits: parseInt(process.env.RATE_LIMIT_EDITS) || 20,
      general: parseInt(process.env.RATE_LIMIT_GENERAL) || 100
    };
  }
}

module.exports = new Config();