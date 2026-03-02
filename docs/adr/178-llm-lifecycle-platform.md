# ADR 178 — LLM Lifecycle Platform

**Status:** Accepted
**Date:** 2026-03-01

## Context

Phases 64, 73, 92, and 97 built the ML pipeline mechanics (distillation, fine-tuning, Ollama lifecycle, data curation, evaluation, conversation quality scoring, loss streaming, LLM-as-Judge). This phase closes the remaining operational gaps: preference annotation for DPO, experiment tracking, and the deployment story (one-click deploy, model versions, A/B testing).

## Decision

Implement five new managers in `packages/core/src/training/`:

1. **PreferenceManager** — DPO preference pair CRUD with JSONL export. Sources: annotation, comparison, multi-turn.
2. **DatasetCuratorManager** — Filtered/deduplicated dataset snapshots from conversation data. Joins conversation quality scores, applies token bounds, personality filters, date ranges, and tool-error exclusion.
3. **ExperimentRegistryManager** — Training run registry with hyperparameters, JSONB loss curve append, eval metrics linking, and experiment diff computation.
4. **ModelVersionManager** — Transactional deployment of models to personalities with Ollama alias creation and rollback support. Previous model stored for rollback chain.
5. **AbTestManager** — A/B model shadow routing with traffic splitting, per-conversation consistent assignment, quality score aggregation, and winner evaluation.

### Migration 076

Six new tables in the `training` schema: `preference_pairs`, `curated_datasets`, `experiments`, `model_versions`, `ab_tests`, `ab_test_assignments`.

### A/B Test Chat Interception

Both streaming and non-streaming chat routes inject an A/B test model override after `aiRequest` construction, before the LLM call. The `AbTestManager.resolveModel()` method provides consistent per-conversation assignment.

### Side-by-Side Rating

A dedicated endpoint converts side-by-side winner ratings into preference pairs (source='comparison') for DPO export.

### Dashboard

Three new lazy-loaded sub-tabs in TrainingTab: Preferences (annotation list, DPO export), Experiments (sortable table, loss curve, radar chart, diff view), Deployment (version history, deploy/rollback, A/B test management).

## Consequences

- DPO fine-tuning is now supported end-to-end: annotate → export → train
- Experiments provide full lineage from hyperparameters through eval metrics
- Model deployments are versioned with one-click rollback
- A/B testing enables data-driven model promotion decisions
- 70 new unit tests across 5 manager files
