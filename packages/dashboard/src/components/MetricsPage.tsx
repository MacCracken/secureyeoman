/**
 * MetricsPage
 *
 * Unified metrics dashboard with three views:
 *   - Overview: key KPIs, system health, sparklines, and system topology graph
 *   - Costs: cost analytics, provider breakdown, and usage history (formerly CostsPage)
 *   - Full Metrics: deep-dive charts covering tasks, resources, and security
 */

import { useState, useEffect, useRef, lazy, Suspense } from 'react';
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
} from '../api/client';
import type { CostBreakdownResponse, CostHistoryParams } from '../api/client';
import { ErrorBoundary } from './common/ErrorBoundary';
import type { MetricsSnapshot, HealthStatus, McpServerConfig, Personality } from '../types';

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

type Tab = 'overview' | 'costs' | 'full';

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
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const navigate = useNavigate();

  const { data: heartbeatStatus } = useQuery({
    queryKey: ['heartbeatStatus'],
    queryFn: fetchHeartbeatStatus,
    refetchInterval: 10_000,
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
  const enabledHb = heartbeatTasks.filter((t: { enabled: boolean }) => t.enabled).length;

  const TAB_LABELS: Record<Tab, string> = {
    overview: 'Overview',
    costs: 'Costs',
    full: 'Full Metrics',
  };

  return (
    <div className="space-y-4 sm:space-y-6" data-testid="metrics-page">
      {/* Page header with tab switcher */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Metrics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Real-time performance, cost analytics, and security health
          </p>
        </div>
        <div
          className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1 self-start sm:self-auto"
          role="tablist"
          aria-label="Metrics views"
        >
          {(['overview', 'costs', 'full'] as Tab[]).map((tab) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
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

      {activeTab === 'overview' && (
        <OverviewTab
          metrics={metrics}
          health={health}
          history={history}
          heartbeatStatus={heartbeatStatus}
          mcpServers={mcpServers}
          enabledMcp={enabledMcp}
          enabledHb={enabledHb}
          heartbeatTasks={heartbeatTasks}
          activeDelegations={activeDelegations}
          navigate={navigate}
          onViewCosts={() => setActiveTab('costs')}
        />
      )}
      {activeTab === 'costs' && <CostsTab />}
      {activeTab === 'full' && (
        <FullMetricsTab
          metrics={metrics}
          history={history}
          navigate={navigate}
          onViewCosts={() => setActiveTab('costs')}
        />
      )}
    </div>
  );
}

// ── OverviewTab ───────────────────────────────────────────────────────

interface OverviewTabProps {
  metrics?: MetricsSnapshot;
  health?: HealthStatus;
  history: HistoryPoint[];
  heartbeatStatus: { running: boolean; beatCount: number } | undefined;
  mcpServers: McpServerConfig[];
  enabledMcp: number;
  enabledHb: number;
  heartbeatTasks: { enabled: boolean }[];
  activeDelegations: { delegations?: { depth: number }[] } | undefined;
  navigate: ReturnType<typeof useNavigate>;
  onViewCosts: () => void;
}

function OverviewTab({
  metrics,
  health,
  history,
  heartbeatStatus,
  mcpServers,
  enabledMcp,
  enabledHb,
  heartbeatTasks,
  activeDelegations,
  navigate,
  onViewCosts,
}: OverviewTabProps) {
  const heartbeatRunning = heartbeatStatus?.running ?? false;

  return (
    <div className="space-y-4 sm:space-y-6">
      {/* KPI stat cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        <StatCard
          title="Active Agents"
          value={activeDelegations?.delegations?.length ?? 0}
          icon={<Bot className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={
            activeDelegations?.delegations?.length
              ? `Depth: ${Math.max(...(activeDelegations.delegations.map((d) => d.depth) || [0]))}`
              : undefined
          }
          onClick={() => navigate('/agents')}
        />
        <StatCard
          title="Heartbeat"
          value={heartbeatStatus?.beatCount ?? 0}
          icon={<Heart className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={`${enabledHb}/${heartbeatTasks.length} tasks`}
          trend={heartbeatRunning ? 'Running' : 'Stopped'}
          trendUp={heartbeatRunning}
          onClick={() => navigate('/security?tab=tasks&heartbeat=1')}
        />
        <StatCard
          title="Active Tasks"
          value={metrics?.tasks?.inProgress ?? 0}
          icon={<Clock className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={`${metrics?.tasks?.queueDepth ?? 0} queued`}
        />
        <StatCard
          title="Tasks Today"
          value={metrics?.tasks?.total ?? 0}
          icon={<Activity className="w-4 h-4 sm:w-5 sm:h-5" />}
          trend={
            metrics?.tasks?.successRate
              ? `${(metrics.tasks.successRate * 100).toFixed(1)}% success`
              : undefined
          }
          trendUp={metrics?.tasks?.successRate ? metrics.tasks.successRate > 0.9 : undefined}
        />
        <StatCard
          title="Memory Usage"
          value={`${(metrics?.resources?.memoryUsedMb ?? 0).toFixed(1)} MB`}
          icon={<HardDrive className="w-4 h-4 sm:w-5 sm:h-5" />}
          subtitle={
            metrics?.resources?.memoryPercent
              ? `${metrics.resources.memoryPercent.toFixed(1)}% of limit`
              : undefined
          }
        />
        <StatCard
          title="Audit Entries"
          value={metrics?.security?.auditEntriesTotal ?? 0}
          icon={<Shield className="w-4 h-4 sm:w-5 sm:h-5" />}
          trend={metrics?.security?.auditChainValid ? 'Chain Valid' : 'Chain Invalid'}
          trendUp={metrics?.security?.auditChainValid}
          onClick={() => navigate('/security?tab=audit')}
        />
      </div>

      {/* System health + resource sparkline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 sm:gap-6">
        {/* System health */}
        <div className="card">
          <div className="card-header">
            <h2 className="card-title text-base">System Health</h2>
            <p className="card-description text-xs">Infrastructure status at a glance</p>
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
            <ServiceStatusRow
              label="Version"
              ok={true}
              detail={health?.version ?? '—'}
              icon={<Activity className="w-3.5 h-3.5" />}
            />
          </div>
        </div>

        {/* CPU + Memory sparkline */}
        <div className="card lg:col-span-2">
          <div className="card-header">
            <h2 className="card-title text-base">Resource Trend</h2>
            <p className="card-description text-xs">CPU % and memory MB over time</p>
          </div>
          <div className="card-content">
            <div className="h-[200px]">
              {history.length > 1 ? (
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={history}>
                    <defs>
                      <linearGradient id="ovCpuGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.primary} stopOpacity={0} />
                      </linearGradient>
                      <linearGradient id="ovMemGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={C.success} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={C.success} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#333" opacity={0.1} />
                    <XAxis
                      dataKey="time"
                      tick={{ fontSize: 10 }}
                      tickLine={false}
                      axisLine={false}
                    />
                    <YAxis tick={{ fontSize: 10 }} tickLine={false} axisLine={false} />
                    <Tooltip contentStyle={TOOLTIP_STYLE} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area
                      type="monotone"
                      dataKey="cpu"
                      name="CPU %"
                      stroke={C.primary}
                      fill="url(#ovCpuGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                    <Area
                      type="monotone"
                      dataKey="memory"
                      name="Memory MB"
                      stroke={C.success}
                      fill="url(#ovMemGrad)"
                      strokeWidth={2}
                      dot={false}
                    />
                  </AreaChart>
                </ResponsiveContainer>
              ) : (
                <EmptyChart message="Collecting resource data…" />
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Quick metric cards: tokens, task perf, cost */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        {/* Token usage */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title text-sm flex items-center gap-2">
              <Zap className="w-4 h-4 text-primary" /> Token Usage
            </h3>
          </div>
          <div className="card-content flex items-center gap-4">
            <div>
              <p className="text-2xl font-bold">
                {(metrics?.resources?.tokensUsedToday ?? 0).toLocaleString()}
              </p>
              <p className="text-xs text-muted-foreground">used today</p>
              <p className="text-xs text-muted-foreground mt-1">
                {(metrics?.resources?.tokensCachedToday ?? 0).toLocaleString()} cached
              </p>
            </div>
            <div className="flex-1 h-[80px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: 'Used', value: metrics?.resources?.tokensUsedToday ?? 0 },
                      { name: 'Cached', value: metrics?.resources?.tokensCachedToday ?? 0 },
                    ]}
                    innerRadius={25}
                    outerRadius={35}
                    paddingAngle={2}
                    dataKey="value"
                  >
                    <Cell fill={C.primary} />
                    <Cell fill={C.success} />
                  </Pie>
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </div>
        </div>

        {/* Task performance */}
        <div className="card">
          <div className="card-header">
            <h3 className="card-title text-sm flex items-center gap-2">
              <Activity className="w-4 h-4 text-primary" /> Task Performance
            </h3>
          </div>
          <div className="card-content space-y-3">
            <div className="flex items-center justify-between">
              <span className="text-sm text-muted-foreground">Success Rate</span>
              <span
                className={`text-sm font-bold ${
                  (metrics?.tasks?.successRate ?? 0) > 0.9 ? 'text-success' : 'text-warning'
                }`}
              >
                {((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%
              </span>
            </div>
            <div className="h-2 bg-muted rounded-full overflow-hidden">
              <div
                className={`h-full rounded-full transition-all ${
                  (metrics?.tasks?.successRate ?? 0) > 0.9 ? 'bg-success' : 'bg-warning'
                }`}
                style={{ width: `${(metrics?.tasks?.successRate ?? 0) * 100}%` }}
              />
            </div>
            <div className="flex items-center justify-between text-xs text-muted-foreground">
              <span>Avg: {fmtMs(metrics?.tasks?.avgDurationMs ?? 0)}</span>
              <span>p99: {fmtMs(metrics?.tasks?.p99DurationMs ?? 0)}</span>
            </div>
          </div>
        </div>

        {/* Estimated cost — clicking switches to Costs tab */}
        <div
          className="card cursor-pointer hover:bg-muted/30 transition-colors"
          onClick={onViewCosts}
          title="View cost analytics"
        >
          <div className="card-header">
            <h3 className="card-title text-sm flex items-center gap-2">
              <DollarSign className="w-4 h-4 text-success" /> Estimated Cost
            </h3>
          </div>
          <div className="card-content">
            <div className="flex items-baseline gap-4">
              <div>
                <p className="text-2xl font-bold">
                  ${(metrics?.resources?.costUsdToday ?? 0).toFixed(4)}
                </p>
                <p className="text-xs text-muted-foreground">Today</p>
              </div>
              <div>
                <p className="text-xl font-bold">
                  ${(metrics?.resources?.costUsdMonth ?? 0).toFixed(2)}
                </p>
                <p className="text-xs text-muted-foreground">This Month</p>
              </div>
            </div>
            <div className="flex items-center gap-3 mt-2">
              <span className="text-xs text-muted-foreground">
                {(metrics?.resources?.apiCallsTotal ?? 0).toLocaleString()} API calls
              </span>
              {(metrics?.resources?.apiErrorsTotal ?? 0) > 0 && (
                <span className="text-xs text-destructive">
                  {metrics!.resources.apiErrorsTotal} errors
                </span>
              )}
            </div>
            <p className="text-xs text-primary mt-2">View cost analytics →</p>
          </div>
        </div>
      </div>

      {/* System topology graph */}
      <div className="card">
        <div className="card-header">
          <h2 className="card-title text-base sm:text-lg">System Topology</h2>
          <p className="card-description text-xs sm:text-sm">
            Live infrastructure visualization — click nodes to drill down
          </p>
        </div>
        <div className="card-content">
          <ErrorBoundary fallbackTitle="Graph failed to render">
            <Suspense
              fallback={
                <div className="h-64 flex items-center justify-center text-sm text-muted-foreground">
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
    </div>
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
            onClick={() => setActiveSubTab(tab)}
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
          onReset={() => resetMutation.mutate('latency')}
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
              onClick={() => resetMutation.mutate('errors')}
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
                            <span className="text-destructive">
                              {data.errors.toLocaleString()}
                            </span>
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

  const handleApply = () => setAppliedFilters({ ...filters });

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
              onChange={(e) => setFilters((f) => ({ ...f, from: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">To</label>
            <input
              type="date"
              value={filters.to ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, to: e.target.value }))}
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Provider</label>
            <select
              value={filters.provider ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, provider: e.target.value }))}
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
              onChange={(e) => setFilters((f) => ({ ...f, model: e.target.value }))}
              placeholder="Filter by model name…"
              className="w-full h-9 px-3 rounded-md border border-input bg-background text-sm"
            />
          </div>
          <div className="space-y-1">
            <label className="text-xs text-muted-foreground">Personality</label>
            <select
              value={filters.personalityId ?? ''}
              onChange={(e) => setFilters((f) => ({ ...f, personalityId: e.target.value }))}
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
                setFilters((f) => ({ ...f, groupBy: e.target.value as 'day' | 'hour' }))
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
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Model
                    </th>
                    <th className="text-left py-3 px-4 font-medium text-muted-foreground">
                      Personality
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Tokens
                    </th>
                    <th className="text-right py-3 px-4 font-medium text-muted-foreground">
                      Cost
                    </th>
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
                    <td className="py-3 px-4 text-right font-mono">
                      ${totals.costUsd.toFixed(4)}
                    </td>
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

function SectionHeader({
  title,
  subtitle,
  icon,
}: {
  title: string;
  subtitle?: string;
  icon: React.ReactNode;
}) {
  return (
    <div className="flex items-center gap-3 mb-4">
      <div className="p-2 bg-primary/10 rounded-lg text-primary flex-shrink-0">{icon}</div>
      <div>
        <h2 className="text-base sm:text-lg font-semibold">{title}</h2>
        {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
      </div>
    </div>
  );
}

function FullMetricsTab({ metrics, history, onViewCosts }: FullMetricsTabProps) {
  // ── Task data ──────────────────────────────────────────────────────
  const TASK_STATUS_COLORS = [C.success, C.destructive, C.primary, C.warning, C.muted, C.purple];

  const taskStatusData = Object.entries(metrics?.tasks?.byStatus ?? {})
    .filter(([, v]) => v > 0)
    .map(([name, value]) => ({ name, value }));

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

  // ── Resource data ──────────────────────────────────────────────────
  const tokenData = [
    { name: 'Used', value: metrics?.resources?.tokensUsedToday ?? 0 },
    { name: 'Cached', value: metrics?.resources?.tokensCachedToday ?? 0 },
  ];

  const diskPercent = metrics?.resources?.diskLimitMb
    ? Math.min(
        ((metrics.resources.diskUsedMb ?? 0) / metrics.resources.diskLimitMb) * 100,
        100
      )
    : 0;

  const apiErrorRate = safePct(
    metrics?.resources?.apiErrorsTotal ?? 0,
    metrics?.resources?.apiCallsTotal ?? 1
  );

  // ── Security data ──────────────────────────────────────────────────
  const authData = [
    { name: 'Success', value: metrics?.security?.authSuccessTotal ?? 0 },
    { name: 'Failures', value: metrics?.security?.authFailuresTotal ?? 0 },
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

  const eventTypeData = Object.entries(metrics?.security?.eventsByType ?? {})
    .filter(([, v]) => v > 0)
    .slice(0, 6)
    .map(([name, value]) => ({ name: name.replace(/_/g, ' '), value }));

  const permDenialRate = safePct(
    metrics?.security?.permissionDenialsTotal ?? 0,
    metrics?.security?.permissionChecksTotal ?? 1
  );

  return (
    <div className="space-y-10">
      {/* ── Task Performance ─────────────────────────────────────── */}
      <section aria-label="Task Performance">
        <SectionHeader
          title="Task Performance"
          subtitle="Execution metrics, duration distribution, and queue status"
          icon={<Activity className="w-5 h-5" />}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStatCard label="Total Tasks" value={metrics?.tasks?.total ?? 0} />
          <MiniStatCard label="In Progress" value={metrics?.tasks?.inProgress ?? 0} />
          <MiniStatCard label="Queue Depth" value={metrics?.tasks?.queueDepth ?? 0} />
          <MiniStatCard
            label="Success Rate"
            value={`${((metrics?.tasks?.successRate ?? 0) * 100).toFixed(1)}%`}
            valueClass={
              (metrics?.tasks?.successRate ?? 0) > 0.9 ? 'text-success' : 'text-warning'
            }
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Status distribution donut */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Status Distribution</h3>
              <p className="card-description text-xs">Tasks by current state</p>
            </div>
            <div className="card-content">
              {taskStatusData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="h-[180px] w-[180px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={taskStatusData}
                          innerRadius={52}
                          outerRadius={78}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {taskStatusData.map((_, i) => (
                            <Cell
                              key={i}
                              fill={TASK_STATUS_COLORS[i % TASK_STATUS_COLORS.length]}
                            />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {taskStatusData.map((item, i) => (
                      <LegendItem
                        key={item.name}
                        color={TASK_STATUS_COLORS[i % TASK_STATUS_COLORS.length]}
                        label={item.name}
                        value={String(item.value)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyChart message="No task data yet" />
              )}
            </div>
          </div>

          {/* Duration percentiles bar */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Duration Percentiles</h3>
              <p className="card-description text-xs">Task execution time distribution</p>
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

      {/* ── Resource Usage ────────────────────────────────────────── */}
      <section aria-label="Resource Usage">
        <SectionHeader
          title="Resource Usage"
          subtitle="CPU, memory, storage, tokens, API performance, and costs"
          icon={<Cpu className="w-5 h-5" />}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStatCard
            label="CPU"
            value={`${(metrics?.resources?.cpuPercent ?? 0).toFixed(1)}%`}
            valueClass={
              (metrics?.resources?.cpuPercent ?? 0) > 80
                ? 'text-destructive'
                : (metrics?.resources?.cpuPercent ?? 0) > 60
                  ? 'text-warning'
                  : ''
            }
          />
          <MiniStatCard
            label="Memory"
            value={`${(metrics?.resources?.memoryUsedMb ?? 0).toFixed(0)} MB`}
          />
          <MiniStatCard
            label="API Latency"
            value={`${(metrics?.resources?.apiLatencyAvgMs ?? 0).toFixed(0)} ms`}
            valueClass={
              (metrics?.resources?.apiLatencyAvgMs ?? 0) > 500 ? 'text-warning' : ''
            }
          />
          <MiniStatCard
            label="Cost / Month"
            value={`$${(metrics?.resources?.costUsdMonth ?? 0).toFixed(2)}`}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* CPU + Memory time series */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">CPU & Memory Over Time</h3>
              <p className="card-description text-xs">Last {MAX_HISTORY} data points</p>
            </div>
            <div className="card-content">
              <div className="h-[200px]">
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

          {/* Token usage + API health */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Tokens & API Health</h3>
              <p className="card-description text-xs">Daily token consumption and error rate</p>
            </div>
            <div className="card-content space-y-4">
              <div className="flex items-center gap-4">
                <div className="w-[110px] h-[110px] flex-shrink-0">
                  <ResponsiveContainer width="100%" height="100%">
                    <PieChart>
                      <Pie
                        data={tokenData}
                        innerRadius={32}
                        outerRadius={48}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        <Cell fill={C.primary} />
                        <Cell fill={C.success} />
                      </Pie>
                      <Tooltip
                        contentStyle={TOOLTIP_STYLE}
                        formatter={(v: number) => [v.toLocaleString(), '']}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex-1 space-y-2">
                  <LegendItem
                    color={C.primary}
                    label="Used"
                    value={(metrics?.resources?.tokensUsedToday ?? 0).toLocaleString()}
                  />
                  <LegendItem
                    color={C.success}
                    label="Cached"
                    value={(metrics?.resources?.tokensCachedToday ?? 0).toLocaleString()}
                  />
                  {metrics?.resources?.tokensLimitDaily && (
                    <LegendItem
                      color={C.muted}
                      label="Daily Limit"
                      value={metrics.resources.tokensLimitDaily.toLocaleString()}
                    />
                  )}
                </div>
              </div>

              <div className="border-t pt-3 space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">API Calls</span>
                  <div className="flex items-center gap-3">
                    <span>{(metrics?.resources?.apiCallsTotal ?? 0).toLocaleString()} total</span>
                    <span className="text-destructive">
                      {(metrics?.resources?.apiErrorsTotal ?? 0).toLocaleString()} errors
                    </span>
                  </div>
                </div>
                <div className="h-2 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-destructive rounded-full transition-all"
                    style={{ width: `${apiErrorRate}%` }}
                  />
                </div>
                <p className="text-xs text-muted-foreground">
                  Error rate: {apiErrorRate.toFixed(1)}% &nbsp;·&nbsp; Avg latency:{' '}
                  {(metrics?.resources?.apiLatencyAvgMs ?? 0).toFixed(0)} ms
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Disk + Cost */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mt-4">
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm flex items-center gap-2">
                <HardDrive className="w-4 h-4" /> Disk Usage
              </h3>
            </div>
            <div className="card-content space-y-3">
              <div className="flex items-center justify-between text-sm">
                <span className="font-medium">
                  {(metrics?.resources?.diskUsedMb ?? 0).toFixed(0)} MB used
                </span>
                {metrics?.resources?.diskLimitMb ? (
                  <span className="text-muted-foreground">
                    of {metrics.resources.diskLimitMb.toFixed(0)} MB
                  </span>
                ) : (
                  <span className="text-xs text-muted-foreground">No limit set</span>
                )}
              </div>
              {metrics?.resources?.diskLimitMb ? (
                <>
                  <div className="h-3 bg-muted rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all ${
                        diskPercent > 90
                          ? 'bg-destructive'
                          : diskPercent > 70
                            ? 'bg-warning'
                            : 'bg-primary'
                      }`}
                      style={{ width: `${diskPercent}%` }}
                    />
                  </div>
                  <p className="text-xs text-muted-foreground">
                    {diskPercent.toFixed(1)}% utilization
                  </p>
                </>
              ) : (
                <p className="text-xs text-muted-foreground">
                  Configure disk limits in settings to track utilization.
                </p>
              )}
            </div>
          </div>

          {/* Cost card — clicking switches to Costs tab */}
          <div
            className="card cursor-pointer hover:bg-muted/30 transition-colors"
            onClick={onViewCosts}
            title="View cost analytics"
          >
            <div className="card-header">
              <h3 className="card-title text-sm flex items-center gap-2">
                <DollarSign className="w-4 h-4 text-success" /> Cost Breakdown
              </h3>
            </div>
            <div className="card-content">
              <div className="flex items-baseline gap-6">
                <div>
                  <p className="text-2xl font-bold">
                    ${(metrics?.resources?.costUsdToday ?? 0).toFixed(4)}
                  </p>
                  <p className="text-xs text-muted-foreground">Today</p>
                </div>
                <div>
                  <p className="text-xl font-bold">
                    ${(metrics?.resources?.costUsdMonth ?? 0).toFixed(2)}
                  </p>
                  <p className="text-xs text-muted-foreground">This Month</p>
                </div>
              </div>
              <p className="text-xs text-primary mt-2">View cost analytics →</p>
            </div>
          </div>
        </div>
      </section>

      {/* ── Security ──────────────────────────────────────────────── */}
      <section aria-label="Security Metrics">
        <SectionHeader
          title="Security"
          subtitle="Authentication, permissions, threat detection, and audit integrity"
          icon={<Shield className="w-5 h-5" />}
        />

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-4">
          <MiniStatCard
            label="Blocked Requests"
            value={metrics?.security?.blockedRequestsTotal ?? 0}
            valueClass={(metrics?.security?.blockedRequestsTotal ?? 0) > 0 ? 'text-warning' : ''}
          />
          <MiniStatCard
            label="Rate Limit Hits"
            value={metrics?.security?.rateLimitHitsTotal ?? 0}
            valueClass={(metrics?.security?.rateLimitHitsTotal ?? 0) > 0 ? 'text-warning' : ''}
          />
          <MiniStatCard
            label="Injection Attempts"
            value={metrics?.security?.injectionAttemptsTotal ?? 0}
            valueClass={
              (metrics?.security?.injectionAttemptsTotal ?? 0) > 0 ? 'text-destructive' : ''
            }
          />
          <MiniStatCard
            label="Active Sessions"
            value={metrics?.security?.activeSessions ?? 0}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Authentication bar chart */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Authentication</h3>
              <p className="card-description text-xs">Login attempts — success vs failure</p>
            </div>
            <div className="card-content space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-2xl font-bold">
                    {(metrics?.security?.authAttemptsTotal ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Total attempts</p>
                </div>
                <div className="flex items-center gap-4">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-success">
                      {(metrics?.security?.authSuccessTotal ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Success</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold text-destructive">
                      {(metrics?.security?.authFailuresTotal ?? 0).toLocaleString()}
                    </p>
                    <p className="text-xs text-muted-foreground">Failed</p>
                  </div>
                </div>
              </div>
              <div className="h-[110px]">
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

          {/* Events by severity donut */}
          <div className="card">
            <div className="card-header">
              <h3 className="card-title text-sm">Events by Severity</h3>
              <p className="card-description text-xs">Security event distribution</p>
            </div>
            <div className="card-content">
              {severityData.length > 0 ? (
                <div className="flex items-center gap-6">
                  <div className="h-[160px] w-[160px] flex-shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={severityData}
                          innerRadius={46}
                          outerRadius={70}
                          paddingAngle={3}
                          dataKey="value"
                        >
                          {severityData.map((entry, i) => (
                            <Cell key={i} fill={entry.fill} />
                          ))}
                        </Pie>
                        <Tooltip contentStyle={TOOLTIP_STYLE} />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 space-y-2">
                    {severityData.map((item) => (
                      <LegendItem
                        key={item.name}
                        color={item.fill}
                        label={item.name.charAt(0).toUpperCase() + item.name.slice(1)}
                        value={String(item.value)}
                      />
                    ))}
                  </div>
                </div>
              ) : (
                <EmptyChart message="No security events recorded" />
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
                  <p className="text-2xl font-bold">
                    {(metrics?.security?.permissionChecksTotal ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Total checks</p>
                </div>
                <div>
                  <p className="text-2xl font-bold text-warning">
                    {(metrics?.security?.permissionDenialsTotal ?? 0).toLocaleString()}
                  </p>
                  <p className="text-xs text-muted-foreground">Denials</p>
                </div>
              </div>
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs text-muted-foreground">Denial rate</span>
                  <span className="text-xs font-medium">{permDenialRate.toFixed(1)}%</span>
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
                        <span className="text-xs capitalize text-muted-foreground">{item.name}</span>
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
                  className={`p-3 rounded-full ${
                    metrics?.security?.auditChainValid ? 'bg-success/10' : 'bg-destructive/10'
                  }`}
                >
                  {metrics?.security?.auditChainValid ? (
                    <CheckCircle className="w-6 h-6 text-success" />
                  ) : (
                    <XCircle className="w-6 h-6 text-destructive" />
                  )}
                </div>
                <div>
                  <p
                    className={`text-sm font-semibold ${
                      metrics?.security?.auditChainValid ? 'text-success' : 'text-destructive'
                    }`}
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
                  <span className="text-sm text-muted-foreground">Total Audit Entries</span>
                  <span className="text-sm font-bold">
                    {(metrics?.security?.auditEntriesTotal ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Blocked Requests</span>
                  <span
                    className={`text-sm font-bold ${
                      (metrics?.security?.blockedRequestsTotal ?? 0) > 0 ? 'text-warning' : ''
                    }`}
                  >
                    {(metrics?.security?.blockedRequestsTotal ?? 0).toLocaleString()}
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-muted-foreground">Injection Attempts</span>
                  <span
                    className={`text-sm font-bold ${
                      (metrics?.security?.injectionAttemptsTotal ?? 0) > 0
                        ? 'text-destructive'
                        : ''
                    }`}
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
        onClick
          ? ' cursor-pointer hover:bg-muted/20 rounded px-1 -mx-1 transition-colors'
          : ''
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

function LegendItem({
  color,
  label,
  value,
}: {
  color: string;
  label: string;
  value: string;
}) {
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

function CostSummaryCard({ icon, label, value, loading, onReset, resetting }: CostSummaryCardProps) {
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
