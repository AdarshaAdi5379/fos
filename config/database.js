// Database configuration and connection management
const config = require('./environment');
const sqlite3 = require('sqlite3').verbose();
const path = require('path');

class DatabaseConfig {
  constructor() {
    this.dbConfig = config.database;
    this.connection = null;
  }

  async getConnection() {
    if (this.connection) {
      return this.connection;
    }

    try {
      if (this.dbConfig.type === 'sqlite') {
        this.connection = await this.createSQLiteConnection();
      } else if (this.dbConfig.type === 'postgresql') {
        this.connection = await this.createPostgreSQLConnection();
      } else {
        throw new Error(`Unsupported database type: ${this.dbConfig.type}`);
      }
      
      return this.connection;
    } catch (error) {
      console.error('Database connection error:', error);
      throw error;
    }
  }

  async createSQLiteConnection() {
    return new Promise((resolve, reject) => {
      const db = new sqlite3.Database(this.dbConfig.path, (err) => {
        if (err) {
          console.error('SQLite connection error:', err);
          reject(err);
        } else {
          console.log('Connected to SQLite database');
          resolve(db);
        }
      });
    });
  }

  async createPostgreSQLConnection() {
    const { Pool } = require('pg');
    
    const pool = new Pool({
      connectionString: this.dbConfig.url,
      host: this.dbConfig.host,
      port: this.dbConfig.port,
      database: this.dbConfig.database,
      user: this.dbConfig.username,
      password: this.dbConfig.password,
      max: 20, // Maximum number of connections
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });

    // Test connection
    try {
      const client = await pool.connect();
      client.release();
      console.log('Connected to PostgreSQL database');
      return pool;
    } catch (error) {
      console.error('PostgreSQL connection error:', error);
      throw error;
    }
  }

  async initializeDatabase() {
    const db = await this.getConnection();
    
    if (this.dbConfig.type === 'sqlite') {
      await this.initializeSQLiteTables(db);
    } else if (this.dbConfig.type === 'postgresql') {
      await this.initializePostgreSQLTables(db);
    }
  }

  async initializeSQLiteTables(db) {
    return new Promise((resolve, reject) => {
      db.serialize(() => {
        // Create identities table
        db.run(`
          CREATE TABLE IF NOT EXISTS identities (
            public_key TEXT PRIMARY KEY,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            last_seen DATETIME DEFAULT CURRENT_TIMESTAMP
          )
        `);

        // Create posts table with proper indexes
        db.run(`
          CREATE TABLE IF NOT EXISTS posts (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_uuid TEXT UNIQUE NOT NULL,
            author_key TEXT NOT NULL,
            content TEXT NOT NULL,
            signature TEXT NOT NULL,
            recovery INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (author_key) REFERENCES identities (public_key)
          )
        `);

        // Create post_versions table
        db.run(`
          CREATE TABLE IF NOT EXISTS post_versions (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            post_id INTEGER NOT NULL,
            version_number INTEGER NOT NULL,
            content TEXT NOT NULL,
            signature TEXT NOT NULL,
            recovery INTEGER NOT NULL,
            created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (post_id) REFERENCES posts (id)
          )
        `);

        // Create indexes for performance
        db.run(`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_posts_author_key ON posts (author_key)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_posts_uuid ON posts (post_uuid)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_post_versions_post_id ON post_versions (post_id)`);
        db.run(`CREATE INDEX IF NOT EXISTS idx_post_versions_created_at ON post_versions (created_at DESC)`);

        console.log('SQLite tables initialized successfully');
        resolve();
      });
    });
  }

  async initializePostgreSQLTables(pool) {
    const client = await pool.connect();
    
    try {
      await client.query('BEGIN');

      // Create identities table
      await client.query(`
        CREATE TABLE IF NOT EXISTS identities (
          public_key TEXT PRIMARY KEY,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
        )
      `);

      // Create posts table
      await client.query(`
        CREATE TABLE IF NOT EXISTS posts (
          id SERIAL PRIMARY KEY,
          post_uuid TEXT UNIQUE NOT NULL,
          author_key TEXT NOT NULL,
          content TEXT NOT NULL,
          signature TEXT NOT NULL,
          recovery INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (author_key) REFERENCES identities (public_key)
        )
      `);

      // Create post_versions table
      await client.query(`
        CREATE TABLE IF NOT EXISTS post_versions (
          id SERIAL PRIMARY KEY,
          post_id INTEGER NOT NULL,
          version_number INTEGER NOT NULL,
          content TEXT NOT NULL,
          signature TEXT NOT NULL,
          recovery INTEGER NOT NULL,
          created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (post_id) REFERENCES posts (id)
        )
      `);

      // Create indexes
      await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_created_at ON posts (created_at DESC)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_author_key ON posts (author_key)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_posts_uuid ON posts (post_uuid)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_post_versions_post_id ON post_versions (post_id)`);
      await client.query(`CREATE INDEX IF NOT EXISTS idx_post_versions_created_at ON post_versions (created_at DESC)`);

      await client.query('COMMIT');
      console.log('PostgreSQL tables initialized successfully');
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  async close() {
    if (this.connection) {
      if (this.dbConfig.type === 'sqlite') {
        return new Promise((resolve) => {
          this.connection.close((err) => {
            if (err) {
              console.error('Error closing SQLite database:', err);
            } else {
              console.log('SQLite database closed');
            }
            resolve();
          });
        });
      } else if (this.dbConfig.type === 'postgresql') {
        await this.connection.end();
        console.log('PostgreSQL connection closed');
      }
    }
  }

  // Query helper methods
  async query(sql, params = []) {
    const db = await this.getConnection();
    
    if (this.dbConfig.type === 'sqlite') {
      return this.querySQLite(db, sql, params);
    } else if (this.dbConfig.type === 'postgresql') {
      return this.queryPostgreSQL(db, sql, params);
    }
  }

  async querySQLite(db, sql, params) {
    return new Promise((resolve, reject) => {
      if (sql.trim().toLowerCase().startsWith('select')) {
        db.all(sql, params, (err, rows) => {
          if (err) reject(err);
          else resolve(rows);
        });
      } else if (sql.trim().toLowerCase().startsWith('insert')) {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ id: this.lastID, changes: this.changes });
        });
      } else {
        db.run(sql, params, function(err) {
          if (err) reject(err);
          else resolve({ changes: this.changes });
        });
      }
    });
  }

  async queryPostgreSQL(pool, sql, params) {
    const client = await pool.connect();
    
    try {
      const result = await client.query(sql, params);
      
      if (sql.trim().toLowerCase().startsWith('select')) {
        return result.rows;
      } else {
        return { 
          id: result.rows[0]?.id, 
          changes: result.rowCount 
        };
      }
    } finally {
      client.release();
    }
  }
}

module.exports = new DatabaseConfig();