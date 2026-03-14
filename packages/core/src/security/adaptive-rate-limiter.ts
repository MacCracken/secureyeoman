/**
 * Adaptive Rate Limiter for SecureYeoman
 *
 * Dynamically adjusts rate limits based on system pressure (CPU, memory,
 * event loop lag). Wraps an inner RateLimiterLike and periodically
 * recalculates effective maxRequests per rule based on a composite
 * pressure score.
 */

import { cpus } from 'node:os';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import type { RateLimiterLike, RateLimitResult, RateLimitRule } from './rate-limiter.js';
import type { AdaptiveRateLimitConfig } from '@secureyeoman/shared';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';

export type PressureLevel = 'normal' | 'elevated' | 'critical';

export interface PressureInfo {
  cpu: number;
  memory: number;
  eventLoop: number;
  composite: number;
  multiplier: number;
  level: PressureLevel;
}

/** Event-loop lag baseline in ms — values at or above this map to pressure 1.0. */
const EVENT_LOOP_LAG_BASELINE_MS = 100;

/** Exponential moving average smoothing factor. */
const EMA_ALPHA = 0.3;

export class AdaptiveRateLimiter implements RateLimiterLike {
  private readonly inner: RateLimiterLike;
  private readonly config: AdaptiveRateLimitConfig;
  private logger: SecureLogger | null = null;

  /** Original maxRequests stored per rule name so we can restore on stop(). */
  private readonly originalRules = new Map<string, RateLimitRule>();

  /** Previous CPU snapshot used to compute delta utilisation. */
  private prevCpuIdle = 0;
  private prevCpuTotal = 0;

  /** Smoothed composite pressure (EMA). */
  private smoothedPressure = 0;

  /** Current multiplier applied to rules. */
  private currentMultiplier = 1;

  /** Current pressure level. */
  private currentLevel: PressureLevel = 'normal';

  /** Sampling interval handle. */
  private sampleTimer: NodeJS.Timeout | null = null;

  /** Event-loop delay histogram. */
  private histogram: ReturnType<typeof monitorEventLoopDelay> | null = null;

  constructor(inner: RateLimiterLike, config: AdaptiveRateLimitConfig) {
    this.inner = inner;
    this.config = config;

    // Initialise CPU snapshot
    this.snapshotCpu();

    // Start event-loop delay monitoring
    this.histogram = monitorEventLoopDelay({ resolution: 20 });
    this.histogram.enable();

    // Start periodic sampling
    this.sampleTimer = setInterval(() => {
      this.sample();
    }, this.config.sampleIntervalMs);
    this.sampleTimer.unref();
  }

  // ─── RateLimiterLike delegation ─────────────────────────────────

  addRule(rule: RateLimitRule): void {
    this.originalRules.set(rule.name, { ...rule });
    // Apply current multiplier immediately
    const adjusted = {
      ...rule,
      maxRequests: Math.max(1, Math.round(rule.maxRequests * this.currentMultiplier)),
    };
    this.inner.addRule(adjusted);
  }

  removeRule(name: string): boolean {
    this.originalRules.delete(name);
    return this.inner.removeRule(name);
  }

  check(
    ruleName: string,
    key: string,
    context?: { userId?: string; ipAddress?: string }
  ): RateLimitResult | Promise<RateLimitResult> {
    return this.inner.check(ruleName, key, context);
  }

  stop(): void | Promise<void> {
    // Clear sampling
    if (this.sampleTimer) {
      clearInterval(this.sampleTimer);
      this.sampleTimer = null;
    }

    // Stop histogram
    if (this.histogram) {
      this.histogram.disable();
      this.histogram = null;
    }

    // Restore original rules on the inner limiter
    for (const rule of this.originalRules.values()) {
      this.inner.addRule({ ...rule });
    }

    return this.inner.stop();
  }

  getStats(): { totalHits: number; totalChecks: number } {
    return this.inner.getStats();
  }

  // ─── Pressure API ───────────────────────────────────────────────

