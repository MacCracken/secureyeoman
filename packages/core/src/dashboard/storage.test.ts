import { describe, it, expect, vi, beforeEach } from 'vitest';
import { DashboardStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const dashboardRow = {
  id: 'dash-1',
  name: 'My Dashboard',
  description: 'A test dashboard',
  widgets: [{ id: 'w-1', type: 'chart' }],
  is_default: false,
  created_at: 1000,
  updated_at: 2000,
};

// ─── Tests ────────────────────────────────────────────────────

describe('DashboardStorage', () => {
  let storage: DashboardStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new DashboardStorage();
  });

  describe('create', () => {
    it('inserts and returns a dashboard object', async () => {
      const result = await storage.create({ name: 'My Dashboard' });

      expect(result.id).toBeDefined();
      expect(result.name).toBe('My Dashboard');
      expect(result.description).toBe('');
      expect(result.widgets).toEqual([]);
      expect(result.isDefault).toBe(false);
      expect(typeof result.createdAt).toBe('number');
    });

    it('uses provided optional fields', async () => {
      const result = await storage.create({
        name: 'Main',
        description: 'Main dashboard',
        widgets: [{ id: 'w-1', type: 'table' }] as any,
        isDefault: true,
      });

      expect(result.description).toBe('Main dashboard');
      expect(result.isDefault).toBe(true);
      expect(result.widgets).toHaveLength(1);
    });

    it('passes correct params to INSERT', async () => {
      await storage.create({ name: 'Test' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('Test');
      expect(params[2]).toBe('');
      expect(params[4]).toBe(false); // isDefault
    });
  });

  describe('get', () => {
    it('returns dashboard when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [dashboardRow], rowCount: 1 });
      const result = await storage.get('dash-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('dash-1');
      expect(result!.name).toBe('My Dashboard');
      expect(result!.isDefault).toBe(false);
      expect(result!.createdAt).toBe(1000);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.get('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('list', () => {
    it('returns dashboards and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [dashboardRow], rowCount: 1 });

      const result = await storage.list();
      expect(result.total).toBe(3);
      expect(result.dashboards).toHaveLength(1);
      expect(result.dashboards[0].id).toBe('dash-1');
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

      await storage.list({ limit: 5, offset: 10 });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(5);
      expect(params[1]).toBe(10);
    });
  });

  describe('update', () => {
    it('returns null when dashboard not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 }); // get returns null
      const result = await storage.update('nonexistent', { name: 'New Name' });
      expect(result).toBeNull();
    });

    it('updates and returns merged dashboard', async () => {
      // First call: get() to fetch existing
      mockQuery
        .mockResolvedValueOnce({ rows: [dashboardRow], rowCount: 1 })
        // Second call: execute() for UPDATE
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      const result = await storage.update('dash-1', { name: 'Updated Name' });
      expect(result).not.toBeNull();
      expect(result!.name).toBe('Updated Name');
      expect(result!.id).toBe('dash-1');
    });

    it('passes all fields to UPDATE', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [dashboardRow], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 1 });

      await storage.update('dash-1', { name: 'New', description: 'Desc', isDefault: true });
      const sql = mockQuery.mock.calls[1][0] as string;
      expect(sql).toContain('UPDATE dashboard.custom_dashboards');
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe('New');
      expect(params[1]).toBe('Desc');
      expect(params[3]).toBe(true);
    });
  });

  describe('delete', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.delete('dash-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.delete('nonexistent');
      expect(result).toBe(false);
    });
  });
});
