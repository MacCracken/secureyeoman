/* eslint-disable react-hooks/purity */
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
  FileWarning,
  Code2,
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
  type OrgIntentPolicy,
  type EnforcementLogEntry,
} from '../api/client';
import { IntentDocEditor } from './IntentDocEditor';

type IntentTab = 'docs' | 'signals' | 'policies' | 'delegation' | 'enforcement' | 'editor';

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
              onClick={() => {
                onEdit(intent.id);
              }}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-accent transition-colors"
            >
              Edit
            </button>
          )}
          {!isActive && (
            <button
              onClick={() => {
                onActivate(intent.id);
              }}
              className="text-xs px-2 py-1 border border-border rounded hover:bg-accent transition-colors"
            >
              Activate
            </button>
          )}
          <button
            onClick={() => {
              onDelete(intent.id);
            }}
            className="text-muted-foreground hover:text-destructive transition-colors"
            title="Delete intent document"
            aria-label="Delete intent document"
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
          onChange={(e) => {
            setEventTypeFilter(e.target.value);
          }}
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
          onClick={() => {
            setExpanded(!expanded);
          }}
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
        onClick={() => {
          setOpen((v) => !v);
        }}
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
              <GoalTimeline key={g.id} intentId={intent.id} goalId={g.id} goalName={g.name} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function PolicyCard({ policy }: { policy: OrgIntentPolicy }) {
  const [showRego, setShowRego] = useState(false);

  const enforcementColors = {
    block: 'text-red-600 bg-red-50 border-red-200',
    warn: 'text-yellow-600 bg-yellow-50 border-yellow-200',
  };
  const enforcementLabel = { block: 'Block', warn: 'Warn' };

  return (
    <div className="border border-border rounded-lg p-4 space-y-2">
      <div className="flex items-start justify-between gap-3">
        <div className="flex-1 min-w-0 space-y-1">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground font-mono">{policy.id}</span>
            <span
              className={`text-xs font-medium px-1.5 py-0.5 rounded border ${
                enforcementColors[policy.enforcement]
              }`}
            >
              {enforcementLabel[policy.enforcement]}
            </span>
            {policy.rego && (
              <span className="text-xs font-medium px-1.5 py-0.5 rounded border text-violet-600 bg-violet-50 border-violet-200 flex items-center gap-1">
                <Code2 className="w-3 h-3" />
                OPA Rego
              </span>
            )}
          </div>
          <p className="text-sm font-medium">{policy.rule}</p>
          {policy.rationale && <p className="text-xs text-muted-foreground">{policy.rationale}</p>}
        </div>
      </div>

      {policy.rego && (
        <div>
          <button
            onClick={() => {
              setShowRego((v) => !v);
            }}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {showRego ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {showRego ? 'Hide Rego' : 'View Rego policy'}
          </button>
          {showRego && (
            <pre className="mt-2 text-xs font-mono bg-muted/50 rounded p-3 overflow-x-auto whitespace-pre border border-border">
              {policy.rego}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}

function PoliciesView() {
  const { data: activeIntentData, isLoading } = useQuery({
    queryKey: ['activeIntent'],
    queryFn: () => fetchActiveIntent().catch(() => null),
    refetchInterval: 60_000,
  });

  const policies = activeIntentData?.intent?.policies ?? [];

  if (isLoading) return <p className="text-xs text-muted-foreground">Loading…</p>;

  if (policies.length === 0) {
    return (
      <div className="text-center py-8 border border-dashed border-border rounded-lg">
        <FileWarning className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
        <p className="text-sm text-muted-foreground">No policies defined in the active intent.</p>
        <p className="text-xs text-muted-foreground mt-1">
          Add <code className="font-mono bg-muted px-1 rounded">policies[]</code> to your intent
          document to enforce soft governance rules.
        </p>
      </div>
    );
  }

  const blockPolicies = policies.filter((p) => p.enforcement === 'block');
  const warnPolicies = policies.filter((p) => p.enforcement === 'warn');

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3 text-xs text-muted-foreground">
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-red-500 inline-block" />
          {blockPolicies.length} blocking
        </span>
        <span className="flex items-center gap-1">
          <span className="w-2 h-2 rounded-full bg-yellow-400 inline-block" />
          {warnPolicies.length} warning
        </span>
      </div>

      {blockPolicies.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <ShieldAlert className="w-4 h-4 text-red-500" />
            Blocking Policies
          </h3>
          {blockPolicies.map((p) => (
            <PolicyCard key={p.id} policy={p} />
          ))}
        </div>
      )}

      {warnPolicies.length > 0 && (
        <div className="space-y-2">
          <h3 className="text-sm font-medium flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-yellow-500" />
            Warning Policies
          </h3>
          {warnPolicies.map((p) => (
            <PolicyCard key={p.id} policy={p} />
          ))}
        </div>
      )}

      <p className="text-xs text-muted-foreground border-t border-border pt-4">
        Policies are evaluated on every agent action. <em>Block</em> policies halt the action and
        log a <code className="font-mono bg-muted px-1 rounded">policy_block</code> event.{' '}
        <em>Warn</em> policies log a{' '}
        <code className="font-mono bg-muted px-1 rounded">policy_warn</code> event and continue.
        {process.env.OPA_ADDR && ' OPA Rego policies are evaluated by the sidecar.'}
      </p>
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

  const toggle = (id: string) => {
    setOpenTenants((prev) => {
      const next = new Set(prev);
      if (next.has(id)) {
        next.delete(id);
      } else {
        next.add(id);
      }
      return next;
    });
  };

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
            onClick={() => {
              toggle(tenant.id);
            }}
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

const EMPTY_CREATE_FORM = {
  name: '',
  goals: [] as { id: string; name: string; description: string; priority: number }[],
  hardBoundaries: [] as { id: string; rule: string; rationale: string }[],
  policies: [] as { id: string; rule: string; enforcement: 'warn' | 'block'; rationale: string }[],
  importJson: '',
  importError: '',
  activeTab: 'basics' as 'basics' | 'boundaries' | 'policies' | 'import',
};

export function IntentEditor() {
  const [activeTab, setActiveTab] = useState<IntentTab>('docs');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState(EMPTY_CREATE_FORM);
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
      setCreateForm(EMPTY_CREATE_FORM);
    },
    onError: (err) => {
      setCreateForm((f) => ({
        ...f,
        importError: err instanceof Error ? err.message : 'Failed to create intent',
      }));
    },
  });

  const uid = () => `${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

  const handleCreate = () => {
    createMutation.mutate({
      name: createForm.name.trim(),
      apiVersion: '1.0',
      goals: createForm.goals
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
      hardBoundaries: createForm.hardBoundaries
        .filter((b) => b.rule.trim())
        .map((b) => ({
          id: b.id,
          rule: b.rule.trim(),
          rationale: b.rationale.trim(),
        })),
      policies: createForm.policies
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

  const intents = intentsData?.intents ?? [];
  const activeIntentId = activeIntentData?.intent?.id;

  const tabs: { id: IntentTab; label: string; icon: React.ReactNode; devOnly?: boolean }[] = [
    { id: 'docs', label: 'Intent Documents', icon: <Target className="w-4 h-4" /> },
    { id: 'signals', label: 'Signals', icon: <Activity className="w-4 h-4" /> },
    { id: 'policies', label: 'Policies', icon: <FileWarning className="w-4 h-4" /> },
    { id: 'delegation', label: 'Delegation', icon: <Users2 className="w-4 h-4" /> },
    { id: 'enforcement', label: 'Enforcement Log', icon: <ShieldAlert className="w-4 h-4" /> },
    ...(intentEditorEnabled
      ? [
          {
            id: 'editor' as const,
            label: 'Editor',
            icon: <Plus className="w-4 h-4" />,
            devOnly: true,
          },
        ]
      : []),
  ];

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl sm:text-2xl font-bold tracking-tight">Organizational Intent</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Machine-readable goals, signals, boundaries, and context for agent guidance.
        </p>
      </div>

      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => {
              setActiveTab(tab.id);
            }}
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
              className="btn btn-ghost text-sm flex items-center gap-1"
              onClick={() => {
                setShowCreateModal((v) => !v);
                setCreateForm(EMPTY_CREATE_FORM);
              }}
            >
              <Plus className="w-4 h-4" />
              Create Intent
            </button>
          </div>

          {showCreateModal &&
            (() => {
              const set = (patch: Partial<typeof createForm>) => {
                setCreateForm((f) => ({ ...f, ...patch }));
              };

              const addGoal = () => {
                set({
                  goals: [
                    ...createForm.goals,
                    { id: `g-${uid()}`, name: '', description: '', priority: 5 },
                  ],
                });
              };
              const removeGoal = (id: string) => {
                set({ goals: createForm.goals.filter((g) => g.id !== id) });
              };
              const updateGoal = (id: string, patch: Partial<(typeof createForm.goals)[0]>) => {
                set({ goals: createForm.goals.map((g) => (g.id === id ? { ...g, ...patch } : g)) });
              };

              const addBoundary = () => {
                set({
                  hardBoundaries: [
                    ...createForm.hardBoundaries,
                    { id: `b-${uid()}`, rule: '', rationale: '' },
                  ],
                });
              };
              const removeBoundary = (id: string) => {
                set({ hardBoundaries: createForm.hardBoundaries.filter((b) => b.id !== id) });
              };
              const updateBoundary = (
                id: string,
                patch: Partial<(typeof createForm.hardBoundaries)[0]>
              ) => {
                set({
                  hardBoundaries: createForm.hardBoundaries.map((b) =>
                    b.id === id ? { ...b, ...patch } : b
                  ),
                });
              };

              const addPolicy = () => {
                set({
                  policies: [
                    ...createForm.policies,
                    { id: `p-${uid()}`, rule: '', enforcement: 'warn' as const, rationale: '' },
                  ],
                });
              };
              const removePolicy = (id: string) => {
                set({ policies: createForm.policies.filter((p) => p.id !== id) });
              };
              const updatePolicy = (
                id: string,
                patch: Partial<(typeof createForm.policies)[0]>
              ) => {
                set({
                  policies: createForm.policies.map((p) => (p.id === id ? { ...p, ...patch } : p)),
                });
              };

              const handleImport = () => {
                try {
                  const parsed = JSON.parse(createForm.importJson) as Record<string, unknown>;
                  set({
                    name: typeof parsed.name === 'string' ? parsed.name : createForm.name,
                    goals: ((parsed.goals as Record<string, unknown>[] | undefined) ?? []).map(
                      (g, i) => ({
                        id: `g-${uid()}-${i}`,
                        name: String(g.name ?? ''),
                        description: String(g.description ?? ''),
                        priority: Number(g.priority ?? 5),
                      })
                    ),
                    hardBoundaries: (
                      (parsed.hardBoundaries as Record<string, unknown>[] | undefined) ?? []
                    ).map((b, i) => ({
                      id: `b-${uid()}-${i}`,
                      rule: String(b.rule ?? ''),
                      rationale: String(b.rationale ?? ''),
                    })),
                    policies: (
                      (parsed.policies as Record<string, unknown>[] | undefined) ?? []
                    ).map((p, i) => ({
                      id: `p-${uid()}-${i}`,
                      rule: String(p.rule ?? ''),
                      enforcement:
                        p.enforcement === 'block' ? ('block' as const) : ('warn' as const),
                      rationale: String(p.rationale ?? ''),
                    })),
                    importError: '',
                    activeTab: 'basics',
                  });
                } catch {
                  set({ importError: 'Invalid JSON — check the format and try again.' });
                }
              };

              const TABS = [
                { id: 'basics' as const, label: 'Basics' },
                { id: 'boundaries' as const, label: 'Boundaries' },
                { id: 'policies' as const, label: 'Policies' },
                { id: 'import' as const, label: 'Import JSON' },
              ];

              return (
                <div className="border border-border rounded-lg p-4 space-y-4">
                  {/* Inner tab bar */}
                  <div className="flex gap-0 border-b border-border text-sm">
                    {TABS.map((t) => (
                      <button
                        key={t.id}
                        onClick={() => {
                          set({ activeTab: t.id });
                        }}
                        className={`px-3 py-1.5 font-medium transition-colors border-b-2 -mb-px ${
                          createForm.activeTab === t.id
                            ? 'border-primary text-foreground'
                            : 'border-transparent text-muted-foreground hover:text-foreground'
                        }`}
                      >
                        {t.label}
                      </button>
                    ))}
                  </div>

                  {/* Basics */}
                  {createForm.activeTab === 'basics' && (
                    <div className="space-y-4">
                      <div>
                        <label className="block text-sm font-medium mb-1">Name *</label>
                        <input
                          type="text"
                          value={createForm.name}
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
                          <button
                            onClick={addGoal}
                            className="btn btn-ghost text-xs flex items-center gap-1"
                          >
                            <Plus className="w-3 h-3" /> Add Goal
                          </button>
                        </div>
                        {createForm.goals.length === 0 && (
                          <p className="text-xs text-muted-foreground py-1">
                            No goals yet — click Add Goal.
                          </p>
                        )}
                        <div className="space-y-2">
                          {createForm.goals.map((g) => (
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
                                  <Trash2 className="w-3.5 h-3.5" />
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
                  {createForm.activeTab === 'boundaries' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Rules the AI must never violate.
                        </p>
                        <button
                          onClick={addBoundary}
                          className="btn btn-ghost text-xs flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Boundary
                        </button>
                      </div>
                      {createForm.hardBoundaries.length === 0 && (
                        <p className="text-xs text-muted-foreground py-1">
                          No hard boundaries defined.
                        </p>
                      )}
                      <div className="space-y-2">
                        {createForm.hardBoundaries.map((b) => (
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
                                <Trash2 className="w-3.5 h-3.5" />
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
                  {createForm.activeTab === 'policies' && (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <p className="text-sm text-muted-foreground">
                          Soft rules — warn or block on violation.
                        </p>
                        <button
                          onClick={addPolicy}
                          className="btn btn-ghost text-xs flex items-center gap-1"
                        >
                          <Plus className="w-3 h-3" /> Add Policy
                        </button>
                      </div>
                      {createForm.policies.length === 0 && (
                        <p className="text-xs text-muted-foreground py-1">No policies defined.</p>
                      )}
                      <div className="space-y-2">
                        {createForm.policies.map((p) => (
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
                                  updatePolicy(p.id, {
                                    enforcement: e.target.value as 'warn' | 'block',
                                  });
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
                                <Trash2 className="w-3.5 h-3.5" />
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
                  {createForm.activeTab === 'import' && (
                    <div className="space-y-3">
                      <p className="text-sm text-muted-foreground">
                        Paste a full intent JSON document to populate the form.
                      </p>
                      <textarea
                        value={createForm.importJson}
                        onChange={(e) => {
                          set({ importJson: e.target.value, importError: '' });
                        }}
                        rows={10}
                        className="w-full px-3 py-2 rounded border bg-background font-mono text-xs resize-y"
                        placeholder={
                          '{\n  "name": "...",\n  "goals": [],\n  "hardBoundaries": [],\n  "policies": []\n}'
                        }
                      />
                      {createForm.importError && (
                        <p className="text-xs text-destructive">{createForm.importError}</p>
                      )}
                      <button
                        onClick={handleImport}
                        disabled={!createForm.importJson.trim()}
                        className="btn btn-ghost text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Parse &amp; Apply
                      </button>
                    </div>
                  )}

                  <div className="flex items-center justify-between pt-2 border-t border-border">
                    <button
                      className="btn btn-ghost text-sm"
                      onClick={() => {
                        setShowCreateModal(false);
                        setCreateForm(EMPTY_CREATE_FORM);
                      }}
                    >
                      Cancel
                    </button>
                    <button
                      className="btn btn-ghost text-sm disabled:opacity-50 disabled:cursor-not-allowed"
                      onClick={handleCreate}
                      disabled={!createForm.name.trim() || createMutation.isPending}
                    >
                      {createMutation.isPending ? 'Creating…' : 'Create Intent'}
                    </button>
                  </div>
                </div>
              );
            })()}

          {intents.length === 0 && !showCreateModal && (
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
              onActivate={(id) => {
                activateMutation.mutate(id);
              }}
              onDelete={(id) => {
                if (confirm(`Delete intent document "${intent.name}"?`)) {
                  deleteMutation.mutate(id);
                }
              }}
              onEdit={
                intentEditorEnabled
                  ? (id) => {
                      setEditingIntentId(id);
                      setActiveTab('editor');
                    }
                  : undefined
              }
            />
          ))}
        </div>
      )}

      {activeTab === 'signals' && <SignalDashboard />}
      {activeTab === 'policies' && <PoliciesView />}
      {activeTab === 'delegation' && <DelegationFrameworkView />}
      {activeTab === 'enforcement' && <EnforcementLogFeed />}
      {activeTab === 'editor' &&
        intentEditorEnabled &&
        (editingIntentId ? (
          <IntentDocEditor intentId={editingIntentId} />
        ) : (
          <div className="text-center py-8 border border-dashed border-border rounded-lg">
            <Target className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
            <p className="text-sm text-muted-foreground">No document selected.</p>
            <p className="text-xs text-muted-foreground mt-1">
              Go to Intent Documents and click Edit on a document.
            </p>
          </div>
        ))}
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
        onClick={() => {
          onChange(!enabled);
        }}
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
