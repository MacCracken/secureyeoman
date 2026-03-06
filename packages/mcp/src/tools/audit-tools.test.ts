/**
 * Audit Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAuditTools } from './audit-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ entries: [{ id: 'e1', event: 'login' }] }),
    post: vi.fn().mockResolvedValue({ valid: true, chainLength: 100 }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('audit-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 3 audit tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAuditTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('audit_query', () => {
    it('calls GET /api/v1/audit with filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAuditTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('audit_query')!;
      const result = await handler({ event: 'login', level: 'warn', limit: 25 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/audit', {
        event: 'login',
        level: 'warn',
        limit: '25',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.entries).toHaveLength(1);
    });

    it('sends only limit when no filters provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAuditTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('audit_query')!;
      await handler({ limit: 50 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/audit', { limit: '50' });
    });
  });

  describe('audit_verify', () => {
    it('calls POST /api/v1/audit/verify', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAuditTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('audit_verify')!;
      const result = await handler({});

      expect(client.post).toHaveBeenCalledWith('/api/v1/audit/verify');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.valid).toBe(true);
    });
  });

  describe('audit_stats', () => {
    it('calls GET /api/v1/audit/stats', async () => {
      const client = mockClient({
        get: vi.fn().mockResolvedValue({ totalEntries: 1500, avgPerDay: 42 }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAuditTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('audit_stats')!;
      const result = await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/audit/stats');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.totalEntries).toBe(1500);
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Unauthorized')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAuditTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('audit_query')!;
      const result = await handler({ limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unauthorized');
    });
  });

  describe('rate limiting', () => {
    it('returns rate limit error when not allowed', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const mw = noopMiddleware();
      mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 1000 });
      registerAuditTools(server, mockClient(), mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('audit_query')!;
      const result = await handler({ limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit');
    });
  });
});
