/**
 * SentimentTrendChart — Area chart showing sentiment distribution over time.
 */

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import type { SentimentTrendPoint } from '../../api/client';

interface SentimentTrendChartProps {
  data: SentimentTrendPoint[];
  isLoading: boolean;
}

export function SentimentTrendChart({ data, isLoading }: SentimentTrendChartProps) {
  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        Loading sentiment data...
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground text-sm">
        No sentiment data available
      </div>
    );
  }

  return (
    <div data-testid="sentiment-trend-chart">
      <ResponsiveContainer width="100%" height={280}>
        <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
          <XAxis dataKey="date" tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <YAxis tick={{ fontSize: 11 }} className="text-muted-foreground" />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
          <Area
            type="monotone"
            dataKey="positive"
            stackId="1"
            stroke="#22c55e"
            fill="#22c55e"
            fillOpacity={0.4}
          />
          <Area
            type="monotone"
            dataKey="neutral"
            stackId="1"
            stroke="#eab308"
            fill="#eab308"
            fillOpacity={0.3}
          />
          <Area
            type="monotone"
            dataKey="negative"
            stackId="1"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.3}
          />
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}
