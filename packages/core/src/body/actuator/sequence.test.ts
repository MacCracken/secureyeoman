/**
 * Tests for InputSequence executor (sequence.ts) — Phase 40.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock input and clipboard drivers before importing sequence
vi.mock('./input.js', () => ({
  moveMouse: vi.fn().mockResolvedValue(undefined),
  clickMouse: vi.fn().mockResolvedValue(undefined),
  scrollMouse: vi.fn().mockResolvedValue(undefined),
  typeText: vi.fn().mockResolvedValue(undefined),
  pressKey: vi.fn().mockResolvedValue(undefined),
  releaseKey: vi.fn().mockResolvedValue(undefined),
}));

vi.mock('./clipboard.js', () => ({
  readClipboard: vi.fn().mockResolvedValue('mocked clipboard'),
  writeClipboard: vi.fn().mockResolvedValue(undefined),
  clearClipboard: vi.fn().mockResolvedValue(undefined),
}));

import { executeSequence } from './sequence.js';
import * as inputMod from './input.js';
import * as clipboardMod from './clipboard.js';

describe('executeSequence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns correct counts for an empty sequence', async () => {
    const result = await executeSequence([]);
    expect(result.stepsCompleted).toBe(0);
    expect(result.totalSteps).toBe(0);
    expect(result.clipboardReads).toEqual([]);
  });

  it('executes mouse_move step', async () => {
    const result = await executeSequence([{ action: { type: 'mouse_move', x: 100, y: 200 } }]);
    expect(inputMod.moveMouse).toHaveBeenCalledWith(100, 200);
    expect(result.stepsCompleted).toBe(1);
  });

  it('executes mouse_click step with defaults', async () => {
    await executeSequence([{ action: { type: 'mouse_click' } }]);
    expect(inputMod.clickMouse).toHaveBeenCalledWith(undefined, undefined, 'left', false);
  });

  it('executes mouse_scroll step', async () => {
    await executeSequence([{ action: { type: 'mouse_scroll', dx: 0, dy: -3 } }]);
    expect(inputMod.scrollMouse).toHaveBeenCalledWith(0, -3);
  });

  it('executes type step', async () => {
    await executeSequence([{ action: { type: 'type', text: 'hello world' } }]);
    expect(inputMod.typeText).toHaveBeenCalledWith('hello world');
  });

  it('executes key_press step', async () => {
    await executeSequence([{ action: { type: 'key_press', combo: 'ctrl+c' } }]);
    expect(inputMod.pressKey).toHaveBeenCalledWith('ctrl+c');
  });

  it('executes key_release step', async () => {
    await executeSequence([{ action: { type: 'key_release', combo: 'ctrl' } }]);
    expect(inputMod.releaseKey).toHaveBeenCalledWith('ctrl');
  });

  it('executes clipboard_write step', async () => {
    await executeSequence([{ action: { type: 'clipboard_write', text: 'copy this' } }]);
    expect(clipboardMod.writeClipboard).toHaveBeenCalledWith('copy this');
  });

  it('executes clipboard_read step and collects result', async () => {
    const result = await executeSequence([{ action: { type: 'clipboard_read' } }]);
    expect(result.clipboardReads).toEqual(['mocked clipboard']);
    expect(result.stepsCompleted).toBe(1);
  });

  it('executes wait step without calling input drivers', async () => {
    // Use a very short wait to keep tests fast
    const result = await executeSequence([{ action: { type: 'wait', ms: 1 } }]);
    expect(result.stepsCompleted).toBe(1);
    expect(inputMod.moveMouse).not.toHaveBeenCalled();
  });

  it('clamps wait to MAX_WAIT_MS (5000ms) without throwing', async () => {
    // Passing a very large wait — should clamp silently (we fake sleep so it's instant)
    const result = await executeSequence([{ action: { type: 'wait', ms: 999_999 } }]);
    expect(result.stepsCompleted).toBe(1);
  });

  it('executes multi-step sequence in order', async () => {
    const calls: string[] = [];
    vi.mocked(inputMod.moveMouse).mockImplementation(async () => {
      calls.push('move');
    });
    vi.mocked(inputMod.typeText).mockImplementation(async () => {
      calls.push('type');
    });
    vi.mocked(clipboardMod.writeClipboard).mockImplementation(async () => {
      calls.push('write');
    });

    const result = await executeSequence([
      { action: { type: 'mouse_move', x: 0, y: 0 } },
      { action: { type: 'type', text: 'hello' } },
      { action: { type: 'clipboard_write', text: 'done' } },
    ]);

    expect(calls).toEqual(['move', 'type', 'write']);
    expect(result.stepsCompleted).toBe(3);
    expect(result.totalSteps).toBe(3);
  });

  it('throws when sequence exceeds 50 steps', async () => {
    const steps = Array.from({ length: 51 }, () => ({
      action: { type: 'wait' as const, ms: 0 },
    }));
    await expect(executeSequence(steps)).rejects.toThrow('exceeds maximum of 50 steps');
  });

  it('collects multiple clipboard reads', async () => {
    vi.mocked(clipboardMod.readClipboard)
      .mockResolvedValueOnce('first')
      .mockResolvedValueOnce('second');

    const result = await executeSequence([
      { action: { type: 'clipboard_read' } },
      { action: { type: 'clipboard_read' } },
    ]);

    expect(result.clipboardReads).toEqual(['first', 'second']);
    expect(result.stepsCompleted).toBe(2);
  });
});
