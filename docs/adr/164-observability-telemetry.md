# ADR 164 — Observability & Telemetry (Phase 83)

**Status**: Accepted
**Date**: 2026-02-28

## Context

SecureYeoman had foundational observability primitives (Pino logging, Prometheus formatter, correlation IDs, WebSocket metrics broadcast) but lacked:

1. OpenTelemetry distributed tracing
2. An alert-rules engine with external notification channels
3. A standard `/metrics` Prometheus endpoint (only `/prom/metrics` existed)
4. W3C traceparent propagation on A2A calls
5. Elastic Common Schema (ECS) log format for Loki/Elasticsearch ingestion
6. Grafana dashboard bundles for ops teams

## Decision

### OpenTelemetry

- Add `@opentelemetry/api` as a regular dependency (lightweight, always present).
- Dynamically import `@opentelemetry/sdk-trace-node` + `@opentelemetry/exporter-trace-otlp-grpc` only when `OTEL_EXPORTER_OTLP_ENDPOINT` env var is set.
- `getTracer()` returns the global API tracer which is a no-op when the SDK is not initialized — callers never need to branch.
- `initTracing()` is idempotent and called at Step 1 of `SecureYeoman.initialize()`.

### Fastify OTEL Plugin

- Wraps each HTTP request in an active span using `onRequest` / `onResponse` / `onError` hooks.
- Injects `X-Trace-Id` response header when a non-zero trace ID exists.
- Registered before the auth hook so all routes are covered.

### Prometheus `/metrics` Endpoint

- Adds standard `/metrics` path (convention used by Kubernetes scrape configs and Prometheus Operator).
- `/prom/metrics` retained for backwards compatibility.
- Both are unauthenticated (public) in `PUBLIC_ROUTES`.

### Alert Rules Engine

- `telemetry.alert_rules` table (migration 069) stores rules with metric path (dot-notation into `MetricsSnapshot`), operator, threshold, channel config, cooldown.
- `AlertManager.evaluate()` called from the 5-second metrics broadcast loop.
- Cooldown prevents alert storms. Cache of enabled rules refreshed every 30s (invalidated on CRUD).
- External channels: Slack webhook, PagerDuty Events API v2, OpsGenie, generic webhook — all fire-and-forget.
- `POST /api/v1/alerts/rules/:id/test` bypasses cooldown for on-demand testing.

### A2A Trace Propagation

- `RemoteDelegationTransport.send()` injects `traceparent` W3C header using the active span context.
- `POST /api/v1/a2a/receive` extracts `traceparent` and adds it to the request's child logger for correlation.

### Correlation ID Log Enrichment

- Auth hook enriches `request.log` with `userId` and `role` after successful token/API-key validation.

### ECS Log Format

- When `LOG_FORMAT=ecs` env var is set, Pino formatters produce Elastic Common Schema fields (`@timestamp`, `log.level`, `trace.id`, `transaction.id`, `service.name`).
- Three supported values: `pretty` (dev), `json` (prod default), `ecs`.

## Consequences

- **Positive**: End-to-end trace correlation in Jaeger/Tempo, metric alerting, standard Prometheus scraping, Loki-compatible ECS logs, Grafana dashboards out of the box.
- **Negative**: Small startup overhead from `initTracing()` when OTLP endpoint is set. Alert rule evaluation adds minimal latency to the metrics broadcast loop.
- **Risk**: The OTel SDK packages are dynamically imported, so they are not bundled into the Bun binary. Operators who want tracing must ensure the packages are available at runtime (i.e., not using the compiled binary).

## Alternatives Considered

- **Static import of OTel SDK**: Would bloat the binary by ~3MB and force all deployments to carry tracing overhead. Rejected.
- **OpenMetrics format**: Would require a separate formatter and break existing Grafana provisioning. Deferred.
- **Server-side alert persistence in SQLite**: PostgreSQL was chosen to be consistent with all other Phase 6x+ storage (and enables multi-replica setups). SQLite would require per-instance rule management.
