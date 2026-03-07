/**
 * Linear Routes — unit tests
 *
 * Tests the Fastify route handlers for Linear GraphQL API proxy:
 *   GET    /api/v1/integrations/linear/teams
 *   GET    /api/v1/integrations/linear/issues/search
 *   GET    /api/v1/integrations/linear/issues
 *   GET    /api/v1/integrations/linear/issues/:issueId
 *   POST   /api/v1/integrations/linear/issues
 *   PUT    /api/v1/integrations/linear/issues/:issueId
 *   POST   /api/v1/integrations/linear/issues/:issueId/comments
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import Fastify from 'fastify';
import { registerLinearRoutes } from './linear-routes.js';
import type { IntegrationManager } from '../manager.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const LINEAR_INTEGRATION = {
  id: 'intg-linear-1',
  platform: 'linear',
  enabled: true,
  config: { apiKey: 'lin_api_test_key' },
};

function mockIntegrationManager(opts?: { noIntegrations?: boolean }): IntegrationManager {
  return {
    listIntegrations: vi.fn().mockResolvedValue(
      opts?.noIntegrations ? [] : [LINEAR_INTEGRATION]
    ),
  } as unknown as IntegrationManager;
}

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

/** Build a successful Linear GraphQL response. */
function graphqlOk(data: Record<string, unknown>): Response {
  return {
    ok: true,
    status: 200,
    json: () => Promise.resolve({ data }),
    text: () => Promise.resolve(JSON.stringify({ data })),
  } as unknown as Response;
}

/** Build a GraphQL-level error response (HTTP 200 but errors array). */
function graphqlErrors(messages: string[]): Response {
  return {
    ok: true,
    status: 200,
    json: () =>
      Promise.resolve({ errors: messages.map((m) => ({ message: m })) }),
    text: () =>
      Promise.resolve(
        JSON.stringify({ errors: messages.map((m) => ({ message: m })) })
      ),
  } as unknown as Response;
}

/** Build an HTTP-level error from Linear (non-2xx). */
function httpError(status: number, body: string): Response {
  return {
    ok: false,
    status,
    json: () => Promise.resolve({ message: body }),
    text: () => Promise.resolve(body),
  } as unknown as Response;
}

