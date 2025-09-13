use std::collections::HashMap;
use anyhow::Result;
use chrono::{DateTime, Utc};

use crate::{SearchResult, SearchOptions};

#[derive(Debug, Clone)]
pub struct SearchRanker {
    // Configuration for ranking algorithms
    freshness_weight: f64,
    relevance_weight: f64,
    popularity_weight: f64,
}

impl SearchRanker {
    pub fn new() -> Self {
        Self {
            freshness_weight: 0.2,
            relevance_weight: 0.6,
            popularity_weight: 0.2,
        }
    }

    pub async fn rank_results(
        &self,
        mut results: Vec<SearchResult>,
        query_terms: &[String],
        options: &SearchOptions,
    ) -> Result<Vec<SearchResult>> {
        // Calculate ranking scores for each result
        for result in &mut results {
            result.score = self.calculate_ranking_score(result, query_terms, options).await?;
        }

        // Sort by score (highest first)
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        Ok(results)
    }

    async fn calculate_ranking_score(
        &self,
        result: &SearchResult,
        query_terms: &[String],
        options: &SearchOptions,
    ) -> Result<f64> {
        let mut score = result.score; // Base relevance score

        // Apply freshness boost if enabled
        if options.boost_recent {
            score += self.calculate_freshness_score(result) * self.freshness_weight;
        }

        // Apply query-specific scoring
        score += self.calculate_query_match_score(result, query_terms) * self.relevance_weight;

        // Apply popularity score (based on metadata)
        score += self.calculate_popularity_score(result) * self.popularity_weight;

        Ok(score)
    }

    fn calculate_freshness_score(&self, result: &SearchResult) -> f64 {
        // Extract modification date from metadata
        if let Some(modified_at) = result.metadata.get("modified_at") {
            if let Some(timestamp) = modified_at.as_i64() {
                let modified_date = DateTime::from_timestamp(timestamp, 0);
                if let Some(modified_date) = modified_date {
                    let now = Utc::now();
                    let days_old = (now - modified_date).num_days() as f64;
                    
                    // Exponential decay: more recent documents get higher scores
                    return (-days_old / 30.0).exp(); // Half-life of 30 days
                }
            }
        }
        
        0.0 // Default score if no date available
    }

    fn calculate_query_match_score(&self, result: &SearchResult, query_terms: &[String]) -> f64 {
        if query_terms.is_empty() {
            return 0.0;
        }

        let title_lower = result.title.to_lowercase();
        let content_lower = result.content
            .as_ref()
            .map(|c| c.to_lowercase())
            .unwrap_or_default();

        let mut score = 0.0;
        let total_terms = query_terms.len() as f64;

        for term in query_terms {
            let term_lower = term.to_lowercase();
            
            // Higher weight for title matches
            if title_lower.contains(&term_lower) {
                score += 2.0;
            }
            
            // Lower weight for content matches
            if content_lower.contains(&term_lower) {
                score += 1.0;
            }
            
            // Bonus for exact phrase matches
            let query_phrase = query_terms.join(" ").to_lowercase();
            if title_lower.contains(&query_phrase) {
                score += 3.0;
            }
            if content_lower.contains(&query_phrase) {
                score += 1.5;
            }
        }

        score / total_terms
    }

    fn calculate_popularity_score(&self, result: &SearchResult) -> f64 {
        let mut score = 0.0;

        // File size (larger files might be more comprehensive)
        if let Some(file_size) = result.metadata.get("file_size") {
            if let Some(size) = file_size.as_u64() {
                // Normalize by typical document size (assume 10KB is average)
                score += (size as f64 / 10_000.0).ln().max(0.0) * 0.1;
            }
        }

        // Word count
        if let Some(word_count) = result.metadata.get("word_count") {
            if let Some(count) = word_count.as_u64() {
                // Bonus for documents with substantial content
                score += (count as f64 / 100.0).ln().max(0.0) * 0.2;
            }
        }

        // Document type preferences
        if let Some(mime_type) = result.metadata.get("mime_type") {
            if let Some(mime_str) = mime_type.as_str() {
                score += match mime_str {
                    "application/pdf" => 0.3, // PDFs often contain important content
                    "text/markdown" => 0.2,   // Markdown is often documentation
                    "text/plain" => 0.1,      // Plain text is common
                    _ => 0.0,
                };
            }
        }

        score.min(1.0) // Cap at 1.0
    }

