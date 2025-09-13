use std::path::Path;
use anyhow::Result;
use async_trait::async_trait;
use chrono::Utc;
use uuid::Uuid;

use crate::{ProcessedDocument, DocumentMetadata, IngestionConfig, FileTypeDetector};

#[async_trait]
pub trait DocumentProcessor: Send + Sync {
    fn can_process(&self, file_path: &Path) -> bool;
    async fn process(&self, file_path: &Path, config: &IngestionConfig) -> Result<ProcessedDocument>;
}

pub struct TextProcessor;

impl TextProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentProcessor for TextProcessor {
    fn can_process(&self, file_path: &Path) -> bool {
        matches!(
            file_path.extension().and_then(|ext| ext.to_str()),
            Some("txt") | Some("md") | Some("markdown") | Some("rst")
        )
    }

    async fn process(&self, file_path: &Path, _config: &IngestionConfig) -> Result<ProcessedDocument> {
        let content = tokio::fs::read_to_string(file_path).await?;
        let metadata = std::fs::metadata(file_path)?;
        
        let title = file_path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let doc_metadata = DocumentMetadata {
            file_size: metadata.len(),
            mime_type: FileTypeDetector::detect_mime_type(file_path),
            created_at: metadata.created().ok().map(|time| time.into()),
            modified_at: metadata.modified().unwrap_or(std::time::SystemTime::now()).into(),
            language: Some("en".to_string()), // TODO: Detect language
            encoding: Some("utf-8".to_string()),
            word_count: Some(content.split_whitespace().count() as u32),
            char_count: Some(content.chars().count() as u32),
            page_count: None,
        };

        Ok(ProcessedDocument {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_path_buf(),
            title,
            content,
            content_hash: String::new(), // Will be set by the engine
            metadata: doc_metadata,
            entities: Vec::new(),
            chunks: Vec::new(),
            source_type: "file_system".to_string(),
        })
    }
}

pub struct PdfProcessor;

impl PdfProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentProcessor for PdfProcessor {
    fn can_process(&self, file_path: &Path) -> bool {
        matches!(file_path.extension().and_then(|ext| ext.to_str()), Some("pdf"))
    }

    async fn process(&self, file_path: &Path, _config: &IngestionConfig) -> Result<ProcessedDocument> {
        // Extract text from PDF
        let content = pdf_extract::extract_text(file_path)
            .map_err(|e| anyhow::anyhow!("Failed to extract PDF text: {}", e))?;

        let metadata = std::fs::metadata(file_path)?;
        
        let title = file_path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let doc_metadata = DocumentMetadata {
            file_size: metadata.len(),
            mime_type: "application/pdf".to_string(),
            created_at: metadata.created().ok().map(|time| time.into()),
            modified_at: metadata.modified().unwrap_or(std::time::SystemTime::now()).into(),
            language: Some("en".to_string()),
            encoding: Some("utf-8".to_string()),
            word_count: Some(content.split_whitespace().count() as u32),
            char_count: Some(content.chars().count() as u32),
            page_count: Some(Self::estimate_page_count(&content)),
        };

        Ok(ProcessedDocument {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_path_buf(),
            title,
            content,
            content_hash: String::new(),
            metadata: doc_metadata,
            entities: Vec::new(),
            chunks: Vec::new(),
            source_type: "file_system".to_string(),
        })
    }
}

impl PdfProcessor {
    fn estimate_page_count(content: &str) -> u32 {
        // Simple estimation: ~500 words per page
        let word_count = content.split_whitespace().count();
        std::cmp::max(1, (word_count / 500) as u32)
    }
}

pub struct DocxProcessor;

impl DocxProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentProcessor for DocxProcessor {
    fn can_process(&self, file_path: &Path) -> bool {
        matches!(file_path.extension().and_then(|ext| ext.to_str()), Some("docx"))
    }

