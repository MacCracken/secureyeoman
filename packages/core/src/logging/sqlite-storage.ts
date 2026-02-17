/**
 * PostgreSQL-backed Audit Chain Storage
 *
 * Persistent storage for audit entries using PgBaseStorage.
 * Uses full-text search via tsvector for searchFullText queries.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import type { AuditEntry } from '@secureyeoman/shared';
import type { AuditChainStorage } from './audit-chain.js';

export interface AuditQueryOptions {
  from?: number;
  to?: number;
  level?: string[];
  event?: string[];
  userId?: string;
  taskId?: string;
  limit?: number;
  offset?: number;
  order?: 'asc' | 'desc';
}

export interface AuditQueryResult {
  entries: AuditEntry[];
  total: number;
  limit: number;
  offset: number;
}

interface AuditRow {
  id: string;
  correlation_id: string | null;
  event: string;
  level: string;
  message: string;
  user_id: string | null;
  task_id: string | null;
  metadata: unknown | null;
  timestamp: number;
  integrity_version: string;
  integrity_signature: string;
  integrity_previous_hash: string;
  seq: number;
}

function rowToEntry(row: AuditRow): AuditEntry {
  return {
    id: row.id,
    correlationId: row.correlation_id ?? undefined,
    event: row.event,
    level: row.level as AuditEntry['level'],
    message: row.message,
    userId: row.user_id ?? undefined,
    taskId: row.task_id ?? undefined,
    metadata: row.metadata
      ? typeof row.metadata === 'string'
        ? JSON.parse(row.metadata)
        : row.metadata
      : undefined,
    timestamp: row.timestamp,
    integrity: {
      version: row.integrity_version,
      signature: row.integrity_signature,
      previousEntryHash: row.integrity_previous_hash,
    },
  };
}

export class SQLiteAuditStorage extends PgBaseStorage implements AuditChainStorage {
  constructor() {
    super();
  }

  async append(entry: AuditEntry): Promise<void> {
    await this.execute(
      `INSERT INTO audit.entries (
        id, correlation_id, event, level, message,
        user_id, task_id, metadata, timestamp,
        integrity_version, integrity_signature, integrity_previous_hash
      ) VALUES (
        $1, $2, $3, $4, $5,
        $6, $7, $8, $9,
        $10, $11, $12
      )`,
      [
        entry.id,
        entry.correlationId ?? null,
        entry.event,
        entry.level,
        entry.message,
        entry.userId ?? null,
        entry.taskId ?? null,
        entry.metadata ? JSON.stringify(entry.metadata) : null,
        entry.timestamp,
        entry.integrity.version,
        entry.integrity.signature,
        entry.integrity.previousEntryHash,
      ]
    );
  }

  async getLast(): Promise<AuditEntry | null> {
    const row = await this.queryOne<AuditRow>(
      'SELECT * FROM audit.entries ORDER BY timestamp DESC LIMIT 1'
    );

    return row ? rowToEntry(row) : null;
  }

  async *iterate(): AsyncIterableIterator<AuditEntry> {
    const rows = await this.queryMany<AuditRow>(
      'SELECT * FROM audit.entries ORDER BY timestamp ASC'
    );

    for (const row of rows) {
      yield rowToEntry(row);
    }
  }

  async count(): Promise<number> {
    const row = await this.queryOne<{ cnt: string }>('SELECT COUNT(*) as cnt FROM audit.entries');
    return Number(row?.cnt ?? 0);
  }

  async getById(id: string): Promise<AuditEntry | null> {
    const row = await this.queryOne<AuditRow>('SELECT * FROM audit.entries WHERE id = $1', [id]);

    return row ? rowToEntry(row) : null;
  }

  async queryEntries(opts: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    const limit = Math.min(opts.limit ?? 50, 1000);
    const offset = opts.offset ?? 0;
    const order = opts.order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: unknown[] = [];
    let paramIndex = 1;

    if (opts.from !== undefined) {
      conditions.push(`timestamp >= $${paramIndex++}`);
      params.push(opts.from);
    }
    if (opts.to !== undefined) {
      conditions.push(`timestamp <= $${paramIndex++}`);
      params.push(opts.to);
    }
    if (opts.userId !== undefined) {
      conditions.push(`user_id = $${paramIndex++}`);
      params.push(opts.userId);
    }
    if (opts.taskId !== undefined) {
      conditions.push(`task_id = $${paramIndex++}`);
      params.push(opts.taskId);
    }
    if (opts.level?.length) {
      const placeholders = opts.level.map(() => `$${paramIndex++}`);
      conditions.push(`level IN (${placeholders.join(', ')})`);
      params.push(...opts.level);
    }
    if (opts.event?.length) {
      const placeholders = opts.event.map(() => `$${paramIndex++}`);
      conditions.push(`event IN (${placeholders.join(', ')})`);
      params.push(...opts.event);
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = await this.queryOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM audit.entries ${where}`,
      params
    );

    const dataParams = [...params, limit, offset];
    const rows = await this.queryMany<AuditRow>(
      `SELECT * FROM audit.entries ${where} ORDER BY timestamp ${order} LIMIT $${paramIndex++} OFFSET $${paramIndex++}`,
      dataParams
    );

    return {
      entries: rows.map(rowToEntry),
      total: Number(countRow?.cnt ?? 0),
      limit,
      offset,
    };
  }

  async getByTaskId(taskId: string): Promise<AuditEntry[]> {
    const rows = await this.queryMany<AuditRow>(
      'SELECT * FROM audit.entries WHERE task_id = $1 ORDER BY timestamp ASC',
      [taskId]
    );

    return rows.map(rowToEntry);
  }

  async getByCorrelationId(correlationId: string): Promise<AuditEntry[]> {
    const rows = await this.queryMany<AuditRow>(
      'SELECT * FROM audit.entries WHERE correlation_id = $1 ORDER BY timestamp ASC',
      [correlationId]
    );

    return rows.map(rowToEntry);
  }

  /**
   * Full-text search across event, message, and metadata fields
   * using PostgreSQL tsvector/tsquery.
   *
   * The query string is passed to plainto_tsquery for safe parsing.
   */
  async searchFullText(
    query: string,
    opts: { limit?: number; offset?: number } = {}
  ): Promise<AuditQueryResult> {
    const limit = Math.min(opts.limit ?? 50, 1000);
    const offset = opts.offset ?? 0;

    const countRow = await this.queryOne<{ cnt: string }>(
      `SELECT COUNT(*) as cnt FROM audit.entries WHERE search_vector @@ plainto_tsquery('english', $1)`,
      [query]
    );

    const rows = await this.queryMany<AuditRow>(
      `SELECT * FROM audit.entries
       WHERE search_vector @@ plainto_tsquery('english', $1)
       ORDER BY ts_rank(search_vector, plainto_tsquery('english', $1)) DESC
       LIMIT $2 OFFSET $3`,
      [query, limit, offset]
    );

    return {
      entries: rows.map(rowToEntry),
      total: Number(countRow?.cnt ?? 0),
      limit,
      offset,
    };
  }

  /**
   * Enforce retention policy by purging old entries.
   * Returns the count of deleted entries.
   */
  async enforceRetention(opts: { maxAgeDays?: number; maxEntries?: number } = {}): Promise<number> {
    const maxAgeDays = opts.maxAgeDays ?? 90;
    const maxEntries = opts.maxEntries ?? 1_000_000;
    let totalDeleted = 0;

    // 1. Delete entries older than maxAgeDays
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const ageDeleted = await this.execute('DELETE FROM audit.entries WHERE timestamp < $1', [
      cutoff,
    ]);
    totalDeleted += ageDeleted;

    // 2. If entry count exceeds maxEntries, delete oldest beyond limit
    const countRow = await this.queryOne<{ cnt: string }>(
      'SELECT COUNT(*) as cnt FROM audit.entries'
    );
    const currentCount = Number(countRow?.cnt ?? 0);

    if (currentCount > maxEntries) {
      const excess = currentCount - maxEntries;
      const overflowDeleted = await this.execute(
        `DELETE FROM audit.entries WHERE id IN (
          SELECT id FROM audit.entries ORDER BY timestamp ASC LIMIT $1
        )`,
        [excess]
      );
      totalDeleted += overflowDeleted;
    }

    return totalDeleted;
  }

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }
}
