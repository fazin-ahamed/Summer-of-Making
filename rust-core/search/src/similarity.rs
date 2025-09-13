use anyhow::Result;
use ndarray::Array1;
use strsim;

#[derive(Debug, Clone)]
pub struct SimilarityEngine {
    // Configuration for similarity calculations
    text_similarity_threshold: f64,
    vector_similarity_threshold: f64,
}

impl SimilarityEngine {
    pub fn new() -> Self {
        Self {
            text_similarity_threshold: 0.3,
            vector_similarity_threshold: 0.7,
        }
    }

    /// Calculate cosine similarity between two vectors
    pub fn cosine_similarity(&self, a: &[f32], b: &[f32]) -> Result<f64> {
        if a.len() != b.len() {
            return Err(anyhow::anyhow!("Vector dimensions must match"));
        }

        let a_array = Array1::from_vec(a.iter().map(|&x| x as f64).collect());
        let b_array = Array1::from_vec(b.iter().map(|&x| x as f64).collect());

        let dot_product = a_array.dot(&b_array);
        let norm_a = a_array.dot(&a_array).sqrt();
        let norm_b = b_array.dot(&b_array).sqrt();

        if norm_a == 0.0 || norm_b == 0.0 {
            return Ok(0.0);
        }

        Ok(dot_product / (norm_a * norm_b))
    }

    /// Calculate Euclidean distance between two vectors
    pub fn euclidean_distance(&self, a: &[f32], b: &[f32]) -> Result<f64> {
        if a.len() != b.len() {
            return Err(anyhow::anyhow!("Vector dimensions must match"));
        }

        let sum_of_squares: f64 = a.iter()
            .zip(b.iter())
            .map(|(&x, &y)| (x as f64 - y as f64).powi(2))
            .sum();

        Ok(sum_of_squares.sqrt())
    }

    /// Calculate Jaccard similarity between two sets of tokens
    pub fn jaccard_similarity(&self, tokens_a: &[String], tokens_b: &[String]) -> f64 {
        let set_a: std::collections::HashSet<_> = tokens_a.iter().collect();
        let set_b: std::collections::HashSet<_> = tokens_b.iter().collect();

        let intersection_size = set_a.intersection(&set_b).count();
        let union_size = set_a.union(&set_b).count();

        if union_size == 0 {
            return 0.0;
        }

        intersection_size as f64 / union_size as f64
    }

    /// Calculate TF-IDF weighted cosine similarity
    pub fn tfidf_cosine_similarity(
        &self,
        doc_a_tfidf: &std::collections::HashMap<String, f64>,
        doc_b_tfidf: &std::collections::HashMap<String, f64>,
    ) -> f64 {
        let mut dot_product = 0.0;
        let mut norm_a = 0.0;
        let mut norm_b = 0.0;

        // Get all unique terms
        let all_terms: std::collections::HashSet<_> = doc_a_tfidf.keys()
            .chain(doc_b_tfidf.keys())
            .collect();

        for term in all_terms {
            let weight_a = doc_a_tfidf.get(term).copied().unwrap_or(0.0);
            let weight_b = doc_b_tfidf.get(term).copied().unwrap_or(0.0);

            dot_product += weight_a * weight_b;
            norm_a += weight_a * weight_a;
            norm_b += weight_b * weight_b;
        }

        if norm_a == 0.0 || norm_b == 0.0 {
            return 0.0;
        }

        dot_product / (norm_a.sqrt() * norm_b.sqrt())
    }

    /// Calculate semantic similarity using string distance metrics
    pub fn semantic_text_similarity(&self, text_a: &str, text_b: &str) -> f64 {
        // Combine multiple string similarity metrics
        let jaro_winkler = strsim::jaro_winkler(text_a, text_b);
        let sorensen_dice = strsim::sorensen_dice(text_a, text_b);
        let normalized_levenshtein = strsim::normalized_levenshtein(text_a, text_b);

        // Weighted average of different metrics
        (jaro_winkler * 0.4 + sorensen_dice * 0.4 + normalized_levenshtein * 0.2)
    }

    /// Find similar documents based on content similarity
    pub fn find_similar_documents(
        &self,
        query_tokens: &[String],
        document_tokens: &[Vec<String>],
        threshold: Option<f64>,
    ) -> Vec<(usize, f64)> {
        let threshold = threshold.unwrap_or(self.text_similarity_threshold);
        let mut similarities = Vec::new();

        for (index, doc_tokens) in document_tokens.iter().enumerate() {
            let similarity = self.jaccard_similarity(query_tokens, doc_tokens);
            if similarity >= threshold {
                similarities.push((index, similarity));
            }
        }

        // Sort by similarity score (highest first)
        similarities.sort_by(|a, b| b.1.partial_cmp(&a.1).unwrap_or(std::cmp::Ordering::Equal));
        similarities
    }

