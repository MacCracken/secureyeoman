/**
 * Cost Analytics Page
 *
 * Displays cost breakdowns, provider usage, and optimization recommendations
 */

import { useQuery } from '@tanstack/react-query';
import {
  DollarSign,
  TrendingUp,
  Zap,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  Loader2,
} from 'lucide-react';
import { fetchMetrics, fetchCostBreakdown } from '../api/client';
import type { CostBreakdownResponse } from '../api/client';
import type { MetricsSnapshot } from '../types';

// ── Component ────────────────────────────────────────────────────────

export function CostsPage() {
  const { data: metrics, isLoading: metricsLoading } = useQuery<MetricsSnapshot>({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 30_000,
  });

  const { data: breakdown, isLoading: breakdownLoading } = useQuery<CostBreakdownResponse>({
    queryKey: ['costs-breakdown'],
    queryFn: fetchCostBreakdown,
    refetchInterval: 60_000,
  });

  const isLoading = metricsLoading || breakdownLoading;
  const resources = metrics?.resources;
  const providers = breakdown?.byProvider ?? {};
  const recommendations = breakdown?.recommendations ?? [];

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Cost Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor spending, token usage, and optimization opportunities
        </p>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard
          icon={<DollarSign className="w-5 h-5 text-success" />}
          label="Cost Today"
          value={`$${(resources?.costUsdToday ?? 0).toFixed(4)}`}
          loading={metricsLoading}
        />
        <SummaryCard
          icon={<TrendingUp className="w-5 h-5 text-primary" />}
          label="Cost This Month"
          value={`$${(resources?.costUsdMonth ?? 0).toFixed(4)}`}
          loading={metricsLoading}
        />
        <SummaryCard
          icon={<BarChart3 className="w-5 h-5 text-primary" />}
          label="Total API Calls"
          value={(resources?.apiCallsTotal ?? 0).toLocaleString()}
          loading={metricsLoading}
        />
        <SummaryCard
          icon={<Zap className="w-5 h-5 text-warning" />}
          label="Avg Latency"
          value={`${(resources?.apiLatencyAvgMs ?? 0).toFixed(0)} ms`}
          loading={metricsLoading}
        />
      </div>

      {/* Token Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="p-4 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Tokens Used Today</p>
          <p className="text-xl font-bold">
            {metricsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin inline" />
            ) : (
              (resources?.tokensUsedToday ?? 0).toLocaleString()
            )}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">Tokens Cached Today</p>
          <p className="text-xl font-bold">
            {metricsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin inline" />
            ) : (
              (resources?.tokensCachedToday ?? 0).toLocaleString()
            )}
          </p>
        </div>
        <div className="p-4 rounded-lg bg-muted/30">
          <p className="text-xs text-muted-foreground mb-1">API Errors</p>
          <p className="text-xl font-bold">
            {metricsLoading ? (
              <Loader2 className="w-4 h-4 animate-spin inline" />
            ) : (
              (resources?.apiErrorsTotal ?? 0).toLocaleString()
            )}
          </p>
        </div>
      </div>

      {/* Provider Breakdown Table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Provider Breakdown</h2>
          <p className="card-description">Cost and usage by AI provider</p>
        </div>
        <div className="card-content">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : Object.keys(providers).length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No provider data available yet.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Provider
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Tokens Used
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Cost
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Calls
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Errors
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {Object.entries(providers)
                    .sort(([, a], [, b]) => b.costUsd - a.costUsd)
                    .map(([provider, data]) => (
                      <tr key={provider} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-3 px-4 font-medium">{provider}</td>
                        <td className="py-3 px-4 text-right font-mono">
                          {data.tokensUsed.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          ${data.costUsd.toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {data.calls.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {data.errors > 0 ? (
                            <span className="text-destructive">{data.errors.toLocaleString()}</span>
                          ) : (
                            <span className="text-muted-foreground">0</span>
                          )}
                        </td>
                      </tr>
                    ))}
                </tbody>
                <tfoot>
                  <tr className="border-t border-border">
                    <td className="py-3 px-4 font-bold">Total</td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {Object.values(providers)
                        .reduce((sum, p) => sum + p.tokensUsed, 0)
                        .toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      $
                      {Object.values(providers)
                        .reduce((sum, p) => sum + p.costUsd, 0)
                        .toFixed(4)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {Object.values(providers)
                        .reduce((sum, p) => sum + p.calls, 0)
                        .toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono font-bold">
                      {Object.values(providers).reduce((sum, p) => sum + p.errors, 0).toLocaleString()}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </div>
      </div>

      {/* Cost Recommendations */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Cost Recommendations</h2>
          <p className="card-description">Suggestions to optimize your AI spending</p>
        </div>
        <div className="card-content">
          {breakdownLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : recommendations.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No recommendations at this time. Your usage looks efficient.
            </div>
          ) : (
            <div className="space-y-4">
              {recommendations.map((rec) => (
                <RecommendationCard key={rec.id} recommendation={rec} />
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Sub-components ───────────────────────────────────────────────────

interface SummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
}

function SummaryCard({ icon, label, value, loading }: SummaryCardProps) {
  return (
    <div className="p-4 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 mb-2">
        {icon}
        <span className="text-sm text-muted-foreground">{label}</span>
      </div>
      <p className="text-2xl font-bold">
        {loading ? <Loader2 className="w-5 h-5 animate-spin" /> : value}
      </p>
    </div>
  );
}

interface RecommendationCardProps {
  recommendation: CostBreakdownResponse['recommendations'][number];
}

function RecommendationCard({ recommendation }: RecommendationCardProps) {
  const priorityStyles: Record<string, string> = {
    high: 'bg-destructive/10 text-destructive',
    medium: 'bg-warning/10 text-warning',
    low: 'bg-success/10 text-success',
  };

  return (
    <div className="p-4 rounded-lg border border-border/50 hover:border-border transition-colors">
      <div className="flex items-start justify-between gap-4">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 mb-1">
            <AlertTriangle className="w-4 h-4 text-muted-foreground shrink-0" />
            <h3 className="font-medium truncate">{recommendation.title}</h3>
            <span
              className={`px-2 py-0.5 rounded-full text-xs font-medium ${priorityStyles[recommendation.priority] ?? priorityStyles.low}`}
            >
              {recommendation.priority}
            </span>
          </div>
          <p className="text-sm text-muted-foreground mb-2">{recommendation.description}</p>
          <div className="flex items-center gap-4 text-xs text-muted-foreground">
            <span>
              Category: <span className="font-medium text-foreground">{recommendation.category}</span>
            </span>
            <span>
              Current cost:{' '}
              <span className="font-mono font-medium text-foreground">
                ${recommendation.currentCostUsd.toFixed(4)}
              </span>
            </span>
            <span>
              Est. savings:{' '}
              <span className="font-mono font-medium text-success">
                ${recommendation.estimatedSavingsUsd.toFixed(4)}
              </span>
            </span>
          </div>
        </div>
        <div className="shrink-0">
          <div className="flex items-center gap-1 text-xs text-primary">
            <span>{recommendation.suggestedAction}</span>
            <ArrowRight className="w-3 h-3" />
          </div>
        </div>
      </div>
    </div>
  );
}
