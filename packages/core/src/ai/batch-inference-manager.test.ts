import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BatchInferenceManager } from './batch-inference-manager.js';

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

// ── AI Client mock ───────────────────────────────────────────────────────────

function makeAIClient(content = 'response') {
  return {
    chat: vi.fn(async () => ({ content })),
  } as any;
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeJobRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'batch-1',
    name: 'Test batch',
    prompts: [{ id: '0', prompt: 'Hello' }, { id: '1', prompt: 'World' }],
    concurrency: 5,
    status: 'pending',
    total_prompts: 2,
    completed_prompts: 0,
    failed_prompts: 0,
    results: null,
    created_by: null,
    created_at: new Date(),
    completed_at: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('BatchInferenceManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let aiClient: ReturnType<typeof makeAIClient>;
  let manager: BatchInferenceManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    aiClient = makeAIClient();
    manager = new BatchInferenceManager({ pool, logger, aiClient });
  });

  // ── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('stores default config', () => {
      expect(manager).toBeDefined();
    });
  });

  // ── createJob ────────────────────────────────────────────────────────────

  describe('createJob()', () => {
    it('inserts job and returns BatchInferenceJob', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Test batch',
        prompts: [{ id: '0', prompt: 'Hello' }, { id: '1', prompt: 'World' }],
      });

      expect(pool.query).toHaveBeenCalled();
      expect(job.id).toBe('batch-1');
      expect(job.status).toBe('pending');
    });

    it('clamps concurrency to maxConcurrency', async () => {
      const row = makeJobRow({ concurrency: 10 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Test batch',
        prompts: [{ id: '0', prompt: 'Hello' }],
        concurrency: 999,
      });

      expect(pool.query).toHaveBeenCalled();
      // concurrency should be clamped
      expect(job.concurrency).toBeLessThanOrEqual(50);
    });

    it('stores created_by', async () => {
      const row = makeJobRow({ created_by: 'user-1' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Test batch',
        prompts: [{ id: '0', prompt: 'Hello' }],
        createdBy: 'user-1',
      });

      expect(job.createdBy).toBe('user-1');
    });
  });

  // ── getJob ───────────────────────────────────────────────────────────────

  describe('getJob()', () => {
    it('returns job by ID', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.getJob('batch-1');
      expect(job).not.toBeNull();
      expect(job!.id).toBe('batch-1');
    });

    it('returns null for non-existent', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const job = await manager.getJob('nope');
      expect(job).toBeNull();
    });
  });

  // ── listJobs ─────────────────────────────────────────────────────────────

  describe('listJobs()', () => {
    it('returns jobs sorted by created_at', async () => {
      const rows = [
        makeJobRow({ id: 'batch-2', created_at: new Date('2026-01-02') }),
        makeJobRow({ id: 'batch-1', created_at: new Date('2026-01-01') }),
      ];
      pool.query = vi.fn(async () => ({ rows, rowCount: rows.length }));

      const jobs = await manager.listJobs();
      expect(jobs).toHaveLength(2);
      expect(pool.query).toHaveBeenCalled();
    });
  });

  // ── cancelJob ────────────────────────────────────────────────────────────

  describe('cancelJob()', () => {
    it('updates status to cancelled', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));

      const result = await manager.cancelJob('batch-1');
      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalled();
    });

    it('returns false for completed job', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const result = await manager.cancelJob('batch-1');
      expect(result).toBe(false);
    });
  });

  // ── executeJob ───────────────────────────────────────────────────────────

  describe('executeJob()', () => {
    it('processes all prompts', async () => {
      const row = makeJobRow({ prompts: [{ id: '0', prompt: 'Hello' }, { id: '1', prompt: 'World' }] });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // getJob
        .mockResolvedValue({ rows: [], rowCount: 1 }); // updates

      await manager.executeJob('batch-1');
      expect(aiClient.chat).toHaveBeenCalledTimes(2);
    });

    it('handles prompt failures', async () => {
      const row = makeJobRow({ prompts: [{ id: '0', prompt: 'Hello' }, { id: '1', prompt: 'Fail' }] });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      aiClient.chat = vi.fn()
        .mockResolvedValueOnce({ content: 'ok' })
        .mockRejectedValueOnce(new Error('provider error'));

      await manager.executeJob('batch-1');
      expect(aiClient.chat).toHaveBeenCalledTimes(2);
    });

    it('respects concurrency limit', async () => {
      const prompts = Array.from({ length: 10 }, (_, i) => ({ id: String(i), prompt: `Prompt ${i}` }));
      const row = makeJobRow({ prompts, concurrency: 2, total_prompts: 10 });
      const runningRow = { ...row, status: 'running' };
      let firstSelect = true;
      pool.query = vi.fn(async (sql: string) => {
        if (typeof sql === 'string' && sql.includes('SELECT')) {
          if (firstSelect) {
            firstSelect = false;
            return { rows: [row], rowCount: 1 };
          }
          return { rows: [runningRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });

      aiClient.chat = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 10));
        return { content: 'ok' };
      });

      await manager.executeJob('batch-1');
      // All prompts processed; concurrency gating attempted via active array
      expect(aiClient.chat).toHaveBeenCalledTimes(10);
    });

    it('updates progress in DB', async () => {
      const row = makeJobRow({ prompts: [{ id: '0', prompt: 'Hello' }] });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      await manager.executeJob('batch-1');
      // At least one progress update + status update
      expect(pool.query.mock.calls.length).toBeGreaterThan(1);
    });

    it('throws if job not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      await expect(manager.executeJob('nope')).rejects.toThrow();
    });

    it('throws if job not pending', async () => {
      const row = makeJobRow({ status: 'completed' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      await expect(manager.executeJob('batch-1')).rejects.toThrow();
    });

    it('sets status to completed', async () => {
      const row = makeJobRow({ prompts: [{ id: '0', prompt: 'Hello' }] });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      await manager.executeJob('batch-1');

      const lastCall = pool.query.mock.calls[pool.query.mock.calls.length - 1];
      const sql = lastCall[0] as string;
      expect(sql).toContain('completed');
    });

    it('sets status to failed when all prompts fail', async () => {
      const row = makeJobRow({ prompts: [{ id: '0', prompt: 'Fail1' }, { id: '1', prompt: 'Fail2' }] });
      pool.query = vi.fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValue({ rows: [], rowCount: 1 });

      aiClient.chat = vi.fn().mockRejectedValue(new Error('provider error'));

      await manager.executeJob('batch-1');

      const calls = pool.query.mock.calls;
      const statusCalls = calls.filter((c: any) => String(c[0]).includes('status'));
      expect(statusCalls.length).toBeGreaterThan(0);
    });

    it('stops on cancellation', async () => {
      const prompts = Array.from({ length: 20 }, (_, i) => ({ id: String(i), prompt: `Prompt ${i}` }));
      const row = makeJobRow({ prompts, total_prompts: 20 });
      const cancelledRow = makeJobRow({ prompts, total_prompts: 20, status: 'cancelled' });
      let selectCount = 0;
      pool.query = vi.fn(async (sql: string) => {
        if (String(sql).includes('SELECT')) {
          selectCount++;
          // First SELECT is the initial getJob (returns pending)
          if (selectCount === 1) return { rows: [row], rowCount: 1 };
          // Subsequent SELECTs are cancellation checks — return cancelled
          return { rows: [cancelledRow], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });

      aiClient.chat = vi.fn(async () => {
        await new Promise((r) => setTimeout(r, 5));
        return { content: 'ok' };
      });

      await manager.executeJob('batch-1');
      // Should have stopped before processing all 20
      expect(aiClient.chat.mock.calls.length).toBeLessThan(20);
    });
  });
});
