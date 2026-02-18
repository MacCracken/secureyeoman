/**
 * Security Settings Page
 *
 * Displays RBAC roles with full CRUD, user-role assignments,
 * rate limiting, audit chain status, and toggleable sub-agent delegation policy.
 */

import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Shield,
  Lock,
  Clock,
  CheckCircle,
  XCircle,
  Loader2,
  Users,
  Plus,
  Pen,
  Trash2,
  UserPlus,
  Network,
  Puzzle,
  Terminal,
  Blocks,
  Sparkles,
  Image,
  FlaskConical,
  Code2,
  BookOpen,
} from 'lucide-react';
import {
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  fetchAssignments,
  assignRole,
  revokeAssignment,
  fetchAuditStats,
  fetchMetrics,
  fetchSecurityPolicy,
  updateSecurityPolicy,
  fetchMcpServers,
  fetchModelDefault,
  setModelDefault,
  clearModelDefault,
  fetchModelInfo,
} from '../api/client';
import type { RoleInfo, AssignmentInfo } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';

// ── Role Form ───────────────────────────────────────────────────────

interface RoleFormData {
  name: string;
  description: string;
  permissions: string;
  inheritFrom: string;
}

function RoleForm({
  initial,
  existingRoleIds,
  onSubmit,
  onCancel,
  isPending,
}: {
  initial?: RoleFormData;
  existingRoleIds: string[];
  onSubmit: (data: RoleFormData) => void;
  onCancel: () => void;
  isPending: boolean;
}) {
  const [form, setForm] = useState<RoleFormData>(
    initial ?? { name: '', description: '', permissions: '', inheritFrom: '' }
  );

  return (
    <div className="border rounded-md p-4 space-y-3 bg-muted/30">
      <div>
        <label className="block text-sm font-medium mb-1">Name</label>
        <input
          type="text"
          className="input w-full"
          placeholder="e.g. Custom Ops"
          value={form.name}
          onChange={(e) => {
            setForm({ ...form, name: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">Description</label>
        <input
          type="text"
          className="input w-full"
          placeholder="Optional description"
          value={form.description}
          onChange={(e) => {
            setForm({ ...form, description: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Permissions{' '}
          <span className="text-muted-foreground font-normal">
            (comma-separated resource:action)
          </span>
        </label>
        <input
          type="text"
          className="input w-full"
          placeholder="tasks:read, metrics:read, audit:read"
          value={form.permissions}
          onChange={(e) => {
            setForm({ ...form, permissions: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="block text-sm font-medium mb-1">
          Inherit From{' '}
          <span className="text-muted-foreground font-normal">
            (comma-separated role IDs, optional)
          </span>
        </label>
        <input
          type="text"
          className="input w-full"
          placeholder={existingRoleIds.slice(0, 3).join(', ')}
          value={form.inheritFrom}
          onChange={(e) => {
            setForm({ ...form, inheritFrom: e.target.value });
          }}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className="btn btn-primary text-sm"
          disabled={isPending || !form.name.trim() || !form.permissions.trim()}
          onClick={() => {
            onSubmit(form);
          }}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </button>
        <button className="btn btn-ghost text-sm" onClick={onCancel} disabled={isPending}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/** Parse "resource:action, resource:action" into Permission[]. */
function parsePermissions(raw: string): { resource: string; action: string }[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [resource, action] = s.split(':');
      return { resource: resource ?? s, action: action ?? '*' };
    });
}

function formatPerm(p: { resource: string; action: string }): string {
  return `${p.resource}:${p.action}`;
}

// ── Policy Toggle ───────────────────────────────────────────────────

function PolicyToggle({
  label,
  icon,
  enabled,
  isPending,
  onToggle,
  description,
}: {
  label: string;
  icon?: React.ReactNode;
  enabled: boolean;
  isPending: boolean;
  onToggle: () => void;
  description: string;
}) {
  return (
    <div>
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          {icon}
          {icon && <span className="text-sm font-medium">{label}</span>}
          {enabled ? (
            <>
              <CheckCircle className="w-5 h-5 text-success" />
              <span className="font-medium text-success">Allowed</span>
            </>
          ) : (
            <>
              <XCircle className="w-5 h-5 text-destructive" />
              <span className="font-medium text-destructive">Disabled</span>
            </>
          )}
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`Toggle ${label}`}
          disabled={isPending}
          onClick={onToggle}
          className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-primary focus:ring-offset-2 ${
            enabled ? 'bg-primary' : 'bg-muted'
          } ${isPending ? 'opacity-50 cursor-not-allowed' : 'cursor-pointer'}`}
        >
          {isPending ? (
            <Loader2 className="absolute left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-3 h-3 animate-spin text-white" />
          ) : (
            <span
              className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                enabled ? 'translate-x-6' : 'translate-x-1'
              }`}
            />
          )}
        </button>
      </div>
      <p className="text-sm text-muted-foreground mt-2">{description}</p>
    </div>
  );
}

// ── Main Component ──────────────────────────────────────────────────

export function SecuritySettings() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();

  // ── Queries ─────────────────────────────────────────────────────
  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['auth-roles'],
    queryFn: fetchRoles,
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['auth-assignments'],
    queryFn: fetchAssignments,
  });

  const { data: auditStats, isLoading: auditLoading } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: fetchAuditStats,
  });

  const { data: metrics } = useQuery({
    queryKey: ['metrics'],
    queryFn: fetchMetrics,
    refetchInterval: 10000,
  });

  const { data: securityPolicy } = useQuery({
    queryKey: ['security-policy'],
    queryFn: fetchSecurityPolicy,
  });

  const { data: mcpData } = useQuery({
    queryKey: ['mcpServers'],
    queryFn: fetchMcpServers,
  });

  const { data: modelDefault } = useQuery({
    queryKey: ['model-default'],
    queryFn: fetchModelDefault,
  });

  const { data: modelInfo } = useQuery({
    queryKey: ['model-info'],
    queryFn: fetchModelInfo,
  });

  // ── Mutations ───────────────────────────────────────────────────
  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: ['auth-roles'] });
  const invalidateAssignments = () =>
    queryClient.invalidateQueries({ queryKey: ['auth-assignments'] });

  const policyMutation = useMutation({
    mutationFn: updateSecurityPolicy,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['security-policy'] });
    },
  });

  const createRoleMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      permissions: { resource: string; action: string }[];
      inheritFrom?: string[];
    }) => createRole(data),
    onSuccess: () => {
      void invalidateRoles();
      setShowRoleForm(false);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        permissions?: { resource: string; action: string }[];
        inheritFrom?: string[];
      };
    }) => updateRole(id, data),
    onSuccess: () => {
      void invalidateRoles();
      setEditingRole(null);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      void invalidateRoles();
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: assignRole,
    onSuccess: () => {
      void invalidateAssignments();
      setShowAssignForm(false);
    },
  });

  const revokeAssignmentMutation = useMutation({
    mutationFn: revokeAssignment,
    onSuccess: () => {
      void invalidateAssignments();
    },
  });

  const setDefaultMutation = useMutation({
    mutationFn: setModelDefault,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-default'] });
      void queryClient.invalidateQueries({ queryKey: ['model-info'] });
    },
  });

  const clearDefaultMutation = useMutation({
    mutationFn: clearModelDefault,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['model-default'] });
    },
  });

  // ── Local state ─────────────────────────────────────────────────
  const [draftProvider, setDraftProvider] = useState('');
  const [draftModel, setDraftModel] = useState('');
  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoleInfo | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<AssignmentInfo | null>(null);

  const roles = rolesData?.roles ?? [];
  const assignments = assignmentsData?.assignments ?? [];
  const subAgentsAllowed = securityPolicy?.allowSubAgents ?? false;
  const a2aAllowed = securityPolicy?.allowA2A ?? false;
  const extensionsAllowed = securityPolicy?.allowExtensions ?? false;
  const executionAllowed = securityPolicy?.allowExecution ?? true;
  const proactiveAllowed = securityPolicy?.allowProactive ?? false;
  const multimodalAllowed = securityPolicy?.allowMultimodal ?? false;
  const experimentsAllowed = securityPolicy?.allowExperiments ?? false;
  const storybookAllowed = securityPolicy?.allowStorybook ?? false;
  const roleIds = roles.map((r) => r.id);

  const handleCreateRole = (form: RoleFormData) => {
    const permissions = parsePermissions(form.permissions);
    const inheritFrom = form.inheritFrom.trim()
      ? form.inheritFrom
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    createRoleMutation.mutate({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      permissions,
      inheritFrom,
    });
  };

  const handleUpdateRole = (form: RoleFormData) => {
    if (!editingRole) return;
    const permissions = parsePermissions(form.permissions);
    const inheritFrom = form.inheritFrom.trim()
      ? form.inheritFrom
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    updateRoleMutation.mutate({
      id: editingRole.id,
      data: {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        permissions,
        inheritFrom,
      },
    });
  };

  const MODEL_PROVIDER_LABELS: Record<string, string> = {
    anthropic: 'Anthropic',
    openai: 'OpenAI',
    gemini: 'Gemini',
    ollama: 'Ollama (Local)',
    opencode: 'OpenCode (Zen)',
    lmstudio: 'LM Studio (Local)',
    localai: 'LocalAI (Local)',
    deepseek: 'DeepSeek',
    mistral: 'Mistral',
  };

  const modelsByProvider = modelInfo?.available ?? {};
  const draftKey = draftProvider && draftModel ? `${draftProvider}::${draftModel}` : '';

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold">Security</h2>

      {/* AI Model Default */}
      <div className="card p-4 space-y-3">
        <div>
          <h3 className="font-medium text-sm">AI Model Default</h3>
          <p className="text-xs text-muted-foreground mt-1">
            Persistent model used after restart. Overrides config file.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground">Current default:</span>
          {modelDefault?.provider && modelDefault?.model ? (
            <span className="badge badge-success">
              {MODEL_PROVIDER_LABELS[modelDefault.provider] ?? modelDefault.provider} / {modelDefault.model}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-xs text-muted-foreground">
              Using config file
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-end gap-2">
          <div className="flex flex-col gap-1 flex-1 min-w-48">
            <label className="text-xs font-medium text-muted-foreground">Model</label>
            <select
              className="w-full px-2 py-1 text-sm rounded border bg-background text-foreground focus:outline-none focus:ring-2 focus:ring-primary"
              value={draftKey}
              onChange={(e) => {
                const [p, ...rest] = e.target.value.split('::');
                setDraftProvider(p ?? '');
                setDraftModel(rest.join('::'));
              }}
            >
              <option value="">Select a model…</option>
              {Object.entries(modelsByProvider).map(([provider, models]) => (
                <optgroup key={provider} label={MODEL_PROVIDER_LABELS[provider] ?? provider}>
                  {models.map((m) => (
                    <option key={`${provider}::${m.model}`} value={`${provider}::${m.model}`}>
                      {m.model}
                    </option>
                  ))}
                </optgroup>
              ))}
            </select>
          </div>
          <button
            className="btn btn-primary text-sm h-8"
            disabled={!draftProvider || !draftModel || setDefaultMutation.isPending}
            onClick={() => {
              if (draftProvider && draftModel) {
                setDefaultMutation.mutate({ provider: draftProvider, model: draftModel });
              }
            }}
          >
            {setDefaultMutation.isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Set Default'}
          </button>
          {modelDefault?.provider && modelDefault?.model && (
            <button
              className="text-xs text-destructive hover:text-destructive/80"
              disabled={clearDefaultMutation.isPending}
              onClick={() => clearDefaultMutation.mutate()}
            >
              {clearDefaultMutation.isPending ? 'Clearing…' : 'Clear'}
            </button>
          )}
        </div>
      </div>

      {/* MCP Servers */}
      <div className="card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <h3 className="font-medium text-sm flex items-center gap-2">
            <Blocks className="w-4 h-4" />
            MCP Servers
          </h3>
          <button
            className="text-xs text-primary hover:text-primary/80"
            onClick={() => navigate('/connections?tab=mcp')}
          >
            Manage
          </button>
        </div>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-xs text-muted-foreground block">Configured</span>
            <span>{(mcpData as unknown as { total?: number })?.total ?? 0} servers</span>
          </div>
          <div>
            <span className="text-xs text-muted-foreground block">Enabled</span>
            <span>
              {(mcpData as unknown as { servers?: { enabled: boolean }[] })?.servers?.filter(
                (s) => s.enabled
              ).length ?? 0}{' '}
              servers
            </span>
          </div>
        </div>
      </div>

      {/* Proactive Assistance Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Sparkles className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Proactive Assistance</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Proactive Assistance"
            enabled={proactiveAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowProactive: !proactiveAllowed });
            }}
            description={
              proactiveAllowed
                ? 'Proactive assistance is enabled. Personalities can autonomously suggest actions, reminders, and follow-ups based on their configuration.'
                : 'Proactive assistance is disabled at the security level. No personality can initiate proactive actions regardless of its configuration.'
            }
          />
        </div>
      </div>

      {/* Multimodal I/O Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Image className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Multimodal I/O</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Multimodal I/O"
            enabled={multimodalAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowMultimodal: !multimodalAllowed });
            }}
            description={
              multimodalAllowed
                ? 'Multimodal I/O is enabled. Vision analysis, speech-to-text, text-to-speech, and image generation capabilities are available.'
                : 'Multimodal I/O is disabled at the security level. No vision, audio, or image generation capabilities are active.'
            }
          />
        </div>
      </div>

      {/* Sub-Agent Delegation Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Users className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Sub-Agent Delegation</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Sub-Agent Delegation"
            enabled={subAgentsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowSubAgents: !subAgentsAllowed });
            }}
            description={
              subAgentsAllowed
                ? 'Sub-agent delegation is allowed. Individual personalities can enable or disable it via their creation config.'
                : 'Sub-agent delegation is disabled at the security level. No personality can spawn sub-agents regardless of its creation config.'
            }
          />

          {/* A2A Networks — sub-item of delegation, only visible when sub-agents enabled */}
          {subAgentsAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border">
              <PolicyToggle
                label="A2A Networks"
                icon={<Network className="w-4 h-4 text-muted-foreground" />}
                enabled={a2aAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowA2A: !a2aAllowed });
                }}
                description={
                  a2aAllowed
                    ? 'Agent-to-Agent networking is enabled. Internal A2A communication is active; external peers require Sub-Agent Delegation to be allowed.'
                    : 'A2A networking is disabled. No peer discovery, delegation, or agent-to-agent communication will occur.'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Sandbox Execution Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Terminal className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Code Execution</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Code Execution"
            enabled={executionAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowExecution: !executionAllowed });
            }}
            description={
              executionAllowed
                ? 'Sandboxed code execution is enabled. Code runs in isolated environments with secrets filtering and approval policies.'
                : 'Sandboxed code execution is disabled. No code can be executed through the execution engine.'
            }
          />
        </div>
      </div>

      {/* Developers */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Code2 className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Developers</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Lifecycle Extensions"
            icon={<Puzzle className="w-4 h-4 text-muted-foreground" />}
            enabled={extensionsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowExtensions: !extensionsAllowed });
            }}
            description={
              extensionsAllowed
                ? 'Lifecycle extension hooks are enabled. Plugins can observe, transform, or veto events across the system.'
                : 'Lifecycle extension hooks are disabled. No plugins will be loaded or executed.'
            }
          />
          <div className="border-t border-border pt-4">
            <PolicyToggle
              label="Experiments"
              icon={<FlaskConical className="w-4 h-4 text-muted-foreground" />}
              enabled={experimentsAllowed}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ allowExperiments: !experimentsAllowed });
              }}
              description={
                experimentsAllowed
                  ? 'A/B experiments are enabled. You can create, run, and manage experiments to test different configurations and behaviors.'
                  : 'A/B experiments are disabled. Enable this setting to access the Experiments page and create A/B tests. This must be explicitly enabled after initialization.'
              }
            />
          </div>
          <div className="border-t border-border pt-4">
            <PolicyToggle
              label="Storybook"
              icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}
              enabled={storybookAllowed}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ allowStorybook: !storybookAllowed });
              }}
              description={
                storybookAllowed
                  ? 'Storybook component development environment is enabled. Access the component gallery from the Developers section.'
                  : 'Storybook is disabled. Enable this setting to access the component development environment in the Developers section.'
              }
            />
          </div>
        </div>
      </div>
    </div>
  );
}

