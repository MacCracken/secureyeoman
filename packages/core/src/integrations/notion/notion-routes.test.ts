import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import type { FastifyInstance } from 'fastify';
import { registerNotionRoutes } from './notion-routes.js';

// ─── Mock Integration ────────────────────────────────────────

const NOTION_INTEGRATION = {
  id: 'intg-notion-1',
  platform: 'notion',
  enabled: true,
  config: { apiKey: 'ntn_test_key' },
};

function createMockIntegrationManager(hasIntegration = true) {
  return {
    listIntegrations: vi.fn().mockResolvedValue(hasIntegration ? [NOTION_INTEGRATION] : []),
  } as unknown as Parameters<typeof registerNotionRoutes>[1]['integrationManager'];
}

// ─── Fetch mock helpers ──────────────────────────────────────

let fetchSpy: ReturnType<typeof vi.spyOn>;

function mockFetchOk(data: Record<string, unknown>, status = 200) {
  fetchSpy.mockResolvedValueOnce({
    ok: status >= 200 && status < 300,
    status,
    json: async () => data,
  } as unknown as Response);
}

function mockFetchError(message: string, status = 400) {
  fetchSpy.mockResolvedValueOnce({
    ok: false,
    status,
    json: async () => ({ message }),
  } as unknown as Response);
}

// ─── Test setup ──────────────────────────────────────────────

