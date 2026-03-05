# Inference Optimization Guide

This guide covers batch inference, semantic caching, KV cache warming, and the speculative decoding roadmap introduced in Phase 132.

## Semantic Cache

The semantic cache intercepts inference requests and returns cached responses for semantically similar prompts, reducing latency and cost.

### Configuration

Add to your soul configuration:

```json
{
  "inference": {
    "cache": {
      "enabled": true,
      "similarityThreshold": 0.92,
      "ttlSeconds": 86400,
      "maxEntries": 50000
    }
  }
}
```

| Field                 | Default | Description                                      |
|-----------------------|---------|--------------------------------------------------|
| `enabled`             | `false` | Enable semantic response caching                 |
| `similarityThreshold` | `0.92`  | Cosine similarity minimum for cache hit          |
| `ttlSeconds`          | `86400` | Cache entry lifetime (24 hours)                  |
| `maxEntries`          | `50000` | Maximum cached entries before LRU eviction        |

### How It Works

1. Incoming prompt is embedded using the configured embedding model.
2. pgvector cosine similarity search finds the nearest cached entry.
3. If similarity >= threshold and the entry is not expired, the cached response is returned with `x-cache: hit`.
4. On cache miss, the LLM is called normally and the response is stored with its prompt embedding.

Cache entries are scoped per personality ID to prevent cross-contamination between different system prompts.

### Cache Management

```
# View cache statistics
GET /inference/cache/stats

# Clear cache for a personality
DELETE /inference/cache?personalityId=default

# Clear all cache entries
DELETE /inference/cache
```

### Tuning the Threshold

- **0.95+**: Very strict, only near-identical prompts match. Low false-positive risk but fewer cache hits.
- **0.90-0.94**: Good default range. Catches rephrasings of the same question.
- **Below 0.88**: Risk of returning irrelevant cached responses. Not recommended for production.

Monitor the `inference_cache_hit_ratio` Prometheus metric to assess effectiveness.

## Batch Inference

Batch inference processes arrays of prompts with controlled concurrency, optimized for throughput rather than latency.

### Create a Batch Job

```
POST /inference/batch
{
  "prompts": [
    { "id": "q1", "messages": [{ "role": "user", "content": "Summarize Q1 results" }] },
    { "id": "q2", "messages": [{ "role": "user", "content": "Summarize Q2 results" }] }
  ],
  "personalityId": "default",
  "concurrency": 5,
  "model": "llama3.2:3b"
}
```

For large batches, provide a JSONL file path instead:

```
POST /inference/batch
{
  "inputPath": "/data/prompts.jsonl",
  "personalityId": "default",
  "concurrency": 5
}
```

### Monitor Progress

```
GET /inference/batch/{jobId}
```

Response:

```json
{
  "id": "batch-abc",
  "status": "running",
  "total": 500,
  "completed": 342,
  "failed": 2,
  "outputPath": "/data/results-batch-abc.jsonl"
}
```

### Concurrency Guidelines

| Provider       | Recommended Concurrency |
|----------------|------------------------|
| Local Ollama   | 1-2 (GPU bound)       |
| OpenAI         | 10-20                  |
| Anthropic      | 5-10                   |
| Azure OpenAI   | 5-15                   |

The worker respects provider rate limits and backs off on 429 responses automatically.

### CLI Usage

```bash
secureyeoman inference batch \
  --input /data/prompts.jsonl \
  --personality default \
  --concurrency 5 \
  --output /data/results.jsonl
```

## KV Cache Warming

Model warming pre-loads models into Ollama's memory, eliminating cold-start latency on the first user request.

### Automatic Warming

Models referenced in active personality configurations are warmed on application startup. Configure the keep-alive duration:

```json
{
  "inference": {
    "warming": {
      "enabled": true,
      "keepAliveMinutes": 30,
      "modelsToWarm": ["llama3.2:3b", "nomic-embed-text"]
    }
  }
}
```

If `modelsToWarm` is omitted, all models in active personalities are warmed automatically.

### Manual Warming

```
POST /inference/warm
{
  "model": "llama3.2:7b",
  "keepAliveMinutes": 60
}
```

### How It Works

The warmer sends a minimal request to Ollama (`POST /api/chat` with `num_predict: 1` and the specified `keep_alive`). This loads the model weights and KV cache into GPU memory. Requests are sent sequentially to avoid VRAM contention during startup.

### VRAM Considerations

Each warmed model consumes VRAM for the keep-alive duration. Monitor GPU memory via `GET /training/gpu-status` and adjust the model list and keep-alive times to fit available hardware.

## Speculative Decoding (Roadmap)

Phase 132 adds a `draftModel` configuration field but does not implement speculative decoding logic. This establishes the configuration path for Phase 132-B.

### Configuration (Scaffold Only)

```json
{
  "models": {
    "primary": {
      "provider": "ollama",
      "model": "llama3.2:7b",
      "draftModel": "llama3.2:1b"
    }
  }
}
```

The `draftModel` field is validated (model must exist in the provider) but has no runtime effect in Phase 132. Phase 132-B will implement token-level speculative decoding where the draft model generates candidate tokens that the primary model verifies in a single forward pass, targeting 2-3x throughput improvement for autoregressive generation.
