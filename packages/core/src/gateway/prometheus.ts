/**
 * Prometheus Metrics Exporter
 *
 * Formats internal metrics as Prometheus text exposition format
 * for scraping by Prometheus or compatible systems.
 */

import type { MetricsSnapshot } from '@secureyeoman/shared';

/**
 * Format a MetricsSnapshot into Prometheus text exposition format.
 */
export function formatPrometheusMetrics(metrics: Partial<MetricsSnapshot>): string {
  const lines: string[] = [];

  const ts = metrics.timestamp ?? Date.now();

  // ── Task Metrics ─────────────────────────────────────────
  if (metrics.tasks) {
    const t = metrics.tasks;
    lines.push('# HELP friday_tasks_total Total number of tasks');
    lines.push('# TYPE friday_tasks_total gauge');
    lines.push(`friday_tasks_total ${t.total}`);

    lines.push('# HELP friday_tasks_queue_depth Current task queue depth');
    lines.push('# TYPE friday_tasks_queue_depth gauge');
    lines.push(`friday_tasks_queue_depth ${t.queueDepth}`);

    lines.push('# HELP friday_tasks_in_progress Currently executing tasks');
    lines.push('# TYPE friday_tasks_in_progress gauge');
    lines.push(`friday_tasks_in_progress ${t.inProgress}`);

    lines.push('# HELP friday_tasks_success_rate Task success rate (0-1)');
    lines.push('# TYPE friday_tasks_success_rate gauge');
    lines.push(`friday_tasks_success_rate ${t.successRate}`);

    lines.push('# HELP friday_tasks_duration_ms Task duration percentiles in milliseconds');
    lines.push('# TYPE friday_tasks_duration_ms summary');
    lines.push(`friday_tasks_duration_ms{quantile="0.5"} ${t.p50DurationMs}`);
    lines.push(`friday_tasks_duration_ms{quantile="0.95"} ${t.p95DurationMs}`);
    lines.push(`friday_tasks_duration_ms{quantile="0.99"} ${t.p99DurationMs}`);

    if (t.byStatus) {
      lines.push('# HELP friday_tasks_by_status Tasks by status');
      lines.push('# TYPE friday_tasks_by_status gauge');
      for (const [status, count] of Object.entries(t.byStatus)) {
        lines.push(`friday_tasks_by_status{status="${status}"} ${count}`);
      }
    }
  }

  // ── Resource Metrics ─────────────────────────────────────
  if (metrics.resources) {
    const r = metrics.resources;
    lines.push('# HELP friday_cpu_percent CPU usage percentage');
    lines.push('# TYPE friday_cpu_percent gauge');
    lines.push(`friday_cpu_percent ${r.cpuPercent}`);

    lines.push('# HELP friday_memory_used_mb Memory used in MB');
    lines.push('# TYPE friday_memory_used_mb gauge');
    lines.push(`friday_memory_used_mb ${r.memoryUsedMb.toFixed(2)}`);

    lines.push('# HELP friday_tokens_used_today Tokens used today');
    lines.push('# TYPE friday_tokens_used_today counter');
    lines.push(`friday_tokens_used_today ${r.tokensUsedToday}`);

    lines.push('# HELP friday_cost_usd_today Cost in USD today');
    lines.push('# TYPE friday_cost_usd_today gauge');
    lines.push(`friday_cost_usd_today ${r.costUsdToday.toFixed(4)}`);

    lines.push('# HELP friday_api_calls_total Total API calls');
    lines.push('# TYPE friday_api_calls_total counter');
    lines.push(`friday_api_calls_total ${r.apiCallsTotal}`);

    lines.push('# HELP friday_api_errors_total Total API errors');
    lines.push('# TYPE friday_api_errors_total counter');
    lines.push(`friday_api_errors_total ${r.apiErrorsTotal}`);

    lines.push('# HELP friday_api_latency_avg_ms Average API latency in ms');
    lines.push('# TYPE friday_api_latency_avg_ms gauge');
    lines.push(`friday_api_latency_avg_ms ${r.apiLatencyAvgMs.toFixed(2)}`);
  }

  // ── Security Metrics ─────────────────────────────────────
  if (metrics.security) {
    const s = metrics.security;
    lines.push('# HELP friday_auth_attempts_total Total auth attempts');
    lines.push('# TYPE friday_auth_attempts_total counter');
    lines.push(`friday_auth_attempts_total ${s.authAttemptsTotal}`);

    lines.push('# HELP friday_auth_failures_total Total auth failures');
    lines.push('# TYPE friday_auth_failures_total counter');
    lines.push(`friday_auth_failures_total ${s.authFailuresTotal}`);

    lines.push('# HELP friday_blocked_requests_total Total blocked requests');
    lines.push('# TYPE friday_blocked_requests_total counter');
    lines.push(`friday_blocked_requests_total ${s.blockedRequestsTotal}`);

    lines.push('# HELP friday_rate_limit_hits_total Total rate limit hits');
    lines.push('# TYPE friday_rate_limit_hits_total counter');
    lines.push(`friday_rate_limit_hits_total ${s.rateLimitHitsTotal}`);

    lines.push('# HELP friday_audit_entries_total Total audit entries');
    lines.push('# TYPE friday_audit_entries_total counter');
    lines.push(`friday_audit_entries_total ${s.auditEntriesTotal}`);

    lines.push('# HELP friday_audit_chain_valid Audit chain integrity (1=valid, 0=invalid)');
    lines.push('# TYPE friday_audit_chain_valid gauge');
    lines.push(`friday_audit_chain_valid ${s.auditChainValid ? 1 : 0}`);
  }

  // ── Process Metrics ──────────────────────────────────────
  const mem = process.memoryUsage();
  lines.push('# HELP process_heap_bytes Node.js heap usage in bytes');
  lines.push('# TYPE process_heap_bytes gauge');
  lines.push(`process_heap_bytes ${mem.heapUsed}`);

  lines.push('# HELP process_rss_bytes Node.js RSS in bytes');
  lines.push('# TYPE process_rss_bytes gauge');
  lines.push(`process_rss_bytes ${mem.rss}`);

  lines.push('# HELP friday_uptime_seconds Process uptime in seconds');
  lines.push('# TYPE friday_uptime_seconds gauge');
  lines.push(`friday_uptime_seconds ${process.uptime().toFixed(0)}`);

  return lines.join('\n') + '\n';
}
