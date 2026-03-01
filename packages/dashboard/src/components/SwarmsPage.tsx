import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Layers,
  Play,
  ShieldAlert,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  ChevronRight,
  ChevronDown,
  X,
  Plus,
  Trash2,
  Pencil,
} from 'lucide-react';
import {
  fetchSwarmTemplates,
  executeSwarm,
  fetchSwarmRuns,
  cancelSwarmRun,
  createSwarmTemplate,
  updateSwarmTemplate,
  deleteSwarmTemplate,
  type SwarmTemplate,
  type SwarmRun,
  type SwarmMember,
} from '../api/client';

// ── Strategy colors ───────────────────────────────────────────────

const STRATEGY_COLORS: Record<string, string> = {
  sequential: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  parallel: 'bg-purple-500/10 text-purple-500 border-purple-500/20',
  dynamic: 'bg-orange-500/10 text-orange-500 border-orange-500/20',
};

const STATUS_ICONS: Record<string, React.ReactNode> = {
  running: <Loader2 className="w-3.5 h-3.5 animate-spin text-blue-500" />,
  pending: <Clock className="w-3.5 h-3.5 text-yellow-500" />,
  completed: <CheckCircle className="w-3.5 h-3.5 text-green-500" />,
  failed: <XCircle className="w-3.5 h-3.5 text-red-500" />,
  cancelled: <X className="w-3.5 h-3.5 text-muted-foreground" />,
};

const STATUS_COLORS: Record<string, string> = {
  running: 'bg-blue-500/10 text-blue-500 border-blue-500/20',
  pending: 'bg-yellow-500/10 text-yellow-500 border-yellow-500/20',
  completed: 'bg-green-500/10 text-green-500 border-green-500/20',
  failed: 'bg-red-500/10 text-red-500 border-red-500/20',
  cancelled: 'bg-muted text-muted-foreground border-border',
};

type Strategy = 'sequential' | 'parallel' | 'dynamic';

interface RoleDraft {
  role: string;
  profileName: string;
  description: string;
}

// ── Main component ────────────────────────────────────────────────

