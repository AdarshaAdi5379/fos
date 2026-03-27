const LINK_BLOCK_RE = /\bhttps?:\/\/|\bwww\./i;
const MENTION_RE = /@(\w{3,24})/g;
const HASHTAG_RE = /#(\w{1,32})/g;

function normalizeTag(tag) {
  return (tag || '').toLowerCase();
}

class PostGraphService {
  constructor(db) {
    this.db = db; // expects Database with .query()
  }

  async initializeTables() {
    // Ensure columns exist on posts table (SQLite-friendly: check PRAGMA first)
    const cols = await this.db.query(`PRAGMA table_info(posts)`);
    const names = new Set(cols.map(c => c.name));

    const ensureColumn = async (name, ddl) => {
      if (names.has(name)) return;
      await this.db.query(`ALTER TABLE posts ADD COLUMN ${ddl}`);
    };

    await ensureColumn('post_type', `post_type TEXT NOT NULL DEFAULT 'post'`);
    await ensureColumn('parent_post_uuid', `parent_post_uuid TEXT NULL`);
    await ensureColumn('repost_of_uuid', `repost_of_uuid TEXT NULL`);
    await ensureColumn('likes_count', `likes_count INTEGER NOT NULL DEFAULT 0`);
    await ensureColumn('replies_count', `replies_count INTEGER NOT NULL DEFAULT 0`);
    await ensureColumn('reposts_count', `reposts_count INTEGER NOT NULL DEFAULT 0`);
    await ensureColumn('is_deleted', `is_deleted INTEGER NOT NULL DEFAULT 0`);
    await ensureColumn('deleted_at', `deleted_at DATETIME NULL`);

    // Mentions + hashtags
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS post_mentions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_uuid TEXT NOT NULL,
        mentioned_key TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_uuid, mentioned_key)
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS post_hashtags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_uuid TEXT NOT NULL,
        tag TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_uuid, tag)
      )
    `);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_post_mentions_post ON post_mentions (post_uuid)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_post_mentions_user ON post_mentions (mentioned_key)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_post_hashtags_post ON post_hashtags (post_uuid)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_post_hashtags_tag ON post_hashtags (tag)`);

    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_posts_parent_uuid ON posts (parent_post_uuid)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_posts_repost_uuid ON posts (repost_of_uuid)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_posts_deleted ON posts (is_deleted, created_at DESC)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_posts_type ON posts (post_type)`);

    // Enforce "one active repost per user per original" (SQLite partial unique index)
    await this.db.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS uq_posts_active_repost
      ON posts (author_key, repost_of_uuid)
      WHERE post_type = 'repost' AND is_deleted = 0
    `);

    // Likes (1 like per user per post)
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS post_likes (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        user_key TEXT NOT NULL,
        post_uuid TEXT NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (user_key, post_uuid)
      )
    `);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_post_likes_post ON post_likes (post_uuid)`);
    await this.db.query(`CREATE INDEX IF NOT EXISTS idx_post_likes_user ON post_likes (user_key)`);
  }

  validateContent(content) {
    const c = (content || '').trim();
    if (!c) return { ok: false, code: 'EMPTY_CONTENT', error: 'Content cannot be empty' };
    if (c.length > 500) return { ok: false, code: 'CONTENT_TOO_LONG', error: 'Content must be 500 characters or less' };
    if (LINK_BLOCK_RE.test(c)) return { ok: false, code: 'LINKS_NOT_ALLOWED', error: 'External links are not allowed' };
    return { ok: true, content: c };
  }

  extractMentions(content) {
    const out = new Set();
    for (const m of content.matchAll(MENTION_RE)) {
      if (m[1]) out.add(m[1]);
      if (out.size >= 10) break;
    }
    return [...out];
  }

  extractHashtags(content) {
    const out = new Set();
    for (const m of content.matchAll(HASHTAG_RE)) {
      const tag = normalizeTag(m[1]);
      if (tag) out.add(tag);
      if (out.size >= 10) break;
    }
    return [...out];
  }

  async storeMentions(postUuid, displayNames) {
    if (!displayNames?.length) return { stored: 0 };

    // Map display_name -> public_key (ignore unknown)
    const keys = [];
    for (const dn of displayNames.slice(0, 10)) {
      const rows = await this.db.query(
        `SELECT public_key FROM user_profiles WHERE display_name = ? LIMIT 1`,
        [dn]
      );
      if (rows.length) keys.push(rows[0].public_key);
    }

    for (const k of keys) {
      await this.db.query(
        `INSERT OR IGNORE INTO post_mentions (post_uuid, mentioned_key) VALUES (?, ?)`,
        [postUuid, k]
      );
    }

    return { stored: keys.length };
  }

  async storeHashtags(postUuid, tags) {
    if (!tags?.length) return { stored: 0 };
    for (const t of tags.slice(0, 10)) {
      await this.db.query(
        `INSERT OR IGNORE INTO post_hashtags (post_uuid, tag) VALUES (?, ?)`,
        [postUuid, t]
      );
    }
    return { stored: Math.min(tags.length, 10) };
  }

  async deleteMetadata(postUuid) {
    await this.db.query(`DELETE FROM post_mentions WHERE post_uuid = ?`, [postUuid]);
    await this.db.query(`DELETE FROM post_hashtags WHERE post_uuid = ?`, [postUuid]);
  }
}

module.exports = {
  PostGraphService,
};
