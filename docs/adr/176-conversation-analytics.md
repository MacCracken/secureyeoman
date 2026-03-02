# ADR 176 — Conversation Analytics

**Status:** Accepted
**Date:** 2026-03-01
**Phase:** 96

## Context

The conversation store holds rich signal (sentiment, engagement patterns, entity mentions, usage anomalies) that is currently invisible. Surfacing this data enables operators to understand conversation quality, detect misuse, and derive insights — without requiring external analytics tools.

## Decision

Implement six conversation analytics capabilities inspired by Amazon Comprehend:

1. **Sentiment tracking** — background LLM-based classification of assistant messages into positive/neutral/negative with a confidence score. 5-minute interval.
2. **Engagement metrics** — on-demand SQL queries for avg conversation length, follow-up rate, abandonment rate, and tool call success rate.
3. **Conversation summarization** — background LLM summaries for conversations above a message threshold. 10-minute interval.
4. **Entity extraction** — background LLM extraction of named entities (person, org, technology, etc.) and key phrases. 15-minute interval.
5. **Usage anomaly detection** — in-memory rate tracking (message rate spikes, off-hours activity, credential stuffing) with persistent alert storage.
6. **11 REST endpoints** under `/api/v1/analytics/*` with `analytics:read`/`analytics:write` auth permissions.

### Architecture

- **New `analytics` schema** with 5 tables: `turn_sentiments`, `conversation_summaries`, `conversation_entities`, `key_phrases`, `usage_anomalies`. No cross-schema foreign keys.
- **Background services** follow the `ConversationQualityScorer` pattern (start/stop lifecycle, setInterval, batch processing).
- **Anomaly detector** follows the `AbuseDetector` pattern (in-memory Map with TTL eviction).
- **All LLM calls** use the existing `AIClient` — no external NER models.
- **Dashboard** adds an "Analytics" tab to MetricsPage with 5 sub-panels (lazy-loaded).

### Integration points

- `secureyeoman.ts`: 6 private fields, init in `initialize()`, 6 getters, shutdown cleanup.
- `chat-routes.ts`: fire-and-forget `anomalyDetector.recordMessage()` after each response.
- `conversation-quality-scorer.ts`: negative sentiment avg lowers quality score for training priority.

## Consequences

- New `analytics` schema requires migration 074.
- Background services consume LLM tokens — sentiment, summarization, and entity extraction run on configurable intervals.
- In-memory anomaly state is lost on restart (alerts are persisted to DB).
- Dashboard bundle gains ~15KB (lazy-loaded chunk).
