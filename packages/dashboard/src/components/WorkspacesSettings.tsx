import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import {
  Building2,
  Plus,
  Pencil,
  Trash2,
  Users,
  ChevronDown,
  Loader2,
  X,
  UserPlus,
  Crown,
  ShieldCheck,
  Eye,
  User,
} from 'lucide-react';
import {
  fetchWorkspaces,
  createWorkspace,
  updateWorkspace,
  deleteWorkspace,
  fetchWorkspaceMembers,
  addWorkspaceMember,
  updateWorkspaceMemberRole,
  removeWorkspaceMember,
  fetchUsers,
  type Workspace,
  type WorkspaceMember,
} from '../api/client';

const ROLES = ['owner', 'admin', 'member', 'viewer'] as const;
type WorkspaceRole = (typeof ROLES)[number];

const ROLE_META: Record<WorkspaceRole, { label: string; icon: React.ReactNode; color: string }> = {
  owner: { label: 'Owner', icon: <Crown className="w-3.5 h-3.5" />, color: 'text-yellow-500' },
  admin: { label: 'Admin', icon: <ShieldCheck className="w-3.5 h-3.5" />, color: 'text-primary' },
  member: { label: 'Member', icon: <User className="w-3.5 h-3.5" />, color: 'text-foreground' },
  viewer: {
    label: 'Viewer',
    icon: <Eye className="w-3.5 h-3.5" />,
    color: 'text-muted-foreground',
  },
};

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ── Members panel ──────────────────────────────────────────────────────────

