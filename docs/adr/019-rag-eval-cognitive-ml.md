# ADR 019: RAG Evaluation Metrics & Cognitive ML Advanced

**Status**: Accepted
**Date**: 2026-03-05
**Phases**: 140, 141

## Context

SecureYeoman's Brain subsystem had scaffolded but unimplemented cognitive ML components: memory reconsolidation, semantic schema clustering, and RL-based retrieval weight optimization. The RAG pipeline lacked quality metrics beyond basic grounding checks. Both phases were co-developed to share evaluation infrastructure.

## Decisions

### Phase 140: RAG Evaluation Metrics

`brain/rag-eval.ts` — `RagEvalEngine` with five scoring dimensions:

- **Faithfulness** (LLM-as-Judge with token-overlap fallback): Per-sentence verification against context. LLM prompt asks for JSON with faithful/total sentence counts. Falls back to Jaccard token overlap when no AI provider.
- **Answer Relevance**: Embedding cosine similarity between query and answer. Falls back to token overlap.
- **Context Recall**: Fraction of reference answer sentences covered by retrieved contexts (token overlap, threshold 0.15).
- **Context Precision**: Fraction of retrieved contexts relevant to query (embedding similarity >= 0.3, or token overlap >= 0.1 fallback).
- **Chunk Utilization**: Fraction of retrieved chunks whose content appears in the answer (token overlap >= 0.1).
- **Overall**: Mean of available metrics.
- **Retrieval Latency Tracking**: Rolling buffer (10K entries default) with p50/p95/p99 percentile computation.

### Phase 141: Cognitive ML Advanced

#### Reconsolidation Manager (LLM-Powered Memory Evolution)

`brain/reconsolidation.ts` — Wired `evaluate()` and `apply()` with full LLM decision pipeline:

1. Check overlap bounds [overlapThreshold, dedupThreshold] and per-memory cooldown.
2. Prompt AIProvider with memory content + query context for keep/update/split decision.
3. Parse structured JSON response; default to 'keep' on parse failure.
4. `apply()`: 'update' mutates via `storage.updateMemory()`; 'split' creates new memories and deletes original.
5. Stats tracking: evaluated/kept/updated/split/errors.

#### Schema Clustering Manager (Semantic Schema Formation)

`brain/schema-clustering.ts` — Completed the full pipeline in `runClustering()`:

1. Export knowledge entries (up to 5000) and embed via EmbeddingProvider.
2. Run existing `kMeans()` (k-means++ seeding).
3. Filter clusters by `minClusterSize`.
4. Label via LLM (JSON: label + summary) with keyword-extraction fallback.
5. Compute coherence (mean cosine similarity to centroid).
6. Upsert as `schema:{label}` knowledge entries.

#### Retrieval Optimizer Integration

`brain/retrieval-optimizer.ts` was already fully implemented (Thompson Sampling). Now wired into `BrainManager.applyCognitiveRanking()`:

- `optimizer.selectWeights()` provides alpha, hebbianScale, boostCap, salienceWeight for each ranking pass.
- `recordRetrievalFeedback(positive)` exposed to REST API for reward signal.

#### Salience-Boosted compositeScore

`brain/activation.ts` — Added `salienceScore` and `salienceWeight` parameters:

```
score = ((1-alpha)*contentMatch + alpha*sigmoid(activation) + cappedBoost + salienceScore*salienceWeight) * confidence
```

Backward-compatible: new parameters default to 0 and 0.1 respectively.

#### compositeScore Integration in applyCognitiveRanking

`brain/manager.ts` — `applyCognitiveRanking()` now:
- Uses `compositeScore()` instead of raw activation for ranking.
- Builds salience map from cached `salience:{memoryId}` metadata.
- Passes optimizer weights when RetrievalOptimizer is available.

#### BrainManagerDeps Extended

Added `retrievalOptimizer?: RetrievalOptimizer` and `reconsolidationManager?: ReconsolidationManager` to `BrainManagerDeps`.

### REST Endpoints (cognitive-routes.ts)

| Method | Path | Purpose |
|--------|------|---------|
| POST | `/api/v1/brain/rag-eval` | Evaluate RAG quality |
| GET | `/api/v1/brain/rag-eval/latency` | Retrieval latency percentiles |
| GET | `/api/v1/brain/rag-eval/summary` | Full RAG metrics summary |
| POST | `/api/v1/brain/schemas/cluster` | Trigger schema clustering |
| GET | `/api/v1/brain/schemas` | List discovered schemas |
| GET | `/api/v1/brain/retrieval-optimizer/stats` | Optimizer arm stats |
| POST | `/api/v1/brain/retrieval-optimizer/feedback` | Record retrieval feedback |
| GET | `/api/v1/brain/reconsolidation/stats` | Reconsolidation stats |
| GET | `/api/v1/brain/working-memory` | Working memory items + stats |

## Consequences

### Positive

- RAG evaluation enables data-driven retrieval pipeline tuning without manual inspection.
- Faithfulness LLM-as-Judge + token-overlap fallback works with or without AI provider.
- Reconsolidation keeps memory store accurate as context evolves, reducing stale information.
- Schema clustering auto-discovers emergent knowledge patterns across memories.
- Thompson Sampling retrieval optimizer converges on personality-specific weight configurations.
- Salience integration in compositeScore means urgent/emotional content is surfaced faster.
- All new features degrade gracefully: disabled by default, optional deps, fallback paths.

### Negative

- LLM-based reconsolidation and schema labeling add per-operation AI cost (mitigated by cooldowns and batch limits).
- In-memory schema store resets on restart (persistence deferred to future phase).
- Retrieval optimizer state is ephemeral (state persistence deferred).

## Tests

75 tests across 5 files: rag-eval (19), reconsolidation (12), schema-clustering (11), activation (24 total, +2 new), cognitive-routes (9).
