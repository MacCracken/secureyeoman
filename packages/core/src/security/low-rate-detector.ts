/**
 * Low-Rate Distributed Attack Detector — Detects coordinated slow attacks
 * across many IPs that individually stay below rate limits.
 *
 * Maintains time-bucketed counters per route prefix. When a window rotates,
 * analyze() compares the current bucket against a baseline derived from a
 * circular buffer of historical windows. If uniqueIps and aggregate count
 * both exceed thresholds, an alert is triggered. Optionally penalizes
 * participating IPs via the IP reputation manager.
 *
 * Defenses:
 *   - Detect coordinated low-rate attacks across distributed IPs
 *   - Baseline-aware alerting (median of recent history)
 *   - Optional auto-block of participating IPs via reputation penalties
 */

import type { LowRateDetectionConfig } from '@secureyeoman/shared';
import type { FastifyRequest, FastifyReply } from 'fastify';
import type { IpReputationManager } from './ip-reputation.js';
import { getLogger, createNoopLogger, type SecureLogger } from '../logging/logger.js';
import { PeriodicCleanup } from './periodic-cleanup.js';

export interface LowRateAlert {
  routePrefix: string;
  uniqueIps: number;
  count: number;
  baseline: number;
  detectedAt: number;
}

interface RouteBucket {
  ips: Set<string>;
  count: number;
  windowStart: number;
}

interface HistoryEntry {
  count: number;
  uniqueIps: number;
}

export interface LowRateStats {
  activeBuckets: number;
  totalRecords: number;
  alertsTriggered: number;
}

/** Maximum number of completed windows to retain for baseline (1 hour at 5-min windows). */
const HISTORY_SIZE = 12;

/**
 * Extract route prefix from a URL. Groups by the first meaningful path segment
 * after `/api/v{N}/`. Falls back to the raw first segment.
 *
 * Examples:
 *   /api/v1/auth/login  -> "auth"
 *   /api/v1/chat/send   -> "chat"
 *   /health             -> "health"
 */
function extractRoutePrefix(url: string): string {
  // Strip query string
  const path = url.split('?')[0] ?? url;
  const segments = path.split('/').filter(Boolean);

  // Skip "api" and version segments (e.g. "v1", "v2")
  let i = 0;
  if (segments[i] === 'api') i++;
  if (segments[i] && /^v\d+$/i.test(segments[i]!)) i++;

  return segments[i] ?? 'root';
}

export class LowRateDetector {
  private readonly config: LowRateDetectionConfig;
  private readonly reputationManager: IpReputationManager | undefined;
  private readonly buckets = new Map<string, RouteBucket>();
  /** Per-route circular buffer of completed window stats. */
  private readonly history = new Map<string, HistoryEntry[]>();
  private readonly alerts: LowRateAlert[] = [];
  private totalRecords = 0;
  private alertsTriggered = 0;
  private logger: SecureLogger;
  private readonly analyzeTimer = new PeriodicCleanup();

  constructor(config: LowRateDetectionConfig, reputationManager?: IpReputationManager) {
    this.config = config;
    this.reputationManager = reputationManager;
    try {
      this.logger = getLogger().child({ component: 'LowRateDetector' });
    } catch {
      this.logger = createNoopLogger();
    }

    if (this.config.enabled) {
      // Periodically rotate windows and analyze
      this.analyzeTimer.start(() => {
        this.rotateAndAnalyze();
      }, this.config.windowMs);

      this.logger.info(
        {
          windowMs: this.config.windowMs,
          uniqueIpThreshold: this.config.uniqueIpThreshold,
          baselineMultiplier: this.config.baselineMultiplier,
          autoBlockParticipants: this.config.autoBlockParticipants,
        },
        'Low-rate detection enabled'
      );
    }
  }

  /**
   * Record an incoming request. Adds the IP to the bucket for the
   * route prefix extracted from the URL.
   */
  record(ip: string, url: string): void {
    if (!this.config.enabled) return;

    const prefix = extractRoutePrefix(url);
    const now = Date.now();
    let bucket = this.buckets.get(prefix);

    if (!bucket) {
      bucket = { ips: new Set(), count: 0, windowStart: now };
      this.buckets.set(prefix, bucket);
    }

