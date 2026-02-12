# ADR 006: A/B Testing Framework

## Status

Accepted

## Context

Teams need to compare model performance, prompt templates, or configuration changes in a controlled manner. Manual A/B testing (spinning up separate environments) is slow and lacks automated metric collection.

## Decision

Build an experiment management framework with `ExperimentManager`:

1. **Experiment** — Named test with multiple variants (control + treatments), traffic allocation, and duration
2. **Variant** — Configuration snapshot (model, prompt template, temperature, etc.) with assigned traffic percentage
3. **ExperimentManager** — Traffic routing logic, metric collection, statistical significance tests

### Implementation

- SQLite tables: `experiments` (id, name, status, startedAt, endedAt), `experiment_variants` (id, experimentId, config, trafficPercent), `experiment_metrics` (experimentId, variantId, taskId, latency, cost, success)
- Routing: `AIClient.execute()` checks active experiments, assigns variant based on hash(userId) % 100, logs metrics
- REST API: `/api/v1/experiments/` for CRUD, `/api/v1/experiments/:id/results` for aggregated stats
- Dashboard: Experiments page with variant comparison charts (latency, cost, success rate, p-values)

## Consequences

- Data-driven model and configuration tuning
- Experiment metrics add ~50 bytes per task to SQLite storage
- Traffic routing introduces <1ms overhead per request (hash + lookup)
- Requires sufficient task volume for statistical significance (recommend 100+ tasks per variant)
- Cleanup job required to purge metrics from completed experiments after retention period
