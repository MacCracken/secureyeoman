/**
 * TrainingTab — Training dataset export, distillation, and fine-tuning UI.
 *
 * Sub-tabs:
 *   Export     — Download conversations as ShareGPT/Instruction/Raw text
 *   Distillation — Run teacher-student distillation jobs
 *   Fine-tune  — LoRA/QLoRA fine-tuning via Docker sidecar
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Download,
  Database,
  BookOpen,
  FileText,
  MessageSquare,
  Brain,
  Loader2,
  AlertCircle,
  Play,
  Trash2,
  CheckCircle2,
  XCircle,
  Clock,
  Cpu,
  Layers,
} from 'lucide-react';
import {
  fetchTrainingStats,
  exportTrainingDataset,
  fetchDistillationJobs,
  createDistillationJob,
  deleteDistillationJob,
  fetchFinetuneJobs,
  createFinetuneJob,
  deleteFinetuneJob,
  registerFinetuneAdapter,
  type DistillationJob,
  type FinetuneJob,
} from '../api/client';

type TabType = 'export' | 'distillation' | 'finetune';
type ExportFormat = 'sharegpt' | 'instruction' | 'raw';

const FORMAT_INFO: Record<ExportFormat, { label: string; description: string; icon: React.ReactNode }> = {
  sharegpt: {
    label: 'ShareGPT JSONL',
    description:
      'Standard format for chat fine-tuning. Compatible with LLaMA Factory, Unsloth, axolotl, and most SFT frameworks. Each line is a full conversation.',
    icon: <MessageSquare className="w-4 h-4" />,
  },
  instruction: {
    label: 'Instruction JSONL',
    description:
      'Alpaca-style pairs: {"instruction":"...","output":"..."}. Each user/assistant exchange becomes one training example. Ideal for instruction-following SFT.',
    icon: <FileText className="w-4 h-4" />,
  },
  raw: {
    label: 'Raw Text Corpus',
    description:
      'Plain text with role labels. Use for unsupervised pre-training or contrastive embedding training (SimCSE, sentence-transformers NLI). No JSON overhead.',
    icon: <BookOpen className="w-4 h-4" />,
  },
};

function StatusChip({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string; icon: React.ReactNode }> = {
    pending: { label: 'Pending', cls: 'bg-muted text-muted-foreground', icon: <Clock className="w-3 h-3" /> },
    running: { label: 'Running', cls: 'bg-primary/10 text-primary', icon: <Loader2 className="w-3 h-3 animate-spin" /> },
    complete: { label: 'Complete', cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400', icon: <CheckCircle2 className="w-3 h-3" /> },
    failed: { label: 'Failed', cls: 'bg-destructive/10 text-destructive', icon: <XCircle className="w-3 h-3" /> },
    cancelled: { label: 'Cancelled', cls: 'bg-muted text-muted-foreground', icon: <XCircle className="w-3 h-3" /> },
  };
  const info = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', icon: null };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}>
      {info.icon}
      {info.label}
    </span>
  );
}

// ── Export Tab ───────────────────────────────────────────────────────────────

function ExportTab() {
  const [format, setFormat] = useState<ExportFormat>('sharegpt');
  const [limit, setLimit] = useState('10000');
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const { data: stats, isLoading: statsLoading, error: statsError } = useQuery({
    queryKey: ['training-stats'],
    queryFn: fetchTrainingStats,
    retry: 1,
  });

  const exportMut = useMutation({
    mutationFn: () =>
      exportTrainingDataset({
        format,
        limit: Number(limit) || 10_000,
      }),
    onSuccess: ({ url, filename }) => {
      const a = document.createElement('a');
      a.href = url;
      a.download = filename;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 30_000);
      setDownloadError(null);
    },
    onError: (err) => {
      setDownloadError(err instanceof Error ? err.message : 'Export failed');
    },
  });

  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <h2 className="text-lg font-semibold">Training Dataset Export</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Export your conversations as structured training data for fine-tuning LLMs or training
          embedding models locally with sentence-transformers, Unsloth, or LLaMA Factory.
        </p>
      </div>

      <div className="grid grid-cols-3 gap-3">
        {statsLoading ? (
          <div className="col-span-3 flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading stats…
          </div>
        ) : statsError ? (
          <div className="col-span-3 flex items-center gap-2 text-sm text-destructive">
            <AlertCircle className="w-4 h-4" />
            Could not load stats
          </div>
        ) : (
          <>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <MessageSquare className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Conversations</span>
              </div>
              <p className="text-2xl font-bold">{(stats?.conversations ?? 0).toLocaleString()}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Brain className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Memories</span>
              </div>
              <p className="text-2xl font-bold">{(stats?.memories ?? 0).toLocaleString()}</p>
            </div>
            <div className="card p-4">
              <div className="flex items-center gap-2 text-muted-foreground mb-1">
                <Database className="w-4 h-4" />
                <span className="text-xs font-medium uppercase tracking-wide">Knowledge</span>
              </div>
              <p className="text-2xl font-bold">{(stats?.knowledge ?? 0).toLocaleString()}</p>
            </div>
          </>
        )}
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Export Format</h3>
        <div className="space-y-2">
          {(Object.entries(FORMAT_INFO) as [ExportFormat, (typeof FORMAT_INFO)[ExportFormat]][]).map(
            ([key, info]) => (
              <label
                key={key}
                className={`flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                  format === key
                    ? 'border-primary bg-primary/5'
                    : 'border-border hover:border-muted-foreground/40'
                }`}
              >
                <input
                  type="radio"
                  name="format"
                  value={key}
                  checked={format === key}
                  onChange={() => setFormat(key)}
                  className="mt-0.5 accent-primary"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-primary">{info.icon}</span>
                    <span className="font-medium text-sm">{info.label}</span>
                  </div>
                  <p className="text-xs text-muted-foreground mt-0.5">{info.description}</p>
                </div>
              </label>
            )
          )}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Options</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">Max conversations</label>
          <input
            type="number"
            value={limit}
            onChange={(e) => setLimit(e.target.value)}
            min={1}
            max={100000}
            className="w-28 px-2 py-1 text-sm border rounded-md bg-background"
          />
        </div>
      </div>

      {downloadError && (
        <div className="flex items-center gap-2 p-3 rounded-lg bg-destructive/10 text-destructive text-sm">
          <AlertCircle className="w-4 h-4 shrink-0" />
          {downloadError}
        </div>
      )}

      <button
        onClick={() => exportMut.mutate()}
        disabled={exportMut.isPending || !stats || stats.conversations === 0}
        className="btn btn-ghost flex items-center gap-2"
      >
        {exportMut.isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : (
          <Download className="w-4 h-4" />
        )}
        {exportMut.isPending ? 'Exporting…' : 'Download Dataset'}
      </button>

      <div className="card p-4 space-y-3">
        <h3 className="text-sm font-semibold flex items-center gap-2">
          <Brain className="w-4 h-4 text-primary" />
          Local Training Pipeline
        </h3>
        <p className="text-xs text-muted-foreground">
          Recommended flow for training locally: Export → Train → Serve → Use
        </p>
        <div className="space-y-2 text-xs">
          <Step n={1} title="Export">
            Download conversations above as <code className="bg-muted px-1 rounded">sharegpt</code> (for chat models) or{' '}
            <code className="bg-muted px-1 rounded">raw</code> (for embedding models).
          </Step>
          <Step n={2} title="Train embedding model (sentence-transformers)">
            <code className="bg-muted px-1 rounded block mt-1 p-1 font-mono">
              pip install sentence-transformers
              <br />
              python -m sentence_transformers.training.train --data export.txt \<br />
              &nbsp; --model BAAI/bge-base-en-v1.5 --loss MultipleNegativesRankingLoss
            </code>
          </Step>
          <Step n={3} title="Fine-tune a chat model (Unsloth / LLaMA Factory)">
            Use the <strong>Distillation</strong> tab to generate teacher-quality data, then the{' '}
            <strong>Fine-tune</strong> tab to run LoRA training via Docker.
          </Step>
          <Step n={4} title="Serve via Ollama">
            Copy adapter weights → create Modelfile → <code className="bg-muted px-1 rounded">ollama create my-model</code>
          </Step>
          <Step n={5} title="Connect back">
            Set <strong>Model Provider = Ollama</strong> and select your model in Settings → AI Model,
            or set <strong>Vector Embedding Provider = Ollama</strong> with your embedding model in Settings → Brain.
          </Step>
        </div>
      </div>
    </div>
  );
}

// ── Distillation Tab ─────────────────────────────────────────────────────────

function DistillationTab() {
  const queryClient = useQueryClient();
  const [showForm, setShowForm] = useState(false);
  const [form, setForm] = useState({
    name: '',
    teacherProvider: 'anthropic',
    teacherModel: 'claude-opus-4-6',
    exportFormat: 'sharegpt' as 'sharegpt' | 'instruction',
    maxSamples: '500',
    outputPath: '/tmp/distillation-output.jsonl',
  });

  const { data: jobs = [], isLoading, error } = useQuery({
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

  const handleCreate = () => {
    createMut.mutate({
      name: form.name,
      teacherProvider: form.teacherProvider,
      teacherModel: form.teacherModel,
      exportFormat: form.exportFormat,
      maxSamples: Number(form.maxSamples) || 500,
      outputPath: form.outputPath,
    });
  };

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-start justify-between">
        <div>
          <h2 className="text-lg font-semibold">Model Distillation</h2>
          <p className="text-sm text-muted-foreground mt-1">
            Generate high-quality training pairs by calling a teacher LLM on your conversation history.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
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
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="e.g. claude-opus distillation"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Teacher Provider</label>
              <select
                value={form.teacherProvider}
                onChange={(e) => setForm((f) => ({ ...f, teacherProvider: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, teacherModel: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="claude-opus-4-6"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Export Format</label>
              <select
                value={form.exportFormat}
                onChange={(e) =>
                  setForm((f) => ({ ...f, exportFormat: e.target.value as 'sharegpt' | 'instruction' }))
                }
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
                onChange={(e) => setForm((f) => ({ ...f, maxSamples: e.target.value }))}
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
                onChange={(e) => setForm((f) => ({ ...f, outputPath: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="/data/distillation.jsonl"
              />
            </div>
          </div>
          {createMut.isError && (
            <p className="text-xs text-destructive">
              {createMut.error instanceof Error ? createMut.error.message : 'Failed to create job'}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn btn-ghost text-sm">
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
            <DistillationJobCard key={job.id} job={job} onDelete={() => deleteMut.mutate(job.id)} />
          ))}
        </div>
      )}
    </div>
  );
}

function DistillationJobCard({ job, onDelete }: { job: DistillationJob; onDelete: () => void }) {
  const progress =
    job.maxSamples > 0 ? Math.round((job.samplesGenerated / job.maxSamples) * 100) : 0;

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
            <span>{job.samplesGenerated} / {job.maxSamples} samples</span>
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

      {job.errorMessage && (
        <p className="text-xs text-destructive">{job.errorMessage}</p>
      )}
    </div>
  );
}

// ── Fine-tune Tab ─────────────────────────────────────────────────────────────

function FinetuneTab() {
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

  const { data: jobs = [], isLoading, error } = useQuery({
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
            Fine-tune a local model adapter via Docker. Requires NVIDIA GPU + Docker with CUDA support.
          </p>
        </div>
        <button
          onClick={() => setShowForm((v) => !v)}
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
                onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="e.g. llama3 customer-support adapter"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Base Model (Ollama)</label>
              <input
                type="text"
                value={form.baseModel}
                onChange={(e) => setForm((f) => ({ ...f, baseModel: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="llama3:8b"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Adapter Name</label>
              <input
                type="text"
                value={form.adapterName}
                onChange={(e) => setForm((f) => ({ ...f, adapterName: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="my-custom-llama3"
              />
            </div>
            <div className="col-span-2">
              <label className="text-xs text-muted-foreground">Dataset Path (JSONL)</label>
              <input
                type="text"
                value={form.datasetPath}
                onChange={(e) => setForm((f) => ({ ...f, datasetPath: e.target.value }))}
                className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background"
                placeholder="/data/distillation.jsonl"
              />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">LoRA Rank</label>
              <input type="number" value={form.loraRank} onChange={(e) => setForm((f) => ({ ...f, loraRank: e.target.value }))} min={4} max={128} className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">LoRA Alpha</label>
              <input type="number" value={form.loraAlpha} onChange={(e) => setForm((f) => ({ ...f, loraAlpha: e.target.value }))} min={4} max={256} className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Batch Size</label>
              <input type="number" value={form.batchSize} onChange={(e) => setForm((f) => ({ ...f, batchSize: e.target.value }))} min={1} max={32} className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Epochs</label>
              <input type="number" value={form.epochs} onChange={(e) => setForm((f) => ({ ...f, epochs: e.target.value }))} min={1} max={20} className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">VRAM Budget (GB)</label>
              <input type="number" value={form.vramBudgetGb} onChange={(e) => setForm((f) => ({ ...f, vramBudgetGb: e.target.value }))} min={4} max={80} className="w-full mt-1 px-2 py-1 text-sm border rounded bg-background" />
            </div>
          </div>
          {createMut.isError && (
            <p className="text-xs text-destructive">
              {createMut.error instanceof Error ? createMut.error.message : 'Failed to create job'}
            </p>
          )}
          <div className="flex gap-2 justify-end">
            <button onClick={() => setShowForm(false)} className="btn btn-ghost text-sm">Cancel</button>
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
              onDelete={() => deleteMut.mutate(job.id)}
              onRegister={() => registerMut.mutate(job.id)}
              onViewLogs={() => setLogsJobId(logsJobId === job.id ? null : job.id)}
              showLogs={logsJobId === job.id}
            />
          ))}
        </div>
      )}

      {registerMut.isError && (
        <p className="text-xs text-destructive">
          Register failed: {registerMut.error instanceof Error ? registerMut.error.message : 'Unknown'}
        </p>
      )}
    </div>
  );
}

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
          {(job.status === 'running') && (
            <button onClick={onViewLogs} className="btn-ghost p-1 rounded text-xs flex items-center gap-1">
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
      {job.errorMessage && (
        <p className="text-xs text-destructive">{job.errorMessage}</p>
      )}
    </div>
  );
}

// ── Root component ───────────────────────────────────────────────────────────

export function TrainingTab() {
  const [activeTab, setActiveTab] = useState<TabType>('export');

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
    { id: 'distillation', label: 'Distillation', icon: <Brain className="w-4 h-4" /> },
    { id: 'finetune', label: 'Fine-tune', icon: <Layers className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-4">
      {/* Sub-tab pill nav */}
      <div
        role="tablist"
        aria-label="Training views"
        className="flex gap-1 bg-muted/50 rounded-lg p-1 w-fit"
      >
        {tabs.map((tab) => (
          <button
            key={tab.id}
            role="tab"
            aria-selected={activeTab === tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
              activeTab === tab.id
                ? 'bg-background shadow-sm text-foreground'
                : 'text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'export' && <ExportTab />}
      {activeTab === 'distillation' && <DistillationTab />}
      {activeTab === 'finetune' && <FinetuneTab />}
    </div>
  );
}

function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <div className="flex gap-2">
      <span className="shrink-0 w-5 h-5 rounded-full bg-primary/10 text-primary text-xs flex items-center justify-center font-bold">
        {n}
      </span>
      <div>
        <span className="font-medium text-foreground">{title} — </span>
        <span className="text-muted-foreground">{children}</span>
      </div>
    </div>
  );
}
