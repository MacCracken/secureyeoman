/**
 * useCanvasShortcuts — Keyboard shortcut hook for the canvas workspace.
 *
 * Shortcuts:
 *  - Cmd/Ctrl+1..9  Focus widget by position order (left-to-right, top-to-bottom)
 *  - Cmd/Ctrl+W     Close focused widget
 *  - Cmd/Ctrl+N     Open widget catalog
 *  - Cmd/Ctrl+S     Force-save layout
 *  - Escape          Exit fullscreen
 */

import { useEffect, useCallback } from 'react';
import type { Node } from 'reactflow';
import type { CanvasWidgetData } from './CanvasWidget';

export interface CanvasShortcutActions {
  /** Current nodes on the canvas */
  nodes: Node<CanvasWidgetData>[];
  /** Select/focus a node by ID */
  focusNode: (nodeId: string) => void;
  /** Close a node by ID */
  closeNode: (nodeId: string) => void;
  /** Toggle widget catalog open/closed */
  toggleCatalog: () => void;
  /** Force-save the layout */
  saveLayout: () => void;
  /** Currently selected node ID, if any */
  selectedNodeId: string | null;
}

/** Sort nodes by position: left-to-right, then top-to-bottom (50px row threshold). */
function sortNodesByPosition(nodes: Node<CanvasWidgetData>[]): Node<CanvasWidgetData>[] {
  return [...nodes].sort((a, b) => {
    const rowA = Math.floor(a.position.y / 50);
    const rowB = Math.floor(b.position.y / 50);
    if (rowA !== rowB) return rowA - rowB;
    return a.position.x - b.position.x;
  });
}

export function useCanvasShortcuts(actions: CanvasShortcutActions): void {
  const { nodes, focusNode, closeNode, toggleCatalog, saveLayout, selectedNodeId } = actions;

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      const mod = e.metaKey || e.ctrlKey;

      // Escape — exit fullscreen (let the fullscreen widget handle it via bubbling)
      if (e.key === 'Escape') {
        return; // Escape is handled by fullscreen overlay directly
      }

      if (!mod) return;

      // Don't intercept shortcuts when typing in an input
      const target = e.target as HTMLElement;
      if (
        target.tagName === 'INPUT' ||
        target.tagName === 'TEXTAREA' ||
        target.isContentEditable
      ) {
        return;
      }

      // Cmd/Ctrl+1..9 — focus widget by position order
      const digit = parseInt(e.key, 10);
      if (digit >= 1 && digit <= 9) {
        e.preventDefault();
        const sorted = sortNodesByPosition(nodes);
        const idx = digit - 1;
        if (idx < sorted.length) {
          focusNode(sorted[idx].id);
        }
        return;
      }

      switch (e.key.toLowerCase()) {
        case 'w':
          e.preventDefault();
          if (selectedNodeId) {
            closeNode(selectedNodeId);
          }
          break;
        case 'n':
          e.preventDefault();
          toggleCatalog();
          break;
        case 's':
          e.preventDefault();
          saveLayout();
          break;
      }
    },
    [nodes, focusNode, closeNode, toggleCatalog, saveLayout, selectedNodeId]
  );

  useEffect(() => {
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [handleKeyDown]);
}

export { sortNodesByPosition as _sortNodesByPosition };
