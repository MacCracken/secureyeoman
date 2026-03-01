# ADR 161: API Gateway Mode (Phase 80)

**Date**: 2026-02-28
**Status**: Accepted
**Phase**: 80

## Context

External applications (mobile apps, integrations, third-party bots) need to use SecureYeoman's chat pipeline without direct LLM credentials or admin access. A managed API surface with per-key rate limiting and usage tracking is required.

## Decision

Extend the existing API key model and expose `/api/v1/gateway` as an authenticated chat proxy.

### Extended API Key Model
Four new columns on `auth.api_keys`:
- `personality_id` — binds the key to a specific personality (overrides caller-supplied `personalityId`)
- `rate_limit_rpm` — requests per minute (sliding 60s in-memory window)
- `rate_limit_tpd` — tokens per day (summed from `auth.api_key_usage`, resets at midnight UTC)
- `is_gateway_key` — marks key as intended for gateway use (informational)

### Rate Limiting
- **RPM**: a module-level `Map<keyId, {count, windowStart}>` implements a sliding window. Each request increments the counter; if `count >= limitRpm` within the 60s window, a 429 with `Retry-After: 60` is returned.
- **TPD**: queries `SUM(tokens_used)` from `auth.api_key_usage` for today. A DB call per gateway request is made only when `rateLimitTpd` is set.

### Usage Recording
After each gateway request (success or error), `auth.api_key_usage` is appended with: `key_id`, `timestamp`, `tokens_used`, `latency_ms`, `personality_id`, `status_code`. Recorded fire-and-forget (does not affect response latency for the caller).

### Analytics Routes
- `GET /api/v1/auth/api-keys/:id/usage` — raw usage rows with optional `from`/`to` epoch params
- `GET /api/v1/auth/api-keys/usage/summary` — 24h aggregate stats per key (p50/p95 via PostgreSQL `PERCENTILE_CONT`)
- Both routes support `?format=csv` for export

## Alternatives Considered

**External API gateway (Kong, NGINX)**: would require additional infrastructure; duplicates auth logic; cannot access personality binding. Rejected in favor of in-process simplicity.

**Streaming support**: `POST /api/v1/gateway` with `stream: true` in body uses `app.inject()` which buffers responses. True streaming would require direct handler reuse. Deferred to Phase 80b.

## Consequences

**Positive:**
- External apps can use personalities without LLM credentials
- Per-key quotas prevent runaway costs
- Usage data feeds the Gateway Analytics dashboard tab

**Negative:**
- RPM window is in-memory; does not survive restarts or multi-instance deployments (acceptable for v1)
- `app.inject()` for internal forwarding adds ~1ms overhead per request
- `PERCENTILE_CONT` is a Postgres-specific function; not portable to SQLite test databases

## Migrations
- 066 — `auth.api_keys` column additions, `auth.api_key_usage` table
