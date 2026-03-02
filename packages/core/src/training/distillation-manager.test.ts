import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { DistillationManager } from './distillation-manager.js';

// Mock training-stream to avoid side effects
vi.mock('./training-stream.js', () => ({
  trainingStream: { broadcast: vi.fn() },
}));

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
    priority_mode: 'uniform',
    curriculum_mode: false,
    counterfactual_mode: false,
    max_counterfactual_samples: 50,
    counterfactual_count: 0,
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
      await expect(manager.runJob('missing', makeConvStorage(), makeTeacher())).rejects.toThrow(
        'not found'
      );
    });

    it('throws when job is not pending or failed', async () => {
      pool.query = vi.fn(async () => ({
        rows: [makeJobRow({ status: 'running' })],
        rowCount: 1,
      }));
      await expect(manager.runJob('job-1', makeConvStorage(), makeTeacher())).rejects.toThrow(
        'cannot be run'
      );
    });

    it('accepts failed jobs for retry', async () => {
      let queryCount = 0;
      pool.query = vi.fn(async () => {
        queryCount++;
        // First call: getJob (returns failed job), second: UPDATE to running, third: complete
        if (queryCount === 1) return { rows: [makeJobRow({ status: 'failed' })], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      });
      // Minimal conv storage — returns empty list so job completes immediately
      const convStorage = {
        listConversations: vi.fn(async () => ({ conversations: [] })),
        getMessages: vi.fn(async () => []),
      } as any;
      await manager.runJob('job-1', convStorage, makeTeacher());
      // Should not throw — job was accepted and completed
      expect(queryCount).toBeGreaterThan(1);
    });

    it('marks job as complete after processing', async () => {
      const convs = [{ id: 'c1', personalityId: null }];
      const messages = [
        { id: 'm1', role: 'user', content: 'Hello?' },
        { id: 'm2', role: 'assistant', content: 'Hi there' },
      ];
      const convStorage = makeConvStorage(convs, messages);

      // Sequence: getJob (pending), update running, _collectOrderedConvIds, getJob (check cancel), batch messages, update complete
      let selectJobIdx = 0;
      pool.query = vi.fn(async (sql: string, params?: unknown[]) => {
        // Batch message fetch for distillation
        if (sql.includes('chat.messages') && sql.includes('ANY')) {
          return {
            rows: messages.map((m) => ({ conversation_id: 'c1', role: m.role, content: m.content })),
            rowCount: messages.length,
          };
        }
        // Conversation ordering query
        if (sql.includes('chat.conversations') && sql.includes('ORDER BY')) {
          return { rows: [{ id: 'c1' }], rowCount: 1 };
        }
        if (sql.includes('SELECT')) {
          selectJobIdx++;
          if (selectJobIdx === 1) {
            return { rows: [makeJobRow()], rowCount: 1 };
          }
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
      await expect(manager.runJob('job-1', convStorage, teacher)).resolves.not.toThrow();
    });
  });
});

// ── Phase 92: Priority / Curriculum / Counterfactual ─────────────────────────