    // If the bucket's window has expired, rotate it before recording
    if (now - bucket.windowStart >= this.config.windowMs) {
      this.rotateBucket(prefix, bucket);
      bucket = { ips: new Set(), count: 0, windowStart: now };
      this.buckets.set(prefix, bucket);
    }

    bucket.ips.add(ip);
    bucket.count++;
    this.totalRecords++;
  }

  /**
   * Analyze all active buckets. Called automatically on window rotation
   * via the interval, but can also be called manually for testing.
   */
  analyze(): void {
    const now = Date.now();

    for (const [prefix, bucket] of this.buckets) {
      const baseline = this.computeBaseline(prefix);
      const uniqueIps = bucket.ips.size;
      const { count } = bucket;

      const aboveIpThreshold = uniqueIps > this.config.uniqueIpThreshold;
      const aboveBaseline =
        baseline > 0 ? count > baseline * this.config.baselineMultiplier : false; // No baseline yet — cannot determine anomaly

      if (aboveIpThreshold && aboveBaseline) {
        const alert: LowRateAlert = {
          routePrefix: prefix,
          uniqueIps,
          count,
          baseline,
          detectedAt: now,
        };
        if (this.alerts.length >= 1000) {
          this.alerts.shift();
        }
        this.alerts.push(alert);
        this.alertsTriggered++;

        this.logger.warn(
          { routePrefix: prefix, uniqueIps, count, baseline },
          'Low-rate distributed attack detected'
        );

        // Penalize participating IPs
        if (this.config.autoBlockParticipants && this.reputationManager) {
          for (const ip of bucket.ips) {
            this.reputationManager.recordViolation(
              ip,
              this.config.reputationPenalty,
              'low_rate_attack'
            );
          }
        }
      }
    }
  }

  /**
   * Return recent alerts.
   */
  getAlerts(): LowRateAlert[] {
    return [...this.alerts];
  }

  /**
   * Return aggregate stats.
   */
  getStats(): LowRateStats {
    return {
      activeBuckets: this.buckets.size,
      totalRecords: this.totalRecords,
      alertsTriggered: this.alertsTriggered,
    };
  }

  /**
   * Stop the detector and clear all state.
   */
  stop(): void {
    this.analyzeTimer.stop();
    this.buckets.clear();
    this.history.clear();
    this.alerts.length = 0;
    this.totalRecords = 0;
    this.alertsTriggered = 0;
  }

  // ── Internal helpers ──────────────────────────────────────────────

  /**
   * Rotate a bucket: push its stats into the history circular buffer,
   * then clear the bucket.
   */
  private rotateBucket(prefix: string, bucket: RouteBucket): void {
    let hist = this.history.get(prefix);
    if (!hist) {
      hist = [];
      this.history.set(prefix, hist);
    }

    hist.push({ count: bucket.count, uniqueIps: bucket.ips.size });

    // Keep only the most recent HISTORY_SIZE entries
    if (hist.length > HISTORY_SIZE) {
      hist.splice(0, hist.length - HISTORY_SIZE);
    }
  }

  /**
   * Rotate all expired buckets and run analysis.
   */
  private rotateAndAnalyze(): void {
    const now = Date.now();

    for (const [prefix, bucket] of this.buckets) {
      if (now - bucket.windowStart >= this.config.windowMs) {
        this.rotateBucket(prefix, bucket);
        // Reset bucket for new window
        bucket.ips.clear();
        bucket.count = 0;
        bucket.windowStart = now;
      }
    }

    this.analyze();
  }

  /**
   * Compute baseline as the median aggregate count from historical windows.
   */
  private computeBaseline(prefix: string): number {
    const hist = this.history.get(prefix);
    if (!hist || hist.length === 0) return 0;

    const counts = hist.map((h) => h.count).sort((a, b) => a - b);
    const mid = Math.floor(counts.length / 2);

    if (counts.length % 2 === 0) {
      return (counts[mid - 1]! + counts[mid]!) / 2;
    }
    return counts[mid]!;
  }
}

/**
 * Create a Fastify onResponse hook that records requests for low-rate
 * distributed attack detection. Runs after the response is sent (non-blocking).
 */
export function createLowRateDetectorHook(
  detector: LowRateDetector
): (request: FastifyRequest, reply: FastifyReply) => Promise<void> {
  return async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    detector.record(request.ip, request.url);
  };
}
