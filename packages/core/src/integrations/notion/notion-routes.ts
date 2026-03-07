/**
 * Notion Routes — Notion API v1 proxy.
 *
 * Credentials come from the stored Notion integration config (apiKey).
 * All requests are proxied to https://api.notion.com/v1 with the
 * configured internal integration token.
 */

import type { FastifyInstance } from 'fastify';
import type { IntegrationManager } from '../manager.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';

const NOTION_API = 'https://api.notion.com/v1';
const NOTION_VERSION = '2022-06-28';

export interface NotionRoutesOptions {
  integrationManager: IntegrationManager;
}

// ─── Helpers ──────────────────────────────────────────────────

async function resolveNotionCredentials(
  integrationManager: IntegrationManager
): Promise<{ apiKey: string } | null> {
  const integrations = await integrationManager.listIntegrations({
    platform: 'notion',
    enabled: true,
  });
  const first = integrations[0];
  if (!first) return null;
  const cfg = first.config as { apiKey?: string };
  if (!cfg?.apiKey) return null;
  return { apiKey: cfg.apiKey };
}

async function notionFetch(
  apiKey: string,
  path: string,
  init?: RequestInit
): Promise<Response> {
  return fetch(NOTION_API + path, {
    ...init,
    headers: {
      Authorization: 'Bearer ' + apiKey,
      'Notion-Version': NOTION_VERSION,
      'Content-Type': 'application/json',
    },
  });
}

// ─── Routes ───────────────────────────────────────────────────

export function registerNotionRoutes(
  app: FastifyInstance,
  opts: NotionRoutesOptions
): void {
  const { integrationManager } = opts;

  // POST /api/v1/integrations/notion/search
  app.post('/api/v1/integrations/notion/search', async (request, reply) => {
    try {
      const creds = await resolveNotionCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No Notion integration configured');

      const { query, filter, pageSize } = request.body as {
        query?: string;
        filter?: string;
        pageSize?: number;
      };

      const body: Record<string, unknown> = {};
      if (query) body.query = query;
      if (filter) body.filter = { value: filter, property: 'object' };
      if (pageSize) body.page_size = pageSize;

      const res = await notionFetch(creds.apiKey, '/search', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
      return reply.send(data);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/integrations/notion/pages/:pageId
  app.get('/api/v1/integrations/notion/pages/:pageId', async (request, reply) => {
    try {
      const creds = await resolveNotionCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No Notion integration configured');

      const { pageId } = request.params as { pageId: string };

      const res = await notionFetch(creds.apiKey, `/pages/${pageId}`);
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
      return reply.send(data);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // POST /api/v1/integrations/notion/pages
  app.post('/api/v1/integrations/notion/pages', async (request, reply) => {
    try {
      const creds = await resolveNotionCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No Notion integration configured');

      const { parentDatabaseId, title, properties } = request.body as {
        parentDatabaseId: string;
        title: string;
        properties?: Record<string, unknown>;
      };

      if (!parentDatabaseId || !title) {
        return sendError(reply, 400, 'parentDatabaseId and title are required');
      }

      const body: Record<string, unknown> = {
        parent: { database_id: parentDatabaseId },
        properties: {
          title: { title: [{ text: { content: title } }] },
          ...properties,
        },
      };

      const res = await notionFetch(creds.apiKey, '/pages', {
        method: 'POST',
        body: JSON.stringify(body),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
      return reply.code(201).send(data);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // PUT /api/v1/integrations/notion/pages/:pageId
  app.put('/api/v1/integrations/notion/pages/:pageId', async (request, reply) => {
    try {
      const creds = await resolveNotionCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No Notion integration configured');

      const { pageId } = request.params as { pageId: string };
      const { properties } = request.body as { properties: Record<string, unknown> };

      if (!properties) {
        return sendError(reply, 400, 'properties are required');
      }

      const res = await notionFetch(creds.apiKey, `/pages/${pageId}`, {
        method: 'PATCH',
        body: JSON.stringify({ properties }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
      return reply.send(data);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // GET /api/v1/integrations/notion/pages/:pageId/blocks
  app.get('/api/v1/integrations/notion/pages/:pageId/blocks', async (request, reply) => {
    try {
      const creds = await resolveNotionCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No Notion integration configured');

      const { pageId } = request.params as { pageId: string };

      const res = await notionFetch(creds.apiKey, `/blocks/${pageId}/children`);
      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
      return reply.send(data);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // POST /api/v1/integrations/notion/pages/:pageId/blocks
  app.post('/api/v1/integrations/notion/pages/:pageId/blocks', async (request, reply) => {
    try {
      const creds = await resolveNotionCredentials(integrationManager);
      if (!creds) return sendError(reply, 401, 'No Notion integration configured');

      const { pageId } = request.params as { pageId: string };
      const { children } = request.body as { children: unknown[] };

      if (!children || !Array.isArray(children)) {
        return sendError(reply, 400, 'children array is required');
      }

      const res = await notionFetch(creds.apiKey, `/blocks/${pageId}/children`, {
        method: 'PATCH',
        body: JSON.stringify({ children }),
      });

      const data = (await res.json()) as Record<string, unknown>;
      if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
      return reply.send(data);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // POST /api/v1/integrations/notion/databases/:databaseId/query
  app.post(
    '/api/v1/integrations/notion/databases/:databaseId/query',
    async (request, reply) => {
      try {
        const creds = await resolveNotionCredentials(integrationManager);
        if (!creds) return sendError(reply, 401, 'No Notion integration configured');

        const { databaseId } = request.params as { databaseId: string };
        const { filter, sorts, pageSize } = request.body as {
          filter?: unknown;
          sorts?: unknown[];
          pageSize?: number;
        };

        const body: Record<string, unknown> = {};
        if (filter) body.filter = filter;
        if (sorts) body.sorts = sorts;
        if (pageSize) body.page_size = pageSize;

        const res = await notionFetch(creds.apiKey, `/databases/${databaseId}/query`, {
          method: 'POST',
          body: JSON.stringify(body),
        });

        const data = (await res.json()) as Record<string, unknown>;
        if (!res.ok) return sendError(reply, res.status, (data?.message as string) ?? 'Notion API error');
        return reply.send(data);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