    /// Calculate BM25 score for document ranking
    pub fn bm25_score(
        &self,
        query_terms: &[String],
        document_terms: &[String],
        document_length: usize,
        average_document_length: f64,
        term_frequencies: &std::collections::HashMap<String, f64>,
        total_documents: usize,
        k1: f64,
        b: f64,
    ) -> f64 {
        let mut score = 0.0;

        for term in query_terms {
            let tf = document_terms.iter().filter(|&t| t == term).count() as f64;
            
            if tf == 0.0 {
                continue;
            }

            let idf = if let Some(&term_freq) = term_frequencies.get(term) {
                ((total_documents as f64 - term_freq + 0.5) / (term_freq + 0.5)).ln()
            } else {
                0.0
            };

            let normalized_tf = (tf * (k1 + 1.0)) / 
                (tf + k1 * (1.0 - b + b * (document_length as f64 / average_document_length)));

            score += idf * normalized_tf;
        }

        score
    }

    /// Normalize similarity scores to 0-1 range
    pub fn normalize_scores(&self, scores: &mut [f64]) {
        if scores.is_empty() {
            return;
        }

        let min_score = scores.iter().fold(f64::INFINITY, |a, &b| a.min(b));
        let max_score = scores.iter().fold(f64::NEG_INFINITY, |a, &b| a.max(b));

        if max_score == min_score {
            // All scores are the same
            for score in scores.iter_mut() {
                *score = 1.0;
            }
            return;
        }

        let range = max_score - min_score;
        for score in scores.iter_mut() {
            *score = (*score - min_score) / range;
        }
    }

    /// Calculate edit distance between two strings
    pub fn edit_distance(&self, s1: &str, s2: &str) -> usize {
        let len1 = s1.chars().count();
        let len2 = s2.chars().count();

        if len1 == 0 {
            return len2;
        }
        if len2 == 0 {
            return len1;
        }

        let mut matrix = vec![vec![0; len2 + 1]; len1 + 1];

        // Initialize first row and column
        for i in 0..=len1 {
            matrix[i][0] = i;
        }
        for j in 0..=len2 {
            matrix[0][j] = j;
        }

        let chars1: Vec<char> = s1.chars().collect();
        let chars2: Vec<char> = s2.chars().collect();

        for i in 1..=len1 {
            for j in 1..=len2 {
                let cost = if chars1[i - 1] == chars2[j - 1] { 0 } else { 1 };
                
                matrix[i][j] = std::cmp::min(
                    std::cmp::min(
                        matrix[i - 1][j] + 1,     // deletion
                        matrix[i][j - 1] + 1,     // insertion
                    ),
                    matrix[i - 1][j - 1] + cost   // substitution
                );
            }
        }

        matrix[len1][len2]
    }

    /// Calculate fuzzy match score
    pub fn fuzzy_match_score(&self, query: &str, text: &str, max_distance: Option<usize>) -> f64 {
        let max_dist = max_distance.unwrap_or(query.len() / 2);
        let distance = self.edit_distance(query, text);
        
        if distance <= max_dist {
            1.0 - (distance as f64 / query.len().max(text.len()) as f64)
        } else {
            0.0
        }
    }

    pub fn set_thresholds(&mut self, text_threshold: f64, vector_threshold: f64) {
        self.text_similarity_threshold = text_threshold.clamp(0.0, 1.0);
        self.vector_similarity_threshold = vector_threshold.clamp(0.0, 1.0);
    }
}

/// Utility functions for text preprocessing
pub struct TextPreprocessor;

impl TextPreprocessor {
    /// Remove common stop words
    pub fn remove_stop_words(tokens: &[String]) -> Vec<String> {
        let stop_words = vec![
            "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for", "of", "with",
            "by", "is", "are", "was", "were", "be", "been", "being", "have", "has", "had",
            "do", "does", "did", "will", "would", "could", "should", "may", "might", "must",
            "this", "that", "these", "those", "i", "you", "he", "she", "it", "we", "they",
        ];
        
        let stop_words_set: std::collections::HashSet<_> = stop_words.iter().collect();
        
        tokens.iter()
            .filter(|token| !stop_words_set.contains(&token.as_str()))
            .cloned()
            .collect()
    }

    /// Extract n-grams from text
    pub fn extract_ngrams(tokens: &[String], n: usize) -> Vec<String> {
        if n == 0 || tokens.len() < n {
            return Vec::new();
        }

        tokens.windows(n)
            .map(|window| window.join(" "))
            .collect()
    }

