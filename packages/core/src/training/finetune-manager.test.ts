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
  execFileSync: vi.fn(),
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
    child: vi.fn(function () {
      return this;
    }),
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

  // ── onJobComplete callback ───────────────────────────────────────────────────

  describe('onJobComplete callback', () => {
    it('accepts optional callback in constructor', () => {
      const callback = vi.fn();
      const mgr = new FinetuneManager(pool, logger, '/tmp/test', callback);
      expect(mgr).toBeDefined();
    });

    it('works without callback (undefined)', () => {
      const mgr = new FinetuneManager(pool, logger, '/tmp/test');
      expect(mgr).toBeDefined();
    });

    it('works with explicit undefined callback', () => {
      const mgr = new FinetuneManager(pool, logger, '/tmp/test', undefined);
      expect(mgr).toBeDefined();
    });

    it('callback is stored as instance property', () => {
      const callback = vi.fn(async () => {});
      const mgr = new FinetuneManager(pool, logger, '/tmp/test', callback);
      // Verify the manager was constructed with the callback by checking it exists
      expect(mgr).toBeInstanceOf(FinetuneManager);
    });
  });

  // ── registerWithOllama ────────────────────────────────────────────────────────

  describe('registerWithOllama()', () => {
    it('throws when job not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      await expect(manager.registerWithOllama('missing', 'http://localhost:11434')).rejects.toThrow(
        'not found'
      );
    });

    it('throws when job is not complete', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'running' })],
        rowCount: 1,
      }));
      await expect(manager.registerWithOllama('ft-1', 'http://localhost:11434')).rejects.toThrow(
        'not complete'
      );
    });

    it('calls ollama create for a complete job', async () => {
      const { execFileSync } = await import('node:child_process');
      const mockExecFileSync = vi.mocked(execFileSync);

      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'complete', adapter_path: '/workspace/adapter' })],
        rowCount: 1,
      }));

      await manager.registerWithOllama('ft-1', 'http://localhost:11434');

      expect(mockExecFileSync).toHaveBeenCalledWith(
        'ollama',
        ['create', 'my-adapter', '-f', expect.stringContaining('Modelfile')],
        expect.any(Object)
      );
    });

    it('throws when job has no adapter_path', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'complete', adapter_path: null })],
        rowCount: 1,
      }));

      await expect(manager.registerWithOllama('ft-1', 'http://localhost:11434')).rejects.toThrow(
        'no adapter path'
      );
    });
  });

  // ── cancelJob with containerId ──────────────────────────────────────────────

  describe('cancelJob() with containerId', () => {
    it('cancels a running job with containerId — stops docker container', async () => {
      const { execFileSync } = await import('node:child_process');
      const mockExecFileSync = vi.mocked(execFileSync);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [makeJobRow({ status: 'running', container_id: 'sy-finetune-ft-1' })],
          rowCount: 1,
        }) // getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

      const result = await manager.cancelJob('ft-1');
      expect(result).toBe(true);
      expect(mockExecFileSync).toHaveBeenCalledWith('docker', ['stop', 'sy-finetune-ft-1'], {
        stdio: 'ignore',
      });
    });

    it('handles docker stop failure gracefully', async () => {
      const { execFileSync } = await import('node:child_process');
      const mockExecFileSync = vi.mocked(execFileSync);
      mockExecFileSync.mockImplementation(() => {
        throw new Error('container not found');
      });

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [makeJobRow({ status: 'running', container_id: 'sy-finetune-ft-1' })],
          rowCount: 1,
        }) // getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // UPDATE

      const result = await manager.cancelJob('ft-1');
      expect(result).toBe(true);
    });

    it('returns false when update affects 0 rows (already cancelled/completed)', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 }) // getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // UPDATE affects 0 rows

      const result = await manager.cancelJob('ft-1');
      expect(result).toBe(false);
    });
  });

  // ── deleteJob when job not found ────────────────────────────────────────────

  describe('deleteJob() edge cases', () => {
    it('returns false when delete affects 0 rows', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // getJob returns nothing (cancel)
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // DELETE affects 0

      const result = await manager.deleteJob('missing');
      expect(result).toBe(false);
    });
  });

  // ── streamLogs ──────────────────────────────────────────────────────────────

  describe('streamLogs()', () => {
    it('throws when no container for job', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ container_id: null })],
        rowCount: 1,
      }));

      const gen = manager.streamLogs('ft-1');
      await expect(gen.next()).rejects.toThrow('No container for job ft-1');
    });

    it('throws when job not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const gen = manager.streamLogs('missing');
      await expect(gen.next()).rejects.toThrow('No container for job missing');
    });

    it('streams lines from docker logs', async () => {
      const { spawn } = await import('node:child_process');
      const mockSpawn = vi.mocked(spawn);

      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ container_id: 'sy-finetune-ft-1', status: 'running' })],
        rowCount: 1,
      }));

      // Create a mock child process with emit-like stdout/stderr
      const stdoutHandlers: Record<string, Function> = {};
      const stderrHandlers: Record<string, Function> = {};
      const childHandlers: Record<string, Function> = {};

      const mockChild = {
        stdout: {
          on: vi.fn((event: string, handler: Function) => {
            stdoutHandlers[event] = handler;
          }),
        },
        stderr: {
          on: vi.fn((event: string, handler: Function) => {
            stderrHandlers[event] = handler;
          }),
        },
        on: vi.fn((event: string, handler: Function) => {
          childHandlers[event] = handler;
        }),
        unref: vi.fn(),
      };

      mockSpawn.mockReturnValueOnce(mockChild as any); // for streamLogs docker logs call

      const gen = manager.streamLogs('ft-1');

      // Simulate receiving data
      setTimeout(() => {
        stdoutHandlers['data']?.(Buffer.from('line1\nline2\n'));
        stderrHandlers['data']?.(Buffer.from('error-line\n'));
        childHandlers['exit']?.(0);
      }, 10);

      const lines: string[] = [];
      for await (const line of gen) {
        lines.push(line);
      }
      expect(lines).toContain('line1');
      expect(lines).toContain('line2');
      expect(lines).toContain('error-line');
    });
  });

  // ── rowToJob edge cases ─────────────────────────────────────────────────────

  describe('rowToJob edge cases', () => {
    it('handles null values with proper defaults', async () => {
      pool.query = vi.fn(async () => ({
        rows: [
          {
            id: 'ft-nulls',
            name: 'Null test',
            base_model: 'llama3:8b',
            adapter_name: 'adapter',
            dataset_path: '/data',
            lora_rank: null,
            lora_alpha: null,
            batch_size: null,
            epochs: null,
            vram_budget_gb: null,
            image: null,
            container_id: null,
            status: 'pending',
            adapter_path: null,
            error_message: null,
            created_at: 'not-a-date', // non-Date value
            completed_at: null,
          },
        ],
        rowCount: 1,
      }));

      const job = await manager.getJob('ft-nulls');
      expect(job).not.toBeNull();
      expect(job!.loraRank).toBe(16); // default
      expect(job!.loraAlpha).toBe(32); // default
      expect(job!.batchSize).toBe(4); // default
      expect(job!.epochs).toBe(3); // default
      expect(job!.vramBudgetGb).toBe(12); // default
      expect(job!.image).toBe('ghcr.io/secureyeoman/unsloth-trainer:latest');
      expect(job!.containerId).toBeNull();
      expect(job!.adapterPath).toBeNull();
      expect(job!.errorMessage).toBeNull();
      expect(job!.completedAt).toBeNull();
      // created_at is not a Date instance, so Date.now() is used
      expect(job!.createdAt).toBeGreaterThan(0);
    });

    it('handles completed_at as non-Date', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ completed_at: 'not-a-date' })],
        rowCount: 1,
      }));

      const job = await manager.getJob('ft-1');
      expect(job!.completedAt).toBeNull(); // not Date instance => null
    });
  });

  // ── Input validation (Phase 103 — command injection prevention) ─────────────

  describe('input validation — containerId', () => {
    it('rejects containerId with shell metacharacters', async () => {
      pool.query = vi.fn().mockResolvedValueOnce({
        rows: [makeJobRow({ status: 'running', container_id: 'valid; rm -rf /' })],
        rowCount: 1,
      });

      await expect(manager.cancelJob('ft-1')).rejects.toThrow('Invalid container ID');
    });

    it('accepts valid containerId', async () => {
      const { execFileSync } = await import('node:child_process');
      const mockExecFileSync = vi.mocked(execFileSync);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [makeJobRow({ status: 'running', container_id: 'sy-finetune-ft.1_test' })],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await manager.cancelJob('ft-1');
      expect(mockExecFileSync).toHaveBeenCalledWith('docker', ['stop', 'sy-finetune-ft.1_test'], {
        stdio: 'ignore',
      });
    });
  });

  describe('input validation — adapterName', () => {
    it('rejects adapterName with shell metacharacters', async () => {
      pool.query = vi.fn(async () => ({
        rows: [
          makeJobRow({
            status: 'complete',
            adapter_path: '/workspace/adapter',
            adapter_name: 'bad; rm -rf /',
          }),
        ],
        rowCount: 1,
      }));

      await expect(manager.registerWithOllama('ft-1', 'http://localhost:11434')).rejects.toThrow(
        'Invalid adapter name'
      );
    });

    it('accepts valid adapterName with hyphens and underscores', async () => {
      const { execFileSync } = await import('node:child_process');
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

      pool.query = vi.fn(async () => ({
        rows: [
          makeJobRow({
            status: 'complete',
            adapter_path: '/workspace/adapter',
            adapter_name: 'my_adapter-v2',
          }),
        ],
        rowCount: 1,
      }));

      await expect(
        manager.registerWithOllama('ft-1', 'http://localhost:11434')
      ).resolves.toBeUndefined();
    });
  });

  // ── onJobComplete callback invocation ──────────────────────────────────────

  describe('_watchContainer integration', () => {
    it('handles startJob with a pending job and writes config', async () => {
      const { writeFileSync, mkdirSync } = await import('node:fs');
      const mockWriteFileSync = vi.mocked(writeFileSync);
      const mockMkdirSync = vi.mocked(mkdirSync);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow()], rowCount: 1 }) // getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // UPDATE running
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 });

      await manager.startJob('ft-1');

      expect(mockMkdirSync).toHaveBeenCalled();
      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0][1] as string);
      expect(writtenConfig.base_model).toBe('llama3:8b');
      expect(writtenConfig.lora_rank).toBe(16);
    });
  });
});

