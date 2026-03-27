const crypto = require('crypto');

const ALLOWED_AVATAR_STYLES = [
  'robot_blue',
  'fox_gray',
  'alien_green',
  'ninja_black',
  'pixel_pink',
  'abstract_cyan'
];

function normalizeDisplayName(value) {
  return (value || '').trim();
}

function isValidDisplayName(value) {
  // Keep it non-identifying and easy to moderate: alphanumerics + underscore only.
  // 3-24 chars gives enough space while discouraging long/PII-ish strings.
  return /^[a-zA-Z0-9_]{3,24}$/.test(value);
}

function normalizeBio(value) {
  return (value || '').replace(/\s+/g, ' ').trim();
}

function bioHasUrlOrEmail(bio) {
  const s = (bio || '').toLowerCase();
  if (!s) return false;
  // Simple conservative checks; avoid clickable info-leaks.
  const urlLike = /\bhttps?:\/\/|\bwww\./i.test(s);
  const emailLike = /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/i.test(s);
  return urlLike || emailLike;
}

class ProfileService {
  constructor(db) {
    this.db = db; // expects Database instance with .query()
  }

  async initializeTables() {
    await this.db.query(`
      CREATE TABLE IF NOT EXISTS user_profiles (
        public_key   TEXT PRIMARY KEY,
        anon_id      TEXT UNIQUE NOT NULL,
        display_name TEXT UNIQUE NOT NULL,
        avatar_style TEXT NOT NULL DEFAULT 'robot_blue',
        bio          TEXT NOT NULL DEFAULT '',
        theme_color  TEXT NOT NULL DEFAULT '#00ff88',
        is_private   INTEGER NOT NULL DEFAULT 0,
        created_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at   DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (public_key) REFERENCES identities (public_key)
      )
    `);

    await this.db.query(`
      CREATE TABLE IF NOT EXISTS user_follows (
        id            INTEGER PRIMARY KEY AUTOINCREMENT,
        follower_key  TEXT NOT NULL,
        following_key TEXT NOT NULL,
        created_at    DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (follower_key, following_key)
      )
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_follows_follower
      ON user_follows (follower_key)
    `);

    await this.db.query(`
      CREATE INDEX IF NOT EXISTS idx_user_follows_following
      ON user_follows (following_key)
    `);
  }

  async generateAnonId() {
    for (let attempt = 0; attempt < 12; attempt++) {
      const n = crypto.randomInt(100000, 999999);
      const anonId = `user_${n}`;
      const existing = await this.db.query(
        'SELECT anon_id FROM user_profiles WHERE anon_id = ? LIMIT 1',
        [anonId]
      );
      if (existing.length === 0) return anonId;
    }

    // Fallback: still anonymous, but virtually collision-free.
    return `user_${crypto.randomUUID().replace(/-/g, '').slice(0, 12)}`;
  }

  validateProfileInput({ displayName, avatarStyle, bio, themeColor }, { requireDisplayName }) {
    const normalizedDisplayName = normalizeDisplayName(displayName);
    const normalizedBio = normalizeBio(bio);

    if (requireDisplayName && !normalizedDisplayName) {
      return { ok: false, code: 'MISSING_DISPLAY_NAME', error: 'Display name is required' };
    }

    if (normalizedDisplayName && !isValidDisplayName(normalizedDisplayName)) {
      return {
        ok: false,
        code: 'INVALID_DISPLAY_NAME',
        error: 'Display name must be 3-24 characters and only include letters, numbers, and underscores'
      };
    }

    if (avatarStyle && !ALLOWED_AVATAR_STYLES.includes(avatarStyle)) {
      return {
        ok: false,
        code: 'INVALID_AVATAR_STYLE',
        error: 'Invalid avatar style',
        allowed: ALLOWED_AVATAR_STYLES
      };
    }

    if (normalizedBio.length > 160) {
      return { ok: false, code: 'BIO_TOO_LONG', error: 'Bio must be 160 characters or less' };
    }

    if (bioHasUrlOrEmail(normalizedBio)) {
      return { ok: false, code: 'BIO_CONTAINS_URL_OR_EMAIL', error: 'Bio cannot contain URLs or email addresses' };
    }

    if (themeColor && typeof themeColor === 'string') {
      const c = themeColor.trim();
      if (!/^#[0-9a-fA-F]{6}$/.test(c)) {
        return { ok: false, code: 'INVALID_THEME_COLOR', error: 'Theme color must be a hex value like #00ff88' };
      }
    }

    return {
      ok: true,
      data: {
        displayName: normalizedDisplayName || null,
        avatarStyle: avatarStyle || null,
        bio: normalizedBio,
        themeColor: themeColor ? themeColor.trim() : null
      }
    };
  }