async function buildApp(integrationManager: IntegrationManager) {
  const app = Fastify({ logger: false });
  registerLinearRoutes(app, { integrationManager });
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Linear Routes', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ── GET /api/v1/integrations/linear/teams ──────────────────────────────────

  describe('GET /api/v1/integrations/linear/teams', () => {
    it('returns teams on success', async () => {
      const teams = { nodes: [{ id: 't-1', name: 'Engineering', key: 'ENG' }] };
      mockFetch.mockResolvedValue(graphqlOk({ teams }));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(teams);
    });

    it('returns 404 when no Linear integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toMatch(/no linear integration/i);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Authentication failed']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toMatch(/Authentication failed/);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });
      expect(res.statusCode).toBe(500);
    });

    it('returns 500 when Linear returns non-2xx HTTP', async () => {
      mockFetch.mockResolvedValue(httpError(401, 'Unauthorized'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/integrations/linear/issues/search ──────────────────────────

  describe('GET /api/v1/integrations/linear/issues/search', () => {
    it('returns search results on success', async () => {
      const issueSearch = {
        nodes: [
          { id: 'i-1', identifier: 'ENG-1', title: 'Bug fix', state: { name: 'Todo' }, priority: 2, assignee: { name: 'Alice' } },
        ],
      };
      mockFetch.mockResolvedValue(graphqlOk({ issueSearch }));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/search?query=bug',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(issueSearch);
    });

    it('returns 400 when query param is missing', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/search',
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/query/i);
    });

    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/search?query=test',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Rate limited']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/search?query=test',
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toMatch(/Rate limited/);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Connection refused'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/search?query=test',
      });
      expect(res.statusCode).toBe(500);
    });

    it('respects limit query param', async () => {
      mockFetch.mockResolvedValue(graphqlOk({ issueSearch: { nodes: [] } }));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/search?query=test&limit=10',
      });
      expect(res.statusCode).toBe(200);

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.variables.first).toBe(10);
    });
  });

  // ── GET /api/v1/integrations/linear/issues ─────────────────────────────────

  describe('GET /api/v1/integrations/linear/issues', () => {
    it('returns issues on success', async () => {
      const issues = {
        nodes: [
          { id: 'i-1', identifier: 'ENG-1', title: 'Task', state: { name: 'In Progress' } },
        ],
      };
      mockFetch.mockResolvedValue(graphqlOk({ issues }));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/issues' });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(issues);
    });

    it('passes filter params (teamId, status, assigneeId)', async () => {
      mockFetch.mockResolvedValue(graphqlOk({ issues: { nodes: [] } }));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues?teamId=t-1&status=Done&assigneeId=u-1&limit=5',
      });
      expect(res.statusCode).toBe(200);

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.variables.first).toBe(5);
      expect(fetchBody.variables.filter).toEqual({
        team: { id: { eq: 't-1' } },
        state: { name: { eq: 'Done' } },
        assignee: { id: { eq: 'u-1' } },
      });
    });

    it('sends no filter when no filter params provided', async () => {
      mockFetch.mockResolvedValue(graphqlOk({ issues: { nodes: [] } }));
      const app = await buildApp(mockIntegrationManager());

      await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/issues' });

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.variables.filter).toBeUndefined();
    });

    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/issues' });
      expect(res.statusCode).toBe(404);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Server error']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/issues' });
      expect(res.statusCode).toBe(502);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/issues' });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── GET /api/v1/integrations/linear/issues/:issueId ────────────────────────

  describe('GET /api/v1/integrations/linear/issues/:issueId', () => {
    it('returns issue details on success', async () => {
      const issue = {
        id: 'i-1',
        identifier: 'ENG-42',
        title: 'Fix login',
        description: 'Login is broken',
        state: { id: 's-1', name: 'In Progress' },
        priority: 1,
        url: 'https://linear.app/eng/issue/ENG-42',
      };
      mockFetch.mockResolvedValue(graphqlOk({ issue }));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/i-1',
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(issue);
    });

    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/i-1',
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Issue not found']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/bad-id',
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toMatch(/Issue not found/);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('DNS failure'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/integrations/linear/issues/i-1',
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /api/v1/integrations/linear/issues ────────────────────────────────

  describe('POST /api/v1/integrations/linear/issues', () => {
    it('creates an issue and returns 201', async () => {
      const issue = { id: 'i-new', identifier: 'ENG-99', title: 'New task', url: 'https://linear.app/eng/issue/ENG-99' };
      mockFetch.mockResolvedValue(
        graphqlOk({ issueCreate: { success: true, issue } })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { title: 'New task', teamId: 't-1' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(issue);
    });

    it('passes optional fields (description, priority, assigneeId, labelIds)', async () => {
      mockFetch.mockResolvedValue(
        graphqlOk({
          issueCreate: {
            success: true,
            issue: { id: 'i-2', identifier: 'ENG-100', title: 'Full', url: '#' },
          },
        })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: {
          title: 'Full',
          teamId: 't-1',
          description: 'Details here',
          priority: 1,
          assigneeId: 'u-1',
          labelIds: ['l-1', 'l-2'],
        },
      });
      expect(res.statusCode).toBe(201);

      const fetchBody = JSON.parse(mockFetch.mock.calls[0][1].body);
      expect(fetchBody.variables.input).toMatchObject({
        title: 'Full',
        teamId: 't-1',
        description: 'Details here',
        priority: 1,
        assigneeId: 'u-1',
        labelIds: ['l-1', 'l-2'],
      });
    });

    it('returns 400 when title is missing', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { teamId: 't-1' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/title/i);
    });

    it('returns 400 when teamId is missing', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { title: 'No team' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/teamId/i);
    });

    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { title: 'Test', teamId: 't-1' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Validation error']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { title: 'Test', teamId: 't-1' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('returns 502 when issueCreate reports failure (success: false)', async () => {
      mockFetch.mockResolvedValue(
        graphqlOk({ issueCreate: { success: false, issue: null } })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { title: 'Test', teamId: 't-1' },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toMatch(/failure/i);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues',
        payload: { title: 'Test', teamId: 't-1' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── PUT /api/v1/integrations/linear/issues/:issueId ────────────────────────

  describe('PUT /api/v1/integrations/linear/issues/:issueId', () => {
    it('updates an issue on success', async () => {
      const issue = { id: 'i-1', identifier: 'ENG-42', title: 'Updated', state: { name: 'Done' } };
      mockFetch.mockResolvedValue(
        graphqlOk({ issueUpdate: { success: true, issue } })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/integrations/linear/issues/i-1',
        payload: { title: 'Updated', stateId: 's-done' },
      });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(issue);
    });

    it('returns 400 when no update fields provided', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/integrations/linear/issues/i-1',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/at least one field/i);
    });

    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/integrations/linear/issues/i-1',
        payload: { title: 'x' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Permission denied']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/integrations/linear/issues/i-1',
        payload: { title: 'x' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('returns 502 when issueUpdate reports failure (success: false)', async () => {
      mockFetch.mockResolvedValue(
        graphqlOk({ issueUpdate: { success: false, issue: null } })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/integrations/linear/issues/i-1',
        payload: { priority: 3 },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toMatch(/failure/i);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Timeout'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'PUT',
        url: '/api/v1/integrations/linear/issues/i-1',
        payload: { title: 'x' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── POST /api/v1/integrations/linear/issues/:issueId/comments ──────────────

  describe('POST /api/v1/integrations/linear/issues/:issueId/comments', () => {
    it('creates a comment and returns 201', async () => {
      const comment = { id: 'c-1', body: 'Nice work!', createdAt: '2026-03-06T00:00:00Z', user: { name: 'Alice' } };
      mockFetch.mockResolvedValue(
        graphqlOk({ commentCreate: { success: true, comment } })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues/i-1/comments',
        payload: { body: 'Nice work!' },
      });
      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(comment);
    });

    it('returns 400 when body is missing', async () => {
      const app = await buildApp(mockIntegrationManager());
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues/i-1/comments',
        payload: {},
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/body/i);
    });

    it('returns 404 when no integration configured', async () => {
      const app = await buildApp(mockIntegrationManager({ noIntegrations: true }));
      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues/i-1/comments',
        payload: { body: 'Hello' },
      });
      expect(res.statusCode).toBe(404);
    });

    it('returns 502 on GraphQL errors', async () => {
      mockFetch.mockResolvedValue(graphqlErrors(['Issue not found']));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues/i-1/comments',
        payload: { body: 'Hello' },
      });
      expect(res.statusCode).toBe(502);
    });

    it('returns 502 when commentCreate reports failure (success: false)', async () => {
      mockFetch.mockResolvedValue(
        graphqlOk({ commentCreate: { success: false, comment: null } })
      );
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues/i-1/comments',
        payload: { body: 'Hello' },
      });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toMatch(/failure/i);
    });

    it('returns 500 when fetch throws', async () => {
      mockFetch.mockRejectedValue(new Error('Connection reset'));
      const app = await buildApp(mockIntegrationManager());

      const res = await app.inject({
        method: 'POST',
        url: '/api/v1/integrations/linear/issues/i-1/comments',
        payload: { body: 'Hello' },
      });
      expect(res.statusCode).toBe(500);
    });
  });

  // ── Credential resolution edge cases ───────────────────────────────────────

  describe('credential resolution', () => {
    it('returns 404 when integration exists but apiKey is missing', async () => {
      const mgr = {
        listIntegrations: vi.fn().mockResolvedValue([
          { id: 'intg-linear-1', platform: 'linear', enabled: true, config: {} },
        ]),
      } as unknown as IntegrationManager;
      const app = await buildApp(mgr);

      const res = await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });
      expect(res.statusCode).toBe(404);
    });

    it('sends apiKey in Authorization header (no Bearer prefix)', async () => {
      mockFetch.mockResolvedValue(graphqlOk({ teams: { nodes: [] } }));
      const app = await buildApp(mockIntegrationManager());

      await app.inject({ method: 'GET', url: '/api/v1/integrations/linear/teams' });

      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.linear.app/graphql',
        expect.objectContaining({
          headers: expect.objectContaining({
            Authorization: 'lin_api_test_key',
          }),
        })
      );
    });
  });
});
