import React, { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { RefreshCw, Loader2, AlertTriangle, BarChart3 } from 'lucide-react';
import { fetchKnowledgeHealth, fetchPersonalities } from '../../api/client';

const ALL_PERSONALITIES = '__all__';

function KpiCard({ label, value, sub }: { label: string; value: string | number; sub?: string }) {
  return (
    <div className="card p-3 sm:p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-xl font-bold mt-0.5">{value}</p>
      {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
    </div>
  );
}

export function KnowledgeHealthPanel() {
  const [selectedPersonalityId, setSelectedPersonalityId] = useState(ALL_PERSONALITIES);

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 30000,
  });
  const personalities = personalitiesData?.personalities ?? [];

  const filterPersonalityId =
    selectedPersonalityId === ALL_PERSONALITIES ? undefined : selectedPersonalityId;

  const { data: stats, isLoading, refetch, isFetching } = useQuery({
    queryKey: ['knowledge-health', filterPersonalityId],
    queryFn: () => fetchKnowledgeHealth(filterPersonalityId),
    staleTime: 30000,
  });

  const avgScore =
    stats?.avgTopScore != null ? `${(stats.avgTopScore * 100).toFixed(1)}%` : '—';

  return (
    <div className="space-y-4">
      {/* Header controls */}
      <div className="flex items-center gap-3 flex-wrap">
        <div className="flex items-center gap-2">
          <label className="text-xs text-muted-foreground">Personality:</label>
          <select
            value={selectedPersonalityId}
            onChange={(e) => setSelectedPersonalityId(e.target.value)}
            className="bg-card border border-border rounded text-xs py-1 px-2"
          >
            <option value={ALL_PERSONALITIES}>All</option>
            {personalities.map((p) => (
              <option key={p.id} value={p.id}>{p.name}</option>
            ))}
          </select>
        </div>
        <button
          className="btn btn-ghost text-xs h-7 px-2 flex items-center gap-1 disabled:opacity-50"
          onClick={() => void refetch()}
          disabled={isFetching}
        >
          <RefreshCw className={`w-3 h-3 ${isFetching ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
        </div>
      ) : (
        <>
          {/* KPI cards */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-4">
            <KpiCard label="Total Documents" value={stats?.totalDocuments ?? 0} />
            <KpiCard label="Total Chunks" value={stats?.totalChunks ?? 0} />
            <KpiCard label="Queries (24h)" value={stats?.recentQueryCount ?? 0} />
            <KpiCard
              label="Avg Relevance"
              value={avgScore}
              sub="last 24h"
            />
          </div>

          {/* Low coverage warning */}
          {(stats?.lowCoverageQueries ?? 0) > 0 && (
            <div className="flex items-start gap-2 p-3 bg-yellow-50 border border-yellow-200 rounded-lg text-yellow-800">
              <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
              <div>
                <p className="text-xs font-medium">
                  {stats!.lowCoverageQueries} query{stats!.lowCoverageQueries !== 1 ? 's' : ''} returned 0 results in the last 24h
                </p>
                <p className="text-xs mt-0.5">Consider adding more documents to improve coverage.</p>
              </div>
            </div>
          )}

          {/* Format breakdown */}
          {stats && Object.keys(stats.byFormat).length > 0 && (
            <div className="card">
              <div className="card-header p-3 sm:p-4">
                <h3 className="card-title text-sm flex items-center gap-2">
                  <BarChart3 className="w-4 h-4 text-muted-foreground" />
                  Documents by Format
                </h3>
              </div>
              <div className="card-content p-3 sm:p-4 pt-0 sm:pt-0">
                <div className="space-y-2">
                  {Object.entries(stats.byFormat).map(([format, count]) => {
                    const pct =
                      stats.totalDocuments > 0
                        ? Math.round((count / stats.totalDocuments) * 100)
                        : 0;
                    return (
                      <div key={format} className="flex items-center gap-2">
                        <span className="text-xs font-mono w-10 shrink-0 text-muted-foreground">{format}</span>
                        <div className="flex-1 bg-muted rounded-full h-1.5 overflow-hidden">
                          <div
                            className="h-full bg-primary rounded-full"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="text-xs text-muted-foreground w-6 text-right">{count}</span>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
