/**
 * ConsolidationSettings — Memory consolidation management UI.
 *
 * Provides cron schedule picker, threshold visualization,
 * dry-run toggle, manual run, and history table.
 */

import { useState, useEffect, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  runConsolidation,
  fetchConsolidationSchedule,
  updateConsolidationSchedule,
  fetchConsolidationHistory,
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
    [scheduleMutation],
  );

  const handleCustomSave = useCallback(() => {
    if (customCron.trim()) {
      scheduleMutation.mutate(customCron.trim());
    }
  }, [customCron, scheduleMutation]);

  const history = (historyData?.history ?? []) as ConsolidationReport[];

  return (
    <div className="space-y-6">
      {/* Schedule Section */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Consolidation Schedule</h3>

        <div className="grid grid-cols-2 gap-2 mb-4">
          {SCHEDULE_PRESETS.map((preset) => (
            <button
              key={preset.value}
              onClick={() => handlePresetSelect(preset.value)}
              className={`px-3 py-2 rounded text-sm border transition-colors ${
                customCron === preset.value
                  ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'border-gray-200 dark:border-gray-700 hover:border-gray-300'
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
            onChange={(e) => setCustomCron(e.target.value)}
            placeholder="Custom cron expression"
            className="flex-1 px-3 py-2 border rounded text-sm dark:bg-gray-700 dark:border-gray-600"
          />
          <button
            onClick={handleCustomSave}
            disabled={scheduleMutation.isPending}
            className="px-4 py-2 bg-blue-600 text-white rounded text-sm hover:bg-blue-700 disabled:opacity-50"
          >
            Save
          </button>
        </div>

        {scheduleData?.schedule && (
          <p className="mt-2 text-sm text-gray-500">
            Current: <code className="bg-gray-100 dark:bg-gray-700 px-1 rounded">{scheduleData.schedule}</code>
          </p>
        )}
      </div>

      {/* Run Controls */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Manual Consolidation</h3>

        <div className="flex items-center gap-4 mb-4">
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={dryRun}
              onChange={(e) => setDryRun(e.target.checked)}
              className="rounded"
            />
            Dry run (preview only)
          </label>
        </div>

        <button
          onClick={() => runMutation.mutate()}
          disabled={runMutation.isPending}
          className="px-4 py-2 bg-green-600 text-white rounded text-sm hover:bg-green-700 disabled:opacity-50"
        >
          {runMutation.isPending ? 'Running...' : 'Run Now'}
        </button>

        {runMutation.isSuccess && (
          <p className="mt-2 text-sm text-green-600">Consolidation completed successfully.</p>
        )}
        {runMutation.isError && (
          <p className="mt-2 text-sm text-red-600">Consolidation failed. Check logs for details.</p>
        )}
      </div>

      {/* History Table */}
      <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-sm">
        <h3 className="text-lg font-semibold mb-4">Consolidation History</h3>

        {history.length === 0 ? (
          <p className="text-sm text-gray-500">No consolidation runs yet.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b dark:border-gray-700 text-left">
                  <th className="pb-2 pr-4">Time</th>
                  <th className="pb-2 pr-4">Candidates</th>
                  <th className="pb-2 pr-4">Merged</th>
                  <th className="pb-2 pr-4">Replaced</th>
                  <th className="pb-2 pr-4">Updated</th>
                  <th className="pb-2 pr-4">Kept</th>
                  <th className="pb-2 pr-4">Duration</th>
                  <th className="pb-2">Mode</th>
                </tr>
              </thead>
              <tbody>
                {history.map((report, i) => (
                  <tr key={i} className="border-b dark:border-gray-700/50">
                    <td className="py-2 pr-4">{new Date(report.timestamp).toLocaleString()}</td>
                    <td className="py-2 pr-4">{report.totalCandidates}</td>
                    <td className="py-2 pr-4 text-blue-600">{report.summary.merged}</td>
                    <td className="py-2 pr-4 text-orange-600">{report.summary.replaced}</td>
                    <td className="py-2 pr-4 text-green-600">{report.summary.updated}</td>
                    <td className="py-2 pr-4 text-gray-600">{report.summary.keptSeparate}</td>
                    <td className="py-2 pr-4">{report.durationMs}ms</td>
                    <td className="py-2">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${
                          report.dryRun
                            ? 'bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-300'
                            : 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300'
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
  );
}
