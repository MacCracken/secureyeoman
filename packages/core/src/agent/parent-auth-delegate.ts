/**
 * Parent Auth Delegate — Validates tokens against a parent SY instance.
 *
 * Agent mode delegates authentication to its parent SY instance. Incoming
 * requests carry a bearer token which is validated via the parent's
 * `POST /api/v1/auth/validate` endpoint. Valid results are cached locally
 * with a 5-minute TTL to avoid per-request latency.
 */

import type { SecureLogger } from '../logging/logger.js';

export interface ParentAuthDelegateConfig {
  /** Parent SY instance URL (e.g. http://parent:18789) */
  parentUrl: string;
  /** Registration token for agent→parent auth (Bearer header) */
  registrationToken?: string;
  /** Cache TTL in milliseconds. Default: 300_000 (5 min) */
  cacheTtlMs?: number;
  /** Max cached entries before LRU eviction. Default: 500 */
  maxCacheSize?: number;
  /** Timeout for parent validation requests in ms. Default: 5_000 */
  timeoutMs?: number;
}

export interface ValidatedIdentity {
  userId: string;
  role: string;
  tenantId?: string;
  expiresAt: number;
}

interface CacheEntry {
  identity: ValidatedIdentity;
  cachedAt: number;
}

const DEFAULT_TTL_MS = 300_000; // 5 minutes
const DEFAULT_MAX_CACHE = 500;
const DEFAULT_TIMEOUT_MS = 5_000;

export class ParentAuthDelegate {
  private readonly parentUrl: string;
  private readonly registrationToken?: string;
  private readonly cacheTtlMs: number;
  private readonly maxCacheSize: number;
  private readonly timeoutMs: number;
  private readonly logger?: SecureLogger;

  /** Token → validated identity cache */
  private readonly cache = new Map<string, CacheEntry>();

  constructor(config: ParentAuthDelegateConfig, logger?: SecureLogger) {
    this.parentUrl = config.parentUrl.replace(/\/$/, '');
    this.registrationToken = config.registrationToken;
    this.cacheTtlMs = config.cacheTtlMs ?? DEFAULT_TTL_MS;
    this.maxCacheSize = config.maxCacheSize ?? DEFAULT_MAX_CACHE;
    this.timeoutMs = config.timeoutMs ?? DEFAULT_TIMEOUT_MS;
    this.logger = logger?.child({ component: 'parent-auth-delegate' });
  }

  /**
   * Validate a bearer token against the parent SY instance.
   * Returns the validated identity or null if invalid/expired.
   */
  async validateToken(token: string): Promise<ValidatedIdentity | null> {
    // Check cache first
    const cached = this.cache.get(token);
    if (cached) {
      if (Date.now() - cached.cachedAt < this.cacheTtlMs) {
        return cached.identity;
      }
      // Expired — remove
      this.cache.delete(token);
    }

    // Validate against parent
    try {
      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };
      // If we have a registration token, add it as a secondary header
      // so the parent knows this is a trusted agent request
      if (this.registrationToken) {
        headers['X-Agent-Token'] = this.registrationToken;
      }

      const response = await fetch(`${this.parentUrl}/api/v1/auth/validate`, {
        method: 'POST',
        headers,
        body: JSON.stringify({}),
        signal: AbortSignal.timeout(this.timeoutMs),
      });

      if (!response.ok) {
        this.logger?.debug({ status: response.status }, 'Token validation rejected by parent');
        return null;
      }

      const data = (await response.json()) as {
        valid?: boolean;
        userId?: string;
        role?: string;
        tenantId?: string;
        expiresAt?: number;
      };

      if (!data.valid || !data.userId) {
        return null;
      }

      const identity: ValidatedIdentity = {
        userId: data.userId,
        role: data.role ?? 'role_viewer',
        tenantId: data.tenantId,
        expiresAt: data.expiresAt ?? Date.now() + this.cacheTtlMs,
      };

      // Cache the result
      this.cacheIdentity(token, identity);

      this.logger?.debug(
        { userId: identity.userId, role: identity.role },
        'Token validated via parent'
      );
      return identity;
    } catch (err) {
      this.logger?.warn(
        { error: err instanceof Error ? err.message : String(err) },
        'Failed to validate token with parent'
      );
      return null;
    }
  }

  /** Invalidate a cached token (e.g. on logout or error) */
  invalidate(token: string): void {
    this.cache.delete(token);
  }

  /** Clear all cached tokens */
  clearCache(): void {
    this.cache.clear();
  }

  /** Number of currently cached tokens */
  get cacheSize(): number {
    return this.cache.size;
  }

  private cacheIdentity(token: string, identity: ValidatedIdentity): void {
    // Simple LRU eviction: delete oldest entry when at capacity
    if (this.cache.size >= this.maxCacheSize) {
      const oldest = this.cache.keys().next().value;
      if (oldest !== undefined) {
        this.cache.delete(oldest);
      }
    }
    this.cache.set(token, { identity, cachedAt: Date.now() });
  }
}