    /// Calculate term frequency
    pub fn term_frequency(tokens: &[String]) -> std::collections::HashMap<String, f64> {
        let mut tf = std::collections::HashMap::new();
        let total_terms = tokens.len() as f64;

        for token in tokens {
            *tf.entry(token.clone()).or_insert(0.0) += 1.0;
        }

        // Normalize by total term count
        for frequency in tf.values_mut() {
            *frequency /= total_terms;
        }

        tf
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_cosine_similarity() {
        let engine = SimilarityEngine::new();
        
        let vec_a = vec![1.0, 2.0, 3.0];
        let vec_b = vec![4.0, 5.0, 6.0];
        
        let similarity = engine.cosine_similarity(&vec_a, &vec_b).unwrap();
        assert!(similarity > 0.0 && similarity <= 1.0);
    }

    #[test]
    fn test_jaccard_similarity() {
        let engine = SimilarityEngine::new();
        
        let tokens_a = vec!["hello".to_string(), "world".to_string(), "test".to_string()];
        let tokens_b = vec!["hello".to_string(), "test".to_string(), "example".to_string()];
        
        let similarity = engine.jaccard_similarity(&tokens_a, &tokens_b);
        assert!(similarity > 0.0 && similarity <= 1.0);
        
        // Should be 2/4 = 0.5 (2 common terms, 4 total unique terms)
        assert!((similarity - 0.5).abs() < 0.01);
    }

    #[test]
    fn test_semantic_text_similarity() {
        let engine = SimilarityEngine::new();
        
        let similarity = engine.semantic_text_similarity("hello world", "hello earth");
        assert!(similarity > 0.0 && similarity <= 1.0);
        
        // Identical strings should have similarity of 1.0
        let identical_similarity = engine.semantic_text_similarity("test", "test");
        assert!((identical_similarity - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_edit_distance() {
        let engine = SimilarityEngine::new();
        
        assert_eq!(engine.edit_distance("kitten", "sitting"), 3);
        assert_eq!(engine.edit_distance("hello", "hello"), 0);
        assert_eq!(engine.edit_distance("", "abc"), 3);
        assert_eq!(engine.edit_distance("abc", ""), 3);
    }

    #[test]
    fn test_fuzzy_match_score() {
        let engine = SimilarityEngine::new();
        
        let score = engine.fuzzy_match_score("hello", "helo", None);
        assert!(score > 0.0 && score <= 1.0);
        
        let exact_score = engine.fuzzy_match_score("test", "test", None);
        assert!((exact_score - 1.0).abs() < 0.01);
    }

    #[test]
    fn test_normalize_scores() {
        let engine = SimilarityEngine::new();
        let mut scores = vec![1.0, 5.0, 3.0, 2.0];
        
        engine.normalize_scores(&mut scores);
        
        // Check that scores are in 0-1 range
        for &score in &scores {
            assert!(score >= 0.0 && score <= 1.0);
        }
        
        // Check that the order is preserved (relatively)
        assert!(scores[1] > scores[2]); // 5.0 > 3.0
        assert!(scores[2] > scores[3]); // 3.0 > 2.0
    }

    #[test]
    fn test_text_preprocessor() {
        let tokens = vec![
            "the".to_string(), "quick".to_string(), "brown".to_string(), 
            "fox".to_string(), "is".to_string(), "running".to_string()
        ];
        
        let filtered = TextPreprocessor::remove_stop_words(&tokens);
        assert!(filtered.len() < tokens.len());
        assert!(filtered.contains(&"quick".to_string()));
        assert!(filtered.contains(&"brown".to_string()));
        assert!(!filtered.contains(&"the".to_string()));
        assert!(!filtered.contains(&"is".to_string()));
    }

    #[test]
    fn test_ngram_extraction() {
        let tokens = vec!["hello".to_string(), "world".to_string(), "test".to_string()];
        
        let bigrams = TextPreprocessor::extract_ngrams(&tokens, 2);
        assert_eq!(bigrams.len(), 2);
        assert!(bigrams.contains(&"hello world".to_string()));
        assert!(bigrams.contains(&"world test".to_string()));
    }

    #[test]
    fn test_term_frequency() {
        let tokens = vec![
            "hello".to_string(), "world".to_string(), "hello".to_string(), "test".to_string()
        ];
        
        let tf = TextPreprocessor::term_frequency(&tokens);
        
        assert!((tf["hello"] - 0.5).abs() < 0.01); // 2/4 = 0.5
        assert!((tf["world"] - 0.25).abs() < 0.01); // 1/4 = 0.25
        assert!((tf["test"] - 0.25).abs() < 0.01); // 1/4 = 0.25
    }

    #[test]
    fn test_bm25_score() {
        let engine = SimilarityEngine::new();
        
        let query_terms = vec!["hello".to_string(), "world".to_string()];
        let document_terms = vec!["hello".to_string(), "world".to_string(), "test".to_string()];
        let mut term_frequencies = std::collections::HashMap::new();
        term_frequencies.insert("hello".to_string(), 1.0);
        term_frequencies.insert("world".to_string(), 1.0);
        
        let score = engine.bm25_score(
            &query_terms,
            &document_terms,
            document_terms.len(),
            3.0, // average document length
            &term_frequencies,
            10, // total documents
            1.5, // k1
            0.75, // b
        );
        
        assert!(score > 0.0);
    }
}