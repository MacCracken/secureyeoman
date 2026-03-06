# ADR 025 — Chaos Engineering Toolkit

**Status**: Accepted
**Date**: 2026-03-06

## Context

SecureYeoman orchestrates complex workflows that depend on AI providers, external integrations, brain storage, and circuit breakers. Production failures in any of these dependencies can cascade unpredictably. Without controlled fault injection, teams cannot validate that workflows, retry logic, and circuit breakers behave correctly under failure conditions.

The existing resilience infrastructure (circuit breakers in `resilience/circuit-breaker.ts`, retry managers) provides recovery mechanisms but no way to systematically test them.

## Decision

Implement a Chaos Engineering Toolkit that provides controlled fault injection for workflow resilience testing. The toolkit follows the scientific method: define a steady-state hypothesis, inject faults, observe behaviour, and validate the hypothesis.

### Key design choices

- **8 fault types**: latency, error, timeout, resource exhaustion, dependency failure, data corruption, circuit breaker trip, rate limit. Each has a typed configuration schema.
- **7 target types**: workflow_step, ai_provider, integration, brain_storage, external_api, circuit_breaker, message_router. Safe mode restricts to a configurable subset.
- **Experiment lifecycle**: draft → scheduled → running → completed/failed/aborted. Experiments can be paused and resumed.
- **Probabilistic injection**: Each fault rule has a probability (0-1) controlling injection frequency, enabling partial failure simulation.
- **Safety controls**: Max concurrent experiments, max duration, allowed target types, rollback-on-failure flag, abort capability.
- **Result tracking**: Every injection records impact observed, recovery status, and recovery time. Aggregate metrics computed per experiment.

### Directory structure

```
packages/core/src/chaos/
  fault-injector.ts       — executes individual fault injections
  chaos-manager.ts        — orchestrates experiment lifecycle
  chaos-store.ts          — PostgreSQL persistence
  chaos-routes.ts         — REST API (9 endpoints)
  fault-injector.test.ts  — 15 tests
  chaos-manager.test.ts   — 15 tests
  chaos-routes.test.ts    — 13 tests
  chaos-store.test.ts     — 9 tests
```

### API endpoints

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/v1/chaos/experiments` | List experiments |
| GET | `/api/v1/chaos/experiments/:id` | Get experiment |
| POST | `/api/v1/chaos/experiments` | Create experiment |
| POST | `/api/v1/chaos/experiments/:id/run` | Run experiment |
| POST | `/api/v1/chaos/experiments/:id/schedule` | Schedule experiment |
| POST | `/api/v1/chaos/experiments/:id/abort` | Abort experiment |
| DELETE | `/api/v1/chaos/experiments/:id` | Delete experiment |
| GET | `/api/v1/chaos/experiments/:id/results` | Get results |
| GET | `/api/v1/chaos/status` | System status |

## Consequences

**Benefits**:
- Teams can validate resilience before production incidents occur
- Circuit breaker and retry logic gets exercised under controlled conditions
- Experiment results provide quantitative recovery metrics (mean recovery time, recovery rate)
- Safety controls prevent accidental production damage

**Trade-offs**:
- Fault injection adds complexity — must be disabled by default
- Resource exhaustion simulation is approximate (simulated delay, not actual memory pressure)
- Requires careful access control — chaos endpoints are license-gated under `compliance_governance`

## Files

| Path | Purpose |
|------|---------|
| `packages/shared/src/types/chaos-engineering.ts` | Shared Zod schemas and TypeScript types |
| `packages/core/src/chaos/fault-injector.ts` | Fault injection execution engine |
| `packages/core/src/chaos/chaos-manager.ts` | Experiment lifecycle orchestrator |
| `packages/core/src/chaos/chaos-store.ts` | PostgreSQL persistence (PgBaseStorage) |
| `packages/core/src/chaos/chaos-routes.ts` | Fastify REST API registration |
| `packages/core/src/storage/migrations/005_chaos_engineering.sql` | Database schema |
| `docs/guides/chaos-engineering.md` | User guide |
