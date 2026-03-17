/**
 * SecurityATHITab — Phase 107-F: ATHI Threat Governance Framework
 *
 * Displays threat scenarios, risk matrix, and executive summary with
 * create/edit modals and filtering.
 */

import { useState, useCallback } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  Plus,
  Trash2,
  Edit2,
  X,
  Shield,
  AlertTriangle,
  Loader2,
  Link2,
} from 'lucide-react';
import {
  fetchAthiScenarios,
  fetchAthiMatrix,
  fetchAthiSummary,
  createAthiScenario,
  updateAthiScenario,
  deleteAthiScenario,
  linkEventsToAthiScenario,
} from '../../api/client';

// ─── Constants ────────────────────────────────────────────────────────────────

const ACTORS = [
  'nation_state',
  'cybercriminal',
  'insider',
  'hacktivist',
  'competitor',
  'automated_agent',
] as const;

const TECHNIQUES = [
  'prompt_injection',
  'data_poisoning',
  'model_theft',
  'supply_chain',
  'social_engineering',
  'adversarial_input',
  'privilege_escalation',
] as const;

const HARMS = [
  'data_breach',
  'misinformation',
  'service_disruption',
  'privacy_violation',
  'financial_loss',
  'reputational_damage',
  'safety_risk',
] as const;

const IMPACTS = [
  'regulatory_penalty',
  'operational_downtime',
  'customer_trust_loss',
  'ip_theft',
  'legal_liability',
] as const;

const STATUSES = ['identified', 'assessed', 'mitigated', 'accepted', 'monitoring'] as const;

const STATUS_COLORS: Record<string, string> = {
  identified: 'bg-blue-100 text-blue-700',
  assessed: 'bg-yellow-100 text-yellow-700',
  mitigated: 'bg-green-100 text-green-700',
  accepted: 'bg-gray-100 text-gray-600',
  monitoring: 'bg-purple-100 text-purple-700',
};

