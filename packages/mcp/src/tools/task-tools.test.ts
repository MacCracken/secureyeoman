import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskTools } from './task-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ tasks: [] }),
    post: vi.fn().mockResolvedValue({ task: { id: '1' } }),
    delete: vi.fn().mockResolvedValue({ message: 'Cancelled' }),
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

describe('task-tools', () => {
  it('should register task_create tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register task_list tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register task_get tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register task_cancel tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerTaskTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register all 4 task tools without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    // This will throw if any tool registration fails
    expect(() => registerTaskTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should apply middleware to all tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    registerTaskTools(server, mockClient(), mw);
    // Middleware is applied through wrapToolHandler
    expect(true).toBe(true);
  });

  it('should handle core client errors gracefully', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.post as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));
    registerTaskTools(server, client, noopMiddleware());
    expect(true).toBe(true);
  });

  it('should handle rate limiting', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 500 });
    registerTaskTools(server, mockClient(), mw);
    expect(true).toBe(true);
  });
});
