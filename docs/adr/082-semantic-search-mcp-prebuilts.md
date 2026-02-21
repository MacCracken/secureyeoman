# ADR 082 — Semantic Search MCP Prebuilts: Meilisearch & Qdrant

**Date**: 2026-02-21
**Status**: Accepted

---

## Context

A review of real-world agent workflows (OpenClaw gist, Phase 27 integration review) identified a gap: SecureYeoman's Brain module provides local vector semantic search (FAISS/Qdrant/Chroma), but there is no way to connect an *existing* Meilisearch or Qdrant instance as a first-class MCP tool — separate from the Brain module's internal vector storage.

This matters because:

1. **Meilisearch** is the dominant self-hosted hybrid search engine. Many users already run it for their own applications. Hybrid search (BM25 + vector, with typo tolerance, facets, filtering) is meaningfully different from pure vector search — it handles keyword-heavy queries that dense embeddings struggle with.

2. **Qdrant** is the leading self-hosted vector database beyond what the Brain module uses internally. Users with large existing Qdrant collections (application embeddings, document stores) want their agent to query those collections directly — not just the Brain module's managed subset.

3. **QMD (Quarto Markdown Database)** — the tool cited in community usage for Obsidian note indexing — is *not needed*. The Brain module's `knowledge_store` + `knowledge_search` + filesystem MCP tools cover the same use case with better integration.

---

## Decision

Add **Meilisearch** and **Qdrant** as one-click MCP prebuilts using their official MCP server packages.

### Why prebuilts rather than native integrations?

Both services expose rich MCP servers that are actively maintained by their respective teams. Wrapping them in a custom native integration adapter would duplicate their work and create a maintenance burden. The MCP prebuilt pattern is the correct abstraction: connect once, get all their tools.

### Meilisearch

- **Package**: `meilisearch-mcp` (official, from Meilisearch team)
- **Runtime**: Python / `uvx` — `uvx meilisearch-mcp`
- **Transport**: stdio
- **Config**: `MEILI_HTTP_ADDR` (URL, shown as text input), `MEILI_MASTER_KEY` (secret)
- **Note shown in UI**: Requires `uv` (Python package manager)
- **Rationale**: Hybrid full-text + vector search complements the Brain module's pure-vector search. Useful for document retrieval, faceted search, multi-language queries.

### Qdrant

- **Package**: `mcp-server-qdrant` (official, from Qdrant team)
- **Runtime**: Python / `uvx` — `uvx mcp-server-qdrant`
- **Transport**: stdio
- **Config**: `QDRANT_URL` (URL), `QDRANT_API_KEY` (secret, blank for local), `COLLECTION_NAME`
- **Note shown in UI**: Requires `uv` (Python package manager)
- **Rationale**: Lets agents query existing Qdrant collections (application embeddings, document stores) independently of the Brain module's internal managed storage.

### `uvx` as command type

Both official packages are Python-based and use `uvx` (the `uv` tool runner) rather than `npx`. The `PrebuiltServer.command` field already accepts any shell command string — `uvx meilisearch-mcp` works identically to `npx -y exa-mcp-server` from the stdio MCP client's perspective. No interface changes are needed; a `note` field was added to the UI to inform users about the `uv` prerequisite.

---

## What was NOT added and why

| Tool | Decision | Reason |
|---|---|---|
| **QMD** | Not added | Brain module + filesystem MCP tools cover this fully |
| **Pinecone** | Not added | No officially maintained Pinecone MCP server package yet; demand unclear |
| **Weaviate** | Not added | No officially maintained npm/uvx package; demand unclear |
| **Typesense** | Not added | No official MCP server; Meilisearch covers the same niche |
| **OpenSearch / Algolia** | Not added | Enterprise/SaaS; demand unclear for the self-hosted target audience |

---

## Consequences

- `PREBUILT_SERVERS` in `McpPrebuilts.tsx` grows from 10 to 12 entries
- `PrebuiltServer` interface gains an optional `note` field rendered in the expanded form as a yellow advisory callout
- The existing `urlKeys` pattern for distinguishing URL fields from secret fields is reused for `MEILI_HTTP_ADDR` and `QDRANT_URL`
- Users must have `uv` installed (`curl -LsSf https://astral.sh/uv/install.sh | sh`) to use these prebuilts — surfaced in the UI note
- No backend changes; both servers connect via the existing MCP client infrastructure

---

## Related

- [ADR 004 — MCP Protocol](004-mcp-protocol.md)
- [ADR 031 — Vector Semantic Memory](031-vector-semantic-memory.md)
- [ADR 046 — MCP Prebuilts](046-phase11-mistral-devtools-mcp-prebuilts.md)
- [ADR 081 — Twitter/X + Home Assistant + Coolify](081-twitter-ha-coolify-integrations.md)
