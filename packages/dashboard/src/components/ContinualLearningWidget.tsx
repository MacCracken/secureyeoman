/**
 * ContinualLearningWidget -- Continual learning management panel.
 * Three panels: Dataset Refresh, Drift Monitor, Online Updates.
 *
 * Phase 133 -- Continual Learning
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

interface DatasetRefreshStatus {
  cron: string;
  lastRunAt: string | null;
  samplesAdded: number;
  nextRunAt: string;
  status: 'idle' | 'running' | 'error';
}

interface DriftSnapshot {
  personality: string;
  mean: number;
  baseline: number;
  driftScore: number;
  timestamp: string;
}

interface DriftMonitorData {
  snapshots: DriftSnapshot[];
  latestPerPersonality: Record<string, DriftSnapshot>;
}

interface OnlineUpdateJob {
  id: string;
  personality: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  conversationCount: number;
  startedAt: string | null;
  completedAt: string | null;
}

async function fetchApi<T>(path: string, opts?: RequestInit): Promise<T> {
  const token = getAccessToken();
  const res = await fetch(path, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...opts?.headers,
    },
  });
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);
  return res.json();
}

type Panel = 'dataset' | 'drift' | 'online';

function DatasetRefreshPanel() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery<DatasetRefreshStatus>({
    queryKey: ['continual-dataset-refresh'],
    queryFn: () => fetchApi('/api/v1/training/continual/dataset-refresh'),
    refetchInterval: 10_000,
  });

  const triggerMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ triggered: boolean }>('/api/v1/training/continual/dataset-refresh/trigger', {
        method: 'POST',
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['continual-dataset-refresh'] });
    },
  });

  if (isLoading || !data) {
    return <div className="text-xs text-zinc-400">Loading...</div>;
  }

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-2 gap-2">
        <div className="rounded border border-zinc-700 p-2">
          <div className="text-xs text-zinc-500">Schedule</div>
          <div className="font-mono text-sm text-zinc-200">{data.cron}</div>
        </div>
        <div className="rounded border border-zinc-700 p-2">
          <div className="text-xs text-zinc-500">Samples Added</div>
          <div className="text-sm font-semibold text-zinc-200">
            {data.samplesAdded.toLocaleString()}
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between text-xs">
        <span className="text-zinc-400">
          Last run: {data.lastRunAt ? new Date(data.lastRunAt).toLocaleString() : 'Never'}
        </span>
        <span className="text-zinc-500">Next: {new Date(data.nextRunAt).toLocaleString()}</span>
      </div>

      <div className="flex items-center gap-2">
        <button
          onClick={() => {
            triggerMutation.mutate();
          }}
          disabled={triggerMutation.isPending || data.status === 'running'}
          className="rounded bg-blue-600 px-3 py-1 text-xs font-medium text-white hover:bg-blue-500 disabled:opacity-50"
        >
          {data.status === 'running' ? 'Running...' : 'Trigger Now'}
        </button>
        {data.status === 'error' && <span className="text-xs text-red-400">Last run failed</span>}
      </div>
    </div>
  );
}

function driftColor(driftScore: number): string {
  if (driftScore < 0.1) return 'text-green-400';
  if (driftScore < 0.3) return 'text-yellow-400';
  return 'text-red-400';
}

function driftBarColor(driftScore: number): string {
  if (driftScore < 0.1) return 'bg-green-500';
  if (driftScore < 0.3) return 'bg-yellow-500';
  return 'bg-red-500';
}

function DriftMonitorPanel() {
  const { data, isLoading } = useQuery<DriftMonitorData>({
    queryKey: ['continual-drift'],
    queryFn: () => fetchApi('/api/v1/training/continual/drift'),
    refetchInterval: 15_000,
  });

  if (isLoading || !data) {
    return <div className="text-xs text-zinc-400">Loading...</div>;
  }

  const personalities = Object.entries(data.latestPerPersonality);

  return (
    <div className="space-y-2">
      {/* Per-personality gauges */}
      {personalities.length === 0 && (
        <div className="text-xs text-zinc-500">No drift data available</div>
      )}
      {personalities.map(([name, snap]) => (
        <div key={name} className="rounded border border-zinc-700 p-2">
          <div className="mb-1 flex items-center justify-between">
            <span className="text-xs font-medium text-zinc-300">{name}</span>
            <span className={`text-xs font-mono ${driftColor(snap.driftScore)}`}>
              {snap.driftScore.toFixed(3)}
            </span>
          </div>
          <div className="mb-1 flex items-center gap-2">
            <div className="h-1.5 flex-1 rounded bg-zinc-700">
              <div
                className={`h-1.5 rounded ${driftBarColor(snap.driftScore)}`}
                style={{ width: `${Math.min(snap.driftScore * 100, 100)}%` }}
              />
            </div>
          </div>
          <div className="flex gap-3 text-xs text-zinc-500">
            <span>Mean: {snap.mean.toFixed(4)}</span>
            <span>Baseline: {snap.baseline.toFixed(4)}</span>
          </div>
        </div>
      ))}

      {/* Snapshot Timeline */}
      {data.snapshots.length > 0 && (
        <div className="max-h-32 overflow-y-auto">
          <div className="text-xs font-medium text-zinc-400 mb-1">Recent Snapshots</div>
          {data.snapshots.slice(-10).map((snap, i) => (
            <div
              key={i}
              className="flex items-center justify-between border-b border-zinc-800 py-0.5 text-xs"
            >
              <span className="text-zinc-400">{snap.personality}</span>
              <span className={`font-mono ${driftColor(snap.driftScore)}`}>
                {snap.driftScore.toFixed(3)}
              </span>
              <span className="text-zinc-500">{new Date(snap.timestamp).toLocaleDateString()}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function OnlineUpdatesPanel() {
  const { data: jobs, isLoading } = useQuery<OnlineUpdateJob[]>({
    queryKey: ['continual-online-updates'],
    queryFn: () => fetchApi('/api/v1/training/continual/online-updates'),
    refetchInterval: 10_000,
  });

  if (isLoading || !jobs) {
    return <div className="text-xs text-zinc-400">Loading...</div>;
  }

  if (jobs.length === 0) {
    return <div className="text-xs text-zinc-500">No online update jobs</div>;
  }

  const statusIcon: Record<OnlineUpdateJob['status'], string> = {
    pending: '\u25CB',
    running: '\u25D4',
    completed: '\u25CF',
    failed: '\u2717',
  };

  const statusColor: Record<OnlineUpdateJob['status'], string> = {
    pending: 'text-zinc-500',
    running: 'text-blue-400',
    completed: 'text-green-400',
    failed: 'text-red-400',
  };

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {jobs.map((job) => (
        <div
          key={job.id}
          className="flex items-center justify-between rounded border border-zinc-700 px-2 py-1.5"
        >
          <div className="flex items-center gap-2">
            <span className={statusColor[job.status]}>{statusIcon[job.status]}</span>
            <span className="text-xs text-zinc-300">{job.personality}</span>
          </div>
          <div className="flex items-center gap-3 text-xs text-zinc-500">
            <span>{job.conversationCount} convos</span>
            <span className={statusColor[job.status]}>{job.status}</span>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function ContinualLearningWidget() {
  const [activePanel, setActivePanel] = useState<Panel>('dataset');

  const panels: { key: Panel; label: string }[] = [
    { key: 'dataset', label: 'Dataset Refresh' },
    { key: 'drift', label: 'Drift Monitor' },
    { key: 'online', label: 'Online Updates' },
  ];

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">Continual Learning</h3>

      {/* Panel Tabs */}
      <div className="flex gap-1 rounded bg-zinc-800 p-0.5">
        {panels.map((p) => (
          <button
            key={p.key}
            onClick={() => {
              setActivePanel(p.key);
            }}
            className={`flex-1 rounded px-2 py-1 text-xs font-medium transition-colors ${
              activePanel === p.key
                ? 'bg-zinc-600 text-zinc-100'
                : 'text-zinc-400 hover:text-zinc-200'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {/* Panel Content */}
      {activePanel === 'dataset' && <DatasetRefreshPanel />}
      {activePanel === 'drift' && <DriftMonitorPanel />}
      {activePanel === 'online' && <OnlineUpdatesPanel />}
    </div>
  );
}
