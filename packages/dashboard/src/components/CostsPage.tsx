/**
 * Cost Analytics Page
 *
 * Displays cost breakdowns, provider usage, and optimization recommendations.
 * Includes a History tab with date/provider/model/personality filtering.
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  DollarSign,
  TrendingUp,
  Zap,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  Loader2,
  X,
  RotateCcw,
} from 'lucide-react';
import {
  fetchMetrics,
  fetchCostBreakdown,
  fetchCostHistory,
  fetchPersonalities,
  resetUsageStat,
} from '../api/client';
import type { CostBreakdownResponse, CostHistoryParams } from '../api/client';
import type { MetricsSnapshot, Personality } from '../types';

type TabId = 'summary' | 'history';

// ── Component ────────────────────────────────────────────────────────

export function CostsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('summary');

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <div>
        <h1 className="text-2xl font-bold">Cost Analytics</h1>
        <p className="text-muted-foreground text-sm mt-1">
          Monitor spending, token usage, and optimization opportunities
        </p>
      </div>

      {/* Tab Switcher */}
      <div className="flex gap-1 border-b border-border">
        {(['summary', 'history'] as TabId[]).map((tab) => (
          <button
            key={tab}
            onClick={() => { setActiveTab(tab); }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeTab === 'summary' && <SummaryTab />}
      {activeTab === 'history' && <HistoryTab />}
    </div>
  );
}

// ── Summary Tab ──────────────────────────────────────────────────────

function SummaryTab() {
  const queryClient = useQueryClient();

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

  const resetMutation = useMutation({
    mutationFn: resetUsageStat,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['metrics'] });
    },
  });

  const isLoading = metricsLoading || breakdownLoading;
  const resources = metrics?.resources;
  const providers = breakdown?.byProvider ?? {};
  const recommendations = breakdown?.recommendations ?? [];

  return (
    <>
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
          onReset={() => { resetMutation.mutate('latency'); }}
          resetting={resetMutation.isPending && resetMutation.variables === 'latency'}
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
          <div className="flex items-center justify-between mb-1">
            <p className="text-xs text-muted-foreground">API Errors</p>
            <button
              className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
              disabled={resetMutation.isPending}
              onClick={() => { resetMutation.mutate('errors'); }}
              title="Reset error counter"
            >
              {resetMutation.isPending && resetMutation.variables === 'errors' ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <RotateCcw className="w-3 h-3" />
              )}
              Reset
            </button>
          </div>
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
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost</th>
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
                      {Object.values(providers)
                        .reduce((sum, p) => sum + p.errors, 0)
                        .toLocaleString()}
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
    </>
  );
}

// ── History Tab ──────────────────────────────────────────────────────

const EMPTY_FILTERS: CostHistoryParams = {
  from: '',
  to: '',
  provider: '',
  model: '',
  personalityId: '',
  groupBy: 'day',
};

