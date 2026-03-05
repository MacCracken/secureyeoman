import { describe, it, expect, vi, beforeEach } from 'vitest';
import { CheckpointStore } from './checkpoint-store.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

function makePool(rows: Record<string, unknown>[] = [], rowCount = 1) {
  return {
    query: vi.fn(async () => ({ rows, rowCount })),
  } as any;
}

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

function makeCheckpointRow(
  overrides: Partial<Record<string, unknown>> = {}
): Record<string, unknown> {
  return {
    id: 'ckpt-1',
    finetune_job_id: 'ft-1',
    step: 100,
    path: '/workspace/checkpoint-100',
    loss: 0.42,
    metadata: {},
    created_at: new Date('2026-03-05T00:00:00Z'),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('CheckpointStore', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let store: CheckpointStore;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    store = new CheckpointStore({ pool, logger });
  });

  // ── create ──────────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts a checkpoint and returns it', async () => {
      const row = makeCheckpointRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const checkpoint = await store.create({
        finetuneJobId: 'ft-1',
        step: 100,
        path: '/workspace/checkpoint-100',
      });

      expect(pool.query).toHaveBeenCalledOnce();
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('INSERT INTO training.checkpoints');
      expect(sql).toContain('ON CONFLICT');
      expect(checkpoint.id).toBe('ckpt-1');
      expect(checkpoint.finetuneJobId).toBe('ft-1');
      expect(checkpoint.step).toBe(100);
      expect(checkpoint.path).toBe('/workspace/checkpoint-100');
    });

    it('creates with a loss value', async () => {
      const row = makeCheckpointRow({ loss: 0.35 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const checkpoint = await store.create({
        finetuneJobId: 'ft-1',
        step: 200,
        path: '/workspace/checkpoint-200',
        loss: 0.35,
      });

      expect(checkpoint.loss).toBe(0.35);
      const params = pool.query.mock.calls[0][1] as unknown[];
      expect(params[3]).toBe(0.35); // loss param
    });

    it('upserts on conflict (same job + step)', async () => {
      const row = makeCheckpointRow({ path: '/workspace/checkpoint-100-updated' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const checkpoint = await store.create({
        finetuneJobId: 'ft-1',
        step: 100,
        path: '/workspace/checkpoint-100-updated',
      });

      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('ON CONFLICT');
      expect(sql).toContain('DO UPDATE');
      expect(checkpoint.path).toBe('/workspace/checkpoint-100-updated');
    });
  });

  // ── listByJob ─────────────────────────────────────────────────────────────

  describe('listByJob()', () => {
    it('returns checkpoints sorted by step', async () => {
      const rows = [
        makeCheckpointRow({ id: 'ckpt-1', step: 100 }),
        makeCheckpointRow({ id: 'ckpt-2', step: 200 }),
        makeCheckpointRow({ id: 'ckpt-3', step: 300 }),
      ];
      pool.query = vi.fn(async () => ({ rows, rowCount: 3 }));

      const checkpoints = await store.listByJob('ft-1');

      expect(checkpoints).toHaveLength(3);
      expect(checkpoints[0]!.step).toBe(100);
      expect(checkpoints[2]!.step).toBe(300);
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY step ASC');
    });
  });

  // ── getLatest ─────────────────────────────────────────────────────────────

  describe('getLatest()', () => {
    it('returns the latest checkpoint', async () => {
      const row = makeCheckpointRow({ id: 'ckpt-3', step: 300 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const checkpoint = await store.getLatest('ft-1');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.step).toBe(300);
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY step DESC LIMIT 1');
    });

    it('returns null when no checkpoints exist', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await store.getLatest('ft-1');
      expect(result).toBeNull();
    });
  });

  // ── get ────────────────────────────────────────────────────────────────────

  describe('get()', () => {
    it('returns a single checkpoint by id', async () => {
      const row = makeCheckpointRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const checkpoint = await store.get('ckpt-1');

      expect(checkpoint).not.toBeNull();
      expect(checkpoint!.id).toBe('ckpt-1');
      const params = pool.query.mock.calls[0][1] as string[];
      expect(params[0]).toBe('ckpt-1');
    });

    it('returns null when not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await store.get('missing');
      expect(result).toBeNull();
    });
  });

  // ── deleteByJob ───────────────────────────────────────────────────────────

  describe('deleteByJob()', () => {
    it('deletes all checkpoints for a job and returns count', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 3 }));

      const count = await store.deleteByJob('ft-1');

      expect(count).toBe(3);
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('DELETE FROM training.checkpoints');
      expect(sql).toContain('finetune_job_id');
    });
  });

  // ── countByJob ────────────────────────────────────────────────────────────

  describe('countByJob()', () => {
    it('returns the count of checkpoints', async () => {
      pool.query = vi.fn(async () => ({ rows: [{ count: '5' }], rowCount: 1 }));

      const count = await store.countByJob('ft-1');

      expect(count).toBe(5);
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('COUNT(*)');
    });

    it('returns 0 when no checkpoints', async () => {
      pool.query = vi.fn(async () => ({ rows: [{ count: '0' }], rowCount: 1 }));
      const count = await store.countByJob('ft-1');
      expect(count).toBe(0);
    });
  });
});
