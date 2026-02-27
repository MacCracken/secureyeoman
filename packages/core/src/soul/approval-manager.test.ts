/**
 * ApprovalManager Tests
 *
 * Unit tests using vi.spyOn on protected PgBaseStorage methods.
 * No database required.
 */

import { describe, it, expect, vi } from 'vitest';
import { ApprovalManager } from './approval-manager.js';

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const NOW = 1_700_000_000_000;

function makeRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'approval-1',
    personality_id: 'p-1',
    tool_name: 'web_search',
    tool_args: { query: 'test' },
    status: 'pending',
    created_at: String(NOW),
    resolved_at: null,
    resolved_by: null,
    ...overrides,
  };
}

// ─── createApproval ───────────────────────────────────────────────────────────

describe('ApprovalManager.createApproval()', () => {
  it('inserts and returns a pending approval', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [], rowCount: 1 });

    const result = await mgr.createApproval('p-1', 'web_search', { query: 'test' });
    expect(result.personalityId).toBe('p-1');
    expect(result.toolName).toBe('web_search');
    expect(result.toolArgs).toEqual({ query: 'test' });
    expect(result.status).toBe('pending');
    expect(typeof result.id).toBe('string');
    expect(typeof result.createdAt).toBe('number');
  });
});

// ─── listApprovals ────────────────────────────────────────────────────────────

describe('ApprovalManager.listApprovals()', () => {
  it('returns approvals and total count', async () => {
    const mgr = new ApprovalManager();
    const querySpy = vi
      .spyOn(mgr as any, 'query')
      .mockResolvedValueOnce({ rows: [{ count: '2' }], rowCount: 1 }) // count query
      .mockResolvedValueOnce({ rows: [makeRow(), makeRow({ id: 'approval-2' })], rowCount: 2 }); // data query

    const result = await mgr.listApprovals();
    expect(result.total).toBe(2);
    expect(result.approvals).toHaveLength(2);
    expect(result.approvals[0].id).toBe('approval-1');
    expect(querySpy).toHaveBeenCalledTimes(2);
  });

  it('filters by personalityId', async () => {
    const mgr = new ApprovalManager();
    const querySpy = vi
      .spyOn(mgr as any, 'query')
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });

    await mgr.listApprovals({ personalityId: 'p-1' });
    const countCall = querySpy.mock.calls[0];
    expect(countCall[0]).toContain('personality_id');
    expect(countCall[1]).toContain('p-1');
  });

  it('filters by status', async () => {
    const mgr = new ApprovalManager();
    const querySpy = vi
      .spyOn(mgr as any, 'query')
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await mgr.listApprovals({ status: 'approved' });
    const countCall = querySpy.mock.calls[0];
    expect(countCall[0]).toContain('status');
    expect(countCall[1]).toContain('approved');
  });

  it('uses default limit and offset', async () => {
    const mgr = new ApprovalManager();
    const querySpy = vi
      .spyOn(mgr as any, 'query')
      .mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 0 });

    await mgr.listApprovals();
    const dataCall = querySpy.mock.calls[1];
    expect(dataCall[1]).toContain(50); // default limit
    expect(dataCall[1]).toContain(0); // default offset
  });

  it('maps resolvedAt and resolvedBy when present', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query')
      .mockResolvedValueOnce({ rows: [{ count: '1' }], rowCount: 1 })
      .mockResolvedValueOnce({
        rows: [
          makeRow({ status: 'approved', resolved_at: String(NOW + 1000), resolved_by: 'admin' }),
        ],
        rowCount: 1,
      });

    const { approvals } = await mgr.listApprovals();
    expect(approvals[0].status).toBe('approved');
    expect(approvals[0].resolvedAt).toBe(NOW + 1000);
    expect(approvals[0].resolvedBy).toBe('admin');
  });
});

// ─── resolveApproval ──────────────────────────────────────────────────────────

describe('ApprovalManager.resolveApproval()', () => {
  it('returns resolved approval on success', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({
      rows: [makeRow({ status: 'approved', resolved_at: String(NOW + 100), resolved_by: 'human' })],
      rowCount: 1,
    });

    const result = await mgr.resolveApproval('approval-1', 'approved', 'human');
    expect(result?.status).toBe('approved');
    expect(result?.resolvedBy).toBe('human');
  });

  it('returns null when approval not found or already resolved', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await mgr.resolveApproval('missing', 'approved')).toBeNull();
  });

  it('uses default resolvedBy=human', async () => {
    const mgr = new ApprovalManager();
    const spy = vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({
      rows: [makeRow({ status: 'rejected', resolved_at: String(NOW), resolved_by: 'human' })],
      rowCount: 1,
    });

    await mgr.resolveApproval('approval-1', 'rejected');
    expect(spy.mock.calls[0][1]).toContain('human');
  });
});

// ─── getApproval ─────────────────────────────────────────────────────────────

describe('ApprovalManager.getApproval()', () => {
  it('returns approval when found', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [makeRow()], rowCount: 1 });

    const result = await mgr.getApproval('approval-1');
    expect(result?.id).toBe('approval-1');
    expect(result?.toolName).toBe('web_search');
    expect(result?.resolvedAt).toBeUndefined();
    expect(result?.resolvedBy).toBeUndefined();
  });

  it('returns null when not found', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await mgr.getApproval('missing')).toBeNull();
  });
});

// ─── pendingCount ─────────────────────────────────────────────────────────────

describe('ApprovalManager.pendingCount()', () => {
  it('returns total pending count', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [{ count: '7' }], rowCount: 1 });
    expect(await mgr.pendingCount()).toBe(7);
  });

  it('returns 0 when no pending items', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [{ count: '0' }], rowCount: 1 });
    expect(await mgr.pendingCount()).toBe(0);
  });

  it('filters by personalityId when provided', async () => {
    const mgr = new ApprovalManager();
    const spy = vi
      .spyOn(mgr as any, 'query')
      .mockResolvedValueOnce({ rows: [{ count: '3' }], rowCount: 1 });
    await mgr.pendingCount('p-1');
    expect(spy.mock.calls[0][0]).toContain('personality_id');
    expect(spy.mock.calls[0][1]).toContain('p-1');
  });

  it('handles missing count row gracefully', async () => {
    const mgr = new ApprovalManager();
    vi.spyOn(mgr as any, 'query').mockResolvedValueOnce({ rows: [], rowCount: 0 });
    expect(await mgr.pendingCount()).toBe(0);
  });
});
