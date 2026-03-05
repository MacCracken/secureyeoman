import { describe, it, expect, beforeEach, vi } from 'vitest';
import { canvasEventBus, CANVAS_EVENTS, type CanvasEvent } from './canvas-event-bus';

describe('CanvasEventBus', () => {
  beforeEach(() => {
    canvasEventBus.clear();
  });

  it('emits events to registered listeners', () => {
    const handler = vi.fn();
    canvasEventBus.on('test:event', handler);

    const event: CanvasEvent = {
      type: 'test:event',
      sourceId: 'node-1',
      payload: { data: 'hello' },
    };
    canvasEventBus.emit(event);

    expect(handler).toHaveBeenCalledOnce();
    expect(handler).toHaveBeenCalledWith(event);
  });

  it('does not emit to unrelated listeners', () => {
    const handler = vi.fn();
    canvasEventBus.on('other:event', handler);

    canvasEventBus.emit({
      type: 'test:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports wildcard * listeners', () => {
    const handler = vi.fn();
    canvasEventBus.on('*', handler);

    canvasEventBus.emit({
      type: 'any:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(handler).toHaveBeenCalledOnce();
  });

  it('calls both typed and wildcard listeners', () => {
    const typed = vi.fn();
    const wildcard = vi.fn();
    canvasEventBus.on('test:event', typed);
    canvasEventBus.on('*', wildcard);

    canvasEventBus.emit({
      type: 'test:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(typed).toHaveBeenCalledOnce();
    expect(wildcard).toHaveBeenCalledOnce();
  });

  it('unsubscribes via off()', () => {
    const handler = vi.fn();
    canvasEventBus.on('test:event', handler);
    canvasEventBus.off('test:event', handler);

    canvasEventBus.emit({
      type: 'test:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('unsubscribes via returned function', () => {
    const handler = vi.fn();
    const unsub = canvasEventBus.on('test:event', handler);
    unsub();

    canvasEventBus.emit({
      type: 'test:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('supports multiple listeners for the same event', () => {
    const h1 = vi.fn();
    const h2 = vi.fn();
    canvasEventBus.on('test:event', h1);
    canvasEventBus.on('test:event', h2);

    canvasEventBus.emit({
      type: 'test:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(h1).toHaveBeenCalledOnce();
    expect(h2).toHaveBeenCalledOnce();
  });

  it('clear() removes all listeners', () => {
    const handler = vi.fn();
    canvasEventBus.on('test:event', handler);
    canvasEventBus.clear();

    canvasEventBus.emit({
      type: 'test:event',
      sourceId: 'node-1',
      payload: {},
    });

    expect(handler).not.toHaveBeenCalled();
  });

  it('off() on non-existent type does not throw', () => {
    const handler = vi.fn();
    expect(() => canvasEventBus.off('nonexistent', handler)).not.toThrow();
  });

  it('CANVAS_EVENTS has expected event types', () => {
    expect(CANVAS_EVENTS.TERMINAL_OUTPUT).toBe('terminal:output');
    expect(CANVAS_EVENTS.TERMINAL_ERROR).toBe('terminal:error');
    expect(CANVAS_EVENTS.EDITOR_FILE_CHANGED).toBe('editor:fileChanged');
    expect(CANVAS_EVENTS.FOCUS_WIDGET).toBe('canvas:focusWidget');
    expect(CANVAS_EVENTS.CREATE_WIDGET).toBe('canvas:createWidget');
  });
});
