# ADR 131 — Memory, Performance & Code Quality Sprint

**Date**: 2026-02-25
**Status**: Accepted
**Phase**: XX.8

---

## Context

A comprehensive codebase audit identified 27 items across three categories: memory leaks / unbounded growth (6), performance bottlenecks (11), and code duplication / simplification opportunities (10). All were resolved in a single sprint without behavioral changes to any feature.

---

## Decisions

### Security

#### 1. Streaming path tool-filter gap (chat-routes.ts)

**Problem**: `/api/v1/chat/stream` applied tool-category gates (git, fs, web, browser) but silently omitted the network-tool and Twingate-tool gates that the non-streaming `/api/v1/chat` handler enforced. An admin could disable network tools globally yet they would still be injected into streaming sessions.

**Resolution**: Extracted a shared `filterMcpTools(allMcpTools, selectedServers, globalConfig, perPersonality): Tool[]` module-level function. Both streaming and non-streaming handlers now call it identically.

---

### Bug Fixes

#### 2. `nextCronRun()` was a stub (skill-scheduler.ts)

**Problem**: `SkillScheduler.nextCronRun()` returned `from + checkIntervalMs` for all inputs — a placeholder that caused cron-scheduled skills to fire on the check interval rather than their actual schedule.

**Resolution**: Implemented a full 5-field cron parser using `parseField()` supporting `*`, `*/N`, `a-b`, `a-b/N`, and comma-separated values. Walks forward minute-by-minute with month-level and day-level skipping to find the next matching timestamp.

#### 3. Stale `signalCache` on intent reload (intent/manager.ts)

**Problem**: `IntentManager.reloadActiveIntent()` rebuilt the goal index but did not clear `signalCache`. Evaluations for signals on the old intent document continued to return cached results.

**Resolution**: Added `this.signalCache.clear()` as the first line of `reloadActiveIntent()`.

#### 4. `skill-resources` O(n) to O(1) (mcp/resources/skill-resources.ts)

**Problem**: The `yeoman://skills/{id}` MCP resource called `GET /api/v1/soul/skills` (all skills) and searched for the matching ID in application code.

**Resolution**: Changed to `GET /api/v1/soul/skills/:id`.

---

### Performance

#### 5. Parallel brain recall (chat-routes.ts)

**Problem**: `brainManager.recall()` and `brainManager.queryKnowledge()` were sequential `await` calls in both streaming and non-streaming handlers.

**Resolution**: Wrapped both calls in `Promise.all([recall, queryKnowledge])`.

#### 6. Batch memory fetch (brain/manager.ts)

**Problem**: After RRF ranking, the hybrid search issued N sequential `storage.getMemory(id)` calls to rehydrate ranked memories.

**Resolution**: Added `BrainStorage.getMemoryBatch(ids: string[]): Promise<Memory[]>` using `WHERE id = ANY($1)`. `BrainManager` now calls this once, then reorders the results to match the RRF ranking.

#### 7. `McpStorage.getConfig()` per-request cache (mcp/storage.ts)

**Problem**: `McpStorage.getConfig()` issued a DB query on every tool-filter check, which happens once per chat request.

**Resolution**: Added a `{ value, expiresAt }` in-process cache with a 5-second TTL. `setConfig()` invalidates the cache immediately.

#### 8. DB indexes (migration 045)

**Problem**: Three frequently-queried columns lacked indexes: `soul.skills.enabled/status`, `autonomy_audit_runs.status`, `intent_enforcement_log.personality_id`.

**Resolution**: Created `045_performance_indexes.sql` with three `CREATE INDEX IF NOT EXISTS` statements. Added to migration manifest.

#### 9. `listSkills` window function (soul/storage.ts)

**Problem**: `SoulStorage.listSkills()` ran two queries — a `COUNT(*)` and the actual `SELECT` — for every paginated skills list request.

**Resolution**: Replaced with a single query using `COUNT(*) OVER () AS total_count`.

#### 10. `ResponseCache` background eviction (ai/response-cache.ts)

**Problem**: `ResponseCache` only evicted expired entries when the FIFO limit was reached or `evictExpired()` was called manually. Expired entries from low-traffic cache instances would linger indefinitely.

