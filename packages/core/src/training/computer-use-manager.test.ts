import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ComputerUseManager } from './computer-use-manager.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = [], rowCount = rows.length) {
  return { query: vi.fn(async () => ({ rows, rowCount })) } as any;
}

function makeLogger() {
  return { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn(), child: vi.fn(function(this: any) { return this; }) } as any;
}

function makeEpisodeRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'ep-1',
    session_id: 'sess-1',
    skill_name: 'click',
    state_encoding: { url: 'https://example.com' },
    action_type: 'click',
    action_target: '#submit',
    action_value: '',
    reward: 1,
    done: true,
    created_at: new Date('2026-03-01T00:00:00Z'),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('ComputerUseManager', () => {
  let manager: ComputerUseManager;
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new ComputerUseManager(pool, logger);
  });

  // ── recordEpisode ─────────────────────────────────────────────────────────

  describe('recordEpisode()', () => {
    it('inserts and returns a mapped episode', async () => {
      pool.query = vi.fn(async () => ({ rows: [makeEpisodeRow()], rowCount: 1 }));

      const ep = await manager.recordEpisode({
        sessionId: 'sess-1',
        skillName: 'click',
        stateEncoding: {},
        actionType: 'click',
        actionTarget: '#submit',
        actionValue: '',
        reward: 1,
        done: true,
      });

      expect(ep.id).toBe('ep-1');
      expect(ep.skillName).toBe('click');
      expect(ep.reward).toBe(1);
      expect(ep.done).toBe(true);
      expect(logger.debug).toHaveBeenCalledOnce();
    });

    it('generates a UUID id (not passed in)', async () => {
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => ({
        rows: [makeEpisodeRow({ id: params[0] as string })],
        rowCount: 1,
      }));

      const ep = await manager.recordEpisode({
        sessionId: 's',
        skillName: 'scroll',
        stateEncoding: {},
        actionType: 'scroll',
        actionTarget: 'window',
        actionValue: '100',
        reward: 0,
        done: false,
      });

      expect(ep.id).toMatch(/^[0-9a-f-]{36}$/);
    });

    it('serializes stateEncoding as JSON', async () => {
      const capturedParams: unknown[][] = [];
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        capturedParams.push(params);
        return { rows: [makeEpisodeRow()], rowCount: 1 };
      });

      await manager.recordEpisode({
        sessionId: 's',
        skillName: 'type',
        stateEncoding: { page: 'login', field: 'email' },
        actionType: 'type',
        actionTarget: '#email',
        actionValue: 'user@example.com',
        reward: 0,
        done: false,
      });

      const stateParam = capturedParams[0]![3];
      expect(typeof stateParam).toBe('string');
      expect(JSON.parse(stateParam as string)).toEqual({ page: 'login', field: 'email' });
    });
  });

  // ── listEpisodes ─────────────────────────────────────────────────────────

  describe('listEpisodes()', () => {
    it('returns all episodes with no filters', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeEpisodeRow({ id: 'ep-1' }), makeEpisodeRow({ id: 'ep-2' })],
        rowCount: 2,
      }));
      const episodes = await manager.listEpisodes();
      expect(episodes).toHaveLength(2);
    });

    it('filters by skillName', async () => {
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        expect(params).toContain('click');
        return { rows: [makeEpisodeRow()], rowCount: 1 };
      });
      const episodes = await manager.listEpisodes({ skillName: 'click' });
      expect(episodes).toHaveLength(1);
    });

    it('filters by sessionId', async () => {
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        expect(params).toContain('sess-abc');
        return { rows: [makeEpisodeRow({ session_id: 'sess-abc' })], rowCount: 1 };
      });
      const episodes = await manager.listEpisodes({ sessionId: 'sess-abc' });
      expect(episodes[0]!.sessionId).toBe('sess-abc');
    });

    it('applies limit', async () => {
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        expect(params).toContain(25);
        return { rows: [], rowCount: 0 };
      });
      await manager.listEpisodes({ limit: 25 });
    });

    it('defaults limit to 100', async () => {
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        expect(params).toContain(100);
        return { rows: [], rowCount: 0 };
      });
      await manager.listEpisodes();
    });
  });

  // ── getSessionStats ───────────────────────────────────────────────────────

  describe('getSessionStats()', () => {
    it('returns stats with correct calculations', async () => {
      pool.query = vi.fn(async () => ({
        rows: [{ total: '10', done_count: '7', avg_reward: '0.85' }],
        rowCount: 1,
      }));

      const stats = await manager.getSessionStats('sess-1');
      expect(stats.totalEpisodes).toBe(10);
      expect(stats.successRate).toBeCloseTo(0.7, 5);
      expect(stats.avgReward).toBeCloseTo(0.85, 5);
    });

    it('handles zero total episodes', async () => {
      pool.query = vi.fn(async () => ({
        rows: [{ total: '0', done_count: '0', avg_reward: null }],
        rowCount: 1,
      }));

      const stats = await manager.getSessionStats('empty-sess');
      expect(stats.totalEpisodes).toBe(0);
      expect(stats.successRate).toBe(0);
      expect(stats.avgReward).toBe(0);
    });
  });

  // ── getSkillBreakdown ─────────────────────────────────────────────────────

  describe('getSkillBreakdown()', () => {
    it('returns per-skill breakdown', async () => {
      pool.query = vi.fn(async () => ({
        rows: [
          { skill_name: 'click', cnt: '5', done_count: '4', avg_reward: '0.9' },
          { skill_name: 'scroll', cnt: '3', done_count: '1', avg_reward: '0.3' },
        ],
        rowCount: 2,
      }));

      const breakdown = await manager.getSkillBreakdown();
      expect(breakdown).toHaveLength(2);
      expect(breakdown[0]!.skillName).toBe('click');
      expect(breakdown[0]!.episodeCount).toBe(5);
      expect(breakdown[0]!.successRate).toBeCloseTo(0.8, 5);
      expect(breakdown[1]!.skillName).toBe('scroll');
    });

    it('returns empty array when no episodes', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const breakdown = await manager.getSkillBreakdown();
      expect(breakdown).toEqual([]);
    });
  });

  // ── deleteEpisode ─────────────────────────────────────────────────────────

  describe('deleteEpisode()', () => {
    it('returns true when episode deleted', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
      expect(await manager.deleteEpisode('ep-1')).toBe(true);
    });

    it('returns false when episode not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      expect(await manager.deleteEpisode('nope')).toBe(false);
    });
  });

  // ── exportEpisodes ────────────────────────────────────────────────────────

  describe('exportEpisodes()', () => {
    it('yields JSONL lines for all episodes', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeEpisodeRow(), makeEpisodeRow({ id: 'ep-2' })], rowCount: 2 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const lines: string[] = [];
      for await (const line of manager.exportEpisodes('computer_use')) {
        lines.push(line);
      }

      expect(lines).toHaveLength(2);
      const parsed = JSON.parse(lines[0]!.trim());
      expect(parsed.format).toBe('computer_use');
      expect(parsed.id).toBe('ep-1');
      expect(parsed.action.type).toBe('click');
    });

    it('yields nothing when no episodes', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const lines: string[] = [];
      for await (const line of manager.exportEpisodes('computer_use')) {
        lines.push(line);
      }
      expect(lines).toHaveLength(0);
    });

    it('paginates correctly — stops after partial page', async () => {
      // First page: 200 rows (PAGE), second page: 50 rows (< PAGE = stop)
      const makeRows = (n: number) =>
        Array.from({ length: n }, (_, i) => makeEpisodeRow({ id: `ep-${i}` }));

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: makeRows(200), rowCount: 200 })
        .mockResolvedValueOnce({ rows: makeRows(50), rowCount: 50 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const lines: string[] = [];
      for await (const line of manager.exportEpisodes('computer_use')) {
        lines.push(line);
      }
      expect(lines).toHaveLength(250);
    });
  });
});
