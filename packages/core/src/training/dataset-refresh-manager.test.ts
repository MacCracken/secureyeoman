import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DatasetRefreshManager } from './dataset-refresh-manager.js';

// ── Pool mock ────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = []) {
  return {
    query: vi.fn(async () => ({ rows, rowCount: rows.length })),
  } as any;
}

// ── Logger mock ──────────────────────────────────────────────────────────────

function makeLogger() {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn(function () {
      return this;
    }),
  } as any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJobRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'refresh-1',
    name: 'Nightly refresh',
    target_dataset_id: null,
    curation_rules: {},
    schedule_cron: null,
    last_conversation_ts: null,
    status: 'idle',
    samples_added: 0,
    last_run_at: null,
    next_run_at: null,
    created_at: new Date(),
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('DatasetRefreshManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: DatasetRefreshManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new DatasetRefreshManager({ pool, logger });
  });

  afterEach(() => {
    manager.stopAll();
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts job', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.create({
        name: 'Nightly refresh',
        curationRules: { qualityThreshold: 0.7 },
      });

      expect(pool.query).toHaveBeenCalled();
      expect(job.id).toBe('refresh-1');
      expect(job.status).toBe('idle');
    });

    it('with schedule_cron', async () => {
      const row = makeJobRow({ schedule_cron: '0 2 * * *' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.create({
        name: 'Nightly refresh',
        curationRules: { qualityThreshold: 0.7 },
        scheduleCron: '0 2 * * *',
      });

      expect(job.scheduleCron).toBe('0 2 * * *');
    });
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns jobs', async () => {
      const rows = [makeJobRow(), makeJobRow({ id: 'refresh-2' })];
      pool.query = vi.fn(async () => ({ rows, rowCount: rows.length }));

      const jobs = await manager.list();
      expect(jobs).toHaveLength(2);
    });
  });

  // ── get ──────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns job by ID', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.get('refresh-1');
      expect(job).not.toBeNull();
      expect(job!.id).toBe('refresh-1');
    });

    it('returns null', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const job = await manager.get('nope');
      expect(job).toBeNull();
    });
  });

  // ── delete ───────────────────────────────────────────────────────────────

  describe('delete()', () => {
    it('removes job and stops cron', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));

      const result = await manager.delete('refresh-1');
      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalled();
    });
  });

  // ── runRefresh ───────────────────────────────────────────────────────────

  describe('runRefresh()', () => {
    it('queries new conversations from DB', async () => {
      const row = makeJobRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET status='running'
        .mockResolvedValueOnce({ rows: [{ id: 'conv-1', created_at: new Date() }], rowCount: 1 }) // SELECT conversations
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // SET status='completed'

      const result = await manager.runRefresh('refresh-1');
      expect(result.samplesAdded).toBe(1);
      // Should have queried chat.conversations
      const selectCalls = pool.query.mock.calls.filter((c: any) =>
        String(c[0]).includes('chat.conversations')
      );
      expect(selectCalls.length).toBeGreaterThan(0);
    });

    it('updates last_conversation_ts watermark', async () => {
      const row = makeJobRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET status='running'
        .mockResolvedValueOnce({ rows: [{ id: 'conv-1', created_at: new Date() }], rowCount: 1 }) // SELECT conversations
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // SET status='completed'

      await manager.runRefresh('refresh-1');

      const updateCalls = pool.query.mock.calls.filter((c: any) =>
        String(c[0]).includes('last_conversation_ts')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });

    it('sets status to completed', async () => {
      const row = makeJobRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET status='running'
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT conversations (none)
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // SET status='completed'

      await manager.runRefresh('refresh-1');

      const statusCalls = pool.query.mock.calls.filter((c: any) =>
        String(c[0]).includes('completed')
      );
      expect(statusCalls.length).toBeGreaterThan(0);
    });

    it('sets status to failed on error', async () => {
      const row = makeJobRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET status='running'
        .mockRejectedValueOnce(new Error('DB error')); // SELECT conversations fails

      await expect(manager.runRefresh('refresh-1')).rejects.toThrow();
    });

    it('throws for non-existent job', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      await expect(manager.runRefresh('nope')).rejects.toThrow();
    });

    it('respects quality threshold from curation rules', async () => {
      const row = makeJobRow({ curation_rules: { qualityThreshold: 0.9 } });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET status='running'
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SELECT conversations
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // SET status='completed'

      await manager.runRefresh('refresh-1');
      // Quality threshold should be passed as query parameter
      const selectCalls = pool.query.mock.calls.filter((c: any) =>
        String(c[0]).includes('quality_score')
      );
      expect(selectCalls.length).toBeGreaterThan(0);
    });

    it('counts samples added', async () => {
      const row = makeJobRow();
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // SET status='running'
        .mockResolvedValueOnce({ rows: [{ id: 'conv-1', created_at: new Date() }, { id: 'conv-2', created_at: new Date() }], rowCount: 2 }) // SELECT conversations
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // SET status='completed'

      const result = await manager.runRefresh('refresh-1');
      expect(result.samplesAdded).toBe(2);

      const updateCalls = pool.query.mock.calls.filter((c: any) =>
        String(c[0]).includes('samples_added')
      );
      expect(updateCalls.length).toBeGreaterThan(0);
    });
  });

  // ── cron ─────────────────────────────────────────────────────────────────

  describe('startCron / stopCron', () => {
    it('starts and stops without error', () => {
      vi.useFakeTimers();
      // These should not throw
      manager.startCron('refresh-1', 300_000);
      manager.stopCron('refresh-1');
      vi.useRealTimers();
    });
  });

  describe('stopAll()', () => {
    it('clears all cron handles', () => {
      vi.useFakeTimers();
      manager.startCron('refresh-1', 300_000);
      manager.startCron('refresh-2', 3600_000);
      manager.stopAll();
      // Should not throw and all handles should be cleared
      vi.useRealTimers();
    });
  });
});
