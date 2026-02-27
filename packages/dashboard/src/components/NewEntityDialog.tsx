import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Brain,
  Zap,
  ListTodo,
  FlaskConical,
  ChevronDown,
  X,
  Bot,
  Network,
  Puzzle,
  ShieldCheck,
  MessageSquare,
  Database,
  Bell,
  Package,
  UserPlus,
  Building2,
  FileText,
  GitBranch,
  GitMerge,
  Plug,
  Crosshair,
  Plus,
} from 'lucide-react';
import {
  fetchModelInfo,
  createProactiveTrigger,
  registerExtension,
  createUser,
  createWorkspace,
  addMemory,
  learnKnowledge,
  createIntent,
} from '../api/client';

type IconComp = React.ComponentType<{ className?: string }>;

type DialogStep =
  | 'select'
  | 'personality'
  | 'task'
  | 'skill'
  | 'experiment'
  | 'sub-agent'
  | 'custom-role'
  | 'proactive'
  | 'extension'
  | 'user'
  | 'workspace'
  | 'memory'
  | 'intent';

type ConfigItem =
  | {
      kind: 'form';
      step: Exclude<DialogStep, 'select'>;
      icon: IconComp;
      label: string;
      desc: string;
    }
  | { kind: 'nav'; path: string; icon: IconComp; label: string; desc: string };

interface NavItem {
  path: string;
  icon: IconComp;
  label: string;
  desc: string;
}

interface NewEntityDialogProps {
  open: boolean;
  onClose: () => void;
}

// ── Create & Configure — 3-column, 4 rows ─────────────────────────────────
const CONFIG_ITEMS: ConfigItem[] = [
  // Row 1 — core building blocks
  { kind: 'form', step: 'skill', icon: Zap, label: 'Skill', desc: 'New skill definition' },
  { kind: 'form', step: 'task', icon: ListTodo, label: 'Task', desc: 'Schedule a task' },
  {
    kind: 'form',
    step: 'memory',
    icon: Database,
    label: 'Memory',
    desc: 'Vector memory or knowledge',
  },
  // Row 2 — AI agents
  {
    kind: 'form',
    step: 'personality',
    icon: Brain,
    label: 'Personality',
    desc: 'New AI personality',
  },
  {
    kind: 'form',
    step: 'sub-agent',
    icon: Bot,
    label: 'Sub-Agent',
    desc: 'Create an agent profile',
  },
  { kind: 'form', step: 'intent', icon: Crosshair, label: 'Intent', desc: 'Define org intent' },
  // Row 3 — automation & research
  {
    kind: 'form',
    step: 'proactive',
    icon: Bell,
    label: 'Proactive Trigger',
    desc: 'Proactive assistance rule',
  },
  { kind: 'form', step: 'extension', icon: Package, label: 'Extension', desc: 'Add an extension' },
  {
    kind: 'form',
    step: 'experiment',
    icon: FlaskConical,
    label: 'Experiment',
    desc: 'Try a new feature',
  },
  // Row 4 — access & workspace
  { kind: 'form', step: 'user', icon: UserPlus, label: 'User', desc: 'Invite a new user' },
  {
    kind: 'form',
    step: 'workspace',
    icon: Building2,
    label: 'Workspace',
    desc: 'Create a new workspace',
  },
  {
    kind: 'form',
    step: 'custom-role',
    icon: ShieldCheck,
    label: 'Custom Role',
    desc: 'Define an access role',
  },
];

// ── Navigate & Create — opens the relevant page directly ──────────────────
const NAV_ITEMS: NavItem[] = [
  { path: '/chat', icon: MessageSquare, label: 'Conversation', desc: 'Start a new chat' },
  { path: '/connections', icon: Puzzle, label: 'MCP Server', desc: 'Connect a server' },
  { path: '/agents', icon: Network, label: 'A2A Peer', desc: 'Agent-to-agent link' },
  { path: '/reports', icon: FileText, label: 'Report', desc: 'Generate a report' },
  {
    path: '/connections?tab=routing',
    icon: GitBranch,
    label: 'Routing Rule',
    desc: 'Route AI responses',
  },
  { path: '/connections', icon: Plug, label: 'Integration', desc: 'Add an integration' },
  {
    path: '/automation?tab=workflows',
    icon: GitMerge,
    label: 'Workflow',
    desc: 'Create an automation',
  },
];

