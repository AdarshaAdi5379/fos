const helmet = require('helmet');
const config = require('./environment');

const securityMiddleware = helmet({
  // Content Security Policy
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      styleSrc: ["'self'", "'unsafe-inline'"], // Allow inline styles for Vite development
      scriptSrc: ["'self'", "'unsafe-eval'"], // Allow eval for Vite development
      imgSrc: ["'self'", "data:", "https:"],
      connectSrc: ["'self'", "ws:", "wss:"], // Allow WebSocket connections
      fontSrc: ["'self'", "https:"],
      objectSrc: ["'none'"],
      mediaSrc: ["'self'"],
      frameSrc: ["'none'"],
    },
  },
  
  // Cross-Origin Embedder Policy
  crossOriginEmbedderPolicy: config.isProduction ? { policy: "require-corp" } : false,
  
  // Cross-Origin Opener Policy
  crossOriginOpenerPolicy: { policy: "same-origin" },
  
  // Cross-Origin Resource Policy
  crossOriginResourcePolicy: { policy: "cross-origin" },
  
  // DNS Prefetch Control
  dnsPrefetchControl: { allow: false },
  
  // Frame Options
  frameguard: { action: 'deny' },
  
  // Hide Powered-By Header
  hidePoweredBy: true,
  
  // HSTS (only in production)
  hsts: config.isProduction ? {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true
  } : false,
  
  // IE Compatibility
  ieNoOpen: true,
  
  // No Sniff
  noSniff: true,
  
  // Origin Agent Cluster
  originAgentCluster: true,
  
  // Permissions Policy
  permissionsPolicy: {
    features: {
      camera: ["'none'"],
      microphone: ["'none'"],
      geolocation: ["'none'"],
      payment: ["'none'"],
      usb: ["'none'"],
      accelerometer: ["'none'"],
      gyroscope: ["'none'"],
      magnetometer: ["'none'"]
    }
  },
  
  // Referrer Policy
  referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  
  // X-Content-Type-Options
  xContentTypeOptions: true
});

// Additional security middleware
const additionalSecurity = (req, res, next) => {
  // Remove server information
  res.removeHeader('X-Powered-By');
  res.removeHeader('Server');
  
  // Custom security headers
  res.setHeader('X-Request-ID', generateRequestId());
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  
  // Rate limit headers
  res.setHeader('X-RateLimit-Limit', '100');
  res.setHeader('X-RateLimit-Remaining', '99');
  res.setHeader('X-RateLimit-Reset', new Date(Date.now() + 15 * 60 * 1000).toISOString());
  
  next();
};

// Request ID generator
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

// IP-based blocking middleware (optional)
const ipBlocking = (req, res, next) => {
  const clientIP = req.ip || req.connection.remoteAddress;
  
  // List of blocked IPs (in production, this would come from database)
  const blockedIPs = process.env.BLOCKED_IPS ? 
    process.env.BLOCKED_IPS.split(',').map(ip => ip.trim()) : [];
  
  if (blockedIPs.includes(clientIP)) {
    return res.status(403).json({ 
      error: 'Access denied' 
    });
  }
  
  next();
};

// Input validation middleware
const validateInput = (req, res, next) => {
  // Check for common injection patterns
  const suspiciousPatterns = [
    /<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi,
    /javascript:/gi,
    /on\w+\s*=/gi,
    /expression\s*\(/gi
  ];
  
  const checkString = (str) => {
    if (typeof str === 'string') {
      return suspiciousPatterns.some(pattern => pattern.test(str));
    }
    return false;
  };
  
  // Check request body
  if (req.body) {
    const bodyString = JSON.stringify(req.body);
    if (checkString(bodyString)) {
      return res.status(400).json({ 
        error: 'Invalid input detected' 
      });
    }
  }
  
  // Check query parameters
  if (req.query) {
    const queryString = JSON.stringify(req.query);
    if (checkString(queryString)) {
      return res.status(400).json({ 
        error: 'Invalid query detected' 
      });
    }
  }
  
  next();
};

// Size limiting middleware
const sizeLimit = (req, res, next) => {
  const contentLength = req.get('content-length');
  const maxSize = config.contentModeration.maxLength * 2; // Allow some overhead
  
  if (contentLength && parseInt(contentLength) > maxSize) {
    return res.status(413).json({ 
      error: 'Request entity too large',
      maxSize: maxSize
    });
  }
  
  next();
};

module.exports = {
  securityMiddleware,
  additionalSecurity,
  ipBlocking,
  validateInput,
  sizeLimit
};