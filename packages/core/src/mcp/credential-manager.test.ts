/**
 * MCP Credential Manager — unit tests for encryption, storage delegation, and injection.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpCredentialManager } from './credential-manager.js';
import type { McpStorage } from './storage.js';
import type { SecureLogger } from '../logging/logger.js';

const TEST_SECRET = 'a-test-token-secret-that-is-at-least-32-characters-long';

function createMockStorage(): McpStorage {
  const store = new Map<string, string>();

  return {
    saveCredential: vi.fn(async (_serverId: string, key: string, encrypted: string) => {
      store.set(key, encrypted);
    }),
    getCredential: vi.fn(async (_serverId: string, key: string) => {
      return store.get(key) ?? null;
    }),
    listCredentialKeys: vi.fn().mockResolvedValue([]),
    deleteCredential: vi.fn().mockResolvedValue(true),
  } as unknown as McpStorage;
}

function createMockLogger(): SecureLogger {
  return {
    info: vi.fn(),
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
  } as unknown as SecureLogger;
}

describe('McpCredentialManager', () => {
  let storage: ReturnType<typeof createMockStorage>;
  let logger: ReturnType<typeof createMockLogger>;
  let manager: McpCredentialManager;

  beforeEach(() => {
    storage = createMockStorage();
    logger = createMockLogger();
    manager = new McpCredentialManager(storage, logger, TEST_SECRET);
  });

  describe('encrypt/decrypt roundtrip', () => {
    it('stores and retrieves a credential with the original plaintext', async () => {
      await manager.storeCredential('srv-1', 'API_KEY', 'super-secret-value');

      expect(storage.saveCredential).toHaveBeenCalledWith('srv-1', 'API_KEY', expect.any(String));

      // The stored value should NOT be the plaintext
      const storedEncrypted = (storage.saveCredential as ReturnType<typeof vi.fn>).mock.calls[0][2];
      expect(storedEncrypted).not.toBe('super-secret-value');

      const retrieved = await manager.getCredential('srv-1', 'API_KEY');
      expect(retrieved).toBe('super-secret-value');
    });

    it('handles empty string values', async () => {
      await manager.storeCredential('srv-1', 'EMPTY', '');
      const retrieved = await manager.getCredential('srv-1', 'EMPTY');
      expect(retrieved).toBe('');
    });

    it('handles values with special characters', async () => {
      const special = 'p@$$w0rd!#%^&*()_+={}\n\ttabs and newlines';
      await manager.storeCredential('srv-1', 'SPECIAL', special);
      const retrieved = await manager.getCredential('srv-1', 'SPECIAL');
      expect(retrieved).toBe(special);
    });
  });

  describe('IV randomization', () => {
    it('produces different ciphertexts for the same plaintext', async () => {
      await manager.storeCredential('srv-1', 'KEY_A', 'same-value');
      await manager.storeCredential('srv-1', 'KEY_B', 'same-value');

      const calls = (storage.saveCredential as ReturnType<typeof vi.fn>).mock.calls;
      const encrypted1 = calls[0][2] as string;
      const encrypted2 = calls[1][2] as string;

      // Due to random IV, the ciphertexts should differ
      expect(encrypted1).not.toBe(encrypted2);
    });
  });

  describe('getCredential', () => {
    it('returns null for a missing credential', async () => {
      (storage.getCredential as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const result = await manager.getCredential('srv-1', 'NONEXISTENT');
      expect(result).toBeNull();
    });

    it('returns null and logs error when decryption fails', async () => {
      (storage.getCredential as ReturnType<typeof vi.fn>).mockResolvedValue(
        'invalid-base64-garbage!!'
      );
      const result = await manager.getCredential('srv-1', 'CORRUPT');
      expect(result).toBeNull();
      expect(logger.error).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 'srv-1', key: 'CORRUPT' }),
        'Failed to decrypt credential'
      );
    });
  });

  describe('listCredentialKeys', () => {
    it('delegates to storage.listCredentialKeys', async () => {
      (storage.listCredentialKeys as ReturnType<typeof vi.fn>).mockResolvedValue([
        'API_KEY',
        'DB_PASS',
      ]);
      const keys = await manager.listCredentialKeys('srv-1');
      expect(keys).toEqual(['API_KEY', 'DB_PASS']);
      expect(storage.listCredentialKeys).toHaveBeenCalledWith('srv-1');
    });
  });

  describe('deleteCredential', () => {
    it('delegates to storage.deleteCredential and returns result', async () => {
      (storage.deleteCredential as ReturnType<typeof vi.fn>).mockResolvedValue(true);
      const result = await manager.deleteCredential('srv-1', 'API_KEY');
      expect(result).toBe(true);
      expect(storage.deleteCredential).toHaveBeenCalledWith('srv-1', 'API_KEY');
      expect(logger.info).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 'srv-1', key: 'API_KEY' }),
        'Deleted credential'
      );
    });

    it('does not log when deletion returns false', async () => {
      (storage.deleteCredential as ReturnType<typeof vi.fn>).mockResolvedValue(false);
      const result = await manager.deleteCredential('srv-1', 'NOPE');
      expect(result).toBe(false);
      expect(logger.info).not.toHaveBeenCalledWith('Deleted credential', expect.anything());
    });
  });

  describe('updateEncryptionKey', () => {
    it('allows decryption with new key after update', async () => {
      const newSecret = 'a-brand-new-secret-that-is-also-at-least-32-chars';
      manager.updateEncryptionKey(newSecret);

      // Store with new key
      await manager.storeCredential('srv-1', 'KEY', 'new-value');
      const retrieved = await manager.getCredential('srv-1', 'KEY');
      expect(retrieved).toBe('new-value');
    });

    it('cannot decrypt old credentials after key update', async () => {
      await manager.storeCredential('srv-1', 'KEY', 'old-value');

      manager.updateEncryptionKey('completely-different-secret-at-least-32-chars');

      const retrieved = await manager.getCredential('srv-1', 'KEY');
      // Decryption fails with wrong key — returns null
      expect(retrieved).toBeNull();
    });
  });

  describe('reEncrypt', () => {
    it('re-encrypts all credentials from old key to new key', async () => {
      const OLD_SECRET = TEST_SECRET;
      const NEW_SECRET = 'a-brand-new-secret-that-is-also-at-least-32-chars';

      // Store credentials with old secret
      await manager.storeCredential('srv-1', 'API_KEY', 'key-123');
      await manager.storeCredential('srv-2', 'DB_PASS', 'dbpass-456');

      // Mock listAllCredentials to return stored encrypted values
      const saveCalls = (storage.saveCredential as ReturnType<typeof vi.fn>).mock.calls;
      const allCreds = saveCalls.map((c: unknown[]) => ({
        serverId: c[0] as string,
        key: c[1] as string,
        encryptedValue: c[2] as string,
      }));
      (storage as unknown as Record<string, unknown>).listAllCredentials = vi
        .fn()
        .mockResolvedValue(allCreds);

      const count = await manager.reEncrypt(OLD_SECRET, NEW_SECRET);
      expect(count).toBe(2);

      // The internal key is now the new key — verify by storing/retrieving
      await manager.storeCredential('srv-3', 'NEW_KEY', 'new-value');
      const retrieved = await manager.getCredential('srv-3', 'NEW_KEY');
      expect(retrieved).toBe('new-value');
    });

    it('returns 0 when no credentials exist', async () => {
      (storage as unknown as Record<string, unknown>).listAllCredentials = vi
        .fn()
        .mockResolvedValue([]);

      const count = await manager.reEncrypt(TEST_SECRET, 'new-secret-at-least-32-characters');
      expect(count).toBe(0);
    });

    it('skips credentials that fail to decrypt and logs warning', async () => {
      (storage as unknown as Record<string, unknown>).listAllCredentials = vi.fn().mockResolvedValue([
        { serverId: 'srv-1', key: 'BAD', encryptedValue: 'totally-invalid-data!!' },
      ]);

      const count = await manager.reEncrypt(TEST_SECRET, 'new-secret-at-least-32-characters');
      expect(count).toBe(0);
      expect(logger.warn).toHaveBeenCalledWith(
        expect.objectContaining({ serverId: 'srv-1', key: 'BAD' }),
        'Failed to re-encrypt credential, skipping'
      );
    });
  });

  describe('injectCredentials', () => {
    it('merges decrypted credentials into the env map', async () => {
      // Store two credentials via the real encrypt path
      await manager.storeCredential('srv-1', 'API_KEY', 'key-123');
      await manager.storeCredential('srv-1', 'DB_PASS', 'dbpass-456');

      (storage.listCredentialKeys as ReturnType<typeof vi.fn>).mockResolvedValue([
        'API_KEY',
        'DB_PASS',
      ]);

      const baseEnv = { PATH: '/usr/bin', HOME: '/root' };
      const merged = await manager.injectCredentials('srv-1', baseEnv);

      expect(merged.PATH).toBe('/usr/bin');
      expect(merged.HOME).toBe('/root');
      expect(merged.API_KEY).toBe('key-123');
      expect(merged.DB_PASS).toBe('dbpass-456');
    });

    it('does not mutate the original env object', async () => {
      (storage.listCredentialKeys as ReturnType<typeof vi.fn>).mockResolvedValue([]);
      const baseEnv = { PATH: '/usr/bin' };
      const merged = await manager.injectCredentials('srv-1', baseEnv);
      expect(merged).not.toBe(baseEnv);
    });
  });
});