function MembersPanel({ workspaceId }: { workspaceId: string }) {
  const queryClient = useQueryClient();
  const key = ['workspace-members', workspaceId];
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: key });

  const [showAdd, setShowAdd] = useState(false);
  const [addUserId, setAddUserId] = useState('');
  const [addRole, setAddRole] = useState<WorkspaceRole>('member');

  const { data, isLoading } = useQuery({
    queryKey: key,
    queryFn: () => fetchWorkspaceMembers(workspaceId),
  });

  const { data: usersData } = useQuery({
    queryKey: ['auth-users'],
    queryFn: fetchUsers,
  });

  const members = data?.members ?? [];
  const allUsers = usersData?.users ?? [];
  const memberUserIds = new Set(members.map((m) => m.userId));
  const availableUsers = allUsers.filter((u) => !memberUserIds.has(u.id));

  const addMut = useMutation({
    mutationFn: () => addWorkspaceMember(workspaceId, { userId: addUserId, role: addRole }),
    onSuccess: () => {
      invalidate();
      setShowAdd(false);
      setAddUserId('');
      setAddRole('member');
    },
  });

  const roleMut = useMutation({
    mutationFn: ({ userId, role }: { userId: string; role: string }) =>
      updateWorkspaceMemberRole(workspaceId, userId, role),
    onSuccess: () => {
      invalidate();
    },
  });

  const removeMut = useMutation({
    mutationFn: (userId: string) => removeWorkspaceMember(workspaceId, userId),
    onSuccess: () => {
      invalidate();
    },
  });

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 py-3 px-4 text-sm text-muted-foreground">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Loading members…
      </div>
    );
  }

  return (
    <div className="border-t pt-3 mt-1 space-y-2 px-4 pb-3">
      <div className="flex items-center justify-between">
        <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
          Members ({members.length})
        </p>
        <button
          onClick={() => {
            setShowAdd((v) => !v);
          }}
          className="flex items-center gap-1 text-xs px-2 py-1 rounded border hover:bg-muted/50 transition-colors"
        >
          <UserPlus className="w-3 h-3" />
          Add
        </button>
      </div>

      {showAdd && (
        <div className="flex gap-2 items-end">
          <div className="flex-1">
            <select
              value={addUserId}
              onChange={(e) => {
                setAddUserId(e.target.value);
              }}
              className="w-full px-2 py-1.5 text-sm rounded border bg-background"
            >
              <option value="">Select user…</option>
              {availableUsers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.displayName || u.email}
                </option>
              ))}
            </select>
          </div>
          <div>
            <select
              value={addRole}
              onChange={(e) => {
                setAddRole(e.target.value as WorkspaceRole);
              }}
              className="px-2 py-1.5 text-sm rounded border bg-background"
            >
              {ROLES.map((r) => (
                <option key={r} value={r}>
                  {ROLE_META[r].label}
                </option>
              ))}
            </select>
          </div>
          <button
            disabled={!addUserId || addMut.isPending}
            onClick={() => {
              addMut.mutate();
            }}
            className="px-3 py-1.5 text-sm btn btn-ghost"
          >
            {addMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Add'}
          </button>
          <button
            onClick={() => {
              setShowAdd(false);
            }}
            className="p-1.5 rounded hover:bg-muted/50"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {members.length === 0 ? (
        <p className="text-xs text-muted-foreground py-1">No members yet.</p>
      ) : (
        <div className="space-y-1">
          {members.map((m) => {
            const meta = ROLE_META[m.role] ?? ROLE_META.member;
            const userLabel =
              allUsers.find((u) => u.id === m.userId)?.displayName ||
              allUsers.find((u) => u.id === m.userId)?.email ||
              m.userId;
            return (
              <div key={m.userId} className="flex items-center justify-between text-sm py-1 gap-2">
                <span className="truncate flex-1 text-sm">{userLabel}</span>
                <div className="flex items-center gap-1.5">
                  <span className={`flex items-center gap-1 text-xs ${meta.color}`}>
                    {meta.icon}
                    {meta.label}
                  </span>
                  <select
                    value={m.role}
                    onChange={(e) => {
                      roleMut.mutate({ userId: m.userId, role: e.target.value });
                    }}
                    className="text-xs px-1.5 py-0.5 rounded border bg-background"
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_META[r].label}
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={() => {
                      removeMut.mutate(m.userId);
                    }}
                    disabled={removeMut.isPending}
                    className="p-1 rounded hover:bg-destructive/10 text-destructive transition-colors"
                    title="Remove member"
                  >
                    <X className="w-3 h-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

// ── Main component ─────────────────────────────────────────────────────────

export function WorkspacesSettings() {
  const queryClient = useQueryClient();
  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['workspaces'] });

  const [showCreate, setShowCreate] = useState(false);
  const [createForm, setCreateForm] = useState({ name: '', description: '' });
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editForm, setEditForm] = useState({ name: '', description: '' });
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ['workspaces'],
    queryFn: () => fetchWorkspaces(),
  });

  const workspaces: Workspace[] = data?.workspaces ?? [];

  const createMut = useMutation({
    mutationFn: (d: { name: string; description?: string }) => createWorkspace(d),
    onSuccess: () => {
      invalidate();
      setShowCreate(false);
      setCreateForm({ name: '', description: '' });
    },
  });

  const updateMut = useMutation({
    mutationFn: ({ id, ...d }: { id: string; name?: string; description?: string }) =>
      updateWorkspace(id, d),
    onSuccess: () => {
      invalidate();
      setEditingId(null);
    },
  });

  const deleteMut = useMutation({
    mutationFn: (id: string) => deleteWorkspace(id),
    onSuccess: () => {
      invalidate();
      setConfirmDeleteId(null);
      if (expandedId === confirmDeleteId) setExpandedId(null);
    },
  });

  const startEdit = (ws: Workspace) => {
    setEditingId(ws.id);
    setEditForm({ name: ws.name, description: ws.description ?? '' });
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="font-semibold flex items-center gap-2">
            <Building2 className="w-4 h-4 text-primary" />
            Workspaces
          </h3>
          <p className="text-xs text-muted-foreground mt-0.5">
            Organise users and resources into isolated workspaces.
          </p>
        </div>
        <button
          onClick={() => {
            setShowCreate((v) => !v);
          }}
          className="btn btn-ghost text-sm flex items-center gap-1"
        >
          <Plus className="w-4 h-4" />
          New Workspace
        </button>
      </div>

      {/* Create form */}
      {showCreate && (
        <div className="card p-4 space-y-3 border-primary/30">
          <div className="flex items-center justify-between">
            <h4 className="text-sm font-medium">New Workspace</h4>
            <button
              onClick={() => {
                setShowCreate(false);
              }}
              className="p-1 rounded hover:bg-muted/50"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Name *</label>
            <input
              type="text"
              value={createForm.name}
              onChange={(e) => {
                setCreateForm((f) => ({ ...f, name: e.target.value }));
              }}
              className="w-full px-3 py-2 text-sm rounded border bg-background"
              placeholder="e.g. Engineering"
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">Description</label>
            <input
              type="text"
              value={createForm.description}
              onChange={(e) => {
                setCreateForm((f) => ({ ...f, description: e.target.value }));
              }}
              className="w-full px-3 py-2 text-sm rounded border bg-background"
              placeholder="Optional description"
            />
          </div>
          <div className="flex justify-end gap-2">
            <button
              onClick={() => {
                setShowCreate(false);
              }}
              className="btn btn-ghost text-sm"
            >
              Cancel
            </button>
            <button
              disabled={!createForm.name.trim() || createMut.isPending}
              onClick={() => {
                createMut.mutate({
                  name: createForm.name.trim(),
                  description: createForm.description.trim() || undefined,
                });
              }}
              className="btn btn-ghost text-sm"
            >
              {createMut.isPending ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Create'}
            </button>
          </div>
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="flex items-center gap-2 py-8 justify-center text-muted-foreground">
          <Loader2 className="w-5 h-5 animate-spin" />
          <span className="text-sm">Loading workspaces…</span>
        </div>
      ) : workspaces.length === 0 ? (
        <div className="card p-8 text-center text-muted-foreground text-sm">
          No workspaces yet. Create one to get started.
        </div>
      ) : (
        <div className="space-y-2">
          {workspaces.map((ws) => {
            const isExpanded = expandedId === ws.id;
            const isEditing = editingId === ws.id;
            const isConfirmingDelete = confirmDeleteId === ws.id;

            return (
              <div key={ws.id} className="card overflow-hidden">
                {/* Row */}
                <div className="flex items-center gap-3 p-4">
                  <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                    <Building2 className="w-4 h-4 text-primary" />
                  </div>

                  {isEditing ? (
                    <div className="flex-1 flex items-center gap-2">
                      <input
                        type="text"
                        value={editForm.name}
                        onChange={(e) => {
                          setEditForm((f) => ({ ...f, name: e.target.value }));
                        }}
                        className="flex-1 px-2 py-1 text-sm rounded border bg-background"
                        placeholder="Workspace name"
                      />
                      <input
                        type="text"
                        value={editForm.description}
                        onChange={(e) => {
                          setEditForm((f) => ({ ...f, description: e.target.value }));
                        }}
                        className="flex-1 px-2 py-1 text-sm rounded border bg-background"
                        placeholder="Description (optional)"
                      />
                      <button
                        disabled={!editForm.name.trim() || updateMut.isPending}
                        onClick={() => {
                          updateMut.mutate({
                            id: ws.id,
                            name: editForm.name.trim(),
                            description: editForm.description.trim() || undefined,
                          });
                        }}
                        className="btn btn-ghost text-xs px-2 py-1"
                      >
                        {updateMut.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingId(null);
                        }}
                        className="p-1 rounded hover:bg-muted/50"
                      >
                        <X className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  ) : (
                    <div className="flex-1 min-w-0">
                      <p className="font-medium text-sm truncate">{ws.name}</p>
                      {ws.description && (
                        <p className="text-xs text-muted-foreground truncate">{ws.description}</p>
                      )}
                    </div>
                  )}

                  {!isEditing && (
                    <div className="flex items-center gap-1 shrink-0">
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {ws.members.length} member{ws.members.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs text-muted-foreground hidden sm:block mx-1">·</span>
                      <span className="text-xs text-muted-foreground hidden sm:block">
                        {formatDate(ws.createdAt)}
                      </span>
                      <button
                        onClick={() => {
                          startEdit(ws);
                        }}
                        className="p-1.5 rounded hover:bg-muted/50 transition-colors ml-1"
                        title="Edit"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDeleteId(ws.id);
                        }}
                        className="p-1.5 rounded hover:bg-destructive/10 text-destructive transition-colors"
                        title="Delete"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                      <button
                        onClick={() => {
                          setExpandedId(isExpanded ? null : ws.id);
                        }}
                        className="p-1.5 rounded hover:bg-muted/50 transition-colors"
                        title="Members"
                      >
                        <Users className="w-3.5 h-3.5" />
                        <ChevronDown
                          className={`w-3 h-3 ml-0.5 inline transition-transform ${isExpanded ? 'rotate-180' : ''}`}
                        />
                      </button>
                    </div>
                  )}
                </div>

                {/* Delete confirmation */}
                {isConfirmingDelete && (
                  <div className="px-4 pb-3 flex items-center gap-3 bg-destructive/5 border-t border-destructive/20">
                    <p className="text-sm flex-1 text-destructive">
                      Delete <strong>{ws.name}</strong>? This cannot be undone.
                    </p>
                    <button
                      onClick={() => {
                        setConfirmDeleteId(null);
                      }}
                      className="btn btn-ghost text-sm"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={() => {
                        deleteMut.mutate(ws.id);
                      }}
                      disabled={deleteMut.isPending}
                      className="btn btn-destructive text-sm"
                    >
                      {deleteMut.isPending ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        'Delete'
                      )}
                    </button>
                  </div>
                )}

                {/* Members panel */}
                {isExpanded && <MembersPanel workspaceId={ws.id} />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
