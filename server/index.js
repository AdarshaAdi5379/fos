const express = require('express');
const cors = require('cors');
const crypto = require('crypto');
const config = require('../config/environment');
const dbConfig = require('../config/database');
const { postLimiter, editLimiter, generalLimiter } = require('./rateLimiting');
const ContentModeration = require('./moderation');
const WebSocketManager = require('./websocket');

// Configure secp256k1 for server
const secp = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const app = express();
const port = config.port;

// Database instance
let db;

async function initializeApp() {
  try {
    // Initialize database
    await dbConfig.initializeDatabase();
    
    // Get database connection
    db = await dbConfig.getConnection();
    
    console.log(`Unbound server initialized in ${config.nodeEnv} mode`);
    console.log(`Database type: ${config.database.type}`);
    
    // Start server
    const server = app.listen(port, () => {
      console.log(`Unbound server running on port ${port}`);
    });

    // Initialize WebSocket
    const wsManager = new WebSocketManager();
    wsManager.initialize(server);
    
    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('Shutting down gracefully...');
      await dbConfig.close();
      server.close();
      process.exit(0);
    });
    
    process.on('SIGTERM', async () => {
      console.log('Received SIGTERM, shutting down gracefully...');
      await dbConfig.close();
      server.close();
      process.exit(0);
    });
    
  } catch (error) {
    console.error('Failed to initialize application:', error);
    process.exit(1);
  }
}

// Middleware setup
app.use(cors(config.cors));
app.use(express.json());
app.use('/api/', generalLimiter);

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();
  
  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms`);
  });
  
  next();
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    ...(config.isDevelopment && { details: err.message })
  });
});

class ServerCrypto {
  static verifySignature(message, signature, publicKey, recovery) {
    try {
      const messageHash = sha256(new TextEncoder().encode(message));
      const signatureBytes = Uint8Array.from(Buffer.from(signature, 'hex'));
      const publicKeyBytes = Uint8Array.from(Buffer.from(publicKey, 'hex'));
      
      return secp.verify(signatureBytes, messageHash, publicKeyBytes);
    } catch (error) {
      console.error('Signature verification error:', error);
      return false;
    }
  }

  static generateUUID() {
    return crypto.randomUUID();
  }
}

// Enhanced database query helper
async function query(sql, params = []) {
  return await dbConfig.query(sql, params);
}

// API Routes
app.post('/api/posts', postLimiter, async (req, res) => {
  try {
    const { content, publicKey, signature, recovery } = req.body;

    if (!content || !publicKey || !signature || recovery === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    if (config.contentModeration.enabled && ContentModeration.shouldBlock(content)) {
      const violations = ContentModeration.getViolationReason(content);
      return res.status(400).json({ 
        error: 'Content blocked',
        violations: violations
      });
    }

    if (!ServerCrypto.verifySignature(content, signature, publicKey, recovery)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Create identity (UPSERT)
    await query(`
      INSERT OR IGNORE INTO identities (public_key) VALUES (?)
    `, [publicKey]);

    // Update last seen
    await query(`
      UPDATE identities SET last_seen = CURRENT_TIMESTAMP WHERE public_key = ?
    `, [publicKey]);

    // Create post
    const postUuid = ServerCrypto.generateUUID();
    const postResult = await query(`
      INSERT INTO posts (post_uuid, author_key, content, signature, recovery) 
      VALUES (?, ?, ?, ?, ?)
    `, [postUuid, publicKey, content, signature, recovery]);

    // Get created post
    const post = (await query(`
      SELECT * FROM posts WHERE id = ?
    `, [postResult.id]))[0];

    // Broadcast to WebSocket clients
    const wsManager = new WebSocketManager();
    wsManager.broadcastNewPost(post);
    
    res.status(201).json(post);

  } catch (error) {
    console.error('Error creating post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.put('/api/posts/:id', editLimiter, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, publicKey, signature, recovery } = req.body;

    if (!content || !publicKey || !signature || recovery === undefined) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    // Get existing post
    const posts = await query('SELECT * FROM posts WHERE id = ?', [id]);
    if (posts.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    const post = posts[0];
    if (post.author_key !== publicKey) {
      return res.status(403).json({ error: 'Not authorized to edit this post' });
    }

    if (!ServerCrypto.verifySignature(content, signature, publicKey, recovery)) {
      return res.status(401).json({ error: 'Invalid signature' });
    }

    // Get version count
    const versionResult = await query(`
      SELECT COUNT(*) as count FROM post_versions WHERE post_id = ?
    `, [id]);
    const versionNumber = versionResult[0].count + 1;

    // Start transaction
    await query('BEGIN');
    
    try {
      // Create version record
      await query(`
        INSERT INTO post_versions (post_id, version_number, content, signature, recovery) 
        VALUES (?, ?, ?, ?, ?)
      `, [id, versionNumber, content, signature, recovery]);

      // Update post
      await query(`
        UPDATE posts SET content = ?, signature = ?, recovery = ?, updated_at = CURRENT_TIMESTAMP 
        WHERE id = ?
      `, [content, signature, recovery, id]);

      await query('COMMIT');
    } catch (error) {
      await query('ROLLBACK');
      throw error;
    }

    // Get updated post
    const updatedPost = (await query(`
      SELECT * FROM posts WHERE id = ?
    `, [id]))[0];

    // Broadcast update
    const wsManager = new WebSocketManager();
    wsManager.broadcastPostUpdate(updatedPost);
    
    res.json(updatedPost);

  } catch (error) {
    console.error('Error updating post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/posts', async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000); // Max 1000 for performance
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const posts = await query(`
      SELECT * FROM posts 
      ORDER BY created_at DESC 
      LIMIT ? OFFSET ?
    `, [limit, offset]);
    
    res.json(posts);

  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const posts = await query('SELECT * FROM posts WHERE id = ?', [id]);
    
    if (posts.length === 0) {
      return res.status(404).json({ error: 'Post not found' });
    }

    res.json(posts[0]);

  } catch (error) {
    console.error('Error fetching post:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/posts/:id/versions', async (req, res) => {
  try {
    const { id } = req.params;
    const versions = await query(`
      SELECT * FROM post_versions 
      WHERE post_id = ? 
      ORDER BY version_number ASC
    `, [id]);
    
    res.json(versions);

  } catch (error) {
    console.error('Error fetching post versions:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/identities/:publicKey/posts', async (req, res) => {
  try {
    const { publicKey } = req.params;
    const limit = Math.min(parseInt(req.query.limit) || 50, 500); // Max 500 for performance

    const posts = await query(`
      SELECT * FROM posts 
      WHERE author_key = ? 
      ORDER BY created_at DESC 
      LIMIT ?
    `, [publicKey, limit]);
    
    res.json(posts);

  } catch (error) {
    console.error('Error fetching author posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.get('/api/health', async (req, res) => {
  try {
    // Database health check
    await query('SELECT 1');
    
    // Additional health checks can be added here
    const wsManager = new WebSocketManager();
    
    res.json({ 
      status: 'ok', 
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      websocket_connections: wsManager.getConnectedClientsCount(),
      database: {
        type: config.database.type,
        connected: true
      },
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({ 
      status: 'error', 
      timestamp: new Date().toISOString(),
      error: 'Service unavailable'
    });
  }
});

// Initialize the application
initializeApp();

module.exports = app;