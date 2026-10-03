/**
 * ProxyAuth — delegates JWT validation to core's /api/v1/auth/verify endpoint.
 *
 * Every verification also asks core whether the principal may execute MCP
 * tools (`mcp:execute`, under core's RBAC: the role, then the token's scope),
 * so a valid token alone — a viewer's dashboard session, say — cannot run
 * tools.
 */

import type { CoreApiClient } from '../core-client.js';

export interface AuthResult {
  valid: boolean;
  /** Whether the principal holds `mcp:execute` (core's answer). */
  authorized?: boolean;
  userId?: string;
  role?: string;
  permissions?: string[];
}

/** The permission tool execution requires. */
export const TOOL_EXECUTE_PERMISSION = { resource: 'mcp', action: 'execute' } as const;

/** Whether a verification result permits running tools. */
export function canExecuteTools(result: AuthResult): boolean {
  return result.valid && result.authorized === true;
}

export class ProxyAuth {
  private static readonly MAX_CACHE_SIZE = 10_000;
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
      const result = await this.client.post<AuthResult>('/api/v1/auth/verify', {
        token,
        ...TOOL_EXECUTE_PERMISSION,
      });

      // Cache successful validations
      if (result.valid) {
        if (this.cache.size >= ProxyAuth.MAX_CACHE_SIZE) {
          const oldest = this.cache.keys().next().value;
          if (oldest !== undefined) this.cache.delete(oldest);
        }
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
