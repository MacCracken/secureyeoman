import { useState, useCallback } from 'react';
import { useLocation } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import { Shield, Activity, Server, Database, Cpu, Network, Link, ChevronDown } from 'lucide-react';
import { fetchHealth, fetchMetrics, fetchAuditStats, fetchMcpServers } from '../../api/client';
import type { MetricsSnapshot, HealthStatus, McpServerConfig } from '../../types';

interface NodeDef {
  id: string;
  label: string;
  icon: React.ReactNode;
}

const NODE_DEFS: NodeDef[] = [
  { id: 'agent', label: 'Agent Core', icon: <Shield className="w-4 h-4" /> },
  { id: 'tasks', label: 'Task Queue', icon: <Activity className="w-4 h-4" /> },
  { id: 'database', label: 'Postgres', icon: <Server className="w-4 h-4" /> },
  { id: 'audit', label: 'Audit Chain', icon: <Database className="w-4 h-4" /> },
  { id: 'resources', label: 'Memory', icon: <Cpu className="w-4 h-4" /> },
  { id: 'security', label: 'Security', icon: <Network className="w-4 h-4" /> },
  { id: 'mcp', label: 'MCP Servers', icon: <Link className="w-4 h-4" /> },
];

function getNodeStatus(
  nodeId: string,
  health?: HealthStatus,
  metrics?: MetricsSnapshot,
  mcpServers?: McpServerConfig[]
): 'ok' | 'warning' | 'error' {
  switch (nodeId) {
    case 'agent':
      return health?.status === 'ok' ? 'ok' : 'error';
    case 'tasks':
      return (metrics?.tasks?.queueDepth ?? 0) > 10 ? 'warning' : 'ok';
    case 'database':
      return health?.checks?.database ? 'ok' : 'error';
    case 'audit':
      return health?.checks?.auditChain ? 'ok' : 'error';
    case 'resources':
      return (metrics?.resources?.memoryPercent ?? 0) > 80 ? 'warning' : 'ok';
    case 'security':
      return (metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'warning' : 'ok';
    case 'mcp': {
      const total = mcpServers?.length ?? 0;
      const enabled = mcpServers?.filter((s) => s.enabled).length ?? 0;
      return total === 0 ? 'warning' : enabled > 0 ? 'ok' : 'error';
    }
    default:
      return 'ok';
  }
}

const NODE_STATUS_BADGE: Record<string, { className: string; label: string }> = {
  ok: { className: 'badge-success', label: 'OK' },
  warning: { className: 'badge-warning', label: 'Warning' },
  error: { className: 'badge-error', label: 'Error' },
};

function DetailRow({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <>
      <span className="text-muted-foreground text-xs">{label}</span>
      <span className="text-sm font-medium">{value}</span>
    </>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1000).toFixed(2)}s`;
}

function formatNodeUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function NodePanel({
  def,
  health,
  metrics,
  auditStats,
  mcpServers,
  expanded,
  onToggle,
}: {
  def: NodeDef;
  health?: HealthStatus;
  metrics?: MetricsSnapshot;
  auditStats?: {
    totalEntries: number;
    oldestEntry?: number;
    lastVerification?: number;
    chainValid: boolean;
    dbSizeEstimateMb?: number;
  };
  mcpServers?: McpServerConfig[];
  expanded: boolean;
  onToggle: () => void;
}) {
  const status = getNodeStatus(def.id, health, metrics, mcpServers);
  const badge = NODE_STATUS_BADGE[status];

  const renderDetails = () => {
    switch (def.id) {
      case 'agent':
        return (
          <>
            <DetailRow label="Status" value={health?.status ?? 'unknown'} />
            <DetailRow label="Version" value={health?.version ?? '-'} />
            <DetailRow
              label="Uptime"
              value={health?.uptime ? formatNodeUptime(health.uptime) : '-'}
            />
            <DetailRow label="Active Tasks" value={metrics?.tasks?.inProgress ?? 0} />
            <DetailRow label="Queue Depth" value={metrics?.tasks?.queueDepth ?? 0} />
            <DetailRow
              label="Success Rate"
              value={`${((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%`}
            />
          </>
        );
      case 'tasks':
        return (
          <>
            <DetailRow label="Queue Depth" value={metrics?.tasks?.queueDepth ?? 0} />
            <DetailRow label="In Progress" value={metrics?.tasks?.inProgress ?? 0} />
            <DetailRow label="Total Tasks" value={metrics?.tasks?.total ?? 0} />
            <DetailRow
              label="Success Rate"
              value={`${((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%`}
            />
            <DetailRow
              label="Failure Rate"
              value={`${((metrics?.tasks?.failureRate ?? 0) * 100).toFixed(1)}%`}
            />
            <DetailRow
              label="Avg Duration"
              value={formatDuration(metrics?.tasks?.avgDurationMs ?? 0)}
            />
            <DetailRow
              label="P95 Duration"
              value={formatDuration(metrics?.tasks?.p95DurationMs ?? 0)}
            />
            <DetailRow
              label="P99 Duration"
              value={formatDuration(metrics?.tasks?.p99DurationMs ?? 0)}
            />
          </>
        );
      case 'database':
        return (
          <>
            <DetailRow label="Connection" value={health?.checks?.database ? 'Connected' : 'Down'} />
            <DetailRow label="Audit Entries" value={auditStats?.totalEntries ?? 0} />
            <DetailRow label="Chain Valid" value={auditStats?.chainValid ? 'Yes' : 'No'} />
            <DetailRow
              label="Last Verification"
              value={
                auditStats?.lastVerification
                  ? new Date(auditStats.lastVerification).toLocaleString()
                  : 'Never'
              }
            />
            <DetailRow
              label="DB Size"
              value={
                auditStats?.dbSizeEstimateMb != null
                  ? auditStats.dbSizeEstimateMb >= 1024
                    ? `${(auditStats.dbSizeEstimateMb / 1024).toFixed(2)} GB`
                    : auditStats.dbSizeEstimateMb >= 1
                      ? `${auditStats.dbSizeEstimateMb.toFixed(1)} MB`
                      : `${(auditStats.dbSizeEstimateMb * 1024).toFixed(0)} KB`
                  : '-'
              }
            />
          </>
        );
      case 'audit':
        return (
          <>
            <DetailRow label="Chain Status" value={auditStats?.chainValid ? 'Valid' : 'Invalid'} />
            <DetailRow label="Total Entries" value={auditStats?.totalEntries ?? 0} />
            <DetailRow
              label="Oldest Entry"
              value={
                auditStats?.oldestEntry ? new Date(auditStats.oldestEntry).toLocaleString() : '-'
              }
            />
            <DetailRow
              label="Last Verification"
              value={
                auditStats?.lastVerification
                  ? new Date(auditStats.lastVerification).toLocaleString()
                  : 'Never'
              }
            />
            <DetailRow
              label="DB Size"
              value={
                auditStats?.dbSizeEstimateMb != null
                  ? auditStats.dbSizeEstimateMb >= 1024
                    ? `${(auditStats.dbSizeEstimateMb / 1024).toFixed(2)} GB`
                    : auditStats.dbSizeEstimateMb >= 1
                      ? `${auditStats.dbSizeEstimateMb.toFixed(1)} MB`
                      : `${(auditStats.dbSizeEstimateMb * 1024).toFixed(0)} KB`
                  : '-'
              }
            />
          </>
        );
      case 'resources': {
        const r = metrics?.resources;
        return (
          <>
            <DetailRow label="Memory Used" value={`${(r?.memoryUsedMb ?? 0).toFixed(1)} MB`} />
            <DetailRow label="Memory Limit" value={`${(r?.memoryLimitMb ?? 0).toFixed(0)} MB`} />
            <DetailRow label="Memory %" value={`${(r?.memoryPercent ?? 0).toFixed(1)}%`} />
            <DetailRow label="CPU %" value={`${(r?.cpuPercent ?? 0).toFixed(1)}%`} />
            <DetailRow label="Disk Used" value={`${(r?.diskUsedMb ?? 0).toFixed(1)} MB`} />
            <DetailRow label="Tokens Today" value={r?.tokensUsedToday ?? 0} />
            <DetailRow label="Cached Tokens" value={r?.tokensCachedToday ?? 0} />
            <DetailRow label="API Calls" value={r?.apiCallsTotal ?? 0} />
            <DetailRow label="API Errors" value={r?.apiErrorsTotal ?? 0} />
            <DetailRow label="API Latency" value={formatDuration(r?.apiLatencyAvgMs ?? 0)} />
            <DetailRow label="Cost Today" value={`$${(r?.costUsdToday ?? 0).toFixed(4)}`} />
            <DetailRow label="Cost Month" value={`$${(r?.costUsdMonth ?? 0).toFixed(4)}`} />
          </>
        );
      }
      case 'security': {
        const s = metrics?.security;
        return (
          <>
            <DetailRow label="Auth Attempts" value={s?.authAttemptsTotal ?? 0} />
            <DetailRow label="Auth Success" value={s?.authSuccessTotal ?? 0} />
            <DetailRow label="Auth Failures" value={s?.authFailuresTotal ?? 0} />
            <DetailRow label="Active Sessions" value={s?.activeSessions ?? 0} />
            <DetailRow label="Blocked Requests" value={s?.blockedRequestsTotal ?? 0} />
            <DetailRow label="Injection Attempts" value={s?.injectionAttemptsTotal ?? 0} />
            <DetailRow label="Rate Limit Hits" value={s?.rateLimitHitsTotal ?? 0} />
            {s?.eventsBySeverity && Object.keys(s.eventsBySeverity).length > 0 && (
              <DetailRow
                label="Events by Severity"
                value={Object.entries(s.eventsBySeverity)
                  .map(([k, v]) => `${k}: ${v}`)
                  .join(', ')}
              />
            )}
          </>
        );
      }
      case 'mcp': {
        const servers = mcpServers ?? [];
        const enabled = servers.filter((s) => s.enabled).length;
        return (
          <>
            <DetailRow label="Enabled / Total" value={`${enabled} / ${servers.length}`} />
            {servers.map((s) => (
              <DetailRow
                key={s.id}
                label={s.name}
                value={
                  <span className="flex items-center gap-2">
                    <span
                      className={`inline-block w-2 h-2 rounded-full ${s.enabled ? 'bg-green-500' : 'bg-muted-foreground'}`}
                    />
                    {s.transport}
                    {s.description ? ` — ${s.description}` : ''}
                  </span>
                }
              />
            ))}
          </>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="card">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-4 text-left hover:bg-muted/30 transition-colors"
      >
        <div className="flex items-center gap-3">
          <span
            className={
              status === 'ok'
                ? 'text-green-500'
                : status === 'warning'
                  ? 'text-warning'
                  : 'text-destructive'
            }
          >
            {def.icon}
          </span>
          <span className="font-semibold text-sm">{def.label}</span>
          <span className={`badge ${badge.className} text-xs`}>{badge.label}</span>
        </div>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground transition-transform ${expanded ? '' : '-rotate-90'}`}
        />
      </button>
      {expanded && (
        <div className="border-t border-border p-4">
          <div className="grid grid-cols-[auto,1fr] gap-x-6 gap-y-2">{renderDetails()}</div>
        </div>
      )}
    </div>
  );
}

export function NodeDetailsTab() {
  const location = useLocation();
  const params = new URLSearchParams(location.search);
  const nodeParam = params.get('node');

  const [expandedNodes, setExpandedNodes] = useState<Set<string>>(() => {
    return nodeParam ? new Set([nodeParam]) : new Set<string>();
  });

  const toggleNode = useCallback((id: string) => {
    setExpandedNodes((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }, []);

  const { data: health } = useQuery({
    queryKey: ['health'],
    queryFn: fetchHealth,
    refetchInterval: 5000,
  });

  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 5000,
  });

  const { data: auditStats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
    refetchInterval: 15000,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 30000,
  });

  const mcpServers = mcpData?.servers;

  return (
    <div className="space-y-6">
      <div>
        <h3 className="font-semibold">System</h3>
        <p className="text-xs text-muted-foreground mt-1">Status for each system component</p>
      </div>
      <div className="space-y-3">
        {NODE_DEFS.map((def) => (
          <NodePanel
            key={def.id}
            def={def}
            health={health}
            metrics={metrics}
            auditStats={auditStats}
            mcpServers={mcpServers}
            expanded={expandedNodes.has(def.id)}
            onToggle={() => {
              toggleNode(def.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}
