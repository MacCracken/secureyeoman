import { useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Layers,
  Filter,
  Download,
  ChevronLeft,
  ChevronRight,
  Loader2,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Clock,
  Bot,
  Calendar,
  GitMerge,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  fetchTasks,
  fetchWorkflows,
  fetchWorkflowRuns,
  fetchPersonalities,
} from '../../api/client';
import type { WorkflowDefinition, WorkflowRun } from '../../api/client';
import { HeartbeatsView } from '../HeartbeatsView';
import type { Task } from '../../types';

const TASK_STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-3.5 h-3.5 text-success" />,
  failed: <XCircle className="w-3.5 h-3.5 text-destructive" />,
  timeout: <AlertTriangle className="w-3.5 h-3.5 text-warning" />,
  running: <Loader2 className="w-3.5 h-3.5 text-info animate-spin" />,
  pending: <Clock className="w-3.5 h-3.5 text-muted-foreground" />,
  cancelled: <XCircle className="w-3.5 h-3.5 text-muted-foreground" />,
};

const TASK_STATUS_COLORS: Record<string, string> = {
  completed: 'badge-success',
  failed: 'badge-error',
  timeout: 'badge-warning',
  running: 'badge-info',
  pending: 'badge',
  cancelled: 'badge',
};

const WF_RUN_STATUS_COLORS: Record<string, string> = {
  completed: 'badge-success',
  failed: 'badge-error',
  running: 'badge-info',
  pending: 'badge',
  cancelled: 'badge',
};

type AutomationsSubview = 'tasks' | 'workflows' | 'heartbeats';

const TASK_TYPE_OPTIONS = ['execute', 'query', 'file', 'network', 'system'] as const;

