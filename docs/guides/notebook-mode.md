# Notebook Mode — Long Context Windowing

> **Phase 84** | ADR 165 | NotebookLM-style source grounding

Notebook Mode loads your entire Knowledge Base corpus into the AI's context window at inference time — every document, every chunk, fully visible. No retrieval step; no missed context. Think of it as the AI reading all your notes before answering, rather than searching for relevant snippets.

---

## Overview: RAG vs Notebook Mode

| Mode | Mechanism | Best for |
|------|-----------|----------|
| **RAG** (default) | Top-K hybrid retrieval (FTS + vector RRF) | Large knowledge bases; fast inference |
| **Notebook** | Full corpus loaded into context window | < ~200K tokens; deep cross-document reasoning |
| **Hybrid** | Notebook first; falls back to RAG if corpus exceeds budget | Best of both: quality + safety net |

### The "Flashlight" Problem with RAG

Standard RAG retrieves the top 5–10 chunks most similar to your query. If the answer requires connecting information across many documents, or the query doesn't perfectly surface the right chunks, retrieval can miss critical context.

Notebook Mode eliminates this: all source material is present. The AI never needs to guess what to retrieve.

---

## Enabling Notebook Mode

### Per Personality (Recommended)

Open a personality in the editor → **Brain** tab → **Knowledge Mode** section.

Choose one of:
- **RAG** — fast, scalable, default
- **Notebook** — full corpus every turn
- **Hybrid** — notebook if corpus fits, RAG fallback otherwise

### Token Budget

Notebook Mode reserves **65% of the model's context window** for the corpus by default. Remaining 35% is for the system prompt, tools, and conversation.

| Model | Context Window | Notebook Budget |
|-------|---------------|-----------------|
| Gemini 2.0 Flash | 1,000,000 | 650,000 tokens |
| Claude 3 / 4 | 200,000 | 130,000 tokens |
| GPT-4o | 128,000 | 83,200 tokens |

You can set a custom token budget per personality (Advanced settings) to override the default.

---

## Source Grounding

When Notebook Mode is active, the system prompt is extended with a `[NOTEBOOK — SOURCE LIBRARY]` block listing every document and its full text. The AI is instructed to:

1. Prioritise source documents over general training
2. Quote directly from sources where possible
3. Clearly note when asked questions that go beyond source material

This mirrors NotebookLM's "grounded generation" behaviour.

---

## Source Guide

Every time a document is ingested, SecureYeoman automatically generates (or refreshes) a **Source Guide** — a compact metadata map stored in the knowledge base:

```
KNOWLEDGE BASE OVERVIEW — 3 documents, 47 total chunks

- "API Design Spec" (pdf): 18 chunks
- "Architecture RFC" (md): 22 chunks
- "Meeting Notes Q1" (txt): 7 chunks
```

The Source Guide is always available in RAG mode (retrieved by topic match), so the AI always knows what documents exist even when not in Notebook Mode.

---

## Hybrid Mode Behaviour

Hybrid Mode works as follows:

1. Load the corpus and calculate total token count
2. If `totalTokens ≤ budget` → use Notebook mode (full corpus)
3. If `totalTokens > budget` → fall back to RAG (top-K retrieval)

This is the recommended setting for production use: you get NotebookLM-quality responses when the corpus is small, and efficient RAG when it grows.

---

## Knowledge Health Panel

The **Knowledge Base → Health** tab shows a **Notebook Mode Corpus Estimate** card with:

- Estimated token count for the current corpus
- Whether it fits within each major model's notebook budget
- Visual indicators (green = fits, amber/red = exceeds)

This helps you decide when to switch from Notebook to Hybrid/RAG mode.

---

## API

### Get Notebook Corpus

```http
GET /api/v1/brain/notebook/corpus?personalityId=<id>&tokenBudget=130000
```

Returns:
```json
{
  "documents": [
    {
      "docId": "01924678-...",
      "title": "Architecture RFC",
      "format": "md",
      "chunkCount": 22,
      "text": "# Architecture RFC\n\n...",
      "estimatedTokens": 3800
    }
  ],
  "totalTokens": 3800,
  "fitsInBudget": true,
  "budget": 130000
}
```

### Generate / Refresh Source Guide

```http
POST /api/v1/brain/notebook/source-guide
Content-Type: application/json

{ "personalityId": null }
```

Called automatically after every successful document ingest. Can be triggered manually to refresh after bulk changes.

---

## Programmatic Usage (MCP)

Use the `kb_search` tool in RAG mode, or enable Notebook Mode on the personality to have the full corpus loaded automatically. The MCP layer itself is transparent — mode selection is per-personality.

---

## Limitations

- **Token budget**: Very large knowledge bases (> 650K tokens with Gemini, > 130K tokens with Claude) cannot use Notebook Mode. Use Hybrid or RAG instead.
- **Cost**: Notebook Mode sends the full corpus on every turn, which can significantly increase token usage and cost.
- **Oversized documents**: Documents with no sentence/paragraph boundaries (e.g., continuous streams of text) are automatically sub-chunked into ≤ 3,200-character pieces to stay within storage limits.
- **Latency**: Loading a large corpus adds measurable latency vs. RAG retrieval.

---

## Troubleshooting

**Notebook Mode not activating**
- Check the personality's Knowledge Mode setting (default is RAG)
- Check the Knowledge Health panel to see if the corpus exceeds the token budget
- In Hybrid mode, if budget is exceeded, it silently falls back to RAG

**Source Guide not updating**
- Source guide is regenerated after every successful document ingest
- Manually trigger via `POST /api/v1/brain/notebook/source-guide` if needed

**Chunks returning 0 results**
- Documents must be in `status: 'ready'` for Notebook Mode to include them
- Error-status documents are excluded; check `GET /api/v1/brain/documents` for error messages

---

## Related

- [Knowledge Base](knowledge-base.md) — document ingestion, RAG retrieval, MCP tools
- [ADR 165](../adr/165-notebook-mode-long-context-windowing.md)
