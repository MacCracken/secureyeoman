/**
 * Northflank MCP Tools — unit tests
 *
 * Tests registration, disabled-gate behavior, and fetch wiring
 * for all 5 northflank_* tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerNorthflankTools } from './northflank-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeNorthflank: true,
    northflankApiKey: 'nf-key-abc',
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    advertiseUrl: undefined,
    tokenSecret: undefined,
    exposeFilesystem: false,
    allowedPaths: [],
    exposeWeb: false,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    exposeWebScraping: true,
    exposeWebSearch: true,
    webSearchProvider: 'duckduckgo',
    webSearchApiKey: undefined,
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
    proxyDefaultCountry: undefined,
    proxyBrightdataUrl: undefined,
    proxyScrapingbeeKey: undefined,
    proxyScraperapiKey: undefined,
    proxyMaxRetries: 3,
    proxyRetryBaseDelayMs: 1000,
    exposeSecurityTools: false,
    securityToolsMode: 'native',
    securityToolsContainer: 'kali-sy-toolkit',
    allowedTargets: [],
    shodanApiKey: undefined,
    exposeAgnosticTools: false,
    agnosticUrl: 'http://127.0.0.1:8000',
    agnosticEmail: undefined,
    agnosticPassword: undefined,
    agnosticApiKey: undefined,
    exposeQuickBooksTools: false,
    quickBooksEnvironment: 'sandbox',
    quickBooksClientId: undefined,
    quickBooksClientSecret: undefined,
    quickBooksRealmId: undefined,
    quickBooksRefreshToken: undefined,
    exposeNetworkTools: false,
    allowedNetworkTargets: [],
    netboxUrl: undefined,
    netboxToken: undefined,
    nvdApiKey: undefined,
    exposeTwingateTools: false,
    twingateNetwork: undefined,
    twingateApiKey: undefined,
    exposeOrgIntentTools: false,
    respectContentSignal: true,
    allowBruteForce: false,
    exposeDockerTools: false,
    exposeGithubActions: false,
    exposeJenkins: false,
    exposeGitlabCi: false,
    gitlabUrl: 'https://gitlab.com',
    ...overrides,
  } as unknown as McpServiceConfig;
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

function mockFetchOk(body: unknown, status = 200): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockResolvedValue({
      ok: status < 400,
      status,
      headers: { get: () => 'application/json' },
      json: () => Promise.resolve(body),
      text: () => Promise.resolve(JSON.stringify(body)),
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('northflank-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers all 5 northflank_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerNorthflankTools(server, baseConfig(), noopMiddleware())).not.toThrow();
  });

  describe('disabled gate', () => {
    it('returns isError when exposeNorthflank=false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig({ exposeNorthflank: false }), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_list_services')!({ projectId: 'p1' });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('exposeNorthflank=true');
    });
  });

  describe('northflank_list_services', () => {
    it('returns services list on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ data: { services: [{ id: 'svc1', name: 'api' }] } });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_list_services')!({ projectId: 'p1' });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('svc1');
    });

    it('returns isError on 401', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ error: 'Unauthorized' }, 401);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_list_services')!({ projectId: 'p1' });
      expect(result.isError).toBe(true);
    });
  });

  describe('northflank_trigger_build', () => {
    it('returns build data on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ data: { id: 'build1', status: 'RUNNING' } });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_trigger_build')!({
        projectId: 'p1', serviceId: 'api', branch: 'main', sha: '',
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('build1');
    });
  });

  describe('northflank_get_build', () => {
    it('returns build details', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ data: { id: 'build1', status: 'SUCCEEDED' } });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_get_build')!({
        projectId: 'p1', serviceId: 'api', buildId: 'build1',
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('SUCCEEDED');
    });
  });

  describe('northflank_list_deployments', () => {
    it('returns deployments list', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ data: { deployments: [{ id: 'dep1' }] } });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_list_deployments')!({ projectId: 'p1' });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('dep1');
    });
  });

  describe('northflank_trigger_deployment', () => {
    it('returns deployment response on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerNorthflankTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ data: { status: 'DEPLOYING' } });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('northflank_trigger_deployment')!({
        projectId: 'p1', deploymentId: 'dep1', imageTag: 'v1.2.0',
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('DEPLOYING');
    });
  });
});
