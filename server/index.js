const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const crypto = require('crypto');
const SecurityConfig = require('./config/security');
const config = require('./config/environment');
const dbConfig = require('./database');
const { postLimiter, editLimiter, generalLimiter } = require('./rateLimiting');
const ContentModeration = require('./moderation');
const SecureWebSocketManager = require('./websocket/SecureWebSocketManager');
const FeedController = require('./controllers/FeedController');
const SafetyController = require('./controllers/SafetyController');
const ModerationController = require('./controllers/ModerationController');
const WalletController = require('./controllers/WalletController');
const ProfileController = require('./controllers/ProfileController');
const { PostGraphService } = require('./services/PostGraphService');
const { JWTManager, authenticateToken, optionalAuth } = require('./middleware/auth');
const { InputValidator, createValidationMiddleware } = require('./middleware/validation');

// Configure secp256k1 for server
const secp = require('@noble/secp256k1');
const { sha256 } = require('@noble/hashes/sha2.js');
const { hmac } = require('@noble/hashes/hmac.js');

secp.hashes.sha256 = sha256;
secp.hashes.hmacSha256 = (key, msg) => hmac(sha256, key, msg);

const app = express();
const port = config.port;

// Database and security instances
let db;
let jwtManager;
const inputValidator = new InputValidator();
let wsManager;
let feedController;
let safetyController;
let moderationController;
let walletController;
let profileController;
let postGraphService;

async function initializeApp() {
  try {
    // Initialize database
    await dbConfig.initializeDatabase();

    // Get database connection
    db = await dbConfig.getConnection();

    // Initialize security components
    jwtManager = new JWTManager();
    // inputValidator initialized at top level
    wsManager = new SecureWebSocketManager();
    feedController = new FeedController(db);
    safetyController = new SafetyController(db);
    moderationController = new ModerationController(db);
    walletController = new WalletController(dbConfig, ServerCrypto.verifySignature, wsManager);
    profileController = new ProfileController(dbConfig);
    postGraphService = new PostGraphService(dbConfig);

    // Initialize advanced features
    await feedController.initialize();
    await safetyController.initialize();
    await moderationController.initialize();
    await profileController.initialize();
    await postGraphService.initializeTables();

    console.log(`🔐 Unbound server initialized in ${config.nodeEnv} mode`);
    console.log(`🗄️  Database type: ${config.database.type}`);
    console.log(`🛡️  Security components loaded`);

    // Start server
    const server = app.listen(port, () => {
      console.log(`🚀 Unbound server running on port ${port}`);
      console.log(`📡 WebSocket server initialized`);
    });

    // Initialize WebSocket
    wsManager.initialize(server);

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('🛑 Shutting down gracefully...');
      await wsManager.shutdown();
      await dbConfig.close();
      server.close();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('🛑 Received SIGTERM, shutting down gracefully...');
      await wsManager.shutdown();
      await dbConfig.close();
      server.close();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to initialize application:', error);
    process.exit(1);
  }
}

// Security middleware setup
app.use(helmet(SecurityConfig.getHelmetConfig()));

// Custom security headers
app.use((req, res, next) => {
  // Add security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=(), payment=()');

  // Add request ID for tracking
  req.requestId = require('crypto').randomUUID();
  res.setHeader('X-Request-ID', req.requestId);

  next();
});

app.use(cors(config.cors));
app.use(express.json({
  limit: '100kb',  // Reduced from 10MB for security
  strict: true   // Only accept objects and arrays
}));
app.use('/api/', generalLimiter);

// Enhanced security validation middleware
app.use((req, res, next) => {
  try {
    // Validate nested objects to prevent injection
    if (req.body && typeof req.body === 'object') {
      SecurityConfig.validateNestedObject(req.body);
    }
    next();
  } catch (error) {
    res.status(400).json({
      error: 'Invalid request data',
      code: 'VALIDATION_ERROR',
      details: config.isDevelopment ? error.message : undefined
    });
  }
});

// Request logging middleware
app.use((req, res, next) => {
  const start = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - start;
    console.log(`${req.method} ${req.path} - ${res.statusCode} - ${duration}ms - ${req.ip}`);
  });

  next();
});

// Enhanced error handling middleware
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);

  const secureError = SecurityConfig.sanitizeError(err, config.isDevelopment);
  res.status(500).json(secureError);
});

// Security audit endpoint
app.get('/api/security/audit', async (req, res) => {
  if (config.isDevelopment) {
    const audit = SecurityConfig.checkDependencies();
    res.json({
      securityAudit: {
        dependencies: audit,
        environment: config.isDevelopment ? 'development' : 'production',
        security: {
          helmet: 'enabled',
          rateLimiting: 'enabled',
          inputValidation: 'enabled',
          jwtValidation: 'enabled'
        }
      }
    });
  } else {
    res.status(404).json({ error: 'Not found' });
  }
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

// Authentication endpoints with enhanced rate limiting
const authLimiter = SecurityConfig.getAuthRateLimiter();

// Lazy middleware wrappers - jwtManager is initialized asynchronously,
// so we defer the lookup to request time to avoid undefined reference.
const lazyAuthenticateToken = (req, res, next) => {
  if (!jwtManager) {
    return res.status(503).json({ error: 'Server not ready', code: 'NOT_READY' });
  }
  return authenticateToken(jwtManager)(req, res, next);
};

const lazyOptionalAuth = (req, res, next) => {
  if (!jwtManager) return next();
  return optionalAuth(jwtManager)(req, res, next);
};

app.post('/api/auth/login', authLimiter, async (req, res) => {
  try {
    const { publicKey, signature, message } = req.body;

    if (!publicKey || !signature || !message) {
      return res.status(400).json({
        error: 'Missing authentication fields',
        code: 'MISSING_FIELDS'
      });
    }

    // Verify signature
    if (!ServerCrypto.verifySignature(message, signature, publicKey)) {
      return res.status(401).json({
        error: 'Invalid signature',
        code: 'INVALID_SIGNATURE'
      });
    }

    // Generate token pair
    const tokens = jwtManager.generateTokenPair({
      publicKey: publicKey,
      sessionId: crypto.randomUUID()
    });

    res.json(tokens);

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
      code: 'AUTH_ERROR'
    });
  }
});