    pub fn set_weights(&mut self, freshness: f64, relevance: f64, popularity: f64) {
        // Normalize weights to sum to 1.0
        let total = freshness + relevance + popularity;
        if total > 0.0 {
            self.freshness_weight = freshness / total;
            self.relevance_weight = relevance / total;
            self.popularity_weight = popularity / total;
        }
    }
}

#[derive(Debug, Clone)]
pub struct ResultDiversifier {
    max_results_per_type: usize,
    max_results_per_source: usize,
}

impl ResultDiversifier {
    pub fn new() -> Self {
        Self {
            max_results_per_type: 10,
            max_results_per_source: 5,
        }
    }

    pub fn diversify_results(&self, results: Vec<SearchResult>) -> Vec<SearchResult> {
        let mut diversified = Vec::new();
        let mut type_counts: HashMap<String, usize> = HashMap::new();
        let mut source_counts: HashMap<String, usize> = HashMap::new();

        for result in results {
            let result_type = format!("{:?}", result.result_type);
            let source_type = result.metadata
                .get("source_type")
                .and_then(|v| v.as_str())
                .unwrap_or("unknown")
                .to_string();

            let type_count = type_counts.get(&result_type).copied().unwrap_or(0);
            let source_count = source_counts.get(&source_type).copied().unwrap_or(0);

            // Check if we should include this result based on diversity constraints
            if type_count < self.max_results_per_type && source_count < self.max_results_per_source {
                diversified.push(result);
                *type_counts.entry(result_type).or_insert(0) += 1;
                *source_counts.entry(source_type).or_insert(0) += 1;
            }
        }

        diversified
    }

    pub fn set_diversity_limits(&mut self, max_per_type: usize, max_per_source: usize) {
        self.max_results_per_type = max_per_type;
        self.max_results_per_source = max_per_source;
    }
}

#[derive(Debug, Clone)]
pub struct PersonalizationEngine {
    user_preferences: HashMap<String, f64>,
    search_history: Vec<String>,
}

impl PersonalizationEngine {
    pub fn new() -> Self {
        Self {
            user_preferences: HashMap::new(),
            search_history: Vec::new(),
        }
    }

    pub fn personalize_results(
        &self,
        mut results: Vec<SearchResult>,
        user_id: Option<&str>,
    ) -> Vec<SearchResult> {
        if user_id.is_none() {
            return results;
        }

        // Apply personalization based on user preferences
        for result in &mut results {
            result.score += self.calculate_personalization_score(result);
        }

        // Re-sort results
        results.sort_by(|a, b| b.score.partial_cmp(&a.score).unwrap_or(std::cmp::Ordering::Equal));

        results
    }

    fn calculate_personalization_score(&self, result: &SearchResult) -> f64 {
        let mut score = 0.0;

        // Boost based on document type preferences
        if let Some(mime_type) = result.metadata.get("mime_type") {
            if let Some(mime_str) = mime_type.as_str() {
                if let Some(preference) = self.user_preferences.get(mime_str) {
                    score += preference * 0.3;
                }
            }
        }

        // Boost based on source type preferences
        if let Some(source_type) = result.metadata.get("source_type") {
            if let Some(source_str) = source_type.as_str() {
                if let Some(preference) = self.user_preferences.get(source_str) {
                    score += preference * 0.2;
                }
            }
        }

        // Boost based on search history
        let title_words: Vec<&str> = result.title.split_whitespace().collect();
        for word in title_words {
            if self.search_history.iter().any(|query| query.contains(word)) {
                score += 0.1;
            }
        }

        score
    }

