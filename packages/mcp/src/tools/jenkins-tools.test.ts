/**
 * Jenkins MCP Tools — unit tests
 *
 * Tests registration, disabled-gate behavior, and fetch wiring
 * for all 5 jenkins_* tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerJenkinsTools } from './jenkins-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeJenkins: true,
    jenkinsUrl: 'https://ci.example.com',
    jenkinsUsername: 'admin',
    jenkinsApiToken: 'token123',
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
    exposeGitlabCi: false,
    gitlabUrl: 'https://gitlab.com',
    exposeNorthflank: false,
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

describe('jenkins-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers all 5 jenkins_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerJenkinsTools(server, baseConfig(), noopMiddleware())).not.toThrow();
  });

  describe('disabled gate', () => {
    it('returns isError when exposeJenkins=false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig({ exposeJenkins: false }), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_list_jobs')!({});
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('exposeJenkins=true');
    });
  });

  describe('jenkins_list_jobs', () => {
    it('returns job list on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ jobs: [{ name: 'my-job', color: 'blue' }] });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_list_jobs')!({});
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('my-job');
    });

    it('returns isError on 401', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ message: 'Unauthorized' }, 401);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_list_jobs')!({});
      expect(result.isError).toBe(true);
    });
  });

  describe('jenkins_trigger_build', () => {
    it('returns triggered:true on 201', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 201,
          headers: { get: () => '' },
          text: () => Promise.resolve(''),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_trigger_build')!({
        jobName: 'my-job',
        parameters: {},
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.triggered).toBe(true);
    });

    it('uses buildWithParameters endpoint when parameters provided', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: { get: () => '' },
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);
      const { globalToolRegistry } = await import('./tool-utils.js');
      await globalToolRegistry.get('jenkins_trigger_build')!({
        jobName: 'my-job',
        parameters: { ENV: 'prod' },
      });
      const url = (mockFetch.mock.calls[0] as string[])[0]!;
      expect(url).toContain('buildWithParameters');
    });
  });

  describe('jenkins_get_build', () => {
    it('returns build details on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ number: 42, result: 'SUCCESS', duration: 3000 });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_get_build')!({
        jobName: 'my-job',
        buildNumber: 42,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('SUCCESS');
    });
  });

  describe('jenkins_get_build_log', () => {
    it('returns console text on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Build started\nBuild success'),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_get_build_log')!({
        jobName: 'my-job',
        buildNumber: 42,
        startByte: 0,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('Build success');
    });
  });

  describe('jenkins_queue_item', () => {
    it('returns queue item on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerJenkinsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ id: 5, executable: { number: 42 } });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('jenkins_queue_item')!({ itemId: 5 });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('executable');
    });
  });
});
