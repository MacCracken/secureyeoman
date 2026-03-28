/* eslint-disable react-refresh/only-export-components */
/**
 * RbacManager — RBAC roles CRUD, user-role assignments.
 *
 * Extracted from SecuritySettings.tsx (behavior-preserving refactor).
 */

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Shield, Lock, Loader2, Plus, Pen, Trash2, UserPlus } from 'lucide-react';
import {
  fetchRoles,
  createRole,
  updateRole,
  deleteRole,
  fetchAssignments,
  assignRole,
  revokeAssignment,
} from '../../api/client';
import type { RoleInfo, AssignmentInfo } from '../../api/client';
import { ConfirmDialog } from '../common/ConfirmDialog';

// ── Role Form ───────────────────────────────────────────────────────

export interface RoleFormData {
  name: string;
  description: string;
  permissions: string;
  inheritFrom: string;
}

export function RoleForm({
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
  const [form, setForm] = useState(
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
export function parsePermissions(raw: string): { resource: string; action: string }[] {
  return raw
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean)
    .map((s) => {
      const [resource, action] = s.split(':');
      return { resource: resource ?? s, action: action ?? '*' };
    });
}

export function formatPerm(p: { resource: string; action: string }): string {
  return `${p.resource}:${p.action}`;
}

// ── Roles Settings ──────────────────────────────────────────────────

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
