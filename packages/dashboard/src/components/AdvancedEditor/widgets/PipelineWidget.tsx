import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { CheckCircle, XCircle, Loader2, Clock, GitMerge } from 'lucide-react';

interface WorkflowStep {
  id: string;
  name: string;
  type: string;
  status: string;
}

interface WorkflowRun {
  id: string;
  workflowId: string;
  status: string;
  startedAt: string;
  steps?: WorkflowStep[];
}

async function fetchRun(id: string): Promise<WorkflowRun> {
  const token = localStorage.getItem('accessToken') ?? '';
  const res = await fetch(`/api/v1/workflows/runs/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error('Failed to fetch run');
  return res.json() as Promise<WorkflowRun>;
}

async function fetchRecentRuns(): Promise<{ runs: WorkflowRun[] }> {
  const token = localStorage.getItem('accessToken') ?? '';
  const res = await fetch('/api/v1/workflows/runs?limit=20', {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) return { runs: [] };
  return res.json() as Promise<{ runs: WorkflowRun[] }>;
}

function StepIcon({ status }: { status: string }) {
  if (status === 'completed') return <CheckCircle className="w-3.5 h-3.5 text-green-500" />;
  if (status === 'failed') return <XCircle className="w-3.5 h-3.5 text-red-500" />;
  if (status === 'running') return <Loader2 className="w-3.5 h-3.5 text-blue-500 animate-spin" />;
  return <Clock className="w-3.5 h-3.5 text-muted-foreground" />;
}

interface Props {
  workflowRunId?: string;
  onConfigChange?: (runId: string) => void;
}

export function PipelineWidget({ workflowRunId, onConfigChange }: Props) {
  const [selectedRunId, setSelectedRunId] = useState(workflowRunId ?? '');

  const { data: recentRuns } = useQuery({
    queryKey: ['canvas-workflow-runs-list'],
    queryFn: fetchRecentRuns,
    enabled: !selectedRunId,
  });

  const { data: runDetail, isLoading } = useQuery({
    queryKey: ['canvas-workflow-run', selectedRunId],
    queryFn: () => fetchRun(selectedRunId),
    enabled: !!selectedRunId,
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'running' || status === 'pending' ? 2000 : false;
    },
  });

  if (!selectedRunId) {
    return (
      <div className="flex flex-col h-full p-3 space-y-2 text-xs">
        <div className="flex items-center gap-1.5 font-medium">
          <GitMerge className="w-3.5 h-3.5" />
          Select a workflow run
        </div>
        <div className="flex-1 overflow-auto space-y-1">
          {(recentRuns?.runs ?? []).map((run) => (
            <button
              key={run.id}
              onClick={() => {
                setSelectedRunId(run.id);
                onConfigChange?.(run.id);
              }}
              className="w-full text-left p-2 rounded border hover:bg-muted/50 text-[11px]"
            >
              <div className="font-mono text-[10px] text-muted-foreground">
                {run.id.slice(0, 8)}
              </div>
              <div className="flex items-center gap-1">
                <span
                  className={
                    run.status === 'completed'
                      ? 'text-green-500'
                      : run.status === 'failed'
                        ? 'text-red-500'
                        : 'text-blue-500'
                  }
                >
                  {run.status}
                </span>
              </div>
            </button>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col h-full p-3 space-y-2 text-xs">
      <div className="flex items-center gap-1.5">
        <GitMerge className="w-3.5 h-3.5" />
        <span className="font-mono text-[10px] text-muted-foreground">
          {selectedRunId.slice(0, 8)}
        </span>
        <button
          onClick={() => {
            setSelectedRunId('');
            onConfigChange?.('');
          }}
          className="ml-auto text-[10px] text-muted-foreground hover:text-foreground"
        >
          Change
        </button>
      </div>
      {isLoading && <Loader2 className="animate-spin w-4 h-4" />}
      <div className="flex-1 overflow-auto space-y-1">
        {(runDetail?.steps ?? []).map((step) => (
          <div key={step.id} className="flex items-center gap-2 p-1.5 rounded border text-[11px]">
            <StepIcon status={step.status} />
            <span className="flex-1 truncate">{step.name}</span>
            <span className="text-[9px] text-muted-foreground">{step.type}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
