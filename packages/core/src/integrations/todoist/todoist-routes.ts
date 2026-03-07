/**
 * Todoist Routes — Todoist REST API v2 proxy.
 *
 * Credentials come from the stored Todoist integration config (apiToken).
 * All endpoints live under /api/v1/integrations/todoist/.
 */

import type { FastifyInstance } from 'fastify';
import type { IntegrationManager } from '../manager.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';

const TODOIST_API = 'https://api.todoist.com/rest/v2';

export interface TodoistRoutesOptions {
  integrationManager: IntegrationManager;
}

// ─── Helpers ──────────────────────────────────────────────────

async function resolveTodoistCredentials(
  integrationManager: IntegrationManager
): Promise<{ apiToken: string } | null> {
  const integrations = await integrationManager.listIntegrations({
    platform: 'todoist',
    enabled: true,
  });
  const first = integrations[0];
  if (!first) return null;
  const cfg = first.config as { apiToken?: string };
  if (!cfg?.apiToken) return null;
  return { apiToken: cfg.apiToken };
}

async function todoistFetch(
  apiToken: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(TODOIST_API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + apiToken,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
}

// ─── Route Registration ───────────────────────────────────────

export async function registerTodoistRoutes(
  app: FastifyInstance,
  opts: TodoistRoutesOptions
): Promise<void> {
  const { integrationManager } = opts;

  // GET /api/v1/integrations/todoist/tasks — List tasks
  app.get('/api/v1/integrations/todoist/tasks', async (request, reply) => {
    try {
      const creds = await resolveTodoistCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No enabled Todoist integration found');

      const query = request.query as { projectId?: string; filter?: string };
      const params = new URLSearchParams();
      if (query.projectId) params.set('project_id', query.projectId);
      if (query.filter) params.set('filter', query.filter);

      const qs = params.toString();
      const res = await todoistFetch(creds.apiToken, '/tasks' + (qs ? '?' + qs : ''));

      if (!res.ok) {
        const body = await res.text();
        return sendError(reply, res.status, body || 'Todoist API error');
      }

      return reply.send(await res.json());
    } catch (err) {
      return sendError(reply, 502, toErrorMessage(err));
    }
  });

  // GET /api/v1/integrations/todoist/tasks/:taskId — Get single task
  app.get('/api/v1/integrations/todoist/tasks/:taskId', async (request, reply) => {
    try {
      const creds = await resolveTodoistCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No enabled Todoist integration found');

      const { taskId } = request.params as { taskId: string };
      const res = await todoistFetch(creds.apiToken, `/tasks/${taskId}`);

      if (!res.ok) {
        const body = await res.text();
        return sendError(reply, res.status, body || 'Todoist API error');
      }

      return reply.send(await res.json());
    } catch (err) {
      return sendError(reply, 502, toErrorMessage(err));
    }
  });

  // POST /api/v1/integrations/todoist/tasks — Create task
  app.post('/api/v1/integrations/todoist/tasks', async (request, reply) => {
    try {
      const creds = await resolveTodoistCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No enabled Todoist integration found');

      const body = request.body as {
        content: string;
        description?: string;
        projectId?: string;
        dueString?: string;
        priority?: number;
      };

      if (!body?.content) {
        return sendError(reply, 400, 'content is required');
      }

      const todoistBody: Record<string, unknown> = { content: body.content };
      if (body.description !== undefined) todoistBody.description = body.description;
      if (body.projectId !== undefined) todoistBody.project_id = body.projectId;
      if (body.dueString !== undefined) todoistBody.due_string = body.dueString;
      if (body.priority !== undefined) todoistBody.priority = body.priority;

      const res = await todoistFetch(creds.apiToken, '/tasks', {
        method: 'POST',
        body: JSON.stringify(todoistBody),
      });

      if (!res.ok) {
        const text = await res.text();
        return sendError(reply, res.status, text || 'Todoist API error');
      }

      return reply.code(201).send(await res.json());
    } catch (err) {
      return sendError(reply, 502, toErrorMessage(err));
    }
  });

  // PUT /api/v1/integrations/todoist/tasks/:taskId — Update task
  // Note: Todoist REST API v2 uses POST for updates, not PUT.
  app.put('/api/v1/integrations/todoist/tasks/:taskId', async (request, reply) => {
    try {
      const creds = await resolveTodoistCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No enabled Todoist integration found');

      const { taskId } = request.params as { taskId: string };
      const body = request.body as {
        content?: string;
        description?: string;
        dueString?: string;
        priority?: number;
      };

      const todoistBody: Record<string, unknown> = {};
      if (body.content !== undefined) todoistBody.content = body.content;
      if (body.description !== undefined) todoistBody.description = body.description;
      if (body.dueString !== undefined) todoistBody.due_string = body.dueString;
      if (body.priority !== undefined) todoistBody.priority = body.priority;

      const res = await todoistFetch(creds.apiToken, `/tasks/${taskId}`, {
        method: 'POST',
        body: JSON.stringify(todoistBody),
      });

      if (!res.ok) {
        const text = await res.text();
        return sendError(reply, res.status, text || 'Todoist API error');
      }

      return reply.send(await res.json());
    } catch (err) {
      return sendError(reply, 502, toErrorMessage(err));
    }
  });

  // POST /api/v1/integrations/todoist/tasks/:taskId/close — Complete/close task
  app.post('/api/v1/integrations/todoist/tasks/:taskId/close', async (request, reply) => {
    try {
      const creds = await resolveTodoistCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No enabled Todoist integration found');

      const { taskId } = request.params as { taskId: string };
      const res = await todoistFetch(creds.apiToken, `/tasks/${taskId}/close`, {
        method: 'POST',
      });

      if (!res.ok) {
        const text = await res.text();
        return sendError(reply, res.status, text || 'Todoist API error');
      }

      // Todoist returns 204 No Content on success
      return reply.code(204).send();
    } catch (err) {
      return sendError(reply, 502, toErrorMessage(err));
    }
  });

  // GET /api/v1/integrations/todoist/projects — List projects
  app.get('/api/v1/integrations/todoist/projects', async (request, reply) => {
    try {
      const creds = await resolveTodoistCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No enabled Todoist integration found');

      const res = await todoistFetch(creds.apiToken, '/projects');

      if (!res.ok) {
        const body = await res.text();
        return sendError(reply, res.status, body || 'Todoist API error');
      }

      return reply.send(await res.json());
    } catch (err) {
      return sendError(reply, 502, toErrorMessage(err));
    }
  });
}
