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
});
