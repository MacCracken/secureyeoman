/**
 * Backpressure Manager — Graceful degradation under load.
 *
 * Classifies system pressure into three levels (normal, elevated, critical)
 * and sheds low-priority HTTP traffic when the system is under stress.
 * During server drain (graceful shutdown), all new requests are rejected
 * with 503 + Retry-After.
 *
 * Route priority:
 *   critical — always pass: /api/v1/auth/, /api/v1/chat/ws, /health
 *   normal   — pass in normal + elevated: most API routes
 *   low      — only pass in normal: /metrics, /prom/metrics, /api/v1/training/export, /api/v1/diagnostics/
 */

import type { FastifyRequest, FastifyReply } from 'fastify';
import type { BackpressureConfig } from '@secureyeoman/shared';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { sendError } from '../utils/errors.js';

export type PressureLevel = 'normal' | 'elevated' | 'critical';
export type RoutePriority = 'critical' | 'normal' | 'low';

export interface BackpressureStats {
  level: PressureLevel;
  pressure: number;
  draining: boolean;
  rejectedLow: number;
  rejectedNormal: number;
  rejectedDrain: number;
}

/** Default thresholds — same as adaptive-rate-limiter. */
const ELEVATED_THRESHOLD = 0.4;
const CRITICAL_THRESHOLD = 0.7;

/** Route prefixes classified as critical (always allowed). */
const CRITICAL_PREFIXES = ['/api/v1/auth/', '/api/v1/chat/ws', '/health'];

/** Route prefixes classified as low priority (only in normal). */
const LOW_PREFIXES = [
  '/metrics',
  '/prom/metrics',
  '/api/v1/training/export',
  '/api/v1/diagnostics/',
];

function classifyRoute(url: string): RoutePriority {
  // Strip query string for matching
  const path = url.split('?')[0] ?? url;

  for (const prefix of CRITICAL_PREFIXES) {
    if (path.startsWith(prefix) || path === prefix.replace(/\/$/, '')) {
      return 'critical';
    }
  }

  for (const prefix of LOW_PREFIXES) {
    if (path.startsWith(prefix) || path === prefix.replace(/\/$/, '')) {
      return 'low';
    }
  }

  return 'normal';
}

export class BackpressureManager {
  private readonly config: BackpressureConfig;
  private logger: SecureLogger;
  private pressure = 0;
  private _draining = false;

  // Stats
  private _rejectedLow = 0;
  private _rejectedNormal = 0;
  private _rejectedDrain = 0;

  constructor(config: BackpressureConfig) {
    this.config = config;
    try {
      this.logger = getLogger().child({ component: 'BackpressureManager' });
    } catch {
      this.logger = createNoopLogger();
    }

    this.logger.info(
      { enabled: this.config.enabled, drainPeriodMs: this.config.drainPeriodMs },
      'Backpressure manager initialised'
    );
  }

  /** Accept an external pressure score (0–1). */
  setPressure(score: number): void {
    const clamped = Math.max(0, Math.min(1, score));
    const prev = this.getLevel();
    this.pressure = clamped;
    const next = this.getLevel();

    if (prev !== next) {
      this.logger.warn({ from: prev, to: next, pressure: clamped }, 'Backpressure level changed');
    }
  }

  getLevel(): PressureLevel {
    if (this.pressure >= CRITICAL_THRESHOLD) return 'critical';
    if (this.pressure >= ELEVATED_THRESHOLD) return 'elevated';
    return 'normal';
  }

  /** Returns true if the given URL should be rejected under current pressure. */
  shouldReject(url: string): boolean {
    // During drain, reject everything
    if (this._draining) {
      this._rejectedDrain++;
      return true;
    }

    if (!this.config.enabled) return false;

    const level = this.getLevel();
    if (level === 'normal') return false;

    const priority = classifyRoute(url);

    // Critical routes always pass
    if (priority === 'critical') return false;

    // In critical level, only critical routes pass (already returned above)
    if (level === 'critical') {
      if (priority === 'low') this._rejectedLow++;
      else this._rejectedNormal++;
      return true;
    }

    // In elevated level, low-priority routes are rejected
    if (level === 'elevated' && priority === 'low') {
      this._rejectedLow++;
      return true;
    }

    return false;
  }

  /** Enter drain mode — all new requests will be 503'd. */
  startDrain(): void {
    this._draining = true;
    this.logger.warn('Backpressure drain started — rejecting all new requests');
  }

  get draining(): boolean {
    return this._draining;
  }

  getStats(): BackpressureStats {
    return {
      level: this.getLevel(),
      pressure: this.pressure,
      draining: this._draining,
      rejectedLow: this._rejectedLow,
      rejectedNormal: this._rejectedNormal,
      rejectedDrain: this._rejectedDrain,
    };
  }

  stop(): void {
    this._draining = false;
    this.pressure = 0;
    this._rejectedLow = 0;
    this._rejectedNormal = 0;
    this._rejectedDrain = 0;
  }
}

/**
 * Create a Fastify onRequest hook that enforces backpressure.
 * When the manager decides to reject, replies with 503 + Retry-After: 30.
 */
export function createBackpressureHook(
  manager: BackpressureManager
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, reply: FastifyReply) => {
    if (manager.shouldReject(request.url)) {
      return sendError(reply, 503, 'Server is under heavy load, please retry later', {
        headers: { 'Retry-After': '30' },
      });
    }
  };
}
