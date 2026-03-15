import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import { registerCaptureConsentRoutes } from './capture-consent-routes.js';

const FAKE_CONSENT = {
  id: 'consent-001',
  userId: 'user-1',
  requestedBy: 'anonymous',
  sessionId: 'session-123',
  requestedAt: Date.now(),
  expiresAt: Date.now() + 60_000,
  scope: { resource: 'screen' as const, duration: 60, purpose: 'debugging' },
  status: 'pending' as const,
};

function makeMockManager() {
  return {
    requestConsent: vi.fn().mockResolvedValue(FAKE_CONSENT),
    getPendingConsents: vi.fn().mockResolvedValue([FAKE_CONSENT]),
    getConsent: vi.fn().mockResolvedValue(FAKE_CONSENT),
    grantConsent: vi
      .fn()
      .mockResolvedValue({ success: true, consent: { ...FAKE_CONSENT, status: 'granted' } }),
    denyConsent: vi
      .fn()
      .mockResolvedValue({ success: true, consent: { ...FAKE_CONSENT, status: 'denied' } }),
    revokeConsent: vi
      .fn()
      .mockResolvedValue({ success: true, consent: { ...FAKE_CONSENT, status: 'revoked' } }),
  };
}

function buildApp(manager: ReturnType<typeof makeMockManager> | null = makeMockManager()) {
  const app = Fastify({ logger: false });
  registerCaptureConsentRoutes(app, {
    getConsentManager: () => manager as any,
  });
  return { app, manager };
}

