import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerTodoistRoutes } from './todoist-routes.js';
import type { IntegrationManager } from '../manager.js';

// ── Mock Data ────────────────────────────────────────────────────

const TODOIST_INTEGRATION = {
  id: 'intg-todoist-1',
  platform: 'todoist',
  enabled: true,
  config: { apiToken: 'todoist_test_token' },
};

function mockIntegrationManager(opts?: { noIntegrations?: boolean }): IntegrationManager {
  return {
    listIntegrations: vi.fn().mockResolvedValue(opts?.noIntegrations ? [] : [TODOIST_INTEGRATION]),
  } as unknown as IntegrationManager;
}

// ── Fetch Helpers ────────────────────────────────────────────────

const originalFetch = globalThis.fetch;

function mockFetchOk(body: unknown, status = 200): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status,
    json: () => Promise.resolve(body),
    text: () => Promise.resolve(JSON.stringify(body)),
  });
}

function mockFetchNoContent(): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    status: 204,
    json: () => Promise.resolve(null),
    text: () => Promise.resolve(''),
  });
}

function mockFetchError(status: number, message: string): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve({ error: message }),
    text: () => Promise.resolve(message),
  });
}

// ── Suite ────────────────────────────────────────────────────────

describe('todoist-routes', () => {
  let app: ReturnType<typeof Fastify>;
  let mgr: IntegrationManager;

  beforeEach(async () => {
    app = Fastify();
    mgr = mockIntegrationManager();
    await registerTodoistRoutes(app, { integrationManager: mgr });
    await app.ready();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  // ── GET /tasks ─────────────────────────────────────────────────

  describe('GET /api/v1/integrations/todoist/tasks', () => {
    const url = '/api/v1/integrations/todoist/tasks';

    it('lists tasks successfully', async () => {
      const tasks = [{ id: 't1', content: 'Buy milk' }];
      mockFetchOk(tasks);

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(tasks);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v2/tasks'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer todoist_test_token' }),
        })
      );
    });

    it('passes projectId and filter as query params', async () => {
      mockFetchOk([]);

      await app.inject({ method: 'GET', url: url + '?projectId=p1&filter=today' });
      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('project_id=p1');
      expect(calledUrl).toContain('filter=today');
    });

    it('returns 401 when no integration configured', async () => {
      mgr = mockIntegrationManager({ noIntegrations: true });
      app = Fastify();
      await registerTodoistRoutes(app, { integrationManager: mgr });
      await app.ready();

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('No enabled Todoist integration');
    });

    it('forwards upstream API error', async () => {
      mockFetchError(403, 'Forbidden');

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(403);
      expect(res.json().message).toBe('Forbidden');
    });
  });

  // ── GET /tasks/:taskId ─────────────────────────────────────────

  describe('GET /api/v1/integrations/todoist/tasks/:taskId', () => {
    const url = '/api/v1/integrations/todoist/tasks/task-42';

    it('returns a single task', async () => {
      const task = { id: 'task-42', content: 'Write tests' };
      mockFetchOk(task);

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(task);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/tasks/task-42'),
        expect.any(Object)
      );
    });

    it('returns 401 when no integration configured', async () => {
      mgr = mockIntegrationManager({ noIntegrations: true });
      app = Fastify();
      await registerTodoistRoutes(app, { integrationManager: mgr });
      await app.ready();

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('No enabled Todoist integration');
    });

    it('forwards upstream API error', async () => {
      mockFetchError(404, 'Task not found');

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Task not found');
    });
  });

  // ── POST /tasks ────────────────────────────────────────────────

  describe('POST /api/v1/integrations/todoist/tasks', () => {
    const url = '/api/v1/integrations/todoist/tasks';

    it('creates a task and returns 201', async () => {
      const created = { id: 'new-1', content: 'Ship it' };
      mockFetchOk(created);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: {
          content: 'Ship it',
          priority: 4,
          dueString: 'tomorrow',
          projectId: 'p1',
          description: 'desc',
        },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(created);

      const fetchBody = JSON.parse(
        (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1].body as string
      );
      expect(fetchBody.content).toBe('Ship it');
      expect(fetchBody.priority).toBe(4);
      expect(fetchBody.due_string).toBe('tomorrow');
      expect(fetchBody.project_id).toBe('p1');
      expect(fetchBody.description).toBe('desc');
    });

    it('returns 400 when content is missing', async () => {
      const res = await app.inject({ method: 'POST', url, payload: {} });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toContain('content is required');
    });

    it('returns 401 when no integration configured', async () => {
      mgr = mockIntegrationManager({ noIntegrations: true });
      app = Fastify();
      await registerTodoistRoutes(app, { integrationManager: mgr });
      await app.ready();

      const res = await app.inject({ method: 'POST', url, payload: { content: 'X' } });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('No enabled Todoist integration');
    });

    it('forwards upstream API error', async () => {
      mockFetchError(422, 'Invalid field');

      const res = await app.inject({ method: 'POST', url, payload: { content: 'X' } });
      expect(res.statusCode).toBe(422);
      expect(res.json().message).toBe('Invalid field');
    });
  });

  // ── PUT /tasks/:taskId ─────────────────────────────────────────

  describe('PUT /api/v1/integrations/todoist/tasks/:taskId', () => {
    const url = '/api/v1/integrations/todoist/tasks/task-42';

    it('updates a task', async () => {
      const updated = { id: 'task-42', content: 'Updated' };
      mockFetchOk(updated);

      const res = await app.inject({
        method: 'PUT',
        url,
        payload: { content: 'Updated', priority: 2 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(updated);

      // Todoist uses POST for updates
      const fetchOpts = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
      expect(fetchOpts.method).toBe('POST');
      expect(JSON.parse(fetchOpts.body)).toEqual({ content: 'Updated', priority: 2 });
    });

    it('returns 401 when no integration configured', async () => {
      mgr = mockIntegrationManager({ noIntegrations: true });
      app = Fastify();
      await registerTodoistRoutes(app, { integrationManager: mgr });
      await app.ready();

      const res = await app.inject({ method: 'PUT', url, payload: { content: 'X' } });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('No enabled Todoist integration');
    });

    it('forwards upstream API error', async () => {
      mockFetchError(502, 'Bad gateway');

      const res = await app.inject({ method: 'PUT', url, payload: { content: 'X' } });
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toBe('Bad gateway');
    });
  });

  // ── POST /tasks/:taskId/close ──────────────────────────────────

  describe('POST /api/v1/integrations/todoist/tasks/:taskId/close', () => {
    const url = '/api/v1/integrations/todoist/tasks/task-42/close';

    it('closes a task and returns 204', async () => {
      mockFetchNoContent();

      const res = await app.inject({ method: 'POST', url });
      expect(res.statusCode).toBe(204);
      expect(res.body).toBe('');

      const calledUrl = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0] as string;
      expect(calledUrl).toContain('/tasks/task-42/close');
    });

    it('returns 401 when no integration configured', async () => {
      mgr = mockIntegrationManager({ noIntegrations: true });
      app = Fastify();
      await registerTodoistRoutes(app, { integrationManager: mgr });
      await app.ready();

      const res = await app.inject({ method: 'POST', url });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('No enabled Todoist integration');
    });

    it('forwards upstream API error', async () => {
      mockFetchError(404, 'Task not found');

      const res = await app.inject({ method: 'POST', url });
      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Task not found');
    });
  });

  // ── GET /projects ──────────────────────────────────────────────

  describe('GET /api/v1/integrations/todoist/projects', () => {
    const url = '/api/v1/integrations/todoist/projects';

    it('lists projects', async () => {
      const projects = [{ id: 'p1', name: 'Inbox' }];
      mockFetchOk(projects);

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(projects);
      expect(globalThis.fetch).toHaveBeenCalledWith(
        expect.stringContaining('/rest/v2/projects'),
        expect.any(Object)
      );
    });

    it('returns 401 when no integration configured', async () => {
      mgr = mockIntegrationManager({ noIntegrations: true });
      app = Fastify();
      await registerTodoistRoutes(app, { integrationManager: mgr });
      await app.ready();

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('No enabled Todoist integration');
    });

    it('forwards upstream API error', async () => {
      mockFetchError(429, 'Rate limited');

      const res = await app.inject({ method: 'GET', url });
      expect(res.statusCode).toBe(429);
      expect(res.json().message).toBe('Rate limited');
    });
  });
});
