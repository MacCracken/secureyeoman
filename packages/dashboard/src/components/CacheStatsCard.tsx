/**
 * CacheStatsCard -- Inference cache statistics display.
 * Hit rate gauge, LRU vs semantic cache breakdown, clear button.
 *
 * Phase 132 -- Cache Analytics
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { getAccessToken } from '../api/client';

interface CacheStats {
  hitRate: number;
  totalHits: number;
  totalMisses: number;
  lru: { hits: number; misses: number; size: number; maxSize: number };
  semantic: { hits: number; misses: number; size: number; maxSize: number };
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

function HitRateGauge({ rate }: { rate: number }) {
  const pct = Math.round(rate * 100);
  const color =
    pct >= 80 ? 'text-green-400' : pct >= 50 ? 'text-yellow-400' : 'text-red-400';
  const ringColor =
    pct >= 80 ? 'stroke-green-500' : pct >= 50 ? 'stroke-yellow-500' : 'stroke-red-500';

  // Simple circular gauge using SVG
  const radius = 36;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (pct / 100) * circumference;

  return (
    <div className="flex flex-col items-center">
      <svg width="88" height="88" className="-rotate-90">
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          strokeWidth="6"
          className="stroke-zinc-700"
        />
        <circle
          cx="44"
          cy="44"
          r={radius}
          fill="none"
          strokeWidth="6"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          strokeLinecap="round"
          className={ringColor}
        />
      </svg>
      <span className={`-mt-14 text-xl font-bold ${color}`}>{pct}%</span>
      <span className="mt-8 text-xs text-zinc-500">Hit Rate</span>
    </div>
  );
}

function CacheBreakdown({
  label,
  stats,
}: {
  label: string;
  stats: { hits: number; misses: number; size: number; maxSize: number };
}) {
  const total = stats.hits + stats.misses;
  const rate = total > 0 ? Math.round((stats.hits / total) * 100) : 0;
  const fill = stats.maxSize > 0 ? Math.round((stats.size / stats.maxSize) * 100) : 0;

  return (
    <div className="rounded border border-zinc-700 p-2">
      <div className="mb-1 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-300">{label}</span>
        <span className="text-xs text-zinc-400">{rate}% hit</span>
      </div>
      <div className="mb-1 flex items-center gap-2">
        <div className="h-1.5 flex-1 rounded bg-zinc-700">
          <div
            className="h-1.5 rounded bg-blue-500"
            style={{ width: `${fill}%` }}
          />
        </div>
        <span className="text-xs text-zinc-500">
          {stats.size}/{stats.maxSize}
        </span>
      </div>
      <div className="flex gap-3 text-xs text-zinc-500">
        <span>{stats.hits} hits</span>
        <span>{stats.misses} misses</span>
      </div>
    </div>
  );
}

export default function CacheStatsCard() {
  const queryClient = useQueryClient();

  const { data: stats, isLoading, error } = useQuery<CacheStats>({
    queryKey: ['cache-stats'],
    queryFn: () => fetchApi('/api/v1/inference/cache/stats'),
    refetchInterval: 15_000,
  });

  const clearMutation = useMutation({
    mutationFn: () =>
      fetchApi<{ cleared: boolean }>('/api/v1/inference/cache/clear', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['cache-stats'] });
    },
  });

  if (isLoading) {
    return (
      <div className="p-4 text-sm text-zinc-400">Loading cache stats...</div>
    );
  }

  if (error) {
    return (
      <div className="p-4 text-sm text-red-400">
        Error: {(error as Error).message}
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="p-4 text-sm text-zinc-500">Cache data unavailable</div>
    );
  }

  return (
    <div className="flex flex-col gap-3 p-4 text-sm">
      <div className="flex items-center justify-between">
        <h3 className="text-base font-semibold text-zinc-200">
          Cache Statistics
        </h3>
        <button
          onClick={() => clearMutation.mutate()}
          disabled={clearMutation.isPending}
          className="rounded bg-red-600 px-2 py-0.5 text-xs text-white hover:bg-red-500 disabled:opacity-50"
        >
          {clearMutation.isPending ? 'Clearing...' : 'Clear Cache'}
        </button>
      </div>

      {/* Hit Rate Gauge */}
      <div className="flex justify-center py-2">
        <HitRateGauge rate={stats.hitRate} />
      </div>

      <div className="text-center text-xs text-zinc-500">
        {stats.totalHits} hits / {stats.totalMisses} misses
      </div>

      {/* LRU vs Semantic Breakdown */}
      <div className="grid grid-cols-2 gap-2">
        <CacheBreakdown label="LRU Cache" stats={stats.lru} />
        <CacheBreakdown label="Semantic Cache" stats={stats.semantic} />
      </div>

      {clearMutation.isError && (
        <div className="text-xs text-red-400">
          Clear failed: {(clearMutation.error as Error).message}
        </div>
      )}
    </div>
  );
}