  async ensureIdentity(publicKey) {
    await this.db.query('INSERT OR IGNORE INTO identities (public_key) VALUES (?)', [publicKey]);
    await this.db.query('UPDATE identities SET last_seen = CURRENT_TIMESTAMP WHERE public_key = ?', [publicKey]);
  }

  async createProfile(publicKey, input) {
    await this.ensureIdentity(publicKey);

    const existing = await this.db.query('SELECT public_key FROM user_profiles WHERE public_key = ? LIMIT 1', [publicKey]);
    if (existing.length > 0) {
      throw Object.assign(new Error('Profile already exists'), { code: 'PROFILE_EXISTS', status: 409 });
    }

    const anonId = await this.generateAnonId();
    const avatarStyle = input.avatarStyle || 'robot_blue';
    const bio = input.bio || '';
    const themeColor = input.themeColor || '#00ff88';

    await this.db.query(
      `
        INSERT INTO user_profiles (public_key, anon_id, display_name, avatar_style, bio, theme_color)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      [publicKey, anonId, input.displayName, avatarStyle, bio, themeColor]
    );

    return await this.getProfileByPublicKey(publicKey, publicKey);
  }

  async updateProfile(publicKey, input) {
    await this.ensureIdentity(publicKey);

    const rows = await this.db.query('SELECT * FROM user_profiles WHERE public_key = ? LIMIT 1', [publicKey]);
    if (rows.length === 0) {
      throw Object.assign(new Error('Profile not found'), { code: 'PROFILE_NOT_FOUND', status: 404 });
    }

    const current = rows[0];
    const displayName = input.displayName || current.display_name;
    const avatarStyle = input.avatarStyle || current.avatar_style;
    const bio = input.bio != null ? input.bio : current.bio;
    const themeColor = input.themeColor || current.theme_color;

    await this.db.query(
      `
        UPDATE user_profiles
        SET display_name = ?, avatar_style = ?, bio = ?, theme_color = ?, updated_at = CURRENT_TIMESTAMP
        WHERE public_key = ?
      `,
      [displayName, avatarStyle, bio, themeColor, publicKey]
    );

    return await this.getProfileByPublicKey(publicKey, publicKey);
  }

  async getProfileByPublicKey(publicKey, viewerKey = null) {
    const profileRows = await this.db.query(
      `
        SELECT public_key, anon_id, display_name, avatar_style, bio, theme_color, is_private, created_at, updated_at
        FROM user_profiles
        WHERE public_key = ?
        LIMIT 1
      `,
      [publicKey]
    );
    if (profileRows.length === 0) return null;

    const profile = profileRows[0];

    const [postsCountRow] = await this.db.query(
      'SELECT COUNT(*) as count FROM posts WHERE author_key = ?',
      [publicKey]
    );
    const [followersCountRow] = await this.db.query(
      'SELECT COUNT(*) as count FROM user_follows WHERE following_key = ?',
      [publicKey]
    );
    const [followingCountRow] = await this.db.query(
      'SELECT COUNT(*) as count FROM user_follows WHERE follower_key = ?',
      [publicKey]
    );

    const repRows = await this.db.query(
      'SELECT reputation_score FROM user_reputation WHERE user_key = ? LIMIT 1',
      [publicKey]
    );
    const reputationScore = repRows.length ? repRows[0].reputation_score : 0.0;

    let isFollowing = false;
    if (viewerKey && viewerKey !== publicKey) {
      const rel = await this.db.query(
        'SELECT 1 as ok FROM user_follows WHERE follower_key = ? AND following_key = ? LIMIT 1',
        [viewerKey, publicKey]
      );
      isFollowing = rel.length > 0;
    }

    return {
      profile: {
        publicKey: profile.public_key,
        anonId: profile.anon_id,
        displayName: profile.display_name,
        avatarStyle: profile.avatar_style,
        bio: profile.bio,
        themeColor: profile.theme_color,
        isPrivate: !!profile.is_private,
        createdAt: profile.created_at,
        updatedAt: profile.updated_at
      },
      stats: {
        postsCount: postsCountRow?.count || 0,
        followersCount: followersCountRow?.count || 0,
        followingCount: followingCountRow?.count || 0,
        reputationScore
      },
      viewer: {
        isFollowing
      }
    };
  }

  async getProfileByAnonId(anonId, viewerKey = null) {
    const rows = await this.db.query(
      'SELECT public_key FROM user_profiles WHERE anon_id = ? LIMIT 1',
      [anonId]
    );
    if (rows.length === 0) return null;
    return await this.getProfileByPublicKey(rows[0].public_key, viewerKey);
  }

  async follow(followerKey, followingKey) {
    if (followerKey === followingKey) {
      throw Object.assign(new Error('Cannot follow yourself'), { code: 'SELF_FOLLOW', status: 400 });
    }

    await this.ensureIdentity(followerKey);
    await this.ensureIdentity(followingKey);

    // Respect existing block relationships (MVP: disallow follow either direction).
    const blocked = await this.db.query(
      `
        SELECT 1 as ok FROM user_blocks
        WHERE (blocker_key = ? AND blocked_key = ?)
           OR (blocker_key = ? AND blocked_key = ?)
        LIMIT 1
      `,
      [followerKey, followingKey, followingKey, followerKey]
    );
    if (blocked.length) {
      throw Object.assign(new Error('Cannot follow this user'), { code: 'FOLLOW_BLOCKED', status: 403 });
    }

    await this.db.query(
      'INSERT OR IGNORE INTO user_follows (follower_key, following_key) VALUES (?, ?)',
      [followerKey, followingKey]
    );

    return { success: true, action: 'followed', followerKey, followingKey };
  }

  async unfollow(followerKey, followingKey) {
    if (followerKey === followingKey) {
      throw Object.assign(new Error('Cannot unfollow yourself'), { code: 'SELF_UNFOLLOW', status: 400 });
    }

    const result = await this.db.query(
      'DELETE FROM user_follows WHERE follower_key = ? AND following_key = ?',
      [followerKey, followingKey]
    );

    return { success: true, action: 'unfollowed', followerKey, followingKey, removed: result.changes || 0 };
  }

  // ── Public lists (pagination) ────────────────────────────────────────────

  async listFollowers(targetPublicKey, { limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // Followers: users where follower_key -> targetPublicKey
    const rows = await this.db.query(
      `
        SELECT p.anon_id as anon_id, p.display_name as display_name, p.avatar_style as avatar_style
        FROM user_follows f
        JOIN user_profiles p ON p.public_key = f.follower_key
        WHERE f.following_key = ?
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [targetPublicKey, safeLimit, safeOffset]
    );

    return rows;
  }

  async listFollowing(targetPublicKey, { limit = 20, offset = 0 } = {}) {
    const safeLimit = Math.max(1, Math.min(parseInt(limit, 10) || 20, 100));
    const safeOffset = Math.max(0, parseInt(offset, 10) || 0);

    // Following: users where targetPublicKey -> following_key
    const rows = await this.db.query(
      `
        SELECT p.anon_id as anon_id, p.display_name as display_name, p.avatar_style as avatar_style
        FROM user_follows f
        JOIN user_profiles p ON p.public_key = f.following_key
        WHERE f.follower_key = ?
        ORDER BY f.created_at DESC
        LIMIT ? OFFSET ?
      `,
      [targetPublicKey, safeLimit, safeOffset]
    );

    return rows;
  }
}

module.exports = {
  ProfileService,
  ALLOWED_AVATAR_STYLES
};
