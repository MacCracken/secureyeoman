# ADR 162 — Knowledge Base & RAG Platform

**Date**: 2026-02-28
**Status**: Accepted

---

## Context

SecureYeoman's brain previously stored knowledge as discrete `(topic, content, source)` tuples, either seeded at startup or added by the AI via `brain_learn`. This model worked well for short snippets but lacked:

- **File-level tracking** — no record of what was ingested, from where, or in what format.
- **Status lifecycle** — no way to know if ingestion succeeded, is processing, or failed.
- **Document-level deletion** — deleting knowledge from a URL required manually querying by `source` prefix.
- **Format diversity** — no PDF, HTML, or GitHub wiki ingestion; text-only.
- **Access control** — no distinction between private (personality-scoped) and shared (cross-personality) knowledge.
- **Health analytics** — no visibility into query coverage, result quality, or format distribution.

Phase 82 adds a document layer on top of the existing chunker + vector store + hybrid RRF search infrastructure without replacing it.

---

## Decision

### Document Table (`brain.documents`)

A tracking table persists every ingested document with its lifecycle status (`pending → processing → ready | error`), format, visibility scope, chunk count, and optional error message. This table is the source of truth for the document list UI and delete operations.

Personality scoping is via a nullable FK (`personality_id → soul.personalities`). `NULL` means globally visible; a non-null value restricts the document to that personality's knowledge context.

### Query Log Table (`brain.knowledge_query_log`)

Every RAG query is logged with `results_count` and `top_score`. This drives the Knowledge Health panel: recent query count, average relevance, and low-coverage detection (queries returning 0 results in the last 24 hours).

### DocumentManager — Ingest Pipeline

All ingestion goes through `DocumentManager`, which:

1. Inserts a `brain.documents` row with `status = 'processing'`
2. Extracts plain text from the buffer/URL/text:
   - `txt` / `md` — used as-is
   - `html` — strips `<script>`, `<style>`, all HTML tags; decodes entities; collapses whitespace
   - `pdf` — dynamic `import('pdf-parse')` so the ~4 MB parser is only loaded when needed
   - `url` — `fetch(url)` → treat response as HTML → strip tags
3. Chunks text via existing `chunk()` from `brain/chunker.ts`
4. Calls `brainManager.learn(chunkText, ...)` per chunk with source `document:<docId>:chunk<N>` — this auto-indexes into the vector store and `brain.knowledge` table
5. Updates `brain.documents → status = 'ready', chunk_count = N`
6. On any error: updates `status = 'error', error_message`

This pipeline reuses the entire existing vector + RRF search infrastructure with no changes to `BrainStorage.queryKnowledgeByRRF()` or `VectorMemoryManager.searchKnowledge()`.

### GitHub Wiki Connector

`ingestGithubWiki(owner, repo, ...)` calls `GET https://api.github.com/repos/:owner/:repo/contents/`, filters files with a `.md` extension, and fetches each via its `download_url`. Non-markdown files (images, YAML, etc.) are silently skipped. Only flat repository root scanning is supported in this phase — recursive subdirectory traversal is deferred.

### Access Control (private vs. shared)

- `visibility: 'private'` — document chunks are tagged with the personality's ID in `brain.knowledge.personality_id`. The existing `queryKnowledgeByRRF` already supports per-personality filtering.
- `visibility: 'shared'` — chunks stored globally (`personality_id = null`). Any personality's RAG query can retrieve them.

MCP tools and API endpoints accept a `personalityId` + `visibility` parameter for scoping ingestion and listing.

### MCP Tools

Four tools expose the knowledge base to the AI:

| Tool | Action |
|------|--------|
| `kb_search` | Semantic search via existing `/api/v1/brain/search/similar?type=knowledge` |
| `kb_add_document` | Ingest URL (if `content` starts with `http`) or raw text |
| `kb_list_documents` | List documents with optional personalityId / visibility filter |
| `kb_delete_document` | Delete document and all its chunks via source prefix sweep |

### Dashboard

`KnowledgeBaseTab` is surfaced as a `Documents` tab in `VectorMemoryExplorerPage` (alongside Semantic Search, Memories, Knowledge, Add Entry). This avoids sidebar navigation changes and keeps all brain-related content co-located.

Three sub-panels:
- **Documents** — list with status/format badges, chunk count, delete; drag-drop file upload
- **Connectors** — web crawl, GitHub wiki sync, paste text
- **Health** — 4 KPI cards, low-coverage warning, format breakdown

---

## Rejected / Deferred Alternatives

| Option | Reason deferred |
|--------|-----------------|
| Tesseract OCR sidecar | Adds ~400 MB Docker layer; demand not established |
| Notion / Confluence / Google Drive connectors | OAuth complexity; auth token per-user not yet modelled |
| DOCX support | Requires `mammoth` or `docx2pdf`; low demand |
| Recursive web crawl (depth > 1) | Scope creep; link extraction + dedup not trivial |
| Background queue (BullMQ / pg_boss) | For MVP, ingestion is synchronous in the request handler (< 2 s for typical documents); queue deferred to Phase 87 |
| Separate vector collection per document | Over-engineering; source-prefix tagging suffices for document-level delete and filtering |

---

## Consequences

- **4 new MCP tools** visible to the AI: `kb_search`, `kb_add_document`, `kb_list_documents`, `kb_delete_document`
- **Multipart upload endpoint** (`/api/v1/brain/documents/upload`) with 20 MB per-file limit (overrides the gateway's 2 MB global multipart limit via per-route options)
- **`pdf-parse`** added to `packages/core/package.json` as a dynamic import — does not increase cold-start time
- **Migration 067** adds two tables; backward-compatible (new tables only)
- **Phase 83** (Content Guardrails grounding check) and **Phase 86** (Inline Citations) are now unblocked
- Ingestion is synchronous; documents > ~500 KB may add latency to the upload response. Background processing queue should be added before serving documents larger than 1 MB regularly.

---

## Files

| File | Action |
|------|--------|
| `packages/core/src/storage/migrations/067_knowledge_base.sql` | New |
| `packages/core/src/brain/document-manager.ts` | New |
| `packages/core/src/brain/document-routes.ts` | New |
| `packages/core/src/brain/storage.ts` | Extended |
| `packages/core/src/brain/types.ts` | Extended |
| `packages/core/src/secureyeoman.ts` | DocumentManager init + getter |
| `packages/core/src/gateway/server.ts` | registerDocumentRoutes |
| `packages/mcp/src/tools/knowledge-base-tools.ts` | New |
| `packages/mcp/src/tools/manifest.ts` | +4 entries |
| `packages/dashboard/src/components/knowledge/` | New directory (4 components) |
| `packages/dashboard/src/components/VectorMemoryExplorerPage.tsx` | Documents tab |
