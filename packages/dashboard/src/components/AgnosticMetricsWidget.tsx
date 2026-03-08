/**
 * AgnosticMetricsWidget — Compact dashboard card showing AGNOSTIC QA platform metrics.
 *
 * Fetches from the AGNOSTIC widget endpoint (/api/dashboard/widget) proxied through
 * SecureYeoman's API. Shows task counts, agent status, and recent activity.
 *
 * Phase B — AGNOSTIC as SecureYeoman Plugin
 */

import { useQuery } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

interface AgnosticWidgetData {
  status: 'healthy' | 'degraded' | 'offline';
  tasks: {
    pending: number;
    running: number;
    completed: number;
    failed: number;
  };
  agents: {
    total: number;
    active: number;
  };
  recentTasks: {
    id: string;
    title: string;
    status: string;
    createdAt: string;
  }[];
}

async function fetchWidget(): Promise<AgnosticWidgetData> {
  const token = getAccessToken();
  const res = await fetch('/api/v1/integrations/agnostic/widget', {
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    healthy: 'bg-green-500/20 text-green-400',
    degraded: 'bg-yellow-500/20 text-yellow-400',
    offline: 'bg-red-500/20 text-red-400',
  };
  return (
    <span
      className={`rounded-full px-2 py-0.5 text-xs font-medium ${colors[status] ?? 'bg-zinc-600 text-zinc-300'}`}
    >
      {status}
    </span>
  );
}

function TaskBar({ label, count, color }: { label: string; count: number; color: string }) {
  return (
    <div className="flex items-center justify-between text-xs">
      <span className="text-zinc-400">{label}</span>
      <span className={`font-mono font-medium ${color}`}>{count}</span>
    </div>
  );
}

export default function AgnosticMetricsWidget() {
  const { data, isLoading, error } = useQuery<AgnosticWidgetData>({
    queryKey: ['agnostic-widget'],
    queryFn: fetchWidget,
    refetchInterval: 30_000,
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Loading AGNOSTIC metrics...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-sm">
        <div className="flex items-center justify-between">
          <h3 className="text-base font-semibold text-zinc-200">AGNOSTIC QA</h3>
          <StatusBadge status="offline" />
        </div>
        <p className="mt-2 text-xs text-zinc-500">Unable to connect to AGNOSTIC platform</p>
      </div>
    );
  }

  if (!data) {
    return <div className="p-4 text-sm text-zinc-500">No data available</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-200">AGNOSTIC QA</h3>
        <StatusBadge status={data.status} />
      </div>

      {/* Task Counts */}
      <div className="rounded border border-zinc-700 p-2">
        <div className="mb-1 text-xs font-medium text-zinc-300">Tasks</div>
        <div className="space-y-0.5">
          <TaskBar label="Running" count={data.tasks.running} color="text-blue-400" />
          <TaskBar label="Pending" count={data.tasks.pending} color="text-yellow-400" />
          <TaskBar label="Completed" count={data.tasks.completed} color="text-green-400" />
          <TaskBar label="Failed" count={data.tasks.failed} color="text-red-400" />
        </div>
      </div>

      {/* Agent Status */}
      <div className="flex items-center justify-between rounded border border-zinc-700 p-2">
        <span className="text-xs text-zinc-400">Agents</span>
        <span className="text-xs text-zinc-200">
          <span className="font-medium text-green-400">{data.agents.active}</span>
          <span className="text-zinc-500"> / {data.agents.total}</span>
        </span>
      </div>

      {/* Recent Tasks */}
      {data.recentTasks.length > 0 && (
        <div>
          <div className="mb-1 text-xs font-medium text-zinc-300">Recent</div>
          <div className="space-y-1">
            {data.recentTasks.slice(0, 3).map((task) => (
              <div
                key={task.id}
                className="flex items-center justify-between rounded border border-zinc-800 px-2 py-1"
              >
                <span className="truncate text-xs text-zinc-300" title={task.title}>
                  {task.title}
                </span>
                <span
                  className={`ml-2 whitespace-nowrap text-xs ${
                    task.status === 'completed'
                      ? 'text-green-400'
                      : task.status === 'failed'
                        ? 'text-red-400'
                        : task.status === 'running'
                          ? 'text-blue-400'
                          : 'text-zinc-500'
                  }`}
                >
                  {task.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
