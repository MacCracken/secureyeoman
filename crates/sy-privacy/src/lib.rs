//! DLP Classification Engine — PII regex scanning and content sensitivity detection.
//!
//! Classification levels (ascending severity):
//! - public (0)
//! - internal (1)
//! - confidential (2)
//! - restricted (3)
//!
//! Three detection layers:
//! 1. PII pattern matching (compiled Rust regex DFA — ~10x faster than JS RegExp)
//! 2. Keyword scanning (case-insensitive)
//! 3. Custom regex patterns

use regex::Regex;
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, PartialOrd, Ord, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum ClassificationLevel {
    Public,
    Internal,
    Confidential,
    Restricted,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct ClassificationResult {
    pub level: ClassificationLevel,
    pub auto_level: ClassificationLevel,
    pub rules_triggered: Vec<String>,
    pub pii_found: Vec<String>,
    pub keywords_found: Vec<String>,
}

pub struct ClassificationEngine {
    pii_patterns: Vec<(&'static str, Regex)>,
    restricted_keywords: Vec<&'static str>,
    confidential_keywords: Vec<&'static str>,
    custom_patterns: Vec<(String, Regex, ClassificationLevel)>,
    pii_as_confidential: bool,
}

impl ClassificationEngine {
    pub fn new() -> Self {
        Self {
            pii_patterns: vec![
                ("email", Regex::new(r"(?i)\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b").unwrap()),
                ("phone", Regex::new(r"\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b").unwrap()),
                ("ssn", Regex::new(r"\b\d{3}-\d{2}-\d{4}\b").unwrap()),
                ("credit_card", Regex::new(r"\b(?:\d{4}[-\s]?){3}\d{4}\b").unwrap()),
                ("ip_address", Regex::new(r"\b(?:(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\.){3}(?:25[0-5]|2[0-4]\d|[01]?\d\d?)\b").unwrap()),
            ],
            restricted_keywords: vec![
                "top secret", "classified", "restricted", "secret clearance",
            ],
            confidential_keywords: vec![
                "confidential", "proprietary", "trade secret", "internal only",
            ],
            custom_patterns: Vec::new(),
            pii_as_confidential: true,
        }
    }

    /// Add a custom regex pattern with its classification level.
    pub fn add_pattern(
        &mut self,
        name: &str,
        pattern: &str,
        level: ClassificationLevel,
    ) -> Result<(), String> {
        let re = Regex::new(pattern).map_err(|e| format!("Invalid regex: {e}"))?;
        self.custom_patterns.push((name.to_string(), re, level));
        Ok(())
    }

    /// Classify text content. Returns the highest triggered classification level.
    pub fn classify(&self, text: &str) -> ClassificationResult {
        let mut level = ClassificationLevel::Internal; // default
        let mut rules_triggered = Vec::new();
        let mut pii_found = Vec::new();
        let mut keywords_found = Vec::new();

        // Layer 1: PII detection
        for (name, re) in &self.pii_patterns {
            if re.is_match(text) {
                pii_found.push(name.to_string());
                rules_triggered.push(format!("pii:{name}"));
                let pii_level = if self.pii_as_confidential {
                    ClassificationLevel::Confidential
                } else {
                    ClassificationLevel::Internal
                };
                if pii_level > level {
                    level = pii_level;
                }
            }
        }

        // Layer 2: Keyword matching
        let lower = text.to_lowercase();

        for kw in &self.restricted_keywords {
            if lower.contains(kw) {
                keywords_found.push(kw.to_string());
                rules_triggered.push(format!("keyword:restricted:{kw}"));
                if ClassificationLevel::Restricted > level {
                    level = ClassificationLevel::Restricted;
                }
            }
        }

        for kw in &self.confidential_keywords {
            if lower.contains(kw) {
                keywords_found.push(kw.to_string());
                rules_triggered.push(format!("keyword:confidential:{kw}"));
                if ClassificationLevel::Confidential > level {
                    level = ClassificationLevel::Confidential;
                }
            }
        }

        // Layer 3: Custom patterns
        for (name, re, custom_level) in &self.custom_patterns {
            if re.is_match(text) {
                rules_triggered.push(format!("custom:{name}"));
                if *custom_level > level {
                    level = *custom_level;
                }
            }
        }

        ClassificationResult {
            level,
            auto_level: level,
            rules_triggered,
            pii_found,
            keywords_found,
        }
    }

    /// Bulk classify multiple texts. Returns results in order.
    pub fn classify_batch(&self, texts: &[&str]) -> Vec<ClassificationResult> {
        texts.iter().map(|t| self.classify(t)).collect()
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn detects_email() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("Contact john@example.com for details");
        assert!(result.pii_found.contains(&"email".to_string()));
        assert!(result.level >= ClassificationLevel::Confidential);
    }

    #[test]
    fn detects_ssn() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("SSN: 123-45-6789");
        assert!(result.pii_found.contains(&"ssn".to_string()));
    }

    #[test]
    fn detects_credit_card() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("Card: 4111 1111 1111 1111");
        assert!(result.pii_found.contains(&"credit_card".to_string()));
    }

    #[test]
    fn detects_restricted_keywords() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("This document is TOP SECRET");
        assert_eq!(result.level, ClassificationLevel::Restricted);
        assert!(result.keywords_found.contains(&"top secret".to_string()));
    }

    #[test]
    fn detects_confidential_keywords() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("This is proprietary information");
        assert!(result.level >= ClassificationLevel::Confidential);
    }

    #[test]
    fn default_is_internal() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("Hello world, nothing sensitive here");
        assert_eq!(result.level, ClassificationLevel::Internal);
    }

    #[test]
    fn custom_pattern() {
        let mut engine = ClassificationEngine::new();
        engine
            .add_pattern("project_x", r"PROJECT-X-\d+", ClassificationLevel::Restricted)
            .unwrap();
        let result = engine.classify("See PROJECT-X-42 for details");
        assert_eq!(result.level, ClassificationLevel::Restricted);
    }

    #[test]
    fn batch_classify() {
        let engine = ClassificationEngine::new();
        let results = engine.classify_batch(&[
            "Hello world",
            "Email: test@example.com",
            "TOP SECRET document",
        ]);
        assert_eq!(results.len(), 3);
        assert_eq!(results[0].level, ClassificationLevel::Internal);
        assert!(results[1].level >= ClassificationLevel::Confidential);
        assert_eq!(results[2].level, ClassificationLevel::Restricted);
    }

    #[test]
    fn detects_phone() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("Call me at (555) 123-4567");
        assert!(result.pii_found.contains(&"phone".to_string()));
    }

    #[test]
    fn detects_ip() {
        let engine = ClassificationEngine::new();
        let result = engine.classify("Server at 192.168.1.100");
        assert!(result.pii_found.contains(&"ip_address".to_string()));
    }
}