export function NewEntityDialog({ open, onClose }: NewEntityDialogProps) {
  const [step, setStep] = useState<DialogStep>('select');
  const [personality, setPersonality] = useState({ name: '', description: '', model: '' });
  const [task, setTask] = useState({ name: '', type: 'execute', description: '', input: '' });
  const [skill, setSkill] = useState({ name: '', description: '', trigger: '', action: '' });
  const [experiment, setExperiment] = useState({ name: '', description: '' });
  const [subAgent, setSubAgent] = useState({ name: '', description: '' });
  const [customRole, setCustomRole] = useState({ name: '', description: '' });
  const [proactive, setProactive] = useState({
    name: '',
    type: 'schedule' as 'schedule' | 'event' | 'pattern' | 'webhook' | 'llm',
    cron: '0 9 * * 1-5',
    eventType: '',
    actionType: 'message' as 'message' | 'remind',
    actionContent: '',
    approvalMode: 'suggest' as 'auto' | 'suggest' | 'manual',
  });

  const [extension, setExtension] = useState({
    id: '',
    name: '',
    version: '1.0.0',
    hooksText: '',
    error: '',
  });
  const [user, setUser] = useState({
    email: '',
    displayName: '',
    password: '',
    isAdmin: false,
    error: '',
  });
  const [workspace, setWorkspace] = useState({ name: '', description: '', error: '' });
  const [memory, setMemory] = useState({
    subtype: 'memory' as 'memory' | 'knowledge',
    // vector memory fields
    memType: 'semantic' as 'episodic' | 'semantic' | 'procedural' | 'preference',
    content: '',
    source: '',
    importance: 0.5,
    // knowledge base fields
    topic: '',
    knowledgeContent: '',
    error: '',
  });
  const [intent, setIntent] = useState({
    name: '',
    goals: [] as { id: string; name: string; description: string; priority: number }[],
    hardBoundaries: [] as { id: string; rule: string; rationale: string }[],
    policies: [] as {
      id: string;
      rule: string;
      enforcement: 'warn' | 'block';
      rationale: string;
    }[],
    importJson: '',
    importError: '',
    activeTab: 'basics' as 'basics' | 'boundaries' | 'policies' | 'import',
  });

  const queryClient = useQueryClient();
  const createTriggerMut = useMutation({
    mutationFn: createProactiveTrigger,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proactive-triggers'] });
      handleClose();
    },
  });

  const registerExtensionMut = useMutation({
    mutationFn: registerExtension,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['extensions'] });
      handleClose();
    },
    onError: (err) => {
      setExtension((e) => ({
        ...e,
        error: err instanceof Error ? err.message : 'Registration failed',
      }));
    },
  });

  const createUserMut = useMutation({
    mutationFn: createUser,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['auth-users'] });
      handleClose();
    },
    onError: (err) => {
      setUser((u) => ({
        ...u,
        error: err instanceof Error ? err.message : 'Failed to create user',
      }));
    },
  });

  const createWorkspaceMut = useMutation({
    mutationFn: createWorkspace,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces'] });
      handleClose();
    },
    onError: (err) => {
      setWorkspace((w) => ({
        ...w,
        error: err instanceof Error ? err.message : 'Failed to create workspace',
      }));
    },
  });

  const addMemoryMut = useMutation({
    mutationFn: addMemory,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['memories'] });
      handleClose();
    },
    onError: (err) => {
      setMemory((m) => ({
        ...m,
        error: err instanceof Error ? err.message : 'Failed to add memory',
      }));
    },
  });

  const learnKnowledgeMut = useMutation({
    mutationFn: ({ topic, content }: { topic: string; content: string }) =>
      learnKnowledge(topic, content),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['knowledge'] });
      handleClose();
    },
    onError: (err) => {
      setMemory((m) => ({
        ...m,
        error: err instanceof Error ? err.message : 'Failed to save knowledge',
      }));
    },
  });

  const createIntentMut = useMutation({
    mutationFn: (doc: Record<string, unknown>) => createIntent(doc),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['intents'] });
      handleClose();
      window.location.href = '/intent';
    },
    onError: (err) => {
      setIntent((s) => ({
        ...s,
        importError: err instanceof Error ? err.message : 'Failed to create intent',
      }));
    },
  });

  const { data: modelInfo } = useQuery({
    queryKey: ['modelInfo'],
    queryFn: fetchModelInfo,
  });

  const modelsByProvider = modelInfo?.available ?? {};

  const reset = () => {
    setStep('select');
    setPersonality({ name: '', description: '', model: '' });
    setTask({ name: '', type: 'execute', description: '', input: '' });
    setSkill({ name: '', description: '', trigger: '', action: '' });
    setExperiment({ name: '', description: '' });
    setSubAgent({ name: '', description: '' });
    setCustomRole({ name: '', description: '' });
    setProactive({
      name: '',
      type: 'schedule',
      cron: '0 9 * * 1-5',
      eventType: '',
      actionType: 'message',
      actionContent: '',
      approvalMode: 'suggest',
    });
    setExtension({ id: '', name: '', version: '1.0.0', hooksText: '', error: '' });
    setUser({ email: '', displayName: '', password: '', isAdmin: false, error: '' });
    setWorkspace({ name: '', description: '', error: '' });
    setMemory({
      subtype: 'memory',
      memType: 'semantic',
      content: '',
      source: '',
      importance: 0.5,
      topic: '',
      knowledgeContent: '',
      error: '',
    });
    setIntent({
      name: '',
      goals: [],
      hardBoundaries: [],
      policies: [],
      importJson: '',
      importError: '',
      activeTab: 'basics',
    });
  };

  const handleClose = () => {
    reset();
    onClose();
  };

  const goBack = () => {
    setStep('select');
  };

  const navigateTo = (path: string) => {
    handleClose();
    window.location.href = path;
  };

  // ── Selection grid ─────────────────────────────────────────────────────

  const renderSelect = () => (
    <div className="space-y-5">
      {/* Create & Configure */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Create &amp; Configure
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {CONFIG_ITEMS.map((item, i) => {
            const { icon: Icon, label, desc } = item;
            const isNav = item.kind === 'nav';

            return (
              <button
                key={i}
                onClick={() => {
                  if (item.kind === 'form') { setStep(item.step); } else { navigateTo(item.path); }
                }}
                className={`p-3 rounded-lg hover:bg-muted/50 transition-colors text-left border ${
                  isNav ? 'border-dashed' : ''
                }`}
              >
                <Icon
                  className={`w-5 h-5 mb-1.5 ${isNav ? 'text-muted-foreground' : 'text-primary'}`}
                />
                <div className="font-medium text-sm">{label}</div>
                <div className="text-xs text-muted-foreground">{desc}</div>
              </button>
            );
          })}
        </div>
      </div>

      {/* Navigate & Create */}
      <div>
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-2">
          Navigate &amp; Create
        </p>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
          {NAV_ITEMS.map(({ path, icon: Icon, label, desc }) => (
            <button
              key={path + label}
              onClick={() => {
                navigateTo(path);
              }}
              className="p-3 border border-dashed rounded-lg hover:bg-muted/50 transition-colors text-left"
            >
              <Icon className="w-5 h-5 mb-1.5 text-muted-foreground" />
              <div className="font-medium text-sm">{label}</div>
              <div className="text-xs text-muted-foreground">{desc}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );

  // ── Sub-forms ──────────────────────────────────────────────────────────

  const renderPersonality = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Personality</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={personality.name}
          onChange={(e) => {
            setPersonality({ ...personality, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Coding Assistant"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={personality.description}
          onChange={(e) => {
            setPersonality({ ...personality, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Model</label>
        {Object.keys(modelsByProvider).length > 0 ? (
          <select
            value={personality.model}
            onChange={(e) => {
              setPersonality({ ...personality, model: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
          >
            <option value="">Default (system)</option>
            {Object.entries(modelsByProvider).map(([provider, models]) => (
              <optgroup key={provider} label={provider}>
                {models.map((m) => (
                  <option key={m.model} value={m.model}>
                    {m.model}
                  </option>
                ))}
              </optgroup>
            ))}
          </select>
        ) : (
          <input
            type="text"
            value={personality.model}
            onChange={(e) => {
              setPersonality({ ...personality, model: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="e.g., claude-3-5-sonnet-20241022"
          />
        )}
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!personality.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/personality?create=true&name=${encodeURIComponent(personality.name)}&description=${encodeURIComponent(personality.description)}&model=${encodeURIComponent(personality.model)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderTask = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Task</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={task.name}
          onChange={(e) => {
            setTask({ ...task, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Run backup"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Type</label>
        <select
          value={task.type}
          onChange={(e) => {
            setTask({ ...task, type: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
        >
          <option value="execute">Execute</option>
          <option value="query">Query</option>
          <option value="file">File</option>
          <option value="network">Network</option>
          <option value="system">System</option>
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={task.description}
          onChange={(e) => {
            setTask({ ...task, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Optional description"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Input (JSON)</label>
        <textarea
          value={task.input}
          onChange={(e) => {
            setTask({ ...task, input: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background font-mono text-sm"
          rows={3}
          placeholder='{"key": "value"}'
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!task.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/automation?create=true&name=${encodeURIComponent(task.name)}&type=${encodeURIComponent(task.type)}&description=${encodeURIComponent(task.description)}&input=${encodeURIComponent(task.input)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderSkill = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Skill</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={skill.name}
          onChange={(e) => {
            setSkill({ ...skill, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Git Helper"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={skill.description}
          onChange={(e) => {
            setSkill({ ...skill, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What this skill does"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Trigger</label>
        <input
          type="text"
          value={skill.trigger}
          onChange={(e) => {
            setSkill({ ...skill, trigger: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., /git or on_push"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Action</label>
        <textarea
          value={skill.action}
          onChange={(e) => {
            setSkill({ ...skill, action: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background font-mono text-sm"
          rows={3}
          placeholder="What the skill does..."
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!skill.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/skills?create=true&name=${encodeURIComponent(skill.name)}&description=${encodeURIComponent(skill.description)}&trigger=${encodeURIComponent(skill.trigger)}&action=${encodeURIComponent(skill.action)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderExperiment = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Experiment</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={experiment.name}
          onChange={(e) => {
            setExperiment({ ...experiment, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., New Voice UI"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={experiment.description}
          onChange={(e) => {
            setExperiment({ ...experiment, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What you're testing"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Creates an experiment with Control and Variant A variants (50% traffic each).
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!experiment.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/experiments?create=true&name=${encodeURIComponent(experiment.name)}&description=${encodeURIComponent(experiment.description)}`
            );
          }}
        >
          Create
        </button>
      </div>
    </div>
  );

  const renderSubAgent = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Sub-Agent</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Name *</label>
        <input
          type="text"
          value={subAgent.name}
          onChange={(e) => {
            setSubAgent({ ...subAgent, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Research Agent"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={subAgent.description}
          onChange={(e) => {
            setSubAgent({ ...subAgent, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="What this agent specialises in"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Opens the Agents page where you can configure the full agent profile.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!subAgent.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/agents?create=true&tab=profiles&name=${encodeURIComponent(subAgent.name)}&description=${encodeURIComponent(subAgent.description)}`
            );
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderCustomRole = () => (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button onClick={goBack} className="btn-ghost p-1 rounded">
          <ChevronDown className="w-4 h-4 rotate-90" />
        </button>
        <h3 className="text-lg font-semibold">New Custom Role</h3>
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Role Name *</label>
        <input
          type="text"
          value={customRole.name}
          onChange={(e) => {
            setCustomRole({ ...customRole, name: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="e.g., Data Analyst"
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          value={customRole.description}
          onChange={(e) => {
            setCustomRole({ ...customRole, description: e.target.value });
          }}
          className="w-full px-3 py-2 rounded border bg-background"
          placeholder="Role purpose and capabilities"
        />
      </div>
      <p className="text-xs text-muted-foreground">
        Opens Security Settings where you can assign permissions to this role.
      </p>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={handleClose} className="btn btn-ghost">
          Cancel
        </button>
        <button
          disabled={!customRole.name.trim()}
          className="btn btn-ghost"
          onClick={() => {
            navigateTo(
              `/settings?tab=security&create=true&name=${encodeURIComponent(customRole.name)}&description=${encodeURIComponent(customRole.description)}`
            );
          }}
        >
          Continue
        </button>
      </div>
    </div>
  );

  const renderProactiveTrigger = () => {
    const set = (patch: Partial<typeof proactive>) => {
      setProactive((p) => ({ ...p, ...patch }));
    };
    const canSubmit = !!proactive.name.trim() && !!proactive.actionContent.trim();

    const handleSubmit = () => {
      const condition =
        proactive.type === 'schedule'
          ? { type: 'schedule' as const, cron: proactive.cron, timezone: 'UTC' }
          : proactive.type === 'event'
            ? { type: 'event' as const, eventType: proactive.eventType }
            : proactive.type === 'pattern'
              ? { type: 'pattern' as const, patternId: '', minConfidence: 0.7 }
              : proactive.type === 'webhook'
                ? { type: 'webhook' as const, path: '/proactive/hook', method: 'POST' as const }
                : {
                    type: 'llm' as const,
                    prompt: proactive.actionContent,
                    evaluationIntervalMs: 3600000,
                  };

      const action =
        proactive.actionType === 'message'
          ? { type: 'message' as const, content: proactive.actionContent }
          : { type: 'remind' as const, content: proactive.actionContent, category: 'user_trigger' };

      createTriggerMut.mutate({
        name: proactive.name,
        enabled: true,
        type: proactive.type,
        condition,
        action,
        approvalMode: proactive.approvalMode,
        cooldownMs: 0,
        limitPerDay: 0,
      });
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-ghost p-1 rounded">
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
          <h3 className="text-lg font-semibold">New Proactive Trigger</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Name *</label>
            <input
              type="text"
              value={proactive.name}
              onChange={(e) => {
                set({ name: e.target.value });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
              placeholder="My trigger"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Type</label>
            <select
              value={proactive.type}
              onChange={(e) => {
                set({ type: e.target.value as typeof proactive.type });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
            >
              <option value="schedule">Schedule (Cron)</option>
              <option value="event">Event</option>
              <option value="pattern">Pattern</option>
              <option value="webhook">Webhook</option>
              <option value="llm">LLM</option>
            </select>
          </div>
        </div>

        {proactive.type === 'schedule' && (
          <div>
            <label className="block text-sm font-medium mb-1">Cron Expression</label>
            <input
              type="text"
              value={proactive.cron}
              onChange={(e) => {
                set({ cron: e.target.value });
              }}
              className="w-full px-3 py-2 rounded border bg-background font-mono"
              placeholder="0 9 * * 1-5"
            />
          </div>
        )}

        {proactive.type === 'event' && (
          <div>
            <label className="block text-sm font-medium mb-1">Event Type</label>
            <input
              type="text"
              value={proactive.eventType}
              onChange={(e) => {
                set({ eventType: e.target.value });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
              placeholder="integration_disconnected"
            />
          </div>
        )}

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Action Type</label>
            <select
              value={proactive.actionType}
              onChange={(e) => {
                set({ actionType: e.target.value as typeof proactive.actionType });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
            >
              <option value="message">Message</option>
              <option value="remind">Remind</option>
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Approval Mode</label>
            <select
              value={proactive.approvalMode}
              onChange={(e) => {
                set({ approvalMode: e.target.value as typeof proactive.approvalMode });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
            >
              <option value="auto">Auto-execute</option>
              <option value="suggest">Suggest first</option>
              <option value="manual">Manual only</option>
            </select>
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Content *</label>
          <textarea
            value={proactive.actionContent}
            onChange={(e) => {
              set({ actionContent: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background font-mono text-sm resize-none"
            rows={3}
            placeholder="Enter the message or reminder content..."
          />
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            disabled={!canSubmit || createTriggerMut.isPending}
            className="btn btn-ghost"
            onClick={handleSubmit}
          >
            {createTriggerMut.isPending ? 'Creating...' : 'Create Trigger'}
          </button>
        </div>
      </div>
    );
  };

  const renderExtension = () => {
    const set = (patch: Partial<typeof extension>) => {
      setExtension((e) => ({ ...e, ...patch }));
    };
    const canSubmit =
      !!extension.id.trim() && !!extension.name.trim() && !!extension.version.trim();

    const handleSubmit = () => {
      const hooks = extension.hooksText
        .split('\n')
        .map((line) => line.trim())
        .filter(Boolean)
        .map((line) => {
          const [point, semantics, priority] = line.split(',').map((s) => s.trim());
          return { point, semantics, priority: priority ? parseInt(priority, 10) : undefined };
        });

      registerExtensionMut.mutate({
        id: extension.id.trim(),
        name: extension.name.trim(),
        version: extension.version.trim(),
        hooks,
      });
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-ghost p-1 rounded">
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
          <h3 className="text-lg font-semibold">New Extension</h3>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="block text-sm font-medium mb-1">Extension ID *</label>
            <input
              type="text"
              value={extension.id}
              onChange={(e) => {
                set({ id: e.target.value, error: '' });
              }}
              className="w-full px-3 py-2 rounded border bg-background"
              placeholder="e.g. my-extension"
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">Version *</label>
            <input
              type="text"
              value={extension.version}
              onChange={(e) => {
                set({ version: e.target.value });
              }}
              className="w-full px-3 py-2 rounded border bg-background font-mono"
              placeholder="1.0.0"
            />
          </div>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={extension.name}
            onChange={(e) => {
              set({ name: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="My Extension"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Hooks</label>
          <textarea
            value={extension.hooksText}
            onChange={(e) => {
              set({ hooksText: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background font-mono text-sm resize-none"
            rows={3}
            placeholder={'pre-chat, observe, 10\npost-task, transform, 20'}
          />
          <p className="text-xs text-muted-foreground mt-1">
            One per line: point, semantics, priority (optional)
          </p>
        </div>

        {extension.error && <p className="text-xs text-destructive">{extension.error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            disabled={!canSubmit || registerExtensionMut.isPending}
            className="btn btn-ghost"
            onClick={handleSubmit}
          >
            {registerExtensionMut.isPending ? 'Registering...' : 'Register Extension'}
          </button>
        </div>
      </div>
    );
  };

  const renderUser = () => {
    const set = (patch: Partial<typeof user>) => {
      setUser((u) => ({ ...u, ...patch }));
    };
    const canSubmit = !!user.email.trim() && !!user.displayName.trim() && !!user.password.trim();

    const handleSubmit = () => {
      createUserMut.mutate({
        email: user.email.trim(),
        displayName: user.displayName.trim(),
        password: user.password,
        isAdmin: user.isAdmin,
      });
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-ghost p-1 rounded">
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
          <h3 className="text-lg font-semibold">New User</h3>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Email *</label>
          <input
            type="email"
            value={user.email}
            onChange={(e) => {
              set({ email: e.target.value, error: '' });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="user@example.com"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Display Name *</label>
          <input
            type="text"
            value={user.displayName}
            onChange={(e) => {
              set({ displayName: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="Jane Doe"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Password *</label>
          <input
            type="password"
            value={user.password}
            onChange={(e) => {
              set({ password: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="••••••••"
          />
        </div>

        <label className="flex items-center gap-2 text-sm cursor-pointer">
          <input
            type="checkbox"
            checked={user.isAdmin}
            onChange={(e) => {
              set({ isAdmin: e.target.checked });
            }}
            className="rounded"
          />
          Admin
        </label>

        {user.error && <p className="text-xs text-destructive">{user.error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            disabled={!canSubmit || createUserMut.isPending}
            className="btn btn-ghost"
            onClick={handleSubmit}
          >
            {createUserMut.isPending ? 'Creating...' : 'Create User'}
          </button>
        </div>
      </div>
    );
  };

  const renderWorkspace = () => {
    const set = (patch: Partial<typeof workspace>) => {
      setWorkspace((w) => ({ ...w, ...patch }));
    };
    const canSubmit = !!workspace.name.trim();

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-ghost p-1 rounded">
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
          <h3 className="text-lg font-semibold">New Workspace</h3>
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Name *</label>
          <input
            type="text"
            value={workspace.name}
            onChange={(e) => {
              set({ name: e.target.value, error: '' });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="e.g. Engineering"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1">Description</label>
          <input
            type="text"
            value={workspace.description}
            onChange={(e) => {
              set({ description: e.target.value });
            }}
            className="w-full px-3 py-2 rounded border bg-background"
            placeholder="Optional description"
          />
        </div>

        {workspace.error && <p className="text-xs text-destructive">{workspace.error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            disabled={!canSubmit || createWorkspaceMut.isPending}
            className="btn btn-ghost"
            onClick={() => {
              createWorkspaceMut.mutate({
                name: workspace.name.trim(),
                description: workspace.description.trim() || undefined,
              });
            }}
          >
            {createWorkspaceMut.isPending ? 'Creating...' : 'Create Workspace'}
          </button>
        </div>
      </div>
    );
  };

  const renderMemory = () => {
    const set = (patch: Partial<typeof memory>) => {
      setMemory((m) => ({ ...m, ...patch }));
    };
    const isMemory = memory.subtype === 'memory';
    const canSubmit = isMemory
      ? !!memory.content.trim() && !!memory.source.trim()
      : !!memory.topic.trim() && !!memory.knowledgeContent.trim();
    const isPending = addMemoryMut.isPending || learnKnowledgeMut.isPending;

    const handleSubmit = () => {
      set({ error: '' });
      if (isMemory) {
        addMemoryMut.mutate({
          type: memory.memType,
          content: memory.content.trim(),
          source: memory.source.trim(),
          importance: memory.importance,
        });
      } else {
        learnKnowledgeMut.mutate({
          topic: memory.topic.trim(),
          content: memory.knowledgeContent.trim(),
        });
      }
    };

    return (
      <div className="space-y-4">
        <div className="flex items-center gap-2">
          <button onClick={goBack} className="btn-ghost p-1 rounded">
            <ChevronDown className="w-4 h-4 rotate-90" />
          </button>
          <h3 className="text-lg font-semibold">Add Memory</h3>
        </div>

        {/* Subtype switcher */}
        <div className="flex rounded-lg border overflow-hidden text-sm">
          <button
            onClick={() => {
              set({ subtype: 'memory', error: '' });
            }}
            className={`flex-1 py-2 transition-colors ${isMemory ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
          >
            Vector Memory
          </button>
          <button
            onClick={() => {
              set({ subtype: 'knowledge', error: '' });
            }}
            className={`flex-1 py-2 transition-colors ${!isMemory ? 'bg-primary text-primary-foreground' : 'hover:bg-muted/50'}`}
          >
            Knowledge Base
          </button>
        </div>

        {isMemory ? (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Memory Type</label>
              <select
                value={memory.memType}
                onChange={(e) => {
                  set({ memType: e.target.value as typeof memory.memType });
                }}
                className="w-full px-3 py-2 rounded border bg-background"
              >
                <option value="episodic">Episodic — specific events or experiences</option>
                <option value="semantic">Semantic — facts and concepts</option>
                <option value="procedural">Procedural — how-to knowledge</option>
                <option value="preference">Preference — user preferences</option>
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Content *</label>
              <textarea
                value={memory.content}
                onChange={(e) => {
                  set({ content: e.target.value, error: '' });
                }}
                className="w-full px-3 py-2 rounded border bg-background text-sm resize-none"
                rows={3}
                placeholder="The memory content to store..."
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-sm font-medium mb-1">Source *</label>
                <input
                  type="text"
                  value={memory.source}
                  onChange={(e) => {
                    set({ source: e.target.value, error: '' });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                  placeholder="e.g. user, system, chat"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">
                  Importance{' '}
                  <span className="text-muted-foreground">({memory.importance.toFixed(1)})</span>
                </label>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.1"
                  value={memory.importance}
                  onChange={(e) => {
                    set({ importance: parseFloat(e.target.value) });
                  }}
                  className="w-full mt-2"
                />
              </div>
            </div>
          </>
        ) : (
          <>
            <div>
              <label className="block text-sm font-medium mb-1">Topic *</label>
              <input
                type="text"
                value={memory.topic}
                onChange={(e) => {
                  set({ topic: e.target.value, error: '' });
                }}
                className="w-full px-3 py-2 rounded border bg-background"
                placeholder="e.g. Project Architecture, API Design"
              />
            </div>
            <div>
              <label className="block text-sm font-medium mb-1">Content *</label>
              <textarea
                value={memory.knowledgeContent}
                onChange={(e) => {
                  set({ knowledgeContent: e.target.value, error: '' });
                }}
                className="w-full px-3 py-2 rounded border bg-background text-sm resize-none"
                rows={5}
                placeholder="Markdown or plain text content to store in the knowledge base..."
              />
            </div>
          </>
        )}

        {memory.error && <p className="text-xs text-destructive">{memory.error}</p>}

        <div className="flex justify-end gap-2 pt-2">
          <button onClick={handleClose} className="btn btn-ghost">
            Cancel
          </button>
          <button
            disabled={!canSubmit || isPending}
            className="btn btn-ghost"
            onClick={handleSubmit}
          >
            {isPending ? 'Saving...' : isMemory ? 'Add to Memory' : 'Save to Knowledge Base'}
          </button>
        </div>
      </div>
    );
  };

  const renderIntent = () => {
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
          <button onClick={goBack} className="btn-ghost p-1 rounded">
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
              <button
                onClick={addBoundary}
                className="btn btn-ghost text-xs flex items-center gap-1"
              >
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
  };

  const renderContent = () => {
    switch (step) {
      case 'select':
        return renderSelect();
      case 'personality':
        return renderPersonality();
      case 'task':
        return renderTask();
      case 'skill':
        return renderSkill();
      case 'experiment':
        return renderExperiment();
      case 'sub-agent':
        return renderSubAgent();
      case 'custom-role':
        return renderCustomRole();
      case 'proactive':
        return renderProactiveTrigger();
      case 'extension':
        return renderExtension();
      case 'user':
        return renderUser();
      case 'workspace':
        return renderWorkspace();
      case 'memory':
        return renderMemory();
      case 'intent':
        return renderIntent();
    }
  };

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-end sm:items-center justify-center z-50 p-0 sm:p-4"
      onClick={handleClose}
    >
      <div
        className="bg-background border rounded-t-2xl sm:rounded-xl p-4 sm:p-6 w-full sm:max-w-xl md:max-w-2xl shadow-xl max-h-[90vh] sm:max-h-[85vh] overflow-y-auto"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        <div className="flex items-center justify-between mb-4">
          <h3 className="text-lg font-semibold">Create New</h3>
          <button onClick={handleClose} className="btn-ghost p-1 rounded">
            <X className="w-4 h-4" />
          </button>
        </div>
        {renderContent()}
      </div>
    </div>
  );
}
