/**
 * Auth Storage — PostgreSQL-backed storage for token blacklist, API keys,
 * and the multi-user auth.users table.
 *
 * Uses PgBaseStorage base class with shared connection pool.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
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
      [jti, userId, Date.now(), expiresAt]
    );
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
      ]
    );
  }

  async findApiKeyByHash(hash: string): Promise<ApiKeyRow | null> {
    const row = await this.queryOne<ApiKeyRow>(
      'SELECT * FROM auth.api_keys WHERE key_hash = $1 AND revoked_at IS NULL',
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
        'SELECT id, name, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at FROM auth.api_keys WHERE user_id = $1 ORDER BY created_at DESC',
        [userId]
      );
    }

    return this.queryMany<Omit<ApiKeyRow, 'key_hash'>>(
      'SELECT id, name, key_prefix, role, user_id, created_at, expires_at, revoked_at, last_used_at FROM auth.api_keys ORDER BY created_at DESC'
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
      [id, data.email, data.displayName ?? '', data.hashedPassword ?? null, data.isAdmin ?? false, now, now]
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
      id: string; email: string; display_name: string; is_admin: boolean;
      created_at: number; updated_at: number;
    }>('SELECT id, email, display_name, is_admin, created_at, updated_at FROM auth.users WHERE id = $1', [id]);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  async getUserByEmail(email: string): Promise<User | null> {
    const row = await this.queryOne<{
      id: string; email: string; display_name: string; is_admin: boolean;
      created_at: number; updated_at: number;
    }>('SELECT id, email, display_name, is_admin, created_at, updated_at FROM auth.users WHERE email = $1', [email]);
    if (!row) return null;
    return {
      id: row.id,
      email: row.email,
      displayName: row.display_name,
      isAdmin: row.is_admin,
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
    };
  }

  async listUsers(): Promise<User[]> {
    const rows = await this.queryMany<{
      id: string; email: string; display_name: string; is_admin: boolean;
      created_at: number; updated_at: number;
    }>('SELECT id, email, display_name, is_admin, created_at, updated_at FROM auth.users ORDER BY created_at ASC');
    return rows.map((r) => ({
      id: r.id,
      email: r.email,
      displayName: r.display_name,
      isAdmin: r.is_admin,
      createdAt: Number(r.created_at),
      updatedAt: Number(r.updated_at),
    }));
  }

  async updateUser(id: string, data: UserUpdate): Promise<User | null> {
    const updates: string[] = [];
    const values: unknown[] = [];
    let idx = 1;

    if (data.email !== undefined) { updates.push(`email = $${idx++}`); values.push(data.email); }
    if (data.displayName !== undefined) { updates.push(`display_name = $${idx++}`); values.push(data.displayName); }
    if (data.hashedPassword !== undefined) { updates.push(`hashed_password = $${idx++}`); values.push(data.hashedPassword); }
    if (data.isAdmin !== undefined) { updates.push(`is_admin = $${idx++}`); values.push(data.isAdmin); }

    if (updates.length === 0) return this.getUserById(id);

    updates.push(`updated_at = $${idx++}`);
    values.push(Date.now());
    values.push(id);

    await this.execute(
      `UPDATE auth.users SET ${updates.join(', ')} WHERE id = $${idx}`,
      values
    );
    return this.getUserById(id);
  }

  async deleteUser(id: string): Promise<boolean> {
    const count = await this.execute('DELETE FROM auth.users WHERE id = $1 AND id != $2', [id, 'admin']);
    return count > 0;
  }
}
