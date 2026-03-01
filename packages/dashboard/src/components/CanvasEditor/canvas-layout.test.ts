/**
 * canvas-layout.test.ts — save/load round-trips for canvas workspace layout
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { loadCanvasLayout, saveCanvasLayout, defaultCanvasLayout } from './canvas-layout';
import type { CanvasLayout } from './canvas-layout';

// ── localStorage mock ─────────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => { store[key] = value; }),
  removeItem: vi.fn((key: string) => { delete store[key]; }),
  clear: vi.fn(() => { Object.keys(store).forEach((k) => delete store[k]); }),
};
Object.defineProperty(globalThis, 'localStorage', { value: localStorageMock, writable: true });

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('defaultCanvasLayout', () => {
  it('returns version 1 with empty nodes and default viewport', () => {
    const layout = defaultCanvasLayout();
    expect(layout.version).toBe(1);
    expect(layout.nodes).toEqual([]);
    expect(layout.viewport).toEqual({ x: 0, y: 0, zoom: 1 });
  });
});

describe('saveCanvasLayout + loadCanvasLayout', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('returns defaultCanvasLayout when localStorage is empty', () => {
    const layout = loadCanvasLayout();
    expect(layout.version).toBe(1);
    expect(layout.nodes).toEqual([]);
  });

  it('round-trips a layout with nodes and viewport', () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: 'node-1',
          type: 'canvasWidget',
          position: { x: 100, y: 200 },
          data: {
            widgetType: 'terminal',
            title: 'My Terminal',
            minimized: false,
            config: { worktreeId: 'feature-branch' },
          },
        },
        {
          id: 'node-2',
          type: 'canvasWidget',
          position: { x: 500, y: 100 },
          data: {
            widgetType: 'editor',
            title: 'Code Editor',
            minimized: false,
            config: { filePath: 'src/index.ts' },
          },
        },
      ],
      viewport: { x: -120, y: -50, zoom: 0.75 },
    };

    saveCanvasLayout(layout);
    const loaded = loadCanvasLayout();

    expect(loaded.version).toBe(1);
    expect(loaded.nodes).toHaveLength(2);
    expect(loaded.nodes[0].id).toBe('node-1');
    expect(loaded.nodes[0].data.widgetType).toBe('terminal');
    expect(loaded.nodes[0].data.config.worktreeId).toBe('feature-branch');
    expect(loaded.nodes[1].data.config.filePath).toBe('src/index.ts');
    expect(loaded.viewport).toEqual({ x: -120, y: -50, zoom: 0.75 });
  });

  it('returns default when stored layout has wrong version', () => {
    localStorage.setItem('canvas:workspace', JSON.stringify({ version: 99, nodes: [], viewport: {} }));
    const layout = loadCanvasLayout();
    expect(layout).toEqual(defaultCanvasLayout());
  });

  it('returns default when stored JSON is malformed', () => {
    localStorage.setItem('canvas:workspace', '{invalid json');
    const layout = loadCanvasLayout();
    expect(layout).toEqual(defaultCanvasLayout());
  });

  it('persists to localStorage key "canvas:workspace"', () => {
    saveCanvasLayout(defaultCanvasLayout());
    expect(localStorageMock.setItem).toHaveBeenCalledWith('canvas:workspace', expect.any(String));
  });

  it('silently ignores localStorage errors during save', () => {
    localStorageMock.setItem.mockImplementationOnce(() => { throw new Error('QuotaExceededError'); });
    expect(() => saveCanvasLayout(defaultCanvasLayout())).not.toThrow();
  });

  it('preserves frozen-output widget frozenContent config', () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: 'frozen-1',
          type: 'canvasWidget',
          position: { x: 0, y: 0 },
          data: {
            widgetType: 'frozen-output',
            title: 'Output: npm test',
            minimized: false,
            config: {
              frozenContent: {
                command: 'npm test',
                output: 'All tests passed',
                exitCode: 0,
                timestamp: '2026-03-01T10:00:00.000Z',
              },
            },
          },
        },
      ],
      viewport: { x: 0, y: 0, zoom: 1 },
    };

    saveCanvasLayout(layout);
    const loaded = loadCanvasLayout();
    const frozenContent = loaded.nodes[0].data.config.frozenContent;
    expect(frozenContent?.command).toBe('npm test');
    expect(frozenContent?.output).toBe('All tests passed');
    expect(frozenContent?.exitCode).toBe(0);
  });
});
