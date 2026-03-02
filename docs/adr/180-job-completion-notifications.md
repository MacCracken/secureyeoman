# ADR 180: Job Completion Notifications + ntfy Channel + Alert Templates

**Status**: Accepted
**Date**: 2026-03-02
**Phase**: 104

## Context

Operators have no way to be notified when workflows, distillation jobs, evaluation runs, or fine-tune jobs complete or fail. The existing AlertManager evaluates MetricsSnapshot every 5s for threshold-based rules, but job completions are discrete events that never appear in the periodic snapshot. Additionally, the alert channel options (Slack, PagerDuty, OpsGenie, webhook) lack a lightweight self-hosted push option.

## Decision

### Synthetic snapshot evaluation

When a job completes or fails, `emitJobCompletion()` builds a synthetic snapshot using the `jobs.<type>.<status>.<field>` namespace and passes it to `alertManager.evaluate()`. This reuses all existing `resolvePath()` + `compareOperator()` infrastructure with zero changes to the evaluation loop.

Failed jobs include an `error: 1` sentinel so rules like `jobs.workflow.failed.error gt 0` fire on any failure.

### ntfy as 5th alert channel

Added `ntfy` to the channel type union. Dispatch sends a plain-text POST to the topic URL with `Title`, `Priority`, and `Tags` headers. Optional Bearer token auth via `routingKey`.

### Rule templates in dashboard

Seven pre-built rule templates across three categories (Workflows, Training, Security) are available via a "From template" dropdown button. Selecting a template pre-populates the rule creation form.

## Metric Path Reference

| Path | Triggered When |
|---|---|
| `jobs.workflow.completed.durationMs` | Workflow succeeds |
| `jobs.workflow.failed.error` | Workflow fails (sentinel=1) |
| `jobs.distillation.completed.samplesGenerated` | Distillation succeeds |
| `jobs.distillation.failed.error` | Distillation fails |
| `jobs.evaluation.completed.exactMatch` | Eval completes (0-1) |
| `jobs.finetune.completed.durationMs` | Fine-tune succeeds |
| `jobs.finetune.failed.error` | Fine-tune fails |

## Consequences

- Job failures and slow runs now surface through the same alert pipeline as threshold-based metrics
- Operators can choose lightweight ntfy push alongside enterprise channels
- No database migration needed — channels are stored as JSONB
- All manager constructors accept an optional `getAlertManager` callback to avoid circular dependencies
- WorkflowEngine receives alertManager directly via deps (initialized later in boot sequence)

## Files Changed

- **New**: `packages/core/src/telemetry/job-completion-events.ts` — event builder + emitter
- **Modified**: `alert-storage.ts`, `alert-manager.ts` — ntfy channel type + dispatch
- **Modified**: `workflow-engine.ts`, `workflow-manager.ts` — alertManager dep + emit calls
- **Modified**: `distillation-manager.ts`, `finetune-manager.ts`, `evaluation-manager.ts` — getAlertManager callback + emit calls
- **Modified**: `secureyeoman.ts` — wiring alertManager to all managers
- **Modified**: Dashboard `types.ts`, `AlertRulesTab.tsx` — ntfy UI + rule templates
- **Tests**: 25 new tests across 6 files
