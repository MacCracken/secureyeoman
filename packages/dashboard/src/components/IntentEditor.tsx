/**
 * IntentEditor — Phase 48: Organizational Intent Dashboard Component
 *
 * Tabbed editor for creating and managing OrgIntent documents.
 * Tabs: Goals, Signals, Hard Boundaries, Trade-off Profiles, Delegation, Context
 *
 * Also renders:
 *  - Signal health status cards (live values vs thresholds)
 *  - Enforcement log feed (filterable)
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Target,
  Activity,
  ShieldAlert,
  Users2,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
  TrendingUp,
  TrendingDown,
  Minus,
  History,
} from 'lucide-react';
import {
  fetchIntents,
  fetchActiveIntent,
  activateIntent,
  deleteIntent,
  fetchEnforcementLog,
  fetchSecurityPolicy,
  createIntent,
  readSignal,
  fetchGoalTimeline,
  type OrgIntentMeta,
  type EnforcementLogEntry,
} from '../api/client';
import { IntentDocEditor } from './IntentDocEditor';

type IntentTab = 'docs' | 'signals' | 'delegation' | 'enforcement' | 'editor';

function StatusBadge({ status }: { status: 'healthy' | 'warning' | 'critical' }) {
  if (status === 'healthy') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
        <CheckCircle2 className="w-3 h-3" />
        Healthy
      </span>
    );
  }
  if (status === 'warning') {
    return (
      <span className="inline-flex items-center gap-1 text-xs font-medium text-yellow-600 bg-yellow-50 px-2 py-0.5 rounded-full">
        <AlertTriangle className="w-3 h-3" />
        Warning
      </span>
    );
  }
  return (
    <span className="inline-flex items-center gap-1 text-xs font-medium text-red-600 bg-red-50 px-2 py-0.5 rounded-full">
      <XCircle className="w-3 h-3" />
      Critical
    </span>
  );
}

function IntentDocCard({
  intent,
  isActive,
  onActivate,
  onDelete,
  onEdit,
}: {
  intent: OrgIntentMeta;
  isActive: boolean;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
  onEdit?: (id: string) => void;
}) {
  return (
    <div
      className={`border rounded-lg p-4 ${isActive ? 'border-primary bg-primary/5' : 'border-border'}`}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <span className="font-medium text-sm truncate">{intent.name}</span>
            {isActive && (
              <span className="text-xs bg-primary text-primary-foreground px-1.5 py-0.5 rounded">
                Active
              </span>
            )}
          </div>
          <p className="text-xs text-muted-foreground mt-1">
            API version: {intent.apiVersion} · Updated{' '}
            {new Date(intent.updatedAt).toLocaleDateString()}
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {onEdit && (
            <button
              onClick={() => onEdit(intent.id)}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-accent transition-colors"
            >
              Edit
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => onActivate(intent.id)}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-accent transition-colors"
            >
              Activate
            </button>
          )}
          <button
            onClick={() => onDelete(intent.id)}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Delete intent document"
          >
            <Trash2 className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
}

function EnforcementLogFeed() {
  const [eventTypeFilter, setEventTypeFilter] = useState('');
  const [expanded, setExpanded] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['enforcementLog', eventTypeFilter],
    queryFn: () =>
      fetchEnforcementLog({
        eventType: eventTypeFilter || undefined,
        limit: 50,
      }),
    refetchInterval: 30_000,
  });

  const entries = data?.entries ?? [];

  const eventTypeColors: Record<string, string> = {
    boundary_violated: 'text-red-600 bg-red-50',
    action_blocked: 'text-orange-600 bg-orange-50',
    action_allowed: 'text-green-600 bg-green-50',
    goal_activated: 'text-blue-600 bg-blue-50',
    goal_completed: 'text-emerald-600 bg-emerald-50',
    intent_signal_degraded: 'text-yellow-600 bg-yellow-50',
    policy_warn: 'text-yellow-600 bg-yellow-50',
    policy_block: 'text-red-600 bg-red-50',
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-medium">Enforcement Log</h3>
        <select
          value={eventTypeFilter}
          onChange={(e) => setEventTypeFilter(e.target.value)}
          className="text-xs border border-border rounded px-2 py-1 bg-background"
        >
          <option value="">All events</option>
          <option value="boundary_violated">boundary_violated</option>
          <option value="action_blocked">action_blocked</option>
          <option value="action_allowed">action_allowed</option>
          <option value="goal_activated">goal_activated</option>
          <option value="goal_completed">goal_completed</option>
          <option value="intent_signal_degraded">intent_signal_degraded</option>
          <option value="policy_warn">policy_warn</option>
          <option value="policy_block">policy_block</option>
        </select>
      </div>

      {isLoading && <p className="text-xs text-muted-foreground">Loading...</p>}

      {!isLoading && entries.length === 0 && (
        <p className="text-xs text-muted-foreground py-4 text-center">No enforcement events.</p>
      )}

      <div className="space-y-2">
        {(expanded ? entries : entries.slice(0, 5)).map((entry: EnforcementLogEntry) => (
          <div key={entry.id} className="border border-border rounded p-3 text-xs space-y-1">
            <div className="flex items-center gap-2">
              <span
                className={`inline-flex items-center px-1.5 py-0.5 rounded-full font-medium ${
                  eventTypeColors[entry.eventType] ?? 'text-muted-foreground bg-muted'
                }`}
              >
                {entry.eventType}
              </span>
              <span className="text-muted-foreground">
                {new Date(entry.createdAt).toLocaleString()}
              </span>
            </div>
            <p className="font-mono text-muted-foreground">{entry.rule}</p>
            {entry.rationale && <p className="text-muted-foreground">{entry.rationale}</p>}
          </div>
        ))}
      </div>

      {entries.length > 5 && (
        <button
          onClick={() => setExpanded(!expanded)}
          className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
        >
          {expanded ? (
            <>
              <ChevronUp className="w-3 h-3" /> Show less
            </>
          ) : (
            <>
              <ChevronDown className="w-3 h-3" /> Show {entries.length - 5} more
            </>
          )}
        </button>
      )}
    </div>
  );
}

function SignalCard({ signalId, signalName }: { signalId: string; signalName: string }) {
  const { data, isLoading } = useQuery({
    queryKey: ['signal', signalId],
    queryFn: () => readSignal(signalId),
    refetchInterval: 60_000,
  });

  const DirectionIcon =
    data?.direction === 'above' ? TrendingUp : data?.direction === 'below' ? TrendingDown : Minus;

  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-center justify-between gap-2">
        <span className="text-sm font-medium truncate">{signalName}</span>
        {data && <StatusBadge status={data.status} />}
      </div>
      {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
      {data && (
        <div className="space-y-1 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5">
            <DirectionIcon className="w-3 h-3" />
            <span>
              Value: <strong className="text-foreground">{data.value ?? 'N/A'}</strong>
            </span>
            <span>/ threshold: {data.threshold}</span>
          </div>
          <p className="italic">{data.message}</p>
        </div>
      )}
    </div>
  );
}

function GoalTimeline({
  intentId,
  goalId,
  goalName,
}: {
  intentId: string;
  goalId: string;
  goalName: string;
}) {
  const [open, setOpen] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['goalTimeline', intentId, goalId],
    queryFn: () => fetchGoalTimeline(intentId, goalId),
    enabled: open,
  });

  const entries = data?.entries ?? [];

  return (
    <div className="border border-border rounded-lg overflow-hidden">
      <button
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <History className="w-3.5 h-3.5 text-muted-foreground" />
          <span className="text-sm font-medium">{goalName}</span>
        </div>
        {open ? (
          <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
        ) : (
          <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
        )}
      </button>

      {open && (
        <div className="border-t border-border px-4 py-3 space-y-2">
          {isLoading && <p className="text-xs text-muted-foreground">Loading…</p>}
          {!isLoading && entries.length === 0 && (
            <p className="text-xs text-muted-foreground italic">No lifecycle events yet.</p>
          )}
          {entries.map((entry) => (
            <div key={entry.id} className="flex items-start gap-3 text-xs">
              <span
                className={`mt-0.5 inline-flex items-center px-1.5 py-0.5 rounded-full font-medium shrink-0 ${
                  entry.eventType === 'goal_activated'
                    ? 'text-blue-600 bg-blue-50'
                    : 'text-emerald-600 bg-emerald-50'
                }`}
              >
                {entry.eventType === 'goal_activated' ? 'Activated' : 'Completed'}
              </span>
              <div className="min-w-0">
                <p className="text-muted-foreground">
                  {new Date(entry.createdAt).toLocaleString()}
                </p>
                {entry.rationale && (
                  <p className="text-muted-foreground italic truncate">{entry.rationale}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function SignalDashboard() {
  const { data: activeIntentData, isLoading } = useQuery({
    queryKey: ['activeIntent'],
    queryFn: () => fetchActiveIntent().catch(() => null),
    refetchInterval: 60_000,
  });

  const intent = activeIntentData?.intent;
  const signals = intent?.signals ?? [];
  const goals = intent?.goals ?? [];

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;

  if (signals.length === 0 && goals.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-border rounded-lg">
        <Activity className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No signals defined in the active intent.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {signals.length > 0 && (
        <div className="space-y-3">
          <h3 className="text-sm font-medium">Signal Health</h3>
          <p className="text-xs text-muted-foreground">Auto-refresh every 60 seconds.</p>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {signals.map((s) => (
              <SignalCard key={s.id} signalId={s.id} signalName={s.name} />
            ))}
          </div>
        </div>
      )}

      {goals.length > 0 && intent && (
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <History className="w-4 h-4 text-muted-foreground" />
            <h3 className="text-sm font-medium">Goal History</h3>
          </div>
          <p className="text-xs text-muted-foreground">
            Activation and completion events per goal.
          </p>
          <div className="space-y-2">
            {goals.map((g) => (
              <GoalTimeline
                key={g.id}
                intentId={intent.id}
                goalId={g.id}
                goalName={g.name}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function DelegationFrameworkView() {
  const [openTenants, setOpenTenants] = useState<Set<string>>(new Set());
  const { data: activeIntentData, isLoading } = useQuery({
    queryKey: ['activeIntent'],
    queryFn: () => fetchActiveIntent().catch(() => null),
  });

  const tenants = activeIntentData?.intent?.delegationFramework?.tenants ?? [];

  const toggle = (id: string) =>
    setOpenTenants((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;

  if (tenants.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-border rounded-lg">
        <Users2 className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No delegation framework defined.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {tenants.map((tenant) => (
        <div key={tenant.id} className="border border-border rounded-lg">
          <button
            onClick={() => toggle(tenant.id)}
            className="w-full flex items-center justify-between px-4 py-3 text-left hover:bg-accent/50 transition-colors"
          >
            <div>
              <span className="text-sm font-medium">{tenant.principle}</span>
              <span className="ml-2 text-xs text-muted-foreground">[{tenant.id}]</span>
            </div>
            {openTenants.has(tenant.id) ? (
              <ChevronUp className="w-4 h-4 text-muted-foreground shrink-0" />
            ) : (
              <ChevronDown className="w-4 h-4 text-muted-foreground shrink-0" />
            )}
          </button>
          {openTenants.has(tenant.id) && tenant.decisionBoundaries.length > 0 && (
            <ul className="px-4 pb-3 space-y-1">
              {tenant.decisionBoundaries.map((b, i) => (
                <li key={i} className="text-xs text-muted-foreground flex gap-2">
                  <span className="text-muted-foreground/50">–</span>
                  <span>{b}</span>
                </li>
              ))}
            </ul>
          )}
          {openTenants.has(tenant.id) && tenant.decisionBoundaries.length === 0 && (
            <p className="px-4 pb-3 text-xs text-muted-foreground italic">
              No decision boundaries specified.
            </p>
          )}
        </div>
      ))}
    </div>
  );
}

const STARTER_INTENT_YAML = `{
  "name": "My Organization Intent",
  "goals": [
    {
      "id": "goal-1",
      "name": "Example Goal",
      "description": "Describe what you want the agent to focus on.",
      "priority": 50,
      "successCriteria": "Define what success looks like.",
      "skills": [],
      "signals": [],
      "authorizedActions": []
    }
  ],
  "hardBoundaries": [
    {
      "id": "hb-1",
      "rule": "deny: drop production",
      "rationale": "Never allow destructive operations on production systems."
    }
  ],
  "signals": [],
  "dataSources": [],
  "authorizedActions": [],
  "tradeoffProfiles": [],
  "delegationFramework": { "tenants": [] },
  "context": []
}`;

export function IntentEditor() {
  const [activeTab, setActiveTab] = useState<IntentTab>('docs');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createJson, setCreateJson] = useState(STARTER_INTENT_YAML);
  const [createError, setCreateError] = useState('');
  const [editingIntentId, setEditingIntentId] = useState<string | null>(null);
  const queryClient = useQueryClient();

  const { data: securityPolicyData } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });
  const intentEditorEnabled = securityPolicyData?.allowIntentEditor ?? false;

  const { data: intentsData } = useQuery({
    queryKey: ['intents'],
    queryFn: fetchIntents,
  });

  const { data: activeIntentData } = useQuery({
    queryKey: ['activeIntent'],
    queryFn: () => fetchActiveIntent().catch(() => null),
  });

  const activateMutation = useMutation({
    mutationFn: activateIntent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intents'] });
      void queryClient.invalidateQueries({ queryKey: ['activeIntent'] });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: deleteIntent,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intents'] });
      void queryClient.invalidateQueries({ queryKey: ['activeIntent'] });
    },
  });

  const createMutation = useMutation({
    mutationFn: (doc: Record<string, unknown>) => createIntent(doc),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['intents'] });
      setShowCreateModal(false);
      setCreateJson(STARTER_INTENT_YAML);
      setCreateError('');
    },
  });

  const handleCreate = () => {
    try {
      const parsed = JSON.parse(createJson) as Record<string, unknown>;
      setCreateError('');
      createMutation.mutate(parsed);
    } catch {
      setCreateError('Invalid JSON. Please check your input.');
    }
  };

  const intents = intentsData?.intents ?? [];
  const activeIntentId = activeIntentData?.intent?.id;

  const tabs: { id: IntentTab; label: string; icon: React.ReactNode; devOnly?: boolean }[] = [
    { id: 'docs', label: 'Intent Documents', icon: <Target className="w-4 h-4" /> },
    { id: 'signals', label: 'Signals', icon: <Activity className="w-4 h-4" /> },
    { id: 'delegation', label: 'Delegation', icon: <Users2 className="w-4 h-4" /> },
    { id: 'enforcement', label: 'Enforcement Log', icon: <ShieldAlert className="w-4 h-4" /> },
    ...(intentEditorEnabled
      ? [{ id: 'editor' as const, label: 'Editor', icon: <Plus className="w-4 h-4" />, devOnly: true }]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Target className="w-5 h-5" />
          Organizational Intent
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          Machine-readable goals, signals, boundaries, and context for agent guidance.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
            {tab.devOnly && (
              <span className="text-xs bg-yellow-100 text-yellow-800 px-1 py-0.5 rounded font-medium leading-none">
                dev
              </span>
            )}
          </button>
        ))}
      </div>

      {activeTab === 'docs' && (
        <div className="space-y-4">
          <div className="flex justify-end">
            <button
              onClick={() => setShowCreateModal(true)}
              className="flex items-center gap-1.5 text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" />
              Create Intent
            </button>
          </div>

          {intents.length === 0 && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No intent documents yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Click "Create Intent" or POST to /api/v1/intent
              </p>
            </div>
          )}

          {intents.map((intent) => (
            <IntentDocCard
              key={intent.id}
              intent={intent}
              isActive={intent.id === activeIntentId}
              onActivate={(id) => activateMutation.mutate(id)}
              onDelete={(id) => {
                if (confirm(`Delete intent document "${intent.name}"?`)) {
                  deleteMutation.mutate(id);
                }
              }}
              onEdit={intentEditorEnabled ? (id) => { setEditingIntentId(id); setActiveTab('editor'); } : undefined}
            />
          ))}
        </div>
      )}

      {activeTab === 'signals' && <SignalDashboard />}
      {activeTab === 'delegation' && <DelegationFrameworkView />}
      {activeTab === 'enforcement' && <EnforcementLogFeed />}
      {activeTab === 'editor' && intentEditorEnabled && (
        editingIntentId ? (
          <IntentDocEditor intentId={editingIntentId} />
        ) : (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No document selected.</p>
            <p className="text-xs text-muted-foreground mt-1">Go to Intent Documents and click Edit on a document.</p>
          </div>
        )
      )}

      {/* Create Intent Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background border border-border rounded-lg w-full max-w-2xl shadow-xl">
            <div className="flex items-center justify-between px-4 py-3 border-b border-border">
              <h3 className="text-sm font-semibold">Create Intent Document</h3>
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError('');
                }}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                <XCircle className="w-4 h-4" />
              </button>
            </div>
            <div className="p-4 space-y-3">
              <p className="text-xs text-muted-foreground">
                Enter a JSON document matching the OrgIntentDoc schema. Edit the template below.
              </p>
              <textarea
                value={createJson}
                onChange={(e) => setCreateJson(e.target.value)}
                rows={18}
                className="w-full text-xs font-mono border border-border rounded p-2 bg-muted/30 resize-y focus:outline-none focus:ring-1 focus:ring-primary"
              />
              {createError && <p className="text-xs text-destructive">{createError}</p>}
            </div>
            <div className="flex justify-end gap-2 px-4 py-3 border-t border-border">
              <button
                onClick={() => {
                  setShowCreateModal(false);
                  setCreateError('');
                }}
                className="text-xs px-3 py-1.5 border border-border rounded hover:bg-accent transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreate}
                disabled={createMutation.isPending}
                className="text-xs px-3 py-1.5 bg-primary text-primary-foreground rounded hover:bg-primary/90 disabled:opacity-50 transition-colors"
              >
                {createMutation.isPending ? 'Creating…' : 'Create'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Security Settings toggle ─────────────────────────────────────────────────

export function IntentSecurityToggle({
  enabled,
  onChange,
}: {
  enabled: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <div className="flex items-center justify-between py-3 border-b border-border last:border-0">
      <div>
        <p className="text-sm font-medium">Organizational Intent</p>
        <p className="text-xs text-muted-foreground mt-0.5">
          Allow agents to reason within machine-readable org goals, signals, and boundaries.
        </p>
      </div>
      <button
        onClick={() => onChange(!enabled)}
        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors ${
          enabled ? 'bg-primary' : 'bg-muted'
        }`}
        aria-pressed={enabled}
      >
        <span
          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform ${
            enabled ? 'translate-x-4' : 'translate-x-1'
          }`}
        />
      </button>
    </div>
  );
}