  getPressure(): PressureInfo {
    return {
      cpu: this.measureCpu(),
      memory: this.measureMemory(),
      eventLoop: this.measureEventLoop(),
      composite: this.smoothedPressure,
      multiplier: this.currentMultiplier,
      level: this.currentLevel,
    };
  }

  // ─── Internal ───────────────────────────────────────────────────

  private getLog(): SecureLogger {
    if (!this.logger) {
      try {
        this.logger = getLogger().child({ component: 'AdaptiveRateLimiter' });
      } catch {
        return createNoopLogger();
      }
    }
    return this.logger;
  }

  /** Capture a CPU idle/total snapshot for delta computation. */
  private snapshotCpu(): void {
    let idle = 0;
    let total = 0;
    for (const cpu of cpus()) {
      const t = cpu.times;
      idle += t.idle;
      total += t.idle + t.user + t.nice + t.sys + t.irq;
    }
    this.prevCpuIdle = idle;
    this.prevCpuTotal = total;
  }

  /** Return CPU utilisation 0-1 since last snapshot, then update snapshot. */
  private measureCpu(): number {
    let idle = 0;
    let total = 0;
    for (const cpu of cpus()) {
      const t = cpu.times;
      idle += t.idle;
      total += t.idle + t.user + t.nice + t.sys + t.irq;
    }

    const idleDelta = idle - this.prevCpuIdle;
    const totalDelta = total - this.prevCpuTotal;

    this.prevCpuIdle = idle;
    this.prevCpuTotal = total;

    if (totalDelta === 0) return 0;
    return Math.min(1, Math.max(0, 1 - idleDelta / totalDelta));
  }

  /** Return heap memory pressure 0-1. */
  private measureMemory(): number {
    const mem = process.memoryUsage();
    if (mem.heapTotal === 0) return 0;
    return Math.min(1, Math.max(0, mem.heapUsed / mem.heapTotal));
  }

  /** Return event loop lag pressure 0-1. */
  private measureEventLoop(): number {
    if (!this.histogram) return 0;
    const meanMs = this.histogram.mean / 1e6; // ns → ms
    this.histogram.reset();
    return Math.min(1, Math.max(0, meanMs / EVENT_LOOP_LAG_BASELINE_MS));
  }

  /** Periodic sample: compute pressure, update multiplier, adjust rules. */
  private sample(): void {
    const cpu = this.measureCpu();
    const memory = this.measureMemory();
    const eventLoop = this.measureEventLoop();

    const raw =
      this.config.cpuWeight * cpu +
      this.config.memoryWeight * memory +
      this.config.eventLoopWeight * eventLoop;

    const clamped = Math.min(1, Math.max(0, raw));

    // Exponential moving average
    this.smoothedPressure = EMA_ALPHA * clamped + (1 - EMA_ALPHA) * this.smoothedPressure;

    // Determine level and multiplier
    let multiplier: number;
    let level: PressureLevel;

    if (this.smoothedPressure >= this.config.criticalThreshold) {
      multiplier = this.config.criticalMultiplier;
      level = 'critical';
    } else if (this.smoothedPressure >= this.config.elevatedThreshold) {
      multiplier = this.config.elevatedMultiplier;
      level = 'elevated';
    } else {
      multiplier = 1;
      level = 'normal';
    }

    // Only update rules if multiplier changed
    if (multiplier !== this.currentMultiplier) {
      this.getLog().info(
        {
          prevMultiplier: this.currentMultiplier,
          newMultiplier: multiplier,
          pressure: this.smoothedPressure,
          level,
          cpu,
          memory,
          eventLoop,
        },
        'Adaptive rate limit multiplier changed'
      );

      this.currentMultiplier = multiplier;
      this.currentLevel = level;

      // Re-add all rules with adjusted maxRequests
      for (const original of this.originalRules.values()) {
        const adjusted: RateLimitRule = {
          ...original,
          maxRequests: Math.max(1, Math.round(original.maxRequests * multiplier)),
        };
        this.inner.addRule(adjusted);
      }
    } else {
      this.currentLevel = level;
    }
  }
}
