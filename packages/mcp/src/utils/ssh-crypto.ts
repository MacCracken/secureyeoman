/**
 * SSH Key Encryption Utilities
 *
 * Provides AES-256-GCM encryption for SSH private keys stored in core's
 * SecretsManager.  The encryption key is derived from the shared tokenSecret
 * (JWT signing key) using HKDF-SHA256, so only the MCP service can decrypt
 * keys that it encrypted — core stores opaque ciphertext and cannot read
 * the plaintext private key material.
 *
 * Wire format (base64-encoded):
 *   iv(12 bytes) || authTag(16 bytes) || ciphertext(variable)
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes } from 'node:crypto';

// HKDF parameters — changing these invalidates all existing encrypted keys.
const HKDF_DIGEST   = 'sha256';
const HKDF_SALT     = 'secureyeoman-ssh-key-v1';
const HKDF_INFO     = 'ssh-private-key-encryption';
const KEY_LEN       = 32; // AES-256
const IV_LEN        = 12; // 96-bit GCM IV
const TAG_LEN       = 16; // GCM auth tag

function deriveKey(tokenSecret: string): Buffer {
  const raw = hkdfSync(
    HKDF_DIGEST,
    Buffer.from(tokenSecret, 'utf8'),
    HKDF_SALT,
    HKDF_INFO,
    KEY_LEN
  );
  return Buffer.from(raw);
}

/**
 * Encrypt an SSH private key PEM string.
 * Returns a base64-encoded blob that can be safely stored in SecretsManager.
 */
export function encryptSshKey(plaintext: string, tokenSecret: string): string {
  const key    = deriveKey(tokenSecret);
  const iv     = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([
    cipher.update(plaintext, 'utf8'),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag(); // always TAG_LEN bytes for GCM

  // iv || tag || ciphertext
  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a blob produced by encryptSshKey.
 * Throws if the ciphertext has been tampered with (GCM auth tag mismatch).
 */
export function decryptSshKey(ciphertext: string, tokenSecret: string): string {
  const key = deriveKey(tokenSecret);
  const buf = Buffer.from(ciphertext, 'base64');

  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('SSH key ciphertext too short — possibly corrupted');
  }

  const iv        = buf.subarray(0, IV_LEN);
  const tag       = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return (
    decipher.update(encrypted).toString('utf8') +
    decipher.final('utf8')
  );
}
