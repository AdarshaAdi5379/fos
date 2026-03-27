/**
 * Community Moderation Service
 * 
 * Provides voting-based content moderation system with upvotes/downvotes,
 * spam detection, and community governance features.
 */

class CommunityModerationService {
  constructor(database) {
    this.db = database;
    
    // Moderation weights and thresholds
    this.moderationThresholds = {
      downvoteThreshold: -10,      // Auto-hide posts below this score
      spamThreshold: -20,          // Auto-remove posts below this score
      reportThreshold: 5,           // Auto-review posts with 5+ reports
      qualityThreshold: 10          // Boost posts above this score
    };
    
    this.votingWeights = {
      upvote: 1,
      downvote: -2,                 // Downvotes weighted more heavily
      report: -5                    // Reports heavily weighted
    };
  }

  /**
   * Initialize moderation database tables
   */
  async initializeTables() {
    try {
      // Create post votes table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS post_votes (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          voter_key TEXT NOT NULL,
          vote_type TEXT NOT NULL, -- 'upvote', 'downvote', 'report'
          vote_weight REAL DEFAULT 1.0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          UNIQUE (post_id, voter_key)
        )
      `);

      // Create moderation reports table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS moderation_reports (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER,
          reporter_key TEXT NOT NULL,
          report_reason TEXT NOT NULL, -- 'spam', 'harassment', 'misinformation', 'inappropriate'
          report_description TEXT,
          status TEXT DEFAULT 'pending', -- 'pending', 'reviewed', 'resolved', 'dismissed'
          reviewed_by TEXT,
          reviewed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create moderation queue table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS moderation_queue (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER NOT NULL,
          action_type TEXT NOT NULL, -- 'auto_hide', 'auto_remove', 'manual_review'
          trigger_reason TEXT,
          trigger_score REAL,
          status TEXT DEFAULT 'pending', -- 'pending', 'processed', 'ignored'
          processed_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create community reputation table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS user_reputation (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          user_key TEXT UNIQUE NOT NULL,
          reputation_score REAL DEFAULT 0.0,
          upvotes_given INTEGER DEFAULT 0,
          downvotes_given INTEGER DEFAULT 0,
          posts_created INTEGER DEFAULT 0,
          posts_removed INTEGER DEFAULT 0,
          reports_filed INTEGER DEFAULT 0,
          reports_upheld INTEGER DEFAULT 0,
          last_updated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create post quality score table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS post_quality_scores (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          post_id INTEGER UNIQUE NOT NULL,
          upvote_count INTEGER DEFAULT 0,
          downvote_count INTEGER DEFAULT 0,
          report_count INTEGER DEFAULT 0,
          total_score REAL DEFAULT 0.0,
          engagement_rate REAL DEFAULT 0.0,
          quality_tier TEXT DEFAULT 'neutral', -- 'low', 'neutral', 'high', 'premium'
          auto_actions TEXT, -- JSON array of auto-moderation actions
          last_calculated DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create moderation logs table
      await this.db.query(`
        CREATE TABLE IF NOT EXISTS moderation_logs (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          queue_id INTEGER,
          post_id INTEGER,
          moderator_key TEXT NOT NULL,
          action TEXT NOT NULL,
          moderator_note TEXT,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create indexes for performance
      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_post_votes_post_voter 
        ON post_votes (post_id, voter_key)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_post_votes_type 
        ON post_votes (vote_type, created_at)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_moderation_reports_status 
        ON moderation_reports (status, created_at)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_moderation_queue_status 
        ON moderation_queue (status, created_at)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_user_reputation_score 
        ON user_reputation (reputation_score DESC)
      `);

      await this.db.query(`
        CREATE INDEX IF NOT EXISTS idx_post_quality_score 
        ON post_quality_scores (total_score DESC)
      `);

      console.log('✅ Community moderation tables initialized');
    } catch (error) {
      console.error('❌ Failed to initialize moderation tables:', error);
      throw error;
    }
  }

  /**
   * Vote on a post
   */
  async voteOnPost(postId, voterKey, voteType, voteWeight = 1.0) {
    try {
      const validTypes = ['upvote', 'downvote', 'report'];
      if (!validTypes.includes(voteType)) {
        throw new Error('Invalid vote type');
      }

      // Start transaction
      await this.db.query('BEGIN');

      try {
        // Check for existing vote
        const existingVote = await this.db.query(`
          SELECT vote_type FROM post_votes 
          WHERE post_id = ? AND voter_key = ?
        `, [postId, voterKey]);

        let oldVoteType = null;
        if (existingVote.length > 0) {
          oldVoteType = existingVote[0].vote_type;
        }

        // Update or insert vote
        await this.db.query(`
          INSERT OR REPLACE INTO post_votes (post_id, voter_key, vote_type, vote_weight)
          VALUES (?, ?, ?, ?)
        `, [postId, voterKey, voteType, voteWeight]);

        // Update post quality score
        await this.calculatePostQualityScore(postId);

        // Update user reputation
        await this.updateUserReputation(voterKey, voteType, 1);

        // Check for auto-moderation actions
        await this.checkAutoModeration(postId);

        // Update author's reputation based on vote
        const post = await this.db.query(`
          SELECT author_key FROM posts WHERE id = ?
        `, [postId]);
        
        if (post.length > 0) {
          const authorKey = post[0].author_key;
          const reputationImpact = this.getReputationImpact(voteType, oldVoteType);
          await this.updateUserReputation(authorKey, reputationImpact.type, reputationImpact.amount);
        }

        await this.db.query('COMMIT');

        return {
          success: true,
          action: 'vote_cast',
          postId,
          voterKey,
          voteType,
          voteWeight,
          oldVoteType,
          timestamp: new Date().toISOString()
        };

      } catch (error) {
        await this.db.query('ROLLBACK');
        throw error;
      }

    } catch (error) {
      console.error('Error voting on post:', error);
      throw new Error('Failed to vote on post');
    }
  }

  /**
   * Calculate quality score for a post
   */
  async calculatePostQualityScore(postId) {
    try {
      // Get all votes for the post
      const votes = await this.db.query(`
        SELECT vote_type, COUNT(*) as count, AVG(vote_weight) as avg_weight
        FROM post_votes 
        WHERE post_id = ?
        GROUP BY vote_type
      `, [postId]);

      let upvoteCount = 0;
      let downvoteCount = 0;
      let reportCount = 0;
      let totalScore = 0;

      votes.forEach(vote => {
        const weightedCount = vote.count * (vote.avg_weight || 1.0);
        
        switch (vote.vote_type) {
          case 'upvote':
            upvoteCount = Math.round(weightedCount);
            totalScore += weightedCount * this.votingWeights.upvote;
            break;
          case 'downvote':
            downvoteCount = Math.round(weightedCount);
            totalScore += weightedCount * this.votingWeights.downvote;
            break;
          case 'report':
            reportCount = Math.round(weightedCount);
            totalScore += weightedCount * this.votingWeights.report;
            break;
        }
      });

      // Calculate engagement rate (votes per hour since creation)
      const post = await this.db.query(`
        SELECT created_at FROM posts WHERE id = ?
      `, [postId]);
      
      let engagementRate = 0;
      if (post.length > 0) {
        const created = new Date(post[0].created_at);
        const hoursSinceCreation = Math.max(1, (Date.now() - created) / (1000 * 60 * 60));
        engagementRate = (upvoteCount + downvoteCount + reportCount) / hoursSinceCreation;
      }

      // Determine quality tier
      let qualityTier = 'neutral';
      if (totalScore >= this.moderationThresholds.qualityThreshold) {
        qualityTier = 'premium';
      } else if (totalScore >= 5) {
        qualityTier = 'high';
      } else if (totalScore <= this.moderationThresholds.downvoteThreshold) {
        qualityTier = 'low';
      }

      // Check for auto-moderation actions
      const autoActions = [];
      if (totalScore <= this.moderationThresholds.spamThreshold) {
        autoActions.push('auto_remove');
      } else if (totalScore <= this.moderationThresholds.downvoteThreshold) {
        autoActions.push('auto_hide');
      }

      // Update quality score table
      await this.db.query(`
        INSERT OR REPLACE INTO post_quality_scores 
        (post_id, upvote_count, downvote_count, report_count, total_score, 
         engagement_rate, quality_tier, auto_actions, last_calculated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [
        postId,
        upvoteCount,
        downvoteCount,
        reportCount,
        totalScore,
        engagementRate,
        qualityTier,
        autoActions.length > 0 ? JSON.stringify(autoActions) : null
      ]);

      return {
        postId,
        upvoteCount,
        downvoteCount,
        reportCount,
        totalScore,
        engagementRate,
        qualityTier,
        autoActions
      };

    } catch (error) {
      console.error('Error calculating post quality score:', error);
      throw new Error('Failed to calculate post quality score');
    }
  }

