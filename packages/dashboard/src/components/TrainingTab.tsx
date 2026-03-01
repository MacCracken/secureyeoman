/**
 * TrainingTab — Training dataset export, distillation, and fine-tuning UI.
 *
 * Sub-tabs:
 *   Export     — Download conversations as ShareGPT/Instruction/Raw text
 *   Distillation — Run teacher-student distillation jobs
 *   Fine-tune  — LoRA/QLoRA fine-tuning via Docker sidecar
 */

import { useState, useEffect, useRef } from 'react';
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
  Activity,
  Monitor,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
} from 'recharts';
import {
  fetchTrainingStats,
  exportTrainingDataset,
  fetchDistillationJobs,
  createDistillationJob,
  deleteDistillationJob,
  runDistillationJob,
  fetchFinetuneJobs,
  createFinetuneJob,
  deleteFinetuneJob,
  registerFinetuneAdapter,
  fetchTrainingStream,
  fetchQualityScores,
  triggerQualityScoring,
  fetchComputerUseEpisodes,
  fetchComputerUseStats,
  deleteComputerUseEpisode,
  type DistillationJob,
  type FinetuneJob,
  type QualityScore,
  type ComputerUseEpisode,
  type SkillStat,
} from '../api/client';

type TabType = 'export' | 'distillation' | 'finetune' | 'live' | 'computer-use';
type ExportFormat = 'sharegpt' | 'instruction' | 'raw';

const FORMAT_INFO: Record<
  ExportFormat,
  { label: string; description: string; icon: React.ReactNode }
