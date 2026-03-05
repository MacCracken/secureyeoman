# ADR 005: Brain, Memory & Knowledge

## Status

Accepted

## Context

SecureYeoman's Brain module provides the agent's long-term memory, knowledge retrieval, and cognitive processing capabilities. As agents accumulate conversational history, learned facts, and ingested documents, the system must support semantic recall across conceptually related information, prevent memory bloat from redundant entries, maintain coherent context across long conversations, and ground responses in verifiable sources. Additionally, different agent personalities require isolated memory spaces, and operators need cognitive science-informed retrieval enhancements that go beyond naive similarity search.

This ADR consolidates the architectural decisions governing vector memory and semantic search, memory consolidation and compression, the knowledge base and RAG platform, cognitive ML enhancements, inline citations and grounding, conversation branching, and per-personality memory scoping.

## Decisions

### Vector Memory & Semantic Search

**Embedding Provider Abstraction.** A pluggable `EmbeddingProvider` interface supports two implementations: a local provider using SentenceTransformers via a Python sidecar process (default, private, no external API required), and an API provider supporting OpenAI, Gemini, or any OpenAI-compatible endpoint. Users may configure one or both; when both are active, local handles cost-free batch indexing while the API handles higher-quality single-shot queries.

**Vector Storage Backends.** Two backends are available. FAISS (default) runs in-process via native bindings with flat L2 or IVF indexes and disk persistence, suitable for single-node deployments. Qdrant operates as a client/server model with per-area collections, supporting distributed deployments. The `VectorStore` interface abstracts insert, search, delete, and count operations across both backends.

**BrainStorage Integration.** The existing storage interface gains vector methods without breaking current implementations. Memory and knowledge save operations generate and store embeddings. Query methods accept an optional `semanticQuery` parameter to activate vector search. A migration command indexes existing data on first run. All non-vector queries continue to work unchanged.

**Hybrid FTS + RRF Search.** Pure vector search and pure keyword search each have blind spots: vector search misses exact terms and identifiers; keyword search misses semantic paraphrases. The system implements hybrid full-text search with pgvector using Reciprocal Rank Fusion (RRF). A `search_vec` tsvector column with GIN indexes is added to memory and knowledge tables, maintained automatically by database triggers. Both FTS and vector queries run independently, then merge via the RRF formula `score(doc) = sum(1 / (60 + rank_i))`, where documents appearing in both indexes score additively. When the embedding model is unavailable, the system degrades gracefully to FTS-only search.

**Content-Chunked Indexing.** Large documents are split into overlapping ~800-token chunks at paragraph and sentence boundaries, with 15% overlap between consecutive chunks. Each chunk receives its own tsvector and optional vector embedding, enabling fine-grained retrieval at paragraph granularity without overflowing embedding model token limits.

**Meilisearch and Qdrant MCP Prebuilts.** For users with existing Meilisearch or Qdrant instances, one-click MCP prebuilt connections are available using the official MCP server packages from each vendor. These connect via stdio transport and require no backend changes, complementing the Brain module's internal search with external hybrid or vector search capabilities.

### Memory Consolidation & Compression

**LLM-Powered Memory Consolidation.** A hybrid trigger model prevents memory bloat from semantic duplicates. On every memory save, a fast vector similarity check auto-deduplicates entries above 0.95 cosine similarity without an LLM call, and flags entries between 0.85 and 0.95 for scheduled review. A background job (configurable schedule, default daily at 02:00) performs deep consolidation: it scans flagged and broadly similar memories, groups candidates, and sends them to the utility LLM, which selects from five actions (MERGE, REPLACE, KEEP_SEPARATE, UPDATE, SKIP). Safety mechanisms include a 0.9 minimum similarity threshold for REPLACE, optimistic locking against race conditions, 60-second batch timeouts, fallback to direct insertion on failure, dry-run mode, and full audit trail logging.

