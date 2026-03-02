/**
 * World Command Tests
 *
 * Tests the ASCII agent world command's pure logic and the branches
 * that don't require a real TTY:
 * - Command metadata
 * - Help flag output
 * - Non-TTY early exit
 * - deriveState — full state machine coverage
 * - centerIn — ANSI-aware string centering utility
 * - buildFloorPlan — floor plan data structure correctness
 * - findPath — BFS pathfinder
 * - computeMood — world mood derivation
 */

import { describe, it, expect, afterEach } from 'vitest';
import {
  worldCommand,
  deriveState,
  centerIn,
  buildFloorPlan,
  findPath,
  computeMood,
} from './world.js';
import type { WorldPos } from './world.js';

// ── Test helpers ──────────────────────────────────────────────────────────────

function makeCtx(argv: string[] = []) {
  const outLines: string[] = [];
  const errLines: string[] = [];
  return {
    argv,
    stdout: {
      write: (s: string) => {
        outLines.push(s);
      },
    },
    stderr: {
      write: (s: string) => {
        errLines.push(s);
      },
    },
    outLines,
    errLines,
  };
}

function makePersonality(
  overrides: Partial<{
    id: string;
    name: string;
    isActive: boolean;
  }> = {}
) {
  return {
    id: 'p-001',
    name: 'Alice',
    isActive: true,
    ...overrides,
  };
}

function makeTask(
  overrides: Partial<{
    id: string;
    personalityId: string;
    status: string;
    title: string;
    startedAt: number;
    createdAt: number;
    type: string;
    correlationId: string;
  }> = {}
) {
  return {
    id: 't-001',
    personalityId: 'p-001',
    status: 'running',
    ...overrides,
  };
}

function makeAuditEntry(
  overrides: Partial<{
    id: string;
    type: string;
    action: string;
    actorId: string;
    timestamp: number;
  }> = {}
) {
  return {
    id: 'a-001',
    ...overrides,
  };
}

const EMPTY_TALKING = new Map<string, number>();

// ── Command metadata ──────────────────────────────────────────────────────────

describe('worldCommand', () => {
  it('exports the correct name', () => {
    expect(worldCommand.name).toBe('world');
  });

  it('exports the alias "w"', () => {
    expect(worldCommand.aliases).toContain('w');
  });

  it('has a description mentioning ASCII', () => {
    expect(worldCommand.description.toLowerCase()).toContain('ascii');
  });

  it('usage references --url and --fps', () => {
    expect(worldCommand.usage).toContain('--url');
    expect(worldCommand.usage).toContain('--fps');
  });

  it('usage references --size and --speed', () => {
    expect(worldCommand.usage).toContain('--size');
    expect(worldCommand.usage).toContain('--speed');
  });

  // ── Help flag ──────────────────────────────────────────────────────────────

  describe('--help / -h', () => {
    it('returns 0 for --help and prints usage', async () => {
      const ctx = makeCtx(['--help']);
      const code = await worldCommand.run(ctx as any);
      expect(code).toBe(0);
      const out = ctx.outLines.join('');
      expect(out).toContain('Usage:');
      expect(out).toContain('--url');
      expect(out).toContain('--fps');
    });

    it('returns 0 for -h and prints character states', async () => {
      const ctx = makeCtx(['-h']);
      const code = await worldCommand.run(ctx as any);
      expect(code).toBe(0);
      const out = ctx.outLines.join('');
      expect(out).toContain('idle');
      expect(out).toContain('thinking');
      expect(out).toContain('writing');
      expect(out).toContain('talking');
      expect(out).toContain('offline');
    });

    it('--help mentions key bindings', async () => {
      const ctx = makeCtx(['--help']);
      const code = await worldCommand.run(ctx as any);
      expect(code).toBe(0);
      const out = ctx.outLines.join('');
      expect(out).toContain('Ctrl+C');
      expect(out).toContain('Refresh');
    });

    it('--help mentions world zones', async () => {
      const ctx = makeCtx(['--help']);
      await worldCommand.run(ctx as any);
      const out = ctx.outLines.join('');
      expect(out).toContain('Workspace');
      expect(out).toContain('Meeting Room');
    });

    it('--help mentions --size and --speed options', async () => {
      const ctx = makeCtx(['--help']);
      await worldCommand.run(ctx as any);
      const out = ctx.outLines.join('');
      expect(out).toContain('--size');
      expect(out).toContain('--speed');
    });
  });

  // ── Non-TTY guard ──────────────────────────────────────────────────────────

  describe('non-TTY guard', () => {
    afterEach(() => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: undefined,
        writable: true,
        configurable: true,
      });
    });

    it('returns 1 and writes TTY error when stdout is not a TTY', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      const ctx = makeCtx([]);
      const code = await worldCommand.run(ctx as any);
      expect(code).toBe(1);
      expect(ctx.errLines.join('')).toContain('TTY');
    });

    it('does not print to stdout on non-TTY exit', async () => {
      Object.defineProperty(process.stdout, 'isTTY', {
        value: false,
        writable: true,
        configurable: true,
      });
      const ctx = makeCtx([]);
      await worldCommand.run(ctx as any);
      expect(ctx.outLines).toHaveLength(0);
    });
  });
});

