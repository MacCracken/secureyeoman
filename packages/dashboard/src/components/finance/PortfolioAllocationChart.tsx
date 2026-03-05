/**
 * PortfolioAllocationChart — Pie/donut chart for portfolio allocation (Phase 125)
 */

import { PieChart, Pie, Cell, Tooltip, Legend, ResponsiveContainer } from 'recharts';

const DEFAULT_COLORS = [
  '#3b82f6',
  '#ef4444',
  '#22c55e',
  '#eab308',
  '#a855f7',
  '#f97316',
  '#06b6d4',
  '#ec4899',
];

export interface AllocationSlice {
  name: string;
  value: number;
  color?: string;
}

interface PortfolioAllocationChartProps {
  allocations: AllocationSlice[];
  height?: number;
  donut?: boolean;
}

export function PortfolioAllocationChart({
  allocations,
  height = 300,
  donut = true,
}: PortfolioAllocationChartProps) {
  if (!allocations.length) return <p className="text-muted-foreground text-sm">No data</p>;

  const total = allocations.reduce((a, s) => a + s.value, 0);

  return (
    <ResponsiveContainer width="100%" height={height}>
      <PieChart>
        <Pie
          data={allocations}
          dataKey="value"
          nameKey="name"
          cx="50%"
          cy="50%"
          innerRadius={donut ? '55%' : 0}
          outerRadius="80%"
          paddingAngle={2}
          isAnimationActive={false}
          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(1)}%`}
          labelLine={{ strokeWidth: 1 }}
        >
          {allocations.map((entry, i) => (
            <Cell
              key={entry.name}
              fill={entry.color ?? DEFAULT_COLORS[i % DEFAULT_COLORS.length]}
            />
          ))}
        </Pie>
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number) => [
            `$${value.toLocaleString()} (${((value / total) * 100).toFixed(1)}%)`,
            'Value',
          ]}
        />
        <Legend />
      </PieChart>
    </ResponsiveContainer>
  );
}