  /**
   * Update user reputation
   */
  async updateUserReputation(userKey, actionType, amount = 1) {
    try {
      // Get current reputation
      const current = await this.db.query(`
        SELECT * FROM user_reputation WHERE user_key = ?
      `, [userKey]);

      let reputation = 0;
      let upvotes = 0;
      let downvotes = 0;
      let posts = 0;
      let removed = 0;
      let reports = 0;
      let upheld = 0;

      if (current.length > 0) {
        const user = current[0];
        reputation = user.reputation_score || 0;
        upvotes = user.upvotes_given || 0;
        downvotes = user.downvotes_given || 0;
        posts = user.posts_created || 0;
        removed = user.posts_removed || 0;
        reports = user.reports_filed || 0;
        upheld = user.reports_upheld || 0;
      }

      // Update based on action type - each case handles its own reputation change
      switch (actionType) {
        case 'upvote':
          upvotes += amount;
          reputation += 0.1 * amount;
          break;
        case 'downvote':
          downvotes += amount;
          reputation += 0.05 * amount;
          break;
        case 'upvote_received':
          reputation += amount * 2;
          break;
        case 'downvote_received':
          reputation -= amount;
          break;
        case 'post_created':
          posts += amount;
          reputation += amount;
          break;
        case 'post_removed':
          removed += amount;
          reputation -= amount * 5;
          break;
        case 'report_filed':
          reports += amount;
          reputation += 0.2 * amount;
          break;
        case 'report_upheld':
          upheld += amount;
          reputation += amount * 10;
          break;
      }

      const reputationChange = 0; // Already applied above per-case

      // Update database
      await this.db.query(`
        INSERT OR REPLACE INTO user_reputation 
        (user_key, reputation_score, upvotes_given, downvotes_given, 
         posts_created, posts_removed, reports_filed, reports_upheld, last_updated)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      `, [userKey, reputation, upvotes, downvotes, posts, removed, reports, upheld]);

      return {
        userKey,
        actionType,
        amount,
        newReputation: reputation
      };

    } catch (error) {
      console.error('Error updating user reputation:', error);
      throw new Error('Failed to update user reputation');
    }
  }

