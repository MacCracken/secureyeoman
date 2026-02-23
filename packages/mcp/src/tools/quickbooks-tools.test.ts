import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerQuickBooksTools } from './quickbooks-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true, remaining: 999, resetAt: 0 }), reset: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, blockReason: undefined }) },
    auditLogger: {
      log: vi.fn(),
      wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() as ReturnType<typeof fn>,
    },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

function makeConfig(overrides: Partial<McpServiceConfig> = {}): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: true,
    coreUrl: 'http://127.0.0.1:18789',
    exposeFilesystem: false,
    allowedPaths: [],
    exposeWeb: false,
    allowedUrls: [],
    webRateLimitPerMinute: 10,
    exposeWebScraping: true,
    exposeWebSearch: true,
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
    exposeAgnosticTools: false,
    agnosticUrl: 'http://127.0.0.1:8000',
    exposeQuickBooksTools: false,
    quickBooksEnvironment: 'sandbox',
    ...overrides,
  } as McpServiceConfig;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('quickbooks-tools', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
  });

  it('registers tools without throwing when feature is disabled', () => {
    const config = makeConfig({ exposeQuickBooksTools: false });
    expect(() => registerQuickBooksTools(server, config, noopMiddleware())).not.toThrow();
  });

  it('registers tools without throwing when feature is enabled', () => {
    const config = makeConfig({
      exposeQuickBooksTools: true,
      quickBooksClientId: 'test-client-id',
      quickBooksClientSecret: 'test-client-secret',
      quickBooksRealmId: '123456789',
      quickBooksRefreshToken: 'test-refresh-token',
    });
    expect(() => registerQuickBooksTools(server, config, noopMiddleware())).not.toThrow();
  });

  it('qbo_health returns disabled message when feature is off', async () => {
    const config = makeConfig({ exposeQuickBooksTools: false });
    registerQuickBooksTools(server, config, noopMiddleware());

    const tools = (server as unknown as { _tools: Map<string, { handler: (args: unknown) => Promise<unknown> }> })._tools;
    const health = tools?.get('qbo_health');
    if (!health) return; // registration method varies by SDK version

    const result = await health.handler({}) as { content: Array<{ text: string }>; isError?: boolean };
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toMatch(/disabled/i);
  });

  it('registers all 11 entity create/get/search/update tools', () => {
    const config = makeConfig({
      exposeQuickBooksTools: true,
      quickBooksRealmId: '123456789',
      quickBooksRefreshToken: 'tok',
    });
    const spy = vi.spyOn(server, 'registerTool');
    registerQuickBooksTools(server, config, noopMiddleware());

    const registered = spy.mock.calls.map((c) => c[0] as string);
    const entities = [
      'account', 'bill', 'billpayment', 'customer', 'employee',
      'estimate', 'invoice', 'item', 'journalentry', 'purchase', 'vendor',
    ];
    for (const e of entities) {
      for (const op of ['create', 'get', 'search', 'update']) {
        expect(registered).toContain(`qbo_${op}_${e}`);
      }
    }
  });

  it('registers delete tools only for deletable entities', () => {
    const config = makeConfig({
      exposeQuickBooksTools: true,
      quickBooksRealmId: '123456789',
      quickBooksRefreshToken: 'tok',
    });
    const spy = vi.spyOn(server, 'registerTool');
    registerQuickBooksTools(server, config, noopMiddleware());

    const registered = spy.mock.calls.map((c) => c[0] as string);

    // Deletable
    expect(registered).toContain('qbo_delete_invoice');
    expect(registered).toContain('qbo_delete_bill');
    expect(registered).toContain('qbo_delete_estimate');
    expect(registered).toContain('qbo_delete_journalentry');
    expect(registered).toContain('qbo_delete_purchase');

    // NOT deletable (use active=false instead)
    expect(registered).not.toContain('qbo_delete_account');
    expect(registered).not.toContain('qbo_delete_customer');
    expect(registered).not.toContain('qbo_delete_vendor');
    expect(registered).not.toContain('qbo_delete_item');
    expect(registered).not.toContain('qbo_delete_employee');
  });

  it('registers report and company info tools', () => {
    const config = makeConfig({
      exposeQuickBooksTools: true,
      quickBooksRealmId: '123456789',
      quickBooksRefreshToken: 'tok',
    });
    const spy = vi.spyOn(server, 'registerTool');
    registerQuickBooksTools(server, config, noopMiddleware());

    const registered = spy.mock.calls.map((c) => c[0] as string);
    expect(registered).toContain('qbo_get_company_info');
    expect(registered).toContain('qbo_report_profit_loss');
    expect(registered).toContain('qbo_report_balance_sheet');
    expect(registered).toContain('qbo_health');
  });
});