app.post('/api/auth/refresh', authLimiter, async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res.status(400).json({
        error: 'Refresh token required',
        code: 'MISSING_REFRESH_TOKEN'
      });
    }

    const tokens = await jwtManager.refreshAccessToken(refreshToken);
    res.json(tokens);

  } catch (error) {
    console.error('Token refresh error:', error);
    res.status(401).json({
      error: error.message,
      code: 'REFRESH_FAILED'
    });
  }
});

app.post('/api/auth/logout', lazyAuthenticateToken, async (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : null;

    if (token) {
      jwtManager.blacklistToken(token);
      await jwtManager.logoutUser(req.user.publicKey);
    }

    res.json({ message: 'Logged out successfully' });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
      code: 'LOGOUT_ERROR'
    });
  }
});

// ── Anonymous Profile API ───────────────────────────────────────────────────
// Public read endpoints use optional auth so the server can return viewer context (e.g., isFollowing)
app.get('/api/profile/me', lazyAuthenticateToken, (req, res) => profileController.getMe(req, res));
app.post('/api/profile', lazyAuthenticateToken, (req, res) => profileController.createProfile(req, res));
app.put('/api/profile', lazyAuthenticateToken, (req, res) => profileController.updateProfile(req, res));
app.get('/api/profile/:id', lazyOptionalAuth, (req, res) => profileController.getProfile(req, res));
app.get('/api/profile/:id/followers', lazyOptionalAuth, (req, res) => profileController.getFollowers(req, res));
app.get('/api/profile/:id/following', lazyOptionalAuth, (req, res) => profileController.getFollowing(req, res));

app.post('/api/follow/:targetId', lazyAuthenticateToken, (req, res) => profileController.follow(req, res));
app.delete('/api/follow/:targetId', lazyAuthenticateToken, (req, res) => profileController.unfollow(req, res));

