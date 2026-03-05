# ADR 199 — Cognitive ML Enhancements (Phase 125-D)

**Status:** Accepted
**Date:** 2026-03-04

## Context

Phase 124 introduced ACT-R base-level activation and Hebbian associative learning to the Brain module. While these mathematical models improved memory retrieval ranking, they do not leverage the existing ML infrastructure (embedding provider, vector store) for deeper cognitive capabilities. The Brain has embeddings and an LLM but uses them only for raw similarity search.

Cognitive science offers several evidence-based models that map naturally onto embedding and ML operations:
- **Tulving's Encoding Specificity** — retrieval is best when context matches encoding context
- **Baddeley's Working Memory** — a capacity-limited buffer with predictive attention
- **Damasio's Somatic Markers** — emotional/salience tagging improves recall priority

## Decision

Implement three active features and scaffold three future features:

### Active (Phase 125-D)

1. **Context-Dependent Retrieval** (`context-retrieval.ts`) — Fuse the query embedding with a conversation context centroid using linear interpolation: `searchVec = λ·queryEmb + (1−λ)·contextEmb`. Biases retrieval toward memories encoded in similar conversational contexts. No extra model needed; pure embedding arithmetic.

2. **Working Memory Buffer** (`working-memory.ts`) — Capacity-limited scratchpad (default 7 items, Miller's law) tracking the active cognitive context. Maintains a rolling window of query embeddings and uses recency-weighted trajectory prediction to pre-fetch likely-needed vectors from the store before they are explicitly requested.

3. **Salience Classification** (`salience.ts`) — Classifies memory content against pre-computed anchor embeddings for 5 emotion/urgency dimensions (urgency, error, frustration, success, curiosity). Returns per-dimension scores and a weighted composite. No extra model — cosine similarity against anchors using the existing embedding provider.

### Scaffolded (Future)

4. **LLM Reconsolidation** (`reconsolidation.ts`) — When recalled memories overlap with new context (cosine 0.7–0.95), the LLM decides to keep, update, or split the memory. Types and interface defined.

5. **Semantic Clustering / Schema Formation** (`schema-clustering.ts`) — Periodic k-means clustering over memory embeddings to discover emergent topic groups. LLM-generated cluster labels become knowledge entries. K-means implementation included; pipeline pending.

6. **RL Retrieval Optimization** (`retrieval-optimizer.ts`) — Thompson Sampling (Beta-Bernoulli bandit) learns optimal `compositeScore()` blending weights from user feedback. Arm selection and update logic implemented; integration pending.

## Config

Three new config sections added to `BrainConfigSchema`:

| Config | Key fields | Defaults |
|--------|-----------|----------|
| `contextRetrieval` | `enabled`, `queryWeight` (0.7), `contextWindowSize` (5), `minContextMessages` (2) | disabled |
| `workingMemory` | `enabled`, `capacity` (7), `prefetchLimit` (5), `prefetchThreshold` (0.3), `recencyDecay` (0.8) | disabled |
| `salience` | `enabled`, dimension weights (urgency 0.30, error 0.25, ...), `compositeBlendWeight` (0.1) | disabled |

All three features are opt-in (default disabled) and degrade gracefully — when disabled, existing ACT-R + Hebbian behavior is unchanged.

## Integration Points

- `BrainManager.recall()` — Context-fused vector search when `contextRetrieval.enabled`; working memory buffer feeding and pre-fetch after retrieval
- `BrainManager.remember()` — Salience classification as fire-and-forget metadata
- `BrainManager.feedContext()` / `clearContext()` — Public API for conversation lifecycle
- `BrainManager.getWorkingMemoryItems/Stats()` — Working memory introspection
- `BrainManager.classifySalience()` / `getMemorySalience()` — Salience API
- `BrainManagerDeps` — Extended with optional `contextRetriever`, `workingMemoryBuffer`, `salienceClassifier`
- `VectorMemoryManager.searchMemoriesByVector()` / `searchKnowledgeByVector()` — New methods accepting pre-computed vectors for fused search

## Consequences

- **No new dependencies** — All three active features use existing `EmbeddingProvider` and `VectorStore`
- **No schema migrations** — Salience scores stored in `brain.meta` key-value store
- **Backward compatible** — All features gated by `enabled: false` defaults
- **Performance** — Context fusion adds one extra embedding + one extra vector search per recall. Salience adds one embedding per remember (async). Working memory pre-fetch runs in background.
- **Future extensibility** — Scaffolded modules define clear interfaces for LLM reconsolidation, unsupervised clustering, and RL optimization
