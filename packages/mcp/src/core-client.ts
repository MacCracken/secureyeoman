/**
 * CoreApiClient — typed HTTP client wrapping fetch() to call core REST API.
 */

export interface CoreApiClientOptions {
  coreUrl: string;
  coreToken: string;
}

export class CoreApiClient {
  private readonly baseUrl: string;
  private readonly token: string;

  constructor(opts: CoreApiClientOptions) {
    this.baseUrl = opts.coreUrl.replace(/\/+$/, '');
    this.token = opts.coreToken;
  }

  async get<T = unknown>(path: string, query?: Record<string, string>): Promise<T> {
    const url = this.buildUrl(path, query);
    const res = await fetch(url, {
      method: 'GET',
      headers: this.headers(),
    });
    return this.handleResponse<T>(res);
  }

  async post<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'POST',
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async put<T = unknown>(path: string, body?: unknown): Promise<T> {
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'PUT',
      headers: this.headers(),
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return this.handleResponse<T>(res);
  }

  async delete<T = unknown>(path: string): Promise<T> {
    const url = this.buildUrl(path);
    const res = await fetch(url, {
      method: 'DELETE',
      headers: this.headers(),
    });
    return this.handleResponse<T>(res);
  }

  async healthCheck(): Promise<boolean> {
    try {
      const res = await fetch(`${this.baseUrl}/health`, {
        method: 'GET',
        headers: this.headers(),
        signal: AbortSignal.timeout(5000),
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
