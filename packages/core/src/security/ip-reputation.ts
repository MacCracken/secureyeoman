/**
 * IP Reputation Manager — Automated IP blocklisting based on violation history.
 *
 * Maintains an in-memory LRU cache of IP reputation scores. IPs that accumulate
 * enough violation points are auto-blocked. Scores decay exponentially over time
 * (configurable half-life) so that transient offenders eventually recover.
 *
 * Defenses:
 *   - Auto-block when violation score >= threshold
 *   - Exponential score decay (half-life based)
 *   - Block expiry after configurable duration
 *   - Manual block/allow overrides
 *   - LRU eviction (blocked IPs are protected from eviction)
 */

import type { IpReputationConfig } from '@secureyeoman/shared';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { sendError } from '../utils/errors.js';

export interface IpRecord {
  score: number;
  lastUpdated: number;
  blocked: boolean;
  blockedAt?: number;
  reason?: string;
}

export interface BlockCheckResult {
  blocked: boolean;
  reason?: string;
  retryAfter?: number;
}

export interface IpReputationStats {
  trackedIps: number;
  blockedIps: number;
  totalViolations: number;
}

export class IpReputationManager {
  private readonly cache = new Map<string, IpRecord>();
  private readonly config: IpReputationConfig;
  private logger: SecureLogger;
  private totalViolations = 0;

  constructor(config: IpReputationConfig) {
    this.config = config;
    try {
      this.logger = getLogger().child({ component: 'IpReputation' });
    } catch {
      this.logger = createNoopLogger();
    }
  }

  /**
   * Record a violation against an IP address. Adds points to the IP's
   * reputation score and auto-blocks when the threshold is reached.
   */
  recordViolation(ip: string, points: number, reason: string): void {
    this.totalViolations++;
    const now = Date.now();
    let record = this.cache.get(ip);

    if (record) {
      // Apply decay before adding new points
      record.score = this.decayScore(record.score, record.lastUpdated, now);
      record.score += points;
      record.lastUpdated = now;
    } else {
      record = {
        score: points,
        lastUpdated: now,
        blocked: false,
      };
      this.cache.set(ip, record);
    }

    // Re-insert to move to end (most recently used)
    this.cache.delete(ip);
    this.cache.set(ip, record);

    this.logger.debug({ ip, points, reason, score: record.score }, 'Violation recorded');

    // Auto-block check
    if (!record.blocked && record.score >= this.config.autoBlockThreshold) {
      record.blocked = true;
      record.blockedAt = now;
      record.reason = reason;
      this.logger.warn(
        { ip, score: record.score, reason },
        'IP auto-blocked: score exceeded threshold'
      );
    }

    this.evictIfNeeded();
  }

  /**
   * Check whether an IP is currently blocked.
   * Applies score decay and checks block expiry before returning.
   */
  isBlocked(ip: string): BlockCheckResult {
    const record = this.cache.get(ip);
    if (!record) {
      return { blocked: false };
    }

    const now = Date.now();

    // Check block expiry
    if (record.blocked && record.blockedAt) {
      const elapsed = now - record.blockedAt;
      if (elapsed >= this.config.blockDurationMs) {
        // Block expired — unblock and decay score
        record.blocked = false;
        record.blockedAt = undefined;
        record.reason = undefined;
        record.score = this.decayScore(record.score, record.lastUpdated, now);
        record.lastUpdated = now;
        this.logger.info({ ip }, 'IP block expired');
        return { blocked: false };
      }
    }

    // Apply score decay
    const decayed = this.decayScore(record.score, record.lastUpdated, now);
    record.score = decayed;
    record.lastUpdated = now;

    // Check if decayed score drops below threshold — auto-unblock
    if (record.blocked && decayed < this.config.autoBlockThreshold) {
      record.blocked = false;
      record.blockedAt = undefined;
      record.reason = undefined;
      this.logger.info({ ip, score: decayed }, 'IP auto-unblocked: decayed score below threshold');
      return { blocked: false };
    }

    if (record.blocked) {
      const retryAfter = record.blockedAt
        ? Math.ceil((this.config.blockDurationMs - (now - record.blockedAt)) / 1000)
        : undefined;
      return {
        blocked: true,
        reason: record.reason,
        retryAfter: retryAfter && retryAfter > 0 ? retryAfter : undefined,
      };
    }

    return { blocked: false };
  }

