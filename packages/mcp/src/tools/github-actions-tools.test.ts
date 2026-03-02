/**
 * GitHub Actions MCP Tools — unit tests
 *
 * Tests registration, disabled-gate behavior, and fetch wiring
 * for all 6 gha_* tools.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerGithubActionsTools } from './github-actions-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function baseConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeGithubActions: true,
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
    exposeJenkins: false,
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

describe('github-actions-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers all 6 gha_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerGithubActionsTools(server, baseConfig(), noopMiddleware())).not.toThrow();
  });

  describe('disabled gate', () => {
    it('returns isError when exposeGithubActions=false (gha_list_workflows)', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(
        server,
        baseConfig({ exposeGithubActions: false }),
        noopMiddleware()
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_list_workflows')!({ owner: 'o', repo: 'r' });
      expect(result.isError).toBe(true);
      expect((result.content[0] as { text: string }).text).toContain('exposeGithubActions=true');
    });

    it('returns isError when exposeGithubActions=false (gha_dispatch_workflow)', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(
        server,
        baseConfig({ exposeGithubActions: false }),
        noopMiddleware()
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_dispatch_workflow')!({
        owner: 'o',
        repo: 'r',
        workflowId: 'ci.yml',
        ref: 'main',
        inputs: {},
      });
      expect(result.isError).toBe(true);
    });
  });

  describe('gha_list_workflows', () => {
    it('returns workflow list on 200 response', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ workflows: [{ id: 1, name: 'CI' }], total_count: 1 });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_list_workflows')!({
        owner: 'org',
        repo: 'repo',
      });
      expect(result.isError).toBeFalsy();
      const text = (result.content[0] as { text: string }).text;
      expect(text).toContain('workflows');
    });

    it('returns isError on 404', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ message: 'Not Found' }, 404);
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_list_workflows')!({ owner: 'x', repo: 'y' });
      expect(result.isError).toBe(true);
    });
  });

  describe('gha_dispatch_workflow', () => {
    it('returns dispatched:true on 204 response', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 204,
          headers: { get: () => '' },
          text: () => Promise.resolve(''),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_dispatch_workflow')!({
        owner: 'org',
        repo: 'repo',
        workflowId: 'ci.yml',
        ref: 'main',
        inputs: {},
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.dispatched).toBe(true);
    });

    it('passes inputs in request body', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      const mockFetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 204,
        headers: { get: () => '' },
        text: () => Promise.resolve(''),
      });
      vi.stubGlobal('fetch', mockFetch);
      const { globalToolRegistry } = await import('./tool-utils.js');
      await globalToolRegistry.get('gha_dispatch_workflow')!({
        owner: 'org',
        repo: 'repo',
        workflowId: 'ci.yml',
        ref: 'feature',
        inputs: { env: 'staging' },
      });
      const callBody = JSON.parse(
        (mockFetch.mock.calls[0] as unknown as { 1: { body: string } }[])[1].body
      );
      expect(callBody.inputs).toEqual({ env: 'staging' });
      expect(callBody.ref).toBe('feature');
    });
  });

  describe('gha_list_runs', () => {
    it('returns run list on success', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ workflow_runs: [{ id: 42, status: 'completed' }], total_count: 1 });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_list_runs')!({
        owner: 'o',
        repo: 'r',
        branch: '',
        status: '',
        perPage: 10,
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('gha_get_run', () => {
    it('returns run details on success', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      mockFetchOk({ id: 99, status: 'completed', conclusion: 'success' });
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_get_run')!({
        owner: 'o',
        repo: 'r',
        runId: 99,
      });
      expect(result.isError).toBeFalsy();
      expect((result.content[0] as { text: string }).text).toContain('success');
    });
  });

  describe('gha_cancel_run', () => {
    it('returns cancelled:true on 202', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          status: 202,
          headers: { get: () => '' },
          text: () => Promise.resolve(''),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_cancel_run')!({
        owner: 'o',
        repo: 'r',
        runId: 55,
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.cancelled).toBe(true);
    });
  });

  describe('gha_get_run_logs', () => {
    it('returns logsUrl from 302 Location header', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 302,
          headers: {
            get: (h: string) => (h === 'location' ? 'https://s3.example.com/logs.zip' : null),
          },
          text: () => Promise.resolve(''),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_get_run_logs')!({
        owner: 'o',
        repo: 'r',
        runId: 77,
      });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse((result.content[0] as { text: string }).text);
      expect(parsed.logsUrl).toBe('https://s3.example.com/logs.zip');
    });

    it('returns non-error response on 200 (logs returned inline)', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerGithubActionsTools(server, baseConfig(), noopMiddleware());
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          status: 200,
          headers: { get: () => null },
          text: () => Promise.resolve('log content here'),
        })
      );
      const { globalToolRegistry } = await import('./tool-utils.js');
      const result = await globalToolRegistry.get('gha_get_run_logs')!({
        owner: 'o',
        repo: 'r',
        runId: 78,
      });
      expect(result.isError).toBeFalsy();
    });
  });
});
