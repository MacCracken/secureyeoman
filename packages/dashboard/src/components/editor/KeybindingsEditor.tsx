import { useState } from 'react';
import { RotateCcw, Keyboard, AlertTriangle } from 'lucide-react';
import { useKeybindings, eventToShortcut, type KeyBinding } from '../../hooks/useKeybindings';

const CATEGORY_LABELS: Record<string, string> = {
  file: 'File',
  editor: 'Editor',
  panel: 'Panel',
  navigation: 'Navigation',
  terminal: 'Terminal',
};

const CATEGORY_ORDER = ['file', 'editor', 'panel', 'terminal', 'navigation'];

interface KeyCaptureProps {
  binding: KeyBinding;
  onCapture: (shortcut: string) => void;
  onCancel: () => void;
  conflict: string | null;
}

function KeyCapture({ binding, onCapture, onCancel, conflict }: KeyCaptureProps) {
  const [captured, setCaptured] = useState('');

  return (
    <div className="flex items-center gap-2">
      {/* eslint-disable-next-line jsx-a11y/no-autofocus */}
      <input
        autoFocus
        readOnly
        value={captured || 'Press keys...'}
        className={`w-36 text-xs font-mono px-2 py-1 rounded border focus:outline-none focus:ring-1 ${
          conflict
            ? 'border-yellow-500 focus:ring-yellow-500 bg-yellow-500/5'
            : 'border-primary focus:ring-primary bg-card'
        }`}
        onKeyDown={(e) => {
          e.preventDefault();
          e.stopPropagation();
          const shortcut = eventToShortcut(e);
          if (shortcut) setCaptured(shortcut);
        }}
        data-testid={`keycapture-${binding.id}`}
      />
      {conflict && (
        <span className="flex items-center gap-1 text-[10px] text-yellow-600">
          <AlertTriangle className="w-3 h-3" />
          Conflicts
        </span>
      )}
      <button
        onClick={() => {
          if (captured) onCapture(captured);
        }}
        disabled={!captured}
        className="text-[10px] px-2 py-1 rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
      >
        Save
      </button>
      <button
        onClick={onCancel}
        className="text-[10px] px-2 py-1 rounded border border-border hover:bg-muted"
      >
        Cancel
      </button>
    </div>
  );
}

interface KeybindingsEditorProps {
  open: boolean;
  onClose: () => void;
}

export function KeybindingsEditor({ open, onClose }: KeybindingsEditorProps) {
  const { bindings, setBinding, resetBinding, resetAll, findConflict } = useKeybindings();
  const [editingId, setEditingId] = useState<string | null>(null);
  const [pendingShortcut, setPendingShortcut] = useState('');

  if (!open) return null;

  // Group by category
  const groups = CATEGORY_ORDER.map((cat) => ({
    category: cat,
    items: bindings.filter((b) => b.category === cat),
  })).filter((g) => g.items.length > 0);

  const conflict = editingId && pendingShortcut ? findConflict(editingId, pendingShortcut) : null;
  const conflictLabel = conflict ? (bindings.find((b) => b.id === conflict)?.label ?? null) : null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[10vh]"
      onClick={onClose}
      data-testid="keybindings-overlay"
    >
      <div className="absolute inset-0 bg-black/50" />
      <div
        className="relative w-full max-w-lg bg-card border border-border rounded-lg shadow-2xl overflow-hidden"
        onClick={(e) => {
          e.stopPropagation();
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b">
          <div className="flex items-center gap-2">
            <Keyboard className="w-4 h-4 text-primary" />
            <h2 className="text-sm font-semibold">Keyboard Shortcuts</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={resetAll}
              className="flex items-center gap-1 text-[10px] px-2 py-1 rounded border border-border text-muted-foreground hover:text-foreground hover:bg-muted"
              title="Reset all to defaults"
              data-testid="reset-all"
            >
              <RotateCcw className="w-3 h-3" />
              Reset All
            </button>
            <button
              onClick={onClose}
              className="text-muted-foreground hover:text-foreground text-lg leading-none px-1"
              aria-label="Close"
            >
              &times;
            </button>
          </div>
        </div>

        {/* Bindings list */}
        <div
          className="max-h-[60vh] overflow-y-auto px-4 py-2 space-y-3"
          data-testid="keybindings-list"
        >
          {groups.map((group) => (
            <div key={group.category}>
              <div className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider mb-1.5">
                {CATEGORY_LABELS[group.category]}
              </div>
              <div className="space-y-1">
                {group.items.map((binding) => (
                  <div
                    key={binding.id}
                    className="flex items-center justify-between py-1.5 px-2 rounded hover:bg-muted/30 group"
                    data-testid={`binding-row-${binding.id}`}
                  >
                    <span className="text-xs flex-1">{binding.label}</span>

                    {editingId === binding.id ? (
                      <KeyCapture
                        binding={binding}
                        conflict={conflictLabel}
                        onCapture={(shortcut) => {
                          setBinding(binding.id, shortcut);
                          setEditingId(null);
                          setPendingShortcut('');
                        }}
                        onCancel={() => {
                          setEditingId(null);
                          setPendingShortcut('');
                        }}
                      />
                    ) : (
                      <div className="flex items-center gap-1.5">
                        {binding.shortcut ? (
                          <kbd className="text-[10px] font-mono text-muted-foreground bg-muted px-1.5 py-0.5 rounded border min-w-[60px] text-center">
                            {binding.shortcut}
                          </kbd>
                        ) : (
                          <span className="text-[10px] text-muted-foreground/50 italic min-w-[60px] text-center">
                            unset
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setEditingId(binding.id);
                            setPendingShortcut('');
                          }}
                          className="text-[10px] text-primary opacity-0 group-hover:opacity-100 transition-opacity px-1"
                          data-testid={`edit-${binding.id}`}
                        >
                          Edit
                        </button>
                        {binding.shortcut !== binding.defaultShortcut && (
                          <button
                            onClick={() => {
                              resetBinding(binding.id);
                            }}
                            className="opacity-0 group-hover:opacity-100 transition-opacity"
                            title="Reset to default"
                            data-testid={`reset-${binding.id}`}
                          >
                            <RotateCcw className="w-3 h-3 text-muted-foreground hover:text-foreground" />
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>

        {/* Footer hint */}
        <div className="px-4 py-2 border-t text-[10px] text-muted-foreground">
          Click Edit, then press a key combination to rebind. Changes are saved to localStorage.
        </div>
      </div>
    </div>
  );
}