function formatLabel(s: string): string {
  return s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

function riskColor(score: number): string {
  if (score >= 20) return 'bg-red-100 text-red-700';
  if (score >= 10) return 'bg-orange-100 text-orange-700';
  if (score >= 5) return 'bg-yellow-100 text-yellow-700';
  return 'bg-green-100 text-green-700';
}

function matrixCellColor(avgScore: number): string {
  if (avgScore >= 20) return 'bg-red-500 text-white';
  if (avgScore >= 15) return 'bg-red-400 text-white';
  if (avgScore >= 10) return 'bg-orange-400 text-white';
  if (avgScore >= 5) return 'bg-yellow-400 text-black';
  return 'bg-green-400 text-black';
}

// ─── Scenario Modal ──────────────────────────────────────────────────────────

interface ScenarioFormData {
  title: string;
  description: string;
  actor: string;
  techniques: string[];
  harms: string[];
  impacts: string[];
  likelihood: number;
  severity: number;
  mitigations: { description: string; status: string; owner: string }[];
  status: string;
}

function ScenarioModal({
  open,
  onClose,
  onSubmit,
  initial,
}: {
  open: boolean;
  onClose: () => void;
  onSubmit: (data: ScenarioFormData) => void;
  initial?: ScenarioFormData;
}) {
  const [form, setForm] = useState<ScenarioFormData>(
    initial ?? {
      title: '',
      description: '',
      actor: 'cybercriminal',
      techniques: ['prompt_injection'],
      harms: ['data_breach'],
      impacts: ['regulatory_penalty'],
      likelihood: 3,
      severity: 3,
      mitigations: [],
      status: 'identified',
    }
  );

  const toggleItem = (arr: string[], item: string): string[] =>
    arr.includes(item) ? arr.filter((x) => x !== item) : [...arr, item];

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      data-testid="athi-scenario-modal"
    >
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className="relative bg-background border border-border rounded-lg shadow-xl w-full max-w-2xl max-h-[90vh] overflow-y-auto mx-4">
        <div className="sticky top-0 bg-background border-b border-border px-6 py-4 flex items-center justify-between z-10">
          <div className="flex items-center gap-2">
            <Target className="w-5 h-5 text-primary" />
            <h2 className="text-lg font-semibold">
              {initial ? 'Edit Scenario' : 'Create Threat Scenario'}
            </h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Close"
            className="text-muted-foreground hover:text-foreground"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (!form.title.trim() || form.techniques.length === 0) return;
            onSubmit(form);
          }}
          className="px-6 py-4 space-y-4"
        >
          {/* Title */}
          <div>
            <label className="block text-sm font-medium mb-1">Title *</label>
            <input
              type="text"
              className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
              value={form.title}
              onChange={(e) => {
                setForm({ ...form, title: e.target.value });
              }}
              required
              maxLength={300}
            />
          </div>

          {/* Description */}
          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <textarea
              className="w-full border border-border rounded px-3 py-2 text-sm bg-background min-h-[60px]"
              value={form.description}
              onChange={(e) => {
                setForm({ ...form, description: e.target.value });
              }}
              rows={2}
            />
          </div>

          {/* Actor + Status */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Threat Actor</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                value={form.actor}
                onChange={(e) => {
                  setForm({ ...form, actor: e.target.value });
                }}
              >
                {ACTORS.map((a) => (
                  <option key={a} value={a}>
                    {formatLabel(a)}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Status</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                value={form.status}
                onChange={(e) => {
                  setForm({ ...form, status: e.target.value });
                }}
              >
                {STATUSES.map((s) => (
                  <option key={s} value={s}>
                    {formatLabel(s)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Multi-select: Techniques */}
          <div>
            <label className="block text-sm font-medium mb-1">Techniques *</label>
            <div className="flex flex-wrap gap-1.5">
              {TECHNIQUES.map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, techniques: toggleItem(form.techniques, t) });
                  }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    form.techniques.includes(t)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {formatLabel(t)}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-select: Harms */}
          <div>
            <label className="block text-sm font-medium mb-1">Harms *</label>
            <div className="flex flex-wrap gap-1.5">
              {HARMS.map((h) => (
                <button
                  key={h}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, harms: toggleItem(form.harms, h) });
                  }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    form.harms.includes(h)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {formatLabel(h)}
                </button>
              ))}
            </div>
          </div>

          {/* Multi-select: Impacts */}
          <div>
            <label className="block text-sm font-medium mb-1">Impacts *</label>
            <div className="flex flex-wrap gap-1.5">
              {IMPACTS.map((i) => (
                <button
                  key={i}
                  type="button"
                  onClick={() => {
                    setForm({ ...form, impacts: toggleItem(form.impacts, i) });
                  }}
                  className={`px-2 py-1 text-xs rounded border transition-colors ${
                    form.impacts.includes(i)
                      ? 'bg-primary text-primary-foreground border-primary'
                      : 'bg-background border-border hover:bg-muted'
                  }`}
                >
                  {formatLabel(i)}
                </button>
              ))}
            </div>
          </div>

          {/* Likelihood / Severity / Score */}
          <div className="grid grid-cols-3 gap-4">
            <div>
              <label className="block text-sm font-medium mb-1">Likelihood (1-5)</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                value={form.likelihood}
                onChange={(e) => {
                  setForm({ ...form, likelihood: Number(e.target.value) });
                }}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Severity (1-5)</label>
              <select
                className="w-full border border-border rounded px-3 py-2 text-sm bg-background"
                value={form.severity}
                onChange={(e) => {
                  setForm({ ...form, severity: Number(e.target.value) });
                }}
              >
                {[1, 2, 3, 4, 5].map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Risk Score</label>
              <div
                className={`flex items-center justify-center h-[38px] rounded text-sm font-bold ${riskColor(form.likelihood * form.severity)}`}
              >
                {form.likelihood * form.severity}
              </div>
            </div>
          </div>

          {/* Mitigations */}
          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-sm font-medium">Mitigations</label>
              <button
                type="button"
                className="text-xs text-primary hover:text-primary/80"
                onClick={() => {
                  setForm({
                    ...form,
                    mitigations: [
                      ...form.mitigations,
                      { description: '', status: 'planned', owner: '' },
                    ],
                  });
                }}
              >
                + Add
              </button>
            </div>
            {form.mitigations.map((m, idx) => (
              <div key={idx} className="flex gap-2 mb-2">
                <input
                  type="text"
                  className="flex-1 border border-border rounded px-2 py-1 text-sm bg-background"
                  value={m.description}
                  onChange={(e) => {
                    const updated = [...form.mitigations];
                    updated[idx] = { ...m, description: e.target.value };
                    setForm({ ...form, mitigations: updated });
                  }}
                  placeholder="Mitigation description"
                />
                <select
                  className="border border-border rounded px-2 py-1 text-sm bg-background"
                  value={m.status}
                  onChange={(e) => {
                    const updated = [...form.mitigations];
                    updated[idx] = { ...m, status: e.target.value };
                    setForm({ ...form, mitigations: updated });
                  }}
                >
                  <option value="planned">Planned</option>
                  <option value="in_progress">In Progress</option>
                  <option value="implemented">Implemented</option>
                  <option value="verified">Verified</option>
                </select>
                <button
                  type="button"
                  className="text-muted-foreground hover:text-red-600"
                  onClick={() => {
                    setForm({ ...form, mitigations: form.mitigations.filter((_, i) => i !== idx) });
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div className="flex justify-end gap-3 pt-2 border-t border-border">
            <button
              type="button"
              className="px-4 py-2 text-sm border border-border rounded hover:bg-muted"
              onClick={onClose}
            >
              Cancel
            </button>
            <button
              type="submit"
              className="px-4 py-2 text-sm font-medium text-white bg-primary rounded hover:bg-primary/90 disabled:opacity-50"
              disabled={!form.title.trim() || form.techniques.length === 0}
            >
              {initial ? 'Save' : 'Create'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

// ─── Main Tab ────────────────────────────────────────────────────────────────

export function ATHITab() {
  const qc = useQueryClient();
  const [actorFilter, setActorFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editingScenario, setEditingScenario] = useState<any>(null);

  const invalidate = useCallback(() => {
    void qc.invalidateQueries({ queryKey: ['athi'] });
  }, [qc]);

  // Queries
  const { data: scenariosData, isLoading: loadingScenarios } = useQuery({
    queryKey: ['athi', 'scenarios', actorFilter, statusFilter],
    queryFn: () =>
      fetchAthiScenarios({
        actor: actorFilter || undefined,
        status: statusFilter || undefined,
        limit: 100,
      }),
  });

  const { data: matrixData } = useQuery({
    queryKey: ['athi', 'matrix'],
    queryFn: () => fetchAthiMatrix(),
  });

  const { data: summaryData } = useQuery({
    queryKey: ['athi', 'summary'],
    queryFn: () => fetchAthiSummary(),
  });

  // Mutations
  const createMut = useMutation({
    mutationFn: (data: any) => createAthiScenario(data),
    onSuccess: () => {
      setShowModal(false);
      invalidate();
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: any }) => updateAthiScenario(id, data),
    onSuccess: () => {
      setEditingScenario(null);
      invalidate();
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteAthiScenario(id),
    onSuccess: invalidate,
  });

  const _linkEventsMut = useMutation({
    mutationFn: ({ id, eventIds }: { id: string; eventIds: string[] }) =>
      linkEventsToAthiScenario(id, eventIds),
    onSuccess: invalidate,
  });

  const scenarios = scenariosData?.items ?? [];
  const matrix = matrixData?.matrix ?? [];
  const summary = summaryData?.summary;

  return (
    <div className="space-y-6" data-testid="athi-tab">
      {/* Summary Strip */}
      {summary && (
        <div className="grid grid-cols-4 gap-4">
          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{summary.totalScenarios}</div>
            <div className="text-xs text-muted-foreground">Total Scenarios</div>
          </div>
          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{summary.averageRiskScore}</div>
            <div className="text-xs text-muted-foreground">Avg Risk Score</div>
          </div>
          <div className="bg-background border border-border rounded-lg p-4 text-center">
            <div className="text-2xl font-bold">{summary.mitigationCoverage}%</div>
            <div className="text-xs text-muted-foreground">Mitigation Coverage</div>
          </div>
          <div className="bg-background border border-border rounded-lg p-4">
            <div className="flex flex-wrap gap-1">
              {Object.entries(summary.byStatus ?? {}).map(([status, count]) => (
                <span
                  key={status}
                  className={`px-1.5 py-0.5 text-xs rounded ${STATUS_COLORS[status] ?? 'bg-gray-100'}`}
                >
                  {formatLabel(status)}: {count}
                </span>
              ))}
            </div>
            <div className="text-xs text-muted-foreground mt-1">By Status</div>
          </div>
        </div>
      )}

      {/* Risk Matrix */}
      {matrix.length > 0 && (
        <div className="bg-background border border-border rounded-lg p-4">
          <h3 className="text-sm font-semibold mb-3 flex items-center gap-2">
            <Shield className="w-4 h-4" />
            Actor x Technique Risk Matrix
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr>
                  <th className="text-left p-1.5 font-medium">Actor \ Technique</th>
                  {TECHNIQUES.map((t) => (
                    <th key={t} className="p-1.5 font-medium text-center" style={{ minWidth: 80 }}>
                      {formatLabel(t)}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ACTORS.map((actor) => (
                  <tr key={actor}>
                    <td className="p-1.5 font-medium">{formatLabel(actor)}</td>
                    {TECHNIQUES.map((tech) => {
                      const cell = matrix.find(
                        (c: any) => c.actor === actor && c.technique === tech
                      );
                      return (
                        <td key={tech} className="p-1">
                          {cell ? (
                            <div
                              className={`rounded px-1.5 py-1 text-center font-mono ${matrixCellColor(cell.avgRiskScore)}`}
                              title={`Count: ${cell.count}, Avg: ${cell.avgRiskScore}, Max: ${cell.maxRiskScore}`}
                            >
                              {cell.avgRiskScore}
                            </div>
                          ) : (
                            <div className="text-center text-muted-foreground">-</div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Scenarios List */}
      <div className="bg-background border border-border rounded-lg p-4">
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-semibold flex items-center gap-2">
            <AlertTriangle className="w-4 h-4" />
            Threat Scenarios ({scenariosData?.total ?? 0})
          </h3>
          <div className="flex items-center gap-2">
            <select
              className="border border-border rounded px-2 py-1 text-xs bg-background"
              value={actorFilter}
              onChange={(e) => {
                setActorFilter(e.target.value);
              }}
            >
              <option value="">All Actors</option>
              {ACTORS.map((a) => (
                <option key={a} value={a}>
                  {formatLabel(a)}
                </option>
              ))}
            </select>
            <select
              className="border border-border rounded px-2 py-1 text-xs bg-background"
              value={statusFilter}
              onChange={(e) => {
                setStatusFilter(e.target.value);
              }}
            >
              <option value="">All Statuses</option>
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatLabel(s)}
                </option>
              ))}
            </select>
            <button
              className="flex items-center gap-1 px-3 py-1 text-xs font-medium text-white bg-primary rounded hover:bg-primary/90"
              onClick={() => {
                setShowModal(true);
              }}
            >
              <Plus className="w-3 h-3" />
              New Scenario
            </button>
          </div>
        </div>

        {loadingScenarios ? (
          <div className="flex justify-center py-8">
            <Loader2 className="w-5 h-5 animate-spin" />
          </div>
        ) : scenarios.length === 0 ? (
          <p className="text-sm text-muted-foreground py-4 text-center">
            No threat scenarios found. Create one to get started.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-2 font-medium">Title</th>
                  <th className="text-left py-2 px-2 font-medium">Actor</th>
                  <th className="text-left py-2 px-2 font-medium">Techniques</th>
                  <th className="text-center py-2 px-2 font-medium">Score</th>
                  <th className="text-center py-2 px-2 font-medium">Status</th>
                  <th className="text-center py-2 px-2 font-medium">Linked</th>
                  <th className="text-right py-2 px-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {scenarios.map((s: any) => (
                  <tr key={s.id} className="border-b border-border/50 hover:bg-muted/30">
                    <td className="py-2 px-2 font-medium">{s.title}</td>
                    <td className="py-2 px-2 text-xs">{formatLabel(s.actor)}</td>
                    <td className="py-2 px-2">
                      <div className="flex flex-wrap gap-1">
                        {s.techniques?.map((t: string) => (
                          <span key={t} className="px-1.5 py-0.5 text-xs bg-muted rounded">
                            {formatLabel(t)}
                          </span>
                        ))}
                      </div>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs font-bold ${riskColor(s.riskScore)}`}
                      >
                        {s.riskScore}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      <span
                        className={`px-2 py-0.5 rounded text-xs ${STATUS_COLORS[s.status] ?? ''}`}
                      >
                        {formatLabel(s.status)}
                      </span>
                    </td>
                    <td className="py-2 px-2 text-center">
                      {(s.linkedEventIds?.length ?? 0) > 0 ? (
                        <span
                          className="inline-flex items-center gap-1 px-1.5 py-0.5 text-xs bg-blue-100 text-blue-700 rounded"
                          title={`Linked to ${s.linkedEventIds.length} event(s): ${s.linkedEventIds.join(', ')}`}
                          data-testid="linked-events-badge"
                        >
                          <Link2 className="w-3 h-3" />
                          {s.linkedEventIds.length}
                        </span>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </td>
                    <td className="py-2 px-2 text-right">
                      <div className="flex items-center justify-end gap-1">
                        <button
                          className="p-1 text-muted-foreground hover:text-foreground"
                          onClick={() => {
                            setEditingScenario({
                              id: s.id,
                              title: s.title,
                              description: s.description ?? '',
                              actor: s.actor,
                              techniques: s.techniques ?? [],
                              harms: s.harms ?? [],
                              impacts: s.impacts ?? [],
                              likelihood: s.likelihood,
                              severity: s.severity,
                              mitigations: s.mitigations ?? [],
                              status: s.status,
                            });
                          }}
                          title="Edit"
                        >
                          <Edit2 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          className="p-1 text-muted-foreground hover:text-red-600"
                          onClick={() => {
                            if (confirm(`Delete scenario "${s.title}"?`)) {
                              deleteMut.mutate(s.id);
                            }
                          }}
                          title="Delete"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showModal && (
        <ScenarioModal
          open={showModal}
          onClose={() => {
            setShowModal(false);
          }}
          onSubmit={(data) => {
            createMut.mutate(data);
          }}
        />
      )}

      {/* Edit Modal */}
      {editingScenario && (
        <ScenarioModal
          open={!!editingScenario}
          onClose={() => {
            setEditingScenario(null);
          }}
          onSubmit={(data) => {
            updateMut.mutate({ id: editingScenario.id, data });
          }}
          initial={editingScenario}
        />
      )}
    </div>
  );
}
