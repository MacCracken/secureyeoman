/**
 * DepartmentScorecardPanel — Bar chart showing domain risk scores with appetite
 * threshold reference lines and color-coded bars by severity.
 */

import {
  BarChart,
  Bar,
  ReferenceLine,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
  ResponsiveContainer,
  Cell,
} from 'recharts';
import { BarChart3 } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

interface RiskAppetite {
  security: number;
  operational: number;
  financial: number;
  compliance: number;
  reputational: number;
  [domain: string]: number;
}

type DomainScores = Record<string, number>;

interface DepartmentScorecardPanelProps {
  scorecard: {
    latestScore: { domainScores: DomainScores } | null;
    department: { riskAppetite: RiskAppetite };
  };
}

// ─── Constants ───────────────────────────────────────────────────────────────

const DOMAINS = ['security', 'operational', 'financial', 'compliance', 'reputational'] as const;

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function getBarColor(score: number): string {
  if (score >= 75) return '#dc2626'; // red-600
  if (score >= 50) return '#ea580c'; // orange-600
  if (score >= 25) return '#eab308'; // yellow-500
  return '#16a34a'; // green-600
}

interface ChartDatum {
  domain: string;
  score: number;
  threshold: number;
}

function buildChartData(
  domainScores: DomainScores | undefined,
  appetite: RiskAppetite
): ChartDatum[] {
  return DOMAINS.map((domain) => ({
    domain: capitalize(domain),
    score: domainScores?.[domain] ?? 0,
    threshold: appetite[domain] ?? 50,
  }));
}

// ─── Custom Tooltip ──────────────────────────────────────────────────────────

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;

  const datum = payload[0]?.payload as ChartDatum | undefined;
  if (!datum) return null;

  const score = datum.score;
  const threshold = datum.threshold;
  const breached = score > threshold;

  return (
    <div
      className="border rounded-md px-3 py-2 text-xs shadow-sm"
      style={{
        backgroundColor: 'hsl(var(--card))',
        borderColor: 'hsl(var(--border))',
      }}
    >
      <div className="font-semibold mb-1">{label}</div>
      <div className="flex items-center gap-2">
        <span>Score:</span>
        <span className="font-medium">{score.toFixed(1)}</span>
      </div>
      <div className="flex items-center gap-2">
        <span>Threshold:</span>
        <span className="font-medium">{threshold}</span>
      </div>
      {breached && <div className="text-red-600 font-medium mt-1">Appetite breached</div>}
    </div>
  );
}

// ─── Component ───────────────────────────────────────────────────────────────

export function DepartmentScorecardPanel({ scorecard }: DepartmentScorecardPanelProps) {
  const { latestScore, department } = scorecard;
  const data = buildChartData(latestScore?.domainScores, department.riskAppetite);

  if (!latestScore) {
    return (
      <div
        className="flex flex-col items-center justify-center py-8 text-muted-foreground"
        data-testid="department-scorecard-panel"
      >
        <BarChart3 className="w-8 h-8 mb-2 opacity-50" />
        <p className="text-sm">No score data available</p>
      </div>
    );
  }

  // Compute a single average threshold for the reference line overlay
  const avgThreshold =
    DOMAINS.reduce((sum, d) => sum + (department.riskAppetite[d] ?? 50), 0) / DOMAINS.length;

  return (
    <div className="space-y-3" data-testid="department-scorecard-panel">
      {/* Header */}
      <div className="flex items-center gap-2">
        <BarChart3 className="w-4 h-4 text-muted-foreground" />
        <h4 className="text-sm font-semibold">Domain Scores</h4>
        <span className="text-xs text-muted-foreground ml-auto">
          Dashed line = avg appetite threshold ({avgThreshold.toFixed(0)})
        </span>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={280}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
          <XAxis
            dataKey="domain"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <YAxis
            domain={[0, 100]}
            tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }}
            axisLine={{ stroke: 'hsl(var(--border))' }}
            tickLine={false}
          />
          <Tooltip
            content={<CustomTooltip />}
            cursor={{ fill: 'hsl(var(--muted))', opacity: 0.3 }}
          />
          <Bar dataKey="score" radius={[4, 4, 0, 0]} maxBarSize={48}>
            {data.map((entry, index) => (
              <Cell key={index} fill={getBarColor(entry.score)} />
            ))}
          </Bar>
          {/* Per-domain threshold reference lines */}
          {data.map((entry) => (
            <ReferenceLine
              key={`ref-${entry.domain}`}
              y={entry.threshold}
              stroke="#6366f1"
              strokeDasharray="4 3"
              strokeWidth={0}
              /* Individual thresholds rendered via the avg line and tooltip instead */
            />
          ))}
          {/* Average threshold line */}
          <ReferenceLine
            y={avgThreshold}
            stroke="#6366f1"
            strokeDasharray="6 3"
            strokeWidth={1.5}
            label={{
              value: 'Appetite',
              position: 'right',
              fill: '#6366f1',
              fontSize: 11,
            }}
          />
        </BarChart>
      </ResponsiveContainer>

      {/* Score legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground justify-center">
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#16a34a' }}
          />
          {'< 25'}
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#eab308' }}
          />
          25-49
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#ea580c' }}
          />
          50-74
        </span>
        <span className="flex items-center gap-1">
          <span
            className="inline-block w-3 h-3 rounded-sm"
            style={{ backgroundColor: '#dc2626' }}
          />
          {'>='}75
        </span>
      </div>
    </div>
  );
}
