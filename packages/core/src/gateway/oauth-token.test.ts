/**
 * OAuthTokenStorage + OAuthTokenService tests
 * Uses the real test database.
 */

import { describe, it, expect, beforeAll, beforeEach, afterAll, vi } from 'vitest';
import { OAuthTokenStorage } from './oauth-token-storage.js';
import { OAuthTokenService } from './oauth-token-service.js';
import { setupTestDb, teardownTestDb, truncateAllTables } from '../test-setup.js';
import type { SecureLogger } from '../logging/logger.js';

function noopLogger(): SecureLogger {
  const noop = () => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as SecureLogger;
}

beforeAll(async () => {
  await setupTestDb();
});

afterAll(async () => {
  await teardownTestDb();
});

// ── OAuthTokenStorage ─────────────────────────────────────────

describe('OAuthTokenStorage', () => {
  let storage: OAuthTokenStorage;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new OAuthTokenStorage();
  });

  it('should upsert and retrieve a token', async () => {
    const token = await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'user@example.com',
      userId: 'google_sub_123',
      accessToken: 'access_token_abc',
      refreshToken: 'refresh_token_xyz',
      scopes: 'openid email calendar.readonly',
      expiresAt: Date.now() + 3600_000,
    });

    expect(token.id).toBeDefined();
    expect(token.provider).toBe('googlecalendar');
    expect(token.email).toBe('user@example.com');
    expect(token.accessToken).toBe('access_token_abc');
    expect(token.refreshToken).toBe('refresh_token_xyz');
    expect(token.scopes).toBe('openid email calendar.readonly');
  });

  it('should update existing token on conflict (same provider+email)', async () => {
    await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'user@example.com',
      userId: 'google_sub_123',
      accessToken: 'old_token',
      refreshToken: 'old_refresh',
      scopes: '',
    });

    const updated = await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'user@example.com',
      userId: 'google_sub_123',
      accessToken: 'new_token',
      scopes: '',
    });

    expect(updated.accessToken).toBe('new_token');
    // refresh token should be preserved when not provided in update
    expect(updated.refreshToken).toBe('old_refresh');
  });

  it('should find token by email', async () => {
    await storage.upsertToken({
      provider: 'googledrive',
      email: 'drive@example.com',
      userId: 'uid_drive',
      accessToken: 'drive_token',
      scopes: '',
    });

    const found = await storage.getByEmail('googledrive', 'drive@example.com');
    expect(found).not.toBeNull();
    expect(found!.email).toBe('drive@example.com');

    const missing = await storage.getByEmail('googledrive', 'other@example.com');
    expect(missing).toBeNull();
  });

  it('should find token by id', async () => {
    const created = await storage.upsertToken({
      provider: 'gmail',
      email: 'mail@example.com',
      userId: 'uid_gmail',
      accessToken: 'mail_token',
      scopes: '',
    });

    const found = await storage.getById(created.id);
    expect(found).not.toBeNull();
    expect(found!.id).toBe(created.id);
  });

  it('should return null for unknown id', async () => {
    expect(await storage.getById('non-existent')).toBeNull();
  });

  it('should list tokens without exposing raw access/refresh values', async () => {
    await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'a@example.com',
      userId: 'uid_a',
      accessToken: 'secret_token',
      refreshToken: 'secret_refresh',
      scopes: '',
    });

    const list = await storage.listTokens();
    expect(list).toHaveLength(1);
    expect((list[0] as any).accessToken).toBeUndefined();
    expect((list[0] as any).refreshToken).toBeUndefined();
    expect(list[0]!.email).toBe('a@example.com');
  });

  it('should update access token', async () => {
    const created = await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'update@example.com',
      userId: 'uid_update',
      accessToken: 'old',
      scopes: '',
    });

    const newExpiry = Date.now() + 7200_000;
    await storage.updateAccessToken(created.id, 'new_access', newExpiry);

    const fetched = await storage.getById(created.id);
    expect(fetched!.accessToken).toBe('new_access');
    expect(fetched!.expiresAt).toBe(newExpiry);
  });

  it('should delete token', async () => {
    const created = await storage.upsertToken({
      provider: 'googledrive',
      email: 'del@example.com',
      userId: 'uid_del',
      accessToken: 'del_token',
      scopes: '',
    });

    expect(await storage.deleteToken(created.id)).toBe(true);
    expect(await storage.getById(created.id)).toBeNull();
    expect(await storage.deleteToken('non-existent')).toBe(false);
  });
});

