/**
 * Unit tests for AuthService — fully mocked, no DB required.
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockStorage = vi.hoisted(() => ({
  revokeToken: vi.fn(),
  isTokenRevoked: vi.fn(),
  cleanupExpiredTokens: vi.fn(),
  storeApiKey: vi.fn(),
  findApiKeyByHash: vi.fn(),
  listApiKeys: vi.fn(),
  revokeApiKey: vi.fn(),
  updateLastUsed: vi.fn(),
  listUsers: vi.fn(),
  getUserById: vi.fn(),
  getUserByEmail: vi.fn(),
  createUser: vi.fn(),
  updateUser: vi.fn(),
  deleteUser: vi.fn(),
  saveTwoFactor: vi.fn(),
  loadTwoFactor: vi.fn().mockResolvedValue(null),
  deleteTwoFactor: vi.fn(),
  saveRecoveryCodes: vi.fn(),
  loadRecoveryCodes: vi.fn().mockResolvedValue([]),
  markRecoveryCodeUsed: vi.fn(),
}));

const mockAuditChain = vi.hoisted(() => ({
  record: vi.fn(),
}));

const mockRbac = vi.hoisted(() => ({
  getRole: vi.fn(),
}));

const mockRateLimiter = vi.hoisted(() => ({
  check: vi.fn(),
}));

const mockCrypto = vi.hoisted(() => ({
  sha256: vi.fn((s: string) => `sha256_${s}`),
  secureCompare: vi.fn((a: string, b: string) => a === b),
  generateSecureToken: vi.fn(() => 'mock-secure-token-32bytes'),
  uuidv7: vi.fn(() => '01961234-5678-7aaa-8bbb-ccccddddeeee'),
  hashPassword: vi.fn(async () => 'scrypt:bW9jaw==:aGFzaA=='),
  verifyPassword: vi.fn(async () => true),
  isLegacySha256: vi.fn((s: string) => /^[0-9a-f]{64}$/.test(s)),
}));

const mockTotp = vi.hoisted(() => ({
  generateTOTPSecret: vi.fn(() => 'JBSWY3DPEHPK3PXP'),
  verifyTOTP: vi.fn(() => true),
  generateRecoveryCodes: vi.fn(() => ['CODE1', 'CODE2', 'CODE3']),
  buildTOTPUri: vi.fn(() => 'otpauth://totp/SecureYeoman:admin?secret=JBSWY3DPEHPK3PXP'),
}));

vi.mock('../utils/crypto.js', () => mockCrypto);
vi.mock('./totp.js', () => mockTotp);

// ── Imports (after mocks) ────────────────────────────────────────────

import { AuthService, AuthError } from './auth.js';
import type { AuthServiceConfig, AuthServiceDeps } from './auth.js';
import type { SecureLogger } from '../logging/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────

const TOKEN_SECRET = 'test-token-secret-at-least-32chars!!';
const LEGACY_SHA256_HASH = 'a'.repeat(64); // 64 hex chars = legacy SHA256

function noopLogger(): SecureLogger {
  const noop = (..._args: unknown[]) => {};
  return {
    trace: noop,
    debug: noop,
    info: noop,
    warn: noop,
    error: noop,
    fatal: noop,
    child: () => noopLogger(),
    level: 'silent',
  } as unknown as SecureLogger;
}

function makeConfig(overrides?: Partial<AuthServiceConfig>): AuthServiceConfig {
  return {
    tokenSecret: TOKEN_SECRET,
    tokenExpirySeconds: 3600,
    refreshTokenExpirySeconds: 86400,
    adminPassword: 'scrypt:bW9jaw==:aGFzaA==',
    ...overrides,
  };
}

function makeDeps(): AuthServiceDeps {
  return {
    storage: mockStorage as unknown as AuthServiceDeps['storage'],
    auditChain: mockAuditChain as unknown as AuthServiceDeps['auditChain'],
    rbac: mockRbac as unknown as AuthServiceDeps['rbac'],
    rateLimiter: mockRateLimiter as unknown as AuthServiceDeps['rateLimiter'],
    logger: noopLogger(),
  };
}

function makeService(configOverrides?: Partial<AuthServiceConfig>) {
  return new AuthService(makeConfig(configOverrides), makeDeps());
}

// ── Tests ────────────────────────────────────────────────────────────

describe('AuthService (unit)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Defaults: rate limiter allows, rbac returns a role, storage cooperates
    mockRateLimiter.check.mockResolvedValue({ allowed: true });
    mockRbac.getRole.mockReturnValue({
      permissions: [{ resource: 'chat', actions: ['read', 'write'] }],
    });
    mockStorage.revokeToken.mockResolvedValue(true);
    mockStorage.isTokenRevoked.mockResolvedValue(false);
    mockStorage.storeApiKey.mockResolvedValue(undefined);
    mockStorage.findApiKeyByHash.mockResolvedValue(null);
    mockStorage.updateLastUsed.mockResolvedValue(undefined);
    mockStorage.revokeApiKey.mockResolvedValue(true);
    mockStorage.listApiKeys.mockResolvedValue([]);
    mockStorage.cleanupExpiredTokens.mockResolvedValue(5);
    mockStorage.listUsers.mockResolvedValue([]);
    mockStorage.getUserById.mockResolvedValue(null);
    mockStorage.getUserByEmail.mockResolvedValue(null);
    mockStorage.createUser.mockResolvedValue({ id: 'u1' });
    mockStorage.updateUser.mockResolvedValue({ id: 'u1' });
    mockStorage.deleteUser.mockResolvedValue(true);
    mockAuditChain.record.mockResolvedValue(undefined);
    mockCrypto.verifyPassword.mockResolvedValue(true);
    mockCrypto.isLegacySha256.mockReturnValue(false);
    mockTotp.verifyTOTP.mockReturnValue(true);
  });

  // ── Constructor & getStats ──────────────────────────────────────

  describe('getStats', () => {
    it('returns zeroed stats initially', () => {
      const svc = makeService();
      expect(svc.getStats()).toEqual({
        authAttemptsTotal: 0,
        authSuccessTotal: 0,
        authFailuresTotal: 0,
      });
    });
  });

  // ── updateTokenSecret / clearPreviousSecret ─────────────────────

  describe('updateTokenSecret / clearPreviousSecret', () => {
    it('rotates the secret and keeps previous for grace period', async () => {
      const svc = makeService();
      // Login to get a token signed with the original secret
      const result = await svc.login('correct', '127.0.0.1');
      expect(result.accessToken).toBeTruthy();

      // Rotate
      svc.updateTokenSecret('new-secret-at-least-32chars!!!!!');

      // Token signed with old secret should still be valid (previous secret)
      const user = await svc.validateToken(result.accessToken);
      expect(user.userId).toBe('admin');

      // After clearing previous, old tokens should fail
      svc.clearPreviousSecret();
      await expect(svc.validateToken(result.accessToken)).rejects.toThrow(AuthError);
    });
  });

  // ── Login ──────────────────────────────────────────────────────

  describe('login', () => {
    it('succeeds with correct scrypt password', async () => {
      const svc = makeService();
      const result = await svc.login('correct', '127.0.0.1');

      expect(result.tokenType).toBe('Bearer');
      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(3600);
      expect(svc.getStats().authSuccessTotal).toBe(1);
      expect(svc.getStats().authAttemptsTotal).toBe(1);
    });

    it('succeeds with legacy SHA256 password and auto-upgrades', async () => {
      mockCrypto.isLegacySha256.mockReturnValue(true);
      mockCrypto.secureCompare.mockReturnValue(true);

      const svc = makeService({ adminPassword: LEGACY_SHA256_HASH });
      const result = await svc.login('correct', '127.0.0.1');

      expect(result.accessToken).toBeTruthy();
      // hashPassword should be called to upgrade
      expect(mockCrypto.hashPassword).toHaveBeenCalledWith('correct');
    });

    it('rejects when legacy SHA256 password does not match', async () => {
      mockCrypto.isLegacySha256.mockReturnValue(true);
      mockCrypto.secureCompare.mockReturnValue(false);

      const svc = makeService({ adminPassword: LEGACY_SHA256_HASH });
      await expect(svc.login('wrong', '127.0.0.1')).rejects.toThrow('Invalid credentials');
      expect(svc.getStats().authFailuresTotal).toBe(1);
    });

    it('rejects when scrypt password is invalid', async () => {
      mockCrypto.verifyPassword.mockResolvedValue(false);

      const svc = makeService();
      await expect(svc.login('wrong', '127.0.0.1')).rejects.toThrow('Invalid credentials');
      expect(svc.getStats().authFailuresTotal).toBe(1);
    });

    it('rejects when rate limited', async () => {
      mockRateLimiter.check.mockResolvedValue({ allowed: false });

      const svc = makeService();
      await expect(svc.login('any', '127.0.0.1')).rejects.toThrow('Too many login attempts');
      const err = await svc.login('any', '127.0.0.1').catch((e) => e);
      expect(err).toBeInstanceOf(AuthError);
      expect(err.statusCode).toBe(429);
    });

    it('returns requiresTwoFactor when 2FA is enabled', async () => {
      const svc = makeService();
      // Setup and enable 2FA
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456', ['RC1']);

      const result = await svc.login('correct', '127.0.0.1');
      expect(result.requiresTwoFactor).toBe(true);
      expect(result.accessToken).toBe('');
      expect(result.refreshToken).toBe('');
      expect(result.expiresIn).toBe(0);
    });

    it('uses rememberMe extended expiry', async () => {
      const svc = makeService();
      const result = await svc.login('correct', '127.0.0.1', true);

      // rememberMe uses 1h access (short-lived), 30d refresh (extended)
      expect(result.expiresIn).toBe(3600);
    });
  });

  // ── Refresh ──────────────────────────────────────────────────

  describe('refresh', () => {
    it('issues new tokens from a valid refresh token', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      const refreshed = await svc.refresh(login.refreshToken);
      expect(refreshed.accessToken).toBeTruthy();
      expect(refreshed.refreshToken).toBeTruthy();
      expect(refreshed.tokenType).toBe('Bearer');
    });

    it('rejects an access token used as refresh', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      await expect(svc.refresh(login.accessToken)).rejects.toThrow('Invalid token type');
    });

    it('rejects when token has already been revoked', async () => {
      mockStorage.revokeToken.mockResolvedValue(false);

      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      await expect(svc.refresh(login.refreshToken)).rejects.toThrow(
        'Refresh token has been revoked'
      );
    });
  });

  // ── Logout ─────────────────────────────────────────────────────

  describe('logout', () => {
    it('revokes token and audits', async () => {
      const svc = makeService();
      await svc.logout('some-jti', 'admin', Date.now() + 3600000);

      expect(mockStorage.revokeToken).toHaveBeenCalledWith('some-jti', 'admin', expect.any(Number));
      expect(mockAuditChain.record).toHaveBeenCalled();
    });
  });

  // ── validateToken ──────────────────────────────────────────────

  describe('validateToken', () => {
    it('returns AuthUser for valid access token', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');
      const user = await svc.validateToken(login.accessToken);

      expect(user.userId).toBe('admin');
      expect(user.role).toBe('admin');
      expect(user.authMethod).toBe('jwt');
      expect(user.jti).toBeTruthy();
    });

    it('rejects refresh token used as access', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      await expect(svc.validateToken(login.refreshToken)).rejects.toThrow('Invalid token type');
    });

    it('rejects revoked access token', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      mockStorage.isTokenRevoked.mockResolvedValue(true);
      await expect(svc.validateToken(login.accessToken)).rejects.toThrow('Token has been revoked');
    });

    it('rejects invalid/expired token', async () => {
      const svc = makeService();
      await expect(svc.validateToken('garbage.token.here')).rejects.toThrow(
        'Invalid or expired token'
      );
    });
  });

  // ── API key management ─────────────────────────────────────────

  describe('createApiKey', () => {
    it('creates a key and returns full result', async () => {
      const svc = makeService();
      const result = await svc.createApiKey({
        name: 'test-key',
        role: 'viewer',
        userId: 'admin',
      });

      expect(result.id).toBeTruthy();
      expect(result.name).toBe('test-key');
      expect(result.key).toMatch(/^sck_/);
      expect(result.keyPrefix).toBeTruthy();
      expect(result.role).toBe('viewer');
      expect(result.expiresAt).toBeNull();
      expect(mockStorage.storeApiKey).toHaveBeenCalledOnce();
      expect(mockAuditChain.record).toHaveBeenCalled();
    });

    it('sets expiresAt when expiresInDays is provided', async () => {
      const svc = makeService();
      const result = await svc.createApiKey({
        name: 'expiring-key',
        role: 'viewer',
        userId: 'admin',
        expiresInDays: 30,
      });

      expect(result.expiresAt).toBeGreaterThan(Date.now());
    });

    it('passes gateway fields to storage', async () => {
      const svc = makeService();
      await svc.createApiKey({
        name: 'gw-key',
        role: 'operator',
        userId: 'admin',
        personalityId: 'pers-1',
        rateLimitRpm: 100,
        rateLimitTpd: 5000,
        isGatewayKey: true,
      });

      const stored = mockStorage.storeApiKey.mock.calls[0][0];
      expect(stored.personality_id).toBe('pers-1');
      expect(stored.rate_limit_rpm).toBe(100);
      expect(stored.rate_limit_tpd).toBe(5000);
      expect(stored.is_gateway_key).toBe(true);
    });
  });

  describe('validateApiKey', () => {
    it('returns AuthUser for valid key', async () => {
      mockStorage.findApiKeyByHash.mockResolvedValue({
        id: 'key-1',
        name: 'test',
        key_hash: 'hash',
        key_prefix: 'sck_mock',
        role: 'viewer',
        user_id: 'admin',
        created_at: Date.now(),
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        personality_id: 'pers-1',
        rate_limit_rpm: 60,
        rate_limit_tpd: 1000,
        is_gateway_key: true,
      });

      const svc = makeService();
      const user = await svc.validateApiKey('sck_some-raw-key');

      expect(user.userId).toBe('admin');
      expect(user.role).toBe('viewer');
      expect(user.authMethod).toBe('api_key');
      expect(user.apiKeyId).toBe('key-1');
      expect(user.gatewayPersonalityId).toBe('pers-1');
      expect(user.gatewayRateLimitRpm).toBe(60);
      expect(user.gatewayRateLimitTpd).toBe(1000);
      expect(user.isGatewayKey).toBe(true);
      expect(mockStorage.updateLastUsed).toHaveBeenCalledWith('key-1', expect.any(Number));
    });

    it('returns undefined for optional gateway fields when null', async () => {
      mockStorage.findApiKeyByHash.mockResolvedValue({
        id: 'key-2',
        name: 'basic',
        key_hash: 'hash',
        key_prefix: 'sck_mock',
        role: 'viewer',
        user_id: 'admin',
        created_at: Date.now(),
        expires_at: null,
        revoked_at: null,
        last_used_at: null,
        personality_id: null,
        rate_limit_rpm: null,
        rate_limit_tpd: null,
        is_gateway_key: false,
      });

      const svc = makeService();
      const user = await svc.validateApiKey('sck_raw');

      expect(user.gatewayPersonalityId).toBeUndefined();
      expect(user.gatewayRateLimitRpm).toBeUndefined();
      expect(user.gatewayRateLimitTpd).toBeUndefined();
      expect(user.isGatewayKey).toBe(false);
    });

    it('throws on invalid API key', async () => {
      mockStorage.findApiKeyByHash.mockResolvedValue(null);

      const svc = makeService();
      await expect(svc.validateApiKey('sck_bad')).rejects.toThrow('Invalid API key');

      const err = await svc.validateApiKey('sck_bad').catch((e) => e);
      expect(err.statusCode).toBe(401);
      // 2 calls * 1 failure each
      expect(svc.getStats().authFailuresTotal).toBe(2);
    });
  });

  describe('revokeApiKey', () => {
    it('returns true and audits when revocation succeeds', async () => {
      mockStorage.revokeApiKey.mockResolvedValue(true);

      const svc = makeService();
      const ok = await svc.revokeApiKey('key-1', 'admin');

      expect(ok).toBe(true);
      expect(mockAuditChain.record).toHaveBeenCalled();
    });

    it('returns false and does not audit when key not found', async () => {
      mockStorage.revokeApiKey.mockResolvedValue(false);

      const svc = makeService();
      const ok = await svc.revokeApiKey('key-nonexistent', 'admin');

      expect(ok).toBe(false);
      expect(mockAuditChain.record).not.toHaveBeenCalled();
    });
  });

  describe('listApiKeys', () => {
    it('delegates to storage', async () => {
      const keys = [{ id: 'k1' }];
      mockStorage.listApiKeys.mockResolvedValue(keys);

      const svc = makeService();
      const result = await svc.listApiKeys('admin');

      expect(result).toBe(keys);
      expect(mockStorage.listApiKeys).toHaveBeenCalledWith('admin');
    });

    it('passes undefined when no userId', async () => {
      const svc = makeService();
      await svc.listApiKeys();
      expect(mockStorage.listApiKeys).toHaveBeenCalledWith(undefined);
    });
  });

  describe('cleanupExpiredTokens', () => {
    it('delegates to storage and returns count', async () => {
      mockStorage.cleanupExpiredTokens.mockResolvedValue(7);

      const svc = makeService();
      const count = await svc.cleanupExpiredTokens();

      expect(count).toBe(7);
    });
  });

  // ── createUserSession ──────────────────────────────────────────

  describe('createUserSession', () => {
    it('issues tokens for any userId/role', async () => {
      const svc = makeService();
      const result = await svc.createUserSession('sso-user-1', 'operator');

      expect(result.accessToken).toBeTruthy();
      expect(result.refreshToken).toBeTruthy();
      expect(result.expiresIn).toBe(3600);
      expect(result.tokenType).toBe('Bearer');
    });

    it('defaults to viewer role', async () => {
      const svc = makeService();
      const result = await svc.createUserSession('sso-user-2');

      // The token is issued — we can validate it
      const user = await svc.validateToken(result.accessToken);
      expect(user.role).toBe('viewer');
    });
  });

  // ── User CRUD delegates ────────────────────────────────────────

  describe('user management delegates', () => {
    it('listUsers delegates to storage', async () => {
      const svc = makeService();
      await svc.listUsers();
      expect(mockStorage.listUsers).toHaveBeenCalledOnce();
    });

    it('getUserById delegates to storage', async () => {
      const svc = makeService();
      await svc.getUserById('u1');
      expect(mockStorage.getUserById).toHaveBeenCalledWith('u1');
    });

    it('getUserByEmail delegates to storage', async () => {
      const svc = makeService();
      await svc.getUserByEmail('a@b.com');
      expect(mockStorage.getUserByEmail).toHaveBeenCalledWith('a@b.com');
    });

    it('createUser delegates to storage', async () => {
      const svc = makeService();
      const data = { email: 'a@b.com' };
      await svc.createUser(data as any);
      expect(mockStorage.createUser).toHaveBeenCalledWith(data);
    });

    it('updateUser delegates to storage', async () => {
      const svc = makeService();
      await svc.updateUser('u1', { email: 'new@b.com' } as any);
      expect(mockStorage.updateUser).toHaveBeenCalledWith('u1', { email: 'new@b.com' });
    });

    it('deleteUser delegates to storage', async () => {
      const svc = makeService();
      await svc.deleteUser('u1');
      expect(mockStorage.deleteUser).toHaveBeenCalledWith('u1');
    });
  });

  // ── Password Reset ─────────────────────────────────────────────

  describe('resetPassword', () => {
    it('resets password when current password is valid (scrypt)', async () => {
      const svc = makeService();
      const newPass = 'x'.repeat(32);
      await svc.resetPassword('current', newPass);

      expect(mockCrypto.hashPassword).toHaveBeenCalledWith(newPass);
      expect(mockAuditChain.record).toHaveBeenCalled();
    });

    it('resets password when current password is valid (legacy SHA256)', async () => {
      mockCrypto.isLegacySha256.mockReturnValue(true);
      mockCrypto.secureCompare.mockReturnValue(true);

      const svc = makeService({ adminPassword: LEGACY_SHA256_HASH });
      await svc.resetPassword('current', 'y'.repeat(32));

      expect(mockCrypto.hashPassword).toHaveBeenCalled();
    });

    it('throws when current password is wrong', async () => {
      mockCrypto.verifyPassword.mockResolvedValue(false);

      const svc = makeService();
      await expect(svc.resetPassword('wrong', 'x'.repeat(32))).rejects.toThrow(
        'Current password is incorrect'
      );
    });

    it('throws when current legacy password is wrong', async () => {
      mockCrypto.isLegacySha256.mockReturnValue(true);
      mockCrypto.secureCompare.mockReturnValue(false);

      const svc = makeService({ adminPassword: LEGACY_SHA256_HASH });
      await expect(svc.resetPassword('wrong', 'x'.repeat(32))).rejects.toThrow(
        'Current password is incorrect'
      );
    });

    it('throws when new password is too short', async () => {
      const svc = makeService();
      await expect(svc.resetPassword('current', 'short')).rejects.toThrow(
        'New password must be at least 32 characters'
      );
      const err = await svc.resetPassword('current', 'short').catch((e) => e);
      expect(err.statusCode).toBe(400);
    });

    it('invalidates all sessions after reset', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      // Reset password — should rotate secrets and clear previous
      await svc.resetPassword('correct', 'z'.repeat(32));

      // Old token should now be invalid
      await expect(svc.validateToken(login.accessToken)).rejects.toThrow(AuthError);
    });
  });

  // ── Two-Factor Authentication ──────────────────────────────────

  describe('isTwoFactorEnabled', () => {
    it('returns false initially', () => {
      const svc = makeService();
      expect(svc.isTwoFactorEnabled()).toBe(false);
    });
  });

  describe('setupTwoFactor', () => {
    it('returns secret, uri, and recovery codes', async () => {
      const svc = makeService();
      const result = await svc.setupTwoFactor();

      expect(result.secret).toBe('JBSWY3DPEHPK3PXP');
      expect(result.uri).toContain('otpauth://');
      expect(result.recoveryCodes).toEqual(['CODE1', 'CODE2', 'CODE3']);
      expect(mockAuditChain.record).toHaveBeenCalled();
    });
  });

  describe('verifyAndEnableTwoFactor', () => {
    it('enables 2FA on valid code', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();

      const ok = await svc.verifyAndEnableTwoFactor('123456', ['RC1', 'RC2']);
      expect(ok).toBe(true);
      expect(svc.isTwoFactorEnabled()).toBe(true);
    });

    it('returns false on invalid code', async () => {
      mockTotp.verifyTOTP.mockReturnValue(false);

      const svc = makeService();
      await svc.setupTwoFactor();

      const ok = await svc.verifyAndEnableTwoFactor('000000');
      expect(ok).toBe(false);
      expect(svc.isTwoFactorEnabled()).toBe(false);
    });

    it('throws if no setup in progress', async () => {
      const svc = makeService();
      await expect(svc.verifyAndEnableTwoFactor('123456')).rejects.toThrow(
        'No 2FA setup in progress'
      );
    });
  });

  describe('verifyTwoFactorCode', () => {
    it('issues tokens on valid TOTP code', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456', ['RC1', 'RC2']);

      // verifyTOTP returns true by default
      const result = await svc.verifyTwoFactorCode('654321');
      expect(result.accessToken).toBeTruthy();
      expect(result.tokenType).toBe('Bearer');
    });

    it('issues tokens on valid recovery code', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456', ['RECOVERY1', 'RECOVERY2']);

      // Make TOTP fail, so recovery code path is taken
      mockTotp.verifyTOTP.mockReturnValue(false);

      const result = await svc.verifyTwoFactorCode('RECOVERY1');
      expect(result.accessToken).toBeTruthy();

      // Recovery code should be consumed — second use should fail
      await expect(svc.verifyTwoFactorCode('RECOVERY1')).rejects.toThrow('Invalid 2FA code');
    });

    it('throws on invalid code', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456');

      mockTotp.verifyTOTP.mockReturnValue(false);

      await expect(svc.verifyTwoFactorCode('000000')).rejects.toThrow('Invalid 2FA code');
      const err = await svc.verifyTwoFactorCode('000000').catch((e) => e);
      expect(err.statusCode).toBe(401);
    });

    it('throws if 2FA is not enabled', async () => {
      const svc = makeService();
      await expect(svc.verifyTwoFactorCode('123456')).rejects.toThrow('2FA is not enabled');
    });
  });

  describe('disableTwoFactor', () => {
    it('disables 2FA and clears state', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456', ['RC1']);
      expect(svc.isTwoFactorEnabled()).toBe(true);

      await svc.disableTwoFactor();
      expect(svc.isTwoFactorEnabled()).toBe(false);
      expect(mockAuditChain.record).toHaveBeenCalled();
    });
  });

  describe('hydrateTwoFactorState', () => {
    it('loads 2FA state from DB on hydration', async () => {
      mockStorage.loadTwoFactor.mockResolvedValue({ secret: 'DBSECRET', enabled: true });
      mockStorage.loadRecoveryCodes.mockResolvedValue(['hash1', 'hash2']);

      const svc = makeService();
      await svc.hydrateTwoFactorState();

      expect(svc.isTwoFactorEnabled()).toBe(true);
      expect(mockStorage.loadTwoFactor).toHaveBeenCalledWith('admin');
      expect(mockStorage.loadRecoveryCodes).toHaveBeenCalledWith('admin');
    });

    it('remains disabled when DB has no 2FA record', async () => {
      mockStorage.loadTwoFactor.mockResolvedValue(null);
      mockStorage.loadRecoveryCodes.mockResolvedValue([]);

      const svc = makeService();
      await svc.hydrateTwoFactorState();

      expect(svc.isTwoFactorEnabled()).toBe(false);
    });

    it('is non-fatal when DB query fails', async () => {
      mockStorage.loadTwoFactor.mockRejectedValue(new Error('relation does not exist'));

      const svc = makeService();
      await svc.hydrateTwoFactorState(); // should not throw

      expect(svc.isTwoFactorEnabled()).toBe(false);
    });

    it('only hydrates once (idempotent)', async () => {
      mockStorage.loadTwoFactor.mockResolvedValue({ secret: 'S', enabled: true });
      mockStorage.loadRecoveryCodes.mockResolvedValue([]);

      const svc = makeService();
      await svc.hydrateTwoFactorState();
      await svc.hydrateTwoFactorState();

      expect(mockStorage.loadTwoFactor).toHaveBeenCalledTimes(1);
    });
  });

  describe('2FA DB persistence', () => {
    it('persists to DB on enable', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456', ['RC1', 'RC2']);

      expect(mockStorage.saveTwoFactor).toHaveBeenCalledWith('admin', 'JBSWY3DPEHPK3PXP', true);
      expect(mockStorage.saveRecoveryCodes).toHaveBeenCalledWith('admin', expect.any(Array));
    });

    it('marks recovery code used in DB', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456', ['RECOVERY1']);

      mockTotp.verifyTOTP.mockReturnValue(false);
      await svc.verifyTwoFactorCode('RECOVERY1');

      expect(mockStorage.markRecoveryCodeUsed).toHaveBeenCalledWith(
        'admin',
        expect.any(String)
      );
    });

    it('deletes from DB on disable', async () => {
      const svc = makeService();
      await svc.setupTwoFactor();
      await svc.verifyAndEnableTwoFactor('123456');
      await svc.disableTwoFactor();

      expect(mockStorage.deleteTwoFactor).toHaveBeenCalledWith('admin');
    });
  });

  // ── buildPermissionStrings (via validateToken / validateApiKey) ─

  describe('buildPermissionStrings edge case', () => {
    it('returns empty permissions when role not found in RBAC', async () => {
      mockRbac.getRole.mockReturnValue(null);

      const svc = makeService();
      const result = await svc.createUserSession('u1', 'viewer');

      // Validate to extract AuthUser and check permissions
      // getRole returns null -> permissions should be empty
      const user = await svc.validateToken(result.accessToken);
      expect(user.permissions).toEqual([]);
    });
  });

  // ── verifyTokenRaw fallback to previous secret ─────────────────

  describe('token verification with rotated secrets', () => {
    it('falls through to AuthError when both current and previous secrets fail', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      // Rotate twice to lose the original secret
      svc.updateTokenSecret('second-secret-at-least-32chars!!!');
      svc.clearPreviousSecret();
      svc.updateTokenSecret('third-secret-at-least-32chars!!!!');

      await expect(svc.validateToken(login.accessToken)).rejects.toThrow(
        'Invalid or expired token'
      );
    });

    it('succeeds with previous secret during grace period', async () => {
      const svc = makeService();
      const login = await svc.login('correct', '127.0.0.1');

      // Rotate once — previous should still work
      svc.updateTokenSecret('new-secret-at-least-32chars!!!!!!');

      const user = await svc.validateToken(login.accessToken);
      expect(user.userId).toBe('admin');
    });
  });

  // ── Audit error handling ───────────────────────────────────────

  describe('audit error resilience', () => {
    it('swallows audit chain errors without crashing', async () => {
      mockAuditChain.record.mockRejectedValue(new Error('audit DB down'));

      const svc = makeService();
      // login should still succeed even if audit fails
      const result = await svc.login('correct', '127.0.0.1');
      expect(result.accessToken).toBeTruthy();
    });
  });

  // ── AuthError ──────────────────────────────────────────────────

  describe('AuthError', () => {
    it('has correct name, message, and statusCode', () => {
      const err = new AuthError('test message', 403);
      expect(err.name).toBe('AuthError');
      expect(err.message).toBe('test message');
      expect(err.statusCode).toBe(403);
      expect(err).toBeInstanceOf(Error);
    });
  });
});
