# ADR 096 — Content-Chunked Workspace Indexing

**Status:** Accepted
**Date:** 2026-02-21
**Phase:** 35 — Fix All the Bugs + Security Hardening

---

## Context

Documents stored in `brain.memories` and `brain.knowledge` are currently indexed as a single unit. A 10 000-token technical document produces one embedding vector that averages over all topics in the document. This causes two problems:

1. **Context overflow** — the full document content exceeds the embedding model's token limit and is truncated, silently losing the tail of the document.
2. **Diluted retrieval** — a query about one specific topic in a multi-topic document may score poorly because the averaged embedding is pulled toward the document's dominant theme.

---

## Decision

Add content-chunked indexing as a supplementary layer over the existing whole-document index. Large documents are split into overlapping ~800-token chunks. Each chunk receives its own FTS vector and (optionally) a pgvector embedding, enabling retrieval at paragraph granularity.

### Chunker: `packages/core/src/brain/chunker.ts`

`chunk(content, options?)` splits text at paragraph and sentence boundaries within an 800-token budget with 15% overlap:

```typescript
import { chunk } from './chunker.js';

const chunks = chunk(longDocument, { maxTokens: 800, overlapFraction: 0.15 });
// → [{ index: 0, text: '...', estimatedTokens: 790 }, …]
```

**Algorithm:**
1. Split content at paragraph boundaries (double newlines) first, then sentence boundaries within paragraphs.
2. Greedily pack sentences into a chunk until the `maxTokens` budget is reached.
3. Seed the next chunk with an overlap window from the tail of the previous chunk (`overlapFraction * maxTokens` tokens) to preserve semantic context at boundaries.
4. Single sentences exceeding the budget are added as standalone chunks.

Token estimation uses the `~4 chars/token` heuristic consistent with `model-router.ts` and `context-compactor.ts`.

### Migration: `030_document_chunks.sql`

New table `brain.document_chunks`:

| Column | Type | Description |
|--------|------|-------------|
| `id` | `TEXT PK` | uuidv7 |
| `source_id` | `TEXT` | Parent memory or knowledge entry ID |
| `source_table` | `TEXT` | `'memories'` or `'knowledge'` |
| `chunk_index` | `INTEGER` | 0-based position within the document |
| `content` | `TEXT` | Chunk text |
| `search_vec` | `tsvector` | Auto-maintained FTS vector (trigger) |
| `embedding` | `vector(384)` | Optional pgvector embedding (when available) |
| `created_at` | `BIGINT` | Unix timestamp (ms) |

### Storage layer

`BrainStorage` gains:

| Method | Description |
|--------|-------------|
| `createChunks(sourceId, sourceTable, chunks[])` | Bulk-insert chunks for a document |
| `deleteChunksForSource(sourceId)` | Delete all chunks when the parent is deleted |
| `updateChunkEmbedding(chunkId, embedding)` | Store pgvector embedding for a chunk |
| `queryChunksByRRF(query, embedding, limit)` | Hybrid RRF search over chunks |

### Manager layer

`BrainManager.remember()` and `BrainManager.learn()` are updated to call `storage.createChunks()` (best-effort) when the content is longer than 200 characters and produces more than one chunk.

`BrainManager.forget()` and `BrainManager.deleteKnowledge()` call `storage.deleteChunksForSource()` to clean up orphaned chunks.

---

## Consequences

**Positive:**
- Long documents no longer overflow the embedding model — each chunk is independently within budget.
- Fine-grained retrieval: a query about one sub-topic in a large document can match the relevant chunk rather than the averaged whole-document vector.
- Chunks inherit the same FTS + RRF infrastructure introduced in ADR 095.

**Neutral:**
- Chunking is additive — the whole-document index still exists and is still used for queries. Chunks provide an additional retrieval surface.
- Small documents (<200 chars) are not chunked — no overhead for short memories.
- The `brain.document_chunks` table can grow large for deployments with many long documents. The 200-char threshold and "only when > 1 chunk" guard prevent unnecessary work.

**Negative / trade-offs:**
- Duplicate content: each chunk stores a copy of part of the original content. Storage cost is proportional to document length × overlap fraction.
- No deduplication across chunk retrieval: if multiple chunks from the same document match, the caller receives multiple entries. `queryChunksByRRF` returns `sourceId` for the caller to group by document.

---

## Related

- [ADR 095 — Hybrid FTS + RRF](095-hybrid-fts-rrf.md)
- [Migration 030 — Document Chunks](../../../packages/core/src/storage/migrations/030_document_chunks.sql)
- `packages/core/src/brain/chunker.ts`
