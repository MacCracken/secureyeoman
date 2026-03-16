/**
 * MissionControlTab — the main overview dashboard with draggable cards.
 */

import { useState, useEffect, useCallback, useMemo, memo, lazy, Suspense } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from 'recharts';
import {
  Activity,
  Shield,
  DollarSign,
  Server,
  Database,
  Link,
  Clock,
  Bot,
  Heart,
  ArrowRight,
  Loader2,
  X,
  GitMerge,
  GripVertical,
} from 'lucide-react';
import {
  fetchActiveDelegations,
  fetchCostBreakdown,
  fetchTasks,
  fetchSecurityEvents,
  fetchAuditEntries,
  fetchWorkflows,
} from '../../api/client';
import type { CostBreakdownResponse, WorkflowDefinition } from '../../api/client';
import { ErrorBoundary } from '../common/ErrorBoundary';
import { AgentWorldWidget } from '../AgentWorldWidget';
import { EntityWidget } from '../EntityWidget';
import type {
  MetricsSnapshot,
  HealthStatus,
  McpServerConfig,
  Personality,
  HeartbeatStatus,
  Task,
  SecurityEvent,
  AuditEntry,
} from '../../types';

import {
  DndContext,
  closestCenter,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CARD_REGISTRY, type MissionCardId } from '../MissionControl/registry';
import { FinancialChartsCard } from '../finance/FinancialChartsCard';
import { BullShiftStreamWidget } from '../finance/BullShiftStreamWidget';
import { defaultLayout, type CardLayout } from '../MissionControl/layout';

import {
  C,
  TOOLTIP_STYLE,
  SEV_DOT,
  LEVEL_DOT,
  formatUptime,
  StatCard,
  ServiceStatusRow,
  EmptyChart,
} from './shared';
import type { HistoryPoint, SectionCommonProps } from './shared';
import { useCardLayout } from './hooks';

// Lazy-load ReactFlow graph — keeps it out of the initial MetricsPage chunk
const MetricsGraph = lazy(() =>
  import('../MetricsGraph').then((m) => ({ default: m.MetricsGraph }))
);

// ── Mission Control section components ────────────────────────────────

const KpiBarSection = memo(function KpiBarSection({
  metrics,
  activePersonalities,
  activeDelegations,
  defaultPersonality,
  heartbeatStatus,
  heartbeatRunning,
  navigate,
  onViewCosts,
}: SectionCommonProps) {
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-3">
      <StatCard
        title="Active Agents"
        value={activePersonalities.length + (activeDelegations?.delegations?.length ?? 0)}
        icon={<Bot className="w-4 h-4 sm:w-5 sm:h-5" />}
        subtitle={(() => {
          const soulPart = `${activePersonalities.length} soul${activePersonalities.length !== 1 ? 's' : ''}`;
          const subPart = activeDelegations?.delegations?.length
            ? ` · ${activeDelegations.delegations.length} sub-agent${activeDelegations.delegations.length !== 1 ? 's' : ''}`
            : '';
          return defaultPersonality
            ? `${defaultPersonality.name}${subPart}`
            : `${soulPart}${subPart}`;
        })()}
        onClick={() => void navigate('/personality')}
      />
      <StatCard
        title="Heartbeat"
        value={heartbeatStatus?.tasks?.length ?? 0}
        icon={<Heart className="w-4 h-4 sm:w-5 sm:h-5" />}
        subtitle={`${heartbeatStatus?.tasks?.filter((t) => t.enabled).length ?? 0} enabled`}
        trend={heartbeatRunning ? 'Running' : 'Stopped'}
        trendUp={heartbeatRunning}
        onClick={() => void navigate('/security?tab=tasks&heartbeat=1')}
      />
      <StatCard
        title="Active Tasks"
        value={metrics?.tasks?.inProgress ?? 0}
        icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />}
        subtitle={`${metrics?.tasks?.queueDepth ?? 0} queued`}
        onClick={() => void navigate('/tasks')}
      />
      <StatCard
        title="Tasks Today"
        value={metrics?.tasks?.tasksToday ?? 0}
        icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
        trend={
          metrics?.tasks?.successRate
            ? `${(metrics.tasks.successRate * 100).toFixed(1)}% success`
            : undefined
        }
        trendUp={metrics?.tasks?.successRate ? metrics.tasks.successRate > 0.9 : undefined}
      />
      <StatCard
        title="Cost Today"
        value={`$${(metrics?.resources?.costUsdToday ?? 0).toFixed(4)}`}
        icon={<DollarSign className="w-4 h-4 sm:w-5 sm:h-5" />}
        subtitle={`$${(metrics?.resources?.costUsdMonth ?? 0).toFixed(2)} this month`}
        onClick={onViewCosts}
      />
      <StatCard
        title="Audit Entries"
        value={metrics?.security?.auditEntriesTotal ?? 0}
        icon={<Shield className="w-4 h-4 sm:w-5 sm:h-5" />}
        trend={metrics?.security?.auditChainValid === false ? 'Chain Invalid' : 'Chain Valid'}
        trendUp={metrics?.security?.auditChainValid !== false}
        onClick={() => void navigate('/security?tab=audit')}
      />
    </div>
  );
});