// ── deriveState ───────────────────────────────────────────────────────────────

describe('deriveState', () => {
  const NOW = Date.now();

  it('returns offline for inactive personality', () => {
    const p = makePersonality({ isActive: false });
    const { state, taskLabel } = deriveState(p, [], EMPTY_TALKING, NOW);
    expect(state).toBe('offline');
    expect(taskLabel).toBe('inactive');
  });

  it('returns idle when no tasks and no recent events', () => {
    const p = makePersonality();
    const { state, taskLabel } = deriveState(p, [], EMPTY_TALKING, NOW);
    expect(state).toBe('idle');
    expect(taskLabel).toBe('');
  });

  it('returns thinking when task is very recent (< 2 s old)', () => {
    const p = makePersonality();
    const task = makeTask({ startedAt: NOW - 500 });
    const { state, taskLabel } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('thinking');
    expect(taskLabel).toBeTruthy();
  });

  it('returns typing when task is older than 2 s', () => {
    const p = makePersonality();
    const task = makeTask({ startedAt: NOW - 5_000 });
    const { state, taskLabel } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('typing');
    expect(taskLabel).toBeTruthy();
  });

  it('uses task title as taskLabel', () => {
    const p = makePersonality();
    const task = makeTask({ title: 'analyze codebase', startedAt: NOW - 20_000 });
    const { taskLabel } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(taskLabel).toBe('analyze codebase');
  });

  it('falls back to task name when title is absent', () => {
    const p = makePersonality();
    const task = { ...makeTask({ startedAt: NOW - 20_000 }), name: 'run tests' } as any;
    const { taskLabel } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(taskLabel).toBe('run tests');
  });

  it('uses "task" as fallback when both title and name are absent', () => {
    const p = makePersonality();
    const task = makeTask({ startedAt: NOW - 20_000 });
    delete (task as any).title;
    delete (task as any).name;
    const { taskLabel } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(taskLabel).toBe('task');
  });

  it('ignores tasks belonging to a different personality', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ personalityId: 'p-999', startedAt: NOW - 20_000 });
    const { state } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('idle');
  });

  it('ignores non-running tasks', () => {
    const p = makePersonality();
    const task = makeTask({ status: 'completed', startedAt: NOW - 20_000 });
    const { state } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('idle');
  });

  it('returns talking when talkingUntil is in the future', () => {
    const p = makePersonality({ id: 'p-001' });
    const talkingUntil = new Map([['p-001', NOW + 30_000]]);
    const { state, taskLabel } = deriveState(p, [], talkingUntil, NOW);
    expect(state).toBe('talking');
    expect(taskLabel).toBe('responded');
  });

  it('does not return talking when talkingUntil has expired', () => {
    const p = makePersonality({ id: 'p-001' });
    const talkingUntil = new Map([['p-001', NOW - 1]]);
    const { state } = deriveState(p, [], talkingUntil, NOW);
    expect(state).toBe('idle');
  });

  it('running task takes priority over talking state', () => {
    const p = makePersonality({ id: 'p-001' });
    const task = makeTask({ startedAt: NOW - 20_000 });
    const talkingUntil = new Map([['p-001', NOW + 30_000]]);
    const { state } = deriveState(p, [task], talkingUntil, NOW);
    expect(state).toBe('typing');
  });

  it('offline takes priority over everything', () => {
    const p = makePersonality({ id: 'p-001', isActive: false });
    const task = makeTask({ startedAt: NOW - 20_000 });
    const talkingUntil = new Map([['p-001', NOW + 30_000]]);
    const { state } = deriveState(p, [task], talkingUntil, NOW);
    expect(state).toBe('offline');
  });

  it('uses createdAt as fallback when startedAt is absent', () => {
    const p = makePersonality();
    const task = { id: 't-1', personalityId: 'p-001', status: 'running', createdAt: NOW - 500 };
    const { state } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('thinking'); // < 2 s
  });
});

