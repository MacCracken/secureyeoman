/**
 * Auth Storage — PostgreSQL-backed storage for token blacklist and API keys.
 *
 * Uses PgBaseStorage base class with shared connection pool.
 */

import { PgBaseStorage } from '../storage/pg-base.js';

export interface ApiKeyRow {
  id: string;
  name: string;
  key_hash: string;
  key_prefix: string;
  role: string;
  user_id: string;
  created_at: number;
  expires_at: number | null;
  revoked_at: number | null;
  last_used_at: number | null;
}

export class AuthStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Token revocation ───────────────────────────────────────────────

  async revokeToken(jti: string, userId: string, expiresAt: number): Promise<void> {
    await this.execute(
      `INSERT INTO auth.revoked_tokens (jti, user_id, revoked_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(jti) DO NOTHING`,
      [jti, userId, Date.now(), expiresAt],
    );
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const row = await this.queryOne<{ jti: string }>(
      'SELECT jti FROM auth.revoked_tokens WHERE jti = $1',
      [jti],
    );
    return row !== null;
  }

  async cleanupExpiredTokens(): Promise<number> {
    return this.execute(
      'DELETE FROM auth.revoked_tokens WHERE expires_at < $1',
      [Date.now()],
    );
  }

  // ── API keys ───────────────────────────────────────────────────────

  async storeApiKey(row: ApiKeyRow): Promise<void> {
    await this.execute(
      `INSERT INTO auth.api_keys (id, name, key_hash, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)`,
      [
        row.id,
        row.name,
        row.key_hash,
        row.key_prefix,
        row.role,
        row.user_id,
        row.created_at,
        row.expires_at,
        row.revoked_at,
        row.last_used_at,
      ],
    );
  }

  async findApiKeyByHash(hash: string): Promise<ApiKeyRow | null> {
    const row = await this.queryOne<ApiKeyRow>(
      'SELECT * FROM auth.api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [hash],
    );

    if (!row) return null;

    // Check expiry
    if (row.expires_at !== null && row.expires_at < Date.now()) {
      return null;
    }

    return row;
  }

  async listApiKeys(userId?: string): Promise<Omit<ApiKeyRow, 'key_hash'>[]> {
    if (userId) {
      return this.queryMany<Omit<ApiKeyRow, 'key_hash'>>(
        'SELECT id, name, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at FROM auth.api_keys WHERE user_id = $1 ORDER BY created_at DESC',
        [userId],
      );
    }

    return this.queryMany<Omit<ApiKeyRow, 'key_hash'>>(
      'SELECT id, name, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at FROM auth.api_keys ORDER BY created_at DESC',
    );
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const changes = await this.execute(
      'UPDATE auth.api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL',
      [Date.now(), id],
    );
    return changes > 0;
  }

  async updateLastUsed(id: string, ts: number): Promise<void> {
    await this.execute(
      'UPDATE auth.api_keys SET last_used_at = $1 WHERE id = $2',
      [ts, id],
    );
  }

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }
}
