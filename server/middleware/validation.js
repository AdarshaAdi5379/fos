/**
 * Enhanced Input Validation and Sanitization
 * 
 * Provides comprehensive input validation, sanitization, and security checks
 * to prevent injection attacks and ensure data integrity.
 */

const crypto = require('crypto');
const validator = require('validator');

class InputValidator {
  constructor() {
    // Content validation rules
    this.contentRules = {
      maxLength: 10000,
      minLength: 1,
      allowedChars: /^[\x20-\x7E\u2000-\u27FF\u2900-\u29FF\u3000-\u303F\u3040-\u309F\u30A0-\u30FF\u3100-\u312F\u3200-\u32FF\u3400-\u4DBF\u4E00-\u9FFF\uF900-\uFAFF\s\S]*$/,
      prohibitedPatterns: [
        /javascript:/gi,
        /<script[^>]*>.*?<\/script>/gi,
        /on\w+\s*=/gi,
        /data:text\/html/gi,
        /vbscript:/gi,
        /onload\s*=/gi,
        /onerror\s*=/gi
      ]
    };

    // Public key validation
    this.publicKeyRules = {
      minLength: 64,
      maxLength: 130,
      pattern: /^[0-9a-fA-F]+$/
    };

    // Signature validation
    this.signatureRules = {
      minLength: 128,
      maxLength: 260,
      pattern: /^[0-9a-fA-F]+$/
    };

    // Rate limiting per identifier
    this.rateLimitStore = new Map();
  }

  /**
   * Validate and sanitize post content
   */
  validatePostContent(content) {
    const errors = [];

    // Type checking
    if (typeof content !== 'string') {
      errors.push('Content must be a string');
      return { valid: false, errors, sanitized: null };
    }

    // Length validation
    if (content.length < this.contentRules.minLength) {
      errors.push('Content cannot be empty');
    }

    if (content.length > this.contentRules.maxLength) {
      errors.push(`Content exceeds maximum length of ${this.contentRules.maxLength} characters`);
    }

    // Character validation
    if (!this.contentRules.allowedChars.test(content)) {
      errors.push('Content contains invalid characters');
    }

    // Security pattern checking
    for (const pattern of this.contentRules.prohibitedPatterns) {
      if (pattern.test(content)) {
        errors.push('Content contains potentially dangerous patterns');
        break;
      }
    }

    // Sanitization
    const sanitized = this.sanitizeContent(content);

    // Check if sanitization changed the content significantly
    if (this.calculateDifference(content, sanitized) > 0.3) {
      errors.push('Content was significantly modified during sanitization');
    }

    return {
      valid: errors.length === 0,
      errors,
      sanitized: sanitized.trim()
    };
  }

