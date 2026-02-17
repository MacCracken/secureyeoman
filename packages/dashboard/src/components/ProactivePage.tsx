import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Sparkles,
  Zap,
  Inbox,
  TrendingUp,
  Clock,
  Bell,
  Plus,
  Check,
  X,
  Play,
  Pause,
  Trash2,
  FlaskConical,
  ArrowRight,
  ShieldAlert,
  Loader2,
} from 'lucide-react';
import {
  fetchProactiveTriggers,
  fetchProactiveSuggestions,
  fetchProactivePatterns,
  fetchProactiveStatus,
  fetchBuiltinTriggers,
  fetchSecurityPolicy,
  createProactiveTrigger,
  enableProactiveTrigger,
  disableProactiveTrigger,
  deleteProactiveTrigger,
  testProactiveTrigger,
  approveProactiveSuggestion,
  dismissProactiveSuggestion,
  clearExpiredSuggestions,
  convertPatternToTrigger,
  type ProactiveTriggerData,
  type ProactiveSuggestionData,
  type ProactivePatternData,
} from '../api/client';

type Tab = 'overview' | 'triggers' | 'suggestions' | 'patterns';

export function ProactivePage() {
  const [activeTab, setActiveTab] = useState<Tab>('overview');
  const queryClient = useQueryClient();

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
    staleTime: 30000,
  });

  const proactiveEnabled = securityPolicy?.allowProactive ?? false;

  if (!proactiveEnabled) {
    return (
      <div className="space-y-6">
        <div className="flex items-center gap-3">
          <Sparkles className="w-6 h-6 text-primary" />
          <h1 className="text-2xl font-bold">Proactive Assistance</h1>
        </div>
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Proactive Assistance is Disabled</h2>
          <p className="text-muted-foreground mb-4">
            Enable <code className="text-sm bg-muted px-1.5 py-0.5 rounded">allowProactive</code> in
            Security Policy to activate proactive triggers and suggestions.
          </p>
        </div>
      </div>
    );
  }

  const tabs: { key: Tab; label: string; icon: React.ReactNode }[] = [
    { key: 'overview', label: 'Overview', icon: <Sparkles className="w-4 h-4" /> },
    { key: 'triggers', label: 'Triggers', icon: <Zap className="w-4 h-4" /> },
    { key: 'suggestions', label: 'Suggestions', icon: <Inbox className="w-4 h-4" /> },
    { key: 'patterns', label: 'Patterns', icon: <TrendingUp className="w-4 h-4" /> },
  ];

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Sparkles className="w-6 h-6 text-primary" />
        <h1 className="text-2xl font-bold">Proactive Assistance</h1>
      </div>

      <div className="flex gap-1 border-b">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setActiveTab(tab.key)}
            className={`flex items-center gap-2 px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              activeTab === tab.key
                ? 'border-primary text-primary'
                : 'border-transparent text-muted-foreground hover:text-foreground'
            }`}
          >
            {tab.icon}
            {tab.label}
          </button>
        ))}
      </div>

      {activeTab === 'overview' && <OverviewTab />}
      {activeTab === 'triggers' && <TriggersTab />}
      {activeTab === 'suggestions' && <SuggestionsTab />}
      {activeTab === 'patterns' && <PatternsTab />}
    </div>
  );
}

// ── Overview Tab ──────────────────────────────────────────────────────

