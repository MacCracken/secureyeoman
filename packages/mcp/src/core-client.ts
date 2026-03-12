/**
 * CoreApiClient — typed HTTP client wrapping fetch() to call core REST API.
 *
 * Authenticates via x-api-key header using an auto-provisioned service API key.
 *
 * When the coreUrl is HTTPS and NODE_ENV=development (or NODE_TLS_REJECT_UNAUTHORIZED=0),
 * a custom undici Agent with rejectUnauthorized=false is used so MCP can reach the core
 * gateway even when the TLS cert is issued for a public hostname (e.g. dev.example.com)
 * rather than the Docker service name ('core').  In production, full TLS verification
 * is always enforced.
 */
import { Agent } from 'undici';

export interface CoreApiClientOptions {
  coreUrl: string;
  /** Service API key (sck_...) for x-api-key auth. */
  apiKey: string;
}

export class CoreApiClient {
  private readonly baseUrl: string;
  private readonly apiKey: string;
  /** Undici agent used only for internal MCP→core requests over HTTPS. */
  private readonly dispatcher: any;

  constructor(opts: CoreApiClientOptions) {
    this.baseUrl = opts.coreUrl.replace(/\/+$/, '');
    this.apiKey = opts.apiKey;

    // Only disable TLS verification in development environments.
    // In production, full certificate verification is always enforced.
    const skipTlsVerify =
      process.env.NODE_TLS_REJECT_UNAUTHORIZED === '0' || process.env.NODE_ENV === 'development';
    this.dispatcher = this.baseUrl.startsWith('https://')
      ? new Agent({ connect: { rejectUnauthorized: !skipTlsVerify } })
      : undefined;
  }

  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
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
      'x-api-key': this.apiKey,
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
