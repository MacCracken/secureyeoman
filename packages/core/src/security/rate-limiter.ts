/**
 * Rate Limiter for SecureYeoman — backed by majra token bucket.
 *
 * Security considerations:
 * - Per-key token bucket algorithm via majra (lazy refill, no background tasks)
 * - Per-user, per-IP, and global limits
 * - Automatic stale key eviction
 * - Audit logging of rate limit violations
 *
 * SY keeps rule definitions, action policies (reject/delay/log), and the
 * Fastify hook. The underlying rate limiting engine is majra.
 */

import * as majra from '../native/majra.js';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import type { SecurityConfig } from '@secureyeoman/shared';
import { RedisRateLimiter } from './rate-limiter-redis.js';
import { sendError } from '../utils/errors.js';

/** Chainable reply subset for the rate-limit Fastify hook. */
interface RateLimitReply {
  code: (n: number) => RateLimitReply;
  header: (k: string, v: string) => RateLimitReply;
  send: (body: unknown) => void;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  resetAt: number; // Unix timestamp when limit resets
  retryAfter?: number; // Seconds until retry (if blocked)
}

export interface RateLimitRule {
  name: string;
  windowMs: number;
  maxRequests: number;
  keyType: 'ip' | 'user' | 'api_key' | 'global';
  onExceed: 'reject' | 'delay' | 'log_only';
}

/**
 * Common interface for rate limiters (in-memory and Redis-backed).
 * Consumers should type-hint against this instead of the concrete class.
 */
export interface RateLimiterLike {
  addRule(rule: RateLimitRule): void;
  removeRule(name: string): boolean;
  check(
    ruleName: string,
    key: string,
    context?: { userId?: string; ipAddress?: string }
  ): RateLimitResult | Promise<RateLimitResult>;
  stop(): void | Promise<void>;
  getStats(): { totalHits: number; totalChecks: number };
}

/**
 * Token bucket rate limiter backed by majra.
 */
export class RateLimiter {
  private readonly rules = new Map<string, RateLimitRule>();
  private readonly defaultRule: RateLimitRule;
  private readonly usageCounters = new Map<string, { count: number; windowStart: number }>();
  private logger: SecureLogger | null = null;
  private cleanupInterval: NodeJS.Timeout | null = null;

  private totalHits = 0;
  private totalChecks = 0;

  constructor(config: SecurityConfig['rateLimiting']) {
    this.defaultRule = {
      name: 'default',
      windowMs: config.defaultWindowMs,
      maxRequests: config.defaultMaxRequests,
      keyType: 'global',
      onExceed: 'reject',
    };

    // Register default rule in majra
    majra.ratelimitRegister('default', config.defaultWindowMs, config.defaultMaxRequests);

    // Start stale key eviction (every minute)
    this.startCleanup();
  }

