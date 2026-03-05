/**
 * CandlestickChart — OHLCV candlestick chart using Recharts ComposedChart (Phase 125)
 */

import { useMemo } from 'react';
import {
  ComposedChart,
  Bar,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

export interface OhlcvPoint {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
}

interface CandlestickChartProps {
  data: OhlcvPoint[];
  movingAverages?: number[];
  showVolume?: boolean;
  height?: number;
}

interface ChartRow {
  date: string;
  bodyLow: number;
  bodyHeight: number;
  wickLow: number;
  wickHigh: number;
  isUp: boolean;
  volume?: number;
  [key: string]: unknown;
}

function computeSMA(data: OhlcvPoint[], period: number): (number | null)[] {
  const result: (number | null)[] = [];
  for (let i = 0; i < data.length; i++) {
    if (i < period - 1) { result.push(null); continue; }
    let sum = 0;
    for (let j = i - period + 1; j <= i; j++) sum += data[j]!.close;
    result.push(sum / period);
  }
  return result;
}

const MA_COLORS = ['#f59e0b', '#8b5cf6', '#06b6d4', '#ec4899'];

// Custom bar shape rendering a candle body + wicks
function CandleShape(props: Record<string, unknown>) {
  const { x, y, width, height, payload } = props as {
    x: number; y: number; width: number; height: number; payload: ChartRow;
  };
  if (!payload) return null;
  const color = payload.isUp ? '#22c55e' : '#ef4444';
  const cx = x + width / 2;
  // Y-axis maps values via the bodyLow + bodyHeight stacked bars.
  // But we also need wick lines from high to low.
  // Since Recharts doesn't natively support this, we draw custom SVG.
  return (
    <g>
      <line x1={cx} y1={y} x2={cx} y2={y + height} stroke={color} strokeWidth={1} />
      <rect x={x + 1} y={y} width={Math.max(1, width - 2)} height={Math.max(1, height)} fill={color} rx={1} />
    </g>
  );
}

export function CandlestickChart({ data, movingAverages = [], showVolume = false, height = 400 }: CandlestickChartProps) {
  const chartData = useMemo(() => {
    const mas = movingAverages.map(p => ({ period: p, values: computeSMA(data, p) }));

    return data.map((d, i) => {
      const isUp = d.close >= d.open;
      const row: ChartRow = {
        date: d.date,
        bodyLow: Math.min(d.open, d.close),
        bodyHeight: Math.abs(d.close - d.open) || 0.01,
        wickLow: d.low,
        wickHigh: d.high,
        isUp,
        volume: d.volume,
      };
      for (const ma of mas) {
        row[`sma${ma.period}`] = ma.values[i];
      }
      return row;
    });
  }, [data, movingAverages]);

  if (!data.length) return <p className="text-muted-foreground text-sm">No data</p>;

  const allLow = Math.min(...data.map(d => d.low));
  const allHigh = Math.max(...data.map(d => d.high));
  const pad = (allHigh - allLow) * 0.05 || 1;

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ComposedChart data={chartData} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          dataKey="date"
          tick={{ fontSize: 10 }}
          interval={Math.max(0, Math.floor(data.length / 8))}
        />
        <YAxis
          domain={[allLow - pad, allHigh + pad]}
          tick={{ fontSize: 10 }}
          yAxisId="price"
        />
        {showVolume && (
          <YAxis yAxisId="volume" orientation="right" tick={{ fontSize: 9 }} hide />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string) => {
            if (name === 'bodyHeight') return [value.toFixed(2), 'Range'];
            return [value.toFixed(2), name];
          }}
        />

        {/* Candle bodies */}
        <Bar
          dataKey="bodyHeight"
          stackId="candle"
          yAxisId="price"
          shape={<CandleShape />}
          isAnimationActive={false}
        >
          {chartData.map((row, i) => (
            <Cell key={i} fill={row.isUp ? '#22c55e' : '#ef4444'} />
          ))}
        </Bar>

        {/* Volume bars */}
        {showVolume && (
          <Bar dataKey="volume" yAxisId="volume" opacity={0.3} isAnimationActive={false}>
            {chartData.map((row, i) => (
              <Cell key={i} fill={row.isUp ? '#22c55e' : '#ef4444'} />
            ))}
          </Bar>
        )}

        {/* Moving averages */}
        {movingAverages.map((period, i) => (
          <Line
            key={period}
            type="monotone"
            dataKey={`sma${period}`}
            stroke={MA_COLORS[i % MA_COLORS.length]}
            strokeWidth={1.5}
            dot={false}
            yAxisId="price"
            connectNulls={false}
            isAnimationActive={false}
            name={`SMA ${period}`}
          />
        ))}
      </ComposedChart>
    </ResponsiveContainer>
  );
}
