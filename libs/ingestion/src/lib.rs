use std::path::{Path, PathBuf};
use std::collections::HashMap;
use serde::{Deserialize, Serialize};
use chrono::{DateTime, Utc};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub file_path: String,
    pub file_type: DocumentType,
    pub size: u64,
    pub created_at: DateTime<Utc>,
    pub modified_at: DateTime<Utc>,
    pub metadata: DocumentMetadata,
    pub extracted_entities: Vec<Entity>,
    pub language: Option<String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum DocumentType {
    Pdf, Word, Text, Html, Markdown, Csv, Json, Image, Unknown,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentMetadata {
    pub author: Option<String>,
    pub subject: Option<String>,
    pub keywords: Vec<String>,
    pub page_count: Option<u32>,
    pub word_count: Option<u32>,
    pub character_count: Option<u32>,
    pub encoding: Option<String>,
    pub mime_type: Option<String>,
    pub checksum: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Entity {
    pub entity_type: EntityType,
    pub text: String,
    pub confidence: f64,
    pub start_offset: usize,
    pub end_offset: usize,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum EntityType {
    Person, Organization, Location, Date, Email, Phone, Url, Money, Custom(String),
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestionResult {
    pub document: Document,
    pub success: bool,
    pub error_message: Option<String>,
    pub processing_time_ms: u64,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct IngestionOptions {
    pub extract_text: bool,
    pub extract_metadata: bool,
    pub extract_entities: bool,
    pub generate_checksum: bool,
    pub max_file_size: Option<u64>,
    pub supported_types: Vec<DocumentType>,
    pub ocr_enabled: bool,
    pub language_detection: bool,
}

impl Default for IngestionOptions {
    fn default() -> Self {
        IngestionOptions {
            extract_text: true,
            extract_metadata: true,
            extract_entities: true,
            generate_checksum: true,
            max_file_size: Some(100 * 1024 * 1024),
            supported_types: vec![
                DocumentType::Pdf, DocumentType::Word, DocumentType::Text,
                DocumentType::Html, DocumentType::Markdown, DocumentType::Csv, DocumentType::Json,
            ],
            ocr_enabled: false,
            language_detection: true,
        }
    }
}

pub struct DocumentIngestionEngine {
    options: IngestionOptions,
    processors: HashMap<DocumentType, Box<dyn DocumentProcessor>>,
}

impl DocumentIngestionEngine {
    pub fn new(options: Option<IngestionOptions>) -> Self {
        let opts = options.unwrap_or_default();
        let mut engine = DocumentIngestionEngine {
            options: opts,
            processors: HashMap::new(),
        };

        engine.register_processor(DocumentType::Pdf, Box::new(PdfProcessor::new()));
        engine.register_processor(DocumentType::Word, Box::new(WordProcessor::new()));
        engine.register_processor(DocumentType::Text, Box::new(TextProcessor::new()));
        engine.register_processor(DocumentType::Html, Box::new(HtmlProcessor::new()));
        engine.register_processor(DocumentType::Markdown, Box::new(MarkdownProcessor::new()));
        engine.register_processor(DocumentType::Csv, Box::new(CsvProcessor::new()));
        engine.register_processor(DocumentType::Json, Box::new(JsonProcessor::new()));

        engine
    }

    pub fn register_processor(&mut self, doc_type: DocumentType, processor: Box<dyn DocumentProcessor>) {
        self.processors.insert(doc_type, processor);
    }

    pub fn ingest_file<P: AsRef<Path>>(&self, file_path: P) -> Result<IngestionResult, String> {
        let start_time = std::time::Instant::now();
        let path = file_path.as_ref();

        if !path.exists() {
            return Ok(IngestionResult {
                document: self.create_empty_document(path),
                success: false,
                error_message: Some("File does not exist".to_string()),
                processing_time_ms: start_time.elapsed().as_millis() as u64,
            });
        }

        let doc_type = self.detect_document_type(path)?;
        
        match self.process_document(path, &doc_type) {
            Ok(document) => Ok(IngestionResult {
                document,
                success: true,
                error_message: None,
                processing_time_ms: start_time.elapsed().as_millis() as u64,
            }),
            Err(error) => Ok(IngestionResult {
                document: self.create_empty_document(path),
                success: false,
                error_message: Some(error),
                processing_time_ms: start_time.elapsed().as_millis() as u64,
            }),
        }
    }

    fn detect_document_type(&self, path: &Path) -> Result<DocumentType, String> {
        let extension = path.extension()
            .and_then(|ext| ext.to_str())
            .unwrap_or("")
            .to_lowercase();

        let doc_type = match extension.as_str() {
            "pdf" => DocumentType::Pdf,
            "doc" | "docx" => DocumentType::Word,
            "txt" => DocumentType::Text,
            "html" | "htm" => DocumentType::Html,
            "md" | "markdown" => DocumentType::Markdown,
            "csv" => DocumentType::Csv,
            "json" => DocumentType::Json,
            "png" | "jpg" | "jpeg" | "gif" => DocumentType::Image,
            _ => DocumentType::Unknown,
        };

        Ok(doc_type)
    }

    fn process_document(&self, path: &Path, doc_type: &DocumentType) -> Result<Document, String> {
        let processor = self.processors.get(doc_type)
            .ok_or_else(|| format!("No processor found for document type: {:?}", doc_type))?;

        let mut document = processor.process(path, &self.options)?;
        document.id = self.generate_document_id(path);
        
        let metadata = std::fs::metadata(path)
            .map_err(|e| format!("Failed to get file metadata: {}", e))?;
        
        document.size = metadata.len();
        document.created_at = metadata.created().unwrap_or(std::time::SystemTime::now()).into();
        document.modified_at = metadata.modified().unwrap_or(std::time::SystemTime::now()).into();

        if self.options.generate_checksum {
            document.metadata.checksum = self.generate_checksum(path)?;
        }

        if self.options.extract_entities {
            document.extracted_entities = self.extract_entities(&document.content);
        }

        if self.options.language_detection {
            document.language = self.detect_language(&document.content);
        }

        Ok(document)
    }

    fn generate_document_id(&self, path: &Path) -> String {
        use std::collections::hash_map::DefaultHasher;
        use std::hash::{Hash, Hasher};

        let mut hasher = DefaultHasher::new();
        path.to_string_lossy().hash(&mut hasher);
        format!("doc_{:x}", hasher.finish())
    }

    fn generate_checksum(&self, path: &Path) -> Result<String, String> {
        use sha2::{Sha256, Digest};
        use std::io::Read;
        
        let mut file = std::fs::File::open(path)
            .map_err(|e| format!("Failed to open file for checksum: {}", e))?;
        
        let mut hasher = Sha256::new();
        let mut buffer = vec![0; 8192];
        
        loop {
            let bytes_read = file.read(&mut buffer)
                .map_err(|e| format!("Failed to read file for checksum: {}", e))?;
            
            if bytes_read == 0 {
                break;
            }
            
            hasher.update(&buffer[..bytes_read]);
        }

        Ok(format!("{:x}", hasher.finalize()))
    }

    fn extract_entities(&self, text: &str) -> Vec<Entity> {
        let mut entities = Vec::new();
        
        use regex::Regex;
        
        // Email addresses
        if let Ok(email_regex) = Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b") {
            for mat in email_regex.find_iter(text) {
                entities.push(Entity {
                    entity_type: EntityType::Email,
                    text: mat.as_str().to_string(),
                    confidence: 0.9,
                    start_offset: mat.start(),
                    end_offset: mat.end(),
                });
            }
        }

        // URLs
        if let Ok(url_regex) = Regex::new(r"https?://[^\s<>\"]+") {
            for mat in url_regex.find_iter(text) {
                entities.push(Entity {
                    entity_type: EntityType::Url,
                    text: mat.as_str().to_string(),
                    confidence: 0.95,
                    start_offset: mat.start(),
                    end_offset: mat.end(),
                });
            }
        }

        entities
    }

    fn detect_language(&self, text: &str) -> Option<String> {
        let english_words = ["the", "and", "or", "in", "on", "at", "to", "for", "of", "with"];
        let words: Vec<&str> = text.to_lowercase().split_whitespace().collect();
        
        if words.len() < 10 {
            return None;
        }

        let english_count = words.iter().filter(|word| english_words.contains(word)).count();
        
        if english_count > words.len() / 20 {
            Some("en".to_string())
        } else {
            None
        }
    }

    fn create_empty_document(&self, path: &Path) -> Document {
        Document {
            id: self.generate_document_id(path),
            title: path.file_name().and_then(|name| name.to_str()).unwrap_or("Unknown").to_string(),
            content: String::new(),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Unknown,
            size: 0,
            created_at: Utc::now(),
            modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: None, subject: None, keywords: Vec::new(), page_count: None,
                word_count: None, character_count: None, encoding: None, mime_type: None,
                checksum: String::new(),
            },
            extracted_entities: Vec::new(),
            language: None,
        }
    }

    pub fn get_supported_types(&self) -> &[DocumentType] {
        &self.options.supported_types
    }
}

pub trait DocumentProcessor: Send + Sync {
    fn process(&self, path: &Path, options: &IngestionOptions) -> Result<Document, String>;
}

pub struct TextProcessor;
impl TextProcessor {
    pub fn new() -> Self { TextProcessor }
}

impl DocumentProcessor for TextProcessor {
    fn process(&self, path: &Path, options: &IngestionOptions) -> Result<Document, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read text file: {}", e))?;

        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown Text").to_string(),
            content: content.clone(),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Text,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: None, subject: None, keywords: Vec::new(), page_count: None,
                word_count: Some(content.split_whitespace().count() as u32),
                character_count: Some(content.len() as u32),
                encoding: Some("UTF-8".to_string()),
                mime_type: Some("text/plain".to_string()),
                checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

pub struct PdfProcessor;
impl PdfProcessor { pub fn new() -> Self { PdfProcessor } }
impl DocumentProcessor for PdfProcessor {
    fn process(&self, path: &Path, _: &IngestionOptions) -> Result<Document, String> {
        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown PDF").to_string(),
            content: format!("PDF content from: {}", path.display()),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Pdf,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: Some("PDF Author".to_string()), subject: Some("PDF Subject".to_string()),
                keywords: vec!["pdf".to_string()], page_count: Some(5), word_count: Some(100),
                character_count: Some(500), encoding: Some("UTF-8".to_string()),
                mime_type: Some("application/pdf".to_string()), checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

pub struct WordProcessor;
impl WordProcessor { pub fn new() -> Self { WordProcessor } }
impl DocumentProcessor for WordProcessor {
    fn process(&self, path: &Path, _: &IngestionOptions) -> Result<Document, String> {
        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown Document").to_string(),
            content: format!("Word document content from: {}", path.display()),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Word,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: Some("Document Author".to_string()), subject: None, keywords: vec!["word".to_string()],
                page_count: Some(3), word_count: Some(200), character_count: Some(1000),
                encoding: Some("UTF-8".to_string()),
                mime_type: Some("application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string()),
                checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

pub struct HtmlProcessor;
impl HtmlProcessor { pub fn new() -> Self { HtmlProcessor } }
impl DocumentProcessor for HtmlProcessor {
    fn process(&self, path: &Path, _: &IngestionOptions) -> Result<Document, String> {
        let html_content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read HTML file: {}", e))?;
        let text_content = html_content.replace("<", " <").replace(">", "> ");

        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown HTML").to_string(),
            content: text_content.clone(),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Html,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: None, subject: None, keywords: vec!["html".to_string()], page_count: None,
                word_count: Some(text_content.split_whitespace().count() as u32),
                character_count: Some(text_content.len() as u32),
                encoding: Some("UTF-8".to_string()), mime_type: Some("text/html".to_string()),
                checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

pub struct MarkdownProcessor;
impl MarkdownProcessor { pub fn new() -> Self { MarkdownProcessor } }
impl DocumentProcessor for MarkdownProcessor {
    fn process(&self, path: &Path, _: &IngestionOptions) -> Result<Document, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read Markdown file: {}", e))?;

        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown Markdown").to_string(),
            content: content.clone(),
            file_path: path.to_string_lossy.to_string(),
            file_type: DocumentType::Markdown,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: None, subject: None, keywords: vec!["markdown".to_string()], page_count: None,
                word_count: Some(content.split_whitespace().count() as u32),
                character_count: Some(content.len() as u32),
                encoding: Some("UTF-8".to_string()), mime_type: Some("text/markdown".to_string()),
                checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

pub struct CsvProcessor;
impl CsvProcessor { pub fn new() -> Self { CsvProcessor } }
impl DocumentProcessor for CsvProcessor {
    fn process(&self, path: &Path, _: &IngestionOptions) -> Result<Document, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read CSV file: {}", e))?;

        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown CSV").to_string(),
            content: content.clone(),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Csv,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: None, subject: None, keywords: vec!["csv".to_string()], page_count: None,
                word_count: Some(content.split_whitespace().count() as u32),
                character_count: Some(content.len() as u32),
                encoding: Some("UTF-8".to_string()), mime_type: Some("text/csv".to_string()),
                checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

pub struct JsonProcessor;
impl JsonProcessor { pub fn new() -> Self { JsonProcessor } }
impl DocumentProcessor for JsonProcessor {
    fn process(&self, path: &Path, _: &IngestionOptions) -> Result<Document, String> {
        let content = std::fs::read_to_string(path)
            .map_err(|e| format!("Failed to read JSON file: {}", e))?;

        serde_json::from_str::<serde_json::Value>(&content)
            .map_err(|e| format!("Invalid JSON format: {}", e))?;

        Ok(Document {
            id: String::new(),
            title: path.file_stem().and_then(|name| name.to_str()).unwrap_or("Unknown JSON").to_string(),
            content: content.clone(),
            file_path: path.to_string_lossy().to_string(),
            file_type: DocumentType::Json,
            size: 0, created_at: Utc::now(), modified_at: Utc::now(),
            metadata: DocumentMetadata {
                author: None, subject: None, keywords: vec!["json".to_string()], page_count: None,
                word_count: Some(content.split_whitespace().count() as u32),
                character_count: Some(content.len() as u32),
                encoding: Some("UTF-8".to_string()), mime_type: Some("application/json".to_string()),
                checksum: String::new(),
            },
            extracted_entities: Vec::new(), language: None,
        })
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::io::Write;
    use tempfile::NamedTempFile;

    #[test]
    fn test_engine_creation() {
        let engine = DocumentIngestionEngine::new(None);
        assert!(!engine.get_supported_types().is_empty());
    }

    #[test]
    fn test_document_type_detection() {
        let engine = DocumentIngestionEngine::new(None);
        assert!(matches!(engine.detect_document_type(Path::new("test.pdf")).unwrap(), DocumentType::Pdf));
        assert!(matches!(engine.detect_document_type(Path::new("test.txt")).unwrap(), DocumentType::Text));
    }

    #[test]
    fn test_text_file_ingestion() {
        let engine = DocumentIngestionEngine::new(None);
        let mut temp_file = NamedTempFile::new().unwrap();
        writeln!(temp_file, "Hello, World! This is test content.").unwrap();
        
        let result = engine.ingest_file(temp_file.path()).unwrap();
        assert!(result.success);
        assert_eq!(result.document.file_type, DocumentType::Text);
        assert!(result.document.content.contains("Hello, World!"));
    }

    #[test]
    fn test_entity_extraction() {
        let engine = DocumentIngestionEngine::new(None);
        let text = "Contact us at test@example.com or visit https://example.com";
        let entities = engine.extract_entities(text);
        
        assert_eq!(entities.len(), 2);
        assert!(entities.iter().any(|e| matches!(e.entity_type, EntityType::Email)));
        assert!(entities.iter().any(|e| matches!(e.entity_type, EntityType::Url)));
    }

    #[test]
    fn test_language_detection() {
        let engine = DocumentIngestionEngine::new(None);
        let english_text = "The quick brown fox jumps over the lazy dog and runs to the forest";
        let result = engine.detect_language(english_text);
        assert_eq!(result, Some("en".to_string()));
    }

    #[test]
    fn test_nonexistent_file() {
        let engine = DocumentIngestionEngine::new(None);
        let result = engine.ingest_file("nonexistent_file.txt").unwrap();
        assert!(!result.success);
        assert!(result.error_message.is_some());
    }
}