**Progressive History Compression.** Long conversations use a three-tier compression architecture with percentage-based token allocation: current topic (50% of context budget) retains full messages, historical topics (30%) are LLM-summarized, and bulk archives (20%) merge groups of older topics into highly compressed summaries. Compression escalates progressively: large message truncation, topic summarization, bulk merging, and finally oldest bulk removal. Topic boundaries are detected via explicit user signals, temporal gaps (30+ minutes), or token threshold breaches. Compressed history persists in the database, enabling multi-session continuity.

### Knowledge Base & RAG

**Document Management Platform.** A document layer sits atop the existing chunker, vector store, and hybrid RRF search infrastructure. The `DocumentManager` tracks every ingested document through a lifecycle (pending, processing, ready, error) with format, visibility scope, and chunk count metadata. Ingestion supports text, markdown, HTML (tag-stripped), PDF (dynamic import), and URL fetch. Each document is chunked and indexed into the existing knowledge store with source-prefix tagging for document-level operations.

**Access Control.** Documents may be private (personality-scoped) or shared (globally visible). Personality scoping uses the existing per-personality filtering in knowledge queries.

**GitHub Wiki Connector.** Automated ingestion of GitHub wiki repositories, fetching markdown files from the repository root via the GitHub API.

**Query Logging and Health Analytics.** Every RAG query is logged with result count and top score, driving a health panel that surfaces recent query volume, average relevance, and low-coverage detection.

**Notebook Mode.** Three knowledge modes are selectable per personality. RAG mode (default) uses top-K hybrid retrieval. Notebook mode loads the entire document corpus into the model's context window via a structured source library block, reserving 65% of the context window for the corpus. Hybrid mode attempts notebook first and falls back to RAG if the corpus exceeds the token budget. An auto-generated source guide lists all ready documents, ensuring the agent can describe its knowledge base even in RAG mode.

### Cognitive ML (ACT-R, Hebbian, Context Retrieval, Working Memory, Salience)

**ACT-R Activation and Hebbian Learning.** Memory retrieval ranking incorporates ACT-R base-level activation (logarithmic decay based on access history) and Hebbian associative learning (co-activation strengthening between related memories). A background worker manages Hebbian decay and activation statistics. Configuration controls activation weight, Hebbian scale, retrieval threshold, and boost caps.

**Context-Dependent Retrieval.** Based on Tulving's encoding specificity principle, query embeddings are fused with a conversation context centroid via linear interpolation (`searchVec = lambda * queryEmb + (1 - lambda) * contextEmb`), biasing retrieval toward memories encoded in similar conversational contexts. This uses pure embedding arithmetic with no additional model required.