> = {
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
    pending: {
      label: 'Pending',
      cls: 'bg-muted text-muted-foreground',
      icon: <Clock className="w-3 h-3" />,
    },
    running: {
      label: 'Running',
      cls: 'bg-primary/10 text-primary',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    complete: {
      label: 'Complete',
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      label: 'Failed',
      cls: 'bg-destructive/10 text-destructive',
      icon: <XCircle className="w-3 h-3" />,
    },
    cancelled: {
      label: 'Cancelled',
      cls: 'bg-muted text-muted-foreground',
      icon: <XCircle className="w-3 h-3" />,
    },
  };
  const info = map[status] ?? { label: status, cls: 'bg-muted text-muted-foreground', icon: null };
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${info.cls}`}
    >
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

  const {
    data: stats,
    isLoading: statsLoading,
    error: statsError,
  } = useQuery({
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
      setTimeout(() => {
        URL.revokeObjectURL(url);
      }, 30_000);
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
          {(
            Object.entries(FORMAT_INFO) as [ExportFormat, (typeof FORMAT_INFO)[ExportFormat]][]
          ).map(([key, info]) => (
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
                onChange={() => {
                  setFormat(key);
                }}
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
          ))}
        </div>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">Options</h3>
        <div className="flex items-center gap-3">
          <label className="text-sm text-muted-foreground whitespace-nowrap">
            Max conversations
          </label>
          <input
            type="number"
            value={limit}
            onChange={(e) => {
              setLimit(e.target.value);
            }}
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
        onClick={() => {
          exportMut.mutate();
        }}
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
            Download conversations above as <code className="bg-muted px-1 rounded">sharegpt</code>{' '}
            (for chat models) or <code className="bg-muted px-1 rounded">raw</code> (for embedding
            models).
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
            Copy adapter weights → create Modelfile →{' '}
            <code className="bg-muted px-1 rounded">ollama create my-model</code>
          </Step>
          <Step n={5} title="Connect back">
            Set <strong>Model Provider = Ollama</strong> and select your model in Settings → AI
            Model, or set <strong>Vector Embedding Provider = Ollama</strong> with your embedding
            model in Settings → Brain.
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

// ── Root component ───────────────────────────────────────────────────────────

export function TrainingTab() {
  const [activeTab, setActiveTab] = useState<TabType>('export');

  const tabs: { id: TabType; label: string; icon: React.ReactNode }[] = [
    { id: 'export', label: 'Export', icon: <Download className="w-4 h-4" /> },
    { id: 'distillation', label: 'Distillation', icon: <Brain className="w-4 h-4" /> },
    { id: 'finetune', label: 'Fine-tune', icon: <Layers className="w-4 h-4" /> },
    { id: 'live', label: 'Live', icon: <Activity className="w-4 h-4" /> },
    { id: 'computer-use', label: 'Computer Use', icon: <Monitor className="w-4 h-4" /> },
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
            onClick={() => {
              setActiveTab(tab.id);
            }}
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
      {activeTab === 'live' && <LiveTab />}
      {activeTab === 'computer-use' && <ComputerUseTab />}
    </div>
  );
}

// ── Live Tab (Phase 92) ───────────────────────────────────────────────────────

interface StreamPoint {
  ts: number;
  value: number;
}

function LiveTab() {
  const [lossSeries, setLossSeries] = useState<StreamPoint[]>([]);
  const [throughput, setThroughput] = useState<number>(0);
  const [agreement, setAgreement] = useState<number>(0);
  const [rewardSeries, setRewardSeries] = useState<StreamPoint[]>([]);
  const esRef = useRef<EventSource | null>(null);

  const {
    data: qualityData,
    isLoading: qualityLoading,
    refetch: refetchQuality,
  } = useQuery({
    queryKey: ['training-quality'],
    queryFn: () => fetchQualityScores(50),
    staleTime: 30_000,
  });

  const scoreMut = useMutation({
    mutationFn: triggerQualityScoring,
    onSuccess: () => void refetchQuality(),
  });

  useEffect(() => {
    const es = fetchTrainingStream();
    esRef.current = es;

    es.addEventListener('message', (evt: MessageEvent<string>) => {
      try {
        const data = JSON.parse(evt.data) as {
          type: string;
          value: number;
          ts: number;
        };
        const point: StreamPoint = { ts: data.ts, value: data.value };
        if (data.type === 'loss') {
          setLossSeries((prev) => [...prev.slice(-199), point]);
        } else if (data.type === 'throughput') {
          setThroughput(data.value);
        } else if (data.type === 'agreement') {
          setAgreement(data.value);
        } else if (data.type === 'reward') {
          setRewardSeries((prev) => [...prev.slice(-199), point]);
        }
      } catch {
        // skip malformed
      }
    });

    return () => {
      es.close();
    };
  }, []);

  const qualityConvs = qualityData?.conversations ?? [];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold">Live Training Stream</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Real-time telemetry from active distillation and fine-tuning jobs.
        </p>
      </div>

      {/* KPI row */}
      <div className="grid grid-cols-2 gap-4">
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Zap className="w-3 h-3" /> Throughput
          </div>
          <div className="text-2xl font-semibold mt-1">{throughput.toFixed(1)}</div>
          <div className="text-xs text-muted-foreground">samples / min</div>
        </div>
        <div className="rounded-lg border p-4">
          <div className="text-xs text-muted-foreground flex items-center gap-1">
            <Activity className="w-3 h-3" /> Agreement Rate
          </div>
          <div className="text-2xl font-semibold mt-1">{(agreement * 100).toFixed(1)}%</div>
          <div className="text-xs text-muted-foreground">avg char-Jaccard</div>
        </div>
      </div>

      {/* Loss chart */}
      {lossSeries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Loss</h3>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={lossSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" hide />
              <YAxis domain={['auto', 'auto']} width={40} />
              <Tooltip formatter={(v: number) => v.toFixed(4)} />
              <Line
                type="monotone"
                dataKey="value"
                dot={false}
                strokeWidth={2}
                stroke="var(--color-primary, #6366f1)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Reward trend */}
      {rewardSeries.length > 0 && (
        <div>
          <h3 className="text-sm font-medium mb-2">Reward Trend</h3>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={rewardSeries}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="ts" hide />
              <YAxis domain={['auto', 'auto']} width={40} />
              <Tooltip formatter={(v: number) => v.toFixed(3)} />
              <Line
                type="monotone"
                dataKey="value"
                dot={false}
                strokeWidth={2}
                stroke="var(--color-success, #22c55e)"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Quality heatmap */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-medium">Conversation Quality Coverage</h3>
          <button
            onClick={() => scoreMut.mutate()}
            disabled={scoreMut.isPending}
            className="btn btn-ghost text-xs flex items-center gap-1"
          >
            {scoreMut.isPending ? (
              <Loader2 className="w-3 h-3 animate-spin" />
            ) : (
              <Activity className="w-3 h-3" />
            )}
            Score now
          </button>
        </div>
        {qualityLoading ? (
          <div className="text-sm text-muted-foreground">Loading quality scores…</div>
        ) : qualityConvs.length === 0 ? (
          <p className="text-sm text-muted-foreground">No quality scores yet. Click "Score now".</p>
        ) : (
          <div className="flex flex-wrap gap-1">
            {qualityConvs.map((q: QualityScore) => {
              const pct = q.qualityScore;
              // Red = 0.0 (needs training), green = 1.0 (well covered)
              const hue = Math.round(pct * 120); // 0=red, 120=green
              return (
                <div
                  key={q.conversationId}
                  title={`${q.conversationId.slice(0, 8)} — score: ${pct.toFixed(2)} (${q.signalSource})`}
                  style={{ backgroundColor: `hsl(${hue}, 60%, 45%)` }}
                  className="w-4 h-4 rounded-sm cursor-default"
                />
              );
            })}
          </div>
        )}
        {scoreMut.data && (
          <p className="text-xs text-muted-foreground mt-1">
            Scored {scoreMut.data.scored} conversation(s)
          </p>
        )}
      </div>
    </div>
  );
}

// ── Computer Use Tab (Phase 92) ───────────────────────────────────────────────

function ComputerUseTab() {
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
      fetchComputerUseEpisodes(selectedSession ? { sessionId: selectedSession, limit: 50 } : { limit: 50 }),
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
                    onClick={() => setSelectedSession('')}
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
            onChange={(e) => setSelectedSession(e.target.value)}
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
                    <span className="text-xs text-muted-foreground truncate">{ep.actionTarget}</span>
                  </div>
                  {ep.actionValue && (
                    <div className="text-xs text-muted-foreground mt-0.5 truncate">{ep.actionValue}</div>
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
                  onClick={() => deleteMut.mutate(ep.id)}
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

// ── Eval Radar Card (Phase 92) ────────────────────────────────────────────────

export function EvalResultRadarCard({
  metrics,
}: {
  metrics: {
    tool_name_accuracy?: number;
    tool_arg_match?: number;
    semantic_similarity?: number;
    char_similarity?: number;
  };
}) {
  const data = [
    { subject: 'Tool Name', value: (metrics.tool_name_accuracy ?? 0) * 100 },
    { subject: 'Tool Args', value: (metrics.tool_arg_match ?? 0) * 100 },
    { subject: 'Semantic Sim', value: (metrics.semantic_similarity ?? 0) * 100 },
    { subject: 'Char Sim', value: (metrics.char_similarity ?? 0) * 100 },
  ];

  return (
    <div className="rounded-lg border p-4">
      <h3 className="text-sm font-medium mb-3">Evaluation Metrics</h3>
      <ResponsiveContainer width="100%" height={220}>
        <RadarChart data={data}>
          <PolarGrid />
          <PolarAngleAxis dataKey="subject" tick={{ fontSize: 11 }} />
          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9 }} />
          <Radar
            name="Score"
            dataKey="value"
            fill="var(--color-primary, #6366f1)"
            fillOpacity={0.3}
            stroke="var(--color-primary, #6366f1)"
            strokeWidth={2}
          />
          <Tooltip formatter={(v: number) => `${v.toFixed(1)}%`} />
        </RadarChart>
      </ResponsiveContainer>
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
