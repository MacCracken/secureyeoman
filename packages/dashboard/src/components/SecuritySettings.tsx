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
  Layers,
  Puzzle,
  Terminal,
  Blocks,
  Sparkles,
  Image,
  FlaskConical,
  Code2,
  BookOpen,
  Wrench,
  Brain,
  Cpu,
  GitMerge,
  GitBranch,
  Monitor,
  Camera,
  Globe,
  Target,
  Code,
  LayoutPanelLeft,
  Key,
  Search,
  ChevronDown,
  ChevronRight,
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
  fetchAgentConfig,
  updateAgentConfig,
  fetchMcpServers,
  fetchModelDefault,
  setModelDefault,
  clearModelDefault,
  fetchModelInfo,
  fetchSecretKeys,
  setSecret,
  deleteSecret,
  checkSecret,
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
    <div className="p-3 rounded-lg bg-muted/30 space-y-3">
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Name</label>
        <input
          type="text"
          className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="e.g. Custom Ops"
          value={form.name}
          onChange={(e) => {
            setForm({ ...form, name: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">Description</label>
        <input
          type="text"
          className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="Optional description"
          value={form.description}
          onChange={(e) => {
            setForm({ ...form, description: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Permissions <span className="font-normal">(comma-separated resource:action)</span>
        </label>
        <input
          type="text"
          className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder="tasks:read, metrics:read, audit:read"
          value={form.permissions}
          onChange={(e) => {
            setForm({ ...form, permissions: e.target.value });
          }}
        />
      </div>
      <div>
        <label className="text-xs text-muted-foreground block mb-1">
          Inherit From <span className="font-normal">(comma-separated role IDs, optional)</span>
        </label>
        <input
          type="text"
          className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
          placeholder={existingRoleIds.slice(0, 3).join(', ')}
          value={form.inheritFrom}
          onChange={(e) => {
            setForm({ ...form, inheritFrom: e.target.value });
          }}
        />
      </div>
      <div className="flex gap-2 pt-1">
        <button
          className="btn btn-ghost text-sm px-3 py-1"
          disabled={isPending || !form.name.trim() || !form.permissions.trim()}
          onClick={() => {
            onSubmit(form);
          }}
        >
          {isPending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Save'}
        </button>
        <button className="btn btn-ghost text-sm px-3 py-1" onClick={onCancel} disabled={isPending}>
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

  // ── Collapse states ───────────────────────────────────────────────
  const [promptSecurityOpen, setPromptSecurityOpen] = useState(false);
  const [contentGuardrailsOpen, setContentGuardrailsOpen] = useState(false);

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

  const { data: agentConfigData } = useQuery({
    queryKey: ['agentConfig'],
    queryFn: fetchAgentConfig,
    staleTime: 10000,
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
      void queryClient.invalidateQueries({ queryKey: ['agentConfig'] });
    },
  });

  const agentConfigMutation = useMutation({
    mutationFn: updateAgentConfig,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['agentConfig'] });
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
  const delegationEnabled = (agentConfigData?.config?.enabled as boolean | undefined) ?? false;
  const a2aAllowed = securityPolicy?.allowA2A ?? false;
  const swarmsAllowed = securityPolicy?.allowSwarms ?? false;
  const extensionsAllowed = securityPolicy?.allowExtensions ?? false;
  const executionAllowed = securityPolicy?.allowExecution ?? true;
  const proactiveAllowed = securityPolicy?.allowProactive ?? false;
  const workflowsAllowed = securityPolicy?.allowWorkflows ?? false;
  const communityGitFetchAllowed = securityPolicy?.allowCommunityGitFetch ?? false;
  const multimodalAllowed = securityPolicy?.allowMultimodal ?? false;
  const desktopControlAllowed = securityPolicy?.allowDesktopControl ?? false;
  const cameraAllowed = securityPolicy?.allowCamera ?? false;
  const networkToolsAllowed = securityPolicy?.allowNetworkTools ?? false;
  const twingateAllowed = securityPolicy?.allowTwingate ?? false;
  const experimentsAllowed = securityPolicy?.allowExperiments ?? false;
  const storybookAllowed = securityPolicy?.allowStorybook ?? false;
  const orgIntentAllowed = securityPolicy?.allowOrgIntent ?? false;
  const intentAllowed = securityPolicy?.allowIntent ?? false;
  const intentEditorAllowed = securityPolicy?.allowIntentEditor ?? false;
  const knowledgeBaseAllowed = securityPolicy?.allowKnowledgeBase ?? false;
  const codeEditorAllowed = securityPolicy?.allowCodeEditor ?? false;
  const advancedEditorAllowed = securityPolicy?.allowAdvancedEditor ?? false;
  const dtcAllowed = securityPolicy?.allowDynamicTools ?? false;
  const sandboxDtcAllowed = securityPolicy?.sandboxDynamicTools ?? true;
  const anomalyDetectionAllowed = securityPolicy?.allowAnomalyDetection ?? false;
  const promptGuardMode = securityPolicy?.promptGuardMode ?? 'block';
  const responseGuardMode = securityPolicy?.responseGuardMode ?? 'block';
  const jailbreakThreshold = securityPolicy?.jailbreakThreshold ?? 0.5;
  const jailbreakAction = securityPolicy?.jailbreakAction ?? 'block';
  const strictSystemPromptConf = securityPolicy?.strictSystemPromptConfidentiality ?? false;
  const abuseDetectionEnabled = securityPolicy?.abuseDetectionEnabled ?? true;
  const cgEnabled = securityPolicy?.contentGuardrailsEnabled ?? true;
  const cgPiiMode = securityPolicy?.contentGuardrailsPiiMode ?? 'redact';
  const cgToxicityEnabled = securityPolicy?.contentGuardrailsToxicityEnabled ?? true;
  const cgToxicityMode = securityPolicy?.contentGuardrailsToxicityMode ?? 'block';
  const cgToxicityUrl = securityPolicy?.contentGuardrailsToxicityClassifierUrl ?? '';
  const cgToxicityThreshold = securityPolicy?.contentGuardrailsToxicityThreshold ?? 0.7;
  const cgBlockList = securityPolicy?.contentGuardrailsBlockList ?? [];
  const cgBlockedTopics = securityPolicy?.contentGuardrailsBlockedTopics ?? [];
  const cgGroundingEnabled = securityPolicy?.contentGuardrailsGroundingEnabled ?? true;
  const cgGroundingMode = securityPolicy?.contentGuardrailsGroundingMode ?? 'block';
  const gvisorAllowed = securityPolicy?.sandboxGvisor ?? false;
  const wasmAllowed = securityPolicy?.sandboxWasm ?? false;
  const credentialProxyAllowed = securityPolicy?.sandboxCredentialProxy ?? false;
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
              {MODEL_PROVIDER_LABELS[modelDefault.provider] ?? modelDefault.provider} /{' '}
              {modelDefault.model}
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
            className="btn btn-ghost text-sm h-8"
            disabled={!draftProvider || !draftModel || setDefaultMutation.isPending}
            onClick={() => {
              if (draftProvider && draftModel) {
                setDefaultMutation.mutate({ provider: draftProvider, model: draftModel });
              }
            }}
          >
            {setDefaultMutation.isPending ? (
              <Loader2 className="w-4 h-4 animate-spin" />
            ) : (
              'Set Default'
            )}
          </button>
          {modelDefault?.provider && modelDefault?.model && (
            <button
              className="text-xs text-destructive hover:text-destructive/80"
              disabled={clearDefaultMutation.isPending}
              onClick={() => {
                clearDefaultMutation.mutate();
              }}
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

      {/* ML Security */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-medium">ML Security</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Anomaly Detection"
            icon={<Brain className="w-4 h-4 text-muted-foreground" />}
            enabled={anomalyDetectionAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowAnomalyDetection: !anomalyDetectionAllowed });
            }}
            description="Use machine learning to detect unusual patterns in agent behavior, API calls, and security events. Disabled by default."
          />
        </div>
      </div>

      {/* Prompt Security */}
      <div className="card">
        <button
          type="button"
          onClick={() => {
            setPromptSecurityOpen(!promptSecurityOpen);
          }}
          className="w-full p-4 border-b flex items-center gap-2 text-left"
        >
          {promptSecurityOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Prompt Security</h3>
        </button>
        {promptSecurityOpen && (
          <div className="p-4 space-y-5">
            {/* Prompt Guard mode */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Prompt Guard Mode</label>
              <p className="text-xs text-muted-foreground mb-2">
                Scans assembled prompts before the LLM call for indirect injection attempts.
              </p>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={promptGuardMode}
                onChange={(e) => {
                  policyMutation.mutate({
                    promptGuardMode: e.target.value as 'block' | 'warn' | 'disabled',
                  });
                }}
                disabled={policyMutation.isPending}
              >
                <option value="block">Block — reject request on high-severity finding</option>
                <option value="warn">Warn — log and allow (default)</option>
                <option value="disabled">Disabled — skip scanning</option>
              </select>
            </div>

            {/* Response Guard mode */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Response Guard Mode</label>
              <p className="text-xs text-muted-foreground mb-2">
                Scans LLM responses for output-side injection, role confusion, and exfiltration
                patterns.
              </p>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={responseGuardMode}
                onChange={(e) => {
                  policyMutation.mutate({
                    responseGuardMode: e.target.value as 'block' | 'warn' | 'disabled',
                  });
                }}
                disabled={policyMutation.isPending}
              >
                <option value="block">Block — reject response on high-severity finding</option>
                <option value="warn">Warn — log and allow (default)</option>
                <option value="disabled">Disabled — skip scanning</option>
              </select>
            </div>

            {/* Jailbreak threshold */}
            <div className="space-y-1">
              <label className="text-sm font-medium flex items-center justify-between">
                <span>Jailbreak Score Threshold</span>
                <span className="font-mono text-xs text-muted-foreground">
                  {jailbreakThreshold.toFixed(2)}
                </span>
              </label>
              <p className="text-xs text-muted-foreground mb-2">
                Weighted injection risk score [0–1] that triggers the jailbreak action. Lower = more
                sensitive.
              </p>
              <input
                type="range"
                min="0"
                max="1"
                step="0.05"
                value={jailbreakThreshold}
                onChange={(e) => {
                  policyMutation.mutate({ jailbreakThreshold: parseFloat(e.target.value) });
                }}
                disabled={policyMutation.isPending}
                className="w-full accent-primary"
              />
            </div>

            {/* Jailbreak action */}
            <div className="space-y-1">
              <label className="text-sm font-medium">Jailbreak Threshold Action</label>
              <p className="text-xs text-muted-foreground mb-2">
                Action taken when a message's injection score meets the threshold above.
              </p>
              <select
                className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={jailbreakAction}
                onChange={(e) => {
                  policyMutation.mutate({
                    jailbreakAction: e.target.value as 'block' | 'warn' | 'audit_only',
                  });
                }}
                disabled={policyMutation.isPending}
              >
                <option value="block">Block — reject request (400)</option>
                <option value="warn">Warn — audit log + allow (default)</option>
                <option value="audit_only">Audit Only — record score, no warning</option>
              </select>
            </div>

            {/* System prompt confidentiality */}
            <PolicyToggle
              label="System Prompt Confidentiality"
              icon={<Lock className="w-4 h-4 text-muted-foreground" />}
              enabled={strictSystemPromptConf}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({
                  strictSystemPromptConfidentiality: !strictSystemPromptConf,
                });
              }}
              description="Scan AI responses for n-gram overlap with system prompt contents. Detected leaks are redacted and audit-logged. Can be overridden per personality."
            />

            {/* Abuse detection */}
            <PolicyToggle
              label="Rate-Aware Abuse Detection"
              icon={<Shield className="w-4 h-4 text-muted-foreground" />}
              enabled={abuseDetectionEnabled}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ abuseDetectionEnabled: !abuseDetectionEnabled });
              }}
              description="Track blocked-message retries, topic pivoting, and tool-call anomalies per session. Triggered sessions enter a cool-down period and emit suspicious_pattern audit events."
            />
          </div>
        )}
      </div>

      {/* Content Guardrails (Phase 95) */}
      <div className="card">
        <button
          type="button"
          onClick={() => {
            setContentGuardrailsOpen(!contentGuardrailsOpen);
          }}
          className="w-full p-4 border-b flex items-center gap-2 text-left"
        >
          {contentGuardrailsOpen ? (
            <ChevronDown className="w-4 h-4 text-muted-foreground" />
          ) : (
            <ChevronRight className="w-4 h-4 text-muted-foreground" />
          )}
          <Shield className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Content Guardrails</h3>
        </button>
        {contentGuardrailsOpen && (
          <div className="p-4 space-y-5">
            <PolicyToggle
              label="Enable Content Guardrails"
              enabled={cgEnabled}
              isPending={policyMutation.isPending}
              onToggle={() => {
                policyMutation.mutate({ contentGuardrailsEnabled: !cgEnabled });
              }}
              description="Enforce output-side content policies: PII redaction, topic restrictions, toxicity filtering, custom block lists, and citation grounding."
            />

            {cgEnabled && (
              <>
                {/* PII mode */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">PII Detection Mode</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    Detect or redact personally identifiable information (emails, phone numbers,
                    SSNs, credit cards, IPs).
                  </p>
                  <select
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                    value={cgPiiMode}
                    onChange={(e) => {
                      policyMutation.mutate({
                        contentGuardrailsPiiMode: e.target.value as
                          | 'disabled'
                          | 'detect_only'
                          | 'redact',
                      });
                    }}
                    disabled={policyMutation.isPending}
                  >
                    <option value="disabled">Disabled</option>
                    <option value="detect_only">Detect Only — log but do not modify</option>
                    <option value="redact">Redact — replace with placeholders</option>
                  </select>
                </div>

                {/* Toxicity */}
                <div className="space-y-3">
                  <PolicyToggle
                    label="Toxicity Filtering"
                    enabled={cgToxicityEnabled}
                    isPending={policyMutation.isPending}
                    onToggle={() => {
                      policyMutation.mutate({
                        contentGuardrailsToxicityEnabled: !cgToxicityEnabled,
                      });
                    }}
                    description="Use an external classifier to detect toxic or harmful content in responses."
                  />
                  {cgToxicityEnabled && (
                    <div className="pl-4 space-y-3">
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Toxicity Mode</label>
                        <select
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          value={cgToxicityMode}
                          onChange={(e) => {
                            policyMutation.mutate({
                              contentGuardrailsToxicityMode: e.target.value as
                                | 'block'
                                | 'warn'
                                | 'audit_only',
                            });
                          }}
                          disabled={policyMutation.isPending}
                        >
                          <option value="block">Block — reject toxic responses</option>
                          <option value="warn">Warn — log and allow</option>
                          <option value="audit_only">Audit Only — silent logging</option>
                        </select>
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">Classifier URL</label>
                        <input
                          type="text"
                          className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                          placeholder="https://toxicity-classifier.example.com/classify"
                          value={cgToxicityUrl}
                          onChange={(e) => {
                            policyMutation.mutate({
                              contentGuardrailsToxicityClassifierUrl: e.target.value,
                            });
                          }}
                          disabled={policyMutation.isPending}
                        />
                      </div>
                      <div className="space-y-1">
                        <label className="text-sm font-medium">
                          Threshold: {cgToxicityThreshold.toFixed(2)}
                        </label>
                        <input
                          type="range"
                          min={0}
                          max={1}
                          step={0.05}
                          className="w-full"
                          value={cgToxicityThreshold}
                          onChange={(e) => {
                            policyMutation.mutate({
                              contentGuardrailsToxicityThreshold: parseFloat(e.target.value),
                            });
                          }}
                          disabled={policyMutation.isPending}
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Block list */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Block List</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    One entry per line. Prefix with <code>regex:</code> for regex patterns.
                  </p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    rows={4}
                    value={cgBlockList.join('\n')}
                    onChange={(e) => {
                      policyMutation.mutate({
                        contentGuardrailsBlockList: e.target.value.split('\n').filter(Boolean),
                      });
                    }}
                    disabled={policyMutation.isPending}
                  />
                </div>

                {/* Blocked topics */}
                <div className="space-y-1">
                  <label className="text-sm font-medium">Blocked Topics</label>
                  <p className="text-xs text-muted-foreground mb-2">
                    One topic per line. Responses touching these topics will be blocked.
                  </p>
                  <textarea
                    className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm font-mono"
                    rows={3}
                    value={cgBlockedTopics.join('\n')}
                    onChange={(e) => {
                      policyMutation.mutate({
                        contentGuardrailsBlockedTopics: e.target.value.split('\n').filter(Boolean),
                      });
                    }}
                    disabled={policyMutation.isPending}
                  />
                </div>

                {/* Grounding */}
                <div className="space-y-3">
                  <PolicyToggle
                    label="Grounding Verification"
                    enabled={cgGroundingEnabled}
                    isPending={policyMutation.isPending}
                    onToggle={() => {
                      policyMutation.mutate({
                        contentGuardrailsGroundingEnabled: !cgGroundingEnabled,
                      });
                    }}
                    description="Verify cited claims against the knowledge base. Unverified citations are flagged or blocked."
                  />
                  {cgGroundingEnabled && (
                    <div className="pl-4 space-y-1">
                      <label className="text-sm font-medium">Grounding Mode</label>
                      <select
                        className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                        value={cgGroundingMode}
                        onChange={(e) => {
                          policyMutation.mutate({
                            contentGuardrailsGroundingMode: e.target.value as 'flag' | 'block',
                          });
                        }}
                        disabled={policyMutation.isPending}
                      >
                        <option value="flag">
                          Flag — tag unverified citations with [unverified]
                        </option>
                        <option value="block">
                          Block — reject responses with unverified citations
                        </option>
                      </select>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        )}
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

      {/* Organization */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Target className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Organization</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Organization"
            icon={<Target className="w-4 h-4 text-muted-foreground" />}
            enabled={orgIntentAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowOrgIntent: !orgIntentAllowed });
            }}
            description={
              orgIntentAllowed
                ? 'Organization is enabled. The Organization sidebar entry is visible with access to intent, risk, workspaces, and users.'
                : 'Organization is disabled. Enable to access organizational intent, departmental risk, workspaces, and user management.'
            }
          />
          {orgIntentAllowed && (
            <>
              <div className="border-t border-border pt-4">
                <PolicyToggle
                  label="Knowledge Base"
                  icon={<BookOpen className="w-4 h-4 text-muted-foreground" />}
                  enabled={knowledgeBaseAllowed}
                  isPending={policyMutation.isPending}
                  onToggle={() => {
                    policyMutation.mutate({ allowKnowledgeBase: !knowledgeBaseAllowed });
                  }}
                  description={
                    knowledgeBaseAllowed
                      ? 'Knowledge Base access is enabled for personalities. Personalities can query and retrieve organization knowledge base content during conversations.'
                      : 'Knowledge Base access is disabled for personalities. Enable to allow personalities to query and retrieve organization knowledge base content.'
                  }
                />
              </div>
              <div className="border-t border-border pt-4">
                <PolicyToggle
                  label="Intent"
                  icon={<Target className="w-4 h-4 text-muted-foreground" />}
                  enabled={intentAllowed}
                  isPending={policyMutation.isPending}
                  onToggle={() => {
                    policyMutation.mutate({ allowIntent: !intentAllowed });
                  }}
                  description={
                    intentAllowed
                      ? 'Intent tab is visible under Organization. Users can view and manage organizational intent documents.'
                      : 'Intent tab is hidden. Enable to show the Intent tab under Organization.'
                  }
                />
              </div>
              {intentAllowed && (
                <div className="border-t border-border pt-4">
                  <PolicyToggle
                    label="Intent Document Editor"
                    icon={<Target className="w-4 h-4 text-muted-foreground" />}
                    enabled={intentEditorAllowed}
                    isPending={policyMutation.isPending}
                    onToggle={() => {
                      policyMutation.mutate({ allowIntentEditor: !intentEditorAllowed });
                    }}
                    description={
                      intentEditorAllowed
                        ? 'Full field-level intent editor is enabled. Edit organizational intent documents directly from the Organization → Intent tab. Developer mode — not ready for production use.'
                        : 'Intent editor is disabled. Enable to access the structured editor for goals, signals, boundaries, policies, and delegation framework.'
                    }
                  />
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Workflow Orchestration Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <GitMerge className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Workflow Orchestration</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Workflow Orchestration"
            enabled={workflowsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowWorkflows: !workflowsAllowed });
            }}
            description={
              workflowsAllowed
                ? 'Workflow orchestration is enabled. Users can build and run DAG-based automation workflows from the Workflows page.'
                : 'Workflow orchestration is disabled at the security level. The Workflows page is hidden and no workflow runs can be triggered.'
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

      {/* Desktop Control Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Monitor className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Desktop Control</h3>
        </div>
        <div className="p-4 space-y-4">
          <div className="border border-yellow-500/30 bg-yellow-500/10 rounded-lg p-2.5 text-xs text-yellow-600 dark:text-yellow-400">
            ⚠️ Desktop Control grants agents the ability to capture your screen and control your
            keyboard and mouse. Only enable on trusted, dedicated machines.
          </div>
          <PolicyToggle
            label="Desktop Control"
            enabled={desktopControlAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowDesktopControl: !desktopControlAllowed });
            }}
            description={
              desktopControlAllowed
                ? 'Desktop Control is enabled. Personalities with vision or limb_movement capabilities can capture screens and control input devices.'
                : 'Desktop Control is disabled. No personality can capture screens or control input devices regardless of their capabilities configuration.'
            }
          />

          {/* Camera — sub-item, only visible when Desktop Control enabled */}
          {desktopControlAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border">
              <PolicyToggle
                label="Camera Capture"
                icon={<Camera className="w-4 h-4 text-muted-foreground" />}
                enabled={cameraAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowCamera: !cameraAllowed });
                }}
                description={
                  cameraAllowed
                    ? 'Camera capture is enabled. The desktop_camera_capture tool can access the system camera via ffmpeg.'
                    : 'Camera capture is disabled. The desktop_camera_capture tool will return a capability_disabled error.'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Network Tools Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Network className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Network Tools</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Allow Network Tools"
            enabled={networkToolsAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowNetworkTools: !networkToolsAllowed });
            }}
            description={
              networkToolsAllowed
                ? 'Network access is enabled. Individual tool categories (SSH, NetBox, NVD, etc.) can be activated per MCP server in Connections.'
                : 'Network access is denied globally — MCP network tools and any other network-based access will be blocked regardless of tool configuration.'
            }
          />
        </div>
      </div>

      {/* Twingate Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Globe className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Twingate</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Allow Twingate"
            enabled={twingateAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowTwingate: !twingateAllowed });
            }}
            description={
              twingateAllowed
                ? 'Twingate zero-trust access is enabled. Agents can reach private MCP servers and resources via Twingate tunnels.'
                : 'Twingate access is denied globally — zero-trust tunnels and private MCP proxy are blocked regardless of connection configuration.'
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
            isPending={policyMutation.isPending || agentConfigMutation.isPending}
            onToggle={() => {
              const enabling = !subAgentsAllowed;
              policyMutation.mutate({ allowSubAgents: enabling });
              // One-click provision: enabling sub-agents also activates delegation
              // so the user doesn't need a separate second toggle.
              if (enabling && !delegationEnabled) {
                agentConfigMutation.mutate({ enabled: true });
              }
            }}
            description={
              subAgentsAllowed
                ? delegationEnabled
                  ? 'Sub-agent delegation is active. Personalities with the Sub-Agent Delegation toggle enabled in their Orchestration config can delegate tasks.'
                  : 'Sub-agent delegation is allowed by policy but delegation is inactive. Enable "Delegate Tasks" below to activate.'
                : 'Sub-agent delegation is disabled at the security level. No personality can spawn sub-agents regardless of its creation config.'
            }
          />

          {/* Status badge — shown when delegation is ready */}
          {subAgentsAllowed && delegationEnabled && (
            <div className="flex items-center gap-2 text-xs text-success bg-success/5 border border-success/20 rounded px-3 py-2">
              <span>✓</span>
              <span>
                Delegation is active — personalities with Sub-Agent Delegation enabled can use{' '}
                <code>delegate_task</code>.
              </span>
            </div>
          )}

          {/* A2A Networks and Swarms — sub-items of delegation, only visible when sub-agents enabled */}
          {subAgentsAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border space-y-4">
              <PolicyToggle
                label="Delegate Tasks"
                icon={<Users className="w-4 h-4 text-muted-foreground" />}
                enabled={delegationEnabled}
                isPending={agentConfigMutation.isPending}
                onToggle={() => {
                  agentConfigMutation.mutate({ enabled: !delegationEnabled });
                }}
                description={
                  delegationEnabled
                    ? 'Delegation is active. Personalities with Sub-Agent Delegation enabled in their Orchestration config can delegate tasks.'
                    : 'Delegation is inactive. Enable this to allow personalities to delegate tasks to sub-agent profiles.'
                }
              />
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
              <PolicyToggle
                label="Agent Swarms"
                icon={<Layers className="w-4 h-4 text-muted-foreground" />}
                enabled={swarmsAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowSwarms: !swarmsAllowed });
                }}
                description={
                  swarmsAllowed
                    ? 'Agent swarms are enabled. Personalities can orchestrate multi-agent swarm runs. The Swarms tab is visible in Sub-Agents.'
                    : 'Agent swarms are disabled. No swarm orchestration can occur and the Swarms tab is hidden from Sub-Agents.'
                }
              />
            </div>
          )}
        </div>
      </div>

      {/* Dynamic Tool Creation Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Wrench className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Dynamic Tool Creation</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Dynamic Tool Creation"
            enabled={dtcAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowDynamicTools: !dtcAllowed });
            }}
            description="Allow agents to generate and register new tools at runtime. Disabled by default."
          />
          {dtcAllowed && (
            <div className="ml-6 pl-4 border-l-2 border-border space-y-4">
              <PolicyToggle
                label="Sandboxed Execution"
                icon={<Shield className="w-4 h-4 text-muted-foreground" />}
                enabled={sandboxDtcAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ sandboxDynamicTools: !sandboxDtcAllowed });
                }}
                description="Run dynamically-created tools inside an isolated sandbox. Strongly recommended. Enabled by default."
              />
            </div>
          )}
        </div>
      </div>

      {/* Sandbox Isolation */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Cpu className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Sandbox Isolation</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Code Execution"
            icon={<Terminal className="w-4 h-4 text-muted-foreground" />}
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
          <PolicyToggle
            label="gVisor Isolation"
            icon={<Shield className="w-4 h-4 text-muted-foreground" />}
            enabled={gvisorAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ sandboxGvisor: !gvisorAllowed });
            }}
            description="Add a gVisor (runsc) kernel-level isolation layer to sandboxed execution. Requires gVisor installed on the host system."
          />
          <PolicyToggle
            label="WASM Isolation"
            icon={<Blocks className="w-4 h-4 text-muted-foreground" />}
            enabled={wasmAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ sandboxWasm: !wasmAllowed });
            }}
            description="Run code inside a WebAssembly sandbox for additional memory and capability isolation."
          />
          <PolicyToggle
            label="Outbound Credential Proxy"
            icon={<Network className="w-4 h-4 text-muted-foreground" />}
            enabled={credentialProxyAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ sandboxCredentialProxy: !credentialProxyAllowed });
            }}
            description="Inject Authorization headers for known hosts via a localhost proxy. Secrets never enter the sandbox environment."
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

      {/* Editor Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Code className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Editor</h3>
        </div>
        <div className="p-4 space-y-4">
          <PolicyToggle
            label="Code Editor"
            icon={<Code className="w-4 h-4 text-muted-foreground" />}
            enabled={codeEditorAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowCodeEditor: !codeEditorAllowed });
            }}
            description={
              codeEditorAllowed
                ? 'Code editor is enabled. The Editor entry appears in the sidebar.'
                : 'Code editor is hidden. No editor is accessible from the sidebar.'
            }
          />
          <div className="border-t border-border pt-4">
            <div className={!codeEditorAllowed ? 'opacity-40 pointer-events-none' : ''}>
              <PolicyToggle
                label="Advanced Editor Mode"
                icon={<LayoutPanelLeft className="w-4 h-4 text-muted-foreground" />}
                enabled={advancedEditorAllowed}
                isPending={policyMutation.isPending}
                onToggle={() => {
                  policyMutation.mutate({ allowAdvancedEditor: !advancedEditorAllowed });
                }}
                description={
                  advancedEditorAllowed
                    ? 'Advanced workspace enabled: three-panel layout with Monaco editor, file manager, task panel, and multi-terminal.'
                    : 'Standard editor mode. Enable to replace the editor with the advanced coding workspace.'
                }
              />
            </div>
            {!codeEditorAllowed && (
              <p className="text-xs text-muted-foreground mt-1">
                Requires Code Editor to be enabled.
              </p>
            )}
          </div>
        </div>
      </div>

      {/* Training Export Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <Brain className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Training Data Export</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Training Dataset Export"
            enabled={securityPolicy?.allowTrainingExport ?? false}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({
                allowTrainingExport: !(securityPolicy?.allowTrainingExport ?? false),
              });
            }}
            description={
              (securityPolicy?.allowTrainingExport ?? false)
                ? 'Training export is enabled. The Training tab is visible in Developers and conversations can be downloaded as ShareGPT / instruction / raw text datasets.'
                : 'Training export is disabled. Enable to allow exporting conversations as LLM fine-tuning datasets (ShareGPT JSONL, instruction JSONL, raw text).'
            }
          />
        </div>
      </div>

      {/* Community Skills Policy */}
      <div className="card">
        <div className="p-4 border-b flex items-center gap-2">
          <GitBranch className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Community Skills</h3>
        </div>
        <div className="p-4">
          <PolicyToggle
            label="Community Skills"
            enabled={communityGitFetchAllowed}
            isPending={policyMutation.isPending}
            onToggle={() => {
              policyMutation.mutate({ allowCommunityGitFetch: !communityGitFetchAllowed });
            }}
            description={
              communityGitFetchAllowed
                ? 'Community Skills are enabled. The Community tab is visible in Skills and users can browse and install skills from the community repository.'
                : 'Community Skills are disabled. The Community tab is hidden in Skills and no community repository installs can be triggered.'
            }
          />
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

  const invalidateRoles = () => queryClient.invalidateQueries({ queryKey: ['auth-roles'] });

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

  const [showRoleForm, setShowRoleForm] = useState(false);
  const [editingRole, setEditingRole] = useState<RoleInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<RoleInfo | null>(null);

  const roles = rolesData?.roles ?? [];
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
    </div>
  );
}

