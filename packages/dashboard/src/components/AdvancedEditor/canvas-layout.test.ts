/**
 * canvas-layout.test.ts — save/load round-trips for canvas workspace layout
 */
import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  loadCanvasLayout,
  saveCanvasLayout,
  defaultCanvasLayout,
  loadNamedLayouts,
  saveNamedLayout,
  deleteNamedLayout,
  getActiveLayoutName,
  setActiveLayoutName,
  exportLayoutAsJson,
  importLayoutFromJson,
  PRESET_LAYOUTS,
} from './canvas-layout';
import type { CanvasLayout } from './canvas-layout';

// ── localStorage mock ─────────────────────────────────────────────────────────
const store: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => store[key] ?? null),
  setItem: vi.fn((key: string, value: string) => {
    store[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    Reflect.deleteProperty(store, key);
  }),
  clear: vi.fn(() => {
    Object.keys(store).forEach((k) => Reflect.deleteProperty(store, k));
  }),
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
    localStorage.setItem(
      'canvas:workspace',
      JSON.stringify({ version: 99, nodes: [], viewport: {} })
    );
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
    localStorageMock.setItem.mockImplementationOnce(() => {
      throw new Error('QuotaExceededError');
    });
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

// ── Named Layouts ──────────────────────────────────────────────────────────────

describe('named layouts', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('loadNamedLayouts returns empty object when nothing stored', () => {
    expect(loadNamedLayouts()).toEqual({});
  });

  it('saveNamedLayout and loadNamedLayouts round-trip', () => {
    const layout = defaultCanvasLayout();
    saveNamedLayout('My Layout', layout);
    const loaded = loadNamedLayouts();
    expect(loaded['My Layout']).toBeDefined();
    expect(loaded['My Layout'].version).toBe(1);
  });

  it('saveNamedLayout preserves existing layouts', () => {
    saveNamedLayout('Layout A', defaultCanvasLayout());
    saveNamedLayout('Layout B', defaultCanvasLayout());
    const loaded = loadNamedLayouts();
    expect(Object.keys(loaded)).toHaveLength(2);
    expect(loaded['Layout A']).toBeDefined();
    expect(loaded['Layout B']).toBeDefined();
  });

  it('deleteNamedLayout removes the specified layout', () => {
    saveNamedLayout('To Delete', defaultCanvasLayout());
    saveNamedLayout('To Keep', defaultCanvasLayout());
    deleteNamedLayout('To Delete');
    const loaded = loadNamedLayouts();
    expect(loaded['To Delete']).toBeUndefined();
    expect(loaded['To Keep']).toBeDefined();
  });

  it('loadNamedLayouts handles corrupt JSON gracefully', () => {
    localStorage.setItem('canvas:layouts', 'not json');
    expect(loadNamedLayouts()).toEqual({});
  });

  it('loadNamedLayouts handles array JSON gracefully', () => {
    localStorage.setItem('canvas:layouts', '[1,2,3]');
    expect(loadNamedLayouts()).toEqual({});
  });
});

// ── Active layout name ─────────────────────────────────────────────────────────

describe('active layout name', () => {
  beforeEach(() => {
    localStorageMock.clear();
    vi.clearAllMocks();
  });

  it('getActiveLayoutName returns null when not set', () => {
    expect(getActiveLayoutName()).toBeNull();
  });

  it('setActiveLayoutName and getActiveLayoutName round-trip', () => {
    setActiveLayoutName('My Layout');
    expect(getActiveLayoutName()).toBe('My Layout');
  });

  it('setActiveLayoutName(null) removes the key', () => {
    setActiveLayoutName('My Layout');
    setActiveLayoutName(null);
    expect(getActiveLayoutName()).toBeNull();
  });
});

// ── Export / Import ────────────────────────────────────────────────────────────

describe('exportLayoutAsJson / importLayoutFromJson', () => {
  it('exports and imports round-trip', () => {
    const layout: CanvasLayout = {
      version: 1,
      nodes: [
        {
          id: 'n-1',
          type: 'canvasWidget',
          position: { x: 10, y: 20 },
          data: {
            widgetType: 'terminal',
            title: 'Terminal',
            minimized: false,
            config: {},
          },
        },
      ],
      viewport: { x: -10, y: -20, zoom: 1.5 },
    };

    const json = exportLayoutAsJson(layout);
    expect(typeof json).toBe('string');

    const imported = importLayoutFromJson(json);
    expect(imported).not.toBeNull();
    expect(imported!.version).toBe(1);
    expect(imported!.nodes).toHaveLength(1);
    expect(imported!.nodes[0].id).toBe('n-1');
    expect(imported!.viewport.zoom).toBe(1.5);
  });

  it('importLayoutFromJson returns null for invalid JSON', () => {
    expect(importLayoutFromJson('not json')).toBeNull();
  });

  it('importLayoutFromJson returns null for wrong version', () => {
    expect(importLayoutFromJson('{"version":99,"nodes":[]}')).toBeNull();
  });

  it('importLayoutFromJson returns null for missing nodes array', () => {
    expect(importLayoutFromJson('{"version":1,"nodes":"not array"}')).toBeNull();
  });
});

// ── Preset Layouts ─────────────────────────────────────────────────────────────

describe('preset layouts', () => {
  it('has Dev, Ops, and Chat presets', () => {
    expect(PRESET_LAYOUTS.Dev).toBeDefined();
    expect(PRESET_LAYOUTS.Ops).toBeDefined();
    expect(PRESET_LAYOUTS.Chat).toBeDefined();
  });

  it('Dev preset has terminal, editor, and git-panel', () => {
    const types = PRESET_LAYOUTS.Dev.nodes.map((n) => n.data.widgetType);
    expect(types).toContain('terminal');
    expect(types).toContain('editor');
    expect(types).toContain('git-panel');
  });

  it('Ops preset has cicd-monitor, pipeline, and training-live', () => {
    const types = PRESET_LAYOUTS.Ops.nodes.map((n) => n.data.widgetType);
    expect(types).toContain('cicd-monitor');
    expect(types).toContain('pipeline');
    expect(types).toContain('training-live');
  });

  it('Chat preset has chat, agent-world, and task-kanban', () => {
    const types = PRESET_LAYOUTS.Chat.nodes.map((n) => n.data.widgetType);
    expect(types).toContain('chat');
    expect(types).toContain('agent-world');
    expect(types).toContain('task-kanban');
  });

  it('all presets are version 1', () => {
    for (const preset of Object.values(PRESET_LAYOUTS)) {
      expect(preset.version).toBe(1);
    }
  });

  it('all preset nodes have canvasWidget type', () => {
    for (const preset of Object.values(PRESET_LAYOUTS)) {
      for (const node of preset.nodes) {
        expect(node.type).toBe('canvasWidget');
      }
    }
  });
});
