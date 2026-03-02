# ADR 133 — Per-Personality Memory Scoping & Omnipresent Mind Toggle

**Status**: Accepted
**Date**: 2026-02-25
**Authors**: Engineering Team

---

## Context

The heartbeat execution log showed identical stats for all personalities:

```
T.Ron   — Memories: 92, Knowledge: 4, RSS: 198MB, Heap: 85/113MB
FRIDAY  — Memories: 92, Knowledge: 4, RSS: 198MB, Heap: 85/113MB
```

Both rows reported the same numbers because `getStats()` returned system-wide aggregates across all personalities. The database already had `personality_id` columns on `brain.memories` and `brain.knowledge` (added in migration `002_personality_scoping.sql`), but the application layer did not thread personality context through to queries or memory saves.

Two problems were in scope:

1. **Memory isolation is absent** — T.Ron's memories accumulate in the same pool as FRIDAY's. Recalling context from one personality surfaces another personality's memories. The DB schema supports scoping; the application does not use it.
2. **Stats are inaccurate** — Heartbeat messages claim to report per-personality memory health, but actually report the full system aggregate.

A secondary requirement emerged: a user should be able to opt a personality into a "god-mode" view where it can see all memories, regardless of which personality created them. This is useful for orchestrator agents.

---

## Decision

### Omnipresent Mind toggle

A boolean field `omnipresentMind` is added to `BodyConfigSchema` (default `false`). When `true`, the personality's memory/knowledge queries carry **no personality filter** — they see all stored entries exactly as before this change. When `false` (the default), queries are scoped to entries created by that personality plus legacy entries with `NULL` personality_id.

This means:
- **Omnipresent is not special** — it just restores the pre-scoping (unfiltered) behavior. There is no performance overhead vs. the previous code.
- **Non-omnipresent is efficient** — the `WHERE personality_id = $1 OR personality_id IS NULL` clause is served by the existing index on `brain.memories.personality_id`.
- **Legacy data is always visible** — entries created before scoping was activated (`personality_id IS NULL`) remain accessible to every personality, omnipresent or not.

### Filter semantics

| Condition | SQL filter applied |
|-----------|-------------------|
| `omnipresentMind: true` | none — full unfiltered scan |
| `omnipresentMind: false` (default) | `WHERE personality_id = $id OR personality_id IS NULL` |
| Legacy entry (`personality_id IS NULL`) | always included in both cases |

### Concurrency safety

Chat routes are concurrent. Using a mutable `activePersonalityId` field on the shared `BrainManager` instance would cause race conditions between simultaneous requests from different personalities. The decision is:

- **Heartbeat** uses `setActivePersonality(id, omnipresent)` — it runs single-threaded and only one personality is "active" at a time.
- **Chat routes** resolve `effectivePersonalityId` per-request, early in the handler, and pass it directly to each `brainManager` call. The manager's mutable field is not used at all from chat routes.

This eliminates the shared-state race without adding locking complexity.

### Omnipresent resource efficiency

An omnipresent personality resolves to `personalityId = undefined` in `resolvePersonalityId()`. The storage methods treat `undefined` as "no filter", which is the identical query path used before this change. There is no additional cost for an omnipresent personality, even when many non-omnipresent personalities are active concurrently. The concern "omnipresent shouldn't cost more than before" is satisfied by this design.

---

## Implementation

### Storage layer (`brain/storage.ts`)

- `getMemoryCount(personalityId?)` — scoped `COUNT(*)` when id given
- `getKnowledgeCount(personalityId?)` — same pattern
- `queryKnowledge(query)` — respects `query.personalityId`
- `createKnowledge(data, personalityId?)` — writes `personality_id` to the row
- `getStats(personalityId?)` — delegates to scoped count methods
- `KnowledgeRow` interface extended with `personality_id: string | null`

### Type layer (`brain/types.ts`)

- `MemoryQuery.personalityId?` — scopes `recall()`
- `KnowledgeQuery.personalityId?` — scopes `queryKnowledge()`

### Manager layer (`brain/manager.ts`)

- `setActivePersonality(id, omnipresent)` — used by heartbeat for single-personality context
- `resolvePersonalityId(override?)` — returns `undefined` (omnipresent), `override`, or `activePersonalityId`
- All core methods (`remember`, `recall`, `learn`, `queryKnowledge`, `getStats`, `getRelevantContext`) accept optional `personalityId` and resolve it through `resolvePersonalityId()`

