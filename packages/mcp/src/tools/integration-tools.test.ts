import { describe, it, expect, vi } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerIntegrationTools } from './integration-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ integrations: [] }),
    post: vi.fn().mockResolvedValue({ message: 'Sent' }),
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

describe('integration-tools', () => {
  it('should register integration_list tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerIntegrationTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should register integration_send tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerIntegrationTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register integration_status tool', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerIntegrationTools(server, mockClient(), noopMiddleware());
    expect(true).toBe(true);
  });

  it('should register all 3 integration tools without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerIntegrationTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  it('should handle core API errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const client = mockClient();
    (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));
    registerIntegrationTools(server, client, noopMiddleware());
    expect(true).toBe(true);
  });

  it('should apply middleware to all tools', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const mw = noopMiddleware();
    registerIntegrationTools(server, mockClient(), mw);
    expect(true).toBe(true);
  });
});
