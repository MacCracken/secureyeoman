# ADR 165 — Notebook Mode: NotebookLM-Style Long Context Windowing

**Status**: Accepted
**Phase**: 84
**Date**: 2026-02-28

---

## Context

SecureYeoman's Knowledge Base (ADR 162) provides RAG (Retrieval-Augmented Generation): hybrid FTS + vector retrieval returning the top-K most relevant knowledge chunks. This works well for large corpora but has the "flashlight" problem — retrieval can miss context that doesn't cleanly surface through query similarity.

Google's NotebookLM popularised an alternative: load the entire document corpus into the model's context window. With Gemini's 1M-token window, this means 600–700 pages of source material is always present. The AI reasons over the full corpus, not a retrieved sample.

---

## Decision

Implement **three knowledge modes** selectable per personality:

1. **`'rag'`** (default) — existing behaviour: top-K hybrid retrieval, injected into context as knowledge snippets
2. **`'notebook'`** — full corpus loaded into context window on every turn via a structured `[NOTEBOOK — SOURCE LIBRARY]` block
3. **`'hybrid'`** — attempt notebook mode first; if corpus exceeds the token budget, fall back to RAG

### Token Budget

Reserve 65% of the model's context window for the corpus (leaving 35% for system prompt, tools, conversation history):

| Model | Context Window | Budget |
|-------|---------------|--------|
| Gemini 2.0 Flash | 1,000,000 | 650,000 |
| Claude 3/4 | 200,000 | 130,000 |
| GPT-4o | 128,000 | 83,200 |

The 65% figure leaves adequate headroom for a rich system prompt + tools + typical conversation while still allowing thousands of tokens of source material.

### Source Guide

Auto-generated on every successful document ingest. Stored as a `brain.knowledge` entry with `source: 'source_guide', topic: '__source_guide__'`. Lists all ready documents, their format, and chunk count. Always available to RAG retrieval, ensuring the AI can answer "what documents do you have?" even without Notebook Mode.

---

## Implementation

### Storage

`BrainStorage.getAllDocumentChunks(personalityId?)` — SQL JOIN between `brain.knowledge` (WHERE `source LIKE 'document:%:chunk%'`) and `brain.documents` (WHERE `status = 'ready'`). Groups rows by document in application code, sorts chunks by parsed index.

### DocumentManager

- `getNotebookCorpus(personalityId?, tokenBudget?)` — returns `NotebookCorpus` with all documents, total tokens, budget check
- `generateSourceGuide(personalityId)` — upserts the `__source_guide__` knowledge entry; called fire-and-forget from HTTP route handlers after successful ingest

### Chat Routes

`gatherBrainContext()` extended to accept `knowledgeMode`, `model`, and `notebookTokenBudgetOverride`. In `notebook`/`hybrid` mode, calls `getNotebookCorpus()` and, if budget allows, injects a `[NOTEBOOK — SOURCE LIBRARY]` block appended to the system prompt.

### Content Length Guard

`chunkAndLearn()` now sub-splits any chunk whose text exceeds 3,200 characters before calling `brainManager.learn()`. This handles text with no sentence/paragraph boundaries (e.g., continuous word streams) that the chunker's oversized-sentence path would otherwise leave as a single oversized piece.

### Shared Types

`BodyConfigSchema` in `@secureyeoman/shared` gains:
- `knowledgeMode: z.enum(['rag', 'notebook', 'hybrid']).default('rag')`
- `notebookTokenBudget: z.number().int().min(1000).optional()`

---

## Alternatives Considered

### Full Corpus Every Turn (No Budget Check)

Simpler, but risks context overflow. The budget check + hybrid fallback protects against silent truncation.

### Sliding Window (Most-Recent Chunks)

Retains recency but loses older documents. Less predictable than either RAG or full-corpus modes.

### Server-Side Chunked Streaming

Streaming the corpus to the model in parts. More complex, model-specific, and not universally supported. Deferred to future work.

---

## Consequences

- **Positive**: Cross-document reasoning without retrieval failures; source grounding with explicit corpus block; transparent mode selection per personality; Hybrid mode provides automatic safety net
- **Negative**: Higher token usage and cost in Notebook Mode; latency scales with corpus size; corpora that exceed model context windows cannot use Notebook Mode
- **Neutral**: RAG mode is unchanged; existing integrations unaffected

---

## Related

- ADR 162 — Knowledge Base & RAG Platform
- Phase 82 notes in CHANGELOG
- `docs/guides/notebook-mode.md`
