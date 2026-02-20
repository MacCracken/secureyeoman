/**
 * HeartbeatLogStorage — Persists per-check execution results for the heartbeat audit trail.
 *
 * Each row records one check run: name, status, message, duration, and optional error detail.
 * Supports querying by check name, status, and pagination.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export interface HeartbeatLogEntry {
  id: string;
  checkName: string;
  personalityId: string | null;
  ranAt: number;
  status: 'ok' | 'warning' | 'error';
  message: string;
  durationMs: number;
  errorDetail: string | null;
}

export interface HeartbeatLogFilter {
  checkName?: string;
  status?: 'ok' | 'warning' | 'error';
  limit?: number;
  offset?: number;
}

export class HeartbeatLogStorage extends PgBaseStorage {
  async persist(entry: Omit<HeartbeatLogEntry, 'id'>): Promise<HeartbeatLogEntry> {
    const id = uuidv7();
    await this.execute(
      `INSERT INTO proactive.heartbeat_log
         (id, check_name, personality_id, ran_at, status, message, duration_ms, error_detail)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        id,
        entry.checkName,
        entry.personalityId ?? null,
        entry.ranAt,
        entry.status,
        entry.message,
        entry.durationMs,
        entry.errorDetail ?? null,
      ]
    );
    return { id, ...entry };
  }

  async list(
    filter: HeartbeatLogFilter = {}
  ): Promise<{ entries: HeartbeatLogEntry[]; total: number }> {
    const conditions: string[] = [];
    const params: unknown[] = [];

    if (filter.checkName) {
      params.push(filter.checkName);
      conditions.push(`check_name = $${params.length}`);
    }
    if (filter.status) {
      params.push(filter.status);
      conditions.push(`status = $${params.length}`);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = Math.min(filter.limit ?? 20, 200);
    const offset = filter.offset ?? 0;

    const countRow = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) AS count FROM proactive.heartbeat_log ${where}`,
      params
    );
    const total = parseInt(countRow?.count ?? '0', 10);

    const rows = await this.queryMany<Record<string, unknown>>(
      `SELECT id, check_name, personality_id, ran_at, status, message, duration_ms, error_detail
         FROM proactive.heartbeat_log ${where}
         ORDER BY ran_at DESC
         LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit, offset]
    );

    const entries = rows.map((r) => ({
      id: r.id as string,
      checkName: r.check_name as string,
      personalityId: (r.personality_id as string | null) ?? null,
      ranAt: r.ran_at as number,
      status: r.status as 'ok' | 'warning' | 'error',
      message: r.message as string,
      durationMs: r.duration_ms as number,
      errorDetail: (r.error_detail as string | null) ?? null,
    }));

    return { entries, total };
  }
}