### Route layer (`brain/brain-routes.ts`)

- `GET /api/v1/brain/memories?personalityId=` — scoped recall
- `GET /api/v1/brain/knowledge?personalityId=` — scoped knowledge list
- `GET /api/v1/brain/stats?personalityId=` — scoped stats

### Heartbeat (`body/heartbeat.ts`)

For `system_health` checks, the beat loop computes an `effectivePid` per personality entry:

```typescript
const effectivePid = (p.omnipresentMind ?? false) ? undefined : (p.id ?? undefined);
const scopedResult = await this.checkSystemHealth(check, effectivePid);
```

Only `system_health` runs per-personality inside the log persistence loop. Other check types (memory maintenance, etc.) run once and reuse the single result to avoid redundant work.

`setActivePersonalityIds` extended to carry `omnipresentMind` per personality entry.

### Chat routes (`ai/chat-routes.ts`)

Personality is resolved early in both streaming and non-streaming handlers. `effectivePersonalityId` is computed once:

```typescript
const effectivePersonalityId = (personality?.body?.omnipresentMind ?? false)
  ? undefined
  : (personality?.id ?? personalityId ?? undefined);
```

This is threaded through `gatherBrainContext` and the memory save call after the response.

### Dashboard

- `packages/dashboard/src/types.ts` — `omnipresentMind?: boolean` on both body interfaces
- `PersonalityEditor.tsx` — Omnipresent Mind toggle in Brain → Intellect section with a clear description warning that enabling it allows cross-personality memory access

---

## Consequences

### Positive

- Memory and knowledge are now isolated per personality by default.
- Heartbeat stats accurately reflect each personality's own memory footprint.
- Chat context recall is scoped: T.Ron's memories do not pollute FRIDAY's recall, and vice versa.
- Omnipresent mode enables orchestrator patterns without any query overhead.
- Concurrency safety is achieved without locking or shared mutable state.

### Negative / Trade-offs

- Legacy memories (`personality_id IS NULL`) are shared by all personalities. There is no automatic migration that re-assigns them — that would require knowing which personality created each entry, information that was never recorded.
- A personality with `omnipresentMind: true` can read memories written by any other personality. This is intentional but should be noted in operator documentation.
- `setActivePersonality()` on the manager is now only suitable for sequential callers (heartbeat). Any future caller that needs concurrent personality context must use the per-call override pattern used by chat routes.

---

## Alternatives Considered

### A. Keep global stats, add a separate scoped endpoint

We could have left `getStats()` global and added a new `getStatsByPersonality(id)` endpoint. Rejected: adds API surface without improving the design. The scoping belongs in the existing endpoint.

### B. Single global `activePersonalityId` field for chat + heartbeat

Simplest implementation. Rejected: creates race conditions under concurrent requests from different personalities.

### C. Separate BrainManager instances per personality

One manager instance per personality, sharing the same storage. Would eliminate the `resolvePersonalityId` complexity. Rejected: adds memory overhead proportional to personality count; the per-call override pattern achieves the same result at zero cost.

---

## Vector Memory Multi-Personality Scoping (formerly ADR 134)

**Date:** 2026-02-26 — Phase 52

### Decision

Extend personality scoping to the vector search path and per-personality self-identity.

**Personality scoping in vector recall:**
- `VectorMemoryManager.searchMemories()` and `searchKnowledge()` accept `personalityId?: string | null`:
  - `undefined` — omnipresent (sees all)
  - `string` — scoped (personality's entries + global `null` entries)
- `BrainManager.recall()` resolves personality before the vector path, passing through external vector store, pgvector RRF, and post-fetch safety filter.

**Per-personality self-identity:**
- `seedBaseKnowledge(personalities)` seeds `self-identity` per personality with content "I am {name}".
- Generic entries (hierarchy, purpose, interaction) remain global.
- Legacy global self-identity entries auto-deleted and replaced on startup.

**Dashboard:**
- Personality dropdown on `VectorMemoryExplorerPage` — all tabs respect the selection.
- Vector Memory promoted to first tab in Agents page.

---

## Related

- Migration `002_personality_scoping.sql` — `personality_id` columns on brain tables
- ADR 128 — Organizational Intent & Governance Framework
- [Guide: Per-Personality Memory Scoping](../guides/per-personality-memory-scoping.md)