  private getLogger(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'RateLimiter' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /**
   * Add a custom rate limit rule
   */
  addRule(rule: RateLimitRule): void {
    this.rules.set(rule.name, rule);
    majra.ratelimitRegister(rule.name, rule.windowMs, rule.maxRequests);
    this.getLogger().debug({ ruleName: rule.name }, 'Rate limit rule added');
  }

  /**
   * Remove a rate limit rule
   */
  removeRule(name: string): boolean {
    majra.ratelimitRemove(name);
    return this.rules.delete(name);
  }

  /**
   * Check if a request is allowed under rate limits
   */
  check(
    ruleName: string,
    key: string,
    context?: { userId?: string; ipAddress?: string }
  ): RateLimitResult {
    const rule = this.rules.get(ruleName) ?? this.defaultRule;
    const windowKey = this.buildWindowKey(rule.keyType, key);

    this.totalChecks++;

    const result = majra.ratelimitCheck(rule.name, windowKey);

    // Track usage for getUsage() and getStats()
    const counterKey = `${rule.name}:${windowKey}`;
    const now = Date.now();
    let counter = this.usageCounters.get(counterKey);
    if (!counter || now - counter.windowStart >= rule.windowMs) {
      counter = { count: 0, windowStart: now };
      this.usageCounters.set(counterKey, counter);
    }
    counter.count++;

    if (result.allowed) {
      const remaining = Math.max(0, rule.maxRequests - counter.count);
      const resetAt = counter.windowStart + rule.windowMs;

      return {
        allowed: true,
        remaining,
        resetAt,
      };
    }

    // Rate limit exceeded
    this.totalHits++;
    const resetAt = counter.windowStart + rule.windowMs;
    const retryAfter = Math.ceil(rule.windowMs / 1000);

    // Log violation
    this.getLogger().warn(
      {
        rule: rule.name,
        key: rule.keyType === 'ip' ? key : '[redacted]',
        keyType: rule.keyType,
        windowMs: rule.windowMs,
        maxRequests: rule.maxRequests,
        userId: context?.userId,
        ipAddress: context?.ipAddress,
      },
      'Rate limit exceeded'
    );

    // Handle based on rule action
    if (rule.onExceed === 'log_only') {
      return {
        allowed: true,
        remaining: 0,
        resetAt,
      };
    }

    return {
      allowed: false,
      remaining: 0,
      resetAt,
      retryAfter,
    };
  }

  /**
   * Check multiple rules at once
   * Returns the most restrictive result
   */
  checkMultiple(
    rules: { name: string; key: string }[],
    context?: { userId?: string; ipAddress?: string }
  ): RateLimitResult {
    let mostRestrictive: RateLimitResult = {
      allowed: true,
      remaining: Infinity,
      resetAt: 0,
    };

    for (const { name, key } of rules) {
      const result = this.check(name, key, context);

      if (!result.allowed) {
        return result; // Immediately return if any rule blocks
      }

      if (result.remaining < mostRestrictive.remaining) {
        mostRestrictive = result;
      }
    }

    return mostRestrictive;
  }

  /**
   * Reset rate limit for a specific key
   */
  reset(ruleName: string, key: string): void {
    const rule = this.rules.get(ruleName) ?? this.defaultRule;
    const windowKey = this.buildWindowKey(rule.keyType, key);
    majra.ratelimitResetKey(rule.name, windowKey);
    this.usageCounters.delete(`${rule.name}:${windowKey}`);
  }

  /**
   * Get current usage for a key
   */
  getUsage(
    ruleName: string,
    key: string
  ): { count: number; limit: number; windowMs: number } | null {
    const rule = this.rules.get(ruleName) ?? this.defaultRule;
    const windowKey = this.buildWindowKey(rule.keyType, key);
    const counterKey = `${rule.name}:${windowKey}`;
    const counter = this.usageCounters.get(counterKey);

    if (!counter) {
      return null;
    }

    // Check if window has expired
    if (Date.now() - counter.windowStart >= rule.windowMs) {
      this.usageCounters.delete(counterKey);
      return null;
    }

    return {
      count: counter.count,
      limit: rule.maxRequests,
      windowMs: rule.windowMs,
    };
  }

  /**
   * Build a unique key for rate limiting
   */
  private buildWindowKey(keyType: string, key: string): string {
    return `${keyType}:${key}`;
  }

  /**
   * Start periodic stale key eviction
   */
  private startCleanup(): void {
    if (this.cleanupInterval) {
      return;
    }

    this.cleanupInterval = setInterval(() => {
      // Evict keys idle for more than 5 minutes
      for (const rule of this.rules.values()) {
        majra.ratelimitEvict(rule.name, rule.windowMs * 2);
      }
      majra.ratelimitEvict('default', this.defaultRule.windowMs * 2);
    }, 60000); // Every minute

    // Don't prevent process exit
    this.cleanupInterval.unref();
  }

  /**
   * Stop the cleanup interval
   */
  stop(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }
  }

  getStats(): {
    activeWindows: number;
    rules: number;
    totalHits: number;
    totalChecks: number;
  } {
    return {
      activeWindows: this.usageCounters.size,
      rules: this.rules.size,
      totalHits: this.totalHits,
      totalChecks: this.totalChecks,
    };
  }

