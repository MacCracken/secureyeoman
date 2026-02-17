import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Users,
  Play,
  Square,
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Lock,
  Trash2,
  Plus,
  ChevronRight,
  ChevronDown,
  Eye,
} from 'lucide-react';
import {
  fetchAgentProfiles,
  fetchDelegations,
  fetchActiveDelegations,
  cancelDelegation,
  delegateTask,
  createAgentProfile,
  deleteAgentProfile,
  fetchDelegationMessages,
  fetchAgentConfig,
  type AgentProfileInfo,
  type DelegationInfo,
  type ActiveDelegationInfo,
  type DelegationResultInfo,
} from '../api/client';

type TabId = 'active' | 'history' | 'profiles';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />,
  pending: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  completed: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  cancelled: <Square className="w-3.5 h-3.5 text-muted-foreground" />,
  timeout: <AlertTriangle className="w-3.5 h-3.5 text-orange-500" />,
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
  timeout: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

export function SubAgentsPage() {
  const [activeTab, setActiveTab] = useState<TabId>('active');
  const [showNewProfile, setShowNewProfile] = useState(false);
  const [showDelegate, setShowDelegate] = useState(false);
  const queryClient = useQueryClient();

  const { data: configData } = useQuery({
    queryKey: ['agentConfig'],
    queryFn: fetchAgentConfig,
  });

  const enabled = (configData?.config as Record<string, unknown>)?.enabled === true;

  if (!enabled) {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold">Sub-Agents</h1>
        <div className="card p-8 text-center">
          <Users className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Delegation Not Enabled</h2>
          <p className="text-muted-foreground text-sm">
            Enable sub-agent delegation in your configuration to use this feature.
          </p>
          <pre className="mt-4 text-xs bg-muted p-3 rounded text-left inline-block">
{`delegation:
  enabled: true`}
          </pre>
        </div>
      </div>
    );
  }

  const tabs: { id: TabId; label: string }[] = [
    { id: 'active', label: 'Active' },
    { id: 'history', label: 'History' },
    { id: 'profiles', label: 'Profiles' },
  ];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold">Sub-Agents</h1>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowDelegate(true)}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            <Play className="w-3.5 h-3.5" />
            Delegate Task
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-border">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.id
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'active' && <ActiveDelegationsTab />}
      {activeTab === 'history' && <HistoryTab />}
      {activeTab === 'profiles' && (
        <ProfilesTab onNewProfile={() => setShowNewProfile(true)} />
      )}

      {showDelegate && (
        <DelegateDialog
          onClose={() => setShowDelegate(false)}
          onSubmit={async (data) => {
            await delegateTask(data);
            setShowDelegate(false);
            void queryClient.invalidateQueries({ queryKey: ['activeDelegations'] });
            void queryClient.invalidateQueries({ queryKey: ['delegations'] });
          }}
        />
      )}

      {showNewProfile && (
        <NewProfileDialog
          onClose={() => setShowNewProfile(false)}
          onCreated={() => {
            setShowNewProfile(false);
            void queryClient.invalidateQueries({ queryKey: ['agentProfiles'] });
          }}
        />
      )}
    </div>
  );
}

// ── Active Delegations Tab ────────────────────────────────────────

