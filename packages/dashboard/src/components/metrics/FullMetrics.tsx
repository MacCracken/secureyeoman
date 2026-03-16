/**
 * FullMetricsTab — deep-dive charts covering tasks, resources, and security.
 */

import {
  AreaChart,
  Area,
  BarChart,
  Bar,
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
  CheckCircle,
  XCircle,
  AlertTriangle,
} from 'lucide-react';
import type { MetricsSnapshot } from '../../types';
import type { useNavigate } from 'react-router-dom';
import { C, TOOLTIP_STYLE, MAX_HISTORY, fmtMs, safePct, EmptyChart } from './shared';
import type { HistoryPoint } from './shared';

// ── FullMetricsTab ────────────────────────────────────────────────────

export interface FullMetricsTabProps {
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

export function FullMetricsTab({ metrics, history }: FullMetricsTabProps) {
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
