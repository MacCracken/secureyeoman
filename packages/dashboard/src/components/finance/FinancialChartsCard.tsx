/**
 * FinancialChartsCard — Mission Control card for financial charts overview (Phase 125)
 *
 * Fetches real OHLCV data and BullShift positions for portfolio allocation.
 * Falls back to demo data when APIs are unavailable.
 */

import { useState, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { TrendingUp, BarChart3, WifiOff, Loader2 } from 'lucide-react';
import { CandlestickChart, type OhlcvPoint } from './CandlestickChart.js';
import { PortfolioAllocationChart, type AllocationSlice } from './PortfolioAllocationChart.js';
import {
  fetchMarketHistorical,
  fetchBullshiftPositions,
  type MarketHistoricalResponse,
} from '../../api/client.js';

// ── Demo data fallback ────────────────────────────────────────────

function generateDemoOhlcv(): OhlcvPoint[] {
  return Array.from({ length: 20 }, (_, i) => {
    const base = 150 + Math.sin(i * 0.3) * 15 + Math.random() * 4;
    const open = base;
    const close = base + (Math.random() - 0.45) * 6;
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

const DEMO_ALLOC: AllocationSlice[] = [
  { name: 'US Equity', value: 45000 },
  { name: "Int'l Equity", value: 20000 },
  { name: 'Bonds', value: 25000 },
  { name: 'Real Estate', value: 7000 },
  { name: 'Cash', value: 3000 },
];

// ── Data parsing ──────────────────────────────────────────────────

function parseHistorical(res: MarketHistoricalResponse): OhlcvPoint[] | null {
  const d = res.data as Record<string, unknown>;

  // AlphaVantage
  const timeSeries = d['Time Series (Daily)'] as
    | Record<string, Record<string, string>>
    | undefined;
  if (timeSeries) {
    return Object.entries(timeSeries)
      .slice(0, 30)
      .reverse()
      .map(([date, vals]) => ({
        date: date.slice(5),
        open: Number(vals['1. open']),
        high: Number(vals['2. high']),
        low: Number(vals['3. low']),
        close: Number(vals['4. close']),
        volume: Number(vals['5. volume']),
      }));
  }

  // Finnhub
  const candle = d as { c?: number[]; h?: number[]; l?: number[]; o?: number[]; t?: number[]; v?: number[]; s?: string };
  if (candle.s === 'ok' && candle.c?.length) {
    return candle.c.slice(-30).map((close, i, arr) => {
      const offset = candle.c!.length - arr.length;
      const idx = offset + i;
      const ts = (candle.t?.[idx] ?? 0) * 1000;
      const dt = new Date(ts);
      return {
        date: `${dt.getMonth() + 1}/${dt.getDate()}`,
        open: candle.o?.[idx] ?? close,
        high: candle.h?.[idx] ?? close,
        low: candle.l?.[idx] ?? close,
        close,
        volume: candle.v?.[idx],
      };
    });
  }
  return null;
}

function parsePositions(data: unknown): AllocationSlice[] | null {
  if (!Array.isArray(data)) return null;
  const positions = data as Array<{
    symbol?: string;
    name?: string;
    market_value?: number;
    marketValue?: number;
    qty?: number;
    current_price?: number;
  }>;
  if (positions.length === 0) return null;

  return positions
    .map((p) => ({
      name: p.symbol ?? p.name ?? 'Unknown',
      value: p.market_value ?? p.marketValue ?? (p.qty ?? 0) * (p.current_price ?? 0),
    }))
    .filter((s) => s.value > 0);
}

// ── Component ─────────────────────────────────────────────────────

type ChartView = 'candlestick' | 'allocation';

export function FinancialChartsCard() {
  const [view, setView] = useState<ChartView>('candlestick');

  const { data: historicalRes, isLoading: loadingChart } = useQuery({
    queryKey: ['market-historical', 'SPY'],
    queryFn: () => fetchMarketHistorical('SPY', 30),
    staleTime: 5 * 60_000,
    retry: 1,
  });

  const { data: positionsData, isLoading: loadingPositions } = useQuery({
    queryKey: ['bullshift-positions'],
    queryFn: fetchBullshiftPositions,
    staleTime: 30_000,
    retry: 1,
  });

  const chartData = useMemo(
    () => (historicalRes ? parseHistorical(historicalRes) : null),
    [historicalRes],
  );
  const allocData = useMemo(
    () => (positionsData ? parsePositions(positionsData) : null),
    [positionsData],
  );

  const displayOhlcv = chartData ?? generateDemoOhlcv();
  const displayAlloc = allocData ?? DEMO_ALLOC;
  const isDemo = view === 'candlestick' ? !chartData : !allocData;
  const isLoading = view === 'candlestick' ? loadingChart : loadingPositions;

  return (
    <div className="flex flex-col gap-2" data-testid="financial-charts-card">
      <div className="flex items-center gap-2">
        <button
          onClick={() => setView('candlestick')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            view === 'candlestick'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <TrendingUp className="w-3.5 h-3.5" />
          Price
        </button>
        <button
          onClick={() => setView('allocation')}
          className={`flex items-center gap-1 px-2 py-1 rounded text-xs font-medium transition-colors ${
            view === 'allocation'
              ? 'bg-primary text-primary-foreground'
              : 'bg-muted text-muted-foreground hover:text-foreground'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Allocation
        </button>
        {isLoading && <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />}
        {isDemo && !isLoading && (
          <span className="flex items-center gap-1 text-[10px] text-muted-foreground font-mono ml-auto">
            <WifiOff className="w-3 h-3" />
            DEMO
          </span>
        )}
      </div>

      {view === 'candlestick' ? (
        <CandlestickChart data={displayOhlcv} movingAverages={[10]} showVolume height={240} />
      ) : (
        <PortfolioAllocationChart allocations={displayAlloc} height={240} />
      )}
    </div>
  );
}
