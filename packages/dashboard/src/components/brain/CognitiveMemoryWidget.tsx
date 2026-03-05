/**
 * Cognitive Memory Widget — Phase 124
 *
 * Shows ACT-R activation stats, 7-day access trend bar chart,
 * top activated memories, and Hebbian association summary.
 */

import { useQuery } from '@tanstack/react-query';
import { Brain, Link2, TrendingUp, Loader2 } from 'lucide-react';

interface ActivationItem {
  id: string;
  activation: number;
}

interface AccessTrendEntry {
  day: string;
  count: number;
}

interface CognitiveStats {
  topMemories: ActivationItem[];
  topDocuments: ActivationItem[];
  associationCount: number;
  avgAssociationWeight: number;
  accessTrend: AccessTrendEntry[];
}

async function fetchCognitiveStats(): Promise<CognitiveStats> {
  const res = await fetch('/api/v1/brain/cognitive-stats');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const data = await res.json();
  return data.stats;
}

function TrendBar({ entries }: { entries: AccessTrendEntry[] }) {
  if (entries.length === 0) {
    return <p className="text-xs text-muted-foreground">No access data in the last 7 days</p>;
  }

  const max = Math.max(...entries.map((e) => e.count), 1);

  return (
    <div className="flex items-end gap-1 h-16">
      {entries.map((entry) => (
        <div key={entry.day} className="flex-1 flex flex-col items-center gap-0.5">
          <div
            className="w-full bg-primary/60 rounded-t"
            style={{ height: `${(entry.count / max) * 100}%`, minHeight: '2px' }}
            title={`${entry.day}: ${entry.count} accesses`}
          />
          <span className="text-[9px] text-muted-foreground">{entry.day.slice(5)}</span>
        </div>
      ))}
    </div>
  );
}

export function CognitiveMemoryWidget() {
  const { data, isLoading, error } = useQuery({
    queryKey: ['cognitive-stats'],
    queryFn: fetchCognitiveStats,
    refetchInterval: 60_000,
  });

  if (isLoading) {
    return (
      <div className="p-4 rounded-lg border bg-card">
        <div className="flex items-center gap-2">
          <Loader2 className="h-4 w-4 animate-spin" />
          <span className="text-sm text-muted-foreground">Loading cognitive stats...</span>
        </div>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="p-4 rounded-lg border bg-card">
        <p className="text-sm text-muted-foreground">Cognitive memory not available</p>
      </div>
    );
  }

  return (
    <div className="p-4 rounded-lg border bg-card space-y-4">
      <div className="flex items-center gap-2">
        <Brain className="h-4 w-4 text-primary" />
        <h3 className="text-sm font-semibold">Cognitive Memory</h3>
      </div>

      {/* Summary stats */}
      <div className="grid grid-cols-2 gap-3">
        <div className="p-2 rounded bg-muted/30">
          <div className="flex items-center gap-1.5 mb-0.5">
            <Link2 className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Associations</span>
          </div>
          <p className="text-lg font-bold">{data.associationCount}</p>
        </div>
        <div className="p-2 rounded bg-muted/30">
          <div className="flex items-center gap-1.5 mb-0.5">
            <TrendingUp className="h-3 w-3 text-muted-foreground" />
            <span className="text-xs text-muted-foreground">Avg Weight</span>
          </div>
          <p className="text-lg font-bold">{data.avgAssociationWeight.toFixed(3)}</p>
        </div>
      </div>

      {/* 7-day access trend */}
      <div>
        <p className="text-xs text-muted-foreground mb-1">7-Day Access Trend</p>
        <TrendBar entries={data.accessTrend} />
      </div>

      {/* Top activated memories */}
      {data.topMemories.length > 0 && (
        <div>
          <p className="text-xs text-muted-foreground mb-1">Top Activated Memories</p>
          <div className="space-y-1">
            {data.topMemories.slice(0, 3).map((m) => (
              <div key={m.id} className="flex justify-between text-xs">
                <span className="font-mono truncate max-w-[180px]">{m.id}</span>
                <span className="text-primary font-medium">{m.activation.toFixed(2)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
