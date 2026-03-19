//! SecureYeoman napi-rs bridge — exposes sy-crypto to Node.js as a native addon.

use napi::bindgen_prelude::*;
use napi_derive::napi;

// ── Hashing ─────────────────────────────────────────────────────────────────

#[napi]
pub fn sha256(data: Buffer) -> String {
    sy_crypto::sha256(&data)
}

#[napi]
pub fn md5(data: Buffer) -> String {
    sy_crypto::md5(&data)
}

// ── HMAC ────────────────────────────────────────────────────────────────────

#[napi]
pub fn hmac_sha256(data: Buffer, key: Buffer) -> String {
    sy_crypto::hmac_sha256(&data, &key)
}

// ── Constant-time comparison ────────────────────────────────────────────────

#[napi]
pub fn secure_compare(a: Buffer, b: Buffer) -> bool {
    sy_crypto::secure_compare(&a, &b)
}

// ── AES-256-GCM ─────────────────────────────────────────────────────────────

/// Encrypt with AES-256-GCM. Returns ciphertext with auth tag appended.
#[napi]
pub fn aes_256_gcm_encrypt(plaintext: Buffer, key: Buffer, iv: Buffer) -> Result<Buffer> {
    sy_crypto::aes_256_gcm_encrypt(&plaintext, &key, &iv)
        .map(|v| v.into())
        .map_err(|e| Error::from_reason(e))
}

/// Decrypt AES-256-GCM ciphertext (with auth tag appended).
#[napi]
pub fn aes_256_gcm_decrypt(ciphertext: Buffer, key: Buffer, iv: Buffer) -> Result<Buffer> {
    sy_crypto::aes_256_gcm_decrypt(&ciphertext, &key, &iv)
        .map(|v| v.into())
        .map_err(|e| Error::from_reason(e))
}

// ── X25519 ──────────────────────────────────────────────────────────────────

/// Generate X25519 keypair. Returns { privateKey: Buffer, publicKey: Buffer }.
#[napi(object)]
pub struct X25519KeyPair {
    pub private_key: Buffer,
    pub public_key: Buffer,
}

#[napi]
pub fn x25519_keypair() -> X25519KeyPair {
    let (sk, pk) = sy_crypto::x25519_keypair();
    X25519KeyPair {
        private_key: sk.into(),
        public_key: pk.into(),
    }
}

/// X25519 Diffie-Hellman — derive shared secret from private key + their public key.
#[napi]
pub fn x25519_diffie_hellman(private_key: Buffer, public_key: Buffer) -> Result<Buffer> {
    sy_crypto::x25519_diffie_hellman(&private_key, &public_key)
        .map(|v| v.into())
        .map_err(|e| Error::from_reason(e))
}

// ── Ed25519 ─────────────────────────────────────────────────────────────────

/// Generate Ed25519 keypair. Returns { privateKey: Buffer, publicKey: Buffer }.
#[napi(object)]
pub struct Ed25519KeyPair {
    pub private_key: Buffer,
    pub public_key: Buffer,
}

#[napi]
pub fn ed25519_keypair() -> Ed25519KeyPair {
    let (sk, pk) = sy_crypto::ed25519_keypair();
    Ed25519KeyPair {
        private_key: sk.into(),
        public_key: pk.into(),
    }
}

/// Ed25519 sign. Returns 64-byte signature.
#[napi]
pub fn ed25519_sign(data: Buffer, private_key: Buffer) -> Result<Buffer> {
    sy_crypto::ed25519_sign(&data, &private_key)
        .map(|v| v.into())
        .map_err(|e| Error::from_reason(e))
}

/// Ed25519 verify.
#[napi]
pub fn ed25519_verify(data: Buffer, signature: Buffer, public_key: Buffer) -> Result<bool> {
    sy_crypto::ed25519_verify(&data, &signature, &public_key)
        .map_err(|e| Error::from_reason(e))
}

// ── HKDF ────────────────────────────────────────────────────────────────────

/// HKDF-SHA256 key derivation.
#[napi]
pub fn hkdf_sha256(ikm: Buffer, salt: Buffer, info: Buffer, length: u32) -> Result<Buffer> {
    sy_crypto::hkdf_sha256(&ikm, &salt, &info, length as usize)
        .map(|v| v.into())
        .map_err(|e| Error::from_reason(e))
}

// ── Random ──────────────────────────────────────────────────────────────────

/// Generate cryptographically secure random bytes.
#[napi]
pub fn random_bytes(length: u32) -> Buffer {
    sy_crypto::random_bytes(length as usize).into()
}