function HistoryTab() {
  const [filters, setFilters] = useState<CostHistoryParams>(EMPTY_FILTERS);
  const [appliedFilters, setAppliedFilters] = useState<CostHistoryParams>(EMPTY_FILTERS);

  const { data: personalitiesData } = useQuery<{ personalities: Personality[] }>({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
  });
  const personalities = personalitiesData?.personalities ?? [];

  const { data, isLoading } = useQuery({
    queryKey: ['costs-history', appliedFilters],
    queryFn: () => {
      const params: CostHistoryParams = {};
      if (appliedFilters.from) {
        params.from = String(new Date(appliedFilters.from).getTime());
      }
      if (appliedFilters.to) {
        // End-of-day for the "to" date
        const d = new Date(appliedFilters.to);
        d.setHours(23, 59, 59, 999);
        params.to = String(d.getTime());
      }
      if (appliedFilters.provider) params.provider = appliedFilters.provider;
      if (appliedFilters.model) params.model = appliedFilters.model;
      if (appliedFilters.personalityId) params.personalityId = appliedFilters.personalityId;
      params.groupBy = appliedFilters.groupBy ?? 'day';
      return fetchCostHistory(params);
    },
  });

  const records = data?.records ?? [];
  const totals = data?.totals ?? { totalTokens: 0, costUsd: 0, calls: 0 };

  const hasActiveFilters = Object.entries(appliedFilters).some(
    ([k, v]) => k !== 'groupBy' && v !== ''
  );

  const handleClear = () => {
    setFilters(EMPTY_FILTERS);
    setAppliedFilters(EMPTY_FILTERS);
  };

  const handleApply = () => {
    setAppliedFilters({ ...filters });
  };

  return (
    <div className="space-y-4">
      {/* Filter bar */}
      <div className="card p-4 space-y-4">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm">Filters</h3>
          {hasActiveFilters && (
            <button
              onClick={handleClear}
              className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
            >
              <X className="w-3 h-3" />
              Clear
            </button>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">From</label>
            <input
              type="date"
              value={filters.from ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, from: e.target.value })); }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, to: e.target.value })); }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              value={filters.provider ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, provider: e.target.value })); }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All providers</option>
              <option value="anthropic">Anthropic</option>
              <option value="openai">OpenAI</option>
              <option value="gemini">Gemini</option>
              <option value="ollama">Ollama</option>
              <option value="deepseek">DeepSeek</option>
              <option value="mistral">Mistral</option>
              <option value="lmstudio">LM Studio</option>
              <option value="localai">LocalAI</option>
              <option value="opencode">OpenCode</option>
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Model</label>
            <input
              type="text"
              value={filters.model ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, model: e.target.value })); }}
              placeholder="Filter by model name…"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Personality</label>
            <select
              value={filters.personalityId ?? ''}
              onChange={(e) => { setFilters((f) => ({ ...f, personalityId: e.target.value })); }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="">All personalities</option>
              {personalities.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Group By</label>
            <select
              value={filters.groupBy ?? 'day'}
              onChange={(e) =>
                { setFilters((f) => ({ ...f, groupBy: e.target.value as 'day' | 'hour' })); }
              }
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            >
              <option value="day">Day</option>
              <option value="hour">Hour</option>
            </select>
          </div>
        </div>
        <div className="flex justify-end">
          <button
            onClick={handleApply}
            className="px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90"
          >
            Apply
          </button>
        </div>
      </div>

      {/* Results table */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title">Usage History</h2>
          <p className="card-description">Aggregated token usage and cost over time</p>
        </div>
        <div className="card-content">
          {isLoading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
            </div>
          ) : records.length === 0 ? (
            <div className="text-center py-12 text-sm text-muted-foreground">
              No usage records found for the selected filters.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border">
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Date</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Provider
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">Model</th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Personality
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Tokens
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">Cost</th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Calls
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {records.map((row, i) => {
                    const personality = personalities.find((p) => p.id === row.personalityId);
                    return (
                      <tr key={i} className="border-b border-border/50 hover:bg-muted/20">
                        <td className="py-3 px-4 font-mono text-xs">{row.date}</td>
                        <td className="py-3 px-4">{row.provider}</td>
                        <td className="py-3 px-4 font-mono text-xs max-w-[180px] truncate">
                          {row.model}
                        </td>
                        <td className="py-3 px-4 text-muted-foreground text-xs">
                          {personality?.name ?? row.personalityId ?? '—'}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          {row.totalTokens.toLocaleString()}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">
                          ${row.costUsd.toFixed(4)}
                        </td>
                        <td className="py-3 px-4 text-right font-mono">{row.calls}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-border font-bold">
                    <td className="py-3 px-4" colSpan={4}>
                      Total
                    </td>
                    <td className="py-3 px-4 text-right font-mono">
                      {totals.totalTokens.toLocaleString()}
                    </td>
                    <td className="py-3 px-4 text-right font-mono">${totals.costUsd.toFixed(4)}</td>
                    <td className="py-3 px-4 text-right font-mono">{totals.calls}</td>
                  </tr>
                </tfoot>
              </table>
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
  onReset?: () => void;
  resetting?: boolean;
}

function SummaryCard({ icon, label, value, loading, onReset, resetting }: SummaryCardProps) {
  return (
    <div className="p-4 rounded-lg bg-muted/30">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          {icon}
          <span className="text-sm text-muted-foreground">{label}</span>
        </div>
        {onReset && (
          <button
            className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 disabled:opacity-50"
            disabled={resetting}
            onClick={onReset}
            title={`Reset ${label}`}
          >
            {resetting ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <RotateCcw className="w-3 h-3" />
            )}
            Reset
          </button>
        )}
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
              Category:{' '}
              <span className="font-medium text-foreground">{recommendation.category}</span>
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
