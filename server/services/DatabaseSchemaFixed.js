/**
 * Database Schema - Final Corrected Version
 * 
 * This version fixes all syntax issues and database integration.
 */

class DatabaseSchema {
  constructor(database) {
    this.db = database;
  }

  async initializeAdvancedSchema() {
    try {
      console.log('🗄️ Initializing advanced database schema...');
      
      const db = await this.getConnection();
      
      await this.createPostViewsTable(db);
      await this.createPostTagsTable(db);
      await this.createUserPreferencesTable(db);
      await this.createAnalyticsTables(db);
      await this.createIndexes(db);
      await this.populateSearchIndex();
      
      console.log('✅ Advanced schema initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize advanced schema:', error);
      throw error;
    }
  }

  /**
   * Create post views tracking table
   */
  async createPostViewsTable(db) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS post_views (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        viewer_key TEXT NULL,
        viewed_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Create tags table
   */
  async createTagsTable(db) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        name TEXT UNIQUE NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        usage_count INTEGER DEFAULT 1
      )
    `);
  }

  /**
   * Create post tags junction table
   */
  async createPostTagsTable(db) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS post_tags (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        tag_id INTEGER NOT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (post_id, tag_id)
      )
    `);
  }

  /**
   * Create user preferences table
   */
  async createUserPreferencesTable(db) {
    await db.query(`
      CREATE TABLE IF NOT EXISTS user_preferences (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        public_key TEXT NOT NULL,
        preference_key TEXT NOT NULL,
        preference_value TEXT NOT NULL,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        UNIQUE (public_key, preference_key)
      )
    `);
  }

  /**
   * Create analytics tables
   */
  async createAnalyticsTables(db) {
    // Post engagement tracking
    await db.query(`
      CREATE TABLE IF NOT EXISTS post_engagement (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        post_id INTEGER NOT NULL,
        engagement_type TEXT NOT NULL,
        engagement_data TEXT NULL,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Daily analytics aggregation
    await db.query(`
      CREATE TABLE IF NOT EXISTS daily_analytics (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        date DATE UNIQUE NOT NULL,
        total_posts INTEGER DEFAULT 0,
        new_users INTEGER DEFAULT 0,
        total_views INTEGER DEFAULT 0,
        total_edits INTEGER DEFAULT 0,
        top_tags TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  /**
   * Create performance indexes
   */
  async createIndexes(db) {
    // Composite indexes for better query performance
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_author_created 
      ON posts (author_key, created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_created_engagement 
      ON posts (created_at DESC, id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_versions_post_created 
      ON post_versions (post_id, created_at DESC)
    `);

    // Full-text search simulation
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_posts_content_search 
      ON posts (content COLLATE NOCASE)
    `);

    // Additional search optimization indexes
    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_created_at 
      ON posts (created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_views_viewed_at 
      ON post_views (viewed_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_engagement_created 
      ON post_engagement (created_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_views_viewer_key_created 
      ON post_views (viewer_key, viewed_at DESC)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_analytics_date 
      ON daily_analytics (date)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_analytics_post_count 
      ON daily_analytics (date, total_posts)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_daily_analytics_total_views 
      ON daily_analytics (date, total_views)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_views_post_id 
      ON post_views (post_id)
    `);

    await db.query(`
      CREATE INDEX IF NOT EXISTS idx_post_engagement_post_id 
      ON post_engagement (post_id, created_at DESC)
    `);
  }

  /**
   * Populate search index for existing posts
   */
   async populateSearchIndex() {
    console.log('🔍 Populating search index...');
    
    try {
      const db = await this.getConnection();
      
      // First create the search_index table if it doesn't exist
      await db.query(`
        CREATE TABLE IF NOT EXISTS search_index (
          post_id INTEGER PRIMARY KEY,
          content_tokens TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES posts (id)
        )
      `);
      
      const posts = await db.query('SELECT id, content FROM posts');
      
      for (const post of posts) {
        const tokens = this.tokenizeContent(post.content);
        
        await db.query(`
          INSERT OR REPLACE INTO search_index (post_id, content_tokens)
          VALUES (?, ?)
        `, [post.id, JSON.stringify(tokens)]);
      }
      
      console.log(`✅ Search index populated for ${posts.length} posts`);
    } catch (error) {
      console.error('Error populating search index:', error);
      // Don't throw here - this is non-critical
    }
  }

  /**
   * Tokenize content for search indexing
   */
  tokenizeContent(content) {
    return content.toLowerCase()
      .replace(/[^\w\s]/g, '') // Remove special characters
      .split(/\s+/) // Split on whitespace
      .filter(word => word.length > 2) // Remove very short words
      .slice(0, 100); // Limit tokens to prevent large data
  }

  /**
   * Get database connection
   */
  async getConnection() {
    if (this.db.query) {
      return this.db;
    }
    
    // Add query method if missing (for compatibility with Database class)
    this.db.query = async (sql, params = []) => {
      return new Promise((resolve, reject) => {
        this.db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      });
    };
    
    return this.db;
  }

  /**
   * Update daily analytics
   */
  async updateDailyAnalytics(date = null) {
    const today = date || new Date().toISOString().split('T')[0];
    
    try {
      const db = await this.getConnection();
      
      const [postsToday] = await db.query(`
        SELECT COUNT(*) as count FROM posts 
        WHERE DATE(created_at) = ?
      `, [today]);

      const [totalViews] = await db.query(`
        SELECT COUNT(*) as count FROM post_views 
        WHERE DATE(viewed_at) = ?
      `, [today]);

      const [totalEdits] = await db.query(`
        SELECT COUNT(*) as count FROM post_versions 
        WHERE DATE(created_at) = ?
      `, [today]);

      await db.query(`
        INSERT OR REPLACE INTO daily_analytics 
            (date, total_posts, total_views, total_edits)
          VALUES (?, ?, ?, ?)
      `, [today, postsToday.count, totalViews.count, totalEdits.count]);
      
      console.log(`📊 Daily analytics updated for ${today}`);
    } catch (error) {
      console.error('Error updating daily analytics:', error);
    }
  }

  /**
   * Get analytics dashboard data
   */
  async getAnalyticsDashboard(days = 30) {
    try {
      const db = await this.getConnection();
      
      const dailyStats = await db.query(`
        SELECT * FROM daily_analytics 
        WHERE date >= DATE('now', '-${days} days')
        ORDER BY date DESC
      `);

      const topTags = await db.query(`
        SELECT 
          t.name,
          COUNT(pt.tag_id) as usage_count
        FROM tags t
        JOIN post_tags pt ON t.id = pt.tag_id
        JOIN posts p ON pt.post_id = p.id
        WHERE p.created_at >= DATE('now', '-7 days')
        GROUP BY t.id, t.name
        ORDER BY usage_count DESC
        LIMIT 10
      `);

      const activeUsers = await db.query(`
        SELECT COUNT(DISTINCT author_key) as count
        FROM posts 
        WHERE created_at >= DATE('now', '-7 days')
      `);

      const engagementMetrics = await db.query(`
        SELECT 
          engagement_type,
          COUNT(*) as count
        FROM post_engagement 
        WHERE created_at >= DATE('now', '-7 days')
        GROUP BY engagement_type
      `);

      return {
        dailyStats,
        topTags: topTags || [],
        activeUsersThisWeek: activeUsers?.[0]?.count || 0,
        engagementMetrics: engagementMetrics || [],
        period: `${days} days`
      };
    } catch (error) {
      console.error('Error getting analytics dashboard:', error);
      throw error;
    }
  }

  /**
   * Clean up old data
   */
  async cleanupOldData() {
    console.log('🧹 Cleaning up old data...');
    
    try {
      const db = await this.getConnection();
      
      await db.query(`
        DELETE FROM post_views 
        WHERE viewed_at < datetime('now', '-90 days')
      `);

      await db.query(`
        DELETE FROM post_engagement 
        WHERE created_at < datetime('now', '-30 days')
      `);

      await db.query(`
        DELETE FROM daily_analytics 
        WHERE date < DATE('now', '-365 days')
      `);

      // Update tag usage counts
      await db.query(`
        UPDATE tags SET usage_count = (
          SELECT COUNT(*) FROM post_tags 
          WHERE tag_id = tags.id
        )
      `);

      console.log('✅ Old data cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
    }
  }
}

module.exports = DatabaseSchema;