  /**
   * Manually block an IP with an optional custom duration.
   */
  manualBlock(ip: string, reason: string, durationMs?: number): void {
    const now = Date.now();
    let record = this.cache.get(ip);

    if (record) {
      record.blocked = true;
      record.blockedAt = now;
      record.reason = reason;
      // Set score to threshold so expiry logic works correctly
      record.score = Math.max(record.score, this.config.autoBlockThreshold);
      record.lastUpdated = now;
    } else {
      record = {
        score: this.config.autoBlockThreshold,
        lastUpdated: now,
        blocked: true,
        blockedAt: now,
        reason,
      };
    }

    // Re-insert to move to end
    this.cache.delete(ip);
    this.cache.set(ip, record);

    // If custom duration, adjust blockedAt so expiry fires at the right time
    if (durationMs !== undefined) {
      record.blockedAt = now - (this.config.blockDurationMs - durationMs);
    }

    this.logger.warn({ ip, reason }, 'IP manually blocked');
    this.evictIfNeeded();
  }

  /**
   * Remove block and reset reputation score for an IP.
   */
  manualAllow(ip: string): void {
    this.cache.delete(ip);
    this.logger.info({ ip }, 'IP manually allowed — record cleared');
  }

  /**
   * Return the current reputation data for an IP.
   */
  getReputation(ip: string): { score: number; blocked: boolean; reason?: string } | null {
    const record = this.cache.get(ip);
    if (!record) return null;

    const now = Date.now();
    const decayed = this.decayScore(record.score, record.lastUpdated, now);
    return {
      score: decayed,
      blocked: record.blocked,
      reason: record.reason,
    };
  }

  /**
   * Return aggregate stats about the reputation cache.
   */
  getStats(): IpReputationStats {
    let blockedIps = 0;
    for (const record of this.cache.values()) {
      if (record.blocked) blockedIps++;
    }
    return {
      trackedIps: this.cache.size,
      blockedIps,
      totalViolations: this.totalViolations,
    };
  }

  /**
   * Stop the manager and clear all state.
   */
  stop(): void {
    this.cache.clear();
    this.totalViolations = 0;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  private decayScore(score: number, lastUpdated: number, now: number): number {
    const elapsed = now - lastUpdated;
    if (elapsed <= 0) return score;
    return score * Math.pow(0.5, elapsed / this.config.scoreDecayHalfLifeMs);
  }

  private evictIfNeeded(): void {
    if (this.cache.size <= this.config.maxCacheSize) return;

    // Phase 1: Evict non-blocked entries (LRU — Map iteration order)
    for (const [ip, record] of this.cache) {
      if (this.cache.size <= this.config.maxCacheSize) break;
      if (!record.blocked) {
        this.cache.delete(ip);
      }
    }

    // Phase 2: If still over capacity (all entries blocked), evict expired blocks
    if (this.cache.size > this.config.maxCacheSize) {
      const now = Date.now();
      for (const [ip, record] of this.cache) {
        if (this.cache.size <= this.config.maxCacheSize) break;
        if (record.blocked && record.blockedAt !== undefined) {
          const elapsed = now - record.blockedAt;
          if (elapsed >= this.config.blockDurationMs) {
            this.cache.delete(ip);
          }
        }
      }
    }
  }
}

/**
 * Create a Fastify onRequest hook that blocks requests from IPs with
 * a bad reputation score.
 */
export function createIpReputationHook(
  manager: IpReputationManager
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
    const result = manager.isBlocked(request.ip);
    if (result.blocked) {
      const headers: Record<string, string> = {};
      if (result.retryAfter) {
        headers['Retry-After'] = String(result.retryAfter);
      }
      return sendError(reply, 403, result.reason ?? 'IP blocked', { headers });
    }
  };
}
