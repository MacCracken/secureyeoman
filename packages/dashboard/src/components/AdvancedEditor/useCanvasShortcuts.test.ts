import { describe, it, expect, vi, beforeEach } from 'vitest';
import { _sortNodesByPosition } from './useCanvasShortcuts';
import type { Node } from 'reactflow';
import type { CanvasWidgetData } from './CanvasWidget';

function makeNode(id: string, x: number, y: number): Node<CanvasWidgetData> {
  return {
    id,
    type: 'canvasWidget',
    position: { x, y },
    data: {
      widgetType: 'terminal',
      title: id,
      minimized: false,
      config: {},
    },
  };
}

describe('sortNodesByPosition', () => {
  it('sorts by row (y / 50) then by x within same row', () => {
    const nodes = [makeNode('c', 600, 20), makeNode('a', 20, 20), makeNode('b', 300, 20)];
    const sorted = _sortNodesByPosition(nodes);
    expect(sorted.map((n) => n.id)).toEqual(['a', 'b', 'c']);
  });

  it('sorts nodes in different rows by y position', () => {
    const nodes = [makeNode('bottom', 20, 200), makeNode('top', 20, 20)];
    const sorted = _sortNodesByPosition(nodes);
    expect(sorted.map((n) => n.id)).toEqual(['top', 'bottom']);
  });

  it('groups nodes within 50px y threshold into same row', () => {
    const nodes = [makeNode('right', 600, 30), makeNode('left', 20, 10)];
    const sorted = _sortNodesByPosition(nodes);
    // Both y values floor to row 0, so sorted by x
    expect(sorted.map((n) => n.id)).toEqual(['left', 'right']);
  });

  it('returns empty array for empty input', () => {
    expect(_sortNodesByPosition([])).toEqual([]);
  });

  it('does not mutate the original array', () => {
    const nodes = [makeNode('b', 200, 0), makeNode('a', 100, 0)];
    const original = [...nodes];
    _sortNodesByPosition(nodes);
    expect(nodes[0].id).toBe(original[0].id);
  });
});

describe('useCanvasShortcuts keyboard handler', () => {
  // We test the keyboard handler indirectly via document events
  // since useCanvasShortcuts uses document.addEventListener
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('is defined as a hook export', async () => {
    const mod = await import('./useCanvasShortcuts');
    expect(typeof mod.useCanvasShortcuts).toBe('function');
  });

  function setupHandler(overrides: Partial<import('./useCanvasShortcuts').CanvasShortcutActions> = {}) {
    const nodes = [
      makeNode('first', 20, 20),
      makeNode('second', 300, 20),
      makeNode('third', 20, 200),
    ];
    const actions: import('./useCanvasShortcuts').CanvasShortcutActions = {
      nodes,
      focusNode: vi.fn(),
      closeNode: vi.fn(),
      toggleCatalog: vi.fn(),
      saveLayout: vi.fn(),
      selectedNodeId: null,
      ...overrides,
    };
    return actions;
  }

  function fireKey(key: string, opts: Partial<KeyboardEvent> = {}) {
    const event = new KeyboardEvent('keydown', {
      key,
      bubbles: true,
      ctrlKey: true,
      ...opts,
    });
    document.dispatchEvent(event);
    return event;
  }

  // Helper to mount the hook using a minimal render
  async function mountHook(actions: import('./useCanvasShortcuts').CanvasShortcutActions) {
    // Dynamic import to avoid hoisting issues
    const { renderHook } = await import('@testing-library/react');
    const { useCanvasShortcuts } = await import('./useCanvasShortcuts');
    return renderHook(() => useCanvasShortcuts(actions));
  }

  it('Ctrl+1 focuses the first node by position order', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('1');
    expect(actions.focusNode).toHaveBeenCalledWith('first');
  });

  it('Ctrl+2 focuses the second node by position order', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('2');
    expect(actions.focusNode).toHaveBeenCalledWith('second');
  });

  it('Ctrl+3 focuses the third node (different row)', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('3');
    expect(actions.focusNode).toHaveBeenCalledWith('third');
  });

  it('Ctrl+9 does nothing when fewer than 9 nodes', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('9');
    expect(actions.focusNode).not.toHaveBeenCalled();
  });

  it('Ctrl+W closes the selected node', async () => {
    const actions = setupHandler({ selectedNodeId: 'first' });
    await mountHook(actions);
    fireKey('w');
    expect(actions.closeNode).toHaveBeenCalledWith('first');
  });

  it('Ctrl+W does nothing when no node is selected', async () => {
    const actions = setupHandler({ selectedNodeId: null });
    await mountHook(actions);
    fireKey('w');
    expect(actions.closeNode).not.toHaveBeenCalled();
  });

  it('Ctrl+N toggles the catalog', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('n');
    expect(actions.toggleCatalog).toHaveBeenCalled();
  });

  it('Ctrl+S saves the layout', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('s');
    expect(actions.saveLayout).toHaveBeenCalled();
  });

  it('does not fire shortcuts without modifier key', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    fireKey('n', { ctrlKey: false, metaKey: false });
    expect(actions.toggleCatalog).not.toHaveBeenCalled();
  });

  it('does not fire shortcuts when target is an input', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    const input = document.createElement('input');
    document.body.appendChild(input);
    const event = new KeyboardEvent('keydown', {
      key: 'n',
      bubbles: true,
      ctrlKey: true,
    });
    Object.defineProperty(event, 'target', { value: input });
    document.dispatchEvent(event);
    expect(actions.toggleCatalog).not.toHaveBeenCalled();
    document.body.removeChild(input);
  });

  it('does not fire shortcuts when target is a textarea', async () => {
    const actions = setupHandler();
    await mountHook(actions);
    const textarea = document.createElement('textarea');
    document.body.appendChild(textarea);
    const event = new KeyboardEvent('keydown', {
      key: 's',
      bubbles: true,
      ctrlKey: true,
    });
    Object.defineProperty(event, 'target', { value: textarea });
    document.dispatchEvent(event);
    expect(actions.saveLayout).not.toHaveBeenCalled();
    document.body.removeChild(textarea);
  });

  it('Escape key does not trigger any action', async () => {
    const actions = setupHandler({ selectedNodeId: 'first' });
    await mountHook(actions);
    fireKey('Escape', { ctrlKey: false });
    expect(actions.closeNode).not.toHaveBeenCalled();
    expect(actions.toggleCatalog).not.toHaveBeenCalled();
  });
});
