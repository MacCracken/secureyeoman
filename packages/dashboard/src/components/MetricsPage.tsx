/**
 * MetricsPage
 *
 * Unified metrics dashboard with three views:
 *   - Overview: key KPIs, system health, sparklines, and system topology graph
 *   - Costs: cost analytics, provider breakdown, and usage history
 *   - Full Metrics: deep-dive charts covering tasks, resources, and security
 */

import { useState, useEffect, useRef, lazy, Suspense, useCallback, useMemo, memo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate } from 'react-router-dom';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
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
  Cpu,
  HardDrive,
  Zap,
  DollarSign,
  Server,
  Database,
  Link,
  Clock,
  CheckCircle,
  XCircle,
  Bot,
  Heart,
  TrendingUp,
  AlertTriangle,
  BarChart3,
  ArrowRight,
  Loader2,
  X,
  RotateCcw,
  ClipboardList,
  GitMerge,
  GripVertical,
  Sliders,
} from 'lucide-react';
import {
  fetchHeartbeatStatus,
  fetchMcpServers,
  fetchActiveDelegations,
  fetchMetrics,
  fetchCostBreakdown,
  fetchCostHistory,
  fetchPersonalities,
  resetUsageStat,
  fetchTasks,
  fetchSecurityEvents,
  fetchAuditEntries,
  fetchWorkflows,
} from '../api/client';
import type { CostBreakdownResponse, CostHistoryParams, WorkflowDefinition } from '../api/client';
import { ErrorBoundary } from './common/ErrorBoundary';
import { AgentWorldWidget } from './AgentWorldWidget';
import type {
  MetricsSnapshot,
  HealthStatus,
  McpServerConfig,
  Personality,
  HeartbeatStatus,
  Task,
  SecurityEvent,
  AuditEntry,
} from '../types';

import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from '@dnd-kit/core';
import {
  SortableContext,
  rectSortingStrategy,
  useSortable,
  arrayMove,
  sortableKeyboardCoordinates,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import { CARD_REGISTRY, type MissionCardId } from './MissionControl/registry';
import { loadLayout, saveLayout, defaultLayout, type CardLayout } from './MissionControl/layout';

// Lazy-load ReactFlow graph — keeps it out of the initial MetricsPage chunk
const MetricsGraph = lazy(() =>
  import('./MetricsGraph').then((m) => ({ default: m.MetricsGraph }))
);

// ── Constants ─────────────────────────────────────────────────────────

const MAX_HISTORY = 30;

const C = {
  primary: '#0ea5e9',
  success: '#22c55e',
  warning: '#f59e0b',
  destructive: '#ef4444',
  purple: '#8b5cf6',
  orange: '#f97316',
  muted: '#6b7280',
} as const;

const TOOLTIP_STYLE = {
  backgroundColor: 'hsl(var(--card))',
  border: '1px solid hsl(var(--border))',
  borderRadius: '8px',
  fontSize: '12px',
} as const;

type Tab = 'control' | 'costs' | 'full';

interface HistoryPoint {
  time: string;
  cpu: number;
  memory: number;
}

// ── Helpers ───────────────────────────────────────────────────────────

function formatUptime(ms: number): string {
  const hours = Math.floor(ms / 3_600_000);
  const minutes = Math.floor((ms % 3_600_000) / 60_000);
  if (hours > 24) {
    const days = Math.floor(hours / 24);
    return `${days}d ${hours % 24}h`;
  }
  return `${hours}h ${minutes}m`;
}

function fmtMs(ms: number): string {
  if (ms < 1_000) return `${ms.toFixed(0)}ms`;
  return `${(ms / 1_000).toFixed(2)}s`;
}

function safePct(numerator: number, denominator: number): number {
  if (denominator === 0) return 0;
  return Math.min(Math.round((numerator / denominator) * 100), 100);
}

// ── MetricsPage ───────────────────────────────────────────────────────

interface MetricsPageProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
}