    pub fn update_preferences(&mut self, result_type: &str, interaction_score: f64) {
        let current = self.user_preferences.get(result_type).copied().unwrap_or(0.0);
        let updated = (current * 0.9) + (interaction_score * 0.1); // Exponential moving average
        self.user_preferences.insert(result_type.to_string(), updated);
    }

    pub fn add_to_search_history(&mut self, query: &str) {
        self.search_history.push(query.to_string());
        
        // Keep only recent searches (last 100)
        if self.search_history.len() > 100 {
            self.search_history.remove(0);
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::{SearchResult, SearchResultType};
    use serde_json::json;

    fn create_test_result(id: &str, title: &str, score: f64) -> SearchResult {
        SearchResult {
            id: id.to_string(),
            result_type: SearchResultType::Document,
            title: title.to_string(),
            content: Some("Test content".to_string()),
            snippet: None,
            score,
            metadata: json!({
                "file_size": 5000,
                "word_count": 100,
                "mime_type": "text/plain",
                "source_type": "file_system",
                "modified_at": Utc::now().timestamp()
            }),
            highlights: Vec::new(),
        }
    }

    #[tokio::test]
    async fn test_ranker_creation() {
        let ranker = SearchRanker::new();
        assert!(ranker.freshness_weight > 0.0);
        assert!(ranker.relevance_weight > 0.0);
        assert!(ranker.popularity_weight > 0.0);
    }

    #[tokio::test]
    async fn test_result_ranking() {
        let ranker = SearchRanker::new();
        let results = vec![
            create_test_result("1", "low relevance", 0.1),
            create_test_result("2", "high relevance test", 0.9),
            create_test_result("3", "medium relevance", 0.5),
        ];
        
        let query_terms = vec!["test".to_string()];
        let options = SearchOptions::default();
        
        let ranked = ranker.rank_results(results, &query_terms, &options).await.unwrap();
        
        // Results should be sorted by score
        assert!(ranked[0].score >= ranked[1].score);
        assert!(ranked[1].score >= ranked[2].score);
    }

    #[test]
    fn test_result_diversification() {
        let diversifier = ResultDiversifier::new();
        
        let results = vec![
            create_test_result("1", "doc1", 1.0),
            create_test_result("2", "doc2", 0.9),
            create_test_result("3", "doc3", 0.8),
        ];
        
        let diversified = diversifier.diversify_results(results);
        assert!(!diversified.is_empty());
    }

    #[test]
    fn test_personalization() {
        let mut engine = PersonalizationEngine::new();
        engine.update_preferences("text/plain", 0.8);
        engine.add_to_search_history("test query");
        
        let results = vec![create_test_result("1", "test document", 0.5)];
        let personalized = engine.personalize_results(results, Some("user1"));
        
        assert!(!personalized.is_empty());
        // Score should be boosted due to preferences and history
        assert!(personalized[0].score > 0.5);
    }

    #[test]
    fn test_freshness_calculation() {
        let ranker = SearchRanker::new();
        let result = create_test_result("1", "fresh doc", 0.5);
        
        let freshness_score = ranker.calculate_freshness_score(&result);
        assert!(freshness_score >= 0.0);
        assert!(freshness_score <= 1.0);
    }

    #[test]
    fn test_query_match_scoring() {
        let ranker = SearchRanker::new();
        let result = SearchResult {
            id: "1".to_string(),
            result_type: SearchResultType::Document,
            title: "Important Test Document".to_string(),
            content: Some("This document contains test content for evaluation".to_string()),
            snippet: None,
            score: 0.5,
            metadata: json!({}),
            highlights: Vec::new(),
        };
        
        let query_terms = vec!["test".to_string(), "document".to_string()];
        let match_score = ranker.calculate_query_match_score(&result, &query_terms);
        
        assert!(match_score > 0.0);
        // Should get bonus for both title and content matches
        assert!(match_score > 1.0);
    }
}