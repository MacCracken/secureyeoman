/**
 * Task Storage — PostgreSQL-backed persistence for task history.
 *
 * Uses PgBaseStorage for connection pooling and query helpers.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { Task, ResourceUsage, SecurityContext, TaskError } from '@friday/shared';

// ─── Row Types ───────────────────────────────────────────────

interface TaskRow {
  id: string;
  correlation_id: string | null;
  parent_task_id: string | null;
  type: string;
  name: string;
  description: string | null;
  input_hash: string;
  status: string;
  result_json: unknown | null;
  resources_json: unknown | null;
  security_context_json: unknown;
  timeout_ms: number;
  created_at: number;
  started_at: number | null;
  completed_at: number | null;
  duration_ms: number | null;
}

// ─── Helpers ─────────────────────────────────────────────────

function rowToTask(row: TaskRow): Task {
  const result = (row.result_json as Task['result']) ?? undefined;
  const resources = (row.resources_json as ResourceUsage | undefined) ?? undefined;
  const securityContext = (row.security_context_json as SecurityContext) ?? {
    userId: 'unknown',
    role: 'viewer',
    permissionsUsed: [],
  };

  return {
    id: row.id,
    correlationId: row.correlation_id ?? undefined,
    parentTaskId: row.parent_task_id ?? undefined,
    type: row.type as Task['type'],
    name: row.name,
    description: row.description ?? undefined,
    inputHash: row.input_hash,
    status: row.status as Task['status'],
    result,
    resources,
    securityContext,
    timeoutMs: row.timeout_ms,
    createdAt: row.created_at,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    durationMs: row.duration_ms ?? undefined,
  };
}

// ─── Filter / Pagination ─────────────────────────────────────

export interface TaskFilter {
  status?: string;
  type?: string;
  userId?: string;
  from?: number;
  to?: number;
  limit?: number;
  offset?: number;
}

export interface TaskStats {
  total: number;
  byStatus: Record<string, number>;
  byType: Record<string, number>;
  successRate: number;
  avgDurationMs: number;
}

// ─── TaskStorage ─────────────────────────────────────────────

export class TaskStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ─── Write Operations ──────────────────────────────────────

  async storeTask(task: Task): Promise<void> {
    await this.query(
      `INSERT INTO task.tasks
         (id, correlation_id, parent_task_id, type, name, description,
          input_hash, status, result_json, resources_json, security_context_json,
          timeout_ms, created_at, started_at, completed_at, duration_ms)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)`,
      [
        task.id,
        task.correlationId ?? null,
        task.parentTaskId ?? null,
        task.type,
        task.name,
        task.description ?? null,
        task.inputHash,
        task.status,
        task.result ? JSON.stringify(task.result) : null,
        task.resources ? JSON.stringify(task.resources) : null,
        JSON.stringify(task.securityContext),
        task.timeoutMs,
        task.createdAt,
        task.startedAt ?? null,
        task.completedAt ?? null,
        task.durationMs ?? null,
      ],
    );
  }

  async updateTask(
    id: string,
    updates: {
      status?: string;
      startedAt?: number;
      completedAt?: number;
      durationMs?: number;
      result?: Task['result'];
      resources?: ResourceUsage;
    },
  ): Promise<boolean> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let counter = 1;

    if (updates.status !== undefined) {
      setClauses.push(`status = $${counter++}`);
      params.push(updates.status);
    }
    if (updates.startedAt !== undefined) {
      setClauses.push(`started_at = $${counter++}`);
      params.push(updates.startedAt);
    }
    if (updates.completedAt !== undefined) {
      setClauses.push(`completed_at = $${counter++}`);
      params.push(updates.completedAt);
    }
    if (updates.durationMs !== undefined) {
      setClauses.push(`duration_ms = $${counter++}`);
      params.push(updates.durationMs);
    }
    if (updates.result !== undefined) {
      setClauses.push(`result_json = $${counter++}`);
      params.push(JSON.stringify(updates.result));
    }
    if (updates.resources !== undefined) {
      setClauses.push(`resources_json = $${counter++}`);
      params.push(JSON.stringify(updates.resources));
    }

    if (setClauses.length === 0) return false;

    params.push(id);
    const rowCount = await this.execute(
      `UPDATE task.tasks SET ${setClauses.join(', ')} WHERE id = $${counter}`,
      params,
    );
    return rowCount > 0;
  }

  async updateTaskMetadata(
    id: string,
    updates: { name?: string; type?: string; description?: string },
  ): Promise<boolean> {
    const setClauses: string[] = [];
    const params: unknown[] = [];
    let counter = 1;

    if (updates.name !== undefined) {
      setClauses.push(`name = $${counter++}`);
      params.push(updates.name);
    }
    if (updates.type !== undefined) {
      setClauses.push(`type = $${counter++}`);
      params.push(updates.type);
    }
    if (updates.description !== undefined) {
      setClauses.push(`description = $${counter++}`);
      params.push(updates.description || null);
    }

    if (setClauses.length === 0) return false;

    params.push(id);
    const rowCount = await this.execute(
      `UPDATE task.tasks SET ${setClauses.join(', ')} WHERE id = $${counter}`,
      params,
    );
    return rowCount > 0;
  }

  async deleteTask(id: string): Promise<boolean> {
    const rowCount = await this.execute(
      'DELETE FROM task.tasks WHERE id = $1',
      [id],
    );
    return rowCount > 0;
  }

  // ─── Read Operations ───────────────────────────────────────

  async getTask(id: string): Promise<Task | null> {
    const row = await this.queryOne<TaskRow>(
      'SELECT * FROM task.tasks WHERE id = $1',
      [id],
    );
    return row ? rowToTask(row) : null;
  }

  async listTasks(filter?: TaskFilter): Promise<{ tasks: Task[]; total: number }> {
    let countQuery = 'SELECT COUNT(*) as count FROM task.tasks WHERE 1=1';
    let dataQuery = 'SELECT * FROM task.tasks WHERE 1=1';
    const params: unknown[] = [];
    let counter = 1;

    if (filter?.status) {
      const clause = ` AND status = $${counter++}`;
      countQuery += clause;
      dataQuery += clause;
      params.push(filter.status);
    }
    if (filter?.type) {
      const clause = ` AND type = $${counter++}`;
      countQuery += clause;
      dataQuery += clause;
      params.push(filter.type);
    }
    if (filter?.userId) {
      const clause = ` AND security_context_json->>'userId' = $${counter++}`;
      countQuery += clause;
      dataQuery += clause;
      params.push(filter.userId);
    }
    if (filter?.from) {
      const clause = ` AND created_at >= $${counter++}`;
      countQuery += clause;
      dataQuery += clause;
      params.push(filter.from);
    }
    if (filter?.to) {
      const clause = ` AND created_at <= $${counter++}`;
      countQuery += clause;
      dataQuery += clause;
      params.push(filter.to);
    }

    const totalRow = await this.queryOne<{ count: string }>(countQuery, params);
    const total = parseInt(totalRow?.count ?? '0', 10);

    dataQuery += ' ORDER BY created_at DESC';

    // Clone params for the data query (which may add limit/offset)
    const dataParams = [...params];

    if (filter?.limit) {
      dataQuery += ` LIMIT $${counter++}`;
      dataParams.push(filter.limit);
    }
    if (filter?.offset) {
      dataQuery += ` OFFSET $${counter++}`;
      dataParams.push(filter.offset);
    }

    const rows = await this.queryMany<TaskRow>(dataQuery, dataParams);
    return {
      tasks: rows.map(rowToTask),
      total,
    };
  }

  // ─── Stats ─────────────────────────────────────────────────

  async getStats(): Promise<TaskStats> {
    const statsRow = await this.queryOne<{
      total: string;
      completed: string;
      failed: string;
      pending: string;
      running: string;
      timeout_count: string;
      cancelled: string;
      avg_duration: number | null;
    }>(
      `SELECT
        COUNT(*) as total,
        SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
        SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed,
        SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending,
        SUM(CASE WHEN status = 'running' THEN 1 ELSE 0 END) as running,
        SUM(CASE WHEN status = 'timeout' THEN 1 ELSE 0 END) as timeout_count,
        SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled,
        AVG(CASE WHEN duration_ms IS NOT NULL THEN duration_ms END) as avg_duration
      FROM task.tasks`,
    );

    if (!statsRow) {
      return { total: 0, byStatus: {}, byType: {}, successRate: 0, avgDurationMs: 0 };
    }

    const total = parseInt(statsRow.total, 10);
    const completed = parseInt(statsRow.completed, 10);
    const failed = parseInt(statsRow.failed, 10);
    const pending = parseInt(statsRow.pending, 10);
    const running = parseInt(statsRow.running, 10);
    const timeoutCount = parseInt(statsRow.timeout_count, 10);
    const cancelled = parseInt(statsRow.cancelled, 10);

    // byType still needs its own GROUP BY query
    const typeRows = await this.queryMany<{ type: string; count: string }>(
      'SELECT type, COUNT(*) as count FROM task.tasks GROUP BY type',
    );

    const byStatus: Record<string, number> = {};
    if (completed > 0) byStatus.completed = completed;
    if (failed > 0) byStatus.failed = failed;
    if (pending > 0) byStatus.pending = pending;
    if (running > 0) byStatus.running = running;
    if (timeoutCount > 0) byStatus.timeout = timeoutCount;
    if (cancelled > 0) byStatus.cancelled = cancelled;

    const finishedCount = completed + failed + timeoutCount + cancelled;

    return {
      total,
      byStatus,
      byType: Object.fromEntries(typeRows.map((r) => [r.type, parseInt(r.count, 10)])),
      successRate: finishedCount > 0 ? completed / finishedCount : 0,
      avgDurationMs: statsRow.avg_duration ?? 0,
    };
  }
}