const SEC_DATE_PRESETS = [
  {
    label: 'Last hour',
    from: () => new Date(Date.now() - 3_600_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  {
    label: 'Last 24h',
    from: () => new Date(Date.now() - 86_400_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  {
    label: 'Last 7 days',
    from: () => new Date(Date.now() - 604_800_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  { label: 'All time', from: () => '', to: () => '' },
] as const;

const WF_DATE_PRESETS = [
  {
    label: 'Last hour',
    from: () => new Date(Date.now() - 3_600_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  {
    label: 'Last 24h',
    from: () => new Date(Date.now() - 86_400_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  {
    label: 'Last 7 days',
    from: () => new Date(Date.now() - 604_800_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  { label: 'All time', from: () => '', to: () => '' },
] as const;

function AutomationsTasksView() {
  const [statusFilter, setStatusFilter] = useState('');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('');
  const [page, setPage] = useState(0);
  const PAGE_SIZE = 10;

  const { data, isLoading } = useQuery({
    queryKey: ['security-automations-tasks', statusFilter, typeFilter, dateFrom, dateTo, page],
    queryFn: () =>
      fetchTasks({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: PAGE_SIZE,
        offset: page * PAGE_SIZE,
      }),
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 60_000,
  });
  const personalityMap = new Map<string, string>(
    (personalitiesData?.personalities ?? []).map((p) => [p.id, p.name])
  );

  const tasks = data?.tasks ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const fmtDuration = (ms?: number | null) => {
    if (ms == null) return '—';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${Math.floor(ms / 60000)}m ${Math.floor((ms % 60000) / 1000)}s`;
  };

  const fmtRelative = (ts: number) => {
    const diff = Date.now() - ts;
    if (diff < 60_000) return 'Just now';
    if (diff < 3_600_000) return `${Math.floor(diff / 60_000)}m ago`;
    if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)}h ago`;
    return new Date(ts).toLocaleDateString();
  };

  const hasFilters = statusFilter || typeFilter || dateFrom || dateTo;

  const handleDatePreset = (preset: (typeof SEC_DATE_PRESETS)[number]) => {
    setDateFrom(preset.from());
    setDateTo(preset.to());
    setDatePreset(preset.label);
    setPage(0);
  };

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    if (field === 'from') setDateFrom(value ? new Date(value).toISOString() : '');
    else setDateTo(value ? new Date(value).toISOString() : '');
    setDatePreset('');
    setPage(0);
  };

  const exportTasks = useCallback(
    async (format: 'csv' | 'json') => {
      const allData = await fetchTasks({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: 10000,
        offset: 0,
      });
      let content: string;
      let mimeType: string;
      let ext: string;
      if (format === 'json') {
        content = JSON.stringify(allData.tasks, null, 2);
        mimeType = 'application/json';
        ext = 'json';
      } else {
        const headers = [
          'ID',
          'Agent',
          'Name',
          'Sub-Agent',
          'Type',
          'Status',
          'Duration (ms)',
          'Created At',
        ];
        const rows = allData.tasks.map((t: Task) => [
          t.id,
          t.securityContext?.personalityName ?? '',
          `"${t.name.replace(/"/g, '""')}"`,
          t.parentTaskId ?? '',
          t.type,
          t.status,
          t.durationMs?.toString() ?? '',
          new Date(t.createdAt).toISOString(),
        ]);
        content = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
        mimeType = 'text/csv';
        ext = 'csv';
      }
      const blob = new Blob([content], { type: mimeType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `tasks-export-${new Date().toISOString().slice(0, 10)}.${ext}`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    },
    [statusFilter, typeFilter, dateFrom, dateTo]
  );

  return (
    <div className="space-y-3">
      {/* Filters */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        <select
          value={statusFilter}
          onChange={(e) => {
            setStatusFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-1.5 text-sm border rounded-md bg-background"
          aria-label="Filter by status"
        >
          <option value="">All Status</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="timeout">Timeout</option>
          <option value="running">Running</option>
          <option value="pending">Pending</option>
          <option value="cancelled">Cancelled</option>
        </select>
        <select
          value={typeFilter}
          onChange={(e) => {
            setTypeFilter(e.target.value);
            setPage(0);
          }}
          className="px-3 py-1.5 text-sm border rounded-md bg-background"
          aria-label="Filter by type"
        >
          <option value="">All Types</option>
          {TASK_TYPE_OPTIONS.map((t) => (
            <option key={t} value={t}>
              {t}
            </option>
          ))}
        </select>
        {hasFilters && (
          <button
            onClick={() => {
              setStatusFilter('');
              setTypeFilter('');
              setDateFrom('');
              setDateTo('');
              setDatePreset('');
              setPage(0);
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-xs text-muted-foreground">
            {total} task{total !== 1 ? 's' : ''}
          </span>
          <button
            onClick={() => void exportTasks('csv')}
            className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
            aria-label="Export CSV"
          >
            <Download className="w-3 h-3" /> CSV
          </button>
          <button
            onClick={() => void exportTasks('json')}
            className="btn-ghost px-2 py-1 text-xs flex items-center gap-1"
            aria-label="Export JSON"
          >
            <Download className="w-3 h-3" /> JSON
          </button>
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {SEC_DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              handleDatePreset(preset);
            }}
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
              datePreset === preset.label
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <span className="text-muted-foreground text-xs">or</span>
        <input
          type="date"
          value={dateFrom ? dateFrom.slice(0, 10) : ''}
          onChange={(e) => {
            handleCustomDate('from', e.target.value);
          }}
          className="px-2 py-1 text-xs border rounded-md bg-background"
          aria-label="From date"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="date"
          value={dateTo ? dateTo.slice(0, 10) : ''}
          onChange={(e) => {
            handleCustomDate('to', e.target.value);
          }}
          className="px-2 py-1 text-xs border rounded-md bg-background"
          aria-label="To date"
        />
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : tasks.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No tasks found</p>
      ) : (
        <div className="card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="px-2 py-2 text-left font-medium text-xs hidden md:table-cell">
                    Agent
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-xs hidden sm:table-cell">
                    ID
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-xs">Name</th>
                  <th className="px-2 py-2 text-left font-medium text-xs hidden lg:table-cell">
                    Sub-Agent
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-xs hidden md:table-cell">
                    Type
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-xs">Status</th>
                  <th className="px-2 py-2 text-left font-medium text-xs hidden lg:table-cell">
                    Duration
                  </th>
                  <th className="px-2 py-2 text-left font-medium text-xs hidden sm:table-cell">
                    Created
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {tasks.map((task: Task) => {
                  const pId = task.securityContext?.personalityId;
                  const agentName =
                    task.securityContext?.personalityName ??
                    (pId ? (personalityMap.get(pId) ?? null) : null);
                  return (
                    <tr key={task.id} className="hover:bg-muted/30 transition-colors">
                      <td className="px-2 py-2.5 hidden md:table-cell">
                        {agentName ? (
                          <span className="flex items-center gap-1 px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs whitespace-nowrap">
                            <Bot className="w-3 h-3" />
                            {agentName}
                          </span>
                        ) : (
                          <span className="text-xs text-muted-foreground/50">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground hidden sm:table-cell">
                        {task.id.slice(0, 8)}…
                      </td>
                      <td className="px-2 py-2.5">
                        <div
                          className="font-medium text-sm truncate max-w-[140px] sm:max-w-xs"
                          title={task.name}
                        >
                          {task.name}
                        </div>
                        {task.description && (
                          <div className="text-xs text-muted-foreground truncate max-w-[140px] sm:max-w-xs">
                            {task.description}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 text-xs hidden lg:table-cell">
                        {task.parentTaskId ? (
                          <span
                            className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono text-xs"
                            title={task.parentTaskId}
                          >
                            ↳ {task.parentTaskId.slice(0, 8)}…
                          </span>
                        ) : (
                          <span className="text-muted-foreground/40">—</span>
                        )}
                      </td>
                      <td className="px-2 py-2.5 hidden md:table-cell">
                        <span className="badge badge-sm text-xs capitalize">
                          {task.type ?? '—'}
                        </span>
                      </td>
                      <td className="px-2 py-2.5">
                        <div className="flex items-center gap-1.5">
                          {TASK_STATUS_ICONS[task.status]}
                          <span
                            className={`badge badge-sm text-xs ${TASK_STATUS_COLORS[task.status] ?? 'badge'}`}
                          >
                            {task.status}
                          </span>
                        </div>
                        {task.result?.success === false && task.result.error?.message && (
                          <div
                            className="text-xs text-destructive truncate max-w-[180px] mt-0.5"
                            title={task.result.error.message}
                          >
                            {task.result.error.message}
                          </div>
                        )}
                      </td>
                      <td className="px-2 py-2.5 font-mono text-xs text-muted-foreground hidden lg:table-cell">
                        {fmtDuration(task.durationMs)}
                      </td>
                      <td className="px-2 py-2.5 text-xs text-muted-foreground hidden sm:table-cell whitespace-nowrap">
                        {fmtRelative(task.createdAt)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {totalPages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/30">
              <p className="text-xs text-muted-foreground">
                {page * PAGE_SIZE + 1}–{Math.min((page + 1) * PAGE_SIZE, total)} of {total}
              </p>
              <div className="flex items-center gap-1">
                <button
                  disabled={page === 0}
                  onClick={() => {
                    setPage((p) => p - 1);
                  }}
                  className="btn-ghost p-1.5 disabled:opacity-40"
                  aria-label="Previous page"
                >
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <span className="text-xs text-muted-foreground px-1">
                  {page + 1} / {totalPages}
                </span>
                <button
                  disabled={page >= totalPages - 1}
                  onClick={() => {
                    setPage((p) => p + 1);
                  }}
                  className="btn-ghost p-1.5 disabled:opacity-40"
                  aria-label="Next page"
                >
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function AutomationsWorkflowsView() {
  const [expanded, setExpanded] = useState<string | null>(null);
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['security-automations-workflows'],
    queryFn: () => fetchWorkflows({ limit: 50 }),
  });

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['security-automations-runs', expanded],
    queryFn: () =>
      expanded
        ? fetchWorkflowRuns(expanded, { limit: 5 })
        : Promise.resolve({ runs: [], total: 0 }),
    enabled: !!expanded,
  });

  const allDefinitions = data?.definitions ?? [];
  const definitions = allDefinitions.filter((wf: WorkflowDefinition) => {
    if (dateFrom && wf.createdAt < new Date(dateFrom).getTime()) return false;
    if (dateTo && wf.createdAt > new Date(dateTo).getTime()) return false;
    return true;
  });

  const hasDateFilters = dateFrom || dateTo;

  const handleDatePreset = (preset: (typeof WF_DATE_PRESETS)[number]) => {
    setDateFrom(preset.from());
    setDateTo(preset.to());
    setDatePreset(preset.label);
  };

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    if (field === 'from') setDateFrom(value ? new Date(value).toISOString() : '');
    else setDateTo(value ? new Date(value).toISOString() : '');
    setDatePreset('');
  };

  return (
    <div className="space-y-3">
      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {WF_DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              handleDatePreset(preset);
            }}
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
              datePreset === preset.label
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <span className="text-muted-foreground text-xs">or</span>
        <input
          type="date"
          value={dateFrom ? dateFrom.slice(0, 10) : ''}
          onChange={(e) => {
            handleCustomDate('from', e.target.value);
          }}
          className="px-2 py-1 text-xs border rounded-md bg-background"
          aria-label="From date"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="date"
          value={dateTo ? dateTo.slice(0, 10) : ''}
          onChange={(e) => {
            handleCustomDate('to', e.target.value);
          }}
          className="px-2 py-1 text-xs border rounded-md bg-background"
          aria-label="To date"
        />
        {hasDateFilters && (
          <button
            onClick={() => {
              setDateFrom('');
              setDateTo('');
              setDatePreset('');
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline"
          >
            Clear
          </button>
        )}
        <span className="ml-auto text-xs text-muted-foreground">
          {definitions.length === allDefinitions.length
            ? `${allDefinitions.length} workflow${allDefinitions.length !== 1 ? 's' : ''}`
            : `${definitions.length} of ${allDefinitions.length}`}
        </span>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : definitions.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-8">No workflows found</p>
      ) : (
        <div className="space-y-2">
          {definitions.map((wf: WorkflowDefinition) => (
            <div key={wf.id} className="rounded-lg border border-border overflow-hidden">
              <button
                onClick={() => {
                  setExpanded(expanded === wf.id ? null : wf.id);
                }}
                className="w-full flex items-center gap-3 px-4 py-3 hover:bg-muted/30 transition-colors text-left"
              >
                <GitMerge className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-medium truncate">{wf.name}</p>
                  <p className="text-xs text-muted-foreground">
                    {wf.steps?.length ?? 0} step{(wf.steps?.length ?? 0) !== 1 ? 's' : ''}
                    {wf.autonomyLevel ? ` · ${wf.autonomyLevel}` : ''}
                  </p>
                </div>
                <span
                  className={`badge badge-sm text-xs ${wf.isEnabled ? 'badge-success' : 'badge'}`}
                >
                  {wf.isEnabled ? 'Enabled' : 'Disabled'}
                </span>
                {expanded === wf.id ? (
                  <ChevronUp className="w-4 h-4 text-muted-foreground" />
                ) : (
                  <ChevronDown className="w-4 h-4 text-muted-foreground" />
                )}
              </button>

              {expanded === wf.id && (
                <div className="border-t border-border bg-muted/10 divide-y divide-border/40">
                  {/* Steps */}
                  {(wf.steps?.length ?? 0) > 0 && (
                    <div className="px-4 py-3">
                      <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                        <GitMerge className="w-3.5 h-3.5" />
                        Steps ({wf.steps.length})
                      </p>
                      <div className="space-y-1">
                        {wf.steps.map((step, idx) => (
                          <div key={step.id} className="flex items-center gap-2 text-xs py-0.5">
                            <span className="text-muted-foreground/60 w-4 text-right flex-shrink-0 font-mono">
                              {idx + 1}.
                            </span>
                            <span className="font-medium truncate flex-1" title={step.name}>
                              {step.name}
                            </span>
                            <span className="badge badge-sm text-xs flex-shrink-0">
                              {step.type}
                            </span>
                            {step.onError !== 'fail' && (
                              <span className="text-muted-foreground/60 text-xs flex-shrink-0">
                                on error: {step.onError}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {/* Recent runs */}
                  <div className="px-4 py-3">
                    <p className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      Recent runs (last 5)
                    </p>
                    {runsLoading ? (
                      <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
                    ) : (runsData?.runs ?? []).length === 0 ? (
                      <p className="text-xs text-muted-foreground">No runs recorded</p>
                    ) : (
                      <div className="space-y-1">
                        {(runsData?.runs ?? []).map((run: WorkflowRun) => (
                          <div
                            key={run.id}
                            className="flex items-center gap-3 text-xs py-1.5 border-b border-border/30 last:border-0"
                          >
                            <span
                              className={`badge badge-sm ${WF_RUN_STATUS_COLORS[run.status] ?? 'badge'}`}
                            >
                              {run.status}
                            </span>
                            <span className="text-muted-foreground whitespace-nowrap">
                              {new Date(run.createdAt).toLocaleString()}
                            </span>
                            <span className="text-muted-foreground truncate flex-1">
                              by {run.triggeredBy}
                            </span>
                            {run.error && (
                              <span
                                className="text-destructive truncate max-w-[140px]"
                                title={run.error}
                              >
                                {run.error}
                              </span>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function AutomationsSecurityTab() {
  const [subview, setSubview] = useState<AutomationsSubview>('heartbeats');

  const SUBVIEW_LABELS: Record<AutomationsSubview, string> = {
    heartbeats: 'Heartbeats',
    tasks: 'Tasks',
    workflows: 'Workflows',
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4" />
            Automations
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Security audit of heartbeat monitors, task executions, and workflow runs
          </p>
        </div>
        <div
          className="flex items-center gap-1 bg-muted/50 border rounded-lg p-1 self-start sm:self-auto"
          role="tablist"
          aria-label="Automations views"
        >
          {(['heartbeats', 'tasks', 'workflows'] as AutomationsSubview[]).map((v) => (
            <button
              key={v}
              role="tab"
              aria-selected={subview === v}
              onClick={() => {
                setSubview(v);
              }}
              className={`px-3 py-1.5 rounded-md text-sm font-medium transition-all ${
                subview === v
                  ? 'bg-card shadow-sm text-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              {SUBVIEW_LABELS[v]}
            </button>
          ))}
        </div>
      </div>

      {subview === 'heartbeats' && <HeartbeatsView />}
      {subview === 'tasks' && <AutomationsTasksView />}
      {subview === 'workflows' && <AutomationsWorkflowsView />}
    </div>
  );
}
