/**
 * Federation Crypto — AES-256-GCM encryption for peer shared secrets.
 *
 * Wire format (base64-encoded):
 *   iv(12 bytes) || authTag(16 bytes) || ciphertext(variable)
 *
 * Uses HKDF-SHA256 with a federation-specific info string so that
 * federation secrets are cryptographically isolated from SSH key secrets.
 */

import { createCipheriv, createDecipheriv, hkdfSync, randomBytes, createHash } from 'node:crypto';

const HKDF_DIGEST = 'sha256';
const HKDF_SALT = 'secureyeoman-federation-v1';
const HKDF_INFO = 'federation-peer-secret-v1';
const KEY_LEN = 32; // AES-256
const IV_LEN = 12; // 96-bit GCM IV
const TAG_LEN = 16; // GCM auth tag

function deriveKey(masterSecret: string): Buffer {
  const raw = hkdfSync(
    HKDF_DIGEST,
    Buffer.from(masterSecret, 'utf8'),
    HKDF_SALT,
    HKDF_INFO,
    KEY_LEN
  );
  return Buffer.from(raw);
}

/**
 * Encrypt a peer shared secret using the master token secret.
 */
export function encryptSecret(plaintext: string, masterSecret: string): string {
  const key = deriveKey(masterSecret);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', key, iv);

  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a blob produced by encryptSecret.
 */
export function decryptSecret(ciphertext: string, masterSecret: string): string {
  const key = deriveKey(masterSecret);
  const buf = Buffer.from(ciphertext, 'base64');

  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('Federation secret ciphertext too short — possibly corrupted');
  }

  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);

  return decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
}

/**
 * Hash a raw shared secret for inbound validation (stored alongside the encrypted form).
 * Uses SHA-256 hex encoding.
 */
export function hashSecret(rawSecret: string): string {
  return createHash('sha256').update(rawSecret, 'utf8').digest('hex');
}

/**
 * Encrypt a JSON-serializable bundle using a passphrase.
 * Used for personality bundle export/import.
 * The passphrase is hashed with HKDF before use so short passphrases are safe.
 */
export function encryptBundle(data: unknown, passphrase: string): string {
  const key = hkdfSync(
    'sha256',
    Buffer.from(passphrase, 'utf8'),
    'secureyeoman-bundle-v1',
    'personality-bundle-encryption',
    KEY_LEN
  );
  const keyBuf = Buffer.from(key);
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv('aes-256-gcm', keyBuf, iv);

  const plaintext = JSON.stringify(data);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();

  return Buffer.concat([iv, tag, encrypted]).toString('base64');
}

/**
 * Decrypt a bundle produced by encryptBundle.
 */
export function decryptBundle(ciphertext: string, passphrase: string): unknown {
  const key = hkdfSync(
    'sha256',
    Buffer.from(passphrase, 'utf8'),
    'secureyeoman-bundle-v1',
    'personality-bundle-encryption',
    KEY_LEN
  );
  const keyBuf = Buffer.from(key);
  const buf = Buffer.from(ciphertext, 'base64');

  if (buf.length < IV_LEN + TAG_LEN) {
    throw new Error('Bundle ciphertext too short — possibly corrupted');
  }

  const iv = buf.subarray(0, IV_LEN);
  const tag = buf.subarray(IV_LEN, IV_LEN + TAG_LEN);
  const encrypted = buf.subarray(IV_LEN + TAG_LEN);

  const decipher = createDecipheriv('aes-256-gcm', keyBuf, iv);
  decipher.setAuthTag(tag);

  const plaintext = decipher.update(encrypted).toString('utf8') + decipher.final('utf8');
  return JSON.parse(plaintext);
}
