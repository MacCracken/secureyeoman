/**
 * SLO Monitor (Phase 139)
 *
 * Tracks Service Level Objectives with error budget computation
 * and burn-rate alerting.  Integrates with the existing AlertManager
 * for notification dispatch.
 *
 * SLOs are evaluated against sliding windows of metric observations.
 */

import type { AlertManager } from './alert-manager.js';
import type { SecureLogger } from '../logging/logger.js';

export type SloMetricType =
  | 'response_latency_p95'
  | 'response_latency_p99'
  | 'tool_success_rate'
  | 'ai_success_rate'
  | 'retrieval_quality';

export interface SloDefinition {
  id: string;
  name: string;
  metricType: SloMetricType;
  /** For latency: max ms. For rates: min percentage (0-100). */
  target: number;
  /** Window size in ms for computing SLO compliance */
  windowMs: number;
  /** Burn rate threshold — if error budget consumption exceeds this rate, alert fires */
  burnRateThreshold: number;
}

export interface SloStatus {
  id: string;
  name: string;
  metricType: SloMetricType;
  target: number;
  currentValue: number;
  compliant: boolean;
  errorBudgetRemaining: number;
  burnRate: number;
  alerting: boolean;
  observationCount: number;
  windowMs: number;
}

interface Observation {
  timestamp: number;
  value: number;
  good: boolean;
}

const MAX_OBSERVATIONS = 10_000;
const BURN_RATE_SHORT_WINDOW_RATIO = 0.2; // 1h of a 5h window

export class SloMonitor {
  private readonly definitions: Map<string, SloDefinition> = new Map();
  private readonly observations: Map<string, Observation[]> = new Map();
  private readonly logger: SecureLogger;
  private readonly getAlertManager: (() => AlertManager | null) | undefined;

  constructor(
    logger: SecureLogger,
    getAlertManager?: () => AlertManager | null
  ) {
    this.logger = logger;
    this.getAlertManager = getAlertManager;
  }

  addDefinition(def: SloDefinition): void {
    this.definitions.set(def.id, def);
    if (!this.observations.has(def.id)) {
      this.observations.set(def.id, []);
    }
  }

  removeDefinition(id: string): boolean {
    this.observations.delete(id);
    return this.definitions.delete(id);
  }

  getDefinitions(): SloDefinition[] {
    return Array.from(this.definitions.values());
  }

  /**
   * Record a metric observation against a specific SLO metric type.
   * All matching SLO definitions are updated.
   */
  record(metricType: SloMetricType, value: number): void {
    const now = Date.now();
    for (const [id, def] of this.definitions) {
      if (def.metricType !== metricType) continue;

      const obs = this.observations.get(id) ?? [];
      const good = this.isGood(def, value);
      obs.push({ timestamp: now, value, good });

      // Trim old observations outside the window + cap
      const cutoff = now - def.windowMs;
      const trimmed = obs.filter((o) => o.timestamp >= cutoff);
      if (trimmed.length > MAX_OBSERVATIONS) {
        trimmed.splice(0, trimmed.length - MAX_OBSERVATIONS);
      }
      this.observations.set(id, trimmed);
    }
  }

  /**
   * Evaluate all SLOs and return their current status.
   * Optionally fires burn-rate alerts via AlertManager.
   */
  evaluate(): SloStatus[] {
    const now = Date.now();
    const results: SloStatus[] = [];

    for (const [id, def] of this.definitions) {
      const obs = this.observations.get(id) ?? [];
      const cutoff = now - def.windowMs;
      const windowObs = obs.filter((o) => o.timestamp >= cutoff);

      if (windowObs.length === 0) {
        results.push({
          id,
          name: def.name,
          metricType: def.metricType,
          target: def.target,
          currentValue: 0,
          compliant: true,
          errorBudgetRemaining: 1.0,
          burnRate: 0,
          alerting: false,
          observationCount: 0,
          windowMs: def.windowMs,
        });
        continue;
      }

      const goodCount = windowObs.filter((o) => o.good).length;
      const totalCount = windowObs.length;
      const goodRate = goodCount / totalCount;
      const sloTarget = this.normalizedTarget(def);
      const errorBudget = 1 - sloTarget;
      const errorRate = 1 - goodRate;
      const errorBudgetRemaining = errorBudget > 0 ? Math.max(0, 1 - errorRate / errorBudget) : (goodRate >= sloTarget ? 1 : 0);

      // Burn rate: compare short window to long window
      const shortCutoff = now - def.windowMs * BURN_RATE_SHORT_WINDOW_RATIO;
      const shortObs = windowObs.filter((o) => o.timestamp >= shortCutoff);
      const shortGoodRate = shortObs.length > 0
        ? shortObs.filter((o) => o.good).length / shortObs.length
        : goodRate;
      const shortErrorRate = 1 - shortGoodRate;
      const burnRate = errorBudget > 0 ? shortErrorRate / errorBudget : 0;

      const alerting = burnRate >= def.burnRateThreshold;
      const currentValue = this.computeCurrentValue(def, windowObs);

      const status: SloStatus = {
        id,
        name: def.name,
        metricType: def.metricType,
        target: def.target,
        currentValue,
        compliant: goodRate >= sloTarget,
        errorBudgetRemaining,
        burnRate,
        alerting,
        observationCount: totalCount,
        windowMs: def.windowMs,
      };

      if (alerting) {
        this.fireBurnRateAlert(def, status);
      }

      results.push(status);
    }

    return results;
  }

  private isGood(def: SloDefinition, value: number): boolean {
    if (def.metricType.startsWith('response_latency')) {
      return value <= def.target;
    }
    // For rate-based metrics: value is a percentage (0-100)
    return value >= def.target;
  }

  private normalizedTarget(def: SloDefinition): number {
    if (def.metricType.startsWith('response_latency')) {
      // For latency, target is the SLO — we expect e.g. 95% of requests under target
      return 0.95;
    }
    // For rates: convert percentage to ratio
    return def.target / 100;
  }

  private computeCurrentValue(def: SloDefinition, obs: Observation[]): number {
    if (obs.length === 0) return 0;

    if (def.metricType.startsWith('response_latency')) {
      const sorted = obs.map((o) => o.value).sort((a, b) => a - b);
      const pctIdx = def.metricType === 'response_latency_p99'
        ? Math.ceil(sorted.length * 0.99) - 1
        : Math.ceil(sorted.length * 0.95) - 1;
      return sorted[Math.max(0, pctIdx)] ?? 0;
    }

    // For rate-based: return the current rate as percentage
    const goodCount = obs.filter((o) => o.good).length;
    return (goodCount / obs.length) * 100;
  }

  private fireBurnRateAlert(def: SloDefinition, status: SloStatus): void {
    const alertManager = this.getAlertManager?.();
    if (!alertManager) return;

    const snapshot = {
      slo: {
        [def.id]: {
          burnRate: status.burnRate,
          errorBudgetRemaining: status.errorBudgetRemaining,
          compliant: status.compliant ? 1 : 0,
        },
      },
    };

    alertManager.evaluate(snapshot).catch((err: unknown) => {
      this.logger.error('SLO burn-rate alert evaluation failed', {
        sloId: def.id,
        error: err instanceof Error ? err.message : String(err),
      });
    });

    this.logger.warn('SLO burn rate threshold exceeded', {
      sloId: def.id,
      sloName: def.name,
      burnRate: status.burnRate,
      threshold: def.burnRateThreshold,
      errorBudgetRemaining: status.errorBudgetRemaining,
    });
  }
}
