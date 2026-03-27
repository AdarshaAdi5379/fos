/**
 * Advanced Feed Service
 * 
 * Provides algorithmic ranking, content filtering, and personalized
 * feed generation based on engagement metrics and user preferences.
 */

class FeedService {
  constructor(database) {
    this.db = database;
    
    // Algorithmic ranking weights
    this.rankWeights = {
      recent: 0.3,       // Time-based decay
      engagement: 0.4,   // Views and edits
      quality: 0.2,      // Content quality assessment
      diversity: 0.1     // Author diversity
    };
  }

  /**
   * Calculate engagement score for a post
   */
  async calculateEngagementScore(post) {
    try {
      const postId = post.id;
      
      // Get engagement metrics (simplified for SQLite)
      const [viewsResult] = await this.db.query(`
        SELECT COUNT(*) as view_count 
        FROM post_views 
        WHERE post_id = ? 
        AND created_at > datetime('now', '-24 hours')
      `, [postId]);

      const [editsResult] = await this.db.query(`
        SELECT COUNT(*) as edit_count 
        FROM post_versions 
        WHERE post_id = ? 
        AND created_at > datetime('now', '-24 hours')
      `, [postId]);

      // Simple engagement calculation
      const views = viewsResult?.view_count || 0;
      const edits = editsResult?.edit_count || 0;
      const engagement = (views * 1) + (edits * 2); // Edits weighted higher
      
      return Math.min(engagement, 100); // Cap at 100
    } catch (error) {
      console.error('Error calculating engagement score:', error);
      return 0;
    }
  }

  /**
   * Calculate time decay score
   */
  calculateTimeScore(post) {
    const now = new Date();
    const createdAt = new Date(post.created_at);
    const hoursAgo = (now - createdAt) / (1000 * 60 * 60);
    
    // Exponential decay for older posts
    if (hoursAgo <= 1) return 1.0;      // Very recent
    if (hoursAgo <= 6) return 0.8;      // Recent
    if (hoursAgo <= 24) return 0.6;     // Today
    if (hoursAgo <= 72) return 0.4;     // Last 3 days
    if (hoursAgo <= 168) return 0.2;    // Last week
    return 0.1;                            // Older
  }

  /**
   * Calculate content quality score
   */
  calculateQualityScore(post) {
    let score = 0.5; // Base score

    // Length factor (not too short, not too long)
    const length = post.content.length;
    if (length >= 50 && length <= 1000) score += 0.2;
    else if (length > 1000 && length <= 5000) score += 0.1;
    else if (length < 20 || length > 10000) score -= 0.2;

    // No excessive edits (indicates stable content)
    if (!post.updated_at || post.updated_at === post.created_at) {
      score += 0.1;
    }

    // Contains meaningful content (basic heuristics)
    const wordCount = post.content.split(/\s+/).length;
    if (wordCount >= 5) score += 0.1;
    if (wordCount >= 20) score += 0.1;

    return Math.max(0, Math.min(1, score));
  }

  /**
   * Get author diversity score
   */
  async getAuthorDiversityScore(authorKey, limit = 10) {
    try {
      // Get recent posts by this author
      const posts = await this.db.query(`
        SELECT id, created_at 
        FROM posts 
        WHERE author_key = ? 
        ORDER BY created_at DESC 
        LIMIT ?
      `, [authorKey, limit]);

      if (posts.length === 0) return 1.0;

      // Calculate diversity based on posting patterns
      const timeSpan = new Date(posts[0].created_at) - new Date(posts[posts.length - 1].created_at);
      const avgInterval = timeSpan / (posts.length - 1);
      
      // Lower posting frequency increases diversity score
      let diversityScore = 1.0;
      if (avgInterval < 1000 * 60 * 30) { // Less than 30 minutes between posts
        diversityScore -= 0.3;
      }
      if (avgInterval < 1000 * 60 * 10) { // Less than 10 minutes between posts
        diversityScore -= 0.5;
      }

      return Math.max(0, diversityScore);
    } catch (error) {
      console.error('Error calculating author diversity:', error);
      return 1.0;
    }
  }

