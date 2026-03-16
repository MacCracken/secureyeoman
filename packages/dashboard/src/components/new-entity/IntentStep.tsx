import { ChevronDown, X, Plus } from 'lucide-react';
import type { WizardState } from './useWizardState';

interface IntentStepProps {
  intent: WizardState['intent'];
  setIntent: WizardState['setIntent'];
  createIntentMut: WizardState['createIntentMut'];
  goBack: () => void;
  handleClose: () => void;
}

export function IntentStep({
  intent,
  setIntent,
  createIntentMut,
  goBack,
  handleClose,
}: IntentStepProps) {
  const set = (patch: Partial<typeof intent>) => {
    setIntent((s) => ({ ...s, ...patch }));
  };
  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const addGoal = () => {
    set({
      goals: [...intent.goals, { id: `g-${uid()}`, name: '', description: '', priority: 5 }],
    });
  };
  const removeGoal = (id: string) => {
    set({ goals: intent.goals.filter((g) => g.id !== id) });
  };
  const updateGoal = (id: string, patch: Partial<(typeof intent.goals)[0]>) => {
    set({ goals: intent.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
  };

  const addBoundary = () => {
    set({
      hardBoundaries: [...intent.hardBoundaries, { id: `b-${uid()}`, rule: '', rationale: '' }],
    });
  };
  const removeBoundary = (id: string) => {
    set({ hardBoundaries: intent.hardBoundaries.filter((b) => b.id !== id) });
  };
  const updateBoundary = (id: string, patch: Partial<(typeof intent.hardBoundaries)[0]>) => {
    set({
      hardBoundaries: intent.hardBoundaries.map((b) => (b.id === id ? { ...b, ...patch } : b)),
    });
  };

  const addPolicy = () => {
    set({
      policies: [
        ...intent.policies,
        { id: `p-${uid()}`, rule: '', enforcement: 'warn' as const, rationale: '' },
      ],
    });
  };
  const removePolicy = (id: string) => {
    set({ policies: intent.policies.filter((p) => p.id !== id) });
  };
  const updatePolicy = (id: string, patch: Partial<(typeof intent.policies)[0]>) => {
    set({ policies: intent.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)) });
  };

  const handleImport = () => {
    try {
      const parsed = JSON.parse(intent.importJson) as Record<string, unknown>;
      set({
        name: typeof parsed.name === 'string' ? parsed.name : intent.name,
        goals: ((parsed.goals as Record<string, unknown>[] | undefined) ?? []).map((g, i) => ({
          id: `g-${uid()}-${i}`,
          name: String(g.name ?? ''),
          description: String(g.description ?? ''),
          priority: Number(g.priority ?? 5),
        })),
        hardBoundaries: (
          (parsed.hardBoundaries as Record<string, unknown>[] | undefined) ?? []
        ).map((b, i) => ({
          id: `b-${uid()}-${i}`,
          rule: String(b.rule ?? ''),
          rationale: String(b.rationale ?? ''),
        })),
        policies: ((parsed.policies as Record<string, unknown>[] | undefined) ?? []).map(
          (p, i) => ({
            id: `p-${uid()}-${i}`,
            rule: String(p.rule ?? ''),
            enforcement: p.enforcement === 'block' ? ('block' as const) : ('warn' as const),
            rationale: String(p.rationale ?? ''),
          })
        ),
        importError: '',
        activeTab: 'basics',
      });
    } catch {
      set({ importError: 'Invalid JSON — check the format and try again.' });
    }
  };

  const handleSubmit = () => {
    createIntentMut.mutate({
      name: intent.name.trim(),
      apiVersion: '1.0',
      goals: intent.goals
        .filter((g) => g.name.trim())
        .map((g) => ({
          id: g.id,
          name: g.name.trim(),
          description: g.description.trim(),
          priority: g.priority,
          successCriteria: '',
          ownerRole: 'admin',
          skills: [],
          signals: [],
          authorizedActions: [],
        })),
      hardBoundaries: intent.hardBoundaries
        .filter((b) => b.rule.trim())
        .map((b) => ({
          id: b.id,
          rule: b.rule.trim(),
          rationale: b.rationale.trim(),
        })),
      policies: intent.policies
        .filter((p) => p.rule.trim())
        .map((p) => ({
          id: p.id,
          rule: p.rule.trim(),
          enforcement: p.enforcement,
          rationale: p.rationale.trim(),
        })),
      signals: [],
      dataSources: [],
      authorizedActions: [],
      tradeoffProfiles: [],
      delegationFramework: { tenants: [] },
      context: [],
    });
  };

  const TABS = [
    { id: 'basics' as const, label: 'Basics' },
    { id: 'boundaries' as const, label: 'Boundaries' },
    { id: 'policies' as const, label: 'Policies' },
    { id: 'import' as const, label: 'Import JSON' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded" aria-label="Go back">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Intent</h3>
      </div>

      {/* Tab bar */}
      <div className="flex gap-0 border-b text-sm">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => {
              set({ activeTab: t.id });
            }}
            className={`px-3 py-1.5 font-medium transition-colors border-b-2 -mb-px ${
              intent.activeTab === t.id
                ? 'border-primary text-foreground'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Basics */}
      {intent.activeTab === 'basics' && (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={intent.name}
              onChange={(e) => {
                set({ name: e.target.value });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
              placeholder="e.g., Production Safety Intent"
            />
          </div>
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium">Goals</label>
              <button onClick={addGoal} className="btn btn-ghost text-xs flex items-center gap-1">
                <Plus className="w-3 h-3" /> Add Goal
              </button>
            </div>
            {intent.goals.length === 0 && (
              <p className="text-xs text-muted-foreground py-1">No goals yet — click Add Goal.</p>
            )}
            <div className="space-y-2">
              {intent.goals.map((g) => (
                <div key={g.id} className="border rounded-lg p-3 space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      value={g.name}
                      onChange={(e) => {
                        updateGoal(g.id, { name: e.target.value });
                      }}
                      className="flex-1 px-2 py-1.5 rounded border bg-background text-sm"
                      placeholder="Goal name"
                    />
                    <input
                      type="number"
                      min={1}
                      max={10}
                      value={g.priority}
                      onChange={(e) => {
                        updateGoal(g.id, { priority: parseInt(e.target.value) || 5 });
                      }}
                      className="w-14 px-2 py-1.5 rounded border bg-background text-sm text-center"
                      title="Priority (1–10)"
                    />
                    <button
                      onClick={() => {
                        removeGoal(g.id);
                      }}
                      className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                  </div>
                  <input
                    type="text"
                    value={g.description}
                    onChange={(e) => {
                      updateGoal(g.id, { description: e.target.value });
                    }}
                    className="w-full px-2 py-1.5 rounded border bg-background text-sm"
                    placeholder="Description"
                  />
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Boundaries */}
      {intent.activeTab === 'boundaries' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">Rules the AI must never violate.</p>
            <button onClick={addBoundary} className="btn btn-ghost text-xs flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Boundary
            </button>
          </div>
          {intent.hardBoundaries.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No hard boundaries defined.</p>
          )}
          <div className="space-y-2">
            {intent.hardBoundaries.map((b) => (
              <div key={b.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={b.rule}
                    onChange={(e) => {
                      updateBoundary(b.id, { rule: e.target.value });
                    }}
                    className="flex-1 px-2 py-1.5 rounded border bg-background text-sm"
                    placeholder="e.g., Never delete production data"
                  />
                  <button
                    onClick={() => {
                      removeBoundary(b.id);
                    }}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={b.rationale}
                  onChange={(e) => {
                    updateBoundary(b.id, { rationale: e.target.value });
                  }}
                  className="w-full px-2 py-1.5 rounded border bg-background text-sm"
                  placeholder="Rationale"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Policies */}
      {intent.activeTab === 'policies' && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">
              Soft rules — warn or block on violation.
            </p>
            <button onClick={addPolicy} className="btn btn-ghost text-xs flex items-center gap-1">
              <Plus className="w-3 h-3" /> Add Policy
            </button>
          </div>
          {intent.policies.length === 0 && (
            <p className="text-xs text-muted-foreground py-1">No policies defined.</p>
          )}
          <div className="space-y-2">
            {intent.policies.map((p) => (
              <div key={p.id} className="border rounded-lg p-3 space-y-2">
                <div className="flex items-center gap-2">
                  <input
                    type="text"
                    value={p.rule}
                    onChange={(e) => {
                      updatePolicy(p.id, { rule: e.target.value });
                    }}
                    className="flex-1 px-2 py-1.5 rounded border bg-background text-sm"
                    placeholder="Policy rule"
                  />
                  <select
                    value={p.enforcement}
                    onChange={(e) => {
                      updatePolicy(p.id, { enforcement: e.target.value as 'warn' | 'block' });
                    }}
                    className="px-2 py-1.5 rounded border bg-background text-sm"
                  >
                    <option value="warn">Warn</option>
                    <option value="block">Block</option>
                  </select>
                  <button
                    onClick={() => {
                      removePolicy(p.id);
                    }}
                    className="p-1 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
                <input
                  type="text"
                  value={p.rationale}
                  onChange={(e) => {
                    updatePolicy(p.id, { rationale: e.target.value });
                  }}
                  className="w-full px-2 py-1.5 rounded border bg-background text-sm"
                  placeholder="Rationale"
                />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Import JSON */}
      {intent.activeTab === 'import' && (
        <div className="space-y-3">
          <p className="text-sm text-muted-foreground">
            Paste a full intent JSON document to populate the form.
          </p>
          <textarea
            value={intent.importJson}
            onChange={(e) => {
              set({ importJson: e.target.value, importError: '' });
            }}
            className="w-full px-3 py-2 rounded border bg-background font-mono text-xs resize-none"
            rows={8}
            placeholder={
              '{\n  "name": "...",\n  "goals": [],\n  "hardBoundaries": [],\n  "policies": []\n}'
            }
          />
          {intent.importError && <p className="text-xs text-destructive">{intent.importError}</p>}
          <button
            onClick={handleImport}
            disabled={!intent.importJson.trim()}
            className="btn btn-ghost text-sm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Parse &amp; Apply
          </button>
        </div>
      )}

      <div className="flex justify-end gap-2 pt-2 border-t">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!intent.name.trim() || createIntentMut.isPending}
          className="btn btn-ghost disabled:opacity-50 disabled:cursor-not-allowed"
          onClick={handleSubmit}
        >
          {createIntentMut.isPending ? 'Creating...' : 'Create Intent'}
        </button>
      </div>
    </div>
  );
}