function OverviewTab() {
  const { data: status } = useQuery({
    queryKey: ['proactive-status'],
    queryFn: fetchProactiveStatus,
    refetchInterval: 10000,
  });

  const { data: builtins } = useQuery({
    queryKey: ['proactive-builtins'],
    queryFn: fetchBuiltinTriggers,
  });

  const triggers = (status as any)?.triggers ?? {};
  const suggestions = (status as any)?.suggestions ?? {};
  const patterns = (status as any)?.patterns ?? {};

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard title="Active Triggers" value={triggers.enabled ?? 0} icon={<Zap className="w-5 h-5" />} subtitle={`${triggers.total ?? 0} total`} />
        <StatCard title="Pending Suggestions" value={suggestions.pending ?? 0} icon={<Inbox className="w-5 h-5" />} />
        <StatCard title="Patterns Detected" value={patterns.detected ?? 0} icon={<TrendingUp className="w-5 h-5" />} />
        <StatCard title="Triggers by Type" value={triggers.total ?? 0} icon={<Clock className="w-5 h-5" />} subtitle={`${triggers.byType?.schedule ?? 0} sched, ${triggers.byType?.event ?? 0} event`} />
      </div>

      <div className="card">
        <div className="card-header">
          <h2 className="card-title text-base">Built-in Triggers</h2>
          <p className="card-description text-sm">Common proactive scenarios available to personalities</p>
        </div>
        <div className="card-content">
          <p className="text-xs text-muted-foreground mb-3">
            Triggers are enabled per personality via the Personality Editor. Configure which triggers each personality can use in its proactive settings.
          </p>
          <div className="space-y-3">
            {(builtins?.triggers ?? []).map((trigger) => (
              <div key={trigger.id} className="flex items-center gap-3 p-3 border rounded-lg">
                <Zap className="w-4 h-4 text-primary flex-shrink-0" />
                <div className="min-w-0 flex-1">
                  <p className="text-sm font-medium">{trigger.name}</p>
                  <p className="text-xs text-muted-foreground">{trigger.description}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Triggers Tab ──────────────────────────────────────────────────────

function TriggersTab() {
  const [showCreate, setShowCreate] = useState(false);
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['proactive-triggers'],
    queryFn: () => fetchProactiveTriggers(),
  });

  const enableMut = useMutation({
    mutationFn: enableProactiveTrigger,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] }),
  });

  const disableMut = useMutation({
    mutationFn: disableProactiveTrigger,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] }),
  });

  const deleteMut = useMutation({
    mutationFn: deleteProactiveTrigger,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] }),
  });

  const testMut = useMutation({ mutationFn: testProactiveTrigger });

  const triggers = data?.triggers ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">{triggers.length} trigger(s)</p>
        <button
          onClick={() => setShowCreate(!showCreate)}
          className="flex items-center gap-2 px-3 py-2 text-sm bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
        >
          <Plus className="w-4 h-4" />
          New Trigger
        </button>
      </div>

      {showCreate && <CreateTriggerForm onClose={() => setShowCreate(false)} />}

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : triggers.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground">
          No triggers configured yet. Create one or enable a built-in trigger.
        </div>
      ) : (
        <div className="space-y-2">
          {triggers.map((trigger) => (
            <TriggerRow
              key={trigger.id}
              trigger={trigger}
              onEnable={() => enableMut.mutate(trigger.id)}
              onDisable={() => disableMut.mutate(trigger.id)}
              onDelete={() => deleteMut.mutate(trigger.id)}
              onTest={() => testMut.mutate(trigger.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function TriggerRow({
  trigger,
  onEnable,
  onDisable,
  onDelete,
  onTest,
}: {
  trigger: ProactiveTriggerData;
  onEnable: () => void;
  onDisable: () => void;
  onDelete: () => void;
  onTest: () => void;
}) {
  const typeColors: Record<string, string> = {
    schedule: 'bg-blue-500/10 text-blue-500',
    event: 'bg-amber-500/10 text-amber-500',
    pattern: 'bg-purple-500/10 text-purple-500',
    webhook: 'bg-green-500/10 text-green-500',
    llm: 'bg-pink-500/10 text-pink-500',
  };

  return (
    <div className="card p-4 flex items-center gap-4">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${typeColors[trigger.type] ?? 'bg-muted text-muted-foreground'}`}>
            {trigger.type}
          </span>
          <p className="text-sm font-medium truncate">{trigger.name}</p>
          {trigger.builtin && (
            <span className="px-1.5 py-0.5 rounded text-[10px] bg-muted text-muted-foreground">built-in</span>
          )}
        </div>
        {trigger.description && (
          <p className="text-xs text-muted-foreground mt-1 truncate">{trigger.description}</p>
        )}
      </div>
      <div className="flex items-center gap-1.5 flex-shrink-0">
        <button
          onClick={onTest}
          className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground"
          title="Test trigger"
        >
          <FlaskConical className="w-4 h-4" />
        </button>
        <button
          onClick={trigger.enabled ? onDisable : onEnable}
          className={`p-1.5 rounded hover:bg-muted/50 ${trigger.enabled ? 'text-green-500' : 'text-muted-foreground'}`}
          title={trigger.enabled ? 'Disable' : 'Enable'}
        >
          {trigger.enabled ? <Pause className="w-4 h-4" /> : <Play className="w-4 h-4" />}
        </button>
        {!trigger.builtin && (
          <button onClick={onDelete} className="p-1.5 rounded hover:bg-muted/50 text-destructive" title="Delete">
            <Trash2 className="w-4 h-4" />
          </button>
        )}
      </div>
    </div>
  );
}

function CreateTriggerForm({ onClose }: { onClose: () => void }) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [type, setType] = useState<'schedule' | 'event' | 'pattern' | 'webhook' | 'llm'>('schedule');
  const [cron, setCron] = useState('0 9 * * 1-5');
  const [eventType, setEventType] = useState('');
  const [actionType, setActionType] = useState<'message' | 'remind'>('message');
  const [actionContent, setActionContent] = useState('');
  const [approvalMode, setApprovalMode] = useState<'auto' | 'suggest' | 'manual'>('suggest');

  const createMut = useMutation({
    mutationFn: createProactiveTrigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] });
      onClose();
    },
  });

  const handleSubmit = () => {
    const condition =
      type === 'schedule' ? { type: 'schedule' as const, cron, timezone: 'UTC' } :
      type === 'event' ? { type: 'event' as const, eventType } :
      type === 'pattern' ? { type: 'pattern' as const, patternId: '', minConfidence: 0.7 } :
      type === 'webhook' ? { type: 'webhook' as const, path: '/proactive/hook', method: 'POST' as const } :
      { type: 'llm' as const, prompt: actionContent, evaluationIntervalMs: 3600000 };

    const action =
      actionType === 'message'
        ? { type: 'message' as const, content: actionContent }
        : { type: 'remind' as const, content: actionContent, category: 'user_trigger' };

    createMut.mutate({
      name,
      enabled: true,
      type,
      condition,
      action,
      approvalMode,
      cooldownMs: 0,
      limitPerDay: 0,
    });
  };

  return (
    <div className="card p-4 space-y-4 border-primary/30">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold">New Trigger</h3>
        <button onClick={onClose} className="p-1 rounded hover:bg-muted/50">
          <X className="w-4 h-4" />
        </button>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Name</label>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
            placeholder="My trigger"
          />
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Type</label>
          <select
            value={type}
            onChange={(e) => setType(e.target.value as any)}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
          >
            <option value="schedule">Schedule (Cron)</option>
            <option value="event">Event</option>
            <option value="pattern">Pattern</option>
            <option value="webhook">Webhook</option>
            <option value="llm">LLM</option>
          </select>
        </div>
      </div>

      {type === 'schedule' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Cron Expression</label>
          <input
            value={cron}
            onChange={(e) => setCron(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background font-mono"
            placeholder="0 9 * * 1-5"
          />
        </div>
      )}

      {type === 'event' && (
        <div>
          <label className="text-xs font-medium text-muted-foreground">Event Type</label>
          <input
            value={eventType}
            onChange={(e) => setEventType(e.target.value)}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
            placeholder="integration_disconnected"
          />
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="text-xs font-medium text-muted-foreground">Action Type</label>
          <select
            value={actionType}
            onChange={(e) => setActionType(e.target.value as any)}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
          >
            <option value="message">Message</option>
            <option value="remind">Remind</option>
          </select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground">Approval Mode</label>
          <select
            value={approvalMode}
            onChange={(e) => setApprovalMode(e.target.value as any)}
            className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background"
          >
            <option value="auto">Auto-execute</option>
            <option value="suggest">Suggest first</option>
            <option value="manual">Manual only</option>
          </select>
        </div>
      </div>

      <div>
        <label className="text-xs font-medium text-muted-foreground">Content</label>
        <textarea
          value={actionContent}
          onChange={(e) => setActionContent(e.target.value)}
          className="w-full mt-1 px-3 py-2 text-sm border rounded-md bg-background resize-none"
          rows={3}
          placeholder="Enter the message or reminder content..."
        />
      </div>

      <div className="flex justify-end gap-2">
        <button onClick={onClose} className="px-4 py-2 text-sm border rounded-md hover:bg-muted/50 transition-colors">
          Cancel
        </button>
        <button
          onClick={handleSubmit}
          disabled={!name || !actionContent || createMut.isPending}
          className="px-4 py-2 text-sm bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          {createMut.isPending ? 'Creating...' : 'Create Trigger'}
        </button>
      </div>
    </div>
  );
}

// ── Suggestions Tab ───────────────────────────────────────────────────

function SuggestionsTab() {
  const [filter, setFilter] = useState<'pending' | 'all'>('pending');
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['proactive-suggestions', filter],
    queryFn: () => fetchProactiveSuggestions(filter === 'pending' ? { status: 'pending' } : {}),
    refetchInterval: 5000,
  });

  const approveMut = useMutation({
    mutationFn: approveProactiveSuggestion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proactive-suggestions'] }),
  });

  const dismissMut = useMutation({
    mutationFn: dismissProactiveSuggestion,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proactive-suggestions'] }),
  });

  const clearMut = useMutation({
    mutationFn: clearExpiredSuggestions,
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['proactive-suggestions'] }),
  });

  const suggestions = data?.suggestions ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex gap-2">
          <button
            onClick={() => setFilter('pending')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium ${filter === 'pending' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            Pending
          </button>
          <button
            onClick={() => setFilter('all')}
            className={`px-3 py-1.5 text-xs rounded-md font-medium ${filter === 'all' ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'}`}
          >
            All
          </button>
        </div>
        <button
          onClick={() => clearMut.mutate()}
          className="text-xs text-muted-foreground hover:text-foreground transition-colors"
        >
          Clear Expired
        </button>
      </div>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : suggestions.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground">
          No suggestions{filter === 'pending' ? ' pending' : ''}.
        </div>
      ) : (
        <div className="space-y-2">
          {suggestions.map((suggestion) => (
            <SuggestionRow
              key={suggestion.id}
              suggestion={suggestion}
              onApprove={() => approveMut.mutate(suggestion.id)}
              onDismiss={() => dismissMut.mutate(suggestion.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function SuggestionRow({
  suggestion,
  onApprove,
  onDismiss,
}: {
  suggestion: ProactiveSuggestionData;
  onApprove: () => void;
  onDismiss: () => void;
}) {
  const statusColors: Record<string, string> = {
    pending: 'bg-amber-500/10 text-amber-500',
    approved: 'bg-blue-500/10 text-blue-500',
    executed: 'bg-green-500/10 text-green-500',
    dismissed: 'bg-muted text-muted-foreground',
    expired: 'bg-muted text-muted-foreground',
  };

  return (
    <div className="card p-4 flex items-center gap-4">
      <Bell className="w-5 h-5 text-primary flex-shrink-0" />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <p className="text-sm font-medium">{suggestion.triggerName}</p>
          <span className={`px-2 py-0.5 rounded text-[10px] font-medium ${statusColors[suggestion.status] ?? ''}`}>
            {suggestion.status}
          </span>
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">
          {(suggestion.action as any)?.content ?? JSON.stringify(suggestion.action).slice(0, 100)}
        </p>
        <p className="text-[10px] text-muted-foreground mt-1">
          {new Date(suggestion.suggestedAt).toLocaleString()}
        </p>
      </div>
      {suggestion.status === 'pending' && (
        <div className="flex items-center gap-1.5 flex-shrink-0">
          <button onClick={onApprove} className="p-1.5 rounded hover:bg-green-500/10 text-green-500" title="Approve">
            <Check className="w-4 h-4" />
          </button>
          <button onClick={onDismiss} className="p-1.5 rounded hover:bg-muted/50 text-muted-foreground" title="Dismiss">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}
    </div>
  );
}

// ── Patterns Tab ──────────────────────────────────────────────────────

function PatternsTab() {
  const queryClient = useQueryClient();

  const { data, isLoading } = useQuery({
    queryKey: ['proactive-patterns'],
    queryFn: fetchProactivePatterns,
  });

  const convertMut = useMutation({
    mutationFn: convertPatternToTrigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] });
      queryClient.invalidateQueries({ queryKey: ['proactive-patterns'] });
    },
  });

  const patterns = data?.patterns ?? [];

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        Patterns are automatically detected from your interaction history. Convert them to triggers to automate recurring actions.
      </p>

      {isLoading ? (
        <div className="flex justify-center py-8">
          <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
        </div>
      ) : patterns.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground">
          No patterns detected yet. Patterns will appear as FRIDAY learns from your interactions.
        </div>
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {patterns.map((pattern) => (
            <PatternCard
              key={pattern.id}
              pattern={pattern}
              onConvert={() => convertMut.mutate(pattern.id)}
              converting={convertMut.isPending}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PatternCard({
  pattern,
  onConvert,
  converting,
}: {
  pattern: ProactivePatternData;
  onConvert: () => void;
  converting: boolean;
}) {
  const typeIcons: Record<string, React.ReactNode> = {
    temporal: <Clock className="w-5 h-5 text-blue-500" />,
    sequential: <ArrowRight className="w-5 h-5 text-purple-500" />,
    contextual: <TrendingUp className="w-5 h-5 text-amber-500" />,
  };

  return (
    <div className="card p-4">
      <div className="flex items-start gap-3">
        <div className="p-2 bg-muted rounded-lg">
          {typeIcons[pattern.type] ?? <TrendingUp className="w-5 h-5" />}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-medium">{pattern.description}</p>
          <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
            <span>{pattern.occurrences} occurrences</span>
            <span>{(pattern.confidence * 100).toFixed(0)}% confidence</span>
          </div>
        </div>
      </div>
      <div className="mt-3 pt-3 border-t flex justify-end">
        <button
          onClick={onConvert}
          disabled={converting}
          className="flex items-center gap-1.5 px-3 py-1.5 text-xs bg-primary text-primary-foreground rounded-md hover:bg-primary/90 transition-colors disabled:opacity-50"
        >
          <Zap className="w-3 h-3" />
          Convert to Trigger
        </button>
      </div>
    </div>
  );
}

// ── Shared Components ─────────────────────────────────────────────────

function StatCard({
  title,
  value,
  icon,
  subtitle,
}: {
  title: string;
  value: string | number;
  icon: React.ReactNode;
  subtitle?: string;
}) {
  return (
    <div className="card p-4">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-xs text-muted-foreground">{title}</p>
          <p className="text-2xl font-bold mt-1">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
        </div>
        <div className="p-2 bg-primary/10 rounded-lg text-primary">{icon}</div>
      </div>
    </div>
  );
}