  /**
   * Calculate final ranking score
   */
  async calculateRankingScore(post, options = {}) {
    const engagementScore = await this.calculateEngagementScore(post);
    const timeScore = this.calculateTimeScore(post);
    const qualityScore = this.calculateQualityScore(post);
    const diversityScore = options.includeDiversity ? 
      await this.getAuthorDiversityScore(post.author_key) : 1.0;

    // Weighted combination
    const finalScore = 
      (timeScore * this.rankWeights.recent) +
      (engagementScore / 100 * this.rankWeights.engagement) +
      (qualityScore * this.rankWeights.quality) +
      (diversityScore * this.rankWeights.diversity);

    return {
      finalScore: Math.round(finalScore * 1000) / 1000, // 3 decimal places
      components: {
        time: timeScore,
        engagement: engagementScore / 100,
        quality: qualityScore,
        diversity: diversityScore
      }
    };
  }

  /**
   * Following feed (chronological): posts only from authors the user follows.
   */
  async getFollowingFeed(options = {}) {
    const {
      userKey,
      limit = 20,
      offset = 0,
    } = options;

    if (!userKey) {
      throw Object.assign(new Error('User key is required'), { code: 'MISSING_USER_KEY', status: 400 });
    }

    const limitNum = Math.max(1, Math.min(parseInt(limit, 10) || 20, 50));
    const offsetNum = Math.max(0, parseInt(offset, 10) || 0);

    try {
      const rows = await this.db.query(
        `
          SELECT
            p.*,
            up.anon_id as anon_id,
            up.display_name as display_name,
            up.avatar_style as avatar_style,
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
            ) AS viewer_liked,
            0 as likes_count,
            0 as replies_count
          FROM posts p
          JOIN user_follows f
            ON p.author_key = f.following_key
          LEFT JOIN user_profiles up
            ON up.public_key = p.author_key
          LEFT JOIN posts op ON op.post_uuid = p.repost_of_uuid AND op.is_deleted = 0
          LEFT JOIN user_profiles oup ON oup.public_key = op.author_key
          WHERE f.follower_key = ? AND p.is_deleted = 0
          ORDER BY p.created_at DESC
          LIMIT ? OFFSET ?
        `,
        [userKey, userKey, userKey, limitNum, offsetNum]
      );

      return {
        posts: rows,
        strategy: 'following_chronological',
        total: rows.length,
        hasMore: rows.length === limitNum,
      };
    } catch (error) {
      console.error('Error getting following feed:', error);
      throw error;
    }
  }

