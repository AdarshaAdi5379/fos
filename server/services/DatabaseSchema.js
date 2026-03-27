/**
 * Fixed Database Schema
 * 
 * Completely rewritten to fix syntax errors.
 */

const dbConfig = require('../../config/database');

class DatabaseSchema {
  constructor(database) {
    this.db = database;
  }

  async getConnection() {
    if (!this.db) {
      this.db = await dbConfig.getConnection();
    }
    return this.db;
  }

  async initializeAdvancedSchema() {
    try {
      console.log('🗄️ Initializing advanced database schema...');
      
      const db = await this.getConnection();
      
      await this.createPostViewsTable(db);
      await this.createTagsTable(db);
      await this.createUserPreferencesTable(db);
      await this.createAnalyticsTables(db);
      await this.createIndexes(db);
      
      console.log('✅ Advanced schema initialized successfully');
    } catch (error) {
      console.error('❌ Failed to initialize advanced schema:', error);
      throw error;
    }
  }

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
  }

    async populateSearchIndex() {
    console.log('🔍 Populating search index...');
    
    const posts = await db.query('SELECT id, content FROM posts');
    
    for (const post of posts) {
      const tokens = this.tokenizeContent(post.content);
      
      await db.query(`
        INSERT OR REPLACE INTO search_index (post_id, content_tokens)
        VALUES (?, ?)
      `, [post.id, JSON.stringify(tokens)]);
    }
    
    console.log(`✅ Search index populated for ${posts.length} posts`);
  }

  /**
   * Update daily analytics
   */
  async updateDailyAnalytics(date = null) {
    const today = date || new Date().toISOString().split('T')[0];
    
    try {
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
          VALUES (?, ?, ?, ?, ?)
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
      const dailyStats = await db.query(`
        SELECT * FROM daily_analytics 
        WHERE date >= DATE('now', '-${days} days')
        ORDER BY date DESC
      `);

      const [topTags] = await db.query(`
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

      const [activeUsers] = await db.query(`
        SELECT COUNT(DISTINCT author_key) as count
        FROM posts 
        WHERE created_at >= DATE('now', '-7 days')
      `);

      const [engagementMetrics] = await db.query(`
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
        activeUsersThisWeek: activeUsers?.count || 0,
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

      console.log('✅ Old data cleanup completed');
    } catch (error) {
      console.error('Error during cleanup:', error);
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
  }
}

module.exports = DatabaseSchema;