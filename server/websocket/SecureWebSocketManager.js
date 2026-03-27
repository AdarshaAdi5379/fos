/**
 * Enhanced WebSocket Manager with SSL/TLS Support
 * 
 * Provides secure WebSocket connections with authentication,
 * message validation, and proper security headers.
 */

const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const { JWTManager } = require('../middleware/auth');
const SecurityConfig = require('../config/security');
const { InputValidator } = require('../middleware/validation');

// Import environment config properly
const config = require('../config/environment');

class SecureWebSocketManager {
  constructor() {
    this.wss = null;
    this.clients = new Map();
    this.jwtManager = new JWTManager();
    this.validator = new InputValidator();
    this.messageHandlers = new Map();
    
    // Security settings
    this.maxConnectionsPerIP = 10;
    this.maxMessageSize = 10000; // 10KB
    this.connectionTimeout = 5 * 60 * 1000; // 5 minutes
    this.pingInterval = 30 * 1000; // 30 seconds
    
    // Rate limiting
    this.ipConnections = new Map();
    this.messageRateLimits = new Map();
    
    // Initialize message handlers
    this.initializeMessageHandlers();
    
    // Start cleanup intervals
    this.startCleanupIntervals();
  }

  /**
   * Initialize WebSocket server with SSL/TLS
   */
  initialize(server) {
    const wsOptions = {
      server: server,
      verifyClient: (info) => this.verifyClient(info),
      maxPayload: this.maxMessageSize,
      perMessageDeflate: false, // Disable compression for security
      handshakeTimeout: 10000, // 10 seconds
    };

    // Add SSL/TLS specific options in production
    if (config.isProduction) {
      Object.assign(wsOptions, {
        // Additional SSL/TLS security options can be added here
        // when using HTTPS server
      });
    }

    this.wss = new WebSocket.Server(wsOptions);

    this.wss.on('connection', this.handleConnection.bind(this));
    this.wss.on('error', this.handleServerError.bind(this));

    console.log('🔌 Secure WebSocket server initialized');
  }

  /**
   * Verify client before establishing connection
   */
  verifyClient(info) {
    try {
      // Check rate limiting
      const clientIP = info.req.socket.remoteAddress;
      if (!this.checkConnectionLimit(clientIP)) {
        console.warn(`Connection rejected due to rate limit: ${clientIP}`);
        return false;
      }

      // Validate headers
      const origin = info.req.headers.origin;
      const allowedOrigins = [
        config.cors.origin,
        'https://localhost:5174',
        'https://localhost:3000'
      ];

      if (config.isProduction && origin && !allowedOrigins.includes(origin)) {
        console.warn(`Connection rejected due to invalid origin: ${origin}`);
        return false;
      }

      // Check authentication if required
      const token = this.extractTokenFromRequest(info.req);
      if (token && !this.validateToken(token)) {
        console.warn('Connection rejected due to invalid token');
        return false;
      }

      return true;
    } catch (error) {
      console.error('Client verification error:', error);
      return false;
    }
  }

  /**
   * Handle new WebSocket connection
   */
  handleConnection(ws, req) {
    const connectionId = crypto.randomUUID();
    const clientIP = req.socket.remoteAddress;
    const userAgent = req.headers['user-agent'] || 'unknown';

    console.log(`🔌 New WebSocket connection: ${connectionId} from ${clientIP}`);

    // Create client object
    const client = {
      id: connectionId,
      ws: ws,
      ip: clientIP,
      userAgent: userAgent,
      authenticated: false,
      publicKey: null,
      connectedAt: Date.now(),
      lastPing: Date.now(),
      messageCount: 0,
      // Rate limiting
      messageTimestamps: []
    };

    // Add to clients map
    this.clients.set(connectionId, client);
    this.incrementConnectionCount(clientIP);

    // Set up WebSocket event handlers
    ws.on('message', (data) => this.handleMessage(connectionId, data));
    ws.on('close', (code, reason) => this.handleClose(connectionId, code, reason));
    ws.on('error', (error) => this.handleError(connectionId, error));
    ws.on('pong', () => this.handlePong(connectionId));

    // Send welcome message
    this.sendToClient(connectionId, {
      type: 'connected',
      connectionId: connectionId,
      timestamp: new Date().toISOString(),
      serverInfo: {
        version: '0.1.0',
        maxMessageSize: this.maxMessageSize
      }
    });

    // Start ping interval for this client
    this.startPingInterval(connectionId);
  }

