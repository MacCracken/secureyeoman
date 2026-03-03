# ADR 190: Inline Citations & Grounding (Phase 110)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 110

---

## Context

The existing knowledge base (Phase 82) retrieves relevant memories and knowledge
entries via `BrainManager.recall()` and `queryKnowledge()`, but the
`gatherBrainContext()` function in `chat-routes.ts` flattens results into plain
`string[]` snippets -- losing all metadata (IDs, sources, confidence, document
references). There is no way to trace an AI response back to the specific sources
that informed it, making it impossible to verify claims or assess response
trustworthiness.

---

## Decision

### 1. LLM-Instruction-Based Citations

Rather than using a post-processing NLP pipeline to detect and insert citations,
we inject a **citation instruction block** into the system prompt when
`enableCitations` is true. The instruction lists numbered sources and tells the
model to produce `[N]` inline references. This approach:

- Leverages the LLM's native ability to attribute claims to sources.
- Avoids complex post-processing that could break markdown formatting.
- Works with any model (no embedding dependency for citation generation).
- Allows the model to decide which claims need citations (more natural).

### 2. Token-Overlap Grounding (Default)

Groundedness enforcement uses **Jaccard-like token overlap** as the similarity
metric. Each response sentence is compared to all sources; sentences with
overlap below threshold are flagged. This avoids:

- Mandatory embedding infrastructure (not all deployments have it).
- Latency from embedding API calls on every response.
- Cost of embedding compute for grounding checks.

The token-overlap approach is a pragmatic default. Future work can add optional
cosine similarity when an embedding provider is configured.

### 3. Web Grounding via Tool Capture

Web search results become citable sources by intercepting `web_search` and
`web_search_batch` tool call results in the agentic loop. Results are parsed
and appended to `brainContext.sources` as `type: 'web_search'` entries. This
avoids a separate web search step -- web grounding piggybacks on the existing
tool execution flow.

### 4. Provenance on Documents, Not Chunks

The 8-dimension provenance scoring lives on `brain.documents`, not on individual
chunks. Rationale:

- Provenance is a property of the source document, not a text fragment.
- Chunks inherit the parent document's trust score automatically.
- Manual scoring at chunk granularity would be impractical.
- Documents with no provenance data default to a neutral 0.5 score.

### 5. Backward-Compatible BrainContextMeta Extension

The `BrainContextMeta` interface gains an optional `sources?: SourceReference[]`
field. Existing consumers that don't read `sources` are unaffected. The
`citations_json` and `grounding_score` columns on `chat.messages` are nullable,
so historical messages work without backfill.

---

## Consequences

- **Positive**: AI responses can now be traced to specific sources. Users can
  verify claims, provide relevance feedback, and assess response trustworthiness.
- **Positive**: Groundedness enforcement provides configurable safety modes for
  different risk tolerances.
- **Trade-off**: LLM-instruction citations are best-effort -- the model may
  occasionally omit or hallucinate citation numbers. The grounding checker
  provides a post-hoc verification layer.
- **Trade-off**: Token-overlap is less precise than embedding-based similarity
  but requires no infrastructure and has zero latency overhead.
- **Migration**: `002_citations_grounding.sql` adds nullable columns and a new
  table; no data migration needed.

---

## Files Changed

- `packages/shared/src/types/citations.ts` (new) -- Shared citation types
- `packages/shared/src/types/soul.ts` -- `enableCitations`, `groundednessMode`
- `packages/core/src/storage/migrations/002_citations_grounding.sql` (new)
- `packages/core/src/brain/grounding-checker.ts` (new)
- `packages/core/src/brain/types.ts` -- `KbDocument` provenance fields
- `packages/core/src/brain/storage.ts` -- Provenance + feedback methods
- `packages/core/src/brain/document-manager.ts` -- Provenance CRUD
- `packages/core/src/brain/document-routes.ts` -- Provenance + citation endpoints
- `packages/core/src/ai/chat-routes.ts` -- Citation pipeline (both paths)
- `packages/core/src/chat/conversation-storage.ts` -- Citations persistence
- `packages/core/src/gateway/auth-middleware.ts` -- New route permissions
- `packages/core/src/secureyeoman.ts` -- `getBrainStorage()` getter
- `packages/dashboard/src/components/ChatPage.tsx` -- Sources section
- `packages/dashboard/src/components/ChatMarkdown.tsx` -- Citation markers
- `packages/dashboard/src/components/chat/CitationDrawer.tsx` (new)
