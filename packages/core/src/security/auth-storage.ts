/**
 * Auth Storage — PostgreSQL-backed storage for token blacklist, API keys,
 * and the multi-user auth.users table.
 *
 * Uses PgBaseStorage base class with shared connection pool.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import { encryptToken, decryptToken, currentKeyId } from './token-encryption.js';
import type { User, UserCreate, UserUpdate } from '@secureyeoman/shared';

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
  personality_id?: string | null;
  rate_limit_rpm?: number | null;
  rate_limit_tpd?: number | null;
  is_gateway_key?: boolean;
}

export interface ApiKeyUsageRow {
  id: string;
  key_id: string;
  timestamp: number;
  tokens_used: number;
  latency_ms: number | null;
  personality_id: string | null;
  status_code: number;
  error_message: string | null;
}

export class AuthStorage extends PgBaseStorage {
  constructor() {
    super();
  }

  // ── Token revocation ───────────────────────────────────────────────

  /**
   * Atomically revoke a token. Returns true if this call performed the
   * revocation, false if the token was already revoked.
   */
  async revokeToken(jti: string, userId: string, expiresAt: number): Promise<boolean> {
    const row = await this.queryOne<{ jti: string }>(
      `INSERT INTO auth.revoked_tokens (jti, user_id, revoked_at, expires_at)
       VALUES ($1, $2, $3, $4)
       ON CONFLICT(jti) DO NOTHING
       RETURNING jti`,
      [jti, userId, Date.now(), expiresAt]
    );
    return row !== null;
  }

  async isTokenRevoked(jti: string): Promise<boolean> {
    const row = await this.queryOne<{ jti: string }>(
      'SELECT jti FROM auth.revoked_tokens WHERE jti = $1',
      [jti]
    );
    return row !== null;
  }

  async cleanupExpiredTokens(): Promise<number> {
    return this.execute('DELETE FROM auth.revoked_tokens WHERE expires_at < $1', [Date.now()]);
  }

  // ── API keys ───────────────────────────────────────────────────────

  async storeApiKey(row: ApiKeyRow): Promise<void> {
    await this.execute(
      `INSERT INTO auth.api_keys (id, name, key_hash, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at, personality_id, rate_limit_rpm, rate_limit_tpd, is_gateway_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)`,
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
        row.personality_id ?? null,
        row.rate_limit_rpm ?? null,
        row.rate_limit_tpd ?? null,
        row.is_gateway_key ?? false,
      ]
    );
  }

  async findApiKeyByHash(hash: string): Promise<ApiKeyRow | null> {
    const row = await this.queryOne<ApiKeyRow>(
      'SELECT id, name, key_hash, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at, personality_id, rate_limit_rpm, rate_limit_tpd, is_gateway_key FROM auth.api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
      [hash]
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
        'SELECT id, name, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at, personality_id, rate_limit_rpm, rate_limit_tpd, is_gateway_key FROM auth.api_keys WHERE user_id = $1 AND revoked_at IS NULL ORDER BY created_at DESC',
        [userId]
      );
    }

    return this.queryMany<Omit<ApiKeyRow, 'key_hash'>>(
      'SELECT id, name, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at, personality_id, rate_limit_rpm, rate_limit_tpd, is_gateway_key FROM auth.api_keys WHERE revoked_at IS NULL ORDER BY created_at DESC'
    );
  }

  async revokeApiKey(id: string): Promise<boolean> {
    const changes = await this.execute(
      'UPDATE auth.api_keys SET revoked_at = $1 WHERE id = $2 AND revoked_at IS NULL',
      [Date.now(), id]
    );
    return changes > 0;
  }

  async updateLastUsed(id: string, ts: number): Promise<void> {
    await this.execute('UPDATE auth.api_keys SET last_used_at = $1 WHERE id = $2', [ts, id]);
  }

  async recordKeyUsage(entry: Omit<ApiKeyUsageRow, 'id'>): Promise<void> {
    const { uuidv7: genId } = await import('../utils/crypto.js');
    await this.execute(
      `INSERT INTO auth.api_key_usage (id, key_id, timestamp, tokens_used, latency_ms, personality_id, status_code, error_message)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [
        genId(),
        entry.key_id,
        entry.timestamp,
        entry.tokens_used,
        entry.latency_ms ?? null,
        entry.personality_id ?? null,
        entry.status_code,
        entry.error_message ?? null,
      ]
    );
  }

  async getTokensUsedToday(keyId: string): Promise<number> {
    const startOfDay = new Date();
    startOfDay.setHours(0, 0, 0, 0);
    const result = await this.queryOne<{ total: string }>(
      'SELECT COALESCE(SUM(tokens_used), 0)::text AS total FROM auth.api_key_usage WHERE key_id = $1 AND timestamp >= $2',
      [keyId, startOfDay.getTime()]
    );
    return parseInt(result?.total ?? '0', 10);
  }

  async getKeyUsage(keyId: string, fromTs?: number, toTs?: number): Promise<ApiKeyUsageRow[]> {
    let sql = 'SELECT * FROM auth.api_key_usage WHERE key_id = $1';
    const params: unknown[] = [keyId];
    let idx = 2;
    if (fromTs !== undefined) {
      sql += ` AND timestamp >= $${idx++}`;
      params.push(fromTs);
    }
    if (toTs !== undefined) {
      sql += ` AND timestamp <= $${idx++}`;
      params.push(toTs);
    }
    sql += ' ORDER BY timestamp DESC LIMIT 1000';
    return this.queryMany<ApiKeyUsageRow>(sql, params);
  }

  async getUsageSummary(): Promise<
    {
      keyId: string;
      keyPrefix: string;
      personalityId: string | null;
      requests24h: number;
      tokens24h: number;
      errors24h: number;
      p50LatencyMs: number;
      p95LatencyMs: number;
    }[]
  > {
    const cutoff = Date.now() - 86_400_000;
    const rows = await this.queryMany<{
      key_id: string;
      key_prefix: string;
      personality_id: string | null;
      requests24h: string;
      tokens24h: string;
      errors24h: string;
      p50: string | null;
      p95: string | null;
    }>(
      `SELECT
         u.key_id,
         k.key_prefix,
         k.personality_id,
         COUNT(*)::text AS requests24h,
         COALESCE(SUM(u.tokens_used), 0)::text AS tokens24h,
         COUNT(CASE WHEN u.status_code >= 400 THEN 1 END)::text AS errors24h,
         PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY u.latency_ms)::text AS p50,
         PERCENTILE_CONT(0.95) WITHIN GROUP (ORDER BY u.latency_ms)::text AS p95
       FROM auth.api_key_usage u
       JOIN auth.api_keys k ON k.id = u.key_id
       WHERE u.timestamp >= $1
       GROUP BY u.key_id, k.key_prefix, k.personality_id`,
      [cutoff]
    );
    return rows.map((r) => ({
      keyId: r.key_id,
      keyPrefix: r.key_prefix,
      personalityId: r.personality_id,
      requests24h: parseInt(r.requests24h, 10),
      tokens24h: parseInt(r.tokens24h, 10),
      errors24h: parseInt(r.errors24h, 10),
      p50LatencyMs: r.p50 ? Math.round(parseFloat(r.p50)) : 0,
      p95LatencyMs: r.p95 ? Math.round(parseFloat(r.p95)) : 0,
    }));
  }

  // ── Two-Factor Authentication ────────────────────────────────────

  async saveTwoFactor(userId: string, secret: string, enabled: boolean): Promise<void> {
    const now = Date.now();
    const secretEnc = encryptToken(secret);
    const keyId = currentKeyId();
    await this.execute(
      `INSERT INTO auth.two_factor (user_id, secret_enc, enabled, secret_enc_key_id, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id) DO UPDATE SET secret_enc = $2, enabled = $3, secret_enc_key_id = $4, updated_at = $6`,
      [userId, secretEnc, enabled, keyId, now, now]
    );
  }

  async loadTwoFactor(userId: string): Promise<{ secret: string; enabled: boolean } | null> {
    const row = await this.queryOne<{ secret_enc: Buffer; enabled: boolean }>(
      'SELECT secret_enc, enabled FROM auth.two_factor WHERE user_id = $1',
      [userId]
    );
    if (!row) return null;
    const secret = decryptToken(row.secret_enc);
    if (!secret) return null;
    return { secret, enabled: row.enabled };
  }

  async deleteTwoFactor(userId: string): Promise<void> {
    await this.execute('DELETE FROM auth.two_factor WHERE user_id = $1', [userId]);
  }

  async saveRecoveryCodes(userId: string, codeHashes: string[]): Promise<void> {
    const now = Date.now();
    // Clear existing codes, then insert new ones
    await this.execute('DELETE FROM auth.recovery_codes WHERE user_id = $1', [userId]);
    for (const hash of codeHashes) {
      await this.execute(
        'INSERT INTO auth.recovery_codes (id, user_id, code_hash, created_at) VALUES ($1, $2, $3, $4)',
        [uuidv7(), userId, hash, now]
      );
    }
  }

  async loadRecoveryCodes(userId: string): Promise<string[]> {
    const rows = await this.queryMany<{ code_hash: string }>(
      'SELECT code_hash FROM auth.recovery_codes WHERE user_id = $1 AND used_at IS NULL',
      [userId]
    );
    return rows.map((r) => r.code_hash);
  }

  async markRecoveryCodeUsed(userId: string, codeHash: string): Promise<void> {
    await this.execute(
      'UPDATE auth.recovery_codes SET used_at = $1 WHERE user_id = $2 AND code_hash = $3 AND used_at IS NULL',
      [Date.now(), userId, codeHash]
    );
  }

  override close(): void {
    // no-op — pool lifecycle is managed globally
  }

  // ── Users ─────────────────────────────────────────────────────────

  async createUser(data: UserCreate): Promise<User> {
    const now = Date.now();
    const id = data.id ?? uuidv7();
    await this.execute(
      `INSERT INTO auth.users (id, email, display_name, hashed_password, is_admin, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (id) DO NOTHING`,
      [
        id,
        data.email,
        data.displayName ?? '',
        data.hashedPassword ?? null,
        data.isAdmin ?? false,
        now,
        now,
      ]
    );
    return {
      id,
      email: data.email,
      displayName: data.displayName ?? '',
      isAdmin: data.isAdmin ?? false,
      createdAt: now,
      updatedAt: now,
    };
  }

  async getUserById(id: string): Promise<User | null> {
    const row = await this.queryOne<{
      id: string;
      email: string;
      display_name: string;
      is_admin: boolean;
      created_at: number;
      updated_at: number;
    }>(
      'SELECT id, email, display_name, is_admin, created_at, updated_at FROM auth.users WHERE id = $1',
      [id]
    );
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = await this.queryOne<{
      id: string;
      email: string;
      display_name: string;
      is_admin: boolean;
      created_at: number;
      updated_at: number;
    }>(
      'SELECT id, email, display_name, is_admin, created_at, updated_at FROM auth.users WHERE email = $1',
      [email]
    );
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    };
  }

  async listUsers(): Promise<User[]> {
    const rows = await this.queryMany<{
      id: string;
      email: string;
      display_name: string;
      is_admin: boolean;
      created_at: number;
      updated_at: number;
    }>(
      'SELECT id, email, display_name, is_admin, created_at, updated_at FROM auth.users ORDER BY created_at ASC'
    );
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      isAdmin: r.is_admin,
      createdAt: r.created_at,
      updatedAt: r.updated_at,
    }));
  }

  async updateUser(id: string, data: UserUpdate): Promise<User | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.email !== undefined) {
      updates.push(`email = $${idx++}`);
      values.push(data.email);
    }
    if (data.displayName !== undefined) {
      updates.push(`display_name = $${idx++}`);
      values.push(data.displayName);
    }
    if (data.hashedPassword !== undefined) {
      updates.push(`hashed_password = $${idx++}`);
      values.push(data.hashedPassword);
    }
    if (data.isAdmin !== undefined) {
      updates.push(`is_admin = $${idx++}`);
      values.push(data.isAdmin);
    }

    if (updates.length === 0) return this.getUserById(id);

    updates.push(`updated_at = $${idx++}`);
    values.push(Date.now());
    values.push(id);

    await this.execute(`UPDATE auth.users SET ${updates.join(', ')} WHERE id = $${idx}`, values);
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM auth.users WHERE id = $1 AND id != $2', [
      id,
      'admin',
    ]);
    return count > 0;
  }
}
