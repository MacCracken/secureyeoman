// @vitest-environment node
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock pg-pool before importing storage
vi.mock('../storage/pg-pool.js', () => {
  const mockPool = {
    query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
  };
  return {
    getPool: () => mockPool,
    initPool: vi.fn(),
    closePool: vi.fn(),
    __mockPool: mockPool,
  };
});

vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn().mockReturnValue('test-uuid-123'),
}));

import { MultimodalStorage } from './storage.js';

// Access the mock pool
// eslint-disable-next-line @typescript-eslint/no-explicit-any
const { __mockPool: mockPool } = await import('../storage/pg-pool.js') as any;

describe('MultimodalStorage', () => {
  let storage: MultimodalStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new MultimodalStorage();
  });

  describe('ensureTables', () => {
    it('creates schema and table', async () => {
      await storage.ensureTables();
      expect(mockPool.query).toHaveBeenCalled();
      const calls = mockPool.query.mock.calls.map((c: unknown[]) => c[0] as string);
      expect(calls.some((sql: string) => sql.includes('CREATE SCHEMA IF NOT EXISTS multimodal'))).toBe(true);
      expect(calls.some((sql: string) => sql.includes('CREATE TABLE IF NOT EXISTS multimodal.jobs'))).toBe(true);
    });
  });

  describe('createJob', () => {
    it('inserts a job and returns its id', async () => {
      const id = await storage.createJob('vision', { test: true });
      expect(id).toBe('test-uuid-123');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO multimodal.jobs'),
        expect.arrayContaining(['test-uuid-123', 'vision']),
      );
    });

    it('passes source platform and message id', async () => {
      await storage.createJob('stt', { test: true }, {
        sourcePlatform: 'telegram',
        sourceMessageId: 'msg_1',
      });
      const insertCall = mockPool.query.mock.calls.find(
        (c: unknown[]) => (c[0] as string).includes('INSERT'),
      );
      expect(insertCall[1]).toContain('telegram');
      expect(insertCall[1]).toContain('msg_1');
    });
  });

  describe('completeJob', () => {
    it('updates job status to completed', async () => {
      await storage.completeJob('job_1', { result: 'done' }, 150);
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'completed'"),
        expect.arrayContaining(['job_1']),
      );
    });
  });

  describe('failJob', () => {
    it('updates job status to failed', async () => {
      await storage.failJob('job_1', 'Something went wrong');
      expect(mockPool.query).toHaveBeenCalledWith(
        expect.stringContaining("status = 'failed'"),
        expect.arrayContaining(['job_1', 'Something went wrong']),
      );
    });
  });

  describe('getJob', () => {
    it('returns null when no job found', async () => {
      mockPool.query.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const job = await storage.getJob('nonexistent');
      expect(job).toBeNull();
    });

    it('returns job when found', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [{
          id: 'job_1',
          type: 'vision',
          status: 'completed',
          input: '{"test":true}',
          output: '{"description":"A cat"}',
          error: null,
          duration_ms: 100,
          source_platform: null,
          source_message_id: null,
          created_at: '2024-01-01T00:00:00Z',
          completed_at: '2024-01-01T00:00:01Z',
        }],
        rowCount: 1,
      });
      const job = await storage.getJob('job_1');
      expect(job).not.toBeNull();
      expect(job!.id).toBe('job_1');
      expect(job!.type).toBe('vision');
      expect(job!.status).toBe('completed');
    });
  });

  describe('listJobs', () => {
    it('returns empty list with total', async () => {
      mockPool.query
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.listJobs();
      expect(result.jobs).toEqual([]);
      expect(result.total).toBe(0);
    });
  });

  describe('getJobStats', () => {
    it('returns grouped stats', async () => {
      mockPool.query.mockResolvedValueOnce({
        rows: [
          { type: 'vision', status: 'completed', count: '5' },
          { type: 'vision', status: 'failed', count: '1' },
          { type: 'stt', status: 'completed', count: '3' },
        ],
        rowCount: 3,
      });

      const stats = await storage.getJobStats();
      expect(stats.vision.completed).toBe(5);
      expect(stats.vision.failed).toBe(1);
      expect(stats.stt.completed).toBe(3);
    });
  });
});
