# Cognitive ML Memory Enhancements

> Phase 125-D — Context-Dependent Retrieval, Working Memory, and Salience Classification

SecureYeoman's Brain module uses AI/ML techniques from cognitive science to improve memory retrieval beyond simple keyword and vector similarity search. These features build on the ACT-R activation and Hebbian learning from Phase 124.

## Overview

| Feature | Cognitive Model | ML Technique | Config Key |
|---------|----------------|-------------|------------|
| Context-Dependent Retrieval | Tulving's Encoding Specificity | Embedding fusion | `brain.contextRetrieval` |
| Working Memory Buffer | Baddeley's Working Memory | Trajectory prediction | `brain.workingMemory` |
| Salience Classification | Damasio's Somatic Markers | Anchor embedding similarity | `brain.salience` |

All features are **opt-in** (disabled by default) and require the vector memory system to be enabled.

## Context-Dependent Retrieval

Retrieval is most effective when the search context matches the context in which the memory was encoded. Instead of searching with just the query embedding, the system fuses it with a conversation context centroid:

```
searchVector = λ · queryEmbedding + (1−λ) · contextCentroid
```

The context centroid is the mean of the last N message embeddings in the conversation. This biases results toward memories that were created during similar conversational topics.

### Configuration

```json
{
  "brain": {
    "contextRetrieval": {
      "enabled": true,
      "queryWeight": 0.7,
      "contextWindowSize": 5,
      "minContextMessages": 2
    }
  }
}
```

- **queryWeight** (0.0–1.0): Higher values favor the literal query; lower values favor context. Default 0.7.
- **contextWindowSize**: Number of recent messages to include in the context window. Default 5.
- **minContextMessages**: Minimum messages before context fusion activates. Below this threshold, raw query embedding is used. Default 2.

### API

```typescript
// Feed conversation messages for context tracking
await brain.feedContext("user's message about database performance");
await brain.feedContext("assistant's response about indexing strategies");

// Subsequent recalls automatically use context-fused search
const memories = await brain.recall({ search: "slow queries" });
// Results are biased toward database/performance memories

// Clear context on conversation reset
brain.clearContext();
```

## Working Memory Buffer

A capacity-limited scratchpad (default 7 items, from Miller's 7±2 law) that tracks the most relevant items for the current conversation. Includes predictive pre-fetching based on embedding trajectory analysis.

### How It Works

1. Each query embedding is added to a rolling trajectory window
2. A recency-weighted centroid predicts the next likely topic
3. The vector store is searched with the predicted embedding
4. Matching items are cached for instant access on the next query

### Configuration

```json
{
  "brain": {
    "workingMemory": {
      "enabled": true,
      "capacity": 7,
      "prefetchLimit": 5,
      "prefetchThreshold": 0.3,
      "recencyDecay": 0.8,
      "minQueriesForPrediction": 2
    }
  }
}
```

- **capacity**: Maximum items in the buffer. Excess items are evicted by lowest score. Default 7.
- **prefetchLimit**: Number of items to pre-fetch per prediction cycle. Default 5.
- **prefetchThreshold** (0.0–1.0): Minimum similarity score for pre-fetched items. Default 0.3.
- **recencyDecay** (0.0–1.0): Exponential decay factor for trajectory weighting (newer = heavier). Default 0.8.
- **minQueriesForPrediction**: Minimum queries in the trajectory before prediction activates. Default 2.

### API

```typescript
// Check what's in working memory
const items = brain.getWorkingMemoryItems();
// [{ id, content, score, source: 'retrieval' | 'prefetch' }]

// Get buffer stats
const stats = brain.getWorkingMemoryStats();
// { size: 5, prefetchSize: 3, trajectorySize: 4 }
```

## Salience Classification

Classifies memory content against anchor embeddings for 5 emotion/urgency dimensions. Memories with high salience scores are prioritized during retrieval. No extra model is needed — the existing embedding provider computes cosine similarity against pre-defined anchor texts.

### Dimensions

| Dimension | What it detects | Default Weight |
|-----------|----------------|---------------|
| Urgency | Time-sensitive, critical, blocking situations | 0.30 |
| Error | Bugs, crashes, failures, security breaches | 0.25 |
| Frustration | User confusion, disappointment, stuck states | 0.15 |
| Success | Breakthroughs, completions, positive outcomes | 0.15 |
| Curiosity | Exploratory questions, learning intent | 0.15 |

### Configuration

```json
{
  "brain": {
    "salience": {
      "enabled": true,
      "urgencyWeight": 0.30,
      "errorWeight": 0.25,
      "frustrationWeight": 0.15,
      "successWeight": 0.15,
      "curiosityWeight": 0.15,
      "compositeBlendWeight": 0.1
    }
  }
}
```

### API

```typescript
// Classify text salience on demand
const scores = await brain.classifySalience("the server is down and customers are affected");
// { urgency: 0.85, error: 0.72, frustration: 0.61, success: 0.1, curiosity: 0.05, composite: 0.68 }

// Retrieve cached salience for a stored memory
const cached = await brain.getMemorySalience(memoryId);
```

## Future Features (Scaffolded)

> **Note:** These features are scaffolded for future development and are not yet active.

The following features have types and interfaces defined but are not yet active:

### LLM Reconsolidation
When a recalled memory overlaps with new context (cosine 0.7–0.95), the LLM decides whether to keep, update, or split the memory. Mirrors biological memory reconsolidation where recalled memories become labile.

### Semantic Schema Clustering
Periodic k-means clustering over memory embeddings discovers emergent topic groups. LLM-generated cluster labels become first-class knowledge entries. The k-means algorithm is implemented; the full pipeline is pending.

### RL Retrieval Optimization
Thompson Sampling (Beta-Bernoulli bandit) learns optimal retrieval scoring weights from user feedback. Automatically tunes the balance between content match, ACT-R activation, Hebbian boost, and salience for each personality.

## Architecture

```
Query
  │
  ├─ Context Retriever ──── fuse query + context embeddings
  │                             │
  │                             ▼
  ├─ Vector Search ◄──── context-fused vector
  │       │
  │       ▼
  ├─ Working Memory ──── add results, run pre-fetch
  │       │
  │       ▼
  ├─ Cognitive Ranking ── ACT-R activation + Hebbian boost
  │       │
  │       ▼
  └─ Results (salience metadata attached)
```

All three features compose with the existing ACT-R activation and Hebbian learning from Phase 124. They run at different points in the retrieval pipeline and can be enabled independently.
