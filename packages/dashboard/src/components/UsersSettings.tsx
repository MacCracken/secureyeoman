import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { UserCircle, Plus, Pencil, Trash2, ShieldCheck, Loader2 } from 'lucide-react';
import { fetchUsers, createUser, updateUser, deleteUser } from '../api/client';
import type { UserInfo } from '../api/client';

function formatDate(ts: number) {
  return new Date(ts).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

interface CreateForm {
  email: string;
  displayName: string;
  password: string;
  isAdmin: boolean;
}

const EMPTY_CREATE: CreateForm = { email: '', displayName: '', password: '', isAdmin: false };

export function UsersSettings() {
  const queryClient = useQueryClient();

  const [showCreateForm, setShowCreateForm] = useState(false);
  const [editingUser, setEditingUser] = useState<UserInfo | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<UserInfo | null>(null);
  const [createForm, setCreateForm] = useState<CreateForm>(EMPTY_CREATE);
  const [editDisplayName, setEditDisplayName] = useState('');
  const [editIsAdmin, setEditIsAdmin] = useState(false);

  const { data: usersData, isLoading } = useQuery({
    queryKey: ['auth-users'],
    queryFn: fetchUsers,
  });

  const users = usersData?.users ?? [];

  const invalidate = () => void queryClient.invalidateQueries({ queryKey: ['auth-users'] });

  const createMutation = useMutation({
    mutationFn: (data: CreateForm) => createUser(data),
    onSuccess: () => {
      invalidate();
      setShowCreateForm(false);
      setCreateForm(EMPTY_CREATE);
    },
  });

  const updateMutation = useMutation({
    mutationFn: ({ id, data }: { id: string; data: { displayName?: string; isAdmin?: boolean } }) =>
      updateUser(id, data),
    onSuccess: () => {
      invalidate();
      setEditingUser(null);
    },
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => deleteUser(id),
    onSuccess: () => {
      invalidate();
      setConfirmDelete(null);
    },
  });

  const startEdit = (user: UserInfo) => {
    setEditingUser(user);
    setEditDisplayName(user.displayName);
    setEditIsAdmin(user.isAdmin);
  };

  return (
    <div className="space-y-6">
      <div className="card">
        <div className="p-4 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2">
            <UserCircle className="w-4 h-4" />
            <h3 className="font-medium text-sm">Users</h3>
          </div>
          {!showCreateForm && !editingUser && (
            <button
              onClick={() => {
                setShowCreateForm(true);
              }}
              className="btn btn-ghost text-sm flex items-center gap-1"
            >
              <Plus className="w-4 h-4" />
              Add User
            </button>
          )}
        </div>

        {/* ── Create form ── */}
        {showCreateForm && (
          <div className="p-4 border-b border-border">
            <div className="p-3 rounded-lg bg-muted/30 space-y-3">
              <h4 className="text-sm font-medium">New User</h4>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Email</label>
                  <input
                    type="email"
                    value={createForm.email}
                    onChange={(e) => {
                      setCreateForm((f) => ({ ...f, email: e.target.value }));
                    }}
                    className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="user@example.com"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Display Name</label>
                  <input
                    type="text"
                    value={createForm.displayName}
                    onChange={(e) => {
                      setCreateForm((f) => ({ ...f, displayName: e.target.value }));
                    }}
                    className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="Jane Doe"
                  />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Password</label>
                  <input
                    type="password"
                    value={createForm.password}
                    onChange={(e) => {
                      setCreateForm((f) => ({ ...f, password: e.target.value }));
                    }}
                    className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                    placeholder="••••••••"
                  />
                </div>
                <div className="flex items-center gap-2 pt-4">
                  <input
                    id="create-isAdmin"
                    type="checkbox"
                    checked={createForm.isAdmin}
                    onChange={(e) => {
                      setCreateForm((f) => ({ ...f, isAdmin: e.target.checked }));
                    }}
                    className="w-4 h-4"
                  />
                  <label htmlFor="create-isAdmin" className="text-xs text-muted-foreground">
                    Admin
                  </label>
                </div>
              </div>
              {createMutation.error && (
                <p className="text-xs text-destructive">{createMutation.error.message}</p>
              )}
              <div className="flex gap-2">
                <button
                  onClick={() => {
                    createMutation.mutate(createForm);
                  }}
                  disabled={createMutation.isPending}
                  className="btn btn-ghost text-sm px-3 py-1"
                >
                  {createMutation.isPending ? (
                    <Loader2 className="w-3 h-3 animate-spin" />
                  ) : (
                    'Create'
                  )}
                </button>
                <button
                  onClick={() => {
                    setShowCreateForm(false);
                    setCreateForm(EMPTY_CREATE);
                  }}
                  className="btn btn-ghost text-sm px-3 py-1"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── User list ── */}
        <div className="divide-y divide-border">
          {isLoading ? (
            <div className="p-4 text-sm text-muted-foreground flex items-center gap-2">
              <Loader2 className="w-4 h-4 animate-spin" />
              Loading users...
            </div>
          ) : users.length === 0 ? (
            <div className="p-4 text-sm text-muted-foreground">No users found.</div>
          ) : (
            users.map((user) => (
              <div key={user.id} className="p-4 space-y-3">
                {/* ── Inline edit form ── */}
                {editingUser?.id === user.id ? (
                  <div className="p-3 rounded-lg bg-muted/30 space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground block mb-1">
                          Display Name
                        </label>
                        <input
                          type="text"
                          value={editDisplayName}
                          onChange={(e) => {
                            setEditDisplayName(e.target.value);
                          }}
                          className="px-2 py-1 rounded border bg-background text-foreground text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary"
                        />
                      </div>
                      <div className="flex items-center gap-2 pt-4">
                        <input
                          id={`edit-admin-${user.id}`}
                          type="checkbox"
                          checked={editIsAdmin}
                          onChange={(e) => {
                            setEditIsAdmin(e.target.checked);
                          }}
                          className="w-4 h-4"
                        />
                        <label
                          htmlFor={`edit-admin-${user.id}`}
                          className="text-xs text-muted-foreground"
                        >
                          Admin
                        </label>
                      </div>
                    </div>
                    {updateMutation.error && (
                      <p className="text-xs text-destructive">{updateMutation.error.message}</p>
                    )}
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          updateMutation.mutate({
                            id: user.id,
                            data: { displayName: editDisplayName, isAdmin: editIsAdmin },
                          });
                        }}
                        disabled={updateMutation.isPending}
                        className="btn btn-ghost text-sm px-3 py-1"
                      >
                        {updateMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Save'
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setEditingUser(null);
                        }}
                        className="btn btn-ghost text-sm px-3 py-1"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  /* ── User row ── */
                  <div className="flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      <UserCircle className="w-8 h-8 text-muted shrink-0" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-sm font-medium truncate">{user.displayName}</span>
                          {user.isAdmin && (
                            <span className="flex items-center gap-1 text-xs text-yellow-400 shrink-0">
                              <ShieldCheck className="w-3 h-3" />
                              Admin
                            </span>
                          )}
                          {user.isBuiltin && (
                            <span className="text-xs text-muted bg-surface border border-border rounded px-1.5 py-0.5 shrink-0">
                              built-in
                            </span>
                          )}
                        </div>
                        <p className="text-xs text-muted-foreground">{user.email}</p>
                        <p className="text-xs text-muted-foreground">
                          Joined {formatDate(user.createdAt)}
                          {user.lastLoginAt ? ` · Last login ${formatDate(user.lastLoginAt)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        onClick={() => {
                          startEdit(user);
                        }}
                        className="btn btn-ghost text-xs p-1.5"
                        title="Edit user"
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </button>
                      {!user.isBuiltin && (
                        <button
                          onClick={() => {
                            setConfirmDelete(user);
                          }}
                          className="btn btn-ghost text-xs p-1.5 text-destructive hover:text-destructive"
                          title="Delete user"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {/* ── Delete confirmation ── */}
                {confirmDelete?.id === user.id && (
                  <div className="p-3 bg-destructive/10 border border-destructive/30 rounded space-y-2">
                    <p className="text-xs text-destructive">
                      Delete user <strong>{user.displayName}</strong>? This cannot be undone.
                    </p>
                    <div className="flex gap-2">
                      <button
                        onClick={() => {
                          deleteMutation.mutate(user.id);
                        }}
                        disabled={deleteMutation.isPending}
                        className="btn btn-destructive text-xs px-3 py-1.5"
                      >
                        {deleteMutation.isPending ? (
                          <Loader2 className="w-3 h-3 animate-spin" />
                        ) : (
                          'Delete'
                        )}
                      </button>
                      <button
                        onClick={() => {
                          setConfirmDelete(null);
                        }}
                        className="btn btn-ghost text-xs px-3 py-1.5"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
}
