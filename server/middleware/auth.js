/**
 * JWT Authentication Middleware
 * 
 * Provides secure JWT-based session management with proper secrets,
 * token rotation, and security best practices.
 */

const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const config = require('../config/environment');

class JWTManager {
  constructor() {
    this.accessTokenSecret = this.getOrGenerateSecret('JWT_ACCESS_SECRET');
    this.refreshTokenSecret = this.getOrGenerateSecret('JWT_REFRESH_SECRET');
    this.blacklistedTokens = new Set();
    this.tokenStore = new Map(); // In production, use Redis
    
    // Token lifetimes
    this.accessTokenLifetime = '15m'; // Short-lived access tokens
    this.refreshTokenLifetime = '7d'; // Longer-lived refresh tokens
    
    // Initialize cleanup interval
    this.startCleanupInterval();
  }

  /**
   * Get existing secret from environment or generate a new one
   */
  getOrGenerateSecret(envVar) {
    const existingSecret = process.env[envVar];
    
    if (existingSecret && existingSecret.length >= 64) {
      return existingSecret;
    }
    
    // Generate secure random secret
    const newSecret = crypto.randomBytes(64).toString('hex');
    
    // In development, log the secret for setup
    if (config.isDevelopment) {
      console.warn(`⚠️  Generated new JWT secret for ${envVar}:`, newSecret);
      console.warn(`Please add this to your .env file as ${envVar}=${newSecret}`);
    }
    
    return newSecret;
  }

  /**
   * Generate access token
   */
  generateAccessToken(payload) {
    const tokenPayload = {
      ...payload,
      type: 'access',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID() // Unique token ID
    };

    return jwt.sign(tokenPayload, this.accessTokenSecret, {
      expiresIn: this.accessTokenLifetime,
      algorithm: 'HS256',
      issuer: 'unbound-platform',
      audience: 'unbound-users'
    });
  }

  /**
   * Generate refresh token
   */
  generateRefreshToken(payload) {
    const tokenPayload = {
      ...payload,
      type: 'refresh',
      iat: Math.floor(Date.now() / 1000),
      jti: crypto.randomUUID()
    };

    const refreshToken = jwt.sign(tokenPayload, this.refreshTokenSecret, {
      expiresIn: this.refreshTokenLifetime,
      algorithm: 'HS256',
      issuer: 'unbound-platform',
      audience: 'unbound-users'
    });

    // Store refresh token for validation
    this.tokenStore.set(tokenPayload.jti, {
      publicKey: payload.publicKey,
      expiresAt: Date.now() + (7 * 24 * 60 * 60 * 1000) // 7 days
    });

    return refreshToken;
  }

  /**
   * Generate token pair
   */
  generateTokenPair(payload) {
    return {
      accessToken: this.generateAccessToken(payload),
      refreshToken: this.generateRefreshToken(payload),
      expiresIn: this.accessTokenLifetime,
      tokenType: 'Bearer'
    };
  }

  /**
   * Verify access token
   */
  verifyAccessToken(token) {
    try {
      // Check if token is blacklisted
      if (this.isTokenBlacklisted(token)) {
        throw new Error('Token is blacklisted');
      }

      const decoded = jwt.verify(token, this.accessTokenSecret, {
        algorithms: ['HS256'],
        issuer: 'unbound-platform',
        audience: 'unbound-users'
      });

      // Verify token type
      if (decoded.type !== 'access') {
        throw new Error('Invalid token type');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Access token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid access token');
      } else {
        throw error;
      }
    }
  }

  /**
   * Verify refresh token
   */
  verifyRefreshToken(token) {
    try {
      const decoded = jwt.verify(token, this.refreshTokenSecret, {
        algorithms: ['HS256'],
        issuer: 'unbound-platform',
        audience: 'unbound-users'
      });

      // Verify token type
      if (decoded.type !== 'refresh') {
        throw new Error('Invalid token type');
      }

      // Check if refresh token is still valid in store
      const storedToken = this.tokenStore.get(decoded.jti);
      if (!storedToken) {
        throw new Error('Refresh token not found or expired');
      }

      return decoded;
    } catch (error) {
      if (error.name === 'TokenExpiredError') {
        throw new Error('Refresh token expired');
      } else if (error.name === 'JsonWebTokenError') {
        throw new Error('Invalid refresh token');
      } else {
        throw error;
      }
    }
  }

