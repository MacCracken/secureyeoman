/**
 * Docker MCP Tools — unit tests
 *
 * Verifies registration, disabled-gate behavior, and basic execFile wiring
 * for all 14 docker_* tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDockerTools } from './docker-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Mocks ───────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  execFile: vi.fn((_cmd, _args, _opts, cb) => {
    cb(null, '{}', '');
  }),
}));

import { execFile } from 'node:child_process';
const mockExecFile = vi.mocked(execFile);

function baseConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    exposeDockerTools: true,
    dockerMode: 'socket',
    dockerHost: undefined,
    // Required fields (defaults)
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
    ...overrides,
  } as unknown as McpServiceConfig;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('docker-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: null, stdout: string, stderr: string) => void)(null, '{}', '');
      return undefined as unknown as ReturnType<typeof execFile>;
    });
  });

  it('registers all 14 docker_* tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerDockerTools(server, baseConfig(), noopMiddleware())).not.toThrow();
  });

  it('returns disabled message when exposeDockerTools=false', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = baseConfig({ exposeDockerTools: false });
    registerDockerTools(server, config, noopMiddleware());

    // Access the registered handler via the global registry
    const { globalToolRegistry } = await import('./tool-utils.js');
    const handler = globalToolRegistry.get('docker_ps');
    expect(handler).toBeDefined();
    const result = await handler!({ all: false });
    expect(result.isError).toBe(true);
    expect((result.content[0] as { text: string }).text).toContain('MCP_EXPOSE_DOCKER=true');
  });

  it('calls execFile with docker args for docker_ps', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDockerTools(server, baseConfig(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    mockExecFile.mockImplementation((_cmd, _args, _opts, cb) => {
      (cb as (err: null, stdout: string, stderr: string) => void)(null, '{"Names":"web"}\n', '');
      return undefined as unknown as ReturnType<typeof execFile>;
    });

    const result = await globalToolRegistry.get('docker_ps')!({ all: false });
    expect(result.isError).toBeFalsy();
    expect(mockExecFile).toHaveBeenCalledWith(
      'docker',
      expect.arrayContaining(['ps', '--format', '{{json .}}']),
      expect.any(Object),
      expect.any(Function)
    );
  });

  it('includes --all flag when all=true in docker_ps', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDockerTools(server, baseConfig(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_ps')!({ all: true });
    const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain('--all');
  });

  it('calls docker logs with correct args', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDockerTools(server, baseConfig(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_logs')!({ container: 'my-app', tail: 50, timestamps: false });
    const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain('logs');
    expect(args).toContain('my-app');
    expect(args).toContain('50');
  });

  it('sets DOCKER_HOST env when dockerMode=dind', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = baseConfig({ dockerMode: 'dind', dockerHost: 'tcp://docker:2376' });
    registerDockerTools(server, config, noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_ps')!({ all: false });
    const opts = (mockExecFile.mock.calls[0] as unknown[])[2] as { env?: Record<string, string> };
    expect(opts.env?.DOCKER_HOST).toBe('tcp://docker:2376');
  });

  it('does not override DOCKER_HOST when dockerMode=socket', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const config = baseConfig({ dockerMode: 'socket', dockerHost: undefined });
    registerDockerTools(server, config, noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_ps')!({ all: false });
    const opts = (mockExecFile.mock.calls[0] as unknown[])[2] as { env?: Record<string, string> };
    // In socket mode no explicit DOCKER_HOST injection (it may or may not be in process.env)
    expect(opts.env?.DOCKER_HOST).toBeUndefined();
  });

  it('calls docker exec with command array (no shell injection)', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDockerTools(server, baseConfig(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_exec')!({
      container: 'app',
      command: ['sh', '-c', 'echo hello'],
      workdir: '/app',
      user: undefined,
    });
    const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain('exec');
    expect(args).toContain('app');
    expect(args).toContain('sh');
    expect(args).toContain('-c');
    expect(args).toContain('echo hello');
    // Verify each arg is a separate element — no shell wrapping like `sh -c "cmd"`
    expect(args.indexOf('echo hello')).toBeGreaterThan(args.indexOf('-c'));
  });

  it('calls docker compose up with --detach flag', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDockerTools(server, baseConfig(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_compose_up')!({
      workdir: '/app',
      services: [],
      build: false,
      pull: 'missing',
    });
    const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain('compose');
    expect(args).toContain('up');
    expect(args).toContain('--detach');
  });

  it('includes --volumes flag in docker_compose_down when volumes=true', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    registerDockerTools(server, baseConfig(), noopMiddleware());

    const { globalToolRegistry } = await import('./tool-utils.js');
    await globalToolRegistry.get('docker_compose_down')!({
      workdir: '/app',
      volumes: true,
      removeOrphans: false,
    });
    const args = (mockExecFile.mock.calls[0] as unknown[])[1] as string[];
    expect(args).toContain('--volumes');
  });
});
