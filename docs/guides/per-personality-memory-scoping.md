# Guide: Per-Personality Memory Scoping & Omnipresent Mind

Each personality in SecureYeoman now maintains its own private pool of memories and knowledge. By default, T.Ron's context does not appear in FRIDAY's recall — and vice versa. The **Omnipresent Mind** toggle gives an orchestrator personality read access to the shared cross-agent pool.

---

## How it works

### Default behaviour (isolated)

When a personality creates a memory during a chat session it is stored with that personality's `personality_id`. When it recalls context, only its own memories (and legacy entries with no owner) are returned.

```
T.Ron   recalls → only T.Ron memories + unowned legacy entries
FRIDAY  recalls → only FRIDAY memories + unowned legacy entries
```

### Omnipresent Mind (shared pool)

When **Omnipresent Mind** is enabled on a personality, its queries carry no personality filter — it sees every memory and knowledge entry in the system, regardless of which personality created it.

```
OrchestratorAI (omnipresent: true) recalls → all entries from all personalities
```

Omnipresent mode uses the same unfiltered SQL query that the system used before scoping was introduced. There is no performance overhead relative to that previous behaviour.

### Legacy data

Entries created before per-personality scoping was activated have a `NULL` personality ID. These are considered shared and are always included in recall results for every personality, omnipresent or not.

---

## Enabling Omnipresent Mind

1. Open the **Personality Editor** for the target personality.
2. Navigate to the **Brain** section.
3. Toggle **Omnipresent Mind** on.
4. Save.

> **Warning**: An omnipresent personality can read memories from every other agent on the system. Only enable this for trusted orchestrator agents.

---

## Heartbeat stats

The Tasks → Heartbeats view now displays per-personality memory stats. Each row in the `system_health` check execution log reflects counts scoped to that personality:

```
T.Ron   — Memories: 45, Knowledge: 2, RSS: 198MB, Heap: 85/113MB
FRIDAY  — Memories: 12, Knowledge: 1, RSS: 198MB, Heap: 85/113MB
```

RSS and Heap remain process-level figures — all personalities share the same Node.js process. Only the memory/knowledge counts are personality-scoped.

An omnipresent personality shows the full system aggregate, which is correct: it has access to everything.

---

## Vector recall scoping (Phase 52)

Prior to Phase 52, the vector search path in `BrainManager.recall()` queried the full embedding store without any personality filter — T.Ron's semantic search results could include FRIDAY's episodic memories. Phase 52 closes this gap.

### How it works

`recall()` now resolves a `personalityId` before entering the vector path and passes it through all three search layers:

1. **External vector store** (`VectorMemoryManager.searchMemories` / `searchKnowledge`) — the `personalityId` is stored as metadata at index time and matched at query time.
2. **pgvector RRF** (`queryMemoriesByRRF` / `queryKnowledgeByRRF`) — SQL filter `AND (personality_id = $N OR personality_id IS NULL)` added when a scoped personality ID is provided.
3. **Post-fetch safety filter** — `getMemoryBatch` results are filtered in-process to handle index entries written before Phase 52 (which lack `personalityId` metadata).

`undefined` as a personality ID means omnipresent — the query is unfiltered, which is the correct behaviour for personalities with **Omnipresent Mind** enabled.

### Per-personality self-identity

`seedBaseKnowledge()` is called at every startup with all enabled personalities. It seeds a `self-identity` knowledge entry per personality, scoped to that personality's ID, with content `"I am {name}"`. Legacy global `self-identity` entries (created before Phase 52 with `personality_id IS NULL`) are automatically deleted and replaced on startup.

Generic entries (`hierarchy`, `purpose`, `interaction`) remain global — shared by all personalities.

### Dashboard — Vector Memory Explorer

The Agents page now shows a personality filter dropdown at the top of the Vector Memory Explorer tab:

- **All Personalities** — shows all entries; each row has a personality badge (or "Global" for unowned entries).
- **Specific personality** — filters memories, knowledge, and semantic search to that personality.

Vector Memory is the first/default tab in the Agents page (tab order: Vector Memory → Web → Multimodal → Swarm → A2A Network).

---

## API — scoped brain endpoints

All brain query endpoints accept an optional `?personalityId=` query parameter:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/brain/memories?personalityId=<id>` | List memories for one personality |
| `GET /api/v1/brain/knowledge?personalityId=<id>` | List knowledge for one personality |
| `GET /api/v1/brain/stats?personalityId=<id>` | Stats scoped to one personality |
| `GET /api/v1/brain/search/similar?personalityId=<id>` | Semantic search scoped to one personality |

Omit `personalityId` to get unscoped (system-wide) results.

---

## Concurrency safety

Chat requests from different personalities run concurrently. The implementation resolves the `effectivePersonalityId` early in each request handler and passes it directly to each brain call — no shared mutable state is involved. Concurrent requests from T.Ron and FRIDAY are fully independent.

---

## Common scenarios

### Scenario 1: Dedicated security agent (default, isolated)

T.Ron is set to isolated mode (default). It accumulates security-related context over time without any FRIDAY memories appearing in its recall. FRIDAY likewise stays focused on its own history.

### Scenario 2: Orchestrator that coordinates all agents

Create a supervisor personality and enable **Omnipresent Mind**. It can now recall memories from T.Ron, FRIDAY, and any other agent, giving it full situational awareness for coordination tasks.

### Scenario 3: Checking what a specific personality knows

Use the API directly:

```bash
curl "$BASE_URL/api/v1/brain/stats?personalityId=<personality-uuid>"
```

Or filter the memory list:

```bash
curl "$BASE_URL/api/v1/brain/memories?personalityId=<personality-uuid>&limit=20"
```

---

## Troubleshooting

**Stats look identical for all personalities** — If all personalities show the same counts, check whether `personality_id` is being persisted on new memories. This requires the scoping fix (core ≥ 2026.2.25-per-personality-memory-scoping). Older chat-created memories will have `NULL` personality IDs and appear in everyone's count.

**Personality sees zero memories** — A newly created personality has no history. Legacy unowned memories are shared, but if none exist, recall returns empty. This is expected.

**Omnipresent personality still shows low counts** — Verify the toggle is saved: check `GET /api/v1/soul/personalities/:id` and confirm `body.omnipresentMind === true`. If the field is missing or false, the personality is in isolated mode.

---

## See also

- [ADR 133 — Per-Personality Memory Scoping](../adr/133-per-personality-memory-scoping.md)
- [ADR 134 — Vector Memory Multi-Personality Scoping](../adr/134-vector-memory-multi-personality.md)
- [Personality Editor](./personality-editor.md) *(if it exists)*
