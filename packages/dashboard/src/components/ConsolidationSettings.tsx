/**
 * ConsolidationSettings — Memory consolidation management UI.
 *
 * Provides cron schedule picker, trends chart, dry-run toggle,
 * manual run, and history table.
 */

import { useState, useEffect, useCallback, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Brain, Play, Loader2, TrendingDown, Layers, RefreshCw, Clock } from 'lucide-react';
import {
  runConsolidation,
  fetchConsolidationSchedule,
  updateConsolidationSchedule,
  fetchConsolidationHistory,
  fetchMemories,
} from '../api/client';

const SCHEDULE_PRESETS = [
  { label: 'Every night at 2 AM', value: '0 2 * * *' },
  { label: 'Every 6 hours', value: '0 */6 * * *' },
  { label: 'Every day at noon', value: '0 12 * * *' },
  { label: 'Weekly (Sunday 3 AM)', value: '0 3 * * 0' },
];

interface ConsolidationReport {
  timestamp: number;
  totalCandidates: number;
  summary: {
    merged: number;
    replaced: number;
    updated: number;
    keptSeparate: number;
    skipped: number;
  };
  dryRun: boolean;
  durationMs: number;
}

export default function ConsolidationSettings() {
  const queryClient = useQueryClient();
  const [customCron, setCustomCron] = useState('');
  const [dryRun, setDryRun] = useState(false);

  const { data: scheduleData } = useQuery({
    queryKey: ['consolidation-schedule'],
    queryFn: fetchConsolidationSchedule,
  });

  const { data: historyData } = useQuery({
    queryKey: ['consolidation-history'],
    queryFn: fetchConsolidationHistory,
    refetchInterval: 30000,
  });

  const { data: memoriesData } = useQuery({
    queryKey: ['memories-count'],
    queryFn: () => fetchMemories(),
    refetchInterval: 60000,
  });

  const scheduleMutation = useMutation({
    mutationFn: (cron: string) => updateConsolidationSchedule(cron),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consolidation-schedule'] }),
  });

  const runMutation = useMutation({
    mutationFn: () => runConsolidation(),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['consolidation-history'] }),
  });

  useEffect(() => {
    if (scheduleData?.schedule) {
      setCustomCron(scheduleData.schedule);
    }
  }, [scheduleData?.schedule]);

  const handlePresetSelect = useCallback(
    (value: string) => {
      setCustomCron(value);
      scheduleMutation.mutate(value);
    },
    [scheduleMutation]
  );

  const handleCustomSave = useCallback(() => {
    if (customCron.trim()) {
      scheduleMutation.mutate(customCron.trim());
    }
  }, [customCron, scheduleMutation]);

  const history = (historyData?.history ?? []) as ConsolidationReport[];
  const liveRuns = history.filter((r) => !r.dryRun);
  const totalMemories = memoriesData?.memories?.length ?? 0;

  // Compute trends from consolidation history
  const trends = useMemo(() => {
    const totalMerged = liveRuns.reduce((sum, r) => sum + (r.summary.merged ?? 0), 0);
    const totalReplaced = liveRuns.reduce((sum, r) => sum + (r.summary.replaced ?? 0), 0);
    const totalUpdated = liveRuns.reduce((sum, r) => sum + (r.summary.updated ?? 0), 0);
    const totalCandidates = liveRuns.reduce((sum, r) => sum + r.totalCandidates, 0);
    const avgDuration =
      liveRuns.length > 0
        ? Math.round(liveRuns.reduce((sum, r) => sum + r.durationMs, 0) / liveRuns.length)
        : 0;
    return { totalMerged, totalReplaced, totalUpdated, totalCandidates, avgDuration };
  }, [liveRuns]);

  return (
    <div className="space-y-6">
      {/* Memory Stats Overview */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          icon={<Brain className="w-4 h-4 text-primary" />}
          label="Total Memories"
          value={totalMemories.toLocaleString()}
        />
        <StatCard
          icon={<Layers className="w-4 h-4 text-blue-500" />}
          label="Total Merged"
          value={trends.totalMerged.toLocaleString()}
        />
        <StatCard
          icon={<TrendingDown className="w-4 h-4 text-success" />}
          label="Consolidation Runs"
          value={liveRuns.length.toLocaleString()}
        />
        <StatCard
          icon={<Clock className="w-4 h-4 text-muted-foreground" />}
          label="Avg Duration"
          value={`${trends.avgDuration}ms`}
        />
      </div>

      {/* Trends Bar Chart (simple CSS bars) */}
      {liveRuns.length > 0 && (
        <div className="card">
          <div className="card-header">
            <h3 className="card-title text-sm">Consolidation Trends</h3>
            <p className="card-description text-xs">Actions per run over time</p>
          </div>
          <div className="card-content">
            <div className="space-y-2">
              {liveRuns.slice(-10).map((run, i) => {
                const total =
                  (run.summary.merged ?? 0) +
                  (run.summary.replaced ?? 0) +
                  (run.summary.updated ?? 0) +
                  (run.summary.keptSeparate ?? 0);
                const maxBar = Math.max(total, 1);
                return (
                  <div key={i} className="flex items-center gap-3">
                    <span className="text-xs text-muted-foreground w-28 shrink-0 tabular-nums">
                      {new Date(run.timestamp).toLocaleDateString(undefined, {
                        month: 'short',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                    <div className="flex-1 flex h-4 rounded-full overflow-hidden bg-muted/30">
                      {run.summary.merged > 0 && (
                        <div
                          className="bg-blue-500 h-full"
                          style={{ width: `${(run.summary.merged / maxBar) * 100}%` }}
                          title={`Merged: ${run.summary.merged}`}
                        />
                      )}
                      {run.summary.replaced > 0 && (
                        <div
                          className="bg-orange-500 h-full"
                          style={{ width: `${(run.summary.replaced / maxBar) * 100}%` }}
                          title={`Replaced: ${run.summary.replaced}`}
                        />
                      )}
                      {run.summary.updated > 0 && (
                        <div
                          className="bg-green-500 h-full"
                          style={{ width: `${(run.summary.updated / maxBar) * 100}%` }}
                          title={`Updated: ${run.summary.updated}`}
                        />
                      )}
                      {(run.summary.keptSeparate ?? 0) > 0 && (
                        <div
                          className="bg-muted-foreground/20 h-full"
                          style={{
                            width: `${((run.summary.keptSeparate ?? 0) / maxBar) * 100}%`,
                          }}
                          title={`Kept: ${run.summary.keptSeparate}`}
                        />
                      )}
                    </div>
                    <span className="text-xs text-muted-foreground w-8 text-right">{total}</span>
                  </div>
                );
              })}
            </div>
            <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-500" /> Merged
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-orange-500" /> Replaced
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-green-500" /> Updated
              </span>
              <span className="flex items-center gap-1">
                <span className="w-2.5 h-2.5 rounded-full bg-muted-foreground/20" /> Kept
              </span>
            </div>
          </div>
        </div>
      )}

      {/* Schedule Section */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title text-sm">Consolidation Schedule</h3>
        </div>
        <div className="card-content space-y-4">
          <div className="grid grid-cols-2 gap-2">
            {SCHEDULE_PRESETS.map((preset) => (
              <button
                key={preset.value}
                onClick={() => {
                  handlePresetSelect(preset.value);
                }}
                className={`px-3 py-2 rounded-lg text-sm border transition-colors ${
                  customCron === preset.value
                    ? 'border-primary bg-primary/10 text-primary'
                    : 'border-border hover:border-primary/30'
                }`}
              >
                {preset.label}
              </button>
            ))}
          </div>

          <div className="flex gap-2">
            <input
              type="text"
              value={customCron}
              onChange={(e) => {
                setCustomCron(e.target.value);
              }}
              placeholder="Custom cron expression"
              className="flex-1 bg-card border border-border rounded-lg px-3 py-2 text-sm"
            />
            <button
              onClick={handleCustomSave}
              disabled={scheduleMutation.isPending}
              className="btn btn-primary text-sm"
            >
              Save
            </button>
          </div>

          {scheduleData?.schedule && (
            <p className="text-xs text-muted-foreground">
              Current:{' '}
              <code className="bg-muted px-1.5 py-0.5 rounded">{scheduleData.schedule}</code>
            </p>
          )}
        </div>
      </div>

      {/* Run Controls */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title text-sm">Manual Consolidation</h3>
        </div>
        <div className="card-content space-y-3">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => {
                setDryRun(e.target.checked);
              }}
              className="rounded"
            />
            Dry run (preview only)
          </label>

          <button
            onClick={() => {
              runMutation.mutate();
            }}
            disabled={runMutation.isPending}
            className="flex items-center gap-2 btn btn-primary text-sm"
          >
            {runMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              <Play className="w-4 h-4" />
            )}
            {runMutation.isPending ? 'Running...' : 'Run Now'}
          </button>

          {runMutation.isSuccess && (
            <p className="text-sm text-success">Consolidation completed successfully.</p>
          )}
          {runMutation.isError && (
            <p className="text-sm text-destructive">
              Consolidation failed. Check logs for details.
            </p>
          )}
        </div>
      </div>

      {/* History Table */}
      <div className="card">
        <div className="card-header">
          <h3 className="card-title text-sm">Consolidation History</h3>
          <p className="card-description text-xs">
            {history.length} run{history.length !== 1 ? 's' : ''} recorded
          </p>
        </div>
        <div className="card-content">
          {history.length === 0 ? (
            <div className="text-center py-8">
              <RefreshCw className="w-8 h-8 mx-auto text-muted-foreground mb-2" />
              <p className="text-sm text-muted-foreground">No consolidation runs yet.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-border text-left">
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Time</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Candidates</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Merged</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Replaced</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Updated</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Kept</th>
                    <th className="pb-2 pr-4 font-medium text-muted-foreground">Duration</th>
                    <th className="pb-2 font-medium text-muted-foreground">Mode</th>
                  </tr>
                </thead>
                <tbody>
                  {history.map((report, i) => (
                    <tr key={i} className="border-b border-border/50">
                      <td className="py-2 pr-4 tabular-nums">
                        {new Date(report.timestamp).toLocaleString()}
                      </td>
                      <td className="py-2 pr-4">{report.totalCandidates}</td>
                      <td className="py-2 pr-4 text-blue-500">{report.summary.merged}</td>
                      <td className="py-2 pr-4 text-orange-500">{report.summary.replaced}</td>
                      <td className="py-2 pr-4 text-green-500">{report.summary.updated}</td>
                      <td className="py-2 pr-4 text-muted-foreground">
                        {report.summary.keptSeparate}
                      </td>
                      <td className="py-2 pr-4 font-mono">{report.durationMs}ms</td>
                      <td className="py-2">
                        <span
                          className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            report.dryRun
                              ? 'bg-warning/10 text-warning'
                              : 'bg-success/10 text-success'
                          }`}
                        >
                          {report.dryRun ? 'Dry Run' : 'Live'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="p-3 rounded-lg bg-muted/30">
      <div className="flex items-center gap-2 mb-1">
        {icon}
        <span className="text-xs text-muted-foreground">{label}</span>
      </div>
      <p className="text-lg font-bold">{value}</p>
    </div>
  );
}
