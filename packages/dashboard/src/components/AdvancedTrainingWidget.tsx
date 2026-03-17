/**
 * AdvancedTrainingWidget -- Multi-method fine-tuning control panel.
 * Training method selector (SFT/DPO/RLHF), multi-GPU config,
 * and checkpoint browser with resume capability.
 *
 * Phase 131 -- Advanced Training Pipeline
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

type TrainingMethod = 'sft' | 'dpo' | 'rlhf';

interface Checkpoint {
  id: string;
  step: number;
  loss: number;
  date: string;
  path: string;
}

interface TrainingJob {
  id: string;
  method: TrainingMethod;
  gpuCount: number;
  status: 'pending' | 'running' | 'completed' | 'failed';
  currentStep: number;
  totalSteps: number;
  checkpoints: Checkpoint[];
}

interface TrainingConfig {
  method: TrainingMethod;
  gpuCount: number;
  personality?: string;
  epochs?: number;
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

function CheckpointBrowser({
  checkpoints,
  onResume,
  resuming,
}: {
  checkpoints: Checkpoint[];
  onResume: (id: string) => void;
  resuming: boolean;
}) {
  if (checkpoints.length === 0) {
    return <div className="text-xs text-zinc-500">No checkpoints yet</div>;
  }

  return (
    <div className="space-y-1 max-h-48 overflow-y-auto">
      {checkpoints.map((cp) => (
        <div
          key={cp.id}
          className="flex items-center justify-between rounded border border-zinc-700 px-2 py-1.5"
        >
          <div className="flex items-center gap-3 text-xs">
            <span className="font-mono text-zinc-300">Step {cp.step}</span>
            <span className="text-zinc-400">Loss: {cp.loss.toFixed(4)}</span>
            <span className="text-zinc-500">{new Date(cp.date).toLocaleDateString()}</span>
          </div>
          <button
            onClick={() => {
              onResume(cp.id);
            }}
            disabled={resuming}
            className="rounded bg-blue-600 px-2 py-0.5 text-xs text-white hover:bg-blue-500 disabled:opacity-50"
          >
            Resume
          </button>
        </div>
      ))}
    </div>
  );
}

export default function AdvancedTrainingWidget() {
  const queryClient = useQueryClient();
  const [method, setMethod] = useState<TrainingMethod>('sft');
  const [gpuCount, setGpuCount] = useState(1);

  const {
    data: jobs,
    isLoading,
    error,
  } = useQuery<TrainingJob[]>({
    queryKey: ['advanced-training-jobs'],
    queryFn: () => fetchApi('/api/v1/training/advanced/jobs'),
    refetchInterval: 10_000,
  });

  const startMutation = useMutation({
    mutationFn: (config: TrainingConfig) =>
      fetchApi<TrainingJob>('/api/v1/training/advanced/start', {
        method: 'POST',
        body: JSON.stringify(config),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['advanced-training-jobs'] });
    },
  });

  const resumeMutation = useMutation({
    mutationFn: (checkpointId: string) =>
      fetchApi<TrainingJob>('/api/v1/training/advanced/resume', {
        method: 'POST',
        body: JSON.stringify({ checkpointId }),
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['advanced-training-jobs'] });
    },
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Loading training data...</div>;
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">Error loading training data: {error.message}</div>
    );
  }

  const methods: { value: TrainingMethod; label: string; desc: string }[] = [
    { value: 'sft', label: 'SFT', desc: 'Supervised Fine-Tuning' },
    { value: 'dpo', label: 'DPO', desc: 'Direct Preference Optimization' },
    { value: 'rlhf', label: 'RLHF', desc: 'Reinforcement Learning from Human Feedback' },
  ];

  const activeJob = jobs?.find((j) => j.status === 'running');
  const allCheckpoints = jobs?.flatMap((j) => j.checkpoints) ?? [];

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">Advanced Training</h3>

      {/* Training Method Selector */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Training Method</div>
        <div className="space-y-1">
          {methods.map((m) => (
            <label key={m.value} className="flex cursor-pointer items-center gap-2">
              <input
                type="radio"
                name="training-method"
                value={m.value}
                checked={method === m.value}
                onChange={() => {
                  setMethod(m.value);
                }}
                className="accent-blue-500"
              />
              <span className="text-zinc-200">{m.label}</span>
              <span className="text-xs text-zinc-500">- {m.desc}</span>
            </label>
          ))}
        </div>
      </div>

      {/* GPU Count */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">GPU Count</div>
        <div className="flex items-center gap-3">
          <input
            type="range"
            min={1}
            max={8}
            value={gpuCount}
            onChange={(e) => {
              setGpuCount(Number(e.target.value));
            }}
            className="flex-1 accent-blue-500"
          />
          <span className="w-6 text-center font-mono text-zinc-200">{gpuCount}</span>
        </div>
      </div>

      {/* Start Button */}
      <button
        onClick={() => {
          startMutation.mutate({ method, gpuCount });
        }}
        disabled={startMutation.isPending || !!activeJob}
        className="rounded bg-green-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
      >
        {activeJob ? 'Training in Progress...' : 'Start Training'}
      </button>

      {startMutation.isError && (
        <div className="text-xs text-red-400">Failed to start: {startMutation.error.message}</div>
      )}

      {/* Active Job Progress */}
      {activeJob && (
        <div className="rounded border border-zinc-700 p-3">
          <div className="mb-1 font-medium text-zinc-300">
            Running: {activeJob.method.toUpperCase()} on {activeJob.gpuCount} GPU(s)
          </div>
          <div className="flex items-center gap-2">
            <div className="h-2 flex-1 rounded bg-zinc-700">
              <div
                className="h-2 rounded bg-blue-500 transition-all"
                style={{
                  width: `${Math.round((activeJob.currentStep / activeJob.totalSteps) * 100)}%`,
                }}
              />
            </div>
            <span className="text-xs text-zinc-400">
              {activeJob.currentStep}/{activeJob.totalSteps}
            </span>
          </div>
        </div>
      )}

      {/* Checkpoint Browser */}
      <div className="rounded border border-zinc-700 p-3">
        <div className="mb-2 font-medium text-zinc-300">Checkpoints</div>
        <CheckpointBrowser
          checkpoints={allCheckpoints}
          onResume={(id) => {
            resumeMutation.mutate(id);
          }}
          resuming={resumeMutation.isPending}
        />
      </div>
    </div>
  );
}
