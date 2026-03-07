import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTradingTools } from './trading-tools.js';
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';

function makeConfig(overrides?: Partial<McpServiceConfig>): McpServiceConfig {
  return {
    enabled: true,
    port: 3001,
    host: '127.0.0.1',
    transport: 'streamable-http',
    autoRegister: false,
    coreUrl: 'http://127.0.0.1:18789',
    exposeBullshiftTools: true,
    ...overrides,
  } as McpServiceConfig;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

type ToolHandler = (
  args: Record<string, unknown>
) => Promise<{ content: { type: string; text: string }[]; isError?: boolean }>;

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

/**
 * Register all trading tools while spying on server.registerTool so we can
 * capture each wrapped handler and invoke it directly in tests.
 */
function captureHandlers(): Record<string, ToolHandler> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, ToolHandler> = {};

  vi.spyOn(server, 'registerTool').mockImplementation(
    (name: string, _schema: unknown, handler: unknown) => {
      handlers[name] = handler as ToolHandler;
      return server; // McpServer.registerTool returns `this`
    }
  );

  registerTradingTools(server, makeConfig(), noopMiddleware());
  return handlers;
}

function mockFetchOk(body: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: true,
    json: () => Promise.resolve(body),
  } as unknown as Response);
}

function mockFetchError(status: number, errorBody: unknown): void {
  globalThis.fetch = vi.fn().mockResolvedValue({
    ok: false,
    status,
    json: () => Promise.resolve(errorBody),
  } as unknown as Response);
}

function mockFetchNetworkFailure(message = 'Connection refused'): void {
  globalThis.fetch = vi.fn().mockRejectedValue(new Error(message));
}

function parseResult(result: { content: { text: string }[] }): unknown {
  return JSON.parse(result.content[0].text);
}

// ── Registration ──────────────────────────────────────────────────────────────

describe('trading-tools — registration', () => {
  it('registers all tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerTradingTools(server, makeConfig(), noopMiddleware())).not.toThrow();
  });

  it('registers exactly the 13 expected tool names', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const registered: string[] = [];
    vi.spyOn(server, 'registerTool').mockImplementation((name: string) => {
      registered.push(name);
      return server;
    });

    registerTradingTools(server, makeConfig(), noopMiddleware());

    expect(registered).toEqual([
      'bullshift_health',
      'bullshift_get_account',
      'bullshift_get_positions',
      'bullshift_submit_order',
      'bullshift_cancel_order',
      'market_quote',
      'market_historical',
      'market_search',
      'trading_journal_log',
      'bullshift_algo_strategies',
      'bullshift_sentiment',
      'bullshift_list_alerts',
      'bullshift_create_alert',
    ]);
  });
});

// ── bullshift_health ──────────────────────────────────────────────────────────

describe('bullshift_health', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns status ok from the API', async () => {
    mockFetchOk({ status: 'ok', service: 'bullshift-api' });
    const { bullshift_health } = captureHandlers();
    const result = await bullshift_health({});
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toMatchObject({ status: 'ok', service: 'bullshift-api' });
  });

  it('calls GET /health', async () => {
    mockFetchOk({ status: 'ok' });
    const { bullshift_health } = captureHandlers();
    await bullshift_health({});
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/health$/);
  });

  it('returns isError when the server is unreachable', async () => {
    mockFetchNetworkFailure('Connection refused');
    const { bullshift_health } = captureHandlers();
    const result = await bullshift_health({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('bullshift_health');
  });
});

// ── bullshift_get_account ─────────────────────────────────────────────────────

describe('bullshift_get_account', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns account details on success', async () => {
    const account = { balance: 10000.0, available: 8500.0, margin_used: 1500.0 };
    mockFetchOk(account);
    const { bullshift_get_account } = captureHandlers();
    const result = await bullshift_get_account({});
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toMatchObject(account);
  });

  it('calls GET /v1/account', async () => {
    mockFetchOk({});
    const { bullshift_get_account } = captureHandlers();
    await bullshift_get_account({});
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/v1\/account$/);
  });

  it('returns isError on API error response', async () => {
    mockFetchError(500, { error: 'Internal server error' });
    const { bullshift_get_account } = captureHandlers();
    const result = await bullshift_get_account({});
    expect(result.isError).toBe(true);
  });
});

// ── bullshift_get_positions ───────────────────────────────────────────────────

