/**
 * User Safety Controller
 * 
 * Handles API endpoints for user safety features including
 * blocking, muting, content filtering, and safety preferences.
 */

const UserSafetyService = require('../services/UserSafetyService');

class SafetyController {
  constructor(database) {
    this.database = database;
    this.safetyService = new UserSafetyService(database);
  }

  /**
   * Initialize safety controller
   */
  async initialize() {
    try {
      await this.safetyService.initializeTables();
      console.log('✅ Safety controller initialized');
    } catch (error) {
      console.error('❌ Failed to initialize safety controller:', error);
      throw error;
    }
  }

  /**
   * Block a user
   */
  async blockUser(req, res) {
    try {
      const { blockedKey } = req.body;
      const blockerKey = req.user.publicKey;

      if (!blockedKey) {
        return res.status(400).json({
          error: 'Blocked user key is required',
          code: 'MISSING_BLOCKED_KEY'
        });
      }

      if (blockedKey === blockerKey) {
        return res.status(400).json({
          error: 'Cannot block yourself',
          code: 'SELF_BLOCK'
        });
      }

      const result = await this.safetyService.blockUser(blockerKey, blockedKey);
      res.status(201).json(result);

    } catch (error) {
      console.error('Error blocking user:', error);
      res.status(500).json({
        error: 'Failed to block user',
        code: 'BLOCK_ERROR'
      });
    }
  }

  /**
   * Unblock a user
   */
  async unblockUser(req, res) {
    try {
      const { blockedKey } = req.params;
      const blockerKey = req.user.publicKey;

      if (!blockedKey) {
        return res.status(400).json({
          error: 'Blocked user key is required',
          code: 'MISSING_BLOCKED_KEY'
        });
      }

      const result = await this.safetyService.unblockUser(blockerKey, blockedKey);
      res.json(result);

    } catch (error) {
      console.error('Error unblocking user:', error);
      res.status(500).json({
        error: 'Failed to unblock user',
        code: 'UNBLOCK_ERROR'
      });
    }
  }

  /**
   * Mute a user
   */
  async muteUser(req, res) {
    try {
      const { mutedKey, muteType = 'content' } = req.body;
      const muterKey = req.user.publicKey;

      if (!mutedKey) {
        return res.status(400).json({
          error: 'Muted user key is required',
          code: 'MISSING_MUTED_KEY'
        });
      }

      if (mutedKey === muterKey) {
        return res.status(400).json({
          error: 'Cannot mute yourself',
          code: 'SELF_MUTE'
        });
      }

      const result = await this.safetyService.muteUser(muterKey, mutedKey, muteType);
      res.status(201).json(result);

    } catch (error) {
      console.error('Error muting user:', error);
      if (error.message.includes('Invalid mute type')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_MUTE_TYPE',
          validTypes: ['content', 'mentions', 'all']
        });
      }
      
