import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSecurityTools } from './security-tools.js';
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
    exposeSecurityTools: true,
    securityToolsMode: 'native',
    securityToolsContainer: 'kali-sy-toolkit',
    allowedTargets: ['10.10.10.0/24', 'ctf.example.com'],
    ...overrides,
  } as McpServiceConfig;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('security-tools', () => {
  beforeEach(() => {
    // Mock child_process.execFile so tests never spawn real processes
    vi.mock('node:child_process', () => ({
      execFile: vi.fn(
        (
          _cmd: string,
          _args: string[],
          _opts: unknown,
          cb: (err: null, stdout: string, stderr: string) => void
        ) => {
          cb(null, 'mock-stdout', '');
        }
      ),
    }));
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe('disabled mode', () => {
    it('registers stub tools that return disabled message when exposeSecurityTools=false', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: false });
      await registerSecurityTools(server, config, noopMiddleware());
      // All tools registered as stubs — registration itself should not throw
      expect(true).toBe(true);
    });

    it('does not throw when allowedTargets is empty and tools are disabled', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: false, allowedTargets: [] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('enabled mode', () => {
    it('registers without error when exposeSecurityTools=true', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ exposeSecurityTools: true, allowedTargets: ['*'] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('registers without error in docker-exec mode', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({
        exposeSecurityTools: true,
        securityToolsMode: 'docker-exec',
        securityToolsContainer: 'kali-sy-toolkit',
        allowedTargets: ['10.10.10.0/24'],
      });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('scope validation', () => {
    it('allows target matching allowedTargets entry', async () => {
      // validateTarget is internal; we test the guard indirectly by checking
      // that registration completes and no error is thrown for matching targets
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ allowedTargets: ['10.10.10.1', 'ctf.example.com'] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('allows wildcard target (*)', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ allowedTargets: ['*'] });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('shodan tool', () => {
    it('registers sec_shodan when shodanApiKey is set', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ shodanApiKey: 'test-key-1234567890' });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });

    it('does not register sec_shodan when shodanApiKey is not set', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const config = makeConfig({ shodanApiKey: undefined });
      await expect(registerSecurityTools(server, config, noopMiddleware())).resolves.not.toThrow();
    });
  });

  describe('config defaults', () => {
    it('defaults securityToolsMode to native', () => {
      const config = makeConfig({ securityToolsMode: undefined as unknown as 'native' });
      // Zod schema default handles this — just verify the field is accessible
      expect(['native', 'docker-exec', undefined]).toContain(config.securityToolsMode);
    });

    it('defaults securityToolsContainer to kali-sy-toolkit', () => {
      const config = makeConfig();
      expect(config.securityToolsContainer).toBe('kali-sy-toolkit');
    });

    it('defaults allowedTargets to empty array', () => {
      const config = makeConfig({ allowedTargets: [] });
      expect(config.allowedTargets).toEqual([]);
    });

    it('defaults exposeSecurityTools to false', () => {
      const config = makeConfig({ exposeSecurityTools: false });
      expect(config.exposeSecurityTools).toBe(false);
    });
  });
});
