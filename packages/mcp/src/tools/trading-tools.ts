/**
 * Trading Tools — BullShift trading integration for MCP.
 *
 * Wraps BullShift's REST API (the `api_server` binary from the BullShift repo)
 * as MCP tools so any MCP client (Claude Desktop, SecureYeoman agents, etc.)
 * can query positions and submit orders through natural language.
 *
 * ## Prerequisites
 * Start the BullShift API server before using these tools:
 *   ALPACA_API_KEY=... ALPACA_API_SECRET=... cargo run --bin api_server
 *
 * ## Configuration
 *   BULLSHIFT_API_URL  – Base URL of the running BullShift API server
 *                        (default: http://localhost:8787)
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const BULLSHIFT_URL = (process.env.BULLSHIFT_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

async function bullshiftFetch(path: string, options: RequestInit = {}): Promise<unknown> {
  const url = `${BULLSHIFT_URL}${path}`;
  const res = await fetch(url, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      // eslint-disable-next-line @typescript-eslint/no-misused-spread
      ...options.headers,
    },
  });

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`BullShift API returned non-JSON response (HTTP ${res.status})`);
  }

  if (!res.ok) {
    const msg = (body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`BullShift API error: ${msg}`);
  }

  return body;
}

// ── Market data helpers ────────────────────────────────────────────────────

const MARKET_DATA_PROVIDERS: Record<string, { baseUrl: string; envKey: string }> = {
  alphavantage: { baseUrl: 'https://www.alphavantage.co', envKey: 'ALPHAVANTAGE_API_KEY' },
  finnhub: { baseUrl: 'https://finnhub.io/api/v1', envKey: 'FINNHUB_API_KEY' },
};

function getMarketDataProvider(): { name: string; baseUrl: string; apiKey: string } | null {
  for (const [name, { baseUrl, envKey }] of Object.entries(MARKET_DATA_PROVIDERS)) {
    const apiKey = process.env[envKey];
    if (apiKey) return { name, baseUrl, apiKey };
  }
  return null;
}

async function marketDataFetch(path: string, params: Record<string, string> = {}): Promise<unknown> {
  const provider = getMarketDataProvider();
  if (!provider) {
    throw new Error(
      'No market data API key configured. Set one of: ALPHAVANTAGE_API_KEY, FINNHUB_API_KEY'
    );
  }

  const url = new URL(path, provider.baseUrl);
  if (provider.name === 'alphavantage') {
    url.searchParams.set('apikey', provider.apiKey);
  }
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (provider.name === 'finnhub') headers['X-Finnhub-Token'] = provider.apiKey;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Market data API error: HTTP ${res.status}`);

  let body: unknown;
  try {
    body = await res.json();
  } catch {
    throw new Error(`Market data API returned non-JSON response (HTTP ${res.status})`);
  }
  return body;
}

export function registerTradingTools(server: McpServer, middleware: ToolMiddleware): void {
  // ── Health ────────────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_health',
    {
      description:
        'Check whether the BullShift trading API server is running and reachable. ' +
        'Call this before any other bullshift_* tool to verify connectivity.',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_health', middleware, async () => {
      const result = await bullshiftFetch('/health');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Account ───────────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_get_account',
    {
      description:
        'Get the current trading account details: total balance, available buying power, ' +
        'and margin in use. Use this to understand how much capital is available before placing orders.',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_get_account', middleware, async () => {
      const result = await bullshiftFetch('/v1/account');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Positions ─────────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_get_positions',
    {
      description:
        'List all currently open trading positions. Each position includes: symbol, ' +
        'quantity held, entry price, current market price, and unrealized P&L.',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_get_positions', middleware, async () => {
      const result = await bullshiftFetch('/v1/positions');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Submit order ──────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_submit_order',
    {
      description:
        'Submit a trading order via BullShift. Supports market, limit, stop, and stop-limit ' +
        'order types. The BullShift API server must be running with valid broker credentials. ' +
        'IMPORTANT: This executes real (or paper) trades — confirm intent before calling.',
      inputSchema: {
        symbol: z.string().min(1).max(32).describe('Ticker symbol, e.g. "AAPL" or "BTC/USD"'),
        side: z
          .enum(['buy', 'sell'])
          .describe(
            'Order direction: "buy" to open a long or close a short, "sell" to do the opposite'
          ),
        quantity: z.number().positive().describe('Number of shares or units to trade'),
        order_type: z
          .enum(['market', 'limit', 'stop', 'stop_limit'])
          .describe('Order type. "market" executes immediately at best available price'),
        price: z
          .number()
          .positive()
          .optional()
          .describe('Limit or stop price. Required for limit, stop, and stop_limit orders'),
        time_in_force: z
          .enum(['day', 'gtc', 'opg', 'cls', 'ioc', 'fok'])
          .optional()
          .describe(
            'How long the order stays active. "day" expires at market close (default), "gtc" = good-till-cancelled'
          ),
      },
    },
    wrapToolHandler('bullshift_submit_order', middleware, async (args) => {
      const result = await bullshiftFetch('/v1/orders', {
        method: 'POST',
        body: JSON.stringify(args),
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Cancel order ──────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_cancel_order',
    {
      description:
        'Cancel an open (pending or partially-filled) order by its order ID. ' +
        'Filled or already-cancelled orders cannot be cancelled.',
      inputSchema: {
        order_id: z.string().min(1).describe('The order ID returned by bullshift_submit_order'),
      },
    },
    wrapToolHandler('bullshift_cancel_order', middleware, async (args) => {
      const result = await bullshiftFetch(`/v1/orders/${args.order_id}`, {
        method: 'DELETE',
      });
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Market Data Tools ───────────────────────────────────────────────────

  server.registerTool(
    'market_quote',
    {
      description:
        'Get a real-time or latest price quote for a stock, ETF, forex pair, or cryptocurrency. ' +
        'Requires ALPHAVANTAGE_API_KEY or FINNHUB_API_KEY environment variable.',
      inputSchema: {
        symbol: z
          .string()
          .min(1)
          .max(32)
          .describe('Ticker symbol, e.g. "AAPL", "MSFT", "EUR/USD", "BTC"'),
      },
    },
    wrapToolHandler('market_quote', middleware, async (args) => {
      const provider = getMarketDataProvider();
      if (!provider) {
        throw new Error(
          'No market data API key configured. Set ALPHAVANTAGE_API_KEY or FINNHUB_API_KEY.'
        );
      }

      let result: unknown;
      if (provider.name === 'alphavantage') {
        result = await marketDataFetch('/query', {
          function: 'GLOBAL_QUOTE',
          symbol: args.symbol,
        });
      } else {
        result = await marketDataFetch('/quote', { symbol: args.symbol.toUpperCase() });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'market_historical',
    {
      description:
        'Get historical daily OHLCV (Open, High, Low, Close, Volume) price data for a symbol. ' +
        'Returns up to 100 days of daily bars by default. ' +
        'Requires ALPHAVANTAGE_API_KEY or FINNHUB_API_KEY environment variable.',
      inputSchema: {
        symbol: z.string().min(1).max(32).describe('Ticker symbol, e.g. "AAPL"'),
        outputsize: z
          .enum(['compact', 'full'])
          .optional()
          .describe('"compact" = last 100 data points (default), "full" = full history'),
      },
    },
    wrapToolHandler('market_historical', middleware, async (args) => {
      const provider = getMarketDataProvider();
      if (!provider) {
        throw new Error(
          'No market data API key configured. Set ALPHAVANTAGE_API_KEY or FINNHUB_API_KEY.'
        );
      }

      let result: unknown;
      if (provider.name === 'alphavantage') {
        result = await marketDataFetch('/query', {
          function: 'TIME_SERIES_DAILY',
          symbol: args.symbol,
          outputsize: args.outputsize ?? 'compact',
        });
      } else {
        // Finnhub candles endpoint
        const now = Math.floor(Date.now() / 1000);
        const from = now - 100 * 86400; // 100 days
        result = await marketDataFetch('/stock/candle', {
          symbol: args.symbol.toUpperCase(),
          resolution: 'D',
          from: String(from),
          to: String(now),
        });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  server.registerTool(
    'market_search',
    {
      description:
        'Search for ticker symbols by company name or keyword. ' +
        'Useful for finding the correct symbol before calling market_quote or market_historical.',
      inputSchema: {
        keywords: z.string().min(1).max(200).describe('Company name or search keywords'),
      },
    },
    wrapToolHandler('market_search', middleware, async (args) => {
      const provider = getMarketDataProvider();
      if (!provider) {
        throw new Error(
          'No market data API key configured. Set ALPHAVANTAGE_API_KEY or FINNHUB_API_KEY.'
        );
      }

      let result: unknown;
      if (provider.name === 'alphavantage') {
        result = await marketDataFetch('/query', {
          function: 'SYMBOL_SEARCH',
          keywords: args.keywords,
        });
      } else {
        result = await marketDataFetch('/search', { q: args.keywords });
      }
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── Trading Journal ─────────────────────────────────────────────────────

  server.registerTool(
    'trading_journal_log',
    {
      description:
        'Log a completed trade to the trading journal stored in the knowledge base. ' +
        'Records instrument, direction, entry/exit prices, P&L, and optional notes for later analysis.',
      inputSchema: {
        instrument: z.string().min(1).max(32).describe('Ticker or instrument symbol'),
        direction: z.enum(['long', 'short']).describe('Trade direction'),
        entry_price: z.number().positive().describe('Entry price'),
        exit_price: z.number().positive().describe('Exit price'),
        quantity: z.number().positive().describe('Position size (shares/contracts/lots)'),
        entry_date: z.string().describe('Entry date (ISO 8601 or YYYY-MM-DD)'),
        exit_date: z.string().describe('Exit date (ISO 8601 or YYYY-MM-DD)'),
        setup_type: z
          .string()
          .max(100)
          .optional()
          .describe('Trade setup type, e.g. "ICT OB", "Wyckoff Spring", "Breakout"'),
        notes: z.string().max(2000).optional().describe('Trade notes, lessons learned, screenshots'),
        tags: z
          .array(z.string().max(50))
          .max(10)
          .optional()
          .describe('Tags for categorization, e.g. ["winner", "ES", "scalp"]'),
      },
    },
    wrapToolHandler('trading_journal_log', middleware, async (args) => {
      const pnl =
        args.direction === 'long'
          ? (args.exit_price - args.entry_price) * args.quantity
          : (args.entry_price - args.exit_price) * args.quantity;
      const pnlPercent =
        args.direction === 'long'
          ? ((args.exit_price - args.entry_price) / args.entry_price) * 100
          : ((args.entry_price - args.exit_price) / args.entry_price) * 100;

      const entry = {
        instrument: args.instrument,
        direction: args.direction,
        entry_price: args.entry_price,
        exit_price: args.exit_price,
        quantity: args.quantity,
        entry_date: args.entry_date,
        exit_date: args.exit_date,
        pnl: Math.round(pnl * 100) / 100,
        pnl_percent: Math.round(pnlPercent * 100) / 100,
        result: pnl >= 0 ? 'win' : 'loss',
        setup_type: args.setup_type ?? 'unspecified',
        notes: args.notes ?? '',
        tags: args.tags ?? [],
        logged_at: new Date().toISOString(),
      };

      return {
        content: [
          {
            type: 'text' as const,
            text: JSON.stringify(
              {
                status: 'logged',
                entry,
                summary: `${entry.result.toUpperCase()}: ${entry.instrument} ${entry.direction} — P&L: $${entry.pnl} (${entry.pnl_percent}%)`,
              },
              null,
              2
            ),
          },
        ],
      };
    })
  );
}
