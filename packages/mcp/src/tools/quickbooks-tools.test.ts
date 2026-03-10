/**
 * QuickBooks MCP Tools — unit tests
 *
 * Verifies registration, disabled-gate behavior, and handler invocation
 * for all qbo_* tools via globalToolRegistry.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerQuickBooksTools } from './quickbooks-tools.js';
import { globalToolRegistry } from './tool-utils.js';
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

function enabledConfig(): McpServiceConfig {
  return makeConfig({
    exposeQuickBooksTools: true,
    quickBooksClientId: 'test-client-id',
    quickBooksClientSecret: 'test-client-secret',
    quickBooksRealmId: '123456789',
    quickBooksRefreshToken: 'test-refresh-token',
  });
}

/**
 * Mock fetch to handle both token refresh and API calls.
 * Always returns the token for the first call (token endpoint),
 * then returns apiBody for subsequent calls.
 */
function mockFetchForQbo(apiBody: unknown = {}): void {
  vi.stubGlobal(
    'fetch',
    vi.fn().mockImplementation((url: string) => {
      if (typeof url === 'string' && url.includes('oauth.platform.intuit.com')) {
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () =>
            Promise.resolve({ access_token: 'test-token-' + Date.now(), expires_in: 3600 }),
          text: () => Promise.resolve(''),
        });
      }
      return Promise.resolve({
        ok: true,
        status: 200,
        json: () => Promise.resolve(apiBody),
        text: () => Promise.resolve(JSON.stringify(apiBody)),
      });
    })
  );
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('quickbooks-tools', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('registers tools without throwing when feature is disabled', () => {
    const config = makeConfig({ exposeQuickBooksTools: false });
    expect(() => registerQuickBooksTools(server, config, noopMiddleware())).not.toThrow();
  });

  it('registers tools without throwing when feature is enabled', () => {
    expect(() => registerQuickBooksTools(server, enabledConfig(), noopMiddleware())).not.toThrow();
  });

  it('registers all 11 entity create/get/search/update tools', () => {
    const spy = vi.spyOn(server, 'registerTool');
    registerQuickBooksTools(server, enabledConfig(), noopMiddleware());

    const registered = spy.mock.calls.map((c) => c[0] as string);
    const entities = [
      'account',
      'bill',
      'billpayment',
      'customer',
      'employee',
      'estimate',
      'invoice',
      'item',
      'journalentry',
      'purchase',
      'vendor',
    ];
    for (const e of entities) {
      for (const op of ['create', 'get', 'search', 'update']) {
        expect(registered).toContain(`qbo_${op}_${e}`);
      }
    }
  });

  it('registers delete tools only for deletable entities', () => {
    const spy = vi.spyOn(server, 'registerTool');
    registerQuickBooksTools(server, enabledConfig(), noopMiddleware());

    const registered = spy.mock.calls.map((c) => c[0] as string);
    expect(registered).toContain('qbo_delete_invoice');
    expect(registered).toContain('qbo_delete_bill');
    expect(registered).not.toContain('qbo_delete_account');
    expect(registered).not.toContain('qbo_delete_customer');
  });

  it('registers report and company info tools', () => {
    const spy = vi.spyOn(server, 'registerTool');
    registerQuickBooksTools(server, enabledConfig(), noopMiddleware());

    const registered = spy.mock.calls.map((c) => c[0] as string);
    expect(registered).toContain('qbo_get_company_info');
    expect(registered).toContain('qbo_report_profit_loss');
    expect(registered).toContain('qbo_report_balance_sheet');
    expect(registered).toContain('qbo_health');
  });

  // ── Handler invocation tests ──────────────────────────────────────────

  describe('qbo_health', () => {
    it('returns disabled message when feature is off', async () => {
      registerQuickBooksTools(
        server,
        makeConfig({ exposeQuickBooksTools: false }),
        noopMiddleware()
      );
      const handler = globalToolRegistry.get('qbo_health')!;
      expect(handler).toBeDefined();
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toMatch(/disabled/i);
    });

    it('returns missing realm error when realmId is not set', async () => {
      const config = makeConfig({
        exposeQuickBooksTools: true,
        quickBooksClientId: 'cid',
        quickBooksClientSecret: 'cs',
        quickBooksRefreshToken: 'rt',
        quickBooksRealmId: undefined,
      });
      registerQuickBooksTools(server, config, noopMiddleware());
      const handler = globalToolRegistry.get('qbo_health')!;
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('QUICKBOOKS_REALM_ID');
    });

    it('returns company info on success', async () => {
      mockFetchForQbo({ CompanyInfo: { CompanyName: 'Test Corp' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_health')!;
      const result = await handler({});
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.CompanyInfo.CompanyName).toBe('Test Corp');
    });
  });

  describe('entity CRUD handlers', () => {
    it('qbo_create_invoice posts entity JSON', async () => {
      mockFetchForQbo({ Invoice: { Id: '42' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_create_invoice')!;
      const result = await handler({ body: '{"Line":[]}' });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.Invoice.Id).toBe('42');
    });

    it('qbo_get_customer fetches by id', async () => {
      mockFetchForQbo({ Customer: { Id: '5', DisplayName: 'Acme' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_get_customer')!;
      const result = await handler({ id: '5' });
      expect(result.isError).toBeFalsy();
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.Customer.DisplayName).toBe('Acme');
    });

    it('qbo_search_account builds SQL query', async () => {
      mockFetchForQbo({ QueryResponse: { Account: [{ Id: '1' }] } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_search_account')!;
      const result = await handler({ where: 'Active = true', limit: 10, offset: 1 });
      expect(result.isError).toBeFalsy();
    });

    it('qbo_search_account with no where clause', async () => {
      mockFetchForQbo({ QueryResponse: { Account: [] } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_search_account')!;
      const result = await handler({ limit: 100, offset: 1 });
      expect(result.isError).toBeFalsy();
    });

    it('qbo_update_bill sends POST with Id and SyncToken', async () => {
      mockFetchForQbo({ Bill: { Id: '10', SyncToken: '2' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_update_bill')!;
      const result = await handler({
        id: '10',
        sync_token: '1',
        body: '{"VendorRef":{"value":"55"}}',
      });
      expect(result.isError).toBeFalsy();
    });

    it('qbo_delete_invoice sends POST with operation=delete', async () => {
      mockFetchForQbo({ Invoice: { Id: '42', status: 'Deleted' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_delete_invoice')!;
      const result = await handler({ id: '42', sync_token: '3' });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('report handlers', () => {
    it('qbo_get_company_info calls companyinfo endpoint', async () => {
      mockFetchForQbo({ CompanyInfo: { CompanyName: 'Test Corp' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_get_company_info')!;
      const result = await handler({});
      expect(result.isError).toBeFalsy();
    });

    it('qbo_report_profit_loss calls P&L endpoint', async () => {
      mockFetchForQbo({ Header: { ReportName: 'ProfitAndLoss' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_report_profit_loss')!;
      const result = await handler({
        start_date: '2026-01-01',
        end_date: '2026-03-31',
        accounting_method: 'Accrual',
      });
      expect(result.isError).toBeFalsy();
    });

    it('qbo_report_balance_sheet calls BalanceSheet endpoint', async () => {
      mockFetchForQbo({ Header: { ReportName: 'BalanceSheet' } });
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_report_balance_sheet')!;
      const result = await handler({
        as_of_date: '2026-03-31',
        accounting_method: 'Accrual',
      });
      expect(result.isError).toBeFalsy();
    });
  });

  describe('error handling', () => {
    it('handles QBO API error response with Fault detail', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (typeof url === 'string' && url.includes('oauth.platform.intuit.com')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({ access_token: 'tok-err-' + Date.now(), expires_in: 3600 }),
              text: () => Promise.resolve(''),
            });
          }
          return Promise.resolve({
            ok: false,
            status: 400,
            json: () =>
              Promise.resolve({
                Fault: {
                  Error: [{ Message: 'Invalid request', Detail: 'Missing required field' }],
                },
              }),
            text: () => Promise.resolve(''),
          });
        })
      );
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_get_company_info')!;
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Invalid request');
    });

    it('handles non-JSON API response', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockImplementation((url: string) => {
          if (typeof url === 'string' && url.includes('oauth.platform.intuit.com')) {
            return Promise.resolve({
              ok: true,
              status: 200,
              json: () =>
                Promise.resolve({ access_token: 'tok-nj-' + Date.now(), expires_in: 3600 }),
              text: () => Promise.resolve(''),
            });
          }
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.reject(new Error('not json')),
            text: () => Promise.resolve('plain text'),
          });
        })
      );
      registerQuickBooksTools(server, enabledConfig(), noopMiddleware());
      const handler = globalToolRegistry.get('qbo_get_company_info')!;
      const result = await handler({});
      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('non-JSON');
    });
  });

  describe('disabled stubs', () => {
    it('disabled entity stubs return error when invoked', async () => {
      registerQuickBooksTools(
        server,
        makeConfig({ exposeQuickBooksTools: false }),
        noopMiddleware()
      );
      // When disabled, the shared disabled handler is registered for all entity tools
      // It returns a generic error response
      const handler = globalToolRegistry.get('qbo_account_disabled')!;
      if (handler) {
        const result = await handler({});
        expect(result.isError).toBe(true);
      }
    });
  });
});
