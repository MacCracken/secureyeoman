import { describe, it, expect, vi, beforeEach } from 'vitest';
import { TaskLoop, createTaskLoop } from './task-loop.js';

// ── Helpers ───────────────────────────────────────────────────────────────────

function advanceTime(ms: number): void {
  vi.setSystemTime(Date.now() + ms);
}

// ── TaskLoop ──────────────────────────────────────────────────────────────────

describe('TaskLoop', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('constructor / factory', () => {
    it('creates a task loop with default options', () => {
      const loop = new TaskLoop();
      expect(loop.callCount).toBe(0);
      expect(loop.elapsedMs).toBeGreaterThanOrEqual(0);
    });

    it('createTaskLoop is a convenience factory', () => {
      const loop = createTaskLoop();
      expect(loop).toBeInstanceOf(TaskLoop);
    });
  });

  describe('recordToolCall()', () => {
    it('records tool calls', () => {
      const loop = new TaskLoop();
      loop.recordToolCall('web_search', { query: 'test' }, 'ok');
      expect(loop.callCount).toBe(1);
    });

    it('accumulates multiple tool calls', () => {
      const loop = new TaskLoop();
      loop.recordToolCall('tool_a', {}, 'ok');
      loop.recordToolCall('tool_b', {}, 'ok');
      loop.recordToolCall('tool_c', {}, 'error: 404');
      expect(loop.callCount).toBe(3);
    });

    it('serialises object args to JSON', () => {
      const loop = new TaskLoop();
      loop.recordToolCall('tool', { key: 'value', nested: { a: 1 } }, 'ok');
      const history = loop.getHistory();
      expect(history[0]!.toolArgs).toBe('{"key":"value","nested":{"a":1}}');
    });

    it('handles string args directly', () => {
      const loop = new TaskLoop();
      loop.recordToolCall('tool', 'direct-string', 'ok');
      const history = loop.getHistory();
      expect(history[0]!.toolArgs).toBe('direct-string');
    });
  });

  describe('checkStuck() — no stuck condition', () => {
    it('returns null when task is young with no tool calls', () => {
      const loop = new TaskLoop({ timeoutMs: 30_000 });
      expect(loop.checkStuck()).toBeNull();
    });

    it('returns null with varied tool calls (no repetition)', () => {
      const loop = new TaskLoop({ timeoutMs: 30_000 });
      loop.recordToolCall('tool_a', {}, 'ok');
      loop.recordToolCall('tool_b', {}, 'ok');
      loop.recordToolCall('tool_c', {}, 'ok');
      expect(loop.checkStuck()).toBeNull();
    });
  });

  describe('checkStuck() — timeout', () => {
    it('returns timeout reason when elapsed exceeds threshold', () => {
      const loop = new TaskLoop({ timeoutMs: 5_000 });
      advanceTime(6_000);

      const reason = loop.checkStuck();
      expect(reason).not.toBeNull();
      expect(reason!.type).toBe('timeout');
      expect(reason!.detail).toMatch(/6\d{3}ms/);
    });

    it('includes last tool in timeout detail when calls exist', () => {
      const loop = new TaskLoop({ timeoutMs: 5_000 });
      loop.recordToolCall('fs_read', { path: '/etc/passwd' }, 'ok');
      advanceTime(6_000);

      const reason = loop.checkStuck();
      expect(reason!.type).toBe('timeout');
      expect(reason!.detail).toContain('fs_read');
    });

    it('mentions no tool calls when history is empty', () => {
      const loop = new TaskLoop({ timeoutMs: 1_000 });
      advanceTime(2_000);
      const reason = loop.checkStuck();
      expect(reason!.detail).toContain('no tool calls recorded');
    });
  });

  describe('checkStuck() — repetition', () => {
    it('detects consecutive identical tool calls', () => {
      const loop = new TaskLoop({ timeoutMs: 60_000, repetitionThreshold: 2 });
      loop.recordToolCall('web_search', { query: 'same query' }, 'ok');
      loop.recordToolCall('web_search', { query: 'same query' }, 'ok');

      const reason = loop.checkStuck();
      expect(reason).not.toBeNull();
      expect(reason!.type).toBe('repetition');
      expect(reason!.detail).toContain('web_search');
      expect(reason!.detail).toContain('2 consecutive');
    });

    it('does not trigger on alternating tool calls', () => {
      const loop = new TaskLoop({ timeoutMs: 60_000, repetitionThreshold: 2 });
      loop.recordToolCall('tool_a', { q: 'x' }, 'ok');
      loop.recordToolCall('tool_b', { q: 'y' }, 'ok');
      loop.recordToolCall('tool_a', { q: 'x' }, 'ok');

      expect(loop.checkStuck()).toBeNull();
    });

    it('does not trigger when args differ', () => {
      const loop = new TaskLoop({ timeoutMs: 60_000, repetitionThreshold: 2 });
      loop.recordToolCall('web_search', { query: 'query A' }, 'ok');
      loop.recordToolCall('web_search', { query: 'query B' }, 'ok');

      expect(loop.checkStuck()).toBeNull();
    });

    it('respects custom repetitionThreshold', () => {
      const loop = new TaskLoop({ timeoutMs: 60_000, repetitionThreshold: 3 });
      loop.recordToolCall('tool', { a: 1 }, 'ok');
      loop.recordToolCall('tool', { a: 1 }, 'ok');
      expect(loop.checkStuck()).toBeNull(); // only 2, need 3

      loop.recordToolCall('tool', { a: 1 }, 'ok');
      expect(loop.checkStuck()?.type).toBe('repetition');
    });
  });

  describe('buildRecoveryPrompt()', () => {
    it('builds a timeout recovery prompt', () => {
      const loop = new TaskLoop({ timeoutMs: 5_000 });
      loop.recordToolCall('last_tool', {}, 'error: 503');
      advanceTime(6_000);

      const reason = loop.checkStuck()!;
      const prompt = loop.buildRecoveryPrompt(reason);

      expect(prompt).toContain('stalled');
      expect(prompt).toContain('last_tool');
      expect(prompt).toContain('different approach');
    });

    it('builds a repetition recovery prompt', () => {
      const loop = new TaskLoop({ timeoutMs: 60_000, repetitionThreshold: 2 });
      loop.recordToolCall('stuck_tool', { k: 'v' }, 'error: rate limit');
      loop.recordToolCall('stuck_tool', { k: 'v' }, 'error: rate limit');

      const reason = loop.checkStuck()!;
      const prompt = loop.buildRecoveryPrompt(reason);

      expect(prompt).toContain('looping');
      expect(prompt).toContain('stuck_tool');
      expect(prompt).toContain('different approach');
    });
  });

  describe('getHistory()', () => {
    it('returns a copy of the history', () => {
      const loop = new TaskLoop();
      loop.recordToolCall('t', {}, 'ok');
      const history = loop.getHistory();
      history.push({ toolName: 'fake', toolArgs: '{}', outcome: 'noop', calledAt: 0 });
      expect(loop.callCount).toBe(1); // original unaffected
    });
  });

  describe('reset()', () => {
    it('clears history and resets start time', () => {
      const loop = new TaskLoop();
      loop.recordToolCall('tool', {}, 'ok');
      advanceTime(5_000);

      loop.reset();
      expect(loop.callCount).toBe(0);
      expect(loop.elapsedMs).toBeLessThan(100);
    });
  });

  describe('elapsedMs', () => {
    it('tracks elapsed time', () => {
      const loop = new TaskLoop();
      expect(loop.elapsedMs).toBeLessThan(100);
      advanceTime(2_500);
      expect(loop.elapsedMs).toBeGreaterThanOrEqual(2_500);
    });
  });
});
