/**
 * Gmail Routes — unit tests
 *
 * Tests the Fastify route handlers for Gmail API proxy:
 *   GET  /api/v1/gmail/profile
 *   GET  /api/v1/gmail/messages
 *   GET  /api/v1/gmail/messages/:messageId
 *   GET  /api/v1/gmail/threads/:threadId
 *   POST /api/v1/gmail/drafts
 *   POST /api/v1/gmail/messages/send
 *   GET  /api/v1/gmail/labels
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGmailRoutes } from './gmail-routes.js';
import type { OAuthTokenService } from '../../gateway/oauth-token-service.js';
import type { SoulManager } from '../../soul/manager.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TOKEN_ROW = {
  id: 'tok-1',
  provider: 'google',
  email: 'user@example.com',
  scope: 'gmail',
  expiresAt: Date.now() + 3600_000,
  createdAt: Date.now(),
};

function mockOAuthTokenService(opts?: {
  noTokens?: boolean;
  noValidToken?: boolean;
}): OAuthTokenService {
  return {
    listTokens: vi
      .fn()
      .mockResolvedValue(opts?.noTokens ? [] : [TOKEN_ROW]),
    getValidToken: vi
      .fn()
      .mockResolvedValue(opts?.noValidToken ? null : 'access-token-abc'),
    forceRefreshById: vi.fn().mockResolvedValue(null), // returns null → no retry
    storeToken: vi.fn(),
    revokeToken: vi.fn(),
  } as unknown as OAuthTokenService;
}

function mockSoulManager(mode = 'auto'): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue({
      id: 'p-1',
      body: {
        integrationAccess: [{ id: 'tok-1', mode }],
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

async function buildApp(
  oauthTokenService: OAuthTokenService,
  soulManager?: SoulManager
) {
  const app = Fastify({ logger: false });
  registerGmailRoutes(app, { oauthTokenService, soulManager });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Gmail Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── /api/v1/gmail/profile ─────────────────────────────────────────────────

  describe('GET /api/v1/gmail/profile', () => {
    it('returns 404 when no Gmail token is connected', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toMatch(/no gmail account connected/i);
    });

    it('returns 404 when getValidToken returns null', async () => {
      const app = await buildApp(mockOAuthTokenService({ noValidToken: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      expect(res.statusCode).toBe(404);
    });

    it('returns profile data on success', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal(
        'fetch',
        mockFetch({ emailAddress: 'user@example.com', messagesTotal: 42 })
      );
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.emailAddress).toBe('user@example.com');
      expect(body.email).toBe('user@example.com');
      expect(body.mode).toBe('auto');
    });

    it('returns Gmail API error status on upstream failure', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'unauthorized' }, 401));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      expect(res.statusCode).toBe(401);
    });

    it('returns actionable reconnect message on 401 token expiry', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'Invalid credentials' }, 401));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toMatch(/reconnect your gmail account/i);
    });

    it('skips retry when forceRefreshById returns same stale token', async () => {
      const svc = {
        ...mockOAuthTokenService(),
        forceRefreshById: vi.fn().mockResolvedValue('access-token-abc'), // same as getValidToken
      } as unknown as OAuthTokenService;
      (svc.listTokens as ReturnType<typeof vi.fn>).mockResolvedValue([TOKEN_ROW]);
      (svc.getValidToken as ReturnType<typeof vi.fn>).mockResolvedValue('access-token-abc');
      const app = await buildApp(svc);
      const fetchMock = mockFetch({ error: 'Invalid credentials' }, 401);
      vi.stubGlobal('fetch', fetchMock);
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      // Only one upstream call made (no retry with same stale token)
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(401);
    });

    it('uses mode from active personality integrationAccess', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ emailAddress: 'user@example.com' }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/profile' });
      expect(res.json().mode).toBe('suggest');
    });
  });

  // ── /api/v1/gmail/messages ────────────────────────────────────────────────

  describe('GET /api/v1/gmail/messages', () => {
    it('returns message list', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ messages: [{ id: 'msg-1' }], resultSizeEstimate: 1 }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/messages' });
      expect(res.statusCode).toBe(200);
      expect(res.json().messages).toHaveLength(1);
    });

    it('forwards query params (q, maxResults, pageToken, labelIds)', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      const fetchMock = mockFetch({ messages: [] });
      vi.stubGlobal('fetch', fetchMock);
      await app.inject({
        method: 'GET',
        url: '/api/v1/gmail/messages?q=is%3Aunread&maxResults=10',
      });
      const calledUrl: string = fetchMock.mock.calls[0][0];
      expect(calledUrl).toContain('q=is%3Aunread');
      expect(calledUrl).toContain('maxResults=10');
    });

    it('returns 404 when no token', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/messages' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── /api/v1/gmail/messages/:messageId ─────────────────────────────────────

  describe('GET /api/v1/gmail/messages/:messageId', () => {
    it('returns single message', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'msg-abc', snippet: 'Hello' }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/gmail/messages/msg-abc',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('msg-abc');
    });
  });

  // ── /api/v1/gmail/threads/:threadId ──────────────────────────────────────

  describe('GET /api/v1/gmail/threads/:threadId', () => {
    it('returns thread', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'thread-1', messages: [] }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/gmail/threads/thread-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().id).toBe('thread-1');
    });
  });

  // ── /api/v1/gmail/drafts ──────────────────────────────────────────────────

  describe('POST /api/v1/gmail/drafts', () => {
    const draftBody = {
      to: 'recipient@example.com',
      subject: 'Hello',
      body: 'World',
    };

    it('creates a draft in auto mode', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'draft-1' }, 200));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/drafts',
        payload: draftBody,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().id).toBe('draft-1');
    });

    it('creates a draft in draft mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('draft');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ id: 'draft-2' }, 200));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/drafts',
        payload: draftBody,
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 403 in suggest mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/drafts',
        payload: draftBody,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/suggest/i);
    });

    it('returns 404 when no token', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/drafts',
        payload: draftBody,
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns actionable reconnect message when Google returns 401 for draft', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ error: 'Invalid credentials' }, 401));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/drafts',
        payload: draftBody,
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toMatch(/reconnect your gmail account/i);
    });
  });

  // ── /api/v1/gmail/messages/send ──────────────────────────────────────────

  describe('POST /api/v1/gmail/send', () => {
    const sendBody = {
      to: 'recipient@example.com',
      subject: 'Test',
      body: 'Hello',
    };

    it('sends an email in auto mode', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 'sent-1' }, 200));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/send',
        payload: sendBody,
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 403 in suggest mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/send',
        payload: sendBody,
      });
      expect(res.statusCode).toBe(403);
    });

    it('returns 403 in draft mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('draft');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/gmail/send',
        payload: sendBody,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/draft/i);
    });
  });

  // ── /api/v1/gmail/labels ─────────────────────────────────────────────────

  describe('GET /api/v1/gmail/labels', () => {
    it('returns label list', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ labels: [{ id: 'INBOX', name: 'INBOX' }] }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/labels' });
      expect(res.statusCode).toBe(200);
      expect(res.json().labels).toHaveLength(1);
    });

    it('returns 404 when no token', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/gmail/labels' });
      expect(res.statusCode).toBe(404);
    });
  });
});