const ResourceMonitoringSection = memo(function ResourceMonitoringSection({
  metrics,
  history,
  onViewCosts,
}: SectionCommonProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title text-base">Resource Monitoring</h2>
        <p className="card-description text-xs">CPU, memory, tokens over time</p>
      </div>
      <div className="card-content space-y-3">
        <div className="h-[130px]">
          {history.length > 1 ? (
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={history}>
                <defs>
                  <linearGradient id="mcCpuGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.primary} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="mcMemGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={C.success} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={C.success} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                <XAxis dataKey="time" tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <YAxis tick={{ fontSize: 9 }} tickLine={false} axisLine={false} />
                <Tooltip contentStyle={TOOLTIP_STYLE} />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Area
                  type="monotone"
                  dataKey="cpu"
                  name="CPU %"
                  stroke={C.primary}
                  fill="url(#mcCpuGrad)"
                  strokeWidth={2}
                  dot={false}
                />
                <Area
                  type="monotone"
                  dataKey="memory"
                  name="Memory MB"
                  stroke={C.success}
                  fill="url(#mcMemGrad)"
                  strokeWidth={2}
                  dot={false}
                />
              </AreaChart>
            </ResponsiveContainer>
          ) : (
            <EmptyChart message="Collecting data…" />
          )}
        </div>
        <div className="grid grid-cols-4 gap-2">
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">CPU</p>
            <p className="text-sm font-bold">{(metrics?.resources?.cpuPercent ?? 0).toFixed(1)}%</p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Memory</p>
            <p className="text-sm font-bold">
              {(metrics?.resources?.memoryUsedMb ?? 0).toFixed(0)} MB
            </p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Tokens</p>
            <p className="text-sm font-bold">
              {((metrics?.resources?.tokensUsedToday ?? 0) / 1000).toFixed(1)}k
            </p>
          </div>
          <div
            className="p-2 rounded-md bg-muted/30 text-center cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={onViewCosts}
            title="View cost analytics"
          >
            <p className="text-xs text-muted-foreground">Cost</p>
            <p className="text-sm font-bold text-success">
              ${(metrics?.resources?.costUsdToday ?? 0).toFixed(3)}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
});

