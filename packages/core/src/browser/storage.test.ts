import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserSessionStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

// rowToSession calls (row.created_at as Date).toISOString(), so use Date objects
const browserSessionRow = {
  id: 'bsess-1',
  status: 'active',
  url: 'https://example.com',
  title: 'Example',
  viewport_w: 1280,
  viewport_h: 720,
  screenshot: null,
  tool_name: 'screenshot',
  duration_ms: null,
  error: null,
  created_at: new Date('2024-01-01T00:00:00.000Z'),
  closed_at: null,
};

// ─── Tests ────────────────────────────────────────────────────

describe('BrowserSessionStorage', () => {
  let storage: BrowserSessionStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new BrowserSessionStorage();
  });

  describe('ensureTables', () => {
    it('creates schema and tables', async () => {
      await storage.ensureTables();
      const calls = mockQuery.mock.calls.map((c: any[]) => c[0] as string);
      expect(calls.some((sql) => sql.includes('CREATE SCHEMA IF NOT EXISTS browser'))).toBe(true);
      expect(calls.some((sql) => sql.includes('CREATE TABLE IF NOT EXISTS browser.sessions'))).toBe(
        true
      );
      expect(calls.some((sql) => sql.includes('CREATE INDEX'))).toBe(true);
    });
  });

  describe('createSession', () => {
    it('inserts and returns a session from RETURNING row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [browserSessionRow], rowCount: 1 });

      const result = await storage.createSession({
        toolName: 'screenshot',
        url: 'https://example.com',
      });

      expect(result.id).toBe('bsess-1');
      expect(result.status).toBe('active');
      expect(result.toolName).toBe('screenshot');
      expect(result.url).toBe('https://example.com');
      expect(result.title).toBe('Example');
      expect(result.createdAt).toBe('2024-01-01T00:00:00.000Z');
      expect(result.closedAt).toBeUndefined();
    });

    it('passes url, viewport, and toolName to query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [browserSessionRow], rowCount: 1 });
      await storage.createSession({
        toolName: 'browser',
        url: 'https://test.com',
        viewportW: 1024,
        viewportH: 768,
      });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('https://test.com');
      expect(params[2]).toBe(1024);
      expect(params[3]).toBe(768);
      expect(params[4]).toBe('browser');
    });

    it('uses null for optional params when not provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [browserSessionRow], rowCount: 1 });
      await storage.createSession({ toolName: 'screenshot' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBeNull(); // url
      expect(params[2]).toBeNull(); // viewportW
      expect(params[3]).toBeNull(); // viewportH
    });
  });

  describe('getSession', () => {
    it('returns session when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [browserSessionRow], rowCount: 1 });
      const result = await storage.getSession('bsess-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('bsess-1');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getSession('nonexistent');
      expect(result).toBeNull();
    });

    it('maps closedAt when present', async () => {
      const closedRow = {
        ...browserSessionRow,
        status: 'closed',
        closed_at: new Date('2024-01-01T01:00:00.000Z'),
      };
      mockQuery.mockResolvedValueOnce({ rows: [closedRow], rowCount: 1 });
      const result = await storage.getSession('bsess-1');
      expect(result!.closedAt).toBe('2024-01-01T01:00:00.000Z');
    });

    it('maps undefined for null optional fields', async () => {
      const minRow = {
        ...browserSessionRow,
        url: null,
        title: null,
        viewport_w: null,
        viewport_h: null,
        screenshot: null,
        duration_ms: null,
        error: null,
      };
      mockQuery.mockResolvedValueOnce({ rows: [minRow], rowCount: 1 });
      const result = await storage.getSession('bsess-1');
      expect(result!.url).toBeUndefined();
      expect(result!.title).toBeUndefined();
      expect(result!.viewportW).toBeUndefined();
    });
  });

  describe('updateSession', () => {
    it('returns existing session when no updates provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [browserSessionRow], rowCount: 1 });
      const result = await storage.updateSession('bsess-1', {});
      expect(result).not.toBeNull();
      expect(result!.id).toBe('bsess-1');
      // Only one query (getSession fallback)
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('updates title and returns result', async () => {
      const updatedRow = { ...browserSessionRow, title: 'New Title' };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      const result = await storage.updateSession('bsess-1', { title: 'New Title' });
      expect(result!.title).toBe('New Title');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('title =');
    });

    it('adds closed_at when status is closed', async () => {
      const closedRow = { ...browserSessionRow, status: 'closed', closed_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [closedRow], rowCount: 1 });

      await storage.updateSession('bsess-1', { status: 'closed' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('closed_at = NOW()');
    });

    it('adds closed_at when status is failed', async () => {
      const failedRow = {
        ...browserSessionRow,
        status: 'failed',
        closed_at: new Date(),
        error: 'timeout',
      };
      mockQuery.mockResolvedValueOnce({ rows: [failedRow], rowCount: 1 });

      await storage.updateSession('bsess-1', { status: 'failed', error: 'timeout' });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('closed_at = NOW()');
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateSession('nonexistent', { url: 'https://test.com' });
      expect(result).toBeNull();
    });

    it('updates multiple fields', async () => {
      const updatedRow = {
        ...browserSessionRow,
        url: 'https://new.com',
        title: 'New',
        screenshot: 'data:',
      };
      mockQuery.mockResolvedValueOnce({ rows: [updatedRow], rowCount: 1 });

      await storage.updateSession('bsess-1', {
        url: 'https://new.com',
        title: 'New',
        screenshot: 'data:',
        durationMs: 500,
      });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('url =');
      expect(sql).toContain('title =');
      expect(sql).toContain('screenshot =');
      expect(sql).toContain('duration_ms =');
    });
  });

  describe('closeSession', () => {
    it('calls updateSession with status closed', async () => {
      const closedRow = { ...browserSessionRow, status: 'closed', closed_at: new Date() };
      mockQuery.mockResolvedValueOnce({ rows: [closedRow], rowCount: 1 });

      const result = await storage.closeSession('bsess-1');
      expect(result!.status).toBe('closed');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('closed_at = NOW()');
    });
  });

  describe('listSessions', () => {
    it('returns sessions and total without filters', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [browserSessionRow], rowCount: 1 });

      const result = await storage.listSessions();
      expect(result.total).toBe(5);
      expect(result.sessions).toHaveLength(1);
    });

    it('filters by status', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listSessions({ status: 'active' });
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('status =');
    });

    it('filters by toolName', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listSessions({ toolName: 'screenshot' });
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('tool_name =');
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listSessions();
      const selectParams = mockQuery.mock.calls[1][1] as unknown[];
      expect(selectParams).toContain(20); // default limit
      expect(selectParams).toContain(0); // default offset
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listSessions({ limit: 5, offset: 10 });
      const selectParams = mockQuery.mock.calls[1][1] as unknown[];
      expect(selectParams).toContain(5);
      expect(selectParams).toContain(10);
    });
  });

  describe('getSessionStats', () => {
    it('returns zero stats when no sessions', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const stats = await storage.getSessionStats();
      expect(stats.total).toBe(0);
      expect(stats.active).toBe(0);
      expect(stats.closed).toBe(0);
      expect(stats.failed).toBe(0);
    });

    it('aggregates stats by status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [
          { status: 'active', count: '3' },
          { status: 'closed', count: '7' },
          { status: 'failed', count: '2' },
        ],
        rowCount: 3,
      });
      const stats = await storage.getSessionStats();
      expect(stats.total).toBe(12);
      expect(stats.active).toBe(3);
      expect(stats.closed).toBe(7);
      expect(stats.failed).toBe(2);
    });

    it('handles partial status groups', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ status: 'active', count: '5' }],
        rowCount: 1,
      });
      const stats = await storage.getSessionStats();
      expect(stats.total).toBe(5);
      expect(stats.active).toBe(5);
      expect(stats.closed).toBe(0);
      expect(stats.failed).toBe(0);
    });
  });
});