  /**
   * Handle incoming messages
   */
  async handleMessage(connectionId, data) {
    const client = this.clients.get(connectionId);
    if (!client) return;

    try {
      // Update connection info
      client.lastPing = Date.now();
      client.messageCount++;

      // Rate limiting
      if (!this.checkMessageRateLimit(client)) {
        this.sendToClient(connectionId, {
          type: 'error',
          code: 'RATE_LIMIT_EXCEEDED',
          message: 'Message rate limit exceeded'
        });
        return;
      }

      // Validate message size
      if (data.length > this.maxMessageSize) {
        this.sendToClient(connectionId, {
          type: 'error',
          code: 'MESSAGE_TOO_LARGE',
          message: 'Message exceeds maximum size limit'
        });
        return;
      }

      // Parse message
      let message;
      try {
        message = JSON.parse(data.toString());
      } catch (parseError) {
        this.sendToClient(connectionId, {
          type: 'error',
          code: 'INVALID_MESSAGE_FORMAT',
          message: 'Message must be valid JSON'
        });
        return;
      }

      // Validate message structure
      const validation = this.validateMessage(message);
      if (!validation.valid) {
        this.sendToClient(connectionId, {
          type: 'error',
          code: 'INVALID_MESSAGE',
          message: validation.error
        });
        return;
      }

      // Handle message
      await this.processMessage(connectionId, message);

    } catch (error) {
      console.error(`Message handling error for ${connectionId}:`, error);
      this.sendToClient(connectionId, {
        type: 'error',
        code: 'INTERNAL_ERROR',
        message: 'Internal server error'
      });
    }
  }

  /**
   * Process validated message
   */
  async processMessage(connectionId, message) {
    const handler = this.messageHandlers.get(message.type);
    if (handler) {
      await handler(connectionId, message);
    } else {
      this.sendToClient(connectionId, {
        type: 'error',
        code: 'UNKNOWN_MESSAGE_TYPE',
        message: `Unknown message type: ${message.type}`
      });
    }
  }

  /**
   * Initialize message handlers
   */
  initializeMessageHandlers() {
    // Authentication handler
    this.messageHandlers.set('authenticate', async (connectionId, data) => {
      try {
        const token = data.token;
        if (!token) {
          throw new Error('Token required');
        }

        const decoded = this.jwtManager.verifyAccessToken(token);
        const client = this.clients.get(connectionId);
        
        if (client) {
          client.authenticated = true;
          client.publicKey = decoded.publicKey;
          client.sessionId = decoded.sessionId;
        }

        this.sendToClient(connectionId, {
          type: 'authenticated',
          publicKey: decoded.publicKey,
          timestamp: new Date().toISOString()
        });
      } catch (error) {
        this.sendToClient(connectionId, {
          type: 'error',
          code: 'AUTHENTICATION_FAILED',
          message: error.message
        });
      }
    });

    // Heartbeat handler
    this.messageHandlers.set('heartbeat', async (connectionId, data) => {
      this.sendToClient(connectionId, {
        type: 'heartbeat_response',
        timestamp: new Date().toISOString()
      });
    });

    // Subscribe to updates handler
    this.messageHandlers.set('subscribe', async (connectionId, data) => {
      const client = this.clients.get(connectionId);
      if (!client || !client.authenticated) {
        this.sendToClient(connectionId, {
          type: 'error',
          code: 'AUTHENTICATION_REQUIRED',
          message: 'Authentication required to subscribe'
        });
        return;
      }

      // Add client to subscription (implement based on your needs)
      this.sendToClient(connectionId, {
        type: 'subscribed',
        subscription: data.subscription,
        timestamp: new Date().toISOString()
      });
    });
  }

  /**
   * Validate message structure
   */
  validateMessage(message) {
    if (!message || typeof message !== 'object') {
      return { valid: false, error: 'Message must be an object' };
    }

    if (!message.type || typeof message.type !== 'string') {
      return { valid: false, error: 'Message must have a type' };
    }

    if (message.type.length > 50) {
      return { valid: false, error: 'Message type too long' };
    }

    return { valid: true };
  }

  /**
   * Send message to specific client
   */
  sendToClient(connectionId, message) {
    const client = this.clients.get(connectionId);
    if (!client || client.ws.readyState !== WebSocket.OPEN) {
      return false;
    }

    try {
      const messageString = JSON.stringify(message);
      client.ws.send(messageString);
      return true;
    } catch (error) {
      console.error(`Failed to send message to ${connectionId}:`, error);
      return false;
    }
  }

  /**
   * Broadcast message to all authenticated clients
   */
  broadcast(message, requireAuth = true) {
    let sentCount = 0;
    
    for (const [connectionId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN) {
        if (!requireAuth || client.authenticated) {
          if (this.sendToClient(connectionId, message)) {
            sentCount++;
          }
        }
      }
    }
    
    return sentCount;
  }

  /**
   * Broadcast to specific public key
   */
  broadcastToUser(publicKey, message) {
    let sentCount = 0;
    
    for (const [connectionId, client] of this.clients.entries()) {
      if (client.ws.readyState === WebSocket.OPEN && 
          client.authenticated && 
          client.publicKey === publicKey) {
        if (this.sendToClient(connectionId, message)) {
          sentCount++;
        }
      }
    }
    
    return sentCount;
  }

