/**
 * SQLiteAuditStorage Unit Tests
 *
 * Tests the PG-backed audit storage using mocked PgBaseStorage methods.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

const { mockQueryOne, mockQueryMany, mockExecute } = vi.hoisted(() => ({
  mockQueryOne: vi.fn(),
  mockQueryMany: vi.fn(),
  mockExecute: vi.fn(),
}));

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: vi.fn() }),
}));

vi.mock('../storage/pg-base.js', () => ({
  PgBaseStorage: class {
    protected queryOne = mockQueryOne;
    protected queryMany = mockQueryMany;
    protected execute = mockExecute;
    protected getPool() {
      return { query: vi.fn() };
    }
    close() {}
  },
}));

import { SQLiteAuditStorage } from './sqlite-storage.js';

const baseRow = {
  id: 'audit-1',
  correlation_id: 'corr-1',
  event: 'user.login',
  level: 'info',
  message: 'User logged in',
  user_id: 'user-1',
  task_id: 'task-1',
  metadata: { ip: '127.0.0.1' },
  timestamp: 1000,
  integrity_version: '1',
  integrity_signature: 'sig-abc',
  integrity_previous_hash: 'hash-000',
  seq: 1,
};

const nullRow = {
  id: 'audit-2',
  correlation_id: null,
  event: 'system.start',
  level: 'warn',
  message: 'Starting',
  user_id: null,
  task_id: null,
  metadata: null,
  timestamp: '2000',
  integrity_version: '1',
  integrity_signature: 'sig-def',
  integrity_previous_hash: 'hash-001',
  seq: '2',
};

const stringMetadataRow = {
  ...baseRow,
  id: 'audit-3',
  metadata: '{"parsed":true}',
  timestamp: '3000',
};

describe('SQLiteAuditStorage', () => {
  let storage: SQLiteAuditStorage;

  beforeEach(() => {
    vi.clearAllMocks();
    storage = new SQLiteAuditStorage();
  });

  describe('append', () => {
    it('inserts an audit entry', async () => {
      mockExecute.mockResolvedValueOnce(1);
      await storage.append({
        id: 'audit-1',
        correlationId: 'corr-1',
        event: 'user.login',
        level: 'info',
        message: 'Logged in',
        userId: 'user-1',
        taskId: 'task-1',
        metadata: { ip: '127.0.0.1' },
        timestamp: 1000,
        integrity: { version: '1', signature: 'sig', previousEntryHash: 'hash' },
      });
      expect(mockExecute).toHaveBeenCalledOnce();
      expect(mockExecute.mock.calls[0][0]).toContain('INSERT INTO audit.entries');
    });

    it('handles undefined optional fields', async () => {
      mockExecute.mockResolvedValueOnce(1);
      await storage.append({
        id: 'audit-2',
        event: 'system.start',
        level: 'info',
        message: 'Starting',
        timestamp: 1000,
        integrity: { version: '1', signature: 'sig', previousEntryHash: 'hash' },
      });
      const params = mockExecute.mock.calls[0][1];
      expect(params[1]).toBeNull(); // correlationId
      expect(params[5]).toBeNull(); // userId
      expect(params[6]).toBeNull(); // taskId
      expect(params[7]).toBeNull(); // metadata
    });
  });

  describe('getLast', () => {
    it('returns last entry', async () => {
      mockQueryOne.mockResolvedValueOnce(baseRow);
      const entry = await storage.getLast();
      expect(entry).not.toBeNull();
      expect(entry!.id).toBe('audit-1');
      expect(entry!.correlationId).toBe('corr-1');
    });

    it('returns null when empty', async () => {
      mockQueryOne.mockResolvedValueOnce(null);
      expect(await storage.getLast()).toBeNull();
    });

    it('handles null fields in row conversion', async () => {
      mockQueryOne.mockResolvedValueOnce(nullRow);
      const entry = await storage.getLast();
      expect(entry!.correlationId).toBeUndefined();
      expect(entry!.userId).toBeUndefined();
      expect(entry!.taskId).toBeUndefined();
      expect(entry!.metadata).toBeUndefined();
      expect(entry!.timestamp).toBe(2000);
    });

    it('handles string metadata (JSON parse)', async () => {
      mockQueryOne.mockResolvedValueOnce(stringMetadataRow);
      const entry = await storage.getLast();
      expect(entry!.metadata).toEqual({ parsed: true });
    });
  });

  describe('iterate', () => {
    it('yields entries in order', async () => {
      mockQueryMany.mockResolvedValueOnce([baseRow, nullRow]);
      const entries: unknown[] = [];
      for await (const entry of storage.iterate()) {
        entries.push(entry);
      }
      expect(entries).toHaveLength(2);
    });

    it('handles empty result', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const entries: unknown[] = [];
      for await (const entry of storage.iterate()) {
        entries.push(entry);
      }
      expect(entries).toHaveLength(0);
    });
  });

  describe('count', () => {
    it('returns count', async () => {
      mockQueryOne.mockResolvedValueOnce({ cnt: '42' });
      expect(await storage.count()).toBe(42);
    });

    it('returns 0 when null row', async () => {
      mockQueryOne.mockResolvedValueOnce(null);
      expect(await storage.count()).toBe(0);
    });
  });

  describe('getById', () => {
    it('returns entry when found', async () => {
      mockQueryOne.mockResolvedValueOnce(baseRow);
      const entry = await storage.getById('audit-1');
      expect(entry!.id).toBe('audit-1');
    });

    it('returns null when not found', async () => {
      mockQueryOne.mockResolvedValueOnce(null);
      expect(await storage.getById('missing')).toBeNull();
    });
  });

  describe('updateIntegrity', () => {
    it('updates signature and previousHash', async () => {
      mockExecute.mockResolvedValueOnce(1);
      await storage.updateIntegrity('audit-1', 'new-sig', 'new-hash');
      expect(mockExecute).toHaveBeenCalledWith(expect.stringContaining('UPDATE audit.entries'), [
        'new-sig',
        'new-hash',
        'audit-1',
      ]);
    });
  });

  describe('queryEntries', () => {
    it('queries with no filters', async () => {
      mockQueryMany.mockResolvedValueOnce([{ ...baseRow, total_count: '1' }]);
      const result = await storage.queryEntries();
      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('queries with all filters', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const result = await storage.queryEntries({
        from: 1000,
        to: 9000,
        userId: 'user-1',
        taskId: 'task-1',
        level: ['info', 'warn'],
        event: ['user.login', 'user.logout'],
        limit: 25,
        offset: 10,
        order: 'asc',
      });
      expect(result.total).toBe(0);
      expect(result.limit).toBe(25);
      expect(result.offset).toBe(10);
      const sql = mockQueryMany.mock.calls[0][0];
      expect(sql).toContain('timestamp >=');
      expect(sql).toContain('timestamp <=');
      expect(sql).toContain('user_id');
      expect(sql).toContain('task_id');
      expect(sql).toContain('level IN');
      expect(sql).toContain('event IN');
      expect(sql).toContain('ASC');
    });

    it('caps limit at 1000', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const result = await storage.queryEntries({ limit: 5000 });
      expect(result.limit).toBe(1000);
    });

    it('defaults to DESC order', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      await storage.queryEntries();
      expect(mockQueryMany.mock.calls[0][0]).toContain('DESC');
    });

    it('handles empty rows (total=0)', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const result = await storage.queryEntries();
      expect(result.total).toBe(0);
    });
  });

  describe('getByTaskId', () => {
    it('returns entries for task', async () => {
      mockQueryMany.mockResolvedValueOnce([baseRow]);
      const entries = await storage.getByTaskId('task-1');
      expect(entries).toHaveLength(1);
    });
  });

  describe('getByCorrelationId', () => {
    it('returns entries for correlationId', async () => {
      mockQueryMany.mockResolvedValueOnce([baseRow, baseRow]);
      const entries = await storage.getByCorrelationId('corr-1');
      expect(entries).toHaveLength(2);
    });
  });

  describe('searchFullText', () => {
    it('searches with defaults', async () => {
      mockQueryMany.mockResolvedValueOnce([{ ...baseRow, total_count: '1' }]);
      const result = await storage.searchFullText('login');
      expect(result.entries).toHaveLength(1);
      expect(result.total).toBe(1);
      expect(result.limit).toBe(50);
      expect(result.offset).toBe(0);
    });

    it('searches with custom limit/offset', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const result = await storage.searchFullText('test', { limit: 10, offset: 5 });
      expect(result.limit).toBe(10);
      expect(result.offset).toBe(5);
    });

    it('caps limit at 1000', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const result = await storage.searchFullText('test', { limit: 9999 });
      expect(result.limit).toBe(1000);
    });
  });

  describe('enforceRetention', () => {
    it('deletes old entries and returns count', async () => {
      mockExecute.mockResolvedValueOnce(5); // age-based deletion
      mockQueryOne.mockResolvedValueOnce({ cnt: '100' }); // count after
      const deleted = await storage.enforceRetention({ maxAgeDays: 30, maxEntries: 500 });
      expect(deleted).toBe(5);
    });

    it('deletes excess entries when over maxEntries', async () => {
      mockExecute.mockResolvedValueOnce(0); // no age-based
      mockQueryOne.mockResolvedValueOnce({ cnt: '1500' }); // over 1000
      mockExecute.mockResolvedValueOnce(500); // overflow delete
      const deleted = await storage.enforceRetention({ maxEntries: 1000 });
      expect(deleted).toBe(500);
    });

    it('uses defaults (90 days, 1M entries)', async () => {
      mockExecute.mockResolvedValueOnce(0);
      mockQueryOne.mockResolvedValueOnce({ cnt: '10' });
      const deleted = await storage.enforceRetention();
      expect(deleted).toBe(0);
    });

    it('handles null count row', async () => {
      mockExecute.mockResolvedValueOnce(0);
      mockQueryOne.mockResolvedValueOnce(null);
      const deleted = await storage.enforceRetention();
      expect(deleted).toBe(0);
    });
  });

  describe('iterateFiltered', () => {
    it('iterates with no filters', async () => {
      mockQueryMany.mockResolvedValueOnce([baseRow]);
      const entries: unknown[] = [];
      for await (const entry of storage.iterateFiltered()) {
        entries.push(entry);
      }
      expect(entries).toHaveLength(1);
    });

    it('iterates with all filters', async () => {
      mockQueryMany.mockResolvedValueOnce([]);
      const entries: unknown[] = [];
      for await (const entry of storage.iterateFiltered({
        from: 1000,
        to: 9000,
        userId: 'user-1',
        taskId: 'task-1',
        level: ['info'],
        event: ['user.login'],
      })) {
        entries.push(entry);
      }
      expect(entries).toHaveLength(0);
      const sql = mockQueryMany.mock.calls[0][0];
      expect(sql).toContain('timestamp >=');
      expect(sql).toContain('timestamp <=');
      expect(sql).toContain('user_id');
      expect(sql).toContain('task_id');
      expect(sql).toContain('level IN');
      expect(sql).toContain('event IN');
    });
  });

  describe('close', () => {
    it('is a no-op', () => {
      expect(() => storage.close()).not.toThrow();
    });
  });
});
