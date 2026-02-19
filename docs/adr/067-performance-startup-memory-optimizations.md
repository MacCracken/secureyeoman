# ADR 067 — Performance: Startup & Memory Optimizations

**Date**: 2026-02-19
**Status**: Accepted
**Phase**: 20 (Performance)

---

## Context

Phase 20 roadmap items called for:
- **Memory Footprint Optimization** — target <1 GB baseline, informed by studying PicoClaw's architecture
- **Fast Boot** — target <10 s startup, informed by PicoClaw's <1 s boot on a 0.6 GHz single-core

PicoClaw achieves its extreme figures by being a Go single-binary with no database, no connection pools, and minimal state. SecureYeoman is a full enterprise agent platform and cannot match those numbers, but the exercise surfaced several concrete, low-risk optimizations.

**Analysis findings:**
- Both targets were already met in practice (~2–3 s cold boot, ~150–300 MB baseline RAM)
- Four specific inefficiencies were identified worth fixing regardless

---

## Decisions

### 1. Migration fast-path

**File:** `packages/core/src/storage/migrations/runner.ts`

**Before:** On every boot, the runner read the filesystem for all `.sql` files, then issued one `SELECT` per file to check whether it had been applied — N round-trips to PostgreSQL.

**After:** After ensuring the `schema_migrations` table exists, a single `SELECT id … ORDER BY id DESC LIMIT 1` fetches the latest recorded migration. If it matches the highest-numbered `.sql` file, all migrations are already applied and the function returns immediately. The per-file loop only runs when new migrations exist.

**Gain:** On an up-to-date install (the overwhelmingly common case), DB round-trips during migration phase drop from N to 2 (CREATE TABLE IF NOT EXISTS + SELECT MAX). Estimated saving: 300–700 ms.

---

### 2. Lazy AI client usage history init

**Files:** `packages/core/src/ai/client.ts`, `packages/core/src/secureyeoman.ts`

**Before:** `aiClient.init()` was called eagerly at startup, immediately after constructing the AIClient. This loaded historical usage records (tokens, costs, errors, latency) from PostgreSQL — 3–4 sequential queries — before any AI call had been made.

**After:** `AIClient` now tracks an `initPromise`. The `init()` method is idempotent (subsequent calls are no-ops). A private `ensureInitialized()` is called at the top of `chat()` and `chatStream()` — the DB load happens on the first actual AI request and never blocks startup. The `await this.aiClient.init()` line is removed from `secureyeoman.ts`.

**Invariant preserved:** Token limit checking (`checkLimit()`) always sees accurate today's usage because `ensureInitialized()` completes before it is called.

**Gain:** Estimated 300–500 ms removed from the startup critical path. The cost is added latency on the very first AI request (once, not per-request).

---

### 3. Bounded WebSocket client map

**Files:** `packages/core/src/gateway/server.ts`, `packages/shared/src/types/config.ts`

**Before:** `this.clients` was an unbounded `Map<string, WebSocketClient>`. A misbehaving client or dashboard bug could cause the map to grow without limit.

**After:** `GatewayConfigSchema` gains `maxWsClients: z.number().int().min(1).default(100)`. When a new connection arrives and `clients.size >= maxWsClients`, the client with the oldest `lastPong` timestamp is evicted (closed with code 1008) before the new client is registered. A warning is logged.

**Note:** The existing 30 s ping / 60 s stale-client cleanup (heartbeat interval) remains unchanged and continues to handle the normal disconnect case. The cap is a memory-safety backstop for abnormal cases.

**Gain:** Bounded memory under adversarial or buggy conditions. No impact on normal single-user usage.

---

### 4. PostgreSQL pool size default 20 → 10

**File:** `packages/shared/src/types/config.ts`

**Before:** `poolSize` defaulted to 20 connections.

**After:** `poolSize` defaults to 10. The field is documented inline: *"Increase for multi-user/SaaS deployments."*

Each idle PostgreSQL connection consumes ~5–8 MB server-side. Halving the default saves ~50–80 MB of PostgreSQL memory for the typical single-user install. The value is already fully configurable via `database.poolSize` in `secureyeoman.yaml` or the `DATABASE_POOL_SIZE` env override.

---

## Consequences

- **Startup time:** Reduced by ~600–1200 ms on an up-to-date system (migration fast-path + deferred usage init).
- **Memory:** ~50–80 MB lower PostgreSQL footprint at default config; unbounded WS map eliminated.
- **First AI request:** ~300–500 ms slower than before (usage history load moved here). Invisible to users in practice.
- **Correctness:** Migration fast-path is safe because files are sorted and applied in order; if the latest is recorded, all prior ones must be too. The lazy init is safe because the promise is shared — concurrent first calls serialize on the same load.
- **Configuration:** `database.poolSize` and `gateway.maxWsClients` are both documented and configurable.

---

## Files Changed

- `packages/core/src/storage/migrations/runner.ts`
- `packages/core/src/ai/client.ts`
- `packages/core/src/secureyeoman.ts`
- `packages/core/src/gateway/server.ts`
- `packages/shared/src/types/config.ts`
