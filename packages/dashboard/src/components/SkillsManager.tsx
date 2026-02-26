import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Wrench,
  Plus,
  Edit2,
  Trash2,
  ToggleLeft,
  ToggleRight,
  ThumbsUp,
  ThumbsDown,
  Filter,
} from 'lucide-react';
import {
  fetchSkills,
  createSkill,
  updateSkill,
  deleteSkill,
  enableSkill,
  disableSkill,
  approveSkill,
  rejectSkill,
} from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import type { Skill, SkillCreate } from '../types';

function formatDate(ts: number): string {
  return new Date(ts).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });
}

const SOURCE_LABELS: Record<string, string> = {
  user: 'User',
  ai_proposed: 'AI Proposed',
  ai_learned: 'AI Learned',
  marketplace: 'Marketplace',
};

const STATUS_BADGES: Record<string, string> = {
  active: 'badge-success',
  pending_approval: 'badge-warning',
  disabled: 'badge-error',
};

export function SkillsManager() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [editing, setEditing] = useState<string | null>(null);
  const [filterStatus, setFilterStatus] = useState<string>('');
  const [filterSource, setFilterSource] = useState<string>('');
  const [deleteTarget, setDeleteTarget] = useState<Skill | null>(null);
  const [saveWarnings, setSaveWarnings] = useState<string[]>([]);
  const [escalationWarning, setEscalationWarning] = useState<string | null>(null);
  const [form, setForm] = useState<SkillCreate>({
    name: '',
    description: '',
    instructions: '',
    triggerPatterns: [],
    enabled: true,
    source: 'user',
    useWhen: '',
    doNotUseWhen: '',
    successCriteria: '',
    mcpToolsAllowed: [],
    routing: 'fuzzy',
    linkedWorkflowId: null,
    autonomyLevel: 'L1',
    emergencyStopProcedure: '',
  });
  const [triggerInput, setTriggerInput] = useState('');
  const [mcpToolsInput, setMcpToolsInput] = useState('');

  const { data, isLoading } = useQuery({
    queryKey: ['skills', filterStatus, filterSource],
    queryFn: () =>
      fetchSkills({
        status: filterStatus || undefined,
        source: filterSource || undefined,
      }),
  });

  const skills = data?.skills ?? [];
  const pendingCount = skills.filter((s) => s.status === 'pending_approval').length;

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['skills'] });

  const createMut = useMutation({
    mutationFn: (d: SkillCreate) => createSkill(d),
    onSuccess: (res) => {
      invalidate();
      setEditing(null);
      const allWarnings = (res as { warnings?: string[] }).warnings ?? [];
      const escalation = allWarnings.find((w) => w.includes('Autonomy escalated'));
      setSaveWarnings(allWarnings.filter((w) => !w.includes('Autonomy escalated')));
      if (escalation) setEscalationWarning(escalation);
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, d }: { id: string; d: Partial<SkillCreate> }) => updateSkill(id, d),
    onSuccess: (res) => {
      invalidate();
      setEditing(null);
      const allWarnings = (res as { warnings?: string[] }).warnings ?? [];
      const escalation = allWarnings.find((w) => w.includes('Autonomy escalated'));
      setSaveWarnings(allWarnings.filter((w) => !w.includes('Autonomy escalated')));
      if (escalation) setEscalationWarning(escalation);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteSkill(id),
    onSuccess: invalidate,
  });

  const enableMut = useMutation({
    mutationFn: (id: string) => enableSkill(id),
    onSuccess: invalidate,
  });
  const disableMut = useMutation({
    mutationFn: (id: string) => disableSkill(id),
    onSuccess: invalidate,
  });
  const approveMut = useMutation({
    mutationFn: (id: string) => approveSkill(id),
    onSuccess: invalidate,
  });
  const rejectMut = useMutation({
    mutationFn: (id: string) => rejectSkill(id),
    onSuccess: invalidate,
  });

  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      const pName = searchParams.get('name') || '';
      const pDescription = searchParams.get('description') || '';
      const pTrigger = searchParams.get('trigger') || '';
      const pAction = searchParams.get('action') || '';
      setForm({
        name: pName,
        description: pDescription,
        instructions: pAction,
        triggerPatterns: pTrigger ? pTrigger.split(',').map((t) => t.trim()) : [],
        enabled: true,
        source: 'user',
        useWhen: '',
        doNotUseWhen: '',
        successCriteria: '',
        mcpToolsAllowed: [],
        routing: 'fuzzy',
        linkedWorkflowId: null,
      });
      setTriggerInput(pTrigger);
      setEditing('new');
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams]);

  const startEdit = (s: Skill) => {
    setForm({
      name: s.name,
      description: s.description,
      instructions: s.instructions,
      triggerPatterns: s.triggerPatterns,
      enabled: s.enabled,
      source: s.source,
      useWhen: s.useWhen ?? '',
      doNotUseWhen: s.doNotUseWhen ?? '',
      successCriteria: s.successCriteria ?? '',
      mcpToolsAllowed: s.mcpToolsAllowed ?? [],
      routing: s.routing ?? 'fuzzy',
      linkedWorkflowId: s.linkedWorkflowId ?? null,
      autonomyLevel: s.autonomyLevel ?? 'L1',
      emergencyStopProcedure: s.emergencyStopProcedure ?? '',
    });
    setTriggerInput(s.triggerPatterns.join(', '));
    setMcpToolsInput((s.mcpToolsAllowed ?? []).join(', '));
    setSaveWarnings([]);
    setEscalationWarning(null);
    setEditing(s.id);
  };

  const startCreate = () => {
    setForm({
      name: '',
      description: '',
      instructions: '',
      triggerPatterns: [],
      enabled: true,
      source: 'user',
      useWhen: '',
      doNotUseWhen: '',
      successCriteria: '',
      mcpToolsAllowed: [],
      routing: 'fuzzy',
      linkedWorkflowId: null,
    });
    setTriggerInput('');
    setMcpToolsInput('');
    setSaveWarnings([]);
    setEditing('new');
  };

  const handleSave = () => {
    const patterns = triggerInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const mcpTools = mcpToolsInput
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    const data = { ...form, triggerPatterns: patterns, mcpToolsAllowed: mcpTools };
    if (editing === 'new') {
      createMut.mutate(data);
    } else if (editing) {
      updateMut.mutate({ id: editing, d: data });
    }
  };

  const handleConfirmDelete = useCallback(() => {
    if (deleteTarget) {
      deleteMut.mutate(deleteTarget.id);
      setDeleteTarget(null);
    }
  }, [deleteTarget, deleteMut]);

  return (
    <div className="space-y-6">
      {/* Delete confirmation */}
      <ConfirmDialog
        open={!!deleteTarget}
        title="Delete Skill"
        message={`Are you sure you want to delete "${deleteTarget?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={handleConfirmDelete}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      {/* Escalation warning modal */}
      <ConfirmDialog
        open={!!escalationWarning}
        title="Autonomy Level Escalated"
        message={escalationWarning ?? ''}
        confirmLabel="Understood"
        onConfirm={() => setEscalationWarning(null)}
        onCancel={() => setEscalationWarning(null)}
      />

      {/* Credential warning banner */}
      {saveWarnings.length > 0 && (
        <div className="alert alert-warning flex items-start gap-2">
          <span className="text-lg">⚠</span>
          <div>
            <p className="font-medium">Possible credential detected in skill instructions:</p>
            <ul className="mt-1 text-sm list-disc list-inside">
              {saveWarnings.map((w, i) => (
                <li key={i}>{w}</li>
              ))}
            </ul>
            <p className="text-xs mt-1 text-muted-foreground">Use <code>$VAR_NAME</code> references instead of literal credentials.</p>
          </div>
          <button
            className="ml-auto btn-ghost p-1 text-sm"
            onClick={() => { setSaveWarnings([]); }}
            aria-label="Dismiss warning"
          >
            ✕
          </button>
        </div>
      )}

      {/* Header + Filters */}
      <div className="flex items-center justify-between flex-wrap gap-4">
        <div className="flex items-center gap-4">
          <h2 className="text-lg font-semibold">Skills</h2>
          {pendingCount > 0 && (
            <span className="badge badge-warning">{pendingCount} pending approval</span>
          )}
        </div>
        <button onClick={startCreate} className="btn btn-ghost flex items-center gap-1">
          <Plus className="w-4 h-4" /> New Skill
        </button>
      </div>

      {/* Filters */}
      <div className="flex items-center gap-3 flex-wrap">
        <Filter className="w-4 h-4 text-muted-foreground" />
        <select
          value={filterStatus}
          onChange={(e) => {
            setFilterStatus(e.target.value);
          }}
          className="px-2 py-1 rounded border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by status"
        >
          <option value="">All statuses</option>
          <option value="active">Active</option>
          <option value="pending_approval">Pending Approval</option>
          <option value="disabled">Disabled</option>
        </select>
        <select
          value={filterSource}
          onChange={(e) => {
            setFilterSource(e.target.value);
          }}
          className="px-2 py-1 rounded border bg-background text-foreground text-sm focus:outline-none focus:ring-2 focus:ring-primary"
          aria-label="Filter by source"
        >
          <option value="">All sources</option>
          <option value="user">User</option>
          <option value="ai_proposed">AI Proposed</option>
          <option value="ai_learned">AI Learned</option>
          <option value="marketplace">Marketplace</option>
        </select>
      </div>

      {isLoading && <p className="text-muted-foreground text-sm">Loading...</p>}

      {/* Editor Form */}
      {editing && (
        <div className="card p-4 space-y-4 border-primary">
          <h3 className="font-medium">{editing === 'new' ? 'Create Skill' : 'Edit Skill'}</h3>

          <div>
            <label className="block text-sm font-medium mb-1">Name</label>
            <input
              type="text"
              value={form.name}
              onChange={(e) => {
                setForm((f) => ({ ...f, name: e.target.value }));
              }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={100}
              placeholder="e.g., Code Review"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Description</label>
            <input
              type="text"
              value={form.description}
              onChange={(e) => {
                setForm((f) => ({ ...f, description: e.target.value }));
              }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={1000}
              placeholder="What this skill does"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Instructions</label>
            <textarea
              value={form.instructions}
              onChange={(e) => {
                setForm((f) => ({ ...f, instructions: e.target.value }));
              }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
              rows={4}
              maxLength={8000}
              placeholder="Detailed instructions for the AI when this skill is active..."
            />
            <p className="text-xs text-muted-foreground mt-1">
              {(form.instructions?.length ?? 0).toLocaleString()} / 8,000 chars
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Trigger Patterns</label>
            <input
              type="text"
              value={triggerInput}
              onChange={(e) => {
                setTriggerInput(e.target.value);
              }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Comma-separated patterns, e.g., review code, check PR, analyze diff"
            />
            <p className="text-xs text-muted-foreground mt-1">
              Patterns that activate this skill when matched in user input.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Use When</label>
            <input
              type="text"
              value={form.useWhen ?? ''}
              onChange={(e) => { setForm((f) => ({ ...f, useWhen: e.target.value })); }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={500}
              placeholder="e.g. user asks to review code, analyze a diff"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Don't Use When</label>
            <input
              type="text"
              value={form.doNotUseWhen ?? ''}
              onChange={(e) => { setForm((f) => ({ ...f, doNotUseWhen: e.target.value })); }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={500}
              placeholder="e.g. the task is not code-related"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Success Criteria</label>
            <input
              type="text"
              value={form.successCriteria ?? ''}
              onChange={(e) => { setForm((f) => ({ ...f, successCriteria: e.target.value })); }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              maxLength={300}
              placeholder="e.g. PR summary generated and key risks identified"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Routing Mode</label>
            <select
              value={form.routing ?? 'fuzzy'}
              onChange={(e) => { setForm((f) => ({ ...f, routing: e.target.value as 'fuzzy' | 'explicit' })); }}
              className="px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="fuzzy">Fuzzy (default)</option>
              <option value="explicit">Explicit (deterministic — for SOPs)</option>
            </select>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">MCP Tools Allowed</label>
            <input
              type="text"
              value={mcpToolsInput}
              onChange={(e) => { setMcpToolsInput(e.target.value); }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Comma-separated tool names, e.g., read_file, web_search (empty = all allowed)"
            />
            <p className="text-xs text-muted-foreground mt-1">
              When non-empty, only these MCP tools are available while this skill is active.
            </p>
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Linked Workflow ID</label>
            <input
              type="text"
              value={form.linkedWorkflowId ?? ''}
              onChange={(e) => { setForm((f) => ({ ...f, linkedWorkflowId: e.target.value || null })); }}
              className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              placeholder="Workflow ID to trigger when this skill activates (optional)"
            />
          </div>

          <div>
            <label className="block text-sm font-medium mb-1">Autonomy Level</label>
            <select
              value={form.autonomyLevel ?? 'L1'}
              onChange={(e) => { setForm((f) => ({ ...f, autonomyLevel: e.target.value as any })); }}
              className="px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
            >
              <option value="L1">L1 — Human does (AI assists only)</option>
              <option value="L2">L2 — Collaborative (AI proposes, human decides)</option>
              <option value="L3">L3 — Supervised (AI acts, human reviews)</option>
              <option value="L4">L4 — Delegated (AI acts, human audits periodically)</option>
              <option value="L5">L5 — Fully autonomous (notifications only)</option>
            </select>
            <p className="text-xs text-muted-foreground mt-1">
              Governance classification for audit purposes. Does not affect runtime behavior.
            </p>
          </div>

          {(form.autonomyLevel === 'L4' || form.autonomyLevel === 'L5') && (
            <div>
              <label className="block text-sm font-medium mb-1">Emergency Stop Procedure</label>
              <textarea
                value={form.emergencyStopProcedure ?? ''}
                onChange={(e) => { setForm((f) => ({ ...f, emergencyStopProcedure: e.target.value })); }}
                className="w-full px-3 py-2 rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary resize-y"
                rows={2}
                maxLength={1000}
                placeholder="How to disable this skill in an emergency (required for L4/L5)"
              />
            </div>
          )}

          <div className="flex gap-2 justify-end">
            <button
              onClick={() => {
                setEditing(null);
              }}
              className="btn btn-ghost"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!form.name?.trim() || createMut.isPending || updateMut.isPending}
              className="btn btn-ghost"
            >
              {createMut.isPending || updateMut.isPending ? 'Saving...' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* Skills List */}
      <div className="space-y-3">
        {skills.map((s) => (
          <div key={s.id} className="card p-4">
            <div className="flex items-start justify-between">
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <Wrench className="w-4 h-4 text-muted-foreground flex-shrink-0" />
                  <h3 className="font-medium">{s.name}</h3>
                  <span
                    className={`badge ${s.enabled ? (STATUS_BADGES[s.status] ?? 'badge-info') : 'badge-error'}`}
                  >
                    {s.enabled ? s.status.replace('_', ' ') : 'disabled'}
                  </span>
                </div>
                <p className="text-xs text-muted-foreground mt-1">
                  {SOURCE_LABELS[s.source] ?? s.source}
                </p>
                {s.description && (
                  <p className="text-sm text-muted-foreground mt-1">{s.description}</p>
                )}
                {s.triggerPatterns.length > 0 && (
                  <div className="flex gap-1 mt-2 flex-wrap">
                    {s.triggerPatterns.map((p, i) => (
                      <span key={i} className="text-xs bg-muted px-2 py-0.5 rounded">
                        {p}
                      </span>
                    ))}
                  </div>
                )}
                <div className="flex gap-4 mt-2 text-xs text-muted-foreground flex-wrap">
                  <span>Used {s.usageCount} times</span>
                  {(s.invokedCount ?? 0) > 0 && (
                    <span>
                      Routing precision:{' '}
                      {Math.round((s.usageCount / (s.invokedCount ?? 1)) * 100)}%
                    </span>
                  )}
                  {s.lastUsedAt && <span>Last: {formatDate(s.lastUsedAt)}</span>}
                  <span>Created {formatDate(s.createdAt)}</span>
                </div>
              </div>

              <div className="flex items-center gap-1 ml-4 flex-shrink-0">
                {/* Approve/Reject for pending */}
                {s.status === 'pending_approval' && (
                  <>
                    <button
                      onClick={() => {
                        approveMut.mutate(s.id);
                      }}
                      className="btn-ghost p-2 text-success hover:bg-success/10"
                      aria-label={`Approve skill ${s.name}`}
                    >
                      <ThumbsUp className="w-4 h-4" />
                    </button>
                    <button
                      onClick={() => {
                        rejectMut.mutate(s.id);
                      }}
                      className="btn-ghost p-2 text-destructive hover:bg-destructive/10"
                      aria-label={`Reject skill ${s.name}`}
                    >
                      <ThumbsDown className="w-4 h-4" />
                    </button>
                  </>
                )}

                {/* Enable/Disable toggle */}
                {s.status !== 'pending_approval' && (
                  <button
                    onClick={() => {
                      if (s.enabled) {
                        disableMut.mutate(s.id);
                      } else {
                        enableMut.mutate(s.id);
                      }
                    }}
                    className={`btn-ghost p-2 ${s.enabled ? 'text-success' : 'text-muted-foreground'}`}
                    aria-label={s.enabled ? `Disable skill ${s.name}` : `Enable skill ${s.name}`}
                  >
                    {s.enabled ? (
                      <ToggleRight className="w-5 h-5" />
                    ) : (
                      <ToggleLeft className="w-5 h-5" />
                    )}
                  </button>
                )}

                <button
                  onClick={() => {
                    startEdit(s);
                  }}
                  className="btn-ghost p-2 text-muted-foreground hover:text-foreground"
                  aria-label={`Edit skill ${s.name}`}
                >
                  <Edit2 className="w-4 h-4" />
                </button>
                <button
                  onClick={() => {
                    setDeleteTarget(s);
                  }}
                  className="btn-ghost p-2 text-muted-foreground hover:text-destructive"
                  aria-label={`Delete skill ${s.name}`}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        ))}

        {!isLoading && skills.length === 0 && (
          <p className="text-center text-muted-foreground py-8">
            No skills found. Create one or adjust filters.
          </p>
        )}
      </div>
    </div>
  );
}
