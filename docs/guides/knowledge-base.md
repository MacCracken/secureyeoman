# Knowledge Base & RAG Platform

This guide explains how to build, manage, and query SecureYeoman's document-oriented knowledge base — the Phase 82 feature that turns the AI's brain into a full RAG (Retrieval-Augmented Generation) platform.

---

## Prerequisites

- SecureYeoman running (core + MCP)
- At least one active personality configured
- Optional: a GitHub personal access token for private repository wiki sync

---

## Overview

The knowledge base stores **documents** — files, web pages, GitHub wiki pages, or raw text — and makes their content available to the AI via semantic search. Each document is:

1. Ingested (text extracted from the file/URL)
2. Chunked into overlapping segments
3. Embedded into the vector store
4. Indexed in the hybrid BM25 + vector search pipeline

The AI can search the knowledge base using the `kb_search` MCP tool, or you can query it directly in the Dashboard → Brain → Documents → Semantic Search tab.

---

## Adding Documents

### Via Dashboard

Navigate to **Brain → Documents** (the Documents tab in the Vector Memory Explorer page).

#### Upload a File

1. Open the **Documents** sub-tab.
2. Drag a file onto the upload zone, or click **Choose File**.
3. Supported formats: `.pdf`, `.html`, `.htm`, `.md`, `.txt`
4. Select visibility: **Private** (scoped to the active personality) or **Shared** (available to all personalities).
5. Click **Upload**. The document appears with status `processing`, then `ready` once chunking completes.

#### Ingest a URL

1. Open the **Connectors** sub-tab.
2. Paste the URL into the **Web Crawl** input.
3. Click **Ingest URL**. The page HTML is fetched, tags stripped, and the resulting text ingested as an `html` document.

> Only the page at the given URL is fetched — recursive crawling is not yet supported.

#### Sync a GitHub Wiki

1. Open the **Connectors** sub-tab.
2. Enter the repository **owner** and **repo name** (e.g., `myorg` / `my-project`).
3. Click **Sync Wiki**. All `.md` files in the repository root are fetched via the GitHub API and ingested.

> For private repositories, set `GITHUB_TOKEN` in your environment or Docker Compose config.

#### Paste Text

1. Open the **Connectors** sub-tab.
2. Fill in **Title** and paste content into the **Content** area.
3. Click **Add to Knowledge Base**.

---

## Via MCP Tools

The AI can manage the knowledge base directly using these tools:

### `kb_add_document`

```
kb_add_document(
  content: string,       // URL (https://...) or raw text
  title?: string,        // Required for text; optional for URLs
  personalityId?: string,
  visibility?: 'private' | 'shared'
)
```

If `content` starts with `http`, the tool ingests the URL. Otherwise, it ingests the content as raw text.

### `kb_search`

```
kb_search(
  query: string,
  personalityId?: string,
  topK?: number,         // Default: 5
  minScore?: number      // Default: 0.6
)
```

Returns ranked results from the hybrid BM25 + vector search pipeline.

### `kb_list_documents`

```
kb_list_documents(
  personalityId?: string,
  visibility?: 'private' | 'shared'
)
```

Returns all ingested documents matching the filter.

### `kb_delete_document`

```
kb_delete_document(id: string)
```

Deletes the document record **and** all its vector chunks. The knowledge base is immediately updated.

---

## Via REST API

All operations are available over HTTP:

| Method | Path | Description |
|--------|------|-------------|
| `POST` | `/api/v1/brain/documents/upload` | Multipart file upload (max 20 MB) |
| `POST` | `/api/v1/brain/documents/ingest-url` | `{ url, personalityId?, visibility? }` |
| `POST` | `/api/v1/brain/documents/ingest-text` | `{ text, title, personalityId?, visibility? }` |
| `POST` | `/api/v1/brain/documents/connectors/github-wiki` | `{ owner, repo, personalityId? }` |
| `GET` | `/api/v1/brain/documents` | List (query: `personalityId?`, `visibility?`) |
| `GET` | `/api/v1/brain/documents/:id` | Get one document |
| `DELETE` | `/api/v1/brain/documents/:id` | Delete document + chunks |
| `GET` | `/api/v1/brain/knowledge-health` | Health stats (query: `personalityId?`) |

---

## Access Control

### Private vs. Shared

| Visibility | Who can access |
|-----------|----------------|
| `private` | Only the personality specified at ingest time |
| `shared` | All personalities |

When ingesting without a `personalityId`, documents default to `private` global scope (available to all personalities via the `NULL` personality_id path in knowledge queries).

### Recommended Pattern

- **Shared**: product documentation, public knowledge, reference material used by all personalities.
- **Private**: personality-specific context, role-specific procedures, persona background.

---

## Document Formats

| Extension | Format | Extraction method |
|-----------|--------|-------------------|
| `.txt` | `txt` | Used as-is |
| `.md` | `md` | Used as-is |
| `.html` / `.htm` | `html` | HTML tags stripped, entities decoded |
| `.pdf` | `pdf` | `pdf-parse` library (dynamic import) |
| URL | `url` | Fetched as HTML → stripped |

---

## Knowledge Health

The **Health** sub-tab shows analytics for the last 24 hours:

| Metric | Description |
|--------|-------------|
| Total Documents | Documents in `brain.documents` |
| Total Chunks | Sum of `chunk_count` across all documents |
| Queries (24h) | Queries logged via `logQuery()` in the last 24 hours |
| Avg Relevance | Average `top_score` for queries in the last 24 hours |
| Low-Coverage Queries | Queries that returned 0 results in the last 24 hours |

Low-coverage queries indicate gaps in the knowledge base — add documents covering those topics to improve coverage.

---

## Security Considerations

- **URL validation**: The ingest-URL endpoint validates the URL with `new URL(url)` and only fetches `http`/`https` URLs. SSRF to internal ranges is not explicitly blocked at the application layer — if internet access must be restricted, use a network-level egress policy.
- **File size**: Uploads are limited to 20 MB per file. For larger documents, split them or use the GitHub wiki connector.
- **PDF parsing**: `pdf-parse` is loaded dynamically and runs in the same process as the core server. Malformed PDFs that crash `pdf-parse` will leave the document in `status = 'error'`; the server itself is unaffected.
- **GitHub token**: Use a fine-grained personal access token scoped to `Contents: Read` on the specific repository. Set it as `GITHUB_TOKEN` in the environment. Tokens are never stored — they are read from the environment at request time.

---

## Troubleshooting

### Document stuck in `processing`

If a document stays in `processing` after 30 seconds, the ingestion likely threw an unhandled error. Check core server logs for a stack trace. You may need to delete the document and re-ingest.

### PDF shows status `error`

`pdf-parse` may fail on encrypted or malformed PDFs. Convert to `.txt` or `.md` before uploading.

### GitHub wiki returns no documents

- Ensure the repository has a wiki (GitHub Wikis is a separate setting per repo).
- The connector uses the repository **contents API** (`/repos/:owner/:repo/contents/`) — this works for repos where the wiki is stored as markdown files in the repo root, but **not** for GitHub's separate wiki pages endpoint. Use a separate wiki clone if needed.
- For private repos: verify `GITHUB_TOKEN` has `Contents: Read` permission.

### `kb_search` returns no results

- Check the Health panel — if `Total Chunks` is 0, no documents have been successfully ingested.
- Lower `minScore` (default 0.6) — try 0.3 for broader recall.
- Verify the personality filter matches the documents' `personalityId`.
