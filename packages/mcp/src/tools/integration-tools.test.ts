import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerIntegrationTools } from './integration-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ integrations: [{ id: 'int-1', platform: 'slack' }] }),
    post: vi.fn().mockResolvedValue({ message: 'Sent' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
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

describe('integration-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 3 integration tools without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerIntegrationTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('integration_list', () => {
    it('calls GET /api/v1/integrations with no query when no platform filter', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntegrationTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('integration_list')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/integrations', {});
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.integrations).toHaveLength(1);
    });

    it('includes platform filter when provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntegrationTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('integration_list')!;
      await handler({ platform: 'telegram' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/integrations', { platform: 'telegram' });
    });
  });

  describe('integration_send', () => {
    it('calls POST /api/v1/integrations/:id/messages', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntegrationTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('integration_send')!;
      const result = await handler({
        integrationId: 'int-1',
        chatId: 'ch-42',
        text: 'Hello world',
      });

      expect(result.isError).toBeFalsy();
      expect(client.post).toHaveBeenCalledWith('/api/v1/integrations/int-1/messages', {
        chatId: 'ch-42',
        text: 'Hello world',
      });
    });
  });

  describe('integration_status', () => {
    it('calls GET /api/v1/integrations/:id', async () => {
      const client = mockClient({
        get: vi.fn().mockResolvedValue({ id: 'int-1', status: 'healthy' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntegrationTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('integration_status')!;
      const result = await handler({ id: 'int-1' });

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/integrations/int-1');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('healthy');
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Timeout')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerIntegrationTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('integration_list')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Timeout');
    });
  });
});