// API Routes
app.post('/api/posts',
  postLimiter,
  createValidationMiddleware(inputValidator),
  lazyOptionalAuth,
  async (req, res) => {
    try {
      const validation = postGraphService.validateContent(req.sanitizedContent);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, code: validation.code });
      }
      const content = validation.content;
      const publicKey = req.body.publicKey;

      // Verify signature
      if (!ServerCrypto.verifySignature(content, req.body.signature, publicKey, req.body.recovery)) {
        return res.status(401).json({
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      // Additional content moderation
      if (config.contentModeration.enabled && ContentModeration.shouldBlock(content)) {
        const violations = ContentModeration.getViolationReason(content);
        return res.status(400).json({
          error: 'Content blocked',
          violations: violations,
          code: 'CONTENT_BLOCKED'
        });
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
        INSERT INTO posts (post_uuid, author_key, content, signature, recovery, post_type) 
        VALUES (?, ?, ?, ?, ?, 'post')
      `, [postUuid, publicKey, content, req.body.signature, req.body.recovery]);

      // Store mentions + hashtags (best-effort; unknown mentions are ignored)
      const mentions = postGraphService.extractMentions(content);
      const hashtags = postGraphService.extractHashtags(content);
      await postGraphService.storeMentions(postUuid, mentions);
      await postGraphService.storeHashtags(postUuid, hashtags);

      // Get created post
      const post = (await query(`
        SELECT
          p.*,
          up.anon_id,
          up.display_name,
          up.avatar_style,
          op.post_uuid     AS original_post_uuid,
          op.author_key    AS original_author_key,
          op.content       AS original_content,
          op.created_at    AS original_created_at,
          oup.anon_id      AS original_anon_id,
          oup.display_name AS original_display_name,
          oup.avatar_style AS original_avatar_style
        FROM posts p
        LEFT JOIN user_profiles up ON up.public_key = p.author_key
        LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
        LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
        WHERE p.post_uuid = ?
      `, [postUuid]))[0];

      // Broadcast to all connected WebSocket clients (auth not required to receive feed updates)
      wsManager.broadcast({
        type: 'new_post',
        data: post
      }, false);

      res.status(201).json(post);

    } catch (error) {
      console.error('Error creating post:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'POST_ERROR'
      });
    }
  }
);

// ── Reply post ──────────────────────────────────────────────────────────────
app.post('/api/posts/reply',
  postLimiter,
  createValidationMiddleware(inputValidator),
  lazyOptionalAuth,
  async (req, res) => {
    try {
      const parentRaw = (req.body.parent_post_id || req.body.parentPostId || req.body.parent_post_uuid || '').trim();
      if (!parentRaw) {
        return res.status(400).json({ error: 'parent_post_id is required', code: 'MISSING_PARENT_POST' });
      }

      const parentPostUuid = await resolvePostUuidFromId(parentRaw);
      if (!parentPostUuid) {
        return res.status(404).json({ error: 'Parent post not found', code: 'PARENT_NOT_FOUND' });
      }

      const validation = postGraphService.validateContent(req.sanitizedContent);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, code: validation.code });
      }
      const content = validation.content;

      const publicKey = req.body.publicKey;
      const canonical = `reply:${parentPostUuid}:${content}`;

      if (!ServerCrypto.verifySignature(canonical, req.body.signature, publicKey, req.body.recovery)) {
        return res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
      }

      await query(`INSERT OR IGNORE INTO identities (public_key) VALUES (?)`, [publicKey]);
      await query(`UPDATE identities SET last_seen = CURRENT_TIMESTAMP WHERE public_key = ?`, [publicKey]);

      const postUuid = ServerCrypto.generateUUID();

      await query('BEGIN');
      try {
        await query(
          `
            INSERT INTO posts (post_uuid, author_key, content, signature, recovery, post_type, parent_post_uuid)
            VALUES (?, ?, ?, ?, ?, 'reply', ?)
          `,
          [postUuid, publicKey, content, req.body.signature, req.body.recovery, parentPostUuid]
        );

        await query(
          `UPDATE posts SET replies_count = replies_count + 1 WHERE post_uuid = ?`,
          [parentPostUuid]
        );

        await query('COMMIT');
      } catch (err) {
        await query('ROLLBACK');
        throw err;
      }

      const mentions = postGraphService.extractMentions(content);
      const hashtags = postGraphService.extractHashtags(content);
      await postGraphService.storeMentions(postUuid, mentions);
      await postGraphService.storeHashtags(postUuid, hashtags);

      const reply = (await query(
        `
          SELECT
            p.*,
            up.anon_id,
            up.display_name,
            up.avatar_style,
            op.post_uuid     AS original_post_uuid,
            op.author_key    AS original_author_key,
            op.content       AS original_content,
            op.created_at    AS original_created_at,
            oup.anon_id      AS original_anon_id,
            oup.display_name AS original_display_name,
            oup.avatar_style AS original_avatar_style
          FROM posts p
          LEFT JOIN user_profiles up ON up.public_key = p.author_key
          LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
          LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
          WHERE p.post_uuid = ?
        `,
        [postUuid]
      ))[0];

      wsManager.broadcast({ type: 'new_post', data: reply }, false);
      res.status(201).json(reply);
    } catch (error) {
      console.error('Error creating reply:', error);
      res.status(500).json({ error: 'Internal server error', code: 'REPLY_ERROR' });
    }
  }
);

// PRD-friendly route: POST /api/posts/:id/reply
app.post('/api/posts/:id/reply',
  postLimiter,
  createValidationMiddleware(inputValidator),
  lazyOptionalAuth,
  async (req, res) => {
    try {
      const parentRaw = (req.params.id || '').trim();
      if (!parentRaw) {
        return res.status(400).json({ error: 'parent_post_id is required', code: 'MISSING_PARENT_POST' });
      }

      const parentPostUuid = await resolvePostUuidFromId(parentRaw);
      if (!parentPostUuid) {
        return res.status(404).json({ error: 'Parent post not found', code: 'PARENT_NOT_FOUND' });
      }

      const validation = postGraphService.validateContent(req.sanitizedContent);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, code: validation.code });
      }
      const content = validation.content;

      const publicKey = req.body.publicKey;
      const canonical = `reply:${parentPostUuid}:${content}`;

      if (!ServerCrypto.verifySignature(canonical, req.body.signature, publicKey, req.body.recovery)) {
        return res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
      }

      await query(`INSERT OR IGNORE INTO identities (public_key) VALUES (?)`, [publicKey]);
      await query(`UPDATE identities SET last_seen = CURRENT_TIMESTAMP WHERE public_key = ?`, [publicKey]);

      const postUuid = ServerCrypto.generateUUID();

      await query('BEGIN');
      try {
        await query(
          `
            INSERT INTO posts (post_uuid, author_key, content, signature, recovery, post_type, parent_post_uuid)
            VALUES (?, ?, ?, ?, ?, 'reply', ?)
          `,
          [postUuid, publicKey, content, req.body.signature, req.body.recovery, parentPostUuid]
        );

        await query(
          `UPDATE posts SET replies_count = replies_count + 1 WHERE post_uuid = ?`,
          [parentPostUuid]
        );

        await query('COMMIT');
      } catch (err) {
        await query('ROLLBACK');
        throw err;
      }

      const mentions = postGraphService.extractMentions(content);
      const hashtags = postGraphService.extractHashtags(content);
      await postGraphService.storeMentions(postUuid, mentions);
      await postGraphService.storeHashtags(postUuid, hashtags);

      const reply = (await query(
        `
          SELECT
            p.*,
            up.anon_id,
            up.display_name,
            up.avatar_style,
            op.post_uuid     AS original_post_uuid,
            op.author_key    AS original_author_key,
            op.content       AS original_content,
            op.created_at    AS original_created_at,
            oup.anon_id      AS original_anon_id,
            oup.display_name AS original_display_name,
            oup.avatar_style AS original_avatar_style
          FROM posts p
          LEFT JOIN user_profiles up ON up.public_key = p.author_key
          LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
          LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
          WHERE p.post_uuid = ?
        `,
        [postUuid]
      ))[0];

      wsManager.broadcast({ type: 'new_post', data: reply }, false);
      res.status(201).json(reply);
    } catch (error) {
      console.error('Error creating reply:', error);
      res.status(500).json({ error: 'Internal server error', code: 'REPLY_ERROR' });
    }
  }
);

// ── Repost ──────────────────────────────────────────────────────────────────
app.post('/api/posts/repost',
  postLimiter,
  lazyOptionalAuth,
  async (req, res) => {
    try {
      const originalPostUuid = (req.body.original_post_id || req.body.originalPostId || req.body.original_post_uuid || '').trim();
      if (!originalPostUuid) {
        return res.status(400).json({ error: 'original_post_id is required', code: 'MISSING_ORIGINAL_POST' });
      }

      const publicKey = req.body.publicKey;
      const canonical = `repost:${originalPostUuid}`;

      if (!ServerCrypto.verifySignature(canonical, req.body.signature, publicKey, req.body.recovery)) {
        return res.status(401).json({ error: 'Invalid signature', code: 'INVALID_SIGNATURE' });
      }

      const originals = await query(`SELECT * FROM posts WHERE post_uuid = ? AND is_deleted = 0 LIMIT 1`, [originalPostUuid]);
      if (!originals.length) {
        return res.status(404).json({ error: 'Original post not found', code: 'ORIGINAL_NOT_FOUND' });
      }

      // Prevent duplicate repost by same user
      const existing = await query(
        `SELECT 1 as ok FROM posts WHERE author_key = ? AND post_type = 'repost' AND repost_of_uuid = ? AND is_deleted = 0 LIMIT 1`,
        [publicKey, originalPostUuid]
      );
      if (existing.length) {
        return res.status(409).json({ error: 'Already reposted', code: 'DUPLICATE_REPOST' });
      }

      await query(`INSERT OR IGNORE INTO identities (public_key) VALUES (?)`, [publicKey]);
      await query(`UPDATE identities SET last_seen = CURRENT_TIMESTAMP WHERE public_key = ?`, [publicKey]);

      const postUuid = ServerCrypto.generateUUID();

      await query('BEGIN');
      try {
        // For MVP display, copy original content into the repost record while keeping a reference.
        await query(
          `
            INSERT INTO posts (post_uuid, author_key, content, signature, recovery, post_type, repost_of_uuid)
            VALUES (?, ?, ?, ?, ?, 'repost', ?)
          `,
          [postUuid, publicKey, originals[0].content, req.body.signature, req.body.recovery, originalPostUuid]
        );

        await query(
          `UPDATE posts SET reposts_count = reposts_count + 1 WHERE post_uuid = ?`,
          [originalPostUuid]
        );

        await query('COMMIT');
      } catch (err) {
        await query('ROLLBACK');
        throw err;
      }

      const repost = (await query(
        `
          SELECT
            p.*,
            up.anon_id,
            up.display_name,
            up.avatar_style,
            op.post_uuid     AS original_post_uuid,
            op.author_key    AS original_author_key,
            op.content       AS original_content,
            op.created_at    AS original_created_at,
            oup.anon_id      AS original_anon_id,
            oup.display_name AS original_display_name,
            oup.avatar_style AS original_avatar_style
          FROM posts p
          LEFT JOIN user_profiles up ON up.public_key = p.author_key
          LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
          LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
          WHERE p.post_uuid = ?
        `,
        [postUuid]
      ))[0];

      wsManager.broadcast({ type: 'new_post', data: repost }, false);
      res.status(201).json(repost);
    } catch (error) {
      console.error('Error creating repost:', error);
      res.status(500).json({ error: 'Internal server error', code: 'REPOST_ERROR' });
    }
  }
);

// Undo repost (requires auth)
app.delete('/api/posts/:id/repost', lazyAuthenticateToken, async (req, res) => {
  try {
    const userKey = req.user.publicKey;
    const originalPostUuid = await resolvePostUuidFromId(req.params.id);
    if (!originalPostUuid) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });

    const repostRows = await query(
      `SELECT post_uuid FROM posts WHERE author_key = ? AND post_type = 'repost' AND repost_of_uuid = ? AND is_deleted = 0 LIMIT 1`,
      [userKey, originalPostUuid]
    );
    if (!repostRows.length) {
      return res.status(404).json({ error: 'Repost not found', code: 'REPOST_NOT_FOUND' });
    }

    const repostUuid = repostRows[0].post_uuid;

    await query('BEGIN');
    try {
      await query(`UPDATE posts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE post_uuid = ?`, [repostUuid]);
      await query(`UPDATE posts SET reposts_count = MAX(reposts_count - 1, 0) WHERE post_uuid = ?`, [originalPostUuid]);
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    await postGraphService.deleteMetadata(repostUuid);
    res.json({ status: 'unreposted' });
  } catch (error) {
    console.error('Undo repost error:', error);
    res.status(500).json({ error: 'Failed to undo repost', code: 'UNDO_REPOST_ERROR' });
  }
});

// ── Likes ───────────────────────────────────────────────────────────────────
function resolvePostUuidParam(id) {
  const v = (id || '').trim();
  return v;
}

async function resolvePostUuidFromId(id) {
  const v = resolvePostUuidParam(id);
  if (/^\\d+$/.test(v)) {
    const rows = await query(`SELECT post_uuid FROM posts WHERE id = ? AND is_deleted = 0 LIMIT 1`, [v]);
    return rows.length ? rows[0].post_uuid : null;
  }
  const rows = await query(`SELECT post_uuid FROM posts WHERE post_uuid = ? AND is_deleted = 0 LIMIT 1`, [v]);
  return rows.length ? rows[0].post_uuid : null;
}

async function resolveAnyPostUuidFromId(id) {
  const v = resolvePostUuidParam(id);
  if (/^\\d+$/.test(v)) {
    const rows = await query(`SELECT post_uuid FROM posts WHERE id = ? LIMIT 1`, [v]);
    return rows.length ? rows[0].post_uuid : null;
  }
  const rows = await query(`SELECT post_uuid FROM posts WHERE post_uuid = ? LIMIT 1`, [v]);
  return rows.length ? rows[0].post_uuid : null;
}

app.post('/api/posts/:id/like', lazyAuthenticateToken, async (req, res) => {
  try {
    const userKey = req.user.publicKey;
    const postUuid = await resolvePostUuidFromId(req.params.id);
    if (!postUuid) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });

    // Prevent liking your own post? PRD doesn't require; allow for now.
    await query('BEGIN');
    try {
      // Duplicate protection via UNIQUE constraint
      const ins = await query(
        `INSERT OR IGNORE INTO post_likes (user_key, post_uuid) VALUES (?, ?)`,
        [userKey, postUuid]
      );
      if (!ins.changes) {
        await query('ROLLBACK');
        return res.status(409).json({ error: 'Already liked', code: 'ALREADY_LIKED' });
      }

      await query(`UPDATE posts SET likes_count = likes_count + 1 WHERE post_uuid = ?`, [postUuid]);
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    res.json({ status: 'liked' });
  } catch (error) {
    console.error('Like error:', error);
    res.status(500).json({ error: 'Failed to like post', code: 'LIKE_ERROR' });
  }
});

app.delete('/api/posts/:id/unlike', lazyAuthenticateToken, async (req, res) => {
  try {
    const userKey = req.user.publicKey;
    const postUuid = await resolvePostUuidFromId(req.params.id);
    if (!postUuid) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });

    await query('BEGIN');
    try {
      const del = await query(
        `DELETE FROM post_likes WHERE user_key = ? AND post_uuid = ?`,
        [userKey, postUuid]
      );
      if (!del.changes) {
        await query('ROLLBACK');
        return res.status(404).json({ error: 'Like not found', code: 'LIKE_NOT_FOUND' });
      }

      await query(`UPDATE posts SET likes_count = MAX(likes_count - 1, 0) WHERE post_uuid = ?`, [postUuid]);
      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    res.json({ status: 'unliked' });
  } catch (error) {
    console.error('Unlike error:', error);
    res.status(500).json({ error: 'Failed to unlike post', code: 'UNLIKE_ERROR' });
  }
});

app.get('/api/posts/:id/like-status', lazyOptionalAuth, async (req, res) => {
  try {
    const postUuid = await resolvePostUuidFromId(req.params.id);
    if (!postUuid) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });
    if (!req.user?.publicKey) return res.json({ liked: false });

    const rows = await query(
      `SELECT 1 as ok FROM post_likes WHERE user_key = ? AND post_uuid = ? LIMIT 1`,
      [req.user.publicKey, postUuid]
    );
    res.json({ liked: rows.length > 0 });
  } catch (error) {
    console.error('Like status error:', error);
    res.status(500).json({ error: 'Failed to get like status', code: 'LIKE_STATUS_ERROR' });
  }
});

// ── Replies list ────────────────────────────────────────────────────────────
app.get('/api/posts/:id/replies', lazyOptionalAuth, async (req, res) => {
  try {
    const postUuid = await resolvePostUuidFromId(req.params.id);
    if (!postUuid) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });

    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const offset = Math.max(((page - 1) * limit), 0);

    const replies = await query(
      `
        SELECT
          p.*,
          up.anon_id,
          up.display_name,
          up.avatar_style
        FROM posts p
        LEFT JOIN user_profiles up ON up.public_key = p.author_key
        WHERE p.parent_post_uuid = ? AND p.is_deleted = 0
        ORDER BY p.created_at ASC
        LIMIT ? OFFSET ?
      `,
      [postUuid, limit, offset]
    );

    res.json({
      replies,
      pagination: { page, limit, offset, hasMore: replies.length === limit }
    });
  } catch (error) {
    console.error('Replies error:', error);
    res.status(500).json({ error: 'Failed to load replies', code: 'REPLIES_ERROR' });
  }
});

// Thread (root + nested replies). Paginates the *top-level* replies, returns nested children for that window.
app.get('/api/posts/:id/thread', lazyOptionalAuth, async (req, res) => {
  try {
    const rootUuid = await resolveAnyPostUuidFromId(req.params.id);
    if (!rootUuid) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });

    const depthLimit = Math.min(Math.max(parseInt(req.query.depth) || 10, 1), 10);
    const limit = Math.min(Math.max(parseInt(req.query.limit) || 20, 1), 50);
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const rootRows = await query(
      `
        SELECT
          p.*,
          up.anon_id,
          up.display_name,
          up.avatar_style,
          op.post_uuid     AS original_post_uuid,
          op.author_key    AS original_author_key,
          op.content       AS original_content,
          op.created_at    AS original_created_at,
          oup.anon_id      AS original_anon_id,
          oup.display_name AS original_display_name,
          oup.avatar_style AS original_avatar_style
        FROM posts p
        LEFT JOIN user_profiles up ON up.public_key = p.author_key
        LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
        LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
        WHERE p.post_uuid = ?
        LIMIT 1
      `,
      [rootUuid]
    );

    if (!rootRows.length) return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });
    const root = rootRows[0];
    if (root.is_deleted) {
      root.content = '[Post deleted]';
    }

    // Top-level replies to root
    const topReplies = await query(
      `
        SELECT post_uuid
        FROM posts
        WHERE parent_post_uuid = ? AND is_deleted = 0
        ORDER BY created_at ASC
        LIMIT ? OFFSET ?
      `,
      [rootUuid, limit, offset]
    );
    const topUuids = topReplies.map(r => r.post_uuid);

    if (!topUuids.length) {
      return res.json({
        root,
        replies: [],
        pagination: { limit, offset, hasMore: false },
        depthLimit,
      });
    }

    const placeholders = topUuids.map(() => '?').join(', ');
    const rows = await query(
      `
        WITH RECURSIVE thread(post_uuid, parent_post_uuid, depth) AS (
          SELECT p.post_uuid, p.parent_post_uuid, 1
          FROM posts p
          WHERE p.post_uuid IN (${placeholders})

          UNION ALL

          SELECT c.post_uuid, c.parent_post_uuid, thread.depth + 1
          FROM posts c
          JOIN thread ON c.parent_post_uuid = thread.post_uuid
          WHERE c.is_deleted = 0 AND thread.depth < ?
        )
        SELECT
          p.*,
          up.anon_id,
          up.display_name,
          up.avatar_style,
          thread.depth,
          op.post_uuid     AS original_post_uuid,
          op.author_key    AS original_author_key,
          op.content       AS original_content,
          op.created_at    AS original_created_at,
          oup.anon_id      AS original_anon_id,
          oup.display_name AS original_display_name,
          oup.avatar_style AS original_avatar_style
        FROM thread
        JOIN posts p ON p.post_uuid = thread.post_uuid
        LEFT JOIN user_profiles up ON up.public_key = p.author_key
        LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
        LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
        ORDER BY thread.depth ASC, p.created_at ASC
      `,
      [...topUuids, depthLimit]
    );

    const nodeByUuid = new Map();
    for (const r of rows) {
      nodeByUuid.set(r.post_uuid, { post: r, replies: [] });
    }

    // Attach children
    for (const r of rows) {
      const parentUuid = r.parent_post_uuid;
      if (!parentUuid) continue;
      const parentNode = nodeByUuid.get(parentUuid);
      const childNode = nodeByUuid.get(r.post_uuid);
      if (parentNode && childNode) parentNode.replies.push(childNode);
    }

    const threadReplies = topUuids.map(u => nodeByUuid.get(u)).filter(Boolean);
    const hasMore = topReplies.length === limit;

    res.json({
      root,
      replies: threadReplies,
      pagination: { limit, offset, hasMore },
      depthLimit,
    });
  } catch (error) {
    console.error('Thread error:', error);
    res.status(500).json({ error: 'Failed to load thread', code: 'THREAD_ERROR' });
  }
});

app.put('/api/posts/:id',
  editLimiter,
  createValidationMiddleware(inputValidator),
  lazyAuthenticateToken,
  async (req, res) => {
    try {
      const { id } = req.params;
      const validation = postGraphService.validateContent(req.sanitizedContent);
      if (!validation.ok) {
        return res.status(400).json({ error: validation.error, code: validation.code });
      }
      const content = validation.content;
      const publicKey = req.user.publicKey;

      // Get existing post
      const posts = await query('SELECT * FROM posts WHERE id = ? AND is_deleted = 0', [id]);
      if (posts.length === 0) {
        return res.status(404).json({
          error: 'Post not found',
          code: 'POST_NOT_FOUND'
        });
      }

      const post = posts[0];
      if (post.author_key !== publicKey) {
        return res.status(403).json({
          error: 'Not authorized to edit this post',
          code: 'UNAUTHORIZED'
        });
      }

      if (!ServerCrypto.verifySignature(content, req.body.signature, publicKey, req.body.recovery)) {
        return res.status(401).json({
          error: 'Invalid signature',
          code: 'INVALID_SIGNATURE'
        });
      }

      // Get version count
      const versionResult = await query(`
        SELECT COUNT(*) as count FROM post_versions WHERE post_id = ?
      `, [id]);
      const versionNumber = versionResult[0].count + 1;

      // Start transaction
      await query('BEGIN');

      try {
        // Preserve the CURRENT (pre-edit) content as a versioned snapshot first
        // This ensures the original content is always accessible in version history
        await query(`
          INSERT INTO post_versions (post_id, version_number, content, signature, recovery) 
          VALUES (?, ?, ?, ?, ?)
        `, [id, versionNumber, post.content, post.signature, post.recovery]);

        // Update post
        await query(`
          UPDATE posts SET content = ?, signature = ?, recovery = ?, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `, [content, req.body.signature, req.body.recovery, id]);

        await query('COMMIT');
      } catch (error) {
        await query('ROLLBACK');
        throw error;
      }

      // Get updated post
      const updatedPost = (await query(`
        SELECT
          p.*,
          up.anon_id,
          up.display_name,
          up.avatar_style,
          op.post_uuid     AS original_post_uuid,
          op.author_key    AS original_author_key,
          op.content       AS original_content,
          op.created_at    AS original_created_at,
          oup.anon_id      AS original_anon_id,
          oup.display_name AS original_display_name,
          oup.avatar_style AS original_avatar_style
        FROM posts p
        LEFT JOIN user_profiles up ON up.public_key = p.author_key
        LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
        LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
        WHERE p.id = ?
      `, [id]))[0];

      // Broadcast update to all connected clients
      wsManager.broadcast({
        type: 'post_updated',
        data: updatedPost
      }, false);

      res.json(updatedPost);

    } catch (error) {
      console.error('Error updating post:', error);
      res.status(500).json({
        error: 'Internal server error',
        code: 'POST_UPDATE_ERROR'
      });
    }
  }
);

// ── Delete post (soft delete) ───────────────────────────────────────────────
app.delete('/api/posts/:id', lazyAuthenticateToken, async (req, res) => {
  try {
    const id = (req.params.id || '').trim();
    const ownerKey = req.user.publicKey;

    const byNumericId = /^\d+$/.test(id);
    const rows = byNumericId
      ? await query(`SELECT * FROM posts WHERE id = ? LIMIT 1`, [id])
      : await query(`SELECT * FROM posts WHERE post_uuid = ? LIMIT 1`, [id]);

    if (!rows.length || rows[0].is_deleted) {
      return res.status(404).json({ error: 'Post not found', code: 'POST_NOT_FOUND' });
    }

    const post = rows[0];
    if (post.author_key !== ownerKey) {
      return res.status(403).json({ error: 'Not authorized', code: 'UNAUTHORIZED' });
    }

    await query('BEGIN');
    try {
      await query(
        `UPDATE posts SET is_deleted = 1, deleted_at = CURRENT_TIMESTAMP WHERE post_uuid = ?`,
        [post.post_uuid]
      );

      // Update counters on parent/original as needed
      if (post.post_type === 'reply' && post.parent_post_uuid) {
        await query(
          `UPDATE posts SET replies_count = MAX(replies_count - 1, 0) WHERE post_uuid = ?`,
          [post.parent_post_uuid]
        );
      }
      if (post.post_type === 'repost' && post.repost_of_uuid) {
        await query(
          `UPDATE posts SET reposts_count = MAX(reposts_count - 1, 0) WHERE post_uuid = ?`,
          [post.repost_of_uuid]
        );
      }

      await query('COMMIT');
    } catch (err) {
      await query('ROLLBACK');
      throw err;
    }

    await postGraphService.deleteMetadata(post.post_uuid);

    res.json({ success: true, status: 'success', message: 'Post deleted' });
  } catch (error) {
    console.error('Error deleting post:', error);
    res.status(500).json({ error: 'Internal server error', code: 'POST_DELETE_ERROR' });
  }
});

app.get('/api/posts', lazyOptionalAuth, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 100, 1000); // Max 1000 for performance
    const offset = Math.max(parseInt(req.query.offset) || 0, 0);

    const viewerKey = req.user?.publicKey || null;

    const posts = viewerKey
      ? await query(
        `
          SELECT
            p.*,
            up.anon_id,
            up.display_name,
            up.avatar_style,
            op.post_uuid     AS original_post_uuid,
            op.author_key    AS original_author_key,
            op.content       AS original_content,
            op.created_at    AS original_created_at,
            oup.anon_id      AS original_anon_id,
            oup.display_name AS original_display_name,
            oup.avatar_style AS original_avatar_style,
            EXISTS (
              SELECT 1 FROM posts rp
              WHERE rp.author_key = ? AND rp.post_type = 'repost' AND rp.repost_of_uuid = p.post_uuid AND rp.is_deleted = 0
              LIMIT 1
            ) AS viewer_reposted,
            EXISTS (
              SELECT 1 FROM post_likes pl
              WHERE pl.user_key = ? AND pl.post_uuid = p.post_uuid
              LIMIT 1
            ) AS viewer_liked
          FROM posts p
          LEFT JOIN user_profiles up ON up.public_key = p.author_key
          LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
          LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
          WHERE p.is_deleted = 0
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `,
        [viewerKey, viewerKey, limit, offset]
      )
      : await query(
        `
          SELECT
            p.*,
            up.anon_id,
            up.display_name,
            up.avatar_style,
            op.post_uuid     AS original_post_uuid,
            op.author_key    AS original_author_key,
            op.content       AS original_content,
            op.created_at    AS original_created_at,
            oup.anon_id      AS original_anon_id,
            oup.display_name AS original_display_name,
            oup.avatar_style AS original_avatar_style,
            0 AS viewer_reposted,
            0 AS viewer_liked
          FROM posts p
          LEFT JOIN user_profiles up ON up.public_key = p.author_key
          LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
          LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
          WHERE p.is_deleted = 0
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `,
        [limit, offset]
      );

    res.json({
      posts,
      pagination: {
        limit,
        offset,
        hasMore: posts.length === limit
      }
    });

  } catch (error) {
    console.error('Error fetching posts:', error);
    res.status(500).json({
      error: 'Internal server error',
      code: 'FETCH_POSTS_ERROR'
    });
  }
});

app.get('/api/posts/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const posts = await query(
      `
        SELECT
          p.*,
          up.anon_id,
          up.display_name,
          up.avatar_style,
          op.post_uuid     AS original_post_uuid,
          op.author_key    AS original_author_key,
          op.content       AS original_content,
          op.created_at    AS original_created_at,
          oup.anon_id      AS original_anon_id,
          oup.display_name AS original_display_name,
          oup.avatar_style AS original_avatar_style
        FROM posts p
        LEFT JOIN user_profiles up ON up.public_key = p.author_key
        LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
        LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
        WHERE p.id = ? AND p.is_deleted = 0
        LIMIT 1
      `,
      [id]
    );

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
      SELECT
        p.*,
        up.anon_id,
        up.display_name,
        up.avatar_style,
        op.post_uuid     AS original_post_uuid,
        op.author_key    AS original_author_key,
        op.content       AS original_content,
        op.created_at    AS original_created_at,
        oup.anon_id      AS original_anon_id,
        oup.display_name AS original_display_name,
        oup.avatar_style AS original_avatar_style
      FROM posts p
      LEFT JOIN user_profiles up ON up.public_key = p.author_key
      LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
      LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
      WHERE p.author_key = ? AND p.is_deleted = 0
      ORDER BY p.created_at DESC
      LIMIT ?
    `, [publicKey, limit]);

    res.json(posts);

  } catch (error) {
    console.error('Error fetching author posts:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Feed API Routes
app.get('/api/feed', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await feedController.getFeed(req, res);
  } catch (error) {
    console.error('Feed error:', error);
  }
});

// PRD MVP: chronological following feed (requires auth)
app.get('/api/feed/following', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await feedController.getFollowingFeed(req, res);
  } catch (error) {
    console.error('Following feed error:', error);
  }
});

