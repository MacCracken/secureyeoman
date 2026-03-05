/**
 * TradingDashboardWidget — Canvas widget combining candlestick chart,
 * position summary, and mini sparklines (Phase 125)
 */

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import { CandlestickChart, type OhlcvPoint } from './CandlestickChart.js';

interface TradingDashboardWidgetProps {
  nodeId?: string;
  onConfigChange?: (config: Record<string, unknown>) => void;
}

// Placeholder demo data — in production this would come from MCP tool calls via useQuery
const DEMO_DATA: OhlcvPoint[] = Array.from({ length: 30 }, (_, i) => {
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

export function TradingDashboardWidget({ nodeId: _nodeId, onConfigChange: _onConfigChange }: TradingDashboardWidgetProps) {
  const [symbol, setSymbol] = useState('AAPL');
  const [isLoading] = useState(false);

  return (
    <div className="flex flex-col h-full p-2 gap-2" data-testid="trading-dashboard-widget">
      {/* Symbol selector */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          value={symbol}
          onChange={(e) => setSymbol(e.target.value.toUpperCase())}
          className="border rounded px-2 py-1 text-sm w-24 bg-background"
          placeholder="Symbol"
        />
        <span className="text-sm font-semibold">{symbol}</span>
        {isLoading && <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />}
      </div>

      {/* Candlestick chart */}
      <div className="flex-1 min-h-0">
        <CandlestickChart
          data={DEMO_DATA}
          movingAverages={[20]}
          showVolume
          height={280}
        />
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-4 gap-2 text-xs">
        {(['Open', 'High', 'Low', 'Close'] as const).map((label) => {
          const last = DEMO_DATA[DEMO_DATA.length - 1]!;
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
