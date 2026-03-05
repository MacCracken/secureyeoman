/**
 * WaterfallChart — P&L waterfall using stacked BarChart (Phase 125)
 */

import { useMemo } from 'react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Cell,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

export interface WaterfallItem {
  label: string;
  value: number;
  isTotal?: boolean;
}

interface WaterfallChartProps {
  items: WaterfallItem[];
  height?: number;
}

interface WaterfallRow {
  label: string;
  invisible: number;
  delta: number;
  isTotal: boolean;
  isPositive: boolean;
}

export function WaterfallChart({ items, height = 350 }: WaterfallChartProps) {
  const chartData = useMemo(() => {
    let running = 0;
    return items.map((it): WaterfallRow => {
      if (it.isTotal) {
        const row: WaterfallRow = {
          label: it.label,
          invisible: 0,
          delta: running,
          isTotal: true,
          isPositive: running >= 0,
        };
        return row;
      }
      const start = running;
      running += it.value;
      return {
        label: it.label,
        invisible: it.value >= 0 ? start : start + it.value,
        delta: Math.abs(it.value),
        isTotal: false,
        isPositive: it.value >= 0,
      };
    });
  }, [items]);

  if (!items.length) return <p className="text-muted-foreground text-sm">No data</p>;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <BarChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis dataKey="label" tick={{ fontSize: 10 }} />
        <YAxis tick={{ fontSize: 10 }} />
        <ReferenceLine y={0} stroke="hsl(var(--muted-foreground))" strokeWidth={0.5} />
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'invisible') return [null, null];
            return [value.toLocaleString(), 'Value'];
          }}
        />
        {/* Invisible base bar */}
        <Bar dataKey="invisible" stackId="waterfall" fill="transparent" isAnimationActive={false} />
        {/* Visible delta bar */}
        <Bar dataKey="delta" stackId="waterfall" isAnimationActive={false} radius={[2, 2, 0, 0]}>
          {chartData.map((row, i) => {
            let color: string;
            if (row.isTotal) color = '#6366f1';
            else if (row.isPositive) color = '#22c55e';
            else color = '#ef4444';
            return <Cell key={i} fill={color} />;
          })}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}