  /**
   * Refresh access token using refresh token
   */
  async refreshAccessToken(refreshToken) {
    try {
      // Verify refresh token
      const decoded = this.verifyRefreshToken(refreshToken);
      
      // Blacklist old refresh token
      this.blacklistToken(refreshToken);
      
      // Generate new token pair
      const newTokens = this.generateTokenPair({
        publicKey: decoded.publicKey,
        sessionId: decoded.sessionId
      });

      return newTokens;
    } catch (error) {
      throw new Error('Failed to refresh token: ' + error.message);
    }
  }

  /**
   * Blacklist a token
   */
  blacklistToken(token) {
    try {
      // Add token identifier to blacklist
      const decoded = jwt.decode(token);
      if (decoded && decoded.jti) {
        this.blacklistedTokens.add(decoded.jti);
        
        // Also remove from token store if it's a refresh token
        this.tokenStore.delete(decoded.jti);
      }
    } catch (error) {
      console.error('Failed to blacklist token:', error);
    }
  }

  /**
   * Check if token is blacklisted
   */
  isTokenBlacklisted(token) {
    try {
      const decoded = jwt.decode(token);
      return decoded && this.blacklistedTokens.has(decoded.jti);
    } catch (error) {
      return true; // Treat invalid tokens as blacklisted
    }
  }

  /**
   * Logout user by blacklisting all their tokens
   */
  async logoutUser(publicKey) {
    // Find and blacklist all tokens for this user
    for (const [tokenId, tokenData] of this.tokenStore.entries()) {
      if (tokenData.publicKey === publicKey) {
        this.blacklistedTokens.add(tokenId);
        this.tokenStore.delete(tokenId);
      }
    }
  }

  /**
   * Cleanup expired tokens
   */
  cleanupExpiredTokens() {
    const now = Date.now();
    
    // Cleanup expired refresh tokens from store
    for (const [tokenId, tokenData] of this.tokenStore.entries()) {
      if (tokenData.expiresAt <= now) {
        this.tokenStore.delete(tokenId);
      }
    }

    // Cleanup blacklisted tokens (keep for 1 hour for security)
    const oneHourAgo = now - (60 * 60 * 1000);
    for (const tokenId of this.blacklistedTokens) {
      // In a real implementation, you'd store timestamps
      // For now, we'll keep the blacklist manageable
      if (this.blacklistedTokens.size > 10000) {
        this.blacklistedTokens.clear();
        break;
      }
    }
  }

  /**
   * Start cleanup interval
   */
  startCleanupInterval() {
    // Cleanup every hour
    setInterval(() => {
      this.cleanupExpiredTokens();
    }, 60 * 60 * 1000);
  }

  /**
   * Get token info (for debugging)
   */
  getTokenInfo(token) {
    try {
      return jwt.decode(token);
    } catch (error) {
      return null;
    }
  }

  /**
   * Check if token will expire soon (within 5 minutes)
   */
  isTokenExpiringSoon(token) {
    try {
      const decoded = jwt.decode(token);
      if (!decoded || !decoded.exp) {
        return true;
      }
      
      const now = Math.floor(Date.now() / 1000);
      const fiveMinutesFromNow = now + (5 * 60);
      
      return decoded.exp <= fiveMinutesFromNow;
    } catch (error) {
      return true;
    }
  }
}

// Express middleware for JWT authentication
const authenticateToken = (jwtManager) => {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : null;

      if (!token) {
        return res.status(401).json({
          error: 'Access token required',
          code: 'TOKEN_REQUIRED'
        });
      }

      const decoded = jwtManager.verifyAccessToken(token);
      
      // Add user info to request
      req.user = {
        publicKey: decoded.publicKey,
        sessionId: decoded.sessionId,
        tokenId: decoded.jti
      };

      // Add refresh token info if it's expiring soon
      if (jwtManager.isTokenExpiringSoon(token)) {
        res.set('X-Token-Refresh-Required', 'true');
      }

      next();
    } catch (error) {
      return res.status(401).json({
        error: error.message,
        code: 'INVALID_TOKEN'
      });
    }
  };
};

// Middleware for optional authentication
const optionalAuth = (jwtManager) => {
  return (req, res, next) => {
    try {
      const authHeader = req.headers.authorization;
      const token = authHeader && authHeader.startsWith('Bearer ') 
        ? authHeader.slice(7) 
        : null;

      if (token) {
        const decoded = jwtManager.verifyAccessToken(token);
        req.user = {
          publicKey: decoded.publicKey,
          sessionId: decoded.sessionId,
          tokenId: decoded.jti
        };
      }

      next();
    } catch (error) {
      // Continue without authentication for optional routes
      next();
    }
  };
};

module.exports = {
  JWTManager,
  authenticateToken,
  optionalAuth
};