describe('bullshift_get_positions', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns position array on success', async () => {
    const positions = [
      {
        symbol: 'AAPL',
        quantity: 10,
        entry_price: 150.0,
        current_price: 175.0,
        unrealized_pnl: 250.0,
      },
    ];
    mockFetchOk(positions);
    const { bullshift_get_positions } = captureHandlers();
    const result = await bullshift_get_positions({});
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual(positions);
  });

  it('returns empty array when no positions are open', async () => {
    mockFetchOk([]);
    const { bullshift_get_positions } = captureHandlers();
    const result = await bullshift_get_positions({});
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual([]);
  });

  it('calls GET /v1/positions', async () => {
    mockFetchOk([]);
    const { bullshift_get_positions } = captureHandlers();
    await bullshift_get_positions({});
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/v1\/positions$/);
  });

  it('returns isError on fetch failure', async () => {
    mockFetchNetworkFailure();
    const { bullshift_get_positions } = captureHandlers();
    const result = await bullshift_get_positions({});
    expect(result.isError).toBe(true);
  });
});

// ── bullshift_submit_order ────────────────────────────────────────────────────

describe('bullshift_submit_order', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  const marketOrder = { symbol: 'AAPL', side: 'buy', quantity: 10, order_type: 'market' };

  it('returns order response on success', async () => {
    const response = { order_id: 'ord-123', symbol: 'AAPL', side: 'buy', status: 'submitted' };
    mockFetchOk(response);
    const { bullshift_submit_order } = captureHandlers();
    const result = await bullshift_submit_order(marketOrder);
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toMatchObject({ order_id: 'ord-123' });
  });

  it('calls POST /v1/orders with the order body', async () => {
    mockFetchOk({ order_id: 'ord-456' });
    const { bullshift_submit_order } = captureHandlers();
    await bullshift_submit_order(marketOrder);
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/v1\/orders$/);
    expect(init.method).toBe('POST');
    expect(JSON.parse(init.body as string)).toMatchObject(marketOrder);
  });

  it('returns isError on 400 bad request (e.g. missing price for limit order)', async () => {
    mockFetchError(400, { error: 'limit orders require a price' });
    const { bullshift_submit_order } = captureHandlers();
    const result = await bullshift_submit_order({
      symbol: 'AAPL',
      side: 'buy',
      quantity: 5,
      order_type: 'limit',
    });
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('bullshift_submit_order');
  });

  it('returns isError on network failure', async () => {
    mockFetchNetworkFailure();
    const { bullshift_submit_order } = captureHandlers();
    const result = await bullshift_submit_order(marketOrder);
    expect(result.isError).toBe(true);
  });

  it('includes time_in_force in the request body when provided', async () => {
    mockFetchOk({ order_id: 'ord-789' });
    const { bullshift_submit_order } = captureHandlers();
    await bullshift_submit_order({ ...marketOrder, time_in_force: 'gtc' });
    const [, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(JSON.parse(init.body as string).time_in_force).toBe('gtc');
  });
});

// ── bullshift_cancel_order ────────────────────────────────────────────────────

describe('bullshift_cancel_order', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns cancelled: true on success', async () => {
    mockFetchOk({ cancelled: true });
    const { bullshift_cancel_order } = captureHandlers();
    const result = await bullshift_cancel_order({ order_id: 'ord-123' });
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toMatchObject({ cancelled: true });
  });

  it('calls DELETE /v1/orders/:id with the correct order ID', async () => {
    mockFetchOk({ cancelled: true });
    const { bullshift_cancel_order } = captureHandlers();
    await bullshift_cancel_order({ order_id: 'ord-abc' });
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/v1\/orders\/ord-abc$/);
    expect(init.method).toBe('DELETE');
  });

  it('returns isError when the order is not found (404)', async () => {
    mockFetchError(404, { error: 'Order not found or already in a final state' });
    const { bullshift_cancel_order } = captureHandlers();
    const result = await bullshift_cancel_order({ order_id: 'bad-id' });
    expect(result.isError).toBe(true);
  });

  it('returns isError on network failure', async () => {
    mockFetchNetworkFailure();
    const { bullshift_cancel_order } = captureHandlers();
    const result = await bullshift_cancel_order({ order_id: 'ord-123' });
    expect(result.isError).toBe(true);
  });
});

// ── Rate limiter middleware ────────────────────────────────────────────────────