    async fn process(&self, file_path: &Path, _config: &IngestionConfig) -> Result<ProcessedDocument> {
        // Read and extract text from DOCX
        let file_content = std::fs::read(file_path)?;
        let doc = docx_rs::read_docx(&file_content)
            .map_err(|e| anyhow::anyhow!("Failed to read DOCX: {}", e))?;
        
        let content = Self::extract_text_from_docx(&doc);
        let metadata = std::fs::metadata(file_path)?;
        
        let title = file_path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let doc_metadata = DocumentMetadata {
            file_size: metadata.len(),
            mime_type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document".to_string(),
            created_at: metadata.created().ok().map(|time| time.into()),
            modified_at: metadata.modified().unwrap_or(std::time::SystemTime::now()).into(),
            language: Some("en".to_string()),
            encoding: Some("utf-8".to_string()),
            word_count: Some(content.split_whitespace().count() as u32),
            char_count: Some(content.chars().count() as u32),
            page_count: Some(Self::estimate_page_count(&content)),
        };

        Ok(ProcessedDocument {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_path_buf(),
            title,
            content,
            content_hash: String::new(),
            metadata: doc_metadata,
            entities: Vec::new(),
            chunks: Vec::new(),
            source_type: "file_system".to_string(),
        })
    }
}

impl DocxProcessor {
    fn extract_text_from_docx(doc: &docx_rs::Docx) -> String {
        // Extract all paragraph text from the document
        let mut content = String::new();
        
        for child in &doc.document.body.children {
            if let docx_rs::DocumentChild::Paragraph(para) = child {
                for run in &para.children {
                    if let docx_rs::ParagraphChild::Run(run_data) = run {
                        for run_child in &run_data.children {
                            if let docx_rs::RunChild::Text(text) = run_child {
                                content.push_str(&text.text);
                            }
                        }
                    }
                }
                content.push('\n');
            }
        }
        
        content
    }

    fn estimate_page_count(content: &str) -> u32 {
        // Simple estimation: ~500 words per page
        let word_count = content.split_whitespace().count();
        std::cmp::max(1, (word_count / 500) as u32)
    }
}

pub struct HtmlProcessor;

impl HtmlProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentProcessor for HtmlProcessor {
    fn can_process(&self, file_path: &Path) -> bool {
        matches!(
            file_path.extension().and_then(|ext| ext.to_str()),
            Some("html") | Some("htm")
        )
    }

    async fn process(&self, file_path: &Path, _config: &IngestionConfig) -> Result<ProcessedDocument> {
        let html_content = tokio::fs::read_to_string(file_path).await?;
        let document = scraper::Html::parse_document(&html_content);
        
        // Extract title
        let title_selector = scraper::Selector::parse("title").unwrap();
        let title = document
            .select(&title_selector)
            .next()
            .map(|el| el.text().collect::<String>())
            .unwrap_or_else(|| {
                file_path
                    .file_stem()
                    .and_then(|name| name.to_str())
                    .unwrap_or("Untitled")
                    .to_string()
            });

        // Extract text content
        let body_selector = scraper::Selector::parse("body").unwrap();
        let content = if let Some(body) = document.select(&body_selector).next() {
            Self::extract_text_from_element(body)
        } else {
            Self::extract_text_from_element(document.root_element())
        };

        let metadata = std::fs::metadata(file_path)?;
        
        let doc_metadata = DocumentMetadata {
            file_size: metadata.len(),
            mime_type: "text/html".to_string(),
            created_at: metadata.created().ok().map(|time| time.into()),
            modified_at: metadata.modified().unwrap_or(std::time::SystemTime::now()).into(),
            language: Some("en".to_string()),
            encoding: Some("utf-8".to_string()),
            word_count: Some(content.split_whitespace().count() as u32),
            char_count: Some(content.chars().count() as u32),
            page_count: None,
        };

        Ok(ProcessedDocument {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_path_buf(),
            title,
            content,
            content_hash: String::new(),
            metadata: doc_metadata,
            entities: Vec::new(),
            chunks: Vec::new(),
            source_type: "file_system".to_string(),
        })
    }
}

