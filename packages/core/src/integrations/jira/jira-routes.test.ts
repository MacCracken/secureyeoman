import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { registerJiraRoutes } from './jira-routes.js';

const JIRA_INTEGRATION = {
  id: 'intg-jira-1',
  platform: 'jira',
  enabled: true,
  config: {
    instanceUrl: 'https://test.atlassian.net',
    email: 'user@test.com',
    apiToken: 'jira_api_token',
  },
};

const BASE_URL = 'https://test.atlassian.net/rest/api/3';
const EXPECTED_AUTH = `Basic ${Buffer.from('user@test.com:jira_api_token').toString('base64')}`;

function mockIntegrationManager(integrations: unknown[] = [JIRA_INTEGRATION]) {
  return {
    listIntegrations: vi.fn().mockResolvedValue(integrations),
  } as any;
}

function jsonResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(body),
  } as Response;
}

function emptyResponse(status = 204): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.reject(new Error('No body on 204')),
  } as Response;
}

function errorResponse(status: number, messages: string[]): Response {
  return jsonResponse({ errorMessages: messages }, status);
}

describe('Jira Routes', () => {
  let app: FastifyInstance;
  let fetchSpy: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchSpy = vi.fn();
    vi.stubGlobal('fetch', fetchSpy);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app?.close();
  });

  function buildApp(integrations?: unknown[]) {
    app = Fastify();
    registerJiraRoutes(app, {
      integrationManager: mockIntegrationManager(integrations),
    });
    return app;
  }

  // ── 1. GET /api/v1/integrations/jira/issues/search ──

  describe('GET /issues/search', () => {
    const url = '/api/v1/integrations/jira/issues/search';

    it('returns search results on success', async () => {
      buildApp();
      const payload = { issues: [{ key: 'PROJ-1' }], total: 1 };
      fetchSpy.mockResolvedValueOnce(jsonResponse(payload));

      const res = await app.inject({ method: 'GET', url, query: { jql: 'project=PROJ' } });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(payload);
      expect(fetchSpy).toHaveBeenCalledOnce();
      const [calledUrl, opts] = fetchSpy.mock.calls[0];
      expect(calledUrl).toContain(`${BASE_URL}/search?`);
      expect(calledUrl).toContain('jql=project%3DPROJ');
      expect(opts.headers.Authorization).toBe(EXPECTED_AUTH);
    });

    it('returns 400 when jql is missing', async () => {
      buildApp();
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/jql/i);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'GET', url, query: { jql: 'x' } });
      expect(res.statusCode).toBe(503);
      expect(res.json().message).toMatch(/no enabled jira/i);
    });

    it('forwards upstream error status', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(422, ['JQL parse error']));
      const res = await app.inject({ method: 'GET', url, query: { jql: 'bad' } });
      expect(res.statusCode).toBe(422);
      expect(res.json().message).toBe('JQL parse error');
    });

    it('respects maxResults query parameter', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ issues: [], total: 0 }));
      await app.inject({ method: 'GET', url, query: { jql: 'x', maxResults: '10' } });
      const calledUrl: string = fetchSpy.mock.calls[0][0];
      expect(calledUrl).toContain('maxResults=10');
    });
  });

  // ── 2. GET /api/v1/integrations/jira/issues/:issueKey ──

  describe('GET /issues/:issueKey', () => {
    const url = '/api/v1/integrations/jira/issues/PROJ-42';

    it('returns issue on success', async () => {
      buildApp();
      const payload = { key: 'PROJ-42', fields: { summary: 'A bug' } };
      fetchSpy.mockResolvedValueOnce(jsonResponse(payload));

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(payload);
      const calledUrl: string = fetchSpy.mock.calls[0][0];
      expect(calledUrl).toBe(`${BASE_URL}/issue/PROJ-42?expand=renderedFields`);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream 404', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(404, ['Issue does not exist']));
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Issue does not exist');
    });
  });

  // ── 3. POST /api/v1/integrations/jira/issues ──

  describe('POST /issues', () => {
    const url = '/api/v1/integrations/jira/issues';

    it('creates issue and returns 201', async () => {
      buildApp();
      const created = {
        id: '10001',
        key: 'PROJ-43',
        self: 'https://test.atlassian.net/rest/api/3/issue/10001',
      };
      fetchSpy.mockResolvedValueOnce(jsonResponse(created, 201));

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { projectKey: 'PROJ', summary: 'New issue', description: 'Details' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(created);
      const [calledUrl, opts] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/issue`);
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.fields.project.key).toBe('PROJ');
      expect(body.fields.summary).toBe('New issue');
      expect(body.fields.description).toEqual({
        type: 'doc',
        version: 1,
        content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Details' }] }],
      });
    });

    it('returns 400 when projectKey is missing', async () => {
      buildApp();
      const res = await app.inject({ method: 'POST', url, payload: { summary: 'No project' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/projectKey/);
    });

    it('returns 400 when summary is missing', async () => {
      buildApp();
      const res = await app.inject({ method: 'POST', url, payload: { projectKey: 'P' } });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/summary/);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { projectKey: 'P', summary: 'S' },
      });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream error', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(400, ['Project not found']));
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { projectKey: 'BAD', summary: 'S' },
      });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Project not found');
    });

    it('sends optional assignee and priority fields', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(jsonResponse({ id: '1', key: 'P-1' }, 201));
      await app.inject({
        method: 'POST',
        url,
        payload: { projectKey: 'P', summary: 'S', assignee: 'acc-123', priority: 'High' },
      });
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.fields.assignee).toEqual({ accountId: 'acc-123' });
      expect(body.fields.priority).toEqual({ name: 'High' });
    });
  });

  // ── 4. PUT /api/v1/integrations/jira/issues/:issueKey ──

  describe('PUT /issues/:issueKey', () => {
    const url = '/api/v1/integrations/jira/issues/PROJ-42';

    it('returns 204 on successful update', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(emptyResponse(204));

      const res = await app.inject({ method: 'PUT', url, payload: { summary: 'Updated' } });

      expect(res.statusCode).toBe(204);
      const [calledUrl, opts] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/issue/PROJ-42`);
      expect(opts.method).toBe('PUT');
      const body = JSON.parse(opts.body);
      expect(body.fields.summary).toBe('Updated');
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'PUT', url, payload: { summary: 'X' } });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream error', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(404, ['Issue not found']));
      const res = await app.inject({ method: 'PUT', url, payload: { summary: 'X' } });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Issue not found');
    });

    it('converts description to ADF format', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(emptyResponse(204));
      await app.inject({ method: 'PUT', url, payload: { description: 'New desc' } });
      const body = JSON.parse(fetchSpy.mock.calls[0][1].body);
      expect(body.fields.description.type).toBe('doc');
      expect(body.fields.description.content[0].content[0].text).toBe('New desc');
    });
  });

  // ── 5. POST /api/v1/integrations/jira/issues/:issueKey/comments ──

  describe('POST /issues/:issueKey/comments', () => {
    const url = '/api/v1/integrations/jira/issues/PROJ-42/comments';

    it('creates comment and returns 201', async () => {
      buildApp();
      const created = { id: '10100', body: {} };
      fetchSpy.mockResolvedValueOnce(jsonResponse(created, 201));

      const res = await app.inject({ method: 'POST', url, payload: { body: 'A comment' } });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(created);
      const [calledUrl, opts] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/issue/PROJ-42/comment`);
      expect(opts.method).toBe('POST');
      const sent = JSON.parse(opts.body);
      expect(sent.body.type).toBe('doc');
      expect(sent.body.content[0].content[0].text).toBe('A comment');
    });

    it('returns 400 when body is missing', async () => {
      buildApp();
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/body/i);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'POST', url, payload: { body: 'x' } });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream error', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(403, ['No permission']));
      const res = await app.inject({ method: 'POST', url, payload: { body: 'x' } });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe('No permission');
    });
  });

  // ── 6. GET /api/v1/integrations/jira/projects ──

  describe('GET /projects', () => {
    const url = '/api/v1/integrations/jira/projects';

    it('returns project list on success', async () => {
      buildApp();
      const projects = [{ key: 'PROJ', name: 'Project' }];
      fetchSpy.mockResolvedValueOnce(jsonResponse(projects));

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(projects);
      const calledUrl: string = fetchSpy.mock.calls[0][0];
      expect(calledUrl).toBe(`${BASE_URL}/project`);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream error', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(500, ['Internal error']));
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(500);
      expect(res.json().message).toBe('An internal error occurred');
    });
  });

  // ── 7. GET /api/v1/integrations/jira/issues/:issueKey/transitions ──

  describe('GET /issues/:issueKey/transitions', () => {
    const url = '/api/v1/integrations/jira/issues/PROJ-42/transitions';

    it('returns transitions on success', async () => {
      buildApp();
      const payload = { transitions: [{ id: '11', name: 'Done' }] };
      fetchSpy.mockResolvedValueOnce(jsonResponse(payload));

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(payload);
      const calledUrl: string = fetchSpy.mock.calls[0][0];
      expect(calledUrl).toBe(`${BASE_URL}/issue/PROJ-42/transitions`);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream error', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(404, ['Issue not found']));
      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Issue not found');
    });
  });

  // ── 8. POST /api/v1/integrations/jira/issues/:issueKey/transitions ──

  describe('POST /issues/:issueKey/transitions', () => {
    const url = '/api/v1/integrations/jira/issues/PROJ-42/transitions';

    it('returns 204 on successful transition', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(emptyResponse(204));

      const res = await app.inject({ method: 'POST', url, payload: { transitionId: '31' } });

      expect(res.statusCode).toBe(204);
      const [calledUrl, opts] = fetchSpy.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/issue/PROJ-42/transitions`);
      expect(opts.method).toBe('POST');
      const body = JSON.parse(opts.body);
      expect(body.transition).toEqual({ id: '31' });
    });

    it('returns 400 when transitionId is missing', async () => {
      buildApp();
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toMatch(/transitionId/i);
    });

    it('returns 503 when no integration is configured', async () => {
      buildApp([]);
      const res = await app.inject({ method: 'POST', url, payload: { transitionId: '1' } });
      expect(res.statusCode).toBe(503);
    });

    it('forwards upstream error', async () => {
      buildApp();
      fetchSpy.mockResolvedValueOnce(errorResponse(409, ['Transition not valid']));
      const res = await app.inject({ method: 'POST', url, payload: { transitionId: '99' } });
      expect(res.statusCode).toBe(409);
      expect(res.json().message).toBe('Transition not valid');
    });
  });
});
