use anyhow::Result;
use regex::Regex;
use uuid::Uuid;
use serde_json::json;

use crate::ExtractedEntity;

pub trait EntityExtractor: Send + Sync {
    fn extract_entities(&self, text: &str) -> Result<Vec<ExtractedEntity>>;
    fn get_supported_types(&self) -> Vec<&'static str>;
}

pub struct RegexEntityExtractor {
    patterns: Vec<EntityPattern>,
}

struct EntityPattern {
    entity_type: String,
    regex: Regex,
    confidence: f64,
}

impl RegexEntityExtractor {
    pub fn new() -> Self {
        let mut patterns = Vec::new();

        // Email addresses
        patterns.push(EntityPattern {
            entity_type: "email".to_string(),
            regex: Regex::new(r"\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b").unwrap(),
            confidence: 0.95,
        });

        // Phone numbers (various formats)
        patterns.push(EntityPattern {
            entity_type: "phone".to_string(),
            regex: Regex::new(r"(\+?1[-.\s]?)?\(?([0-9]{3})\)?[-.\s]?([0-9]{3})[-.\s]?([0-9]{4})").unwrap(),
            confidence: 0.90,
        });

        // URLs
        patterns.push(EntityPattern {
            entity_type: "url".to_string(),
            regex: Regex::new(r"https?://(?:[-\w.])+(?:[:\d]+)?(?:/(?:[\w/_.])*(?:\?(?:[\w&=%.])*)?(?:#(?:[\w.])*)?)?").unwrap(),
            confidence: 0.95,
        });

        // Dates (various formats)
        patterns.push(EntityPattern {
            entity_type: "date".to_string(),
            regex: Regex::new(r"\b(?:\d{1,2}[/-]\d{1,2}[/-]\d{2,4}|\d{4}[/-]\d{1,2}[/-]\d{1,2})\b").unwrap(),
            confidence: 0.85,
        });

        // Money amounts
        patterns.push(EntityPattern {
            entity_type: "money".to_string(),
            regex: Regex::new(r"\$\s?(?:\d{1,3}(?:,\d{3})*|\d+)(?:\.\d{2})?").unwrap(),
            confidence: 0.90,
        });

        // Credit card numbers (simplified)
        patterns.push(EntityPattern {
            entity_type: "credit_card".to_string(),
            regex: Regex::new(r"\b(?:\d{4}[-\s]?){3}\d{4}\b").unwrap(),
            confidence: 0.80,
        });

        // Social Security Numbers
        patterns.push(EntityPattern {
            entity_type: "ssn".to_string(),
            regex: Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap(),
            confidence: 0.95,
        });

        // IP Addresses
        patterns.push(EntityPattern {
            entity_type: "ip_address".to_string(),
            regex: Regex::new(r"\b(?:[0-9]{1,3}\.){3}[0-9]{1,3}\b").unwrap(),
            confidence: 0.90,
        });

        // Person names (simplified - looks for capitalized words)
        patterns.push(EntityPattern {
            entity_type: "person".to_string(),
            regex: Regex::new(r"\b[A-Z][a-z]+ [A-Z][a-z]+\b").unwrap(),
            confidence: 0.60, // Lower confidence due to simplicity
        });

        // Organization names (simplified - looks for Inc, LLC, Corp, etc.)
        patterns.push(EntityPattern {
            entity_type: "organization".to_string(),
            regex: Regex::new(r"\b[A-Z][A-Za-z\s&]+(Inc|LLC|Corp|Corporation|Company|Co)\b").unwrap(),
            confidence: 0.70,
        });

        // Time expressions
        patterns.push(EntityPattern {
            entity_type: "time".to_string(),
            regex: Regex::new(r"\b(?:[01]?[0-9]|2[0-3]):[0-5][0-9](?:\s?[AP]M)?\b").unwrap(),
            confidence: 0.85,
        });

        // File paths
        patterns.push(EntityPattern {
            entity_type: "file_path".to_string(),
            regex: Regex::new(r"(?:[A-Za-z]:\\|/)[^\s<>:\"|?*]+").unwrap(),
            confidence: 0.75,
        });

        Self { patterns }
    }

    pub fn add_custom_pattern(&mut self, entity_type: String, pattern: &str, confidence: f64) -> Result<()> {
        let regex = Regex::new(pattern)?;
        self.patterns.push(EntityPattern {
            entity_type,
            regex,
            confidence,
        });
        Ok(())
    }
}

