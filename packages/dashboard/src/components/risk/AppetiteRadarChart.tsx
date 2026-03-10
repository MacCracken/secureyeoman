/**
 * AppetiteRadarChart — Radar chart comparing 5-domain risk appetite thresholds
 * against current department scores. Includes preset buttons for quick appetite
 * configuration.
 */

import {
  RadarChart,
  PolarGrid,
  PolarAngleAxis,
  Radar,
  ResponsiveContainer,
  Tooltip,
} from 'recharts';
import { Target } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

const DOMAINS = ['security', 'operational', 'financial', 'compliance', 'reputational'] as const;

interface RiskAppetite {
  security: number;
  operational: number;
  financial: number;
  compliance: number;
  reputational: number;
}

type DomainScores = Record<string, number>;

interface AppetiteRadarChartProps {
  department: { riskAppetite: RiskAppetite };
  latestScore: { domainScores: DomainScores } | null;
  onAppetiteChange?: (appetite: RiskAppetite) => void;
}

// ─── Presets ─────────────────────────────────────────────────────────────────

interface Preset {
  label: string;
  value: number;
  color: string;
}

const PRESETS: Preset[] = [
  { label: 'Conservative', value: 30, color: 'bg-green-600 hover:bg-green-700' },
  { label: 'Moderate', value: 50, color: 'bg-yellow-600 hover:bg-yellow-700' },
  { label: 'Aggressive', value: 70, color: 'bg-red-600 hover:bg-red-700' },
];

function buildAppetite(value: number): RiskAppetite {
  return {
    security: value,
    operational: value,
    financial: value,
    compliance: value,
    reputational: value,
  };
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function buildRadarData(appetite: RiskAppetite, scores: DomainScores | undefined) {
  return DOMAINS.map((domain) => ({
    domain: capitalize(domain),
    threshold: appetite[domain] ?? 50,
    score: scores?.[domain] ?? 0,
  }));
}

// ─── Component ───────────────────────────────────────────────────────────────

export function AppetiteRadarChart({
  department,
  latestScore,
  onAppetiteChange,
}: AppetiteRadarChartProps) {
  const appetite = department.riskAppetite;
  const data = buildRadarData(appetite, latestScore?.domainScores);

  return (
    <div className="space-y-4" data-testid="appetite-radar-chart">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Risk Appetite vs Current Scores</h4>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-blue-500 rounded" /> Threshold
          </span>
          <span className="flex items-center gap-1">
            <span className="inline-block w-3 h-0.5 bg-red-500 rounded" /> Current
          </span>
        </div>
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <RadarChart data={data} cx="50%" cy="50%" outerRadius="75%">
          <PolarGrid stroke="hsl(var(--border))" />
          <PolarAngleAxis
            dataKey="domain"
            tick={{ fontSize: 12, fill: 'hsl(var(--muted-foreground))' }}
          />
          <Radar
            name="Threshold"
            dataKey="threshold"
            stroke="#3b82f6"
            fill="#3b82f6"
            fillOpacity={0.15}
            strokeWidth={2}
          />
          <Radar
            name="Current Score"
            dataKey="score"
            stroke="#ef4444"
            fill="#ef4444"
            fillOpacity={0.2}
            strokeWidth={2}
          />
          <Tooltip
            contentStyle={{
              backgroundColor: 'hsl(var(--card))',
              border: '1px solid hsl(var(--border))',
              borderRadius: '6px',
              fontSize: '12px',
            }}
          />
        </RadarChart>
      </ResponsiveContainer>

      {/* Preset buttons */}
      {onAppetiteChange && (
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Presets:</span>
          {PRESETS.map((preset) => (
            <button
              key={preset.label}
              className={`px-3 py-1 text-xs text-white rounded transition-colors ${preset.color}`}
              onClick={() => {
                onAppetiteChange(buildAppetite(preset.value));
              }}
            >
              {preset.label} ({preset.value})
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
