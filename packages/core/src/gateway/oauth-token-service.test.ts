import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OAuthTokenService } from './oauth-token-service.js';
import type { OAuthTokenStorage, OAuthToken } from './oauth-token-storage.js';
import type { SecureLogger } from '../logging/logger.js';

const makeLogger = (): SecureLogger =>
  ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    fatal: vi.fn(),
    child: vi.fn().mockReturnThis(),
    level: 'debug',
  }) as unknown as SecureLogger;

function makeToken(overrides: Partial<OAuthToken> = {}): OAuthToken {
  return {
    id: 'tok-1',
    provider: 'gmail',
    email: 'user@example.com',
    userId: 'u-1',
    accessToken: 'access-tok-123',
    refreshToken: 'refresh-tok-abc',
    scopes: 'openid email',
    expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour from now
    createdAt: Date.now(),
    updatedAt: Date.now(),
    ...overrides,
  } as OAuthToken;
}

function makeStorage(overrides: Partial<OAuthTokenStorage> = {}): OAuthTokenStorage {
  return {
    upsertToken: vi.fn().mockResolvedValue(makeToken()),
    getByEmail: vi.fn().mockResolvedValue(makeToken()),
    listTokens: vi.fn().mockResolvedValue([makeToken()]),
    deleteToken: vi.fn().mockResolvedValue(true),
    updateAccessToken: vi.fn().mockResolvedValue(undefined),
    ...overrides,
  } as unknown as OAuthTokenStorage;
}

describe('OAuthTokenService', () => {
  let logger: SecureLogger;
  let mockFetch: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    logger = makeLogger();
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('storeToken', () => {
    it('stores token via storage', async () => {
      const storage = makeStorage();
      const svc = new OAuthTokenService({ storage, logger });

      await svc.storeToken({
        provider: 'gmail',
        email: 'user@example.com',
        userId: 'u-1',
        accessToken: 'access-123',
        refreshToken: 'refresh-abc',
        expiresIn: 3600,
      });

      expect(storage.upsertToken).toHaveBeenCalledWith(
        expect.objectContaining({
          provider: 'gmail',
          email: 'user@example.com',
          accessToken: 'access-123',
        })
      );
    });

    it('stores token without expiry when expiresIn not provided', async () => {
      const storage = makeStorage();
      const svc = new OAuthTokenService({ storage, logger });

      await svc.storeToken({
        provider: 'github',
        email: 'u@e.com',
        userId: 'u1',
        accessToken: 'tok',
      });

      const call = (storage.upsertToken as ReturnType<typeof vi.fn>).mock.calls[0][0];
      expect(call.expiresAt).toBeUndefined();
    });
  });

  describe('listTokens', () => {
    it('returns tokens from storage', async () => {
      const storage = makeStorage();
      const svc = new OAuthTokenService({ storage, logger });
      const tokens = await svc.listTokens();
      expect(tokens).toHaveLength(1);
      expect(storage.listTokens).toHaveBeenCalled();
    });
  });

  describe('revokeToken', () => {
    it('deletes token from storage', async () => {
      const storage = makeStorage();
      const svc = new OAuthTokenService({ storage, logger });
      const result = await svc.revokeToken('tok-1');
      expect(result).toBe(true);
      expect(storage.deleteToken).toHaveBeenCalledWith('tok-1');
    });
  });

  describe('getValidToken', () => {
    it('returns null when no token stored', async () => {
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(null) });
      const svc = new OAuthTokenService({ storage, logger });
      const token = await svc.getValidToken('gmail', 'nobody@example.com');
      expect(token).toBeNull();
    });

    it('returns access token when not near expiry', async () => {
      const token = makeToken({ expiresAt: Date.now() + 60 * 60 * 1000 }); // 1 hour
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({ storage, logger });
      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('access-tok-123');
    });

    it('returns access token when expiresAt is null (no expiry)', async () => {
      const token = makeToken({ expiresAt: null });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({ storage, logger });
      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('access-tok-123');
    });

    it('refreshes token when near expiry (within 5 minutes)', async () => {
      const token = makeToken({
        expiresAt: Date.now() + 2 * 60 * 1000, // 2 minutes - within buffer
        provider: 'gmail',
        refreshToken: 'ref-tok',
      });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({
        storage,
        logger,
        googleCredentials: { clientId: 'cid', clientSecret: 'csec' },
      });

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ access_token: 'new-access-tok', expires_in: 3600 }),
      });

      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('new-access-tok');
      expect(storage.updateAccessToken).toHaveBeenCalledWith(
        'tok-1',
        'new-access-tok',
        expect.any(Number)
      );
    });

    it('returns stale token when refresh fails (HTTP error)', async () => {
      const token = makeToken({
        expiresAt: Date.now() + 2 * 60 * 1000,
        provider: 'gmail',
        refreshToken: 'ref-tok',
      });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({
        storage,
        logger,
        googleCredentials: { clientId: 'cid', clientSecret: 'csec' },
      });

      mockFetch.mockResolvedValue({ ok: false, text: async () => 'invalid_grant' });

      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('access-tok-123');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns stale token when refresh throws (network error)', async () => {
      const token = makeToken({
        expiresAt: Date.now() + 2 * 60 * 1000,
        provider: 'gmail',
        refreshToken: 'ref-tok',
      });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({
        storage,
        logger,
        googleCredentials: { clientId: 'cid', clientSecret: 'csec' },
      });

      mockFetch.mockRejectedValue(new Error('network timeout'));

      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('access-tok-123');
      expect(logger.error).toHaveBeenCalled();
    });

    it('returns stale token when no refresh token available', async () => {
      const token = makeToken({
        expiresAt: Date.now() + 2 * 60 * 1000,
        provider: 'gmail',
        refreshToken: undefined,
      });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({
        storage,
        logger,
        googleCredentials: { clientId: 'cid', clientSecret: 'csec' },
      });

      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('access-tok-123');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('returns stale token for gmail when no credentials configured', async () => {
      const token = makeToken({
        expiresAt: Date.now() + 2 * 60 * 1000,
        provider: 'gmail',
        refreshToken: 'ref-tok',
      });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({ storage, logger }); // no googleCredentials

      const result = await svc.getValidToken('gmail', 'user@example.com');
      expect(result).toBe('access-tok-123');
      expect(logger.warn).toHaveBeenCalled();
    });

    it('does not try to refresh non-google providers (no credentials match)', async () => {
      const token = makeToken({
        expiresAt: Date.now() + 2 * 60 * 1000,
        provider: 'github',
        refreshToken: 'ref-tok',
      });
      const storage = makeStorage({ getByEmail: vi.fn().mockResolvedValue(token) });
      const svc = new OAuthTokenService({ storage, logger });

      const result = await svc.getValidToken('github', 'user@example.com');
      expect(result).toBe('access-tok-123');
      // fetch should not be called for github (no credential match)
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });
});
