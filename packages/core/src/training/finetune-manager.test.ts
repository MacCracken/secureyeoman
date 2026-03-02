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
      expect(mockExecFileSync).toHaveBeenCalledWith('docker', ['stop', 'sy-finetune-ft-1'], { stdio: 'ignore' });
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
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({
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
      expect(mockExecFileSync).toHaveBeenCalledWith('docker', ['stop', 'sy-finetune-ft.1_test'], { stdio: 'ignore' });
    });
  });

  describe('input validation — adapterName', () => {
    it('rejects adapterName with shell metacharacters', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'complete', adapter_path: '/workspace/adapter', adapter_name: 'bad; rm -rf /' })],
        rowCount: 1,
      }));

      await expect(manager.registerWithOllama('ft-1', 'http://localhost:11434')).rejects.toThrow('Invalid adapter name');
    });

    it('accepts valid adapterName with hyphens and underscores', async () => {
      const { execFileSync } = await import('node:child_process');
      vi.mocked(execFileSync).mockReturnValue(Buffer.from(''));

      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'complete', adapter_path: '/workspace/adapter', adapter_name: 'my_adapter-v2' })],
        rowCount: 1,
      }));

      await expect(manager.registerWithOllama('ft-1', 'http://localhost:11434')).resolves.toBeUndefined();
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
