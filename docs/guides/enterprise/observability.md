# Observability & Telemetry Guide

This guide covers SecureYeoman's observability stack: OpenTelemetry distributed tracing, Prometheus metrics, alert rules, ECS log format, and Grafana dashboards.

## Prometheus Metrics

SecureYeoman exposes a Prometheus scrape endpoint at `/metrics` (unauthenticated):

```
GET http://<host>:18789/metrics
Content-Type: text/plain; version=0.0.4; charset=utf-8
```

A legacy alias also exists at `/prom/metrics`.

### Scrape Config

```yaml
scrape_configs:
  - job_name: secureyeoman
    static_configs:
      - targets: ['secureyeoman:18789']
    metrics_path: /metrics
    scrape_interval: 15s
```

### Available Metrics

All metrics are prefixed `friday_`. See `docs/ops/grafana/README.md` for the full table.

---

## OpenTelemetry Distributed Tracing

### Enable

Set the `OTEL_EXPORTER_OTLP_ENDPOINT` environment variable before starting SecureYeoman:

```bash
export OTEL_EXPORTER_OTLP_ENDPOINT=http://otel-collector:4317
export OTEL_SERVICE_NAME=secureyeoman        # optional, defaults to "secureyeoman"
```

SecureYeoman will dynamically load the OTLP gRPC exporter and create spans for every HTTP request.

### X-Trace-Id Header

Every API response includes an `X-Trace-Id` header when a trace is active. Use this to look up the request in Jaeger/Tempo:

```
X-Trace-Id: 4bf92f3577b34da6a3ce929d0e0e4736
```

### A2A Trace Propagation

When SecureYeoman delegates tasks to remote A2A peers, it injects a W3C `traceparent` header into the outbound request:

```
traceparent: 00-<traceId>-<spanId>-01
```

The receiving peer logs the `traceparent` value at the `debug` level for correlation.

### Docker Compose Example

```yaml
services:
  secureyeoman:
    environment:
      OTEL_EXPORTER_OTLP_ENDPOINT: http://otel-collector:4317

  otel-collector:
    image: otel/opentelemetry-collector-contrib:latest
    volumes:
      - ./otel-config.yaml:/etc/otel-collector-config.yaml
    command: ["--config=/etc/otel-collector-config.yaml"]

  jaeger:
    image: jaegertracing/all-in-one:latest
    ports:
      - "16686:16686"
```

---

## Alert Rules

Alert rules evaluate MetricsSnapshot values every 5 seconds and dispatch to external channels when thresholds are crossed.

### Dashboard

Go to **Developers → Alert Rules** to manage rules via the UI.

### API

```
GET    /api/v1/alerts/rules
POST   /api/v1/alerts/rules
GET    /api/v1/alerts/rules/:id
PATCH  /api/v1/alerts/rules/:id
DELETE /api/v1/alerts/rules/:id
POST   /api/v1/alerts/rules/:id/test
```

### Create a Rule

```bash
curl -X POST http://localhost:18789/api/v1/alerts/rules \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "High rate limit hits",
    "metricPath": "security.rateLimitHitsTotal",
    "operator": "gt",
    "threshold": 500,
    "cooldownSeconds": 300,
    "enabled": true,
    "channels": [
      { "type": "slack", "url": "https://hooks.slack.com/services/..." }
    ]
  }'
```

### Metric Paths

Use dot-notation into the `MetricsSnapshot` shape:

| Path | Description |
|------|-------------|
| `security.rateLimitHitsTotal` | Rate-limit rejections |
| `security.authFailuresTotal` | Auth failures |
| `security.blockedRequestsTotal` | Blocked requests |
| `tasks.queueDepth` | Task queue depth |
| `tasks.inProgress` | Tasks in progress |
| `resources.cpuPercent` | CPU % |
| `resources.memoryUsedMb` | Memory used (MB) |
| `resources.apiErrorsTotal` | AI API errors |
| `resources.costUsdToday` | Cost today (USD) |

### Operators

`gt` (>), `lt` (<), `gte` (≥), `lte` (≤), `eq` (=)

### Channel Configuration

#### Slack

```json
{ "type": "slack", "url": "https://hooks.slack.com/services/T.../B.../..." }
```

#### PagerDuty

```json
{ "type": "pagerduty", "routingKey": "<integration-key>" }
```

#### OpsGenie

```json
{ "type": "opsgenie", "routingKey": "<genie-key>" }
```

#### Webhook

```json
{ "type": "webhook", "url": "https://your-service.example.com/webhook" }
```

The webhook receives:
```json
{
  "rule": { "id": "...", "name": "...", "metricPath": "...", "operator": "gt", "threshold": 500 },
  "value": 523,
  "snapshot_timestamp": 1700000000000
}
```

### Test-Fire

```bash
curl -X POST http://localhost:18789/api/v1/alerts/rules/<id>/test \
  -H "Authorization: Bearer $TOKEN"
```

Returns `{ "fired": true, "value": 523 }` or `{ "fired": false, "value": 12 }`.

---

## ECS Log Format

For Loki or Elasticsearch ingestion, set `LOG_FORMAT=ecs` in the environment:

```bash
export LOG_FORMAT=ecs
```

Logs will include Elastic Common Schema fields:

```json
{
  "@timestamp": "2026-02-28T12:00:00.000Z",
  "log.level": "info",
  "message": "Chat request processed",
  "service.name": "secureyeoman",
  "trace.id": "4bf92f3577b34da6a3ce929d0e0e4736",
  "transaction.id": "a8e71b3c"
}
```

### Loki Label Configuration

```yaml
# promtail config
pipeline_stages:
  - json:
      expressions:
        level: log.level
        trace_id: trace.id
        service: service.name
  - labels:
      level:
      service:
```

### Search by Trace ID in Loki

```logql
{service="secureyeoman"} | json | trace_id = "4bf92f3577b34da6a3ce929d0e0e4736"
```

---

## Correlation IDs

Every request is assigned a correlation ID via `AsyncLocalStorage`. It is logged on each request and included in audit events.

The auth middleware enriches the Fastify request logger with `userId` and `role` after authentication, so all handler logs carry these fields automatically.

---

## Grafana Dashboards

Two pre-built dashboards are in `docs/ops/grafana/`:

| Dashboard | File |
|-----------|------|
| Overview | `secureyeoman-overview.json` |
| Alerts & Incidents | `secureyeoman-alerts.json` |

Import via **Dashboards → New → Import**. See `docs/ops/grafana/README.md` for full instructions.
