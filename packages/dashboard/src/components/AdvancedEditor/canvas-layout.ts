import type { Node, Viewport } from 'reactflow';
import type { CanvasWidgetData } from './CanvasWidget';

export const CANVAS_STORAGE_KEY = 'canvas:workspace';
export const CANVAS_LAYOUTS_KEY = 'canvas:layouts';
export const CANVAS_ACTIVE_LAYOUT_KEY = 'canvas:activeLayout';

export interface CanvasLayout {
  version: 1;
  nodes: Node<CanvasWidgetData>[];
  viewport: Viewport;
}

export type NamedLayouts = Record<string, CanvasLayout>;

export function defaultCanvasLayout(): CanvasLayout {
  return {
    version: 1,
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

// ── Single-layout (legacy) ──────────────────────────────────────────

export function loadCanvasLayout(): CanvasLayout {
  try {
    const raw = localStorage.getItem(CANVAS_STORAGE_KEY);
    if (!raw) return defaultCanvasLayout();
    const parsed = JSON.parse(raw) as CanvasLayout;
    if (parsed.version !== 1) return defaultCanvasLayout();
    return parsed;
  } catch {
    return defaultCanvasLayout();
  }
}

export function saveCanvasLayout(layout: CanvasLayout): void {
  try {
    localStorage.setItem(CANVAS_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    /* ignore quota errors */
  }
}

// ── Named layouts ───────────────────────────────────────────────────

export function loadNamedLayouts(): NamedLayouts {
  try {
    const raw = localStorage.getItem(CANVAS_LAYOUTS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    return parsed as NamedLayouts;
  } catch {
    return {};
  }
}

export function saveNamedLayouts(layouts: NamedLayouts): void {
  try {
    localStorage.setItem(CANVAS_LAYOUTS_KEY, JSON.stringify(layouts));
  } catch {
    /* ignore quota errors */
  }
}

export function saveNamedLayout(name: string, layout: CanvasLayout): void {
  const layouts = loadNamedLayouts();
  layouts[name] = layout;
  saveNamedLayouts(layouts);
}

export function deleteNamedLayout(name: string): void {
  const layouts = loadNamedLayouts();
  Reflect.deleteProperty(layouts, name);
  saveNamedLayouts(layouts);
}

export function getActiveLayoutName(): string | null {
  try {
    return localStorage.getItem(CANVAS_ACTIVE_LAYOUT_KEY);
  } catch {
    return null;
  }
}

export function setActiveLayoutName(name: string | null): void {
  try {
    if (name === null) {
      localStorage.removeItem(CANVAS_ACTIVE_LAYOUT_KEY);
    } else {
      localStorage.setItem(CANVAS_ACTIVE_LAYOUT_KEY, name);
    }
  } catch {
    /* ignore */
  }
}

export function exportLayoutAsJson(layout: CanvasLayout): string {
  return JSON.stringify(layout, null, 2);
}

export function importLayoutFromJson(json: string): CanvasLayout | null {
  try {
    const parsed = JSON.parse(json) as CanvasLayout;
    if (parsed.version !== 1 || !Array.isArray(parsed.nodes)) return null;
    return parsed;
  } catch {
    return null;
  }
}

// ── Preset layouts ──────────────────────────────────────────────────

export type PresetName = 'Dev' | 'Ops' | 'Chat';

function presetNode(
  id: string,
  type: string,
  widgetType: string,
  label: string,
  x: number,
  y: number,
  w: number,
  h: number
): Node<CanvasWidgetData> {
  return {
    id,
    type,
    position: { x, y },
    style: { width: w, height: h },
    data: {
      widgetType: widgetType as CanvasWidgetData['widgetType'],
      title: label,
      minimized: false,
      config: {},
    },
  };
}

export const PRESET_LAYOUTS: Record<PresetName, CanvasLayout> = {
  Dev: {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      presetNode('preset-terminal', 'canvasWidget', 'terminal', 'Terminal', 20, 20, 560, 380),
      presetNode('preset-editor', 'canvasWidget', 'editor', 'Code Editor', 600, 20, 680, 460),
      presetNode('preset-git', 'canvasWidget', 'git-panel', 'Git Panel', 20, 420, 560, 400),
    ],
  },
  Ops: {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      presetNode('preset-cicd', 'canvasWidget', 'cicd-monitor', 'CI/CD Monitor', 20, 20, 560, 360),
      presetNode(
        'preset-pipeline',
        'canvasWidget',
        'pipeline',
        'Pipeline Viewer',
        600,
        20,
        560,
        380
      ),
      presetNode(
        'preset-training',
        'canvasWidget',
        'training-live',
        'Training Live',
        20,
        400,
        560,
        380
      ),
    ],
  },
  Chat: {
    version: 1,
    viewport: { x: 0, y: 0, zoom: 1 },
    nodes: [
      presetNode('preset-chat', 'canvasWidget', 'chat', 'Chat', 20, 20, 480, 500),
      presetNode('preset-agents', 'canvasWidget', 'agent-world', 'Agent World', 520, 20, 680, 420),
      presetNode('preset-tasks', 'canvasWidget', 'task-kanban', 'Task Kanban', 520, 460, 680, 400),
    ],
  },
};
