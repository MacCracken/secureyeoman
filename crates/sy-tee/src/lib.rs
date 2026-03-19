//! TEE Encryption — AES-256-GCM model weight sealing with hardware-backed keys.
//!
//! Key sources:
//! - TPM (tag 0x01): `tpm2_unseal -c 0x81000001`
//! - TEE (tag 0x02): SGX sealing (stub)
//! - Keyring (tag 0x03): `SECUREYEOMAN_MODEL_ENCRYPTION_KEY` env var
//!
//! Wire format: `SEALED_V1` (8 bytes) || iv (12) || authTag (16) || keySourceTag (1) || ciphertext

use std::collections::HashMap;
use std::fs;
use std::process::Command;

const MAGIC: &[u8] = b"SEALED_V1";
const IV_LEN: usize = 12;
const AUTH_TAG_LEN: usize = 16;

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum KeySource {
    Tpm,
    Tee,
    Keyring,
}

impl KeySource {
    fn tag(&self) -> u8 {
        match self {
            KeySource::Tpm => 0x01,
            KeySource::Tee => 0x02,
            KeySource::Keyring => 0x03,
        }
    }

    fn from_tag(tag: u8) -> Option<Self> {
        match tag {
            0x01 => Some(KeySource::Tpm),
            0x02 => Some(KeySource::Tee),
            0x03 => Some(KeySource::Keyring),
            _ => None,
        }
    }
}

pub struct TeeEncryptionManager {
    key_cache: HashMap<u8, Vec<u8>>,
}

impl TeeEncryptionManager {
    pub fn new() -> Self {
        Self {
            key_cache: HashMap::new(),
        }
    }

    /// Seal (encrypt) model weights. Returns sealed bytes.
    pub fn seal(&mut self, plaintext: &[u8], key_source: KeySource) -> Result<Vec<u8>, String> {
        let key = self.derive_key(key_source)?;
        let iv = sy_crypto::random_bytes(IV_LEN);

        let encrypted =
            sy_crypto::aes_256_gcm_encrypt(plaintext, &key, &iv)?;

        // aes_gcm returns ciphertext + auth_tag concatenated
        let ct_len = encrypted.len() - AUTH_TAG_LEN;
        let auth_tag = &encrypted[ct_len..];
        let ciphertext = &encrypted[..ct_len];

        let mut sealed = Vec::with_capacity(MAGIC.len() + IV_LEN + AUTH_TAG_LEN + 1 + ciphertext.len());
        sealed.extend_from_slice(MAGIC);
        sealed.extend_from_slice(&iv);
        sealed.extend_from_slice(auth_tag);
        sealed.push(key_source.tag());
        sealed.extend_from_slice(ciphertext);

        Ok(sealed)
    }

    /// Unseal (decrypt) sealed model weights.
    pub fn unseal(
        &mut self,
        sealed: &[u8],
        key_source_override: Option<KeySource>,
    ) -> Result<Vec<u8>, String> {
        if sealed.len() < MAGIC.len() + IV_LEN + AUTH_TAG_LEN + 1 {
            return Err("Sealed data too short".into());
        }
        if &sealed[..MAGIC.len()] != MAGIC {
            return Err("Invalid sealed file — missing SEALED_V1 magic".into());
        }

        let mut offset = MAGIC.len();
        let iv = &sealed[offset..offset + IV_LEN];
        offset += IV_LEN;
        let auth_tag = &sealed[offset..offset + AUTH_TAG_LEN];
        offset += AUTH_TAG_LEN;
        let key_tag = sealed[offset];
        offset += 1;
        let ciphertext = &sealed[offset..];

        let source = key_source_override.unwrap_or_else(|| {
            KeySource::from_tag(key_tag).unwrap_or(KeySource::Keyring)
        });

        let key = self.derive_key(source)?;

        // Reconstruct aes-gcm input: ciphertext + auth_tag
        let mut combined = Vec::with_capacity(ciphertext.len() + AUTH_TAG_LEN);
        combined.extend_from_slice(ciphertext);
        combined.extend_from_slice(auth_tag);

        sy_crypto::aes_256_gcm_decrypt(&combined, &key, iv)
    }

