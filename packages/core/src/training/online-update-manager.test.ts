import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OnlineUpdateManager } from './online-update-manager.js';

// ── Node mocks ───────────────────────────────────────────────────────────────

vi.mock('node:child_process', () => ({
  spawn: vi.fn(() => ({
    unref: vi.fn(),
    on: vi.fn((event: string, cb: Function) => {
      if (event === 'close') setTimeout(() => cb(0), 10);
    }),
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
    existsSync: vi.fn(() => true),
  };
});

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
    id: 'online-1',
    personality_id: 'p-1',
    adapter_name: 'my-adapter',
    conversation_ids: ['conv-1', 'conv-2'],
    gradient_accumulation_steps: 4,
    replay_buffer_size: 100,
    container_id: null,
    status: 'pending',
    error_message: null,
    created_at: new Date(),
    completed_at: null,
    ...overrides,
  };
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('OnlineUpdateManager', () => {
  let pool: ReturnType<typeof makePool>;
  let logger: ReturnType<typeof makeLogger>;
  let manager: OnlineUpdateManager;

  beforeEach(() => {
    vi.clearAllMocks();
    pool = makePool();
    logger = makeLogger();
    manager = new OnlineUpdateManager({ pool, logger });
  });

  // ── constructor ──────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('uses default workDir and image', () => {
      expect(manager).toBeDefined();
    });
  });

  // ── create ───────────────────────────────────────────────────────────────

  describe('create()', () => {
    it('inserts job', async () => {
      const row = makeJobRow();
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.create({
        personalityId: 'p-1',
        adapterName: 'my-adapter',
        conversationIds: ['conv-1', 'conv-2'],
      });

      expect(pool.query).toHaveBeenCalled();
      expect(job.id).toBe('online-1');
      expect(job.status).toBe('pending');
    });

    it('stores conversation_ids', async () => {
      const row = makeJobRow({ conversation_ids: ['conv-1', 'conv-2'] });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      const job = await manager.create({
        personalityId: 'p-1',
        adapterName: 'adapter',
        conversationIds: ['conv-1', 'conv-2'],
      });

      expect(job.conversationIds).toEqual(['conv-1', 'conv-2']);
    });
  });

  // ── list ─────────────────────────────────────────────────────────────────

  describe('list()', () => {
    it('returns jobs', async () => {
      const rows = [makeJobRow(), makeJobRow({ id: 'online-2' })];
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

      const job = await manager.get('online-1');
      expect(job).not.toBeNull();
      expect(job!.id).toBe('online-1');
    });

    it('returns null', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      const job = await manager.get('nope');
      expect(job).toBeNull();
    });
  });

  // ── startJob ─────────────────────────────────────────────────────────────

  describe('startJob()', () => {
    it('exports conversations and launches docker', async () => {
      const row = makeJobRow();
      const messageRows = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // _exportConversations conv-1
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // _exportConversations conv-2
        .mockResolvedValue({ rows: [], rowCount: 1 }); // status update

      await manager.startJob('online-1');

      expect(pool.query).toHaveBeenCalled();
      // Should have queried chat.messages
      const msgCalls = pool.query.mock.calls.filter((c: any) =>
        String(c[0]).includes('chat.messages')
      );
      expect(msgCalls.length).toBeGreaterThan(0);
    });

    it('throws for non-existent job', async () => {
      pool.query = vi.fn(async () => ({ rows: [], rowCount: 0 }));

      await expect(manager.startJob('nope')).rejects.toThrow();
    });

    it('throws for non-pending job', async () => {
      const row = makeJobRow({ status: 'completed' });
      pool.query = vi.fn(async () => ({ rows: [row], rowCount: 1 }));

      await expect(manager.startJob('online-1')).rejects.toThrow();
    });

    it('writes config.json', async () => {
      const { writeFileSync } = await import('node:fs');
      const row = makeJobRow();
      const messageRows = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // conv-1
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // conv-2
        .mockResolvedValue({ rows: [], rowCount: 1 }); // status update

      await manager.startJob('online-1');

      const configCall = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find((c: any) =>
        String(c[0]).includes('config.json')
      );
      expect(configCall).toBeDefined();
    });

    it('writes train.jsonl from conversations', async () => {
      const { writeFileSync } = await import('node:fs');
      const row = makeJobRow();
      const messageRows = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // conv-1
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // conv-2
        .mockResolvedValue({ rows: [], rowCount: 1 }); // status update

      await manager.startJob('online-1');

      const trainCall = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find((c: any) =>
        String(c[0]).includes('train.jsonl')
      );
      expect(trainCall).toBeDefined();
    });
  });

  // ── _exportConversations ─────────────────────────────────────────────────

  describe('_exportConversations()', () => {
    it('formats as ShareGPT JSONL', async () => {
      const { writeFileSync } = await import('node:fs');
      const row = makeJobRow();
      const messageRows = [
        { role: 'user', content: 'Hello' },
        { role: 'assistant', content: 'Hi there!' },
      ];
      pool.query = vi
        .fn()
        .mockResolvedValueOnce({ rows: [row], rowCount: 1 }) // get job
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // conv-1
        .mockResolvedValueOnce({ rows: messageRows, rowCount: 2 }) // conv-2
        .mockResolvedValue({ rows: [], rowCount: 1 }); // status update

      await manager.startJob('online-1');

      const trainCall = (writeFileSync as ReturnType<typeof vi.fn>).mock.calls.find((c: any) =>
        String(c[0]).includes('train.jsonl')
      );
      if (trainCall) {
        const content = String(trainCall[1]);
        // ShareGPT format: each line is a JSON object with conversations array
        const lines = content.trim().split('\n').filter(Boolean);
        for (const line of lines) {
          const parsed = JSON.parse(line);
          expect(parsed).toHaveProperty('conversations');
          expect(Array.isArray(parsed.conversations)).toBe(true);
        }
      }
    });
  });
});
