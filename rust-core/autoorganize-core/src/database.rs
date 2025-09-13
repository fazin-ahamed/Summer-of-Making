use std::path::Path;
use anyhow::{Result, anyhow};
use rusqlite::{Connection, params, Row};
use serde_json::Value;
use uuid::Uuid;
use chrono::{DateTime, Utc};

use crate::{DocumentInfo, Entity, SearchResult};

pub struct Database {
    conn: Connection,
}

impl Database {
    pub fn new<P: AsRef<Path>>(db_path: P) -> Result<Self> {
        let conn = Connection::open(db_path)?;
        Ok(Self { conn })
    }
    
    pub fn initialize(&mut self) -> Result<()> {
        self.create_tables()?;
        self.create_indexes()?;
        self.enable_fts()?;
        Ok(())
    }
    
    fn create_tables(&self) -> Result<()> {
        // Documents table
        self.conn.execute(
            r#"
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
            "#,
            [],
        )?;
        
        // Document chunks for vector search
        self.conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS document_chunks (
                id TEXT PRIMARY KEY,
                document_id TEXT NOT NULL,
                content TEXT NOT NULL,
                chunk_index INTEGER NOT NULL,
                embedding BLOB,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
            )
            "#,
            [],
        )?;
        
        // Entities table
        self.conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS entities (
                id TEXT PRIMARY KEY,
                entity_type TEXT NOT NULL,
                name TEXT NOT NULL,
                properties TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                confidence REAL
            )
            "#,
            [],
        )?;
        
        // Entity mentions in documents
        self.conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS entity_mentions (
                id TEXT PRIMARY KEY,
                entity_id TEXT NOT NULL,
                document_id TEXT NOT NULL,
                start_position INTEGER NOT NULL,
                end_position INTEGER NOT NULL,
                confidence REAL NOT NULL,
                FOREIGN KEY (entity_id) REFERENCES entities (id) ON DELETE CASCADE,
                FOREIGN KEY (document_id) REFERENCES documents (id) ON DELETE CASCADE
            )
            "#,
            [],
        )?;
        
        // Relationships between entities
        self.conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS relationships (
                id TEXT PRIMARY KEY,
                source_entity_id TEXT NOT NULL,
                target_entity_id TEXT NOT NULL,
                relationship_type TEXT NOT NULL,
                strength REAL NOT NULL DEFAULT 1.0,
                properties TEXT NOT NULL DEFAULT '{}',
                created_at INTEGER NOT NULL,
                FOREIGN KEY (source_entity_id) REFERENCES entities (id) ON DELETE CASCADE,
                FOREIGN KEY (target_entity_id) REFERENCES entities (id) ON DELETE CASCADE
            )
            "#,
            [],
        )?;
        
        // File system events log
        self.conn.execute(
            r#"
            CREATE TABLE IF NOT EXISTS file_events (
                id TEXT PRIMARY KEY,
                event_type TEXT NOT NULL,
                file_path TEXT NOT NULL,
                timestamp INTEGER NOT NULL,
                metadata TEXT DEFAULT '{}'
            )
            "#,
            [],
        )?;
        
        Ok(())
    }
    
    fn create_indexes(&self) -> Result<()> {
        // Document indexes
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_source_type ON documents (source_type)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_modified_at ON documents (modified_at)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_documents_file_path ON documents (file_path)", [])?;
        
        // Entity indexes
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_entities_type ON entities (entity_type)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_entities_name ON entities (name)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_entities_created_at ON entities (created_at)", [])?;
        
        // Entity mention indexes
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_entity_mentions_entity_id ON entity_mentions (entity_id)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_entity_mentions_document_id ON entity_mentions (document_id)", [])?;
        
        // Relationship indexes
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_relationships_source ON relationships (source_entity_id)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_relationships_target ON relationships (target_entity_id)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_relationships_type ON relationships (relationship_type)", [])?;
        
        // File event indexes
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_file_events_timestamp ON file_events (timestamp)", [])?;
        self.conn.execute("CREATE INDEX IF NOT EXISTS idx_file_events_file_path ON file_events (file_path)", [])?;
        
        Ok(())
    }
    
    fn enable_fts(&self) -> Result<()> {
        // Create FTS5 virtual table for full-text search
        self.conn.execute(
            r#"
            CREATE VIRTUAL TABLE IF NOT EXISTS documents_fts USING fts5(
                title,
                content,
                content_id UNINDEXED
            )
            "#,
            [],
        )?;
        
        // Create trigger to keep FTS table in sync
        self.conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS documents_fts_insert AFTER INSERT ON documents BEGIN
                INSERT INTO documents_fts(title, content, content_id) VALUES (new.title, new.content, new.id);
            END
            "#,
            [],
        )?;
        
        self.conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS documents_fts_update AFTER UPDATE ON documents BEGIN
                UPDATE documents_fts SET title = new.title, content = new.content WHERE content_id = new.id;
            END
            "#,
            [],
        )?;
        
        self.conn.execute(
            r#"
            CREATE TRIGGER IF NOT EXISTS documents_fts_delete AFTER DELETE ON documents BEGIN
                DELETE FROM documents_fts WHERE content_id = old.id;
            END
            "#,
            [],
        )?;
        
        Ok(())
    }
    
    pub fn insert_document(&self, document: &DocumentInfo) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT OR REPLACE INTO documents 
            (id, source_type, file_path, content_hash, ingested_at, modified_at, metadata, title, content)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
            "#,
            params![
                document.id,
                document.source_type,
                document.file_path,
                document.content_hash,
                document.ingested_at,
                document.modified_at,
                document.metadata_json,
                document.title,
                document.content
            ],
        )?;
        Ok(())
    }
    
    pub fn get_document_by_id(&self, id: &str) -> Result<Option<DocumentInfo>> {
        let mut stmt = self.conn.prepare(
            "SELECT id, source_type, file_path, content_hash, ingested_at, modified_at, metadata, title, content 
             FROM documents WHERE id = ?1"
        )?;
        
        let mut rows = stmt.query_map([id], |row| {
            Ok(DocumentInfo {
                id: row.get(0)?,
                source_type: row.get(1)?,
                file_path: row.get(2)?,
                content_hash: row.get(3)?,
                ingested_at: row.get(4)?,
                modified_at: row.get(5)?,
                metadata_json: row.get(6)?,
                title: row.get(7)?,
                content: row.get(8)?,
            })
        })?;
        
        match rows.next() {
            Some(row) => Ok(Some(row?)),
            None => Ok(None),
        }
    }
    
    pub fn get_documents(&self, limit: Option<u32>, offset: Option<u32>) -> Result<Vec<DocumentInfo>> {
        let limit = limit.unwrap_or(50);
        let offset = offset.unwrap_or(0);
        
        let mut stmt = self.conn.prepare(
            "SELECT id, source_type, file_path, content_hash, ingested_at, modified_at, metadata, title, content 
             FROM documents ORDER BY modified_at DESC LIMIT ?1 OFFSET ?2"
        )?;
        
        let rows = stmt.query_map([limit, offset], |row| {
            Ok(DocumentInfo {
                id: row.get(0)?,
                source_type: row.get(1)?,
                file_path: row.get(2)?,
                content_hash: row.get(3)?,
                ingested_at: row.get(4)?,
                modified_at: row.get(5)?,
                metadata_json: row.get(6)?,
                title: row.get(7)?,
                content: row.get(8)?,
            })
        })?;
        
        let mut documents = Vec::new();
        for row in rows {
            documents.push(row?);
        }
        Ok(documents)
    }
    
    pub fn search_documents(&self, query: &str, limit: Option<u32>) -> Result<Vec<SearchResult>> {
        let limit = limit.unwrap_or(20);
        
        let mut stmt = self.conn.prepare(
            r#"
            SELECT d.id, d.title, snippet(documents_fts, 1, '<mark>', '</mark>', '...', 32) as snippet,
                   rank, d.source_type, d.metadata
            FROM documents_fts
            JOIN documents d ON documents_fts.content_id = d.id
            WHERE documents_fts MATCH ?1
            ORDER BY rank
            LIMIT ?2
            "#
        )?;
        
        let rows = stmt.query_map([query, &limit.to_string()], |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                result_type: "document".to_string(),
                title: row.get(1)?,
                snippet: row.get(2)?,
                relevance_score: row.get::<_, f64>(3)?,
                source_json: row.get(4)?,
                metadata_json: row.get(5)?,
            })
        })?;
        
        let mut results = Vec::new();
        for row in rows {
            results.push(row?);
        }
        Ok(results)
    }
    
    pub fn insert_entity(&self, entity: &Entity) -> Result<()> {
        self.conn.execute(
            r#"
            INSERT OR REPLACE INTO entities 
            (id, entity_type, name, properties, created_at, confidence)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6)
            "#,
            params![
                entity.id,
                entity.entity_type,
                entity.name,
                entity.properties_json,
                entity.created_at,
                entity.confidence
            ],
        )?;
        Ok(())
    }
    
    pub fn get_entities(&self, entity_type: Option<&str>, limit: Option<u32>) -> Result<Vec<Entity>> {
        let limit = limit.unwrap_or(50);
        
        let (query, params): (String, Vec<&dyn rusqlite::ToSql>) = match entity_type {
            Some(etype) => (
                "SELECT id, entity_type, name, properties, created_at, confidence 
                 FROM entities WHERE entity_type = ?1 ORDER BY created_at DESC LIMIT ?2".to_string(),
                vec![&etype, &limit.to_string()]
            ),
            None => (
                "SELECT id, entity_type, name, properties, created_at, confidence 
                 FROM entities ORDER BY created_at DESC LIMIT ?1".to_string(),
                vec![&limit.to_string()]
            ),
        };
        
        let mut stmt = self.conn.prepare(&query)?;
        let rows = stmt.query_map(rusqlite::params_from_iter(params), |row| {
            Ok(Entity {
                id: row.get(0)?,
                entity_type: row.get(1)?,
                name: row.get(2)?,
                properties_json: row.get(3)?,
                created_at: row.get(4)?,
                confidence: row.get(5)?,
            })
        })?;
        
        let mut entities = Vec::new();
        for row in rows {
            entities.push(row?);
        }
        Ok(entities)
    }
    
    pub fn get_document_count(&self) -> Result<u64> {
        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM documents")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count as u64)
    }
    
    pub fn get_entity_count(&self) -> Result<u64> {
        let mut stmt = self.conn.prepare("SELECT COUNT(*) FROM entities")?;
        let count: i64 = stmt.query_row([], |row| row.get(0))?;
        Ok(count as u64)
    }
    
    pub fn delete_document(&self, id: &str) -> Result<()> {
        self.conn.execute("DELETE FROM documents WHERE id = ?1", [id])?;
        Ok(())
    }
    
    pub fn log_file_event(&self, event_type: &str, file_path: &str, metadata: Option<&str>) -> Result<()> {
        let id = Uuid::new_v4().to_string();
        let timestamp = Utc::now().timestamp();
        let metadata = metadata.unwrap_or("{}");
        
        self.conn.execute(
            "INSERT INTO file_events (id, event_type, file_path, timestamp, metadata) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![id, event_type, file_path, timestamp, metadata],
        )?;
        Ok(())
    }
}