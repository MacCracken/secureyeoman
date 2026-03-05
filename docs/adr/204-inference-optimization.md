# ADR 204: Inference Optimization (Phase 132)

## Status

Accepted

## Context

Production deployments face latency and cost challenges when serving LLM responses at scale. Repeated or semantically similar queries waste compute. Cold model loading adds seconds of latency to the first request. Batch processing workloads (evaluation, distillation, bulk analysis) need throughput-optimized paths rather than single-request latency optimization.

## Decisions

### Batch Inference

A `BatchInferenceWorker` processes arrays of prompts with configurable concurrency via `p-limit`. Each batch job tracks progress (completed/total/failed counts) and streams results to a JSONL output file. The worker respects provider rate limits and implements exponential backoff on 429 responses. Jobs are created via REST API and CLI, with progress queryable by job ID. Results are stored in the existing job storage with `type: 'batch-inference'`.

### Semantic Cache

A vector-backed response cache uses pgvector to store prompt embeddings alongside cached responses. On each inference request, the cache computes the prompt embedding and searches for existing entries above a cosine similarity threshold (default 0.92). Cache hits return the stored response with a `x-cache: hit` header. Cache entries have a configurable TTL (default 24 hours) and are scoped per personality to prevent cross-contamination. A background worker prunes expired entries hourly.

Configuration lives in `InferenceCacheConfigSchema` with fields: `enabled`, `similarityThreshold`, `ttlSeconds`, `maxEntries`.

### KV Cache Warming

A `ModelWarmer` service pre-loads models into Ollama's KV cache by sending a minimal chat request (`num_predict: 1`) with `keep_alive` set to the desired duration. Warming is triggered on application startup for models listed in the active personality configurations and can be invoked manually via API. The warmer runs requests sequentially to avoid VRAM contention.

### Speculative Decoding (Scaffold)

A `draftModel` field is added to `ModelConfig` to designate a smaller model for speculative decoding. Phase 132 does not implement the decoding logic; it only stores the configuration and validates that the draft model exists. Actual speculative decoding integration with Ollama or vLLM is deferred to Phase 132-B pending upstream support.

## Consequences

### Positive

- Batch inference provides throughput-optimized processing for evaluation and bulk workloads.
- Semantic cache eliminates redundant LLM calls for similar queries, reducing cost and latency.
- KV cache warming removes cold-start latency for frequently used models.
- The speculative decoding scaffold establishes the configuration path for future latency improvements.

### Negative

- Semantic cache requires embedding computation on every request, adding a few milliseconds of overhead even on cache misses.
- Cache similarity threshold tuning is domain-dependent; too low returns stale answers, too high misses valid matches.
- KV warming consumes VRAM for the duration of the keep_alive window, reducing capacity for other models.
- Batch inference jobs can saturate provider rate limits, potentially impacting interactive users.