function ActiveDelegationsTab() {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['activeDelegations'],
    queryFn: fetchActiveDelegations,
    refetchInterval: 2000,
  });

  const cancelMut = useMutation({
    mutationFn: cancelDelegation,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['activeDelegations'] });
    },
  });

  const delegations = data?.delegations ?? [];

  if (isLoading) {
    return (
      <div className="flex justify-center py-8">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (delegations.length === 0) {
    return (
      <div className="card p-8 text-center">
        <p className="text-muted-foreground text-sm">No active delegations</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {delegations.map((d: ActiveDelegationInfo) => (
        <div key={d.delegationId} className="card p-4">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="flex items-center gap-2 mb-1">
                {STATUS_ICONS[d.status]}
                <span className="text-sm font-medium">{d.profileName}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[d.status] ?? ''}`}>
                  {d.status}
                </span>
                {d.depth > 0 && (
                  <span className="text-xs text-muted-foreground">depth: {d.depth}</span>
                )}
              </div>
              <p className="text-sm text-muted-foreground truncate">{d.task}</p>
              <div className="flex items-center gap-4 mt-2 text-xs text-muted-foreground">
                <span>{formatDuration(d.elapsedMs)}</span>
                <span>{d.tokensUsed.toLocaleString()} / {d.tokenBudget.toLocaleString()} tokens</span>
                <TokenBar used={d.tokensUsed} budget={d.tokenBudget} />
              </div>
            </div>
            <button
              onClick={() => cancelMut.mutate(d.delegationId)}
              className="btn-ghost p-1.5 rounded text-destructive hover:bg-destructive/10"
              title="Cancel delegation"
            >
              <Square className="w-4 h-4" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}

// ── History Tab ───────────────────────────────────────────────────

function HistoryTab() {
  const [statusFilter, setStatusFilter] = useState<string>('');
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['delegations', statusFilter],
    queryFn: () => fetchDelegations({ status: statusFilter || undefined, limit: 50 }),
    refetchInterval: 5000,
  });

  const delegations = data?.delegations ?? [];

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="input text-sm py-1.5 px-2 w-40"
        >
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="failed">Failed</option>
          <option value="cancelled">Cancelled</option>
          <option value="timeout">Timeout</option>
        </select>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      {!isLoading && delegations.length === 0 && (
        <div className="card p-8 text-center">
          <p className="text-muted-foreground text-sm">No delegations found</p>
        </div>
      )}

      {delegations.map((d: DelegationInfo) => (
        <div key={d.id} className="card">
          <button
            onClick={() => setExpandedId(expandedId === d.id ? null : d.id)}
            className="w-full text-left p-4"
          >
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                {STATUS_ICONS[d.status]}
                <span className="text-sm font-medium truncate">{d.task}</span>
                <span className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[d.status] ?? ''}`}>
                  {d.status}
                </span>
              </div>
              <div className="flex items-center gap-3 text-xs text-muted-foreground">
                <span>{(d.tokensUsedPrompt + d.tokensUsedCompletion).toLocaleString()} tokens</span>
                {d.completedAt && d.startedAt && (
                  <span>{formatDuration(d.completedAt - d.startedAt)}</span>
                )}
                <span>{new Date(d.createdAt).toLocaleString()}</span>
                {expandedId === d.id ? (
                  <ChevronDown className="w-4 h-4" />
                ) : (
                  <ChevronRight className="w-4 h-4" />
                )}
              </div>
            </div>
          </button>

          {expandedId === d.id && <DelegationDetail delegation={d} />}
        </div>
      ))}
    </div>
  );
}

