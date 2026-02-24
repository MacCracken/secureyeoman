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
  Sliders,
  Users2,
  Globe,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  Plus,
  Trash2,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';
import {
  fetchIntents,
  fetchActiveIntent,
  activateIntent,
  deleteIntent,
  fetchEnforcementLog,
  type OrgIntentMeta,
  type EnforcementLogEntry,
} from '../api/client';

type IntentTab = 'docs' | 'enforcement';

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
}: {
  intent: OrgIntentMeta;
  isActive: boolean;
  onActivate: (id: string) => void;
  onDelete: (id: string) => void;
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

export function IntentEditor() {
  const [activeTab, setActiveTab] = useState<IntentTab>('docs');
  const queryClient = useQueryClient();

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

  const intents = intentsData?.intents ?? [];
  const activeIntentId = activeIntentData?.intent?.id;

  const tabs: { id: IntentTab; label: string; icon: React.ReactNode }[] = [
    { id: 'docs', label: 'Intent Documents', icon: <Target className="w-4 h-4" /> },
    { id: 'enforcement', label: 'Enforcement Log', icon: <ShieldAlert className="w-4 h-4" /> },
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
          </button>
        ))}
      </div>

      {activeTab === 'docs' && (
        <div className="space-y-4">
          {intents.length === 0 && (
            <div className="text-center py-8 border border-dashed border-border rounded-lg">
              <Globe className="w-8 h-8 text-muted-foreground mx-auto mb-2" />
              <p className="text-sm text-muted-foreground">No intent documents yet.</p>
              <p className="text-xs text-muted-foreground mt-1">
                Create one via the API or POST to /api/v1/intent
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
            />
          ))}
        </div>
      )}

      {activeTab === 'enforcement' && <EnforcementLogFeed />}
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
