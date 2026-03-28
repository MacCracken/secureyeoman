//! NAPI bindings for sy-audit — in-memory HMAC-SHA256 linked audit chain.
//!
//! Manages multiple named audit chains via a global registry.
//! Each chain is identified by a string key (typically "default" or a tenant ID).

use napi_derive::napi;
use std::collections::HashMap;
use std::sync::Mutex;
use sy_audit::AuditChain;

static CHAINS: std::sync::LazyLock<Mutex<HashMap<String, AuditChain>>> =
    std::sync::LazyLock::new(|| Mutex::new(HashMap::new()));

/// Create a new in-memory audit chain with the given signing key.
/// Returns the chain ID on success.
#[napi]
pub fn audit_chain_create(chain_id: String, signing_key: String) -> napi::Result<()> {
    let chain = AuditChain::new(&signing_key);
    let mut chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    chains.insert(chain_id, chain);
    Ok(())
}

/// Record a new audit entry. Returns the entry as JSON.
#[napi]
pub fn audit_chain_record(
    chain_id: String,
    event: String,
    level: String,
    message: String,
    user_id: Option<String>,
    task_id: Option<String>,
    metadata_json: Option<String>,
) -> napi::Result<String> {
    let metadata = match metadata_json {
        Some(json) => Some(
            serde_json::from_str(&json)
                .map_err(|e| napi::Error::from_reason(format!("Invalid metadata JSON: {e}")))?,
        ),
        None => None,
    };

    let mut chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let chain = chains
        .get_mut(&chain_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Chain not found: {chain_id}")))?;

    let entry = chain.record(
        &event,
        &level,
        &message,
        user_id.as_deref(),
        task_id.as_deref(),
        metadata,
    );

    serde_json::to_string(&entry)
        .map_err(|e| napi::Error::from_reason(format!("Serialization error: {e}")))
}

/// Verify the entire audit chain. Returns JSON { valid: bool, error?: string }.
#[napi]
pub fn audit_chain_verify(chain_id: String) -> napi::Result<String> {
    let chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let chain = chains
        .get(&chain_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Chain not found: {chain_id}")))?;

    let (valid, error) = chain.verify();
    let result = serde_json::json!({ "valid": valid, "error": error });
    Ok(result.to_string())
}

/// Get the number of entries in the chain.
#[napi]
pub fn audit_chain_count(chain_id: String) -> napi::Result<u32> {
    let chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let chain = chains
        .get(&chain_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Chain not found: {chain_id}")))?;
    Ok(chain.count() as u32)
}

/// Get the last entry hash of the chain.
#[napi]
pub fn audit_chain_last_hash(chain_id: String) -> napi::Result<String> {
    let chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let chain = chains
        .get(&chain_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Chain not found: {chain_id}")))?;
    Ok(chain.last_hash().to_string())
}

/// Rotate the signing key. Records a rotation event with the old key first.
#[napi]
pub fn audit_chain_rotate_key(chain_id: String, new_key: String) -> napi::Result<()> {
    let mut chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    let chain = chains
        .get_mut(&chain_id)
        .ok_or_else(|| napi::Error::from_reason(format!("Chain not found: {chain_id}")))?;
    chain.update_signing_key(&new_key);
    Ok(())
}

/// Destroy a chain, freeing its memory.
#[napi]
pub fn audit_chain_destroy(chain_id: String) -> napi::Result<bool> {
    let mut chains = CHAINS
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    Ok(chains.remove(&chain_id).is_some())
}
