/**
 * ObjectivesEditor — Editable list of department objectives with inline editing,
 * priority badges, add/delete controls.
 */

import { useState } from 'react';
import { Plus, X, Target } from 'lucide-react';

// ─── Types ───────────────────────────────────────────────────────────────────

type Priority = 'high' | 'medium' | 'low';

interface Objective {
  title: string;
  description?: string;
  priority: Priority;
}

interface ObjectivesEditorProps {
  objectives: Objective[];
  onChange: (objectives: Objective[]) => void;
}

// ─── Constants ───────────────────────────────────────────────────────────────

const PRIORITY_BADGE: Record<Priority, string> = {
  high: 'bg-red-100 text-red-700 border-red-200',
  medium: 'bg-yellow-100 text-yellow-700 border-yellow-200',
  low: 'bg-green-100 text-green-700 border-green-200',
};

const PRIORITY_OPTIONS: Priority[] = ['high', 'medium', 'low'];

// ─── Component ───────────────────────────────────────────────────────────────

export function ObjectivesEditor({ objectives, onChange }: ObjectivesEditorProps) {
  const [editingIndex, setEditingIndex] = useState<number | null>(null);

  function handleAdd() {
    const updated = [...objectives, { title: '', description: '', priority: 'medium' as Priority }];
    onChange(updated);
    setEditingIndex(updated.length - 1);
  }

  function handleDelete(index: number) {
    const updated = objectives.filter((_, i) => i !== index);
    onChange(updated);
    if (editingIndex === index) {
      setEditingIndex(null);
    } else if (editingIndex !== null && editingIndex > index) {
      setEditingIndex(editingIndex - 1);
    }
  }

  function handleUpdate(index: number, field: keyof Objective, value: string) {
    const updated = objectives.map((obj, i) => {
      if (i !== index) return obj;
      return { ...obj, [field]: value };
    });
    onChange(updated);
  }

  return (
    <div className="space-y-3" data-testid="objectives-editor">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="w-4 h-4 text-muted-foreground" />
          <h4 className="text-sm font-semibold">Objectives</h4>
          <span className="text-xs text-muted-foreground">({objectives.length})</span>
        </div>
        <button
          className="flex items-center gap-1 px-2 py-1 text-xs font-medium text-primary hover:bg-primary/10 rounded transition-colors"
          onClick={handleAdd}
        >
          <Plus className="w-3.5 h-3.5" />
          Add
        </button>
      </div>

      {/* Empty state */}
      {objectives.length === 0 && (
        <div className="text-center py-6 text-muted-foreground">
          <p className="text-sm">No objectives defined. Click Add to create one.</p>
        </div>
      )}

      {/* Objectives list */}
      <div className="space-y-2">
        {objectives.map((obj, index) => {
          const isEditing = editingIndex === index;

          return (
            <div key={index} className="border border-border rounded-lg bg-base-100 px-3 py-2">
              {isEditing ? (
                /* ─── Editing mode ─── */
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <input
                      type="text"
                      className="flex-1 text-sm border border-border rounded px-2 py-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary"
                      placeholder="Objective title"
                      value={obj.title}
                      onChange={(e) => {
                        handleUpdate(index, 'title', e.target.value);
                      }}
                      autoFocus
                    />
                    <select
                      className="text-xs border border-border rounded px-2 py-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary"
                      value={obj.priority}
                      onChange={(e) => {
                        handleUpdate(index, 'priority', e.target.value);
                      }}
                    >
                      {PRIORITY_OPTIONS.map((p) => (
                        <option key={p} value={p}>
                          {p.charAt(0).toUpperCase() + p.slice(1)}
                        </option>
                      ))}
                    </select>
                    <button
                      className="text-red-500 hover:text-red-700 transition-colors p-0.5"
                      onClick={() => {
                        handleDelete(index);
                      }}
                      title="Delete objective"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                  <textarea
                    className="w-full text-xs border border-border rounded px-2 py-1 bg-transparent focus:outline-none focus:ring-1 focus:ring-primary resize-none"
                    placeholder="Description (optional)"
                    rows={2}
                    value={obj.description ?? ''}
                    onChange={(e) => {
                      handleUpdate(index, 'description', e.target.value);
                    }}
                  />
                  <button
                    className="text-xs text-primary hover:underline"
                    onClick={() => {
                      setEditingIndex(null);
                    }}
                  >
                    Done
                  </button>
                </div>
              ) : (
                /* ─── View mode ─── */
                <div
                  className="flex items-center gap-2 cursor-pointer group"
                  onClick={() => {
                    setEditingIndex(index);
                  }}
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-medium truncate">
                        {obj.title || '(untitled)'}
                      </span>
                      <span
                        className={`inline-flex px-1.5 py-0.5 rounded text-xs font-medium border ${PRIORITY_BADGE[obj.priority]}`}
                      >
                        {obj.priority}
                      </span>
                    </div>
                    {obj.description && (
                      <p className="text-xs text-muted-foreground mt-0.5 truncate">
                        {obj.description}
                      </p>
                    )}
                  </div>
                  <button
                    className="text-red-500 hover:text-red-700 opacity-0 group-hover:opacity-100 transition-opacity p-0.5"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(index);
                    }}
                    title="Delete objective"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
