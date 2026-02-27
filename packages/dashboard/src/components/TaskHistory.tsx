/**
 * Open Tasks Component
 *
 * Live view of active (pending + running) task executions with filtering by status/type.
 * Create, edit, and delete tasks. Used in Automation page (Tasks tab).
 */

import { useState, useCallback, useEffect } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import {
  Clock,
  CheckCircle,
  XCircle,
  AlertTriangle,
  Loader2,
  Filter,
  Calendar,
  Plus,
  X,
  Edit2,
  Trash2,
} from 'lucide-react';
import { fetchTasks, createTask, deleteTask, updateTask, fetchPersonalities } from '../api/client';
import { ConfirmDialog } from './common/ConfirmDialog';
import type { Task } from '../types';
import { sanitizeText } from '../utils/sanitize';

const STATUS_ICONS: Record<string, React.ReactNode> = {
  completed: <CheckCircle className="w-4 h-4 text-success" />,
  failed: <XCircle className="w-4 h-4 text-destructive" />,
  timeout: <AlertTriangle className="w-4 h-4 text-warning" />,
  running: <Loader2 className="w-4 h-4 text-info animate-spin" />,
  pending: <Clock className="w-4 h-4 text-muted-foreground" />,
  cancelled: <XCircle className="w-4 h-4 text-muted-foreground" />,
};

const STATUS_COLORS: Record<string, string> = {
  completed: 'badge-success',
  failed: 'badge-error',
  timeout: 'badge-warning',
  running: 'badge-info',
  pending: 'badge',
  cancelled: 'badge',
};

const TYPE_OPTIONS = ['execute', 'query', 'file', 'network', 'system'] as const;

