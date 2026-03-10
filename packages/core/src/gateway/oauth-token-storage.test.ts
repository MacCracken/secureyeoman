import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OAuthTokenStorage } from './oauth-token-storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// Mock token encryption so we don't need a real key
vi.mock('../security/token-encryption.js', () => ({
  encryptToken: (v: string | null) => (v ? Buffer.from(`enc:${v}`) : null),
  decryptToken: (v: Buffer | null) => (v ? v.toString().replace(/^enc:/, '') : null),
  currentKeyId: () => 'v1',
}));

// ─── Test Data ────────────────────────────────────────────────

const tokenRow = {
  id: 'tok-1',
  provider: 'google',
  email: 'user@example.com',
  user_id: 'user-1',
  access_token: '[encrypted]',
  refresh_token: '[encrypted]',
  access_token_enc: Buffer.from('enc:acc-token'),
  refresh_token_enc: Buffer.from('enc:ref-token'),
  token_enc_key_id: 'v1',
  scopes: 'email profile',
  expires_at: '9999999999',
  created_at: '1000',
  updated_at: '2000',
};

// ─── Tests ────────────────────────────────────────────────────

describe('OAuthTokenStorage', () => {
  let storage: OAuthTokenStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new OAuthTokenStorage();
  });

  describe('upsertToken', () => {
    it('inserts or updates token and returns mapped result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow], rowCount: 1 });

      const result = await storage.upsertToken({
        provider: 'google',
        email: 'user@example.com',
        userId: 'user-1',
        accessToken: 'acc-token',
        refreshToken: 'ref-token',
        scopes: 'email profile',
        expiresAt: 9999999999,
      });

      expect(result.id).toBe('tok-1');
      expect(result.provider).toBe('google');
      expect(result.email).toBe('user@example.com');
      expect(result.userId).toBe('user-1');
      expect(result.accessToken).toBe('acc-token');
      expect(result.refreshToken).toBe('ref-token');
      expect(result.scopes).toBe('email profile');
      expect(result.expiresAt).toBe(9999999999);
      expect(result.createdAt).toBe(1000);
      expect(result.updatedAt).toBe(2000);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO oauth_tokens');
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('RETURNING *');
      expect(sql).toContain('access_token_enc');
    });

    it('uses null defaults for optional fields', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...tokenRow, refresh_token: null, refresh_token_enc: null, expires_at: null }],
        rowCount: 1,
      });

      const result = await storage.upsertToken({
        provider: 'github',
        email: 'user@github.com',
        userId: 'user-2',
        accessToken: 'gh-token',
      });

      const params = mockQuery.mock.calls[0][1] as unknown[];
      // Param 5 is now the redacted sentinel, 6 is null refreshToken sentinel
      expect(params[5]).toBeNull(); // refreshToken sentinel (null because no refresh token)
      expect(params[9]).toBe(''); // scopes default
      expect(params[10]).toBeNull(); // expiresAt
      expect(result.refreshToken).toBeNull();
      expect(result.expiresAt).toBeNull();
    });
  });

  describe('getByEmail', () => {
    it('returns token when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow], rowCount: 1 });

      const result = await storage.getByEmail('google', 'user@example.com');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('tok-1');
      expect(result!.provider).toBe('google');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE provider = $1 AND email = $2');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('google');
      expect(params[1]).toBe('user@example.com');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getByEmail('google', 'nobody@example.com');
      expect(result).toBeNull();
    });
  });

  describe('getById', () => {
    it('returns token when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow], rowCount: 1 });

      const result = await storage.getById('tok-1');

      expect(result).not.toBeNull();
      expect(result!.id).toBe('tok-1');

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('WHERE id = $1');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('tok-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getById('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listTokens', () => {
    it('returns all tokens without raw access/refresh token values', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [tokenRow], rowCount: 1 });

      const result = await storage.listTokens();

      expect(result).toHaveLength(1);
      expect(result[0].id).toBe('tok-1');
      expect((result[0] as any).accessToken).toBeUndefined();
      expect((result[0] as any).refreshToken).toBeUndefined();

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY created_at DESC');
    });

    it('returns empty array when none', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listTokens();
      expect(result).toEqual([]);
    });
  });

  describe('updateAccessToken', () => {
    it('updates access token and expiry', async () => {
      await storage.updateAccessToken('tok-1', 'new-access-token', 9999999);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('UPDATE oauth_tokens');
      expect(sql).toContain('access_token');
      expect(sql).toContain('access_token_enc');

      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('[encrypted]'); // redacted sentinel
      expect(params[3]).toBe(9999999); // expiresAt
      expect(params[5]).toBe('tok-1'); // id
    });
  });

  describe('deleteToken', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [{ id: 'tok-1' }], rowCount: 1 });
      const result = await storage.deleteToken('tok-1');
      expect(result).toBe(true);

      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM oauth_tokens');
      expect(sql).toContain('RETURNING id');
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteToken('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('backward compatibility', () => {
    it('falls back to plaintext columns when encrypted columns are null', async () => {
      const legacyRow = {
        ...tokenRow,
        access_token: 'legacy-access',
        refresh_token: 'legacy-refresh',
        access_token_enc: null,
        refresh_token_enc: null,
        token_enc_key_id: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [legacyRow], rowCount: 1 });

      const result = await storage.getById('tok-1');
      expect(result!.accessToken).toBe('legacy-access');
      expect(result!.refreshToken).toBe('legacy-refresh');
    });
  });
});
