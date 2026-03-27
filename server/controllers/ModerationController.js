/**
 * Community Moderation Controller
 * 
 * Handles API endpoints for community-based content moderation,
 * including voting, reporting, and reputation management.
 */

const CommunityModerationService = require('../services/CommunityModerationService');

class ModerationController {
  constructor(database) {
    this.database = database;
    this.moderationService = new CommunityModerationService(database);
  }

  /**
   * Initialize moderation controller
   */
  async initialize() {
    try {
      await this.moderationService.initializeTables();
      console.log('✅ Moderation controller initialized');
    } catch (error) {
      console.error('❌ Failed to initialize moderation controller:', error);
      throw error;
    }
  }

  /**
   * Vote on a post
   */
  async voteOnPost(req, res) {
    try {
      const { postId, voteType, voteWeight = 1.0 } = req.body;
      const voterKey = req.user.publicKey;

      if (!postId || !voteType) {
        return res.status(400).json({
          error: 'Post ID and vote type are required',
          code: 'MISSING_VOTE_DATA'
        });
      }

      const validTypes = ['upvote', 'downvote', 'report'];
      if (!validTypes.includes(voteType)) {
        return res.status(400).json({
          error: 'Invalid vote type',
          code: 'INVALID_VOTE_TYPE',
          validTypes
        });
      }

      if (typeof voteWeight !== 'number' || voteWeight < 0.1 || voteWeight > 5.0) {
        return res.status(400).json({
          error: 'Vote weight must be between 0.1 and 5.0',
          code: 'INVALID_VOTE_WEIGHT'
        });
      }

      const result = await this.moderationService.voteOnPost(
        postId, voterKey, voteType, voteWeight
      );
      res.status(201).json(result);

    } catch (error) {
      console.error('Error voting on post:', error);
      res.status(500).json({
        error: 'Failed to vote on post',
        code: 'VOTE_ERROR'
      });
    }
  }

  /**
   * Report content
   */
  async reportContent(req, res) {
    try {
      const { postId, reason, description = '' } = req.body;
      const reporterKey = req.user.publicKey;

      if (!postId || !reason) {
        return res.status(400).json({
          error: 'Post ID and report reason are required',
          code: 'MISSING_REPORT_DATA'
        });
      }

      const validReasons = ['spam', 'harassment', 'misinformation', 'inappropriate', 'copyright'];
      if (!validReasons.includes(reason)) {
        return res.status(400).json({
          error: 'Invalid report reason',
          code: 'INVALID_REPORT_REASON',
          validReasons
        });
      }

      if (description && description.length > 500) {
        return res.status(400).json({
          error: 'Report description must be 500 characters or less',
          code: 'DESCRIPTION_TOO_LONG'
        });
      }

      const result = await this.moderationService.reportContent(
        postId, reporterKey, reason, description
      );
      res.status(201).json(result);

    } catch (error) {
      console.error('Error reporting content:', error);
      if (error.message.includes('Invalid report reason')) {
        return res.status(400).json({
          error: error.message,
          code: 'INVALID_REPORT_REASON',
          validReasons: ['spam', 'harassment', 'misinformation', 'inappropriate', 'copyright']
        });
      }
      
      res.status(500).json({
        error: 'Failed to report content',
        code: 'REPORT_ERROR'
      });
    }
  }

  /**
   * Get post votes and quality score
   */
  async getPostVotes(req, res) {
    try {
      const { postId } = req.params;

      if (!postId || isNaN(parseInt(postId))) {
        return res.status(400).json({
          error: 'Valid post ID is required',
          code: 'INVALID_POST_ID'
        });
      }

      const result = await this.moderationService.getPostVotes(parseInt(postId));
      res.json(result);

    } catch (error) {
      console.error('Error getting post votes:', error);
      res.status(500).json({
        error: 'Failed to get post votes',
        code: 'GET_VOTES_ERROR'
      });
    }
  }

