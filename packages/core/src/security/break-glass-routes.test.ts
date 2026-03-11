/**
 * Route handler tests for break-glass endpoints.
 * Uses Fastify inject() — no real DB, manager is mocked.
 */

import { describe, it, expect, vi, beforeAll, afterAll, beforeEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerBreakGlassRoutes } from './break-glass-routes.js';
import { BreakGlassError } from './break-glass.js';
import type { BreakGlassManager } from './break-glass.js';

// ── Mock manager factory ─────────────────────────────────────────────

function makeMockManager(): BreakGlassManager {
  return {
    generateRecoveryKey: vi.fn(),
    hasRecoveryKey: vi.fn(),
    activateBreakGlass: vi.fn(),
    listSessions: vi.fn(),
    revokeSession: vi.fn(),
  } as unknown as BreakGlassManager;
}

// ── Sample data ──────────────────────────────────────────────────────

const SAMPLE_SESSION = {
  id: 'sess-1',
  recoveryKeyId: 'key-1',
  createdAt: 1000,
  expiresAt: 9999999999000,
  ipAddress: '127.0.0.1',
  revokedAt: null,
  isActive: true,
};

const SAMPLE_ACTIVATE_RESULT = {
  token: 'eyJhbGciOiJIUzI1NiJ9.test.test',
  expiresAt: Date.now() + 3600000,
  sessionId: 'sess-new-1',
};

// ── Tests ─────────────────────────────────────────────────────────────

describe('BreakGlassRoutes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof makeMockManager>;

  beforeAll(async () => {
    app = Fastify();
    mgr = makeMockManager();
    registerBreakGlassRoutes(app, { breakGlassManager: mgr });
    await app.ready();
  });

  afterAll(async () => {
    await app.close();
  });

  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── POST /api/v1/auth/break-glass ────────────────────────────────

  describe('POST /api/v1/auth/break-glass', () => {
    it('activates session and returns 200 with token', async () => {
      (mgr.activateBreakGlass as ReturnType<typeof vi.fn>).mockResolvedValue(
        SAMPLE_ACTIVATE_RESULT
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/break-glass',
        payload: { recoveryKey: 'a'.repeat(64) },
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({
        token: SAMPLE_ACTIVATE_RESULT.token,
        sessionId: SAMPLE_ACTIVATE_RESULT.sessionId,
        tokenType: 'Bearer',
      });
    });

    it('returns 400 when recoveryKey is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/break-glass',
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(mgr.activateBreakGlass).not.toHaveBeenCalled();
    });

    it('returns 401 on BreakGlassError with 401', async () => {
      (mgr.activateBreakGlass as ReturnType<typeof vi.fn>).mockRejectedValue(
        new BreakGlassError('Invalid recovery key', 401)
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/break-glass',
        payload: { recoveryKey: 'wrong-key' },
      });

      expect(res.statusCode).toBe(401);
      const body = res.json();
      expect(body.message).toBe('Invalid recovery key');
    });

    it('returns 500 on unexpected errors', async () => {
      (mgr.activateBreakGlass as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('DB connection failed')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/auth/break-glass',
        payload: { recoveryKey: 'a'.repeat(64) },
      });

      expect(res.statusCode).toBe(500);
    });

    it('returns 429 after rate limit is exceeded', async () => {
      // Create a fresh app so the rate limit state is isolated
      const freshApp = Fastify();
      const freshMgr = makeMockManager();
      (freshMgr.activateBreakGlass as ReturnType<typeof vi.fn>).mockResolvedValue(
        SAMPLE_ACTIVATE_RESULT
      );
      registerBreakGlassRoutes(freshApp, { breakGlassManager: freshMgr });
      await freshApp.ready();

      try {
        // Use the same x-forwarded-for IP for all requests
        const HEADERS = { 'x-forwarded-for': '192.168.0.1' };

        // First 5 requests should succeed (rate limit is 5)
        for (let i = 0; i < 5; i++) {
          const res = await freshApp.inject({
            method: 'POST',
            url: '/api/v1/auth/break-glass',
            headers: HEADERS,
            payload: { recoveryKey: 'a'.repeat(64) },
          });
          expect(res.statusCode).toBe(200);
        }

        // 6th request should be rate-limited
        const limited = await freshApp.inject({
          method: 'POST',
          url: '/api/v1/auth/break-glass',
          headers: HEADERS,
          payload: { recoveryKey: 'a'.repeat(64) },
        });
        expect(limited.statusCode).toBe(429);
      } finally {
        await freshApp.close();
      }
    });
  });

  // ── GET /api/v1/admin/break-glass/sessions ────────────────────────

  describe('GET /api/v1/admin/break-glass/sessions', () => {
    it('returns sessions list', async () => {
      (mgr.listSessions as ReturnType<typeof vi.fn>).mockResolvedValue([SAMPLE_SESSION]);

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/break-glass/sessions',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.sessions).toHaveLength(1);
      expect(body.sessions[0]).toMatchObject({ id: 'sess-1', isActive: true });
    });

    it('returns 500 on storage error', async () => {
      (mgr.listSessions as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('storage failure')
      );

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/admin/break-glass/sessions',
      });

      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /api/v1/admin/break-glass/revoke/:id ─────────────────────

  describe('POST /api/v1/admin/break-glass/revoke/:id', () => {
    it('revokes session and returns 200', async () => {
      (mgr.revokeSession as ReturnType<typeof vi.fn>).mockResolvedValue(true);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/break-glass/revoke/sess-1',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body).toMatchObject({ revoked: true, sessionId: 'sess-1' });
    });

    it('returns 404 when session not found', async () => {
      (mgr.revokeSession as ReturnType<typeof vi.fn>).mockResolvedValue(false);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/break-glass/revoke/nonexistent',
      });

      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.message).toContain('not found');
    });
  });

  // ── POST /api/v1/admin/break-glass/rotate ────────────────────────

  describe('POST /api/v1/admin/break-glass/rotate', () => {
    it('returns 201 with the new raw recovery key', async () => {
      const RAW_KEY = 'b'.repeat(64);
      (mgr.generateRecoveryKey as ReturnType<typeof vi.fn>).mockResolvedValue(RAW_KEY);

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/break-glass/rotate',
      });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.recoveryKey).toBe(RAW_KEY);
      expect(body.message).toBeDefined();
    });

    it('returns 500 on storage error', async () => {
      (mgr.generateRecoveryKey as ReturnType<typeof vi.fn>).mockRejectedValue(
        new Error('storage error')
      );

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/admin/break-glass/rotate',
      });

      expect(res.statusCode).toBe(500);
    });
  });
});
