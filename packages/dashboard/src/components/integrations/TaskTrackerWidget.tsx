/**
 * Task Tracker Widget — Dashboard card showing task counts, ritual/habit streaks,
 * and recent activity. Currently backed by the Photisnadi integration proxy;
 * designed to aggregate tasks from third-party trackers (Trello, Jira, Linear,
 * Todoist, Asana) via adapter interface in a future release.
 */

import { useQuery } from '@tanstack/react-query';
import { fetchPhotisnadiWidget, fetchPhotisnadiHealth } from '../../api/client.js';

// ── Types ─────────────────────────────────────────────────────────────

interface TaskSummary {
  total: number;
  statusCounts: Record<string, number>;
  priorityCounts: Record<string, number>;
  overdue: number;
  completedThisWeek: number;
}

interface RitualSummary {
  total: number;
  byCounts: Record<string, number>;
}

interface RecentItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  modifiedAt: string;
}

interface PhotisnadiWidgetData {
  tasks: TaskSummary;
  rituals: RitualSummary;
  recentActivity: RecentItem[];
}

// ── Helpers ───────────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  todo: 'bg-slate-400',
  inProgress: 'bg-blue-500',
  inReview: 'bg-amber-500',
  blocked: 'bg-red-500',
  done: 'bg-emerald-500',
};

const STATUS_LABELS: Record<string, string> = {
  todo: 'To Do',
  inProgress: 'In Progress',
  inReview: 'In Review',
  blocked: 'Blocked',
  done: 'Done',
};

const PRIORITY_COLORS: Record<string, string> = {
  high: 'text-red-600 bg-red-100',
  medium: 'text-amber-600 bg-amber-100',
  low: 'text-slate-600 bg-slate-100',
};

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  return `${days}d ago`;
}

// ── Component ─────────────────────────────────────────────────────────

export function TaskTrackerWidget() {
  const { data, isLoading, isError, error } = useQuery<PhotisnadiWidgetData>({
    queryKey: ['photisnadi-widget'],
    queryFn: fetchPhotisnadiWidget,
    staleTime: 60_000,
    retry: 1,
  });

  const { data: health } = useQuery<{ ok: boolean }>({
    queryKey: ['photisnadi-health'],
    queryFn: fetchPhotisnadiHealth,
    staleTime: 60_000,
    retry: 1,
  });

  const isHealthy = health?.ok === true;

  return (
    <div
      className="rounded-lg border bg-card p-4 shadow-sm flex flex-col gap-3"
      data-testid="task-tracker-widget"
    >
      {/* Header */}
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Tasks</h3>
        <span
          className={`inline-block w-2 h-2 rounded-full ${isHealthy ? 'bg-emerald-500' : 'bg-red-500'}`}
          title={isHealthy ? 'Connected' : 'Disconnected'}
        />
      </div>

      {/* Loading state */}
      {isLoading && (
        <div className="text-xs text-muted-foreground animate-pulse py-4 text-center">
          Loading...
        </div>
      )}

      {/* Error state */}
      {isError && !isLoading && (
        <div className="text-xs text-red-500 py-2">
          {(error as Error)?.message ?? 'Failed to load Photisnadi data'}
        </div>
      )}

      {/* Data */}
      {data && !isLoading && (
        <>
          {/* Task summary */}
          <div className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Tasks</span>
              <span className="font-mono font-medium">{data.tasks.total}</span>
            </div>

            {/* Status bar */}
            <div className="flex h-2 rounded-full overflow-hidden bg-muted">
              {Object.entries(data.tasks.statusCounts).map(([status, count]) =>
                count > 0 ? (
                  <div
                    key={status}
                    className={`${STATUS_COLORS[status] ?? 'bg-gray-400'}`}
                    style={{ width: `${(count / Math.max(data.tasks.total, 1)) * 100}%` }}
                    title={`${STATUS_LABELS[status] ?? status}: ${count}`}
                  />
                ) : null
              )}
            </div>

            {/* Status pills */}
            <div className="flex flex-wrap gap-1">
              {Object.entries(data.tasks.statusCounts).map(([status, count]) =>
                count > 0 ? (
                  <span
                    key={status}
                    className="inline-flex items-center gap-1 text-[10px] text-muted-foreground"
                  >
                    <span
                      className={`w-1.5 h-1.5 rounded-full ${STATUS_COLORS[status] ?? 'bg-gray-400'}`}
                    />
                    {count}
                  </span>
                ) : null
              )}
            </div>

            {/* Overdue + completed this week */}
            <div className="flex items-center gap-3 text-[11px]">
              {data.tasks.overdue > 0 && (
                <span className="text-red-500 font-medium">{data.tasks.overdue} overdue</span>
              )}
              <span className="text-emerald-600">
                {data.tasks.completedThisWeek} done this week
              </span>
            </div>
          </div>

          {/* Ritual summary */}
          <div className="space-y-1">
            <div className="flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Rituals</span>
              <span className="font-mono font-medium">{data.rituals.total}</span>
            </div>
            <div className="flex gap-2 text-[11px] text-muted-foreground">
              {Object.entries(data.rituals.byCounts).map(([freq, count]) =>
                count > 0 ? (
                  <span key={freq}>
                    {count} {freq}
                  </span>
                ) : null
              )}
            </div>
          </div>

          {/* Recent activity */}
          {data.recentActivity.length > 0 && (
            <div className="space-y-1">
              <span className="text-[10px] text-muted-foreground uppercase tracking-wider">
                Recent
              </span>
              <ul className="space-y-1">
                {data.recentActivity.map((item) => (
                  <li key={item.id} className="flex items-center gap-1.5 text-[11px]">
                    <span
                      className={`w-1.5 h-1.5 rounded-full flex-shrink-0 ${STATUS_COLORS[item.status] ?? 'bg-gray-400'}`}
                    />
                    <span className="truncate flex-1" title={item.title}>
                      {item.title}
                    </span>
                    {item.priority && (
                      <span
                        className={`px-1 rounded text-[9px] font-medium ${PRIORITY_COLORS[item.priority] ?? ''}`}
                      >
                        {item.priority}
                      </span>
                    )}
                    <span className="text-muted-foreground flex-shrink-0">
                      {timeAgo(item.modifiedAt)}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </>
      )}
    </div>
  );
}
