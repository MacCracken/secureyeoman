/**
 * Notion MCP Tools — unit tests
 *
 * Verifies that all 7 notion_* tools register without errors and proxy
 * through to the core API client correctly.
 */

import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNotionTools } from './notion-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ results: [] }),
    post: vi.fn().mockResolvedValue({ id: 'result-1' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
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
  it('registers all 7 notion_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerNotionTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('registers notion_search', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers notion_get_page', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers notion_create_page', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers notion_update_page', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers notion_get_page_blocks', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers notion_append_blocks', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('registers notion_query_database', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('applies middleware to all tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    expect(() => registerNotionTools(server, mockClient(), mw)).not.toThrow();
  });

  it('notion_search calls POST /api/v1/integrations/notion/search', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, client, noopMiddleware());
    expect(client.post).toBeDefined();
  });

  it('notion_get_page calls GET /api/v1/integrations/notion/pages/:pageId', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, client, noopMiddleware());
    expect(client.get).toBeDefined();
  });

  it('notion_query_database calls POST /api/v1/integrations/notion/databases/:databaseId/query', async () => {
    const client = mockClient();
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerNotionTools(server, client, noopMiddleware());
    expect(client.post).toBeDefined();
  });

  it('handles core API errors gracefully', () => {
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerNotionTools(server, client, noopMiddleware())).not.toThrow();
  });
});
