/**
 * EvaluationTab — LLM-as-Judge evaluation UI (Phase 97).
 *
 * Sections:
 *   Datasets      — list / create / delete eval datasets
 *   Pointwise     — trigger evals, radar chart for 5 dimensions
 *   Pairwise      — trigger comparisons, win-rate bar chart
 *   Auto-Eval     — configure thresholds for finetune auto-eval
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Database, Plus, Trash2, Play, Loader2, AlertCircle, CheckCircle2 } from 'lucide-react';
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  CartesianGrid,
} from 'recharts';
import {
  fetchEvalDatasets,
  createEvalDataset,
  deleteEvalDataset,
  runPointwiseEval,
  fetchEvalRuns,
  runPairwiseComparison,
  fetchPairwiseComparisons,
  type EvalDataset,
  type EvalRunSummary,
  type PairwiseComparisonSummary,
} from '../../api/client';

// ── Dataset Section ──────────────────────────────────────────────────────────

function DatasetSection() {
  const queryClient = useQueryClient();
  const [showCreate, setShowCreate] = useState(false);
  const [newName, setNewName] = useState('');
  const [newSamples, setNewSamples] = useState('');

  const { data: datasets, isLoading } = useQuery({
    queryKey: ['eval-datasets'],
    queryFn: fetchEvalDatasets,
  });

  const createMutation = useMutation({
    mutationFn: createEvalDataset,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['eval-datasets'] });
      setShowCreate(false);
      setNewName('');
      setNewSamples('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteEvalDataset,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eval-datasets'] }),
  });

  function handleCreate() {
    try {
      const samples = JSON.parse(newSamples);
      if (!Array.isArray(samples) || samples.length === 0) return;
      createMutation.mutate({ name: newName, samples });
    } catch {
      // invalid JSON
    }
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">Eval Datasets</h3>
        <button
          onClick={() => {
            setShowCreate(!showCreate);
          }}
          className="flex items-center gap-1 text-xs text-primary hover:underline"
        >
          <Plus className="w-3 h-3" /> New Dataset
        </button>
      </div>

      {showCreate && (
        <div className="border rounded-lg p-3 space-y-2 bg-muted/30">
          <input
            type="text"
            placeholder="Dataset name"
            value={newName}
            onChange={(e) => {
              setNewName(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          />
          <textarea
            placeholder='Samples JSON: [{"prompt":"...","gold":"..."},...]'
            value={newSamples}
            onChange={(e) => {
              setNewSamples(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background h-24 font-mono"
          />
          <div className="flex gap-2">
            <button
              onClick={handleCreate}
              disabled={!newName.trim() || !newSamples.trim() || createMutation.isPending}
              className="px-3 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create'}
            </button>
            <button
              onClick={() => {
                setShowCreate(false);
              }}
              className="px-3 py-1 text-xs text-muted-foreground hover:text-foreground"
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading datasets...
        </div>
      )}

      {datasets?.length === 0 && (
        <p className="text-sm text-muted-foreground">No eval datasets yet.</p>
      )}

      {datasets?.map((ds: EvalDataset) => (
        <div key={ds.id} className="flex items-center justify-between border rounded-lg p-3">
          <div>
            <div className="text-sm font-medium">{ds.name}</div>
            <div className="text-xs text-muted-foreground">
              {ds.sampleCount} samples &middot; {new Date(ds.createdAt).toLocaleDateString()}
            </div>
          </div>
          <button
            onClick={() => {
              deleteMutation.mutate(ds.id);
            }}
            className="text-destructive hover:text-destructive/80"
            title="Delete dataset"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      ))}
    </div>
  );
}

// ── Pointwise Eval Section ───────────────────────────────────────────────────

function PointwiseEvalSection() {
  const queryClient = useQueryClient();
  const [modelName, setModelName] = useState('');
  const [selectedDataset, setSelectedDataset] = useState('');

  const { data: datasets } = useQuery({
    queryKey: ['eval-datasets'],
    queryFn: fetchEvalDatasets,
  });

  const { data: runs, isLoading: runsLoading } = useQuery({
    queryKey: ['eval-runs'],
    queryFn: fetchEvalRuns,
    refetchInterval: 10_000,
  });

  const evalMutation = useMutation({
    mutationFn: runPointwiseEval,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['eval-runs'] }),
  });

  function handleRun() {
    if (!selectedDataset || !modelName.trim()) return;
    evalMutation.mutate({ datasetId: selectedDataset, modelName });
  }

  const selectedRun = runs?.[0];
  const radarData = selectedRun
    ? [
        { dimension: 'Groundedness', value: selectedRun.avgGroundedness },
        { dimension: 'Coherence', value: selectedRun.avgCoherence },
        { dimension: 'Relevance', value: selectedRun.avgRelevance },
        { dimension: 'Fluency', value: selectedRun.avgFluency },
        { dimension: 'Harmlessness', value: selectedRun.avgHarmlessness },
      ]
    : [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Pointwise Evaluation</h3>

      <div className="flex gap-2 items-end">
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Dataset</label>
          <select
            value={selectedDataset}
            onChange={(e) => {
              setSelectedDataset(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          >
            <option value="">Select dataset...</option>
            {datasets?.map((ds: EvalDataset) => (
              <option key={ds.id} value={ds.id}>
                {ds.name} ({ds.sampleCount} samples)
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1">
          <label className="text-xs text-muted-foreground">Model</label>
          <input
            type="text"
            placeholder="e.g. llama3:8b"
            value={modelName}
            onChange={(e) => {
              setModelName(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          />
        </div>
        <button
          onClick={handleRun}
          disabled={!selectedDataset || !modelName.trim() || evalMutation.isPending}
          className="flex items-center gap-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          {evalMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          Evaluate
        </button>
      </div>

      {evalMutation.isError && (
        <div className="flex items-center gap-1 text-xs text-destructive">
          <AlertCircle className="w-3 h-3" /> {evalMutation.error.message}
        </div>
      )}

      {runsLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading runs...
        </div>
      )}

      {selectedRun && (
        <div className="border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-2">
            Latest: {selectedRun.modelName} &middot; {selectedRun.sampleCount} samples
          </div>
          <div className="h-64" data-testid="radar-chart">
            <ResponsiveContainer width="100%" height="100%">
              <RadarChart data={radarData}>
                <PolarGrid />
                <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 11 }} />
                <PolarRadiusAxis domain={[0, 5]} tickCount={6} />
                <Radar
                  name="Score"
                  dataKey="value"
                  stroke="hsl(var(--primary))"
                  fill="hsl(var(--primary))"
                  fillOpacity={0.3}
                />
              </RadarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {runs && runs.length > 0 && (
        <div className="space-y-1">
          <div className="text-xs font-medium text-muted-foreground">Run History</div>
          {runs.map((run: EvalRunSummary) => (
            <div
              key={run.evalRunId}
              className="flex items-center justify-between text-xs border rounded px-2 py-1"
            >
              <span className="font-mono">{run.modelName}</span>
              <span>
                G:{run.avgGroundedness.toFixed(1)} C:{run.avgCoherence.toFixed(1)} R:
                {run.avgRelevance.toFixed(1)} F:{run.avgFluency.toFixed(1)} H:
                {run.avgHarmlessness.toFixed(1)}
              </span>
              <span className="text-muted-foreground">
                {new Date(run.scoredAt).toLocaleDateString()}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Pairwise Section ─────────────────────────────────────────────────────────

function PairwiseSection() {
  const queryClient = useQueryClient();
  const [selectedDataset, setSelectedDataset] = useState('');
  const [modelA, setModelA] = useState('');
  const [modelB, setModelB] = useState('');

  const { data: datasets } = useQuery({
    queryKey: ['eval-datasets'],
    queryFn: fetchEvalDatasets,
  });

  const { data: comparisons, isLoading } = useQuery({
    queryKey: ['pairwise-comparisons'],
    queryFn: fetchPairwiseComparisons,
    refetchInterval: 10_000,
  });

  const compareMutation = useMutation({
    mutationFn: runPairwiseComparison,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['pairwise-comparisons'] }),
  });

  function handleCompare() {
    if (!selectedDataset || !modelA.trim() || !modelB.trim()) return;
    compareMutation.mutate({ datasetId: selectedDataset, modelA, modelB });
  }

  const barData =
    comparisons?.map((c: PairwiseComparisonSummary) => ({
      name: `${c.modelA} vs ${c.modelB}`,
      'Model A': Math.round(c.winRateA * 100),
      'Model B': Math.round(c.winRateB * 100),
      Tie: Math.round((1 - c.winRateA - c.winRateB) * 100),
    })) ?? [];

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Pairwise Comparison</h3>

      <div className="flex gap-2 items-end flex-wrap">
        <div className="flex-1 min-w-[120px]">
          <label className="text-xs text-muted-foreground">Dataset</label>
          <select
            value={selectedDataset}
            onChange={(e) => {
              setSelectedDataset(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          >
            <option value="">Select...</option>
            {datasets?.map((ds: EvalDataset) => (
              <option key={ds.id} value={ds.id}>
                {ds.name}
              </option>
            ))}
          </select>
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="text-xs text-muted-foreground">Model A</label>
          <input
            type="text"
            placeholder="e.g. llama3:8b"
            value={modelA}
            onChange={(e) => {
              setModelA(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          />
        </div>
        <div className="flex-1 min-w-[100px]">
          <label className="text-xs text-muted-foreground">Model B</label>
          <input
            type="text"
            placeholder="e.g. mistral:7b"
            value={modelB}
            onChange={(e) => {
              setModelB(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          />
        </div>
        <button
          onClick={handleCompare}
          disabled={
            !selectedDataset || !modelA.trim() || !modelB.trim() || compareMutation.isPending
          }
          className="flex items-center gap-1 px-3 py-1 text-xs bg-primary text-primary-foreground rounded disabled:opacity-50"
        >
          {compareMutation.isPending ? (
            <Loader2 className="w-3 h-3 animate-spin" />
          ) : (
            <Play className="w-3 h-3" />
          )}
          Compare
        </button>
      </div>

      {isLoading && (
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading comparisons...
        </div>
      )}

      {barData.length > 0 && (
        <div className="border rounded-lg p-4">
          <div className="text-xs text-muted-foreground mb-2">Win Rates (%)</div>
          <div className="h-48" data-testid="bar-chart">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={barData} layout="vertical">
                <CartesianGrid strokeDasharray="3 3" />
                <XAxis type="number" domain={[0, 100]} />
                <YAxis type="category" dataKey="name" width={120} tick={{ fontSize: 11 }} />
                <Tooltip />
                <Bar dataKey="Model A" fill="hsl(var(--primary))" stackId="stack" />
                <Bar dataKey="Tie" fill="hsl(var(--muted-foreground))" stackId="stack" />
                <Bar dataKey="Model B" fill="hsl(217, 91%, 60%)" stackId="stack" />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      )}

      {comparisons?.map((c: PairwiseComparisonSummary) => (
        <div
          key={c.comparisonId}
          className="flex items-center gap-3 text-xs border rounded px-3 py-2"
        >
          <span className="font-mono">{c.modelA}</span>
          <span className="text-green-600 font-semibold">{c.winsA}W</span>
          <span className="text-muted-foreground">{c.ties}T</span>
          <span className="text-blue-600 font-semibold">{c.winsB}W</span>
          <span className="font-mono">{c.modelB}</span>
          <span className="ml-auto text-muted-foreground">{c.sampleCount} samples</span>
        </div>
      ))}
    </div>
  );
}

// ── Auto-Eval Section ────────────────────────────────────────────────────────

function AutoEvalSection() {
  const [groundednessThreshold, setGroundednessThreshold] = useState('3.0');
  const [coherenceThreshold, setCoherenceThreshold] = useState('3.0');

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold">Auto-Eval Configuration</h3>
      <p className="text-xs text-muted-foreground">
        When a finetune job completes, auto-eval runs a pointwise evaluation and gates deployment
        based on these thresholds.
      </p>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="text-xs text-muted-foreground">Groundedness threshold (1-5)</label>
          <input
            type="number"
            min="1"
            max="5"
            step="0.1"
            value={groundednessThreshold}
            onChange={(e) => {
              setGroundednessThreshold(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          />
        </div>
        <div>
          <label className="text-xs text-muted-foreground">Coherence threshold (1-5)</label>
          <input
            type="number"
            min="1"
            max="5"
            step="0.1"
            value={coherenceThreshold}
            onChange={(e) => {
              setCoherenceThreshold(e.target.value);
            }}
            className="w-full px-2 py-1 text-sm border rounded bg-background"
          />
        </div>
      </div>

      <div className="flex items-start gap-2 p-3 bg-muted/30 rounded-lg text-xs text-muted-foreground">
        <CheckCircle2 className="w-4 h-4 text-green-500 mt-0.5 flex-shrink-0" />
        <span>
          A model must score &ge; {groundednessThreshold} on groundedness and &ge;{' '}
          {coherenceThreshold} on coherence to pass the auto-eval gate. Failed models will trigger a
          notification and block deployment.
        </span>
      </div>
    </div>
  );
}

// ── Root Export ───────────────────────────────────────────────────────────────

export function EvaluationTab() {
  return (
    <div className="space-y-6" data-testid="evaluation-tab">
      <div className="flex items-center gap-2 mb-2">
        <Database className="w-5 h-5 text-primary" />
        <h2 className="text-base font-semibold">LLM-as-Judge Evaluation</h2>
      </div>

      <DatasetSection />

      <hr className="border-border" />

      <PointwiseEvalSection />

      <hr className="border-border" />

      <PairwiseSection />

      <hr className="border-border" />

      <AutoEvalSection />
    </div>
  );
}