// ── centerIn ──────────────────────────────────────────────────────────────────

describe('centerIn', () => {
  it('centers a plain string within given width', () => {
    const result = centerIn('abc', 9);
    // visual: 3 chars in 9 → 3 left + 3 right
    expect(result).toBe('   abc   ');
    expect(result.length).toBe(9);
  });

  it('handles odd-width excess (left < right)', () => {
    const result = centerIn('ab', 7);
    // 7-2=5 extra, left=2, right=3
    expect(result).toBe('  ab   ');
    expect(result.length).toBe(7);
  });

  it('does not add padding when content exactly fills width', () => {
    const result = centerIn('hello', 5);
    expect(result).toBe('hello');
  });

  it('does not truncate when content exceeds width', () => {
    const result = centerIn('toolong', 3);
    expect(result).toBe('toolong'); // no truncation, no extra padding
  });

  it('strips ANSI codes when computing visual width', () => {
    const ansiStr = '\x1b[32mok\x1b[0m'; // "ok" in green — visual width 2
    const result = centerIn(ansiStr, 6);
    // 6 - 2 = 4 extra → 2 left, 2 right
    expect(result).toBe('  \x1b[32mok\x1b[0m  ');
    expect(result.replace(/\x1b\[[^m]*m/g, '').length).toBe(6);
  });

  it('correctly handles box-drawing characters', () => {
    const result = centerIn('╔═══╗', 9); // visual width 5
    expect(result).toBe('  ╔═══╗  ');
    expect(result.length).toBe(9);
  });

  it('centers empty string with all spaces', () => {
    const result = centerIn('', 4);
    expect(result).toBe('    ');
  });
});

// ── buildFloorPlan ────────────────────────────────────────────────────────────

describe('buildFloorPlan', () => {
  it('compact builds without error, walkable non-empty, has ≥1 desk', () => {
    const plan = buildFloorPlan('compact');
    expect(plan.walkable.size).toBeGreaterThan(0);
    expect(plan.desks.length).toBeGreaterThanOrEqual(1);
    expect(plan.rows.length).toBeGreaterThan(0);
  });

  it('normal builds without error, has all 4 zone waypoints, ≥3 desks', () => {
    const plan = buildFloorPlan('normal');
    expect(plan.zoneWaypoints['workspace']).toBeDefined();
    expect(plan.zoneWaypoints['meeting']).toBeDefined();
    expect(plan.zoneWaypoints['server-room']).toBeDefined();
    expect(plan.zoneWaypoints['break-room']).toBeDefined();
    expect(plan.desks.length).toBeGreaterThanOrEqual(3);
  });

  it('large builds without error, more desks than normal', () => {
    const normal = buildFloorPlan('normal');
    const large = buildFloorPlan('large');
    expect(large.desks.length).toBeGreaterThan(normal.desks.length);
  });

  it('compact: every desk position is in the walkable set', () => {
    const plan = buildFloorPlan('compact');
    for (const desk of plan.desks) {
      expect(plan.walkable.has(`${desk.row},${desk.col}`)).toBe(true);
    }
  });

  it('normal: every desk position is in the walkable set', () => {
    const plan = buildFloorPlan('normal');
    for (const desk of plan.desks) {
      expect(plan.walkable.has(`${desk.row},${desk.col}`)).toBe(true);
    }
  });

  it('large: every desk position is in the walkable set', () => {
    const plan = buildFloorPlan('large');
    for (const desk of plan.desks) {
      expect(plan.walkable.has(`${desk.row},${desk.col}`)).toBe(true);
    }
  });

  it('normal: all zone waypoints are in the walkable set', () => {
    const plan = buildFloorPlan('normal');
    for (const wp of Object.values(plan.zoneWaypoints)) {
      expect(plan.walkable.has(`${wp.row},${wp.col}`)).toBe(true);
    }
  });

  it('large: all zone waypoints are in the walkable set', () => {
    const plan = buildFloorPlan('large');
    for (const wp of Object.values(plan.zoneWaypoints)) {
      expect(plan.walkable.has(`${wp.row},${wp.col}`)).toBe(true);
    }
  });

  it('normal: workspace and meeting waypoints are reachable from each other via BFS', () => {
    const plan = buildFloorPlan('normal');
    const wsWp = plan.zoneWaypoints['workspace'];
    const mtWp = plan.zoneWaypoints['meeting'];
    const path = findPath(plan.walkable, wsWp, mtWp);
    expect(path.length).toBeGreaterThan(0);
    // Path ends at meeting waypoint
    expect(path[path.length - 1]).toEqual(mtWp);
  });

  it('normal: all 4 zones are mutually reachable', () => {
    const plan = buildFloorPlan('normal');
    const zones = Object.values(plan.zoneWaypoints) as WorldPos[];
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const path = findPath(plan.walkable, zones[i]!, zones[j]!);
        expect(path.length).toBeGreaterThan(0);
      }
    }
  });
});