export function RolesSettings() {
  const queryClient = useQueryClient();

  const { data: rolesData, isLoading: rolesLoading } = useQuery({
    queryKey: ['auth-roles'],
    queryFn: fetchRoles,
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['auth-assignments'],
    queryFn: fetchAssignments,
  });

  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: ['auth-roles'] });
  const invalidateAssignments = () =>
    queryClient.invalidateQueries({ queryKey: ['auth-assignments'] });

  const createRoleMutation = useMutation({
    mutationFn: (data: {
      name: string;
      description?: string;
      permissions: { resource: string; action: string }[];
      inheritFrom?: string[];
    }) => createRole(data),
    onSuccess: () => {
      void invalidateRoles();
      setShowRoleForm(false);
    },
  });

  const updateRoleMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: {
        name?: string;
        description?: string;
        permissions?: { resource: string; action: string }[];
        inheritFrom?: string[];
      };
    }) => updateRole(id, data),
    onSuccess: () => {
      void invalidateRoles();
      setEditingRole(null);
    },
  });

  const deleteRoleMutation = useMutation({
    mutationFn: deleteRole,
    onSuccess: () => {
      void invalidateRoles();
    },
  });

  const assignRoleMutation = useMutation({
    mutationFn: assignRole,
    onSuccess: () => {
      void invalidateAssignments();
      setShowAssignForm(false);
    },
  });

  const revokeAssignmentMutation = useMutation({
    mutationFn: revokeAssignment,
    onSuccess: () => {
      void invalidateAssignments();
    },
  });

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoleInfo | null>(null);
  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<AssignmentInfo | null>(null);

  const roles = rolesData?.roles ?? [];
  const assignments = assignmentsData?.assignments ?? [];
  const roleIds = roles.map((r) => r.id);

  const handleCreateRole = (form: RoleFormData) => {
    const permissions = parsePermissions(form.permissions);
    const inheritFrom = form.inheritFrom.trim()
      ? form.inheritFrom
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    createRoleMutation.mutate({
      name: form.name.trim(),
      description: form.description.trim() || undefined,
      permissions,
      inheritFrom,
    });
  };

  const handleUpdateRole = (form: RoleFormData) => {
    if (!editingRole) return;
    const permissions = parsePermissions(form.permissions);
    const inheritFrom = form.inheritFrom.trim()
      ? form.inheritFrom
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean)
      : undefined;
    updateRoleMutation.mutate({
      id: editingRole.id,
      data: {
        name: form.name.trim(),
        description: form.description.trim() || undefined,
        permissions,
        inheritFrom,
      },
    });
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Shield className="w-5 h-5 text-primary" />
            <h3 className="font-medium">Roles & Permissions</h3>
          </div>
          {!showRoleForm && !editingRole && (
            <button
              className="btn btn-ghost text-sm flex items-center gap-1"
              onClick={() => {
                setShowRoleForm(true);
              }}
            >
              <Plus className="w-4 h-4" /> Add Custom Role
            </button>
          )}
        </div>
        <div className="p-4 space-y-3">
          {showRoleForm && (
            <RoleForm
              existingRoleIds={roleIds}
              onSubmit={handleCreateRole}
              onCancel={() => {
                setShowRoleForm(false);
              }}
              isPending={createRoleMutation.isPending}
            />
          )}

          {rolesLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading roles...
            </div>
          ) : roles.length === 0 ? (
            <p className="text-sm text-muted-foreground">No roles configured.</p>
          ) : (
            roles.map((role) =>
              editingRole?.id === role.id ? (
                <RoleForm
                  key={role.id}
                  initial={{
                    name: role.name,
                    description: role.description ?? '',
                    permissions: role.permissions.map(formatPerm).join(', '),
                    inheritFrom: (role.inheritFrom ?? []).join(', '),
                  }}
                  existingRoleIds={roleIds}
                  onSubmit={handleUpdateRole}
                  onCancel={() => {
                    setEditingRole(null);
                  }}
                  isPending={updateRoleMutation.isPending}
                />
              ) : (
                <div key={role.id} className="border rounded-md p-3">
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center gap-2">
                      <Lock className="w-4 h-4 text-muted-foreground" />
                      <span className="font-medium">{role.name}</span>
                      {role.isBuiltin && (
                        <span className="text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">
                          Built-in
                        </span>
                      )}
                    </div>
                    {!role.isBuiltin && (
                      <div className="flex items-center gap-1">
                        <button
                          className="btn btn-ghost p-1"
                          title="Edit role"
                          onClick={() => {
                            setEditingRole(role);
                          }}
                        >
                          <Pen className="w-4 h-4" />
                        </button>
                        <button
                          className="btn btn-ghost p-1 text-destructive"
                          title="Delete role"
                          onClick={() => {
                            setConfirmDelete(role);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    )}
                  </div>
                  {role.description && (
                    <p className="text-sm text-muted-foreground mb-2">{role.description}</p>
                  )}
                  <div className="flex flex-wrap gap-1">
                    {role.permissions.map((perm) => (
                      <span key={formatPerm(perm)} className="text-xs bg-muted px-2 py-0.5 rounded">
                        {formatPerm(perm)}
                      </span>
                    ))}
                    {role.permissions.length === 0 && (
                      <span className="text-xs text-muted-foreground">No permissions</span>
                    )}
                  </div>
                </div>
              )
            )
          )}
        </div>
      </div>

      <div className="card">
        <div className="p-4 border-b flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserPlus className="w-5 h-5 text-primary" />
            <h3 className="font-medium">User Role Assignments</h3>
          </div>
          {!showAssignForm && (
            <button
              className="btn btn-ghost text-sm flex items-center gap-1"
              onClick={() => {
                setShowAssignForm(true);
              }}
            >
              <Plus className="w-4 h-4" /> Assign Role
            </button>
          )}
        </div>
        <div className="p-4 space-y-3">
          {showAssignForm && (
            <div className="border rounded-md p-4 space-y-3 bg-muted/30">
              <div>
                <label className="block text-sm font-medium mb-1">User ID</label>
                <input
                  type="text"
                  className="input w-full"
                  placeholder="e.g. admin"
                  value={assignUserId}
                  onChange={(e) => {
                    setAssignUserId(e.target.value);
                  }}
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Role</label>
                <select
                  className="input w-full"
                  value={assignRoleId}
                  onChange={(e) => {
                    setAssignRoleId(e.target.value);
                  }}
                >
                  <option value="">Select a role...</option>
                  {roles.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex gap-2 pt-1">
                <button
                  className="btn btn-primary text-sm"
                  disabled={assignRoleMutation.isPending || !assignUserId.trim() || !assignRoleId}
                  onClick={() => {
                    assignRoleMutation.mutate({
                      userId: assignUserId.trim(),
                      roleId: assignRoleId,
                    });
                  }}
                >
                  {assignRoleMutation.isPending ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    'Assign'
                  )}
                </button>
                <button
                  className="btn btn-ghost text-sm"
                  onClick={() => {
                    setShowAssignForm(false);
                    setAssignUserId('');
                    setAssignRoleId('');
                  }}
                  disabled={assignRoleMutation.isPending}
                >
                  Cancel
                </button>
              </div>
            </div>
          )}

          {assignmentsLoading ? (
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <Loader2 className="w-4 h-4 animate-spin" /> Loading assignments...
            </div>
          ) : assignments.length === 0 ? (
            <p className="text-sm text-muted-foreground">No active user role assignments.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 pr-4 font-medium">User</th>
                  <th className="text-left py-2 pr-4 font-medium">Role</th>
                  <th className="text-right py-2 font-medium">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((a) => {
                  const roleName = roles.find((r) => r.id === a.roleId)?.name ?? a.roleId;
                  return (
                    <tr key={a.userId} className="border-b last:border-0">
                      <td className="py-2 pr-4">{a.userId}</td>
                      <td className="py-2 pr-4">{roleName}</td>
                      <td className="py-2 text-right">
                        <button
                          className="btn btn-ghost p-1 text-destructive text-xs"
                          title="Revoke assignment"
                          onClick={() => {
                            setConfirmRevoke(a);
                          }}
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <ConfirmDialog
        open={!!confirmDelete}
        title="Delete Role"
        message={`Are you sure you want to delete the role "${confirmDelete?.name}"? This cannot be undone.`}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (confirmDelete) {
            deleteRoleMutation.mutate(confirmDelete.id);
          }
          setConfirmDelete(null);
        }}
        onCancel={() => {
          setConfirmDelete(null);
        }}
      />

      <ConfirmDialog
        open={!!confirmRevoke}
        title="Revoke Assignment"
        message={`Revoke role assignment for user "${confirmRevoke?.userId}"?`}
        confirmLabel="Revoke"
        destructive
        onConfirm={() => {
          if (confirmRevoke) {
            revokeAssignmentMutation.mutate(confirmRevoke.userId);
          }
          setConfirmRevoke(null);
        }}
        onCancel={() => {
          setConfirmRevoke(null);
        }}
      />
    </div>
  );
}
