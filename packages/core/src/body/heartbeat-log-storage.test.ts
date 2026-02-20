import { describe, it, expect, vi, beforeEach } from 'vitest';
import { HeartbeatLogStorage } from './heartbeat-log-storage.js';

// ── Mock pg-pool ──────────────────────────────────────────────────────────────
vi.mock('../storage/pg-pool.js', () => ({
  getPool: vi.fn(),
}));

// ── Mock uuidv7 ───────────────────────────────────────────────────────────────
vi.mock('../utils/crypto.js', () => ({
  uuidv7: vi.fn(() => 'test-uuid-001'),
}));

import * as poolModule from '../storage/pg-pool.js';

function makePool(rows: Record<string, unknown>[] = [], rowCount = 0) {
  return {
    query: vi.fn().mockImplementation((sql: string) => {
      if (/COUNT/.test(sql)) {
        return Promise.resolve({ rows: [{ count: String(rows.length) }] });
      }
      if (/INSERT/.test(sql)) {
        return Promise.resolve({ rows: [], rowCount: 1 });
      }
      return Promise.resolve({ rows, rowCount });
    }),
  };
}

describe('HeartbeatLogStorage', () => {
  let storage: HeartbeatLogStorage;

  beforeEach(() => {
    storage = new HeartbeatLogStorage();
  });

  describe('persist()', () => {
    it('inserts a log entry and returns it with a generated id', async () => {
      const pool = makePool([], 1);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      const entry = await storage.persist({
        checkName: 'system_health',
        personalityId: null,
        ranAt: 1700000000000,
        status: 'ok',
        message: 'All good',
        durationMs: 42,
        errorDetail: null,
      });

      expect(entry.id).toBe('test-uuid-001');
      expect(entry.checkName).toBe('system_health');
      expect(entry.status).toBe('ok');
      expect(entry.durationMs).toBe(42);
      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO proactive.heartbeat_log'),
        expect.arrayContaining(['test-uuid-001', 'system_health', null, 1700000000000, 'ok', 'All good', 42, null])
      );
    });

    it('stores errorDetail when provided', async () => {
      const pool = makePool([], 1);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      await storage.persist({
        checkName: 'memory_status',
        personalityId: 'p-1',
        ranAt: 1700000001000,
        status: 'error',
        message: 'OOM detected',
        durationMs: 5,
        errorDetail: 'Error: Out of memory\n  at check (heartbeat.ts:500)',
      });

      expect(pool.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO proactive.heartbeat_log'),
        expect.arrayContaining(['Error: Out of memory\n  at check (heartbeat.ts:500)'])
      );
    });
  });

  describe('list()', () => {
    const dbRows = [
      {
        id: 'id-1',
        check_name: 'system_health',
        personality_id: null,
        ran_at: 1700000002000,
        status: 'ok',
        message: 'All systems nominal',
        duration_ms: 15,
        error_detail: null,
      },
      {
        id: 'id-2',
        check_name: 'system_health',
        personality_id: 'p-1',
        ran_at: 1700000001000,
        status: 'warning',
        message: 'High memory usage',
        duration_ms: 20,
        error_detail: null,
      },
    ];

    it('returns mapped entries and total', async () => {
      const pool = makePool(dbRows);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      const result = await storage.list();

      expect(result.total).toBe(2);
      expect(result.entries).toHaveLength(2);
      expect(result.entries[0]).toMatchObject({
        id: 'id-1',
        checkName: 'system_health',
        personalityId: null,
        status: 'ok',
        message: 'All systems nominal',
        durationMs: 15,
        errorDetail: null,
      });
    });

    it('filters by checkName when provided', async () => {
      const pool = makePool(dbRows);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      await storage.list({ checkName: 'system_health' });

      const calls = pool.query.mock.calls;
      // The SELECT query should include WHERE check_name = $1
      const selectCall = calls.find((c) => String(c[0]).includes('SELECT') && !String(c[0]).includes('COUNT'));
      expect(selectCall).toBeDefined();
      expect(String(selectCall![0])).toContain('check_name =');
      expect(selectCall![1]).toContain('system_health');
    });

    it('filters by status when provided', async () => {
      const pool = makePool(dbRows.slice(1));
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      await storage.list({ status: 'warning' });

      const calls = pool.query.mock.calls;
      const selectCall = calls.find((c) => String(c[0]).includes('SELECT') && !String(c[0]).includes('COUNT'));
      expect(selectCall).toBeDefined();
      expect(String(selectCall![0])).toContain('status =');
      expect(selectCall![1]).toContain('warning');
    });

    it('caps limit at 200', async () => {
      const pool = makePool(dbRows);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      await storage.list({ limit: 9999 });

      const calls = pool.query.mock.calls;
      const selectCall = calls.find((c) => String(c[0]).includes('LIMIT'));
      expect(selectCall![1]).toContain(200); // capped
    });

    it('defaults limit to 20 and offset to 0', async () => {
      const pool = makePool(dbRows);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      await storage.list();

      const calls = pool.query.mock.calls;
      const selectCall = calls.find((c) => String(c[0]).includes('LIMIT'));
      expect(selectCall![1]).toContain(20);
      expect(selectCall![1]).toContain(0);
    });

    it('returns empty entries when table is empty', async () => {
      const pool = makePool([]);
      vi.mocked(poolModule.getPool).mockReturnValue(pool as any);

      const result = await storage.list();

      expect(result.total).toBe(0);
      expect(result.entries).toHaveLength(0);
    });
  });
});
