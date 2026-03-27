const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const config = require('./config/environment');

class Database {
  constructor() {
    this.db = null;
  }

  async initializeDatabase() {
    return new Promise((resolve, reject) => {
      const dbPath = config.database.path || path.join(__dirname, 'unbound.db');
      this.db = new sqlite3.Database(dbPath, (err) => {
        if (err) {
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          this.init().then(resolve).catch(reject);
        }
      });
    });
  }

  async getConnection() {
    if (!this.db) {
      await this.initializeDatabase();
    }
    return this.db;
  }

  async close() {
    return new Promise((resolve) => {
      if (this.db) {
        this.db.close((err) => {
          if (err) {
            console.error('Error closing database:', err);
          } else {
            console.log('SQLite database closed');
          }
          resolve();
        });
      } else {
        resolve();
      }
    });
  }

  async query(sql, params = []) {
    // Enhanced security validation
    if (typeof sql !== 'string') {
      throw new Error('SQL query must be a string');
    }

    // Validate parameterized queries
    if (!Array.isArray(params)) {
      throw new Error('Query parameters must be an array');
    }

    // Check for potential SQL injection patterns - only flag if no placeholders AND dangerous combination
    const dangerousPatterns = [
      /union\s+select/i,
      /exec\s*\(/i,
      /xp_cmdshell/i,
      /sp_executesql/i
    ];

    for (const pattern of dangerousPatterns) {
      if (pattern.test(sql)) {
        console.warn('Suspicious SQL pattern detected:', sql);
        throw new Error('Potentially dangerous SQL query detected');
      }
    }

    // Validate parameter count matches placeholders
    const placeholders = (sql.match(/\?/g) || []).length;
    if (placeholders !== params.length) {
      throw new Error(`Parameter count mismatch: ${placeholders} placeholders, ${params.length} parameters provided`);
    }

    const trimmedSql = sql.trim().toUpperCase();

    // Transaction control statements (BEGIN, COMMIT, ROLLBACK) - use run()
    if (/^(BEGIN|COMMIT|ROLLBACK)(\s|$)/i.test(trimmedSql)) {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) {
            console.error('Database transaction error:', { sql: sql.trim(), error: err.message });
            reject(new Error('Database operation failed'));
          } else {
            resolve([]);
          }
        });
      });
    }

    // DML statements (INSERT, UPDATE, DELETE) - use run() and return metadata
    if (/^(INSERT|UPDATE|DELETE|CREATE|DROP|ALTER)/i.test(trimmedSql)) {
      return new Promise((resolve, reject) => {
        this.db.run(sql, params, function(err) {
          if (err) {
            console.error('Database query error:', {
              sql: sql.replace(/\s+/g, ' ').trim(),
              error: err.message
            });
            reject(new Error('Database operation failed'));
          } else {
            // Return an array with metadata so callers can access lastID and changes
            const result = [];
            result.id = this.lastID;
            result.changes = this.changes;
            resolve(result);
          }
        });
      });
    }

    // SELECT and other read statements - use all()
    return new Promise((resolve, reject) => {
      this.db.all(sql, params, (err, rows) => {
        if (err) {
          // Log error without exposing internal details
          console.error('Database query error:', {
            sql: sql.replace(/\s+/g, ' ').trim(),
            error: err.message
          });
          reject(new Error('Database operation failed'));
        } else {
          resolve(rows);
        }
      });
    });
  }

  init() {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.run(`
          CREATE TABLE IF NOT EXISTS identities (
            public_key TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_uuid TEXT UNIQUE NOT NULL,
            author_key TEXT NOT NULL,
            content TEXT NOT NULL,
            signature TEXT NOT NULL,
            recovery INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_key) REFERENCES identities (public_key)
          )
        `);

        this.db.run(`
          CREATE TABLE IF NOT EXISTS post_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            version_number INTEGER NOT NULL,
            content TEXT NOT NULL,
            signature TEXT NOT NULL,
            recovery INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id)
          )
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_posts_author_key ON posts (author_key)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_posts_uuid ON posts (post_uuid)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_post_versions_post_id ON post_versions (post_id)
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_post_versions_created_at ON post_versions (created_at DESC)
        `);

        // ── Wallet tables ─────────────────────────────────────────────────────
        this.db.run(`
          CREATE TABLE IF NOT EXISTS wallets (
            public_key   TEXT PRIMARY KEY,
            balance      INTEGER NOT NULL DEFAULT 0,
            created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (public_key) REFERENCES identities (public_key)
          )
        `);

        // All balance-changing events: transfers, faucet claims, tips, etc.
        // amounts are stored in the smallest unit (1 UBT = 1 unit)
        // type: 'transfer' | 'faucet' | 'tip'
        // status: 'pending' | 'confirmed' | 'failed'
        this.db.run(`
          CREATE TABLE IF NOT EXISTS transactions (
            id              INTEGER PRIMARY KEY AUTOINCREMENT,
            tx_uuid         TEXT UNIQUE NOT NULL,
            sender_key      TEXT,
            recipient_key   TEXT NOT NULL,
            amount          INTEGER NOT NULL,
            type            TEXT NOT NULL DEFAULT 'transfer',
            memo            TEXT,
            signature       TEXT NOT NULL,
            status          TEXT NOT NULL DEFAULT 'confirmed',
            created_at      DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (recipient_key) REFERENCES identities (public_key)
          )
        `);

        // Prevent repeated faucet claims: one per public_key per 24 hours
        this.db.run(`
          CREATE TABLE IF NOT EXISTS faucet_claims (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            public_key  TEXT NOT NULL,
            amount      INTEGER NOT NULL,
            claimed_at  DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_transactions_sender
          ON transactions (sender_key)
        `);
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_transactions_recipient
          ON transactions (recipient_key)
        `);
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_transactions_created_at
          ON transactions (created_at DESC)
        `);
        this.db.run(`
          CREATE INDEX IF NOT EXISTS idx_faucet_claims_key
          ON faucet_claims (public_key, claimed_at)
        `);
        // ─────────────────────────────────────────────────────────────────────

        console.log('SQLite tables initialized successfully');
        resolve();
      });
    });
  }

  createIdentity(publicKey) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT OR IGNORE INTO identities (public_key) VALUES (?)',
        [publicKey],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  createPost(postUuid, authorKey, content, signature, recovery) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO posts (post_uuid, author_key, content, signature, recovery) VALUES (?, ?, ?, ?, ?)',
        [postUuid, authorKey, content, signature, recovery],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  getPosts(limit = 50, offset = 0) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM posts ORDER BY created_at DESC LIMIT ? OFFSET ?',
        [limit, offset],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  getPostByUuid(uuid) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM posts WHERE post_uuid = ?',
        [uuid],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getPostsByAuthor(authorKey, limit = 50) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM posts WHERE author_key = ? ORDER BY created_at DESC LIMIT ?',
        [authorKey, limit],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        }
      );
    });
  }

  updateLastSeen(publicKey) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'UPDATE identities SET last_seen = CURRENT_TIMESTAMP WHERE public_key = ?',
        [publicKey],
        function(err) {
          if (err) reject(err);
          else resolve(this.changes);
        }
      );
    });
  }
}

module.exports = new Database();