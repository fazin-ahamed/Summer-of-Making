use std::path::{Path, PathBuf};
use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::{Result, anyhow};
use serde::{Serialize, Deserialize};
use uuid::Uuid;
use chrono::{DateTime, Utc};
use walkdir::WalkDir;
use regex::Regex;
use tracing::{info, warn, error, debug};

use autoorganize_encryption::EncryptionEngine;

pub mod processors;
pub mod extractors;

use processors::*;
use extractors::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub file_size: u64,
    pub mime_type: String,
    pub created_at: Option<DateTime<Utc>>,
    pub modified_at: DateTime<Utc>,
    pub language: Option<String>,
    pub encoding: Option<String>,
    pub word_count: Option<u32>,
    pub char_count: Option<u32>,
    pub page_count: Option<u32>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ProcessedDocument {
    pub id: String,
    pub file_path: PathBuf,
    pub title: String,
    pub content: String,
    pub content_hash: String,
    pub metadata: DocumentMetadata,
    pub entities: Vec<ExtractedEntity>,
    pub chunks: Vec<DocumentChunk>,
    pub source_type: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentChunk {
    pub id: String,
    pub content: String,
    pub chunk_index: u32,
    pub start_position: u32,
    pub end_position: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct ExtractedEntity {
    pub id: String,
    pub entity_type: String,
    pub name: String,
    pub confidence: f64,
    pub start_position: u32,
    pub end_position: u32,
    pub properties: serde_json::Value,
}

#[derive(Debug, Clone)]
pub struct IngestionConfig {
    pub max_file_size: u64,
    pub chunk_size: usize,
    pub chunk_overlap: usize,
    pub supported_extensions: Vec<String>,
    pub extract_entities: bool,
    pub extract_relationships: bool,
    pub ocr_enabled: bool,
}

impl Default for IngestionConfig {
    fn default() -> Self {
        Self {
            max_file_size: 100 * 1024 * 1024, // 100MB
            chunk_size: 1000,
            chunk_overlap: 200,
            supported_extensions: vec![
                "txt".to_string(), "md".to_string(), "pdf".to_string(),
                "docx".to_string(), "html".to_string(), "csv".to_string(),
                "json".to_string(), "xml".to_string(), "rtf".to_string(),
            ],
            extract_entities: true,
            extract_relationships: true,
            ocr_enabled: false,
        }
    }
}

pub trait IngestionCallback: Send + Sync {
    fn on_document_processed(&self, document: &ProcessedDocument);
    fn on_error(&self, file_path: &Path, error: &str);
    fn on_progress(&self, processed: usize, total: usize);
}

pub struct IngestionEngine {
    config: IngestionConfig,
    processors: Vec<Box<dyn DocumentProcessor>>,
    entity_extractor: Box<dyn EntityExtractor>,
    encryption_engine: Option<Arc<EncryptionEngine>>,
}

impl IngestionEngine {
    pub fn new(
        config: IngestionConfig,
        encryption_engine: Option<Arc<EncryptionEngine>>,
    ) -> Result<Self> {
        let mut processors: Vec<Box<dyn DocumentProcessor>> = vec![
            Box::new(TextProcessor::new()),
            Box::new(PdfProcessor::new()),
            Box::new(DocxProcessor::new()),
            Box::new(HtmlProcessor::new()),
            Box::new(CsvProcessor::new()),
            Box::new(JsonProcessor::new()),
        ];

        let entity_extractor = Box::new(RegexEntityExtractor::new());

        Ok(Self {
            config,
            processors,
            entity_extractor,
            encryption_engine,
        })
    }

    pub async fn ingest_file<P: AsRef<Path>>(
        &self,
        file_path: P,
        callback: Box<dyn IngestionCallback>,
    ) -> Result<ProcessedDocument> {
        let file_path = file_path.as_ref();
        
        info!("Starting ingestion of file: {}", file_path.display());

        // Validate file
        self.validate_file(file_path)?;

        // Find appropriate processor
        let processor = self.find_processor(file_path)
            .ok_or_else(|| anyhow!("No processor found for file: {}", file_path.display()))?;

        // Process document
        let mut document = processor.process(file_path, &self.config).await?;

        // Extract entities if enabled
        if self.config.extract_entities {
            document.entities = self.entity_extractor.extract_entities(&document.content)?;
        }

        // Create chunks
        document.chunks = self.create_chunks(&document.content, &self.config);

        // Calculate content hash
        document.content_hash = self.calculate_content_hash(&document.content);

        // Encrypt if enabled
        if let Some(encryption) = &self.encryption_engine {
            if encryption.is_enabled() {
                document.content = self.encrypt_content(&document.content, encryption)?;
            }
        }

        callback.on_document_processed(&document);
        
        info!("Successfully ingested file: {}", file_path.display());
        Ok(document)
    }

    pub async fn ingest_directory<P: AsRef<Path>>(
        &self,
        dir_path: P,
        callback: Box<dyn IngestionCallback>,
    ) -> Result<Vec<ProcessedDocument>> {
        let dir_path = dir_path.as_ref();
        
        info!("Starting directory ingestion: {}", dir_path.display());

        if !dir_path.is_dir() {
            return Err(anyhow!("Path is not a directory: {}", dir_path.display()));
        }

        // Collect all files
        let mut files = Vec::new();
        for entry in WalkDir::new(dir_path).follow_links(false) {
            let entry = entry?;
            let path = entry.path();
            
            if path.is_file() && self.is_supported_file(path) {
                files.push(path.to_path_buf());
            }
        }

        let total_files = files.len();
        let mut processed_documents = Vec::new();
        
        info!("Found {} files to process", total_files);

        for (index, file_path) in files.into_iter().enumerate() {
            match self.ingest_file(&file_path, callback.as_ref()).await {
                Ok(document) => {
                    processed_documents.push(document);
                }
                Err(e) => {
                    error!("Failed to process file {}: {}", file_path.display(), e);
                    callback.on_error(&file_path, &e.to_string());
                }
            }
            
            callback.on_progress(index + 1, total_files);
        }

        info!("Directory ingestion completed. Processed {} files", processed_documents.len());
        Ok(processed_documents)
    }

    fn validate_file(&self, file_path: &Path) -> Result<()> {
        if !file_path.exists() {
            return Err(anyhow!("File does not exist: {}", file_path.display()));
        }

        if !file_path.is_file() {
            return Err(anyhow!("Path is not a file: {}", file_path.display()));
        }

        let metadata = std::fs::metadata(file_path)?;
        if metadata.len() > self.config.max_file_size {
            return Err(anyhow!("File too large: {} bytes", metadata.len()));
        }

        if !self.is_supported_file(file_path) {
            return Err(anyhow!("Unsupported file type: {}", file_path.display()));
        }

        Ok(())
    }

    fn is_supported_file(&self, file_path: &Path) -> bool {
        if let Some(extension) = file_path.extension() {
            if let Some(ext_str) = extension.to_str() {
                return self.config.supported_extensions.contains(&ext_str.to_lowercase());
            }
        }
        false
    }

    fn find_processor(&self, file_path: &Path) -> Option<&Box<dyn DocumentProcessor>> {
        self.processors.iter().find(|processor| {
            processor.can_process(file_path)
        })
    }

    fn create_chunks(&self, content: &str, config: &IngestionConfig) -> Vec<DocumentChunk> {
        let mut chunks = Vec::new();
        let words: Vec<&str> = content.split_whitespace().collect();
        
        if words.is_empty() {
            return chunks;
        }

        let mut start_idx = 0;
        let mut chunk_index = 0;

        while start_idx < words.len() {
            let end_idx = std::cmp::min(start_idx + config.chunk_size, words.len());
            let chunk_words = &words[start_idx..end_idx];
            let chunk_content = chunk_words.join(" ");

            let start_position = if start_idx == 0 {
                0
            } else {
                words[..start_idx].join(" ").len() as u32 + 1
            };

            let end_position = start_position + chunk_content.len() as u32;

            chunks.push(DocumentChunk {
                id: Uuid::new_v4().to_string(),
                content: chunk_content,
                chunk_index,
                start_position,
                end_position,
            });

            // Move to next chunk with overlap
            start_idx = if end_idx == words.len() {
                words.len() // End of content
            } else {
                std::cmp::max(start_idx + 1, end_idx - config.chunk_overlap)
            };
            
            chunk_index += 1;
        }

        chunks
    }

    fn calculate_content_hash(&self, content: &str) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        content.hash(&mut hasher);
        format!("{:x}", hasher.finish())
    }

    fn encrypt_content(&self, content: &str, encryption: &EncryptionEngine) -> Result<String> {
        let encrypted = encryption.encrypt_string(content)?;
        Ok(serde_json::to_string(&encrypted)?)
    }

    pub fn add_processor(&mut self, processor: Box<dyn DocumentProcessor>) {
        self.processors.push(processor);
    }

    pub fn set_entity_extractor(&mut self, extractor: Box<dyn EntityExtractor>) {
        self.entity_extractor = extractor;
    }

    pub fn get_config(&self) -> &IngestionConfig {
        &self.config
    }

    pub fn update_config(&mut self, config: IngestionConfig) {
        self.config = config;
    }

    pub fn get_supported_extensions(&self) -> &[String] {
        &self.config.supported_extensions
    }
}

// Utility functions for file type detection
pub struct FileTypeDetector;

impl FileTypeDetector {
    pub fn detect_mime_type(file_path: &Path) -> String {
        match file_path.extension().and_then(|ext| ext.to_str()) {
            Some("txt") => "text/plain".to_string(),
            Some("md") => "text/markdown".to_string(),
            Some("pdf") => "application/pdf".to_string(),
            Some("docx") => "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
            Some("html") | Some("htm") => "text/html".to_string(),
            Some("csv") => "text/csv".to_string(),
            Some("json") => "application/json".to_string(),
            Some("xml") => "application/xml".to_string(),
            Some("rtf") => "application/rtf".to_string(),
            _ => "application/octet-stream".to_string(),
        }
    }

    pub fn is_text_file(file_path: &Path) -> bool {
        let mime_type = Self::detect_mime_type(file_path);
        mime_type.starts_with("text/") || 
        mime_type == "application/json" ||
        mime_type == "application/xml"
    }

    pub fn is_binary_file(file_path: &Path) -> bool {
        !Self::is_text_file(file_path)
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;
    use std::fs;

    struct TestCallback {
        processed_count: std::sync::atomic::AtomicUsize,
    }

    impl TestCallback {
        fn new() -> Self {
            Self {
                processed_count: std::sync::atomic::AtomicUsize::new(0),
            }
        }

        fn get_processed_count(&self) -> usize {
            self.processed_count.load(std::sync::atomic::Ordering::SeqCst)
        }
    }

    impl IngestionCallback for TestCallback {
        fn on_document_processed(&self, _document: &ProcessedDocument) {
            self.processed_count.fetch_add(1, std::sync::atomic::Ordering::SeqCst);
        }

        fn on_error(&self, _file_path: &Path, _error: &str) {}
        fn on_progress(&self, _processed: usize, _total: usize) {}
    }

    #[tokio::test]
    async fn test_ingestion_engine_creation() {
        let config = IngestionConfig::default();
        let engine = IngestionEngine::new(config, None);
        assert!(engine.is_ok());
    }

    #[tokio::test]
    async fn test_text_file_ingestion() {
        let temp_dir = TempDir::new().unwrap();
        let file_path = temp_dir.path().join("test.txt");
        fs::write(&file_path, "This is a test document with some content.").unwrap();

        let config = IngestionConfig::default();
        let engine = IngestionEngine::new(config, None).unwrap();
        let callback = Box::new(TestCallback::new());

        let result = engine.ingest_file(&file_path, callback).await;
        assert!(result.is_ok());

        let document = result.unwrap();
        assert!(!document.content.is_empty());
        assert!(!document.chunks.is_empty());
    }

    #[test]
    fn test_file_type_detection() {
        use std::path::PathBuf;

        assert_eq!(
            FileTypeDetector::detect_mime_type(&PathBuf::from("test.txt")),
            "text/plain"
        );
        assert_eq!(
            FileTypeDetector::detect_mime_type(&PathBuf::from("test.pdf")),
            "application/pdf"
        );
        assert!(FileTypeDetector::is_text_file(&PathBuf::from("test.txt")));
        assert!(!FileTypeDetector::is_text_file(&PathBuf::from("test.pdf")));
    }

    #[test]
    fn test_chunk_creation() {
        let content = "This is a test document with multiple sentences. It should be split into chunks properly.";
        let config = IngestionConfig {
            chunk_size: 5,
            chunk_overlap: 2,
            ..Default::default()
        };

        let engine = IngestionEngine::new(config, None).unwrap();
        let chunks = engine.create_chunks(content, &engine.config);

        assert!(!chunks.is_empty());
        assert!(chunks.len() > 1);
    }
}