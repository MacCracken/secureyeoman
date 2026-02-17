/**
 * BrowserSessionStorage — PostgreSQL-backed storage for browser automation sessions.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export interface BrowserSession {
  id: string;
  status: 'active' | 'closed' | 'failed';
  url?: string;
  title?: string;
  viewportW?: number;
  viewportH?: number;
  screenshot?: string;
  toolName: string;
  durationMs?: number;
  error?: string;
  createdAt: string;
  closedAt?: string;
}

export interface BrowserSessionFilters {
  status?: string;
  toolName?: string;
  limit?: number;
  offset?: number;
}

export interface BrowserSessionStats {
  total: number;
  active: number;
  closed: number;
  failed: number;
}

function rowToSession(row: Record<string, unknown>): BrowserSession {
  return {
    id: row.id as string,
    status: row.status as BrowserSession['status'],
    url: (row.url as string) ?? undefined,
    title: (row.title as string) ?? undefined,
    viewportW: (row.viewport_w as number) ?? undefined,
    viewportH: (row.viewport_h as number) ?? undefined,
    screenshot: (row.screenshot as string) ?? undefined,
    toolName: row.tool_name as string,
    durationMs: (row.duration_ms as number) ?? undefined,
    error: (row.error as string) ?? undefined,
    createdAt: (row.created_at as Date).toISOString(),
    closedAt: row.closed_at ? (row.closed_at as Date).toISOString() : undefined,
  };
}

export class BrowserSessionStorage extends PgBaseStorage {
  async ensureTables(): Promise<void> {
    await this.execute(`CREATE SCHEMA IF NOT EXISTS browser`);
    await this.execute(`
      CREATE TABLE IF NOT EXISTS browser.sessions (
        id            TEXT PRIMARY KEY,
        status        TEXT NOT NULL DEFAULT 'active',
        url           TEXT,
        title         TEXT,
        viewport_w    INTEGER,
        viewport_h    INTEGER,
        screenshot    TEXT,
        tool_name     TEXT NOT NULL,
        duration_ms   INTEGER,
        error         TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        closed_at     TIMESTAMPTZ
      )
    `);
    await this.execute(
      `CREATE INDEX IF NOT EXISTS idx_browser_sessions_status ON browser.sessions(status)`
    );
    await this.execute(
      `CREATE INDEX IF NOT EXISTS idx_browser_sessions_created ON browser.sessions(created_at DESC)`
    );
  }

  async createSession(params: {
    toolName: string;
    url?: string;
    viewportW?: number;
    viewportH?: number;
  }): Promise<BrowserSession> {
    const id = uuidv7();
    const row = await this.queryOne(
      `INSERT INTO browser.sessions (id, status, url, viewport_w, viewport_h, tool_name)
       VALUES ($1, 'active', $2, $3, $4, $5)
       RETURNING *`,
      [id, params.url ?? null, params.viewportW ?? null, params.viewportH ?? null, params.toolName]
    );
    return rowToSession(row!);
  }

  async updateSession(
    id: string,
    updates: {
      url?: string;
      title?: string;
      screenshot?: string;
      durationMs?: number;
      status?: 'active' | 'closed' | 'failed';
      error?: string;
    }
  ): Promise<BrowserSession | null> {
    const setClauses: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (updates.url !== undefined) {
      setClauses.push(`url = $${idx++}`);
      values.push(updates.url);
    }
    if (updates.title !== undefined) {
      setClauses.push(`title = $${idx++}`);
      values.push(updates.title);
    }
    if (updates.screenshot !== undefined) {
      setClauses.push(`screenshot = $${idx++}`);
      values.push(updates.screenshot);
    }
    if (updates.durationMs !== undefined) {
      setClauses.push(`duration_ms = $${idx++}`);
      values.push(updates.durationMs);
    }
    if (updates.status !== undefined) {
      setClauses.push(`status = $${idx++}`);
      values.push(updates.status);
    }
    if (updates.error !== undefined) {
      setClauses.push(`error = $${idx++}`);
      values.push(updates.error);
    }

    if (setClauses.length === 0) return this.getSession(id);

    if (updates.status === 'closed' || updates.status === 'failed') {
      setClauses.push(`closed_at = NOW()`);
    }

    values.push(id);
    const row = await this.queryOne(
      `UPDATE browser.sessions SET ${setClauses.join(', ')} WHERE id = $${idx} RETURNING *`,
      values
    );
    return row ? rowToSession(row) : null;
  }

  async closeSession(id: string): Promise<BrowserSession | null> {
    return this.updateSession(id, { status: 'closed' });
  }

  async getSession(id: string): Promise<BrowserSession | null> {
    const row = await this.queryOne(`SELECT * FROM browser.sessions WHERE id = $1`, [id]);
    return row ? rowToSession(row) : null;
  }

  async listSessions(
    filters: BrowserSessionFilters = {}
  ): Promise<{ sessions: BrowserSession[]; total: number }> {
    const conditions: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (filters.status) {
      conditions.push(`status = $${idx++}`);
      values.push(filters.status);
    }
    if (filters.toolName) {
      conditions.push(`tool_name = $${idx++}`);
      values.push(filters.toolName);
    }

    const where = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
    const limit = filters.limit ?? 20;
    const offset = filters.offset ?? 0;

    const countResult = await this.queryOne<{ count: string }>(
      `SELECT COUNT(*) as count FROM browser.sessions ${where}`,
      values
    );
    const total = parseInt(countResult?.count ?? '0', 10);

    const rows = await this.queryMany(
      `SELECT * FROM browser.sessions ${where} ORDER BY created_at DESC LIMIT $${idx++} OFFSET $${idx++}`,
      [...values, limit, offset]
    );

    return { sessions: rows.map(rowToSession), total };
  }

  async getSessionStats(): Promise<BrowserSessionStats> {
    const rows = await this.queryMany<{ status: string; count: string }>(
      `SELECT status, COUNT(*) as count FROM browser.sessions GROUP BY status`
    );
    const stats: BrowserSessionStats = { total: 0, active: 0, closed: 0, failed: 0 };
    for (const row of rows) {
      const count = parseInt(row.count, 10);
      stats.total += count;
      if (row.status === 'active') stats.active = count;
      else if (row.status === 'closed') stats.closed = count;
      else if (row.status === 'failed') stats.failed = count;
    }
    return stats;
  }
}
