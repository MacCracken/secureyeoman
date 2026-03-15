/**
 * Google Calendar Routes — unit tests
 *
 * Tests the Fastify route handlers for Google Calendar API proxy:
 *   GET    /api/v1/integrations/googlecalendar/events
 *   GET    /api/v1/integrations/googlecalendar/events/:eventId
 *   POST   /api/v1/integrations/googlecalendar/events
 *   POST   /api/v1/integrations/googlecalendar/events/quick
 *   PUT    /api/v1/integrations/googlecalendar/events/:eventId
 *   DELETE /api/v1/integrations/googlecalendar/events/:eventId
 *   GET    /api/v1/integrations/googlecalendar/calendars
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGoogleCalendarRoutes } from './googlecalendar-routes.js';
import type { OAuthTokenService } from '../../gateway/oauth-token-service.js';
import type { SoulManager } from '../../soul/manager.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TOKEN_ROW = {
  id: 'tok-1',
  provider: 'google',
  email: 'user@example.com',
  scope: 'calendar',
  scopes: 'https://www.googleapis.com/auth/calendar',
  expiresAt: Date.now() + 3600_000,
  createdAt: Date.now(),
};

function mockOAuthTokenService(opts?: {
  noTokens?: boolean;
  noValidToken?: boolean;
}): OAuthTokenService {
  return {
    listTokens: vi.fn().mockResolvedValue(opts?.noTokens ? [] : [TOKEN_ROW]),
    getValidToken: vi.fn().mockResolvedValue(opts?.noValidToken ? null : 'access-token-abc'),
    forceRefreshById: vi.fn().mockResolvedValue(null),
    storeToken: vi.fn(),
    revokeToken: vi.fn(),
  } as unknown as OAuthTokenService;
}

function _mockSoulManager(): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue({
      id: 'p-1',
      body: {
        integrationAccess: [{ id: 'tok-1', mode: 'auto' }],
      },
    }),
  } as unknown as SoulManager;
}

function mockFetch(body: unknown, status = 200): ReturnType<typeof vi.fn> {
  return vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

async function buildApp(oauthTokenService: OAuthTokenService, soulManager?: SoulManager) {
  const app = Fastify({ logger: false });
  registerGoogleCalendarRoutes(app, { oauthTokenService, soulManager });
  await app.ready();
  return app;
}

const PREFIX = '/api/v1/integrations/googlecalendar';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Google Calendar Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── No valid access token ──────────────────────────────────────────────────

  it('returns 404 when getValidToken returns null', async () => {
    const app = await buildApp(mockOAuthTokenService({ noValidToken: true }));
    const res = await app.inject({ method: 'GET', url: `${PREFIX}/events` });
    expect(res.statusCode).toBe(404);
  });

  // ── GET /events ────────────────────────────────────────────────────────────

  describe(`GET ${PREFIX}/events`, () => {
    it('returns event list on success', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal(
        'fetch',
        mockFetch({ items: [{ id: 'ev-1', summary: 'Standup' }], nextPageToken: null })
      );
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/events` });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(1);
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/events` });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toMatch(/no google account connected/i);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'forbidden' }, 403));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/events` });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── GET /events/:eventId ───────────────────────────────────────────────────

  describe(`GET ${PREFIX}/events/:eventId`, () => {
    it('returns single event on success', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'ev-abc', summary: 'Meeting' }));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/events/ev-abc` });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('ev-abc');
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/events/ev-abc` });
      expect(res.statusCode).toBe(404);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'not found' }, 404));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/events/ev-abc` });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /events ──────────────────────────────────────────────────────────

  describe(`POST ${PREFIX}/events`, () => {
    const createBody = {
      summary: 'Team Sync',
      start: '2026-03-07T10:00:00Z',
      end: '2026-03-07T11:00:00Z',
      description: 'Weekly sync',
      location: 'Room 42',
    };

    it('creates an event and returns 201', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'ev-new', summary: 'Team Sync' }));
      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/events`,
        payload: createBody,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('ev-new');
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/events`,
        payload: createBody,
      });
      expect(res.statusCode).toBe(404);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'bad request' }, 400));
      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/events`,
        payload: createBody,
      });
      expect(res.statusCode).toBe(400);
    });
  });

  // ── POST /events/quick ───────────────────────────────────────────────────

  describe(`POST ${PREFIX}/events/quick`, () => {
    const quickBody = { text: 'Lunch with Alice tomorrow at noon' };

    it('quick-adds an event and returns 201', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'ev-quick', summary: 'Lunch with Alice' }));
      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/events/quick`,
        payload: quickBody,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('ev-quick');
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/events/quick`,
        payload: quickBody,
      });
      expect(res.statusCode).toBe(404);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'server error' }, 500));
      const res = await app.inject({
        method: 'POST',
        url: `${PREFIX}/events/quick`,
        payload: quickBody,
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── PUT /events/:eventId ──────────────────────────────────────────────────

  describe(`PUT ${PREFIX}/events/:eventId`, () => {
    const updateBody = { summary: 'Updated Meeting', start: '2026-03-07T14:00:00Z' };

    it('updates an event and returns 200', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'ev-upd', summary: 'Updated Meeting' }));
      const res = await app.inject({
        method: 'PUT',
        url: `${PREFIX}/events/ev-upd`,
        payload: updateBody,
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().summary).toBe('Updated Meeting');
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({
        method: 'PUT',
        url: `${PREFIX}/events/ev-upd`,
        payload: updateBody,
      });
      expect(res.statusCode).toBe(404);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'forbidden' }, 403));
      const res = await app.inject({
        method: 'PUT',
        url: `${PREFIX}/events/ev-upd`,
        payload: updateBody,
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── DELETE /events/:eventId ───────────────────────────────────────────────

  describe(`DELETE ${PREFIX}/events/:eventId`, () => {
    it('deletes an event and returns 204', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch(null, 204));
      const res = await app.inject({
        method: 'DELETE',
        url: `${PREFIX}/events/ev-del`,
      });
      expect(res.statusCode).toBe(204);
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({
        method: 'DELETE',
        url: `${PREFIX}/events/ev-del`,
      });
      expect(res.statusCode).toBe(404);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'not found' }, 404));
      const res = await app.inject({
        method: 'DELETE',
        url: `${PREFIX}/events/ev-del`,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── GET /calendars ────────────────────────────────────────────────────────

  describe(`GET ${PREFIX}/calendars`, () => {
    it('returns calendar list on success', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal(
        'fetch',
        mockFetch({
          items: [
            { id: 'primary', summary: 'Main Calendar' },
            { id: 'work', summary: 'Work' },
          ],
        })
      );
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/calendars` });
      expect(res.statusCode).toBe(200);
      expect(res.json().items).toHaveLength(2);
    });

    it('returns 404 when no OAuth token is configured', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/calendars` });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toMatch(/no google account connected/i);
    });

    it('forwards upstream API error status', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'unauthorized' }, 401));
      const res = await app.inject({ method: 'GET', url: `${PREFIX}/calendars` });
      expect(res.statusCode).toBe(401);
    });
  });
});
