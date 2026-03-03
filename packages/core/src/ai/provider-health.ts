/**
 * Provider Health Tracker
 *
 * Ring-buffer-based health scoring for AI providers.
 * Records request outcomes (success/failure + latency) and
 * exposes per-provider health status and ranking.
 *
 * Phase 119 — LLM Provider Improvements
 */

export type ProviderHealthStatus = 'healthy' | 'degraded' | 'unhealthy';

export interface ProviderHealth {
  errorRate: number;
  p95LatencyMs: number;
  status: ProviderHealthStatus;
  consecutiveFailures: number;
  totalRequests: number;
}

interface RequestEntry {
  success: boolean;
  latencyMs: number;
}

const HEALTHY_THRESHOLD = 0.05;
const DEGRADED_THRESHOLD = 0.2;

export class ProviderHealthTracker {
  private readonly bufferSize: number;
  private readonly buffers = new Map<string, RequestEntry[]>();
  private readonly cursors = new Map<string, number>();
  private readonly consecutiveFailures = new Map<string, number>();

  constructor(bufferSize = 100) {
    this.bufferSize = bufferSize;
  }

  recordRequest(provider: string, success: boolean, latencyMs: number): void {
    if (!this.buffers.has(provider)) {
      this.buffers.set(provider, []);
      this.cursors.set(provider, 0);
      this.consecutiveFailures.set(provider, 0);
    }

    const buf = this.buffers.get(provider)!;
    const cursor = this.cursors.get(provider)!;

    if (buf.length < this.bufferSize) {
      buf.push({ success, latencyMs });
    } else {
      buf[cursor % this.bufferSize] = { success, latencyMs };
    }
    this.cursors.set(provider, cursor + 1);

    if (success) {
      this.consecutiveFailures.set(provider, 0);
    } else {
      this.consecutiveFailures.set(provider, (this.consecutiveFailures.get(provider) ?? 0) + 1);
    }
  }

  getHealth(provider: string): ProviderHealth {
    const buf = this.buffers.get(provider);
    if (!buf || buf.length === 0) {
      return {
        errorRate: 0,
        p95LatencyMs: 0,
        status: 'healthy',
        consecutiveFailures: 0,
        totalRequests: 0,
      };
    }

    const total = buf.length;
    const failures = buf.filter((e) => !e.success).length;
    const errorRate = failures / total;

    const sortedLatencies = buf.map((e) => e.latencyMs).sort((a, b) => a - b);
    const p95Index = Math.min(Math.ceil(total * 0.95) - 1, total - 1);
    const p95LatencyMs = sortedLatencies[p95Index] ?? 0;

    let status: ProviderHealthStatus;
    if (errorRate < HEALTHY_THRESHOLD) {
      status = 'healthy';
    } else if (errorRate < DEGRADED_THRESHOLD) {
      status = 'degraded';
    } else {
      status = 'unhealthy';
    }

    return {
      errorRate,
      p95LatencyMs,
      status,
      consecutiveFailures: this.consecutiveFailures.get(provider) ?? 0,
      totalRequests: total,
    };
  }

  getProviderRanking(): string[] {
    const providers = Array.from(this.buffers.keys());
    const healthMap = new Map<string, ProviderHealth>();
    for (const p of providers) {
      healthMap.set(p, this.getHealth(p));
    }

    const statusOrder: Record<ProviderHealthStatus, number> = {
      healthy: 0,
      degraded: 1,
      unhealthy: 2,
    };

    return providers.sort((a, b) => {
      const ha = healthMap.get(a)!;
      const hb = healthMap.get(b)!;
      const statusDiff = statusOrder[ha.status] - statusOrder[hb.status];
      if (statusDiff !== 0) return statusDiff;
      return ha.errorRate - hb.errorRate;
    });
  }

  getAllHealth(): Record<string, ProviderHealth> {
    const result: Record<string, ProviderHealth> = {};
    for (const provider of this.buffers.keys()) {
      result[provider] = this.getHealth(provider);
    }
    return result;
  }
}
