import { describe, it, expect } from 'vitest';
import { formatPrometheusMetrics } from './prometheus.js';
import type { MetricsSnapshot } from '@secureyeoman/shared';

describe('Prometheus Metrics', () => {
  it('should format task metrics', () => {
    const metrics: Partial<MetricsSnapshot> = {
      timestamp: Date.now(),
      tasks: {
        total: 100,
        byStatus: { completed: 80, failed: 10, pending: 10 },
        byType: {},
        successRate: 0.8,
        failureRate: 0.1,
        avgDurationMs: 150,
        minDurationMs: 10,
        maxDurationMs: 5000,
        p50DurationMs: 100,
        p95DurationMs: 300,
        p99DurationMs: 500,
        queueDepth: 5,
        inProgress: 3,
      },
    };

    const output = formatPrometheusMetrics(metrics);
    expect(output).toContain('friday_tasks_total 100');
    expect(output).toContain('friday_tasks_queue_depth 5');
    expect(output).toContain('friday_tasks_in_progress 3');
    expect(output).toContain('friday_tasks_success_rate 0.8');
    expect(output).toContain('friday_tasks_by_status{status="completed"} 80');
    expect(output).toContain('friday_tasks_duration_ms{quantile="0.95"} 300');
  });

  it('should format resource metrics', () => {
    const metrics: Partial<MetricsSnapshot> = {
      resources: {
        cpuPercent: 25,
        memoryUsedMb: 128.5,
        memoryLimitMb: 512,
        memoryPercent: 25,
        diskUsedMb: 100,
        tokensUsedToday: 50000,
        tokensCachedToday: 10000,
        costUsdToday: 1.234,
        costUsdMonth: 30.5,
        apiCallsTotal: 200,
        apiErrorsTotal: 5,
        apiLatencyAvgMs: 150.75,
      },
    };

    const output = formatPrometheusMetrics(metrics);
    expect(output).toContain('friday_cpu_percent 25');
    expect(output).toContain('friday_memory_used_mb 128.50');
    expect(output).toContain('friday_tokens_used_today 50000');
    expect(output).toContain('friday_api_calls_total 200');
    expect(output).toContain('friday_api_errors_total 5');
  });

  it('should format security metrics', () => {
    const metrics: Partial<MetricsSnapshot> = {
      security: {
        authAttemptsTotal: 500,
        authSuccessTotal: 450,
        authFailuresTotal: 50,
        activeSessions: 10,
        permissionChecksTotal: 1000,
        permissionDenialsTotal: 20,
        blockedRequestsTotal: 15,
        rateLimitHitsTotal: 15,
        injectionAttemptsTotal: 3,
        eventsBySeverity: {},
        eventsByType: {},
        auditEntriesTotal: 2000,
        auditChainValid: true,
        lastAuditVerification: Date.now(),
      },
    };

    const output = formatPrometheusMetrics(metrics);
    expect(output).toContain('friday_auth_attempts_total 500');
    expect(output).toContain('friday_auth_failures_total 50');
    expect(output).toContain('friday_audit_chain_valid 1');
  });

  it('should always include process metrics', () => {
    const output = formatPrometheusMetrics({});
    expect(output).toContain('process_heap_bytes');
    expect(output).toContain('process_rss_bytes');
    expect(output).toContain('friday_uptime_seconds');
  });

  it('should handle empty metrics gracefully', () => {
    const output = formatPrometheusMetrics({});
    expect(output).toBeTruthy();
    expect(output.endsWith('\n')).toBe(true);
  });
});
