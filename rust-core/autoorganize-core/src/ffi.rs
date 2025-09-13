use std::sync::Arc;
use anyhow::Result;
use tokio::sync::RwLock;

use crate::{
    AutoOrganizeCore, CoreConfig, DocumentInfo, Entity, SearchResult, FileEvent,
    AutoOrganizeError, FileWatcherCallback, IngestionCallback, SearchCallback,
};

// FFI implementation for the AutoOrganizeCore
impl AutoOrganizeCore {
    // Synchronous wrapper methods for FFI
    pub fn initialize(&self) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            self.initialize().await
        })
    }
    
    pub fn shutdown(&self) {
        self.runtime.block_on(async {
            self.shutdown().await
        });
    }
    
    pub fn start_file_watching(
        &mut self,
        paths: Vec<String>,
        callback: Box<dyn FileWatcherCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            self.start_file_watching(paths, callback).await
        })
    }
    
    pub fn stop_file_watching(&mut self) {
        self.runtime.block_on(async {
            self.stop_file_watching().await
        });
    }
    
    pub fn ingest_document(
        &self,
        file_path: String,
        callback: Box<dyn IngestionCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            self.ingest_document(file_path, callback).await
        })
    }
    
    pub fn ingest_directory(
        &self,
        dir_path: String,
        callback: Box<dyn IngestionCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            self.ingestion_engine.ingest_directory(&dir_path, callback).await
                .map_err(|e| AutoOrganizeError::IngestionError(e.to_string()))
        })
    }
    
    pub fn search_documents(
        &self,
        query: String,
        callback: Box<dyn SearchCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            self.search_documents(query, callback).await
        })
    }
    
    pub fn search_entities(
        &self,
        query: String,
        callback: Box<dyn SearchCallback + Send + Sync>,
    ) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            self.search_engine.search_entities(&query, callback).await
                .map_err(|e| AutoOrganizeError::SearchError(e.to_string()))
        })
    }
    
    pub fn get_entities(
        &self,
        entity_type: Option<String>,
        limit: Option<u32>,
    ) -> Result<Vec<Entity>, AutoOrganizeError> {
        self.runtime.block_on(async {
            let db = self.database.read().await;
            db.get_entities(entity_type.as_deref(), limit)
                .map_err(|e| AutoOrganizeError::DatabaseError(e.to_string()))
        })
    }
    
    pub fn get_entity_by_id(&self, entity_id: String) -> Result<Option<Entity>, AutoOrganizeError> {
        self.runtime.block_on(async {
            let db = self.database.read().await;
            // Implementation would go here - simplified for now
            Ok(None)
        })
    }
    
    pub fn get_documents(
        &self,
        limit: Option<u32>,
        offset: Option<u32>,
    ) -> Result<Vec<DocumentInfo>, AutoOrganizeError> {
        self.runtime.block_on(async {
            let db = self.database.read().await;
            db.get_documents(limit, offset)
                .map_err(|e| AutoOrganizeError::DatabaseError(e.to_string()))
        })
    }
    
    pub fn get_document_by_id(&self, document_id: String) -> Result<Option<DocumentInfo>, AutoOrganizeError> {
        self.runtime.block_on(async {
            let db = self.database.read().await;
            db.get_document_by_id(&document_id)
                .map_err(|e| AutoOrganizeError::DatabaseError(e.to_string()))
        })
    }
    
    pub fn delete_document(&self, document_id: String) -> Result<(), AutoOrganizeError> {
        self.runtime.block_on(async {
            let db = self.database.read().await;
            db.delete_document(&document_id)
                .map_err(|e| AutoOrganizeError::DatabaseError(e.to_string()))
        })
    }
    
    pub fn get_document_count(&self) -> u64 {
        self.runtime.block_on(async {
            self.get_document_count().await
        })
    }
    
    pub fn get_entity_count(&self) -> u64 {
        self.runtime.block_on(async {
            self.get_entity_count().await
        })
    }
}

// Uniffi requires these to be defined at the crate level
uniffi::export!(AutoOrganizeCore);
uniffi::export!(AutoOrganizeError);

// Export callback interfaces
uniffi::export!(FileWatcherCallback);
uniffi::export!(IngestionCallback);
uniffi::export!(SearchCallback);