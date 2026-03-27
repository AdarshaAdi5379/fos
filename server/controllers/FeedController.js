/**
 * Feed Controller
 * 
 * Handles advanced feed API endpoints with algorithmic ranking,
 * search functionality, and analytics.
 */

const FeedService = require('../services/FeedService');
const DatabaseSchema = require('../services/DatabaseSchemaFixed');

class FeedController {
  constructor(database) {
    this.database = database;
    this.feedService = new FeedService(this.database);
    this.dbSchema = new DatabaseSchema(this.database);
  }

  async initialize() {
    try {
      await this.dbSchema.initializeAdvancedSchema();
      await this.dbSchema.populateSearchIndex();
      console.log('✅ Feed controller initialized');
    } catch (error) {
      console.error('❌ Failed to initialize feed controller:', error);
      throw error;
    }
  }

  /**
   * Get advanced feed with full algorithmic ranking
   */
  async getAdvancedFeed(req, res) {
    try {
      const {
        strategy = 'algorithmic',
        limit = 50,
        offset = 0,
        content_filter = 'all',
        sort_by = 'relevance',
        time_range = '7d',
        include_scores = false
      } = req.query;

      // Validate parameters
      const validStrategies = ['algorithmic', 'chronological', 'hot', 'trending'];
      if (!validStrategies.includes(strategy)) {
        return res.status(400).json({
          error: 'Invalid feed strategy',
          validStrategies,
          code: 'INVALID_STRATEGY'
        });
      }

      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const offsetNum = Math.max(parseInt(offset) || 0, 0);

      // Advanced feed with comprehensive parameters
      const result = await this.feedService.getAlgorithmicFeed({
        limit: limitNum,
        offset: offsetNum,
        contentFilter: content_filter,
        userId: req.user?.publicKey,
        sortBy: sort_by,
        timeRange: time_range,
        includeScores: include_scores === 'true'
      });

      // Enhanced analytics recording
      if (req.user) {
        result.posts.forEach(post => {
          this.feedService.recordPostView(post.id, req.user.publicKey).catch(() => {});
        });
        
        this.recordFeedAnalytics(req.user.publicKey, {
          strategy,
          limit: limitNum,
          offset: offsetNum,
          content_filter,
          sort_by,
          time_range
        }).catch(() => {});
      }

      res.json({
        success: true,
        data: {
          posts: result.posts,
          strategy: strategy,
          total: result.total || result.posts.length,
          hasMore: result.hasMore,
          algorithm: '4-factor-scoring',
          factors: {
            recency_weight: 0.3,
            engagement_weight: 0.4,
            quality_weight: 0.2,
            personalization_weight: 0.1
          }
        },
        meta: {
          strategy,
          content_filter,
          sort_by,
          time_range,
          include_scores,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            hasMore: result.hasMore
          },
          timestamp: new Date().toISOString(),
          version: '2.0'
        }
      });

    } catch (error) {
      console.error('Error getting advanced feed:', error);
      res.status(500).json({
        error: 'Failed to retrieve advanced feed',
        code: 'ADVANCED_FEED_ERROR'
      });
    }
  }

  /**
   * Get feed with algorithmic ranking
   */
  async getFeed(req, res) {
    try {
      const {
        strategy = 'algorithmic', // 'algorithmic', 'chronological', 'hot'
        limit = 50,
        offset = 0,
        content_filter = 'all' // 'all', 'recent', 'trending'
      } = req.query;

      // Validate parameters
      const validStrategies = ['algorithmic', 'chronological', 'hot'];
      if (!validStrategies.includes(strategy)) {
        return res.status(400).json({
          error: 'Invalid feed strategy',
          validStrategies,
          code: 'INVALID_STRATEGY'
        });
      }

      const validFilters = ['all', 'recent', 'trending'];
      if (!validFilters.includes(content_filter)) {
        return res.status(400).json({
          error: 'Invalid content filter',
          validFilters,
          code: 'INVALID_FILTER'
        });
      }

      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const offsetNum = Math.max(parseInt(offset) || 0, 0);

      let result;
      switch (strategy) {
        case 'chronological':
          result = await this.feedService.getChronologicalFeed({
            limit: limitNum,
            offset: offsetNum,
            contentFilter: content_filter
          });
          break;
        case 'hot':
          result = await this.feedService.getHotFeed({
            limit: limitNum,
            offset: offsetNum
          });
          break;
        case 'algorithmic':
        default:
          result = await this.feedService.getAlgorithmicFeed({
            limit: limitNum,
            offset: offsetNum,
            contentFilter: content_filter,
            userId: req.user?.publicKey
          });
          break;
      }

      // Record view analytics for each post (async, don't wait)
      if (req.user) {
        result.posts.forEach(post => {
          this.feedService.recordPostView(post.id, req.user.publicKey).catch(() => {});
        });
      }

      res.json({
        success: true,
        data: result,
        meta: {
          strategy,
          content_filter,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            hasMore: result.hasMore
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting feed:', error);
      res.status(500).json({
        error: 'Failed to retrieve feed',
        code: 'FEED_ERROR'
      });
    }
  }

  /**
   * Following feed (chronological): requires authentication.
   */
  async getFollowingFeed(req, res) {
    try {
      if (!req.user?.publicKey) {
        return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
      }

      const { page = 1, limit = 20, offset } = req.query;
      const limitNum = Math.max(1, Math.min(parseInt(limit) || 20, 50));

      const offsetNum = offset != null
        ? Math.max(parseInt(offset) || 0, 0)
        : Math.max(((parseInt(page) || 1) - 1) * limitNum, 0);

      const result = await this.feedService.getFollowingFeed({
        userKey: req.user.publicKey,
        limit: limitNum,
        offset: offsetNum,
      });

      if (!result.posts.length) {
        return res.json({
          posts: [],
          message: 'Follow users to see posts',
          pagination: { limit: limitNum, offset: offsetNum, hasMore: false },
        });
      }

      return res.json({
        posts: result.posts,
        pagination: { limit: limitNum, offset: offsetNum, hasMore: result.hasMore },
      });
    } catch (error) {
      console.error('Error getting following feed:', error);
      return res.status(500).json({ error: 'Failed to retrieve following feed', code: 'FEED_FOLLOWING_ERROR' });
    }
  }

  /**
   * Search posts
   */
  async searchPosts(req, res) {
    try {
      const { q: query, limit = 50, offset = 0 } = req.query;

      if (!query || query.trim().length < 2) {
        return res.status(400).json({
          error: 'Search query must be at least 2 characters',
          code: 'INVALID_QUERY'
        });
      }

      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const offsetNum = Math.max(parseInt(offset) || 0, 0);

      const result = await this.feedService.searchPosts(query.trim(), {
        limit: limitNum,
        offset: offsetNum
      });

      // Record search analytics
      if (req.user) {
        this.recordSearchAnalytics(req.user.publicKey, query.trim()).catch(() => {});
      }

      res.json({
        success: true,
        data: result,
        meta: {
          query: result.query,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            hasMore: result.hasMore
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error searching posts:', error);
      res.status(500).json({
        error: 'Search failed',
        code: 'SEARCH_ERROR'
      });
    }
  }

  /**
   * Get trending topics
   */
  async getTrendingTopics(req, res) {
    try {
      const { limit = 10 } = req.query;
      const limitNum = Math.min(parseInt(limit) || 10, 50);

      const topics = await this.feedService.getTrendingTopics(limitNum);

      res.json({
        success: true,
        data: {
          topics,
          total: topics.length
        },
        meta: {
          limit: limitNum,
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting trending topics:', error);
      res.status(500).json({
        error: 'Failed to get trending topics',
        code: 'TRENDING_ERROR'
      });
    }
  }

  /**
   * Get author feed
   */
  async getAuthorFeed(req, res) {
    try {
      const { authorKey } = req.params;
      const { limit = 20, offset = 0 } = req.query;

      if (!authorKey) {
        return res.status(400).json({
          error: 'Author key is required',
          code: 'MISSING_AUTHOR_KEY'
        });
      }

      const limitNum = Math.min(parseInt(limit) || 20, 100);
      const offsetNum = Math.max(parseInt(offset) || 0, 0);

      const result = await this.feedService.getAuthorFeed(authorKey, {
        limit: limitNum,
        offset: offsetNum
      });

      res.json({
        success: true,
        data: result,
        meta: {
          authorKey,
          pagination: {
            limit: limitNum,
            offset: offsetNum,
            hasMore: result.hasMore
          },
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting author feed:', error);
      res.status(500).json({
        error: 'Failed to get author feed',
        code: 'AUTHOR_FEED_ERROR'
      });
    }
  }

  /**
   * Get feed statistics
   */
  async getFeedStats(req, res) {
    try {
      const stats = await this.feedService.getFeedStatistics();

      res.json({
        success: true,
        data: stats,
        meta: {
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting feed statistics:', error);
      res.status(500).json({
        error: 'Failed to get feed statistics',
        code: 'STATS_ERROR'
      });
    }
  }

  /**
   * Get analytics dashboard
   */
  async getAnalytics(req, res) {
    try {
      const { days = 30 } = req.query;
      const daysNum = Math.min(parseInt(days) || 30, 365);

      const analytics = await this.dbSchema.getAnalyticsDashboard(daysNum);

      res.json({
        success: true,
        data: analytics,
        meta: {
          period: `${daysNum} days`,
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting analytics:', error);
      res.status(500).json({
        error: 'Failed to get analytics',
        code: 'ANALYTICS_ERROR'
      });
    }
  }

  /**
   * Record user interaction
   */
  async recordInteraction(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const { postId, interactionType, data } = req.body;

      if (!postId || !interactionType) {
        return res.status(400).json({
          error: 'Post ID and interaction type are required',
          code: 'MISSING_FIELDS'
        });
      }

      const validTypes = ['view', 'edit', 'share', 'like'];
      if (!validTypes.includes(interactionType)) {
        return res.status(400).json({
          error: 'Invalid interaction type',
          validTypes,
          code: 'INVALID_INTERACTION'
        });
      }

      // Record the interaction
      await this.database.query(`
        INSERT INTO post_engagement (post_id, engagement_type, engagement_data)
        VALUES (?, ?, ?)
      `, [postId, interactionType, JSON.stringify(data || {})]);

      res.json({
        success: true,
        message: 'Interaction recorded'
      });

    } catch (error) {
      console.error('Error recording interaction:', error);
      res.status(500).json({
        error: 'Failed to record interaction',
        code: 'INTERACTION_ERROR'
      });
    }
  }

  /**
   * Update user preferences
   */
  async updateUserPreferences(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const { preferences } = req.body;
      if (!preferences || typeof preferences !== 'object') {
        return res.status(400).json({
          error: 'Valid preferences object required',
          code: 'INVALID_PREFERENCES'
        });
      }

      const publicKey = req.user.publicKey;

      // Update each preference
      for (const [key, value] of Object.entries(preferences)) {
        await this.database.query(`
          INSERT OR REPLACE INTO user_preferences (public_key, preference_key, preference_value)
          VALUES (?, ?, ?)
        `, [publicKey, key, JSON.stringify(value)]);
      }

      res.json({
        success: true,
        message: 'Preferences updated'
      });

    } catch (error) {
      console.error('Error updating preferences:', error);
      res.status(500).json({
        error: 'Failed to update preferences',
        code: 'PREFERENCES_ERROR'
      });
    }
  }

  /**
   * Get user preferences
   */
  async getUserPreferences(req, res) {
    try {
      if (!req.user) {
        return res.status(401).json({
          error: 'Authentication required',
          code: 'AUTH_REQUIRED'
        });
      }

      const preferences = await this.database.query(`
        SELECT preference_key, preference_value 
        FROM user_preferences 
        WHERE public_key = ?
      `, [req.user.publicKey]);

      // Convert to object
      const prefs = {};
      preferences.forEach(pref => {
        try {
          prefs[pref.preference_key] = JSON.parse(pref.preference_value);
        } catch (e) {
          prefs[pref.preference_key] = pref.preference_value;
        }
      });

      res.json({
        success: true,
        data: prefs
      });

    } catch (error) {
      console.error('Error getting preferences:', error);
      res.status(500).json({
        error: 'Failed to get preferences',
        code: 'GET_PREFERENCES_ERROR'
      });
    }
  }

  /**
   * Record search analytics
   */
  async recordSearchAnalytics(userKey, query) {
    try {
      await this.database.query(`
        INSERT INTO post_engagement (post_id, engagement_type, engagement_data, created_at)
        VALUES (?, 'search', ?, CURRENT_TIMESTAMP)
      `, [0, JSON.stringify({ userKey, query })]);
    } catch (error) {
      console.error('Error recording search analytics:', error);
    }
  }

  /**
   * Record feed analytics
   */
  async recordFeedAnalytics(userKey, options) {
    try {
      await this.database.query(`
        INSERT INTO post_engagement (post_id, engagement_type, engagement_data, created_at)
        VALUES (?, 'feed_view', ?, CURRENT_TIMESTAMP)
      `, [0, JSON.stringify({ userKey, ...options })]);
    } catch (error) {
      console.error('Error recording feed analytics:', error);
    }
  }

  /**
   * Perform maintenance tasks
   */
  async performMaintenance() {
    try {
      await this.dbSchema.cleanupOldData();
      await this.dbSchema.updateDailyAnalytics();
      console.log('✅ Feed maintenance completed');
    } catch (error) {
      console.error('❌ Feed maintenance failed:', error);
    }
  }
}

module.exports = FeedController;
