# ADR 177 — LLM-as-Judge Evaluation

**Status:** Accepted
**Date:** 2026-03-01
**Phase:** 97

## Context

Phase 73 delivered the ML pipeline mechanics (distillation, finetune, lineage). Phase 92 added tool-call metrics and conversation quality scoring. What was missing was a **qualitative signal layer** — an LLM judge that rates responses on multiple dimensions, compares model versions head-to-head, and auto-gates finetune deployments before they reach production.

Inspired by Google Vertex AI Evaluation Service and Azure AI Evaluation SDK, this phase adds structured evaluation primitives that integrate with the existing training pipeline.

## Decision

### 1. Pointwise Evaluation (5 Dimensions)

An LLM judge rates each response on a 1-5 scale across five dimensions:
- **Groundedness**: factual accuracy relative to the prompt
- **Coherence**: logical structure and internal consistency
- **Relevance**: how well the response addresses what was asked
- **Fluency**: grammatical correctness and naturalness
- **Harmlessness**: absence of harmful, biased, or inappropriate content

Scores are stored per-sample in `training.eval_scores` and aggregated into `EvalRunSummary` records.

### 2. Pairwise Comparison

Two models are evaluated side-by-side on the same dataset. To mitigate position bias, the presentation order is randomized per sample. The judge returns a winner (a/b/tie) with a reason. Results are stored in `training.pairwise_results`.

### 3. Auto-Eval Gating

When a finetune job completes, an optional auto-eval callback runs pointwise evaluation against a configured dataset. If average groundedness or coherence falls below configurable thresholds, the deployment is blocked and a notification is sent.

### 4. Versioned Datasets

Eval datasets are versioned via SHA-256 content hash. Creating a dataset with identical samples returns the existing record (idempotent). This ensures reproducible evaluation runs.

### 5. Architecture

- **`LlmJudgeManager`**: Core class with dataset CRUD, pointwise eval, pairwise comparison, and auto-eval gate
- **`FinetuneManager.onJobComplete`**: Optional callback invoked after successful container exit
- **12 REST endpoints** under `/api/v1/training/judge/*` with `training:read/write` permissions
- **Dashboard**: `EvaluationTab` with dataset management, radar chart for dimensions, bar chart for win rates

## Consequences

### Positive
- Structured quality signals beyond simple metrics
- Head-to-head model comparison with position-bias mitigation
- Automated deployment gating reduces risk of shipping degraded models
- Content-hash deduplication prevents redundant evaluation runs

### Negative
- Judge model quality affects evaluation reliability
- Additional LLM API costs for judge calls
- Async evaluation adds latency between finetune completion and deployment decision