app.get('/api/feed/advanced', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await feedController.getAdvancedFeed(req, res);
  } catch (error) {
    console.error('Advanced feed error:', error);
  }
});

app.get('/api/search', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await feedController.searchPosts(req, res);
  } catch (error) {
    console.error('Search error:', error);
  }
});

app.get('/api/trending', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await feedController.getTrendingTopics(req, res);
  } catch (error) {
    console.error('Trending error:', error);
  }
});

app.get('/api/feed/author/:authorKey', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await feedController.getAuthorFeed(req, res);
  } catch (error) {
    console.error('Author feed error:', error);
  }
});

app.get('/api/stats/feed', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await feedController.getFeedStats(req, res);
  } catch (error) {
    console.error('Feed stats error:', error);
  }
});

app.get('/api/analytics', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await feedController.getAnalytics(req, res);
  } catch (error) {
    console.error('Analytics error:', error);
  }
});

app.post('/api/preferences', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await feedController.updateUserPreferences(req, res);
  } catch (error) {
    console.error('Preferences update error:', error);
  }
});

app.get('/api/preferences', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await feedController.getUserPreferences(req, res);
  } catch (error) {
    console.error('Preferences get error:', error);
  }
});

app.post('/api/interaction', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await feedController.recordInteraction(req, res);
  } catch (error) {
    console.error('Interaction recording error:', error);
  }
});

