/**
 * OAuthTokenStorage — PostgreSQL-backed store for OAuth2 access/refresh tokens.
 *
 * Tokens are encrypted at rest using AES-256-GCM. The encrypted values are
 * stored in `access_token_enc` / `refresh_token_enc` columns. The plaintext
 * `access_token` / `refresh_token` columns are set to a redacted sentinel
 * so existing queries that SELECT * don't break.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { uuidv7 } from '../utils/crypto.js';
import { encryptToken, decryptToken, currentKeyId } from '../security/token-encryption.js';

const REDACTED = '[encrypted]';

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
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  token_enc_key_id: string | null;
  scopes: string;
  expires_at: string | null;
  created_at: string;
  updated_at: string;
}

function rowToToken(row: OAuthTokenRow): OAuthToken {
  // Prefer encrypted columns; fall back to plaintext for pre-migration rows
  let accessToken: string;
  let refreshToken: string | null;

  if (row.access_token_enc && row.token_enc_key_id) {
    accessToken = decryptToken(row.access_token_enc) ?? '';
    refreshToken = decryptToken(row.refresh_token_enc);
  } else {
    accessToken = row.access_token;
    refreshToken = row.refresh_token;
  }

  return {
    id: row.id,
    provider: row.provider,
    email: row.email,
    userId: row.user_id,
    accessToken,
    refreshToken,
    scopes: row.scopes,
    expiresAt: row.expires_at !== null ? Number(row.expires_at) : null,
    createdAt: Number(row.created_at),
    updatedAt: Number(row.updated_at),
  };
}

export class OAuthTokenStorage extends PgBaseStorage {
  /**
   * Upsert a token record — inserts on first call, updates access/refresh tokens
   * on subsequent calls for the same (provider, email). Tokens are encrypted at rest.
   */
  async upsertToken(data: OAuthTokenCreate): Promise<OAuthToken> {
    const pool = this.getPool();
    const now = Date.now();

    const accessEnc = encryptToken(data.accessToken);
    const refreshEnc = encryptToken(data.refreshToken ?? null);
    const keyId = currentKeyId();

    const result = await pool.query<OAuthTokenRow>(
      `INSERT INTO oauth_tokens
         (id, provider, email, user_id, access_token, refresh_token,
          access_token_enc, refresh_token_enc, token_enc_key_id,
          scopes, expires_at, created_at, updated_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $12)
       ON CONFLICT (provider, email) DO UPDATE SET
         user_id           = EXCLUDED.user_id,
         access_token      = EXCLUDED.access_token,
         refresh_token     = COALESCE(EXCLUDED.refresh_token, oauth_tokens.refresh_token),
         access_token_enc  = EXCLUDED.access_token_enc,
         refresh_token_enc = COALESCE(EXCLUDED.refresh_token_enc, oauth_tokens.refresh_token_enc),
         token_enc_key_id  = EXCLUDED.token_enc_key_id,
         scopes            = EXCLUDED.scopes,
         expires_at        = EXCLUDED.expires_at,
         updated_at        = EXCLUDED.updated_at
       RETURNING *`,
      [
        uuidv7(),
        data.provider,
        data.email,
        data.userId,
        REDACTED, // plaintext column gets sentinel
        data.refreshToken ? REDACTED : null,
        accessEnc,
        refreshEnc,
        keyId,
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
    const result = await pool.query<OAuthTokenRow>('SELECT * FROM oauth_tokens WHERE id = $1', [
      id,
    ]);
    return result.rows[0] ? rowToToken(result.rows[0]) : null;
  }

  /** List all stored tokens (admin view — omits raw access/refresh token values). */
  async listTokens(): Promise<Omit<OAuthToken, 'accessToken' | 'refreshToken'>[]> {
    const pool = this.getPool();
    const result = await pool.query<OAuthTokenRow>(
      'SELECT * FROM oauth_tokens ORDER BY created_at DESC LIMIT 1000'
    );
    return result.rows.map((row) => {
      const { accessToken: _a, refreshToken: _r, ...rest } = rowToToken(row);
      return rest;
    });
  }

  /** Update just the access token and its expiry (called after a token refresh). */
  async updateAccessToken(id: string, accessToken: string, expiresAt: number): Promise<void> {
    const pool = this.getPool();
    const accessEnc = encryptToken(accessToken);
    const keyId = currentKeyId();
    await pool.query(
      `UPDATE oauth_tokens
       SET access_token = $1, access_token_enc = $2, token_enc_key_id = $3,
           expires_at = $4, updated_at = $5
       WHERE id = $6`,
      [REDACTED, accessEnc, keyId, expiresAt, Date.now(), id]
    );
  }

  /** Delete a token record (revoke). */
  async deleteToken(id: string): Promise<boolean> {
    const pool = this.getPool();
    const result = await pool.query('DELETE FROM oauth_tokens WHERE id = $1 RETURNING id', [id]);
    return result.rowCount !== null && result.rowCount > 0;
  }
}
