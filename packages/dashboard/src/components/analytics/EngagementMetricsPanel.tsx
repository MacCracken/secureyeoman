/**
 * EngagementMetricsPanel — 4 KPI stat cards for engagement metrics.
 */

import type { EngagementMetrics } from '../../api/client';

interface EngagementMetricsPanelProps {
  data: EngagementMetrics | undefined;
  isLoading: boolean;
}

function StatCard({ label, value, subtitle }: { label: string; value: string; subtitle?: string }) {
  return (
    <div className="bg-card border rounded-lg p-4">
      <div className="text-xs text-muted-foreground font-medium">{label}</div>
      <div className="text-2xl font-bold mt-1">{value}</div>
      {subtitle && <div className="text-xs text-muted-foreground mt-0.5">{subtitle}</div>}
    </div>
  );
}

function fmtPct(n: number): string {
  return `${(n * 100).toFixed(1)}%`;
}

export function EngagementMetricsPanel({ data, isLoading }: EngagementMetricsPanelProps) {
  if (isLoading || !data) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="engagement-metrics-panel">
        {[1, 2, 3, 4].map((i) => (
          <div key={i} className="bg-card border rounded-lg p-4 animate-pulse h-20" />
        ))}
      </div>
    );
  }

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3" data-testid="engagement-metrics-panel">
      <StatCard
        label="Avg Conversation Length"
        value={data.avgConversationLength.toFixed(1)}
        subtitle={`${data.totalConversations} total conversations`}
      />
      <StatCard
        label="Follow-up Rate"
        value={fmtPct(data.followUpRate)}
        subtitle="Conversations with > 2 messages"
      />
      <StatCard
        label="Abandonment Rate"
        value={fmtPct(data.abandonmentRate)}
        subtitle="Short + stale conversations"
      />
      <StatCard
        label="Tool Call Success"
        value={fmtPct(data.toolCallSuccessRate)}
        subtitle="Successful tool executions"
      />
    </div>
  );
}