  /**
   * Check for auto-moderation actions
   */
  async checkAutoModeration(postId) {
    try {
      const qualityScore = await this.db.query(`
        SELECT * FROM post_quality_scores WHERE post_id = ?
      `, [postId]);

      if (qualityScore.length === 0) return;

      const score = qualityScore[0];
      const autoActions = score.auto_actions ? JSON.parse(score.auto_actions) : [];

      for (const action of autoActions) {
        await this.db.query(`
          INSERT INTO moderation_queue 
          (post_id, action_type, trigger_reason, trigger_score, status)
          VALUES (?, ?, ?, ?, 'pending')
        `, [postId, action, 'automatic', score.total_score]);
      }

      // Auto-hide post if threshold met
      if (score.total_score <= this.moderationThresholds.downvoteThreshold) {
        await this.db.query(`
          UPDATE posts SET status = 'hidden' WHERE id = ?
        `, [postId]);
      }

      // Auto-remove post if spam threshold met
      if (score.total_score <= this.moderationThresholds.spamThreshold) {
        await this.db.query(`
          UPDATE posts SET status = 'removed' WHERE id = ?
        `, [postId]);
      }

      // Auto-boost high quality posts (logged but not persisted - no quality_boost column in posts table)
      if (score.total_score >= this.moderationThresholds.qualityThreshold) {
        console.log(`Post ${postId} has high quality score: ${score.total_score}`);
      }

    } catch (error) {
      console.error('Error checking auto-moderation:', error);
    }
  }

  /**
   * Get post votes
   */
  async getPostVotes(postId) {
    try {
      const votes = await this.db.query(`
        SELECT voter_key, vote_type, vote_weight, created_at
        FROM post_votes 
        WHERE post_id = ?
        ORDER BY created_at DESC
      `, [postId]);

      const qualityScore = await this.db.query(`
        SELECT * FROM post_quality_scores WHERE post_id = ?
      `, [postId]);

      const quality = qualityScore.length > 0 ? qualityScore[0] : null;

      return {
        success: true,
        data: {
          postId,
          votes,
          quality,
          summary: {
            totalVotes: votes.length,
            upvotes: votes.filter(v => v.vote_type === 'upvote').length,
            downvotes: votes.filter(v => v.vote_type === 'downvote').length,
            reports: votes.filter(v => v.vote_type === 'report').length
          }
        }
      };

    } catch (error) {
      console.error('Error getting post votes:', error);
      throw new Error('Failed to get post votes');
    }
  }

