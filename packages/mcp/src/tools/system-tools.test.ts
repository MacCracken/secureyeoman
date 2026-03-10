import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSystemTools } from './system-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ status: 'ok' }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
    ...overrides,
  } as unknown as CoreApiClient;
}

function makeConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: true,
    coreUrl: 'http://127.0.0.1:18789',
    tokenSecret: 'a-secret-token-that-is-at-least-32-characters',
    exposeFilesystem: false,
    allowedPaths: [],
    rateLimitPerTool: 30,
    logLevel: 'info',
    ...overrides,
  } as McpServiceConfig;
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

describe('system-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 3 system tools without errors', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() =>
      registerSystemTools(server, mockClient(), makeConfig(), noopMiddleware())
    ).not.toThrow();
  });

  describe('system_health', () => {
    it('calls GET /health and returns status', async () => {
      const client = mockClient({
        get: vi.fn().mockResolvedValue({ status: 'ok', uptime: 12345 }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSystemTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('system_health')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/health');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.status).toBe('ok');
    });

    it('returns error on API failure', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Unreachable')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSystemTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('system_health')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Unreachable');
    });
  });

  describe('system_metrics', () => {
    it('calls GET /api/v1/metrics', async () => {
      const client = mockClient({
        get: vi.fn().mockResolvedValue({ requests: 100, errors: 2 }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSystemTools(server, client, makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('system_metrics')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/metrics');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.requests).toBe(100);
    });
  });

  describe('system_config', () => {
    it('returns config with tokenSecret redacted', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSystemTools(server, mockClient(), makeConfig(), noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('system_config')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.tokenSecret).toBe('[REDACTED]');
      expect(parsed.enabled).toBe(true);
      expect(parsed.port).toBe(3001);
      expect(parsed.coreUrl).toBe('http://127.0.0.1:18789');
    });

    it('includes all expected config fields', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeFilesystem: true,
        allowedPaths: ['/tmp'],
        logLevel: 'debug',
      });
      registerSystemTools(server, mockClient(), config, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('system_config')!;
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.exposeFilesystem).toBe(true);
      expect(parsed.allowedPaths).toEqual(['/tmp']);
      expect(parsed.logLevel).toBe('debug');
    });
  });
});
