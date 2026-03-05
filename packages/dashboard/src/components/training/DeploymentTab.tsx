import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Loader2,
  Rocket,
  RotateCcw,
  Plus,
  CheckCircle2,
  XCircle,
  Clock,
  FlaskConical,
  BarChart3,
} from 'lucide-react';
import {
  fetchModelVersions,
  deployModel,
  rollbackModel,
  fetchAbTests,
  createAbTest,
  completeAbTest,
  cancelAbTest,
  evaluateAbTest,
  type ModelVersionItem,
  type AbTestItem,
} from '../../api/client';

function VersionBadge({ isActive }: { isActive: boolean }) {
  return isActive ? (
    <span className="inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400">
      <CheckCircle2 className="w-3 h-3" /> Active
    </span>
  ) : (
    <span className="text-xs text-muted-foreground">inactive</span>
  );
}

function AbTestStatusBadge({ status }: { status: string }) {
  const map: Record<string, { cls: string; icon: React.ReactNode }> = {
    running: {
      cls: 'bg-primary/10 text-primary',
      icon: <Loader2 className="w-3 h-3 animate-spin" />,
    },
    completed: {
      cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
      icon: <CheckCircle2 className="w-3 h-3" />,
    },
    cancelled: {
      cls: 'bg-muted text-muted-foreground',
      icon: <XCircle className="w-3 h-3" />,
    },
  };
  const item = map[status] ?? map.running;
  return (
    <span className={`inline-flex items-center gap-1 text-xs px-2 py-0.5 rounded ${item.cls}`}>
      {item.icon} {status}
    </span>
  );
}

