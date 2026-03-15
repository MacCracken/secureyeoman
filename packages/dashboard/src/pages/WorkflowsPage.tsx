/**
 * WorkflowsPage — List and manage workflow definitions.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  GitMerge,
  Play,
  Plus,
  Trash2,
  CheckCircle,
  XCircle,
  Loader2,
  AlertTriangle,
} from 'lucide-react';
import {
  fetchWorkflows,
  triggerWorkflow,
  deleteWorkflow,
  type WorkflowDefinition,
} from '../api/client';

export function WorkflowsPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [runningId, setRunningId] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['workflows'],
    queryFn: () => fetchWorkflows({ limit: 50 }),
  });

  const triggerMutation = useMutation({
    mutationFn: (id: string) => triggerWorkflow(id),
    onSuccess: (result) => {
      const runId = result.run.id;
      setToast({ message: `Run started: ${runId}`, type: 'success' });
      setRunningId(null);
      setTimeout(() => void navigate(`/workflows/runs/${runId}`), 1200);
    },
    onError: (err) => {
      setToast({
        message: err instanceof Error ? err.message : 'Failed to trigger workflow',
        type: 'error',
      });
      setRunningId(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteWorkflow(id),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['workflows'] });
    },
  });

  const definitions = data?.definitions ?? [];
  const total = data?.total ?? 0;
  const enabled = definitions.filter((d) => d.isEnabled).length;

  function handleRun(def: WorkflowDefinition) {
    setRunningId(def.id);
    triggerMutation.mutate(def.id);
  }

  return (
    <div className="space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <GitMerge className="w-6 h-6 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Workflows</h1>
            <p className="text-sm text-muted-foreground">DAG-based deterministic automation</p>
          </div>
        </div>
        <button
          onClick={() => void navigate('/workflows/new/builder')}
          className="btn btn-ghost flex items-center gap-2 text-sm font-medium"
        >
          <Plus className="w-4 h-4" />
          New Workflow
        </button>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className={`flex items-center gap-2 px-4 py-3 rounded-lg text-sm font-medium ${
            toast.type === 'success'
              ? 'bg-green-50 text-green-800 border border-green-200'
              : 'bg-red-50 text-red-800 border border-red-200'
          }`}
        >
          {toast.type === 'success' ? (
            <CheckCircle className="w-4 h-4" />
          ) : (
            <AlertTriangle className="w-4 h-4" />
          )}
          {toast.message}
          <button
            onClick={() => {
              setToast(null);
            }}
            className="ml-auto text-current opacity-60 hover:opacity-100"
          >
            ×
          </button>
        </div>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Total</p>
          <p className="text-3xl font-bold mt-1">{total}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Enabled</p>
          <p className="text-3xl font-bold mt-1 text-green-600">{enabled}</p>
        </div>
        <div className="card p-4">
          <p className="text-xs text-muted-foreground uppercase tracking-wide">Disabled</p>
          <p className="text-3xl font-bold mt-1 text-muted-foreground">{total - enabled}</p>
        </div>
      </div>

      {/* Table */}
      <div className="card overflow-hidden">
        {isLoading ? (
          <div className="flex items-center justify-center py-16">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : definitions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-muted-foreground gap-3">
            <GitMerge className="w-10 h-10 opacity-30" />
            <p className="text-sm">No workflows yet. Create one to get started.</p>
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b text-left text-muted-foreground text-xs uppercase tracking-wide">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Steps</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody>
              {definitions.map((def) => (
                <tr
                  key={def.id}
                  className="border-b last:border-0 hover:bg-muted/30 transition-colors"
                >
                  <td className="px-4 py-3">
                    <button
                      onClick={() => void navigate(`/workflows/${def.id}/builder`)}
                      className="font-medium hover:text-primary transition-colors text-left"
                    >
                      {def.name}
                    </button>
                    {def.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate max-w-xs">
                        {def.description}
                      </p>
                    )}
                  </td>
                  <td className="px-4 py-3 text-muted-foreground">{def.steps.length}</td>
                  <td className="px-4 py-3">
                    {def.isEnabled ? (
                      <span className="flex items-center gap-1.5 text-green-600 text-xs font-medium">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Enabled
                      </span>
                    ) : (
                      <span className="flex items-center gap-1.5 text-muted-foreground text-xs font-medium">
                        <XCircle className="w-3.5 h-3.5" />
                        Disabled
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        onClick={() => {
                          handleRun(def);
                        }}
                        disabled={runningId === def.id || !def.isEnabled}
                        className="btn btn-ghost flex items-center gap-1.5 text-xs font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                        title="Run workflow"
                      >
                        {runningId === def.id ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          <Play className="w-3 h-3" />
                        )}
                        Run
                      </button>
                      <button
                        onClick={() => void navigate(`/workflows/${def.id}/builder`)}
                        className="px-3 py-1.5 rounded-md text-xs font-medium border hover:bg-muted/50 transition-colors"
                      >
                        Edit
                      </button>
                      <button
                        onClick={() => {
                          if (confirm(`Delete workflow "${def.name}"?`)) {
                            deleteMutation.mutate(def.id);
                          }
                        }}
                        className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                        title="Delete workflow"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