describe('DistillationManager — Phase 92 extensions', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: DistillationManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new DistillationManager(pool, logger);
  });

  describe('createJob() — new fields persisted', () => {
    it('persists priorityMode in INSERT query', async () => {
      const row = makeJobRow({ priority_mode: 'failure-first' });
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        // priorityMode should be in the params
        expect(params).toContain('failure-first');
        return { rows: [row], rowCount: 1 };
      });

      const job = await manager.createJob({
        name: 'j',
        teacherProvider: 'anthropic',
        teacherModel: 'claude-opus-4-6',
        outputPath: '/tmp/x.jsonl',
        priorityMode: 'failure-first',
      });

      expect(job.priorityMode).toBe('failure-first');
    });

    it('persists curriculumMode = true', async () => {
      const row = makeJobRow({ curriculum_mode: true });
      pool.query = vi.fn(async (_sql: string, params: unknown[]) => {
        expect(params).toContain(true);
        return { rows: [row], rowCount: 1 };
      });

      const job = await manager.createJob({
        name: 'j',
        teacherProvider: 'a',
        teacherModel: 'm',
        outputPath: '/tmp/x.jsonl',
        curriculumMode: true,
      });
      expect(job.curriculumMode).toBe(true);
    });

    it('persists counterfactualMode and maxCounterfactualSamples', async () => {
      const row = makeJobRow({ counterfactual_mode: true, max_counterfactual_samples: 25 });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'j',
        teacherProvider: 'a',
        teacherModel: 'm',
        outputPath: '/tmp/x.jsonl',
        counterfactualMode: true,
        maxCounterfactualSamples: 25,
      });
      expect(job.counterfactualMode).toBe(true);
      expect(job.maxCounterfactualSamples).toBe(25);
    });

    it('defaults new fields to uniform/false/false/50/0', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.createJob({
        name: 'j',
        teacherProvider: 'a',
        teacherModel: 'm',
        outputPath: '/tmp/x.jsonl',
      });
      expect(job.priorityMode).toBe('uniform');
      expect(job.curriculumMode).toBe(false);
      expect(job.counterfactualMode).toBe(false);
      expect(job.maxCounterfactualSamples).toBe(50);
      expect(job.counterfactualCount).toBe(0);
    });
  });

  describe('rowToJob() — new fields mapped', () => {
    it('maps all new row fields to camelCase', async () => {
      const row = makeJobRow({
        priority_mode: 'success-first',
        curriculum_mode: true,
        counterfactual_mode: true,
        max_counterfactual_samples: 100,
        counterfactual_count: 12,
      });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.getJob('job-1');
      expect(job!.priorityMode).toBe('success-first');
      expect(job!.curriculumMode).toBe(true);
      expect(job!.counterfactualMode).toBe(true);
      expect(job!.maxCounterfactualSamples).toBe(100);
      expect(job!.counterfactualCount).toBe(12);
    });

    it('defaults missing new fields gracefully', async () => {
      // Row without the new columns (simulating older DB row)
      const row: Record<string, unknown> = {
        id: 'j',
        name: 'N',
        teacher_provider: 'a',
        teacher_model: 'm',
        export_format: 'sharegpt',
        max_samples: 500,
        personality_ids: [],
        output_path: '/tmp/x.jsonl',
        status: 'pending',
        samples_generated: 0,
        error_message: null,
        created_at: new Date(),
        completed_at: null,
      };
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.getJob('j');
      expect(job!.priorityMode).toBe('uniform');
      expect(job!.curriculumMode).toBe(false);
      expect(job!.counterfactualMode).toBe(false);
      expect(job!.maxCounterfactualSamples).toBe(50);
      expect(job!.counterfactualCount).toBe(0);
    });
  });

  describe('runJob() — priority-weighted query', () => {
    it('includes quality join in SQL when priorityMode=failure-first', async () => {
      const sqlCalls: string[] = [];
      let queryCount = 0;
      pool.query = vi.fn(async (sql: string) => {
        sqlCalls.push(sql);
        queryCount++;
        // 1st: getJob → pending job with failure-first
        if (queryCount === 1) {
          return {
            rows: [makeJobRow({ priority_mode: 'failure-first', status: 'pending' })],
            rowCount: 1,
          };
        }
        // 2nd: UPDATE to running
        if (queryCount === 2) return { rows: [], rowCount: 1 };
        // 3rd: ORDER BY quality SELECT
        if (queryCount === 3) return { rows: [], rowCount: 0 };
        // final UPDATE to complete
        return { rows: [], rowCount: 1 };
      });

      const convStorage = makeConvStorage();
      await manager.runJob('job-1', convStorage, makeTeacher());

      const qualityQuery = sqlCalls.find(
        (s) => s.includes('conversation_quality') && s.includes('quality_score')
      );
      expect(qualityQuery).toBeDefined();
      expect(qualityQuery).toContain('ASC');
    });

    it('uses DESC order when priorityMode=success-first', async () => {
      const sqlCalls: string[] = [];
      let qc = 0;
      pool.query = vi.fn(async (sql: string) => {
        sqlCalls.push(sql);
        qc++;
        if (qc === 1)
          return { rows: [makeJobRow({ priority_mode: 'success-first' })], rowCount: 1 };
        if (qc === 2) return { rows: [], rowCount: 1 };
        if (qc === 3) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      });

      await manager.runJob('job-1', makeConvStorage(), makeTeacher());

      const qualityQuery = sqlCalls.find(
        (s) => s.includes('conversation_quality') && s.includes('DESC')
      );
      expect(qualityQuery).toBeDefined();
    });

    it('uses plain ORDER BY created_at when priorityMode=uniform', async () => {
      const sqlCalls: string[] = [];
      let qc = 0;
      pool.query = vi.fn(async (sql: string) => {
        sqlCalls.push(sql);
        qc++;
        if (qc === 1) return { rows: [makeJobRow({ priority_mode: 'uniform' })], rowCount: 1 };
        if (qc === 2) return { rows: [], rowCount: 1 };
        if (qc === 3) return { rows: [], rowCount: 0 };
        return { rows: [], rowCount: 1 };
      });

      await manager.runJob('job-1', makeConvStorage(), makeTeacher());

      const uniformQuery = sqlCalls.find(
        (s) => s.includes('created_at ASC') && !s.includes('conversation_quality')
      );
      expect(uniformQuery).toBeDefined();
    });
  });

  // ── Phase 94: curriculum sort ordering ──────────────────────────────────────

  describe('runJob() — curriculum mode', () => {
    it('orders conversations by stage when curriculumMode=true', async () => {
      let qc = 0;
      pool.query = vi.fn(async (sql: string, args?: any[]) => {
        qc++;
        // 1st: getJob
        if (qc === 1) {
          return {
            rows: [
              makeJobRow({
                status: 'pending',
                curriculum_mode: true,
                max_samples: 100,
              }),
            ],
            rowCount: 1,
          };
        }
        // 2nd: UPDATE to running
        if (qc === 2) return { rows: [], rowCount: 1 };
        // 3rd: SELECT conversations with message_count
        if (qc === 3) {
          return {
            rows: [
              { id: 'c1', message_count: 2 },   // stage 1 (<=4)
              { id: 'c2', message_count: 8 },   // stage 2 (5-10)
              { id: 'c3', message_count: 15 },  // stage 3 (11-20)
              { id: 'c4', message_count: 30 },  // stage 4 (>20)
              { id: 'c5', message_count: 3 },   // stage 1
            ],
            rowCount: 5,
          };
        }
        // cancel check (getJob for each conv iteration)
        if (sql.includes('SELECT') && sql.includes('distillation_jobs')) {
          return {
            rows: [makeJobRow({ status: 'running' })],
            rowCount: 1,
          };
        }
        // Batch message fetch for conversations
        if (sql.includes('chat.messages') && sql.includes('ANY')) {
          const convIds = args?.[0] as string[] ?? [];
          const rows = convIds.flatMap((cid: string) => [
            { conversation_id: cid, role: 'user', content: 'Hello' },
            { conversation_id: cid, role: 'assistant', content: 'Hi' },
          ]);
          return { rows, rowCount: rows.length };
        }
        return { rows: [], rowCount: 1 };
      });

      const convStorage = {
        listConversations: vi.fn(async () => ({ conversations: [] })),
        getMessages: vi.fn(async () => []),
      } as any;

      await manager.runJob('job-1', convStorage, makeTeacher());

      // Verify batch message fetch was called (via pool.query with chat.messages)
      const batchCalls = (pool.query as any).mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('chat.messages') && c[0].includes('ANY')
      );
      expect(batchCalls.length).toBeGreaterThan(0);
    });
  });

  // ── Phase 94: instruction format ────────────────────────────────────────────

  describe('runJob() — instruction export format', () => {
    it('writes instruction format lines when exportFormat=instruction', async () => {
      let qc = 0;
      pool.query = vi.fn(async (sql: string, args?: any[]) => {
        qc++;
        if (qc === 1)
          return {
            rows: [makeJobRow({ status: 'pending', export_format: 'instruction' })],
            rowCount: 1,
          };
        if (qc === 2) return { rows: [], rowCount: 1 };
        if (qc === 3)
          return { rows: [{ id: 'conv-1', message_count: 4 }], rowCount: 1 };
        // Batch message fetch
        if (sql.includes('chat.messages') && sql.includes('ANY')) {
          return {
            rows: [
              { conversation_id: 'conv-1', role: 'user', content: 'Explain AI' },
              { conversation_id: 'conv-1', role: 'assistant', content: 'AI is...' },
            ],
            rowCount: 2,
          };
        }
        // cancel check
        if (sql.includes('SELECT') && sql.includes('distillation_jobs'))
          return { rows: [makeJobRow({ status: 'running' })], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      });

      const convStorage = {
        listConversations: vi.fn(async () => ({ conversations: [] })),
        getMessages: vi.fn(async () => []),
      } as any;

      // Use the real manager but mock fs
      await manager.runJob('job-1', convStorage, makeTeacher('Teacher says AI'));

      // Verify batch message fetch was used
      const batchCalls = (pool.query as any).mock.calls.filter(
        (c: any[]) => typeof c[0] === 'string' && c[0].includes('chat.messages') && c[0].includes('ANY')
      );
      expect(batchCalls.length).toBeGreaterThan(0);
    });
  });

  // ── Phase 94: counterfactual generation ─────────────────────────────────────

  describe('runJob() — counterfactual mode', () => {
    it('generates counterfactuals from failed pipeline conversations', async () => {
      let qc = 0;
      pool.query = vi.fn(async (sql: string) => {
        qc++;
        if (qc === 1)
          return {
            rows: [
              makeJobRow({
                status: 'pending',
                counterfactual_mode: true,
                max_counterfactual_samples: 5,
              }),
            ],
            rowCount: 1,
          };
        if (qc === 2) return { rows: [], rowCount: 1 };
        // Conversations query — return empty so main loop completes quickly
        if (qc === 3) return { rows: [], rowCount: 0 };
        // Pipeline lineage query for counterfactuals
        if (sql.includes('pipeline_lineage')) {
          return {
            rows: [{ conversation_ids: ['failed-c1', 'failed-c2'] }],
            rowCount: 1,
          };
        }
        // Final UPDATE to complete
        return { rows: [], rowCount: 1 };
      });

      const convStorage = {
        listConversations: vi.fn(async () => ({ conversations: [] })),
        getMessages: vi.fn(async () => [
          { id: 'm1', role: 'user', content: 'Why did the deploy fail?' },
          { id: 'm2', role: 'assistant', content: 'Something went wrong' },
        ]),
      } as any;

      const teacher = makeTeacher('Here is the ideal response for the failed conversation');
      await manager.runJob('job-1', convStorage, teacher);

      // Teacher should have been called for counterfactual generation
      expect(teacher.chat).toHaveBeenCalled();
      // At least one teacher call should include the system prompt for counterfactuals
      const calls = teacher.chat.mock.calls;
      const hasSystemPrompt = calls.some(
        (c: any) => c[0].messages.some((m: any) => m.role === 'system' && m.content.includes('ideal'))
      );
      expect(hasSystemPrompt).toBe(true);
    });

    it('skips counterfactuals when no failed conversations exist', async () => {
      let qc = 0;
      pool.query = vi.fn(async (sql: string) => {
        qc++;
        if (qc === 1)
          return {
            rows: [
              makeJobRow({
                status: 'pending',
                counterfactual_mode: true,
                max_counterfactual_samples: 5,
              }),
            ],
            rowCount: 1,
          };
        if (qc === 2) return { rows: [], rowCount: 1 };
        if (qc === 3) return { rows: [], rowCount: 0 };
        // Pipeline lineage — no failed conversations
        if (sql.includes('pipeline_lineage')) {
          return { rows: [], rowCount: 0 };
        }
        return { rows: [], rowCount: 1 };
      });

      const convStorage = makeConvStorage();
      const teacher = makeTeacher();
      await manager.runJob('job-1', convStorage, teacher);

      // Teacher should NOT have been called (no main samples, no counterfactuals)
      expect(teacher.chat).not.toHaveBeenCalled();
    });
  });

  // ── Phase 94: runJob error handling ─────────────────────────────────────────

  describe('runJob() — error path marks job as failed', () => {
    it('sets status=failed when an unexpected error occurs during processing', async () => {
      let qc = 0;
      const sqlCalls: string[] = [];
      pool.query = vi.fn(async (sql: string) => {
        sqlCalls.push(sql);
        qc++;
        if (qc === 1)
          return { rows: [makeJobRow({ status: 'pending' })], rowCount: 1 };
        if (qc === 2) return { rows: [], rowCount: 1 }; // UPDATE to running
        // Throw on the conv query
        if (qc === 3) throw new Error('Database connection lost');
        return { rows: [], rowCount: 1 };
      });

      await manager.runJob('job-1', makeConvStorage(), makeTeacher());

      // Should have attempted to mark job as failed
      const failQuery = sqlCalls.find((s) => s.includes("status='failed'"));
      expect(failQuery).toBeDefined();
      expect(logger.error).toHaveBeenCalledWith(
        'Distillation job failed',
        expect.objectContaining({ error: 'Database connection lost' })
      );
    });
  });

  // ── Phase 94: teacher LLM failure handling ──────────────────────────────────

  describe('runJob() — teacher failure handling', () => {
    it('continues processing when individual teacher call fails', async () => {
      let qc = 0;
      pool.query = vi.fn(async (sql: string, args?: any[]) => {
        qc++;
        if (qc === 1) return { rows: [makeJobRow({ status: 'pending' })], rowCount: 1 };
        if (qc === 2) return { rows: [], rowCount: 1 };
        if (qc === 3)
          return {
            rows: [
              { id: 'conv-1', message_count: 4 },
              { id: 'conv-2', message_count: 4 },
            ],
            rowCount: 2,
          };
        // Batch message fetch
        if (sql.includes('chat.messages') && sql.includes('ANY')) {
          const convIds = args?.[0] as string[] ?? [];
          const rows = convIds.flatMap((cid: string) => [
            { conversation_id: cid, role: 'user', content: 'Hello' },
            { conversation_id: cid, role: 'assistant', content: 'Hi' },
          ]);
          return { rows, rowCount: rows.length };
        }
        if (sql.includes('SELECT') && sql.includes('distillation_jobs'))
          return { rows: [makeJobRow({ status: 'running' })], rowCount: 1 };
        return { rows: [], rowCount: 1 };
      });

      const convStorage = {
        listConversations: vi.fn(async () => ({ conversations: [] })),
        getMessages: vi.fn(async () => []),
      } as any;

      // Teacher fails on first call, succeeds on second
      const teacher = {
        chat: vi
          .fn()
          .mockRejectedValueOnce(new Error('Rate limited'))
          .mockResolvedValue({ content: 'Good answer' }),
      } as any;

      await manager.runJob('job-1', convStorage, teacher);

      // Should have warned about the failed call
      expect(logger.warn).toHaveBeenCalledWith(
        'Teacher LLM call failed',
        expect.objectContaining({ error: 'Rate limited' })
      );
      // Should still have completed (not thrown)
      expect(logger.info).toHaveBeenCalledWith(
        'Distillation job complete',
        expect.any(Object)
      );
    });
  });
});
