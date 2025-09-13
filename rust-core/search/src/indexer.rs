use std::collections::HashMap;
use anyhow::Result;
use serde::{Serialize, Deserialize};

use crate::{IndexedDocument, SearchResult};

#[derive(Debug, Clone)]
pub struct FullTextIndexer {
    term_frequencies: HashMap<String, HashMap<String, f64>>, // term -> doc_id -> frequency
    document_frequencies: HashMap<String, usize>, // term -> number of documents containing term
    document_count: usize,
}

impl FullTextIndexer {
    pub fn new() -> Result<Self> {
        Ok(Self {
            term_frequencies: HashMap::new(),
            document_frequencies: HashMap::new(),
            document_count: 0,
        })
    }

    pub async fn initialize(&self) -> Result<()> {
        // Initialize indexer - placeholder for now
        Ok(())
    }

    pub async fn index_document(&mut self, document: &IndexedDocument) -> Result<()> {
        // Remove existing document if it exists
        self.remove_document(&document.id).await?;

        // Calculate term frequencies for this document
        let mut term_counts = HashMap::new();
        let mut total_terms = 0;

        for token in &document.tokens {
            *term_counts.entry(token.clone()).or_insert(0) += 1;
            total_terms += 1;
        }

        // Calculate TF (term frequency) for each term
        for (term, count) in term_counts {
            let tf = count as f64 / total_terms as f64;
            
            // Update term frequencies
            self.term_frequencies
                .entry(term.clone())
                .or_insert_with(HashMap::new)
                .insert(document.id.clone(), tf);

            // Update document frequencies
            *self.document_frequencies.entry(term).or_insert(0) += 1;
        }

        self.document_count += 1;
        Ok(())
    }

    pub async fn remove_document(&mut self, document_id: &str) -> Result<()> {
        // Remove document from term frequencies and update document frequencies
        let mut terms_to_remove = Vec::new();

        for (term, doc_frequencies) in &mut self.term_frequencies {
            if doc_frequencies.remove(document_id).is_some() {
                // Decrease document frequency for this term
                if let Some(df) = self.document_frequencies.get_mut(term) {
                    *df = df.saturating_sub(1);
                    if *df == 0 {
                        terms_to_remove.push(term.clone());
                    }
                }
                
                // Remove term entry if no documents contain it
                if doc_frequencies.is_empty() {
                    terms_to_remove.push(term.clone());
                }
            }
        }

        // Clean up empty entries
        for term in terms_to_remove {
            self.term_frequencies.remove(&term);
            self.document_frequencies.remove(&term);
        }

        if self.document_count > 0 {
            self.document_count -= 1;
        }

        Ok(())
    }

    pub fn calculate_tf_idf(&self, term: &str, document_id: &str) -> f64 {
        let tf = self.term_frequencies
            .get(term)
            .and_then(|docs| docs.get(document_id))
            .copied()
            .unwrap_or(0.0);

        let df = self.document_frequencies.get(term).copied().unwrap_or(0) as f64;
        
        if df == 0.0 || self.document_count == 0 {
            return 0.0;
        }

        let idf = (self.document_count as f64 / df).ln();
        tf * idf
    }

    pub fn get_document_score(&self, query_terms: &[String], document_id: &str) -> f64 {
        let mut score = 0.0;
        
        for term in query_terms {
            score += self.calculate_tf_idf(term, document_id);
        }
        
        score
    }

    pub async fn get_index_size(&self) -> Result<usize> {
        Ok(self.term_frequencies.len())
    }

    pub fn get_term_documents(&self, term: &str) -> Vec<String> {
        self.term_frequencies
            .get(term)
            .map(|docs| docs.keys().cloned().collect())
            .unwrap_or_default()
    }
}

#[derive(Debug, Clone)]
pub struct InvertedIndex {
    index: HashMap<String, Vec<DocumentPosting>>,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct DocumentPosting {
    pub document_id: String,
    pub term_frequency: f64,
    pub positions: Vec<usize>,
}

impl InvertedIndex {
    pub fn new() -> Self {
        Self {
            index: HashMap::new(),
        }
    }

