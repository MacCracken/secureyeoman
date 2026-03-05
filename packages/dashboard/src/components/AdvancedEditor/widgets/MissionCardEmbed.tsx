/**
 * MissionCardEmbed — Reusable Mission Control card renderer for the canvas workspace.
 *
 * Renders the same content as the Mission Control tab cards, with self-contained
 * data fetching via React Query. Accepts a cardId and renders the appropriate section.
 */

import { memo } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../../../api/client';
import type { MissionCardId } from '../../MissionControl/registry';
import { CARD_REGISTRY } from '../../MissionControl/registry';

interface MissionCardEmbedProps {
  cardId: MissionCardId;
}

export const MissionCardEmbed = memo(function MissionCardEmbed({ cardId }: MissionCardEmbedProps) {
  const navigate = useNavigate();
  const cardDef = CARD_REGISTRY.find((c) => c.id === cardId);

  const { data: metrics } = useQuery({
    queryKey: ['metrics-embed', cardId],
    queryFn: fetchMetrics,
    refetchInterval: 15_000,
  });

  if (!cardDef) {
    return (
      <div className="flex items-center justify-center h-full text-xs text-muted-foreground p-4">
        Unknown card: {cardId}
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-auto">
      <div className="px-3 py-2 border-b bg-muted/30">
        <div className="text-xs font-medium">{cardDef.label}</div>
        <div className="text-[10px] text-muted-foreground">{cardDef.description}</div>
      </div>
      <div className="flex-1 p-3 text-xs">
        <MissionCardSummary cardId={cardId} metrics={metrics as Record<string, unknown> | undefined} navigate={navigate} />
      </div>
    </div>
  );
});

/** Lightweight summary renderer for embedded mission cards. */
function MissionCardSummary({
  cardId,
  metrics,
  navigate,
}: {
  cardId: MissionCardId;
  metrics: Record<string, unknown> | undefined;
  navigate: ReturnType<typeof useNavigate>;
}) {
  if (!metrics) {
    return <div className="text-muted-foreground">Loading metrics...</div>;
  }

  const m = metrics as Record<string, number | undefined>;

  switch (cardId) {
    case 'kpi-bar':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Active Tasks" value={m.activeTasks} />
          <Stat label="Active Agents" value={m.activePersonalities} />
          <Stat label="Token Usage" value={m.totalTokens} />
          <Stat label="Uptime" value={m.uptimeSeconds ? `${Math.floor((m.uptimeSeconds as number) / 3600)}h` : '-'} />
        </div>
      );
    case 'resource-monitoring':
      return (
        <div className="grid grid-cols-2 gap-2">
          <Stat label="CPU" value={m.cpuPercent != null ? `${Number(m.cpuPercent).toFixed(1)}%` : '-'} />
          <Stat label="Memory" value={m.memoryPercent != null ? `${Number(m.memoryPercent).toFixed(1)}%` : '-'} />
          <Stat label="Tokens/min" value={m.tokensPerMinute} />
          <Stat label="Requests/min" value={m.requestsPerMinute} />
        </div>
      );
    case 'active-tasks':
      return (
        <div className="space-y-1">
          <Stat label="Running" value={m.activeTasks ?? 0} />
          <Stat label="Queued" value={m.queuedTasks ?? 0} />
          <button
            className="text-primary text-[10px] hover:underline mt-1"
            onClick={() => navigate('/tasks')}
          >
            View all tasks
          </button>
        </div>
      );
    case 'workflow-runs':
      return (
        <div className="space-y-1">
          <Stat label="Active Workflows" value={m.activeWorkflows ?? 0} />
          <Stat label="Completed Today" value={m.completedWorkflows ?? 0} />
          <button
            className="text-primary text-[10px] hover:underline mt-1"
            onClick={() => navigate('/workflows')}
          >
            View workflows
          </button>
        </div>
      );
    case 'agent-health':
      return (
        <div className="space-y-1">
          <Stat label="Active Agents" value={m.activePersonalities ?? 0} />
          <Stat label="Healthy" value={m.healthyAgents ?? '-'} />
        </div>
      );
    case 'system-health':
      return (
        <div className="space-y-1">
          <Stat label="MCP Servers" value={m.mcpServers ?? 0} />
          <Stat label="Status" value={m.systemHealthy ? 'Healthy' : 'Degraded'} />
        </div>
      );
    case 'cost-breakdown':
      return (
        <div className="space-y-1">
          <Stat label="Total Spend" value={m.totalCost != null ? `$${Number(m.totalCost).toFixed(2)}` : '-'} />
          <Stat label="Tokens Used" value={m.totalTokens ?? 0} />
        </div>
      );
    default:
      return (
        <div className="text-muted-foreground">
          <div className="font-medium mb-1">{cardId}</div>
          <div>Open Mission Control for the full view.</div>
        </div>
      );
  }
}

function Stat({ label, value }: { label: string; value: string | number | undefined }) {
  return (
    <div>
      <div className="text-[10px] text-muted-foreground">{label}</div>
      <div className="text-sm font-medium">{value ?? '-'}</div>
    </div>
  );
}
