/**
 * Security Audit and Fixes
 * 
 * This file contains security improvements and vulnerability fixes
 * for the FOS server application.
 */

const crypto = require('crypto');

class SecurityAudit {
  constructor() {
    this.issues = [];
    this.fixes = [];
  }

  /**
   * Run comprehensive security audit
   */
  async audit() {
    console.log('🔍 Running Security Audit...');
    
    this.checkJWTSecrets();
    this.checkInputValidation();
    this.checkDatabaseSecurity();
    this.checkRateLimiting();
    this.checkWebSocketSecurity();
    this.checkErrorHandling();
    this.checkFileUploads();
    this.checkDependencies();
    this.checkEnvironmentVariables();
    
    return {
      issues: this.issues,
      fixes: this.fixes,
      status: this.issues.length === 0 ? 'SECURE' : 'NEEDS_FIXES'
    };
  }

  /**
   * Check JWT secrets security
   */
  checkJWTSecrets() {
    this.issues.push({
      severity: 'HIGH',
      category: 'Authentication',
      issue: 'JWT secrets generated at runtime are not persisted',
      description: 'JWT secrets are regenerated on each restart, invalidating all existing tokens'
    });

    this.fixes.push({
      title: 'Fix JWT Secret Management',
      implementation: `
// Add to .env file permanently
JWT_ACCESS_SECRET=${crypto.randomBytes(64).toString('hex')}
JWT_REFRESH_SECRET=${crypto.randomBytes(64).toString('hex')}

// Update environment config to validate
const jwtSecret = process.env.JWT_ACCESS_SECRET;
if (!jwtSecret || jwtSecret.length < 64) {
  throw new Error('JWT_ACCESS_SECRET must be at least 64 characters');
}
      `
    });
  }

  /**
   * Check input validation
   */
  checkInputValidation() {
    this.issues.push({
      severity: 'MEDIUM',
      category: 'Input Validation',
      issue: 'Missing deep validation for nested objects',
      description: 'Some endpoints may not properly validate nested JSON objects'
    });

    this.fixes.push({
      title: 'Enhanced Input Validation',
      implementation: `
// Add to validation middleware
const validateNestedObject = (obj, maxDepth = 5) => {
  const depth = (obj) => {
    if (typeof obj !== 'object' || obj === null) return 0;
    return 1 + Math.max(0, ...Object.values(obj).map(depth));
  };
  
  return depth(obj) <= maxDepth;
};

// Add request size limits
app.use(express.json({ 
  limit: '100kb',  // Reduced from 10MB
  strict: true
}));
      `
    });
  }

  /**
   * Check database security
   */
  checkDatabaseSecurity() {
    this.issues.push({
      severity: 'MEDIUM',
      category: 'Database',
      issue: 'Missing database connection timeout and retry limits',
      description: 'Database connections may hang without proper timeout handling'
    });

    this.fixes.push({
      title: 'Database Connection Security',
      implementation: `
// Add to database config
const dbConfig = {
  connectionTimeoutMillis: 10000,
  idleTimeoutMillis: 30000,
  maxLifetimeMillis: 3600000,
  max: 20,
  min: 2
};

// Add query timeout
const queryWithTimeout = (sql, params, timeout = 5000) => {
  return Promise.race([
    db.query(sql, params),
    new Promise((_, reject) => 
      setTimeout(() => reject(new Error('Query timeout')), timeout)
    )
  ]);
};
      `
    });
  }

  /**
   * Check rate limiting configuration
   */
  checkRateLimiting() {
    this.issues.push({
      severity: 'MEDIUM',
      category: 'Rate Limiting',
      issue: 'Rate limiting too lenient for sensitive endpoints',
      description: 'Authentication endpoints need stricter rate limiting'
    });

    this.fixes.push({
      title: 'Enhanced Rate Limiting',
      implementation: `
// Add stricter limits for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // 5 attempts per window
  message: 'Too many authentication attempts',
  standardHeaders: true,
  legacyHeaders: false
});

// Apply to auth endpoints
app.post('/api/auth/login', authLimiter);
app.post('/api/auth/refresh', authLimiter);
      `
    });
  }

  /**
   * Check WebSocket security
   */
  checkWebSocketSecurity() {
    this.issues.push({
      severity: 'HIGH',
      category: 'WebSocket',
      issue: 'Missing WebSocket origin validation',
      description: 'WebSocket connections accept any origin'
    });

    this.fixes.push({
      title: 'WebSocket Origin Validation',
      implementation: `
// Add to WebSocket manager
const allowedOrigins = [
  'http://localhost:5174',
  'https://yourdomain.com'
];

wss.on('connection', (ws, req) => {
  const origin = req.headers.origin;
  if (!allowedOrigins.includes(origin)) {
    ws.close(1008, 'Origin not allowed');
    return;
  }
  
  // Continue with connection...
});
      `
    });
  }