// ── User Role Assignments (used in Organization > Users) ─────────────────────

export function UserRoleAssignments() {
  const queryClient = useQueryClient();

  const { data: rolesData } = useQuery({
    queryKey: ['auth-roles'],
    queryFn: fetchRoles,
  });

  const { data: assignmentsData, isLoading: assignmentsLoading } = useQuery({
    queryKey: ['auth-assignments'],
    queryFn: fetchAssignments,
  });

  const invalidateAssignments = () =>
    queryClient.invalidateQueries({ queryKey: ['auth-assignments'] });

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

  const [showAssignForm, setShowAssignForm] = useState(false);
  const [assignUserId, setAssignUserId] = useState('');
  const [assignRoleId, setAssignRoleId] = useState('');
  const [confirmRevoke, setConfirmRevoke] = useState<AssignmentInfo | null>(null);

  const roles = rolesData?.roles ?? [];
  const assignments = assignmentsData?.assignments ?? [];

  return (
    <div className="card">
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

      <div className="p-4 border-b flex items-center justify-between">
        <div className="flex items-center gap-2">
          <UserPlus className="w-5 h-5 text-primary" />
          <h3 className="font-medium">Role Assignments</h3>
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
                className="btn btn-ghost text-sm"
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
  );
}

// ── Well-known MCP service keys ─────────────────────────────────────────────

