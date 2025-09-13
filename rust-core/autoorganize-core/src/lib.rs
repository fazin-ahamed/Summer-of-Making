use std::sync::Arc;
use std::collections::HashMap;
use tokio::sync::RwLock;
use anyhow::Result;
use serde::{Deserialize, Serialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};

use autoorganize_file_watcher::{FileWatcher, FileWatcherEvent};
use autoorganize_encryption::EncryptionEngine;
use autoorganize_ingestion::IngestionEngine;
use autoorganize_search::SearchEngine;

pub mod database;
pub mod ffi;

pub use ffi::*;

// Re-export the main uniffi types
uniffi::include_scaffolding!("autoorganize");

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentInfo {
    pub id: String,
    pub source_type: String,
    pub file_path: String,
    pub content_hash: String,
    pub ingested_at: i64,
    pub modified_at: i64,
    pub metadata_json: String,
    pub title: String,
    pub content: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub id: String,
    pub entity_type: String,
    pub name: String,
    pub properties_json: String,
    pub created_at: i64,
    pub confidence: Option<f64>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub result_type: String,
    pub title: String,
    pub snippet: String,
    pub relevance_score: f64,
    pub source_json: String,
    pub metadata_json: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct FileEvent {
    pub event_type: String,
    pub file_path: String,
    pub timestamp: i64,
    pub metadata_json: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestionConfig {
    pub watch_paths: Vec<String>,
    pub file_patterns: Vec<String>,
    pub exclude_patterns: Vec<String>,
    pub auto_extract_entities: bool,
    pub auto_build_relationships: bool,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionConfig {
    pub enabled: bool,
    pub algorithm: String,
    pub key_derivation: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CoreConfig {
    pub db_path: String,
    pub ingestion_config: IngestionConfig,
    pub encryption_config: Option<EncryptionConfig>,
}

#[derive(Debug, thiserror::Error)]
pub enum AutoOrganizeError {
    #[error("Invalid configuration: {0}")]
    InvalidConfig(String),
    #[error("Database error: {0}")]
    DatabaseError(String),
    #[error("File system error: {0}")]
    FileSystemError(String),
    #[error("Encryption error: {0}")]
    EncryptionError(String),
    #[error("Ingestion error: {0}")]
    IngestionError(String),
    #[error("Search error: {0}")]
    SearchError(String),
}

pub struct AutoOrganizeCore {
    config: CoreConfig,
    database: Arc<RwLock<database::Database>>,
    file_watcher: Option<Arc<FileWatcher>>,
    encryption_engine: Option<Arc<EncryptionEngine>>,
    ingestion_engine: Arc<IngestionEngine>,
    search_engine: Arc<SearchEngine>,
    runtime: Arc<tokio::runtime::Runtime>,
    initialized: Arc<RwLock<bool>>,
}

impl AutoOrganizeCore {
    pub fn new(config: CoreConfig) -> Self {
        let runtime = Arc::new(
            tokio::runtime::Runtime::new()
                .expect("Failed to create async runtime")
        );
        
        let database = Arc::new(RwLock::new(
            database::Database::new(&config.db_path)
                .expect("Failed to initialize database")
        ));
        
        let encryption_engine = config.encryption_config.as_ref().map(|enc_config| {
            Arc::new(EncryptionEngine::new(enc_config.clone())
                .expect("Failed to initialize encryption engine"))
        });
        
        let ingestion_engine = Arc::new(
            IngestionEngine::new(database.clone(), encryption_engine.clone())
                .expect("Failed to initialize ingestion engine")
        );
        
        let search_engine = Arc::new(
            SearchEngine::new(database.clone())
                .expect("Failed to initialize search engine")
        );
        
        Self {
            config,
            database,
            file_watcher: None,
            encryption_engine,
            ingestion_engine,
            search_engine,
            runtime,
            initialized: Arc::new(RwLock::new(false)),
        }
    }
    
    pub async fn initialize(&self) -> Result<(), AutoOrganizeError> {
        let mut initialized = self.initialized.write().await;
        if *initialized {
            return Ok(());
        }
        
        // Initialize database
        {
            let mut db = self.database.write().await;
            db.initialize()
                .map_err(|e| AutoOrganizeError::DatabaseError(e.to_string()))?;
        }
        
        // Initialize search engine
        self.search_engine.initialize().await
            .map_err(|e| AutoOrganizeError::SearchError(e.to_string()))?;
        
        *initialized = true;
        Ok(())
    }
    
    pub async fn shutdown(&self) {
        if let Some(watcher) = &self.file_watcher {
            watcher.stop().await;
        }
        
        let mut initialized = self.initialized.write().await;
        *initialized = false;
    }
    
    pub async fn start_file_watching(
        &mut self,
        paths: Vec<String>,
        callback: Box<dyn FileWatcherCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        let watcher = FileWatcher::new(paths, callback)
            .map_err(|e| AutoOrganizeError::FileSystemError(e.to_string()))?;
        
        watcher.start().await
            .map_err(|e| AutoOrganizeError::FileSystemError(e.to_string()))?;
        
        self.file_watcher = Some(Arc::new(watcher));
        Ok(())
    }
    
    pub async fn stop_file_watching(&mut self) {
        if let Some(watcher) = &self.file_watcher {
            watcher.stop().await;
            self.file_watcher = None;
        }
    }
    
    pub async fn ingest_document(
        &self,
        file_path: String,
        callback: Box<dyn IngestionCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.ingestion_engine.ingest_file(&file_path, callback).await
            .map_err(|e| AutoOrganizeError::IngestionError(e.to_string()))
    }
    
    pub async fn search_documents(
        &self,
        query: String,
        callback: Box<dyn SearchCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.search_engine.search_documents(&query, callback).await
            .map_err(|e| AutoOrganizeError::SearchError(e.to_string()))
    }
    
    pub async fn get_document_count(&self) -> u64 {
        let db = self.database.read().await;
        db.get_document_count().unwrap_or(0)
    }
    
    pub async fn get_entity_count(&self) -> u64 {
        let db = self.database.read().await;
        db.get_entity_count().unwrap_or(0)
    }
    
    pub fn get_health_status(&self) -> String {
        serde_json::json!({
            "status": "healthy",
            "timestamp": Utc::now().timestamp(),
            "components": {
                "database": "healthy",
                "ingestion": "healthy",
                "search": "healthy",
                "file_watcher": self.file_watcher.is_some()
            }
        }).to_string()
    }
}

// Callback trait definitions
pub trait FileWatcherCallback: Send + Sync {
    fn on_file_event(&self, event: FileEvent);
}

pub trait IngestionCallback: Send + Sync {
    fn on_document_ingested(&self, document: DocumentInfo);
    fn on_ingestion_error(&self, error_message: String);
}

pub trait SearchCallback: Send + Sync {
    fn on_search_results(&self, results: Vec<SearchResult>);
    fn on_search_error(&self, error_message: String);
}