    pub fn add_document(&mut self, document: &IndexedDocument) {
        for (position, token) in document.tokens.iter().enumerate() {
            let entry = self.index.entry(token.clone()).or_insert_with(Vec::new);
            
            // Find or create posting for this document
            if let Some(posting) = entry.iter_mut().find(|p| p.document_id == document.id) {
                posting.positions.push(position);
                posting.term_frequency += 1.0;
            } else {
                entry.push(DocumentPosting {
                    document_id: document.id.clone(),
                    term_frequency: 1.0,
                    positions: vec![position],
                });
            }
        }

        // Normalize term frequencies by document length
        for term_postings in self.index.values_mut() {
            for posting in term_postings.iter_mut() {
                if posting.document_id == document.id {
                    posting.term_frequency /= document.tokens.len() as f64;
                }
            }
        }
    }

    pub fn search(&self, terms: &[String]) -> Vec<String> {
        if terms.is_empty() {
            return Vec::new();
        }

        let mut document_scores: HashMap<String, f64> = HashMap::new();

        for term in terms {
            if let Some(postings) = self.index.get(term) {
                for posting in postings {
                    *document_scores.entry(posting.document_id.clone()).or_insert(0.0) += posting.term_frequency;
                }
            }
        }

        let mut results: Vec<(String, f64)> = document_scores.into_iter().collect();
        results.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        
        results.into_iter().map(|(doc_id, _)| doc_id).collect()
    }

    pub fn get_term_positions(&self, term: &str, document_id: &str) -> Vec<usize> {
        self.index
            .get(term)
            .and_then(|postings| {
                postings.iter().find(|p| p.document_id == document_id)
            })
            .map(|posting| posting.positions.clone())
            .unwrap_or_default()
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use uuid::Uuid;

    fn create_test_document(id: &str, content: &str) -> IndexedDocument {
        let tokens: Vec<String> = content
            .split_whitespace()
            .map(|word| word.to_lowercase())
            .collect();

        IndexedDocument {
            id: id.to_string(),
            title: format!("Document {}", id),
            content: content.to_string(),
            tokens,
            entities: Vec::new(),
            metadata: serde_json::json!({}),
            embedding: None,
        }
    }

    #[tokio::test]
    async fn test_indexer_creation() {
        let indexer = FullTextIndexer::new();
        assert!(indexer.is_ok());
    }

    #[tokio::test]
    async fn test_document_indexing() {
        let mut indexer = FullTextIndexer::new().unwrap();
        let doc = create_test_document("1", "hello world test document");
        
        assert!(indexer.index_document(&doc).await.is_ok());
        
        let score = indexer.get_document_score(&["hello".to_string()], "1");
        assert!(score > 0.0);
    }

    #[tokio::test]
    async fn test_document_removal() {
        let mut indexer = FullTextIndexer::new().unwrap();
        let doc = create_test_document("1", "hello world test document");
        
        indexer.index_document(&doc).await.unwrap();
        assert!(indexer.get_document_score(&["hello".to_string()], "1") > 0.0);
        
        indexer.remove_document("1").await.unwrap();
        assert_eq!(indexer.get_document_score(&["hello".to_string()], "1"), 0.0);
    }

    #[test]
    fn test_inverted_index() {
        let mut index = InvertedIndex::new();
        let doc1 = create_test_document("1", "hello world");
        let doc2 = create_test_document("2", "world test");
        
        index.add_document(&doc1);
        index.add_document(&doc2);
        
        let results = index.search(&["world".to_string()]);
        assert_eq!(results.len(), 2);
        assert!(results.contains(&"1".to_string()));
        assert!(results.contains(&"2".to_string()));
        
        let positions = index.get_term_positions("world", "1");
        assert!(!positions.is_empty());
    }

    #[tokio::test]
    async fn test_tf_idf_calculation() {
        let mut indexer = FullTextIndexer::new().unwrap();
        
        let doc1 = create_test_document("1", "cat dog cat");
        let doc2 = create_test_document("2", "dog bird");
        
        indexer.index_document(&doc1).await.unwrap();
        indexer.index_document(&doc2).await.unwrap();
        
        // "cat" appears in 1 document, so it should have higher TF-IDF than "dog" which appears in 2
        let cat_score = indexer.calculate_tf_idf("cat", "1");
        let dog_score = indexer.calculate_tf_idf("dog", "1");
        
        assert!(cat_score > dog_score);
    }
}