      res.status(500).json({
        error: 'Failed to mute user',
        code: 'MUTE_ERROR'
      });
    }
  }

  /**
   * Unmute a user
   */
  async unmuteUser(req, res) {
    try {
      const { mutedKey } = req.params;
      const muterKey = req.user.publicKey;

      if (!mutedKey) {
        return res.status(400).json({
          error: 'Muted user key is required',
          code: 'MISSING_MUTED_KEY'
        });
      }

      const result = await this.safetyService.unmuteUser(muterKey, mutedKey);
      res.json(result);

    } catch (error) {
      console.error('Error unmuting user:', error);
      res.status(500).json({
        error: 'Failed to unmute user',
        code: 'UNMUTE_ERROR'
      });
    }
  }

  /**
   * Add content filter
   */
  async addContentFilter(req, res) {
    try {
      const { filterType, filterValue, filterAction = 'hide' } = req.body;
      const userKey = req.user.publicKey;

      if (!filterType || !filterValue) {
        return res.status(400).json({
          error: 'Filter type and value are required',
          code: 'MISSING_FILTER_DATA'
        });
      }

      const result = await this.safetyService.addContentFilter(
        userKey, filterType, filterValue, filterAction
      );
      res.status(201).json(result);

    } catch (error) {
      console.error('Error adding content filter:', error);
      if (error.message.includes('Invalid')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_FILTER',
          validTypes: ['keyword', 'hashtag', 'domain'],
          validActions: ['hide', 'warn', 'remove']
        });
      }
      
      res.status(500).json({
        error: 'Failed to add content filter',
        code: 'ADD_FILTER_ERROR'
      });
    }
  }

  /**
   * Remove content filter
   */
  async removeContentFilter(req, res) {
    try {
      const { filterType, filterValue } = req.body;
      const userKey = req.user.publicKey;

      if (!filterType || !filterValue) {
        return res.status(400).json({
          error: 'Filter type and value are required',
          code: 'MISSING_FILTER_DATA'
        });
      }

      const result = await this.safetyService.removeContentFilter(
        userKey, filterType, filterValue
      );
      res.json(result);

    } catch (error) {
      console.error('Error removing content filter:', error);
      res.status(500).json({
        error: 'Failed to remove content filter',
        code: 'REMOVE_FILTER_ERROR'
      });
    }
  }

  /**
   * Get blocked users
   */
  async getBlockedUsers(req, res) {
    try {
      const userKey = req.user.publicKey;
      const result = await this.safetyService.getBlockedUsers(userKey);
      res.json(result);

    } catch (error) {
      console.error('Error getting blocked users:', error);
      res.status(500).json({
        error: 'Failed to get blocked users',
        code: 'GET_BLOCKED_ERROR'
      });
    }
  }

  /**
   * Get muted users
   */
  async getMutedUsers(req, res) {
    try {
      const userKey = req.user.publicKey;
      const result = await this.safetyService.getMutedUsers(userKey);
      res.json(result);

    } catch (error) {
      console.error('Error getting muted users:', error);
      res.status(500).json({
        error: 'Failed to get muted users',
        code: 'GET_MUTED_ERROR'
      });
    }
  }

  /**
   * Get content filters
   */
  async getContentFilters(req, res) {
    try {
      const userKey = req.user.publicKey;
      const result = await this.safetyService.getContentFilters(userKey);
      res.json(result);

    } catch (error) {
      console.error('Error getting content filters:', error);
      res.status(500).json({
        error: 'Failed to get content filters',
        code: 'GET_FILTERS_ERROR'
      });
    }
  }

  /**
   * Update safety preferences
   */
  async updateSafetyPreferences(req, res) {
    try {
      const userKey = req.user.publicKey;
      const preferences = req.body;

      if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({
          error: 'Preferences object is required',
          code: 'INVALID_PREFERENCES'
        });
      }

      const result = await this.safetyService.updateSafetyPreferences(userKey, preferences);
      res.json(result);

    } catch (error) {
      console.error('Error updating safety preferences:', error);
      if (error.message.includes('Invalid preference')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_PREFERENCE',
          validPreferences: [
            'show_sensitive_content',
            'hide_blocked_content',
            'auto_filter_keywords',
            'block_new_accounts'
          ]
        });
      }
      
      res.status(500).json({
        error: 'Failed to update safety preferences',
        code: 'UPDATE_PREFERENCES_ERROR'
      });
    }
  }

  /**
   * Get safety preferences
   */
  async getSafetyPreferences(req, res) {
    try {
      const userKey = req.user.publicKey;
      const result = await this.safetyService.getSafetyPreferences(userKey);
      res.json(result);

    } catch (error) {
      console.error('Error getting safety preferences:', error);
      res.status(500).json({
        error: 'Failed to get safety preferences',
        code: 'GET_PREFERENCES_ERROR'
      });
    }
  }

  /**
   * Filter content for user
   */
  async filterContentForUser(req, res) {
    try {
      const { posts } = req.body;
      const userKey = req.user.publicKey;

      if (!Array.isArray(posts)) {
        return res.status(400).json({
          error: 'Posts array is required',
          code: 'INVALID_POSTS_DATA'
        });
      }

      const result = await this.safetyService.filterContent(userKey, posts);
      res.json({
        success: true,
        data: result
      });

    } catch (error) {
      console.error('Error filtering content:', error);
      res.status(500).json({
        error: 'Failed to filter content',
        code: 'FILTER_ERROR'
      });
    }
  }

  /**
   * Check if user is blocked
   */
  async checkBlockStatus(req, res) {
    try {
      const { userKey, targetKey } = req.query;
      const currentUserKey = req.user.publicKey;

      if (!userKey || !targetKey) {
        return res.status(400).json({
          error: 'Both userKey and targetKey are required',
          code: 'MISSING_KEYS'
        });
      }

      // Only allow users to check their own block status
      if (userKey !== currentUserKey) {
        return res.status(403).json({
          error: 'Can only check your own block status',
          code: 'UNAUTHORIZED_CHECK'
        });
      }

      const isBlocked = await this.safetyService.isUserBlocked(userKey, targetKey);
      const isMuted = await this.safetyService.isUserMuted(userKey, targetKey);

      res.json({
        success: true,
        data: {
          isBlocked,
          isMuted,
          muteType: isMuted
        }
      });

    } catch (error) {
      console.error('Error checking block status:', error);
      res.status(500).json({
        error: 'Failed to check block status',
        code: 'CHECK_STATUS_ERROR'
      });
    }
  }

  /**
   * Get safety summary
   */
  async getSafetySummary(req, res) {
    try {
      const userKey = req.user.publicKey;
      
      const [blockedUsers, mutedUsers, contentFilters, preferences] = await Promise.all([
        this.safetyService.getBlockedUsers(userKey),
        this.safetyService.getMutedUsers(userKey),
        this.safetyService.getContentFilters(userKey),
        this.safetyService.getSafetyPreferences(userKey)
      ]);

      res.json({
        success: true,
        data: {
          blockedUsers: blockedUsers.total,
          mutedUsers: mutedUsers.total,
          contentFilters: contentFilters.total,
          preferences: preferences.data,
          lastUpdated: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting safety summary:', error);
      res.status(500).json({
        error: 'Failed to get safety summary',
        code: 'SUMMARY_ERROR'
      });
    }
  }
}

module.exports = SafetyController;