const DATE_PRESETS = [
  {
    label: 'Last hour',
    from: () => new Date(Date.now() - 3_600_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  {
    label: 'Last 24h',
    from: () => new Date(Date.now() - 86_400_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  {
    label: 'Last 7 days',
    from: () => new Date(Date.now() - 604_800_000).toISOString(),
    to: () => new Date().toISOString(),
  },
  { label: 'All time', from: () => '', to: () => '' },
] as const;

export function OpenTasks() {
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const [datePreset, setDatePreset] = useState('');

  const statusFilter = searchParams.get('status') ?? '';
  const typeFilter = searchParams.get('type') ?? '';
  const dateFrom = searchParams.get('from') ?? '';
  const dateTo = searchParams.get('to') ?? '';

  // Create task dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [newTask, setNewTask] = useState({
    name: '',
    type: 'execute',
    description: '',
    input: '',
  });

  const updateParams = useCallback(
    (updates: Record<string, string>) => {
      setSearchParams((prev) => {
        const next = new URLSearchParams(prev);
        for (const [key, value] of Object.entries(updates)) {
          if (value) {
            next.set(key, value);
          } else {
            next.delete(key);
          }
        }
        return next;
      });
    },
    [setSearchParams]
  );

  const { data, isLoading } = useQuery({
    queryKey: ['tasks', statusFilter, typeFilter, dateFrom, dateTo],
    queryFn: () =>
      fetchTasks({
        status: statusFilter || undefined,
        type: typeFilter || undefined,
        from: dateFrom || undefined,
        to: dateTo || undefined,
        limit: 200,
        offset: 0,
      }),
    staleTime: 0,
    refetchInterval: (query) => {
      const tasks = (query.state.data as { tasks: Task[] } | undefined)?.tasks ?? [];
      const hasActive = tasks.some((t) => t.status === 'pending' || t.status === 'running');
      return hasActive ? 2000 : false;
    },
  });

  const { data: personalitiesData } = useQuery({
    queryKey: ['personalities'],
    queryFn: fetchPersonalities,
    staleTime: 60000,
  });
  const personalityMap = new Map<string, string>(
    (personalitiesData?.personalities ?? []).map((p) => [p.id, p.name])
  );

  const createTaskMutation = useMutation({
    mutationFn: (data: { name: string; type?: string; description?: string; input?: unknown }) =>
      createTask(data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setShowCreateDialog(false);
      setNewTask({ name: '', type: 'execute', description: '', input: '' });
    },
  });

  const deleteTaskMutation = useMutation({
    mutationFn: (id: string) => deleteTask(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
    },
  });

  const updateTaskMutation = useMutation({
    mutationFn: ({
      id,
      data,
    }: {
      id: string;
      data: { name?: string; type?: string; description?: string };
    }) => updateTask(id, data),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['tasks'] });
      setEditTask(null);
    },
  });

  const [editTask, setEditTask] = useState<Task | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);

  // Handle query params for quick create from sidebar
  useEffect(() => {
    if (searchParams.get('create') === 'true') {
      const pName = searchParams.get('name') || '';
      const pType = searchParams.get('type') || 'execute';
      const pDescription = searchParams.get('description') || '';
      const pInput = searchParams.get('input') || '';
      if (pName) {
        setNewTask({ name: pName, type: pType, description: pDescription, input: pInput });
        let parsedInput: unknown;
        try {
          parsedInput = pInput ? JSON.parse(pInput) : undefined;
        } catch {
          parsedInput = undefined;
        }
        setTimeout(() => {
          createTaskMutation.mutate({
            name: pName,
            type: pType,
            description: pDescription || undefined,
            input: parsedInput,
          });
        }, 0);
      }
      setSearchParams({}, { replace: true });
    }
  }, [searchParams, setSearchParams, createTaskMutation]);

  // Show only active tasks when no specific status filter is set
  const allTasks = data?.tasks ?? [];
  const tasks = statusFilter
    ? allTasks
    : allTasks.filter((t) => t.status === 'pending' || t.status === 'running');

  const hasFilters = statusFilter || typeFilter || dateFrom || dateTo;
  const resetFilters = () => {
    setSearchParams({});
    setDatePreset('');
  };

  const handleDatePreset = (preset: (typeof DATE_PRESETS)[number]) => {
    const from = preset.from();
    const to = preset.to();
    setDatePreset(preset.label);
    updateParams({ from, to });
  };

  const handleCustomDate = (field: 'from' | 'to', value: string) => {
    updateParams({ [field]: value ? new Date(value).toISOString() : '' });
    setDatePreset('');
  };

  return (
    <div className="space-y-4">
      {/* Create Task Dialog */}
      {showCreateDialog && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Create New Task</h3>
              <button
                onClick={() => {
                  setShowCreateDialog(false);
                }}
                className="btn-ghost p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={newTask.name}
                  onChange={(e) => {
                    setNewTask({ ...newTask, name: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                  placeholder="e.g., Run backup"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={newTask.type}
                  onChange={(e) => {
                    setNewTask({ ...newTask, type: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={newTask.description}
                  onChange={(e) => {
                    setNewTask({ ...newTask, description: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                  placeholder="Optional description"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Input (JSON)</label>
                <textarea
                  value={newTask.input}
                  onChange={(e) => {
                    setNewTask({ ...newTask, input: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background font-mono text-sm"
                  rows={3}
                  placeholder='{"key": "value"}'
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setShowCreateDialog(false);
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    let parsedInput: unknown;
                    try {
                      parsedInput = newTask.input ? JSON.parse(newTask.input) : undefined;
                    } catch {
                      return; // Invalid JSON — do not submit
                    }
                    createTaskMutation.mutate({
                      name: newTask.name,
                      type: newTask.type,
                      description: newTask.description || undefined,
                      input: parsedInput,
                    });
                  }}
                  disabled={!newTask.name.trim() || createTaskMutation.isPending}
                  className="btn btn-ghost"
                >
                  {createTaskMutation.isPending ? 'Creating...' : 'Create Task'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={deleteTarget !== null}
        title="Delete Task"
        message={deleteTarget ? `Are you sure you want to delete "${deleteTarget.name}"?` : ''}
        confirmLabel="Delete"
        destructive
        onConfirm={() => {
          if (deleteTarget) deleteTaskMutation.mutate(deleteTarget.id);
          setDeleteTarget(null);
        }}
        onCancel={() => {
          setDeleteTarget(null);
        }}
      />

      {/* Edit Task Dialog */}
      {editTask && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-background border rounded-lg p-6 w-full max-w-md shadow-lg">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-semibold">Edit Task</h3>
              <button
                onClick={() => {
                  setEditTask(null);
                }}
                className="btn-ghost p-1 rounded"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1">Name *</label>
                <input
                  type="text"
                  value={editTask.name}
                  onChange={(e) => {
                    setEditTask({ ...editTask, name: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                />
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Type</label>
                <select
                  value={editTask.type}
                  onChange={(e) => {
                    setEditTask({ ...editTask, type: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                >
                  {TYPE_OPTIONS.map((t) => (
                    <option key={t} value={t}>
                      {t}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium mb-1">Description</label>
                <input
                  type="text"
                  value={editTask.description || ''}
                  onChange={(e) => {
                    setEditTask({ ...editTask, description: e.target.value });
                  }}
                  className="w-full px-3 py-2 rounded border bg-background"
                />
              </div>
              <div className="flex justify-end gap-2 pt-2">
                <button
                  onClick={() => {
                    setEditTask(null);
                  }}
                  className="btn btn-ghost"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateTaskMutation.mutate({
                      id: editTask.id,
                      data: {
                        name: editTask.name,
                        type: editTask.type,
                        description: editTask.description || undefined,
                      },
                    });
                  }}
                  disabled={!editTask.name.trim() || updateTaskMutation.isPending}
                  className="btn btn-ghost"
                >
                  {updateTaskMutation.isPending ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Header + Filters */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-lg font-semibold">Open Tasks</h2>
          <button
            onClick={() => {
              setShowCreateDialog(true);
            }}
            className="btn btn-ghost text-sm px-3 py-1.5 flex items-center gap-1"
          >
            <Plus className="w-4 h-4" />
            New Task
          </button>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Filter className="w-4 h-4 text-muted-foreground" />

          {/* Status filter — active statuses only */}
          <select
            value={statusFilter}
            onChange={(e) => {
              updateParams({ status: e.target.value });
            }}
            className="px-3 py-1.5 text-sm border rounded-md bg-background"
            aria-label="Filter by status"
          >
            <option value="">All Active</option>
            <option value="pending">Pending</option>
            <option value="running">In Progress</option>
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => {
              updateParams({ type: e.target.value });
            }}
            className="px-3 py-1.5 text-sm border rounded-md bg-background"
            aria-label="Filter by type"
          >
            <option value="">All Types</option>
            {TYPE_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>

          {/* Clear filters */}
          {hasFilters && (
            <button
              onClick={resetFilters}
              className="text-xs text-muted-foreground hover:text-foreground underline"
            >
              Clear
            </button>
          )}
        </div>
      </div>

      {/* Date Range Filter */}
      <div className="flex items-center gap-2 flex-wrap">
        <Calendar className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        {DATE_PRESETS.map((preset) => (
          <button
            key={preset.label}
            onClick={() => {
              handleDatePreset(preset);
            }}
            className={`px-2.5 py-1 rounded-md text-xs border transition-colors ${
              datePreset === preset.label
                ? 'bg-primary text-primary-foreground border-primary'
                : 'border-border bg-background hover:bg-muted'
            }`}
          >
            {preset.label}
          </button>
        ))}
        <span className="text-muted-foreground text-xs">or</span>
        <input
          type="date"
          value={dateFrom ? dateFrom.slice(0, 10) : ''}
          onChange={(e) => {
            handleCustomDate('from', e.target.value);
          }}
          className="px-2 py-1 text-xs border rounded-md bg-background"
          aria-label="From date"
        />
        <span className="text-muted-foreground text-xs">–</span>
        <input
          type="date"
          value={dateTo ? dateTo.slice(0, 10) : ''}
          onChange={(e) => {
            handleCustomDate('to', e.target.value);
          }}
          className="px-2 py-1 text-xs border rounded-md bg-background"
          aria-label="To date"
        />
      </div>

      {/* Task Table */}
      <div className="card overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="bg-muted/50">
              <tr>
                <th className="px-2 py-2 text-left font-medium text-xs hidden md:table-cell">
                  Agent
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs hidden sm:table-cell">ID</th>
                <th className="px-2 py-2 text-left font-medium text-xs">Name</th>
                <th className="px-2 py-2 text-left font-medium text-xs hidden lg:table-cell">
                  Sub-Agent
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs hidden md:table-cell">
                  Type
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs">Status</th>
                <th className="px-2 py-2 text-left font-medium text-xs hidden lg:table-cell">
                  Duration
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs hidden sm:table-cell">
                  Created
                </th>
                <th className="px-2 py-2 text-left font-medium text-xs w-20">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {isLoading ? (
                <tr>
                  <td colSpan={9} className="px-2 py-8 text-center text-muted-foreground">
                    <Loader2 className="w-6 h-6 mx-auto animate-spin" />
                    <p className="mt-2">Loading tasks...</p>
                  </td>
                </tr>
              ) : tasks.length === 0 ? (
                <tr>
                  <td colSpan={9} className="px-2 py-8 text-center text-muted-foreground">
                    No active tasks
                  </td>
                </tr>
              ) : (
                tasks.map((task) => (
                  <TaskRow
                    key={task.id}
                    task={task}
                    personalityMap={personalityMap}
                    onEdit={setEditTask}
                    onDelete={(t) => {
                      setDeleteTarget(t);
                    }}
                  />
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

function TaskRow({
  task,
  personalityMap,
  onEdit,
  onDelete,
}: {
  task: Task;
  personalityMap: Map<string, string>;
  onEdit?: (task: Task) => void;
  onDelete?: (task: Task) => void;
}) {
  const formatDuration = (ms?: number) => {
    if (ms == null) return '-';
    if (ms < 1) return '<1ms';
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}m`;
  };

  const formatTime = (timestamp: number) => {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();

    if (diffMs < 60000) return 'Just now';
    if (diffMs < 3600000) return `${Math.floor(diffMs / 60000)}m ago`;
    if (diffMs < 86400000) return `${Math.floor(diffMs / 3600000)}h ago`;
    return date.toLocaleDateString();
  };

  return (
    <tr className="hover:bg-muted/30 transition-colors">
      <td className="px-2 py-3 text-xs hidden md:table-cell">
        {(() => {
          const pId = task.securityContext?.personalityId;
          const pName =
            task.securityContext?.personalityName ??
            (pId ? (personalityMap.get(pId) ?? null) : null);
          if (pName) {
            return (
              <span className="px-1.5 py-0.5 bg-primary/10 text-primary rounded text-xs">
                {pName}
              </span>
            );
          }
          return <span className="text-muted-foreground/40">—</span>;
        })()}
      </td>
      <td className="px-2 py-3 font-mono text-xs hidden sm:table-cell">{task.id.slice(0, 8)}...</td>
      <td className="px-2 py-3">
        <div className="font-medium text-sm">{sanitizeText(task.name)}</div>
        {task.description && (
          <div className="text-xs text-muted-foreground truncate max-w-[120px] sm:max-w-xs">
            {sanitizeText(task.description)}
          </div>
        )}
      </td>
      <td className="px-2 py-3 text-xs hidden lg:table-cell">
        {task.parentTaskId ? (
          <span
            className="px-1.5 py-0.5 bg-muted text-muted-foreground rounded font-mono text-xs"
            title={task.parentTaskId}
          >
            ↳ {task.parentTaskId.slice(0, 8)}…
          </span>
        ) : (
          <span className="text-muted-foreground/40">—</span>
        )}
      </td>
      <td className="px-2 py-3 hidden md:table-cell">
        <span className="px-1.5 py-0.5 text-xs bg-muted rounded">{task.type}</span>
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-1.5">
          {STATUS_ICONS[task.status]}
          <span className={`text-xs ${STATUS_COLORS[task.status]}`}>{task.status}</span>
        </div>
        {task.result?.error && (
          <div className="text-xs text-destructive mt-1 truncate max-w-[100px]">
            {task.result.error.message}
          </div>
        )}
      </td>
      <td className="px-2 py-3 font-mono text-xs hidden lg:table-cell">
        {formatDuration(task.durationMs)}
      </td>
      <td className="px-2 py-3 text-muted-foreground text-xs hidden sm:table-cell">
        {formatTime(task.createdAt)}
      </td>
      <td className="px-2 py-3">
        <div className="flex items-center gap-1">
          {onEdit && (
            <button
              onClick={() => {
                onEdit(task);
              }}
              className="btn-ghost p-1.5 rounded"
              title="Edit task"
            >
              <Edit2 className="w-3.5 h-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={() => {
                onDelete(task);
              }}
              className="btn-ghost p-1.5 rounded text-destructive hover:text-destructive"
              title="Delete task"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
          )}
        </div>
      </td>
    </tr>
  );
}
