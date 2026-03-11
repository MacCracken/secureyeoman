/**
 * Unit tests for BreakGlassManager — fully mocked, no DB required.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ── Hoisted mocks ────────────────────────────────────────────────────

const mockStorage = vi.hoisted(() => ({
  storeKeyHash: vi.fn(),
  getKeyHash: vi.fn(),
  rotateKey: vi.fn(),
  createSession: vi.fn(),
  getSession: vi.fn(),
  listSessions: vi.fn(),
  revokeSession: vi.fn(),
}));

const mockAuditChain = vi.hoisted(() => ({
  record: vi.fn().mockResolvedValue({}),
}));

// ── Crypto mocks ─────────────────────────────────────────────────────
// We mock node:crypto randomBytes so we can predict the raw key.

const MOCK_RAW_HEX = 'a'.repeat(64); // 64 hex chars = 32 bytes
const MOCK_HASH = 'sha256_of_raw_key';

vi.mock('node:crypto', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:crypto')>();
  return {
    ...actual,
    randomBytes: vi.fn((_n: number) => Buffer.from(MOCK_RAW_HEX, 'hex')),
  };
});

vi.mock('../utils/crypto.js', () => ({
  sha256: vi.fn((s: string) => `sha256_${s}`),
  secureCompare: vi.fn((a: string, b: string) => a === b),
  uuidv7: vi.fn(() => 'test-uuid-1234'),
}));

// ── Imports ──────────────────────────────────────────────────────────

import { BreakGlassManager, BreakGlassError } from './break-glass.js';
import type { BreakGlassConfig, BreakGlassManagerDeps } from './break-glass.js';
import type { SecureLogger } from '../logging/logger.js';

// ── Helpers ──────────────────────────────────────────────────────────

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

const CONFIG: BreakGlassConfig = {
  tokenSecret: 'test-token-secret-at-least-32chars!!',
  jwtIssuer: 'secureyeoman',
  jwtAudience: 'secureyeoman-api',
};

function makeDeps(): BreakGlassManagerDeps {
  return {
    storage: mockStorage as unknown as BreakGlassManagerDeps['storage'],
    auditChain: mockAuditChain as unknown as BreakGlassManagerDeps['auditChain'],
    logger: noopLogger(),
  };
}

function makeManager(): BreakGlassManager {
  return new BreakGlassManager(CONFIG, makeDeps());
}

// ── Tests ─────────────────────────────────────────────────────────────

describe('BreakGlassManager', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAuditChain.record.mockResolvedValue({});
  });

  // ── generateRecoveryKey ─────────────────────────────────────────

  describe('generateRecoveryKey()', () => {
    it('returns the raw hex key', async () => {
      mockStorage.getKeyHash.mockResolvedValue(null);
      mockStorage.storeKeyHash.mockResolvedValue(undefined);

      const mgr = makeManager();
      const key = await mgr.generateRecoveryKey();

      expect(key).toBe(MOCK_RAW_HEX);
    });

    it('stores the SHA-256 hash (not the raw key)', async () => {
      mockStorage.getKeyHash.mockResolvedValue(null);
      mockStorage.storeKeyHash.mockResolvedValue(undefined);

      const mgr = makeManager();
      await mgr.generateRecoveryKey();

      expect(mockStorage.storeKeyHash).toHaveBeenCalledWith(
        'test-uuid-1234',
        expect.stringContaining('sha256_')
      );
      // Verify the raw key was NOT passed to storeKeyHash
      const [, storedHash] = mockStorage.storeKeyHash.mock.calls[0];
      expect(storedHash).not.toBe(MOCK_RAW_HEX);
    });

    it('rotates an existing active key before creating a new one', async () => {
      const existingRow = {
        id: 'old-key-id',
        key_hash: 'old_hash',
        created_at: 1000,
        rotated_at: null,
      };
      mockStorage.getKeyHash.mockResolvedValue(existingRow);
      mockStorage.rotateKey.mockResolvedValue(undefined);
      mockStorage.storeKeyHash.mockResolvedValue(undefined);

      const mgr = makeManager();
      await mgr.generateRecoveryKey();

      expect(mockStorage.rotateKey).toHaveBeenCalledWith('old-key-id', expect.any(Number));
      expect(mockStorage.storeKeyHash).toHaveBeenCalled();
    });

    it('records audit event', async () => {
      mockStorage.getKeyHash.mockResolvedValue(null);
      mockStorage.storeKeyHash.mockResolvedValue(undefined);

      const mgr = makeManager();
      await mgr.generateRecoveryKey();

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'break_glass_key_generated' })
      );
    });
  });

  // ── hasRecoveryKey ──────────────────────────────────────────────

  describe('hasRecoveryKey()', () => {
    it('returns true when a key row exists', async () => {
      mockStorage.getKeyHash.mockResolvedValue({ id: 'k1', key_hash: 'h', created_at: 1 });
      const mgr = makeManager();
      expect(await mgr.hasRecoveryKey()).toBe(true);
    });

    it('returns false when no key exists', async () => {
      mockStorage.getKeyHash.mockResolvedValue(null);
      const mgr = makeManager();
      expect(await mgr.hasRecoveryKey()).toBe(false);
    });
  });

  // ── activateBreakGlass ──────────────────────────────────────────

  describe('activateBreakGlass()', () => {
    const STORED_HASH = `sha256_${MOCK_RAW_HEX}`;
    const KEY_ROW = {
      id: 'key-id-abc',
      key_hash: STORED_HASH,
      created_at: 1000,
      rotated_at: null,
    };

    it('throws 401 when no key has been configured', async () => {
      mockStorage.getKeyHash.mockResolvedValue(null);
      const mgr = makeManager();

      await expect(mgr.activateBreakGlass('whatever', '127.0.0.1')).rejects.toMatchObject({
        statusCode: 401,
        name: 'BreakGlassError',
      });
    });

    it('throws 401 on wrong key (constant-time reject)', async () => {
      mockStorage.getKeyHash.mockResolvedValue(KEY_ROW);
      // secureCompare mock: only returns true when a === b
      // sha256('wrong-key') = 'sha256_wrong-key' which != STORED_HASH
      const mgr = makeManager();

      await expect(mgr.activateBreakGlass('wrong-key', '1.2.3.4')).rejects.toMatchObject({
        statusCode: 401,
        name: 'BreakGlassError',
      });
    });

    it('creates session and returns JWT on correct key', async () => {
      mockStorage.getKeyHash.mockResolvedValue(KEY_ROW);
      mockStorage.createSession.mockResolvedValue(undefined);

      const mgr = makeManager();
      const result = await mgr.activateBreakGlass(MOCK_RAW_HEX, '10.0.0.1');

      expect(result).toMatchObject({
        sessionId: 'test-uuid-1234',
        expiresAt: expect.any(Number),
        token: expect.any(String),
      });

      expect(mockStorage.createSession).toHaveBeenCalledWith(
        expect.objectContaining({
          id: 'test-uuid-1234',
          recovery_key_id: 'key-id-abc',
          ip_address: '10.0.0.1',
          revoked_at: null,
        })
      );
    });

    it('records audit event on successful activation', async () => {
      mockStorage.getKeyHash.mockResolvedValue(KEY_ROW);
      mockStorage.createSession.mockResolvedValue(undefined);

      const mgr = makeManager();
      await mgr.activateBreakGlass(MOCK_RAW_HEX, '10.0.0.1');

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'break_glass_activated' })
      );
    });

    it('records failed audit event on wrong key', async () => {
      mockStorage.getKeyHash.mockResolvedValue(KEY_ROW);

      const mgr = makeManager();
      try {
        await mgr.activateBreakGlass('wrong-key', '9.9.9.9');
      } catch {
        // expected
      }

      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'break_glass_activation_failed' })
      );
    });

    it('expiresAt is approximately 1 hour from now', async () => {
      mockStorage.getKeyHash.mockResolvedValue(KEY_ROW);
      mockStorage.createSession.mockResolvedValue(undefined);

      const before = Date.now();
      const mgr = makeManager();
      const result = await mgr.activateBreakGlass(MOCK_RAW_HEX, '10.0.0.1');
      const after = Date.now();

      const expectedExpiry = before + 60 * 60 * 1000;
      expect(result.expiresAt).toBeGreaterThanOrEqual(expectedExpiry - 100);
      expect(result.expiresAt).toBeLessThanOrEqual(after + 60 * 60 * 1000 + 100);
    });
  });

  // ── listSessions ─────────────────────────────────────────────────

  describe('listSessions()', () => {
    it('returns sessions with computed isActive flag', async () => {
      const now = Date.now();
      mockStorage.listSessions.mockResolvedValue([
        {
          id: 's1',
          recovery_key_id: 'k1',
          created_at: now - 1000,
          expires_at: now + 3600000,
          ip_address: '1.2.3.4',
          revoked_at: null,
        },
        {
          id: 's2',
          recovery_key_id: 'k1',
          created_at: now - 7200000,
          expires_at: now - 3600000,
          ip_address: '5.6.7.8',
          revoked_at: null,
        },
        {
          id: 's3',
          recovery_key_id: 'k1',
          created_at: now - 500,
          expires_at: now + 3600000,
          ip_address: null,
          revoked_at: now - 100,
        },
      ]);

      const mgr = makeManager();
      const sessions = await mgr.listSessions();

      expect(sessions).toHaveLength(3);
      expect(sessions[0]!.isActive).toBe(true); // not expired, not revoked
      expect(sessions[1]!.isActive).toBe(false); // expired
      expect(sessions[2]!.isActive).toBe(false); // revoked
    });
  });

  // ── revokeSession ─────────────────────────────────────────────────

  describe('revokeSession()', () => {
    it('returns true on successful revocation', async () => {
      mockStorage.revokeSession.mockResolvedValue(true);

      const mgr = makeManager();
      const ok = await mgr.revokeSession('session-id');

      expect(ok).toBe(true);
      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'break_glass_session_revoked' })
      );
    });

    it('returns false when session not found or already revoked', async () => {
      mockStorage.revokeSession.mockResolvedValue(false);

      const mgr = makeManager();
      const ok = await mgr.revokeSession('nonexistent');

      expect(ok).toBe(false);
      expect(mockAuditChain.record).not.toHaveBeenCalled();
    });
  });

  // ── BreakGlassError ──────────────────────────────────────────────

  describe('BreakGlassError', () => {
    it('is an Error with a statusCode', () => {
      const err = new BreakGlassError('test', 401);
      expect(err).toBeInstanceOf(Error);
      expect(err.message).toBe('test');
      expect(err.statusCode).toBe(401);
      expect(err.name).toBe('BreakGlassError');
    });
  });
});
