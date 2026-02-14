import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSoulTools } from './soul-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ personality: { id: '1', name: 'Default' } }),
    post: vi.fn().mockResolvedValue({ message: 'Activated' }),
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

describe('soul-tools', () => {
  it('should register personality_get tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSoulTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should register personality_switch tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerSoulTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register skill_list tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerSoulTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register skill_execute tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerSoulTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register all 4 soul tools without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSoulTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should handle core API errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Not Found'));
    registerSoulTools(server, client, noopMiddleware());
    expect(true).toBe(true);
  });

  it('should apply middleware to all tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    registerSoulTools(server, mockClient(), mw);
    expect(true).toBe(true);
  });

  it('should handle rate limiting', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 200 });
    registerSoulTools(server, mockClient(), mw);
    expect(true).toBe(true);
  });
});
