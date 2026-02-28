import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ShieldAlert,
  CheckCircle,
} from 'lucide-react';
import {
  fetchAutonomyOverview,
  fetchAuditRuns,
  fetchAuditRun,
  createAuditRun,
  updateAuditItem,
  finalizeAuditRun,
  emergencyStop,
} from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';
import type {
  AutonomyOverviewItem,
  ChecklistItem,
  AuditItemStatus,
  AutonomyLevel,
} from '../../types';

export function AutonomyTab() {
  const queryClient = useQueryClient();
  const [activePanel, setActivePanel] = useState<'overview' | 'wizard' | 'registry'>('overview');
  const [filterLevel, setFilterLevel] = useState<AutonomyLevel | ''>('');
  const [wizardRunId, setWizardRunId] = useState<string | null>(null);
  const [wizardName, setWizardName] = useState('');
  const [wizardStep, setWizardStep] = useState<0 | 'A' | 'B' | 'C' | 'D' | 'done'>(0);
  const [stopTarget, setStopTarget] = useState<AutonomyOverviewItem | null>(null);

  const { data: overview, isLoading: overviewLoading } = useQuery({
    queryKey: ['autonomy-overview'],
    queryFn: fetchAutonomyOverview,
  });

  const { data: runs = [], isLoading: runsLoading } = useQuery({
    queryKey: ['autonomy-audit-runs'],
    queryFn: fetchAuditRuns,
  });

  const { data: activeRun, refetch: refetchRun } = useQuery({
    queryKey: ['autonomy-audit-run', wizardRunId],
    queryFn: () => fetchAuditRun(wizardRunId!),
    enabled: !!wizardRunId,
  });

  const createRunMut = useMutation({
    mutationFn: (name: string) => createAuditRun(name),
    onSuccess: (run) => {
      setWizardRunId(run.id);
      setWizardStep('A');
      void queryClient.invalidateQueries({ queryKey: ['autonomy-audit-runs'] });
    },
  });

  const updateItemMut = useMutation({
    mutationFn: ({
      itemId,
      status,
      note,
    }: {
      itemId: string;
      status: AuditItemStatus;
      note: string;
    }) => updateAuditItem(wizardRunId!, itemId, { status, note }),
    onSuccess: () => void refetchRun(),
  });

  const finalizeMut = useMutation({
    mutationFn: () => finalizeAuditRun(wizardRunId!),
    onSuccess: (run) => {
      setWizardStep('done');
      void queryClient.invalidateQueries({ queryKey: ['autonomy-audit-runs'] });
      setWizardRunId(run.id);
    },
  });

  const stopMut = useMutation({
    mutationFn: ({ type, id }: { type: 'skill' | 'workflow'; id: string }) =>
      emergencyStop(type, id),
    onSuccess: () => {
      setStopTarget(null);
      void queryClient.invalidateQueries({ queryKey: ['autonomy-overview'] });
    },
  });

  const LEVEL_COLORS: Record<AutonomyLevel, string> = {
    L1: 'text-success bg-success/10',
    L2: 'text-info bg-info/10',
    L3: 'text-warning bg-warning/10',
    L4: 'text-orange-500 bg-orange-50',
    L5: 'text-destructive bg-destructive/10',
  };

  const allItems = overview ? Object.values(overview.byLevel).flat() : [];
  const filteredItems = filterLevel
    ? allItems.filter((i) => i.autonomyLevel === filterLevel)
    : allItems;
  const l5Items = overview ? (overview.byLevel.L5 ?? []) : [];

  const sections: { key: 'A' | 'B' | 'C' | 'D'; label: string }[] = [
    { key: 'A', label: 'Section A — Inventory' },
    { key: 'B', label: 'Section B — Level Review' },
    { key: 'C', label: 'Section C — Authority & Accountability' },
    { key: 'D', label: 'Section D — Gap Remediation' },
  ];

  const nextSection = (cur: 'A' | 'B' | 'C' | 'D' | 'done'): 'B' | 'C' | 'D' | 'done' => {
    const map: Record<string, 'B' | 'C' | 'D' | 'done'> = { A: 'B', B: 'C', C: 'D', D: 'done' };
    return map[cur] ?? 'done';
  };

  return (
    <div className="space-y-6">
      {/* Emergency stop confirmation */}
      {stopTarget && (
        <ConfirmDialog
          open
          title="Emergency Stop"
          message={`Disable ${stopTarget.type} "${stopTarget.name}" (${stopTarget.autonomyLevel})? This will set it to disabled. The action will be audited.`}
          confirmLabel="Stop"
          destructive
          onConfirm={() => {
            stopMut.mutate({ type: stopTarget.type, id: stopTarget.id });
          }}
          onCancel={() => {
            setStopTarget(null);
          }}
        />
      )}

      {/* Panel switcher */}
      <div className="flex gap-2 flex-wrap">
        {(['overview', 'wizard', 'registry'] as const).map((p) => (
          <button
            key={p}
            onClick={() => {
              setActivePanel(p);
            }}
            className={`px-3 py-1.5 text-sm rounded-md font-medium transition-colors ${
              activePanel === p
                ? 'bg-primary text-primary-foreground'
                : 'bg-muted text-muted-foreground hover:bg-muted/80'
            }`}
          >
            {p === 'overview'
              ? 'Overview'
              : p === 'wizard'
                ? 'Audit Wizard'
                : 'Emergency Stop Registry'}
          </button>
        ))}
      </div>

      {/* ── Overview panel ── */}
      {activePanel === 'overview' && (
        <div className="space-y-4">
          {/* Totals */}
          <div className="grid grid-cols-5 gap-3">
            {(['L1', 'L2', 'L3', 'L4', 'L5'] as AutonomyLevel[]).map((l) => (
              <button
                key={l}
                onClick={() => {
                  setFilterLevel(filterLevel === l ? '' : l);
                }}
                className={`card p-3 text-center cursor-pointer border-2 transition-colors ${
                  filterLevel === l ? 'border-primary' : 'border-transparent'
                }`}
              >
                <div className={`text-2xl font-bold ${LEVEL_COLORS[l].split(' ')[0]}`}>
                  {overview?.totals[l] ?? 0}
                </div>
                <div className="text-xs font-medium mt-1">{l}</div>
              </button>
            ))}
          </div>

          {overviewLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {/* Items table */}
          {filteredItems.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Level</th>
                    <th className="text-left p-3">Stop Procedure</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 text-muted-foreground capitalize">{item.type}</td>
                      <td className="p-3">
                        <span
                          className={`px-2 py-0.5 rounded text-xs font-semibold ${LEVEL_COLORS[item.autonomyLevel]}`}
                        >
                          {item.autonomyLevel}
                        </span>
                      </td>
                      <td className="p-3 text-xs text-muted-foreground max-w-xs truncate">
                        {item.emergencyStopProcedure ?? <span className="italic">—</span>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {!overviewLoading && filteredItems.length === 0 && (
            <p className="text-sm text-muted-foreground text-center py-8">
              No items at this level.
            </p>
          )}
        </div>
      )}

      {/* ── Audit Wizard panel ── */}
      {activePanel === 'wizard' && (
        <div className="space-y-4 max-w-3xl">
          {wizardStep === 0 && (
            <div className="card p-6 space-y-4">
              <h3 className="font-semibold text-lg">Start Autonomy Audit</h3>
              <p className="text-sm text-muted-foreground">
                Enter a name for this audit run, then work through sections A–D to document your
                review.
              </p>
              <input
                className="input w-full"
                placeholder="Audit name (e.g. Q1 2026 Autonomy Review)"
                value={wizardName}
                onChange={(e) => {
                  setWizardName(e.target.value);
                }}
              />
              <button
                className="btn btn-ghost"
                disabled={!wizardName.trim() || createRunMut.isPending}
                onClick={() => {
                  createRunMut.mutate(wizardName.trim());
                }}
              >
                {createRunMut.isPending ? 'Starting…' : 'Start Audit'}
              </button>

              {/* Previous runs */}
              {runs.length > 0 && (
                <div className="mt-4">
                  <h4 className="text-sm font-medium mb-2">Previous Runs</h4>
                  <div className="space-y-1">
                    {runs.map((run) => (
                      <button
                        key={run.id}
                        className="w-full text-left p-2 rounded hover:bg-muted text-sm flex justify-between"
                        onClick={() => {
                          setWizardRunId(run.id);
                          setWizardStep(run.status === 'completed' ? 'done' : 'A');
                        }}
                      >
                        <span>{run.name}</span>
                        <span
                          className={`text-xs ${run.status === 'completed' ? 'text-success' : 'text-warning'}`}
                        >
                          {run.status}
                        </span>
                      </button>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}

          {(['A', 'B', 'C', 'D'] as const).includes(wizardStep as any) && activeRun && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-semibold">
                  {sections.find((s) => s.key === wizardStep)?.label ?? ''}
                </h3>
                <span className="text-xs text-muted-foreground">{activeRun.name}</span>
              </div>
              <div className="space-y-3">
                {activeRun.items
                  .filter((item: ChecklistItem) => item.section === wizardStep)
                  .map((item: ChecklistItem) => (
                    <div key={item.id} className="p-3 border rounded-lg space-y-2">
                      <p className="text-sm">{item.text}</p>
                      <div className="flex gap-2 flex-wrap">
                        {(['pass', 'fail', 'deferred', 'pending'] as AuditItemStatus[]).map((s) => (
                          <button
                            key={s}
                            onClick={() => {
                              updateItemMut.mutate({ itemId: item.id, status: s, note: item.note });
                            }}
                            className={`px-2 py-1 text-xs rounded font-medium transition-colors ${
                              item.status === s
                                ? s === 'pass'
                                  ? 'bg-success text-success-foreground'
                                  : s === 'fail'
                                    ? 'bg-destructive text-destructive-foreground'
                                    : s === 'deferred'
                                      ? 'bg-warning text-warning-foreground'
                                      : 'bg-muted text-muted-foreground'
                                : 'bg-muted text-muted-foreground hover:bg-muted/80'
                            }`}
                          >
                            {s}
                          </button>
                        ))}
                      </div>
                      <input
                        className="input w-full text-xs"
                        placeholder="Notes (optional)"
                        value={item.note}
                        onChange={(e) => {
                          updateItemMut.mutate({
                            itemId: item.id,
                            status: item.status,
                            note: e.target.value,
                          });
                        }}
                      />
                    </div>
                  ))}
              </div>
              <div className="flex justify-between pt-2">
                <button
                  className="btn btn-ghost text-sm"
                  onClick={() => {
                    setWizardStep(0);
                  }}
                >
                  Back to list
                </button>
                {wizardStep !== 'D' ? (
                  <button
                    className="btn btn-ghost text-sm"
                    onClick={() => {
                      setWizardStep(nextSection(wizardStep as 'A' | 'B' | 'C' | 'D'));
                    }}
                  >
                    Next section →
                  </button>
                ) : (
                  <button
                    className="btn btn-ghost text-sm"
                    disabled={finalizeMut.isPending}
                    onClick={() => {
                      finalizeMut.mutate();
                    }}
                  >
                    {finalizeMut.isPending ? 'Generating…' : 'Finalize & Generate Report'}
                  </button>
                )}
              </div>
            </div>
          )}

          {wizardStep === 'done' && activeRun && (
            <div className="card p-6 space-y-4">
              <div className="flex items-center gap-2">
                <CheckCircle className="w-5 h-5 text-success" />
                <h3 className="font-semibold">Audit Complete: {activeRun.name}</h3>
              </div>
              <div className="flex gap-4 text-sm">
                <span className="text-success">
                  ✅ Pass:{' '}
                  {activeRun.items.filter((i: ChecklistItem) => i.status === 'pass').length}
                </span>
                <span className="text-destructive">
                  ❌ Fail:{' '}
                  {activeRun.items.filter((i: ChecklistItem) => i.status === 'fail').length}
                </span>
                <span className="text-warning">
                  ⏳ Deferred:{' '}
                  {activeRun.items.filter((i: ChecklistItem) => i.status === 'deferred').length}
                </span>
              </div>
              {activeRun.reportMarkdown && (
                <details className="text-sm">
                  <summary className="cursor-pointer font-medium">View Report</summary>
                  <pre className="mt-2 p-4 bg-muted rounded text-xs overflow-auto max-h-96 whitespace-pre-wrap">
                    {activeRun.reportMarkdown}
                  </pre>
                </details>
              )}
              <button
                className="btn btn-ghost text-sm"
                onClick={() => {
                  setWizardStep(0);
                }}
              >
                ← Back to audit list
              </button>
            </div>
          )}
        </div>
      )}

      {/* ── Emergency Stop Registry panel ── */}
      {activePanel === 'registry' && (
        <div className="space-y-4">
          <div className="flex items-start gap-2 p-4 bg-destructive/10 rounded-lg text-sm text-destructive">
            <ShieldAlert className="w-5 h-5 flex-shrink-0 mt-0.5" />
            <p>
              Emergency stop immediately disables the skill or workflow. In-flight runs are not
              cancelled. This action is audited. Admin role required.
            </p>
          </div>

          {overviewLoading && <p className="text-sm text-muted-foreground">Loading…</p>}

          {l5Items.length === 0 && !overviewLoading && (
            <p className="text-sm text-muted-foreground text-center py-8">No L5 items found.</p>
          )}

          {l5Items.length > 0 && (
            <div className="card overflow-hidden">
              <table className="w-full text-sm">
                <thead className="bg-muted/50">
                  <tr>
                    <th className="text-left p-3">Name</th>
                    <th className="text-left p-3">Type</th>
                    <th className="text-left p-3">Stop Procedure</th>
                    <th className="text-left p-3">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {l5Items.map((item) => (
                    <tr key={item.id} className="border-t border-border">
                      <td className="p-3 font-medium">{item.name}</td>
                      <td className="p-3 capitalize text-muted-foreground">{item.type}</td>
                      <td className="p-3 text-xs text-muted-foreground max-w-xs">
                        {item.emergencyStopProcedure ?? (
                          <span className="italic text-warning">No procedure documented</span>
                        )}
                      </td>
                      <td className="p-3">
                        <button
                          className="btn btn-sm bg-destructive text-destructive-foreground hover:bg-destructive/90 text-xs"
                          onClick={() => {
                            setStopTarget(item);
                          }}
                        >
                          Emergency Stop
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
