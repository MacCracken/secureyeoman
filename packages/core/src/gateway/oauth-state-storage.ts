/**
 * OAuthStateStorage — PostgreSQL-backed store for OAuth state, pending tokens,
 * and pending user info. Replaces the in-memory Maps that were lost on restart
 * and broken in multi-replica deployments.
 */

import { PgBaseStorage } from '../storage/pg-base.js';
import { encryptToken, decryptToken, currentKeyId } from '../security/token-encryption.js';

// ── OAuth State ───────────────────────────────────────────────────────────

export interface OAuthStateRecord {
  state: string;
  provider: string;
  redirectUri: string;
  codeVerifier?: string;
  frontendOrigin?: string;
  createdAt: number;
  expiresAt: number;
}

// ── Pending OAuth Tokens ──────────────────────────────────────────────────

export interface PendingOAuthTokenRecord {
  connectionToken: string;
  provider: string;
  accessToken: string;
  refreshToken: string;
  email: string;
  userInfoName?: string;
  createdAt: number;
  expiresAt: number;
}

// ── Row types ─────────────────────────────────────────────────────────────

interface OAuthStateRow {
  state: string;
  provider: string;
  redirect_uri: string;
  code_verifier: string | null;
  frontend_origin: string | null;
  created_at: string;
  expires_at: string;
}

interface PendingTokenRow {
  connection_token: string;
  provider: string;
  access_token_enc: Buffer | null;
  refresh_token_enc: Buffer | null;
  email: string;
  user_info_name: string | null;
  token_enc_key_id: string | null;
  created_at: string;
  expires_at: string;
}

export class OAuthStateStorage extends PgBaseStorage {
  // ── OAuth State CRUD ──────────────────────────────────────────────────

  async saveState(record: OAuthStateRecord): Promise<void> {
    await this.execute(
      `INSERT INTO auth.oauth_state (state, provider, redirect_uri, code_verifier, frontend_origin, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7)
       ON CONFLICT (state) DO UPDATE SET
         provider = EXCLUDED.provider,
         redirect_uri = EXCLUDED.redirect_uri,
         code_verifier = EXCLUDED.code_verifier,
         frontend_origin = EXCLUDED.frontend_origin,
         created_at = EXCLUDED.created_at,
         expires_at = EXCLUDED.expires_at`,
      [
        record.state,
        record.provider,
        record.redirectUri,
        record.codeVerifier ?? null,
        record.frontendOrigin ?? null,
        record.createdAt,
        record.expiresAt,
      ]
    );
  }

  /** Consume a state record — returns it and deletes atomically. Returns null if expired/missing. */
  async consumeState(state: string): Promise<OAuthStateRecord | null> {
    const row = await this.queryOne<OAuthStateRow>(
      `DELETE FROM auth.oauth_state WHERE state = $1 AND expires_at > $2 RETURNING *`,
      [state, Date.now()]
    );
    if (!row) return null;
    return {
      state: row.state,
      provider: row.provider,
      redirectUri: row.redirect_uri,
      codeVerifier: row.code_verifier ?? undefined,
      frontendOrigin: row.frontend_origin ?? undefined,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    };
  }

  /** Clean up expired state records. */
  async cleanupExpiredStates(): Promise<number> {
    return this.execute('DELETE FROM auth.oauth_state WHERE expires_at < $1', [Date.now()]);
  }

  // ── Pending OAuth Tokens CRUD ─────────────────────────────────────────

  async savePendingTokens(record: PendingOAuthTokenRecord): Promise<void> {
    const accessEnc = encryptToken(record.accessToken);
    const refreshEnc = encryptToken(record.refreshToken);
    const keyId = currentKeyId();
    await this.execute(
      `INSERT INTO auth.pending_oauth_tokens
         (connection_token, provider, access_token_enc, refresh_token_enc, email, user_info_name, token_enc_key_id, created_at, expires_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (connection_token) DO UPDATE SET
         provider = EXCLUDED.provider,
         access_token_enc = EXCLUDED.access_token_enc,
         refresh_token_enc = EXCLUDED.refresh_token_enc,
         email = EXCLUDED.email,
         user_info_name = EXCLUDED.user_info_name,
         token_enc_key_id = EXCLUDED.token_enc_key_id,
         created_at = EXCLUDED.created_at,
         expires_at = EXCLUDED.expires_at`,
      [
        record.connectionToken,
        record.provider,
        accessEnc,
        refreshEnc,
        record.email,
        record.userInfoName ?? null,
        keyId,
        record.createdAt,
        record.expiresAt,
      ]
    );
  }

  /** Consume pending tokens — returns and deletes atomically. Returns null if expired/missing. */
  async consumePendingTokens(connectionToken: string): Promise<PendingOAuthTokenRecord | null> {
    const row = await this.queryOne<PendingTokenRow>(
      `DELETE FROM auth.pending_oauth_tokens WHERE connection_token = $1 AND expires_at > $2 RETURNING *`,
      [connectionToken, Date.now()]
    );
    if (!row) return null;
    return {
      connectionToken: row.connection_token,
      provider: row.provider,
      accessToken: decryptToken(row.access_token_enc) ?? '',
      refreshToken: decryptToken(row.refresh_token_enc) ?? '',
      email: row.email,
      userInfoName: row.user_info_name ?? undefined,
      createdAt: Number(row.created_at),
      expiresAt: Number(row.expires_at),
    };
  }

  /** Clean up expired pending tokens. */
  async cleanupExpiredPendingTokens(): Promise<number> {
    return this.execute('DELETE FROM auth.pending_oauth_tokens WHERE expires_at < $1', [
      Date.now(),
    ]);
  }
}