// ── findPath ──────────────────────────────────────────────────────────────────

describe('findPath', () => {
  // Simple 5×5 walkable grid (rows 0–4, cols 0–4)
  function makeGrid(rows = 5, cols = 5): Set<string> {
    const w = new Set<string>();
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        w.add(`${r},${c}`);
      }
    }
    return w;
  }

  it('returns empty array when from === to', () => {
    const w = makeGrid();
    expect(findPath(w, { row: 2, col: 2 }, { row: 2, col: 2 })).toEqual([]);
  });

  it('single step north', () => {
    const w = makeGrid();
    const path = findPath(w, { row: 2, col: 2 }, { row: 1, col: 2 });
    expect(path).toEqual([{ row: 1, col: 2 }]);
  });

  it('single step south', () => {
    const w = makeGrid();
    const path = findPath(w, { row: 2, col: 2 }, { row: 3, col: 2 });
    expect(path).toEqual([{ row: 3, col: 2 }]);
  });

  it('single step east', () => {
    const w = makeGrid();
    const path = findPath(w, { row: 2, col: 2 }, { row: 2, col: 3 });
    expect(path).toEqual([{ row: 2, col: 3 }]);
  });

  it('single step west', () => {
    const w = makeGrid();
    const path = findPath(w, { row: 2, col: 2 }, { row: 2, col: 1 });
    expect(path).toEqual([{ row: 2, col: 1 }]);
  });

  it('excludes start position from result', () => {
    const w = makeGrid();
    const path = findPath(w, { row: 0, col: 0 }, { row: 0, col: 2 });
    expect(path.every((p) => !(p.row === 0 && p.col === 0))).toBe(true);
  });

  it('path ends exactly at destination', () => {
    const w = makeGrid();
    const to: WorldPos = { row: 4, col: 4 };
    const path = findPath(w, { row: 0, col: 0 }, to);
    expect(path.length).toBeGreaterThan(0);
    expect(path[path.length - 1]).toEqual(to);
  });

  it('L-shaped path navigates correctly', () => {
    const w = makeGrid();
    const path = findPath(w, { row: 0, col: 0 }, { row: 2, col: 3 });
    expect(path.length).toBe(5); // Manhattan distance = 5
    expect(path[path.length - 1]).toEqual({ row: 2, col: 3 });
  });

  it('returns empty when destination is not walkable', () => {
    const w = makeGrid();
    // Remove destination from walkable
    w.delete('4,4');
    const path = findPath(w, { row: 0, col: 0 }, { row: 4, col: 4 });
    expect(path).toEqual([]);
  });

  it('respects walls — does not traverse non-walkable cells', () => {
    // Create a grid with a vertical wall at col 2 (except row 4)
    const w = new Set<string>();
    for (let r = 0; r < 5; r++) {
      for (let c = 0; c < 5; c++) {
        if (c === 2 && r < 4) continue; // wall
        w.add(`${r},${c}`);
      }
    }
    const path = findPath(w, { row: 0, col: 0 }, { row: 0, col: 4 });
    // Must go around the wall via row 4
    expect(path.length).toBeGreaterThan(4);
    // Path must not include any cell at col 2 with row < 4
    for (const p of path) {
      if (p.col === 2) expect(p.row).toBeGreaterThanOrEqual(4);
    }
  });

  it('returns empty for unreachable destination (disconnected)', () => {
    // Completely isolated destination
    const w = new Set(['0,0', '0,1', '1,0']);
    const path = findPath(w, { row: 0, col: 0 }, { row: 5, col: 5 });
    expect(path).toEqual([]);
  });
});

