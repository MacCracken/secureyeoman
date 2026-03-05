/**
 * RiskReturnScatter — Scatter plot for risk vs return analysis (Phase 125)
 */

import {
  ScatterChart,
  Scatter,
  XAxis,
  YAxis,
  ZAxis,
  CartesianGrid,
  Tooltip,
  ReferenceLine,
  ResponsiveContainer,
} from 'recharts';

export interface RiskReturnPoint {
  name: string;
  risk: number;
  return: number;
  weight?: number;
}

interface RiskReturnScatterProps {
  assets: RiskReturnPoint[];
  height?: number;
  riskFreeRate?: number;
}

export function RiskReturnScatter({ assets, height = 350, riskFreeRate }: RiskReturnScatterProps) {
  if (!assets.length) return <p className="text-muted-foreground text-sm">No data</p>;

  const data = assets.map(a => ({
    x: a.risk,
    y: a.return,
    z: a.weight ?? 50,
    name: a.name,
  }));

  return (
    <ResponsiveContainer width="100%" height={height}>
      <ScatterChart margin={{ top: 10, right: 20, bottom: 30, left: 10 }}>
        <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
        <XAxis
          type="number"
          dataKey="x"
          name="Risk"
          tick={{ fontSize: 10 }}
          label={{ value: 'Risk (Volatility %)', position: 'insideBottom', offset: -15, fontSize: 12 }}
        />
        <YAxis
          type="number"
          dataKey="y"
          name="Return"
          tick={{ fontSize: 10 }}
          label={{ value: 'Return %', angle: -90, position: 'insideLeft', offset: 10, fontSize: 12 }}
        />
        <ZAxis type="number" dataKey="z" range={[40, 400]} />
        {riskFreeRate !== undefined && (
          <ReferenceLine y={riskFreeRate} stroke="#6b7280" strokeDasharray="5 3" label="Rf" />
        )}
        <Tooltip
          contentStyle={{
            backgroundColor: 'hsl(var(--card))',
            border: '1px solid hsl(var(--border))',
            borderRadius: '6px',
            fontSize: '12px',
          }}
          formatter={(value: number, name: string) => [
            `${value.toFixed(2)}%`,
            name === 'x' ? 'Risk' : name === 'y' ? 'Return' : name,
          ]}
          labelFormatter={(_: unknown, payload: unknown[]) => {
            const p = (payload as { payload?: { name?: string } }[])[0]?.payload;
            return p?.name ?? '';
          }}
        />
        <Scatter data={data} fill="#3b82f6" fillOpacity={0.7} />
      </ScatterChart>
    </ResponsiveContainer>
  );
}