  /**
   * Get moderation queue
   */
  async getModerationQueue(req, res) {
    try {
      const { 
        status = 'pending', 
        limit = 50, 
        offset = 0 
      } = req.query;

      const validStatuses = ['pending', 'processed', 'ignored'];
      if (!validStatuses.includes(status)) {
        return res.status(400).json({
          error: 'Invalid status',
          code: 'INVALID_STATUS',
          validStatuses
        });
      }

      const limitNum = Math.min(parseInt(limit) || 50, 100);
      const offsetNum = Math.max(parseInt(offset) || 0, 0);

      const result = await this.moderationService.getModerationQueue(
        status, limitNum, offsetNum
      );
      res.json(result);

    } catch (error) {
      console.error('Error getting moderation queue:', error);
      res.status(500).json({
        error: 'Failed to get moderation queue',
        code: 'GET_QUEUE_ERROR'
      });
    }
  }

  /**
   * Get user reputation
   */
  async getUserReputation(req, res) {
    try {
      const { userKey } = req.params;
      const currentUserKey = req.user.publicKey;

      // Allow users to check their own reputation or if they're moderators
      if (userKey !== currentUserKey) {
        // TODO: Add moderator role check
        return res.status(403).json({
          error: 'Can only check your own reputation',
          code: 'UNAUTHORIZED_REPUTATION_CHECK'
        });
      }

      const result = await this.moderationService.getUserReputation(userKey);
      res.json(result);

    } catch (error) {
      console.error('Error getting user reputation:', error);
      res.status(500).json({
        error: 'Failed to get user reputation',
        code: 'GET_REPUTATION_ERROR'
      });
    }
  }

  /**
   * Get current user reputation (self-check)
   */
  async getCurrentUserReputation(req, res) {
    try {
      const userKey = req.user.publicKey;
      const result = await this.moderationService.getUserReputation(userKey);
      res.json(result);

    } catch (error) {
      console.error('Error getting current user reputation:', error);
      res.status(500).json({
        error: 'Failed to get user reputation',
        code: 'GET_REPUTATION_ERROR'
      });
    }
  }

  /**
   * Get community moderation statistics
   */
  async getModerationStats(req, res) {
    try {
      // Get various moderation metrics
      const [totalVotes, totalReports, activeQueue, qualityScores] = await Promise.all([
        this.database.query(`
          SELECT 
            COUNT(*) as total_votes,
            COUNT(CASE WHEN vote_type = 'upvote' THEN 1 END) as upvotes,
            COUNT(CASE WHEN vote_type = 'downvote' THEN 1 END) as downvotes,
            COUNT(CASE WHEN vote_type = 'report' THEN 1 END) as reports
          FROM post_votes
        `),
        this.database.query(`
          SELECT 
            COUNT(*) as total_reports,
            COUNT(CASE WHEN status = 'pending' THEN 1 END) as pending_reports,
            COUNT(CASE WHEN status = 'reviewed' THEN 1 END) as reviewed_reports
          FROM moderation_reports
        `),
        this.database.query(`
          SELECT 
            COUNT(*) as pending_queue,
            action_type,
            COUNT(*) as count
          FROM moderation_queue 
          WHERE status = 'pending'
          GROUP BY action_type
        `),
        this.database.query(`
          SELECT 
            quality_tier,
            COUNT(*) as count,
            AVG(total_score) as avg_score
          FROM post_quality_scores
          GROUP BY quality_tier
        `)
      ]);

      const stats = {
        votes: totalVotes[0] || {},
        reports: totalReports[0] || {},
        queue: {
          pending: activeQueue.length > 0 ? 
            activeQueue.reduce((sum, item) => sum + item.count, 0) : 0,
          byAction: activeQueue
        },
        quality: qualityScores || [],
        generated_at: new Date().toISOString()
      };

      res.json({
        success: true,
        data: stats
      });

    } catch (error) {
      console.error('Error getting moderation stats:', error);
      res.status(500).json({
        error: 'Failed to get moderation statistics',
        code: 'GET_STATS_ERROR'
      });
    }
  }