// User Safety API Routes
app.post('/api/safety/block', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.blockUser(req, res);
  } catch (error) {
    console.error('Block user error:', error);
  }
});

app.delete('/api/safety/block/:blockedKey', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.unblockUser(req, res);
  } catch (error) {
    console.error('Unblock user error:', error);
  }
});

app.post('/api/safety/mute', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.muteUser(req, res);
  } catch (error) {
    console.error('Mute user error:', error);
  }
});

app.delete('/api/safety/mute/:mutedKey', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.unmuteUser(req, res);
  } catch (error) {
    console.error('Unmute user error:', error);
  }
});

app.post('/api/safety/filter', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.addContentFilter(req, res);
  } catch (error) {
    console.error('Add filter error:', error);
  }
});

app.delete('/api/safety/filter', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.removeContentFilter(req, res);
  } catch (error) {
    console.error('Remove filter error:', error);
  }
});

app.get('/api/safety/blocked', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.getBlockedUsers(req, res);
  } catch (error) {
    console.error('Get blocked users error:', error);
  }
});

app.get('/api/safety/muted', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.getMutedUsers(req, res);
  } catch (error) {
    console.error('Get muted users error:', error);
  }
});

app.get('/api/safety/filters', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.getContentFilters(req, res);
  } catch (error) {
    console.error('Get content filters error:', error);
  }
});

