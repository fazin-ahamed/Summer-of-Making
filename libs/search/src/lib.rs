use std::collections::{HashMap, BTreeMap, HashSet};
use std::cmp::Reverse;
use serde::{Deserialize, Serialize};
use std::hash::{Hash, Hasher};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchResult {
    pub document_id: String,
    pub title: String,
    pub content_snippet: String,
    pub score: f64,
    pub match_positions: Vec<MatchPosition>,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct MatchPosition {
    pub start: usize,
    pub end: usize,
    pub field: String,
    pub match_type: MatchType,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum MatchType {
    Exact,
    Fuzzy,
    Semantic,
    Partial,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SearchQuery {
    pub query: String,
    pub filters: HashMap<String, String>,
    pub limit: Option<usize>,
    pub offset: Option<usize>,
    pub sort_by: Option<SortBy>,
    pub search_mode: SearchMode,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SearchMode {
    Standard,
    Fuzzy,
    Semantic,
    Boolean,
    Wildcard,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub enum SortBy {
    Relevance,
    Date,
    Title,
    Size,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Document {
    pub id: String,
    pub title: String,
    pub content: String,
    pub created_at: i64,
    pub size: u64,
    pub metadata: HashMap<String, String>,
}

#[derive(Debug, Clone)]
pub struct IndexedDocument {
    pub document: Document,
    pub term_frequencies: HashMap<String, f64>,
    pub word_positions: HashMap<String, Vec<usize>>,
}

pub struct SearchEngine {
    documents: HashMap<String, IndexedDocument>,
    inverted_index: HashMap<String, HashSet<String>>,
    document_frequencies: HashMap<String, usize>,
    total_documents: usize,
    stopwords: HashSet<String>,
}

impl SearchEngine {
    pub fn new() -> Self {
        let stopwords = ["the", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with", "by", "a", "an"]
            .iter().map(|s| s.to_string()).collect();

        SearchEngine {
            documents: HashMap::new(),
            inverted_index: HashMap::new(),
            document_frequencies: HashMap::new(),
            total_documents: 0,
            stopwords,
        }
    }

    pub fn add_document(&mut self, document: Document) -> Result<(), String> {
        let doc_id = document.id.clone();
        
        // Tokenize and process the document
        let content_tokens = self.tokenize(&document.content);
        let title_tokens = self.tokenize(&document.title);
        let mut all_tokens = content_tokens.clone();
        all_tokens.extend(title_tokens);

        // Calculate term frequencies
        let term_frequencies = self.calculate_term_frequencies(&all_tokens);
        
        // Build word positions map
        let word_positions = self.build_word_positions(&all_tokens);

        // Update inverted index
        for term in term_frequencies.keys() {
            self.inverted_index
                .entry(term.clone())
                .or_insert_with(HashSet::new)
                .insert(doc_id.clone());
                
            *self.document_frequencies.entry(term.clone()).or_insert(0) += 1;
        }

        // Store indexed document
        let indexed_doc = IndexedDocument {
            document,
            term_frequencies,
            word_positions,
        };

        if self.documents.insert(doc_id.clone(), indexed_doc).is_none() {
            self.total_documents += 1;
        }

        Ok(())
    }

    pub fn remove_document(&mut self, document_id: &str) -> Result<(), String> {
        if let Some(indexed_doc) = self.documents.remove(document_id) {
            self.total_documents -= 1;
            
            // Update inverted index and document frequencies
            for term in indexed_doc.term_frequencies.keys() {
                if let Some(doc_set) = self.inverted_index.get_mut(term) {
                    doc_set.remove(document_id);
                    if doc_set.is_empty() {
                        self.inverted_index.remove(term);
                    }
                }
                
                if let Some(count) = self.document_frequencies.get_mut(term) {
                    *count -= 1;
                    if *count == 0 {
                        self.document_frequencies.remove(term);
                    }
                }
            }
            
            Ok(())
        } else {
            Err(format!("Document with ID '{}' not found", document_id))
        }
    }

    pub fn search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        match query.search_mode {
            SearchMode::Standard => self.standard_search(query),
            SearchMode::Fuzzy => self.fuzzy_search(query),
            SearchMode::Semantic => self.semantic_search(query),
            SearchMode::Boolean => self.boolean_search(query),
            SearchMode::Wildcard => self.wildcard_search(query),
        }
    }

    fn standard_search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        let query_terms = self.tokenize(&query.query);
        let mut scores: HashMap<String, f64> = HashMap::new();

        for term in &query_terms {
            if let Some(doc_ids) = self.inverted_index.get(term) {
                let idf = self.calculate_idf(term);
                
                for doc_id in doc_ids {
                    if let Some(indexed_doc) = self.documents.get(doc_id) {
                        let tf = indexed_doc.term_frequencies.get(term).unwrap_or(&0.0);
                        let tf_idf = tf * idf;
                        *scores.entry(doc_id.clone()).or_insert(0.0) += tf_idf;
                    }
                }
            }
        }

        self.build_search_results(scores, query)
    }

    fn fuzzy_search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        let query_terms = self.tokenize(&query.query);
        let mut scores: HashMap<String, f64> = HashMap::new();

        for query_term in &query_terms {
            // Find similar terms using edit distance
            for index_term in self.inverted_index.keys() {
                let distance = self.levenshtein_distance(query_term, index_term);
                let max_len = query_term.len().max(index_term.len());
                
                if distance <= max_len / 3 { // Allow up to 1/3 character differences
                    let similarity = 1.0 - (distance as f64 / max_len as f64);
                    
                    if let Some(doc_ids) = self.inverted_index.get(index_term) {
                        let idf = self.calculate_idf(index_term);
                        
                        for doc_id in doc_ids {
                            if let Some(indexed_doc) = self.documents.get(doc_id) {
                                let tf = indexed_doc.term_frequencies.get(index_term).unwrap_or(&0.0);
                                let fuzzy_score = tf * idf * similarity;
                                *scores.entry(doc_id.clone()).or_insert(0.0) += fuzzy_score;
                            }
                        }
                    }
                }
            }
        }

        self.build_search_results(scores, query)
    }

    fn semantic_search(&self, _query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        // Mock semantic search - in real implementation, use embeddings
        Err("Semantic search not implemented in mock version".to_string())
    }

    fn boolean_search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        // Simple boolean search implementation
        let query_lower = query.query.to_lowercase();
        let mut matching_docs = HashSet::new();

        if query_lower.contains(" and ") {
            let terms: Vec<&str> = query_lower.split(" and ").collect();
            let tokenized_terms: Vec<Vec<String>> = terms.iter()
                .map(|term| self.tokenize(term.trim()))
                .collect();

            // Find intersection of all terms
            if let Some(first_terms) = tokenized_terms.first() {
                for term in first_terms {
                    if let Some(doc_ids) = self.inverted_index.get(term) {
                        let mut current_docs = doc_ids.clone();
                        
                        for other_terms in tokenized_terms.iter().skip(1) {
                            for other_term in other_terms {
                                if let Some(other_doc_ids) = self.inverted_index.get(other_term) {
                                    current_docs = current_docs.intersection(other_doc_ids).cloned().collect();
                                }
                            }
                        }
                        matching_docs.extend(current_docs);
                    }
                }
            }
        } else if query_lower.contains(" or ") {
            let terms: Vec<&str> = query_lower.split(" or ").collect();
            for term in terms {
                let tokenized = self.tokenize(term.trim());
                for token in tokenized {
                    if let Some(doc_ids) = self.inverted_index.get(&token) {
                        matching_docs.extend(doc_ids.iter().cloned());
                    }
                }
            }
        } else {
            // Simple term search
            let terms = self.tokenize(&query.query);
            for term in terms {
                if let Some(doc_ids) = self.inverted_index.get(&term) {
                    matching_docs.extend(doc_ids.iter().cloned());
                }
            }
        }

        let scores: HashMap<String, f64> = matching_docs.into_iter()
            .map(|doc_id| (doc_id, 1.0))
            .collect();

        self.build_search_results(scores, query)
    }

    fn wildcard_search(&self, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        let pattern = query.query.replace('*', ".*").replace('?', ".");
        let regex = regex::Regex::new(&pattern)
            .map_err(|e| format!("Invalid wildcard pattern: {}", e))?;

        let mut scores: HashMap<String, f64> = HashMap::new();

        for term in self.inverted_index.keys() {
            if regex.is_match(term) {
                if let Some(doc_ids) = self.inverted_index.get(term) {
                    let idf = self.calculate_idf(term);
                    
                    for doc_id in doc_ids {
                        if let Some(indexed_doc) = self.documents.get(doc_id) {
                            let tf = indexed_doc.term_frequencies.get(term).unwrap_or(&0.0);
                            let score = tf * idf;
                            *scores.entry(doc_id.clone()).or_insert(0.0) += score;
                        }
                    }
                }
            }
        }

        self.build_search_results(scores, query)
    }

    fn build_search_results(&self, scores: HashMap<String, f64>, query: &SearchQuery) -> Result<Vec<SearchResult>, String> {
        let mut results: Vec<SearchResult> = Vec::new();

        for (doc_id, score) in scores {
            if let Some(indexed_doc) = self.documents.get(&doc_id) {
                // Apply filters
                if !self.apply_filters(&indexed_doc.document, &query.filters) {
                    continue;
                }

                let snippet = self.generate_snippet(&indexed_doc.document.content, &query.query, 200);
                let match_positions = self.find_match_positions(&indexed_doc, &query.query);

                results.push(SearchResult {
                    document_id: doc_id,
                    title: indexed_doc.document.title.clone(),
                    content_snippet: snippet,
                    score,
                    match_positions,
                    metadata: indexed_doc.document.metadata.clone(),
                });
            }
        }

        // Sort results
        match query.sort_by.as_ref().unwrap_or(&SortBy::Relevance) {
            SortBy::Relevance => results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap()),
            SortBy::Date => results.sort_by(|a, b| {
                let a_date = a.metadata.get("created_at").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
                let b_date = b.metadata.get("created_at").and_then(|s| s.parse::<i64>().ok()).unwrap_or(0);
                b_date.cmp(&a_date)
            }),
            SortBy::Title => results.sort_by(|a, b| a.title.cmp(&b.title)),
            SortBy::Size => results.sort_by(|a, b| {
                let a_size = a.metadata.get("size").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
                let b_size = b.metadata.get("size").and_then(|s| s.parse::<u64>().ok()).unwrap_or(0);
                b_size.cmp(&a_size)
            }),
        }

        // Apply pagination
        let offset = query.offset.unwrap_or(0);
        let limit = query.limit.unwrap_or(results.len());
        
        let end = (offset + limit).min(results.len());
        if offset < results.len() {
            Ok(results[offset..end].to_vec())
        } else {
            Ok(Vec::new())
        }
    }

    fn apply_filters(&self, document: &Document, filters: &HashMap<String, String>) -> bool {
        for (key, value) in filters {
            match key.as_str() {
                "content_type" => {
                    if let Some(doc_type) = document.metadata.get("content_type") {
                        if doc_type != value {
                            return false;
                        }
                    }
                },
                "min_size" => {
                    if let Ok(min_size) = value.parse::<u64>() {
                        if document.size < min_size {
                            return false;
                        }
                    }
                },
                "max_size" => {
                    if let Ok(max_size) = value.parse::<u64>() {
                        if document.size > max_size {
                            return false;
                        }
                    }
                },
                _ => {
                    if let Some(doc_value) = document.metadata.get(key) {
                        if doc_value != value {
                            return false;
                        }
                    }
                }
            }
        }
        true
    }

    fn generate_snippet(&self, content: &str, query: &str, max_length: usize) -> String {
        let query_terms = self.tokenize(query);
        let content_lower = content.to_lowercase();
        
        for term in &query_terms {
            if let Some(pos) = content_lower.find(term) {
                let start = pos.saturating_sub(max_length / 2);
                let end = (start + max_length).min(content.len());
                let mut snippet = content[start..end].to_string();
                
                if start > 0 {
                    snippet = format!("...{}", snippet);
                }
                if end < content.len() {
                    snippet = format!("{}...", snippet);
                }
                
                return snippet;
            }
        }
        
        // If no match found, return beginning of content
        if content.len() <= max_length {
            content.to_string()
        } else {
            format!("{}...", &content[..max_length])
        }
    }

    fn find_match_positions(&self, indexed_doc: &IndexedDocument, query: &str) -> Vec<MatchPosition> {
        let query_terms = self.tokenize(query);
        let mut positions = Vec::new();

        for term in query_terms {
            if let Some(word_positions) = indexed_doc.word_positions.get(&term) {
                for &pos in word_positions {
                    positions.push(MatchPosition {
                        start: pos,
                        end: pos + term.len(),
                        field: "content".to_string(),
                        match_type: MatchType::Exact,
                    });
                }
            }
        }

        positions
    }

    fn tokenize(&self, text: &str) -> Vec<String> {
        text.to_lowercase()
            .split_whitespace()
            .map(|word| word.trim_matches(|c: char| !c.is_alphanumeric()))
            .filter(|word| !word.is_empty() && !self.stopwords.contains(*word))
            .map(|word| word.to_string())
            .collect()
    }

    fn calculate_term_frequencies(&self, tokens: &[String]) -> HashMap<String, f64> {
        let mut tf = HashMap::new();
        let total_tokens = tokens.len() as f64;

        for token in tokens {
            *tf.entry(token.clone()).or_insert(0.0) += 1.0;
        }

        // Normalize by total tokens
        for (_, freq) in tf.iter_mut() {
            *freq /= total_tokens;
        }

        tf
    }

    fn build_word_positions(&self, tokens: &[String]) -> HashMap<String, Vec<usize>> {
        let mut positions = HashMap::new();
        
        for (i, token) in tokens.iter().enumerate() {
            positions.entry(token.clone()).or_insert_with(Vec::new).push(i);
        }

        positions
    }

    fn calculate_idf(&self, term: &str) -> f64 {
        let df = self.document_frequencies.get(term).unwrap_or(&0);
        if *df == 0 {
            return 0.0;
        }
        
        (self.total_documents as f64 / *df as f64).ln()
    }

    fn levenshtein_distance(&self, a: &str, b: &str) -> usize {
        let a_chars: Vec<char> = a.chars().collect();
        let b_chars: Vec<char> = b.chars().collect();
        let a_len = a_chars.len();
        let b_len = b_chars.len();

        if a_len == 0 { return b_len; }
        if b_len == 0 { return a_len; }

        let mut matrix = vec![vec![0; b_len + 1]; a_len + 1];

        for i in 0..=a_len {
            matrix[i][0] = i;
        }
        for j in 0..=b_len {
            matrix[0][j] = j;
        }

        for i in 1..=a_len {
            for j in 1..=b_len {
                let cost = if a_chars[i - 1] == b_chars[j - 1] { 0 } else { 1 };
                matrix[i][j] = (matrix[i - 1][j] + 1)
                    .min(matrix[i][j - 1] + 1)
                    .min(matrix[i - 1][j - 1] + cost);
            }
        }

        matrix[a_len][b_len]
    }

    pub fn get_document_count(&self) -> usize {
        self.total_documents
    }

    pub fn get_index_stats(&self) -> HashMap<String, usize> {
        let mut stats = HashMap::new();
        stats.insert("total_documents".to_string(), self.total_documents);
        stats.insert("total_terms".to_string(), self.inverted_index.len());
        stats.insert("total_document_frequencies".to_string(), self.document_frequencies.len());
        stats
    }

    pub fn clear_index(&mut self) {
        self.documents.clear();
        self.inverted_index.clear();
        self.document_frequencies.clear();
        self.total_documents = 0;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    fn create_test_document(id: &str, title: &str, content: &str) -> Document {
        Document {
            id: id.to_string(),
            title: title.to_string(),
            content: content.to_string(),
            created_at: 1640000000,
            size: content.len() as u64,
            metadata: HashMap::new(),
        }
    }

    #[test]
    fn test_search_engine_creation() {
        let engine = SearchEngine::new();
        assert_eq!(engine.get_document_count(), 0);
    }

    #[test]
    fn test_add_document() {
        let mut engine = SearchEngine::new();
        let doc = create_test_document("1", "Test Document", "This is a test document with some content.");
        
        let result = engine.add_document(doc);
        assert!(result.is_ok());
        assert_eq!(engine.get_document_count(), 1);
    }

    #[test]
    fn test_remove_document() {
        let mut engine = SearchEngine::new();
        let doc = create_test_document("1", "Test Document", "This is a test document.");
        
        engine.add_document(doc).unwrap();
        assert_eq!(engine.get_document_count(), 1);
        
        let result = engine.remove_document("1");
        assert!(result.is_ok());
        assert_eq!(engine.get_document_count(), 0);
    }

    #[test]
    fn test_standard_search() {
        let mut engine = SearchEngine::new();
        let doc1 = create_test_document("1", "First Document", "This document contains information about rust programming.");
        let doc2 = create_test_document("2", "Second Document", "This document talks about python programming.");
        
        engine.add_document(doc1).unwrap();
        engine.add_document(doc2).unwrap();

        let query = SearchQuery {
            query: "rust programming".to_string(),
            filters: HashMap::new(),
            limit: None,
            offset: None,
            sort_by: Some(SortBy::Relevance),
            search_mode: SearchMode::Standard,
        };

        let results = engine.search(&query).unwrap();
        assert!(!results.is_empty());
        assert_eq!(results[0].document_id, "1");
    }

    #[test]
    fn test_fuzzy_search() {
        let mut engine = SearchEngine::new();
        let doc = create_test_document("1", "Document", "This document contains programming information.");
        
        engine.add_document(doc).unwrap();

        let query = SearchQuery {
            query: "programing".to_string(), // Misspelled
            filters: HashMap::new(),
            limit: None,
            offset: None,
            sort_by: Some(SortBy::Relevance),
            search_mode: SearchMode::Fuzzy,
        };

        let results = engine.search(&query).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_boolean_search() {
        let mut engine = SearchEngine::new();
        let doc1 = create_test_document("1", "Doc1", "This document contains rust and programming.");
        let doc2 = create_test_document("2", "Doc2", "This document contains python programming.");
        let doc3 = create_test_document("3", "Doc3", "This document contains rust only.");
        
        engine.add_document(doc1).unwrap();
        engine.add_document(doc2).unwrap();
        engine.add_document(doc3).unwrap();

        let query = SearchQuery {
            query: "rust and programming".to_string(),
            filters: HashMap::new(),
            limit: None,
            offset: None,
            sort_by: Some(SortBy::Relevance),
            search_mode: SearchMode::Boolean,
        };

        let results = engine.search(&query).unwrap();
        assert_eq!(results.len(), 1);
        assert_eq!(results[0].document_id, "1");
    }

    #[test]
    fn test_wildcard_search() {
        let mut engine = SearchEngine::new();
        let doc = create_test_document("1", "Document", "This document contains programming and development.");
        
        engine.add_document(doc).unwrap();

        let query = SearchQuery {
            query: "program*".to_string(),
            filters: HashMap::new(),
            limit: None,
            offset: None,
            sort_by: Some(SortBy::Relevance),
            search_mode: SearchMode::Wildcard,
        };

        let results = engine.search(&query).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_search_with_filters() {
        let mut engine = SearchEngine::new();
        let mut metadata = HashMap::new();
        metadata.insert("content_type".to_string(), "pdf".to_string());
        
        let mut doc = create_test_document("1", "Document", "This is a test document.");
        doc.metadata = metadata;
        
        engine.add_document(doc).unwrap();

        let mut filters = HashMap::new();
        filters.insert("content_type".to_string(), "pdf".to_string());

        let query = SearchQuery {
            query: "test".to_string(),
            filters,
            limit: None,
            offset: None,
            sort_by: Some(SortBy::Relevance),
            search_mode: SearchMode::Standard,
        };

        let results = engine.search(&query).unwrap();
        assert!(!results.is_empty());
    }

    #[test]
    fn test_pagination() {
        let mut engine = SearchEngine::new();
        for i in 1..=10 {
            let doc = create_test_document(&i.to_string(), &format!("Document {}", i), "test content");
            engine.add_document(doc).unwrap();
        }

        let query = SearchQuery {
            query: "test".to_string(),
            filters: HashMap::new(),
            limit: Some(5),
            offset: Some(0),
            sort_by: Some(SortBy::Relevance),
            search_mode: SearchMode::Standard,
        };

        let results = engine.search(&query).unwrap();
        assert_eq!(results.len(), 5);
    }

    #[test]
    fn test_tokenization() {
        let engine = SearchEngine::new();
        let tokens = engine.tokenize("This is a test, with punctuation!");
        
        assert!(tokens.contains(&"test".to_string()));
        assert!(tokens.contains(&"punctuation".to_string()));
        assert!(!tokens.contains(&"is".to_string())); // Stopword
    }

    #[test]
    fn test_levenshtein_distance() {
        let engine = SearchEngine::new();
        
        assert_eq!(engine.levenshtein_distance("cat", "cat"), 0);
        assert_eq!(engine.levenshtein_distance("cat", "bat"), 1);
        assert_eq!(engine.levenshtein_distance("kitten", "sitting"), 3);
    }

    #[test]
    fn test_snippet_generation() {
        let engine = SearchEngine::new();
        let content = "This is a very long document with lots of content. We want to test snippet generation.";
        let snippet = engine.generate_snippet(content, "test", 50);
        
        assert!(snippet.contains("test"));
        assert!(snippet.len() <= 60); // Including potential ellipsis
    }

    #[test]
    fn test_clear_index() {
        let mut engine = SearchEngine::new();
        let doc = create_test_document("1", "Document", "Test content");
        
        engine.add_document(doc).unwrap();
        assert_eq!(engine.get_document_count(), 1);
        
        engine.clear_index();
        assert_eq!(engine.get_document_count(), 0);
    }

    #[test]
    fn test_index_stats() {
        let mut engine = SearchEngine::new();
        let doc = create_test_document("1", "Document", "This is test content with unique words.");
        
        engine.add_document(doc).unwrap();
        
        let stats = engine.get_index_stats();
        assert_eq!(stats.get("total_documents"), Some(&1));
        assert!(stats.get("total_terms").unwrap() > &0);
    }
}