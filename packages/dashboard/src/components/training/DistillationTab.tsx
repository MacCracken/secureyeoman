import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Play, Trash2, Loader2, AlertCircle } from 'lucide-react';
import {
  fetchDistillationJobs,
  createDistillationJob,
  deleteDistillationJob,
  runDistillationJob,
  type DistillationJob,
} from '../../api/client';
import { StatusChip } from './StatusChip';

function DistillationJobCard({
  job,
  onDelete,
  onRun,
  isRunning: isRunPending,
}: {
  job: DistillationJob;
  onDelete: () => void;
  onRun: () => void;
  isRunning: boolean;
}) {
  const progress =
    job.maxSamples > 0 ? Math.round((job.samplesGenerated / job.maxSamples) * 100) : 0;
  const canRun = job.status === 'pending' || job.status === 'failed';

  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm">{job.name}</p>
          <p className="text-xs text-muted-foreground">
            {job.teacherProvider}/{job.teacherModel} · {job.exportFormat}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={job.status} />
          {canRun && (
            <button
              onClick={onRun}
              disabled={isRunPending}
              className="p-1 hover:bg-primary/10 hover:text-primary rounded"
              title={job.status === 'failed' ? 'Retry job' : 'Run job'}
            >
              {isRunPending ? (
                <Loader2 className="w-3 h-3 animate-spin" />
              ) : (
                <Play className="w-3 h-3" />
              )}
            </button>
          )}
          <button
            onClick={onDelete}
            className="p-1 hover:bg-destructive/10 hover:text-destructive rounded"
            title="Delete job"
          >
            <Trash2 className="w-3 h-3" />
          </button>
        </div>
      </div>

      {(job.status === 'running' || job.status === 'complete') && (
        <div>
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span>
              {job.samplesGenerated} / {job.maxSamples} samples
            </span>
            <span>{progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded">
            <div
              className="h-1.5 bg-primary rounded transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      )}

      {job.status === 'complete' && (
        <p className="text-xs text-muted-foreground">Output: {job.outputPath}</p>
      )}

      {job.errorMessage && <p className="text-xs text-destructive">{job.errorMessage}</p>}
    </div>
  );
}

export function DistillationTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    teacherProvider: 'anthropic',
    teacherModel: 'claude-opus-4-6',
    exportFormat: 'sharegpt' as 'sharegpt' | 'instruction',
    maxSamples: '500',
    outputPath: '/tmp/distillation-output.jsonl',
    priorityMode: 'uniform' as 'failure-first' | 'uniform' | 'success-first',
    curriculumMode: false,
    counterfactualMode: false,
    maxCounterfactualSamples: '50',
  });

  const {
    data: jobs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['distillation-jobs'],
    queryFn: fetchDistillationJobs,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      return jobs.some((j) => j.status === 'running' || j.status === 'pending') ? 3000 : false;
    },
  });

  const createMut = useMutation({
    mutationFn: createDistillationJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['distillation-jobs'] });
      setShowForm(false);
      setForm((f) => ({ ...f, name: '' }));
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteDistillationJob,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['distillation-jobs'] }),
  });

  const runMut = useMutation({
    mutationFn: runDistillationJob,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['distillation-jobs'] }),
  });

  const handleCreate = () => {
    createMut.mutate({
      name: form.name,
      teacherProvider: form.teacherProvider,
      teacherModel: form.teacherModel,
      exportFormat: form.exportFormat,
      maxSamples: Number(form.maxSamples) || 500,
      outputPath: form.outputPath,
      priorityMode: form.priorityMode,
      curriculumMode: form.curriculumMode,
      counterfactualMode: form.counterfactualMode,
      maxCounterfactualSamples: Number(form.maxCounterfactualSamples) || 50,
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Model Distillation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate high-quality training pairs by calling a teacher LLM on your conversation
            history.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
          }}
          className="btn btn-ghost flex items-center gap-2 text-sm"
        >
          <Play className="w-4 h-4" />
          New Job
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3 border-primary/30">
          <h3 className="text-sm font-semibold">Create Distillation Job</h3>
          <div className="grid grid-cols-2 gap-3">
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Job Name</label>
              <input
                type="text"
                value={form.name}
                onChange={(e) => {
                  setForm((f) => ({ ...f, name: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="e.g. claude-opus distillation"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teacher Provider</label>
              <select
                value={form.teacherProvider}
                onChange={(e) => {
                  setForm((f) => ({ ...f, teacherProvider: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              >
                <option value="anthropic">Anthropic</option>
                <option value="openai">OpenAI</option>
                <option value="gemini">Gemini</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teacher Model</label>
              <input
                type="text"
                value={form.teacherModel}
                onChange={(e) => {
                  setForm((f) => ({ ...f, teacherModel: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="claude-opus-4-6"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Export Format</label>
              <select
                value={form.exportFormat}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    exportFormat: e.target.value as 'sharegpt' | 'instruction',
                  }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              >
                <option value="sharegpt">ShareGPT JSONL</option>
                <option value="instruction">Instruction JSONL</option>
              </select>
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Max Samples</label>
              <input
                type="number"
                value={form.maxSamples}
                onChange={(e) => {
                  setForm((f) => ({ ...f, maxSamples: e.target.value }));
                }}
                min={1}
                max={10000}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Output Path</label>
              <input
                type="text"
                value={form.outputPath}
                onChange={(e) => {
                  setForm((f) => ({ ...f, outputPath: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="/data/distillation.jsonl"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Priority Mode</label>
              <select
                value={form.priorityMode}
                onChange={(e) => {
                  setForm((f) => ({
                    ...f,
                    priorityMode: e.target.value as 'failure-first' | 'uniform' | 'success-first',
                  }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              >
                <option value="uniform">Uniform</option>
                <option value="failure-first">Failure-first</option>
                <option value="success-first">Success-first</option>
              </select>
            </div>
            <div className="flex flex-col gap-2 pt-4">
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.curriculumMode}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, curriculumMode: e.target.checked }));
                  }}
                />
                Curriculum mode
              </label>
              <label className="flex items-center gap-2 text-xs cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.counterfactualMode}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, counterfactualMode: e.target.checked }));
                  }}
                />
                Counterfactual mode
              </label>
            </div>
            {form.counterfactualMode && (
              <div>
                <label className="text-xs text-muted-foreground">Max Counterfactual Samples</label>
                <input
                  type="number"
                  value={form.maxCounterfactualSamples}
                  onChange={(e) => {
                    setForm((f) => ({ ...f, maxCounterfactualSamples: e.target.value }));
                  }}
                  min={1}
                  max={500}
                  className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                />
              </div>
            )}
          </div>
          {createMut.isError && (
            <p className="text-xs text-destructive">
              {createMut.error instanceof Error ? createMut.error.message : 'Failed to create job'}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setShowForm(false);
              }}
              className="btn btn-ghost text-sm"
            >
              Cancel
            </button>
            <button
              onClick={handleCreate}
              disabled={createMut.isPending || !form.name.trim()}
              className="btn btn-ghost text-sm flex items-center gap-1"
            >
              {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Create Job
            </button>
          </div>
        </div>
      )}

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading…
        </div>
      ) : error ? (
        <div className="flex items-center gap-2 text-sm text-destructive">
          <AlertCircle className="w-4 h-4" /> Could not load jobs
        </div>
      ) : jobs.length === 0 ? (
        <p className="text-sm text-muted-foreground">No distillation jobs yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <DistillationJobCard
              key={job.id}
              job={job}
              onDelete={() => {
                deleteMut.mutate(job.id);
              }}
              onRun={() => {
                runMut.mutate(job.id);
              }}
              isRunning={runMut.isPending && runMut.variables === job.id}
            />
          ))}
        </div>
      )}
    </div>
  );
}
