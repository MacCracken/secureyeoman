/**
 * ApprovalManager — human-in-the-loop approval requests for ML pipelines.
 *
 * When a workflow reaches a `human_approval` step, the engine creates an
 * approval request via this manager, optionally dispatches a notification,
 * then polls until the user approves/rejects or the request times out.
 *
 * Storage: training.approval_requests (migration 063).
 */

import { randomUUID } from 'node:crypto';
import type { Pool } from 'pg';
import type { SecureLogger } from '../logging/logger.js';

// ── Types ────────────────────────────────────────────────────────────────────

export type ApprovalStatus = 'pending' | 'approved' | 'rejected' | 'timed_out';

export interface ApprovalRequest {
  id: string;
  workflowRunId: string;
  stepId: string;
  status: ApprovalStatus;
  report: Record<string, unknown> | null;
  timeoutMs: number;
  decidedBy: string | null;
  decisionReason: string | null;
  createdAt: number;
  decidedAt: number | null;
  expiresAt: number;
}

export interface CreateApprovalConfig {
  workflowRunId: string;
  stepId: string;
  report?: Record<string, unknown>;
  timeoutMs?: number;
}

// ── Row mapping ───────────────────────────────────────────────────────────────

function rowToRequest(row: Record<string, unknown>): ApprovalRequest {
  return {
    id: row.id as string,
    workflowRunId: row.workflow_run_id as string,
    stepId: row.step_id as string,
    status: row.status as ApprovalStatus,
    report: (row.report as Record<string, unknown> | null) ?? null,
    timeoutMs: (row.timeout_ms as number) ?? 86400000,
    decidedBy: (row.decided_by as string | null) ?? null,
    decisionReason: (row.decision_reason as string | null) ?? null,
    createdAt: row.created_at instanceof Date ? row.created_at.getTime() : Date.now(),
    decidedAt: row.decided_at instanceof Date ? row.decided_at.getTime() : null,
    expiresAt: row.expires_at instanceof Date ? row.expires_at.getTime() : Date.now() + 86400000,
  };
}

// ── Manager ───────────────────────────────────────────────────────────────────

export class PipelineApprovalManager {
  /** Poll interval while waiting for a decision (ms). */
  static readonly POLL_INTERVAL_MS = 15_000;

  constructor(
    private readonly pool: Pool,
    private readonly logger: SecureLogger
  ) {}

  async createRequest(config: CreateApprovalConfig): Promise<ApprovalRequest> {
    const id = randomUUID();
    const timeoutMs = config.timeoutMs ?? 86400000;
    const result = await this.pool.query<Record<string, unknown>>(
      `INSERT INTO training.approval_requests
         (id, workflow_run_id, step_id, status, report, timeout_ms, expires_at)
       VALUES ($1, $2, $3, 'pending', $4, $5,
               NOW() + make_interval(secs => $6 / 1000.0))
       RETURNING *`,
      [
        id,
        config.workflowRunId,
        config.stepId,
        config.report ? JSON.stringify(config.report) : null,
        timeoutMs,
        timeoutMs,
      ]
    );
    const req = rowToRequest(result.rows[0]!);
    this.logger.info('ApprovalManager: request created', {
      requestId: id,
      workflowRunId: config.workflowRunId,
    });
    return req;
  }

  async getRequest(id: string): Promise<ApprovalRequest | null> {
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.approval_requests WHERE id = $1',
      [id]
    );
    return result.rows[0] ? rowToRequest(result.rows[0]) : null;
  }

  async listPending(): Promise<ApprovalRequest[]> {
    const result = await this.pool.query<Record<string, unknown>>(
      `SELECT * FROM training.approval_requests
       WHERE status = 'pending'
       ORDER BY created_at DESC`
    );
    return result.rows.map(rowToRequest);
  }

  async listAll(workflowRunId?: string): Promise<ApprovalRequest[]> {
    if (workflowRunId) {
      const result = await this.pool.query<Record<string, unknown>>(
        `SELECT * FROM training.approval_requests
         WHERE workflow_run_id = $1
         ORDER BY created_at DESC`,
        [workflowRunId]
      );
      return result.rows.map(rowToRequest);
    }
    const result = await this.pool.query<Record<string, unknown>>(
      'SELECT * FROM training.approval_requests ORDER BY created_at DESC LIMIT 200'
    );
    return result.rows.map(rowToRequest);
  }

  async approve(id: string, decidedBy?: string, reason?: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE training.approval_requests
       SET status = 'approved', decided_by = $2, decision_reason = $3, decided_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id, decidedBy ?? null, reason ?? null]
    );
    const approved = (result.rowCount ?? 0) > 0;
    if (approved) {
      this.logger.info('ApprovalManager: request approved', { requestId: id, decidedBy });
    }
    return approved;
  }

  async reject(id: string, decidedBy?: string, reason?: string): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE training.approval_requests
       SET status = 'rejected', decided_by = $2, decision_reason = $3, decided_at = NOW()
       WHERE id = $1 AND status = 'pending'`,
      [id, decidedBy ?? null, reason ?? null]
    );
    const rejected = (result.rowCount ?? 0) > 0;
    if (rejected) {
      this.logger.info('ApprovalManager: request rejected', { requestId: id, decidedBy });
    }
    return rejected;
  }

  /**
   * Poll until the request is decided or it times out.
   * Throws if rejected or timed out; resolves on approval.
   */
  async waitForDecision(requestId: string): Promise<'approved'> {
    const deadline = Date.now() + (await this.getTimeoutMs(requestId));

    while (Date.now() < deadline) {
      const req = await this.getRequest(requestId);
      if (!req) throw new Error(`Approval request not found: ${requestId}`);

      if (req.status === 'approved') return 'approved';
      if (req.status === 'rejected') {
        throw new Error(
          `Approval request rejected${req.decisionReason ? `: ${req.decisionReason}` : ''}`
        );
      }
      if (req.status === 'timed_out') {
        throw new Error('Approval request timed out');
      }

      await new Promise((r) => setTimeout(r, PipelineApprovalManager.POLL_INTERVAL_MS));
    }

    // Mark as timed out
    await this.pool.query(
      `UPDATE training.approval_requests
       SET status = 'timed_out'
       WHERE id = $1 AND status = 'pending'`,
      [requestId]
    );

    throw new Error('Approval request timed out waiting for human decision');
  }

  private async getTimeoutMs(requestId: string): Promise<number> {
    const req = await this.getRequest(requestId);
    return req?.timeoutMs ?? 86400000;
  }
}