**Resolution**: Added a `setInterval(() => this.evictExpired(), config.ttlMs)` timer in the constructor, `.unref()`'d to avoid blocking process exit. `clear()` now also stops this timer.

#### 11. Pre-compiled trigger RegExp (soul/manager.ts)

**Problem**: `isSkillInContext()` called `new RegExp(pattern, 'i')` inside `Array.some()` on every message — even though skill patterns are stable after DB load.

**Resolution**: Added a module-level `triggerPatternCache: Map<string, RegExp | null>` and a `compileTriggerPattern(pattern)` helper that compiles once and caches the result (including `null` for invalid patterns, which fall back to substring matching).

---

### Memory

#### 12. `UsageTracker` unbounded in-memory growth (ai/usage-tracker.ts)

**Problem**: `UsageTracker` loaded up to 90 days of usage records into a `records[]` array at startup and appended indefinitely. On active installations this grew to tens of thousands of entries.

**Resolution**:
- `UsageStorage` gained four new methods: `loadToday()`, `loadMonthCostUsd()`, `loadProviderStats()`, `getTotalCallCount()`.
- `UsageTracker` now holds only `todayRecords[]` (typically <100 entries) and derives monthly/provider aggregates from DB at init. A midnight rollover check in `record()` trims the previous day's in-memory slice.

#### 13. `tokenCache` unbounded Map (chat/compression/token-counter.ts)

**Problem**: The module-level `tokenCache: Map<string, number>` grew without bound as unique message content was cached.

**Resolution**: Capped at `TOKEN_CACHE_MAX = 2000` entries with FIFO eviction via a `cachedCount()` helper.

#### 14. `agentReports` no TTL (diagnostics/diagnostic-routes.ts)

**Problem**: The `agentReports` Map stored sub-agent heartbeats but never evicted stale entries from agents that had stopped reporting.

**Resolution**: Added a module-level `setInterval` that evicts reports older than 10 minutes every 5 minutes. Timer is `.unref()`'d.

---

### Refactoring

#### 15. `buildFrontMatter` shared utility (mcp/utils/front-matter.ts)

**Problem**: The `buildFrontMatter` function was copy-pasted identically in `web-tools.ts`, `personality-resources.ts`, and `skill-resources.ts`.

**Resolution**: Extracted to `packages/mcp/src/utils/front-matter.ts`. All three files import from there.

#### 16. Brain context helpers in chat-routes (chat-routes.ts)

**Problem**: The 25-line brain recall + preference-injection block was duplicated verbatim in the non-streaming and streaming handlers.

**Resolution**: Extracted to two module-level helpers:
- `gatherBrainContext(secureYeoman, message): Promise<BrainContextMeta>`
- `applyPreferenceInjection(secureYeoman, prompt): Promise<string>`

#### 17. `AbortSignal.timeout()` in twingate-tools (mcp/tools/twingate-tools.ts)

**Problem**: `twingateQuery()` and `mcpJsonRpc()` used the verbose `AbortController + setTimeout(...abort...) + try/finally clearTimeout` pattern. The rest of the codebase already uses `AbortSignal.timeout()`.

**Resolution**: Both functions now pass `signal: AbortSignal.timeout(timeoutMs)` directly to `fetch()`. Node.js ≥20 is required by `engines` — `AbortSignal.timeout` is available since Node.js 17.3.

#### 18. `SkillScheduler` uses `setInterval` (soul/skill-scheduler.ts)

**Problem**: `startCheckTimer()` used recursive `setTimeout`, creating a new timer object on each tick.

**Resolution**: Replaced with a single `setInterval` instance stored in `checkInterval?: ReturnType<typeof setInterval>`. `stop()` calls `clearInterval(this.checkInterval)`.

---

## Consequences

- All 18 changes are backward-compatible. No API surface, DB schema (beyond the new indexes), or configuration format changed.
- Memory footprint for active installations reduced significantly: `UsageTracker` no longer accumulates 90 days of records.
- Streaming chat is now correctly gated on all tool-category security controls.
- Cron-scheduled skills now fire at their actual configured times.
- New tests added: 4 cron-expression cases in `skill-scheduler.test.ts`, 2 timer/eviction cases in `response-cache.test.ts`.
