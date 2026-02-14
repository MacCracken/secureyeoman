/**
 * ProxyAuth — delegates JWT validation to core's /api/v1/auth/verify endpoint.
 */

import type { CoreApiClient } from '../core-client.js';

export interface AuthResult {
  valid: boolean;
  userId?: string;
  role?: string;
  permissions?: string[];
}

export class ProxyAuth {
  private readonly client: CoreApiClient;
  private readonly cache = new Map<string, { result: AuthResult; expiresAt: number }>();
  private readonly cacheTtlMs: number;

  constructor(client: CoreApiClient, cacheTtlMs = 30_000) {
    this.client = client;
    this.cacheTtlMs = cacheTtlMs;
  }

  async verify(token: string): Promise<AuthResult> {
    if (!token) {
      return { valid: false };
    }

    // Check cache
    const cached = this.cache.get(token);
    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    try {
      const result = await this.client.post<AuthResult>('/api/v1/auth/verify', { token });

      // Cache successful validations
      if (result.valid) {
        this.cache.set(token, {
          result,
          expiresAt: Date.now() + this.cacheTtlMs,
        });
      }

      return result;
    } catch {
      return { valid: false };
    }
  }

  extractToken(authHeader: string | undefined): string | undefined {
    if (!authHeader) return undefined;
    if (authHeader.startsWith('Bearer ')) {
      return authHeader.slice(7);
    }
    return undefined;
  }

  clearCache(): void {
    this.cache.clear();
  }
}