  /**
   * Get top contributors by reputation
   */
  async getTopContributors(req, res) {
    try {
      const { limit = 20, tier = 'all' } = req.query;
      
      let whereClause = '';
      const validTiers = ['all', 'trusted', 'respected', 'established', 'neutral'];
      
      if (validTiers.includes(tier) && tier !== 'all') {
        const scoreThresholds = {
          'trusted': 100,
          'respected': 50,
          'established': 20,
          'neutral': 0
        };
        
        if (tier === 'neutral') {
          whereClause = `WHERE reputation_score >= 0 AND reputation_score < 20`;
        } else {
          whereClause = `WHERE reputation_score >= ${scoreThresholds[tier]}`;
        }
      }

      const limitNum = Math.min(parseInt(limit) || 20, 100);

      const contributors = await this.database.query(`
        SELECT 
          user_key,
          reputation_score,
          upvotes_given,
          downvotes_given,
          posts_created,
          reports_filed,
          reports_upheld,
          last_updated
        FROM user_reputation
        ${whereClause}
        ORDER BY reputation_score DESC
        LIMIT ?
      `, [limitNum]);

      // Add reputation tiers
      const contributorsWithTiers = contributors.map(contributor => ({
        ...contributor,
        reputation_tier: this.moderationService.getReputationTier(contributor.reputation_score)
      }));

      res.json({
        success: true,
        data: {
          contributors: contributorsWithTiers,
          total: contributorsWithTiers.length,
          tier: tier,
          generated_at: new Date().toISOString()
        }
      });

    } catch (error) {
      console.error('Error getting top contributors:', error);
      res.status(500).json({
        error: 'Failed to get top contributors',
        code: 'GET_CONTRIBUTORS_ERROR'
      });
    }
  }

  /**
   * Process moderation queue item
   */
  async processQueueItem(req, res) {
    try {
      const { queueId } = req.params;
      const { action, moderatorNote = '' } = req.body;
      const moderatorKey = req.user.publicKey;

      if (!queueId || isNaN(parseInt(queueId))) {
        return res.status(400).json({
          error: 'Valid queue ID is required',
          code: 'INVALID_QUEUE_ID'
        });
      }

      const validActions = ['approve', 'hide', 'remove', 'ignore'];
      if (!validActions.includes(action)) {
        return res.status(400).json({
          error: 'Invalid action',
          code: 'INVALID_ACTION',
          validActions
        });
      }

      // Get queue item
      const queueItem = await this.database.query(`
        SELECT * FROM moderation_queue WHERE id = ? AND status = 'pending'
      `, [parseInt(queueId)]);

      if (queueItem.length === 0) {
        return res.status(404).json({
          error: 'Queue item not found or already processed',
          code: 'QUEUE_ITEM_NOT_FOUND'
        });
      }

      const item = queueItem[0];

      // Start transaction
      await this.database.query('BEGIN');

      try {
        // Update queue item
        await this.database.query(`
          UPDATE moderation_queue 
          SET status = 'processed', processed_at = CURRENT_TIMESTAMP
          WHERE id = ?
        `, [parseInt(queueId)]);

        // Apply action to post
        let postStatus = 'active';
        switch (action) {
          case 'approve':
            postStatus = 'active';
            break;
          case 'hide':
            postStatus = 'hidden';
            break;
          case 'remove':
            postStatus = 'removed';
            break;
          case 'ignore':
            // Don't change post status
            break;
        }

        if (action !== 'ignore') {
          await this.database.query(`
            UPDATE posts SET status = ? WHERE id = ?
          `, [postStatus, item.post_id]);
        }

        // Create moderation log
        await this.database.query(`
          INSERT INTO moderation_logs 
          (queue_id, post_id, moderator_key, action, moderator_note, created_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
        `, [parseInt(queueId), item.post_id, moderatorKey, action, moderatorNote]);

        await this.database.query('COMMIT');

        res.json({
          success: true,
          actionPerformed: 'queue_item_processed',
          queueId: parseInt(queueId),
          postId: item.post_id,
          action: action,
          postStatus,
          moderatorKey,
          moderatorNote,
          timestamp: new Date().toISOString()
        });

      } catch (error) {
        await this.database.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error processing queue item:', error);
      res.status(500).json({
        error: 'Failed to process queue item',
        code: 'PROCESS_QUEUE_ERROR'
      });
    }
  }
}

module.exports = ModerationController;