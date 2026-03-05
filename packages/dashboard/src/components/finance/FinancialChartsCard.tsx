/**
 * FinancialChartsCard — Mission Control card for financial charts overview (Phase 125)
 */

import { useState } from 'react';
import { TrendingUp, BarChart3 } from 'lucide-react';
import { CandlestickChart, type OhlcvPoint } from './CandlestickChart.js';
import { PortfolioAllocationChart, type AllocationSlice } from './PortfolioAllocationChart.js';

const DEMO_OHLCV: OhlcvPoint[] = Array.from({ length: 20 }, (_, i) => {
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

const DEMO_ALLOC: AllocationSlice[] = [
  { name: 'US Equity', value: 45000 },
  { name: 'Int\'l Equity', value: 20000 },
  { name: 'Bonds', value: 25000 },
  { name: 'Real Estate', value: 7000 },
  { name: 'Cash', value: 3000 },
];

type ChartView = 'candlestick' | 'allocation';

export function FinancialChartsCard() {
  const [view, setView] = useState<ChartView>('candlestick');

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
      </div>

      {view === 'candlestick' ? (
        <CandlestickChart data={DEMO_OHLCV} movingAverages={[10]} showVolume height={240} />
      ) : (
        <PortfolioAllocationChart allocations={DEMO_ALLOC} height={240} />
      )}
    </div>
  );
}
