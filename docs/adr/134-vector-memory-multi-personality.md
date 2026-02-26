# ADR 134: Vector Memory Multi-Personality Scoping

## Status
Accepted

## Date
2026-02-26

## Context
SecureYeoman supports multiple active AI personalities (e.g., FRIDAY, T.Ron). Prior to this ADR, the Brain subsystem's vector memory operated without personality isolation:

1. **Recall**: The vector search path in `BrainManager.recall()` returned results from all personalities — a user chatting with T.Ron could receive FRIDAY's episodic memories in context.

2. **self-identity**: `seedBaseKnowledge()` seeded a single global `self-identity` entry — "I am F.R.I.D.A.Y." — with no `personality_id`. Every personality, including T.Ron, read this as their own identity.

## Decision

### Personality scoping in vector recall
- `VectorMemoryManager.searchMemories()` and `searchKnowledge()` accept `personalityId?: string | null`:
  - `undefined` — omnipresent (sees all: used by omnipresentMind mode)
  - `string` — scoped (returns entries for that personality + global `null` entries)
- `BrainManager.recall()` resolves `personalityId` before the vector path and passes it through all three search layers: external vector store, pgvector RRF, and post-fetch safety filter on `getMemoryBatch` results
- `semanticSearch()` and `getRelevantContext()` similarly scope to the resolved personality

### Per-personality self-identity
- `seedBaseKnowledge(personalities: Array<{id, name}>)` seeds `self-identity` per personality, scoped to that `personality_id`, with content "I am {name}"
- Generic entries (hierarchy, purpose, interaction) remain global (shared by all personalities)
- Legacy global self-identity entries (created before Phase 52) are automatically deleted and replaced with personality-scoped entries on startup
- Called at every startup (not just onboarding) so new personalities added post-install get seeded on next restart

### Dashboard Vector Memory Explorer
- Personality dropdown at top of `VectorMemoryExplorerPage` — "All Personalities" or a specific personality
- All tabs (Memories, Knowledge, Semantic Search) respect the selection
- In "All Personalities" view, each row shows a personality badge

### Agents page tab order
- Vector Memory promoted to first tab (default view)
- Order: Vector Memory → Web → Multimodal → Swarm → A2A Network

## Consequences

**Positive:**
- Each personality only sees their own memories and global memories in context — no cross-personality memory leakage
- Operators can browse and inspect what each personality knows via the dashboard
- Each personality has the correct self-identity in their knowledge base

**Negative:**
- Existing deployments with a global `self-identity` entry will have it deleted on next startup and replaced with per-personality entries — this is intentional migration behavior
- Vector index entries created before Phase 52 lack `personalityId` metadata; the post-fetch safety filter on `getMemoryBatch` handles this gracefully (they are treated as the recalled personality's memories)

## Alternatives Considered
- **Role-based filtering at query time only**: Rejected — metadata in the vector store must match at index time for the external vector path to filter correctly
- **Copy-on-recall**: Rejected — would cause knowledge duplication and inconsistency
