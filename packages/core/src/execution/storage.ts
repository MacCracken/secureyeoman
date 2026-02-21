/**
 * ExecutionStorage — PostgreSQL-backed storage for code execution sessions,
 * execution history, and approval records.
 *
 * Extends PgBaseStorage for query helpers and transaction support.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import type { ExecutionSession, ExecutionResult, ApprovalRecord, RuntimeType } from './types.js';

// ─── Row types ──────────────────────────────────────────────────────

interface SessionRow {
  id: string;
  runtime: RuntimeType;
  status: 'active' | 'expired' | 'terminated';
  created_at: string;
  last_activity: string;
}

interface ExecutionRow {
  id: string;
  session_id: string;
  exit_code: number;
  stdout: string;
  stderr: string;
  duration: number;
  truncated: boolean;
  created_at: string;
}

interface ApprovalRow {
  id: string;
  request_id: string;
  status: 'pending' | 'approved' | 'rejected';
  requested_at: string;
  resolved_at: string | null;
}

// ─── Helpers ────────────────────────────────────────────────────────

function sessionFromRow(row: SessionRow): ExecutionSession {
  return {
    id: row.id,
    runtime: row.runtime,
    status: row.status,
    createdAt: new Date(row.created_at).getTime(),
    lastActivity: new Date(row.last_activity).getTime(),
  };
}

function executionFromRow(row: ExecutionRow): ExecutionResult {
  return {
    id: row.id,
    sessionId: row.session_id,
    exitCode: row.exit_code,
    stdout: row.stdout,
    stderr: row.stderr,
    duration: row.duration,
    truncated: row.truncated,
  };
}

function approvalFromRow(row: ApprovalRow): ApprovalRecord {
  return {
    id: row.id,
    requestId: row.request_id,
    status: row.status,
    requestedAt: new Date(row.requested_at).getTime(),
    resolvedAt: row.resolved_at ? new Date(row.resolved_at).getTime() : undefined,
  };
}

// ─── Storage ────────────────────────────────────────────────────────

export class ExecutionStorage extends PgBaseStorage {
  // ── Session operations ─────────────────────────────────────────

  async createSession(data: { runtime: RuntimeType }): Promise<ExecutionSession> {
    const id = uuidv7();
    const row = await this.queryOne<SessionRow>(
      `INSERT INTO execution.sessions (id, runtime, status, created_at, last_activity)
       VALUES ($1, $2, 'active', now(), now())
       RETURNING *`,
      [id, data.runtime]
    );
    return sessionFromRow(row!);
  }

  async getSession(id: string): Promise<ExecutionSession | null> {
    const row = await this.queryOne<SessionRow>(`SELECT * FROM execution.sessions WHERE id = $1`, [
      id,
    ]);
    return row ? sessionFromRow(row) : null;
  }

  async listSessions(opts?: {
    limit?: number;
    offset?: number;
  }): Promise<{ sessions: ExecutionSession[]; total: number }> {
    const limit = opts?.limit ?? 50;
    const offset = opts?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM execution.sessions`
    );

    const rows = await this.queryMany<SessionRow>(
      `SELECT * FROM execution.sessions ORDER BY created_at DESC LIMIT $1 OFFSET $2`,
      [limit, offset]
    );

    return {
      sessions: rows.map(sessionFromRow),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  async updateSession(
    id: string,
    data: Partial<{
      status: 'active' | 'expired' | 'terminated';
      lastActivity: number;
    }>
  ): Promise<ExecutionSession | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (data.status !== undefined) {
      updates.push(`status = $${paramIdx++}`);
      values.push(data.status);
    }
    if (data.lastActivity !== undefined) {
      updates.push(`last_activity = to_timestamp($${paramIdx++} / 1000.0)`);
      values.push(data.lastActivity);
    }

    if (updates.length === 0) return this.getSession(id);

    values.push(id);
    const row = await this.queryOne<SessionRow>(
      `UPDATE execution.sessions SET ${updates.join(', ')} WHERE id = $${paramIdx} RETURNING *`,
      values
    );
    return row ? sessionFromRow(row) : null;
  }

  async deleteSession(id: string): Promise<boolean> {
    const count = await this.execute(`DELETE FROM execution.sessions WHERE id = $1`, [id]);
    return count > 0;
  }

  // ── Execution history operations ───────────────────────────────

  async recordExecution(data: {
    sessionId: string;
    exitCode: number;
    stdout: string;
    stderr: string;
    duration: number;
    truncated: boolean;
  }): Promise<ExecutionResult> {
    const id = uuidv7();
    const row = await this.queryOne<ExecutionRow>(
      `INSERT INTO execution.history (id, session_id, exit_code, stdout, stderr, duration, truncated, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, now())
       RETURNING *`,
      [id, data.sessionId, data.exitCode, data.stdout, data.stderr, data.duration, data.truncated]
    );
    return executionFromRow(row!);
  }

  async getExecution(id: string): Promise<ExecutionResult | null> {
    const row = await this.queryOne<ExecutionRow>(`SELECT * FROM execution.history WHERE id = $1`, [
      id,
    ]);
    return row ? executionFromRow(row) : null;
  }

  async listExecutions(filter?: {
    sessionId?: string;
    limit?: number;
    offset?: number;
  }): Promise<{ executions: ExecutionResult[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let paramIdx = 1;

    if (filter?.sessionId) {
      conditions.push(`session_id = $${paramIdx++}`);
      values.push(filter.sessionId);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filter?.limit ?? 50;
    const offset = filter?.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM execution.history ${where}`,
      values
    );

    const rows = await this.queryMany<ExecutionRow>(
      `SELECT * FROM execution.history ${where} ORDER BY created_at DESC LIMIT $${paramIdx++} OFFSET $${paramIdx++}`,
      [...values, limit, offset]
    );

    return {
      executions: rows.map(executionFromRow),
      total: parseInt(countResult?.count ?? '0', 10),
    };
  }

  // ── Approval operations ────────────────────────────────────────

  async createApproval(data: { requestId: string }): Promise<ApprovalRecord> {
    const id = uuidv7();
    const row = await this.queryOne<ApprovalRow>(
      `INSERT INTO execution.approvals (id, request_id, status, requested_at)
       VALUES ($1, $2, 'pending', now())
       RETURNING *`,
      [id, data.requestId]
    );
    return approvalFromRow(row!);
  }

  async getApproval(id: string): Promise<ApprovalRecord | null> {
    const row = await this.queryOne<ApprovalRow>(
      `SELECT * FROM execution.approvals WHERE id = $1`,
      [id]
    );
    return row ? approvalFromRow(row) : null;
  }

  async updateApproval(
    id: string,
    status: 'approved' | 'rejected'
  ): Promise<ApprovalRecord | null> {
    const row = await this.queryOne<ApprovalRow>(
      `UPDATE execution.approvals SET status = $1, resolved_at = now() WHERE id = $2 AND status = 'pending' RETURNING *`,
      [status, id]
    );
    return row ? approvalFromRow(row) : null;
  }

  async listPendingApprovals(): Promise<ApprovalRecord[]> {
    const rows = await this.queryMany<ApprovalRow>(
      `SELECT * FROM execution.approvals WHERE status = 'pending' ORDER BY requested_at ASC`
    );
    return rows.map(approvalFromRow);
  }
}
