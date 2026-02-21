/**
 * OAuthTokenService — Token lifecycle management for OAuth2 providers.
 *
 * Wraps OAuthTokenStorage to add automatic token refresh: if a stored
 * token is within 5 minutes of expiry, the service uses the refresh token
 * to obtain a new access token before returning it.
 *
 * Currently supports Google's token endpoint (covers Calendar, Drive, Gmail).
 * Extend the refreshToken() method for other provider endpoints as needed.
 */

import type { OAuthTokenStorage, OAuthToken } from './oauth-token-storage.js';
import type { SecureLogger } from '../logging/logger.js';

const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
const REFRESH_BUFFER_MS = 5 * 60 * 1000; // refresh 5 minutes before expiry

export interface GoogleClientCredentials {
  clientId: string;
  clientSecret: string;
}

export interface OAuthTokenServiceDeps {
  storage: OAuthTokenStorage;
  logger: SecureLogger;
  /** Google OAuth2 client credentials (used for Calendar, Drive, Gmail refresh). */
  googleCredentials?: GoogleClientCredentials;
}

export class OAuthTokenService {
  private readonly storage: OAuthTokenStorage;
  private readonly logger: SecureLogger;
  private readonly googleCredentials?: GoogleClientCredentials;

  constructor(deps: OAuthTokenServiceDeps) {
    this.storage = deps.storage;
    this.logger = deps.logger;
    this.googleCredentials = deps.googleCredentials;
  }

  // ── Public API ──────────────────────────────────────────────

  /**
   * Store or update an OAuth token for a (provider, email) pair.
   * Call this from the OAuth callback handler after code exchange.
   */
  async storeToken(opts: {
    provider: string;
    email: string;
    userId: string;
    accessToken: string;
    refreshToken?: string;
    scopes?: string;
    expiresIn?: number; // seconds until expiry
  }): Promise<OAuthToken> {
    return this.storage.upsertToken({
      provider: opts.provider,
      email: opts.email,
      userId: opts.userId,
      accessToken: opts.accessToken,
      refreshToken: opts.refreshToken,
      scopes: opts.scopes ?? '',
      expiresAt: opts.expiresIn ? Date.now() + opts.expiresIn * 1000 : undefined,
    });
  }

  /**
   * Get a valid (non-expired) access token for (provider, email).
   * Automatically refreshes the token if it is near expiry.
   *
   * Returns null if no token is stored for the pair.
   */
  async getValidToken(provider: string, email: string): Promise<string | null> {
    const record = await this.storage.getByEmail(provider, email);
    if (!record) return null;

    if (this.needsRefresh(record)) {
      return this.refreshAndStore(record);
    }

    return record.accessToken;
  }

  /** List all stored tokens (omits raw token values — safe for API responses). */
  async listTokens() {
    return this.storage.listTokens();
  }

  /** Revoke (delete) a stored token by ID. */
  async revokeToken(id: string): Promise<boolean> {
    return this.storage.deleteToken(id);
  }

  // ── Private helpers ─────────────────────────────────────────

  private needsRefresh(record: OAuthToken): boolean {
    if (record.expiresAt === null) return false; // no expiry — never refresh
    return Date.now() >= record.expiresAt - REFRESH_BUFFER_MS;
  }

  private async refreshAndStore(record: OAuthToken): Promise<string | null> {
    if (!record.refreshToken) {
      this.logger.warn('OAuth token expired but no refresh token available', {
        provider: record.provider,
        email: record.email,
      });
      return record.accessToken; // return stale token; caller must handle 401
    }

    const creds = this.getCredentials(record.provider);
    if (!creds) {
      this.logger.warn('Cannot refresh OAuth token: no client credentials configured', {
        provider: record.provider,
      });
      return record.accessToken;
    }

    try {
      const resp = await fetch(GOOGLE_TOKEN_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: creds.clientId,
          client_secret: creds.clientSecret,
          refresh_token: record.refreshToken,
          grant_type: 'refresh_token',
        }),
      });

      if (!resp.ok) {
        const err = await resp.text();
        this.logger.warn('OAuth token refresh failed', { provider: record.provider, error: err });
        return record.accessToken;
      }

      const data = (await resp.json()) as { access_token: string; expires_in: number };
      const newAccessToken = data.access_token;
      const expiresAt = Date.now() + data.expires_in * 1000;

      await this.storage.updateAccessToken(record.id, newAccessToken, expiresAt);
      this.logger.debug('OAuth token refreshed', {
        provider: record.provider,
        email: record.email,
      });
      return newAccessToken;
    } catch (err) {
      this.logger.error('OAuth token refresh error', {
        provider: record.provider,
        error: err instanceof Error ? err.message : String(err),
      });
      return record.accessToken;
    }
  }

  /** Returns Google credentials for any google-* provider. */
  private getCredentials(provider: string): GoogleClientCredentials | undefined {
    if (provider === 'googlecalendar' || provider === 'googledrive' || provider === 'gmail') {
      return this.googleCredentials;
    }
    return undefined;
  }
}
