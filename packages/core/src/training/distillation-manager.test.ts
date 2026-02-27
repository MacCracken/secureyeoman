import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DistillationManager } from './distillation-manager.js';

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
    child: vi.fn(function () { return this; }),
  } as any;
}

// ── Conversation storage mock ─────────────────────────────────────────────────

function makeConvStorage(convs: any[] = [], messages: any[] = []) {
  return {
    listConversations: vi.fn(async () => ({ conversations: convs, total: convs.length })),
    getMessages: vi.fn(async () => messages),
  } as any;
}

// ── Teacher client mock ───────────────────────────────────────────────────────

function makeTeacher(content = 'Teacher answer') {
  return {
    chat: vi.fn(async () => ({ content })),
  } as any;
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJobRow(overrides: Partial<Record<string, unknown>> = {}): Record<string, unknown> {
  return {
    id: 'job-1',
    name: 'Test job',
    teacher_provider: 'anthropic',
    teacher_model: 'claude-opus-4-6',
    export_format: 'sharegpt',
    max_samples: 10,
    personality_ids: [],
    output_path: '/tmp/test.jsonl',
    status: 'pending',
    samples_generated: 0,
    error_message: null,
    created_at: new Date(),
    completed_at: null,
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('DistillationManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: DistillationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new DistillationManager(pool, logger);
  });

  // ── createJob ───────────────────────────────────────────────────────────────

  describe('createJob()', () => {
    it('inserts a row and returns the job', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'Test job',
        teacherProvider: 'anthropic',
        teacherModel: 'claude-opus-4-6',
        outputPath: '/tmp/test.jsonl',
      });

      expect(pool.query).toHaveBeenCalledOnce();
      expect(job.name).toBe('Test job');
      expect(job.status).toBe('pending');
      expect(job.exportFormat).toBe('sharegpt');
      expect(job.maxSamples).toBe(10);
    });

    it('applies defaults for optional fields', async () => {
      const row = makeJobRow({ max_samples: 500, export_format: 'sharegpt' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'job',
        teacherProvider: 'openai',
        teacherModel: 'gpt-4o',
        outputPath: '/tmp/out.jsonl',
      });

      expect(job.maxSamples).toBe(500);
      expect(job.exportFormat).toBe('sharegpt');
    });

    it('passes personalityIds to insert query', async () => {
      const row = makeJobRow({ personality_ids: ['p1', 'p2'] });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'job',
        teacherProvider: 'anthropic',
        teacherModel: 'claude-haiku-4-5-20251001',
        outputPath: '/tmp/out.jsonl',
        personalityIds: ['p1', 'p2'],
      });

      expect(job.personalityIds).toEqual(['p1', 'p2']);
      const insertArgs = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]![1] as unknown[];
      // personality_ids is passed as an array; find it in the args
      const pidArg = insertArgs.find((a) => Array.isArray(a) && (a as string[]).includes('p1'));
      expect(pidArg).toBeDefined();
    });
  });

  // ── listJobs ─────────────────────────────────────────────────────────────────

  describe('listJobs()', () => {
    it('returns all jobs ordered by created_at DESC', async () => {
      const rows = [makeJobRow({ id: 'j1' }), makeJobRow({ id: 'j2' })];
      pool.query = vi.fn(async () => ({ rows, rowCount: 2 }));

      const jobs = await manager.listJobs();

      expect(jobs).toHaveLength(2);
      expect(jobs[0]!.id).toBe('j1');
      expect(jobs[1]!.id).toBe('j2');
    });

    it('returns empty array when no jobs exist', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const jobs = await manager.listJobs();
      expect(jobs).toEqual([]);
    });
  });

  // ── getJob ────────────────────────────────────────────────────────────────────

  describe('getJob()', () => {
    it('returns the job by ID', async () => {
      pool.query = vi.fn(async () => ({ rows: [makeJobRow()], rowCount: 1 }));
      const job = await manager.getJob('job-1');
      expect(job?.id).toBe('job-1');
    });

    it('returns null when job not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const job = await manager.getJob('missing');
      expect(job).toBeNull();
    });
  });

  // ── cancelJob ─────────────────────────────────────────────────────────────────

  describe('cancelJob()', () => {
    it('updates status to cancelled and returns true', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 1 }));
      const result = await manager.cancelJob('job-1');
      expect(result).toBe(true);
      const sql = (pool.query as ReturnType<typeof vi.fn>).mock.calls[0]![0] as string;
      expect(sql).toContain("status = 'cancelled'");
    });

    it('returns false when job does not exist', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      const result = await manager.cancelJob('missing');
      expect(result).toBe(false);
    });
  });

  // ── deleteJob ─────────────────────────────────────────────────────────────────

  describe('deleteJob()', () => {
    it('cancels then deletes job', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }) // cancel
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // delete

      const result = await manager.deleteJob('job-1');
      expect(result).toBe(true);
      expect(pool.query).toHaveBeenCalledTimes(2);
    });

    it('returns false when job not found', async () => {
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }) // cancel
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }); // delete

      const result = await manager.deleteJob('missing');
      expect(result).toBe(false);
    });
  });

  // ── isRunning ─────────────────────────────────────────────────────────────────

  describe('isRunning()', () => {
    it('returns false for unknown jobs', () => {
      expect(manager.isRunning('nonexistent')).toBe(false);
    });
  });

  // ── runJob ────────────────────────────────────────────────────────────────────

  describe('runJob()', () => {
    it('throws when job is not found', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));
      await expect(
        manager.runJob('missing', makeConvStorage(), makeTeacher())
      ).rejects.toThrow('not found');
    });

    it('throws when job is not pending', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'running' })],
        rowCount: 1,
      }));
      await expect(
        manager.runJob('job-1', makeConvStorage(), makeTeacher())
      ).rejects.toThrow('not pending');
    });

    it('marks job as complete after processing', async () => {
      const convs = [{ id: 'c1', personalityId: null }];
      const messages = [
        { id: 'm1', role: 'user', content: 'Hello?' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ];
      const convStorage = makeConvStorage(convs, messages);

      // Sequence: getJob (pending), update running, getJob (check cancel x2), update complete
      let callIdx = 0;
      pool.query = vi.fn(async (sql: string) => {
        callIdx++;
        if (sql.includes('SELECT') && callIdx === 1) {
          return { rows: [makeJobRow()], rowCount: 1 };
        }
        if (sql.includes('SELECT') && callIdx > 1) {
          return { rows: [makeJobRow({ status: 'running' })], rowCount: 1 };
        }
        return { rows: [], rowCount: 1 };
      });

      const teacher = makeTeacher('Great answer');
      // Avoid writing real files — mock appendFileSync
      vi.mock('node:fs', async (importOriginal) => {
        const actual = await importOriginal<typeof import('node:fs')>();
        return { ...actual, appendFileSync: vi.fn(), mkdirSync: vi.fn() };
      });

      // Just verify it doesn't throw and completes
      await expect(
        manager.runJob('job-1', convStorage, teacher)
      ).resolves.not.toThrow();
    });
  });
});
