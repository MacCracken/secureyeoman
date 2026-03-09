/**
 * Trading Routes — unit tests
 *
 * Tests the Fastify route handlers for market data and BullShift proxy:
 *   GET /api/v1/trading/quote
 *   GET /api/v1/trading/historical
 *   GET /api/v1/trading/search
 *   GET /api/v1/trading/bullshift/positions
 *   GET /api/v1/trading/bullshift/account
 *   GET /api/v1/trading/bullshift/health
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import Fastify from 'fastify';
import { registerTradingRoutes } from './trading-routes.js';

// ─── helpers ──────────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

function jsonResponse(data: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
  } as unknown as Response;
}

function fetchErrorResponse(): Response {
  return {
    ok: false,
    status: 500,
    json: () => Promise.reject(new Error('Market data API error: HTTP 500')),
    text: () => Promise.resolve('Internal Server Error'),
  } as unknown as Response;
}

async function buildApp() {
  const app = Fastify({ logger: false });
  registerTradingRoutes(app);
  await app.ready();
  return app;
}

// ─── env helpers ─────────────────────────────────────────────────────────────

function setAlphaVantage() {
  process.env.ALPHAVANTAGE_API_KEY = 'av_test_key';
}

function setFinnhub() {
  process.env.FINNHUB_API_KEY = 'fh_test_key';
}

function clearProviderEnv() {
  delete process.env.ALPHAVANTAGE_API_KEY;
  delete process.env.FINNHUB_API_KEY;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Trading Routes', () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeEach(async () => {
    vi.clearAllMocks();
    clearProviderEnv();
    app = await buildApp();
  });

  afterEach(async () => {
    clearProviderEnv();
    await app.close();
  });

  // ─── GET /api/v1/trading/quote ──────────────────────────────────────────

  describe('GET /api/v1/trading/quote', () => {
    it('returns 400 when symbol is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/trading/quote' });
      expect(res.statusCode).toBe(400);
      const body = res.json();
      expect(body.message).toBe('Missing required query parameter: symbol');
      expect(body.statusCode).toBe(400);
    });

    it('returns 503 when no market data provider is configured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/quote?symbol=AAPL',
      });
      expect(res.statusCode).toBe(503);
      const body = res.json();
      expect(body.message).toBe('No market data API key configured');
    });

    it('fetches quote via AlphaVantage provider', async () => {
      setAlphaVantage();
      const quoteData = { 'Global Quote': { '01. symbol': 'AAPL', '05. price': '150.00' } };
      mockFetch.mockResolvedValueOnce(jsonResponse(quoteData));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/quote?symbol=AAPL',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('alphavantage');
      expect(body.data).toEqual(quoteData);

      // Verify the fetch URL includes alphavantage params
      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(fetchUrl.origin).toBe('https://www.alphavantage.co');
      expect(fetchUrl.searchParams.get('apikey')).toBe('av_test_key');
      expect(fetchUrl.searchParams.get('function')).toBe('GLOBAL_QUOTE');
      expect(fetchUrl.searchParams.get('symbol')).toBe('AAPL');
    });

    it('fetches quote via Finnhub provider', async () => {
      setFinnhub();
      const quoteData = { c: 150, h: 152, l: 148, o: 149 };
      mockFetch.mockResolvedValueOnce(jsonResponse(quoteData));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/quote?symbol=aapl',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('finnhub');
      expect(body.data).toEqual(quoteData);

      // Finnhub uppercases the symbol
      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(fetchUrl.origin).toBe('https://finnhub.io');
      expect(fetchUrl.searchParams.get('symbol')).toBe('AAPL');
      // Finnhub uses header auth
      const headers = mockFetch.mock.calls[0][1]?.headers;
      expect(headers['X-Finnhub-Token']).toBe('fh_test_key');
    });

    it('prefers AlphaVantage when both providers are configured', async () => {
      setAlphaVantage();
      setFinnhub();
      mockFetch.mockResolvedValueOnce(jsonResponse({ 'Global Quote': {} }));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/quote?symbol=MSFT',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json().provider).toBe('alphavantage');
    });

    it('returns 502 when market data fetch fails', async () => {
      setAlphaVantage();
      mockFetch.mockResolvedValueOnce(fetchErrorResponse());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/quote?symbol=AAPL',
      });

      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.message).toContain('Market data error');
    });

    it('returns 502 when fetch throws a network error', async () => {
      setAlphaVantage();
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/quote?symbol=AAPL',
      });

      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.message).toContain('Market data error');
      expect(body.message).toContain('ECONNREFUSED');
    });
  });

  // ─── GET /api/v1/trading/historical ─────────────────────────────────────

  describe('GET /api/v1/trading/historical', () => {
    it('returns 400 when symbol is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/trading/historical' });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required query parameter: symbol');
    });

    it('returns 503 when no provider is configured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/historical?symbol=AAPL',
      });
      expect(res.statusCode).toBe(503);
    });

    it('fetches historical data via AlphaVantage', async () => {
      setAlphaVantage();
      const histData = { 'Time Series (Daily)': { '2026-03-08': { '4. close': '150.00' } } };
      mockFetch.mockResolvedValueOnce(jsonResponse(histData));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/historical?symbol=AAPL&days=30',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('alphavantage');
      expect(body.symbol).toBe('AAPL');
      expect(body.data).toEqual(histData);

      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(fetchUrl.searchParams.get('function')).toBe('TIME_SERIES_DAILY');
      expect(fetchUrl.searchParams.get('outputsize')).toBe('compact');
    });

    it('fetches historical data via Finnhub with days param', async () => {
      setFinnhub();
      const candleData = { c: [150, 151], h: [152, 153], l: [148, 149], o: [149, 150], s: 'ok' };
      mockFetch.mockResolvedValueOnce(jsonResponse(candleData));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/historical?symbol=aapl&days=10',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('finnhub');
      expect(body.symbol).toBe('aapl');

      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(fetchUrl.pathname).toBe('/stock/candle');
      expect(fetchUrl.searchParams.get('symbol')).toBe('AAPL');
      expect(fetchUrl.searchParams.get('resolution')).toBe('D');
      // from/to should be numeric timestamps
      expect(Number(fetchUrl.searchParams.get('from'))).toBeGreaterThan(0);
      expect(Number(fetchUrl.searchParams.get('to'))).toBeGreaterThan(0);
    });

    it('caps days at 365 for Finnhub', async () => {
      setFinnhub();
      mockFetch.mockResolvedValueOnce(jsonResponse({ s: 'ok' }));

      await app.inject({
        method: 'GET',
        url: '/api/v1/trading/historical?symbol=TSLA&days=9999',
      });

      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      const from = Number(fetchUrl.searchParams.get('from'));
      const to = Number(fetchUrl.searchParams.get('to'));
      // Difference should be 365 days max
      expect(to - from).toBe(365 * 86400);
    });

    it('defaults to 100 days when days is not a number', async () => {
      setFinnhub();
      mockFetch.mockResolvedValueOnce(jsonResponse({ s: 'ok' }));

      await app.inject({
        method: 'GET',
        url: '/api/v1/trading/historical?symbol=TSLA&days=abc',
      });

      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      const from = Number(fetchUrl.searchParams.get('from'));
      const to = Number(fetchUrl.searchParams.get('to'));
      expect(to - from).toBe(100 * 86400);
    });

    it('returns 502 on fetch failure', async () => {
      setFinnhub();
      mockFetch.mockRejectedValueOnce(new Error('timeout'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/historical?symbol=AAPL',
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().message).toContain('Market data error');
    });
  });

  // ─── GET /api/v1/trading/search ─────────────────────────────────────────

  describe('GET /api/v1/trading/search', () => {
    it('returns 400 when keywords is missing', async () => {
      const res = await app.inject({ method: 'GET', url: '/api/v1/trading/search' });
      expect(res.statusCode).toBe(400);
      expect(res.json().message).toBe('Missing required query parameter: keywords');
    });

    it('returns 503 when no provider is configured', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/search?keywords=Apple',
      });
      expect(res.statusCode).toBe(503);
    });

    it('searches via AlphaVantage', async () => {
      setAlphaVantage();
      const searchResult = { bestMatches: [{ '1. symbol': 'AAPL', '2. name': 'Apple Inc' }] };
      mockFetch.mockResolvedValueOnce(jsonResponse(searchResult));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/search?keywords=Apple',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('alphavantage');
      expect(body.data).toEqual(searchResult);

      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(fetchUrl.searchParams.get('function')).toBe('SYMBOL_SEARCH');
      expect(fetchUrl.searchParams.get('keywords')).toBe('Apple');
    });

    it('searches via Finnhub', async () => {
      setFinnhub();
      const searchResult = { count: 1, result: [{ symbol: 'AAPL', description: 'Apple Inc' }] };
      mockFetch.mockResolvedValueOnce(jsonResponse(searchResult));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/search?keywords=Apple',
      });

      expect(res.statusCode).toBe(200);
      const body = res.json();
      expect(body.provider).toBe('finnhub');
      expect(body.data).toEqual(searchResult);

      const fetchUrl = new URL(mockFetch.mock.calls[0][0]);
      expect(fetchUrl.pathname).toBe('/search');
      expect(fetchUrl.searchParams.get('q')).toBe('Apple');
    });

    it('returns 502 on fetch failure', async () => {
      setAlphaVantage();
      mockFetch.mockResolvedValueOnce(fetchErrorResponse());

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/search?keywords=Apple',
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().message).toContain('Market data error');
    });
  });

  // ─── GET /api/v1/trading/bullshift/positions ────────────────────────────

  describe('GET /api/v1/trading/bullshift/positions', () => {
    it('returns positions on success', async () => {
      const positions = [
        { symbol: 'AAPL', qty: 10, avgPrice: 145 },
        { symbol: 'MSFT', qty: 5, avgPrice: 300 },
      ];
      mockFetch.mockResolvedValueOnce(jsonResponse(positions));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/positions',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(positions);
    });

    it('returns error when BullShift returns non-ok', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Unauthorized' }, 401));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/positions',
      });

      expect(res.statusCode).toBe(401);
      expect(res.json().message).toContain('BullShift error');
    });

    it('returns 502 when BullShift is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/positions',
      });

      // bullshiftFetch catches the error and returns { ok: false, status: 502, data: { error: message } }
      // toErrorMessage receives the data object (not an Error), so it returns 'Unknown error'
      expect(res.statusCode).toBe(502);
      expect(res.json().message).toContain('BullShift error');
    });
  });

  // ─── GET /api/v1/trading/bullshift/account ──────────────────────────────

  describe('GET /api/v1/trading/bullshift/account', () => {
    it('returns account data on success', async () => {
      const account = { balance: 50000, equity: 52000, buyingPower: 100000 };
      mockFetch.mockResolvedValueOnce(jsonResponse(account));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/account',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual(account);
    });

    it('returns error when BullShift returns non-ok', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ error: 'Service down' }, 503));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/account',
      });

      expect(res.statusCode).toBe(503);
      expect(res.json().message).toContain('BullShift error');
    });

    it('returns 502 when BullShift is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('socket hang up'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/account',
      });

      expect(res.statusCode).toBe(502);
      expect(res.json().message).toContain('BullShift error');
    });
  });

  // ─── GET /api/v1/trading/bullshift/health ───────────────────────────────

  describe('GET /api/v1/trading/bullshift/health', () => {
    it('returns 200 when BullShift is healthy', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'ok' }));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/health',
      });

      expect(res.statusCode).toBe(200);
      expect(res.json()).toEqual({ status: 'ok' });
    });

    it('returns 502 when BullShift health check fails', async () => {
      mockFetch.mockResolvedValueOnce(jsonResponse({ status: 'error' }, 500));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/health',
      });

      expect(res.statusCode).toBe(502);
      expect(res.json()).toEqual({ status: 'error' });
    });

    it('returns 502 when BullShift is unreachable', async () => {
      mockFetch.mockRejectedValueOnce(new Error('ECONNREFUSED'));

      const res = await app.inject({
        method: 'GET',
        url: '/api/v1/trading/bullshift/health',
      });

      // bullshiftFetch catch branch returns { ok: false, status: 502, data: { error: ... } }
      expect(res.statusCode).toBe(502);
      const body = res.json();
      expect(body.error).toContain('ECONNREFUSED');
    });
  });
});
