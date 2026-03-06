# ADR 210: OpenTelemetry & SIEM Integration

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 139

## Context

SecureYeoman has basic OpenTelemetry tracing (HTTP request spans via Fastify plugin, AI provider call spans) and Prometheus metrics export. Enterprise customers require deeper distributed tracing across workflow steps, brain operations, and sub-agent delegations. SIEM integration is a procurement checkbox — Prometheus alone is insufficient when security teams mandate centralized event correlation in Splunk, Elasticsearch, Azure Sentinel, or CloudWatch. Cost attribution per tenant/personality/workflow is needed for chargeback reporting. SLO monitoring with burn-rate alerting provides proactive reliability management.

## Decisions

### Deep OTel Instrumentation

- `telemetry/instrument.ts`: `withSpan()` utility wraps async functions in OTel spans with automatic error recording, status setting, and span lifecycle management. `getCurrentSpanId()` for log correlation.
- **Workflow engine**: Each `dispatchStep()` call is wrapped in a `workflow.step` span with attributes: `workflow.id`, `workflow.run_id`, `workflow.step_id`, `workflow.step_name`, `workflow.step_type`, `workflow.attempt`, `workflow.step_status`.
- **Brain manager**: `remember()` and `recall()` wrapped in `brain.remember` / `brain.recall` spans. Recall spans include `brain.result_count`, `brain.query` (truncated to 100 chars), `brain.personality_id`.
- **AI client** (already existed Phase 83): `ai.chat` spans with provider, model, tokens, latency, stop reason.
- **MCP client** (already existed): `mcp.tool` spans with tool name, server ID, latency.

### Trace Sampling Configuration

- `TelemetryConfig.samplingRate` (0.0–1.0, default 1.0) controls head-based sampling via `TraceIdRatioBasedSampler`.
- Config schema: `metrics.otel.samplingRate` in `OpsDomainConfigSchema`.

### Trace-Aware Logging

- Pino ECS formatter now includes `span.id` alongside existing `trace.id` and `transaction.id` for complete log-to-trace correlation.

### SIEM Log Forwarding

Four SIEM providers in `telemetry/siem/`:

- **Splunk HEC** (`splunk-hec.ts`): POST newline-delimited JSON to HEC endpoint with `Splunk <token>` auth. Configurable index and sourcetype.
- **Elasticsearch ECS** (`elastic-ecs.ts`): Bulk API with ECS field mapping. API key or basic auth. Severity mapped to ECS numeric levels (1–4).
- **Azure Sentinel** (`azure-sentinel.ts`): Data Collection API (DCR-based) with CEF severity mapping (3/5/8/10). Bearer token auth.
- **CloudWatch** (`cloudwatch.ts`): PutLogEvents API with SigV4 signing. Log group/stream naming.

All providers share the `SiemForwarder` batch buffer:
- Configurable `batchSize` (default 50) and `flushIntervalMs` (default 5s).
- Auto-flush on batch size threshold.
- Stats tracking: forwarded/errors/dropped/pending counts.
- Graceful shutdown with final flush.

### Audit Chain → SIEM Bridge

- `audit-siem-bridge.ts`: Maps audit chain events and DLP egress events to SIEM severity levels.
- Critical: `auth_lockout`, `injection_attempt`, `audit_chain_tampered`.
- High: `auth_failure`, `permission_denied`, `dlp_blocked`, `classification_restricted`.
- Medium: config changes, role changes, `dlp_warned`, `workflow_failed`.
- Low: normal operations (`auth_success`, `ai_request`, `workflow_completed`).
- Enriches events with `traceId`, `spanId`, `correlationId`, `tenantId`, `userId`.

### Cost Attribution

- `cost-attribution.ts`: In-memory tracker for per-tenant, per-personality, per-workflow, per-provider, per-model cost breakdowns.
- Budget system with daily/monthly thresholds and exceeded detection.
- CSV export for chargeback reporting.
- Capped at 100K entries with FIFO eviction.

### SLO Monitoring

- `slo-monitor.ts`: Define SLOs for `response_latency_p95/p99`, `tool_success_rate`, `ai_success_rate`, `retrieval_quality`.
- Sliding window observation tracking with configurable window size.
- Error budget computation with burn-rate alerting.
- Burn rate calculated from short window (20% of total) vs long window ratio.
- Fires alerts through existing AlertManager channels when burn rate exceeds threshold.

## Configuration

```typescript
MetricsConfigSchema.siem = {
  enabled: boolean,        // default false
  provider: 'splunk' | 'elastic' | 'azure-sentinel' | 'cloudwatch',
  endpoint: string,
  token: string,
  index: string,
  region: string,          // CloudWatch
  logGroupName: string,    // CloudWatch
  logStreamName: string,   // CloudWatch
  ruleId: string,          // Azure Sentinel DCR
  streamName: string,      // Azure Sentinel
  batchSize: number,       // default 50
  flushIntervalMs: number, // default 5000
}

MetricsConfigSchema.otel = {
  samplingRate: number,    // 0.0-1.0, default 1.0
}
```

## REST Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/observability/cost-attribution` | Cost summary by tenant |
| GET | `/api/v1/observability/cost-attribution/csv` | CSV chargeback export |
| GET | `/api/v1/observability/budgets` | Budget status |
| POST | `/api/v1/observability/budgets` | Create budget |
| DELETE | `/api/v1/observability/budgets/:id` | Remove budget |
| GET | `/api/v1/observability/slos` | Evaluate SLOs |
| POST | `/api/v1/observability/slos` | Define SLO |
| DELETE | `/api/v1/observability/slos/:id` | Remove SLO |
| GET | `/api/v1/observability/siem/status` | SIEM health |

All routes gated by `advanced_observability` licensed feature.

## Consequences

### Positive

- Enterprise SIEM integration unblocks procurement deals requiring centralized event correlation.
- Deep OTel spans across AI calls, workflow steps, and brain operations enable end-to-end distributed tracing.
- Cost attribution enables multi-tenant chargeback and budget enforcement.
- SLO monitoring with burn-rate alerting catches reliability degradation before SLA breach.
- `withSpan()` utility makes future instrumentation trivial — single-line additions.

### Negative

- Four SIEM providers increase surface area for credential management.
- In-memory cost tracking (100K entry cap) means data lost on restart — persistence deferred to future work.
- OTel SDK dynamic import adds ~50ms to startup when tracing is enabled.

## Tests

134 tests across 15 files: instrument utility (5), SIEM forwarder (7), Splunk HEC (4), Elastic ECS (4), Azure Sentinel (3), CloudWatch (4), audit bridge (7), SLO monitor (12), cost attribution (12), observability routes (9), plus existing telemetry tests (67).