// ── computeMood ───────────────────────────────────────────────────────────────

describe('computeMood', () => {
  const NOW = 1_000_000;

  it('returns calm when no tasks and no events', () => {
    expect(computeMood([], [], 0, NOW)).toBe('calm');
  });

  it('returns productive when 1 running task', () => {
    const task = makeTask({ status: 'running' });
    expect(computeMood([task], [], 0, NOW)).toBe('productive');
  });

  it('returns busy when 5 running tasks', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: `t-${i}`, status: 'running' })
    );
    expect(computeMood(tasks, [], 0, NOW)).toBe('busy');
  });

  it('returns alert when security event within last 5 min', () => {
    const event = makeAuditEntry({
      type: 'security_breach',
      timestamp: NOW - 60_000, // 1 min ago
    });
    expect(computeMood([], [event], 0, NOW)).toBe('alert');
  });

  it('alert takes priority over busy', () => {
    const tasks = Array.from({ length: 5 }, (_, i) =>
      makeTask({ id: `t-${i}`, status: 'running' })
    );
    const event = makeAuditEntry({
      type: 'security_event',
      timestamp: NOW - 60_000,
    });
    expect(computeMood(tasks, [event], 0, NOW)).toBe('alert');
  });

  it('celebration beats alert', () => {
    const event = makeAuditEntry({
      type: 'security_breach',
      timestamp: NOW - 60_000,
    });
    expect(computeMood([], [event], NOW + 1_000, NOW)).toBe('celebration');
  });

  it('expired celebrationUntil falls back correctly to productive', () => {
    const task = makeTask({ status: 'running' });
    // celebrationUntil is in the past
    expect(computeMood([task], [], NOW - 1, NOW)).toBe('productive');
  });

  it('does not return alert for old security events (> 5 min)', () => {
    const event = makeAuditEntry({
      type: 'security_event',
      timestamp: NOW - 6 * 60_000, // 6 min ago
    });
    expect(computeMood([], [event], 0, NOW)).toBe('calm');
  });

  it('uses action field when type is absent for alert detection', () => {
    const event = makeAuditEntry({
      action: 'security_scan',
      timestamp: NOW - 60_000,
    });
    expect(computeMood([], [event], 0, NOW)).toBe('alert');
  });

  it('returns productive with 1-4 running tasks', () => {
    const tasks = Array.from({ length: 4 }, (_, i) =>
      makeTask({ id: `t-${i}`, status: 'running' })
    );
    expect(computeMood(tasks, [], 0, NOW)).toBe('productive');
  });

  it('ignores non-running tasks for busy/productive calculation', () => {
    const tasks = Array.from({ length: 10 }, (_, i) =>
      makeTask({ id: `t-${i}`, status: 'completed' })
    );
    expect(computeMood(tasks, [], 0, NOW)).toBe('calm');
  });

  it('uses createdAt when timestamp is missing from event', () => {
    const event = makeAuditEntry({
      type: 'security_alert',
      // timestamp is absent, createdAt present
    });
    // Manually set createdAt
    (event as any).createdAt = NOW - 60_000;
    expect(computeMood([], [event], 0, NOW)).toBe('alert');
  });

  it('uses 0 when both timestamp and createdAt are missing', () => {
    const event = makeAuditEntry({
      type: 'security_alert',
    });
    // age = NOW - 0 = NOW, which is > 5 min (NOW = 1_000_000)
    expect(computeMood([], [event], 0, NOW)).toBe('calm');
  });

  it('does not trigger alert for non-security event', () => {
    const event = makeAuditEntry({
      type: 'user_login',
      timestamp: NOW - 60_000,
    });
    expect(computeMood([], [event], 0, NOW)).toBe('calm');
  });
});