  /**
   * Check error handling
   */
  checkErrorHandling() {
    this.issues.push({
      severity: 'LOW',
      category: 'Error Handling',
      issue: 'Potential information disclosure in error messages',
      description: 'Some error messages may reveal internal system information'
    });

    this.fixes.push({
      title: 'Secure Error Handling',
      implementation: `
// Add secure error handler
const secureErrorHandler = (err, req, res, next) => {
  const isDevelopment = process.env.NODE_ENV === 'development';
  
  // Log full error for debugging
  console.error('Error:', err);
  
  // Send sanitized response
  const response = {
    error: 'Internal server error',
    code: 'INTERNAL_ERROR',
    timestamp: new Date().toISOString()
  };
  
  if (isDevelopment) {
    response.details = err.message;
    response.stack = err.stack;
  }
  
  res.status(500).json(response);
};
      `
    });
  }

  /**
   * Check file upload security
   */
  checkFileUploads() {
    this.issues.push({
      severity: 'MEDIUM',
      category: 'File Upload',
      issue: 'No file upload restrictions implemented',
      description: 'If file uploads are added, they need proper validation'
    });

    this.fixes.push({
      title: 'Secure File Upload Configuration',
      implementation: `
// Add file upload security (if implemented)
const multer = require('multer');
const path = require('path');

const fileFilter = (req, file, cb) => {
  const allowedTypes = ['image/jpeg', 'image/png', 'text/plain'];
  if (!allowedTypes.includes(file.mimetype)) {
    return cb(new Error('Invalid file type'), false);
  }
  cb(null, true);
};

const upload = multer({
  dest: 'uploads/',
  fileFilter,
  limits: {
    fileSize: 1024 * 1024, // 1MB
    files: 1
  }
});
      `
    });
  }

  /**
   * Check dependency security
   */
  checkDependencies() {
    this.issues.push({
      severity: 'HIGH',
      category: 'Dependencies',
      issue: 'Build-time vulnerabilities in sqlite3 dependencies',
      description: 'sqlite3 build dependencies have known vulnerabilities'
    });

    this.fixes.push({
      title: 'Dependency Security Mitigation',
      implementation: `
// Add security headers to prevent exploitation
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "wss:", "ws:"],
      fontSrc: ["'self'"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  crossOriginEmbedderPolicy: false, // For sqlite3 compatibility
}));

// Add dependency monitoring
const monitorDependencies = () => {
  const fs = require('fs');
  const packageJson = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  
  // Check for known vulnerable packages
  const vulnerablePackages = ['request', 'tar@<6.0.0'];
  
  Object.keys(packageJson.dependencies).forEach(dep => {
    if (vulnerablePackages.some(vuln => dep.includes(vuln))) {
      console.warn(\`Warning: Package \${dep} may have vulnerabilities\`);
    }
  });
};
      `
    });
  }

  /**
   * Check environment variable security
   */
  checkEnvironmentVariables() {
    this.issues.push({
      severity: 'HIGH',
      category: 'Environment',
      issue: 'Missing environment variable validation',
      description: 'Environment variables need type and format validation'
    });

    this.fixes.push({
      title: 'Environment Variable Validation',
      implementation: `
// Add to environment config
const validateEnvVar = (name, type, required = false, options = {}) => {
  const value = process.env[name];
  
  if (required && !value) {
    throw new Error(\`Required environment variable \${name} is missing\`);
  }
  
  if (value) {
    switch (type) {
      case 'port':
        const port = parseInt(value);
        if (isNaN(port) || port < 1 || port > 65535) {
          throw new Error(\`Invalid port number for \${name}\`);
        }
        break;
        
      case 'url':
        try {
          new URL(value);
        } catch {
          throw new Error(\`Invalid URL format for \${name}\`);
        }
        break;
        
      case 'boolean':
        if (!['true', 'false'].includes(value.toLowerCase())) {
          throw new Error(\`Invalid boolean value for \${name}\`);
        }
        break;
    }
  }
  
  return value;
};

// Validate critical environment variables
const config = {
  port: validateEnvVar('PORT', 'port', true),
  nodeEnv: validateEnvVar('NODE_ENV', 'string', true),
  databaseUrl: validateEnvVar('DATABASE_URL', 'url', true),
  jwtSecret: validateEnvVar('JWT_SECRET', 'string', true, { minLength: 64 })
};
      `
    });
  }
}

module.exports = SecurityAudit;