# ADR 095 — Hybrid FTS + RRF Search & Content-Chunked Indexing

**Status:** Accepted
**Date:** 2026-02-21
**Phase:** 35 — Fix All the Bugs + Security Hardening

---

## Context

`brain.memories` and `brain.knowledge` previously offered two independent search paths:

1. **pgvector cosine similarity** — excellent for semantic recall; poor for exact terms, named entities, command strings, and infrastructure identifiers (e.g. "Redis migration", "kubectl apply", "migration_032").
2. **ILIKE keyword search** — exact-term coverage; zero semantic generalisation; misses paraphrases.

Both paths were exposed as alternatives with a hard precedence: vector search wins when enabled, ILIKE acts as fallback. A query like *"Redis migration"* may not share embedding space with a memory tagged *"infrastructure change"* — the purely vector path misses it.

---

## Decision

Implement **Hybrid FTS + pgvector with Reciprocal Rank Fusion (RRF)** as the unified primary search path for both `brain.memories` and `brain.knowledge`.

### Migration: `029_fts_rrf.sql`

- Add `search_vec tsvector` column to both tables.
- Create GIN indexes for fast `tsvector @@ to_tsquery` lookups.
- Backfill existing rows via `UPDATE … SET search_vec = to_tsvector('english', content)`.
- Install `BEFORE INSERT OR UPDATE` triggers to keep `search_vec` current automatically.

### RRF Algorithm

Run both queries independently, then merge with RRF:

```
score(doc) = Σ  1 / (60 + rank_i)
```

Where `rank_i` is the 1-based rank from each index (FTS rank and vector rank). Documents appearing in both indexes score additively; a document ranking #2 in FTS and #3 in vector beats one ranking #1 in only one index.

The constant `60` is the standard RRF smoothing factor from Cormack et al. (2009).

### Storage layer

`BrainStorage` gains:

| Method | Description |
|--------|-------------|
| `queryMemoriesByRRF(query, embedding, limit, ftsWeight, vectorWeight)` | Hybrid search over `brain.memories` |
| `queryKnowledgeByRRF(query, embedding, limit, ftsWeight, vectorWeight)` | Hybrid search over `brain.knowledge` |

Both methods accept `embedding: number[] | null`. When `null`, the vector sub-query returns zero rows and the result is FTS-only — graceful degradation when the embedding model is unavailable.

The FTS sub-query handles rows where `search_vec IS NULL` (legacy rows before migration) by simply not matching them.

### Manager layer

`BrainManager.recall()` is updated:

1. Attempt hybrid RRF via `storage.queryMemoriesByRRF()`.
2. If RRF returns results, touch and return them.
3. If RRF returns nothing, fall back to pure vector search.
4. If vector search fails or is disabled, fall back to ILIKE text search.

`BrainManager.queryKnowledge()` is unchanged at the public API level but routes through `queryKnowledgeByRRF` internally when FTS is available.

---

## Consequences

**Positive:**
- Exact-term recall for infrastructure names, commands, and identifiers is no longer dependent on embedding similarity.
- Semantic recall is preserved via the vector path.
- Rows without `search_vec` (pre-migration) degrade gracefully to pure vector search.
- FTS index (GIN) is significantly cheaper to query than a full table scan.

**Neutral:**
- RRF adds a CTE and a `FULL OUTER JOIN` to search queries. On typical brain sizes (<100K rows), this is negligible.
- The `to_tsquery` function raises an error on malformed query strings (e.g. bare `!`). The implementation sanitises the query string before passing it to PostgreSQL.

**Negative / trade-offs:**
- `search_vec` adds ~50–150 bytes per row depending on content length.
- The GIN index adds ~10–30% storage overhead on the `content` column.

---

## Content-Chunked Workspace Indexing (formerly ADR 096)

**Date:** 2026-02-21 — Phase 35

### Context

Documents indexed as a single unit cause context overflow (exceeding embedding model token limits) and diluted retrieval (averaged embedding pulled toward the document's dominant theme).

### Decision

Add content-chunked indexing as a supplementary layer. Large documents are split into overlapping ~800-token chunks via `chunk()` in `packages/core/src/brain/chunker.ts`. Each chunk receives its own FTS vector and optional pgvector embedding.

**Algorithm:** Split at paragraph boundaries (double newlines), then sentence boundaries. Greedily pack sentences into chunks up to `maxTokens` (800). Seed each subsequent chunk with 15% overlap from the previous chunk's tail.

**Migration `030_document_chunks.sql`:** New `brain.document_chunks` table with `source_id`, `source_table`, `chunk_index`, `content`, `search_vec` (tsvector with trigger), `embedding` (vector(384)).

**Storage:** `createChunks()`, `deleteChunksForSource()`, `updateChunkEmbedding()`, `queryChunksByRRF()`.

**Manager:** `remember()` and `learn()` call `createChunks()` when content > 200 chars and produces > 1 chunk. `forget()` and `deleteKnowledge()` clean up orphaned chunks.

### Consequences

- Long documents no longer overflow embedding models — each chunk is independently within budget.
- Fine-grained retrieval at paragraph granularity.
- Chunks inherit the FTS + RRF infrastructure from this ADR.
- Small documents (< 200 chars) are not chunked.

---

## Related

- [ADR 031 — Vector Semantic Memory](031-vector-semantic-memory.md)
- `packages/core/src/brain/chunker.ts`