interface ServiceKeyDef {
  name: string;
  label: string;
  category: string;
  isUrl?: boolean;
}

const SERVICE_KEYS: ServiceKeyDef[] = [
  // SecureYeoman — core platform keys
  {
    name: 'SECUREYEOMAN_TOKEN_SECRET',
    label: 'Token Secret (JWT signing)',
    category: 'SecureYeoman',
  },
  { name: 'SECUREYEOMAN_ADMIN_PASSWORD', label: 'Admin Password', category: 'SecureYeoman' },
  { name: 'SECUREYEOMAN_SIGNING_KEY', label: 'Signing Key', category: 'SecureYeoman' },
  { name: 'SECUREYEOMAN_ENCRYPTION_KEY', label: 'Encryption Key', category: 'SecureYeoman' },
  // Yeoman MCP — ecosystem services & MCP tool integrations
  { name: 'AGNOSTIC_API_KEY', label: 'Agnostic QA Platform API Key', category: 'Yeoman MCP' },
  { name: 'AGNOS_RUNTIME_API_KEY', label: 'AGNOS Agent Runtime API Key', category: 'Yeoman MCP' },
  { name: 'AGNOS_GATEWAY_API_KEY', label: 'AGNOS LLM Gateway API Key', category: 'Yeoman MCP' },
  {
    name: 'BULLSHIFT_API_URL',
    label: 'BullShift Trading API URL',
    category: 'Yeoman MCP',
    isUrl: true,
  },
  {
    name: 'PHOTISNADI_SUPABASE_URL',
    label: 'Photisnadi Supabase URL',
    category: 'Yeoman MCP',
    isUrl: true,
  },
  {
    name: 'PHOTISNADI_SUPABASE_KEY',
    label: 'Photisnadi Supabase Service Key',
    category: 'Yeoman MCP',
  },
  { name: 'PHOTISNADI_USER_ID', label: 'Photisnadi User ID', category: 'Yeoman MCP' },
  // Search
  {
    name: 'MCP_WEB_SEARCH_API_KEY',
    label: 'Web Search API Key (SerpAPI / Tavily)',
    category: 'Search',
  },
  { name: 'BRAVE_SEARCH_API_KEY', label: 'Brave Search API Key', category: 'Search' },
  { name: 'BING_SEARCH_API_KEY', label: 'Bing Search API Key', category: 'Search' },
  { name: 'EXA_API_KEY', label: 'Exa Neural Search API Key', category: 'Search' },
  { name: 'SEARXNG_URL', label: 'SearXNG Instance URL', category: 'Search', isUrl: true },
  // Security
  { name: 'SHODAN_API_KEY', label: 'Shodan API Key', category: 'Security' },
  // Market Data
  { name: 'ALPHAVANTAGE_API_KEY', label: 'AlphaVantage Market Data Key', category: 'Market Data' },
  { name: 'FINNHUB_API_KEY', label: 'Finnhub Market Data Key', category: 'Market Data' },
  // Proxy
  { name: 'PROXY_BRIGHTDATA_URL', label: 'Bright Data Proxy URL', category: 'Proxy', isUrl: true },
  { name: 'PROXY_SCRAPINGBEE_KEY', label: 'ScrapingBee API Key', category: 'Proxy' },
  { name: 'PROXY_SCRAPERAPI_KEY', label: 'ScraperAPI Key', category: 'Proxy' },
  // QuickBooks
  { name: 'QUICKBOOKS_CLIENT_ID', label: 'QuickBooks Client ID', category: 'QuickBooks' },
  { name: 'QUICKBOOKS_CLIENT_SECRET', label: 'QuickBooks Client Secret', category: 'QuickBooks' },
  { name: 'QUICKBOOKS_REALM_ID', label: 'QuickBooks Realm ID', category: 'QuickBooks' },
  { name: 'QUICKBOOKS_REFRESH_TOKEN', label: 'QuickBooks Refresh Token', category: 'QuickBooks' },
];