app.put('/api/safety/preferences', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.updateSafetyPreferences(req, res);
  } catch (error) {
    console.error('Update safety preferences error:', error);
  }
});

app.get('/api/safety/preferences', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.getSafetyPreferences(req, res);
  } catch (error) {
    console.error('Get safety preferences error:', error);
  }
});

app.post('/api/safety/filter-content', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.filterContentForUser(req, res);
  } catch (error) {
    console.error('Filter content error:', error);
  }
});

app.get('/api/safety/check-block', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.checkBlockStatus(req, res);
  } catch (error) {
    console.error('Check block status error:', error);
  }
});

app.get('/api/safety/summary', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await safetyController.getSafetySummary(req, res);
  } catch (error) {
    console.error('Get safety summary error:', error);
  }
});

// Community Moderation API Routes
app.post('/api/moderation/vote', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.voteOnPost(req, res);
  } catch (error) {
    console.error('Vote on post error:', error);
  }
});

app.post('/api/moderation/report', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.reportContent(req, res);
  } catch (error) {
    console.error('Report content error:', error);
  }
});

app.get('/api/moderation/posts/:postId/votes', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await moderationController.getPostVotes(req, res);
  } catch (error) {
    console.error('Get post votes error:', error);
  }
});

app.get('/api/moderation/queue', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.getModerationQueue(req, res);
  } catch (error) {
    console.error('Get moderation queue error:', error);
  }
});

