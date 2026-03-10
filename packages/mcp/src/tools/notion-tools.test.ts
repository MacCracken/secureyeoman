/**
 * Notion MCP Tools — unit tests
 *
 * Verifies that all 7 notion_* tools register and proxy correctly
 * through to the core API client via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNotionTools } from './notion-tools.js';
import { globalToolRegistry } from './tool-utils.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ results: [] }),
    post: vi.fn().mockResolvedValue({ id: 'page-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({ id: 'page-1' }),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('notion-tools', () => {
  let client: CoreApiClient;

  beforeEach(() => {
    vi.clearAllMocks();
    client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, client, noopMiddleware());
  });

  it('registers all 7 notion_* tools in globalToolRegistry', () => {
    const tools = [
      'notion_search',
      'notion_get_page',
      'notion_create_page',
      'notion_update_page',
      'notion_get_page_blocks',
      'notion_append_blocks',
      'notion_query_database',
    ];
    for (const t of tools) {
      expect(globalToolRegistry.has(t)).toBe(true);
    }
  });

  // ── notion_search ──────────────────────────────────────────

  it('notion_search calls POST with body', async () => {
    const handler = globalToolRegistry.get('notion_search')!;
    const result = await handler({ query: 'meeting notes', filter: 'page', pageSize: 20 });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/notion/search', {
      query: 'meeting notes',
      filter: 'page',
      pageSize: 20,
    });
  });

  it('notion_search defaults pageSize to 10', async () => {
    const handler = globalToolRegistry.get('notion_search')!;
    await handler({ query: 'test' });
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.pageSize).toBe(10);
  });

  // ── notion_get_page ────────────────────────────────────────

  it('notion_get_page calls GET with pageId in path', async () => {
    const handler = globalToolRegistry.get('notion_get_page')!;
    const result = await handler({ pageId: 'abc-123-def' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/notion/pages/abc-123-def',
      undefined
    );
  });

  // ── notion_create_page ─────────────────────────────────────

  it('notion_create_page calls POST with body', async () => {
    const handler = globalToolRegistry.get('notion_create_page')!;
    const props = JSON.stringify({ Status: { select: { name: 'Active' } } });
    const result = await handler({
      parentDatabaseId: 'db-1',
      title: 'New Page',
      properties: props,
    });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/notion/pages', {
      parentDatabaseId: 'db-1',
      title: 'New Page',
      properties: { Status: { select: { name: 'Active' } } },
    });
  });

  it('notion_create_page without properties', async () => {
    const handler = globalToolRegistry.get('notion_create_page')!;
    await handler({ parentDatabaseId: 'db-1', title: 'Simple Page' });
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.properties).toBeUndefined();
  });

  // ── notion_update_page ─────────────────────────────────────

  it('notion_update_page calls PUT with parsed JSON properties', async () => {
    const handler = globalToolRegistry.get('notion_update_page')!;
    const props = JSON.stringify({ Name: { title: [{ text: { content: 'Updated' } }] } });
    const result = await handler({ pageId: 'page-1', properties: props });
    expect(result.isError).toBeFalsy();
    expect(client.put).toHaveBeenCalledWith('/api/v1/integrations/notion/pages/page-1', {
      pageId: 'page-1',
      properties: { Name: { title: [{ text: { content: 'Updated' } }] } },
    });
  });

  // ── notion_get_page_blocks ─────────────────────────────────

  it('notion_get_page_blocks calls GET with pageId in path', async () => {
    const handler = globalToolRegistry.get('notion_get_page_blocks')!;
    const result = await handler({ pageId: 'page-1' });
    expect(result.isError).toBeFalsy();
    expect(client.get).toHaveBeenCalledWith(
      '/api/v1/integrations/notion/pages/page-1/blocks',
      undefined
    );
  });

  // ── notion_append_blocks ───────────────────────────────────

  it('notion_append_blocks calls POST with parsed children JSON', async () => {
    const children = JSON.stringify([{ type: 'paragraph', paragraph: { text: [{ text: { content: 'Hello' } }] } }]);
    const handler = globalToolRegistry.get('notion_append_blocks')!;
    const result = await handler({ pageId: 'page-1', children });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/notion/pages/page-1/blocks',
      {
        pageId: 'page-1',
        children: [{ type: 'paragraph', paragraph: { text: [{ text: { content: 'Hello' } }] } }],
      }
    );
  });

  // ── notion_query_database ──────────────────────────────────

  it('notion_query_database calls POST with filter and sorts', async () => {
    const filter = JSON.stringify({ property: 'Status', select: { equals: 'Done' } });
    const sorts = JSON.stringify([{ property: 'Created', direction: 'descending' }]);
    const handler = globalToolRegistry.get('notion_query_database')!;
    const result = await handler({ databaseId: 'db-1', filter, sorts, pageSize: 50 });
    expect(result.isError).toBeFalsy();
    expect(client.post).toHaveBeenCalledWith(
      '/api/v1/integrations/notion/databases/db-1/query',
      {
        databaseId: 'db-1',
        filter: { property: 'Status', select: { equals: 'Done' } },
        sorts: [{ property: 'Created', direction: 'descending' }],
        pageSize: 50,
      }
    );
  });

  it('notion_query_database defaults pageSize to 25', async () => {
    const handler = globalToolRegistry.get('notion_query_database')!;
    await handler({ databaseId: 'db-1' });
    const body = (client.post as ReturnType<typeof vi.fn>).mock.calls[0][1];
    expect(body.pageSize).toBe(25);
    expect(body.filter).toBeUndefined();
    expect(body.sorts).toBeUndefined();
  });

  // ── Error handling ──────────────────────────────────────────────

  it('returns isError when API throws', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const handler = globalToolRegistry.get('notion_get_page')!;
    const result = await handler({ pageId: 'x' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Network error');
  });

  it('returns JSON response on success', async () => {
    (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({ id: 'page-1', title: 'Test' });
    const handler = globalToolRegistry.get('notion_get_page')!;
    const result = await handler({ pageId: 'page-1' });
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.id).toBe('page-1');
    expect(parsed.title).toBe('Test');
  });
});
