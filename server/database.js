const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class Database {
  constructor() {
    this.db = new sqlite3.Database(path.join(__dirname, 'unbound.db'));
    this.init();
  }

  init() {
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

  createPostVersion(postId, versionNumber, content, signature, recovery) {
    return new Promise((resolve, reject) => {
      this.db.run(
        'INSERT INTO post_versions (post_id, version_number, content, signature, recovery) VALUES (?, ?, ?, ?, ?)',
        [postId, versionNumber, content, signature, recovery],
        function(err) {
          if (err) reject(err);
          else resolve(this.lastID);
        }
      );
    });
  }

  updatePost(postId, content, signature, recovery) {
    return new Promise((resolve, reject) => {
      this.db.serialize(() => {
        this.db.get(
          'SELECT COUNT(*) as count FROM post_versions WHERE post_id = ?',
          [postId],
          (err, row) => {
            if (err) {
              reject(err);
              return;
            }

            const versionNumber = row.count + 1;

            this.db.run(
              'INSERT INTO post_versions (post_id, version_number, content, signature, recovery) VALUES (?, ?, ?, ?, ?)',
              [postId, versionNumber, content, signature, recovery],
              (err) => {
                if (err) {
                  reject(err);
                  return;
                }

                this.db.run(
                  'UPDATE posts SET content = ?, signature = ?, recovery = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
                  [content, signature, recovery, postId],
                  (err) => {
                    if (err) reject(err);
                    else resolve(versionNumber);
                  }
                );
              }
            );
          }
        );
      });
    });
  }

  getAllPosts(limit = 100, offset = 0) {
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

  getPostById(postId) {
    return new Promise((resolve, reject) => {
      this.db.get(
        'SELECT * FROM posts WHERE id = ?',
        [postId],
        (err, row) => {
          if (err) reject(err);
          else resolve(row);
        }
      );
    });
  }

  getPostVersions(postId) {
    return new Promise((resolve, reject) => {
      this.db.all(
        'SELECT * FROM post_versions WHERE post_id = ? ORDER BY version_number ASC',
        [postId],
        (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
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

  close() {
    this.db.close();
  }
}

module.exports = Database;