app.get('/api/moderation/reputation/:userKey', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.getUserReputation(req, res);
  } catch (error) {
    console.error('Get user reputation error:', error);
  }
});

app.get('/api/moderation/reputation', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.getCurrentUserReputation(req, res);
  } catch (error) {
    console.error('Get current user reputation error:', error);
  }
});

app.get('/api/moderation/stats', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.getModerationStats(req, res);
  } catch (error) {
    console.error('Get moderation stats error:', error);
  }
});

app.get('/api/moderation/contributors', lazyOptionalAuth, async (req, res) => {
  try {
    const result = await moderationController.getTopContributors(req, res);
  } catch (error) {
    console.error('Get top contributors error:', error);
  }
});

app.post('/api/moderation/queue/:queueId/process', lazyAuthenticateToken, async (req, res) => {
  try {
    const result = await moderationController.processQueueItem(req, res);
  } catch (error) {
    console.error('Process queue item error:', error);
  }
});

// ── Wallet API Routes ──────────────────────────────────────────────────────

// GET own wallet (balance + metadata)
app.get('/api/wallet', lazyAuthenticateToken, async (req, res) => {
  try {
    await walletController.getWallet(req, res);
  } catch (error) {
    console.error('Get wallet error:', error);
  }
});

// GET anyone's public balance (no auth)
app.get('/api/wallet/balance/:publicKey', async (req, res) => {
  try {
    await walletController.getPublicBalance(req, res);
  } catch (error) {
    console.error('Get public balance error:', error);
  }
});

