import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Trash2,
} from 'lucide-react';
import {
  fetchComputerUseEpisodes,
  fetchComputerUseStats,
  deleteComputerUseEpisode,
  type ComputerUseEpisode,
  type SkillStat,
} from '../../api/client';

export function ComputerUseTab() {
  const queryClient = useQueryClient();
  const [selectedSession, setSelectedSession] = useState<string>('');

  const { data: stats, isLoading: statsLoading } = useQuery({
    queryKey: ['cu-stats'],
    queryFn: fetchComputerUseStats,
    staleTime: 30_000,
  });

  const { data: episodes = [], isLoading: epsLoading } = useQuery({
    queryKey: ['cu-episodes', selectedSession],
    queryFn: () =>
      fetchComputerUseEpisodes(
        selectedSession ? { sessionId: selectedSession, limit: 50 } : { limit: 50 }
      ),
    staleTime: 30_000,
  });

  const deleteMut = useMutation({
    mutationFn: deleteComputerUseEpisode,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['cu-episodes'] });
      void queryClient.invalidateQueries({ queryKey: ['cu-stats'] });
    },
  });

  const skillBreakdown: SkillStat[] = stats?.skillBreakdown ?? [];
  const totals = stats?.totals ?? { totalEpisodes: 0, avgReward: 0 };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Computer Use Episodes</h2>
        <p className="text-sm text-muted-foreground mt-1">
          State→action→reward tuples recorded by the Tauri desktop client.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-3 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Total Episodes</div>
          <div className="text-2xl font-semibold mt-1">
            {statsLoading ? '…' : totals.totalEpisodes}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Avg Reward</div>
          <div className="text-2xl font-semibold mt-1">
            {statsLoading ? '…' : totals.avgReward.toFixed(3)}
          </div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground">Skills</div>
          <div className="text-2xl font-semibold mt-1">
            {statsLoading ? '…' : skillBreakdown.length}
          </div>
        </div>
      </div>

      {/* Skill breakdown table */}
      {skillBreakdown.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Skill Breakdown</h3>
          <div className="overflow-x-auto rounded-lg border">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium">Skill</th>
                  <th className="text-right px-3 py-2 font-medium">Episodes</th>
                  <th className="text-right px-3 py-2 font-medium">Success %</th>
                  <th className="text-right px-3 py-2 font-medium">Avg Reward</th>
                </tr>
              </thead>
              <tbody>
                {skillBreakdown.map((s) => (
                  <tr
                    key={s.skillName}
                    className="border-t cursor-pointer hover:bg-muted/30"
                    onClick={() => {
                      setSelectedSession('');
                    }}
                  >
                    <td className="px-3 py-2 font-mono text-xs">{s.skillName}</td>
                    <td className="px-3 py-2 text-right">{s.episodeCount}</td>
                    <td className="px-3 py-2 text-right">{(s.successRate * 100).toFixed(1)}%</td>
                    <td className="px-3 py-2 text-right">{s.avgReward.toFixed(3)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Session replay */}
      <div>
        <div className="flex items-center gap-2 mb-2">
          <h3 className="text-sm font-medium">Session Replay</h3>
          <input
            type="text"
            value={selectedSession}
            onChange={(e) => {
              setSelectedSession(e.target.value);
            }}
            placeholder="Session ID…"
            className="px-2 py-1 text-xs border rounded bg-background flex-1 max-w-xs"
          />
        </div>

        {epsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading…
          </div>
        ) : episodes.length === 0 ? (
          <p className="text-sm text-muted-foreground">No episodes found.</p>
        ) : (
          <div className="space-y-2 max-h-96 overflow-y-auto pr-1">
            {episodes.map((ep: ComputerUseEpisode) => (
              <div key={ep.id} className="rounded-lg border p-3 flex items-start gap-3">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-muted px-1 rounded">{ep.actionType}</span>
                    <span className="text-xs text-muted-foreground truncate">
                      {ep.actionTarget}
                    </span>
                  </div>
                  {ep.actionValue && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">
                      {ep.actionValue}
                    </div>
                  )}
                  <div className="flex items-center gap-2 mt-1">
                    <span
                      className={`text-xs px-1.5 py-0.5 rounded-full font-medium ${
                        ep.reward > 0
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400'
                          : ep.reward < 0
                            ? 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400'
                            : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      r={ep.reward.toFixed(2)}
                    </span>
                    {ep.done && (
                      <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full">
                        done
                      </span>
                    )}
                    <span className="text-xs text-muted-foreground">{ep.skillName}</span>
                  </div>
                </div>
                <button
                  onClick={() => {
                    deleteMut.mutate(ep.id);
                  }}
                  disabled={deleteMut.isPending}
                  className="text-muted-foreground hover:text-destructive p-1"
                  title="Delete episode"
                >
                  <Trash2 className="w-3 h-3" />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
