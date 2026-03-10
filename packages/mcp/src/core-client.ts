/**
 * CoreApiClient — typed HTTP client wrapping fetch() to call core REST API.
 *
 * When the coreUrl is HTTPS and NODE_ENV=development (or NODE_TLS_REJECT_UNAUTHORIZED=0),
 * a custom undici Agent with rejectUnauthorized=false is used so MCP can reach the core
 * gateway even when the TLS cert is issued for a public hostname (e.g. dev.example.com)
 * rather than the Docker service name ('core').  In production, full TLS verification
 * is always enforced.
 */
import { Agent } from 'undici';
import { mintServiceToken } from './auth/service-token.js';

export interface CoreApiClientOptions {
  coreUrl: string;
  coreToken: string;
  /** Token secret for automatic token refresh. If provided, enables auto-refresh. */
  tokenSecret?: string;
}

/** Minimum remaining TTL before we proactively refresh the service token (5 minutes). */
const TOKEN_REFRESH_THRESHOLD_MS = 5 * 60 * 1000;

export class CoreApiClient {
  private readonly baseUrl: string;
  private token: string;
  private readonly tokenSecret: string | undefined;
  private tokenExpiresAt = 0;
  /** Undici agent used only for internal MCP→core requests over HTTPS. */

  private readonly dispatcher: any;

  constructor(opts: CoreApiClientOptions) {
    this.baseUrl = opts.coreUrl.replace(/\/+$/, '');
    this.token = opts.coreToken;
    this.tokenSecret = opts.tokenSecret;

    // Parse the JWT to extract expiry (no verification — we minted it ourselves)
    try {
      const payloadB64 = opts.coreToken.split('.')[1];
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp) this.tokenExpiresAt = payload.exp * 1000;
      }
    } catch {
      // If we can't parse, leave expiresAt at 0 — refresh will be attempted on next call
    }

    // Only disable TLS verification in development environments.
    // In production, full certificate verification is always enforced.
    const skipTlsVerify =
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_ENV === 'development';
    this.dispatcher = this.baseUrl.startsWith('https://')
      ? new Agent({ connect: { rejectUnauthorized: !skipTlsVerify } })
      : undefined;
  }

  /**
   * Refresh the service token if it is close to expiry.
   * Returns immediately if no tokenSecret is configured or the token is still fresh.
   */
  async refreshTokenIfNeeded(): Promise<void> {
    if (!this.tokenSecret) return;
    const remaining = this.tokenExpiresAt - Date.now();
    if (remaining > TOKEN_REFRESH_THRESHOLD_MS) return;

    const newToken = await mintServiceToken(this.tokenSecret);
    this.token = newToken;

    // Update expiry from the new token
    try {
      const payloadB64 = newToken.split('.')[1];
      if (payloadB64) {
        const payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString());
        if (payload.exp) this.tokenExpiresAt = payload.exp * 1000;
      }
    } catch {
      // best-effort
    }
  }

  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
    await this.refreshTokenIfNeeded();
    const url = this.buildUrl(path, query);
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
      dispatcher: this.dispatcher,
    });
    return this.handleResponse<T>(res);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    await this.refreshTokenIfNeeded();
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      dispatcher: this.dispatcher,
    });
    return this.handleResponse<T>(res);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    await this.refreshTokenIfNeeded();
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(15_000),
      dispatcher: this.dispatcher,
    });
    return this.handleResponse<T>(res);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    await this.refreshTokenIfNeeded();
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
      signal: AbortSignal.timeout(15_000),
      dispatcher: this.dispatcher,
    });
    return this.handleResponse<T>(res);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
        dispatcher: this.dispatcher,
      });
      return res.ok;
    } catch {
      return false;
    }
  }

  private buildUrl(path: string, query?: Record<string, string>): string {
    const url = new URL(`${this.baseUrl}${path}`);
    if (query) {
      for (const [k, v] of Object.entries(query)) {
        if (v !== undefined && v !== '') url.searchParams.set(k, v);
      }
    }
    return url.toString();
  }

  private headers(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.token}`,
      'Content-Type': 'application/json',
    };
  }

  private async handleResponse<T>(res: Response): Promise<T> {
    if (!res.ok) {
      const text = await res.text().catch(() => 'Unknown error');
      throw new CoreApiError(res.status, text);
    }
    return res.json() as Promise<T>;
  }
}

export class CoreApiError extends Error {
  constructor(
    public readonly statusCode: number,
    public readonly body: string
  ) {
    super(`Core API error ${statusCode}: ${body}`);
    this.name = 'CoreApiError';
  }
}