  /**
   * Report content
   */
  async reportContent(postId, reporterKey, reason, description = '') {
    try {
      const validReasons = ['spam', 'harassment', 'misinformation', 'inappropriate', 'copyright'];
      if (!validReasons.includes(reason)) {
        throw new Error('Invalid report reason');
      }

      // Create report
      await this.db.query(`
        INSERT INTO moderation_reports 
        (post_id, reporter_key, report_reason, report_description, status)
        VALUES (?, ?, ?, ?, 'pending')
      `, [postId, reporterKey, reason, description]);

      // Vote on the post as a report
      await this.voteOnPost(postId, reporterKey, 'report');

      // Check if auto-review is triggered
      const reportCount = await this.db.query(`
        SELECT COUNT(*) as count FROM moderation_reports 
        WHERE post_id = ? AND status = 'pending'
      `, [postId]);

      if (reportCount[0].count >= this.moderationThresholds.reportThreshold) {
        await this.db.query(`
          INSERT INTO moderation_queue 
          (post_id, action_type, trigger_reason, trigger_score, status)
          VALUES (?, 'manual_review', 'report_threshold', ?, 'pending')
        `, [postId, reportCount[0].count]);
      }

      return {
        success: true,
        action: 'content_reported',
        postId,
        reporterKey,
        reason,
        description,
        reportCount: reportCount[0].count,
        timestamp: new Date().toISOString()
      };

    } catch (error) {
      console.error('Error reporting content:', error);
      throw new Error('Failed to report content');
    }
  }

  /**
   * Get moderation queue
   */
  async getModerationQueue(status = 'pending', limit = 50, offset = 0) {
    try {
      const queue = await this.db.query(`
        SELECT 
          mq.*,
          p.content,
          p.author_key,
          pq.total_score,
          pq.quality_tier
        FROM moderation_queue mq
        LEFT JOIN posts p ON mq.post_id = p.id
        LEFT JOIN post_quality_scores pq ON mq.post_id = pq.post_id
        WHERE mq.status = ?
        ORDER BY mq.created_at DESC
        LIMIT ? OFFSET ?
      `, [status, limit, offset]);

      const totalCount = await this.db.query(`
        SELECT COUNT(*) as count FROM moderation_queue WHERE status = ?
      `, [status]);

      return {
        success: true,
        data: queue,
        total: totalCount[0].count,
        pagination: {
          limit,
          offset,
          hasMore: (offset + limit) < totalCount[0].count
        }
      };

    } catch (error) {
      console.error('Error getting moderation queue:', error);
      throw new Error('Failed to get moderation queue');
    }
  }

  /**
   * Get user reputation
   */
  async getUserReputation(userKey) {
    try {
      const reputation = await this.db.query(`
        SELECT * FROM user_reputation WHERE user_key = ?
      `, [userKey]);

      if (reputation.length === 0) {
        return {
          success: true,
          data: {
            userKey,
            reputation_score: 0.0,
            upvotes_given: 0,
            downvotes_given: 0,
            posts_created: 0,
            posts_removed: 0,
            reports_filed: 0,
            reports_upheld: 0,
            reputation_tier: 'new'
          }
        };
      }

      const user = reputation[0];
      const tier = this.getReputationTier(user.reputation_score);

      return {
        success: true,
        data: {
          ...user,
          reputation_tier: tier
        }
      };

    } catch (error) {
      console.error('Error getting user reputation:', error);
      throw new Error('Failed to get user reputation');
    }
  }

  /**
   * Helper methods
   */
  getReputationImpact(voteType, oldVoteType) {
    if (oldVoteType === voteType) return { type: 'no_change', amount: 0 };
    
    if (voteType === 'upvote') {
      return { type: 'upvote_received', amount: 1 };
    } else if (voteType === 'downvote') {
      return { type: 'downvote_received', amount: 1 };
    } else if (voteType === 'report') {
      return { type: 'downvote_received', amount: 2 };
    }
    
    return { type: 'no_change', amount: 0 };
  }

  getReputationChange(actionType) {
    const changes = {
      'upvote': 0.1,
      'downvote': 0.05,
      'upvote_received': 2,
      'downvote_received': -1,
      'post_created': 1,
      'post_removed': -5,
      'report_filed': 0.2,
      'report_upheld': 10
    };
    
    return changes[actionType] || 0;
  }

  getReputationTier(score) {
    if (score >= 100) return 'trusted';
    if (score >= 50) return 'respected';
    if (score >= 20) return 'established';
    if (score >= 0) return 'neutral';
    if (score >= -10) return 'new';
    return 'restricted';
  }
}

module.exports = CommunityModerationService;