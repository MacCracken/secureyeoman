/**
 * Jira Routes — REST API proxy to Jira Cloud REST API v3.
 *
 * Credentials are resolved from the first enabled Jira integration.
 * Auth: Basic (email:apiToken). API base: {instanceUrl}/rest/api/3.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IntegrationManager } from '../manager.js';
import { sendError } from '../../utils/errors.js';

export interface JiraRoutesOptions {
  integrationManager: IntegrationManager;
}

interface JiraCredentials {
  instanceUrl: string;
  authHeader: string;
}

async function resolveJiraCredentials(
  integrationManager: IntegrationManager,
): Promise<JiraCredentials | null> {
  const integrations = await integrationManager.listIntegrations({
    platform: 'jira',
    enabled: true,
  });
  const first = integrations[0];
  if (!first) return null;
  const cfg = first.config as {
    instanceUrl?: string;
    email?: string;
    apiToken?: string;
  };
  if (!cfg?.instanceUrl || !cfg?.email || !cfg?.apiToken) return null;
  return {
    instanceUrl: cfg.instanceUrl.replace(/\/$/, ''),
    authHeader: `Basic ${Buffer.from(`${cfg.email}:${cfg.apiToken}`).toString('base64')}`,
  };
}

async function jiraFetch(
  creds: JiraCredentials,
  path: string,
  init?: RequestInit,
): Promise<Response> {
  const url = `${creds.instanceUrl}/rest/api/3${path}`;
  return fetch(url, {
    ...init,
    headers: {
      Authorization: creds.authHeader,
      Accept: 'application/json',
      'Content-Type': 'application/json',
      ...(init?.headers as Record<string, string> | undefined),
    },
  });
}

async function withCredentials(
  integrationManager: IntegrationManager,
  reply: FastifyReply,
  fn: (creds: JiraCredentials) => Promise<void>,
): Promise<void> {
  const creds = await resolveJiraCredentials(integrationManager);
  if (!creds) {
    return sendError(reply, 503, 'No enabled Jira integration configured');
  }
  await fn(creds);
}

function toAdf(text: string): object {
  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'paragraph',
        content: [{ type: 'text', text }],
      },
    ],
  };
}

export function registerJiraRoutes(
  app: FastifyInstance,
  opts: JiraRoutesOptions,
): void {
  const { integrationManager } = opts;

  // 1. Search issues by JQL
  app.get(
    '/api/v1/integrations/jira/issues/search',
    async (
      req: FastifyRequest<{ Querystring: { jql?: string; maxResults?: string } }>,
      reply: FastifyReply,
    ) => {
      const { jql, maxResults } = req.query;
      if (!jql) {
        return sendError(reply, 400, 'Missing required query parameter: jql');
      }
      await withCredentials(integrationManager, reply, async (creds) => {
        const max = maxResults ? parseInt(maxResults, 10) : 25;
        const params = new URLSearchParams({ jql, maxResults: String(max) });
        const res = await jiraFetch(creds, `/search?${params.toString()}`);
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Jira search failed');
        }
        return reply.send(body);
      });
    },
  );

  // 2. Get single issue
  app.get(
    '/api/v1/integrations/jira/issues/:issueKey',
    async (
      req: FastifyRequest<{ Params: { issueKey: string } }>,
      reply: FastifyReply,
    ) => {
      const { issueKey } = req.params;
      await withCredentials(integrationManager, reply, async (creds) => {
        const res = await jiraFetch(creds, `/issue/${encodeURIComponent(issueKey)}?expand=renderedFields`);
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Failed to get issue');
        }
        return reply.send(body);
      });
    },
  );

  // 3. Create issue
  app.post(
    '/api/v1/integrations/jira/issues',
    async (
      req: FastifyRequest<{
        Body: {
          projectKey: string;
          summary: string;
          issueType?: string;
          description?: string;
          assignee?: string;
          priority?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { projectKey, summary, issueType, description, assignee, priority } = req.body ?? {};
      if (!projectKey || !summary) {
        return sendError(reply, 400, 'Missing required fields: projectKey, summary');
      }
      await withCredentials(integrationManager, reply, async (creds) => {
        const fields: Record<string, unknown> = {
          project: { key: projectKey },
          summary,
          issuetype: { name: issueType ?? 'Task' },
        };
        if (description !== undefined) {
          fields.description = toAdf(description);
        }
        if (assignee !== undefined) {
          fields.assignee = { accountId: assignee };
        }
        if (priority !== undefined) {
          fields.priority = { name: priority };
        }
        const res = await jiraFetch(creds, '/issue', {
          method: 'POST',
          body: JSON.stringify({ fields }),
        });
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Failed to create issue');
        }
        return reply.code(201).send(body);
      });
    },
  );

  // 4. Update issue
  app.put(
    '/api/v1/integrations/jira/issues/:issueKey',
    async (
      req: FastifyRequest<{
        Params: { issueKey: string };
        Body: {
          summary?: string;
          description?: string;
          assignee?: string;
          priority?: string;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const { issueKey } = req.params;
      const { summary, description, assignee, priority } = req.body ?? {};
      await withCredentials(integrationManager, reply, async (creds) => {
        const fields: Record<string, unknown> = {};
        if (summary !== undefined) {
          fields.summary = summary;
        }
        if (description !== undefined) {
          fields.description = toAdf(description);
        }
        if (assignee !== undefined) {
          fields.assignee = { accountId: assignee };
        }
        if (priority !== undefined) {
          fields.priority = { name: priority };
        }
        const res = await jiraFetch(creds, `/issue/${encodeURIComponent(issueKey)}`, {
          method: 'PUT',
          body: JSON.stringify({ fields }),
        });
        if (res.status === 204) {
          return reply.code(204).send();
        }
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Failed to update issue');
        }
        return reply.send(body);
      });
    },
  );

  // 5. Create comment
  app.post(
    '/api/v1/integrations/jira/issues/:issueKey/comments',
    async (
      req: FastifyRequest<{
        Params: { issueKey: string };
        Body: { body: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { issueKey } = req.params;
      const commentBody = req.body?.body;
      if (!commentBody) {
        return sendError(reply, 400, 'Missing required field: body');
      }
      await withCredentials(integrationManager, reply, async (creds) => {
        const res = await jiraFetch(
          creds,
          `/issue/${encodeURIComponent(issueKey)}/comment`,
          {
            method: 'POST',
            body: JSON.stringify({ body: toAdf(commentBody) }),
          },
        );
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Failed to create comment');
        }
        return reply.code(201).send(body);
      });
    },
  );

  // 6. List projects
  app.get(
    '/api/v1/integrations/jira/projects',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      await withCredentials(integrationManager, reply, async (creds) => {
        const res = await jiraFetch(creds, '/project');
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Failed to list projects');
        }
        return reply.send(body);
      });
    },
  );

  // 7. Get transitions
  app.get(
    '/api/v1/integrations/jira/issues/:issueKey/transitions',
    async (
      req: FastifyRequest<{ Params: { issueKey: string } }>,
      reply: FastifyReply,
    ) => {
      const { issueKey } = req.params;
      await withCredentials(integrationManager, reply, async (creds) => {
        const res = await jiraFetch(creds, `/issue/${encodeURIComponent(issueKey)}/transitions`);
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(reply, res.status, (body?.errorMessages as string[])?.[0] ?? 'Failed to get transitions');
        }
        return reply.send(body);
      });
    },
  );

  // 8. Transition issue
  app.post(
    '/api/v1/integrations/jira/issues/:issueKey/transitions',
    async (
      req: FastifyRequest<{
        Params: { issueKey: string };
        Body: { transitionId: string };
      }>,
      reply: FastifyReply,
    ) => {
      const { issueKey } = req.params;
      const { transitionId } = req.body ?? {};
      if (!transitionId) {
        return sendError(reply, 400, 'Missing required field: transitionId');
      }
      await withCredentials(integrationManager, reply, async (creds) => {
        const res = await jiraFetch(
          creds,
          `/issue/${encodeURIComponent(issueKey)}/transitions`,
          {
            method: 'POST',
            body: JSON.stringify({ transition: { id: transitionId } }),
          },
        );
        if (res.status === 204) {
          return reply.code(204).send();
        }
        const body = (await res.json()) as Record<string, unknown>;
        if (!res.ok) {
          return sendError(
            reply,
            res.status,
            (body?.errorMessages as string[])?.[0] ?? 'Failed to transition issue',
          );
        }
        return reply.send(body);
      });
    },
  );
}