describe('Notion Routes', () => {
  let app: FastifyInstance;
  let mgr: ReturnType<typeof createMockIntegrationManager>;

  beforeEach(async () => {
    fetchSpy = vi.spyOn(globalThis, 'fetch');
    mgr = createMockIntegrationManager(true);
    app = Fastify();
    registerNotionRoutes(app, { integrationManager: mgr });
    await app.ready();
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await app.close();
  });

  function expectNotionHeaders() {
    const call = fetchSpy.mock.calls[0];
    const init = call[1] as RequestInit;
    const headers = init.headers as Record<string, string>;
    expect(headers['Authorization']).toBe('Bearer ntn_test_key');
    expect(headers['Notion-Version']).toBe('2022-06-28');
    expect(headers['Content-Type']).toBe('application/json');
  }

  // ─── POST /search ───────────────────────────────────────────

  describe('POST /api/v1/integrations/notion/search', () => {
    const url = '/api/v1/integrations/notion/search';

    it('returns search results on success', async () => {
      const results = { results: [{ id: 'page-1' }], has_more: false };
      mockFetchOk(results);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { query: 'hello', filter: 'page', pageSize: 10 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(results);
      expect(fetchSpy).toHaveBeenCalledOnce();
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.notion.com/v1/search');
      expectNotionHeaders();

      const sentBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody.query).toBe('hello');
      expect(sentBody.filter).toEqual({ value: 'page', property: 'object' });
      expect(sentBody.page_size).toBe(10);
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({ method: 'POST', url, payload: {} });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Invalid query', 422);

      const res = await app.inject({ method: 'POST', url, payload: { query: 'x' } });

      expect(res.statusCode).toBe(422);
      expect(res.json().message).toBe('Invalid query');
    });
  });

  // ─── GET /pages/:pageId ─────────────────────────────────────

  describe('GET /api/v1/integrations/notion/pages/:pageId', () => {
    const url = '/api/v1/integrations/notion/pages/page-123';

    it('returns page data on success', async () => {
      const page = { id: 'page-123', object: 'page' };
      mockFetchOk(page);

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(page);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.notion.com/v1/pages/page-123');
      expectNotionHeaders();
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Page not found', 404);

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Page not found');
    });
  });

  // ─── POST /pages (create) ──────────────────────────────────

  describe('POST /api/v1/integrations/notion/pages', () => {
    const url = '/api/v1/integrations/notion/pages';

    it('creates a page and returns 201', async () => {
      const created = { id: 'page-new', object: 'page' };
      mockFetchOk(created);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { parentDatabaseId: 'db-1', title: 'New Page' },
      });

      expect(res.statusCode).toBe(201);
      expect(res.json()).toEqual(created);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.notion.com/v1/pages');
      expectNotionHeaders();

      const sentBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody.parent).toEqual({ database_id: 'db-1' });
      expect(sentBody.properties.title).toEqual({ title: [{ text: { content: 'New Page' } }] });
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { parentDatabaseId: 'db-1', title: 'X' },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
    });

    it('returns 400 when parentDatabaseId is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { title: 'No Parent' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('parentDatabaseId and title are required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when title is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { parentDatabaseId: 'db-1' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('parentDatabaseId and title are required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Validation error', 400);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { parentDatabaseId: 'db-1', title: 'Bad' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Validation error');
    });
  });

  // ─── PUT /pages/:pageId (update) ───────────────────────────

  describe('PUT /api/v1/integrations/notion/pages/:pageId', () => {
    const url = '/api/v1/integrations/notion/pages/page-456';

    it('updates page properties on success', async () => {
      const updated = { id: 'page-456', object: 'page' };
      mockFetchOk(updated);

      const properties = { Status: { select: { name: 'Done' } } };
      const res = await app.inject({
        method: 'PUT',
        url,
        payload: { properties },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(updated);
      expect(fetchSpy.mock.calls[0][0]).toBe('https://api.notion.com/v1/pages/page-456');
      expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
      expectNotionHeaders();

      const sentBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody.properties).toEqual(properties);
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({
        method: 'PUT',
        url,
        payload: { properties: {} },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
    });

    it('returns 400 when properties is missing', async () => {
      const res = await app.inject({
        method: 'PUT',
        url,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('properties are required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Conflict', 409);

      const res = await app.inject({
        method: 'PUT',
        url,
        payload: { properties: { x: 1 } },
      });

      expect(res.statusCode).toBe(409);
      expect(res.json().message).toBe('Conflict');
    });
  });

  // ─── GET /pages/:pageId/blocks ─────────────────────────────

  describe('GET /api/v1/integrations/notion/pages/:pageId/blocks', () => {
    const url = '/api/v1/integrations/notion/pages/page-789/blocks';

    it('returns block children on success', async () => {
      const blocks = { results: [{ id: 'block-1', type: 'paragraph' }], has_more: false };
      mockFetchOk(blocks);

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(blocks);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'https://api.notion.com/v1/blocks/page-789/children'
      );
      expectNotionHeaders();
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Rate limited', 429);

      const res = await app.inject({ method: 'GET', url });

      expect(res.statusCode).toBe(429);
      expect(res.json().message).toBe('Rate limited');
    });
  });

  // ─── POST /pages/:pageId/blocks (append) ───────────────────

  describe('POST /api/v1/integrations/notion/pages/:pageId/blocks', () => {
    const url = '/api/v1/integrations/notion/pages/page-abc/blocks';

    it('appends blocks on success', async () => {
      const result = { results: [{ id: 'block-new' }] };
      mockFetchOk(result);

      const children = [{ type: 'paragraph', paragraph: { rich_text: [{ text: { content: 'Hi' } }] } }];
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { children },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(result);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'https://api.notion.com/v1/blocks/page-abc/children'
      );
      expect((fetchSpy.mock.calls[0][1] as RequestInit).method).toBe('PATCH');
      expectNotionHeaders();

      const sentBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody.children).toEqual(children);
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { children: [] },
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
    });

    it('returns 400 when children is missing', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: {},
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('children array is required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('returns 400 when children is not an array', async () => {
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { children: 'not-an-array' },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('children array is required');
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Block limit exceeded', 400);

      const res = await app.inject({
        method: 'POST',
        url,
        payload: { children: [{ type: 'paragraph' }] },
      });

      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Block limit exceeded');
    });
  });

  // ─── POST /databases/:databaseId/query ─────────────────────

  describe('POST /api/v1/integrations/notion/databases/:databaseId/query', () => {
    const url = '/api/v1/integrations/notion/databases/db-999/query';

    it('queries database on success', async () => {
      const queryResult = { results: [{ id: 'row-1' }], has_more: false };
      mockFetchOk(queryResult);

      const filter = { property: 'Status', select: { equals: 'Done' } };
      const sorts = [{ property: 'Created', direction: 'descending' }];
      const res = await app.inject({
        method: 'POST',
        url,
        payload: { filter, sorts, pageSize: 25 },
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(queryResult);
      expect(fetchSpy.mock.calls[0][0]).toBe(
        'https://api.notion.com/v1/databases/db-999/query'
      );
      expectNotionHeaders();

      const sentBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody.filter).toEqual(filter);
      expect(sentBody.sorts).toEqual(sorts);
      expect(sentBody.page_size).toBe(25);
    });

    it('sends empty body when no filters provided', async () => {
      mockFetchOk({ results: [], has_more: false });

      const res = await app.inject({ method: 'POST', url, payload: {} });

      expect(res.statusCode).toBe(200);
      const sentBody = JSON.parse((fetchSpy.mock.calls[0][1] as RequestInit).body as string);
      expect(sentBody).toEqual({});
    });

    it('returns 401 when no integration configured', async () => {
      mgr.listIntegrations = vi.fn().mockResolvedValue([]);

      const res = await app.inject({ method: 'POST', url, payload: {} });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toBe('No Notion integration configured');
    });

    it('forwards upstream API error', async () => {
      mockFetchError('Database not found', 404);

      const res = await app.inject({ method: 'POST', url, payload: {} });

      expect(res.statusCode).toBe(404);
      expect(res.json().message).toBe('Database not found');
    });
  });
});
