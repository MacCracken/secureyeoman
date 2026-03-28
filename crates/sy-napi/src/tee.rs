//! NAPI bindings for sy-tee — TEE model weight sealing/unsealing.
//!
//! Uses a global TeeEncryptionManager instance (thread-safe via Mutex).

use napi::bindgen_prelude::Buffer;
use napi_derive::napi;
use std::sync::Mutex;
use sy_tee::{KeySource, TeeEncryptionManager};

static MANAGER: std::sync::LazyLock<Mutex<TeeEncryptionManager>> =
    std::sync::LazyLock::new(|| Mutex::new(TeeEncryptionManager::new()));

fn parse_key_source(source: &str) -> napi::Result<KeySource> {
    match source {
        "tpm" => Ok(KeySource::Tpm),
        "tee" => Ok(KeySource::Tee),
        "keyring" => Ok(KeySource::Keyring),
        _ => Err(napi::Error::from_reason(format!(
            "Invalid key source: {source} (expected tpm, tee, or keyring)"
        ))),
    }
}

/// Seal (encrypt) data with the specified key source. Returns sealed bytes.
#[napi]
pub fn tee_seal(plaintext: Buffer, key_source: String) -> napi::Result<Buffer> {
    let source = parse_key_source(&key_source)?;
    let mut mgr = MANAGER
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    mgr.seal(&plaintext, source)
        .map(|v| v.into())
        .map_err(napi::Error::from_reason)
}

/// Unseal (decrypt) sealed data. Optional key source override.
#[napi]
pub fn tee_unseal(sealed: Buffer, key_source_override: Option<String>) -> napi::Result<Buffer> {
    let source = key_source_override
        .as_deref()
        .map(parse_key_source)
        .transpose()?;
    let mut mgr = MANAGER
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    mgr.unseal(&sealed, source)
        .map(|v| v.into())
        .map_err(napi::Error::from_reason)
}

/// Check if data starts with the SEALED_V1 magic bytes.
#[napi]
pub fn tee_is_sealed(data: Buffer) -> bool {
    TeeEncryptionManager::is_sealed(&data)
}

/// Clear the cached encryption keys.
#[napi]
pub fn tee_clear_key_cache() -> napi::Result<()> {
    let mut mgr = MANAGER
        .lock()
        .map_err(|e| napi::Error::from_reason(format!("Lock poisoned: {e}")))?;
    mgr.clear_key_cache();
    Ok(())
}