**Working Memory Buffer.** A capacity-limited scratchpad (default 7 items, following Miller's law) tracks the active cognitive context. It maintains a rolling window of query embeddings and uses recency-weighted trajectory prediction to pre-fetch likely-needed vectors from the store before explicit request.

**Salience Classification.** Memory content is classified against pre-computed anchor embeddings for five dimensions (urgency, error, frustration, success, curiosity) using cosine similarity. Returns per-dimension scores and a weighted composite. No additional model is required; classification uses the existing embedding provider.

**Scaffolded Future Capabilities.** Three modules are defined with types and interfaces for future activation: LLM reconsolidation (deciding to keep, update, or split overlapping memories), semantic clustering via k-means over memory embeddings with LLM-generated cluster labels, and RL retrieval optimization using Thompson Sampling to learn optimal score-blending weights from user feedback.

All three active cognitive ML features are opt-in (disabled by default), require no new dependencies or schema migrations, and degrade gracefully when disabled.

### Citations & Grounding

**LLM-Instruction-Based Citations.** When citations are enabled, a citation instruction block is injected into the system prompt listing numbered sources and directing the model to produce inline `[N]` references. This leverages the LLM's native attribution capability without post-processing that could break formatting, and works with any model.

**Token-Overlap Grounding.** Groundedness enforcement uses Jaccard-like token overlap as the default similarity metric. Each response sentence is compared against all sources; sentences with overlap below threshold are flagged. This avoids mandatory embedding infrastructure and adds zero latency overhead. Optional cosine similarity is available when an embedding provider is configured.

**Web Grounding via Tool Capture.** Web search results become citable sources by intercepting web search tool call results in the agentic loop and appending them to the source list.

**Document Provenance.** An 8-dimension provenance scoring system lives on documents (not individual chunks). Chunks inherit the parent document's trust score. Documents without provenance data default to a neutral 0.5 score.

**Backward Compatibility.** The `BrainContextMeta` interface gains an optional `sources` field. Citation and grounding columns on messages are nullable, so historical messages work without backfill.

### Conversation Branching

**Git-Like Branch Lineage.** Conversations support parent/child relationships via `parent_conversation_id`, `fork_message_index`, and `branch_label` columns. The `branchFromMessage()` operation copies messages up to a specified index into a new conversation with a parent foreign key. A recursive CTE builds the full branch tree from any node.

**Replay System.** A replay engine supports single and batch replay of branched conversations with different models. Replay jobs execute asynchronously. Pairwise comparison uses quality scores and win/loss/tie determination to support systematic prompt engineering workflows.

**Branch Integrity.** `ON DELETE SET NULL` on the parent foreign key ensures deleting a parent conversation does not cascade to its branches.

### Per-Personality Scoping

**Memory Isolation.** By default, each personality's memory and knowledge queries are scoped to entries created by that personality plus legacy entries with NULL personality ID. This prevents cross-personality memory contamination in both the system prompt and tool execution contexts.

**Omnipresent Mind Toggle.** A boolean `omnipresentMind` configuration option (default false) restores the unfiltered, cross-personality view for orchestrator agents that need to access all memories regardless of origin. This carries no performance overhead compared to pre-scoping behavior.

**Concurrency Safety.** Chat routes resolve the effective personality ID per-request early in the handler and pass it directly to each brain manager call, eliminating shared-state race conditions between simultaneous requests from different personalities.

**Skill Scoping and Deletion Sync.** Both the system prompt composition and tool execution paths thread personality ID through to skill queries, ensuring that skills installed for one personality do not appear in another's context. Skill deletion synchronizes the marketplace installed state, and marketplace uninstall removes all matching brain skill copies across personalities.

**Vector Memory Scoping.** Personality scoping extends to the vector search path. Vector memory search methods accept an optional personality ID: undefined for omnipresent access, or a specific ID for scoped access. Per-personality self-identity knowledge entries are seeded automatically.

## Consequences

### Positive

- Semantic recall finds conceptually related information regardless of keyword overlap, while hybrid FTS+RRF ensures exact-term precision for identifiers and commands.
- Local-first embedding default requires no external API calls, aligning with privacy principles.
- Progressive history compression maintains coherent multi-session context without exhausting model context windows.
- The document management platform enables structured knowledge ingestion with lifecycle tracking, format diversity, and access control.
- Notebook mode provides full-corpus reasoning for smaller knowledge bases, with automatic RAG fallback for larger ones.
- Cognitive ML enhancements bring evidence-based cognitive science models to retrieval without new dependencies.
- Inline citations and grounding enable response verification and source traceability.
- Per-personality memory isolation prevents cross-contamination while supporting orchestrator patterns via the omnipresent toggle.
- Conversation branching enables systematic prompt engineering through controlled experimentation.

### Negative

- Deep memory consolidation and topic summarization consume utility LLM tokens on each run.
- Lossy compression means specific details from old conversation topics may be lost.
- FAISS native bindings add a compiled, platform-specific dependency.
- Vector indexing adds latency to memory saves (approximately 50ms local, 200ms API).
- Notebook mode incurs higher token usage and cost; latency scales with corpus size.
- LLM-instruction citations are best-effort and the model may occasionally omit or hallucinate citation numbers.
- Legacy memories with null personality ID are shared by all personalities with no automatic reassignment mechanism.