function DelegationDetail({ delegation }: { delegation: DelegationInfo }) {
  const { data: messagesData } = useQuery({
    queryKey: ['delegationMessages', delegation.id],
    queryFn: () => fetchDelegationMessages(delegation.id),
  });

  const messages = messagesData?.messages ?? [];

  return (
    <div className="border-t px-4 py-3 space-y-3">
      {delegation.result && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
          <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap max-h-48 overflow-y-auto">
            {delegation.result}
          </pre>
        </div>
      )}
      {delegation.error && (
        <div>
          <p className="text-xs font-medium text-destructive mb-1">Error</p>
          <pre className="text-xs bg-destructive/10 p-2 rounded">{delegation.error}</pre>
        </div>
      )}
      {messages.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">
            Conversation ({messages.length} messages)
          </p>
          <div className="space-y-1 max-h-64 overflow-y-auto">
            {messages.map((msg: Record<string, unknown>, i: number) => (
              <div
                key={i}
                className={`text-xs p-2 rounded ${
                  msg.role === 'assistant'
                    ? 'bg-primary/5 border-l-2 border-primary'
                    : msg.role === 'system'
                      ? 'bg-muted text-muted-foreground'
                      : msg.role === 'tool'
                        ? 'bg-yellow-500/5 border-l-2 border-yellow-500'
                        : 'bg-muted/50'
                }`}
              >
                <span className="font-medium capitalize">{String(msg.role)}: </span>
                <span className="whitespace-pre-wrap">
                  {String(msg.content ?? '').slice(0, 500)}
                  {String(msg.content ?? '').length > 500 ? '...' : ''}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ── Profiles Tab ──────────────────────────────────────────────────

function ProfilesTab({ onNewProfile }: { onNewProfile: () => void }) {
  const queryClient = useQueryClient();
  const { data, isLoading } = useQuery({
    queryKey: ['agentProfiles'],
    queryFn: fetchAgentProfiles,
  });

  const deleteMut = useMutation({
    mutationFn: deleteAgentProfile,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agentProfiles'] });
    },
  });

  const profiles = data?.profiles ?? [];

  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button
          onClick={onNewProfile}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
        >
          <Plus className="w-3.5 h-3.5" />
          New Profile
        </button>
      </div>

      {isLoading && (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {profiles.map((p: AgentProfileInfo) => (
          <div key={p.id} className="card p-4">
            <div className="flex items-start justify-between gap-2 mb-2">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold">{p.name}</span>
                {p.isBuiltin && (
                  <Lock className="w-3.5 h-3.5 text-muted-foreground" aria-label="Built-in profile" />
                )}
              </div>
              {!p.isBuiltin && (
                <button
                  onClick={() => deleteMut.mutate(p.id)}
                  className="btn-ghost p-1 rounded text-destructive hover:bg-destructive/10"
                  title="Delete profile"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              )}
            </div>
            <p className="text-xs text-muted-foreground mb-2">{p.description}</p>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span>{p.maxTokenBudget.toLocaleString()} tokens</span>
              {p.defaultModel && <span>Model: {p.defaultModel}</span>}
              {p.allowedTools.length > 0 && (
                <span>{p.allowedTools.length} tools</span>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Dialogs ───────────────────────────────────────────────────────

function DelegateDialog({
  onClose,
  onSubmit,
}: {
  onClose: () => void;
  onSubmit: (data: { profile: string; task: string; context?: string }) => Promise<void>;
}) {
  const [profile, setProfile] = useState('researcher');
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const { data: profilesData } = useQuery({
    queryKey: ['agentProfiles'],
    queryFn: fetchAgentProfiles,
  });

  const profiles = profilesData?.profiles ?? [];

  const handleSubmit = async () => {
    if (!task.trim()) return;
    setSubmitting(true);
    try {
      await onSubmit({ profile, task, context: context || undefined });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border rounded-lg p-6 w-full max-w-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">Delegate Task</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Profile</label>
            <select
              value={profile}
              onChange={(e) => setProfile(e.target.value)}
              className="input w-full text-sm py-2"
            >
              {profiles.map((p: AgentProfileInfo) => (
                <option key={p.id} value={p.name}>{p.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Task</label>
            <textarea
              value={task}
              onChange={(e) => setTask(e.target.value)}
              className="input w-full text-sm py-2 min-h-[80px] resize-y"
              placeholder="Describe the task for the sub-agent..."
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Context (optional)</label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              className="input w-full text-sm py-2 min-h-[60px] resize-y"
              placeholder="Additional context..."
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted/50">
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!task.trim() || submitting}
            className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Delegate'}
          </button>
        </div>
      </div>
    </div>
  );
}

function NewProfileDialog({
  onClose,
  onCreated,
}: {
  onClose: () => void;
  onCreated: () => void;
}) {
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('');
  const [maxTokenBudget, setMaxTokenBudget] = useState(50000);
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!name.trim() || !systemPrompt.trim()) return;
    setSubmitting(true);
    try {
      await createAgentProfile({ name, description, systemPrompt, maxTokenBudget });
      onCreated();
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={onClose}>
      <div className="bg-background border rounded-lg p-6 w-full max-w-lg shadow-lg" onClick={(e) => e.stopPropagation()}>
        <h3 className="text-lg font-semibold mb-4">New Agent Profile</h3>
        <div className="space-y-3">
          <div>
            <label className="text-sm font-medium block mb-1">Name</label>
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input w-full text-sm py-2"
              placeholder="e.g. reviewer"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Description</label>
            <input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="input w-full text-sm py-2"
              placeholder="What this agent specializes in"
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">System Prompt</label>
            <textarea
              value={systemPrompt}
              onChange={(e) => setSystemPrompt(e.target.value)}
              className="input w-full text-sm py-2 min-h-[120px] resize-y"
              placeholder="You are a..."
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Max Token Budget</label>
            <input
              type="number"
              value={maxTokenBudget}
              onChange={(e) => setMaxTokenBudget(Number(e.target.value))}
              className="input w-full text-sm py-2"
              min={1000}
              max={500000}
            />
          </div>
        </div>
        <div className="flex justify-end gap-2 mt-4">
          <button onClick={onClose} className="px-3 py-1.5 text-sm border rounded-lg hover:bg-muted/50">
            Cancel
          </button>
          <button
            onClick={() => void handleSubmit()}
            disabled={!name.trim() || !systemPrompt.trim() || submitting}
            className="px-3 py-1.5 text-sm font-medium bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 disabled:opacity-50"
          >
            {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Create'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────

function TokenBar({ used, budget }: { used: number; budget: number }) {
  const pct = Math.min((used / budget) * 100, 100);
  return (
    <div className="w-20 h-1.5 bg-muted rounded-full overflow-hidden">
      <div
        className={`h-full rounded-full transition-all ${
          pct > 80 ? 'bg-destructive' : pct > 50 ? 'bg-yellow-500' : 'bg-primary'
        }`}
        style={{ width: `${pct}%` }}
      />
    </div>
  );
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remainingSeconds = seconds % 60;
  return `${minutes}m ${remainingSeconds}s`;
}