export function DeploymentTab() {
  const queryClient = useQueryClient();
  const [personalityId, setPersonalityId] = useState('');

  // Deploy form
  const [deployPersonalityId, setDeployPersonalityId] = useState('');
  const [deployModelName, setDeployModelName] = useState('');

  // A/B test form
  const [abForm, setAbForm] = useState({
    personalityId: '',
    name: '',
    modelA: '',
    modelB: '',
    trafficPctB: 50,
  });

  const { data: versionsData, isLoading: versionsLoading } = useQuery({
    queryKey: ['model-versions', personalityId],
    queryFn: () => (personalityId ? fetchModelVersions(personalityId) : null),
    enabled: !!personalityId,
  });

  const { data: testsData, isLoading: testsLoading } = useQuery({
    queryKey: ['ab-tests'],
    queryFn: () => fetchAbTests(),
  });

  const deployMutation = useMutation({
    mutationFn: () =>
      deployModel({ personalityId: deployPersonalityId, modelName: deployModelName }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['model-versions'] });
      setDeployModelName('');
    },
  });

  const rollbackMutation = useMutation({
    mutationFn: (pid: string) => rollbackModel(pid),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['model-versions'] }),
  });

  const createTestMutation = useMutation({
    mutationFn: () => createAbTest(abForm),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['ab-tests'] });
      setAbForm({ personalityId: '', name: '', modelA: '', modelB: '', trafficPctB: 50 });
    },
  });

  const completeMutation = useMutation({
    mutationFn: ({ id, winner }: { id: string; winner: string }) => completeAbTest(id, winner),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ab-tests'] }),
  });

  const cancelMutation = useMutation({
    mutationFn: cancelAbTest,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['ab-tests'] }),
  });

  const evaluateMutation = useMutation({
    mutationFn: evaluateAbTest,
  });

  const versions = versionsData?.versions ?? [];
  const tests = testsData?.tests ?? [];

  return (
    <div className="space-y-6">
      {/* Model Versions */}
      <section className="space-y-3">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <Rocket className="w-4 h-4" /> Deployed Models
        </h3>
        <div className="flex items-center gap-2">
          <input
            type="text"
            placeholder="Personality ID..."
            value={personalityId}
            onChange={(e) => {
              setPersonalityId(e.target.value);
            }}
            className="text-sm bg-muted border-0 rounded px-3 py-1.5 w-80"
          />
        </div>
        {versionsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : personalityId && versions.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            No deployed versions for this personality.
          </p>
        ) : (
          <div className="space-y-1">
            {versions.map((v) => (
              <div
                key={v.id}
                className="border rounded p-2 flex items-center justify-between text-sm"
              >
                <div>
                  <span className="font-mono text-xs">{v.modelName}</span>
                  <span className="text-xs text-muted-foreground ml-2">
                    {new Date(v.deployedAt).toLocaleDateString()}
                  </span>
                  {v.previousModel && (
                    <span className="text-xs text-muted-foreground ml-2">
                      prev: {v.previousModel}
                    </span>
                  )}
                </div>
                <VersionBadge isActive={v.isActive} />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* Deploy / Rollback */}
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium">Deploy Model</h3>
        <div className="flex items-center gap-2 flex-wrap">
          <input
            type="text"
            placeholder="Personality ID"
            value={deployPersonalityId}
            onChange={(e) => {
              setDeployPersonalityId(e.target.value);
            }}
            className="text-sm bg-muted border-0 rounded px-3 py-1.5 w-64"
          />
          <input
            type="text"
            placeholder="Model name (e.g. my-model:latest)"
            value={deployModelName}
            onChange={(e) => {
              setDeployModelName(e.target.value);
            }}
            className="text-sm bg-muted border-0 rounded px-3 py-1.5 w-64"
          />
          <button
            onClick={() => {
              deployMutation.mutate();
            }}
            disabled={!deployPersonalityId || !deployModelName || deployMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded-md hover:bg-primary/90 disabled:opacity-50"
          >
            <Rocket className="w-3.5 h-3.5" />
            {deployMutation.isPending ? 'Deploying...' : 'Deploy'}
          </button>
          <button
            onClick={() => {
              if (deployPersonalityId) {
                rollbackMutation.mutate(deployPersonalityId);
              }
            }}
            disabled={!deployPersonalityId || rollbackMutation.isPending}
            className="flex items-center gap-1.5 text-xs px-3 py-1.5 border rounded-md hover:bg-muted disabled:opacity-50"
          >
            <RotateCcw className="w-3.5 h-3.5" /> Rollback
          </button>
        </div>
      </section>

      {/* A/B Tests */}
      <section className="space-y-3 border-t pt-4">
        <h3 className="text-sm font-medium flex items-center gap-1.5">
          <FlaskConical className="w-4 h-4" /> A/B Tests
        </h3>

        {/* Create form */}
        <div className="border rounded-lg p-3 space-y-2">
          <p className="text-xs font-medium">New A/B Test</p>
          <div className="flex items-center gap-2 flex-wrap">
            <input
              placeholder="Name"
              value={abForm.name}
              onChange={(e) => {
                setAbForm({ ...abForm, name: e.target.value });
              }}
              className="text-xs bg-muted border-0 rounded px-2 py-1 w-40"
            />
            <input
              placeholder="Personality ID"
              value={abForm.personalityId}
              onChange={(e) => {
                setAbForm({ ...abForm, personalityId: e.target.value });
              }}
              className="text-xs bg-muted border-0 rounded px-2 py-1 w-56"
            />
            <input
              placeholder="Model A"
              value={abForm.modelA}
              onChange={(e) => {
                setAbForm({ ...abForm, modelA: e.target.value });
              }}
              className="text-xs bg-muted border-0 rounded px-2 py-1 w-40"
            />
            <input
              placeholder="Model B"
              value={abForm.modelB}
              onChange={(e) => {
                setAbForm({ ...abForm, modelB: e.target.value });
              }}
              className="text-xs bg-muted border-0 rounded px-2 py-1 w-40"
            />
            <label className="text-xs text-muted-foreground">
              B traffic: {abForm.trafficPctB}%
              <input
                type="range"
                min={1}
                max={99}
                value={abForm.trafficPctB}
                onChange={(e) => {
                  setAbForm({ ...abForm, trafficPctB: Number(e.target.value) });
                }}
                className="ml-1 w-20"
              />
            </label>
            <button
              onClick={() => {
                createTestMutation.mutate();
              }}
              disabled={
                !abForm.name ||
                !abForm.personalityId ||
                !abForm.modelA ||
                !abForm.modelB ||
                createTestMutation.isPending
              }
              className="flex items-center gap-1 text-xs px-2 py-1 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50"
            >
              <Plus className="w-3 h-3" /> Create
            </button>
          </div>
        </div>

        {/* Test list */}
        {testsLoading ? (
          <div className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="w-4 h-4 animate-spin" /> Loading...
          </div>
        ) : tests.length === 0 ? (
          <p className="text-sm text-muted-foreground">No A/B tests yet.</p>
        ) : (
          <div className="space-y-2">
            {tests.map((test) => (
              <div key={test.id} className="border rounded-lg p-3 space-y-2 text-sm">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-medium">{test.name}</span>
                    <span className="text-xs text-muted-foreground ml-2">
                      {test.modelA} vs {test.modelB} ({test.trafficPctB}% to B)
                    </span>
                  </div>
                  <AbTestStatusBadge status={test.status} />
                </div>

                {/* Quality metrics */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="bg-muted/50 rounded p-2 text-xs">
                    <p className="font-medium">Model A: {test.modelA}</p>
                    <p>
                      Conversations: {test.conversationsA} | Avg Quality:{' '}
                      {test.avgQualityA?.toFixed(3) ?? '—'}
                    </p>
                  </div>
                  <div className="bg-muted/50 rounded p-2 text-xs">
                    <p className="font-medium">Model B: {test.modelB}</p>
                    <p>
                      Conversations: {test.conversationsB} | Avg Quality:{' '}
                      {test.avgQualityB?.toFixed(3) ?? '—'}
                    </p>
                  </div>
                </div>

                {test.winner && (
                  <p className="text-xs text-green-600 dark:text-green-400">
                    Winner: Model {test.winner.toUpperCase()}
                  </p>
                )}

                {test.status === 'running' && (
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => {
                        evaluateMutation.mutate(test.id);
                      }}
                      className="flex items-center gap-1 text-xs px-2 py-1 border rounded hover:bg-muted"
                    >
                      <BarChart3 className="w-3 h-3" /> Evaluate
                    </button>
                    <button
                      onClick={() => {
                        completeMutation.mutate({ id: test.id, winner: 'a' });
                      }}
                      className="text-xs px-2 py-1 border rounded hover:bg-muted"
                    >
                      Promote A
                    </button>
                    <button
                      onClick={() => {
                        completeMutation.mutate({ id: test.id, winner: 'b' });
                      }}
                      className="text-xs px-2 py-1 border rounded hover:bg-muted"
                    >
                      Promote B
                    </button>
                    <button
                      onClick={() => {
                        cancelMutation.mutate(test.id);
                      }}
                      className="text-xs px-2 py-1 text-destructive border border-destructive/30 rounded hover:bg-destructive/10"
                    >
                      Cancel
                    </button>
                  </div>
                )}

                {evaluateMutation.data && evaluateMutation.variables === test.id && (
                  <div className="text-xs bg-muted rounded p-2">
                    Evaluation: Winner={evaluateMutation.data.winner ?? 'undecided'} | A avg=
                    {evaluateMutation.data.avgQualityA?.toFixed(3) ?? '—'} (
                    {evaluateMutation.data.totalA}) | B avg=
                    {evaluateMutation.data.avgQualityB?.toFixed(3) ?? '—'} (
                    {evaluateMutation.data.totalB})
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}
