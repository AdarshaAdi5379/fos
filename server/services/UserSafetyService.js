/**
 * User Safety Service
 * 
 * Provides mute, block, and content filtering functionality
 * to help users control their social media experience.
 */

class UserSafetyService {
  constructor(database) {
    this.db = database;
  }

  /**
   * Initialize safety-related database tables
   */
  async initializeTables() {
    try {
      // Create user blocks table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS user_blocks (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          blocker_key TEXT NOT NULL,
          blocked_key TEXT NOT NULL,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (blocker_key, blocked_key)
        )
      `);

      // Create user mutes table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS user_mutes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          muter_key TEXT NOT NULL,
          muted_key TEXT NOT NULL,
          mute_type TEXT DEFAULT 'content',
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (muter_key, muted_key)
        )
      `);

      // Create content filters table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS content_filters (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_key TEXT NOT NULL,
          filter_type TEXT NOT NULL,
          filter_value TEXT NOT NULL,
          filter_action TEXT DEFAULT 'hide',
          is_active INTEGER DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (user_key, filter_type, filter_value)
        )
      `);

      // Create safety preferences table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS safety_preferences (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_key TEXT UNIQUE NOT NULL,
          show_sensitive_content INTEGER DEFAULT 0,
          hide_blocked_content INTEGER DEFAULT 1,
          auto_filter_keywords INTEGER DEFAULT 1,
          block_new_accounts INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_user_blocks_blocker 
        ON user_blocks (blocker_key)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_user_mutes_muter 
        ON user_mutes (muter_key)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_content_filters_user 
        ON content_filters (user_key, is_active)
      `);

      console.log('✅ User safety tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize safety tables:', error);
      throw error;
    }
  }

  /**
   * Block a user
   */
  async blockUser(blockerKey, blockedKey) {
    try {
      await this.db.query(`
        INSERT OR REPLACE INTO user_blocks (blocker_key, blocked_key)
        VALUES (?, ?)
      `, [blockerKey, blockedKey]);

      return {
        success: true,
        action: 'blocked',
        blockerKey,
        blockedKey,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error blocking user:', error);
      throw new Error('Failed to block user');
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(blockerKey, blockedKey) {
    try {
      const result = await this.db.query(`
        DELETE FROM user_blocks 
        WHERE blocker_key = ? AND blocked_key = ?
      `, [blockerKey, blockedKey]);

      return {
        success: true,
        action: 'unblocked',
        blockerKey,
        blockedKey,
        removed: result.changes || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error unblocking user:', error);
      throw new Error('Failed to unblock user');
    }
  }

  /**
   * Mute a user
   */
  async muteUser(muterKey, mutedKey, muteType = 'content') {
    try {
      const validTypes = ['content', 'mentions', 'all'];
      if (!validTypes.includes(muteType)) {
        throw new Error('Invalid mute type. Must be: content, mentions, or all');
      }

      await this.db.query(`
        INSERT OR REPLACE INTO user_mutes (muter_key, muted_key, mute_type)
        VALUES (?, ?, ?)
      `, [muterKey, mutedKey, muteType]);

      return {
        success: true,
        action: 'muted',
        muterKey,
        mutedKey,
        muteType,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error muting user:', error);
      if (error.message.includes('Invalid mute type')) {
        throw error;
      }
      throw new Error('Failed to mute user');
    }
  }

  /**
   * Unmute a user
   */
  async unmuteUser(muterKey, mutedKey) {
    try {
      const result = await this.db.query(`
        DELETE FROM user_mutes 
        WHERE muter_key = ? AND muted_key = ?
      `, [muterKey, mutedKey]);

      return {
        success: true,
        action: 'unmuted',
        muterKey,
        mutedKey,
        removed: result.changes || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error unmuting user:', error);
      throw new Error('Failed to unmute user');
    }
  }

  /**
   * Add content filter
   */
  async addContentFilter(userKey, filterType, filterValue, filterAction = 'hide') {
    try {
      const validTypes = ['keyword', 'hashtag', 'domain'];
      const validActions = ['hide', 'warn', 'remove'];

      if (!validTypes.includes(filterType)) {
        throw new Error('Invalid filter type');
      }
      if (!validActions.includes(filterAction)) {
        throw new Error('Invalid filter action');
      }

      await this.db.query(`
        INSERT OR REPLACE INTO content_filters 
        (user_key, filter_type, filter_value, filter_action)
        VALUES (?, ?, ?, ?)
      `, [userKey, filterType, filterValue.toLowerCase(), filterAction]);

      return {
        success: true,
        action: 'filter_added',
        userKey,
        filterType,
        filterValue,
        filterAction,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error adding content filter:', error);
      throw new Error('Failed to add content filter');
    }
  }

  /**
   * Remove content filter
   */
  async removeContentFilter(userKey, filterType, filterValue) {
    try {
      const result = await this.db.query(`
        DELETE FROM content_filters 
        WHERE user_key = ? AND filter_type = ? AND filter_value = ?
      `, [userKey, filterType, filterValue.toLowerCase()]);

      return {
        success: true,
        action: 'filter_removed',
        userKey,
        filterType,
        filterValue,
        removed: result.changes || 0,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error removing content filter:', error);
      throw new Error('Failed to remove content filter');
    }
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(userKey) {
    try {
      const blockedUsers = await this.db.query(`
        SELECT 
          ub.blocked_key,
          ub.created_at as blocked_at,
          i.last_seen as last_activity
        FROM user_blocks ub
        LEFT JOIN identities i ON ub.blocked_key = i.public_key
        WHERE ub.blocker_key = ?
        ORDER BY ub.created_at DESC
      `, [userKey]);

      return {
        success: true,
        data: blockedUsers,
        total: blockedUsers.length
      };
    } catch (error) {
      console.error('Error getting blocked users:', error);
      throw new Error('Failed to get blocked users');
    }
  }

  /**
   * Get muted users
   */
  async getMutedUsers(userKey) {
    try {
      const mutedUsers = await this.db.query(`
        SELECT 
          um.muted_key,
          um.mute_type,
          um.created_at as muted_at,
          i.last_seen as last_activity
        FROM user_mutes um
        LEFT JOIN identities i ON um.muted_key = i.public_key
        WHERE um.muter_key = ?
        ORDER BY um.created_at DESC
      `, [userKey]);

      return {
        success: true,
        data: mutedUsers,
        total: mutedUsers.length
      };
    } catch (error) {
      console.error('Error getting muted users:', error);
      throw new Error('Failed to get muted users');
    }
  }

  /**
   * Get content filters
   */
  async getContentFilters(userKey) {
    try {
      const filters = await this.db.query(`
        SELECT 
          filter_type,
          filter_value,
          filter_action,
          is_active,
          created_at
        FROM content_filters
        WHERE user_key = ? AND is_active = 1
        ORDER BY filter_type, created_at DESC
      `, [userKey]);

      return {
        success: true,
        data: filters,
        total: filters.length
      };
    } catch (error) {
      console.error('Error getting content filters:', error);
      throw new Error('Failed to get content filters');
    }
  }

  /**
   * Update safety preferences
   */
  async updateSafetyPreferences(userKey, preferences) {
    try {
      const validPreferences = [
        'show_sensitive_content',
        'hide_blocked_content', 
        'auto_filter_keywords',
        'block_new_accounts'
      ];

      // Validate preferences
      for (const key of Object.keys(preferences)) {
        if (!validPreferences.includes(key)) {
          throw new Error(`Invalid preference: ${key}`);
        }
        if (typeof preferences[key] !== 'boolean') {
          throw new Error(`Preference ${key} must be boolean`);
        }
      }

      await this.db.query(`
        INSERT OR REPLACE INTO safety_preferences 
        (user_key, show_sensitive_content, hide_blocked_content, 
         auto_filter_keywords, block_new_accounts, updated_at)
        VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        userKey,
        preferences.show_sensitive_content ?? false,
        preferences.hide_blocked_content ?? true,
        preferences.auto_filter_keywords ?? true,
        preferences.block_new_accounts ?? false
      ]);

      return {
        success: true,
        action: 'preferences_updated',
        userKey,
        preferences,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Error updating safety preferences:', error);
      throw new Error('Failed to update safety preferences');
    }
  }

  /**
   * Get safety preferences
   */
  async getSafetyPreferences(userKey) {
    try {
      const prefs = await this.db.query(`
        SELECT * FROM safety_preferences WHERE user_key = ?
      `, [userKey]);

      if (prefs.length === 0) {
        // Return default preferences
        return {
          success: true,
          data: {
            show_sensitive_content: false,
            hide_blocked_content: true,
            auto_filter_keywords: true,
            block_new_accounts: false
          }
        };
      }

      const preference = prefs[0];
      return {
        success: true,
        data: {
          show_sensitive_content: !!preference.show_sensitive_content,
          hide_blocked_content: !!preference.hide_blocked_content,
          auto_filter_keywords: !!preference.auto_filter_keywords,
          block_new_accounts: !!preference.block_new_accounts
        }
      };
    } catch (error) {
      console.error('Error getting safety preferences:', error);
      throw new Error('Failed to get safety preferences');
    }
  }

  /**
   * Filter content based on user's safety settings
   */
  async filterContent(userKey, posts) {
    try {
      if (!posts || posts.length === 0) {
        return { posts: [], filtered: 0 };
      }

      // Get user's safety preferences and filters
      const [preferences, filters, blockedUsers, mutedUsers] = await Promise.all([
        this.getSafetyPreferences(userKey),
        this.getContentFilters(userKey),
        this.getBlockedUsers(userKey),
        this.getMutedUsers(userKey)
      ]);

      const prefs = preferences.data;
      const blockedSet = new Set(blockedUsers.data.map(b => b.blocked_key));
      const mutedSet = new Set(mutedUsers.data.map(m => m.muted_key));
      const contentFilters = filters.data;

      let filteredCount = 0;
      const filteredPosts = posts.filter(post => {
        // Remove blocked users' content
        if (prefs.hide_blocked_content && blockedSet.has(post.author_key)) {
          filteredCount++;
          return false;
        }

        // Apply content filters
        if (prefs.auto_filter_keywords && contentFilters.length > 0) {
          const content = post.content.toLowerCase();
          
          for (const filter of contentFilters) {
            let shouldFilter = false;
            
            switch (filter.filter_type) {
              case 'keyword':
                if (content.includes(filter.filter_value)) {
                  shouldFilter = true;
                }
                break;
              case 'hashtag':
                if (content.includes('#' + filter.filter_value)) {
                  shouldFilter = true;
                }
                break;
            }
            
            if (shouldFilter) {
              if (filter.filter_action === 'remove') {
                filteredCount++;
                return false;
              } else if (filter.filter_action === 'warn') {
                post.content_warning = `Filtered: ${filter.filter_type}`;
              }
            }
          }
        }

        return true;
      });

      return {
        posts: filteredPosts,
        filtered: filteredCount,
        appliedFilters: {
          blockedUsers: blockedSet.size,
          mutedUsers: mutedSet.size,
          contentFilters: contentFilters.length
        }
      };
    } catch (error) {
      console.error('Error filtering content:', error);
      // Return original posts if filtering fails
      return { posts, filtered: 0 };
    }
  }

  /**
   * Check if a user is blocked by another user
   */
  async isUserBlocked(blockerKey, blockedKey) {
    try {
      const result = await this.db.query(`
        SELECT 1 FROM user_blocks 
        WHERE blocker_key = ? AND blocked_key = ?
        LIMIT 1
      `, [blockerKey, blockedKey]);

      return result.length > 0;
    } catch (error) {
      console.error('Error checking block status:', error);
      return false;
    }
  }

  /**
   * Check if a user is muted by another user
   */
  async isUserMuted(muterKey, mutedKey) {
    try {
      const result = await this.db.query(`
        SELECT mute_type FROM user_mutes 
        WHERE muter_key = ? AND muted_key = ?
        LIMIT 1
      `, [muterKey, mutedKey]);

      return result.length > 0 ? result[0].mute_type : null;
    } catch (error) {
      console.error('Error checking mute status:', error);
      return null;
    }
  }
}

module.exports = UserSafetyService;