describe('rate limiter middleware', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => {
    originalFetch = globalThis.fetch;
  });
  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it('returns isError when the rate limiter blocks the call', async () => {
    mockFetchOk({ status: 'ok' });
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const handlers: Record<string, ToolHandler> = {};
    vi.spyOn(server, 'registerTool').mockImplementation((name: string, _s: unknown, h: unknown) => {
      handlers[name] = h as ToolHandler;
      return server;
    });

    const blockedMiddleware: ToolMiddleware = {
      ...noopMiddleware(),
      rateLimiter: {
        check: () => ({ allowed: false, retryAfterMs: 1000 }),
        reset: vi.fn(),
        wrap: vi.fn(),
      },
    } as unknown as ToolMiddleware;

    registerTradingTools(server, makeConfig(), blockedMiddleware);
    const result = await handlers['bullshift_health']({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('Rate limit');
  });
});

// ── Feature gating ───────────────────────────────────────────────────────────

describe('trading-tools — feature gating', () => {
  it('registers only a stub when exposeBullshiftTools is false', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    const registered: string[] = [];
    vi.spyOn(server, 'registerTool').mockImplementation((name: string) => {
      registered.push(name);
      return server;
    });

    registerTradingTools(server, makeConfig({ exposeBullshiftTools: false }), noopMiddleware());
    expect(registered).toEqual(['bullshift_status']);
  });

  it('stub returns error content when disabled', async () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    let handler: ToolHandler | undefined;
    vi.spyOn(server, 'registerTool').mockImplementation(
      (_name: string, _schema: unknown, fn: unknown) => {
        handler = fn as ToolHandler;
        return server;
      }
    );
    registerTradingTools(server, makeConfig({ exposeBullshiftTools: false }), noopMiddleware());
    const result = await handler!({});
    expect(result.isError).toBe(true);
    expect(result.content[0].text).toContain('disabled');
  });
});

// ── New Phase 145 tools ──────────────────────────────────────────────────────

describe('bullshift_algo_strategies', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('calls GET /v1/algo/strategies', async () => {
    mockFetchOk([{ id: '1', name: 'Grid', state: 'Running' }]);
    const handlers = captureHandlers();
    const result = await handlers.bullshift_algo_strategies({});
    expect(result.isError).toBeFalsy();
    expect(parseResult(result)).toEqual([{ id: '1', name: 'Grid', state: 'Running' }]);
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/v1\/algo\/strategies$/);
  });
});

describe('bullshift_sentiment', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('calls /v1/sentiment/aggregate/:symbol when symbol provided', async () => {
    mockFetchOk({ symbol: 'AAPL', overall_score: 0.8 });
    const handlers = captureHandlers();
    await handlers.bullshift_sentiment({ symbol: 'AAPL' });
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/v1\/sentiment\/aggregate\/AAPL$/);
  });

  it('calls /v1/sentiment/signals when no symbol', async () => {
    mockFetchOk([]);
    const handlers = captureHandlers();
    await handlers.bullshift_sentiment({});
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/v1\/sentiment\/signals$/);
  });
});

describe('bullshift_list_alerts', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('calls GET /v1/webhooks', async () => {
    mockFetchOk([]);
    const handlers = captureHandlers();
    await handlers.bullshift_list_alerts({});
    const call = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(call[0]).toMatch(/\/v1\/webhooks$/);
  });
});

describe('bullshift_create_alert', () => {
  let originalFetch: typeof globalThis.fetch;
  beforeEach(() => { originalFetch = globalThis.fetch; });
  afterEach(() => { globalThis.fetch = originalFetch; });

  it('sends POST /v1/webhooks with webhook config', async () => {
    mockFetchOk({ id: 'wh-1' });
    const handlers = captureHandlers();
    await handlers.bullshift_create_alert({
      name: 'Slack',
      url: 'https://hooks.slack.com/test',
      format: 'slack',
      triggers: ['order.filled'],
    });
    const [url, init] = (globalThis.fetch as ReturnType<typeof vi.fn>).mock.calls[0];
    expect(url).toMatch(/\/v1\/webhooks$/);
    expect(init.method).toBe('POST');
    const body = JSON.parse(init.body as string);
    expect(body.name).toBe('Slack');
    expect(body.triggers).toContain('order.filled');
    expect(body.format).toBe('slack');
  });
});
