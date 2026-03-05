/**
 * HyperparamSearchWidget -- Hyperparameter search wizard and trial monitor.
 * Wizard form for creating searches, trial progress grid, best trial highlight.
 *
 * Phase 132 -- Hyperparameter Search
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

type Strategy = 'grid' | 'random' | 'bayesian';

interface ParamSpace {
  name: string;
  min: number;
  max: number;
  step?: number;
}

interface Trial {
  id: string;
  params: Record<string, number>;
  status: 'pending' | 'running' | 'completed' | 'failed';
  loss: number | null;
  startedAt: string | null;
  completedAt: string | null;
}

interface SearchJob {
  id: string;
  name: string;
  strategy: Strategy;
  status: 'pending' | 'running' | 'completed';
  trials: Trial[];
  bestTrialId: string | null;
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

function WizardForm({
  onSubmit,
  submitting,
}: {
  onSubmit: (data: { name: string; strategy: Strategy; paramSpace: ParamSpace[] }) => void;
  submitting: boolean;
}) {
  const [name, setName] = useState('');
  const [strategy, setStrategy] = useState<Strategy>('bayesian');
  const [paramText, setParamText] = useState('learning_rate 1e-5 1e-3\nbatch_size 8 64');

  const handleSubmit = () => {
    const paramSpace: ParamSpace[] = paramText
      .split('\n')
      .filter((l) => l.trim())
      .map((line) => {
        const parts = line.trim().split(/\s+/);
        return {
          name: parts[0],
          min: Number(parts[1]),
          max: Number(parts[2]),
          ...(parts[3] ? { step: Number(parts[3]) } : {}),
        };
      });
    onSubmit({ name, strategy, paramSpace });
  };

  return (
    <div className="space-y-3 rounded border border-zinc-700 p-3">
      <div className="font-medium text-zinc-300">New Search</div>

      <div>
        <label className="mb-1 block text-xs text-zinc-400">Name</label>
        <input
          type="text"
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          placeholder="my-search-run"
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-400">Strategy</label>
        <div className="flex gap-3">
          {(['grid', 'random', 'bayesian'] as Strategy[]).map((s) => (
            <label key={s} className="flex cursor-pointer items-center gap-1">
              <input
                type="radio"
                name="hp-strategy"
                value={s}
                checked={strategy === s}
                onChange={() => {
                  setStrategy(s);
                }}
                className="accent-blue-500"
              />
              <span className="text-sm capitalize text-zinc-200">{s}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <label className="mb-1 block text-xs text-zinc-400">
          Parameter Space (name min max [step])
        </label>
        <textarea
          value={paramText}
          onChange={(e) => {
            setParamText(e.target.value);
          }}
          rows={3}
          className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 font-mono text-xs text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
        />
      </div>

      <button
        onClick={handleSubmit}
        disabled={submitting || !name.trim()}
        className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
      >
        {submitting ? 'Creating...' : 'Create Search'}
      </button>
    </div>
  );
}

function TrialGrid({ trials, bestTrialId }: { trials: Trial[]; bestTrialId: string | null }) {
  if (trials.length === 0) {
    return <div className="text-xs text-zinc-500">No trials yet</div>;
  }

  const statusColor: Record<Trial['status'], string> = {
    pending: 'bg-zinc-600',
    running: 'bg-blue-500 animate-pulse',
    completed: 'bg-green-500',
    failed: 'bg-red-500',
  };

  return (
    <div>
      <div className="mb-2 grid grid-cols-6 gap-1">
        {trials.map((t) => (
          <div
            key={t.id}
            title={`${t.id}\nLoss: ${t.loss ?? 'N/A'}\nParams: ${JSON.stringify(t.params)}`}
            className={`h-6 rounded ${statusColor[t.status]} ${t.id === bestTrialId ? 'ring-2 ring-yellow-400' : ''}`}
          />
        ))}
      </div>

      {/* Best Trial */}
      {bestTrialId && (
        <div className="rounded border border-yellow-600 bg-yellow-900/20 p-2">
          <div className="text-xs font-medium text-yellow-300">Best Trial</div>
          {(() => {
            const best = trials.find((t) => t.id === bestTrialId);
            if (!best) return null;
            return (
              <div className="mt-1 space-y-0.5 text-xs text-zinc-300">
                <div>Loss: {best.loss?.toFixed(6) ?? 'N/A'}</div>
                <div className="font-mono text-zinc-400">
                  {Object.entries(best.params)
                    .map(([k, v]) => `${k}=${v}`)
                    .join(', ')}
                </div>
              </div>
            );
          })()}
        </div>
      )}
    </div>
  );
}

export default function HyperparamSearchWidget() {
  const queryClient = useQueryClient();

  const {
    data: searches,
    isLoading,
    error,
  } = useQuery<SearchJob[]>({
    queryKey: ['hyperparam-searches'],
    queryFn: () => fetchApi('/api/v1/training/hyperparam/searches'),
    refetchInterval: 5_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; strategy: Strategy; paramSpace: ParamSpace[] }) =>
      fetchApi<SearchJob>('/api/v1/training/hyperparam/searches', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hyperparam-searches'] });
    },
  });

  if (isLoading) {
    return <div className="p-4 text-sm text-zinc-400">Loading searches...</div>;
  }

  if (error) {
    return <div className="p-4 text-sm text-red-400">Error: {error.message}</div>;
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">Hyperparameter Search</h3>

      <WizardForm
        onSubmit={(data) => {
          createMutation.mutate(data);
        }}
        submitting={createMutation.isPending}
      />

      {createMutation.isError && (
        <div className="text-xs text-red-400">Failed: {createMutation.error.message}</div>
      )}

      {/* Active Searches */}
      {(searches ?? []).map((search) => (
        <div key={search.id} className="rounded border border-zinc-700 p-3">
          <div className="mb-1 flex items-center justify-between">
            <span className="font-medium text-zinc-200">{search.name}</span>
            <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
              {search.strategy} | {search.status}
            </span>
          </div>
          <div className="mb-2 text-xs text-zinc-500">
            {search.trials.filter((t) => t.status === 'completed').length}/{search.trials.length}{' '}
            trials complete
          </div>
          <TrialGrid trials={search.trials} bestTrialId={search.bestTrialId} />
        </div>
      ))}
    </div>
  );
}
