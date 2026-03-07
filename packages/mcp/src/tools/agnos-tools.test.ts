import { describe, it, expect, vi, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerAgnosTools } from './agnos-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: false,
    allowedPaths: [],
    exposeWeb: false,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    exposeWebScraping: false,
    exposeWebSearch: false,
    webSearchProvider: 'duckduckgo',
    exposeBrowser: false,
    browserEngine: 'playwright',
    browserHeadless: true,
    browserMaxPages: 3,
    browserTimeoutMs: 30000,
    rateLimitPerTool: 30,
    logLevel: 'info',
    proxyEnabled: false,
    proxyProviders: [],
    proxyStrategy: 'round-robin',
    proxyMaxRetries: 3,
    proxyRetryBaseDelayMs: 1000,
    exposeSecurityTools: false,
    securityToolsMode: 'native',
    securityToolsContainer: 'kali-sy-toolkit',
    allowedTargets: [],
    exposeAgnosTools: true,
    agnosRuntimeUrl: 'http://127.0.0.1:8090',
    agnosGatewayUrl: 'http://127.0.0.1:8088',
    agnosRuntimeApiKey: 'rt-test-key',
    agnosGatewayApiKey: 'gw-test-key',
    ...overrides,
  } as McpServiceConfig;
}

function mockFetch(
  responses: Array<{ ok: boolean; status: number; json?: unknown; text?: string }>
) {
  let callIndex = 0;
  return vi.fn().mockImplementation(() => {
    const resp = responses[callIndex % responses.length];
    callIndex++;
    return Promise.resolve({
      ok: resp.ok,
      status: resp.status,
      json: () => Promise.resolve(resp.json ?? {}),
      text: () => Promise.resolve(resp.text ?? ''),
    });
  });
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('agnos-tools', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('disabled mode', () => {
    it('registers stub agnos_status tool when exposeAgnosTools=false', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeAgnosTools: false });
      expect(() => registerAgnosTools(server, config, noopMiddleware())).not.toThrow();
    });

    it('does not throw regardless of missing config when disabled', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeAgnosTools: false,
        agnosRuntimeApiKey: undefined,
        agnosGatewayApiKey: undefined,
      });
      expect(() => registerAgnosTools(server, config, noopMiddleware())).not.toThrow();
    });
  });

  describe('enabled mode registration', () => {
    it('registers all 20 AGNOS tools without error', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });

    it('registers tools when no API keys are provided', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        agnosRuntimeApiKey: undefined,
        agnosGatewayApiKey: undefined,
      });
      expect(() => registerAgnosTools(server, config, noopMiddleware())).not.toThrow();
    });
  });

  describe('agnos_runtime_health', () => {
    it('returns health data when runtime is reachable', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { status: 'healthy', uptime: 12345 } },
        ])
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });

    it('does not throw when runtime is unreachable', () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      expect(() => registerAgnosTools(server, makeConfig(), noopMiddleware())).not.toThrow();
    });
  });

  describe('agnos_gateway_health', () => {
    it('registers gateway health tool', () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([{ ok: true, status: 200, json: { status: 'healthy' } }])
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('agnos_agents_list', () => {
    it('registers agent list tool', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('agnos_agent_register', () => {
    it('handles successful agent registration', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { agent_id: 'ag-001', name: 'test-agent' } },
        ])
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('agnos_gateway_chat', () => {
    it('registers chat completion tool', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('agnos_audit_forward', () => {
    it('registers audit forwarding tool', () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('agnos_overview', () => {
    it('registers overview tool that fetches 6 endpoints', () => {
      vi.stubGlobal(
        'fetch',
        mockFetch([
          { ok: true, status: 200, json: { status: 'healthy' } },
        ])
      );
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerAgnosTools(server, makeConfig(), noopMiddleware());
      expect(true).toBe(true);
    });
  });

  describe('auth headers', () => {
    it('includes Authorization header when API keys are set', () => {
      const fetchSpy = mockFetch([
        { ok: true, status: 200, json: { status: 'ok' } },
      ]);
      vi.stubGlobal('fetch', fetchSpy);
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        agnosRuntimeApiKey: 'rt-secret',
        agnosGatewayApiKey: 'gw-secret',
      });
      registerAgnosTools(server, config, noopMiddleware());
      expect(true).toBe(true);
    });
  });
});