describe('capture-consent-routes', () => {
  // ── 503 when manager not available ──────────────────────────────────────────

  describe('manager unavailable (503)', () => {
    it('POST /request returns 503 when manager not available', async () => {
      const { app } = buildApp(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: { scope: { resource: 'screen', duration: 60, purpose: 'test' } },
      });
      expect(res.statusCode).toBe(503);
      expect(res.json().message).toBe('Consent manager not available');
    });

    it('GET /pending returns 503 when manager not available', async () => {
      const { app } = buildApp(null);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/capture/consent/pending',
      });
      expect(res.statusCode).toBe(503);
    });

    it('GET /:id returns 503 when manager not available', async () => {
      const { app } = buildApp(null);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/capture/consent/consent-001',
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /:id/grant returns 503 when manager not available', async () => {
      const { app } = buildApp(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/grant',
        payload: {},
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /:id/deny returns 503 when manager not available', async () => {
      const { app } = buildApp(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/deny',
        payload: {},
      });
      expect(res.statusCode).toBe(503);
    });

    it('POST /:id/revoke returns 503 when manager not available', async () => {
      const { app } = buildApp(null);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/revoke',
        payload: {},
      });
      expect(res.statusCode).toBe(503);
    });
  });

  // ── POST /request ───────────────────────────────────────────────────────────

  describe('POST /api/v1/capture/consent/request', () => {
    it('creates consent successfully', async () => {
      const { app, manager } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: { scope: { resource: 'screen', duration: 120, purpose: 'demo recording' } },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('consent-001');
      expect(manager!.requestConsent).toHaveBeenCalledWith(
        'anonymous', // userId (falls through to authUser default)
        'anonymous', // requestedBy (authUser)
        { resource: 'screen', duration: 120, quality: 'medium', purpose: 'demo recording' },
        expect.stringContaining('session-'),
        undefined // timeoutMs
      );
    });

    it('returns 400 when scope missing', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('scope.resource and scope.purpose are required');
    });

    it('returns 400 when scope.resource is missing', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: { scope: { purpose: 'test' } },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('scope.resource and scope.purpose are required');
    });

    it('returns 400 when scope.purpose is missing', async () => {
      const { app } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: { scope: { resource: 'screen' } },
      });
      expect(res.statusCode).toBe(400);
    });

    it('passes timeoutMs to manager when provided', async () => {
      const { app, manager } = buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: {
          scope: { resource: 'screen', duration: 60, purpose: 'test' },
          timeoutMs: 30000,
        },
      });
      expect(manager!.requestConsent).toHaveBeenCalledWith(
        'anonymous',
        'anonymous',
        expect.objectContaining({ resource: 'screen' }),
        expect.any(String),
        30000
      );
    });

    it('defaults scope.duration to 60 when not provided', async () => {
      const { app, manager } = buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/request',
        payload: { scope: { resource: 'screen', purpose: 'test' } },
      });
      expect(manager!.requestConsent).toHaveBeenCalledWith(
        'anonymous',
        'anonymous',
        { resource: 'screen', duration: 60, quality: 'medium', purpose: 'test' },
        expect.any(String),
        undefined
      );
    });
  });

  // ── GET /pending ────────────────────────────────────────────────────────────

  describe('GET /api/v1/capture/consent/pending', () => {
    it('returns pending consents list', async () => {
      const { app, manager } = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/capture/consent/pending',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().consents).toHaveLength(1);
      expect(res.json().consents[0].id).toBe('consent-001');
      expect(manager!.getPendingConsents).toHaveBeenCalledWith('anonymous');
    });
  });

  // ── GET /:id ────────────────────────────────────────────────────────────────

  describe('GET /api/v1/capture/consent/:id', () => {
    it('returns consent by id', async () => {
      const { app, manager } = buildApp();
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/capture/consent/consent-001',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('consent-001');
      expect(manager!.getConsent).toHaveBeenCalledWith('consent-001');
    });

    it('returns 404 when consent not found', async () => {
      const manager = makeMockManager();
      manager.getConsent.mockResolvedValue(null);
      const { app } = buildApp(manager);
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/capture/consent/nonexistent',
      });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Consent not found');
    });
  });

  // ── POST /:id/grant ────────────────────────────────────────────────────────

  describe('POST /api/v1/capture/consent/:id/grant', () => {
    it('grants consent successfully', async () => {
      const { app, manager } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/grant',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('granted');
      expect(manager!.grantConsent).toHaveBeenCalledWith('consent-001', 'anonymous');
    });

    it('returns 400 when grant fails', async () => {
      const manager = makeMockManager();
      manager.grantConsent.mockResolvedValue({ success: false, error: 'Consent request expired' });
      const { app } = buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/grant',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Consent request expired');
    });

    it('returns 400 with default message when grant fails without error', async () => {
      const manager = makeMockManager();
      manager.grantConsent.mockResolvedValue({ success: false });
      const { app } = buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/grant',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Grant failed');
    });
  });

  // ── POST /:id/deny ─────────────────────────────────────────────────────────

  describe('POST /api/v1/capture/consent/:id/deny', () => {
    it('denies consent successfully', async () => {
      const { app, manager } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/deny',
        payload: { reason: 'Not authorized' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('denied');
      expect(manager!.denyConsent).toHaveBeenCalledWith(
        'consent-001',
        'anonymous',
        'Not authorized'
      );
    });

    it('uses default reason when not provided', async () => {
      const { app, manager } = buildApp();
      await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/deny',
        payload: {},
      });
      expect(manager!.denyConsent).toHaveBeenCalledWith('consent-001', 'anonymous', 'User denied');
    });

    it('returns 400 when deny fails', async () => {
      const manager = makeMockManager();
      manager.denyConsent.mockResolvedValue({
        success: false,
        error: 'Consent is granted, not pending',
      });
      const { app } = buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/deny',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Consent is granted, not pending');
    });
  });

  // ── POST /:id/revoke ───────────────────────────────────────────────────────

  describe('POST /api/v1/capture/consent/:id/revoke', () => {
    it('revokes consent successfully', async () => {
      const { app, manager } = buildApp();
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/revoke',
        payload: {},
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().status).toBe('revoked');
      expect(manager!.revokeConsent).toHaveBeenCalledWith('consent-001', 'anonymous');
    });

    it('returns 400 when revoke fails', async () => {
      const manager = makeMockManager();
      manager.revokeConsent.mockResolvedValue({
        success: false,
        error: 'Revocation is not allowed',
      });
      const { app } = buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/revoke',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Revocation is not allowed');
    });

    it('returns 400 with default message when revoke fails without error', async () => {
      const manager = makeMockManager();
      manager.revokeConsent.mockResolvedValue({ success: false });
      const { app } = buildApp(manager);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/capture/consent/consent-001/revoke',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Revoke failed');
    });
  });
});