const ActiveTasksSection = memo(function ActiveTasksSection({
  metrics,
  navigate,
}: SectionCommonProps) {
  const { data: tasksData } = useQuery({
    queryKey: ['tasks-running'],
    queryFn: () => fetchTasks({ status: 'running', limit: 5 }),
    refetchInterval: 5_000,
  });
  const activeTasks: Task[] = tasksData?.tasks ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-sm">Active Tasks</h2>
            <p className="card-description text-xs">Currently running</p>
          </div>
          <button
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
            onClick={() => void navigate('/automation')}
          >
            All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="card-content">
        {activeTasks.length === 0 ? (
          <p className="text-center py-6 text-sm text-muted-foreground">
            {(metrics?.tasks?.inProgress ?? 0) === 0 ? 'No active tasks' : 'Loading…'}
          </p>
        ) : (
          <div className="space-y-2">
            {activeTasks.map((task) => (
              <div key={task.id} className="flex items-start gap-2 p-2 rounded-md bg-muted/30">
                <Loader2 className="w-3.5 h-3.5 text-primary animate-spin mt-0.5 flex-shrink-0" />
                <div className="min-w-0">
                  <p className="text-xs font-medium truncate">{task.name}</p>
                  <p className="text-xs text-muted-foreground truncate">{task.type}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const WorkflowRunsSection = memo(function WorkflowRunsSection({ navigate }: SectionCommonProps) {
  const { data: workflowsData } = useQuery({
    queryKey: ['workflows-mc'],
    queryFn: () => fetchWorkflows({ limit: 6 }),
    refetchInterval: 30_000,
  });
  const workflows: WorkflowDefinition[] = workflowsData?.definitions ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-sm">Workflows</h2>
            <p className="card-description text-xs">Automation pipelines</p>
          </div>
          <button
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
            onClick={() => void navigate('/automation?tab=workflows')}
          >
            All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="card-content">
        {workflows.length === 0 ? (
          <p className="text-center py-6 text-sm text-muted-foreground">No workflows</p>
        ) : (
          <div className="space-y-2">
            {workflows.slice(0, 5).map((wf) => (
              <div
                key={wf.id}
                className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => void navigate('/automation?tab=workflows')}
              >
                <GitMerge className="w-3.5 h-3.5 text-primary flex-shrink-0" />
                <span className="text-xs font-medium truncate flex-1">{wf.name}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${wf.isEnabled ? 'bg-success' : 'bg-muted-foreground'}`}
                />
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const AgentHealthSection = memo(function AgentHealthSection({
  activePersonalities,
  heartbeatRunning,
  navigate,
}: SectionCommonProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-sm">Agent Health</h2>
            <p className="card-description text-xs">Heartbeat status</p>
          </div>
          <div
            className={`flex items-center gap-1 text-xs ${heartbeatRunning ? 'text-success' : 'text-muted-foreground'}`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${heartbeatRunning ? 'bg-success animate-pulse' : 'bg-muted-foreground'}`}
            />
            {heartbeatRunning ? 'Running' : 'Stopped'}
          </div>
        </div>
      </div>
      <div className="card-content">
        {activePersonalities.length === 0 ? (
          <p className="text-center py-6 text-sm text-muted-foreground">No active agents</p>
        ) : (
          <div className="space-y-1.5">
            {activePersonalities.slice(0, 5).map((p) => (
              <div
                key={p.id}
                className="flex items-center gap-2 p-1.5 rounded-md bg-muted/30 cursor-pointer hover:bg-muted/50 transition-colors"
                onClick={() => void navigate('/personality')}
              >
                {p.avatarUrl ? (
                  <img
                    src={
                      p.avatarUrl.startsWith('/avatars/') ? p.avatarUrl : `/api/v1${p.avatarUrl}`
                    }
                    alt={p.name}
                    className="w-5 h-5 rounded-full object-cover flex-shrink-0"
                  />
                ) : (
                  <div className="w-5 h-5 rounded-full bg-primary/20 flex items-center justify-center flex-shrink-0">
                    <Bot className="w-3 h-3 text-primary" />
                  </div>
                )}
                <span className="text-xs font-medium truncate flex-1">{p.name}</span>
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${heartbeatRunning ? 'bg-success' : 'bg-muted-foreground'}`}
                />
              </div>
            ))}
            {activePersonalities.length > 5 && (
              <p className="text-xs text-muted-foreground text-center pt-1">
                +{activePersonalities.length - 5} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const SystemHealthSection = memo(function SystemHealthSection({
  health,
  enabledMcp,
  mcpServers,
  navigate,
}: SectionCommonProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title text-base">System Health</h2>
      </div>
      <div className="card-content space-y-0.5">
        <ServiceStatusRow
          label="Core"
          ok={health?.status === 'ok'}
          detail={health?.status ?? 'unknown'}
          icon={<Server className="w-3.5 h-3.5" />}
        />
        <ServiceStatusRow
          label="Database"
          ok={health?.checks?.database ?? false}
          detail={health?.checks?.database ? 'Connected' : 'Down'}
          icon={<Database className="w-3.5 h-3.5" />}
        />
        <ServiceStatusRow
          label="Audit Chain"
          ok={health?.checks?.auditChain ?? false}
          detail={health?.checks?.auditChain ? 'Valid' : 'Invalid'}
          icon={<Shield className="w-3.5 h-3.5" />}
        />
        <ServiceStatusRow
          label="MCP"
          ok={enabledMcp > 0}
          detail={`${enabledMcp}/${mcpServers.length} servers`}
          icon={<Link className="w-3.5 h-3.5" />}
          onClick={() => void navigate('/mcp')}
        />
        <ServiceStatusRow
          label="Uptime"
          ok={true}
          detail={health?.uptime ? formatUptime(health.uptime) : '—'}
          icon={<Clock className="w-3.5 h-3.5" />}
        />
      </div>
    </div>
  );
});

const IntegrationGridSection = memo(function IntegrationGridSection({
  mcpServers,
  enabledMcp,
  navigate,
}: SectionCommonProps) {
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-base">Integrations</h2>
            <p className="card-description text-xs">
              {enabledMcp}/{mcpServers.length} active
            </p>
          </div>
          <button
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
            onClick={() => void navigate('/mcp')}
          >
            All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="card-content">
        {mcpServers.length === 0 ? (
          <p className="text-center py-4 text-sm text-muted-foreground">
            No MCP servers configured
          </p>
        ) : (
          <div className="space-y-2">
            {mcpServers.slice(0, 5).map((srv) => (
              <div key={srv.id} className="flex items-center gap-2 text-xs">
                <span
                  className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${srv.enabled ? 'bg-success' : 'bg-muted-foreground'}`}
                />
                <span className="truncate flex-1 font-medium">{srv.name}</span>
                <span className="text-muted-foreground flex-shrink-0">
                  {srv.enabled ? 'Active' : 'Off'}
                </span>
              </div>
            ))}
            {mcpServers.length > 5 && (
              <p className="text-xs text-muted-foreground text-center">
                +{mcpServers.length - 5} more
              </p>
            )}
          </div>
        )}
      </div>
    </div>
  );
});

const SecurityEventsSection = memo(function SecurityEventsSection({
  navigate,
}: SectionCommonProps) {
  const { data: eventsData } = useQuery({
    queryKey: ['security-events-feed'],
    queryFn: () => fetchSecurityEvents({ limit: 6 }),
    refetchInterval: 10_000,
  });
  const securityEvents: SecurityEvent[] = eventsData?.events ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-base">Security Events</h2>
            <p className="card-description text-xs">Recent activity</p>
          </div>
          <button
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
            onClick={() => void navigate('/security?tab=events')}
          >
            All <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="card-content">
        {securityEvents.length === 0 ? (
          <p className="text-center py-4 text-sm text-muted-foreground">No recent events</p>
        ) : (
          <div className="space-y-2">
            {securityEvents.slice(0, 5).map((evt) => (
              <div key={evt.id} className="flex items-start gap-2 text-xs">
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${SEV_DOT[evt.severity] ?? 'bg-muted'}`}
                />
                <div className="min-w-0">
                  <p className="font-medium truncate capitalize">{evt.type.replace(/_/g, ' ')}</p>
                  <p className="text-muted-foreground truncate">{evt.message}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const AuditStreamSection = memo(function AuditStreamSection({ navigate }: SectionCommonProps) {
  const { data: auditData } = useQuery({
    queryKey: ['audit-feed'],
    queryFn: () => fetchAuditEntries({ limit: 6 }),
    refetchInterval: 15_000,
  });
  const auditEntries: AuditEntry[] = auditData?.entries ?? [];

  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-sm">Audit Stream</h2>
            <p className="card-description text-xs">Tamper-evident log</p>
          </div>
          <button
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
            onClick={() => void navigate('/security?tab=audit')}
          >
            Full log <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="card-content">
        {auditEntries.length === 0 ? (
          <p className="text-center py-4 text-sm text-muted-foreground">No audit entries</p>
        ) : (
          <div className="space-y-1.5">
            {auditEntries.map((entry) => (
              <div
                key={entry.id}
                className="flex items-start gap-2 text-xs border-b border-border/30 pb-1.5 last:border-0"
              >
                <span
                  className={`mt-1 w-1.5 h-1.5 rounded-full flex-shrink-0 ${LEVEL_DOT[entry.level] ?? 'bg-primary'}`}
                />
                <div className="min-w-0 flex-1">
                  <p className="font-medium truncate capitalize">
                    {entry.event.replace(/_/g, ' ')}
                  </p>
                  <p className="text-muted-foreground truncate">{entry.message}</p>
                </div>
                <span className="text-muted-foreground flex-shrink-0 font-mono text-[10px]">
                  {new Date(entry.timestamp).toLocaleTimeString([], {
                    hour: '2-digit',
                    minute: '2-digit',
                  })}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
});

const AgentWorldSection = memo(function AgentWorldSection({
  worldViewMode,
  setAndPersistWorldView,
  worldZoom,
  adjustZoom,
  setIsFullscreen,
  navigate,
}: SectionCommonProps) {
  return (
    <div className="card">
      <div
        className="card-header cursor-default select-none"
        title="Double-click to expand"
        onDoubleClick={() => {
          setIsFullscreen(true);
        }}
      >
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Bot className="w-4 h-4 text-muted-foreground" />
            <div>
              <h2 className="card-title text-sm">Agent World</h2>
              <p className="card-description text-xs">Live personality activity</p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adjustZoom(-0.25);
                }}
                disabled={worldZoom <= 0.5}
                className="px-1.5 py-0.5 rounded hover:text-foreground disabled:opacity-30"
                aria-label="Zoom out"
              >
                −
              </button>
              <span className="tabular-nums w-9 text-center">{Math.round(worldZoom * 100)}%</span>
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  adjustZoom(0.25);
                }}
                disabled={worldZoom >= 2.0}
                className="px-1.5 py-0.5 rounded hover:text-foreground disabled:opacity-30"
                aria-label="Zoom in"
              >
                +
              </button>
            </div>
            <span className="text-border text-xs">|</span>
            <div className="flex gap-0.5">
              <button
                onClick={() => {
                  setAndPersistWorldView('grid');
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${worldViewMode === 'grid' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Card grid view"
                aria-pressed={worldViewMode === 'grid'}
              >
                ≡ Grid
              </button>
              <button
                onClick={() => {
                  setAndPersistWorldView('map');
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${worldViewMode === 'map' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="World map view"
                aria-pressed={worldViewMode === 'map'}
              >
                ⊞ Map
              </button>
              <button
                onClick={() => {
                  setAndPersistWorldView('large');
                }}
                className={`px-2 py-0.5 text-xs rounded transition-colors ${worldViewMode === 'large' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                title="Large zone view"
                aria-pressed={worldViewMode === 'large'}
              >
                ⊟ Large
              </button>
            </div>
          </div>
        </div>
      </div>
      <div className="card-content">
        <AgentWorldWidget
          maxAgents={12}
          viewMode={worldViewMode}
          zoom={worldZoom}
          onAgentClick={(id) => void navigate(`/soul/personalities?focus=${id}`)}
        />
      </div>
    </div>
  );
});

const SystemTopologySection = memo(function SystemTopologySection({
  metrics,
  health,
  mcpServers,
  navigate,
}: SectionCommonProps) {
  return (
    <div className="card">
      <div className="card-header">
        <h2 className="card-title text-base">System Topology</h2>
        <p className="card-description text-xs">Infrastructure overview</p>
      </div>
      <div className="card-content">
        <ErrorBoundary fallbackTitle="Graph failed to render">
          <Suspense
            fallback={
              <div className="h-40 flex items-center justify-center text-sm text-muted-foreground">
                Loading graph…
              </div>
            }
          >
            <MetricsGraph
              metrics={metrics}
              health={health}
              mcpServers={mcpServers}
              onNodeClick={(nodeId) => {
                const routes: Record<string, string> = {
                  security: '/security?tab=overview',
                  audit: '/security?tab=audit',
                  tasks: '/security?tab=tasks',
                  mcp: '/mcp',
                };
                navigate(routes[nodeId] ?? `/security?tab=nodes&node=${nodeId}`);
              }}
            />
          </Suspense>
        </ErrorBoundary>
      </div>
    </div>
  );
});

const CostBreakdownSection = memo(function CostBreakdownSection({
  metrics,
  onViewCosts,
}: SectionCommonProps) {
  const { data: costBreakdown } = useQuery<CostBreakdownResponse>({
    queryKey: ['costs-breakdown-mc'],
    queryFn: fetchCostBreakdown,
    refetchInterval: 60_000,
  });
  const costByProvider = costBreakdown?.byProvider ?? {};
  return (
    <div className="card">
      <div className="card-header">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="card-title text-sm">Cost Breakdown</h2>
            <p className="card-description text-xs">Tokens & provider costs today</p>
          </div>
          <button
            className="text-xs text-primary hover:text-primary/80 flex items-center gap-0.5"
            onClick={onViewCosts}
          >
            Detail <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>
      <div className="card-content space-y-3">
        <div className="grid grid-cols-3 gap-2">
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Tokens In</p>
            <p className="text-sm font-bold">
              {((metrics?.resources?.inputTokensToday ?? 0) / 1000).toFixed(1)}k
            </p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Tokens Out</p>
            <p className="text-sm font-bold">
              {((metrics?.resources?.outputTokensToday ?? 0) / 1000).toFixed(1)}k
            </p>
          </div>
          <div className="p-2 rounded-md bg-muted/30 text-center">
            <p className="text-xs text-muted-foreground">Cached</p>
            <p className="text-sm font-bold">
              {((metrics?.resources?.tokensCachedToday ?? 0) / 1000).toFixed(1)}k
            </p>
          </div>
        </div>
        {Object.keys(costByProvider).length === 0 ? (
          <p className="text-center py-3 text-sm text-muted-foreground">No provider data yet</p>
        ) : (
          <div className="space-y-1.5">
            {Object.entries(costByProvider)
              .sort(([, a], [, b]) => b.costUsd - a.costUsd)
              .slice(0, 4)
              .map(([provider, data]) => (
                <div key={provider} className="flex items-center gap-2 text-xs">
                  <span className="flex-1 font-medium truncate capitalize">{provider}</span>
                  <span className="text-muted-foreground font-mono">
                    {(data.tokensUsed / 1000).toFixed(1)}k tok
                  </span>
                  <span className="text-success font-mono font-semibold w-16 text-right">
                    ${data.costUsd.toFixed(4)}
                  </span>
                </div>
              ))}
          </div>
        )}
      </div>
    </div>
  );
});

const EntitySection = memo(function EntitySection() {
  return (
    <div className="rounded-lg border border-cyan-900/50 bg-gray-900/80 p-0 overflow-hidden">
      <EntityWidget state="active" height={380} showLabel label="THE ENTITY" />
    </div>
  );
});

const FinancialChartsSection = memo(function FinancialChartsSection(_props: SectionCommonProps) {
  return <FinancialChartsCard />;
});

const BullShiftStreamSection = memo(function BullShiftStreamSection(_props: SectionCommonProps) {
  return <BullShiftStreamWidget />;
});

// ── SortableCardWrapper ───────────────────────────────────────────────

interface SortableCardWrapperProps {
  cardLayout: CardLayout;
  def: (typeof CARD_REGISTRY)[number];
  editMode: boolean;
  onRemove: () => void;
  onResize: (colSpan: 3 | 4 | 6 | 12) => void;
  children: React.ReactNode;
}

function SortableCardWrapper({
  cardLayout,
  def,
  editMode,
  onRemove,
  onResize,
  children,
}: SortableCardWrapperProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: cardLayout.id,
    disabled: !editMode || !!def.pinned,
  });
  const colClass: Record<number, string> = {
    3: 'col-span-12 lg:col-span-3',
    4: 'col-span-12 md:col-span-4',
    6: 'col-span-12 lg:col-span-6',
    12: 'col-span-12',
  };
  return (
    <div
      ref={setNodeRef}
      style={{
        transform: CSS.Transform.toString(transform),
        transition,
        opacity: isDragging ? 0.5 : 1,
      }}
      className={`${colClass[cardLayout.colSpan]} relative group`}
    >
      {editMode && (
        <div className="absolute inset-0 rounded-lg ring-2 ring-primary/30 pointer-events-none z-10" />
      )}
      {editMode && !def.pinned && (
        <button
          {...attributes}
          {...listeners}
          className="absolute top-2 left-2 z-20 p-1 rounded bg-background/80 cursor-grab active:cursor-grabbing opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <GripVertical className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      {editMode && !def.pinned && (
        <button
          onClick={onRemove}
          className="absolute top-2 right-2 z-20 p-1 rounded bg-background/80 hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
        >
          <X className="w-3.5 h-3.5 text-muted-foreground" />
        </button>
      )}
      {editMode && (
        <div className="absolute bottom-2 left-1/2 -translate-x-1/2 z-20 flex gap-0.5 bg-background/90 border border-border rounded-full px-2 py-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
          {(['S', 'M', 'L'] as const).map((size) => {
            const target =
              size === 'S' ? def.minColSpan : size === 'M' ? def.defaultColSpan : (12 as const);
            return (
              <button
                key={size}
                onClick={() => {
                  onResize(target);
                }}
                className={`text-xs px-1.5 py-0.5 rounded-full transition-colors ${cardLayout.colSpan === target ? 'bg-primary text-primary-foreground' : 'hover:bg-muted'}`}
              >
                {size}
              </button>
            );
          })}
        </div>
      )}
      {children}
    </div>
  );
}

// ── MissionCardContent ────────────────────────────────────────────────

const MissionCardContent = memo(function MissionCardContent({
  id,
  sectionProps,
}: {
  id: MissionCardId;
  sectionProps: SectionCommonProps;
}) {
  switch (id) {
    case 'kpi-bar':
      return <KpiBarSection {...sectionProps} />;
    case 'resource-monitoring':
      return <ResourceMonitoringSection {...sectionProps} />;
    case 'active-tasks':
      return <ActiveTasksSection {...sectionProps} />;
    case 'workflow-runs':
      return <WorkflowRunsSection {...sectionProps} />;
    case 'agent-health':
      return <AgentHealthSection {...sectionProps} />;
    case 'system-health':
      return <SystemHealthSection {...sectionProps} />;
    case 'integration-grid':
      return <IntegrationGridSection {...sectionProps} />;
    case 'security-events':
      return <SecurityEventsSection {...sectionProps} />;
    case 'audit-stream':
      return <AuditStreamSection {...sectionProps} />;
    case 'agent-world':
      return <AgentWorldSection {...sectionProps} />;
    case 'system-topology':
      return <SystemTopologySection {...sectionProps} />;
    case 'cost-breakdown':
      return <CostBreakdownSection {...sectionProps} />;
    case 'the-entity':
      return <EntitySection />;
    case 'financial-charts':
      return <FinancialChartsSection {...sectionProps} />;
    case 'bullshift-stream':
      return <BullShiftStreamSection {...sectionProps} />;
  }
});

// ── MissionControlTab ────────────────────────────────────────────────

export interface MissionControlTabProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
  history: HistoryPoint[];
  heartbeatStatus: HeartbeatStatus | undefined;
  mcpServers: McpServerConfig[];
  enabledMcp: number;
  enabledHb: number;
  totalHbTasks: number;
  activeDelegations: { delegations?: { depth: number }[] } | undefined;
  personalities: Personality[];
  activePersonalities: Personality[];
  defaultPersonality: Personality | undefined;
  navigate: ReturnType<typeof import('react-router-dom').useNavigate>;
  onViewCosts: () => void;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  catalogueOpen: boolean;
  setCatalogueOpen: React.Dispatch<React.SetStateAction<boolean>>;
  bullshiftEnabled: boolean;
}

export function MissionControlTab({
  metrics,
  health,
  history,
  heartbeatStatus,
  mcpServers,
  enabledMcp,
  enabledHb,
  totalHbTasks,
  activeDelegations,
  personalities,
  activePersonalities,
  defaultPersonality,
  navigate,
  onViewCosts,
  editMode,
  setEditMode,
  catalogueOpen,
  setCatalogueOpen,
  bullshiftEnabled,
}: MissionControlTabProps) {
  const heartbeatRunning = heartbeatStatus?.running ?? false;

  // Agent World view mode (lifted from widget so toggle lives in card-header)
  const [worldViewMode, setWorldViewMode] = useState<'grid' | 'map' | 'large'>(
    () => (localStorage.getItem('world:viewMode') ?? 'large') as 'grid' | 'map' | 'large'
  );
  const setAndPersistWorldView = useCallback((m: 'grid' | 'map' | 'large') => {
    setWorldViewMode(m);
    localStorage.setItem('world:viewMode', m);
  }, []);

  // Agent World zoom (0.5–2.0, step 0.25, persisted)
  const [worldZoom, setWorldZoom] = useState<number>(() =>
    parseFloat(localStorage.getItem('world:zoom') ?? '1')
  );
  const adjustZoom = useCallback((delta: number) => {
    setWorldZoom((prev) => {
      const next = Math.max(0.5, Math.min(2.0, Math.round((prev + delta) * 4) / 4));
      localStorage.setItem('world:zoom', String(next));
      return next;
    });
  }, []);

  // Agent World fullscreen (transient — not persisted)
  const [isFullscreen, setIsFullscreen] = useState(false);
  useEffect(() => {
    if (!isFullscreen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsFullscreen(false);
    };
    window.addEventListener('keydown', handler);
    return () => {
      window.removeEventListener('keydown', handler);
    };
  }, [isFullscreen]);

  // ── Layout state ──────────────────────────────────────────────────
  const { cardLayouts, updateLayouts, sensors, handleDragEnd } = useCardLayout();

  // Bundle all section data into a single memoized props object.
  const sectionProps: SectionCommonProps = useMemo(
    () => ({
      metrics,
      health,
      history,
      heartbeatStatus,
      mcpServers,
      enabledMcp,
      enabledHb,
      totalHbTasks,
      activeDelegations,
      activePersonalities,
      defaultPersonality,
      navigate,
      onViewCosts,
      heartbeatRunning,
      worldViewMode,
      setAndPersistWorldView,
      worldZoom,
      adjustZoom,
      setIsFullscreen,
    }),
    [
      metrics,
      health,
      history,
      heartbeatStatus,
      mcpServers,
      enabledMcp,
      enabledHb,
      totalHbTasks,
      activeDelegations,
      activePersonalities,
      defaultPersonality,
      navigate,
      onViewCosts,
      heartbeatRunning,
      worldViewMode,
      setAndPersistWorldView,
      worldZoom,
      adjustZoom,
      setIsFullscreen,
    ]
  );

  // Show The Entity card toggle only when the personality is installed (any state)
  const hasEntityPersonality = personalities.some(
    (p: Personality) => p.name.toLowerCase().replace(/\s+/g, '') === 'theentity'
  );
  // Auto-reveal when personality is active (not just installed)
  const entityPersonalityActive = activePersonalities.some(
    (p: Personality) => p.name.toLowerCase().replace(/\s+/g, '') === 'theentity'
  );

  const sorted = [...cardLayouts]
    .map((c) => {
      // Auto-reveal The Entity when personality is active
      if (c.id === 'the-entity' && entityPersonalityActive && !c.visible)
        return { ...c, visible: true };
      // Hide The Entity when personality is not installed
      if (c.id === 'the-entity' && !hasEntityPersonality && c.visible)
        return { ...c, visible: false };
      // Hide BullShift when tools are disabled
      if (c.id === 'bullshift-stream' && !bullshiftEnabled && c.visible)
        return { ...c, visible: false };
      return c;
    })
    .sort((a, b) => a.order - b.order);

  return (
    <>
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext
          items={sorted.map((c) => c.id)}
          strategy={rectSortingStrategy}
          disabled={!editMode}
        >
          <div className="grid grid-cols-12 gap-4 sm:gap-5">
            {sorted
              .filter((c) => c.visible)
              .map((cl) => {
                const def = CARD_REGISTRY.find((d) => d.id === cl.id)!;
                return (
                  <SortableCardWrapper
                    key={cl.id}
                    cardLayout={cl}
                    def={def}
                    editMode={editMode}
                    onRemove={() => {
                      updateLayouts(
                        cardLayouts.map((c) => (c.id === cl.id ? { ...c, visible: false } : c))
                      );
                    }}
                    onResize={(colSpan) => {
                      updateLayouts(
                        cardLayouts.map((c) => (c.id === cl.id ? { ...c, colSpan } : c))
                      );
                    }}
                  >
                    <MissionCardContent id={cl.id} sectionProps={sectionProps} />
                  </SortableCardWrapper>
                );
              })}
          </div>
        </SortableContext>
      </DndContext>

      {/* ── Agent World fullscreen overlay ────────────────────────────── */}
      {isFullscreen && (
        <div
          className="fixed inset-0 z-50 bg-background flex flex-col"
          role="dialog"
          aria-modal="true"
          aria-label="Agent World — fullscreen"
        >
          <div className="flex items-center justify-between px-4 py-2 border-b flex-shrink-0">
            <div className="flex items-center gap-2">
              <Bot className="w-4 h-4 text-muted-foreground" />
              <span className="text-sm font-medium">Agent World</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="flex items-center gap-1 text-xs text-muted-foreground">
                <button
                  onClick={() => {
                    adjustZoom(-0.25);
                  }}
                  disabled={worldZoom <= 0.5}
                  className="px-1.5 py-0.5 rounded hover:text-foreground disabled:opacity-30"
                  aria-label="Zoom out"
                >
                  −
                </button>
                <span className="tabular-nums w-9 text-center">{Math.round(worldZoom * 100)}%</span>
                <button
                  onClick={() => {
                    adjustZoom(0.25);
                  }}
                  disabled={worldZoom >= 2.0}
                  className="px-1.5 py-0.5 rounded hover:text-foreground disabled:opacity-30"
                  aria-label="Zoom in"
                >
                  +
                </button>
              </div>
              <span className="text-border text-sm">|</span>
              <div className="flex gap-0.5">
                <button
                  onClick={() => {
                    setAndPersistWorldView('grid');
                  }}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${worldViewMode === 'grid' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Card grid view"
                  aria-pressed={worldViewMode === 'grid'}
                >
                  ≡ Grid
                </button>
                <button
                  onClick={() => {
                    setAndPersistWorldView('map');
                  }}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${worldViewMode === 'map' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  title="World map view"
                  aria-pressed={worldViewMode === 'map'}
                >
                  ⊞ Map
                </button>
                <button
                  onClick={() => {
                    setAndPersistWorldView('large');
                  }}
                  className={`px-2 py-0.5 text-xs rounded transition-colors ${worldViewMode === 'large' ? 'bg-primary/15 text-primary' : 'text-muted-foreground hover:text-foreground'}`}
                  title="Large zone view"
                  aria-pressed={worldViewMode === 'large'}
                >
                  ⊟ Large
                </button>
              </div>
              <span className="text-border text-sm">|</span>
              <button
                onClick={() => {
                  setIsFullscreen(false);
                }}
                aria-label="Exit fullscreen"
                className="p-1 rounded hover:bg-muted transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
          </div>
          <div className="flex-1 overflow-auto p-4">
            <AgentWorldWidget
              viewMode={worldViewMode}
              zoom={worldZoom}
              onAgentClick={(id) => {
                setIsFullscreen(false);
                navigate(`/soul/personalities?focus=${id}`);
              }}
              maxAgents={999}
            />
          </div>
        </div>
      )}

      {/* ── Card catalogue panel ──────────────────────────────────────── */}
      {catalogueOpen && (
        <div className="fixed inset-y-0 right-0 w-72 bg-background border-l border-border shadow-xl z-50 flex flex-col">
          <div className="p-4 border-b border-border flex items-center justify-between">
            <h3 className="font-semibold text-sm">Customize Dashboard</h3>
            <button
              onClick={() => {
                setCatalogueOpen(false);
                setEditMode(false);
              }}
              className="p-1 rounded hover:bg-muted"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-0.5">
            {CARD_REGISTRY.filter(
              (def) =>
                (def.id !== 'the-entity' || hasEntityPersonality) &&
                (def.id !== 'bullshift-stream' || bullshiftEnabled)
            ).map((def) => {
              const cl = cardLayouts.find((c) => c.id === def.id);
              const isVisible = cl?.visible ?? def.defaultVisible;
              return (
                <div
                  key={def.id}
                  className="flex items-center justify-between py-2.5 border-b border-border/50 last:border-0"
                >
                  <div className="flex-1 min-w-0 mr-3">
                    <p className="text-sm font-medium">{def.label}</p>
                    <p className="text-xs text-muted-foreground truncate">{def.description}</p>
                  </div>
                  <button
                    role="switch"
                    aria-checked={isVisible}
                    disabled={!!def.pinned}
                    onClick={() => {
                      updateLayouts(
                        cardLayouts.map((c) =>
                          c.id === def.id ? { ...c, visible: !c.visible } : c
                        )
                      );
                    }}
                    className={`relative inline-flex h-5 w-9 flex-shrink-0 rounded-full transition-colors focus:outline-none ${
                      isVisible ? 'bg-primary' : 'bg-muted'
                    } ${def.pinned ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer'}`}
                  >
                    <span
                      className={`inline-block h-3 w-3 mt-1 ml-1 rounded-full bg-white transition-transform ${isVisible ? 'translate-x-4' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
              );
            })}
          </div>
          <div className="p-4 border-t border-border space-y-2">
            <button
              onClick={() => {
                updateLayouts(defaultLayout().cards);
              }}
              className="w-full text-xs text-muted-foreground hover:text-foreground py-1"
            >
              Reset to defaults
            </button>
            <button
              onClick={() => {
                setCatalogueOpen(false);
                setEditMode(false);
              }}
              className="w-full px-4 py-2 rounded-md bg-primary text-primary-foreground text-sm font-medium"
            >
              Done
            </button>
          </div>
        </div>
      )}
    </>
  );
}