    /// Check if data starts with SEALED_V1 magic.
    pub fn is_sealed(data: &[u8]) -> bool {
        data.len() >= MAGIC.len() && &data[..MAGIC.len()] == MAGIC
    }

    /// Seal a file on disk. Returns path to sealed output.
    pub fn seal_file(
        &mut self,
        path: &str,
        key_source: KeySource,
    ) -> Result<String, String> {
        let plaintext =
            fs::read(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
        let sealed = self.seal(&plaintext, key_source)?;
        let sealed_path = format!("{path}.sealed");
        fs::write(&sealed_path, &sealed)
            .map_err(|e| format!("Failed to write {sealed_path}: {e}"))?;
        Ok(sealed_path)
    }

    /// Unseal a file on disk. Returns plaintext bytes.
    pub fn unseal_file(
        &mut self,
        path: &str,
        key_source: Option<KeySource>,
    ) -> Result<Vec<u8>, String> {
        let sealed =
            fs::read(path).map_err(|e| format!("Failed to read {path}: {e}"))?;
        self.unseal(&sealed, key_source)
    }

    fn derive_key(&mut self, source: KeySource) -> Result<Vec<u8>, String> {
        let tag = source.tag();
        if let Some(cached) = self.key_cache.get(&tag) {
            return Ok(cached.clone());
        }

        let key = match source {
            KeySource::Tpm => derive_from_tpm()?,
            KeySource::Tee => {
                return Err("TEE key source not yet implemented — use keyring or tpm".into());
            }
            KeySource::Keyring => derive_from_keyring()?,
        };

        self.key_cache.insert(tag, key.clone());
        Ok(key)
    }

    pub fn clear_key_cache(&mut self) {
        self.key_cache.clear();
    }
}

fn derive_from_tpm() -> Result<Vec<u8>, String> {
    let output = Command::new("tpm2_unseal")
        .args(["-c", "0x81000001"])
        .output()
        .map_err(|e| format!("TPM key derivation failed: {e}"))?;

    if !output.status.success() {
        return Err("tpm2_unseal command failed".into());
    }

    let key_hex = String::from_utf8_lossy(&output.stdout).trim().to_string();
    if key_hex.len() < 64 {
        return Err("TPM sealed data too short for AES-256 key".into());
    }

    hex_decode(&key_hex[..64])
}

fn derive_from_keyring() -> Result<Vec<u8>, String> {
    let env_key = std::env::var("SECUREYEOMAN_MODEL_ENCRYPTION_KEY")
        .map_err(|_| "SECUREYEOMAN_MODEL_ENCRYPTION_KEY environment variable not set")?;

    if env_key.len() < 64 {
        return Err("Model encryption key must be at least 32 bytes (64 hex chars)".into());
    }

    hex_decode(&env_key[..64])
}

fn hex_decode(hex: &str) -> Result<Vec<u8>, String> {
    if hex.len() % 2 != 0 {
        return Err("Hex string must have even length".into());
    }
    (0..hex.len())
        .step_by(2)
        .map(|i| u8::from_str_radix(&hex[i..i + 2], 16).map_err(|e| format!("Invalid hex: {e}")))
        .collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn seal_unseal_roundtrip() {
        std::env::set_var("SECUREYEOMAN_MODEL_ENCRYPTION_KEY",
            "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef");

        let mut mgr = TeeEncryptionManager::new();
        let data = b"model weights data for testing";

        let sealed = mgr.seal(data, KeySource::Keyring).unwrap();
        assert!(TeeEncryptionManager::is_sealed(&sealed));

        let unsealed = mgr.unseal(&sealed, None).unwrap();
        assert_eq!(unsealed, data);
    }

    #[test]
    fn bad_magic_rejected() {
        let mut mgr = TeeEncryptionManager::new();
        let result = mgr.unseal(b"NOT_SEALED_DATA_HERE_AT_ALL", None);
        assert!(result.is_err());
    }
}
