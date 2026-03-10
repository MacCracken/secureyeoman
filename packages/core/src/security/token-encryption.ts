/**
 * Token Encryption — AES-256-GCM envelope encryption for OAuth tokens,
 * 2FA secrets, and other sensitive at-rest data.
 *
 * The encryption key is derived from the SECUREYEOMAN_TOKEN_ENCRYPTION_KEY
 * env var (or falls back to the JWT secret). A proper key rotation scheme
 * would use key IDs; for now a single key suffices.
 */

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'node:crypto';

const ALGO = 'aes-256-gcm';
const IV_LEN = 12;
const TAG_LEN = 16;

/** Returns the 32-byte encryption key, derived from env or fallback. */
function getEncryptionKey(): Buffer {
  const raw =
    process.env.SECUREYEOMAN_TOKEN_ENCRYPTION_KEY ?? process.env.SECUREYEOMAN_TOKEN_SECRET ?? '';
  if (!raw) {
    throw new Error(
      'Token encryption key not configured. Set SECUREYEOMAN_TOKEN_ENCRYPTION_KEY or SECUREYEOMAN_TOKEN_SECRET.'
    );
  }
  // Use SHA-256 of the secret to get a fixed 32-byte key
  return createHash('sha256').update(raw).digest();
}

/** Current key ID — hardcoded until key rotation is implemented. */
export function currentKeyId(): string {
  return 'v1';
}

/**
 * Encrypt a plaintext string to a Buffer (IV || ciphertext || authTag).
 * Returns null if the input is null/undefined.
 */
export function encryptToken(plaintext: string | null | undefined): Buffer | null {
  if (plaintext == null || plaintext === '') return null;
  const key = getEncryptionKey();
  const iv = randomBytes(IV_LEN);
  const cipher = createCipheriv(ALGO, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  // IV (12) || ciphertext (variable) || tag (16)
  return Buffer.concat([iv, encrypted, tag]);
}

/**
 * Decrypt a Buffer (IV || ciphertext || authTag) back to plaintext.
 * Returns null if the input is null/undefined.
 */
export function decryptToken(data: Buffer | null | undefined): string | null {
  if (data == null || data.length === 0) return null;
  const key = getEncryptionKey();
  const iv = data.subarray(0, IV_LEN);
  const tag = data.subarray(data.length - TAG_LEN);
  const ciphertext = data.subarray(IV_LEN, data.length - TAG_LEN);
  const decipher = createDecipheriv(ALGO, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString('utf8');
}