  /**
   * Get chronological feed (basic)
   */
  async getChronologicalFeed(options = {}) {
    const {
      limit = 50,
      offset = 0,
      contentFilter = 'all'
    } = options;

    try {
      let whereClause = 'WHERE is_deleted = 0';
      const params = [];

      // Apply content filters
      if (contentFilter === 'recent') {
        whereClause += ' AND created_at > datetime("now", "-6 hours")';
      } else if (contentFilter === 'trending') {
        whereClause += ' AND created_at > datetime("now", "-24 hours")';
      }

      const posts = await this.db.query(`
        SELECT * FROM posts 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [...params, limit, offset]);

      return {
        posts,
        strategy: 'chronological',
        total: posts.length,
        hasMore: posts.length === limit
      };
    } catch (error) {
      console.error('Error getting chronological feed:', error);
      throw error;
    }
  }

  /**
   * Get algorithmic feed (recommended)
   */
  async getAlgorithmicFeed(options = {}) {
    const {
      limit = 50,
      offset = 0,
      contentFilter = 'all',
      userId = null,
      sortBy = 'relevance',
      timeRange = '7d',
      includeScores = false
    } = options;

    try {
      // Get base posts with filters
      let whereClause = 'WHERE is_deleted = 0';
      const params = [];

      if (contentFilter === 'recent') {
        whereClause += ' AND created_at > datetime("now", "-6 hours")';
      } else if (contentFilter === 'hot') {
        whereClause += ' AND created_at > datetime("now", "-1 hour")';
      } else if (timeRange) {
        // Apply time range filter (1d, 7d, 30d)
        const hours = timeRange === '1d' ? 24 : timeRange === '7d' ? 168 : timeRange === '30d' ? 720 : 168;
        whereClause += ` AND created_at > datetime("now", "-${hours} hours")`;
      }

      const posts = await this.db.query(`
        SELECT * FROM posts 
        ${whereClause}
        ORDER BY created_at DESC 
        LIMIT 200
      `, params); // Get more posts for ranking

      // Calculate scores for each post
      const postsWithScores = await Promise.all(
        posts.map(async (post) => {
          const scoreData = await this.calculateRankingScore(post, {
            includeDiversity: true
          });
          
          const result = {
            ...post,
            _rankingScore: scoreData.finalScore
          };
          
          if (includeScores) {
            result._scoreData = scoreData;
          }
          
          return result;
        })
      );

      // Sort by ranking score
      postsWithScores.sort((a, b) => b._rankingScore - a._rankingScore);

      // Apply pagination
      const startIndex = offset;
      const endIndex = offset + limit;
      const paginatedPosts = postsWithScores.slice(startIndex, endIndex);

      return {
        posts: paginatedPosts,
        strategy: 'algorithmic',
        total: postsWithScores.length,
        hasMore: endIndex < postsWithScores.length,
        scoring: this.rankWeights
      };
    } catch (error) {
      console.error('Error getting algorithmic feed:', error);
      throw error;
    }
  }

  /**
   * Get hot posts (trending now)
   */
  async getHotFeed(options = {}) {
    const { limit = 20, offset = 0 } = options;

    try {
      const posts = await this.db.query(`
        SELECT * FROM posts 
        WHERE created_at > datetime("now", "-1 hour")
        ORDER BY created_at DESC
        LIMIT 100
      `);

      // Calculate engagement-based ranking for hot content
      const postsWithScores = await Promise.all(
        posts.map(async (post) => {
          const engagementScore = await this.calculateEngagementScore(post);
          const timeScore = this.calculateTimeScore(post);
          
          // Hot posts prioritize recent engagement
          const hotScore = (engagementScore * 0.7) + (timeScore * 0.3);
          
          return {
            ...post,
            _scoreData: { hotScore, engagementScore, timeScore },
            _rankingScore: hotScore
          };
        })
      );

      postsWithScores.sort((a, b) => b._rankingScore - a._rankingScore);

      const startIndex = offset;
      const endIndex = offset + limit;
      const paginatedPosts = postsWithScores.slice(startIndex, endIndex);

      return {
        posts: paginatedPosts,
        strategy: 'hot',
        total: postsWithScores.length,
        hasMore: endIndex < postsWithScores.length
      };
    } catch (error) {
      console.error('Error getting hot feed:', error);
      throw error;
    }
  }

  /**
   * Get posts by author
   */
  async getAuthorFeed(authorKey, options = {}) {
    const { limit = 20, offset = 0 } = options;

    try {
      const posts = await this.db.query(`
        SELECT * FROM posts 
        WHERE author_key = ? 
        ORDER BY created_at DESC 
        LIMIT ? OFFSET ?
      `, [authorKey, limit, offset]);

      return {
        posts,
        strategy: 'author',
        authorKey,
        total: posts.length,
        hasMore: posts.length === limit
      };
    } catch (error) {
      console.error('Error getting author feed:', error);
      throw error;
    }
  }

  /**
   * Search posts with relevance ranking
   */
  async searchPosts(query, options = {}) {
    const { limit = 50, offset = 0 } = options;

    try {
      if (!query || query.trim().length < 2) {
        return { posts: [], query, total: 0 };
      }

      const searchTerm = `%${query.trim()}%`;
      
      const posts = await this.db.query(`
        SELECT * FROM posts 
        WHERE content LIKE ? 
        ORDER BY created_at DESC 
        LIMIT 200
      `, [searchTerm]);

      // Re-rank based on relevance
      const postsWithScores = posts.map(post => {
        const relevanceScore = this.calculateRelevanceScore(post.content, query);
        const timeScore = this.calculateTimeScore(post);
        
        // Search ranking: relevance + recency
        const searchScore = (relevanceScore * 0.7) + (timeScore * 0.3);
        
        return {
          ...post,
          _scoreData: { relevanceScore, timeScore, searchScore },
          _rankingScore: searchScore
        };
      });

      postsWithScores.sort((a, b) => b._rankingScore - a._rankingScore);

      const startIndex = offset;
      const endIndex = offset + limit;
      const paginatedPosts = postsWithScores.slice(startIndex, endIndex);

      return {
        posts: paginatedPosts,
        query,
        strategy: 'search',
        total: postsWithScores.length,
        hasMore: endIndex < postsWithScores.length
      };
    } catch (error) {
      console.error('Error searching posts:', error);
      throw error;
    }
  }

  /**
   * Calculate relevance score for search
   */
  calculateRelevanceScore(content, query) {
    const contentLower = content.toLowerCase();
    const queryLower = query.toLowerCase();
    const queryWords = queryLower.split(/\s+/);
    
    let relevanceScore = 0;
    
    // Exact match bonus
    if (contentLower.includes(queryLower)) {
      relevanceScore += 2.0;
    }
    
    // Word matching
    queryWords.forEach(word => {
      if (contentLower.includes(word)) {
        relevanceScore += 0.5;
      }
    });
    
    // Query word frequency bonus
    const queryFrequency = queryWords.reduce((count, word) => {
      const regex = new RegExp(word, 'gi');
      const matches = contentLower.match(regex);
      return count + (matches ? matches.length : 0);
    }, 0);
    
    relevanceScore += Math.min(queryFrequency * 0.1, 1.0);
    
    return Math.min(relevanceScore, 5.0); // Cap at 5
  }

  /**
   * Record post view for analytics
   */
  async recordPostView(postId, viewerKey = null) {
    try {
      await this.db.query(`
        INSERT OR IGNORE INTO post_views (post_id, viewer_key, viewed_at)
        VALUES (?, ?, CURRENT_TIMESTAMP)
      `, [postId, viewerKey]);
    } catch (error) {
      console.error('Error recording post view:', error);
    }
  }

  /**
   * Get feed statistics
   */
  async getFeedStatistics() {
    try {
      const [totalPosts] = await this.db.query('SELECT COUNT(*) as count FROM posts');
      const [postsToday] = await this.db.query(`
        SELECT COUNT(*) as count FROM posts 
        WHERE created_at > datetime("now", "-24 hours")
      `);
      const [postsThisWeek] = await this.db.query(`
        SELECT COUNT(*) as count FROM posts 
        WHERE created_at > datetime("now", "-7 days")
      `);
      const [activeAuthors] = await this.db.query(`
        SELECT COUNT(DISTINCT author_key) as count FROM posts 
        WHERE created_at > datetime("now", "-7 days")
      `);

      return {
        totalPosts: totalPosts.count,
        postsToday: postsToday.count,
        postsThisWeek: postsThisWeek.count,
        activeAuthorsThisWeek: activeAuthors.count,
        averagePostsPerDay: Math.round(postsThisWeek.count / 7 * 10) / 10
      };
    } catch (error) {
      console.error('Error getting feed statistics:', error);
      throw error;
    }
  }

  /**
   * Update ranking weights
   */
  updateRankWeights(newWeights) {
    this.rankWeights = { ...this.rankWeights, ...newWeights };
  }

  /**
   * Get trending topics
   */
  async getTrendingTopics(limit = 10) {
    try {
      // Simple trending detection based on common words in recent posts
      const recentPosts = await this.db.query(`
        SELECT content FROM posts 
        WHERE created_at > datetime("now", "-24 hours")
        LIMIT 500
      `);

      const wordFrequency = {};
      recentPosts.forEach(post => {
        const words = post.content.toLowerCase()
          .replace(/[^\w\s]/g, '')
          .split(/\s+/)
          .filter(word => word.length > 3);

        words.forEach(word => {
          if (word) {
            wordFrequency[word] = (wordFrequency[word] || 0) + 1;
          }
        });
      });

      // Sort by frequency and return top topics
      const trendingTopics = Object.entries(wordFrequency)
        .sort(([, a], [, b]) => b - a)
        .slice(0, limit)
        .map(([topic, count]) => ({ topic, count }));

      return trendingTopics;
    } catch (error) {
      console.error('Error getting trending topics:', error);
      return [];
    }
  }
}

module.exports = FeedService;
