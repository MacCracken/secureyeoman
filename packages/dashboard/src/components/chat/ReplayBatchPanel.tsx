import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Loader2, CheckCircle2, XCircle, Clock, BarChart3 } from 'lucide-react';
import {
  createReplayBatch,
  fetchReplayJobs,
  fetchReplayReport,
} from '../../api/client';
import type { ReplayJob, ReplayBatchReport } from '../../types';

interface ReplayBatchPanelProps {
  selectedConversationIds: string[];
  onClearSelection: () => void;
}

function StatusIcon({ status }: { status: ReplayJob['status'] }) {
  switch (status) {
    case 'completed':
      return <CheckCircle2 className="w-4 h-4 text-success" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-destructive" />;
    case 'running':
      return <Loader2 className="w-4 h-4 animate-spin text-primary" />;
    default:
      return <Clock className="w-4 h-4 text-muted-foreground" />;
  }
}

export function ReplayBatchPanel({
  selectedConversationIds,
  onClearSelection,
}: ReplayBatchPanelProps) {
  const queryClient = useQueryClient();
  const [model, setModel] = useState('');
  const [provider, setProvider] = useState('');
  const [viewingReportId, setViewingReportId] = useState<string | null>(null);

  const { data: jobsData } = useQuery({
    queryKey: ['replay-jobs'],
    queryFn: fetchReplayJobs,
    refetchInterval: 5000,
  });

  const { data: report } = useQuery<ReplayBatchReport>({
    queryKey: ['replay-report', viewingReportId],
    queryFn: () => fetchReplayReport(viewingReportId!),
    enabled: !!viewingReportId,
  });

  const batchMutation = useMutation({
    mutationFn: () =>
      createReplayBatch({
        sourceConversationIds: selectedConversationIds,
        replayModel: model,
        replayProvider: provider,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['replay-jobs'] });
      onClearSelection();
    },
  });

  const handleSubmit = useCallback(() => {
    if (selectedConversationIds.length > 0 && model && provider) {
      batchMutation.mutate();
    }
  }, [selectedConversationIds, model, provider, batchMutation]);

  const jobs = jobsData?.jobs ?? [];

  return (
    <div className="space-y-4 p-4" data-testid="replay-batch-panel">
      {/* Batch config */}
      <div className="border rounded-lg p-4 space-y-3">
        <h4 className="text-sm font-semibold">Batch Replay</h4>
        <div className="text-xs text-muted-foreground">
          {selectedConversationIds.length} conversation{selectedConversationIds.length !== 1 ? 's' : ''} selected
        </div>

        <div className="grid grid-cols-2 gap-2">
          <input
            type="text"
            value={model}
            onChange={(e) => setModel(e.target.value)}
            placeholder="Model"
            className="border rounded px-2 py-1.5 text-sm bg-background"
            data-testid="batch-model-input"
          />
          <input
            type="text"
            value={provider}
            onChange={(e) => setProvider(e.target.value)}
            placeholder="Provider"
            className="border rounded px-2 py-1.5 text-sm bg-background"
            data-testid="batch-provider-input"
          />
        </div>

        <button
          onClick={handleSubmit}
          disabled={selectedConversationIds.length === 0 || !model || !provider || batchMutation.isPending}
          className="w-full px-3 py-2 text-sm bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 flex items-center justify-center gap-2"
          data-testid="batch-submit"
        >
          {batchMutation.isPending ? (
            <Loader2 className="w-4 h-4 animate-spin" />
          ) : (
            <Play className="w-4 h-4" />
          )}
          Start Batch Replay
        </button>
      </div>

      {/* Job list */}
      <div className="border rounded-lg p-4 space-y-2">
        <h4 className="text-sm font-semibold">Replay Jobs</h4>
        {jobs.length === 0 ? (
          <div className="text-xs text-muted-foreground">No replay jobs yet</div>
        ) : (
          <div className="space-y-1.5" data-testid="job-list">
            {jobs.map((job) => (
              <div
                key={job.id}
                className="flex items-center justify-between text-xs border rounded px-2 py-1.5"
              >
                <div className="flex items-center gap-2">
                  <StatusIcon status={job.status} />
                  <span className="font-mono truncate max-w-[120px]">{job.replayModel}</span>
                  <span className="text-muted-foreground">
                    {job.completedConversations}/{job.totalConversations}
                  </span>
                </div>
                {job.status === 'completed' && (
                  <button
                    onClick={() => setViewingReportId(job.id)}
                    className="flex items-center gap-1 text-primary hover:underline"
                    data-testid={`view-report-${job.id}`}
                  >
                    <BarChart3 className="w-3 h-3" /> Report
                  </button>
                )}
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Report view */}
      {report && (
        <div className="border rounded-lg p-4 space-y-3" data-testid="report-view">
          <h4 className="text-sm font-semibold">Report: {report.job.replayModel}</h4>
          <div className="grid grid-cols-3 gap-2 text-center text-xs">
            <div className="border rounded p-2">
              <div className="text-lg font-bold text-blue-500">{report.summary.sourceWins}</div>
              <div className="text-muted-foreground">Source Wins</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold text-green-500">{report.summary.replayWins}</div>
              <div className="text-muted-foreground">Replay Wins</div>
            </div>
            <div className="border rounded p-2">
              <div className="text-lg font-bold text-yellow-500">{report.summary.ties}</div>
              <div className="text-muted-foreground">Ties</div>
            </div>
          </div>
          {report.summary.avgSourceQuality != null && report.summary.avgReplayQuality != null && (
            <div className="text-xs text-muted-foreground">
              Avg quality — Source: {report.summary.avgSourceQuality.toFixed(3)} | Replay:{' '}
              {report.summary.avgReplayQuality.toFixed(3)}
            </div>
          )}
          <table className="w-full text-xs" data-testid="report-table">
            <thead>
              <tr className="border-b">
                <th className="text-left py-1">Source</th>
                <th className="text-left py-1">Replay Model</th>
                <th className="text-left py-1">Winner</th>
              </tr>
            </thead>
            <tbody>
              {report.results.map((r) => (
                <tr key={r.id} className="border-b">
                  <td className="py-1 font-mono truncate max-w-[100px]">{r.sourceConversationId.slice(0, 8)}</td>
                  <td className="py-1">{r.replayModel}</td>
                  <td className="py-1">{r.pairwiseWinner ?? '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