impl HtmlProcessor {
    fn extract_text_from_element(element: scraper::ElementRef) -> String {
        let mut text = String::new();
        
        for node in element.children() {
            match node.value() {
                scraper::node::Node::Text(text_node) => {
                    text.push_str(text_node.text.trim());
                    text.push(' ');
                }
                scraper::node::Node::Element(_) => {
                    if let Some(child_element) = scraper::ElementRef::wrap(node) {
                        // Skip script and style elements
                        let tag_name = child_element.value().name();
                        if tag_name != "script" && tag_name != "style" {
                            text.push_str(&Self::extract_text_from_element(child_element));
                        }
                    }
                }
                _ => {}
            }
        }
        
        text
    }
}

pub struct CsvProcessor;

impl CsvProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentProcessor for CsvProcessor {
    fn can_process(&self, file_path: &Path) -> bool {
        matches!(
            file_path.extension().and_then(|ext| ext.to_str()),
            Some("csv") | Some("tsv")
        )
    }

    async fn process(&self, file_path: &Path, _config: &IngestionConfig) -> Result<ProcessedDocument> {
        let csv_content = tokio::fs::read_to_string(file_path).await?;
        let mut reader = csv::Reader::from_reader(csv_content.as_bytes());
        
        let headers = reader.headers()?.clone();
        let mut content = format!("Headers: {}\n\n", headers.iter().collect::<Vec<_>>().join(", "));
        
        let mut row_count = 0;
        for result in reader.records() {
            let record = result?;
            let row_text = record.iter().collect::<Vec<_>>().join(", ");
            content.push_str(&format!("Row {}: {}\n", row_count + 1, row_text));
            row_count += 1;
            
            // Limit content size for large CSV files
            if row_count >= 1000 {
                content.push_str(&format!("... and {} more rows\n", reader.position().record() - 1000));
                break;
            }
        }

        let metadata = std::fs::metadata(file_path)?;
        let title = file_path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let doc_metadata = DocumentMetadata {
            file_size: metadata.len(),
            mime_type: "text/csv".to_string(),
            created_at: metadata.created().ok().map(|time| time.into()),
            modified_at: metadata.modified().unwrap_or(std::time::SystemTime::now()).into(),
            language: Some("en".to_string()),
            encoding: Some("utf-8".to_string()),
            word_count: Some(content.split_whitespace().count() as u32),
            char_count: Some(content.chars().count() as u32),
            page_count: None,
        };

        Ok(ProcessedDocument {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_path_buf(),
            title,
            content,
            content_hash: String::new(),
            metadata: doc_metadata,
            entities: Vec::new(),
            chunks: Vec::new(),
            source_type: "file_system".to_string(),
        })
    }
}

pub struct JsonProcessor;

impl JsonProcessor {
    pub fn new() -> Self {
        Self
    }
}

#[async_trait]
impl DocumentProcessor for JsonProcessor {
    fn can_process(&self, file_path: &Path) -> bool {
        matches!(file_path.extension().and_then(|ext| ext.to_str()), Some("json"))
    }

    async fn process(&self, file_path: &Path, _config: &IngestionConfig) -> Result<ProcessedDocument> {
        let json_content = tokio::fs::read_to_string(file_path).await?;
        
        // Parse and pretty-print JSON for better readability
        let parsed: serde_json::Value = serde_json::from_str(&json_content)?;
        let content = serde_json::to_string_pretty(&parsed)?;

        let metadata = std::fs::metadata(file_path)?;
        let title = file_path
            .file_stem()
            .and_then(|name| name.to_str())
            .unwrap_or("Untitled")
            .to_string();

        let doc_metadata = DocumentMetadata {
            file_size: metadata.len(),
            mime_type: "application/json".to_string(),
            created_at: metadata.created().ok().map(|time| time.into()),
            modified_at: metadata.modified().unwrap_or(std::time::SystemTime::now()).into(),
            language: Some("en".to_string()),
            encoding: Some("utf-8".to_string()),
            word_count: Some(content.split_whitespace().count() as u32),
            char_count: Some(content.chars().count() as u32),
            page_count: None,
        };

        Ok(ProcessedDocument {
            id: Uuid::new_v4().to_string(),
            file_path: file_path.to_path_buf(),
            title,
            content,
            content_hash: String::new(),
            metadata: doc_metadata,
            entities: Vec::new(),
            chunks: Vec::new(),
            source_type: "file_system".to_string(),
        })
    }
}