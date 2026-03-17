/* eslint-disable react-hooks/purity */
/**
 * HeartbeatsView — self-contained heartbeat monitor view.
 * Used in Security > Automations > Heartbeats.
 * Fetches its own data; filters client-side; renders per-monitor HeartbeatCard components.
 */

import { useState, useEffect, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Heart,
  Loader2,
  Play,
  Pause,
  CheckCircle,
  XCircle,
  AlertTriangle,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  Filter,
  Search,
  Calendar,
  X,
} from 'lucide-react';
import { fetchHeartbeatStatus, fetchHeartbeatLog, fetchPersonalities } from '../api/client';
import type { HeartbeatTask, HeartbeatLogEntry } from '../types';

// ── Status display helpers ────────────────────────────────────────────────────

const HEARTBEAT_STATUS_ICON: Record<'ok' | 'warning' | 'error', React.ReactNode> = {
  ok: <CheckCircle className="w-4 h-4 text-success" />,
  warning: <AlertTriangle className="w-4 h-4 text-warning" />,
  error: <XCircle className="w-4 h-4 text-destructive" />,
};

const HEARTBEAT_STATUS_COLOR: Record<'ok' | 'warning' | 'error', string> = {
  ok: 'text-success',
  warning: 'text-warning',
  error: 'text-destructive',
};

// ── Date preset helpers ───────────────────────────────────────────────────────

