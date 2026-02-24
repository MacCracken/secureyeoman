/**
 * InputSequence Executor
 *
 * Runs an ordered list of input actions atomically, with configurable delay between steps.
 * Maximum 50 steps per sequence.
 */

import {
  moveMouse,
  clickMouse,
  scrollMouse,
  typeText,
  pressKey,
  releaseKey,
} from './input.js';
import { readClipboard, writeClipboard } from './clipboard.js';

export type InputAction =
  | { type: 'mouse_move'; x: number; y: number }
  | { type: 'mouse_click'; x?: number; y?: number; button?: 'left' | 'right' | 'middle'; double?: boolean }
  | { type: 'mouse_scroll'; dx: number; dy: number }
  | { type: 'type'; text: string }
  | { type: 'key_press'; combo: string }
  | { type: 'key_release'; combo: string }
  | { type: 'clipboard_write'; text: string }
  | { type: 'clipboard_read' }
  | { type: 'wait'; ms: number };

export interface SequenceStep {
  action: InputAction;
  delayAfterMs?: number;
}

export interface SequenceResult {
  stepsCompleted: number;
  totalSteps: number;
  clipboardReads: string[];
}

const MAX_STEPS = 50;
const MAX_WAIT_MS = 5_000;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Execute an InputSequence.
 * Runs each step in order, with optional delay between steps.
 * Returns after all steps complete or throws on first error.
 */
export async function executeSequence(steps: SequenceStep[]): Promise<SequenceResult> {
  if (steps.length > MAX_STEPS) {
    throw new Error(`Sequence exceeds maximum of ${MAX_STEPS} steps (got ${steps.length})`);
  }

  const clipboardReads: string[] = [];
  let completed = 0;

  for (const step of steps) {
    const { action, delayAfterMs } = step;

    switch (action.type) {
      case 'mouse_move':
        await moveMouse(action.x, action.y);
        break;
      case 'mouse_click':
        await clickMouse(action.x, action.y, action.button ?? 'left', action.double ?? false);
        break;
      case 'mouse_scroll':
        await scrollMouse(action.dx, action.dy);
        break;
      case 'type':
        await typeText(action.text);
        break;
      case 'key_press':
        await pressKey(action.combo);
        break;
      case 'key_release':
        await releaseKey(action.combo);
        break;
      case 'clipboard_write':
        await writeClipboard(action.text);
        break;
      case 'clipboard_read': {
        const text = await readClipboard();
        clipboardReads.push(text);
        break;
      }
      case 'wait': {
        const waitMs = Math.min(action.ms, MAX_WAIT_MS);
        await sleep(waitMs);
        break;
      }
      default:
        throw new Error(`Unknown action type: ${(action as { type: string }).type}`);
    }

    completed++;

    if (delayAfterMs && delayAfterMs > 0) {
      await sleep(Math.min(delayAfterMs, MAX_WAIT_MS));
    }
  }

  return { stepsCompleted: completed, totalSteps: steps.length, clipboardReads };
}
