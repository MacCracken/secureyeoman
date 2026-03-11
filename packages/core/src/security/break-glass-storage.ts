/**
 * BreakGlassStorage — PostgreSQL-backed storage for break-glass recovery keys
 * and emergency access sessions.
 *
 * Uses the break_glass schema created by 013_break_glass.sql.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

// ── Row types ────────────────────────────────────────────────────────

export interface RecoveryKeyRow {
  id: string;
  key_hash: string;
  created_at: number;
  rotated_at: number | null;
}

export interface BreakGlassSessionRow {
  id: string;
  recovery_key_id: string;
  created_at: number;
  expires_at: number;
  ip_address: string | null;
  revoked_at: number | null;
}

// ── Storage class ────────────────────────────────────────────────────

export class BreakGlassStorage extends PgBaseStorage {
  // ── Recovery keys ─────────────────────────────────────────────────

  async storeKeyHash(id: string, hash: string): Promise<void> {
    const now = Date.now();
    await this.execute(
      `INSERT INTO break_glass.recovery_keys (id, key_hash, created_at)
       VALUES ($1, $2, $3)`,
      [id, hash, now]
    );
  }

  async getKeyHash(): Promise<RecoveryKeyRow | null> {
    // Returns the most recent non-rotated key
    return this.queryOne<RecoveryKeyRow>(
      `SELECT id, key_hash, created_at, rotated_at
       FROM break_glass.recovery_keys
       WHERE rotated_at IS NULL
       ORDER BY created_at DESC
       LIMIT 1`
    );
  }

  async rotateKey(id: string, timestamp: number): Promise<void> {
    await this.execute(`UPDATE break_glass.recovery_keys SET rotated_at = $1 WHERE id = $2`, [
      timestamp,
      id,
    ]);
  }

  // ── Sessions ──────────────────────────────────────────────────────

  async createSession(session: BreakGlassSessionRow): Promise<void> {
    await this.execute(
      `INSERT INTO break_glass.sessions (id, recovery_key_id, created_at, expires_at, ip_address, revoked_at)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [
        session.id,
        session.recovery_key_id,
        session.created_at,
        session.expires_at,
        session.ip_address ?? null,
        session.revoked_at ?? null,
      ]
    );
  }

  async getSession(id: string): Promise<BreakGlassSessionRow | null> {
    return this.queryOne<BreakGlassSessionRow>(
      `SELECT id, recovery_key_id, created_at, expires_at, ip_address, revoked_at
       FROM break_glass.sessions
       WHERE id = $1`,
      [id]
    );
  }

  async listSessions(): Promise<BreakGlassSessionRow[]> {
    return this.queryMany<BreakGlassSessionRow>(
      `SELECT id, recovery_key_id, created_at, expires_at, ip_address, revoked_at
       FROM break_glass.sessions
       ORDER BY created_at DESC`
    );
  }

  async revokeSession(id: string, timestamp: number): Promise<boolean> {
    const count = await this.execute(
      `UPDATE break_glass.sessions SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL`,
      [timestamp, id]
    );
    return count > 0;
  }
}