  /**
   * Validate public key
   */
  validatePublicKey(publicKey) {
    const errors = [];

    if (typeof publicKey !== 'string') {
      errors.push('Public key must be a string');
      return { valid: false, errors };
    }

    // Length validation
    if (publicKey.length < this.publicKeyRules.minLength) {
      errors.push('Public key is too short');
    }

    if (publicKey.length > this.publicKeyRules.maxLength) {
      errors.push('Public key is too long');
    }

    // Pattern validation (hexadecimal)
    if (!this.publicKeyRules.pattern.test(publicKey)) {
      errors.push('Public key must contain only hexadecimal characters');
    }

    // Additional format validation
    try {
      // Check if it's a valid secp256k1 public key format
      if (!publicKey.startsWith('04') && publicKey.length !== 130) {
        // Uncompressed key format check
        if (!this.isValidCompressedPublicKey(publicKey)) {
          errors.push('Public key format is invalid');
        }
      }
    } catch (error) {
      errors.push('Public key validation failed');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate signature
   */
  validateSignature(signature) {
    const errors = [];

    if (typeof signature !== 'string') {
      errors.push('Signature must be a string');
      return { valid: false, errors };
    }

    // Length validation
    if (signature.length < this.signatureRules.minLength) {
      errors.push('Signature is too short');
    }

    if (signature.length > this.signatureRules.maxLength) {
      errors.push('Signature is too long');
    }

    // Pattern validation (hexadecimal)
    if (!this.signatureRules.pattern.test(signature)) {
      errors.push('Signature must contain only hexadecimal characters');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate recovery parameter
   */
  validateRecovery(recovery) {
    const errors = [];

    if (typeof recovery !== 'number') {
      errors.push('Recovery parameter must be a number');
      return { valid: false, errors };
    }

    if (recovery !== 0 && recovery !== 1) {
      errors.push('Recovery parameter must be 0 or 1');
    }

    return {
      valid: errors.length === 0,
      errors
    };
  }

  /**
   * Validate complete post request
   */
  validatePostRequest(requestBody) {
    const errors = [];
    const warnings = [];

    // Check required fields
    const requiredFields = ['content', 'publicKey', 'signature', 'recovery'];
    for (const field of requiredFields) {
      if (requestBody[field] === undefined || requestBody[field] === null) {
        errors.push(`Missing required field: ${field}`);
      }
    }

    // Validate each field
    const contentValidation = this.validatePostContent(requestBody.content);
    if (!contentValidation.valid) {
      errors.push(...contentValidation.errors);
    }

    const publicKeyValidation = this.validatePublicKey(requestBody.publicKey);
    if (!publicKeyValidation.valid) {
      errors.push(...publicKeyValidation.errors);
    }

    const signatureValidation = this.validateSignature(requestBody.signature);
    if (!signatureValidation.valid) {
      errors.push(...signatureValidation.errors);
    }

    const recoveryValidation = this.validateRecovery(requestBody.recovery);
    if (!recoveryValidation.valid) {
      errors.push(...recoveryValidation.errors);
    }

    // Additional consistency checks
    if (errors.length === 0) {
      // Check for rate limiting
      const rateLimitCheck = this.checkRateLimit(requestBody.publicKey, 'post');
      if (!rateLimitCheck.allowed) {
        errors.push(`Rate limit exceeded. Try again in ${rateLimitCheck.retryAfter} seconds`);
      }

      // Check for duplicate content (simple hash-based detection)
      const contentHash = this.hashContent(contentValidation.sanitized);
      if (this.isRecentDuplicate(contentHash)) {
        warnings.push('Duplicate content detected');
      }
    }

    return {
      valid: errors.length === 0,
      errors,
      warnings,
      sanitizedContent: contentValidation.sanitized
    };
  }

  /**
   * Sanitize content
   */
  sanitizeContent(content) {
    let sanitized = content;

    // Remove dangerous HTML/JS patterns
    sanitized = sanitized.replace(/<script[^>]*>.*?<\/script>/gi, '');
    sanitized = sanitized.replace(/<iframe[^>]*>.*?<\/iframe>/gi, '');
    sanitized = sanitized.replace(/<object[^>]*>.*?<\/object>/gi, '');
    sanitized = sanitized.replace(/<embed[^>]*>/gi, '');
    
    // Remove event handlers
    sanitized = sanitized.replace(/on\w+\s*=\s*["'][^"']*["']/gi, '');
    
    // Remove dangerous protocols
    sanitized = sanitized.replace(/javascript:/gi, '');
    sanitized = sanitized.replace(/vbscript:/gi, '');
    sanitized = sanitized.replace(/data:text\/html/gi, '');
    
    // Normalize whitespace
    sanitized = sanitized.replace(/\s+/g, ' ');
    sanitized = sanitized.trim();

    return sanitized;
  }

  /**
   * Check if public key is in valid compressed format
   */
  isValidCompressedPublicKey(publicKey) {
    // Compressed keys start with 02 or 03 and are 66 characters long
    return (publicKey.startsWith('02') || publicKey.startsWith('03')) && 
           publicKey.length === 66;
  }

  /**
   * Calculate difference between original and sanitized content
   */
  calculateDifference(original, sanitized) {
    if (original.length === 0) return 0;
    const changes = Math.abs(original.length - sanitized.length);
    return changes / original.length;
  }

  /**
   * Hash content for duplicate detection
   */
  hashContent(content) {
    return crypto.createHash('sha256').update(content).digest('hex');
  }

  /**
   * Check for recent duplicate content
   */
  isRecentDuplicate(contentHash) {
    const now = Date.now();
    const timeWindow = 5 * 60 * 1000; // 5 minutes
    
    if (!this.rateLimitStore.has('contentHashes')) {
      this.rateLimitStore.set('contentHashes', new Map());
    }

    const contentHashes = this.rateLimitStore.get('contentHashes');
    
    if (contentHashes.has(contentHash)) {
      const lastUsed = contentHashes.get(contentHash);
      if (now - lastUsed < timeWindow) {
        return true;
      }
    }

    contentHashes.set(contentHash, now);
    return false;
  }

  /**
   * Check rate limiting
   */
  checkRateLimit(identifier, action) {
    const now = Date.now();
    const windowSize = 15 * 60 * 1000; // 15 minutes
    
    const limits = {
      post: 10,
      edit: 20,
      general: 100
    };

    const limit = limits[action] || limits.general;
    const key = `${identifier}_${action}`;

    if (!this.rateLimitStore.has(key)) {
      this.rateLimitStore.set(key, []);
    }

    const requests = this.rateLimitStore.get(key);
    
    // Remove old requests outside the window
    while (requests.length > 0 && requests[0] <= now - windowSize) {
      requests.shift();
    }

    // Check if limit exceeded
    if (requests.length >= limit) {
      const oldestRequest = requests[0];
      const retryAfter = Math.ceil((oldestRequest + windowSize - now) / 1000);
      
      return {
        allowed: false,
        retryAfter,
        currentCount: requests.length,
        limit
      };
    }

    // Add current request
    requests.push(now);
    
    return {
      allowed: true,
      currentCount: requests.length,
      limit,
      remaining: limit - requests.length
    };
  }

  /**
   * Clean up old rate limit data
   */
  cleanupRateLimit() {
    const now = Date.now();
    const windowSize = 15 * 60 * 1000; // 15 minutes

    for (const [key, requests] of this.rateLimitStore.entries()) {
      if (key === 'contentHashes') {
        // Clean up old content hashes (older than 5 minutes)
        const timeWindow = 5 * 60 * 1000;
        for (const [hash, timestamp] of requests.entries()) {
          if (now - timestamp > timeWindow) {
            requests.delete(hash);
          }
        }
      } else {
        // Clean up old rate limit entries
        while (requests.length > 0 && requests[0] <= now - windowSize) {
          requests.shift();
        }
      }
    }
  }

  /**
   * Get rate limit status
   */
  getRateLimitStatus(identifier, action) {
    const key = `${identifier}_${action}`;
    const requests = this.rateLimitStore.get(key) || [];
    
    const limits = {
      post: 10,
      edit: 20,
      general: 100
    };

    const limit = limits[action] || limits.general;
    
    return {
      current: requests.length,
      limit,
      remaining: Math.max(0, limit - requests.length),
      resetTime: requests.length > 0 ? requests[0] + (15 * 60 * 1000) : Date.now() + (15 * 60 * 1000)
    };
  }
}

// Express middleware for input validation
const createValidationMiddleware = (validator) => {
  return (req, res, next) => {
    try {
      const validation = validator.validatePostRequest(req.body);
      
      if (!validation.valid) {
        return res.status(400).json({
          error: 'Validation failed',
          details: validation.errors,
          code: 'VALIDATION_ERROR'
        });
      }

      // Add sanitized content to request
      req.sanitizedContent = validation.sanitizedContent;
      
      // Add warnings if any
      if (validation.warnings.length > 0) {
        req.validationWarnings = validation.warnings;
      }

      next();
    } catch (error) {
      console.error('Validation middleware error:', error);
      return res.status(500).json({
        error: 'Validation service error',
        code: 'VALIDATION_SERVICE_ERROR'
      });
    }
  };
};

module.exports = {
  InputValidator,
  createValidationMiddleware
};