// ── OAuthTokenService ─────────────────────────────────────────

describe('OAuthTokenService', () => {
  let storage: OAuthTokenStorage;
  let service: OAuthTokenService;

  beforeEach(async () => {
    await truncateAllTables();
    storage = new OAuthTokenStorage();
    service = new OAuthTokenService({
      storage,
      logger: noopLogger(),
    });
  });

  it('should return null when no token stored', async () => {
    expect(await service.getValidToken('googlecalendar', 'nobody@example.com')).toBeNull();
  });

  it('should return valid access token directly when not expired', async () => {
    await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'user@example.com',
      userId: 'uid_1',
      accessToken: 'valid_token',
      refreshToken: 'refresh_token',
      scopes: '',
      expiresAt: Date.now() + 60 * 60 * 1000, // 1 hour ahead
    });

    const token = await service.getValidToken('googlecalendar', 'user@example.com');
    expect(token).toBe('valid_token');
  });

  it('should attempt refresh when token is near expiry and credentials configured', async () => {
    const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: true,
      json: async () => ({ access_token: 'refreshed_token', expires_in: 3600 }),
    } as any);

    const serviceWithCreds = new OAuthTokenService({
      storage,
      logger: noopLogger(),
      googleCredentials: { clientId: 'client_id', clientSecret: 'client_secret' },
    });

    await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'user@example.com',
      userId: 'uid_1',
      accessToken: 'old_token',
      refreshToken: 'refresh_token',
      scopes: '',
      expiresAt: Date.now() + 60_000, // only 1 minute until expiry (< 5 min buffer)
    });

    const token = await serviceWithCreds.getValidToken('googlecalendar', 'user@example.com');
    expect(token).toBe('refreshed_token');
    expect(mockFetch).toHaveBeenCalledOnce();

    mockFetch.mockRestore();
  });

  it('should return stale token when refresh fails', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      text: async () => 'invalid_grant',
    } as any);

    const serviceWithCreds = new OAuthTokenService({
      storage,
      logger: noopLogger(),
      googleCredentials: { clientId: 'cid', clientSecret: 'csec' },
    });

    await storage.upsertToken({
      provider: 'googlecalendar',
      email: 'user@example.com',
      userId: 'uid_1',
      accessToken: 'stale_token',
      refreshToken: 'bad_refresh',
      scopes: '',
      expiresAt: Date.now() - 1000, // already expired
    });

    const token = await serviceWithCreds.getValidToken('googlecalendar', 'user@example.com');
    expect(token).toBe('stale_token');

    vi.restoreAllMocks();
  });

  it('should storeToken and retrieve via getValidToken', async () => {
    await service.storeToken({
      provider: 'googledrive',
      email: 'drive@example.com',
      userId: 'uid_drive',
      accessToken: 'drive_access',
      refreshToken: 'drive_refresh',
      scopes: 'drive.readonly',
      expiresIn: 3600,
    });

    const token = await service.getValidToken('googledrive', 'drive@example.com');
    expect(token).toBe('drive_access');
  });

  it('should revoke token', async () => {
    const stored = await service.storeToken({
      provider: 'googlecalendar',
      email: 'revoke@example.com',
      userId: 'uid_rev',
      accessToken: 'access',
      scopes: '',
    });

    expect(await service.revokeToken(stored.id)).toBe(true);
    expect(await service.getValidToken('googlecalendar', 'revoke@example.com')).toBeNull();
  });

  it('should list tokens without raw token values', async () => {
    await service.storeToken({
      provider: 'googlecalendar',
      email: 'list@example.com',
      userId: 'uid_list',
      accessToken: 'secret',
      scopes: '',
    });

    const list = await service.listTokens();
    expect(list).toHaveLength(1);
    expect((list[0] as any).accessToken).toBeUndefined();
  });
});
