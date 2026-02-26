import { describe, it, expect, beforeAll, beforeEach, afterAll } from 'vitest';
import { AuthStorage } from './auth-storage.js';
import { sha256, uuidv7 } from '../utils/crypto.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';

describe('AuthStorage', () => {
  let storage: AuthStorage;

  beforeAll(async () => {
    await setupTestDb();
  });

  beforeEach(async () => {
    await truncateAllTables();
    storage = new AuthStorage();
  });

  afterAll(async () => {
    await teardownTestDb();
  });

  // ── Token revocation ──────────────────────────────────────────────

  describe('token revocation', () => {
    it('should report a token as not revoked when absent', async () => {
      expect(await storage.isTokenRevoked('nonexistent-jti')).toBe(false);
    });

    it('should revoke a token and report it as revoked', async () => {
      const jti = uuidv7();
      await storage.revokeToken(jti, 'admin', Date.now() + 3600_000);
      expect(await storage.isTokenRevoked(jti)).toBe(true);
    });

    it('should handle duplicate revocation gracefully (INSERT OR IGNORE)', async () => {
      const jti = uuidv7();
      const exp = Date.now() + 3600_000;
      await storage.revokeToken(jti, 'admin', exp);
      await storage.revokeToken(jti, 'admin', exp); // should not throw
      expect(await storage.isTokenRevoked(jti)).toBe(true);
    });
  });

  // ── Expired token cleanup ─────────────────────────────────────────

  describe('cleanupExpiredTokens', () => {
    it('should delete tokens whose expires_at is in the past', async () => {
      const jti1 = uuidv7();
      const jti2 = uuidv7();
      // jti1 expired
      await storage.revokeToken(jti1, 'admin', Date.now() - 1000);
      // jti2 still valid
      await storage.revokeToken(jti2, 'admin', Date.now() + 3600_000);

      const cleaned = await storage.cleanupExpiredTokens();
      expect(cleaned).toBe(1);
      expect(await storage.isTokenRevoked(jti1)).toBe(false);
      expect(await storage.isTokenRevoked(jti2)).toBe(true);
    });

    it('should return 0 when nothing to clean', async () => {
      expect(await storage.cleanupExpiredTokens()).toBe(0);
    });
  });

  // ── API key CRUD ──────────────────────────────────────────────────

  describe('API keys', () => {
    const makeRow = (overrides: Partial<Parameters<AuthStorage['storeApiKey']>[0]> = {}) => ({
      id: overrides.id ?? uuidv7(),
      name: overrides.name ?? 'test-key',
      key_hash: overrides.key_hash ?? sha256('sck_testkey123'),
      key_prefix: overrides.key_prefix ?? 'sck_test',
      role: overrides.role ?? 'admin',
      user_id: overrides.user_id ?? 'admin',
      created_at: overrides.created_at ?? Date.now(),
      expires_at: overrides.expires_at ?? null,
      revoked_at: overrides.revoked_at ?? null,
      last_used_at: overrides.last_used_at ?? null,
    });

    it('should store and retrieve a key by hash', async () => {
      const row = makeRow();
      await storage.storeApiKey(row);
      const found = await storage.findApiKeyByHash(row.key_hash);
      expect(found).not.toBeNull();
      expect(found!.id).toBe(row.id);
      expect(found!.name).toBe('test-key');
    });

    it('should return null for unknown hash', async () => {
      expect(await storage.findApiKeyByHash('nonexistent')).toBeNull();
    });

    it('should not return a revoked key', async () => {
      const row = makeRow({ revoked_at: Date.now() });
      await storage.storeApiKey(row);
      expect(await storage.findApiKeyByHash(row.key_hash)).toBeNull();
    });

    it('should not return an expired key', async () => {
      const row = makeRow({ expires_at: Date.now() - 1000 });
      await storage.storeApiKey(row);
      expect(await storage.findApiKeyByHash(row.key_hash)).toBeNull();
    });

    it('should list keys for a specific user', async () => {
      await storage.storeApiKey(makeRow({ id: uuidv7(), key_hash: sha256('a'), user_id: 'alice' }));
      await storage.storeApiKey(makeRow({ id: uuidv7(), key_hash: sha256('b'), user_id: 'bob' }));
      await storage.storeApiKey(makeRow({ id: uuidv7(), key_hash: sha256('c'), user_id: 'alice' }));

      const aliceKeys = await storage.listApiKeys('alice');
      expect(aliceKeys).toHaveLength(2);
      expect(aliceKeys.every((k) => k.user_id === 'alice')).toBe(true);
      // Should not contain key_hash
      expect((aliceKeys[0] as Record<string, unknown>).key_hash).toBeUndefined();
    });

    it('should list all keys without userId filter', async () => {
      await storage.storeApiKey(makeRow({ id: uuidv7(), key_hash: sha256('a'), user_id: 'alice' }));
      await storage.storeApiKey(makeRow({ id: uuidv7(), key_hash: sha256('b'), user_id: 'bob' }));

      const keys = await storage.listApiKeys();
      expect(keys).toHaveLength(2);
    });

    it('should revoke a key', async () => {
      const row = makeRow();
      await storage.storeApiKey(row);

      const ok = await storage.revokeApiKey(row.id);
      expect(ok).toBe(true);
      expect(await storage.findApiKeyByHash(row.key_hash)).toBeNull();
    });

    it('should return false when revoking a non-existent key', async () => {
      expect(await storage.revokeApiKey('nonexistent')).toBe(false);
    });

    it('should update last_used_at', async () => {
      const row = makeRow();
      await storage.storeApiKey(row);

      const now = Date.now();
      await storage.updateLastUsed(row.id, now);

      const found = await storage.findApiKeyByHash(row.key_hash);
      expect(found!.last_used_at).toBe(now);
    });
  });

  // ── Users ──────────────────────────────────────────────────────────

  describe('Users', () => {
    it('should create and retrieve a user by id', async () => {
      const user = await storage.createUser({ email: 'alice@example.com', displayName: 'Alice' });
      expect(user.id).toBeDefined();
      expect(user.email).toBe('alice@example.com');
      expect(user.displayName).toBe('Alice');
      expect(user.isAdmin).toBe(false);

      const found = await storage.getUserById(user.id);
      expect(found).not.toBeNull();
      expect(found!.email).toBe('alice@example.com');
    });

    it('should return null getUserById for unknown id', async () => {
      expect(await storage.getUserById('00000000-0000-0000-0000-000000000000')).toBeNull();
    });

    it('should retrieve a user by email', async () => {
      await storage.createUser({ email: 'bob@example.com' });
      const found = await storage.getUserByEmail('bob@example.com');
      expect(found).not.toBeNull();
      expect(found!.email).toBe('bob@example.com');
    });

    it('should return null getUserByEmail for unknown email', async () => {
      expect(await storage.getUserByEmail('nobody@example.com')).toBeNull();
    });

    it('should list all users', async () => {
      await storage.createUser({ email: 'u1@example.com' });
      await storage.createUser({ email: 'u2@example.com' });
      const users = await storage.listUsers();
      expect(users.length).toBeGreaterThanOrEqual(2);
    });

    it('should return empty array when no users', async () => {
      const users = await storage.listUsers();
      expect(users).toHaveLength(0);
    });

    it('should update user display name', async () => {
      const user = await storage.createUser({ email: 'update@example.com', displayName: 'Old' });
      const updated = await storage.updateUser(user.id, { displayName: 'New' });
      expect(updated!.displayName).toBe('New');
    });

    it('should return user unchanged when updateUser called with no fields', async () => {
      const user = await storage.createUser({ email: 'noop@example.com', displayName: 'Same' });
      const result = await storage.updateUser(user.id, {});
      expect(result!.displayName).toBe('Same');
    });

    it('should return null updateUser for unknown id', async () => {
      const result = await storage.updateUser('00000000-0000-0000-0000-000000000000', { displayName: 'x' });
      expect(result).toBeNull();
    });

    it('should delete a user', async () => {
      const user = await storage.createUser({ email: 'todelete@example.com' });
      const ok = await storage.deleteUser(user.id);
      expect(ok).toBe(true);
      expect(await storage.getUserById(user.id)).toBeNull();
    });

    it('should not delete the admin user', async () => {
      const ok = await storage.deleteUser('admin');
      expect(ok).toBe(false);
    });
  });
});
