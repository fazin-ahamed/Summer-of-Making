import Database from 'better-sqlite3';
export { default as Neo4jGraphStore } from './neo4j_store';
export * from './neo4j_store';

// Database connection utilities
export interface DatabaseConfig {
  sqlite: {
    path: string;
    enableWAL?: boolean;
  };
  neo4j?: {
    uri: string;
    username: string;
    password: string;
    database?: string;
  };
  rocksdb?: {
    path: string;
  };
}

export class DatabaseManager {
  private config: DatabaseConfig;
  private neo4jStore?: Neo4jGraphStore;
  private sqliteDb?: Database.Database;

  constructor(config?: DatabaseConfig) {
    this.config = config || {
      sqlite: {
        path: process.env.SQLITE_PATH || './data/autoorganize.db',
        enableWAL: true,
      },
      neo4j: process.env.NEO4J_URI ? {
        uri: process.env.NEO4J_URI,
        username: process.env.NEO4J_USERNAME || 'neo4j',
        password: process.env.NEO4J_PASSWORD || 'password',
        database: process.env.NEO4J_DATABASE,
      } : undefined,
      rocksdb: {
        path: process.env.ROCKSDB_PATH || './data/graph.db',
      },
    };
  }

  async initialize(): Promise<void> {
    // Initialize SQLite database
    await this.initializeSQLite();

    // Initialize Neo4j if configured
    if (this.config.neo4j) {
      this.neo4jStore = new Neo4jGraphStore(this.config.neo4j);
      await this.neo4jStore.initialize();
    }
  }

  private async initializeSQLite(): Promise<void> {
    // Ensure data directory exists
    const path = require('path');
    const fs = require('fs').promises;
    const dataDir = path.dirname(this.config.sqlite.path);
    
    try {
      await fs.mkdir(dataDir, { recursive: true });
    } catch (error) {
      // Directory might already exist
    }

    // Create SQLite connection
    this.sqliteDb = new Database(this.config.sqlite.path);
    
    // Enable WAL mode for better performance
    if (this.config.sqlite.enableWAL) {
      this.sqliteDb.pragma('journal_mode = WAL');
    }

    // Create required tables
    this.createTables();
  }

  private createTables(): void {
    if (!this.sqliteDb) return;

    // Search history table
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS search_history (
        id TEXT PRIMARY KEY DEFAULT (hex(randomblob(16))),
        query TEXT NOT NULL,
        type TEXT NOT NULL,
        user_id TEXT,
        timestamp TEXT NOT NULL,
        result_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT (datetime('now'))
      )
    `);

    // Create indexes for search history
    this.sqliteDb.exec(`
      CREATE INDEX IF NOT EXISTS idx_search_history_user_id ON search_history (user_id);
      CREATE INDEX IF NOT EXISTS idx_search_history_timestamp ON search_history (timestamp);
      CREATE INDEX IF NOT EXISTS idx_search_history_query ON search_history (query);
    `);

    // Documents table (if not exists from Rust core)
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        source_type TEXT NOT NULL,
        file_path TEXT NOT NULL UNIQUE,
        content_hash TEXT NOT NULL,
        ingested_at INTEGER NOT NULL,
        modified_at INTEGER NOT NULL,
        metadata TEXT NOT NULL DEFAULT '{}',
        title TEXT NOT NULL,
        content TEXT
      )
    `);

    // Entities table (if not exists from Rust core)
    this.sqliteDb.exec(`
      CREATE TABLE IF NOT EXISTS entities (
        id TEXT PRIMARY KEY,
        entity_type TEXT NOT NULL,
        name TEXT NOT NULL,
        properties TEXT NOT NULL DEFAULT '{}',
        created_at INTEGER NOT NULL,
        confidence REAL
      )
    `);

    // FTS5 table for search
    this.sqliteDb.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
        title,
        content,
        content_id UNINDEXED
      )
    `);
  }

  getSQLiteConnection(): Database.Database {
    if (!this.sqliteDb) {
      throw new Error('SQLite database not initialized');
    }
    return this.sqliteDb;
  }

  getGraphStore(): Neo4jGraphStore | undefined {
    return this.neo4jStore;
  }

  async close(): Promise<void> {
    if (this.sqliteDb) {
      this.sqliteDb.close();
    }
    if (this.neo4jStore) {
      await this.neo4jStore.close();
    }
  }

  async healthCheck(): Promise<{ [key: string]: boolean }> {
    const health: { [key: string]: boolean } = {};

    // Check SQLite
    try {
      if (this.sqliteDb) {
        this.sqliteDb.prepare('SELECT 1').get();
        health.sqlite = true;
      } else {
        health.sqlite = false;
      }
    } catch (error) {
      health.sqlite = false;
    }

    // Check Neo4j
    if (this.neo4jStore) {
      health.neo4j = await this.neo4jStore.verifyConnectivity();
    }

    return health;
  }
}