impl EntityExtractor for RegexEntityExtractor {
    fn extract_entities(&self, text: &str) -> Result<Vec<ExtractedEntity>> {
        let mut entities = Vec::new();

        for pattern in &self.patterns {
            for mat in pattern.regex.find_iter(text) {
                let entity = ExtractedEntity {
                    id: Uuid::new_v4().to_string(),
                    entity_type: pattern.entity_type.clone(),
                    name: mat.as_str().to_string(),
                    confidence: pattern.confidence,
                    start_position: mat.start() as u32,
                    end_position: mat.end() as u32,
                    properties: json!({
                        "extracted_by": "regex",
                        "pattern_type": pattern.entity_type,
                        "text_length": mat.as_str().len(),
                    }),
                };
                entities.push(entity);
            }
        }

        // Remove overlapping entities (keep highest confidence)
        entities.sort_by(|a, b| {
            a.start_position.cmp(&b.start_position)
                .then_with(|| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal))
        });

        let mut filtered_entities = Vec::new();
        for entity in entities {
            let overlaps = filtered_entities.iter().any(|existing: &ExtractedEntity| {
                (entity.start_position < existing.end_position && entity.end_position > existing.start_position)
            });

            if !overlaps {
                filtered_entities.push(entity);
            }
        }

        Ok(filtered_entities)
    }

    fn get_supported_types(&self) -> Vec<&'static str> {
        vec![
            "email", "phone", "url", "date", "money", "credit_card", 
            "ssn", "ip_address", "person", "organization", "time", "file_path"
        ]
    }
}

// Named Entity Recognition using rule-based approach
pub struct RuleBasedEntityExtractor {
    name_prefixes: Vec<String>,
    organization_suffixes: Vec<String>,
    location_indicators: Vec<String>,
}

impl RuleBasedEntityExtractor {
    pub fn new() -> Self {
        Self {
            name_prefixes: vec![
                "Mr.".to_string(), "Mrs.".to_string(), "Ms.".to_string(), 
                "Dr.".to_string(), "Prof.".to_string(), "Rev.".to_string(),
            ],
            organization_suffixes: vec![
                "Inc".to_string(), "LLC".to_string(), "Corp".to_string(),
                "Corporation".to_string(), "Company".to_string(), "Co".to_string(),
                "Ltd".to_string(), "Limited".to_string(), "Foundation".to_string(),
            ],
            location_indicators: vec![
                "Street".to_string(), "St".to_string(), "Avenue".to_string(), "Ave".to_string(),
                "Road".to_string(), "Rd".to_string(), "Boulevard".to_string(), "Blvd".to_string(),
                "Drive".to_string(), "Dr".to_string(), "Lane".to_string(), "Ln".to_string(),
                "City".to_string(), "State".to_string(), "Country".to_string(),
            ],
        }
    }

    fn extract_names(&self, text: &str) -> Vec<ExtractedEntity> {
        let mut entities = Vec::new();
        let words: Vec<&str> = text.split_whitespace().collect();

        for (i, window) in words.windows(2).enumerate() {
            // Look for name prefixes followed by capitalized words
            if self.name_prefixes.iter().any(|prefix| window[0] == prefix) {
                if let Some(next_word) = words.get(i + 1) {
                    if next_word.chars().next().unwrap_or('a').is_uppercase() {
                        let start_pos = text.find(window[0]).unwrap_or(0) as u32;
                        let full_name = format!("{} {}", window[0], window[1]);
                        let end_pos = start_pos + full_name.len() as u32;

                        entities.push(ExtractedEntity {
                            id: Uuid::new_v4().to_string(),
                            entity_type: "person".to_string(),
                            name: full_name,
                            confidence: 0.80,
                            start_position: start_pos,
                            end_position: end_pos,
                            properties: json!({
                                "extracted_by": "rule_based",
                                "has_prefix": true,
                                "prefix": window[0],
                            }),
                        });
                    }
                }
            }
        }

        entities
    }

    fn extract_organizations(&self, text: &str) -> Vec<ExtractedEntity> {
        let mut entities = Vec::new();
        
        for suffix in &self.organization_suffixes {
            let pattern = format!(r"\b([A-Z][A-Za-z\s&]+)\s+{}\b", regex::escape(suffix));
            if let Ok(regex) = Regex::new(&pattern) {
                for mat in regex.find_iter(text) {
                    entities.push(ExtractedEntity {
                        id: Uuid::new_v4().to_string(),
                        entity_type: "organization".to_string(),
                        name: mat.as_str().to_string(),
                        confidence: 0.85,
                        start_position: mat.start() as u32,
                        end_position: mat.end() as u32,
                        properties: json!({
                            "extracted_by": "rule_based",
                            "suffix": suffix,
                        }),
                    });
                }
            }
        }

        entities
    }
}

impl EntityExtractor for RuleBasedEntityExtractor {
    fn extract_entities(&self, text: &str) -> Result<Vec<ExtractedEntity>> {
        let mut entities = Vec::new();
        
        entities.extend(self.extract_names(text));
        entities.extend(self.extract_organizations(text));
        
        Ok(entities)
    }

    fn get_supported_types(&self) -> Vec<&'static str> {
        vec!["person", "organization", "location"]
    }
}

// Composite extractor that combines multiple extraction methods
pub struct CompositeEntityExtractor {
    extractors: Vec<Box<dyn EntityExtractor>>,
}

