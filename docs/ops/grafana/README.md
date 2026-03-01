# SecureYeoman — Grafana Dashboards

Two importable Grafana dashboard JSON files for monitoring SecureYeoman in production.

## Dashboards

| File | UID | Description |
|------|-----|-------------|
| `secureyeoman-overview.json` | `secureyeoman-overview` | Token spend, personality activity, workflow rates, audit event rate, provider latency, rate-limit rejections |
| `secureyeoman-alerts.json` | `secureyeoman-alerts` | Alert/incident overview — auth failures, rate-limit hits, audit chain validity, task queue depth |

## Prerequisites

- Grafana ≥ 10
- Prometheus scraping SecureYeoman's `/metrics` endpoint

## Import Instructions

1. In Grafana, go to **Dashboards → New → Import**
2. Upload or paste the JSON file
3. When prompted for a data source, select your Prometheus instance
4. Click **Import**

## Prometheus Scrape Config

Add the following to your `prometheus.yml`:

```yaml
scrape_configs:
  - job_name: secureyeoman
    static_configs:
      - targets:
          - 'secureyeoman:18789'   # core container default port
    metrics_path: /metrics
    scrape_interval: 15s
```

The `/metrics` endpoint is public (no authentication required) and returns Prometheus text-exposition format 0.0.4.

## Available Metrics

| Metric | Type | Description |
|--------|------|-------------|
| `friday_tasks_total` | gauge | Total tasks |
| `friday_tasks_in_progress` | gauge | Currently executing tasks |
| `friday_tasks_queue_depth` | gauge | Task queue depth |
| `friday_tasks_success_rate` | gauge | Task success rate (0–1) |
| `friday_cpu_percent` | gauge | Process CPU % |
| `friday_memory_used_mb` | gauge | Heap memory used in MB |
| `friday_tokens_used_today` | counter | Total tokens used today |
| `friday_cost_usd_today` | gauge | Cost in USD today |
| `friday_api_calls_total` | counter | Total AI API calls |
| `friday_api_errors_total` | counter | Total AI API errors |
| `friday_api_latency_avg_ms` | gauge | Average AI API latency (ms) |
| `friday_auth_attempts_total` | counter | Auth attempts |
| `friday_auth_failures_total` | counter | Auth failures |
| `friday_rate_limit_hits_total` | counter | Rate-limit rejections |
| `friday_blocked_requests_total` | counter | Blocked requests |
| `friday_audit_entries_total` | counter | Audit log entries |
| `friday_audit_chain_valid` | gauge | 1 = chain valid, 0 = tampered |
| `friday_uptime_seconds` | gauge | Process uptime |
| `process_heap_bytes` | gauge | V8 heap size |
| `process_rss_bytes` | gauge | Resident set size |
