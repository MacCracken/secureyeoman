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
}
