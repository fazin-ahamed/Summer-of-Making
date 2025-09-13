use std::collections::{HashMap, HashSet};
use std::sync::Arc;
use tokio::sync::RwLock;
use anyhow::{Result, anyhow};
use serde::{Serialize, Deserialize};
use rusqlite::Connection;
use regex::Regex;
use stemmer::Stemmer;
use unicode_segmentation::UnicodeSegmentation;
use ndarray::Array1;
use tracing::{info, warn, error, debug};

pub mod indexer;
pub mod ranker;
pub mod similarity;

use indexer::*;
use ranker::*;
use similarity::*;

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub text: String,
    pub filters: SearchFilters,
    pub options: SearchOptions,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchFilters {
    pub entity_types: Option<Vec<String>>,
    pub document_types: Option<Vec<String>>,
    pub date_range: Option<DateRange>,
    pub file_types: Option<Vec<String>>,
    pub source_types: Option<Vec<String>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DateRange {
    pub start: Option<chrono::DateTime<chrono::Utc>>,
    pub end: Option<chrono::DateTime<chrono::Utc>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchOptions {
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub include_snippets: bool,
    pub highlight_matches: bool,
    pub fuzzy_matching: bool,
    pub semantic_search: bool,
    pub boost_recent: bool,
}

impl Default for SearchOptions {
    fn default() -> Self {
        Self {
            limit: Some(20),
            offset: Some(0),
            include_snippets: true,
            highlight_matches: true,
            fuzzy_matching: false,
            semantic_search: false,
            boost_recent: true,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub id: String,
    pub result_type: SearchResultType,
    pub title: String,
    pub content: Option<String>,
    pub snippet: Option<String>,
    pub score: f64,
    pub metadata: serde_json::Value,
    pub highlights: Vec<TextHighlight>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchResultType {
    Document,
    Entity,
    Chunk,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct TextHighlight {
    pub start: usize,
    pub end: usize,
    pub text: String,
}

#[derive(Debug, Clone)]
pub struct IndexedDocument {
    pub id: String,
    pub title: String,
    pub content: String,
    pub tokens: Vec<String>,
    pub entities: Vec<IndexedEntity>,
    pub metadata: serde_json::Value,
    pub embedding: Option<Vec<f32>>,
}

#[derive(Debug, Clone)]
pub struct IndexedEntity {
    pub id: String,
    pub entity_type: String,
    pub name: String,
    pub properties: serde_json::Value,
}

pub trait SearchCallback: Send + Sync {
    fn on_search_results(&self, results: Vec<SearchResult>);
    fn on_search_error(&self, error: String);
}

pub struct SearchEngine {
    database: Arc<RwLock<Connection>>,
    indexer: Arc<FullTextIndexer>,
    ranker: Arc<SearchRanker>,
    similarity_engine: Arc<SimilarityEngine>,
    stemmer: Stemmer,
}

impl SearchEngine {
    pub fn new(database: Arc<RwLock<Connection>>) -> Result<Self> {
        let indexer = Arc::new(FullTextIndexer::new()?);
        let ranker = Arc::new(SearchRanker::new());
        let similarity_engine = Arc::new(SimilarityEngine::new());
        let stemmer = Stemmer::create(stemmer::Algorithm::English);

        Ok(Self {
            database,
            indexer,
            ranker,
            similarity_engine,
            stemmer,
        })
    }

    pub async fn initialize(&self) -> Result<()> {
        info!("Initializing search engine");
        
        // Initialize indexer
        self.indexer.initialize().await?;
        
        // Build initial index from database
        self.rebuild_index().await?;
        
        info!("Search engine initialized successfully");
        Ok(())
    }

    pub async fn search_documents(
        &self,
        query: &SearchQuery,
        callback: Box<dyn SearchCallback>,
    ) -> Result<()> {
        debug!("Searching documents with query: {}", query.text);

        let results = self.execute_search(query).await?;
        callback.on_search_results(results);
        
        Ok(())
    }

    pub async fn search_entities(
        &self,
        query: &SearchQuery,
        callback: Box<dyn SearchCallback>,
    ) -> Result<()> {
        debug!("Searching entities with query: {}", query.text);

        let results = self.execute_entity_search(query).await?;
        callback.on_search_results(results);
        
        Ok(())
    }

    async fn execute_search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>> {
        let mut results = Vec::new();

        // Tokenize and stem the query
        let query_tokens = self.tokenize_and_stem(&query.text);
        
        // Full-text search using SQLite FTS
        let fts_results = self.fts_search(&query.text, &query.filters, &query.options).await?;
        results.extend(fts_results);

        // Fuzzy matching if enabled
        if query.options.fuzzy_matching {
            let fuzzy_results = self.fuzzy_search(&query.text, &query.filters, &query.options).await?;
            results.extend(fuzzy_results);
        }

        // Semantic search if enabled
        if query.options.semantic_search {
            let semantic_results = self.semantic_search(&query.text, &query.filters, &query.options).await?;
            results.extend(semantic_results);
        }

        // Remove duplicates and rank results
        results = self.deduplicate_results(results);
        results = self.ranker.rank_results(results, &query_tokens, &query.options).await?;

        // Apply pagination
        let limit = query.options.limit.unwrap_or(20);
        let offset = query.options.offset.unwrap_or(0);
        
        if offset < results.len() {
            let end = std::cmp::min(offset + limit, results.len());
            results = results[offset..end].to_vec();
        } else {
            results.clear();
        }

        // Generate snippets and highlights
        if query.options.include_snippets {
            results = self.add_snippets_and_highlights(results, &query.text, &query.options).await?;
        }

        Ok(results)
    }

    async fn execute_entity_search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>> {
        let db = self.database.read().await;
        let mut results = Vec::new();

        let mut sql = "SELECT id, entity_type, name, properties FROM entities WHERE 1=1".to_string();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        // Add search condition
        if !query.text.is_empty() {
            sql.push_str(" AND name LIKE ?");
            params.push(Box::new(format!("%{}%", query.text)));
        }

        // Add entity type filter
        if let Some(ref entity_types) = query.filters.entity_types {
            if !entity_types.is_empty() {
                let placeholders = entity_types.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                sql.push_str(&format!(" AND entity_type IN ({})", placeholders));
                for entity_type in entity_types {
                    params.push(Box::new(entity_type.clone()));
                }
            }
        }

        sql.push_str(" ORDER BY name");
        
        let limit = query.options.limit.unwrap_or(20);
        sql.push_str(&format!(" LIMIT {}", limit));

        let mut stmt = db.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        
        let rows = stmt.query_map(rusqlite::params_from_iter(param_refs), |row| {
            Ok(SearchResult {
                id: row.get(0)?,
                result_type: SearchResultType::Entity,
                title: row.get(2)?, // name
                content: None,
                snippet: None,
                score: 1.0, // TODO: Calculate relevance score
                metadata: serde_json::from_str(row.get::<_, String>(3)?.as_str()).unwrap_or_default(),
                highlights: Vec::new(),
            })
        })?;

        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    async fn fts_search(
        &self,
        query: &str,
        filters: &SearchFilters,
        options: &SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        let db = self.database.read().await;
        let mut results = Vec::new();

        let mut sql = r#"
            SELECT d.id, d.title, d.content, d.metadata, d.source_type, rank
            FROM documents_fts 
            JOIN documents d ON documents_fts.content_id = d.id
            WHERE documents_fts MATCH ?
        "#.to_string();

        let mut params: Vec<Box<dyn rusqlite::ToSql>> = vec![Box::new(query.to_string())];

        // Add filters
        if let Some(ref source_types) = filters.source_types {
            if !source_types.is_empty() {
                let placeholders = source_types.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                sql.push_str(&format!(" AND d.source_type IN ({})", placeholders));
                for source_type in source_types {
                    params.push(Box::new(source_type.clone()));
                }
            }
        }

        if let Some(ref date_range) = filters.date_range {
            if let Some(start) = date_range.start {
                sql.push_str(" AND d.modified_at >= ?");
                params.push(Box::new(start.timestamp()));
            }
            if let Some(end) = date_range.end {
                sql.push_str(" AND d.modified_at <= ?");
                params.push(Box::new(end.timestamp()));
            }
        }

        sql.push_str(" ORDER BY rank");
        
        let limit = options.limit.unwrap_or(20);
        sql.push_str(&format!(" LIMIT {}", limit));

        let mut stmt = db.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        
        let rows = stmt.query_map(rusqlite::params_from_iter(param_refs), |row| {
            let metadata_str: String = row.get(3)?;
            let metadata = serde_json::from_str(&metadata_str).unwrap_or_default();
            
            Ok(SearchResult {
                id: row.get(0)?,
                result_type: SearchResultType::Document,
                title: row.get(1)?,
                content: Some(row.get(2)?),
                snippet: None, // Will be generated later
                score: row.get::<_, f64>(5)?,
                metadata,
                highlights: Vec::new(),
            })
        })?;

        for row in rows {
            results.push(row?);
        }

        Ok(results)
    }

    async fn fuzzy_search(
        &self,
        query: &str,
        filters: &SearchFilters,
        options: &SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        let db = self.database.read().await;
        let mut results = Vec::new();

        // Get all documents and perform fuzzy matching in memory
        let mut sql = "SELECT id, title, content, metadata FROM documents WHERE 1=1".to_string();
        let mut params: Vec<Box<dyn rusqlite::ToSql>> = Vec::new();

        // Add filters (similar to FTS search)
        if let Some(ref source_types) = filters.source_types {
            if !source_types.is_empty() {
                let placeholders = source_types.iter().map(|_| "?").collect::<Vec<_>>().join(",");
                sql.push_str(&format!(" AND source_type IN ({})", placeholders));
                for source_type in source_types {
                    params.push(Box::new(source_type.clone()));
                }
            }
        }

        let limit = options.limit.unwrap_or(100); // Get more for fuzzy filtering
        sql.push_str(&format!(" LIMIT {}", limit));

        let mut stmt = db.prepare(&sql)?;
        let param_refs: Vec<&dyn rusqlite::ToSql> = params.iter().map(|p| p.as_ref()).collect();
        
        let rows = stmt.query_map(rusqlite::params_from_iter(param_refs), |row| {
            let title: String = row.get(1)?;
            let content: String = row.get(2)?;
            let metadata_str: String = row.get(3)?;
            let metadata = serde_json::from_str(&metadata_str).unwrap_or_default();
            
            // Calculate fuzzy similarity
            let title_similarity = strsim::jaro_winkler(query, &title);
            let content_similarity = strsim::jaro_winkler(query, &content);
            let max_similarity = title_similarity.max(content_similarity);
            
            if max_similarity > 0.3 { // Threshold for fuzzy matching
                Ok(Some(SearchResult {
                    id: row.get(0)?,
                    result_type: SearchResultType::Document,
                    title,
                    content: Some(content),
                    snippet: None,
                    score: max_similarity,
                    metadata,
                    highlights: Vec::new(),
                }))
            } else {
                Ok(None)
            }
        })?;

        for row_result in rows {
            if let Ok(Some(result)) = row_result {
                results.push(result);
            }
        }

        // Sort by similarity score
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        Ok(results)
    }

    async fn semantic_search(
        &self,
        query: &str,
        _filters: &SearchFilters,
        _options: &SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        // TODO: Implement semantic search using embeddings
        // For now, return empty results
        info!("Semantic search not yet implemented");
        Ok(Vec::new())
    }

    fn deduplicate_results(&self, mut results: Vec<SearchResult>) -> Vec<SearchResult> {
        let mut seen_ids = HashSet::new();
        results.retain(|result| seen_ids.insert(result.id.clone()));
        results
    }

    async fn add_snippets_and_highlights(
        &self,
        mut results: Vec<SearchResult>,
        query: &str,
        options: &SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        let query_terms: Vec<&str> = query.split_whitespace().collect();
        
        for result in &mut results {
            if let Some(ref content) = result.content {
                // Generate snippet
                result.snippet = Some(self.generate_snippet(content, query, 200));
                
                // Generate highlights if enabled
                if options.highlight_matches {
                    result.highlights = self.generate_highlights(content, &query_terms);
                }
            }
        }
        
        Ok(results)
    }

    fn generate_snippet(&self, content: &str, query: &str, max_length: usize) -> String {
        let query_lower = query.to_lowercase();
        let content_lower = content.to_lowercase();
        
        // Find the position of the query in the content
        if let Some(pos) = content_lower.find(&query_lower) {
            let start = pos.saturating_sub(max_length / 2);
            let end = std::cmp::min(content.len(), start + max_length);
            
            let mut snippet = content[start..end].to_string();
            
            // Add ellipsis if truncated
            if start > 0 {
                snippet = format!("...{}", snippet);
            }
            if end < content.len() {
                snippet = format!("{}...", snippet);
            }
            
            snippet
        } else {
            // If query not found, return beginning of content
            let end = std::cmp::min(content.len(), max_length);
            let mut snippet = content[..end].to_string();
            if end < content.len() {
                snippet = format!("{}...", snippet);
            }
            snippet
        }
    }

    fn generate_highlights(&self, content: &str, query_terms: &[&str]) -> Vec<TextHighlight> {
        let mut highlights = Vec::new();
        let content_lower = content.to_lowercase();
        
        for term in query_terms {
            let term_lower = term.to_lowercase();
            let mut start = 0;
            
            while let Some(pos) = content_lower[start..].find(&term_lower) {
                let actual_pos = start + pos;
                highlights.push(TextHighlight {
                    start: actual_pos,
                    end: actual_pos + term.len(),
                    text: term.to_string(),
                });
                start = actual_pos + term.len();
            }
        }
        
        // Sort highlights by position
        highlights.sort_by_key(|h| h.start);
        
        // Remove overlapping highlights
        let mut filtered_highlights = Vec::new();
        for highlight in highlights {
            let overlaps = filtered_highlights.iter().any(|existing: &TextHighlight| {
                highlight.start < existing.end && highlight.end > existing.start
            });
            
            if !overlaps {
                filtered_highlights.push(highlight);
            }
        }
        
        filtered_highlights
    }

    fn tokenize_and_stem(&self, text: &str) -> Vec<String> {
        text.unicode_words()
            .map(|word| word.to_lowercase())
            .map(|word| self.stemmer.stem(&word).to_string())
            .collect()
    }

    pub async fn index_document(&self, document: &IndexedDocument) -> Result<()> {
        self.indexer.index_document(document).await
    }

    pub async fn remove_document(&self, document_id: &str) -> Result<()> {
        self.indexer.remove_document(document_id).await
    }

    pub async fn rebuild_index(&self) -> Result<()> {
        info!("Rebuilding search index");
        
        let db = self.database.read().await;
        let mut stmt = db.prepare("SELECT id, title, content, metadata FROM documents")?;
        
        let rows = stmt.query_map([], |row| {
            let content: String = row.get(2)?;
            let metadata_str: String = row.get(3)?;
            let metadata = serde_json::from_str(&metadata_str).unwrap_or_default();
            
            Ok(IndexedDocument {
                id: row.get(0)?,
                title: row.get(1)?,
                content: content.clone(),
                tokens: self.tokenize_and_stem(&content),
                entities: Vec::new(), // TODO: Load entities
                metadata,
                embedding: None, // TODO: Generate embeddings
            })
        })?;

        for row in rows {
            let document = row?;
            self.indexer.index_document(&document).await?;
        }
        
        info!("Search index rebuilt successfully");
        Ok(())
    }

    pub async fn get_search_statistics(&self) -> Result<serde_json::Value> {
        let db = self.database.read().await;
        
        let document_count: i64 = db.query_row("SELECT COUNT(*) FROM documents", [], |row| row.get(0))?;
        let entity_count: i64 = db.query_row("SELECT COUNT(*) FROM entities", [], |row| row.get(0))?;
        
        Ok(serde_json::json!({
            "document_count": document_count,
            "entity_count": entity_count,
            "index_size": self.indexer.get_index_size().await?,
        }))
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use rusqlite::Connection;
    use tempfile::TempDir;

    async fn create_test_search_engine() -> SearchEngine {
        let temp_dir = TempDir::new().unwrap();
        let db_path = temp_dir.path().join("test.db");
        let conn = Connection::open(db_path).unwrap();
        
        // Create test tables
        conn.execute(
            "CREATE TABLE documents (
                id TEXT PRIMARY KEY,
                title TEXT,
                content TEXT,
                metadata TEXT
            )",
            [],
        ).unwrap();
        
        let db = Arc::new(RwLock::new(conn));
        SearchEngine::new(db).unwrap()
    }

    #[tokio::test]
    async fn test_search_engine_creation() {
        let engine = create_test_search_engine().await;
        assert!(engine.initialize().await.is_ok());
    }

    #[tokio::test]
    async fn test_tokenize_and_stem() {
        let engine = create_test_search_engine().await;
        let tokens = engine.tokenize_and_stem("Running quickly through the forest");
        
        assert!(!tokens.is_empty());
        assert!(tokens.contains(&"run".to_string())); // "running" should be stemmed to "run"
    }

    #[test]
    fn test_snippet_generation() {
        let engine = tokio::runtime::Runtime::new().unwrap().block_on(create_test_search_engine());
        let content = "This is a long document with multiple sentences. The search query should be highlighted in the snippet. This continues for much longer.";
        let snippet = engine.generate_snippet(content, "search query", 50);
        
        assert!(snippet.contains("search query"));
        assert!(snippet.len() <= 60); // Account for ellipsis
    }

    #[test]
    fn test_highlight_generation() {
        let engine = tokio::runtime::Runtime::new().unwrap().block_on(create_test_search_engine());
        let content = "This is a test document with test content for testing.";
        let highlights = engine.generate_highlights(content, &["test", "content"]);
        
        assert!(!highlights.is_empty());
        assert!(highlights.iter().any(|h| h.text == "test"));
        assert!(highlights.iter().any(|h| h.text == "content"));
    }
}