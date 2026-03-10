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
import type { McpServiceConfig } from '@secureyeoman/shared';
import type { ToolMiddleware } from './index.js';
import {
  wrapToolHandler,
  jsonResponse,
  registerDisabledStub,
  createHttpClient,
} from './tool-utils.js';

const DISABLED_MSG =
  'BullShift trading tools are disabled. Set MCP_EXPOSE_BULLSHIFT_TOOLS=true to enable.';

const BULLSHIFT_URL = (process.env.BULLSHIFT_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

/** Thin wrapper around createHttpClient that throws on non-ok responses (matching original behaviour). */
async function bs(
  method: 'get' | 'post' | 'put' | 'delete',
  path: string,
  body?: unknown
): Promise<unknown> {
  const client = createHttpClient(BULLSHIFT_URL);
  const res = await client[method](path, body);
  if (!res.ok) {
    const msg = (res.body as { error?: string })?.error ?? `HTTP ${res.status}`;
    throw new Error(`BullShift API error: ${msg}`);
  }
  return res.body;
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

async function marketDataFetch(
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
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

export function registerTradingTools(
  server: McpServer,
  config: McpServiceConfig,
  middleware: ToolMiddleware
): void {
  if (!config.exposeBullshiftTools) {
    registerDisabledStub(server, middleware, 'bullshift_status', DISABLED_MSG);
    return;
  }

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
      const result = await bs('get', '/health');
      return jsonResponse(result);
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
      const result = await bs('get', '/v1/account');
      return jsonResponse(result);
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
      const result = await bs('get', '/v1/positions');
      return jsonResponse(result);
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
      const result = await bs('post', '/v1/orders', args);
      return jsonResponse(result);
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
      const result = await bs('delete', `/v1/orders/${args.order_id}`);
      return jsonResponse(result);
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
      return jsonResponse(result);
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
      return jsonResponse(result);
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
      return jsonResponse(result);
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
        notes: z
          .string()
          .max(2000)
          .optional()
          .describe('Trade notes, lessons learned, screenshots'),
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

      return jsonResponse({
        status: 'logged',
        entry,
        summary: `${entry.result.toUpperCase()}: ${entry.instrument} ${entry.direction} — P&L: $${entry.pnl} (${entry.pnl_percent}%)`,
      });
    })
  );

  // ── Market Quote (BullShift native) ──────────────────────────────────────

  server.registerTool(
    'bullshift_market_quote',
    {
      description:
        "Get a real-time market quote from BullShift's connected broker. Returns last price, " +
        'bid/ask, volume, high/low, open, previous close, and change percentage. ' +
        'Uses the broker connection (e.g. Alpaca) — no separate market data API key needed.',
      inputSchema: {
        symbol: z.string().min(1).max(32).describe('Ticker symbol, e.g. "AAPL", "TSLA"'),
      },
    },
    wrapToolHandler('bullshift_market_quote', middleware, async (args) => {
      const result = await bs('get', `/v1/market/${encodeURIComponent(args.symbol)}`);
      return jsonResponse(result);
    })
  );

  // ── Algo Strategies ───────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_algo_strategies',
    {
      description:
        'List all algorithmic trading strategies configured in BullShift. ' +
        'Shows strategy type, state (running/paused/idle), parameters, and performance metrics ' +
        '(total trades, win rate, P&L, Sharpe ratio, max drawdown).',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_algo_strategies', middleware, async () => {
      const result = await bs('get', '/v1/algo/strategies');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_create_strategy',
    {
      description:
        'Create a new algorithmic trading strategy in BullShift. Supports MA Crossover, ' +
        'Mean Reversion, Breakout, VWAP, TWAP, Grid, Trailing Stop, and Pairs Trading. ' +
        'Configure symbols, position sizing, stop-loss/take-profit, and strategy-specific parameters.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Human-readable strategy name'),
        strategy_type: z
          .enum([
            'ma_crossover',
            'mean_reversion',
            'breakout',
            'vwap',
            'twap',
            'grid',
            'trailing_stop',
            'pairs',
          ])
          .describe('Algorithm type'),
        symbols: z
          .array(z.string().min(1).max(32))
          .min(1)
          .optional()
          .describe('Ticker symbols to trade, e.g. ["AAPL", "TSLA"]'),
        max_position_size: z
          .number()
          .positive()
          .optional()
          .describe('Maximum position size per symbol in dollars'),
        max_total_exposure: z
          .number()
          .positive()
          .optional()
          .describe('Maximum total portfolio exposure in dollars'),
        stop_loss_pct: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Stop-loss percentage as a decimal, e.g. 0.02 = 2%'),
        take_profit_pct: z
          .number()
          .min(0)
          .max(1)
          .optional()
          .describe('Take-profit percentage as a decimal, e.g. 0.05 = 5%'),
      },
    },
    wrapToolHandler('bullshift_create_strategy', middleware, async (args) => {
      const result = await bs('post', '/v1/algo/strategies', {
        name: args.name,
        strategy_type: args.strategy_type,
        parameters: {
          symbols: args.symbols,
          max_position_size: args.max_position_size,
          max_total_exposure: args.max_total_exposure,
          stop_loss_pct: args.stop_loss_pct,
          take_profit_pct: args.take_profit_pct,
        },
      });
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_get_strategy',
    {
      description:
        'Get detailed information about a specific algorithmic trading strategy, ' +
        'including full parameters, current state, and performance metrics.',
      inputSchema: {
        strategy_id: z.string().min(1).describe('Strategy UUID'),
      },
    },
    wrapToolHandler('bullshift_get_strategy', middleware, async (args) => {
      const result = await bs('get', `/v1/algo/strategies/${encodeURIComponent(args.strategy_id)}`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_algo_signals',
    {
      description:
        'Get recent algorithmic trading signals generated by active strategies. ' +
        'Each signal includes the strategy that generated it, symbol, direction (buy/sell), ' +
        'signal strength, suggested quantity/price, and reasoning.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Maximum number of signals to return (default: 50)'),
      },
    },
    wrapToolHandler('bullshift_algo_signals', middleware, async (args) => {
      const limit = args.limit ?? 50;
      const result = await bs('get', `/v1/algo/signals?limit=${limit}`);
      return jsonResponse(result);
    })
  );

  // ── Sentiment ─────────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_sentiment',
    {
      description:
        'Get aggregated sentiment for a specific ticker symbol from BullShift. ' +
        'Returns overall sentiment score (-1 bearish to +1 bullish), signal count, ' +
        'and breakdown by source (news, social media, webhooks).',
      inputSchema: {
        symbol: z.string().min(1).max(32).describe('Ticker symbol, e.g. "AAPL"'),
      },
    },
    wrapToolHandler('bullshift_sentiment', middleware, async (args) => {
      const result = await bs('get', `/v1/sentiment/${encodeURIComponent(args.symbol)}`);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_sentiment_signals',
    {
      description:
        'Get recent raw sentiment signals from all sources (RSS, Reddit, Twitter, webhooks). ' +
        'Each signal includes source type, headline, content, sentiment score, confidence, ' +
        'and the symbol it relates to.',
      inputSchema: {
        limit: z
          .number()
          .int()
          .min(1)
          .max(1000)
          .optional()
          .describe('Maximum number of signals to return (default: 50)'),
      },
    },
    wrapToolHandler('bullshift_sentiment_signals', middleware, async (args) => {
      const limit = args.limit ?? 50;
      const result = await bs('get', `/v1/sentiment/signals?limit=${limit}`);
      return jsonResponse(result);
    })
  );

  // ── Alert Webhooks ──────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_list_alerts',
    {
      description:
        'List all configured alert webhooks in BullShift. Shows webhook URLs, ' +
        'trigger types (order filled, stop loss, price alert, sentiment), and delivery status.',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_list_alerts', middleware, async () => {
      const result = await bs('get', '/v1/webhooks');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_create_alert',
    {
      description:
        'Create a new alert webhook in BullShift. Triggers include order events, ' +
        'position changes, price alerts, sentiment signals, and system errors. ' +
        'Supports JSON, Slack, and Discord webhook formats.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Alert name'),
        url: z.string().url().describe('Webhook URL to receive alerts'),
        format: z
          .enum(['json', 'slack', 'discord'])
          .optional()
          .describe('Webhook payload format (default: json)'),
        triggers: z
          .array(
            z.enum([
              'order.filled',
              'order.cancelled',
              'position.opened',
              'position.closed',
              'stop_loss.triggered',
              'take_profit.triggered',
              'sentiment.alert',
              'price.alert',
              'system.error',
            ])
          )
          .min(1)
          .describe('Events that trigger this webhook'),
      },
    },
    wrapToolHandler('bullshift_create_alert', middleware, async (args) => {
      const result = await bs('post', '/v1/webhooks', {
        name: args.name,
        url: args.url,
        format: args.format ?? 'json',
        triggers: args.triggers,
      });
      return jsonResponse(result);
    })
  );

  // ── Alert Rules (metric-based monitoring) ──────────────────────────────────

  server.registerTool(
    'bullshift_alert_rules',
    {
      description:
        'List all metric-based alert rules in BullShift. Alert rules trigger when a metric ' +
        '(e.g. volume, price, drawdown) crosses a threshold. Different from webhooks — ' +
        'these are internal monitoring rules.',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_alert_rules', middleware, async () => {
      const result = await bs('get', '/v1/alerts/rules');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_create_alert_rule',
    {
      description:
        'Create a metric-based alert rule in BullShift. Monitors a named metric and triggers ' +
        'when the condition is met (e.g. volume > 5M, drawdown > 10%). ' +
        'Configurable severity and cooldown to prevent alert storms.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Alert rule name'),
        metric_name: z
          .string()
          .min(1)
          .max(100)
          .describe('Metric to monitor, e.g. "volume", "price", "drawdown", "pnl"'),
        condition: z
          .enum(['greater_than', 'less_than', 'equal_to'])
          .describe('Comparison operator'),
        threshold: z.number().describe('Threshold value to trigger the alert'),
        severity: z
          .enum(['info', 'warning', 'critical'])
          .optional()
          .describe('Alert severity level (default: warning)'),
        cooldown_seconds: z
          .number()
          .int()
          .min(0)
          .optional()
          .describe('Minimum seconds between repeated triggers (default: 300)'),
      },
    },
    wrapToolHandler('bullshift_create_alert_rule', middleware, async (args) => {
      const result = await bs('post', '/v1/alerts', {
        name: args.name,
        metric_name: args.metric_name,
        condition: args.condition,
        threshold: args.threshold,
        severity: args.severity ?? 'warning',
        cooldown_seconds: args.cooldown_seconds ?? 300,
      });
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_delete_alert_rule',
    {
      description: 'Delete a metric-based alert rule by its ID.',
      inputSchema: {
        rule_id: z.string().min(1).describe('Alert rule UUID to delete'),
      },
    },
    wrapToolHandler('bullshift_delete_alert_rule', middleware, async (args) => {
      const result = await bs('delete', `/v1/alerts/rules/${encodeURIComponent(args.rule_id)}`);
      return jsonResponse(result);
    })
  );

  // ── AI Providers ──────────────────────────────────────────────────────────

  server.registerTool(
    'bullshift_ai_providers',
    {
      description:
        'List all AI/LLM providers configured in BullShift. Shows provider type ' +
        '(OpenAI, Anthropic, Ollama, SecureYeoman, Custom), model name, configuration status, ' +
        'and whether an API key is set.',
      inputSchema: {},
    },
    wrapToolHandler('bullshift_ai_providers', middleware, async () => {
      const result = await bs('get', '/v1/ai/providers');
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_add_ai_provider',
    {
      description:
        'Add a new AI/LLM provider to BullShift for trading analysis and strategy generation. ' +
        'Supports OpenAI, Anthropic, Ollama, SecureYeoman, and custom endpoints.',
      inputSchema: {
        name: z.string().min(1).max(200).describe('Provider display name'),
        provider_type: z
          .enum(['OpenAI', 'Anthropic', 'Ollama', 'LocalLLM', 'SecureYeoman', 'Custom'])
          .describe('AI provider type'),
        api_endpoint: z.string().url().describe('API endpoint URL'),
        model_name: z
          .string()
          .min(1)
          .max(100)
          .describe('Model name, e.g. "gpt-4", "claude-sonnet-4-20250514"'),
        api_key: z
          .string()
          .optional()
          .describe('API key (can be configured later via bullshift_configure_ai_provider)'),
        max_tokens: z
          .number()
          .int()
          .positive()
          .optional()
          .describe('Maximum tokens per request (default: 4096)'),
        temperature: z
          .number()
          .min(0)
          .max(2)
          .optional()
          .describe('Sampling temperature (default: 0.7)'),
      },
    },
    wrapToolHandler('bullshift_add_ai_provider', middleware, async (args) => {
      const result = await bs('post', '/v1/ai/providers', args);
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_configure_ai_provider',
    {
      description:
        'Store or update the API key for a BullShift AI provider. ' +
        'Keys are encrypted at rest in BullShift.',
      inputSchema: {
        provider_id: z.string().min(1).describe('AI provider UUID'),
        api_key: z.string().min(1).describe('API key to store'),
      },
    },
    wrapToolHandler('bullshift_configure_ai_provider', middleware, async (args) => {
      const result = await bs(
        'post',
        `/v1/ai/providers/${encodeURIComponent(args.provider_id)}/configure`,
        { api_key: args.api_key }
      );
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_test_ai_provider',
    {
      description:
        'Test connectivity to a configured AI provider. Returns whether the connection succeeded.',
      inputSchema: {
        provider_id: z.string().min(1).describe('AI provider UUID to test'),
      },
    },
    wrapToolHandler('bullshift_test_ai_provider', middleware, async (args) => {
      const result = await bs(
        'post',
        `/v1/ai/providers/${encodeURIComponent(args.provider_id)}/test`
      );
      return jsonResponse(result);
    })
  );

  server.registerTool(
    'bullshift_ai_chat',
    {
      description:
        'Send a prompt to a configured AI provider via BullShift for trading analysis, ' +
        'strategy suggestions, or market research. Returns the AI response and token usage.',
      inputSchema: {
        provider_id: z.string().min(1).describe('AI provider UUID to use'),
        prompt: z.string().min(1).max(10000).describe('Prompt or question for the AI provider'),
      },
    },
    wrapToolHandler('bullshift_ai_chat', middleware, async (args) => {
      const result = await bs('post', '/v1/ai/chat', {
        provider_id: args.provider_id,
        prompt: args.prompt,
      });
      return jsonResponse(result);
    })
  );
}