impl CompositeEntityExtractor {
    pub fn new() -> Self {
        let extractors: Vec<Box<dyn EntityExtractor>> = vec![
            Box::new(RegexEntityExtractor::new()),
            Box::new(RuleBasedEntityExtractor::new()),
        ];

        Self { extractors }
    }

    pub fn add_extractor(&mut self, extractor: Box<dyn EntityExtractor>) {
        self.extractors.push(extractor);
    }
}

impl EntityExtractor for CompositeEntityExtractor {
    fn extract_entities(&self, text: &str) -> Result<Vec<ExtractedEntity>> {
        let mut all_entities = Vec::new();

        for extractor in &self.extractors {
            let entities = extractor.extract_entities(text)?;
            all_entities.extend(entities);
        }

        // Remove duplicates and overlaps
        all_entities.sort_by(|a, b| {
            a.start_position.cmp(&b.start_position)
                .then_with(|| b.confidence.partial_cmp(&a.confidence).unwrap_or(std::cmp::Ordering::Equal))
        });

        let mut filtered_entities = Vec::new();
        for entity in all_entities {
            let is_duplicate = filtered_entities.iter().any(|existing: &ExtractedEntity| {
                existing.name == entity.name && 
                existing.entity_type == entity.entity_type &&
                (existing.start_position as i32 - entity.start_position as i32).abs() < 10
            });

            if !is_duplicate {
                filtered_entities.push(entity);
            }
        }

        Ok(filtered_entities)
    }

    fn get_supported_types(&self) -> Vec<&'static str> {
        let mut types = Vec::new();
        for extractor in &self.extractors {
            types.extend(extractor.get_supported_types());
        }
        types.sort();
        types.dedup();
        types
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_regex_entity_extractor() {
        let extractor = RegexEntityExtractor::new();
        let text = "Contact John Doe at john.doe@example.com or call (555) 123-4567. Visit https://example.com for more info.";
        
        let entities = extractor.extract_entities(text).unwrap();
        
        assert!(!entities.is_empty());
        
        // Check if email was extracted
        let email_entities: Vec<_> = entities.iter()
            .filter(|e| e.entity_type == "email")
            .collect();
        assert!(!email_entities.is_empty());
        assert_eq!(email_entities[0].name, "john.doe@example.com");
        
        // Check if phone was extracted
        let phone_entities: Vec<_> = entities.iter()
            .filter(|e| e.entity_type == "phone")
            .collect();
        assert!(!phone_entities.is_empty());
        
        // Check if URL was extracted
        let url_entities: Vec<_> = entities.iter()
            .filter(|e| e.entity_type == "url")
            .collect();
        assert!(!url_entities.is_empty());
        assert_eq!(url_entities[0].name, "https://example.com");
    }

    #[test]
    fn test_rule_based_entity_extractor() {
        let extractor = RuleBasedEntityExtractor::new();
        let text = "Dr. Jane Smith works at Acme Corporation Inc. She can be reached via email.";
        
        let entities = extractor.extract_entities(text).unwrap();
        
        assert!(!entities.is_empty());
        
        // Check if person was extracted
        let person_entities: Vec<_> = entities.iter()
            .filter(|e| e.entity_type == "person")
            .collect();
        assert!(!person_entities.is_empty());
        
        // Check if organization was extracted
        let org_entities: Vec<_> = entities.iter()
            .filter(|e| e.entity_type == "organization")
            .collect();
        assert!(!org_entities.is_empty());
    }

    #[test]
    fn test_composite_entity_extractor() {
        let extractor = CompositeEntityExtractor::new();
        let text = "Dr. John Smith from Tech Corp Inc can be reached at john@techcorp.com or (555) 123-4567.";
        
        let entities = extractor.extract_entities(text).unwrap();
        
        assert!(!entities.is_empty());
        
        // Should extract person, organization, email, and phone
        let entity_types: Vec<_> = entities.iter()
            .map(|e| e.entity_type.as_str())
            .collect();
        
        assert!(entity_types.contains(&"person"));
        assert!(entity_types.contains(&"organization"));
        assert!(entity_types.contains(&"email"));
        assert!(entity_types.contains(&"phone"));
    }

    #[test]
    fn test_custom_pattern() {
        let mut extractor = RegexEntityExtractor::new();
        
        // Add custom pattern for product codes
        extractor.add_custom_pattern(
            "product_code".to_string(),
            r"\bPRD-\d{4}\b",
            0.95
        ).unwrap();
        
        let text = "Product PRD-1234 is available in stock.";
        let entities = extractor.extract_entities(text).unwrap();
        
        let product_entities: Vec<_> = entities.iter()
            .filter(|e| e.entity_type == "product_code")
            .collect();
        
        assert!(!product_entities.is_empty());
        assert_eq!(product_entities[0].name, "PRD-1234");
    }
}