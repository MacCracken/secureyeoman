import type { Node, Viewport } from 'reactflow';
import type { CanvasWidgetData } from './CanvasWidget';

export const CANVAS_STORAGE_KEY = 'canvas:workspace';

export interface CanvasLayout {
  version: 1;
  nodes: Node<CanvasWidgetData>[];
  viewport: Viewport;
}

export function defaultCanvasLayout(): CanvasLayout {
  return {
    version: 1,
    nodes: [],
    viewport: { x: 0, y: 0, zoom: 1 },
  };
}

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
