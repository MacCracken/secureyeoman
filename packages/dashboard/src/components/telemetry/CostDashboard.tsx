/**
 * CostDashboard — Per-account AI provider cost tracking (Phase 112).
 *
 * Overview cards, account cost table, and cost trend chart.
 */

import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { DollarSign, Download, TrendingUp, BarChart3 } from 'lucide-react';
import {
  fetchAccountCosts,
  fetchAccountCostTrend,
  exportAccountCostsCsv,
  type AccountCostSummaryResponse,
  type CostTrendPointResponse,
} from '../../api/client';

type Period = '7d' | '30d' | '90d';

function periodToDays(p: Period): number {
  switch (p) {
    case '7d':
      return 7;
    case '30d':
      return 30;
    case '90d':
      return 90;
  }
}

function periodToFrom(p: Period): number {
  return Date.now() - periodToDays(p) * 24 * 60 * 60 * 1000;
}

export function CostDashboard() {
  const [period, setPeriod] = useState<Period>('30d');

  const { data: costs, isLoading: costsLoading } = useQuery({
    queryKey: ['provider-account-costs', period],
    queryFn: () => fetchAccountCosts({ from: periodToFrom(period) }),
    refetchOnWindowFocus: false,
  });

  const { data: trend } = useQuery({
    queryKey: ['provider-account-costs-trend', period],
    queryFn: () => fetchAccountCostTrend({ days: periodToDays(period) }),
    refetchOnWindowFocus: false,
  });

  const totalCost = costs?.reduce((sum, c) => sum + c.totalCostUsd, 0) ?? 0;
  const totalRequests = costs?.reduce((sum, c) => sum + c.totalRequests, 0) ?? 0;
  const topProvider = costs?.length
    ? costs.reduce((max, c) => (c.totalCostUsd > max.totalCostUsd ? c : max), costs[0]!)
    : null;
  const dailyAvg = totalCost / periodToDays(period);

  const handleExport = async () => {
    const csv = await exportAccountCostsCsv({ from: periodToFrom(period) });
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'provider-costs.csv';
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Period selector */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold flex items-center gap-2">
          <DollarSign className="w-5 h-5" />
          Provider Costs
        </h3>
        <div className="flex items-center gap-2">
          <div className="flex rounded-lg border bg-muted/30 p-0.5">
            {(['7d', '30d', '90d'] as Period[]).map((p) => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                className={`px-3 py-1 text-xs rounded-md transition-colors ${
                  period === p ? 'bg-background shadow-sm font-medium' : 'hover:bg-background/50'
                }`}
              >
                {p}
              </button>
            ))}
          </div>
          <button
            onClick={() => void handleExport()}
            className="flex items-center gap-1 px-3 py-1.5 text-xs border rounded-lg hover:bg-muted/50 transition-colors"
            title="Export CSV"
          >
            <Download className="w-3.5 h-3.5" />
            CSV
          </button>
        </div>
      </div>

      {/* Overview cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <OverviewCard
          label="Total Spend"
          value={`$${totalCost.toFixed(4)}`}
          icon={<DollarSign className="w-4 h-4 text-emerald-500" />}
        />
        <OverviewCard
          label="Daily Average"
          value={`$${dailyAvg.toFixed(4)}`}
          icon={<TrendingUp className="w-4 h-4 text-blue-500" />}
        />
        <OverviewCard
          label="Top Provider"
          value={topProvider?.provider ?? '—'}
          icon={<BarChart3 className="w-4 h-4 text-purple-500" />}
        />
        <OverviewCard
          label="Total Requests"
          value={totalRequests.toLocaleString()}
          icon={<BarChart3 className="w-4 h-4 text-orange-500" />}
        />
      </div>

      {/* Cost table */}
      {costsLoading ? (
        <div className="text-sm text-muted-foreground">Loading costs...</div>
      ) : costs && costs.length > 0 ? (
        <CostTable costs={costs} />
      ) : (
        <div className="text-sm text-muted-foreground border rounded-lg p-6 text-center">
          No cost data for this period. Costs are recorded automatically when provider accounts are
          used.
        </div>
      )}

      {/* Simple trend visualization */}
      {trend && trend.length > 0 && <TrendBars trend={trend} />}
    </div>
  );
}

function OverviewCard({
  label,
  value,
  icon,
}: {
  label: string;
  value: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="border rounded-lg p-4 space-y-1">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon} {label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function CostTable({ costs }: { costs: AccountCostSummaryResponse[] }) {
  return (
    <div className="border rounded-lg overflow-hidden">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-muted/50 border-b">
            <th className="text-left px-4 py-2 font-medium">Provider</th>
            <th className="text-left px-4 py-2 font-medium">Account</th>
            <th className="text-right px-4 py-2 font-medium">Cost (USD)</th>
            <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">Input Tokens</th>
            <th className="text-right px-4 py-2 font-medium hidden sm:table-cell">
              Output Tokens
            </th>
            <th className="text-right px-4 py-2 font-medium">Requests</th>
          </tr>
        </thead>
        <tbody>
          {costs.map((c) => (
            <tr key={c.accountId} className="border-b last:border-0 hover:bg-muted/30">
              <td className="px-4 py-2">{c.provider}</td>
              <td className="px-4 py-2 text-muted-foreground">{c.label}</td>
              <td className="px-4 py-2 text-right font-mono">${c.totalCostUsd.toFixed(4)}</td>
              <td className="px-4 py-2 text-right font-mono hidden sm:table-cell">
                {c.totalInputTokens.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right font-mono hidden sm:table-cell">
                {c.totalOutputTokens.toLocaleString()}
              </td>
              <td className="px-4 py-2 text-right font-mono">{c.totalRequests.toLocaleString()}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function TrendBars({ trend }: { trend: CostTrendPointResponse[] }) {
  const maxCost = Math.max(...trend.map((t) => t.costUsd), 0.0001);

  return (
    <div className="space-y-2">
      <h4 className="text-sm font-medium text-muted-foreground">Daily Cost Trend</h4>
      <div className="flex items-end gap-1 h-24 border rounded-lg p-3">
        {trend.map((t) => {
          const pct = Math.max((t.costUsd / maxCost) * 100, 2);
          return (
            <div
              key={t.date}
              className="flex-1 bg-emerald-500/70 hover:bg-emerald-500 rounded-t transition-colors"
              style={{ height: `${pct}%` }}
              title={`${t.date}: $${t.costUsd.toFixed(4)} (${t.requests} req)`}
            />
          );
        })}
      </div>
    </div>
  );
}
