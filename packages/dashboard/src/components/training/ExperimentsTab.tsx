import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Trash2,
  Plus,
  GitCompare,
  FlaskConical,
  CheckCircle2,
  XCircle,
  Clock,
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
  fetchTrainingExperiments,
  createTrainingExperiment,
  deleteTrainingExperiment,
  getTrainingExperiment,
  diffTrainingExperiments,
  type TrainingExperimentItem,
  type ExperimentDiffItem,
} from '../../api/client';

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    draft: {
      cls: 'bg-muted text-muted-foreground',
      icon: <Clock className="w-3 h-3" />,
    },
    running: {
      cls: 'bg-primary/10 text-primary',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    completed: {
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    failed: {
      cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
      icon: <XCircle className="w-3 h-3" />,
    },
  };
  const item = map[status] ?? map.draft;

  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${item.cls}`}>
      {item.icon} {status}
    </span>
  );
}

export function ExperimentsTab() {
  const queryClient = useQueryClient();
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [diffIds, setDiffIds] = useState<[string, string] | null>(null);
  const [newName, setNewName] = useState('');

  const { data: listData, isLoading } = useQuery({
    queryKey: ['training-experiments'],
    queryFn: () => fetchTrainingExperiments(),
  });

  const { data: selectedExp } = useQuery({
    queryKey: ['training-experiment', selectedId],
    queryFn: () => (selectedId ? getTrainingExperiment(selectedId) : null),
    enabled: !!selectedId,
  });

  const { data: diffData } = useQuery({
    queryKey: ['training-experiment-diff', diffIds],
    queryFn: () => (diffIds ? diffTrainingExperiments(diffIds[0], diffIds[1]) : null),
    enabled: !!diffIds,
  });

  const createMutation = useMutation({
    mutationFn: (name: string) => createTrainingExperiment({ name }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-experiments'] });
      setNewName('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteTrainingExperiment,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['training-experiments'] });
      if (selectedId) setSelectedId(null);
    },
  });

  const experiments = listData?.experiments ?? [];

  return (
    <div className="space-y-4">
      {/* Create new */}
      <div className="flex items-center gap-2">
        <input
          type="text"
          placeholder="Experiment name..."
          value={newName}
          onChange={(e) => {
            setNewName(e.target.value);
          }}
          className="text-sm bg-muted border-0 rounded px-3 py-1.5 flex-1 max-w-xs"
        />
        <button
          onClick={() => {
            newName.trim() && createMutation.mutate(newName.trim());
          }}
          disabled={!newName.trim() || createMutation.isPending}
          className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
        >
          <Plus className="w-3.5 h-3.5" /> Create
        </button>
      </div>

      {isLoading ? (
        <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
          <Loader2 className="w-4 h-4 animate-spin" /> Loading experiments...
        </div>
      ) : experiments.length === 0 ? (
        <p className="text-sm text-muted-foreground py-4">No experiments yet.</p>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Experiment list */}
          <div className="space-y-2">
            <h3 className="text-sm font-medium flex items-center gap-1.5">
              <FlaskConical className="w-4 h-4" /> Experiments ({experiments.length})
            </h3>
            <div className="space-y-1 max-h-96 overflow-y-auto">
              {experiments.map((exp) => (
                <div
                  key={exp.id}
                  onClick={() => {
                    setSelectedId(exp.id);
                  }}
                  className={`border rounded p-2 cursor-pointer text-sm flex items-center justify-between ${
                    selectedId === exp.id ? 'border-primary bg-primary/5' : 'hover:bg-muted/50'
                  }`}
                >
                  <div>
                    <p className="font-medium">{exp.name}</p>
                    <p className="text-xs text-muted-foreground">
                      {new Date(exp.createdAt).toLocaleDateString()}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    <StatusBadge status={exp.status} />
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteMutation.mutate(exp.id);
                      }}
                      className="text-muted-foreground hover:text-destructive p-1"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
            {/* Diff selector */}
            {experiments.length >= 2 && (
              <div className="pt-2 border-t">
                <p className="text-xs text-muted-foreground mb-1">Compare two experiments:</p>
                <div className="flex items-center gap-2">
                  <select
                    className="text-xs bg-muted rounded px-2 py-1 flex-1"
                    onChange={(e) => {
                      const val = e.target.value;
                      setDiffIds((prev) => (val ? [val, prev?.[1] ?? ''] : null));
                    }}
                  >
                    <option value="">Select A</option>
                    {experiments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                  <GitCompare className="w-4 h-4 text-muted-foreground" />
                  <select
                    className="text-xs bg-muted rounded px-2 py-1 flex-1"
                    onChange={(e) => {
                      const val = e.target.value;
                      setDiffIds((prev) => (val && prev?.[0] ? [prev[0], val] : null));
                    }}
                  >
                    <option value="">Select B</option>
                    {experiments.map((e) => (
                      <option key={e.id} value={e.id}>
                        {e.name}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* Detail / Diff view */}
          <div>
            {diffData ? (
              <DiffView diff={diffData} />
            ) : selectedExp ? (
              <ExperimentDetail exp={selectedExp} />
            ) : (
              <p className="text-sm text-muted-foreground py-8 text-center">
                Select an experiment to view details
              </p>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ExperimentDetail({ exp }: { exp: TrainingExperimentItem }) {
  const metricsData = Object.entries(exp.evalMetrics).map(([key, value]) => ({
    dimension: key,
    value,
    fullMark: 5,
  }));

  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium">{exp.name}</h4>
      {exp.notes && <p className="text-xs text-muted-foreground">{exp.notes}</p>}

      {/* Hyperparameters */}
      {Object.keys(exp.hyperparameters).length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Hyperparameters</p>
          <div className="grid grid-cols-2 gap-1 text-xs">
            {Object.entries(exp.hyperparameters).map(([k, v]) => (
              <div key={k} className="bg-muted rounded px-2 py-1">
                <span className="text-muted-foreground">{k}:</span>{' '}
                <span className="font-mono">{String(v)}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Loss curve */}
      {exp.lossCurve.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Loss Curve</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart data={exp.lossCurve}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line type="monotone" dataKey="loss" stroke="hsl(var(--primary))" dot={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}

      {/* Eval metrics radar */}
      {metricsData.length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Eval Metrics</p>
          <ResponsiveContainer width="100%" height={200}>
            <RadarChart data={metricsData}>
              <PolarGrid />
              <PolarAngleAxis dataKey="dimension" tick={{ fontSize: 10 }} />
              <PolarRadiusAxis angle={30} domain={[0, 5]} tick={{ fontSize: 9 }} />
              <Radar
                dataKey="value"
                stroke="hsl(var(--primary))"
                fill="hsl(var(--primary))"
                fillOpacity={0.3}
              />
            </RadarChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}

function DiffView({ diff }: { diff: ExperimentDiffItem }) {
  return (
    <div className="space-y-3">
      <h4 className="text-sm font-medium flex items-center gap-1.5">
        <GitCompare className="w-4 h-4" /> Experiment Diff
      </h4>

      {Object.keys(diff.hyperparamDiffs).length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Hyperparameter Differences</p>
          <div className="space-y-1">
            {Object.entries(diff.hyperparamDiffs).map(([key, { a, b }]) => (
              <div key={key} className="flex items-center text-xs gap-2 bg-muted rounded px-2 py-1">
                <span className="font-medium w-24">{key}</span>
                <span className="text-red-500 font-mono">{String(a ?? '—')}</span>
                <span className="text-muted-foreground">→</span>
                <span className="text-green-500 font-mono">{String(b ?? '—')}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {Object.keys(diff.metricDiffs).length > 0 && (
        <div>
          <p className="text-xs font-medium mb-1">Metric Differences</p>
          <div className="space-y-1">
            {Object.entries(diff.metricDiffs).map(([key, { a, b }]) => (
              <div key={key} className="flex items-center text-xs gap-2 bg-muted rounded px-2 py-1">
                <span className="font-medium w-24">{key}</span>
                <span className="font-mono">{a?.toFixed(3) ?? '—'}</span>
                <span className="text-muted-foreground">→</span>
                <span className="font-mono">{b?.toFixed(3) ?? '—'}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Overlaid loss curves */}
      {(diff.lossCurveA.length > 0 || diff.lossCurveB.length > 0) && (
        <div>
          <p className="text-xs font-medium mb-1">Loss Curves</p>
          <ResponsiveContainer width="100%" height={200}>
            <LineChart>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="step" tick={{ fontSize: 10 }} />
              <YAxis tick={{ fontSize: 10 }} />
              <Tooltip />
              <Line
                data={diff.lossCurveA}
                type="monotone"
                dataKey="loss"
                stroke="hsl(var(--primary))"
                dot={false}
                name="Experiment A"
              />
              <Line
                data={diff.lossCurveB}
                type="monotone"
                dataKey="loss"
                stroke="#ef4444"
                dot={false}
                name="Experiment B"
              />
            </LineChart>
          </ResponsiveContainer>
        </div>
      )}
    </div>
  );
}
