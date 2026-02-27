/**
 * Approval Manager — manages the pending-approvals queue for human-in-the-loop control.
 *
 * When a personality has `automationLevel` set to `full_manual` or `semi_auto`, AI-initiated
 * tool calls that exceed that level are stored here instead of executed immediately.
 * A human operator can then approve or reject them via the dashboard or API.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export interface PendingApproval {
  id: string;
  personalityId: string;
  toolName: string;
  toolArgs: Record<string, unknown>;
  status: 'pending' | 'approved' | 'rejected';
  createdAt: number;
  resolvedAt?: number;
  resolvedBy?: string;
}

export interface ListApprovalsOptions {
  personalityId?: string;
  status?: 'pending' | 'approved' | 'rejected';
  limit?: number;
  offset?: number;
}

export class ApprovalManager extends PgBaseStorage {
  async createApproval(
    personalityId: string,
    toolName: string,
    toolArgs: Record<string, unknown>
  ): Promise<PendingApproval> {
    const id = uuidv7();
    const now = Date.now();
    await this.query(
      `INSERT INTO soul.pending_approvals (id, personality_id, tool_name, tool_args, status, created_at)
       VALUES ($1, $2, $3, $4, 'pending', $5)`,
      [id, personalityId, toolName, JSON.stringify(toolArgs), now]
    );
    return {
      id,
      personalityId,
      toolName,
      toolArgs,
      status: 'pending',
      createdAt: now,
    };
  }

  async listApprovals(
    opts: ListApprovalsOptions = {}
  ): Promise<{ approvals: PendingApproval[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];
    let idx = 1;

    if (opts.personalityId) {
      conditions.push(`personality_id = $${idx++}`);
      params.push(opts.personalityId);
    }
    if (opts.status) {
      conditions.push(`status = $${idx++}`);
      params.push(opts.status);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
    const countRow = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM soul.pending_approvals ${where}`,
      params
    );
    const total = parseInt(countRow.rows[0]?.count ?? '0', 10);

    const limit = opts.limit ?? 50;
    const offset = opts.offset ?? 0;
    const rows = await this.query<{
      id: string;
      personality_id: string;
      tool_name: string;
      tool_args: Record<string, unknown>;
      status: string;
      created_at: string;
      resolved_at: string | null;
      resolved_by: string | null;
    }>(
      `SELECT id, personality_id, tool_name, tool_args, status, created_at, resolved_at, resolved_by
       FROM soul.pending_approvals ${where}
       ORDER BY created_at DESC
       LIMIT $${idx++} OFFSET $${idx++}`,
      [...params, limit, offset]
    );

    return {
      approvals: rows.rows.map((r) => ({
        id: r.id,
        personalityId: r.personality_id,
        toolName: r.tool_name,
        toolArgs: r.tool_args,
        status: r.status as PendingApproval['status'],
        createdAt: Number(r.created_at),
        resolvedAt: r.resolved_at ? Number(r.resolved_at) : undefined,
        resolvedBy: r.resolved_by ?? undefined,
      })),
      total,
    };
  }

  async resolveApproval(
    id: string,
    decision: 'approved' | 'rejected',
    resolvedBy = 'human'
  ): Promise<PendingApproval | null> {
    const now = Date.now();
    const result = await this.query<{
      id: string;
      personality_id: string;
      tool_name: string;
      tool_args: Record<string, unknown>;
      status: string;
      created_at: string;
      resolved_at: string;
      resolved_by: string;
    }>(
      `UPDATE soul.pending_approvals
       SET status = $1, resolved_at = $2, resolved_by = $3
       WHERE id = $4 AND status = 'pending'
       RETURNING *`,
      [decision, now, resolvedBy, id]
    );
    const r = result.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      personalityId: r.personality_id,
      toolName: r.tool_name,
      toolArgs: r.tool_args,
      status: r.status as PendingApproval['status'],
      createdAt: Number(r.created_at),
      resolvedAt: r.resolved_at ? Number(r.resolved_at) : undefined,
      resolvedBy: r.resolved_by ?? undefined,
    };
  }

  async getApproval(id: string): Promise<PendingApproval | null> {
    const result = await this.query<{
      id: string;
      personality_id: string;
      tool_name: string;
      tool_args: Record<string, unknown>;
      status: string;
      created_at: string;
      resolved_at: string | null;
      resolved_by: string | null;
    }>(
      `SELECT id, personality_id, tool_name, tool_args, status, created_at, resolved_at, resolved_by
       FROM soul.pending_approvals WHERE id = $1`,
      [id]
    );
    const r = result.rows[0];
    if (!r) return null;
    return {
      id: r.id,
      personalityId: r.personality_id,
      toolName: r.tool_name,
      toolArgs: r.tool_args,
      status: r.status as PendingApproval['status'],
      createdAt: Number(r.created_at),
      resolvedAt: r.resolved_at ? Number(r.resolved_at) : undefined,
      resolvedBy: r.resolved_by ?? undefined,
    };
  }

  async pendingCount(personalityId?: string): Promise<number> {
    const where = personalityId
      ? `WHERE personality_id = $1 AND status = 'pending'`
      : `WHERE status = 'pending'`;
    const params = personalityId ? [personalityId] : [];
    const result = await this.query<{ count: string }>(
      `SELECT COUNT(*)::text AS count FROM soul.pending_approvals ${where}`,
      params
    );
    return parseInt(result.rows[0]?.count ?? '0', 10);
  }
}
