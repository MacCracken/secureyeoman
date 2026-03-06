/**
 * Guardrail Metrics Collector — Phase 143
 *
 * Tracks per-filter execution metrics: activation rate, latency, findings, errors.
 */

import type {
  FilterExecutionMetric,
  GuardrailMetricsSnapshot,
  FilterMetricsSummary,
} from '@secureyeoman/shared';

interface FilterStats {
  filterId: string;
  filterName: string;
  executions: number;
  blocks: number;
  warnings: number;
  findings: number;
  errors: number;
  durations: number[];
  firstSeen: number;
}

export class GuardrailMetricsCollector {
  private stats = new Map<string, FilterStats>();
  private readonly maxDurationSamples: number;
  private startTime = Date.now();

  constructor(maxDurationSamples = 1000) {
    this.maxDurationSamples = maxDurationSamples;
  }

  record(metric: FilterExecutionMetric): void {
    let stat = this.stats.get(metric.filterId);
    if (!stat) {
      stat = {
        filterId: metric.filterId,
        filterName: metric.filterName,
        executions: 0,
        blocks: 0,
        warnings: 0,
        findings: 0,
        errors: 0,
        durations: [],
        firstSeen: Date.now(),
      };
      this.stats.set(metric.filterId, stat);
    }

    stat.executions++;
    stat.findings += metric.findingCount;

    if (metric.action === 'blocked') stat.blocks++;
    if (metric.action === 'error') stat.errors++;

    // Ring buffer for duration samples
    if (stat.durations.length >= this.maxDurationSamples) {
      stat.durations.shift();
    }
    stat.durations.push(metric.durationMs);
  }

  recordWarning(filterId: string): void {
    const stat = this.stats.get(filterId);
    if (stat) stat.warnings++;
  }

  getSnapshot(): GuardrailMetricsSnapshot {
    const filters: FilterMetricsSummary[] = [];

    for (const stat of this.stats.values()) {
      const sorted = [...stat.durations].sort((a, b) => a - b);
      const avg = sorted.length > 0 ? sorted.reduce((a, b) => a + b, 0) / sorted.length : 0;
      const p95Idx = Math.floor(sorted.length * 0.95);
      const p95 = sorted.length > 0 ? sorted[Math.min(p95Idx, sorted.length - 1)]! : 0;

      filters.push({
        filterId: stat.filterId,
        filterName: stat.filterName,
        totalExecutions: stat.executions,
        totalBlocks: stat.blocks,
        totalWarnings: stat.warnings,
        totalFindings: stat.findings,
        avgDurationMs: Math.round(avg * 100) / 100,
        p95DurationMs: Math.round(p95 * 100) / 100,
        errorCount: stat.errors,
        activationRate:
          stat.executions > 0
            ? Math.round(
                ((stat.findings > 0
                  ? stat.blocks +
                    stat.warnings +
                    (stat.findings - stat.blocks - stat.warnings > 0 ? 1 : 0)
                  : 0) /
                  stat.executions) *
                  10000
              ) / 10000
            : 0,
      });
    }

    return {
      filters,
      period: { from: this.startTime, to: Date.now() },
    };
  }

  /** Recalculate activation rate more precisely: executions with at least one finding / total */
  getActivationRate(filterId: string): number {
    const stat = this.stats.get(filterId);
    if (!stat || stat.executions === 0) return 0;
    // Approximate: if findings > 0, at least some executions activated
    // For precision, we track blocks + warnings as "activated"
    const activated = stat.blocks + stat.warnings;
    return activated / stat.executions;
  }

  reset(): void {
    this.stats.clear();
    this.startTime = Date.now();
  }
}
