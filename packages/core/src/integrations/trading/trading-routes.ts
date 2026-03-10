/**
 * Trading Routes — Market data & BullShift proxy.
 *
 * Proxies market data (AlphaVantage / Finnhub) and BullShift trading platform
 * endpoints so the dashboard can display live charts and positions without
 * needing direct external API access or API keys on the client side.
 */

import type { FastifyInstance } from 'fastify';
import { sendError, toErrorMessage } from '../../utils/errors.js';

const BULLSHIFT_URL = (process.env.BULLSHIFT_API_URL ?? 'http://localhost:8787').replace(/\/$/, '');

interface MarketProvider {
  name: string;
  baseUrl: string;
  apiKey: string;
}

function getMarketDataProvider(): MarketProvider | null {
  const av = process.env.ALPHAVANTAGE_API_KEY;
  if (av) return { name: 'alphavantage', baseUrl: 'https://www.alphavantage.co', apiKey: av };
  const fh = process.env.FINNHUB_API_KEY;
  if (fh) return { name: 'finnhub', baseUrl: 'https://finnhub.io/api/v1', apiKey: fh };
  return null;
}

async function marketFetch(
  provider: MarketProvider,
  path: string,
  params: Record<string, string> = {}
): Promise<unknown> {
  const url = new URL(path, provider.baseUrl);
  if (provider.name === 'alphavantage') url.searchParams.set('apikey', provider.apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);

  const headers: Record<string, string> = { Accept: 'application/json' };
  if (provider.name === 'finnhub') headers['X-Finnhub-Token'] = provider.apiKey;

  const res = await fetch(url.toString(), { headers });
  if (!res.ok) throw new Error(`Market data API error: HTTP ${res.status}`);

  return await res.json();
}

async function bullshiftFetch(
  path: string
): Promise<{ ok: boolean; status: number; data: unknown }> {
  try {
    const res = await fetch(`${BULLSHIFT_URL}${path}`, {
      headers: { Accept: 'application/json' },
    });

    const data = await res.json();
    return { ok: res.ok, status: res.status, data };
  } catch (err) {
    return { ok: false, status: 502, data: { error: toErrorMessage(err) } };
  }
}

// ── Route Registration ──────────────────────────────────────────

export function registerTradingRoutes(app: FastifyInstance): void {
  // GET /api/v1/trading/quote?symbol=AAPL
  app.get<{ Querystring: { symbol?: string } }>('/api/v1/trading/quote', async (req, reply) => {
    const { symbol } = req.query;
    if (!symbol) return sendError(reply, 400, 'Missing required query parameter: symbol');

    const provider = getMarketDataProvider();
    if (!provider) return sendError(reply, 503, 'No market data API key configured');

    try {
      let result: unknown;
      if (provider.name === 'alphavantage') {
        result = await marketFetch(provider, '/query', {
          function: 'GLOBAL_QUOTE',
          symbol,
        });
      } else {
        result = await marketFetch(provider, '/quote', { symbol: symbol.toUpperCase() });
      }
      return reply.send({ provider: provider.name, data: result });
    } catch (err) {
      return sendError(reply, 502, `Market data error: ${toErrorMessage(err)}`);
    }
  });

  // GET /api/v1/trading/historical?symbol=AAPL&days=30
  app.get<{ Querystring: { symbol?: string; days?: string } }>(
    '/api/v1/trading/historical',
    async (req, reply) => {
      const { symbol, days } = req.query;
      if (!symbol) return sendError(reply, 400, 'Missing required query parameter: symbol');

      const provider = getMarketDataProvider();
      if (!provider) return sendError(reply, 503, 'No market data API key configured');

      try {
        let result: unknown;
        if (provider.name === 'alphavantage') {
          result = await marketFetch(provider, '/query', {
            function: 'TIME_SERIES_DAILY',
            symbol,
            outputsize: 'compact',
          });
        } else {
          const now = Math.floor(Date.now() / 1000);
          const d = Math.min(Number(days) || 100, 365);
          const from = now - d * 86400;
          result = await marketFetch(provider, '/stock/candle', {
            symbol: symbol.toUpperCase(),
            resolution: 'D',
            from: String(from),
            to: String(now),
          });
        }
        return reply.send({ provider: provider.name, symbol, data: result });
      } catch (err) {
        return sendError(reply, 502, `Market data error: ${toErrorMessage(err)}`);
      }
    }
  );

  // GET /api/v1/trading/search?keywords=Apple
  app.get<{ Querystring: { keywords?: string } }>('/api/v1/trading/search', async (req, reply) => {
    const { keywords } = req.query;
    if (!keywords) return sendError(reply, 400, 'Missing required query parameter: keywords');

    const provider = getMarketDataProvider();
    if (!provider) return sendError(reply, 503, 'No market data API key configured');

    try {
      let result: unknown;
      if (provider.name === 'alphavantage') {
        result = await marketFetch(provider, '/query', {
          function: 'SYMBOL_SEARCH',
          keywords,
        });
      } else {
        result = await marketFetch(provider, '/search', { q: keywords });
      }
      return reply.send({ provider: provider.name, data: result });
    } catch (err) {
      return sendError(reply, 502, `Market data error: ${toErrorMessage(err)}`);
    }
  });

  // GET /api/v1/trading/bullshift/positions
  app.get('/api/v1/trading/bullshift/positions', async (_req, reply) => {
    const res = await bullshiftFetch('/v1/positions');
    if (!res.ok)
      return sendError(reply, res.status, `BullShift error: ${toErrorMessage(res.data)}`);
    return reply.send(res.data);
  });

  // GET /api/v1/trading/bullshift/account
  app.get('/api/v1/trading/bullshift/account', async (_req, reply) => {
    const res = await bullshiftFetch('/v1/account');
    if (!res.ok)
      return sendError(reply, res.status, `BullShift error: ${toErrorMessage(res.data)}`);
    return reply.send(res.data);
  });

  // GET /api/v1/trading/bullshift/health
  app.get('/api/v1/trading/bullshift/health', async (_req, reply) => {
    const res = await bullshiftFetch('/health');
    return reply.code(res.ok ? 200 : 502).send(res.data);
  });
}
