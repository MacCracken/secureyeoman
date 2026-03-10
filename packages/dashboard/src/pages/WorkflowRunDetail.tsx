/**
 * WorkflowRunDetail — Live step timeline for a workflow run.
 *
 * Polls every 2s while status is 'running'. Shows step status icons,
 * duration, and collapsible input/output JSON sections.
 */

import { useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useQuery } from '@tanstack/react-query';
import {
  ChevronLeft,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  SkipForward,
  AlertCircle,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import { fetchWorkflowRun, type WorkflowStepRun } from '../api/client';

function statusIcon(status: string) {
  switch (status) {
    case 'completed':
      return <CheckCircle className="w-4 h-4 text-green-500" />;
    case 'failed':
      return <XCircle className="w-4 h-4 text-red-500" />;
    case 'running':
      return <Loader2 className="w-4 h-4 text-blue-500 animate-spin" />;
    case 'skipped':
      return <SkipForward className="w-4 h-4 text-muted-foreground" />;
    case 'pending':
      return <Clock className="w-4 h-4 text-muted-foreground" />;
    default:
      return <AlertCircle className="w-4 h-4 text-muted-foreground" />;
  }
}

function statusBadge(status: string) {
  const classes: Record<string, string> = {
    completed: 'bg-green-100 text-green-800',
    failed: 'bg-red-100 text-red-800',
    running: 'bg-blue-100 text-blue-800',
    pending: 'bg-gray-100 text-gray-600',
    cancelled: 'bg-orange-100 text-orange-800',
    skipped: 'bg-gray-100 text-gray-500',
  };
  return (
    <span
      className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${classes[status] ?? 'bg-gray-100 text-gray-600'}`}
    >
      {status}
    </span>
  );
}

function formatDuration(ms: number | null | undefined): string {
  if (ms === null || ms === undefined) return '—';
  if (ms < 1000) return `${ms}ms`;
  return `${(ms / 1000).toFixed(1)}s`;
}

function formatTs(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString();
}

function CollapsibleJSON({ label, value }: { label: string; value: unknown }) {
  const [open, setOpen] = useState(false);
  if (!value) return null;
  return (
    <div className="mt-2 border rounded-md overflow-hidden text-xs">
      <button
        onClick={() => {
          setOpen((v) => !v);
        }}
        className="w-full flex items-center justify-between px-3 py-1.5 bg-muted/30 hover:bg-muted/50 transition-colors font-medium text-muted-foreground"
      >
        {label}
        {open ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
      </button>
      {open && (
        <pre className="px-3 py-2 overflow-x-auto text-xs bg-background text-foreground">
          {JSON.stringify(value, null, 2)}
        </pre>
      )}
    </div>
  );
}

function StepRow({ step }: { step: WorkflowStepRun }) {
  return (
    <div className="px-4 py-3 border-b last:border-0">
      <div className="flex items-center gap-3">
        {statusIcon(step.status)}
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{step.stepName}</span>
            <span className="text-xs text-muted-foreground font-mono shrink-0">{step.stepId}</span>
          </div>
          <div className="flex items-center gap-3 mt-0.5 text-xs text-muted-foreground">
            <span className="capitalize">{step.stepType}</span>
            <span>·</span>
            <span>{formatDuration(step.durationMs)}</span>
            {step.error && (
              <>
                <span>·</span>
                <span className="text-red-600 truncate max-w-xs">{step.error}</span>
              </>
            )}
          </div>
        </div>
        {statusBadge(step.status)}
      </div>
      <CollapsibleJSON label="Input" value={step.input} />
      <CollapsibleJSON label="Output" value={step.output} />
    </div>
  );
}

export function WorkflowRunDetail() {
  const { runId } = useParams<{ runId: string }>();
  const navigate = useNavigate();

  const { data, isLoading, error } = useQuery({
    queryKey: ['workflow-run', runId],
    queryFn: () => fetchWorkflowRun(runId!),
    enabled: !!runId,
    refetchInterval: (query) => {
      const status = query.state.data?.run?.status;
      return status === 'running' || status === 'pending' ? 2000 : false;
    },
  });

  const run = data?.run;

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error || !run) {
    return (
      <div className="flex flex-col items-center justify-center h-64 text-muted-foreground gap-3">
        <AlertCircle className="w-8 h-8" />
        <p>Run not found or failed to load.</p>
        <button
          onClick={() => navigate('/workflows')}
          className="text-sm text-primary hover:underline"
        >
          Back to Workflows
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6 max-w-4xl mx-auto">
      {/* Header */}
      <div className="flex items-center gap-3">
        <button
          onClick={() => navigate(-1)}
          className="p-1.5 rounded-md hover:bg-muted/50 transition-colors"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-bold">{run.workflowName}</h1>
            {statusBadge(run.status)}
          </div>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">{run.id}</p>
        </div>
      </div>

      {/* Run metadata */}
      <div className="card p-4 grid grid-cols-2 sm:grid-cols-4 gap-4 text-sm">
        <div>
          <p className="text-xs text-muted-foreground">Triggered By</p>
          <p className="font-medium capitalize mt-0.5">{run.triggeredBy}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Created</p>
          <p className="font-medium mt-0.5">{formatTs(run.createdAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Started</p>
          <p className="font-medium mt-0.5">{formatTs(run.startedAt)}</p>
        </div>
        <div>
          <p className="text-xs text-muted-foreground">Completed</p>
          <p className="font-medium mt-0.5">{formatTs(run.completedAt)}</p>
        </div>
      </div>

      {/* Error banner */}
      {run.error && (
        <div className="flex items-start gap-2 px-4 py-3 rounded-lg bg-red-50 border border-red-200 text-red-800 text-sm">
          <XCircle className="w-4 h-4 mt-0.5 shrink-0" />
          <p className="font-medium">{run.error}</p>
        </div>
      )}

      {/* Step timeline */}
      <div className="card overflow-hidden">
        <div className="px-4 py-3 border-b">
          <h2 className="font-medium text-sm">Step Timeline</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            {run.stepRuns?.length ?? 0} step{(run.stepRuns?.length ?? 0) !== 1 ? 's' : ''}
          </p>
        </div>
        {!run.stepRuns || run.stepRuns.length === 0 ? (
          <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
            No steps have run yet.
          </div>
        ) : (
          <div>
            {run.stepRuns.map((step) => (
              <StepRow key={step.id} step={step} />
            ))}
          </div>
        )}
      </div>

      {/* Final output */}
      {run.output && (
        <div className="card p-4">
          <h2 className="font-medium text-sm mb-2">Final Output</h2>
          <pre className="text-xs bg-muted/30 p-3 rounded overflow-x-auto">
            {JSON.stringify(run.output, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