  /**
   * Create a Fastify onRequest hook that enforces rate limits globally.
   */
  createFastifyHook(): (
    request: { url: string; ip: string; headers: Record<string, string | string[] | undefined> },
    reply: {
      code: (n: number) => RateLimitReply;
      header: (k: string, v: string) => RateLimitReply;
      send: (body: unknown) => void;
    },
    done: (err?: Error) => void
  ) => void {
    // Ensure hook-specific rules exist
    const hookRules: RateLimitRule[] = [
      { name: 'global_api', windowMs: 60_000, maxRequests: 100, keyType: 'ip', onExceed: 'reject' },
      {
        name: 'global_terminal',
        windowMs: 60_000,
        maxRequests: 10,
        keyType: 'ip',
        onExceed: 'reject',
      },
      {
        name: 'global_workflow_exec',
        windowMs: 60_000,
        maxRequests: 10,
        keyType: 'ip',
        onExceed: 'reject',
      },
      { name: 'global_auth', windowMs: 60_000, maxRequests: 5, keyType: 'ip', onExceed: 'reject' },
    ];
    for (const rule of hookRules) {
      if (!this.rules.has(rule.name)) this.addRule(rule);
    }

    return (request, reply, done) => {
      const url = request.url;

      // Skip health checks and non-API routes
      if (url === '/api/v1/terminal/health' || url === '/health' || !url.startsWith('/api/')) {
        done();
        return;
      }

      // Skip WebSocket upgrade requests
      if (request.headers.upgrade === 'websocket') {
        done();
        return;
      }

      // Determine which rule to apply
      let ruleName = 'global_api';
      if (url.startsWith('/api/v1/terminal/')) {
        ruleName = 'global_terminal';
      } else if (url.includes('/execute') && url.startsWith('/api/v1/workflow/')) {
        ruleName = 'global_workflow_exec';
      } else if (url.startsWith('/api/v1/auth/')) {
        ruleName = 'global_auth';
      }

      const result = this.check(ruleName, request.ip, { ipAddress: request.ip });

      if (!result.allowed) {
        sendError(reply as any, 429, 'Rate limit exceeded', {
          headers: {
            'Retry-After': String(result.retryAfter ?? 60),
            'X-RateLimit-Remaining': '0',
            'X-RateLimit-Reset': String(result.resetAt),
          },
        });
        return;
      }

      done();
    };
  }
}

/** Common rate limit rules added to any limiter instance. */
const STATIC_RULES: RateLimitRule[] = [
  { name: 'api_requests', windowMs: 60000, maxRequests: 100, keyType: 'user', onExceed: 'reject' },
  { name: 'task_creation', windowMs: 60000, maxRequests: 20, keyType: 'user', onExceed: 'reject' },
  {
    name: 'expensive_operations',
    windowMs: 3600000,
    maxRequests: 10,
    keyType: 'user',
    onExceed: 'reject',
  },
  /** Dedicated limit for chat endpoint — lower ceiling than api_requests. */
  { name: 'chat_requests', windowMs: 60000, maxRequests: 30, keyType: 'user', onExceed: 'reject' },
];

/**
 * Create a rate limiter with common rules.
 *
 * When `config.rateLimiting.redisUrl` is set, returns a Redis-backed
 * `RedisRateLimiter`; otherwise returns the in-memory `RateLimiter`.
 */
export function createRateLimiter(config: SecurityConfig): RateLimiterLike {
  const rl = config.rateLimiting;

  const authRule: RateLimitRule = {
    name: 'auth_attempts',
    windowMs: rl.authLoginWindowMs ?? 900_000, // 15 min
    maxRequests: rl.authLoginMaxAttempts ?? 5,
    keyType: 'ip',
    onExceed: 'reject',
  };

  const authRefreshRule: RateLimitRule = {
    name: 'auth_refresh',
    windowMs: 60_000, // 1 min
    maxRequests: 10,
    keyType: 'ip',
    onExceed: 'reject',
  };

  const authResetRule: RateLimitRule = {
    name: 'auth_reset_password',
    windowMs: 3_600_000, // 1 hour
    maxRequests: 3,
    keyType: 'ip',
    onExceed: 'reject',
  };

  const rules = [...STATIC_RULES, authRule, authRefreshRule, authResetRule];

  if (rl.redisUrl) {
    const limiter = new RedisRateLimiter(rl, rl.redisUrl, rl.redisPrefix ?? 'secureyeoman:rl');
    for (const rule of rules) limiter.addRule(rule);
    return limiter;
  }

  const limiter = new RateLimiter(rl);
  for (const rule of rules) limiter.addRule(rule);
  return limiter;
}
