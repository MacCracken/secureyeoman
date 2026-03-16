import { useState } from 'react';
import { useQuery, useMutation } from '@tanstack/react-query';
import {
  Download,
  Database,
  MessageSquare,
  Brain,
  Loader2,
  AlertCircle,
} from 'lucide-react';
import {
  fetchTrainingStats,
  exportTrainingDataset,
} from '../../api/client';
import type { ExportFormat } from './constants';
import { FORMAT_INFO } from './FormatInfo';
import { Step } from './Step';

export function ExportTab() {
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
