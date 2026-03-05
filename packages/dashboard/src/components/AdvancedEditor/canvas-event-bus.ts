/**
 * CanvasEventBus — Inter-widget communication for the canvas workspace.
 *
 * Primary use cases:
 *  - Terminal output → auto-populate an editor widget with the result
 *  - Terminal error → create a chat widget pre-seeded with the error for AI diagnosis
 *
 * Singleton pattern: widgets subscribe in useEffect and clean up on unmount.
 */

export interface CanvasEvent {
  /** Event type identifier */
  type: string;
  /** Source widget node ID */
  sourceId: string;
  /** Arbitrary payload */
  payload: Record<string, unknown>;
}

export type CanvasEventHandler = (event: CanvasEvent) => void;

class CanvasEventBusImpl {
  private listeners = new Map<string, Set<CanvasEventHandler>>();

  /** Subscribe to events of a given type. Returns an unsubscribe function. */
  on(type: string, handler: CanvasEventHandler): () => void {
    let set = this.listeners.get(type);
    if (!set) {
      set = new Set();
      this.listeners.set(type, set);
    }
    set.add(handler);
    return () => this.off(type, handler);
  }

  /** Unsubscribe a handler from a given event type. */
  off(type: string, handler: CanvasEventHandler): void {
    const set = this.listeners.get(type);
    if (!set) return;
    set.delete(handler);
    if (set.size === 0) this.listeners.delete(type);
  }

  /** Emit an event to all listeners of the given type, plus wildcard '*' listeners. */
  emit(event: CanvasEvent): void {
    const typeSet = this.listeners.get(event.type);
    if (typeSet) {
      for (const handler of typeSet) handler(event);
    }
    const wildcard = this.listeners.get('*');
    if (wildcard) {
      for (const handler of wildcard) handler(event);
    }
  }

  /** Remove all listeners. Useful for cleanup in tests. */
  clear(): void {
    this.listeners.clear();
  }
}

/** Singleton event bus for the canvas workspace. */
export const canvasEventBus = new CanvasEventBusImpl();

// Well-known event types
export const CANVAS_EVENTS = {
  /** Terminal produced output. Payload: { command, output, exitCode } */
  TERMINAL_OUTPUT: 'terminal:output',
  /** Terminal encountered an error. Payload: { command, error, exitCode } */
  TERMINAL_ERROR: 'terminal:error',
  /** Editor file changed. Payload: { filePath, content? } */
  EDITOR_FILE_CHANGED: 'editor:fileChanged',
  /** Widget requests focus on another widget type. Payload: { targetType, config? } */
  FOCUS_WIDGET: 'canvas:focusWidget',
  /** Widget requests a new widget be created. Payload: { widgetType, config? } */
  CREATE_WIDGET: 'canvas:createWidget',
} as const;
