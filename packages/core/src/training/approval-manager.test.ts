/**
 * ApprovalManager unit tests
 *
 * Tests CRUD and decision flow using mocked pg.Pool.
 * No real database required.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { PipelineApprovalManager as ApprovalManager } from './approval-manager.js';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

function makeLogger(): SecureLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    child: vi.fn().mockReturnThis(),
  } as unknown as SecureLogger;
}

function makeRequest(overrides: Record<string, unknown> = {}) {
  return {
    id: 'req-1',
    workflow_run_id: 'run-1',
    step_id: 'approve',
    status: 'pending',
    report: null,
    timeout_ms: 86400000,
    decided_by: null,
    decision_reason: null,
    created_at: new Date(),
    decided_at: null,
    expires_at: new Date(Date.now() + 86400000),
    ...overrides,
  };
}

function makePool(overrides: Partial<Record<string, unknown>> = {}): Pool {
  return {
    query: vi.fn().mockResolvedValue({ rows: [makeRequest()], rowCount: 1 }),
    ...overrides,
  } as unknown as Pool;
}

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ApprovalManager.createRequest', () => {
  it('inserts a new approval request and returns it', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    const req = await mgr.createRequest({
      workflowRunId: 'run-1',
      stepId: 'approve',
      report: { metrics: { accuracy: 0.9 } },
    });

    expect(req.id).toBe('req-1');
    expect(req.status).toBe('pending');
    expect(vi.mocked(pool.query)).toHaveBeenCalled();
  });

  it('uses default 24h timeout when not specified', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    await mgr.createRequest({ workflowRunId: 'run-1', stepId: 'step' });

    const callArgs = vi.mocked(pool.query).mock.calls[0]![1] as unknown[];
    expect(callArgs[4]).toBe(86400000); // default timeoutMs
  });
});

describe('ApprovalManager.getRequest', () => {
  it('returns the request when found', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    const req = await mgr.getRequest('req-1');

    expect(req).not.toBeNull();
    expect(req!.id).toBe('req-1');
  });

  it('returns null when not found', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const mgr = new ApprovalManager(pool, makeLogger());

    const req = await mgr.getRequest('nonexistent');

    expect(req).toBeNull();
  });
});

describe('ApprovalManager.listPending', () => {
  it('queries with status = pending', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    await mgr.listPending();

    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
      expect.stringContaining("status = 'pending'")
    );
  });
});

describe('ApprovalManager.approve', () => {
  it('returns true and updates status on success', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    const ok = await mgr.approve('req-1', 'user-123', 'looks good');

    expect(ok).toBe(true);
    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
      expect.stringContaining("status = 'approved'"),
      ['req-1', 'user-123', 'looks good']
    );
  });

  it('returns false when request not found (rowCount = 0)', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({ rowCount: 0 }),
    } as unknown as Pool;
    const mgr = new ApprovalManager(pool, makeLogger());

    const ok = await mgr.approve('nonexistent');

    expect(ok).toBe(false);
  });
});

describe('ApprovalManager.reject', () => {
  it('returns true and updates status on success', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    const ok = await mgr.reject('req-1', 'user-456', 'metrics too low');

    expect(ok).toBe(true);
    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(
      expect.stringContaining("status = 'rejected'"),
      ['req-1', 'user-456', 'metrics too low']
    );
  });
});

describe('ApprovalManager.waitForDecision', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('resolves immediately when request is already approved', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [makeRequest({ status: 'approved', timeout_ms: 5000 })],
        rowCount: 1,
      }),
    } as unknown as Pool;
    const mgr = new ApprovalManager(pool, makeLogger());

    const result = await mgr.waitForDecision('req-1');

    expect(result).toBe('approved');
  });

  it('throws when request is rejected', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [makeRequest({ status: 'rejected', decision_reason: 'too low', timeout_ms: 5000 })],
        rowCount: 1,
      }),
    } as unknown as Pool;
    const mgr = new ApprovalManager(pool, makeLogger());

    await expect(mgr.waitForDecision('req-1')).rejects.toThrow('rejected');
  });

  it('throws when request is timed_out', async () => {
    const pool = {
      query: vi.fn().mockResolvedValue({
        rows: [makeRequest({ status: 'timed_out', timeout_ms: 5000 })],
        rowCount: 1,
      }),
    } as unknown as Pool;
    const mgr = new ApprovalManager(pool, makeLogger());

    await expect(mgr.waitForDecision('req-1')).rejects.toThrow('timed out');
  });

  it('throws when request not found inside poll loop', async () => {
    // First call (getTimeoutMs → getRequest): returns a request to set short deadline
    // Second call (poll loop → getRequest): returns null → triggers 'not found' throw
    const pool = {
      query: vi
        .fn()
        .mockResolvedValueOnce({ rows: [makeRequest({ timeout_ms: 5000 })], rowCount: 1 })
        .mockResolvedValueOnce({ rows: [], rowCount: 0 }),
    } as unknown as Pool;
    const mgr = new ApprovalManager(pool, makeLogger());

    await expect(mgr.waitForDecision('req-1')).rejects.toThrow('not found');
  });
});

describe('ApprovalManager.listAll', () => {
  it('lists all without runId filter', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    const result = await mgr.listAll();

    expect(Array.isArray(result)).toBe(true);
  });

  it('filters by runId when provided', async () => {
    const pool = makePool();
    const mgr = new ApprovalManager(pool, makeLogger());

    await mgr.listAll('run-42');

    expect(vi.mocked(pool.query)).toHaveBeenCalledWith(expect.stringContaining('workflow_run_id'), [
      'run-42',
    ]);
  });
});
