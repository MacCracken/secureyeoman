import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Trash2,
  Loader2,
  AlertCircle,
  CheckCircle2,
  Cpu,
} from 'lucide-react';
import {
  fetchFinetuneJobs,
  createFinetuneJob,
  deleteFinetuneJob,
  registerFinetuneAdapter,
  type FinetuneJob,
} from '../../api/client';
import { StatusChip } from './StatusChip';

function FinetuneJobCard({
  job,
  onDelete,
  onRegister,
  onViewLogs,
  showLogs,
}: {
  job: FinetuneJob;
  onDelete: () => void;
  onRegister: () => void;
  onViewLogs: () => void;
  showLogs: boolean;
}) {
  return (
    <div className="card p-4 space-y-2">
      <div className="flex items-start justify-between">
        <div>
          <p className="font-medium text-sm">{job.name}</p>
          <p className="text-xs text-muted-foreground">
            {job.baseModel} → <span className="font-mono">{job.adapterName}</span>
            {' · '}rank={job.loraRank} · {job.epochs} epochs
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusChip status={job.status} />
          {job.status === 'running' && (
            <button
              onClick={onViewLogs}
              className="btn-ghost p-1 rounded text-xs flex items-center gap-1"
            >
              <Cpu className="w-3 h-3" />
              {showLogs ? 'Hide' : 'Logs'}
            </button>
          )}
          {job.status === 'complete' && (
            <button
              onClick={onRegister}
              className="btn-ghost p-1 rounded text-xs flex items-center gap-1 text-green-600"
              title="Register with Ollama"
            >
              <CheckCircle2 className="w-3 h-3" />
              Register
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

      {job.adapterPath && (
        <p className="text-xs text-muted-foreground">Adapter: {job.adapterPath}</p>
      )}
      {job.errorMessage && <p className="text-xs text-destructive">{job.errorMessage}</p>}
    </div>
  );
}

export function FinetuneTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    baseModel: 'llama3:8b',
    adapterName: '',
    datasetPath: '',
    loraRank: '16',
    loraAlpha: '32',
    batchSize: '4',
    epochs: '3',
    vramBudgetGb: '12',
  });
  const [logsJobId, setLogsJobId] = useState<string | null>(null);

  const {
    data: jobs = [],
    isLoading,
    error,
  } = useQuery({
    queryKey: ['finetune-jobs'],
    queryFn: fetchFinetuneJobs,
    refetchInterval: (query) => {
      const jobs = query.state.data ?? [];
      return jobs.some((j) => j.status === 'running' || j.status === 'pending') ? 5000 : false;
    },
  });

  const createMut = useMutation({
    mutationFn: createFinetuneJob,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['finetune-jobs'] });
      setShowForm(false);
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteFinetuneJob,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['finetune-jobs'] }),
  });

  const registerMut = useMutation({
    mutationFn: registerFinetuneAdapter,
    onSuccess: () => void queryClient.invalidateQueries({ queryKey: ['finetune-jobs'] }),
  });

  const handleCreate = () => {
    createMut.mutate({
      name: form.name,
      baseModel: form.baseModel,
      adapterName: form.adapterName,
      datasetPath: form.datasetPath,
      loraRank: Number(form.loraRank),
      loraAlpha: Number(form.loraAlpha),
      batchSize: Number(form.batchSize),
      epochs: Number(form.epochs),
      vramBudgetGb: Number(form.vramBudgetGb),
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">LoRA / QLoRA Fine-Tuning</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Fine-tune a local model adapter via Docker. Requires NVIDIA GPU + Docker with CUDA
            support.
          </p>
        </div>
        <button
          onClick={() => {
            setShowForm((v) => !v);
          }}
          className="btn btn-ghost flex items-center gap-2 text-sm"
        >
          <Layers className="w-4 h-4" />
          New Job
        </button>
      </div>

      {showForm && (
        <div className="card p-4 space-y-3 border-primary/30">
          <h3 className="text-sm font-semibold">Create Fine-Tuning Job</h3>
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
                placeholder="e.g. llama3 customer-support adapter"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base Model (Ollama)</label>
              <input
                type="text"
                value={form.baseModel}
                onChange={(e) => {
                  setForm((f) => ({ ...f, baseModel: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="llama3:8b"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Adapter Name</label>
              <input
                type="text"
                value={form.adapterName}
                onChange={(e) => {
                  setForm((f) => ({ ...f, adapterName: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="my-custom-llama3"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Dataset Path (JSONL)</label>
              <input
                type="text"
                value={form.datasetPath}
                onChange={(e) => {
                  setForm((f) => ({ ...f, datasetPath: e.target.value }));
                }}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="/data/distillation.jsonl"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">LoRA Rank</label>
              <input
                type="number"
                value={form.loraRank}
                onChange={(e) => {
                  setForm((f) => ({ ...f, loraRank: e.target.value }));
                }}
                min={4}
                max={128}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">LoRA Alpha</label>
              <input
                type="number"
                value={form.loraAlpha}
                onChange={(e) => {
                  setForm((f) => ({ ...f, loraAlpha: e.target.value }));
                }}
                min={4}
                max={256}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Batch Size</label>
              <input
                type="number"
                value={form.batchSize}
                onChange={(e) => {
                  setForm((f) => ({ ...f, batchSize: e.target.value }));
                }}
                min={1}
                max={32}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Epochs</label>
              <input
                type="number"
                value={form.epochs}
                onChange={(e) => {
                  setForm((f) => ({ ...f, epochs: e.target.value }));
                }}
                min={1}
                max={20}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">VRAM Budget (GB)</label>
              <input
                type="number"
                value={form.vramBudgetGb}
                onChange={(e) => {
                  setForm((f) => ({ ...f, vramBudgetGb: e.target.value }));
                }}
                min={4}
                max={80}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
              />
            </div>
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
              disabled={createMut.isPending || !form.name.trim() || !form.baseModel.trim()}
              className="btn btn-ghost text-sm flex items-center gap-1"
            >
              {createMut.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
              Create & Start
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
        <p className="text-sm text-muted-foreground">No fine-tuning jobs yet.</p>
      ) : (
        <div className="space-y-3">
          {jobs.map((job) => (
            <FinetuneJobCard
              key={job.id}
              job={job}
              onDelete={() => {
                deleteMut.mutate(job.id);
              }}
              onRegister={() => {
                registerMut.mutate(job.id);
              }}
              onViewLogs={() => {
                setLogsJobId(logsJobId === job.id ? null : job.id);
              }}
              showLogs={logsJobId === job.id}
            />
          ))}
        </div>
      )}

      {registerMut.isError && (
        <p className="text-xs text-destructive">
          Register failed:{' '}
          {registerMut.error instanceof Error ? registerMut.error.message : 'Unknown'}
        </p>
      )}
    </div>
  );
}
