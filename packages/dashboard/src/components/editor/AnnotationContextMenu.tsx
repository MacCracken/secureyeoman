/**
 * AnnotationContextMenu — Monaco editor context menu action for training annotations.
 *
 * Adds "Add to Training Dataset" to the right-click context menu.
 * Opens a small popover where the user selects a label and optional note.
 */

import { useState, useCallback, useRef, useEffect } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { createAnnotation, type Annotation } from '../../api/client.js';
import { Tag, X, Check } from 'lucide-react';

type MonacoEditor = import('monaco-editor').editor.IStandaloneCodeEditor;
type Monaco = typeof import('monaco-editor');

interface AnnotationPopoverProps {
  selectedText: string;
  filePath: string;
  startLine: number;
  endLine: number;
  personalityId?: string;
  position: { x: number; y: number };
  onClose: () => void;
}

const LABELS: Array<{ value: Annotation['label']; label: string; color: string }> = [
  { value: 'good', label: 'Good', color: 'bg-green-500' },
  { value: 'bad', label: 'Bad', color: 'bg-red-500' },
  { value: 'instruction', label: 'Instruction', color: 'bg-blue-500' },
  { value: 'response', label: 'Response', color: 'bg-purple-500' },
];

function AnnotationPopover({
  selectedText,
  filePath,
  startLine,
  endLine,
  personalityId,
  position,
  onClose,
}: AnnotationPopoverProps) {
  const [label, setLabel] = useState<Annotation['label']>('good');
  const [note, setNote] = useState('');
  const queryClient = useQueryClient();
  const ref = useRef<HTMLDivElement>(null);

  const mutation = useMutation({
    mutationFn: () =>
      createAnnotation({
        filePath,
        startLine,
        endLine,
        selectedText,
        label,
        note: note || undefined,
        personalityId,
      }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ['annotations'] });
      onClose();
    },
  });

  // Close on click outside
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        onClose();
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="fixed z-50 bg-popover border border-border rounded-lg shadow-lg p-3 w-64"
      style={{ left: position.x, top: position.y }}
      data-testid="annotation-popover"
    >
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium flex items-center gap-1">
          <Tag className="w-3 h-3" />
          Add to Training Data
        </span>
        <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
          <X className="w-3 h-3" />
        </button>
      </div>

      <div className="text-xs text-muted-foreground mb-2 truncate" title={selectedText}>
        {selectedText.slice(0, 80)}{selectedText.length > 80 ? '...' : ''}
      </div>

      <div className="flex gap-1 mb-2">
        {LABELS.map((l) => (
          <button
            key={l.value}
            onClick={() => setLabel(l.value)}
            className={`flex-1 px-1.5 py-1 text-xs rounded border transition-colors ${
              label === l.value
                ? 'border-primary bg-primary/10 text-primary'
                : 'border-border text-muted-foreground hover:text-foreground'
            }`}
          >
            {l.label}
          </button>
        ))}
      </div>

      <input
        className="w-full px-2 py-1 text-xs bg-muted/30 border border-border rounded mb-2 focus:outline-none focus:ring-1 focus:ring-primary"
        placeholder="Optional note..."
        value={note}
        onChange={(e) => setNote(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') mutation.mutate();
        }}
      />

      <button
        onClick={() => mutation.mutate()}
        disabled={mutation.isPending}
        className="w-full flex items-center justify-center gap-1 px-2 py-1.5 text-xs rounded bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
        data-testid="annotation-save-btn"
      >
        <Check className="w-3 h-3" />
        {mutation.isPending ? 'Saving...' : 'Save Annotation'}
      </button>
    </div>
  );
}

export function useAnnotationContextMenu(personalityId?: string | null) {
  const [popover, setPopover] = useState<AnnotationPopoverProps | null>(null);

  const registerAction = useCallback(
    (editor: MonacoEditor, monaco: Monaco) => {
      const action = editor.addAction({
        id: 'training.addAnnotation',
        label: 'Add to Training Dataset',
        contextMenuGroupId: 'navigation',
        contextMenuOrder: 99,
        keybindings: [monaco.KeyMod.CtrlCmd | monaco.KeyMod.Shift | monaco.KeyCode.KeyT],
        run: (ed) => {
          const selection = ed.getSelection();
          if (!selection || selection.isEmpty()) return;

          const model = ed.getModel();
          if (!model) return;

          const selectedText = model.getValueInRange(selection);
          if (!selectedText.trim()) return;

          // Get screen position for popover
          const coords = ed.getScrolledVisiblePosition(selection.getStartPosition());
          const domNode = ed.getDomNode();
          const rect = domNode?.getBoundingClientRect();
          const x = (rect?.left ?? 0) + (coords?.left ?? 100);
          const y = (rect?.top ?? 0) + (coords?.top ?? 100) + 20;

          setPopover({
            selectedText,
            filePath: (model as any).uri?.path ?? 'untitled',
            startLine: selection.startLineNumber,
            endLine: selection.endLineNumber,
            personalityId: personalityId ?? undefined,
            position: { x: Math.min(x, window.innerWidth - 280), y: Math.min(y, window.innerHeight - 300) },
            onClose: () => setPopover(null),
          });
        },
      });

      return action;
    },
    [personalityId]
  );

  const PopoverComponent = popover ? <AnnotationPopover {...popover} /> : null;

  return { registerAction, PopoverComponent };
}