const CATEGORY_ICONS: Record<string, React.ReactNode> = {
  SecureYeoman: <Shield className="w-4 h-4" />,
  'Yeoman MCP': <Puzzle className="w-4 h-4" />,
  Search: <Search className="w-4 h-4" />,
  Security: <Lock className="w-4 h-4" />,
  'Market Data': <Target className="w-4 h-4" />,
  Proxy: <Globe className="w-4 h-4" />,
  QuickBooks: <Code2 className="w-4 h-4" />,
  'Custom Secrets': <Lock className="w-4 h-4" />,
};

const SERVICE_KEY_NAMES = new Set(SERVICE_KEYS.map((k) => k.name));

/**
 * ServiceKeysPanel — collapsible categorized management of well-known MCP API keys
 * and custom secrets. Shows per-category configuration status at a glance.
 */
export function ServiceKeysPanel() {
  const queryClient = useQueryClient();
  const [expandedCategories, setExpandedCategories] = useState<Set<string>>(new Set());
  const [editingKey, setEditingKey] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [addingCustom, setAddingCustom] = useState(false);
  const [newName, setNewName] = useState('');
  const [newValue, setNewValue] = useState('');

  const { data: secretsData, isLoading } = useQuery({
    queryKey: ['secret-keys'],
    queryFn: fetchSecretKeys,
    refetchOnWindowFocus: false,
  });

  const setMutation = useMutation({
    mutationFn: ({ name, value }: { name: string; value: string }) => setSecret(name, value),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-keys'] });
      setEditingKey(null);
      setEditValue('');
      setAddingCustom(false);
      setNewName('');
      setNewValue('');
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (name: string) => deleteSecret(name),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['secret-keys'] });
      setConfirmDelete(null);
    },
  });

  const storedKeys = new Set(secretsData?.keys ?? []);
  const customKeys = (secretsData?.keys ?? []).filter((k) => !SERVICE_KEY_NAMES.has(k));

  const toggleCategory = (category: string) => {
    setExpandedCategories((prev) => {
      const next = new Set(prev);
      if (next.has(category)) next.delete(category);
      else next.add(category);
      return next;
    });
  };

  const categories = [...new Set(SERVICE_KEYS.map((k) => k.category))];

  const totalConfigured = SERVICE_KEYS.filter((k) => storedKeys.has(k.name)).length;

  return (
    <div className="space-y-6">
      <ConfirmDialog
        open={!!confirmDelete}
        title="Remove Key"
        message={`Remove "${confirmDelete}"? This cannot be undone.`}
        confirmLabel="Remove"
        destructive
        onConfirm={() => {
          if (confirmDelete) deleteMutation.mutate(confirmDelete);
        }}
        onCancel={() => {
          setConfirmDelete(null);
        }}
      />

      <div>
        <h2 className="text-xl font-semibold text-primary flex items-center gap-2">
          <Key className="w-5 h-5" />
          Service API Keys
        </h2>
        <p className="text-sm text-muted-foreground mt-1">
          API keys for MCP search, security, proxy, and external services. Stored encrypted in the
          secrets backend. Env vars take precedence if set.
        </p>
        {!isLoading && (
          <p className="text-xs text-muted-foreground mt-1">
            {totalConfigured} of {SERVICE_KEYS.length} service keys configured
            {customKeys.length > 0 &&
              ` · ${customKeys.length} custom secret${customKeys.length !== 1 ? 's' : ''}`}
          </p>
        )}
      </div>

      <div className="card overflow-hidden">
        {/* Service key categories */}
        {categories.map((category) => {
          const keys = SERVICE_KEYS.filter((k) => k.category === category);
          const configuredInCategory = keys.filter((k) => storedKeys.has(k.name)).length;
          const isExpanded = expandedCategories.has(category);

          return (
            <div key={category} className="border-b border-border last:border-0">
              <button
                onClick={() => {
                  toggleCategory(category);
                }}
                className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
                aria-expanded={isExpanded}
                data-testid={`category-${category}`}
              >
                <div className="flex items-center gap-2.5">
                  {isExpanded ? (
                    <ChevronDown className="w-4 h-4 text-muted-foreground" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-muted-foreground" />
                  )}
                  {CATEGORY_ICONS[category] ?? <Key className="w-4 h-4" />}
                  <span className="font-medium text-sm">{category}</span>
                </div>
                <span
                  className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                    configuredInCategory === keys.length
                      ? 'bg-success/10 text-success'
                      : configuredInCategory > 0
                        ? 'bg-primary/10 text-primary'
                        : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {configuredInCategory}/{keys.length}
                </span>
              </button>

              {isExpanded && (
                <div className="px-4 pb-3 space-y-1.5">
                  {keys.map((keyDef) => {
                    const isSet = storedKeys.has(keyDef.name);
                    const isEditing = editingKey === keyDef.name;

                    return (
                      <div key={keyDef.name}>
                        <div className="flex items-center justify-between p-2 rounded bg-muted/20 text-sm">
                          <div className="flex items-center gap-2.5 flex-1 min-w-0">
                            {isSet ? (
                              <CheckCircle className="w-3.5 h-3.5 text-success flex-shrink-0" />
                            ) : (
                              <XCircle className="w-3.5 h-3.5 text-muted-foreground/50 flex-shrink-0" />
                            )}
                            <div className="min-w-0">
                              <span className="text-xs block truncate">{keyDef.label}</span>
                              <span className="font-mono text-[10px] text-muted-foreground block truncate">
                                {keyDef.name}
                              </span>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 flex-shrink-0">
                            <button
                              className="text-primary hover:text-primary/80 p-1 rounded hover:bg-muted/50"
                              onClick={() => {
                                setEditingKey(isEditing ? null : keyDef.name);
                                setEditValue('');
                              }}
                              aria-label={isSet ? `Update ${keyDef.name}` : `Set ${keyDef.name}`}
                              title={isSet ? 'Update' : 'Set key'}
                            >
                              <Pen className="w-3.5 h-3.5" />
                            </button>
                            {isSet && (
                              <button
                                className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10"
                                onClick={() => {
                                  setConfirmDelete(keyDef.name);
                                }}
                                aria-label={`Remove ${keyDef.name}`}
                                title="Remove"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </div>

                        {isEditing && (
                          <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-2 mt-1 ml-6">
                            <input
                              type={keyDef.isUrl ? 'text' : 'password'}
                              value={editValue}
                              onChange={(e) => {
                                setEditValue(e.target.value);
                              }}
                              placeholder={keyDef.isUrl ? 'https://...' : 'Paste key...'}
                              className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                className="btn btn-ghost text-sm px-3 py-1 flex items-center gap-1"
                                onClick={() => {
                                  if (editValue)
                                    setMutation.mutate({ name: keyDef.name, value: editValue });
                                }}
                                disabled={!editValue || setMutation.isPending}
                              >
                                {setMutation.isPending && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                {isSet ? 'Update' : 'Save'}
                              </button>
                              <button
                                className="btn btn-ghost text-sm px-3 py-1"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditValue('');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          );
        })}

        {/* Custom Secrets category */}
        <div className="border-b border-border last:border-0">
          <button
            onClick={() => {
              toggleCategory('Custom Secrets');
            }}
            className="w-full flex items-center justify-between px-4 py-3 hover:bg-muted/30 transition-colors text-left"
            aria-expanded={expandedCategories.has('Custom Secrets')}
            data-testid="category-Custom Secrets"
          >
            <div className="flex items-center gap-2.5">
              {expandedCategories.has('Custom Secrets') ? (
                <ChevronDown className="w-4 h-4 text-muted-foreground" />
              ) : (
                <ChevronRight className="w-4 h-4 text-muted-foreground" />
              )}
              <Lock className="w-4 h-4" />
              <span className="font-medium text-sm">Custom Secrets</span>
            </div>
            <span
              className={`text-xs font-medium px-2 py-0.5 rounded-full ${
                customKeys.length > 0
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-muted-foreground'
              }`}
            >
              {customKeys.length}
            </span>
          </button>

          {expandedCategories.has('Custom Secrets') && (
            <div className="px-4 pb-3 space-y-2">
              <p className="text-xs text-muted-foreground">
                Write-only secrets stored in the configured backend (env / keyring / vault).
              </p>

              {customKeys.length > 0 && (
                <div className="space-y-1.5">
                  {customKeys.map((key) => {
                    const isEditing = editingKey === key;
                    return (
                      <div key={key}>
                        <div className="flex items-center justify-between p-2 rounded bg-muted/20 text-sm">
                          <div className="flex items-center gap-2.5">
                            <Lock className="w-3 h-3 text-muted-foreground" />
                            <span className="font-mono text-xs">{key}</span>
                          </div>
                          <div className="flex items-center gap-1">
                            <button
                              className="text-primary hover:text-primary/80 p-1 rounded hover:bg-muted/50"
                              onClick={() => {
                                setEditingKey(isEditing ? null : key);
                                setEditValue('');
                              }}
                              aria-label={`Update secret ${key}`}
                              title="Update value"
                            >
                              <Pen className="w-3.5 h-3.5" />
                            </button>
                            <button
                              className="text-destructive hover:text-destructive/80 p-1 rounded hover:bg-destructive/10"
                              onClick={() => {
                                setConfirmDelete(key);
                              }}
                              aria-label={`Delete secret ${key}`}
                              title="Delete"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {isEditing && (
                          <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-2 mt-1 ml-6">
                            <input
                              type="password"
                              value={editValue}
                              onChange={(e) => {
                                setEditValue(e.target.value);
                              }}
                              placeholder="New value..."
                              className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                              autoFocus
                            />
                            <div className="flex gap-2">
                              <button
                                className="btn btn-ghost text-sm px-3 py-1 flex items-center gap-1"
                                onClick={() => {
                                  if (editValue)
                                    setMutation.mutate({ name: key, value: editValue });
                                }}
                                disabled={!editValue || setMutation.isPending}
                              >
                                {setMutation.isPending && (
                                  <Loader2 className="w-3 h-3 animate-spin" />
                                )}
                                Update
                              </button>
                              <button
                                className="btn btn-ghost text-sm px-3 py-1"
                                onClick={() => {
                                  setEditingKey(null);
                                  setEditValue('');
                                }}
                              >
                                Cancel
                              </button>
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Add custom secret */}
              {addingCustom ? (
                <div className="p-3 rounded-lg bg-muted/10 border border-border/50 space-y-3">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">
                        Name (uppercase)
                      </label>
                      <input
                        type="text"
                        value={newName}
                        onChange={(e) => {
                          setNewName(e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, ''));
                        }}
                        placeholder="MY_SECRET_KEY"
                        className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                        autoFocus
                      />
                    </div>
                    <div>
                      <label className="text-xs text-muted-foreground block mb-1">Value</label>
                      <input
                        type="password"
                        value={newValue}
                        onChange={(e) => {
                          setNewValue(e.target.value);
                        }}
                        placeholder="••••••••"
                        className="px-2 py-1.5 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                      />
                    </div>
                  </div>
                  <div className="flex gap-2">
                    <button
                      className="btn btn-ghost text-sm px-3 py-1 flex items-center gap-1"
                      onClick={() => {
                        if (newName && newValue)
                          setMutation.mutate({ name: newName, value: newValue });
                      }}
                      disabled={!newName || !newValue || setMutation.isPending}
                    >
                      {setMutation.isPending && <Loader2 className="w-3 h-3 animate-spin" />}
                      Save
                    </button>
                    <button
                      className="btn btn-ghost text-sm px-3 py-1"
                      onClick={() => {
                        setAddingCustom(false);
                        setNewName('');
                        setNewValue('');
                      }}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  className="flex items-center gap-1.5 text-xs text-primary hover:text-primary/80 px-2 py-1.5"
                  onClick={() => {
                    setAddingCustom(true);
                  }}
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add Custom Secret
                </button>
              )}

              {customKeys.length === 0 && !addingCustom && (
                <p className="text-xs text-muted-foreground pl-2">No custom secrets stored.</p>
              )}
            </div>
          )}
        </div>
      </div>

      {isLoading && <p className="text-sm text-muted-foreground">Loading...</p>}
    </div>
  );
}

/** @deprecated Use ServiceKeysPanel which now includes custom secrets */
export const SecretsPanel = ServiceKeysPanel;
