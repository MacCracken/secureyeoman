//! Extended NAPI bindings for sy-privacy — stateful classification engines
//! with custom pattern support.
//!
//! The simple classify_text/classify_text_batch in lib.rs always create a fresh
//! engine. This module allows creating named engines with custom patterns.

use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Mutex;
use sy_privacy::{ClassificationEngine, ClassificationLevel};

static ENGINES: std::sync::LazyLock<Mutex<HashMap<String, ClassificationEngine>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

fn parse_level(level: &str) -> napi::Result<ClassificationLevel> {
    match level {
        "public" => Ok(ClassificationLevel::Public),
        "internal" => Ok(ClassificationLevel::Internal),
        "confidential" => Ok(ClassificationLevel::Confidential),
        "restricted" => Ok(ClassificationLevel::Restricted),
        _ => Err(napi::Error::from_reason(format!(
            "Invalid classification level: {level} (expected public, internal, confidential, or restricted)"
        ))),
    }
}

/// Create a new classification engine with default PII patterns and keywords.
#[napi]
pub fn privacy_engine_create(engine_id: String) -> napi::Result<()> {
    let engine = ClassificationEngine::new();
    let mut engines = ENGINES
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    engines.insert(engine_id, engine);
    Ok(())
}

/// Add a custom regex pattern to an engine.
#[napi]
pub fn privacy_engine_add_pattern(
    engine_id: String,
    name: String,
    pattern: String,
    level: String,
) -> napi::Result<()> {
    let classification_level = parse_level(&level)?;
    let mut engines = ENGINES
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let engine = engines
        .get_mut(&engine_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Engine not found: {engine_id}")))?;
    engine
        .add_pattern(&name, &pattern, classification_level)
        .map_err(napi::Error::from_reason)
}

/// Classify text using a named engine. Returns JSON ClassificationResult.
#[napi]
pub fn privacy_engine_classify(engine_id: String, text: String) -> napi::Result<String> {
    let engines = ENGINES
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let engine = engines
        .get(&engine_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Engine not found: {engine_id}")))?;
    let result = engine.classify(&text);
    serde_json::to_string(&result)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {e}")))
}

/// Batch classify multiple texts using a named engine. Returns JSON array.
#[napi]
pub fn privacy_engine_classify_batch(
    engine_id: String,
    texts: Vec<String>,
) -> napi::Result<String> {
    let engines = ENGINES
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let engine = engines
        .get(&engine_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Engine not found: {engine_id}")))?;
    let refs: Vec<&str> = texts.iter().map(|s| s.as_str()).collect();
    let results = engine.classify_batch(&refs);
    serde_json::to_string(&results)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {e}")))
}

/// Destroy a named engine.
#[napi]
pub fn privacy_engine_destroy(engine_id: String) -> napi::Result<bool> {
    let mut engines = ENGINES
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    Ok(engines.remove(&engine_id).is_some())
}