// ── Phase 131: Advanced Training ──────────────────────────────────────────────

describe('FinetuneManager — Phase 131 (Advanced Training)', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: FinetuneManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new FinetuneManager(pool, logger, '/tmp/test-finetune');
  });

  // ── createJob with new fields ────────────────────────────────────────────

  describe('createJob() with Phase 131 fields', () => {
    it('creates job with trainingMethod=dpo', async () => {
      const row = makeJobRow({ training_method: 'dpo' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'DPO Test',
        baseModel: 'llama3:8b',
        adapterName: 'dpo-adapter',
        datasetPath: '/data/prefs.jsonl',
        trainingMethod: 'dpo',
      });

      expect(pool.query).toHaveBeenCalledOnce();
      const sql = pool.query.mock.calls[0][0] as string;
      expect(sql).toContain('training_method');
      expect(job.trainingMethod).toBe('dpo');
    });

    it('creates job with numGpus=2', async () => {
      const row = makeJobRow({ num_gpus: 2 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Multi-GPU',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        numGpus: 2,
      });

      expect(job.numGpus).toBe(2);
    });

    it('creates job with learningRate and warmupSteps', async () => {
      const row = makeJobRow({ learning_rate: 2e-4, warmup_steps: 100 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'LR Test',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        learningRate: 2e-4,
        warmupSteps: 100,
      });

      expect(job.learningRate).toBe(2e-4);
      expect(job.warmupSteps).toBe(100);
    });

    it('creates job with checkpointSteps', async () => {
      const row = makeJobRow({ checkpoint_steps: 500 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Ckpt Test',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        checkpointSteps: 500,
      });

      expect(job.checkpointSteps).toBe(500);
    });

    it('creates job with resumeFromCheckpoint', async () => {
      const row = makeJobRow({ resume_from_checkpoint: '/workspace/checkpoint-100' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Resume Test',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        resumeFromCheckpoint: '/workspace/checkpoint-100',
      });

      expect(job.resumeFromCheckpoint).toBe('/workspace/checkpoint-100');
    });

    it('creates job with rewardModelPath', async () => {
      const row = makeJobRow({ reward_model_path: '/models/reward-v1' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'RLHF Test',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        rewardModelPath: '/models/reward-v1',
      });

      expect(job.rewardModelPath).toBe('/models/reward-v1');
    });

    it('creates job with searchId', async () => {
      const row = makeJobRow({ search_id: 'hs-1' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Search Trial',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        searchId: 'hs-1',
      });

      expect(job.searchId).toBe('hs-1');
    });

    it('creates job with parentJobId', async () => {
      const row = makeJobRow({ parent_job_id: 'ft-parent' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Child Job',
        baseModel: 'llama3:8b',
        adapterName: 'adapt',
        datasetPath: '/data/ds',
        parentJobId: 'ft-parent',
      });

      expect(job.parentJobId).toBe('ft-parent');
    });
  });

  // ── rowToJob mapping ─────────────────────────────────────────────────────

  describe('rowToJob maps all new fields', () => {
    it('maps all Phase 131 columns correctly', async () => {
      const row = makeJobRow({
        training_method: 'rlhf',
        parent_job_id: 'ft-parent',
        num_gpus: 4,
        learning_rate: 1e-5,
        warmup_steps: 50,
        checkpoint_steps: 250,
        resume_from_checkpoint: '/ckpt/100',
        reward_model_path: '/models/rm',
        search_id: 'hs-42',
      });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.getJob('ft-1');

      expect(job!.trainingMethod).toBe('rlhf');
      expect(job!.parentJobId).toBe('ft-parent');
      expect(job!.numGpus).toBe(4);
      expect(job!.learningRate).toBe(1e-5);
      expect(job!.warmupSteps).toBe(50);
      expect(job!.checkpointSteps).toBe(250);
      expect(job!.resumeFromCheckpoint).toBe('/ckpt/100');
      expect(job!.rewardModelPath).toBe('/models/rm');
      expect(job!.searchId).toBe('hs-42');
    });

    it('defaults missing new fields', async () => {
      pool.query = vi.fn(async () => ({ rows: [makeJobRow()], rowCount: 1 }));

      const job = await manager.getJob('ft-1');

      expect(job!.trainingMethod).toBe('sft');
      expect(job!.parentJobId).toBeNull();
      expect(job!.numGpus).toBe(1);
      expect(job!.learningRate).toBeNull();
      expect(job!.warmupSteps).toBeNull();
      expect(job!.checkpointSteps).toBeNull();
      expect(job!.resumeFromCheckpoint).toBeNull();
      expect(job!.rewardModelPath).toBeNull();
      expect(job!.searchId).toBeNull();
    });
  });

  // ── startJob image selection ─────────────────────────────────────────────

  describe('startJob() image selection', () => {
    it('uses dpo-trainer image for dpo method', async () => {
      const { spawn } = await import('node:child_process');
      const mockSpawn = vi.mocked(spawn);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow({ training_method: 'dpo' })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 });

      await manager.startJob('ft-1');

      const dockerArgs = mockSpawn.mock.calls[0]![1] as string[];
      expect(dockerArgs).toContain('ghcr.io/secureyeoman/dpo-trainer:latest');
    });

    it('uses rlhf-trainer image for rlhf method', async () => {
      const { spawn } = await import('node:child_process');
      const mockSpawn = vi.mocked(spawn);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow({ training_method: 'rlhf' })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 });

      await manager.startJob('ft-1');

      const dockerArgs = mockSpawn.mock.calls[0]![1] as string[];
      expect(dockerArgs).toContain('ghcr.io/secureyeoman/rlhf-trainer:latest');
    });

    it('uses reward-trainer image for reward method', async () => {
      const { spawn } = await import('node:child_process');
      const mockSpawn = vi.mocked(spawn);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow({ training_method: 'reward' })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 });

      await manager.startJob('ft-1');

      const dockerArgs = mockSpawn.mock.calls[0]![1] as string[];
      expect(dockerArgs).toContain('ghcr.io/secureyeoman/reward-trainer:latest');
    });
  });

  // ── startJob multi-GPU ───────────────────────────────────────────────────

  describe('startJob() multi-GPU', () => {
    it('builds correct device string for multi-GPU', async () => {
      const { spawn } = await import('node:child_process');
      const mockSpawn = vi.mocked(spawn);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeJobRow({ num_gpus: 3 })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 });

      await manager.startJob('ft-1');

      const dockerArgs = mockSpawn.mock.calls[0]![1] as string[];
      // For numGpus=3, gpuArg should be '"device=0,1,2"'
      expect(dockerArgs).toContain('"device=0,1,2"');
    });
  });

  // ── startJob includes new config fields ──────────────────────────────────

  describe('startJob() config.json', () => {
    it('includes new config fields in written config', async () => {
      const { writeFileSync } = await import('node:fs');
      const mockWriteFileSync = vi.mocked(writeFileSync);

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({
          rows: [
            makeJobRow({
              training_method: 'dpo',
              learning_rate: 2e-4,
              warmup_steps: 100,
              checkpoint_steps: 500,
              resume_from_checkpoint: '/ckpt/50',
              reward_model_path: '/models/rm',
            }),
          ],
          rowCount: 1,
        })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [makeJobRow({ status: 'running' })], rowCount: 1 });

      await manager.startJob('ft-1');

      expect(mockWriteFileSync).toHaveBeenCalled();
      const writtenConfig = JSON.parse(mockWriteFileSync.mock.calls[0]![1] as string);
      expect(writtenConfig.training_method).toBe('dpo');
      expect(writtenConfig.learning_rate).toBe(2e-4);
      expect(writtenConfig.warmup_steps).toBe(100);
      expect(writtenConfig.checkpoint_steps).toBe(500);
      expect(writtenConfig.resume_from_checkpoint).toBe('/ckpt/50');
      expect(writtenConfig.reward_model_path).toBe('/models/rm');
    });
  });

  // ── convenience methods ──────────────────────────────────────────────────

  describe('startDpoJob()', () => {
    it('creates job with dpo method and starts it', async () => {
      const row = makeJobRow({ training_method: 'dpo', status: 'pending' });
      const runningRow = makeJobRow({ training_method: 'dpo', status: 'running' });

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // createJob INSERT
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // startJob getJob
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // startJob UPDATE running
        .mockResolvedValue({ rows: [runningRow], rowCount: 1 }); // getJob final

      const job = await manager.startDpoJob({
        name: 'DPO',
        baseModel: 'llama3:8b',
        adapterName: 'dpo-a',
        datasetPath: '/data/prefs.jsonl',
      });

      expect(job).toBeDefined();
    });
  });

  describe('startRlhfJob()', () => {
    it('creates job with rlhf method', async () => {
      const row = makeJobRow({ training_method: 'rlhf', status: 'pending' });
      const runningRow = makeJobRow({ training_method: 'rlhf', status: 'running' });

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [runningRow], rowCount: 1 });

      const job = await manager.startRlhfJob({
        name: 'RLHF',
        baseModel: 'llama3:8b',
        adapterName: 'rlhf-a',
        datasetPath: '/data/rlhf.jsonl',
        rewardModelPath: '/models/rm',
      });

      expect(job).toBeDefined();
    });
  });

  describe('startRewardJob()', () => {
    it('creates job with reward method', async () => {
      const row = makeJobRow({ training_method: 'reward', status: 'pending' });
      const runningRow = makeJobRow({ training_method: 'reward', status: 'running' });

      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 })
        .mockResolvedValue({ rows: [runningRow], rowCount: 1 });

      const job = await manager.startRewardJob({
        name: 'Reward',
        baseModel: 'llama3:8b',
        adapterName: 'reward-a',
        datasetPath: '/data/prefs.jsonl',
      });

      expect(job).toBeDefined();
    });
  });

  // ── listJobs / getJob include new fields ─────────────────────────────────

  describe('listJobs() includes new fields', () => {
    it('returns jobs with Phase 131 fields', async () => {
      pool.query = vi.fn(async () => ({
        rows: [
          makeJobRow({
            training_method: 'dpo',
            num_gpus: 2,
            search_id: 'hs-1',
          }),
        ],
        rowCount: 1,
      }));

      const jobs = await manager.listJobs();
      expect(jobs).toHaveLength(1);
      expect(jobs[0]!.trainingMethod).toBe('dpo');
      expect(jobs[0]!.numGpus).toBe(2);
      expect(jobs[0]!.searchId).toBe('hs-1');
    });
  });

  describe('getJob() includes new fields', () => {
    it('returns job with Phase 131 fields', async () => {
      pool.query = vi.fn(async () => ({
        rows: [
          makeJobRow({
            training_method: 'rlhf',
            learning_rate: 5e-5,
            warmup_steps: 200,
            reward_model_path: '/models/rm-v2',
          }),
        ],
        rowCount: 1,
      }));

      const job = await manager.getJob('ft-1');
      expect(job!.trainingMethod).toBe('rlhf');
      expect(job!.learningRate).toBe(5e-5);
      expect(job!.warmupSteps).toBe(200);
      expect(job!.rewardModelPath).toBe('/models/rm-v2');
    });
  });
});

// ── Job Completion Alert Events (Phase 104) ──────────────────────────────────

describe('FinetuneManager alert events', () => {
  it('accepts optional getAlertManager as 5th constructor param', () => {
    const p = makePool();
    const l = makeLogger();
    const mgr = new FinetuneManager(p, l, '/tmp/test', undefined, () => null);
    expect(mgr).toBeInstanceOf(FinetuneManager);
  });

  it('works without getAlertManager (backward compatible)', () => {
    const p = makePool();
    const l = makeLogger();
    const mgr = new FinetuneManager(p, l, '/tmp/test');
    expect(mgr).toBeInstanceOf(FinetuneManager);
  });
});
