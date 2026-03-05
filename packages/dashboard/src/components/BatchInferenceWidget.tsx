/**
 * BatchInferenceWidget -- Batch inference job management.
 * Job creation form with prompts textarea and concurrency slider,
 * progress bar, and results table with per-prompt latency.
 *
 * Phase 132 -- Batch Inference
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

interface BatchResult {
  promptIndex: number;
  prompt: string;
  output: string;
  latencyMs: number;
  status: 'completed' | 'failed';
}

interface BatchJob {
  id: string;
  name: string;
  status: 'pending' | 'running' | 'completed' | 'failed';
  totalPrompts: number;
  completedPrompts: number;
  concurrency: number;
  results: BatchResult[];
  createdAt: string;
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

export default function BatchInferenceWidget() {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [prompts, setPrompts] = useState('');
  const [concurrency, setConcurrency] = useState(4);

  const { data: jobs, isLoading, error } = useQuery<BatchJob[]>({
    queryKey: ['batch-inference-jobs'],
    queryFn: () => fetchApi('/api/v1/inference/batch/jobs'),
    refetchInterval: 5_000,
  });

  const createMutation = useMutation({
    mutationFn: (data: { name: string; prompts: string[]; concurrency: number }) =>
      fetchApi<BatchJob>('/api/v1/inference/batch/jobs', {
        method: 'POST',
        body: JSON.stringify(data),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['batch-inference-jobs'] });
      setName('');
      setPrompts('');
    },
  });

  const handleSubmit = () => {
    const promptList = prompts
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);
    if (!name.trim() || promptList.length === 0) return;
    createMutation.mutate({ name, prompts: promptList, concurrency });
  };

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-zinc-400">Loading batch jobs...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Error: {(error as Error).message}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <h3 className="text-base font-semibold text-zinc-200">
        Batch Inference
      </h3>

      {/* Job Form */}
      <div className="space-y-3 rounded border border-zinc-700 p-3">
        <div className="font-medium text-zinc-300">New Batch Job</div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">Job Name</label>
          <input
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="batch-eval-01"
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">
            Prompts (one per line)
          </label>
          <textarea
            value={prompts}
            onChange={(e) => setPrompts(e.target.value)}
            rows={4}
            placeholder={"Explain quantum computing\nSummarize this document\nTranslate to French: Hello world"}
            className="w-full rounded border border-zinc-600 bg-zinc-800 px-2 py-1 text-sm text-zinc-200 placeholder-zinc-500 focus:border-blue-500 focus:outline-none"
          />
        </div>

        <div>
          <label className="mb-1 block text-xs text-zinc-400">
            Concurrency: {concurrency}
          </label>
          <input
            type="range"
            min={1}
            max={32}
            value={concurrency}
            onChange={(e) => setConcurrency(Number(e.target.value))}
            className="w-full accent-blue-500"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={createMutation.isPending || !name.trim() || !prompts.trim()}
          className="rounded bg-green-600 px-3 py-1 text-sm font-medium text-white hover:bg-green-500 disabled:opacity-50"
        >
          {createMutation.isPending ? 'Submitting...' : 'Submit Batch'}
        </button>

        {createMutation.isError && (
          <div className="text-xs text-red-400">
            Failed: {(createMutation.error as Error).message}
          </div>
        )}
      </div>

      {/* Job List */}
      {(jobs ?? []).map((job) => {
        const pct = job.totalPrompts > 0
          ? Math.round((job.completedPrompts / job.totalPrompts) * 100)
          : 0;

        return (
          <div key={job.id} className="rounded border border-zinc-700 p-3">
            <div className="mb-1 flex items-center justify-between">
              <span className="font-medium text-zinc-200">{job.name}</span>
              <span className="rounded bg-zinc-700 px-1.5 py-0.5 text-xs text-zinc-400">
                {job.status}
              </span>
            </div>

            {/* Progress Bar */}
            <div className="mb-2 flex items-center gap-2">
              <div className="h-2 flex-1 rounded bg-zinc-700">
                <div
                  className="h-2 rounded bg-blue-500 transition-all"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="text-xs text-zinc-400">
                {job.completedPrompts}/{job.totalPrompts}
              </span>
            </div>

            {/* Results Table */}
            {job.results.length > 0 && (
              <div className="max-h-40 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-zinc-700 text-left text-zinc-400">
                      <th className="py-1 pr-2">#</th>
                      <th className="py-1 pr-2">Prompt</th>
                      <th className="py-1 pr-2">Latency</th>
                      <th className="py-1">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {job.results.map((r) => (
                      <tr key={r.promptIndex} className="border-b border-zinc-800">
                        <td className="py-1 pr-2 text-zinc-500">{r.promptIndex + 1}</td>
                        <td className="max-w-[180px] truncate py-1 pr-2 text-zinc-300">
                          {r.prompt}
                        </td>
                        <td className="py-1 pr-2 font-mono text-zinc-400">
                          {r.latencyMs}ms
                        </td>
                        <td className="py-1">
                          <span
                            className={
                              r.status === 'completed'
                                ? 'text-green-400'
                                : 'text-red-400'
                            }
                          >
                            {r.status === 'completed' ? '\u2713' : '\u2717'}
                          </span>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
