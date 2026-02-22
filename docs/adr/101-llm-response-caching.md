# ADR 101 — LLM Response Caching

**Date**: 2026-02-22
**Status**: Accepted

---

## Context

Heartbeat probes and other time-scheduled checks run the same system-state query repeatedly on aggressive schedules. Each cycle issues an identical API call — same model, same system prompt, same messages — and pays for it with real tokens. This is pure waste when the system state has not changed between cycles.

The roadmap tracked this as a deferred cost-optimisation under "Ironclaw Low-Priority". Real-world usage of the heartbeat scheduler confirmed the pattern: default heartbeat intervals are 60 s; users who shorten them to 10–30 s multiply API costs by 2–6×.

---

## Decision

**Add an in-memory, TTL-keyed response cache to `AIClient`.**

The cache is implemented in `packages/core/src/ai/response-cache.ts` (`ResponseCache` class) and integrated into `AIClient.chat()`. Streaming responses (`chatStream()`) are never cached.

### Cache key

SHA-256 of a JSON-serialised object:

```json
{
  "provider": "<provider name>",
  "model": "<resolved model string>",
  "messages": [ ... ],
  "temperature": <number | undefined>,
  "maxTokens": <number | undefined>,
  "toolNames": [ "<sorted tool names>" ] | undefined
}
```

Full tool schemas are excluded from the key to avoid bloat; tool *names* (sorted) distinguish between requests with different capability surfaces.

### Cache storage

Pure in-memory `Map<string, CacheEntry>`. No database table is needed. The map is keyed by the SHA-256 hex string; entries hold the cached `AIResponse`, `cachedAt`, `expiresAt`, and a `hitCount`.

### Eviction

- **TTL**: checked on `get()`. Expired entries are deleted lazily. `evictExpired()` allows proactive sweeps.
- **Capacity**: when `maxEntries` is reached the oldest entry (Map insertion order — FIFO) is evicted before the new entry is inserted.

### Configuration (`model.responseCache` in `secureyeoman.yaml`)

```yaml
model:
  responseCache:
    enabled: false        # off by default — opt-in
    ttlMs: 300000         # 5 minutes
    maxEntries: 500
```

### Integration points

| Location | Change |
|---|---|
| `ModelConfigSchema` (`@secureyeoman/shared`) | Added `responseCache: ResponseCacheConfigSchema` |
| `AIClient.chat()` | Cache lookup before provider call; cache store after primary success |
| `AIClient.getCacheStats()` | New public method returning `CacheStats \| null` |
| `AIClientDeps.responseCache` | Allows injecting a pre-built `ResponseCache` (testing, shared cache) |

Fallback-provider responses are **not** cached. The cache key encodes the primary provider name; caching a response from a fallback under that key would be misleading and could mask repeated primary-provider failures.

---

## Why this approach over alternatives

### Alternative A: Database-backed cache (PostgreSQL / SQLite table)
Survives restarts and supports multi-instance sharing. Cost: additional migration, query latency on every `chat()` call, schema maintenance. The primary use-case (heartbeat probes) is a single-process workload; in-memory is sufficient and zero-latency.

### Alternative B: Redis-backed cache
Ideal for multi-instance SaaS deployments. Adds an optional dependency and a new connection. The right choice once multi-instance is the common case, but premature for the current single-binary default tier. Tracked as a future enhancement.

### Alternative C: Semantic (embedding-based) caching
Hash only works for exact matches. Semantic caching tolerates paraphrases but requires embedding each request (latency + cost) and a vector similarity threshold (false-positive risk). Deferred per the roadmap.

**Chosen:** pure in-memory, off by default, zero dependencies. The opt-in default means it has no effect on existing deployments. Heartbeat operators who enable it immediately stop paying for redundant API calls.

---

## Consequences

- `ModelConfig` gains a `responseCache` field with a disabled default — backward compatible.
- Cache hits are audit-logged as `ai_cache_hit` events.
- `getCacheStats()` exposes hit/miss/hitRate for observability.
- Token usage counters are **not** incremented for cache hits (no real API call occurred).
- Streaming calls (`chatStream()`) bypass the cache entirely — streaming is inherently non-replayable.
- The cache is process-local; it does not survive restarts or synchronise across instances.

---

## Related

- [ADR 028 — Heartbeat Scheduler](028-heartbeat-scheduler.md)
- [ADR 085 — Intelligent Model Routing](085-intelligent-model-routing.md)
- [Roadmap — Future Features](../../docs/development/roadmap.md)
