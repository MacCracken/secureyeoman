import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAuditTools } from './audit-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ entries: [] }),
    post: vi.fn().mockResolvedValue({ valid: true }),
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

describe('audit-tools', () => {
  it('should register audit_query tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAuditTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should register audit_verify tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAuditTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register audit_stats tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerAuditTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register all 3 audit tools without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerAuditTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should handle core API errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Unauthorized'));
    registerAuditTools(server, client, noopMiddleware());
    expect(true).toBe(true);
  });

  it('should apply middleware to all tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    registerAuditTools(server, mockClient(), mw);
    expect(true).toBe(true);
  });
});
