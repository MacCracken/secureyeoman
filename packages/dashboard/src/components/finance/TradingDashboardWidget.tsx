/**
 * TradingDashboardWidget — Canvas widget combining candlestick chart,
 * position summary, and mini sparklines (Phase 125)
 *
 * Fetches real OHLCV data from the market data proxy. Falls back to
 * demo data when no market data API key is configured.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Loader2, Search, WifiOff } from 'lucide-react';
import { CandlestickChart, type OhlcvPoint } from './CandlestickChart.js';
import { fetchMarketHistorical, type MarketHistoricalResponse } from '../../api/client.js';

interface TradingDashboardWidgetProps {
  nodeId?: string;
  onConfigChange?: (config: Record<string, unknown>) => void;
}

// ── Demo data fallback ────────────────────────────────────────────

function generateDemoData(): OhlcvPoint[] {
  return Array.from({ length: 30 }, (_, i) => {
    const base = 150 + Math.sin(i * 0.3) * 20 + Math.random() * 5;
    const open = base;
    const close = base + (Math.random() - 0.45) * 8;
    const high = Math.max(open, close) + Math.random() * 3;
    const low = Math.min(open, close) - Math.random() * 3;
    const d = new Date(2026, 2, i + 1);
    return {
      date: `${d.getMonth() + 1}/${d.getDate()}`,
      open: +open.toFixed(2),
      high: +high.toFixed(2),
      low: +low.toFixed(2),
      close: +close.toFixed(2),
      volume: Math.floor(1e6 + Math.random() * 5e6),
    };
  });
}

// ── Data parsing ──────────────────────────────────────────────────

function parseHistorical(res: MarketHistoricalResponse): OhlcvPoint[] | null {
  const d = res.data;

  // AlphaVantage TIME_SERIES_DAILY format
  const timeSeries = (d['Time Series (Daily)'] ?? d['Time Series (Daily)']) as
    | Record<string, Record<string, string>>
    | undefined;
  if (timeSeries) {
    return Object.entries(timeSeries)
      .slice(0, 60)
      .reverse()
      .map(([date, vals]) => ({
        date: date.slice(5), // "MM-DD"
        open: Number(vals['1. open']),
        high: Number(vals['2. high']),
        low: Number(vals['3. low']),
        close: Number(vals['4. close']),
        volume: Number(vals['5. volume']),
      }));
  }

  // Finnhub candle format { c:[], h:[], l:[], o:[], t:[], v:[], s:"ok" }
  const candle = d as {
    c?: number[];
    h?: number[];
    l?: number[];
    o?: number[];
    t?: number[];
    v?: number[];
    s?: string;
  };
  if (candle.s === 'ok' && candle.c?.length) {
    return candle.c.map((close, i) => {
      const ts = (candle.t?.[i] ?? 0) * 1000;
      const dt = new Date(ts);
      return {
        date: `${dt.getMonth() + 1}/${dt.getDate()}`,
        open: candle.o?.[i] ?? close,
        high: candle.h?.[i] ?? close,
        low: candle.l?.[i] ?? close,
        close,
        volume: candle.v?.[i],
      };
    });
  }

  return null;
}

// ── Component ─────────────────────────────────────────────────────

export function TradingDashboardWidget({
  nodeId: _nodeId,
  onConfigChange: _onConfigChange,
}: TradingDashboardWidgetProps) {
  const [symbol, setSymbol] = useState('AAPL');
  const [searchInput, setSearchInput] = useState('AAPL');

  const {
    data: historicalRes,
    isLoading,
    isError,
  } = useQuery({
    queryKey: ['market-historical', symbol],
    queryFn: () => fetchMarketHistorical(symbol, 60),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const chartData = historicalRes ? parseHistorical(historicalRes) : null;
  const displayData = chartData ?? generateDemoData();
  const isDemo = !chartData;
  const last = displayData[displayData.length - 1];

  const handleSearch = () => {
    const s = searchInput.trim().toUpperCase();
    if (s && s !== symbol) setSymbol(s);
  };

  return (
    <div className="flex flex-col h-full p-2 gap-2" data-testid="trading-dashboard-widget">
      {/* Symbol selector */}
      <div className="flex items-center gap-2">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSearch();
          }}
          className="flex items-center gap-1"
        >
          <input
            type="text"
            value={searchInput}
            onChange={(e) => {
              setSearchInput(e.target.value.toUpperCase());
            }}
            className="border rounded px-2 py-1 text-sm w-24 bg-background"
            placeholder="Symbol"
          />
          <button
            type="submit"
            className="p-1 rounded hover:bg-muted text-muted-foreground hover:text-foreground"
          >
            <Search className="w-3.5 h-3.5" />
          </button>
        </form>
        <span className="text-sm font-semibold">{symbol}</span>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
        {isDemo && !isLoading && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono">
            {isError ? <WifiOff className="w-3 h-3" /> : null}
            DEMO
          </span>
        )}
      </div>

      {/* Candlestick chart */}
      <div className="flex-1 min-h-0">
        <CandlestickChart data={displayData} movingAverages={[20]} showVolume height={280} />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {(['Open', 'High', 'Low', 'Close'] as const).map((label) => {
          const val = last[label.toLowerCase() as keyof OhlcvPoint] as number;
          return (
            <div key={label} className="bg-muted/50 rounded p-1.5 text-center">
              <div className="text-muted-foreground">{label}</div>
              <div className="font-mono font-medium">{val.toFixed(2)}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
