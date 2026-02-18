/**
 * OAuthTokenStorage — PostgreSQL-backed store for OAuth2 access/refresh tokens.
 *
 * Tokens are persisted so they survive process restarts.  A single record
 * exists per (provider, email) pair; upsertToken keeps it up-to-date.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';

export interface OAuthToken {
  id: string;
  provider: string;
  email: string;
  userId: string;
  accessToken: string;
  refreshToken: string | null;
  scopes: string;
  expiresAt: number | null;
  createdAt: number;
  updatedAt: number;
}

export interface OAuthTokenCreate {
  provider: string;
  email: string;
  userId: string;
  accessToken: string;
  refreshToken?: string;
  scopes?: string;
  expiresAt?: number;
}

// ─── Row type ────────────────────────────────────────────────

interface OAuthTokenRow {
  id: string;
  provider: string;
  email: string;
  user_id: string;
  access_token: string;
  refresh_token: string | null;
  scopes: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToToken(row: OAuthTokenRow): OAuthToken {
  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    userId: row.user_id,
    accessToken: row.access_token,
    refreshToken: row.refresh_token,
    scopes: row.scopes,
    expiresAt: row.expires_at !== null ? Number(row.expires_at) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class OAuthTokenStorage extends PgBaseStorage {
  /**
   * Upsert a token record — inserts on first call, updates access/refresh tokens
   * on subsequent calls for the same (provider, email).
   */
  async upsertToken(data: OAuthTokenCreate): Promise<OAuthToken> {
    const pool = this.getPool();
    const now = Date.now();

    const result = await pool.query<OAuthTokenRow>(
      `INSERT INTO oauth_tokens
         (id, provider, email, user_id, access_token, refresh_token, scopes, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
       ON CONFLICT (provider, email) DO UPDATE SET
         user_id       = EXCLUDED.user_id,
         access_token  = EXCLUDED.access_token,
         refresh_token = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
         scopes        = EXCLUDED.scopes,
         expires_at    = EXCLUDED.expires_at,
         updated_at    = EXCLUDED.updated_at
       RETURNING *`,
      [
        uuidv7(),
        data.provider,
        data.email,
        data.userId,
        data.accessToken,
        data.refreshToken ?? null,
        data.scopes ?? '',
        data.expiresAt ?? null,
        now,
      ]
    );

    return rowToToken(result.rows[0]!);
  }

  /** Find a token by provider + email (primary lookup). */
  async getByEmail(provider: string, email: string): Promise<OAuthToken | null> {
    const pool = this.getPool();
    const result = await pool.query<OAuthTokenRow>(
      'SELECT * FROM oauth_tokens WHERE provider = $1 AND email = $2',
      [provider, email]
    );
    return result.rows[0] ? rowToToken(result.rows[0]) : null;
  }

  /** Find a token by its primary key ID. */
  async getById(id: string): Promise<OAuthToken | null> {
    const pool = this.getPool();
    const result = await pool.query<OAuthTokenRow>(
      'SELECT * FROM oauth_tokens WHERE id = $1',
      [id]
    );
    return result.rows[0] ? rowToToken(result.rows[0]) : null;
  }

  /** List all stored tokens (admin view — omits raw access/refresh token values). */
  async listTokens(): Promise<Omit<OAuthToken, 'accessToken' | 'refreshToken'>[]> {
    const pool = this.getPool();
    const result = await pool.query<OAuthTokenRow>(
      'SELECT * FROM oauth_tokens ORDER BY created_at DESC'
    );
    return result.rows.map((row) => {
      const { accessToken: _a, refreshToken: _r, ...rest } = rowToToken(row);
      return rest;
    });
  }

  /** Update just the access token and its expiry (called after a token refresh). */
  async updateAccessToken(id: string, accessToken: string, expiresAt: number): Promise<void> {
    const pool = this.getPool();
    await pool.query(
      'UPDATE oauth_tokens SET access_token = $1, expires_at = $2, updated_at = $3 WHERE id = $4',
      [accessToken, expiresAt, Date.now(), id]
    );
  }

  /** Delete a token record (revoke). */
  async deleteToken(id: string): Promise<boolean> {
    const pool = this.getPool();
    const result = await pool.query('DELETE FROM oauth_tokens WHERE id = $1 RETURNING id', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}
