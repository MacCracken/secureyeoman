/**
 * GitHub API Routes — unit tests
 *
 * Tests the Fastify route handlers for GitHub API proxy:
 *   GET  /api/v1/github/profile
 *   GET  /api/v1/github/repos
 *   GET  /api/v1/github/repos/:owner/:repo
 *   GET  /api/v1/github/repos/:owner/:repo/pulls
 *   GET  /api/v1/github/repos/:owner/:repo/pulls/:number
 *   GET  /api/v1/github/repos/:owner/:repo/issues
 *   GET  /api/v1/github/repos/:owner/:repo/issues/:number
 *   POST /api/v1/github/repos/:owner/:repo/issues
 *   POST /api/v1/github/repos/:owner/:repo/pulls
 *   POST /api/v1/github/repos/:owner/:repo/issues/:number/comments
 *   POST /api/v1/github/repos/:owner/:repo/sync-fork
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerGithubApiRoutes } from './github-api-routes.js';
import type { OAuthTokenService } from '../../gateway/oauth-token-service.js';
import type { SoulManager } from '../../soul/manager.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const TOKEN_ROW = {
  id: 'gh-tok-1',
  provider: 'github',
  email: 'user@example.com',
  scope: 'repo',
  scopes: 'read:user user:email repo public_repo',
  expiresAt: null, // GitHub tokens don't expire by default
  createdAt: Date.now(),
};

function mockOAuthTokenService(opts?: {
  noTokens?: boolean;
  noValidToken?: boolean;
}): OAuthTokenService {
  return {
    listTokens: vi.fn().mockResolvedValue(opts?.noTokens ? [] : [TOKEN_ROW]),
    getValidToken: vi.fn().mockResolvedValue(opts?.noValidToken ? null : 'gh-access-token'),
    forceRefreshById: vi.fn().mockResolvedValue(null),
    storeToken: vi.fn(),
    revokeToken: vi.fn(),
  } as unknown as OAuthTokenService;
}

function mockSoulManager(mode = 'auto'): SoulManager {
  return {
    getActivePersonality: vi.fn().mockResolvedValue({
      id: 'p-1',
      body: {
        integrationAccess: [{ id: 'gh-tok-1', mode }],
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
  registerGithubApiRoutes(app, { oauthTokenService, soulManager });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('GitHub API Routes', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  // ── /api/v1/github/profile ──────────────────────────────────────────────────

  describe('GET /api/v1/github/profile', () => {
    it('returns 404 when no GitHub token is connected', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/profile' });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toMatch(/no github account connected/i);
    });

    it('returns 404 when getValidToken returns null', async () => {
      const app = await buildApp(mockOAuthTokenService({ noValidToken: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/profile' });
      expect(res.statusCode).toBe(404);
    });

    it('returns profile data with mode and scopes on success', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ login: 'octocat', id: 1 }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/profile' });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.login).toBe('octocat');
      expect(body.email).toBe('user@example.com');
      expect(body.mode).toBe('suggest'); // default mode
      expect(body).toHaveProperty('scopes');
    });

    it('returns actionable reconnect message on 401', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ message: 'Bad credentials' }, 401));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/profile' });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toMatch(/reconnect your github account/i);
    });

    it('uses mode from active personality integrationAccess', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ login: 'octocat' }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/profile' });
      expect(res.json().mode).toBe('auto');
    });
  });

  // ── /api/v1/github/repos ───────────────────────────────────────────────────

  describe('GET /api/v1/github/repos', () => {
    it('returns repository list', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch([{ id: 1, full_name: 'octocat/hello-world' }]));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/repos' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toHaveLength(1);
    });

    it('returns 404 when no token', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/repos' });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── /api/v1/github/repos/:owner/:repo ─────────────────────────────────────

  describe('GET /api/v1/github/repos/:owner/:repo', () => {
    it('returns repo details', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch({ id: 1, name: 'hello-world' }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/github/repos/octocat/hello-world',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json().name).toBe('hello-world');
    });
  });

  // ── /api/v1/github/repos/:owner/:repo/issues ──────────────────────────────

  describe('GET /api/v1/github/repos/:owner/:repo/issues', () => {
    it('returns issues list', async () => {
      const svc = mockOAuthTokenService();
      const app = await buildApp(svc);
      vi.stubGlobal('fetch', mockFetch([{ number: 1, title: 'Bug report' }]));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/github/repos/octocat/hello-world/issues',
      });
      expect(res.statusCode).toBe(200);
    });
  });

  // ── POST /api/v1/github/repos/:owner/:repo/issues ─────────────────────────

  describe('POST /api/v1/github/repos/:owner/:repo/issues', () => {
    const issueBody = { title: 'New bug', body: 'Description' };

    it('creates issue in auto mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ number: 42, title: 'New bug' }, 201));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues',
        payload: issueBody,
      });
      expect(res.statusCode).toBe(201);
      expect(res.json().number).toBe(42);
    });

    it('creates issue in draft mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('draft');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ number: 43, title: 'New bug' }, 201));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues',
        payload: issueBody,
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 403 in suggest mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues',
        payload: issueBody,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/suggest/i);
    });

    it('returns 404 when no token', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues',
        payload: issueBody,
      });
      expect(res.statusCode).toBe(404);
    });
  });

  // ── POST /api/v1/github/repos/:owner/:repo/pulls ──────────────────────────

  describe('POST /api/v1/github/repos/:owner/:repo/pulls', () => {
    const prBody = { title: 'New feature', head: 'feature-branch', base: 'main' };

    it('creates PR in auto mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ number: 10, title: 'New feature' }, 201));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/pulls',
        payload: prBody,
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns preview JSON in draft mode instead of creating PR', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('draft');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/pulls',
        payload: prBody,
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.preview).toBe(true);
      expect(body.title).toBe('New feature');
    });

    it('returns 403 in suggest mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/pulls',
        payload: prBody,
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── POST /api/v1/github/repos/:owner/:repo/issues/:number/comments ─────────

  describe('POST /api/v1/github/repos/:owner/:repo/issues/:number/comments', () => {
    const commentBody = { body: 'Great issue!' };

    it('posts comment in auto mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      vi.stubGlobal('fetch', mockFetch({ id: 99, body: 'Great issue!' }, 201));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues/1/comments',
        payload: commentBody,
      });
      expect(res.statusCode).toBe(201);
    });

    it('returns 403 in draft mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('draft');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues/1/comments',
        payload: commentBody,
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/draft/i);
    });

    it('returns 403 in suggest mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues/1/comments',
        payload: commentBody,
      });
      expect(res.statusCode).toBe(403);
    });
  });

  // ── 401 retry logic ────────────────────────────────────────────────────────

  describe('401 retry on profile', () => {
    it('skips retry when forceRefreshById returns same stale token', async () => {
      const svc = {
        ...mockOAuthTokenService(),
        forceRefreshById: vi.fn().mockResolvedValue('gh-access-token'),
      } as unknown as OAuthTokenService;
      (svc.listTokens as ReturnType<typeof vi.fn>).mockResolvedValue([TOKEN_ROW]);
      (svc.getValidToken as ReturnType<typeof vi.fn>).mockResolvedValue('gh-access-token');
      const app = await buildApp(svc);
      const fetchMock = mockFetch({ message: 'Bad credentials' }, 401);
      vi.stubGlobal('fetch', fetchMock);
      const res = await app.inject({ method: 'GET', url: '/api/v1/github/profile' });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(res.statusCode).toBe(401);
    });
  });

  // ── POST /api/v1/github/repos/:owner/:repo/sync-fork ──────────────────────

  describe('POST /api/v1/github/repos/:owner/:repo/sync-fork', () => {
    const syncBody = { base: 'main' };
    const syncUrl = '/api/v1/github/repos/myuser/my-fork/sync-fork';

    it('returns 201 with merge commit in auto mode when a merge is performed', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      vi.stubGlobal(
        'fetch',
        mockFetch({ sha: 'abc123', commit: { message: 'Merge upstream' } }, 201)
      );
      const res = await app.inject({ method: 'POST', url: syncUrl, payload: syncBody });
      expect(res.statusCode).toBe(201);
      expect(res.json().sha).toBe('abc123');
    });

    it('returns 204 in auto mode when the branch is already up-to-date', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
          json: () => Promise.resolve(null),
          text: () => Promise.resolve(''),
        })
      );
      const res = await app.inject({ method: 'POST', url: syncUrl, payload: syncBody });
      expect(res.statusCode).toBe(204);
    });

    it('returns preview JSON in draft mode without syncing', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('draft');
      const app = await buildApp(svc, sm);
      const res = await app.inject({
        method: 'POST',
        url: syncUrl,
        payload: { base: 'main', head: 'upstream:main' },
      });
      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.preview).toBe(true);
      expect(body.base).toBe('main');
      expect(body.head).toBe('upstream:main');
    });

    it('returns 403 in suggest mode', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('suggest');
      const app = await buildApp(svc, sm);
      const res = await app.inject({ method: 'POST', url: syncUrl, payload: syncBody });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/suggest/i);
    });

    it('returns 404 when no token', async () => {
      const app = await buildApp(mockOAuthTokenService({ noTokens: true }));
      const res = await app.inject({ method: 'POST', url: syncUrl, payload: syncBody });
      expect(res.statusCode).toBe(404);
    });

    it('passes optional head and commit_message to GitHub API', async () => {
      const svc = mockOAuthTokenService();
      const sm = mockSoulManager('auto');
      const app = await buildApp(svc, sm);
      const fetchMock = mockFetch({ sha: 'def456' }, 201);
      vi.stubGlobal('fetch', fetchMock);
      await app.inject({
        method: 'POST',
        url: syncUrl,
        payload: { base: 'main', head: 'upstream:main', commit_message: 'sync with upstream' },
      });
      const callBody = JSON.parse((fetchMock.mock.calls[0][1] as RequestInit).body as string);
      expect(callBody.base).toBe('main');
      expect(callBody.head).toBe('upstream:main');
      expect(callBody.commit_message).toBe('sync with upstream');
    });
  });

  // ── scope check ────────────────────────────────────────────────────────────

  describe('write scope check', () => {
    it('returns 403 when stored scopes lack repo permissions for issue create', async () => {
      const svcReadOnly = {
        ...mockOAuthTokenService(),
        listTokens: vi.fn().mockResolvedValue([{ ...TOKEN_ROW, scopes: 'read:user user:email' }]),
        getValidToken: vi.fn().mockResolvedValue('gh-access-token'),
      } as unknown as OAuthTokenService;
      const sm = mockSoulManager('auto');
      const app = await buildApp(svcReadOnly, sm);
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/github/repos/octocat/hello-world/issues',
        payload: { title: 'Test' },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toMatch(/repo or public_repo permissions/i);
    });
  });
});
