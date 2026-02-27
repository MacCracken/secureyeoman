import { describe, it, expect, vi, beforeEach } from 'vitest';
import { FinetuneManager } from './finetune-manager.js';

// ── Mocks ─────────────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    on: vi.fn(),
    stdout: { on: vi.fn() },
    stderr: { on: vi.fn() },
  })),
  execSync: vi.fn(),
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  return {
    ...actual,
    mkdirSync: vi.fn(),
    writeFileSync: vi.fn(),
  };
});

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
    child: vi.fn(function () { return this; }),
  } as any;
}

function makeJobRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'ft-1',
    name: 'Test job',
    base_model: 'llama3:8b',
    adapter_name: 'my-adapter',
    dataset_path: '/data/train.jsonl',
    lora_rank: 16,
    lora_alpha: 32,
    batch_size: 4,
    epochs: 3,
    vram_budget_gb: 12,
    image: 'ghcr.io/secureyeoman/unsloth-trainer:latest',
    container_id: null,
    status: 'pending',
    adapter_path: null,
    error_message: null,
    created_at: new Date(),
    completed_at: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('FinetuneManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: FinetuneManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new FinetuneManager(pool, logger, '/tmp/test-finetune');
  });

  // ── createJob ────────────────────────────────────────────────────────────────

  describe('createJob()', () => {
    it('inserts a row and returns the job', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Test',
        baseModel: 'llama3:8b',
        adapterName: 'my-adapter',
        datasetPath: '/data/train.jsonl',
      });

      expect(pool.query).toHaveBeenCalledOnce();
      expect(job.id).toBe('ft-1');
      expect(job.loraRank).toBe(16);
      expect(job.epochs).toBe(3);
      expect(job.status).toBe('pending');
    });

    it('uses provided optional fields', async () => {
      const row = makeJobRow({ lora_rank: 32, epochs: 5, vram_budget_gb: 24 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Custom',
        baseModel: 'mistral:7b',
        adapterName: 'adapter',
        datasetPath: '/d',
        loraRank: 32,
        epochs: 5,
        vramBudgetGb: 24,
      });

      expect(job.loraRank).toBe(32);
      expect(job.epochs).toBe(5);
      expect(job.vramBudgetGb).toBe(24);
    });
  });

  // ── listJobs ─────────────────────────────────────────────────────────────────

  describe('listJobs()', () => {
    it('returns all jobs', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ id: 'ft-1' }), makeJobRow({ id: 'ft-2' })],
        rowCount: 2,
      }));

      const jobs = await manager.listJobs();
      expect(jobs).toHaveLength(2);
    });

    it('returns empty array when no jobs', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const jobs = await manager.listJobs();
      expect(jobs).toEqual([]);
    });
  });

  // ── getJob ────────────────────────────────────────────────────────────────────

  describe('getJob()', () => {
    it('returns the job', async () => {
      pool.query = vi.fn(async () => ({ rows: [makeJobRow()], rowCount: 1 }));
      const job = await manager.getJob('ft-1');
      expect(job?.id).toBe('ft-1');
    });

    it('returns null when not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      expect(await manager.getJob('missing')).toBeNull();
    });
  });

  // ── cancelJob ─────────────────────────────────────────────────────────────────

  describe('cancelJob()', () => {
    it('returns false when job not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await manager.cancelJob('missing');
      expect(result).toBe(false);
    });

    it('cancels a job without containerId', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 }) // getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

      const result = await manager.cancelJob('ft-1');
      expect(result).toBe(true);
    });
  });

  // ── deleteJob ─────────────────────────────────────────────────────────────────

  describe('deleteJob()', () => {
    it('cancels then deletes', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 }) // getJob for cancel
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // cancel UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // DELETE

      const result = await manager.deleteJob('ft-1');
      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledTimes(3);
    });
  });

  // ── startJob ──────────────────────────────────────────────────────────────────

  describe('startJob()', () => {
    it('throws when job is not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      await expect(manager.startJob('missing')).rejects.toThrow('not found');
    });

    it('throws when job is not pending', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'running' })],
        rowCount: 1,
      }));
      await expect(manager.startJob('ft-1')).rejects.toThrow('not pending');
    });

    it('starts Docker container for a pending job', async () => {
      const { spawn } = await import('node:child_process');
      const mockSpawn = vi.mocked(spawn);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 }) // getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE running+containerId
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 }); // _watchContainer getJob calls

      await manager.startJob('ft-1');

      // docker run called
      expect(mockSpawn).toHaveBeenCalledWith(
        'docker',
        expect.arrayContaining(['run', '--rm', '--gpus', 'all']),
        expect.any(Object)
      );
    });
  });

  // ── registerWithOllama ────────────────────────────────────────────────────────

  describe('registerWithOllama()', () => {
    it('throws when job not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      await expect(
        manager.registerWithOllama('missing', 'http://localhost:11434')
      ).rejects.toThrow('not found');
    });

    it('throws when job is not complete', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'running' })],
        rowCount: 1,
      }));
      await expect(
        manager.registerWithOllama('ft-1', 'http://localhost:11434')
      ).rejects.toThrow('not complete');
    });

    it('calls ollama create for a complete job', async () => {
      const { execSync } = await import('node:child_process');
      const mockExecSync = vi.mocked(execSync);

      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'complete', adapter_path: '/workspace/adapter' })],
        rowCount: 1,
      }));

      await manager.registerWithOllama('ft-1', 'http://localhost:11434');

      expect(mockExecSync).toHaveBeenCalledWith(
        expect.stringContaining('ollama create my-adapter'),
        expect.any(Object)
      );
    });
  });
});