// GET faucet cooldown status
app.get('/api/wallet/faucet/status', lazyAuthenticateToken, async (req, res) => {
  try {
    await walletController.getFaucetStatus(req, res);
  } catch (error) {
    console.error('Get faucet status error:', error);
  }
});

// POST claim faucet (rate-limited + auth)
app.post('/api/wallet/faucet', lazyAuthenticateToken, async (req, res) => {
  try {
    await walletController.claimFaucet(req, res);
  } catch (error) {
    console.error('Claim faucet error:', error);
  }
});

// POST send UBT to another address
app.post('/api/wallet/transfer', lazyAuthenticateToken, async (req, res) => {
  try {
    await walletController.transfer(req, res);
  } catch (error) {
    console.error('Transfer error:', error);
  }
});

// GET own transaction history (paginated)
app.get('/api/wallet/transactions', lazyAuthenticateToken, async (req, res) => {
  try {
    await walletController.getTransactionHistory(req, res);
  } catch (error) {
    console.error('Get transaction history error:', error);
  }
});

// GET single transaction by UUID (public)
app.get('/api/wallet/transactions/:txUuid', async (req, res) => {
  try {
    await walletController.getTransaction(req, res);
  } catch (error) {
    console.error('Get transaction error:', error);
  }
});

// ──────────────────────────────────────────────────────────────────────────

app.get('/api/health', async (req, res) => {
  try {
    // Database health check
    await query('SELECT 1');

    // Security component health checks
    const jwtSecretsValid = jwtManager.accessTokenSecret && jwtManager.refreshTokenSecret;
    const validatorReady = !!inputValidator;
    const feedControllerReady = !!feedController;
    const wsStats = wsManager.getStats();

    res.json({
      status: 'ok',
      timestamp: new Date().toISOString(),
      environment: config.nodeEnv,
      features: {
        jwtConfigured: jwtSecretsValid,
        inputValidatorReady: validatorReady,
        feedControllerReady: feedControllerReady,
        safetyControllerReady: !!safetyController,
        moderationControllerReady: !!moderationController,
        walletControllerReady: !!walletController,
        rateLimitingEnabled: true,
        advancedFeedEnabled: true,
        userSafetyEnabled: true,
        communityModerationEnabled: true
      },
      websocket: {
        connections: wsStats.totalConnections,
        authenticated: wsStats.authenticatedClients,
        uptime: wsStats.uptime
      },
      database: {
        type: config.database.type,
        connected: true
      },
      version: process.env.npm_package_version || '0.1.2'
    });
  } catch (error) {
    console.error('Health check failed:', error);
    res.status(503).json({
      status: 'error',
      timestamp: new Date().toISOString(),
      error: 'Service unavailable',
      code: 'HEALTH_CHECK_FAILED'
    });
  }
});

// Initialize the application
initializeApp();

module.exports = app;