export function SwarmsPage({ allowSubAgents }: { allowSubAgents: boolean }) {
  const [selectedTemplate, setSelectedTemplate] = useState<SwarmTemplate | null>(null);
  const [task, setTask] = useState('');
  const [context, setContext] = useState('');
  const [expandedRunId, setExpandedRunId] = useState<string | null>(null);
  const [showCreateTemplate, setShowCreateTemplate] = useState(false);
  const [editingTemplate, setEditingTemplate] = useState<SwarmTemplate | null>(null);
  const queryClient = useQueryClient();

  const { data: templatesData, isLoading: templatesLoading } = useQuery({
    queryKey: ['swarmTemplates'],
    queryFn: fetchSwarmTemplates,
    enabled: allowSubAgents,
  });

  const { data: runsData, isLoading: runsLoading } = useQuery({
    queryKey: ['swarmRuns'],
    queryFn: () => fetchSwarmRuns({ limit: 50 }),
    enabled: allowSubAgents,
    refetchInterval: 5000,
  });

  const executeMut = useMutation({
    mutationFn: executeSwarm,
    onSuccess: () => {
      setSelectedTemplate(null);
      setTask('');
      setContext('');
      void queryClient.invalidateQueries({ queryKey: ['swarmRuns'] });
    },
  });

  const cancelMut = useMutation({
    mutationFn: cancelSwarmRun,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['swarmRuns'] });
    },
  });

  const createMut = useMutation({
    mutationFn: createSwarmTemplate,
    onSuccess: () => {
      setShowCreateTemplate(false);
      void queryClient.invalidateQueries({ queryKey: ['swarmTemplates'] });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, data }: { id: string; data: Parameters<typeof updateSwarmTemplate>[1] }) =>
      updateSwarmTemplate(id, data),
    onSuccess: () => {
      setEditingTemplate(null);
      void queryClient.invalidateQueries({ queryKey: ['swarmTemplates'] });
    },
  });

  const deleteMut = useMutation({
    mutationFn: deleteSwarmTemplate,
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['swarmTemplates'] });
    },
  });

  if (!allowSubAgents) {
    return (
      <div className="space-y-4">
        <div className="card p-8 text-center">
          <ShieldAlert className="w-12 h-12 mx-auto text-muted-foreground mb-4" />
          <h2 className="text-lg font-semibold mb-2">Agent Swarms Disabled</h2>
          <p className="text-muted-foreground text-sm">
            Enable <code className="bg-muted px-1 rounded">allowSubAgents</code> in Security
            Settings to use agent swarms.
          </p>
        </div>
      </div>
    );
  }

  const templates = templatesData?.templates ?? [];
  const runs = runsData?.runs ?? [];

  return (
    <div className="space-y-6">
      {/* Templates grid */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-base font-semibold">Templates</h2>
          <button
            onClick={() => {
              setShowCreateTemplate(!showCreateTemplate);
            }}
            className="flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium border rounded-lg hover:bg-muted/50 transition-colors"
          >
            <Plus className="w-3.5 h-3.5" />
            New Template
          </button>
        </div>

        {/* Create template form */}
        {showCreateTemplate && !editingTemplate && (
          <TemplateForm
            mode="create"
            isPending={createMut.isPending}
            onCancel={() => {
              setShowCreateTemplate(false);
            }}
            onSubmit={(data) => {
              createMut.mutate(data);
            }}
          />
        )}

        {/* Edit template form */}
        {editingTemplate && (
          <TemplateForm
            mode="edit"
            initialValues={editingTemplate}
            isPending={updateMut.isPending}
            onCancel={() => {
              setEditingTemplate(null);
            }}
            onSubmit={(data) => {
              updateMut.mutate({ id: editingTemplate.id, data });
            }}
          />
        )}

        {templatesLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {templates.map((tmpl: SwarmTemplate) => (
              <TemplateCard
                key={tmpl.id}
                template={tmpl}
                isSelected={selectedTemplate?.id === tmpl.id}
                isDeleting={deleteMut.isPending}
                onLaunch={() => {
                  setSelectedTemplate(selectedTemplate?.id === tmpl.id ? null : tmpl);
                  setTask('');
                  setContext('');
                }}
                onEdit={
                  !tmpl.isBuiltin
                    ? () => {
                        setShowCreateTemplate(false);
                        setEditingTemplate(tmpl);
                      }
                    : undefined
                }
                onDelete={
                  !tmpl.isBuiltin
                    ? () => {
                        deleteMut.mutate(tmpl.id);
                      }
                    : undefined
                }
              />
            ))}
          </div>
        )}
      </div>

      {/* Launch form */}
      {selectedTemplate && (
        <div className="card p-4 space-y-3">
          <div className="flex items-center justify-between">
            <span className="font-medium text-sm">
              Launch: <span className="text-primary">{selectedTemplate.name}</span>
            </span>
            <button
              onClick={() => {
                setSelectedTemplate(null);
              }}
              className="btn-ghost p-1 rounded"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Task</label>
            <textarea
              value={task}
              onChange={(e) => {
                setTask(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm min-h-[80px] resize-y"
              placeholder="Describe the task for the swarm..."
            />
          </div>
          <div>
            <label className="text-sm font-medium block mb-1">Context (optional)</label>
            <textarea
              value={context}
              onChange={(e) => {
                setContext(e.target.value);
              }}
              className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y"
              placeholder="Additional context..."
            />
          </div>
          <div className="flex items-center gap-2">
            <button
              className="btn btn-ghost"
              disabled={!task.trim() || executeMut.isPending}
              onClick={() => {
                executeMut.mutate({
                  templateId: selectedTemplate.id,
                  task,
                  context: context || undefined,
                });
              }}
            >
              {executeMut.isPending ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <>
                  <Play className="w-3.5 h-3.5 mr-1" />
                  Launch
                </>
              )}
            </button>
            <button
              className="btn btn-ghost"
              onClick={() => {
                setSelectedTemplate(null);
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Run history */}
      <div>
        <h2 className="text-base font-semibold mb-3">Run History</h2>
        {runsLoading ? (
          <div className="flex justify-center py-6">
            <Loader2 className="w-5 h-5 animate-spin text-muted-foreground" />
          </div>
        ) : runs.length === 0 ? (
          <div className="card p-8 text-center">
            <p className="text-muted-foreground text-sm">No swarm runs yet</p>
          </div>
        ) : (
          <div className="space-y-2">
            {runs.map((run: SwarmRun) => (
              <div key={run.id} className="card">
                <button
                  onClick={() => {
                    setExpandedRunId(expandedRunId === run.id ? null : run.id);
                  }}
                  className="w-full text-left p-4"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2 min-w-0 flex-1">
                      {STATUS_ICONS[run.status] ?? STATUS_ICONS.pending}
                      <span className="text-sm font-medium truncate">{run.templateName}</span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${STRATEGY_COLORS[run.strategy] ?? ''}`}
                      >
                        {run.strategy}
                      </span>
                      <span
                        className={`text-xs px-1.5 py-0.5 rounded border ${STATUS_COLORS[run.status] ?? ''}`}
                      >
                        {run.status}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 text-xs text-muted-foreground">
                      <span>{new Date(run.createdAt).toLocaleString()}</span>
                      {expandedRunId === run.id ? (
                        <ChevronDown className="w-4 h-4" />
                      ) : (
                        <ChevronRight className="w-4 h-4" />
                      )}
                    </div>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate">{run.task}</p>
                </button>

                {expandedRunId === run.id && (
                  <RunDetail
                    run={run}
                    onCancel={
                      run.status === 'running' || run.status === 'pending'
                        ? () => {
                            cancelMut.mutate(run.id);
                          }
                        : undefined
                    }
                  />
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ── Template Form (create + edit) ─────────────────────────────────

function TemplateForm({
  mode,
  initialValues,
  isPending,
  onCancel,
  onSubmit,
}: {
  mode: 'create' | 'edit';
  initialValues?: SwarmTemplate;
  isPending: boolean;
  onCancel: () => void;
  onSubmit: (data: {
    name: string;
    description: string;
    strategy: Strategy;
    roles: RoleDraft[];
    coordinatorProfile: string | null;
  }) => void;
}) {
  const [name, setName] = useState(initialValues?.name ?? '');
  const [description, setDescription] = useState(initialValues?.description ?? '');
  const [strategy, setStrategy] = useState<Strategy>(initialValues?.strategy! ?? 'sequential');
  const [roles, setRoles] = useState<RoleDraft[]>(
    initialValues?.roles.length
      ? initialValues.roles.map((r) => ({
          role: r.role,
          profileName: r.profileName,
          description: r.description ?? '',
        }))
      : [{ role: '', profileName: '', description: '' }]
  );
  const [coordinatorProfile, setCoordinatorProfile] = useState(
    initialValues?.coordinatorProfile ?? ''
  );

  function addRole() {
    setRoles([...roles, { role: '', profileName: '', description: '' }]);
  }

  function removeRole(i: number) {
    setRoles(roles.filter((_, idx) => idx !== i));
  }

  function updateRole(i: number, field: keyof RoleDraft, value: string) {
    setRoles(roles.map((r, idx) => (idx === i ? { ...r, [field]: value } : r)));
  }

  const rolesValid = roles.length > 0 && roles.every((r) => r.role.trim() && r.profileName.trim());
  const canSubmit = name.trim() && rolesValid && !isPending;

  return (
    <div className="card p-4 space-y-4 mb-3">
      <div className="flex items-center justify-between">
        <span className="font-medium text-sm">
          {mode === 'edit' ? 'Edit Swarm Template' : 'New Swarm Template'}
        </span>
        <button onClick={onCancel} className="btn-ghost p-1 rounded">
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Name */}
      <div>
        <label className="text-sm font-medium block mb-1">Name</label>
        <input
          value={name}
          onChange={(e) => {
            setName(e.target.value);
          }}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
          placeholder="e.g. review-and-deploy"
        />
      </div>

      {/* Description */}
      <div>
        <label className="text-sm font-medium block mb-1">Description</label>
        <textarea
          value={description}
          onChange={(e) => {
            setDescription(e.target.value);
          }}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm min-h-[60px] resize-y"
          placeholder="What this swarm does..."
        />
      </div>

      {/* Strategy */}
      <div>
        <label className="text-sm font-medium block mb-1">Strategy</label>
        <select
          value={strategy}
          onChange={(e) => {
            setStrategy(e.target.value as Strategy);
          }}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
        >
          <option value="sequential">
            Sequential — roles execute one after another, each receiving the previous result
          </option>
          <option value="parallel">
            Parallel — all roles execute simultaneously; optional coordinator synthesizes
          </option>
          <option value="dynamic">
            Dynamic — a coordinator agent decides how to delegate at runtime
          </option>
        </select>
      </div>

      {/* Roles */}
      <div>
        <div className="flex items-center justify-between mb-2">
          <label className="text-sm font-medium">Roles</label>
          <button
            onClick={addRole}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            <Plus className="w-3 h-3" />
            Add Role
          </button>
        </div>
        <div className="space-y-2">
          {roles.map((role, i) => (
            <div key={i} className="flex items-start gap-2 p-2 bg-muted/30 rounded-lg">
              <div className="flex-1 grid grid-cols-2 gap-2">
                <input
                  value={role.role}
                  onChange={(e) => {
                    updateRole(i, 'role', e.target.value);
                  }}
                  className="bg-card border border-border rounded px-2 py-1.5 text-xs font-mono"
                  placeholder="role (e.g. reviewer)"
                />
                <input
                  value={role.profileName}
                  onChange={(e) => {
                    updateRole(i, 'profileName', e.target.value);
                  }}
                  className="bg-card border border-border rounded px-2 py-1.5 text-xs font-mono"
                  placeholder="profile (e.g. reviewer)"
                />
                <input
                  value={role.description}
                  onChange={(e) => {
                    updateRole(i, 'description', e.target.value);
                  }}
                  className="col-span-2 bg-card border border-border rounded px-2 py-1.5 text-xs"
                  placeholder="What this role does (optional)"
                />
              </div>
              <button
                onClick={() => {
                  removeRole(i);
                }}
                className="btn-ghost p-1 rounded text-muted-foreground hover:text-destructive mt-0.5 shrink-0"
                disabled={roles.length === 1}
                aria-label="Remove role"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            </div>
          ))}
        </div>
        <p className="text-[10px] text-muted-foreground mt-1">
          Role = identifier used in pipeline. Profile = builtin or custom agent profile name.
        </p>
      </div>

      {/* Coordinator Profile (optional) */}
      <div>
        <label className="text-sm font-medium block mb-1">
          Coordinator Profile <span className="text-muted-foreground font-normal">(optional)</span>
        </label>
        <input
          value={coordinatorProfile}
          onChange={(e) => {
            setCoordinatorProfile(e.target.value);
          }}
          className="w-full bg-card border border-border rounded-lg px-3 py-2 text-sm"
          placeholder="e.g. analyst — synthesizes parallel results"
        />
        <p className="text-[10px] text-muted-foreground mt-0.5">
          Required for parallel strategy. Leave blank for sequential/dynamic.
        </p>
      </div>

      <button
        className="btn btn-ghost"
        disabled={!canSubmit}
        onClick={() => {
          onSubmit({
            name: name.trim(),
            description: description.trim(),
            strategy,
            roles,
            coordinatorProfile: coordinatorProfile.trim() || null,
          });
        }}
      >
        {isPending ? (
          <Loader2 className="w-4 h-4 animate-spin" />
        ) : mode === 'edit' ? (
          'Save Changes'
        ) : (
          'Create Template'
        )}
      </button>
    </div>
  );
}

// ── Template card ─────────────────────────────────────────────────

function TemplateCard({
  template,
  isSelected,
  isDeleting,
  onLaunch,
  onEdit,
  onDelete,
}: {
  template: SwarmTemplate;
  isSelected: boolean;
  isDeleting: boolean;
  onLaunch: () => void;
  onEdit?: () => void;
  onDelete?: () => void;
}) {
  return (
    <div className={`card p-4 transition-colors ${isSelected ? 'ring-2 ring-primary' : ''}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2 min-w-0">
          <span className="text-sm font-semibold truncate">{template.name}</span>
          <span
            className={`text-xs px-1.5 py-0.5 rounded border shrink-0 ${STRATEGY_COLORS[template.strategy] ?? ''}`}
          >
            {template.strategy}
          </span>
        </div>
        <div className="flex items-center gap-1 shrink-0">
          {onEdit && (
            <button
              onClick={onEdit}
              className="btn-ghost p-1 rounded text-muted-foreground hover:text-foreground"
              aria-label="Edit template"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              disabled={isDeleting}
              className="btn-ghost p-1 rounded text-muted-foreground hover:text-destructive"
              aria-label="Delete template"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
          <button onClick={onLaunch} className="btn btn-ghost text-xs flex items-center gap-1">
            <Play className="w-3 h-3" />
            Launch
          </button>
        </div>
      </div>

      <p className="text-xs text-muted-foreground mb-3">{template.description}</p>

      {/* Role pipeline */}
      <div className="flex items-center gap-1 flex-wrap">
        {template.roles.map((role, i) => (
          <span key={`${role.role}-${i}`} className="flex items-center gap-1">
            <span className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono">{role.role}</span>
            {i < template.roles.length - 1 && (
              <ChevronRight className="w-3 h-3 text-muted-foreground" />
            )}
          </span>
        ))}
        {template.coordinatorProfile && (
          <>
            <ChevronRight className="w-3 h-3 text-muted-foreground" />
            <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded font-mono">
              {template.coordinatorProfile} (coord)
            </span>
          </>
        )}
      </div>
    </div>
  );
}

// ── Run detail ────────────────────────────────────────────────────

function RunDetail({ run, onCancel }: { run: SwarmRun; onCancel?: () => void }) {
  const members: SwarmMember[] = run.members ?? [];

  return (
    <div className="border-t px-4 py-3 space-y-3">
      {/* Member pipeline */}
      {members.length > 0 && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-2">
            Member Pipeline ({members.length})
          </p>
          <div className="space-y-1">
            {members.map((m: SwarmMember) => (
              <div
                key={m.id}
                className="flex items-center gap-2 text-xs py-1 px-2 rounded bg-muted/30"
              >
                {STATUS_ICONS[m.status] ?? STATUS_ICONS.pending}
                <span className="font-mono font-medium">{m.role}</span>
                <span className="text-muted-foreground">→ {m.profileName}</span>
                <span
                  className={`ml-auto px-1.5 py-0.5 rounded border ${STATUS_COLORS[m.status] ?? ''}`}
                >
                  {m.status}
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Result */}
      {run.result && (
        <div>
          <p className="text-xs font-medium text-muted-foreground mb-1">Result</p>
          <pre className="text-xs bg-muted p-2 rounded whitespace-pre-wrap max-h-40 overflow-y-auto">
            {run.result}
          </pre>
        </div>
      )}

      {/* Error */}
      {run.error && (
        <div>
          <p className="text-xs font-medium text-destructive mb-1">Error</p>
          <pre className="text-xs bg-destructive/10 p-2 rounded">{run.error}</pre>
        </div>
      )}

      {onCancel && (
        <button onClick={onCancel} className="text-xs text-destructive hover:underline">
          Cancel run
        </button>
      )}
    </div>
  );
}
