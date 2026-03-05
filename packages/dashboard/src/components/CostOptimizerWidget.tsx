/**
 * CostOptimizerWidget — AI model cost analysis dashboard widget.
 *
 * Shows cost trend sparkline, top models by cost, routing suggestions
 * with savings amounts, and forecast summary.
 */

import { useQuery } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

// ── Types ──────────────────────────────────────────────────────────────────

interface PerModelStats {
  provider: string;
  model: string;
  calls: number;
  totalTokens: number;
  totalCostUsd: number;
  avgCostPerCall: number;
  avgOutputTokens: number;
}

interface RoutingSuggestion {
  currentModel: string;
  currentProvider: string;
  suggestedModel: string;
  suggestedProvider: string;
  affectedCalls: number;
  currentCostUsd: number;
  projectedCostUsd: number;
  savingsUsd: number;
  savingsPercent: number;
  reason: string;
}

interface CostForecast {
  dailyProjected: number;
  weeklyProjected: number;
  monthlyProjected: number;
  trend: 'increasing' | 'decreasing' | 'stable';
  confidence: number;
}

interface DetailedCostAnalysis {
  totalCostUsd: number;
  dailyAverageCostUsd: number;
  topModels: { model: string; costUsd: number; callCount: number }[];
  perModelStats: PerModelStats[];
  workloadBreakdown: { simple: number; moderate: number; complex: number };
  potentialSavingsUsd: number;
  routingSuggestions: RoutingSuggestion[];
  forecast: CostForecast;
  analyzedAt: number;
}

// ── API helper ─────────────────────────────────────────────────────────────

async function fetchApi<T>(path: string): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(path, {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

// ── Component ──────────────────────────────────────────────────────────────

export function CostOptimizerWidget() {
  const { data, isLoading, error } = useQuery<DetailedCostAnalysis>({
    queryKey: ['cost-analysis'],
    queryFn: () => fetchApi('/api/v1/model/cost-analysis?days=7'),
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Loading cost analysis...</div>;
  }

  if (error || !data) {
    return <div className="p-4 text-sm text-zinc-500">Cost data unavailable</div>;
  }

  const { forecast, workloadBreakdown, routingSuggestions, perModelStats, potentialSavingsUsd } =
    data;

  // Sparkline data from top models (simplified — uses per-model cost as bar heights)
  const topModels = perModelStats.slice(0, 5);
  const maxCost = Math.max(...topModels.map((m) => m.totalCostUsd), 0.01);

  const trendIcon =
    forecast.trend === 'increasing'
      ? '\u2191'
      : forecast.trend === 'decreasing'
        ? '\u2193'
        : '\u2192';
  const trendColor =
    forecast.trend === 'increasing'
      ? 'text-red-400'
      : forecast.trend === 'decreasing'
        ? 'text-green-400'
        : 'text-zinc-400';

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">Cost Optimizer</h3>

      {/* Forecast Summary */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Forecast</div>
        <div className="grid grid-cols-3 gap-2 text-center">
          <div>
            <div className="text-lg font-bold text-zinc-200">
              ${forecast.dailyProjected.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500">Daily</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-200">
              ${forecast.weeklyProjected.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500">Weekly</div>
          </div>
          <div>
            <div className="text-lg font-bold text-zinc-200">
              ${forecast.monthlyProjected.toFixed(2)}
            </div>
            <div className="text-xs text-zinc-500">Monthly</div>
          </div>
        </div>
        <div className="mt-2 flex items-center justify-between text-xs">
          <span className={trendColor}>
            {trendIcon} {forecast.trend}
          </span>
          <span className="text-zinc-500">
            Confidence: {Math.round(forecast.confidence * 100)}%
          </span>
        </div>
      </div>

      {/* Top Models by Cost (bar chart) */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Top Models by Cost</div>
        {topModels.length === 0 ? (
          <div className="text-xs text-zinc-500">No usage data</div>
        ) : (
          <div className="space-y-1.5">
            {topModels.map((m) => (
              <div key={`${m.provider}/${m.model}`} className="flex items-center gap-2">
                <span className="w-28 truncate text-xs text-zinc-400" title={m.model}>
                  {m.model}
                </span>
                <div className="h-3 flex-1 rounded bg-zinc-700">
                  <div
                    className="h-3 rounded bg-blue-500"
                    style={{ width: `${(m.totalCostUsd / maxCost) * 100}%` }}
                  />
                </div>
                <span className="w-14 text-right text-xs text-zinc-400">
                  ${m.totalCostUsd.toFixed(2)}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Workload Breakdown */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Workload Breakdown</div>
        <div className="flex h-4 overflow-hidden rounded">
          {workloadBreakdown.simple > 0 && (
            <div
              className="bg-green-600"
              style={{ width: `${workloadBreakdown.simple}%` }}
              title={`Simple: ${workloadBreakdown.simple}%`}
            />
          )}
          {workloadBreakdown.moderate > 0 && (
            <div
              className="bg-yellow-600"
              style={{ width: `${workloadBreakdown.moderate}%` }}
              title={`Moderate: ${workloadBreakdown.moderate}%`}
            />
          )}
          {workloadBreakdown.complex > 0 && (
            <div
              className="bg-red-600"
              style={{ width: `${workloadBreakdown.complex}%` }}
              title={`Complex: ${workloadBreakdown.complex}%`}
            />
          )}
        </div>
        <div className="mt-1.5 flex justify-between text-xs text-zinc-500">
          <span>Simple {workloadBreakdown.simple}%</span>
          <span>Moderate {workloadBreakdown.moderate}%</span>
          <span>Complex {workloadBreakdown.complex}%</span>
        </div>
      </div>

      {/* Routing Suggestions */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 flex items-center justify-between">
          <span className="font-medium text-zinc-300">Routing Suggestions</span>
          {potentialSavingsUsd > 0 && (
            <span className="text-xs font-medium text-green-400">
              Save ${potentialSavingsUsd.toFixed(2)}
            </span>
          )}
        </div>
        {routingSuggestions.length === 0 ? (
          <div className="text-xs text-zinc-500">All usage is optimal</div>
        ) : (
          <div className="space-y-2">
            {routingSuggestions.slice(0, 3).map((s, i) => (
              <div key={i} className="rounded bg-zinc-800 p-2">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-zinc-300">
                    {s.currentModel} → {s.suggestedModel}
                  </span>
                  <span className="text-green-400">-{s.savingsPercent}%</span>
                </div>
                <div className="mt-0.5 text-xs text-zinc-500">
                  {s.affectedCalls} calls | Save ${s.savingsUsd.toFixed(2)}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
