/**
 * TEE Encryption Manager — AES-256-GCM model weight encryption.
 *
 * Supports three key sources:
 * - tpm: Key derived from TPM2 sealed data (requires tpm2-tools)
 * - tee: Key from TEE-sealed storage (stub — requires SGX sealing)
 * - keyring: Key from environment variable (always available)
 *
 * Wire format: SEALED_V1 (8 bytes) || iv (12) || authTag (16) || keySourceTag (1) || ciphertext
 */

import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, openSync, readSync, closeSync } from 'node:fs';
import { execFileSync } from 'node:child_process';

export type KeySource = 'tpm' | 'tee' | 'keyring';

const MAGIC = Buffer.from('SEALED_V1');
const IV_LEN = 12;
const AUTH_TAG_LEN = 16;
const KEY_SOURCE_TAGS: Record<KeySource, number> = { tpm: 0x01, tee: 0x02, keyring: 0x03 };
const TAG_TO_SOURCE: Record<number, KeySource> = { 0x01: 'tpm', 0x02: 'tee', 0x03: 'keyring' };

export class TeeEncryptionManager {
  private keyCache = new Map<KeySource, Buffer>();

  /**
   * Seal (encrypt) model weights file.
   * Returns the path to the sealed output file.
   */
  sealModelWeights(modelPath: string, keySource: KeySource): string {
    if (!existsSync(modelPath)) {
      throw new Error(`Model file not found: ${modelPath}`);
    }

    const plaintext = readFileSync(modelPath);
    const key = this.deriveKey(keySource);
    const iv = randomBytes(IV_LEN);

    const cipher = createCipheriv('aes-256-gcm', key, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    const authTag = cipher.getAuthTag();

    const sealed = Buffer.concat([
      MAGIC,
      iv,
      authTag,
      Buffer.from([KEY_SOURCE_TAGS[keySource]]),
      encrypted,
    ]);

    const sealedPath = `${modelPath}.sealed`;
    writeFileSync(sealedPath, sealed);
    return sealedPath;
  }

  /**
   * Unseal (decrypt) model weights file.
   * If keySource is not provided, uses the key source tag embedded in the sealed file.
   */
  unsealModelWeights(sealedPath: string, keySource?: KeySource): Buffer {
    if (!existsSync(sealedPath)) {
      throw new Error(`Sealed file not found: ${sealedPath}`);
    }

    const sealed = readFileSync(sealedPath);

    // Validate magic
    if (!sealed.subarray(0, MAGIC.length).equals(MAGIC)) {
      throw new Error('Invalid sealed file format — missing SEALED_V1 magic');
    }

    let offset = MAGIC.length;
    const iv = sealed.subarray(offset, offset + IV_LEN);
    offset += IV_LEN;
    const authTag = sealed.subarray(offset, offset + AUTH_TAG_LEN);
    offset += AUTH_TAG_LEN;
    const keySourceTag = sealed[offset]!;
    offset += 1;
    const ciphertext = sealed.subarray(offset);

    const detectedSource = TAG_TO_SOURCE[keySourceTag];
    if (!detectedSource) {
      throw new Error(`Unknown key source tag: 0x${keySourceTag.toString(16)}`);
    }

    const effectiveSource = keySource ?? detectedSource;
    const key = this.deriveKey(effectiveSource);

    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAuthTag(authTag);

    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  }

  /**
   * Check if a file is a sealed model file by inspecting the magic header.
   */
  isSealed(filePath: string): boolean {
    if (!existsSync(filePath)) return false;
    const buf = Buffer.alloc(MAGIC.length);
    let fd: number | undefined;
    try {
      fd = openSync(filePath, 'r');
      readSync(fd, buf, 0, MAGIC.length, 0);
      return buf.equals(MAGIC);
    } catch {
      return false;
    } finally {
      if (fd !== undefined) closeSync(fd);
    }
  }

  /**
   * Derive encryption key from the specified source.
   */
  private deriveKey(source: KeySource): Buffer {
    const cached = this.keyCache.get(source);
    if (cached) return cached;

    let key: Buffer;
    switch (source) {
      case 'tpm':
        key = this.deriveFromTpm();
        break;
      case 'tee':
        key = this.deriveFromTee();
        break;
      case 'keyring':
        key = this.deriveFromKeyring();
        break;
      default:
        throw new Error(`Unknown key source: ${source as string}`);
    }

    this.keyCache.set(source, key);
    return key;
  }

  private deriveFromTpm(): Buffer {
    try {
      const output = execFileSync('tpm2_unseal', ['-c', '0x81000001'], {
        encoding: 'utf-8',
        timeout: 5000,
        stdio: ['pipe', 'pipe', 'pipe'],
      });
      const keyHex = output.trim();
      if (keyHex.length < 64) {
        throw new Error('TPM sealed data too short for AES-256 key');
      }
      return Buffer.from(keyHex.slice(0, 64), 'hex');
    } catch (err) {
      throw new Error(
        `TPM key derivation failed: ${err instanceof Error ? err.message : String(err)}`,
        { cause: err }
      );
    }
  }

  private deriveFromTee(): Buffer {
    // Stub: TEE-sealed storage requires SGX sealing APIs
    throw new Error('TEE key source not yet implemented — use keyring or tpm');
  }

  private deriveFromKeyring(): Buffer {
    const envKey = process.env.SECUREYEOMAN_MODEL_ENCRYPTION_KEY;
    if (!envKey) {
      throw new Error('SECUREYEOMAN_MODEL_ENCRYPTION_KEY environment variable not set');
    }
    if (envKey.length < 64) {
      throw new Error('Model encryption key must be at least 32 bytes (64 hex chars)');
    }
    return Buffer.from(envKey.slice(0, 64), 'hex');
  }

  /**
   * Clear the internal key cache.
   */
  clearKeyCache(): void {
    this.keyCache.clear();
  }
}