// ── Additional buildFloorPlan coverage ───────────────────────────────────────

describe('buildFloorPlan (additional)', () => {
  it('compact: zoneOf maps all cells to workspace', () => {
    const plan = buildFloorPlan('compact');
    for (const [, zone] of plan.zoneOf) {
      expect(zone).toBe('workspace');
    }
  });

  it('compact: all 4 zone waypoints point to the same position', () => {
    const plan = buildFloorPlan('compact');
    const wp = plan.zoneWaypoints['workspace'];
    expect(plan.zoneWaypoints['meeting']).toEqual(wp);
    expect(plan.zoneWaypoints['server-room']).toEqual(wp);
    expect(plan.zoneWaypoints['break-room']).toEqual(wp);
  });

  it('compact: has exactly 12 desks (6 per row, 2 rows)', () => {
    const plan = buildFloorPlan('compact');
    expect(plan.desks.length).toBe(12);
  });

  it('normal: has exactly 6 desks', () => {
    const plan = buildFloorPlan('normal');
    expect(plan.desks.length).toBe(6);
  });

  it('normal: has serverRackPos, coffeePos, and whiteboardRow', () => {
    const plan = buildFloorPlan('normal');
    expect(plan.serverRackPos).toBeDefined();
    expect(plan.coffeePos).toBeDefined();
    expect(plan.whiteboardRow).toBeDefined();
  });

  it('large: has exactly 12 desks (4 per row, 3 rows)', () => {
    const plan = buildFloorPlan('large');
    expect(plan.desks.length).toBe(12);
  });

  it('large: has serverRackPos, coffeePos, and whiteboardRow', () => {
    const plan = buildFloorPlan('large');
    expect(plan.serverRackPos).toBeDefined();
    expect(plan.coffeePos).toBeDefined();
    expect(plan.whiteboardRow).toBeDefined();
  });

  it('normal: zoneOf maps cells to correct zones by quadrant', () => {
    const plan = buildFloorPlan('normal');
    // top-left should be workspace
    expect(plan.zoneOf.get('2,5')).toBe('workspace');
    // top-right should be meeting
    expect(plan.zoneOf.get('2,50')).toBe('meeting');
    // bottom-left should be server-room
    expect(plan.zoneOf.get('8,5')).toBe('server-room');
    // bottom-right should be break-room
    expect(plan.zoneOf.get('8,50')).toBe('break-room');
  });

  it('large: zoneOf maps cells to correct zones by quadrant', () => {
    const plan = buildFloorPlan('large');
    expect(plan.zoneOf.get('3,10')).toBe('workspace');
    expect(plan.zoneOf.get('3,80')).toBe('meeting');
    expect(plan.zoneOf.get('10,10')).toBe('server-room');
    expect(plan.zoneOf.get('10,80')).toBe('break-room');
  });

  it('large: all 4 zones are mutually reachable', () => {
    const plan = buildFloorPlan('large');
    const zones = Object.values(plan.zoneWaypoints) as WorldPos[];
    for (let i = 0; i < zones.length; i++) {
      for (let j = i + 1; j < zones.length; j++) {
        const path = findPath(plan.walkable, zones[i]!, zones[j]!);
        expect(path.length).toBeGreaterThan(0);
      }
    }
  });

  it('large: rows string array has 16 entries', () => {
    const plan = buildFloorPlan('large');
    expect(plan.rows.length).toBe(16);
  });

  it('normal: rows string array has 12 entries', () => {
    const plan = buildFloorPlan('normal');
    expect(plan.rows.length).toBe(12);
  });

  it('compact: rows string array has 10 entries', () => {
    const plan = buildFloorPlan('compact');
    expect(plan.rows.length).toBe(10);
  });
});