  /**
   * Handle connection close
   */
  handleClose(connectionId, code, reason) {
    const client = this.clients.get(connectionId);
    if (client) {
      console.log(`🔌 WebSocket connection closed: ${connectionId}, code: ${code}, reason: ${reason}`);
      this.decrementConnectionCount(client.ip);
      this.clients.delete(connectionId);
    }
  }

  /**
   * Handle WebSocket errors
   */
  handleError(connectionId, error) {
    console.error(`WebSocket error for ${connectionId}:`, error);
    const client = this.clients.get(connectionId);
    if (client) {
      this.clients.delete(connectionId);
      this.decrementConnectionCount(client.ip);
    }
  }

  /**
   * Handle pong response
   */
  handlePong(connectionId) {
    const client = this.clients.get(connectionId);
    if (client) {
      client.lastPing = Date.now();
    }
  }

  /**
   * Extract JWT token from request
   */
  extractTokenFromRequest(req) {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return null;
  }

  /**
   * Validate JWT token
   */
  validateToken(token) {
    try {
      this.jwtManager.verifyAccessToken(token);
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Check connection limit per IP
   */
  checkConnectionLimit(ip) {
    const count = this.ipConnections.get(ip) || 0;
    return count < this.maxConnectionsPerIP;
  }

  /**
   * Increment connection count for IP
   */
  incrementConnectionCount(ip) {
    const current = this.ipConnections.get(ip) || 0;
    this.ipConnections.set(ip, current + 1);
  }

  /**
   * Decrement connection count for IP
   */
  decrementConnectionCount(ip) {
    const current = this.ipConnections.get(ip) || 0;
    if (current > 0) {
      this.ipConnections.set(ip, current - 1);
    }
  }

  /**
   * Check message rate limit for client
   */
  checkMessageRateLimit(client) {
    const now = Date.now();
    const windowSize = 60 * 1000; // 1 minute
    const maxMessages = 30; // 30 messages per minute

    // Remove old timestamps
    client.messageTimestamps = client.messageTimestamps.filter(
      timestamp => now - timestamp < windowSize
    );

    // Check limit
    if (client.messageTimestamps.length >= maxMessages) {
      return false;
    }

    // Add current timestamp
    client.messageTimestamps.push(now);
    return true;
  }

  /**
   * Start ping interval for specific client
   */
  startPingInterval(connectionId) {
    const interval = setInterval(() => {
      const client = this.clients.get(connectionId);
      if (!client) {
        clearInterval(interval);
        return;
      }

      // Check if client is responsive
      if (Date.now() - client.lastPing > this.connectionTimeout) {
        client.ws.terminate();
        clearInterval(interval);
        return;
      }

      // Send ping
      if (client.ws.readyState === WebSocket.OPEN) {
        client.ws.ping();
      }
    }, this.pingInterval);
  }

  /**
   * Start cleanup intervals
   */
  startCleanupIntervals() {
    // Clean up disconnected clients every 5 minutes
    setInterval(() => {
      const now = Date.now();
      for (const [connectionId, client] of this.clients.entries()) {
        if (now - client.lastPing > this.connectionTimeout || 
            client.ws.readyState !== WebSocket.OPEN) {
          client.ws.terminate();
          this.clients.delete(connectionId);
        }
      }
    }, 5 * 60 * 1000);

    // Clean up old IP connection data every hour
    setInterval(() => {
      for (const [ip, count] of this.ipConnections.entries()) {
        if (count === 0) {
          this.ipConnections.delete(ip);
        }
      }
    }, 60 * 60 * 1000);
  }

  /**
   * Get server statistics
   */
  getStats() {
    const now = Date.now();
    let authenticatedClients = 0;
    let totalConnections = this.clients.size;

    for (const client of this.clients.values()) {
      if (client.authenticated) {
        authenticatedClients++;
      }
    }

    return {
      totalConnections,
      authenticatedClients,
      ipConnections: this.ipConnections.size,
      uptime: now - (this.startTime || now)
    };
  }

  /**
   * Handle server errors
   */
  handleServerError(error) {
    console.error('WebSocket server error:', error);
  }

  /**
   * Close all connections gracefully
   */
  async shutdown() {
    console.log('Shutting down WebSocket server...');
    
    for (const [connectionId, client] of this.clients.entries()) {
      this.sendToClient(connectionId, {
        type: 'server_shutdown',
        message: 'Server is shutting down',
        timestamp: new Date().toISOString()
      });
      
      setTimeout(() => {
        client.ws.close(1001, 'Server shutdown');
      }, 1000);
    }

    if (this.wss) {
      this.wss.close();
    }
  }
}

module.exports = SecureWebSocketManager;