const HB_DATE_PRESETS = [
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

// ── HeartbeatsView ────────────────────────────────────────────────────────────

export function HeartbeatsView() {
  const [search, setSearch] = useState('');
  const [enabledFilter, setEnabledFilter] = useState<'all' | 'enabled' | 'disabled'>('all');
  const [typeFilter, setTypeFilter] = useState('');
  const [dateFrom, setDateFrom] = useState('');
  const [dateTo, setDateTo] = useState('');
  const [datePreset, setDatePreset] = useState('');

  const { data: heartbeatData, isLoading: heartbeatLoading } = useQuery({
    queryKey: ['heartbeat-status'],
    queryFn: fetchHeartbeatStatus,
    staleTime: 0,
    refetchOnMount: true,
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 60000,
  });

  // eslint-disable-next-line react-hooks/exhaustive-deps
  const allTasks = heartbeatData?.tasks ?? [];
  const personalityMap = new Map<string, string>(
    (personalitiesData?.personalities ?? []).map((p) => [p.id, p.name])
  );

  // Collect unique types for the type filter dropdown
  const taskTypes = useMemo(
    () => Array.from(new Set(allTasks.map((t) => t.type))).sort(),
    [allTasks]
  );

  const filteredTasks = useMemo(() => {
    let tasks = allTasks;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      tasks = tasks.filter((t) => t.name.toLowerCase().includes(q));
    }
    if (enabledFilter === 'enabled') tasks = tasks.filter((t) => t.enabled);
    if (enabledFilter === 'disabled') tasks = tasks.filter((t) => !t.enabled);
    if (typeFilter) tasks = tasks.filter((t) => t.type === typeFilter);
    if (dateFrom)
      tasks = tasks.filter(
        (t) => t.lastRunAt != null && t.lastRunAt >= new Date(dateFrom).getTime()
      );
    if (dateTo)
      tasks = tasks.filter((t) => t.lastRunAt != null && t.lastRunAt <= new Date(dateTo).getTime());
    return tasks;
  }, [allTasks, search, enabledFilter, typeFilter, dateFrom, dateTo]);

  const hasFilters = search.trim() || enabledFilter !== 'all' || typeFilter || dateFrom || dateTo;

  const handleDatePreset = (preset: (typeof HB_DATE_PRESETS)[number]) => {
    setDateFrom(preset.from());
    setDateTo(preset.to());
    setDatePreset(preset.label);
  };

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    if (field === 'from') setDateFrom(value ? new Date(value).toISOString() : '');
    else setDateTo(value ? new Date(value).toISOString() : '');
    setDatePreset('');
  };

  if (heartbeatLoading) {
    return (
      <div className="card p-12 flex flex-col items-center gap-3 text-muted-foreground">
        <Loader2 className="w-8 h-8 animate-spin" />
        <p className="text-sm">Loading heartbeat monitors…</p>
      </div>
    );
  }

  if (allTasks.length === 0) {
    return (
      <div className="card p-12 text-center">
        <Heart className="w-12 h-12 mx-auto text-muted-foreground mb-3" />
        <p className="font-medium text-sm mb-1">No heartbeat monitors configured</p>
        <p className="text-xs text-muted-foreground">
          Heartbeat tasks are defined in the agent configuration and run on a recurring schedule.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {/* Filter bar */}
      <div className="flex items-center gap-2 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground flex-shrink-0" />

        {/* Text search */}
        <div className="relative">
          <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground pointer-events-none" />
          <input
            type="text"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
            }}
            placeholder="Search monitors…"
            className="pl-8 pr-3 py-1.5 text-sm border rounded-md bg-background w-44"
            aria-label="Search heartbeat monitors"
          />
        </div>

        {/* Enabled/disabled filter */}
        <select
          value={enabledFilter}
          onChange={(e) => {
            setEnabledFilter(e.target.value as 'all' | 'enabled' | 'disabled');
          }}
          className="px-3 py-1.5 text-sm border rounded-md bg-background"
          aria-label="Filter by state"
        >
          <option value="all">All States</option>
          <option value="enabled">Enabled</option>
          <option value="disabled">Disabled</option>
        </select>

        {/* Type filter */}
        {taskTypes.length > 1 && (
          <select
            value={typeFilter}
            onChange={(e) => {
              setTypeFilter(e.target.value);
            }}
            className="px-3 py-1.5 text-sm border rounded-md bg-background"
            aria-label="Filter by type"
          >
            <option value="">All Types</option>
            {taskTypes.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        )}

        {hasFilters && (
          <button
            onClick={() => {
              setSearch('');
              setEnabledFilter('all');
              setTypeFilter('');
              setDateFrom('');
              setDateTo('');
              setDatePreset('');
            }}
            className="text-xs text-muted-foreground hover:text-foreground underline flex items-center gap-0.5"
          >
            <X className="w-3 h-3" /> Clear
          </button>
        )}

        <span className="ml-auto text-xs text-muted-foreground">
          {filteredTasks.length === allTasks.length
            ? `${allTasks.length} monitor${allTasks.length !== 1 ? 's' : ''}`
            : `${filteredTasks.length} of ${allTasks.length}`}
        </span>
      </div>

      {/* Date Range Filter — filters by last run time */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {HB_DATE_PRESETS.map((preset) => (
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

      {filteredTasks.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-sm text-muted-foreground">No monitors match the current filters.</p>
        </div>
      ) : (
        <div className="card divide-y divide-border overflow-hidden">
          {filteredTasks.map((task) => (
            <HeartbeatCard key={task.name} task={task} globalPersonalityMap={personalityMap} />
          ))}
        </div>
      )}
    </div>
  );
}

// ── HeartbeatCard ─────────────────────────────────────────────────────────────

function HeartbeatCard({
  task,
  globalPersonalityMap,
}: {
  task: HeartbeatTask;
  globalPersonalityMap: Map<string, string>;
}) {
  const [expanded, setExpanded] = useState(false);
  const [logPage, setLogPage] = useState(0);
  const logPageSize = 10;

  const { data: latestData } = useQuery({
    queryKey: ['heartbeat-log-latest', task.name],
    queryFn: () => fetchHeartbeatLog({ checkName: task.name, limit: 20 }),
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const { data: logData, isLoading: logLoading } = useQuery({
    queryKey: ['heartbeat-log', task.name, logPage],
    queryFn: () =>
      fetchHeartbeatLog({
        checkName: task.name,
        limit: logPageSize,
        offset: logPage * logPageSize,
      }),
    enabled: expanded,
    staleTime: 30_000,
    refetchInterval: expanded ? 30_000 : false,
  });

  useEffect(() => {
    if (!expanded) setLogPage(0);
  }, [expanded]);

  const formatTime = (ts: number | null) => {
    if (!ts) return 'Never';
    const d = new Date(ts);
    const diff = Date.now() - d.getTime();
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    return d.toLocaleDateString();
  };

  const fmt = (ms: number) => {
    if (ms < 60000) return `${Math.floor(ms / 1000)}s`;
    if (ms < 3600000) return `${Math.floor(ms / 60000)}m`;
    return `${Math.floor(ms / 3600000)}h`;
  };

  const fmtDuration = (ms: number) => (ms < 1000 ? `${ms}ms` : `${(ms / 1000).toFixed(1)}s`);

  const personalities: { id: string; name: string }[] =
    task.personalities && task.personalities.length > 0
      ? task.personalities
      : task.personalityName
        ? [{ id: task.personalityId ?? '', name: task.personalityName }]
        : [];

  const personalityMap = new Map([
    ...globalPersonalityMap,
    ...personalities.map((p): [string, string] => [p.id, p.name]),
  ]);

  const latestByPersonality = new Map<string, HeartbeatLogEntry>();
  for (const entry of latestData?.entries ?? []) {
    const pid = entry.personalityId ?? '';
    if (!latestByPersonality.has(pid)) {
      latestByPersonality.set(pid, entry);
    }
  }
  const globalLastEntry: HeartbeatLogEntry | null = latestData?.entries[0] ?? null;

  // system_health cards have no left-border highlight
  const borderClass =
    task.type === 'system_health'
      ? ''
      : task.enabled
        ? 'border-l-4 border-l-success'
        : 'border-l-4 border-l-muted-foreground/30';

  return (
    <div className={borderClass}>
      {/* Header row */}
      <div className="p-4 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3 min-w-0">
          {task.enabled ? (
            <Play className="w-4 h-4 text-success flex-shrink-0 mt-0.5" />
          ) : (
            <Pause className="w-4 h-4 text-muted-foreground flex-shrink-0 mt-0.5" />
          )}
          <div className="min-w-0">
            <p className="font-medium text-sm">{task.name}</p>
            <div className="flex items-center gap-2 mt-0.5 flex-wrap">
              <span className="badge text-xs">{task.type}</span>
              {task.intervalMs && (
                <span className="text-xs text-muted-foreground">every {fmt(task.intervalMs)}</span>
              )}
              <span className="text-xs text-muted-foreground">
                {task.lastRunAt ? `last run ${formatTime(task.lastRunAt)}` : 'never run'}
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-start gap-2 shrink-0">
          {personalities.length > 0 ? (
            <div className="flex flex-col items-end gap-1">
              {personalities.map((p) => {
                const entry = latestByPersonality.get(p.id);
                return (
                  <div key={p.id} className="flex items-center gap-1.5">
                    <span className="text-xs text-muted-foreground">{p.name}</span>
                    {entry ? (
                      <>
                        {HEARTBEAT_STATUS_ICON[entry.status]}
                        <span className={`text-xs ${HEARTBEAT_STATUS_COLOR[entry.status]}`}>
                          {entry.status}
                        </span>
                      </>
                    ) : (
                      <>
                        {task.enabled ? (
                          <CheckCircle className="w-4 h-4 text-success" />
                        ) : (
                          <XCircle className="w-4 h-4 text-muted-foreground" />
                        )}
                        <span
                          className={`text-xs ${task.enabled ? 'text-success' : 'text-muted-foreground'}`}
                        >
                          {task.enabled ? 'Active' : 'Disabled'}
                        </span>
                      </>
                    )}
                  </div>
                );
              })}
            </div>
          ) : globalLastEntry ? (
            <div className="flex items-center gap-1.5">
              {HEARTBEAT_STATUS_ICON[globalLastEntry.status]}
              <span className={`text-xs ${HEARTBEAT_STATUS_COLOR[globalLastEntry.status]}`}>
                {globalLastEntry.status}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-1.5">
              {task.enabled ? (
                <CheckCircle className="w-4 h-4 text-success" />
              ) : (
                <XCircle className="w-4 h-4 text-muted-foreground" />
              )}
              <span
                className={`text-xs ${task.enabled ? 'text-success' : 'text-muted-foreground'}`}
              >
                {task.enabled ? 'Active' : 'Disabled'}
              </span>
            </div>
          )}
          <button
            onClick={() => {
              setExpanded((e) => !e);
            }}
            className="btn-ghost p-1 rounded"
            title="Toggle execution history"
          >
            {expanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Execution history — expanded */}
      {expanded && (
        <div className="px-4 pb-4 border-t border-border">
          <div className="flex items-center justify-between pt-3 mb-2">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
              Execution Log
              {logData && logData.total > 0 && (
                <span className="ml-1 normal-case font-normal">({logData.total} total)</span>
              )}
            </p>
          </div>
          {logLoading ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground py-2">
              <Loader2 className="w-3 h-3 animate-spin" /> Loading…
            </div>
          ) : !logData?.entries.length ? (
            <p className="text-xs text-muted-foreground py-1">No executions recorded yet.</p>
          ) : (
            <>
              <table className="w-full text-xs">
                <thead>
                  <tr className="text-muted-foreground">
                    <th className="text-left pb-1 pr-4 font-normal">Status</th>
                    <th className="text-left pb-1 pr-4 font-normal">Agent</th>
                    <th className="text-left pb-1 pr-4 font-normal hidden sm:table-cell">Ran at</th>
                    <th className="text-left pb-1 pr-4 font-normal hidden lg:table-cell">
                      Duration
                    </th>
                    <th className="text-left pb-1 font-normal">Message</th>
                  </tr>
                </thead>
                <tbody>
                  {logData.entries.map((entry) => {
                    const agentName = entry.personalityId
                      ? (personalityMap.get(entry.personalityId) ?? entry.personalityId)
                      : null;
                    return (
                      <tr key={entry.id} className="border-t border-border/30">
                        <td className="py-1 pr-4">
                          <div className="flex items-center gap-1">
                            {HEARTBEAT_STATUS_ICON[entry.status]}
                            <span className={HEARTBEAT_STATUS_COLOR[entry.status]}>
                              {entry.status}
                            </span>
                          </div>
                        </td>
                        <td className="py-1 pr-4">
                          {agentName ? (
                            <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded whitespace-nowrap">
                              {agentName}
                            </span>
                          ) : (
                            <span className="text-muted-foreground/50">system</span>
                          )}
                        </td>
                        <td className="py-1 pr-4 text-muted-foreground hidden sm:table-cell">
                          {formatTime(entry.ranAt)}
                        </td>
                        <td className="py-1 pr-4 font-mono text-muted-foreground hidden lg:table-cell">
                          {fmtDuration(entry.durationMs)}
                        </td>
                        <td className="py-1 text-muted-foreground max-w-xs truncate">
                          {entry.message}
                          {entry.errorDetail && (
                            <span className="text-destructive ml-1">
                              ({entry.errorDetail.split('\n')[0]})
                            </span>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              {logData.total > logPageSize && (
                <div className="flex items-center justify-between pt-3 border-t border-border/30 mt-1">
                  <p className="text-xs text-muted-foreground">
                    {logPage * logPageSize + 1}–
                    {Math.min((logPage + 1) * logPageSize, logData.total)} of {logData.total}
                  </p>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => {
                        setLogPage((p) => Math.max(0, p - 1));
                      }}
                      disabled={logPage === 0}
                      className="btn-ghost p-1 disabled:opacity-40"
                      aria-label="Previous page"
                    >
                      <ChevronLeft className="w-3.5 h-3.5" />
                    </button>
                    <span className="text-xs text-muted-foreground px-1">
                      {logPage + 1} / {Math.ceil(logData.total / logPageSize)}
                    </span>
                    <button
                      onClick={() => {
                        setLogPage((p) =>
                          Math.min(Math.ceil(logData.total / logPageSize) - 1, p + 1)
                        );
                      }}
                      disabled={logPage >= Math.ceil(logData.total / logPageSize) - 1}
                      className="btn-ghost p-1 disabled:opacity-40"
                      aria-label="Next page"
                    >
                      <ChevronRight className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
