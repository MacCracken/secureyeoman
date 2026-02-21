import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExperimentStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const expRow = {
  id: 'exp-1',
  name: 'My Experiment',
  description: 'A/B test',
  status: 'running',
  variants: [
    { id: 'v-1', name: 'Control' },
    { id: 'v-2', name: 'Treatment' },
  ],
  results: [],
  started_at: 1000,
  completed_at: null,
  created_at: 500,
  updated_at: 1000,
};

// ─── Tests ────────────────────────────────────────────────────

describe('ExperimentStorage', () => {
  let storage: ExperimentStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new ExperimentStorage();
  });

  describe('create', () => {
    it('inserts and returns an experiment object', async () => {
      const result = await storage.create({
        name: 'My Experiment',
        variants: [{ id: 'v-1', name: 'Control' }] as any,
      });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Experiment');
      expect(result.description).toBe('');
      expect(result.status).toBe('draft');
      expect(result.results).toEqual([]);
      expect(result.startedAt).toBeNull();
      expect(result.completedAt).toBeNull();
    });

    it('uses provided status and description', async () => {
      const result = await storage.create({
        name: 'Test',
        description: 'Test desc',
        status: 'running',
        variants: [] as any,
      });

      expect(result.description).toBe('Test desc');
      expect(result.status).toBe('running');
    });

    it('passes correct params to INSERT', async () => {
      await storage.create({ name: 'Exp', variants: [] as any });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('Exp');
      expect(params[3]).toBe('draft'); // default status
      expect(params[6]).toBeNull(); // started_at
      expect(params[7]).toBeNull(); // completed_at
    });
  });

  describe('get', () => {
    it('returns experiment when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [expRow], rowCount: 1 });
      const result = await storage.get('exp-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('exp-1');
      expect(result!.status).toBe('running');
      expect(result!.startedAt).toBe(1000);
      expect(result!.completedAt).toBeNull();
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns experiments and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '4' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [expRow], rowCount: 1 });

      const result = await storage.list();
      expect(result.total).toBe(4);
      expect(result.experiments).toHaveLength(1);
      expect(result.experiments[0].id).toBe('exp-1');
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.list();
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(50);
      expect(params[1]).toBe(0);
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.list({ limit: 10, offset: 20 });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(10);
      expect(params[1]).toBe(20);
    });
  });

  describe('update', () => {
    it('returns null when experiment not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // get returns null
      const result = await storage.update('nonexistent', { status: 'running' });
      expect(result).toBeNull();
    });

    it('updates and returns merged experiment', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [expRow], rowCount: 1 }) // get
        .mockResolvedValueOnce({ rows: [], rowCount: 1 }); // execute UPDATE

      const result = await storage.update('exp-1', { status: 'completed', completedAt: 9999 });
      expect(result).not.toBeNull();
      expect(result!.status).toBe('completed');
      expect(result!.completedAt).toBe(9999);
    });

    it('passes all fields to UPDATE', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [expRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await storage.update('exp-1', { name: 'New Name', description: 'New Desc' });
      const sql = mockQuery.mock.calls[1][0] as string;
      expect(sql).toContain('UPDATE experiment.experiments');
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe('New Name');
      expect(params[1]).toBe('New Desc');
    });
  });

  describe('delete', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.delete('exp-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });
});
