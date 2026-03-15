import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Clock, Edit2, Save } from 'lucide-react';
import { fetchHeartbeatTasks, updateHeartbeatTask } from '../../api/client';
import type { HeartbeatTask } from '../../types';
import { formatIntervalHuman, relativeTime, CollapsibleSection } from './shared';

export function HeartbeatTasksSection() {
  const queryClient = useQueryClient();
  const { data: tasksData } = useQuery({
    queryKey: ['heartbeatTasks'],
    queryFn: fetchHeartbeatTasks,
  });
  const tasks = tasksData?.tasks ?? [];

  const [editingTask, setEditingTask] = useState<string | null>(null);
  const [editFreqMinutes, setEditFreqMinutes] = useState(5);

  const updateMut = useMutation({
    mutationFn: ({
      name,
      data,
    }: {
      name: string;
      data: { intervalMs?: number; enabled?: boolean };
    }) => updateHeartbeatTask(name, data),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['heartbeatTasks'] });
      setEditingTask(null);
    },
  });

  const startEdit = (task: HeartbeatTask) => {
    setEditingTask(task.name);
    setEditFreqMinutes(Math.round((task.intervalMs ?? 60_000) / 60_000));
  };

  return (
    <div className="space-y-2">
      {tasks.length === 0 && (
        <p className="text-xs text-muted-foreground">No heartbeat tasks configured.</p>
      )}
      {tasks.map((task: HeartbeatTask) => (
        <div key={task.name} className="text-sm bg-muted px-3 py-2 rounded">
          {editingTask === task.name ? (
            <div className="space-y-2">
              <div className="flex items-center gap-2 flex-wrap">
                <strong>{task.name}</strong>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {task.type}
                </span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                <label className="text-xs">Frequency (minutes):</label>
                <input
                  type="number"
                  min={1}
                  max={1440}
                  value={editFreqMinutes}
                  onChange={(e) => {
                    setEditFreqMinutes(parseInt(e.target.value) || 1);
                  }}
                  className="w-20 px-2 py-1 text-sm rounded border bg-background"
                />
                <div className="flex-1" />
                <button
                  onClick={() => {
                    setEditingTask(null);
                  }}
                  className="btn btn-ghost text-xs px-2 py-1"
                >
                  Cancel
                </button>
                <button
                  onClick={() => {
                    updateMut.mutate({
                      name: task.name,
                      data: { intervalMs: editFreqMinutes * 60_000 },
                    });
                  }}
                  disabled={updateMut.isPending}
                  className="btn btn-ghost text-xs px-2 py-1 flex items-center gap-1"
                >
                  <Save className="w-3 h-3" /> Save
                </button>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <div className="flex items-center gap-2 flex-wrap flex-1 min-w-0">
                <strong>{task.name}</strong>
                <span className="text-[10px] uppercase px-1.5 py-0.5 rounded bg-accent text-accent-foreground">
                  {task.type}
                </span>
                <span
                  className={`text-[10px] uppercase px-1.5 py-0.5 rounded ${
                    task.enabled ? 'bg-success/20 text-success' : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {task.enabled ? 'Enabled' : 'Disabled'}
                </span>
                <span className="text-xs text-muted-foreground flex items-center gap-1">
                  <Clock className="w-3 h-3" />
                  every {formatIntervalHuman(task.intervalMs ?? 60_000)}
                </span>
                <span className="text-xs text-muted-foreground">
                  last: {task.lastRunAt ? relativeTime(task.lastRunAt) : 'never'}
                </span>
                {task.type === 'reflective_task' && task.config?.prompt != null && (
                  <span className="text-xs italic text-muted-foreground truncate max-w-48">{`\u201C${String(task.config.prompt)}\u201D`}</span>
                )}
              </div>
              <div className="flex items-center gap-1 flex-shrink-0">
                <label
                  className="relative inline-flex items-center cursor-pointer"
                  title={task.enabled ? 'Enabled' : 'Disabled'}
                >
                  <input
                    type="checkbox"
                    checked={task.enabled}
                    onChange={() => {
                      updateMut.mutate({ name: task.name, data: { enabled: !task.enabled } });
                    }}
                    className="sr-only peer"
                  />
                  <div className="w-8 h-4 bg-muted-foreground/30 peer-checked:bg-primary rounded-full after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:rounded-full after:h-3 after:w-3 after:transition-all peer-checked:after:translate-x-4"></div>
                </label>
                <button
                  onClick={() => {
                    startEdit(task);
                  }}
                  className="btn-ghost p-1 text-muted-foreground hover:text-foreground"
                  title="Edit frequency"
                >
                  <Edit2 className="w-3 h-3" />
                </button>
              </div>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}

export function HeartSection() {
  return (
    <CollapsibleSection title="Heart — Pulse">
      <div>
        <h4 className="text-sm font-medium mb-2">Heartbeat Tasks</h4>
        <HeartbeatTasksSection />
      </div>
    </CollapsibleSection>
  );
}
