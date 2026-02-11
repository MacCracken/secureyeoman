/**
 * SQLite-backed Audit Chain Storage
 *
 * Persistent storage for audit entries using better-sqlite3.
 * Uses WAL mode for concurrent reads during chain verification.
 */

import Database from 'better-sqlite3';
import { mkdirSync } from 'node:fs';
import { dirname } from 'node:path';
import type { AuditEntry } from '@friday/shared';
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
  metadata: string | null;
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
    metadata: row.metadata ? JSON.parse(row.metadata) : undefined,
    timestamp: row.timestamp,
    integrity: {
      version: row.integrity_version,
      signature: row.integrity_signature,
      previousEntryHash: row.integrity_previous_hash,
    },
  };
}

export class SQLiteAuditStorage implements AuditChainStorage {
  private db: Database.Database;

  constructor(opts: { dbPath?: string } = {}) {
    const dbPath = opts.dbPath ?? ':memory:';

    if (dbPath !== ':memory:') {
      mkdirSync(dirname(dbPath), { recursive: true });
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('foreign_keys = ON');

    this.db.exec(`
      CREATE TABLE IF NOT EXISTS audit_entries (
        id TEXT PRIMARY KEY,
        correlation_id TEXT,
        event TEXT NOT NULL,
        level TEXT NOT NULL,
        message TEXT NOT NULL,
        user_id TEXT,
        task_id TEXT,
        metadata TEXT,
        timestamp INTEGER NOT NULL,
        integrity_version TEXT NOT NULL,
        integrity_signature TEXT NOT NULL,
        integrity_previous_hash TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_timestamp ON audit_entries(timestamp);
      CREATE INDEX IF NOT EXISTS idx_level ON audit_entries(level);
      CREATE INDEX IF NOT EXISTS idx_event ON audit_entries(event);
      CREATE INDEX IF NOT EXISTS idx_task_id ON audit_entries(task_id);
      CREATE INDEX IF NOT EXISTS idx_correlation_id ON audit_entries(correlation_id);
      CREATE INDEX IF NOT EXISTS idx_user_id ON audit_entries(user_id);

      -- FTS5 virtual table for full-text search over event, message, and metadata
      CREATE VIRTUAL TABLE IF NOT EXISTS audit_entries_fts USING fts5(
        id UNINDEXED,
        event,
        message,
        metadata,
        content='audit_entries',
        content_rowid='rowid'
      );

      -- Triggers to keep FTS index in sync with the main table
      CREATE TRIGGER IF NOT EXISTS audit_entries_ai AFTER INSERT ON audit_entries BEGIN
        INSERT INTO audit_entries_fts(rowid, id, event, message, metadata)
        VALUES (new.rowid, new.id, new.event, new.message, COALESCE(new.metadata, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS audit_entries_ad AFTER DELETE ON audit_entries BEGIN
        INSERT INTO audit_entries_fts(audit_entries_fts, rowid, id, event, message, metadata)
        VALUES ('delete', old.rowid, old.id, old.event, old.message, COALESCE(old.metadata, ''));
      END;

      CREATE TRIGGER IF NOT EXISTS audit_entries_au AFTER UPDATE ON audit_entries BEGIN
        INSERT INTO audit_entries_fts(audit_entries_fts, rowid, id, event, message, metadata)
        VALUES ('delete', old.rowid, old.id, old.event, old.message, COALESCE(old.metadata, ''));
        INSERT INTO audit_entries_fts(rowid, id, event, message, metadata)
        VALUES (new.rowid, new.id, new.event, new.message, COALESCE(new.metadata, ''));
      END;
    `);
  }

  async append(entry: AuditEntry): Promise<void> {
    const stmt = this.db.prepare(`
      INSERT INTO audit_entries (
        id, correlation_id, event, level, message,
        user_id, task_id, metadata, timestamp,
        integrity_version, integrity_signature, integrity_previous_hash
      ) VALUES (
        @id, @correlation_id, @event, @level, @message,
        @user_id, @task_id, @metadata, @timestamp,
        @integrity_version, @integrity_signature, @integrity_previous_hash
      )
    `);

    stmt.run({
      id: entry.id,
      correlation_id: entry.correlationId ?? null,
      event: entry.event,
      level: entry.level,
      message: entry.message,
      user_id: entry.userId ?? null,
      task_id: entry.taskId ?? null,
      metadata: entry.metadata ? JSON.stringify(entry.metadata) : null,
      timestamp: entry.timestamp,
      integrity_version: entry.integrity.version,
      integrity_signature: entry.integrity.signature,
      integrity_previous_hash: entry.integrity.previousEntryHash,
    });
  }

  async getLast(): Promise<AuditEntry | null> {
    const row = this.db.prepare(
      'SELECT * FROM audit_entries ORDER BY rowid DESC LIMIT 1'
    ).get() as AuditRow | undefined;

    return row ? rowToEntry(row) : null;
  }

  async *iterate(): AsyncIterableIterator<AuditEntry> {
    const rows = this.db.prepare(
      'SELECT * FROM audit_entries ORDER BY rowid ASC'
    ).all() as AuditRow[];

    for (const row of rows) {
      yield rowToEntry(row);
    }
  }

  async count(): Promise<number> {
    const row = this.db.prepare(
      'SELECT COUNT(*) as cnt FROM audit_entries'
    ).get() as { cnt: number };
    return row.cnt;
  }

  async getById(id: string): Promise<AuditEntry | null> {
    const row = this.db.prepare(
      'SELECT * FROM audit_entries WHERE id = ?'
    ).get(id) as AuditRow | undefined;

    return row ? rowToEntry(row) : null;
  }

  async query(opts: AuditQueryOptions = {}): Promise<AuditQueryResult> {
    const limit = Math.min(opts.limit ?? 50, 1000);
    const offset = opts.offset ?? 0;
    const order = opts.order === 'asc' ? 'ASC' : 'DESC';

    const conditions: string[] = [];
    const params: Record<string, unknown> = {};

    if (opts.from !== undefined) {
      conditions.push('timestamp >= @from_ts');
      params.from_ts = opts.from;
    }
    if (opts.to !== undefined) {
      conditions.push('timestamp <= @to_ts');
      params.to_ts = opts.to;
    }
    if (opts.userId !== undefined) {
      conditions.push('user_id = @user_id');
      params.user_id = opts.userId;
    }
    if (opts.taskId !== undefined) {
      conditions.push('task_id = @task_id');
      params.task_id = opts.taskId;
    }
    if (opts.level?.length) {
      const placeholders = opts.level.map((_, i) => `@level_${i}`);
      conditions.push(`level IN (${placeholders.join(', ')})`);
      opts.level.forEach((l, i) => { params[`level_${i}`] = l; });
    }
    if (opts.event?.length) {
      const placeholders = opts.event.map((_, i) => `@event_${i}`);
      conditions.push(`event IN (${placeholders.join(', ')})`);
      opts.event.forEach((e, i) => { params[`event_${i}`] = e; });
    }

    const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';

    const countRow = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM audit_entries ${where}`
    ).get(params) as { cnt: number };

    const rows = this.db.prepare(
      `SELECT * FROM audit_entries ${where} ORDER BY rowid ${order} LIMIT @limit OFFSET @offset`
    ).all({ ...params, limit, offset }) as AuditRow[];

    return {
      entries: rows.map(rowToEntry),
      total: countRow.cnt,
      limit,
      offset,
    };
  }

  async getByTaskId(taskId: string): Promise<AuditEntry[]> {
    const rows = this.db.prepare(
      'SELECT * FROM audit_entries WHERE task_id = ? ORDER BY rowid ASC'
    ).all(taskId) as AuditRow[];

    return rows.map(rowToEntry);
  }

  async getByCorrelationId(correlationId: string): Promise<AuditEntry[]> {
    const rows = this.db.prepare(
      'SELECT * FROM audit_entries WHERE correlation_id = ? ORDER BY rowid ASC'
    ).all(correlationId) as AuditRow[];

    return rows.map(rowToEntry);
  }

  /**
   * Full-text search across event, message, and metadata fields
   * using the FTS5 virtual table.
   *
   * The query string uses FTS5 query syntax (e.g. "error OR warning",
   * "deploy*", phrase matching with quotes, etc.).
   */
  async searchFullText(
    query: string,
    opts: { limit?: number; offset?: number } = {},
  ): Promise<AuditQueryResult> {
    const limit = Math.min(opts.limit ?? 50, 1000);
    const offset = opts.offset ?? 0;

    const countRow = this.db.prepare(
      `SELECT COUNT(*) as cnt FROM audit_entries_fts WHERE audit_entries_fts MATCH @query`
    ).get({ query }) as { cnt: number };

    const rows = this.db.prepare(
      `SELECT ae.* FROM audit_entries ae
       JOIN audit_entries_fts fts ON ae.rowid = fts.rowid
       WHERE audit_entries_fts MATCH @query
       ORDER BY fts.rank
       LIMIT @limit OFFSET @offset`
    ).all({ query, limit, offset }) as AuditRow[];

    return {
      entries: rows.map(rowToEntry),
      total: countRow.cnt,
      limit,
      offset,
    };
  }

  /**
   * Enforce retention policy by purging old entries.
   * Returns the count of deleted entries.
   */
  enforceRetention(opts: { maxAgeDays?: number; maxEntries?: number } = {}): number {
    const maxAgeDays = opts.maxAgeDays ?? 90;
    const maxEntries = opts.maxEntries ?? 1_000_000;
    let totalDeleted = 0;

    // 1. Delete entries older than maxAgeDays
    const cutoff = Date.now() - maxAgeDays * 86_400_000;
    const ageResult = this.db
      .prepare('DELETE FROM audit_entries WHERE timestamp < ?')
      .run(cutoff);
    totalDeleted += ageResult.changes;

    // 2. If entry count exceeds maxEntries, delete oldest beyond limit
    const countRow = this.db
      .prepare('SELECT COUNT(*) as cnt FROM audit_entries')
      .get() as { cnt: number };

    if (countRow.cnt > maxEntries) {
      const excess = countRow.cnt - maxEntries;
      const overflowResult = this.db
        .prepare(
          `DELETE FROM audit_entries WHERE rowid IN (
            SELECT rowid FROM audit_entries ORDER BY rowid ASC LIMIT ?
          )`
        )
        .run(excess);
      totalDeleted += overflowResult.changes;
    }

    return totalDeleted;
  }

  close(): void {
    this.db.close();
  }
}
