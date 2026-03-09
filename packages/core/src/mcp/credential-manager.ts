/**
 * MCP Credential Manager — encrypts credentials at rest using AES-256-GCM.
 *
 * Uses a derived key from the SECUREYEOMAN_TOKEN_SECRET for encryption.
 */

import { createCipheriv, createDecipheriv, randomBytes, createHash } from 'node:crypto';
import type { McpStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const AUTH_TAG_LENGTH = 16;
const KEY_SALT = 'secureyeoman-mcp-credentials';

export class McpCredentialManager {
  private storage: McpStorage;
  private logger: SecureLogger;
  private encryptionKey: Buffer;

  constructor(storage: McpStorage, logger: SecureLogger, tokenSecret: string) {
    this.storage = storage;
    this.logger = logger;
    // Derive a 256-bit key from the token secret
    this.encryptionKey = createHash('sha256')
      .update(tokenSecret + KEY_SALT)
      .digest();
  }

  private encrypt(plaintext: string): string {
    const iv = randomBytes(IV_LENGTH);
    const cipher = createCipheriv(ALGORITHM, this.encryptionKey, iv);
    const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    const authTag = cipher.getAuthTag();
    // Format: base64(iv + authTag + ciphertext)
    const combined = Buffer.concat([iv, authTag, encrypted]);
    return combined.toString('base64');
  }

  private decrypt(encoded: string): string {
    const combined = Buffer.from(encoded, 'base64');
    const iv = combined.subarray(0, IV_LENGTH);
    const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
    const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
    const decipher = createDecipheriv(ALGORITHM, this.encryptionKey, iv);
    decipher.setAuthTag(authTag);
    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return decrypted.toString('utf8');
  }

  async storeCredential(serverId: string, key: string, value: string): Promise<void> {
    const encrypted = this.encrypt(value);
    await this.storage.saveCredential(serverId, key, encrypted);
    this.logger.info({ serverId, key }, 'Stored credential');
  }

  async getCredential(serverId: string, key: string): Promise<string | null> {
    const encrypted = await this.storage.getCredential(serverId, key);
    if (!encrypted) return null;
    try {
      return this.decrypt(encrypted);
    } catch (err) {
      this.logger.error({ serverId, key, error: String(err) }, 'Failed to decrypt credential');
      return null;
    }
  }

  async listCredentialKeys(serverId: string): Promise<string[]> {
    return this.storage.listCredentialKeys(serverId);
  }

  async deleteCredential(serverId: string, key: string): Promise<boolean> {
    const deleted = await this.storage.deleteCredential(serverId, key);
    if (deleted) {
      this.logger.info({ serverId, key }, 'Deleted credential');
    }
    return deleted;
  }

  /**
   * Update the internal encryption key (e.g. after TOKEN_SECRET rotation).
   */
  updateEncryptionKey(newTokenSecret: string): void {
    this.encryptionKey = createHash('sha256')
      .update(newTokenSecret + KEY_SALT)
      .digest();
  }

  /**
   * Re-encrypt all stored credentials when the TOKEN_SECRET rotates.
   *
   * 1. Derives old key from oldTokenSecret
   * 2. Derives new key from newTokenSecret
   * 3. Reads all stored credentials
   * 4. Decrypts each with old key, re-encrypts with new key
   * 5. Stores the updated encrypted values
   *
   * Returns the count of re-encrypted credentials.
   */
  async reEncrypt(oldTokenSecret: string, newTokenSecret: string): Promise<number> {
    const oldKey = createHash('sha256')
      .update(oldTokenSecret + KEY_SALT)
      .digest();
    const newKey = createHash('sha256')
      .update(newTokenSecret + KEY_SALT)
      .digest();

    const allCreds = await this.storage.listAllCredentials();
    if (allCreds.length === 0) {
      this.logger.info('No MCP credentials to re-encrypt');
      return 0;
    }

    let reEncrypted = 0;
    for (const cred of allCreds) {
      try {
        // Decrypt with old key
        const combined = Buffer.from(cred.encryptedValue, 'base64');
        const iv = combined.subarray(0, IV_LENGTH);
        const authTag = combined.subarray(IV_LENGTH, IV_LENGTH + AUTH_TAG_LENGTH);
        const encrypted = combined.subarray(IV_LENGTH + AUTH_TAG_LENGTH);
        const decipher = createDecipheriv(ALGORITHM, oldKey, iv);
        decipher.setAuthTag(authTag);
        const plaintext = Buffer.concat([decipher.update(encrypted), decipher.final()]).toString(
          'utf8'
        );

        // Re-encrypt with new key
        const newIv = randomBytes(IV_LENGTH);
        const cipher = createCipheriv(ALGORITHM, newKey, newIv);
        const newEncrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
        const newAuthTag = cipher.getAuthTag();
        const newCombined = Buffer.concat([newIv, newAuthTag, newEncrypted]);
        const newEncoded = newCombined.toString('base64');

        await this.storage.saveCredential(cred.serverId, cred.key, newEncoded);
        reEncrypted++;
      } catch (err) {
        this.logger.warn(
          { serverId: cred.serverId, key: cred.key, error: String(err) },
          'Failed to re-encrypt credential, skipping'
        );
      }
    }

    // Update the internal key to use the new secret going forward
    this.encryptionKey = newKey;

    this.logger.info(
      { total: allCreds.length, reEncrypted },
      'MCP credential re-encryption complete'
    );
    return reEncrypted;
  }

  /**
   * Inject decrypted credentials into an environment map for server spawn.
   * Keys are prefixed with MCP_CRED_ to avoid collisions.
   */
  async injectCredentials(
    serverId: string,
    env: Record<string, string>
  ): Promise<Record<string, string>> {
    const keys = await this.storage.listCredentialKeys(serverId);
    const merged = { ...env };

    for (const key of keys) {
      const value = await this.getCredential(serverId, key);
      if (value !== null) {
        merged[key] = value;
      }
    }

    return merged;
  }
}