export function MetricsPage({ metrics, health }: MetricsPageProps) {
  const [activeTab, setActiveTab] = useState<Tab>('control');
  const [editMode, setEditMode] = useState(false);
  const [catalogueOpen, setCatalogueOpen] = useState(false);
  const navigate = useNavigate();

  const { data: heartbeatStatus } = useQuery({
    queryKey: ['heartbeatStatus'],
    queryFn: fetchHeartbeatStatus,
    refetchInterval: 10_000,
    // Always refetch on mount so navigating away and back immediately reflects
    // personality enable/disable changes (global staleTime: 30s would otherwise
    // serve cached data for up to 30 seconds after a config change).
    staleTime: 0,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
    refetchInterval: 30_000,
  });

  const { data: activeDelegations } = useQuery({
    queryKey: ['activeDelegations'],
    queryFn: fetchActiveDelegations,
    refetchInterval: 10_000,
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    refetchInterval: 30_000,
    staleTime: 0,
  });

  // Accumulate CPU + memory for time-series charts
  const historyRef = useRef<HistoryPoint[]>([]);
  const [history, setHistory] = useState<HistoryPoint[]>([]);

  useEffect(() => {
    if (metrics?.resources == null) return;
    const point: HistoryPoint = {
      time: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      cpu: metrics.resources.cpuPercent,
      memory: metrics.resources.memoryUsedMb,
    };
    historyRef.current = [...historyRef.current, point].slice(-MAX_HISTORY);
    setHistory([...historyRef.current]);
  }, [metrics?.resources?.cpuPercent, metrics?.resources?.memoryUsedMb]);

  const heartbeatTasks = heartbeatStatus?.tasks ?? [];
  const mcpServers: McpServerConfig[] = mcpData?.servers ?? [];
  const enabledMcp = mcpServers.filter((s) => s.enabled).length;
  // Use server-computed totals (personality-aware) when available, fall back to base counts
  const totalHbTasks = heartbeatStatus?.totalTasks ?? heartbeatTasks.length;
  const enabledHb =
    heartbeatStatus?.enabledTasks ??
    heartbeatTasks.filter((t: { enabled: boolean }) => t.enabled).length;
  const personalities = personalitiesData?.personalities ?? [];
  const activePersonalities = personalities.filter((p: Personality) => p.isActive);
  const defaultPersonality = personalities.find((p: Personality) => p.isDefault);

  const handleViewCosts = useCallback(() => {
    setActiveTab('costs');
  }, []);

  const TAB_LABELS: Record<Tab, string> = {
    control: 'Mission Control',
    costs: 'Costs',
    full: 'Full Metrics',
  };

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="metrics-page">
      {/* Page header with tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Mission Control</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Command center — live status, tasks, costs, and security health
          </p>
        </div>
        <div className="flex items-center gap-2 self-start sm:self-auto">
          {activeTab === 'control' && (
            <button
              onClick={() => {
                setEditMode((e) => !e);
                setCatalogueOpen((e) => !e);
              }}
              className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-md transition-colors ${
                editMode
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:bg-muted'
              }`}
            >
              <Sliders className="w-3.5 h-3.5" />
              {editMode ? 'Editing…' : 'Customize'}
            </button>
          )}
          <div
            className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1"
            role="tablist"
            aria-label="Mission Control views"
          >
            {(['control', 'costs', 'full'] as Tab[]).map((tab) => (
              <button
                key={tab}
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => {
                  setActiveTab(tab);
                }}
                className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                  activeTab === tab
                    ? 'bg-card shadow-sm text-foreground'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                {TAB_LABELS[tab]}
              </button>
            ))}
          </div>
        </div>
      </div>

      {activeTab === 'control' && (
        <MissionControlTab
          metrics={metrics}
          health={health}
          history={history}
          heartbeatStatus={heartbeatStatus}
          mcpServers={mcpServers}
          enabledMcp={enabledMcp}
          enabledHb={enabledHb}
          totalHbTasks={totalHbTasks}
          activeDelegations={activeDelegations}
          activePersonalities={activePersonalities}
          defaultPersonality={defaultPersonality}
          navigate={navigate}
          onViewCosts={handleViewCosts}
          editMode={editMode}
          setEditMode={setEditMode}
          catalogueOpen={catalogueOpen}
          setCatalogueOpen={setCatalogueOpen}
        />
      )}
      {activeTab === 'costs' && <CostsTab />}
      {activeTab === 'full' && (
        <FullMetricsTab
          metrics={metrics}
          history={history}
          navigate={navigate}
          onViewCosts={handleViewCosts}
        />
      )}
    </div>
  );
}

const SEV_DOT: Record<string, string> = {
  critical: 'bg-destructive',
  error: 'bg-orange-500',
  warn: 'bg-warning',
  info: 'bg-primary',
};

const LEVEL_DOT: Record<string, string> = {
  error: 'bg-destructive',
  critical: 'bg-destructive',
  security: 'bg-orange-500',
  warn: 'bg-warning',
};

// ── Mission Control section components ────────────────────────────────

interface SectionCommonProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
  history: HistoryPoint[];
  heartbeatStatus: HeartbeatStatus | undefined;
  mcpServers: McpServerConfig[];
  enabledMcp: number;
  enabledHb: number;
  totalHbTasks: number;
  activeDelegations: { delegations?: { depth: number }[] } | undefined;
  activePersonalities: Personality[];
  defaultPersonality: Personality | undefined;
  navigate: ReturnType<typeof useNavigate>;
  onViewCosts: () => void;
  // activeTasks, securityEvents, auditEntries, workflows, costByProvider removed —
  // those sections now self-fetch to avoid unnecessary polling when hidden
  heartbeatRunning: boolean;
  worldViewMode: 'grid' | 'map' | 'large';
  setAndPersistWorldView: (m: 'grid' | 'map' | 'large') => void;
  worldZoom: number;
  adjustZoom: (delta: number) => void;
  setIsFullscreen: (v: boolean) => void;
}

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
        onClick={() => navigate('/personality')}
      />
      <StatCard
        title="Heartbeat"
        value={heartbeatStatus?.tasks?.length ?? 0}
        icon={<Heart className="w-4 h-4 sm:w-5 sm:h-5" />}
        subtitle={`${heartbeatStatus?.tasks?.filter((t) => t.enabled).length ?? 0} enabled`}
        trend={heartbeatRunning ? 'Running' : 'Stopped'}
        trendUp={heartbeatRunning}
        onClick={() => navigate('/security?tab=tasks&heartbeat=1')}
      />
      <StatCard
        title="Active Tasks"
        value={metrics?.tasks?.inProgress ?? 0}
        icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />}
        subtitle={`${metrics?.tasks?.queueDepth ?? 0} queued`}
        onClick={() => navigate('/tasks')}
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
        onClick={() => navigate('/security?tab=audit')}
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
            onClick={() => navigate('/automation')}
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
            onClick={() => navigate('/automation?tab=workflows')}
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
                onClick={() => navigate('/automation?tab=workflows')}
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
                onClick={() => navigate('/personality')}
              >
                {p.avatarUrl ? (
                  <img
                    src={p.avatarUrl.startsWith('/avatars/') ? p.avatarUrl : `/api/v1${p.avatarUrl}`}
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
          onClick={() => navigate('/mcp')}
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
            onClick={() => navigate('/mcp')}
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
            onClick={() => navigate('/security?tab=events')}
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
            onClick={() => navigate('/security?tab=audit')}
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
          onAgentClick={(id) => navigate(`/soul/personalities?focus=${id}`)}
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
  }
});

// ── MissionControlTab ────────────────────────────────────────────────

interface MissionControlTabProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
  history: HistoryPoint[];
  heartbeatStatus: HeartbeatStatus | undefined;
  mcpServers: McpServerConfig[];
  enabledMcp: number;
  enabledHb: number;
  totalHbTasks: number;
  activeDelegations: { delegations?: { depth: number }[] } | undefined;
  activePersonalities: Personality[];
  defaultPersonality: Personality | undefined;
  navigate: ReturnType<typeof useNavigate>;
  onViewCosts: () => void;
  editMode: boolean;
  setEditMode: React.Dispatch<React.SetStateAction<boolean>>;
  catalogueOpen: boolean;
  setCatalogueOpen: React.Dispatch<React.SetStateAction<boolean>>;
}

function MissionControlTab({
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
  editMode,
  setEditMode,
  catalogueOpen,
  setCatalogueOpen,
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
  // Note: tasksData, eventsData, auditData, workflowsData, costBreakdown queries
  // have been moved into their respective section components so they only poll
  // when those sections are rendered (visible in the card layout).
  const [cardLayouts, setCardLayouts] = useState<CardLayout[]>(() => loadLayout().cards);

  const updateLayouts = useCallback((updated: CardLayout[]) => {
    setCardLayouts(updated);
    saveLayout({ version: 1, cards: updated });
  }, []);

  // ── DnD sensors ───────────────────────────────────────────────────
  const sensors = useSensors(
    useSensor(PointerSensor),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const handleDragEnd = useCallback(
    ({ active, over }: DragEndEvent) => {
      if (!over || active.id === over.id) return;
      const sorted = [...cardLayouts].sort((a, b) => a.order - b.order);
      const from = sorted.findIndex((c) => c.id === active.id);
      const to = sorted.findIndex((c) => c.id === over.id);
      updateLayouts(arrayMove(sorted, from, to).map((c, i) => ({ ...c, order: i })));
    },
    [cardLayouts, updateLayouts]
  );

  // Bundle all section data into a single memoized props object.
  // useMemo ensures the object reference is stable when unrelated state (editMode,
  // catalogueOpen, isFullscreen) changes — so React.memo'd sections skip re-renders.
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

  const sorted = [...cardLayouts].sort((a, b) => a.order - b.order);

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
            {CARD_REGISTRY.map((def) => {
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

// ── CostsTab ──────────────────────────────────────────────────────────

type CostSubTab = 'summary' | 'history';

function CostsTab() {
  const [activeSubTab, setActiveSubTab] = useState<CostSubTab>('summary');

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* Sub-tab bar */}
      <div className="flex gap-1 border-b border-border">
        {(['summary', 'history'] as CostSubTab[]).map((tab) => (
          <button
            key={tab}
            onClick={() => {
              setActiveSubTab(tab);
            }}
            className={`px-4 py-2 text-sm font-medium capitalize transition-colors border-b-2 -mb-px ${
              activeSubTab === tab
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {activeSubTab === 'summary' && <CostSummaryTab />}
      {activeSubTab === 'history' && <CostHistoryTab />}
    </div>
  );
}

// ── CostSummaryTab ────────────────────────────────────────────────────

function CostSummaryTab() {
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
        <CostSummaryCard
          icon={<DollarSign className="w-5 h-5 text-success" />}
          label="Cost Today"
          value={`$${(resources?.costUsdToday ?? 0).toFixed(4)}`}
          loading={metricsLoading}
        />
        <CostSummaryCard
          icon={<TrendingUp className="w-5 h-5 text-primary" />}
          label="Cost This Month"
          value={`$${(resources?.costUsdMonth ?? 0).toFixed(4)}`}
          loading={metricsLoading}
        />
        <CostSummaryCard
          icon={<BarChart3 className="w-5 h-5 text-primary" />}
          label="Total API Calls"
          value={(resources?.apiCallsTotal ?? 0).toLocaleString()}
          loading={metricsLoading}
        />
        <CostSummaryCard
          icon={<Zap className="w-5 h-5 text-warning" />}
          label="Avg Latency"
          value={`${(resources?.apiLatencyAvgMs ?? 0).toFixed(0)} ms`}
          loading={metricsLoading}
          onReset={() => {
            resetMutation.mutate('latency');
          }}
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
          <p className="text-xs text-muted-foreground mt-1">
            {(resources?.inputTokensToday ?? 0).toLocaleString()} in /{' '}
            {(resources?.outputTokensToday ?? 0).toLocaleString()} out
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
              onClick={() => {
                resetMutation.mutate('errors');
              }}
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

// ── CostHistoryTab ────────────────────────────────────────────────────

const EMPTY_FILTERS: CostHistoryParams = {
  from: '',
  to: '',
  provider: '',
  model: '',
  personalityId: '',
  groupBy: 'day',
};

function CostHistoryTab() {
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
              onChange={(e) => {
                setFilters((f) => ({ ...f, from: e.target.value }));
              }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, to: e.target.value }));
              }}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              value={filters.provider ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, provider: e.target.value }));
              }}
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
              onChange={(e) => {
                setFilters((f) => ({ ...f, model: e.target.value }));
              }}
              placeholder="Filter by model name…"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Personality</label>
            <select
              value={filters.personalityId ?? ''}
              onChange={(e) => {
                setFilters((f) => ({ ...f, personalityId: e.target.value }));
              }}
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
              onChange={(e) => {
                setFilters((f) => ({ ...f, groupBy: e.target.value as 'day' | 'hour' }));
              }}
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

// ── FullMetricsTab ────────────────────────────────────────────────────

interface FullMetricsTabProps {
  metrics?: MetricsSnapshot;
  history: HistoryPoint[];
  navigate: ReturnType<typeof useNavigate>;
  onViewCosts: () => void;
}

function KpiTile({
  label,
  value,
  sub,
  highlight,
}: {
  label: string;
  value: string | number;
  sub?: string;
  highlight?: 'success' | 'warning' | 'destructive' | 'primary';
}) {
  const valueClass = highlight
    ? {
        success: 'text-success',
        warning: 'text-warning',
        destructive: 'text-destructive',
        primary: 'text-primary',
      }[highlight]
    : '';
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground truncate">{label}</p>
      <p className={`text-xl font-bold mt-0.5 truncate ${valueClass}`}>{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5 truncate">{sub}</p>}
    </div>
  );
}

function FullMetricsTab({ metrics, history }: FullMetricsTabProps) {
  // ── Task data ──────────────────────────────────────────────────────
  const TASK_STATUS_COLORS = [C.success, C.destructive, C.primary, C.warning, C.muted, C.purple];

  const taskStatusData = Object.entries(metrics?.tasks?.byStatus ?? {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));
  const taskStatusTotal = taskStatusData.reduce((s, d) => s + d.value, 0);

  const taskTypeData = Object.entries(metrics?.tasks?.byType ?? {})
    .filter(([, v]) => v > 0)
    .slice(0, 8)
    .map(([name, value]) => ({ name, value }));

  const durationData = [
    { label: 'Min', value: metrics?.tasks?.minDurationMs ?? 0 },
    { label: 'Avg', value: metrics?.tasks?.avgDurationMs ?? 0 },
    { label: 'p50', value: metrics?.tasks?.p50DurationMs ?? 0 },
    { label: 'p95', value: metrics?.tasks?.p95DurationMs ?? 0 },
    { label: 'p99', value: metrics?.tasks?.p99DurationMs ?? 0 },
    { label: 'Max', value: metrics?.tasks?.maxDurationMs ?? 0 },
  ];
  const durationColors = [C.success, C.primary, C.primary, C.warning, C.orange, C.destructive];
  const taskSlaOk = (metrics?.tasks?.successRate ?? 0) > 0.9;

  // ── Resource data ──────────────────────────────────────────────────
  const inputTokensToday = metrics?.resources?.inputTokensToday ?? 0;
  const outputTokensToday = metrics?.resources?.outputTokensToday ?? 0;
  const cachedToday = metrics?.resources?.tokensCachedToday ?? 0;
  const tokensUsedToday = metrics?.resources?.tokensUsedToday ?? 0;
  const tokensLimitDaily = metrics?.resources?.tokensLimitDaily;
  const tokensUsedPct = tokensLimitDaily ? safePct(tokensUsedToday, tokensLimitDaily) : null;

  const diskPercent = metrics?.resources?.diskLimitMb
    ? Math.min(((metrics.resources.diskUsedMb ?? 0) / metrics.resources.diskLimitMb) * 100, 100)
    : 0;

  const apiCallsTotal = metrics?.resources?.apiCallsTotal ?? 0;
  const apiErrorsTotal = metrics?.resources?.apiErrorsTotal ?? 0;
  const apiLatencyAvgMs = metrics?.resources?.apiLatencyAvgMs ?? 0;
  const apiErrorRate = safePct(apiErrorsTotal, apiCallsTotal || 1);

  // ── Security data ──────────────────────────────────────────────────
  const authAttemptsTotal = metrics?.security?.authAttemptsTotal ?? 0;
  const authSuccessTotal = metrics?.security?.authSuccessTotal ?? 0;
  const authFailuresTotal = metrics?.security?.authFailuresTotal ?? 0;
  const authSuccessRate = safePct(authSuccessTotal, authAttemptsTotal || 1);
  const authData = [
    { name: 'Success', value: authSuccessTotal },
    { name: 'Failures', value: authFailuresTotal },
  ];

  const SEV_COLORS: Record<string, string> = {
    info: C.primary,
    warn: C.warning,
    error: C.orange,
    critical: C.destructive,
  };

  const severityData = Object.entries(metrics?.security?.eventsBySeverity ?? {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value, fill: SEV_COLORS[name] ?? C.muted }));
  const severityTotal = severityData.reduce((s, d) => s + d.value, 0);

  const eventTypeData = Object.entries(metrics?.security?.eventsByType ?? {})
    .filter(([, v]) => v > 0)
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  const permDenialRate = safePct(
    metrics?.security?.permissionDenialsTotal ?? 0,
    metrics?.security?.permissionChecksTotal ?? 1
  );
  const hasThreats = (metrics?.security?.injectionAttemptsTotal ?? 0) > 0;

  return (
    <div className="space-y-8">
      {/* ── Section 1: Task Performance ─────────────────────────── */}
      <section aria-label="Task Performance">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Activity className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Task Performance</h2>
          </div>
          <div className="flex-1 h-px bg-border" />
          {taskSlaOk ? (
            <span className="text-xs text-success flex items-center gap-1 flex-shrink-0">
              <CheckCircle className="w-3 h-3" /> SLA Met
            </span>
          ) : (
            <span className="text-xs text-warning flex items-center gap-1 flex-shrink-0">
              <AlertTriangle className="w-3 h-3" /> Below Target
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <KpiTile label="Total Tasks" value={(metrics?.tasks?.total ?? 0).toLocaleString()} />
          <KpiTile
            label="In Progress"
            value={metrics?.tasks?.inProgress ?? 0}
            highlight={(metrics?.tasks?.inProgress ?? 0) > 0 ? 'primary' : undefined}
          />
          <KpiTile
            label="Success Rate"
            value={`${((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%`}
            highlight={
              (metrics?.tasks?.successRate ?? 0) > 0.95
                ? 'success'
                : (metrics?.tasks?.successRate ?? 0) > 0.8
                  ? 'warning'
                  : 'destructive'
            }
          />
          <KpiTile label="Avg Duration" value={fmtMs(metrics?.tasks?.avgDurationMs ?? 0)} />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status distribution — horizontal bars */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Status Distribution</h3>
              <p className="card-description text-xs">Tasks by current state</p>
            </div>
            <div className="card-content">
              {taskStatusData.length > 0 ? (
                <div className="space-y-3">
                  {taskStatusData.map((item, i) => {
                    const pct = safePct(item.value, taskStatusTotal);
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium">{item.name}</span>
                          <span className="font-mono text-muted-foreground">
                            {item.value} <span className="opacity-60">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{
                              width: `${pct}%`,
                              backgroundColor: TASK_STATUS_COLORS[i % TASK_STATUS_COLORS.length],
                            }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-1.5 border-t text-xs text-muted-foreground">
                    <span>Total</span>
                    <span className="font-mono font-medium text-foreground">
                      {taskStatusTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyChart message="No task data yet" />
              )}
            </div>
          </div>

          {/* Duration percentiles */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Duration Percentiles</h3>
              <p className="card-description text-xs">Execution time distribution</p>
            </div>
            <div className="card-content">
              <div className="h-[180px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={durationData} barSize={30}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#333"
                      opacity={0.1}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="label"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={(v) => fmtMs(v)}
                    />
                    <Tooltip
                      contentStyle={TOOLTIP_STYLE}
                      formatter={(v: number) => [fmtMs(v), 'Duration']}
                    />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      {durationData.map((_, i) => (
                        <Cell key={i} fill={durationColors[i % durationColors.length]} />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
              <div className="grid grid-cols-3 gap-2 mt-3 pt-2 border-t">
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">p50</p>
                  <p className="text-sm font-mono font-semibold">
                    {fmtMs(metrics?.tasks?.p50DurationMs ?? 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">p95</p>
                  <p
                    className={`text-sm font-mono font-semibold ${(metrics?.tasks?.p95DurationMs ?? 0) > 5000 ? 'text-warning' : ''}`}
                  >
                    {fmtMs(metrics?.tasks?.p95DurationMs ?? 0)}
                  </p>
                </div>
                <div className="text-center">
                  <p className="text-xs text-muted-foreground">p99</p>
                  <p
                    className={`text-sm font-mono font-semibold ${(metrics?.tasks?.p99DurationMs ?? 0) > 10000 ? 'text-destructive' : ''}`}
                  >
                    {fmtMs(metrics?.tasks?.p99DurationMs ?? 0)}
                  </p>
                </div>
              </div>
            </div>
          </div>
        </div>

        {taskTypeData.length > 0 && (
          <div className="card mt-4">
            <div className="card-header">
              <h3 className="card-title text-sm">Tasks by Type</h3>
              <p className="card-description text-xs">Volume breakdown by task category</p>
            </div>
            <div className="card-content">
              <div className="h-[160px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={taskTypeData} layout="vertical" barSize={14}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#333"
                      opacity={0.1}
                      horizontal={false}
                    />
                    <XAxis
                      type="number"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis
                      type="category"
                      dataKey="name"
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      width={90}
                    />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" name="Count" fill={C.primary} radius={[0, 4, 4, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>
        )}
      </section>

      {/* ── Section 2: Infrastructure ── */}
      <section aria-label="Infrastructure">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Cpu className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Infrastructure</h2>
          </div>
          <div className="flex-1 h-px bg-border" />
          <span className="text-xs text-muted-foreground flex-shrink-0">
            {history.length} samples
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <KpiTile
            label="CPU"
            value={`${(metrics?.resources?.cpuPercent ?? 0).toFixed(1)}%`}
            highlight={
              (metrics?.resources?.cpuPercent ?? 0) > 80
                ? 'destructive'
                : (metrics?.resources?.cpuPercent ?? 0) > 60
                  ? 'warning'
                  : undefined
            }
          />
          <KpiTile
            label="Memory"
            value={`${(metrics?.resources?.memoryUsedMb ?? 0).toFixed(0)} MB`}
            sub={`${(metrics?.resources?.memoryPercent ?? 0).toFixed(0)}% used`}
          />
          <KpiTile
            label="API Latency"
            value={`${apiLatencyAvgMs.toFixed(0)} ms`}
            highlight={apiLatencyAvgMs > 500 ? 'warning' : undefined}
          />
          <KpiTile
            label="Disk Used"
            value={`${(metrics?.resources?.diskUsedMb ?? 0).toFixed(0)} MB`}
            highlight={diskPercent > 90 ? 'destructive' : diskPercent > 70 ? 'warning' : undefined}
          />
        </div>

        {/* Full-width CPU + Memory time series */}
        <div className="card mb-4">
          <div className="card-header">
            <h3 className="card-title text-sm">CPU & Memory Over Time</h3>
            <p className="card-description text-xs">
              Live samples — last {MAX_HISTORY} data points
            </p>
          </div>
          <div className="card-content">
            <div className="h-[220px]">
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="fmCpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.primary} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="fmMemGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.success} stopOpacity={0.25} />
                        <stop offset="95%" stopColor={C.success} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                      interval="preserveStartEnd"
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      name="CPU %"
                      stroke={C.primary}
                      fill="url(#fmCpuGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="memory"
                      name="Memory MB"
                      stroke={C.success}
                      fill="url(#fmMemGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Collecting metrics data…" />
              )}
            </div>
          </div>
        </div>

        {/* Token Usage + API Performance */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Token Usage */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Token Usage</h3>
              <p className="card-description text-xs">Daily consumption — input, output, cached</p>
            </div>
            <div className="card-content space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Input</p>
                  <p className="text-lg font-bold">{(inputTokensToday / 1000).toFixed(1)}k</p>
                </div>
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Output</p>
                  <p className="text-lg font-bold">{(outputTokensToday / 1000).toFixed(1)}k</p>
                </div>
                <div className="p-3 rounded-md bg-muted/30 text-center">
                  <p className="text-xs text-muted-foreground mb-1">Cached</p>
                  <p className="text-lg font-bold text-success">
                    {(cachedToday / 1000).toFixed(1)}k
                  </p>
                </div>
              </div>
              {tokensUsedPct !== null && (
                <div>
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground">Daily limit usage</span>
                    <span
                      className={`font-mono ${tokensUsedPct > 80 ? 'text-warning' : 'text-muted-foreground'}`}
                    >
                      {tokensUsedPct}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${tokensUsedPct > 90 ? 'bg-destructive' : tokensUsedPct > 70 ? 'bg-warning' : 'bg-primary'}`}
                      style={{ width: `${tokensUsedPct}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {tokensUsedToday.toLocaleString()} of {tokensLimitDaily!.toLocaleString()}{' '}
                    tokens
                  </p>
                </div>
              )}
              <div className="flex items-center justify-between pt-2 border-t text-sm">
                <span className="text-xs text-muted-foreground">Total today</span>
                <span className="font-bold font-mono">{tokensUsedToday.toLocaleString()}</span>
              </div>
            </div>
          </div>

          {/* API Performance */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">API Performance</h3>
              <p className="card-description text-xs">Call volume, latency, and error rate</p>
            </div>
            <div className="card-content space-y-4">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total Calls</p>
                  <p className="text-2xl font-bold">{apiCallsTotal.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Avg Latency</p>
                  <p
                    className={`text-2xl font-bold ${apiLatencyAvgMs > 500 ? 'text-warning' : ''}`}
                  >
                    {apiLatencyAvgMs.toFixed(0)} ms
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Error rate</span>
                  <span
                    className={`font-mono ${apiErrorRate > 5 ? 'text-destructive' : apiErrorRate > 1 ? 'text-warning' : 'text-muted-foreground'}`}
                  >
                    {apiErrorRate.toFixed(2)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full transition-all"
                    style={{ width: `${Math.min(apiErrorRate, 100)}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {apiErrorsTotal.toLocaleString()} errors of {apiCallsTotal.toLocaleString()} calls
                </p>
              </div>
              {metrics?.resources?.diskLimitMb && (
                <div className="pt-2 border-t">
                  <div className="flex items-center justify-between text-xs mb-1.5">
                    <span className="text-muted-foreground flex items-center gap-1">
                      <HardDrive className="w-3 h-3" /> Disk
                    </span>
                    <span
                      className={`font-mono ${diskPercent > 70 ? 'text-warning' : 'text-muted-foreground'}`}
                    >
                      {diskPercent.toFixed(1)}%
                    </span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full ${diskPercent > 90 ? 'bg-destructive' : diskPercent > 70 ? 'bg-warning' : 'bg-primary'}`}
                      style={{ width: `${diskPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">
                    {(metrics.resources.diskUsedMb ?? 0).toFixed(0)} MB of{' '}
                    {metrics.resources.diskLimitMb.toFixed(0)} MB
                  </p>
                </div>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* ── Section 3: Security ── */}
      <section aria-label="Security Metrics">
        <div className="flex items-center gap-3 mb-5">
          <div className="flex items-center gap-2 flex-shrink-0">
            <Shield className="w-4 h-4 text-primary" />
            <h2 className="font-semibold text-sm">Security</h2>
          </div>
          <div className="flex-1 h-px bg-border" />
          {hasThreats ? (
            <span className="text-xs text-destructive flex items-center gap-1 flex-shrink-0">
              <AlertTriangle className="w-3 h-3" /> Threats Detected
            </span>
          ) : (
            <span className="text-xs text-success flex items-center gap-1 flex-shrink-0">
              <CheckCircle className="w-3 h-3" /> No Active Threats
            </span>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-5">
          <KpiTile
            label="Blocked Requests"
            value={(metrics?.security?.blockedRequestsTotal ?? 0).toLocaleString()}
            highlight={(metrics?.security?.blockedRequestsTotal ?? 0) > 0 ? 'warning' : undefined}
          />
          <KpiTile
            label="Rate Limit Hits"
            value={(metrics?.security?.rateLimitHitsTotal ?? 0).toLocaleString()}
            highlight={(metrics?.security?.rateLimitHitsTotal ?? 0) > 0 ? 'warning' : undefined}
          />
          <KpiTile
            label="Injection Attempts"
            value={(metrics?.security?.injectionAttemptsTotal ?? 0).toLocaleString()}
            highlight={
              (metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'destructive' : undefined
            }
          />
          <KpiTile
            label="Active Sessions"
            value={(metrics?.security?.activeSessions ?? 0).toLocaleString()}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Authentication */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Authentication</h3>
              <p className="card-description text-xs">Login attempts — success vs failure</p>
            </div>
            <div className="card-content space-y-4">
              <div className="grid grid-cols-3 gap-3">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-2xl font-bold">{authAttemptsTotal.toLocaleString()}</p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Success</p>
                  <p className="text-2xl font-bold text-success">
                    {authSuccessTotal.toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Failed</p>
                  <p
                    className={`text-2xl font-bold ${authFailuresTotal > 0 ? 'text-destructive' : ''}`}
                  >
                    {authFailuresTotal.toLocaleString()}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between text-xs mb-1.5">
                  <span className="text-muted-foreground">Success rate</span>
                  <span
                    className={`font-mono ${authSuccessRate < 90 ? 'text-warning' : 'text-success'}`}
                  >
                    {authSuccessRate}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-success rounded-full transition-all"
                    style={{ width: `${authSuccessRate}%` }}
                  />
                </div>
              </div>
              <div className="h-[100px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={authData} barSize={52}>
                    <CartesianGrid
                      strokeDasharray="3 3"
                      stroke="#333"
                      opacity={0.1}
                      vertical={false}
                    />
                    <XAxis
                      dataKey="name"
                      tick={{ fontSize: 12 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                      <Cell fill={C.success} />
                      <Cell fill={C.destructive} />
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </div>
          </div>

          {/* Events by severity — horizontal bars */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Events by Severity</h3>
              <p className="card-description text-xs">Security event distribution</p>
            </div>
            <div className="card-content">
              {severityData.length > 0 ? (
                <div className="space-y-3">
                  {severityData.map((item) => {
                    const pct = safePct(item.value, severityTotal);
                    return (
                      <div key={item.name} className="space-y-1">
                        <div className="flex items-center justify-between text-xs">
                          <span className="capitalize font-medium">{item.name}</span>
                          <span className="font-mono text-muted-foreground">
                            {item.value} <span className="opacity-60">({pct}%)</span>
                          </span>
                        </div>
                        <div className="h-2 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{ width: `${pct}%`, backgroundColor: item.fill }}
                          />
                        </div>
                      </div>
                    );
                  })}
                  <div className="flex items-center justify-between pt-1.5 border-t text-xs text-muted-foreground">
                    <span>Total events</span>
                    <span className="font-mono font-medium text-foreground">
                      {severityTotal.toLocaleString()}
                    </span>
                  </div>
                </div>
              ) : (
                <EmptyChart message="No security events recorded" />
              )}
              {eventTypeData.length > 0 && (
                <div className="mt-4 pt-3 border-t">
                  <p className="text-xs text-muted-foreground mb-2">Top event types</p>
                  <div className="space-y-1.5">
                    {eventTypeData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between text-xs">
                        <span className="capitalize text-muted-foreground">{item.name}</span>
                        <span className="font-mono font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Permission checks + Audit trail */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 mt-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Permission Checks</h3>
              <p className="card-description text-xs">Access control enforcement metrics</p>
            </div>
            <div className="card-content space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <p className="text-xs text-muted-foreground">Total Checks</p>
                  <p className="text-2xl font-bold">
                    {(metrics?.security?.permissionChecksTotal ?? 0).toLocaleString()}
                  </p>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground">Denials</p>
                  <p className="text-2xl font-bold text-warning">
                    {(metrics?.security?.permissionDenialsTotal ?? 0).toLocaleString()}
                  </p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Denial rate</span>
                  <span className="text-xs font-mono font-medium">
                    {permDenialRate.toFixed(1)}%
                  </span>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-warning rounded-full transition-all"
                    style={{ width: `${permDenialRate}%` }}
                  />
                </div>
              </div>
              {eventTypeData.length > 0 && (
                <div className="border-t pt-3">
                  <p className="text-xs text-muted-foreground mb-2">Top event types</p>
                  <div className="space-y-1.5">
                    {eventTypeData.map((item) => (
                      <div key={item.name} className="flex items-center justify-between">
                        <span className="text-xs capitalize text-muted-foreground">
                          {item.name}
                        </span>
                        <span className="text-xs font-medium">{item.value}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          </div>

          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Audit Trail</h3>
              <p className="card-description text-xs">Tamper-evident log integrity</p>
            </div>
            <div className="card-content space-y-4">
              <div className="flex items-center gap-3">
                <div
                  className={`p-3 rounded-full ${metrics?.security?.auditChainValid ? 'bg-success/10' : 'bg-destructive/10'}`}
                >
                  {metrics?.security?.auditChainValid ? (
                    <CheckCircle className="w-6 h-6 text-success" />
                  ) : (
                    <XCircle className="w-6 h-6 text-destructive" />
                  )}
                </div>
                <div>
                  <p
                    className={`text-sm font-semibold ${metrics?.security?.auditChainValid ? 'text-success' : 'text-destructive'}`}
                  >
                    {metrics?.security?.auditChainValid
                      ? 'Chain Integrity Verified'
                      : 'Chain Integrity Compromised'}
                  </p>
                  {metrics?.security?.lastAuditVerification && (
                    <p className="text-xs text-muted-foreground">
                      Last verified:{' '}
                      {new Date(metrics.security.lastAuditVerification).toLocaleString()}
                    </p>
                  )}
                </div>
              </div>
              <div className="border-t pt-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Total Entries</span>
                  <span className="text-sm font-bold">
                    {(metrics?.security?.auditEntriesTotal ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Blocked Requests</span>
                  <span
                    className={`text-sm font-bold ${(metrics?.security?.blockedRequestsTotal ?? 0) > 0 ? 'text-warning' : ''}`}
                  >
                    {(metrics?.security?.blockedRequestsTotal ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Injection Attempts</span>
                  <span
                    className={`text-sm font-bold ${(metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'text-destructive' : ''}`}
                  >
                    {(metrics?.security?.injectionAttemptsTotal ?? 0).toLocaleString()}
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

// ── Shared sub-components ─────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon,
  trend,
  trendUp,
  subtitle,
  onClick,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  trend?: string;
  trendUp?: boolean;
  subtitle?: string;
  onClick?: () => void;
}) {
  return (
    <div
      className={`card p-3 sm:p-4${onClick ? ' cursor-pointer hover:bg-muted/30 transition-colors' : ''}`}
      onClick={onClick}
    >
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-xs sm:text-sm text-muted-foreground truncate">{title}</p>
          <p className="text-lg sm:text-xl lg:text-2xl font-bold mt-0.5 sm:mt-1 truncate">
            {value}
          </p>
          {subtitle && (
            <p className="text-[10px] sm:text-xs text-muted-foreground mt-0.5 sm:mt-1">
              {subtitle}
            </p>
          )}
          {trend && (
            <p
              className={`text-[10px] sm:text-xs mt-0.5 sm:mt-1 flex items-center gap-1 ${
                trendUp === true
                  ? 'text-success'
                  : trendUp === false
                    ? 'text-destructive'
                    : 'text-muted-foreground'
              }`}
            >
              {trendUp === true && <CheckCircle className="w-3 h-3 flex-shrink-0" />}
              {trendUp === false && <XCircle className="w-3 h-3 flex-shrink-0" />}
              <span className="truncate">{trend}</span>
            </p>
          )}
        </div>
        <div className="p-1.5 sm:p-2 bg-primary/10 rounded-lg text-primary flex-shrink-0">
          {icon}
        </div>
      </div>
    </div>
  );
}

function ServiceStatusRow({
  label,
  ok,
  detail,
  icon,
  onClick,
}: {
  label: string;
  ok: boolean;
  detail: string;
  icon: React.ReactNode;
  onClick?: () => void;
}) {
  return (
    <div
      className={`flex items-center justify-between py-2 border-b last:border-0${
        onClick ? ' cursor-pointer hover:bg-muted/20 rounded px-1 -mx-1 transition-colors' : ''
      }`}
      onClick={onClick}
    >
      <div className="flex items-center gap-2">
        <span className={ok ? 'text-success' : 'text-destructive'}>{icon}</span>
        <span className="text-sm">{label}</span>
      </div>
      <span className={`text-xs font-medium ${ok ? 'text-success' : 'text-destructive'}`}>
        {detail}
      </span>
    </div>
  );
}

function MiniStatCard({
  label,
  value,
  valueClass,
}: {
  label: string;
  value: string | number;
  valueClass?: string;
}) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className={`text-xl font-bold mt-0.5 truncate ${valueClass ?? ''}`}>{value}</p>
    </div>
  );
}

function EmptyChart({ message }: { message: string }) {
  return (
    <div className="h-[120px] flex items-center justify-center text-sm text-muted-foreground">
      {message}
    </div>
  );
}

function LegendItem({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <div className="w-3 h-3 rounded-sm flex-shrink-0" style={{ backgroundColor: color }} />
      <span className="text-xs capitalize text-muted-foreground">{label}</span>
      <span className="text-xs font-medium ml-auto">{value}</span>
    </div>
  );
}

// ── CostSummaryCard ───────────────────────────────────────────────────

interface CostSummaryCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  loading?: boolean;
  onReset?: () => void;
  resetting?: boolean;
}

function CostSummaryCard({
  icon,
  label,
  value,
  loading,
  onReset,
  resetting,
}: CostSummaryCardProps) {
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

// ── RecommendationCard ────────────────────────────────────────────────

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