// ── Additional findPath edge cases ──────────────────────────────────────────

describe('findPath (additional)', () => {
  it('finds path in a minimal 2-cell grid', () => {
    const w = new Set(['0,0', '0,1']);
    const path = findPath(w, { row: 0, col: 0 }, { row: 0, col: 1 });
    expect(path).toEqual([{ row: 0, col: 1 }]);
  });

  it('returns empty when start is not walkable but destination is', () => {
    const w = new Set(['1,1']);
    // Start at 0,0 which is not walkable, destination is 1,1
    const path = findPath(w, { row: 0, col: 0 }, { row: 1, col: 1 });
    expect(path).toEqual([]);
  });

  it('finds path along a narrow corridor', () => {
    // Horizontal corridor: row 0, cols 0-9
    const w = new Set<string>();
    for (let c = 0; c < 10; c++) w.add(`0,${c}`);
    const path = findPath(w, { row: 0, col: 0 }, { row: 0, col: 9 });
    expect(path.length).toBe(9);
    expect(path[path.length - 1]).toEqual({ row: 0, col: 9 });
  });
});

// ── Additional deriveState edge cases ───────────────────────────────────────

describe('deriveState (additional)', () => {
  const NOW = Date.now();

  it('thinking state threshold is exactly at 2000ms boundary', () => {
    const p = makePersonality();
    const task = makeTask({ startedAt: NOW - 1999 });
    const { state } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('thinking');
  });

  it('typing state at exactly 2000ms boundary', () => {
    const p = makePersonality();
    const task = makeTask({ startedAt: NOW - 2000 });
    const { state } = deriveState(p, [task], EMPTY_TALKING, NOW);
    expect(state).toBe('typing');
  });

  it('handles multiple running tasks for same personality (uses first match)', () => {
    const p = makePersonality();
    const task1 = makeTask({ id: 't-1', title: 'first task', startedAt: NOW - 5_000 });
    const task2 = makeTask({ id: 't-2', title: 'second task', startedAt: NOW - 1_000 });
    const { taskLabel } = deriveState(p, [task1, task2], EMPTY_TALKING, NOW);
    expect(taskLabel).toBe('first task');
  });

  it('returns idle when talkingUntil map has different personality id', () => {
    const p = makePersonality({ id: 'p-001' });
    const talkingUntil = new Map([['p-other', NOW + 30_000]]);
    const { state } = deriveState(p, [], talkingUntil, NOW);
    expect(state).toBe('idle');
  });

  it('handles task with neither startedAt nor createdAt (age = 0)', () => {
    const p = makePersonality();
    const task = { id: 't-1', personalityId: 'p-001', status: 'running' };
    const { state } = deriveState(p, [task], EMPTY_TALKING, NOW);
    // age = now - now = 0, so < 2000 → thinking
    expect(state).toBe('thinking');
  });
});
