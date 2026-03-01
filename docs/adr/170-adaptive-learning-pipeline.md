# ADR 170: Adaptive Learning Pipeline (Phase 92)

**Status**: Accepted
**Date**: 2026-03-01
**Phase**: 92

---

## Context

The Phase 64/73 training pipeline produced distillation datasets via uniform random sampling
and evaluated models with a single character-level Jaccard metric. Three gaps remained:

1. **Sampling bias** — High-value failure conversations were sampled at the same rate as
   routine ones, wasting teacher-LLM budget on already-understood interactions.
2. **Evaluation blindness** — Character Jaccard cannot distinguish between two responses
   that pick different tools, or produce identical tool names but wrong arguments.
3. **Training observability** — The TrainingTab displayed only static progress bars with no
   real-time visibility into loss, throughput, or reward trends.

---

## Decision

### 1. Priority-Weighted Distillation Sampling

Introduce a `training.conversation_quality` table (migration 070) that stores a
`quality_score ∈ [0, 1]` per conversation. Lower scores indicate higher training value:

- **Formula**: `score = 0.5 - 0.30*(outcome='failed') - 0.15*n_correction_phrases - 0.10*max(0, inj-0.5)`
- Three `priorityMode` values: `failure-first` (ASC score join), `success-first` (DESC),
  `uniform` (no join, default).

### 2. Curriculum Ordering

When `curriculumMode=true`, conversations are binned into four stages by message count and
processed quota-first: 25% Stage 1 (≤4 messages), then Stage 2–4 sequentially.

### 3. Counterfactual Synthetic Data

When `counterfactualMode=true`, failed conversations are re-submitted to the teacher LLM
with a recovery system prompt. Synthetic samples are tagged `"synthetic": true` in JSONL
metadata. Limited by `maxCounterfactualSamples`.

### 4. Factored Tool-Call Evaluation Metrics

`EvaluationManager.runEvaluation()` now computes:

| Metric | Description |
|--------|-------------|
| `tool_name_accuracy` | Fraction of responses selecting the correct tool |
| `tool_arg_match` | Average per-argument precision across all tool calls |
| `outcome_correctness` | Sandbox-verified end-state match (when `sandboxFn` provided) |
| `semantic_similarity` | Cosine similarity of Ollama embeddings (when enabled) |

### 5. TrainingStreamBroadcaster + Live SSE Endpoint

An `EventEmitter` singleton (`trainingStream`) receives events from:
- `DistillationManager` — `throughput` + `agreement` every 10 samples
- `FinetuneManager` — `loss` when parsed from container logs
- Training routes — `reward` on computer-use episode record

`GET /api/v1/training/stream` is an SSE endpoint that forwards events to connected browsers.

### 6. Computer-Use Episode Management

`training.computer_use_episodes` (migration 071) stores RL state→action→reward tuples from
the Tauri desktop client. `ComputerUseManager` provides CRUD, per-skill breakdown, session
stats, and paginated JSONL export.

### 7. ConversationQualityScorer

Background service (5-min interval) that auto-scores new conversations. Exposes:
- `scoreNewConversations(pool)` — bulk score up to 200 at a time
- `applyPrefailureBoost(pool, workflowRunId)` — called from pipeline-lineage on failure,
  lowers quality_score to 25% floor so those conversations get sampled first

### 8. Dashboard

Two new sub-tabs added to `TrainingTab`:

**Live** — SSE `EventSource`, rolling `LineChart` for loss + reward, throughput/agreement
KPI cards, quality heatmap (color-coded by `quality_score`).

**Computer Use** — stat cards, skill breakdown table, session replay viewer with action list
and reward chips.

**Distillation form** — Priority Mode `<select>`, Curriculum mode checkbox, Counterfactual
mode checkbox + sample count input.

**EvalResultRadarCard** — `RadarChart` showing all four factored metrics axes.

---

## Consequences

### Positive

- Failure-first sampling reduces teacher-LLM API cost per quality improvement unit.
- Factored tool-call metrics surface systematic tool-selection errors invisible to Jaccard.
- Counterfactual data augments scarce failure examples without additional human labeling.
- Live SSE stream enables early stopping based on loss plateau or throughput drop.
- Computer-use episodes provide an audit trail for Tauri desktop automation quality.

### Negative / Trade-offs

- `training.conversation_quality` requires the background scorer to run before sampling
  benefits take effect (cold-start: first run uses 50% default score for unscored convs).
- Semantic similarity via Ollama is optional and adds latency; disabled by default.
- Counterfactual generation increases teacher-LLM cost; cap via `maxCounterfactualSamples`.

---

## Migrations

| # | Table | Purpose |
|---|-------|---------|
| 070 | `training.conversation_quality` | Per-conversation quality scores |
| 071 | `training.computer_use_episodes` | Desktop RL episode storage |

---

## Auth Routes Added

```
GET  /api/v1/training/stream                        training:read
GET  /api/v1/training/quality                       training:read
POST /api/v1/training/quality/score                 training:write
GET  /api/v1/training/computer-use/episodes         training:read
POST /api/v1/training/computer-use/episodes         training:write
GET  /api/v1/training/computer-use/stats            training:read
DELETE /api/v1/training/computer-use/episodes/:id   training:write
```

---

## Test Coverage

| File | Tests |
|------|-------|
| `conversation-quality-scorer.test.ts` | 16 |
| `computer-use-manager.test.ts` | 17 |
| `distillation-manager.test.ts` (+15) | 25 total |
| `evaluation-manager.test.ts` (+24) | 37 total |
| `training-phase92-routes.test.ts` | 20 |
| **New total** | **222 training tests** |
