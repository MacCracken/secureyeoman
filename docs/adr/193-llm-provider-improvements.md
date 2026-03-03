# ADR 193: LLM Provider Improvements (Phase 119)

**Status**: Accepted
**Date**: 2026-03-03

## Context

The AI provider system (13 providers, fallback chains, cost tracking, extended thinking) is mature but has gaps: missing model entries for newer models (OpenAI o3, Gemini 2.0 Flash Lite), no OpenAI reasoning effort support, no provider health scoring, dormant context overflow strategy config, no per-personality cost budgets, and slow local model refresh. Phase 119 closes these gaps.

## Decisions

### 1. Ring Buffer for Provider Health (not time-series DB)

We track provider health using an in-memory ring buffer (100 entries per provider) rather than a persistent time-series store. Rationale:
- Health scoring is ephemeral — stale data is harmful, recent data is all that matters
- No additional storage dependency
- O(1) insert, O(n) read for percentile calculations (n ≤ 100)
- Health status thresholds: healthy (<5% error rate), degraded (5–20%), unhealthy (≥20%)

### 2. Personality-Level Cost Budgets

Cost budgets are defined per-personality (not per-user or global) because personalities map to distinct use cases with different spending profiles. The `CostBudgetChecker` uses a 30-second in-memory cache per personality to avoid per-request database queries. At 80% budget usage, an alert is emitted; at 100%, requests are blocked with HTTP 429.

### 3. Reasoning Effort as AIRequest Field

OpenAI's `reasoning_effort` parameter is passed as a first-class field on `AIRequest` rather than being buried in provider-specific options. This keeps the interface uniform and allows personality-level configuration. Reasoning models also suppress `temperature` (which OpenAI rejects for o-series).

### 4. Context Overflow Strategy per Personality

The `contextOverflowStrategy` field supports three modes:
- `summarise` (default): Existing compact() behavior — summarise oldest messages
- `truncate`: Drop oldest non-system messages until under 80% threshold
- `error`: Reject the request with HTTP 413 (non-streaming) or SSE error (streaming)

### 5. Local Model Cache TTL Reduced to 60s

The CACHE_TTL_MS for model discovery was reduced from 10 minutes to 60 seconds. Users pulling/deleting Ollama models expect near-instant feedback in the model list.

## Consequences

- Provider health data is lost on restart (acceptable — cold-start providers default to "healthy")
- Cost budget enforcement adds one DB query per personality per 30 seconds (cached)
- Reasoning effort only applies to OpenAI o-series models; other providers ignore it
- Context overflow strategy is personality-scoped, not conversation-scoped
