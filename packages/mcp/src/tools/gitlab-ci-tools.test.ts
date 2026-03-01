/**
 * GitLab CI MCP Tools — unit tests
 *
 * Tests registration, disabled-gate behavior, and fetch wiring
 * for all 5 gitlab_* tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGitlabCiTools } from './gitlab-ci-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeGitlabCi: true,
    gitlabUrl: 'https://gitlab.com',
    gitlabToken: 'glpat-abc123',
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
      text: () => Promise.resolve(typeof body === 'string' ? body : JSON.stringify(body)),
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('gitlab-ci-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers all 5 gitlab_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGitlabCiTools(server, baseConfig(), noopMiddleware())).not.toThrow();
  });

  describe('disabled gate', () => {
    it('returns isError when exposeGitlabCi=false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig({ exposeGitlabCi: false }), noopMiddleware());
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_list_pipelines')!({
        projectId: '42', ref: '', status: '', perPage: 10,
      });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('exposeGitlabCi=true');
    });
  });

  describe('gitlab_list_pipelines', () => {
    it('returns pipeline list on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      mockFetchOk([{ id: 1, status: 'success' }]);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_list_pipelines')!({
        projectId: '42', ref: '', status: '', perPage: 20,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('success');
    });

    it('returns isError on 403', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ message: 'Forbidden' }, 403);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_list_pipelines')!({
        projectId: '42', ref: '', status: '', perPage: 10,
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('gitlab_trigger_pipeline', () => {
    it('returns pipeline data on 201', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ id: 100, status: 'created', web_url: 'https://gitlab.com/p/r/-/pipelines/100' }, 201);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_trigger_pipeline')!({
        projectId: '42', ref: 'main', variables: [],
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.id).toBe(100);
    });

    it('passes variables in request body', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 201,
        headers: { get: () => 'application/json' },
        json: () => Promise.resolve({ id: 101, status: 'created' }),
      });
      vi.stubGlobal('fetch', mockFetch);
      const { globalToolRegistry } = await import('./tool-utils.js');
      await globalToolRegistry.get('gitlab_trigger_pipeline')!({
        projectId: '42', ref: 'main', variables: [{ key: 'DEPLOY_ENV', value: 'staging' }],
      });
      const body = JSON.parse((mockFetch.mock.calls[0] as { 1: { body: string } }[])[1].body);
      expect(body.variables).toEqual([{ key: 'DEPLOY_ENV', value: 'staging' }]);
    });
  });

  describe('gitlab_get_pipeline', () => {
    it('returns pipeline details', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ id: 77, status: 'failed', sha: 'abc' });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_get_pipeline')!({
        projectId: '42', pipelineId: 77,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('failed');
    });
  });

  describe('gitlab_get_job_log', () => {
    it('returns trace text', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 200,
          headers: { get: () => 'text/plain' },
          text: () => Promise.resolve('Running build...\nOK'),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_get_job_log')!({
        projectId: '42', jobId: 55,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('Running build');
    });
  });

  describe('gitlab_cancel_pipeline', () => {
    it('returns updated pipeline on 200', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGitlabCiTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ id: 99, status: 'canceled' });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gitlab_cancel_pipeline')!({
        projectId: '42', pipelineId: 99,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('canceled');
    });
  });
});
