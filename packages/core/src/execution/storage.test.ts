import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ExecutionStorage } from './storage.js';

// ─── Mock pg-pool ─────────────────────────────────────────────

let mockQuery: ReturnType<typeof vi.fn>;

vi.mock('../storage/pg-pool.js', () => ({
  getPool: () => ({ query: (...args: any[]) => mockQuery(...args) }),
}));

// ─── Test Data ────────────────────────────────────────────────

const sessionRow = {
  id: 'sess-1',
  runtime: 'node' as const,
  status: 'active' as const,
  created_at: '2024-01-01T00:00:00.000Z',
  last_activity: '2024-01-01T01:00:00.000Z',
};

const executionRow = {
  id: 'exec-1',
  session_id: 'sess-1',
  exit_code: 0,
  stdout: 'hello',
  stderr: '',
  duration: 150,
  truncated: false,
  created_at: '2024-01-01T00:05:00.000Z',
};

const approvalRow = {
  id: 'appr-1',
  request_id: 'req-1',
  status: 'pending' as const,
  requested_at: '2024-01-01T00:00:00.000Z',
  resolved_at: null,
};

// ─── Tests ────────────────────────────────────────────────────

describe('ExecutionStorage', () => {
  let storage: ExecutionStorage;

  beforeEach(() => {
    mockQuery = vi.fn().mockResolvedValue({ rows: [], rowCount: 0 });
    storage = new ExecutionStorage();
  });

  describe('createSession', () => {
    it('inserts and returns a session from RETURNING row', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });

      const result = await storage.createSession({ runtime: 'node' });

      expect(result.id).toBe('sess-1');
      expect(result.runtime).toBe('node');
      expect(result.status).toBe('active');
      expect(typeof result.createdAt).toBe('number');
      expect(typeof result.lastActivity).toBe('number');
    });

    it('passes runtime to query', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });

      await storage.createSession({ runtime: 'python' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('python');
    });
  });

  describe('getSession', () => {
    it('returns session when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });
      const result = await storage.getSession('sess-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('sess-1');
      expect(result!.createdAt).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getSession('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listSessions', () => {
    it('returns sessions and total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });

      const result = await storage.listSessions();
      expect(result.total).toBe(3);
      expect(result.sessions).toHaveLength(1);
      expect(result.sessions[0].id).toBe('sess-1');
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listSessions();
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(50);
      expect(params[1]).toBe(0);
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listSessions({ limit: 10, offset: 20 });
      const params = mockQuery.mock.calls[1][1] as unknown[];
      expect(params[0]).toBe(10);
      expect(params[1]).toBe(20);
    });

    it('handles zero total', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.listSessions();
      expect(result.total).toBe(0);
      expect(result.sessions).toEqual([]);
    });
  });

  describe('updateSession', () => {
    it('returns existing session without querying UPDATE when no fields provided', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });
      const result = await storage.updateSession('sess-1', {});
      expect(result!.id).toBe('sess-1');
      // only one query (the getSession fallback)
      expect(mockQuery).toHaveBeenCalledTimes(1);
    });

    it('updates status', async () => {
      mockQuery.mockResolvedValueOnce({
        rows: [{ ...sessionRow, status: 'expired' }],
        rowCount: 1,
      });

      const result = await storage.updateSession('sess-1', { status: 'expired' });
      expect(result!.status).toBe('expired');
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('status =');
    });

    it('updates lastActivity', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [sessionRow], rowCount: 1 });

      await storage.updateSession('sess-1', { lastActivity: Date.now() });
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain('last_activity');
    });

    it('returns null when session not found during update', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });

      const result = await storage.updateSession('nonexistent', { status: 'terminated' });
      expect(result).toBeNull();
    });
  });

  describe('deleteSession', () => {
    it('returns true when deleted', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 1 });
      const result = await storage.deleteSession('sess-1');
      expect(result).toBe(true);
    });

    it('returns false when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.deleteSession('nonexistent');
      expect(result).toBe(false);
    });
  });

  describe('recordExecution', () => {
    const execData = {
      sessionId: 'sess-1',
      exitCode: 0,
      stdout: 'output',
      stderr: '',
      duration: 200,
      truncated: false,
    };

    it('inserts and returns execution result', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [executionRow], rowCount: 1 });

      const result = await storage.recordExecution(execData);
      expect(result.id).toBe('exec-1');
      expect(result.sessionId).toBe('sess-1');
      expect(result.exitCode).toBe(0);
      expect(result.stdout).toBe('hello');
      expect(result.truncated).toBe(false);
    });

    it('passes correct params', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [executionRow], rowCount: 1 });

      await storage.recordExecution(execData);
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('sess-1');
      expect(params[2]).toBe(0);
      expect(params[3]).toBe('output');
      expect(params[6]).toBe(false);
    });
  });

  describe('getExecution', () => {
    it('returns execution when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [executionRow], rowCount: 1 });
      const result = await storage.getExecution('exec-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('exec-1');
      expect(result!.duration).toBe(150);
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getExecution('nonexistent');
      expect(result).toBeNull();
    });
  });

  describe('listExecutions', () => {
    it('returns executions and total without filter', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '5' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [executionRow], rowCount: 1 });

      const result = await storage.listExecutions();
      expect(result.total).toBe(5);
      expect(result.executions).toHaveLength(1);
      expect(result.executions[0].id).toBe('exec-1');
    });

    it('filters by sessionId', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [executionRow], rowCount: 1 });

      await storage.listExecutions({ sessionId: 'sess-1' });
      const countSql = mockQuery.mock.calls[0][0] as string;
      expect(countSql).toContain('session_id');
    });

    it('uses default limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listExecutions();
      const selectParams = mockQuery.mock.calls[1][1] as unknown[];
      expect(selectParams).toContain(50); // default limit
      expect(selectParams).toContain(0);  // default offset
    });

    it('uses custom limit and offset', async () => {
      mockQuery
        .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 });

      await storage.listExecutions({ limit: 5, offset: 10 });
      const selectParams = mockQuery.mock.calls[1][1] as unknown[];
      expect(selectParams).toContain(5);
      expect(selectParams).toContain(10);
    });
  });

  describe('createApproval', () => {
    it('inserts and returns approval record', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [approvalRow], rowCount: 1 });

      const result = await storage.createApproval({ requestId: 'req-1' });
      expect(result.id).toBe('appr-1');
      expect(result.requestId).toBe('req-1');
      expect(result.status).toBe('pending');
      expect(result.resolvedAt).toBeUndefined();
    });

    it('passes requestId as param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [approvalRow], rowCount: 1 });

      await storage.createApproval({ requestId: 'req-42' });
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[1]).toBe('req-42');
    });
  });

  describe('getApproval', () => {
    it('returns approval when found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [approvalRow], rowCount: 1 });
      const result = await storage.getApproval('appr-1');
      expect(result).not.toBeNull();
      expect(result!.id).toBe('appr-1');
      expect(result!.requestedAt).toBe(new Date('2024-01-01T00:00:00.000Z').getTime());
    });

    it('returns null when not found', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.getApproval('nonexistent');
      expect(result).toBeNull();
    });

    it('maps resolvedAt when present', async () => {
      const resolved = { ...approvalRow, status: 'approved' as const, resolved_at: '2024-01-01T02:00:00.000Z' };
      mockQuery.mockResolvedValueOnce({ rows: [resolved], rowCount: 1 });
      const result = await storage.getApproval('appr-1');
      expect(result!.resolvedAt).toBe(new Date('2024-01-01T02:00:00.000Z').getTime());
    });
  });

  describe('updateApproval', () => {
    it('returns updated approval when found and pending', async () => {
      const updated = { ...approvalRow, status: 'approved' as const, resolved_at: '2024-01-01T02:00:00.000Z' };
      mockQuery.mockResolvedValueOnce({ rows: [updated], rowCount: 1 });

      const result = await storage.updateApproval('appr-1', 'approved');
      expect(result!.status).toBe('approved');
      expect(result!.resolvedAt).toBeDefined();
    });

    it('returns null when not found or not pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.updateApproval('appr-1', 'rejected');
      expect(result).toBeNull();
    });

    it('passes status as first param', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.updateApproval('appr-1', 'rejected');
      const params = mockQuery.mock.calls[0][1] as unknown[];
      expect(params[0]).toBe('rejected');
      expect(params[1]).toBe('appr-1');
    });
  });

  describe('listPendingApprovals', () => {
    it('returns pending approvals', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [approvalRow], rowCount: 1 });
      const result = await storage.listPendingApprovals();
      expect(result).toHaveLength(1);
      expect(result[0].status).toBe('pending');
    });

    it('returns empty array when none pending', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      const result = await storage.listPendingApprovals();
      expect(result).toEqual([]);
    });

    it('queries for pending status', async () => {
      mockQuery.mockResolvedValueOnce({ rows: [], rowCount: 0 });
      await storage.listPendingApprovals();
      const sql = mockQuery.mock.calls[0][0] as string;
      expect(sql).toContain("status = 'pending'");
    });
  });
});
