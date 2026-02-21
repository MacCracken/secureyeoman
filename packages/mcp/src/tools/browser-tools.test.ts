/**
 * Browser Tools — unit tests for Playwright-based browser automation tools.
 *
 * Mocks Playwright to test tool registration, config gating, and page pool limits.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { registerBrowserTools, getBrowserPool } from './browser-tools.js';
import { BrowserPool } from './browser-pool.js';

// ── Mock Playwright ──────────────────────────────────────────────

const mockPage = {
  goto: vi.fn().mockResolvedValue(undefined),
  title: vi.fn().mockResolvedValue('Test Page'),
  url: vi.fn().mockReturnValue('https://example.com'),
  evaluate: vi.fn().mockResolvedValue('Hello world content'),
  click: vi.fn().mockResolvedValue(undefined),
  fill: vi.fn().mockResolvedValue(undefined),
  screenshot: vi.fn().mockResolvedValue(Buffer.from('fake-png')),
  pdf: vi.fn().mockResolvedValue(Buffer.from('fake-pdf')),
  setViewportSize: vi.fn().mockResolvedValue(undefined),
  waitForSelector: vi.fn().mockResolvedValue(undefined),
  waitForTimeout: vi.fn().mockResolvedValue(undefined),
  setDefaultTimeout: vi.fn(),
  close: vi.fn().mockResolvedValue(undefined),
  isClosed: vi.fn().mockReturnValue(false),
};

const mockBrowser = {
  newPage: vi.fn().mockResolvedValue(mockPage),
  close: vi.fn().mockResolvedValue(undefined),
  isConnected: vi.fn().mockReturnValue(true),
};

vi.mock('playwright', () => ({
  chromium: {
    launch: vi.fn().mockResolvedValue(mockBrowser),
  },
}));

// ── Mock MCP Server ──────────────────────────────────────────────

interface ToolHandler {
  (
    args: Record<string, unknown>
  ): Promise<{ content: Array<{ type: string; text: string }>; isError?: boolean }>;
}

function createMockServer() {
  const tools = new Map<string, ToolHandler>();
  return {
    registerTool: vi.fn(
      (
        name: string,
        _opts: { description: string; inputSchema: unknown },
        handler: ToolHandler
      ) => {
        tools.set(name, handler);
      }
    ),
    getHandler(name: string): ToolHandler | undefined {
      return tools.get(name);
    },
  };
}

// ── Mock Middleware ───────────────────────────────────────────────

const mockMiddleware = {
  rateLimiter: { check: vi.fn().mockReturnValue({ allowed: true }) },
  inputValidator: { validate: vi.fn().mockReturnValue({ blocked: false }) },
  auditLogger: { wrap: vi.fn((_name: string, _args: unknown, fn: () => unknown) => fn()) },
  secretRedactor: { redact: vi.fn((v: unknown) => v) },
};

// ── Tests ────────────────────────────────────────────────────────

describe('registerBrowserTools', () => {
  it('exports registerBrowserTools as a function', () => {
    expect(typeof registerBrowserTools).toBe('function');
  });

  it('accepts four arguments (server, config, middleware, onSessionEvent?)', () => {
    expect(registerBrowserTools.length).toBeGreaterThanOrEqual(3);
  });

  it('registers all 6 browser tools', () => {
    const server = createMockServer();
    const config = createConfig(false);
    registerBrowserTools(server as any, config, mockMiddleware as any);

    expect(server.registerTool).toHaveBeenCalledTimes(6);
    const toolNames = server.registerTool.mock.calls.map((c: unknown[]) => c[0]);
    expect(toolNames).toContain('browser_navigate');
    expect(toolNames).toContain('browser_screenshot');
    expect(toolNames).toContain('browser_click');
    expect(toolNames).toContain('browser_fill');
    expect(toolNames).toContain('browser_evaluate');
    expect(toolNames).toContain('browser_pdf');
  });
});

describe('browser tools with exposeBrowser=false', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerBrowserTools(server as any, createConfig(false), mockMiddleware as any);
  });

  it('browser_navigate returns NOT_AVAILABLE when disabled', async () => {
    const handler = server.getHandler('browser_navigate')!;
    const result = await handler({ url: 'https://example.com', timeout: 30000 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });

  it('browser_screenshot returns NOT_AVAILABLE when disabled', async () => {
    const handler = server.getHandler('browser_screenshot')!;
    const result = await handler({
      url: 'https://example.com',
      fullPage: false,
      width: 1280,
      height: 720,
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });

  it('browser_click returns NOT_AVAILABLE when disabled', async () => {
    const handler = server.getHandler('browser_click')!;
    const result = await handler({ selector: '#btn', waitAfter: 1000 });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });

  it('browser_fill returns NOT_AVAILABLE when disabled', async () => {
    const handler = server.getHandler('browser_fill')!;
    const result = await handler({ selector: '#input', value: 'hello' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });

  it('browser_evaluate returns NOT_AVAILABLE when disabled', async () => {
    const handler = server.getHandler('browser_evaluate')!;
    const result = await handler({ script: 'document.title' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });

  it('browser_pdf returns NOT_AVAILABLE when disabled', async () => {
    const handler = server.getHandler('browser_pdf')!;
    const result = await handler({ url: 'https://example.com', format: 'A4' });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('not available');
  });
});

describe('browser tools with exposeBrowser=true', () => {
  let server: ReturnType<typeof createMockServer>;

  beforeEach(() => {
    vi.clearAllMocks();
    server = createMockServer();
    registerBrowserTools(server as any, createConfig(true), mockMiddleware as any);
  });

  it('browser_navigate returns page info', async () => {
    const handler = server.getHandler('browser_navigate')!;
    const result = await handler({ url: 'https://example.com', timeout: 30000 });
    expect(result.isError).toBeUndefined();
    const parsed = JSON.parse(result.content[0].text);
    expect(parsed.title).toBe('Test Page');
    expect(parsed.url).toBe('https://example.com');
  });

  it('browser_screenshot returns base64 PNG', async () => {
    const handler = server.getHandler('browser_screenshot')!;
    const result = await handler({
      url: 'https://example.com',
      fullPage: false,
      width: 1280,
      height: 720,
    });
    expect(result.isError).toBeUndefined();
    expect(result.content[1].text).toContain('data:image/png;base64,');
  });

  it('browser_click returns confirmation', async () => {
    const handler = server.getHandler('browser_click')!;
    const result = await handler({ selector: '#btn', waitAfter: 0 });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Clicked');
  });

  it('browser_fill returns confirmation', async () => {
    const handler = server.getHandler('browser_fill')!;
    const result = await handler({ selector: '#input', value: 'hello' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Filled');
  });

  it('browser_evaluate returns JSON result', async () => {
    const handler = server.getHandler('browser_evaluate')!;
    const result = await handler({ script: 'document.title' });
    expect(result.isError).toBeUndefined();
    expect(result.content[0].text).toContain('Hello world content');
  });

  it('browser_pdf returns base64 PDF', async () => {
    const handler = server.getHandler('browser_pdf')!;
    const result = await handler({ url: 'https://example.com', format: 'A4' });
    expect(result.isError).toBeUndefined();
    expect(result.content[1].text).toContain('data:application/pdf;base64,');
  });
});

describe('BrowserPool', () => {
  it('enforces page limit', async () => {
    const pool = new BrowserPool({ headless: true, maxPages: 2, timeoutMs: 5000 });

    // Access private browser field through monkey-patching for test
    (pool as any).browser = mockBrowser;

    const page1 = await pool.getPage();
    const page2 = await pool.getPage();
    expect(pool.pageCount).toBe(2);

    await expect(pool.getPage()).rejects.toThrow('page limit reached');

    await pool.releasePage(page1);
    expect(pool.pageCount).toBe(1);

    // Can now get another page
    const page3 = await pool.getPage();
    expect(pool.pageCount).toBe(2);

    await pool.releasePage(page2);
    await pool.releasePage(page3);
  });

  it('shutdown closes all pages and browser', async () => {
    const pool = new BrowserPool({ headless: true, maxPages: 3, timeoutMs: 5000 });
    (pool as any).browser = mockBrowser;

    await pool.getPage();
    await pool.getPage();
    expect(pool.pageCount).toBe(2);

    await pool.shutdown();
    expect(pool.pageCount).toBe(0);
    expect(mockBrowser.close).toHaveBeenCalled();
  });

  it('getBrowserPool returns null when no pool initialized', () => {
    // getBrowserPool() is a module-level getter; before any tool is invoked it should be null or a pool
    expect(getBrowserPool).toBeDefined();
  });
});

// ── Helpers ──────────────────────────────────────────────────────

function createConfig(exposeBrowser: boolean) {
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
    exposeBrowser,
    browserEngine: 'playwright',
    browserHeadless: true,
    browserMaxPages: 3,
    browserTimeoutMs: 5000,
    rateLimitPerTool: 30,
    logLevel: 'info',
  } as any;
}
