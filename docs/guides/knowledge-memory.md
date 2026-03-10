# Knowledge & Memory

This guide covers SecureYeoman's document-oriented knowledge base, citation and grounding features, per-personality memory scoping, cognitive ML memory enhancements, and conversation branching with replay.

---

## Knowledge Base & RAG Platform

The knowledge base stores **documents** -- files, web pages, GitHub wiki pages, or raw text -- and makes their content available to the AI via semantic search. Each document is:

1. Ingested (text extracted from the file/URL)
2. Chunked into overlapping segments
3. Embedded into the vector store
4. Indexed in the hybrid BM25 + vector search pipeline

The AI can search the knowledge base using the `kb_search` MCP tool, or you can query it directly in the Dashboard > Brain > Documents > Semantic Search tab.

### Prerequisites

- SecureYeoman running (core + MCP)
- At least one active personality configured
- Optional: a GitHub personal access token for private repository wiki sync

### Adding Documents

#### Via Dashboard

Navigate to **Brain > Documents** (the Documents tab in the Vector Memory Explorer page).

**Upload a File**

1. Open the **Documents** sub-tab.
2. Drag a file onto the upload zone, or click **Choose File**.
3. Supported formats: `.pdf`, `.html`, `.htm`, `.md`, `.txt`
4. Select visibility: **Private** (scoped to the active personality) or **Shared** (available to all personalities).
5. Click **Upload**. The document appears with status `processing`, then `ready` once chunking completes.

**Ingest a URL**

1. Open the **Connectors** sub-tab.
2. Paste the URL into the **Web Crawl** input.
3. Click **Ingest URL**. The page HTML is fetched, tags stripped, and the resulting text ingested as an `html` document.

> Only the page at the given URL is fetched -- recursive crawling is not yet supported.

**Sync a GitHub Wiki**

1. Open the **Connectors** sub-tab.
2. Enter the repository **owner** and **repo name** (e.g., `myorg` / `my-project`).
3. Click **Sync Wiki**. All `.md` files in the repository root are fetched via the GitHub API and ingested.

> For private repositories, set `GITHUB_TOKEN` in your environment or Docker Compose config.

**Paste Text**

1. Open the **Connectors** sub-tab.
2. Fill in **Title** and paste content into the **Content** area.
3. Click **Add to Knowledge Base**.

#### Via MCP Tools

The AI can manage the knowledge base directly using these tools:

**`kb_add_document`**

```
kb_add_document(
  content: string,       // URL (https://...) or raw text
  title?: string,        // Required for text; optional for URLs
  personalityId?: string,
  visibility?: 'private' | 'shared'
)
```

If `content` starts with `http`, the tool ingests the URL. Otherwise, it ingests the content as raw text.

**`kb_search`**

```
kb_search(
  query: string,
  personalityId?: string,
  topK?: number,         // Default: 5
  minScore?: number      // Default: 0.6
)
```

Returns ranked results from the hybrid BM25 + vector search pipeline.

**`kb_list_documents`**

```
kb_list_documents(
  personalityId?: string,
  visibility?: 'private' | 'shared'
)
```

Returns all ingested documents matching the filter.

**`kb_delete_document`**

```
kb_delete_document(id: string)
```

Deletes the document record **and** all its vector chunks. The knowledge base is immediately updated.

#### Via REST API

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

### Document Formats

| Extension | Format | Extraction method |
|-----------|--------|-------------------|
| `.txt` | `txt` | Used as-is |
| `.md` | `md` | Used as-is |
| `.html` / `.htm` | `html` | HTML tags stripped, entities decoded |
| `.pdf` | `pdf` | `pdf-parse` library (dynamic import) |
| URL | `url` | Fetched as HTML, then stripped |

### Access Control

#### Private vs. Shared

| Visibility | Who can access |
|-----------|----------------|
| `private` | Only the personality specified at ingest time |
| `shared` | All personalities |

When ingesting without a `personalityId`, documents default to `private` global scope (available to all personalities via the `NULL` personality_id path in knowledge queries).

**Recommended pattern:**

- **Shared**: product documentation, public knowledge, reference material used by all personalities.
- **Private**: personality-specific context, role-specific procedures, persona background.

### Knowledge Health

The **Health** sub-tab shows analytics for the last 24 hours:

| Metric | Description |
|--------|-------------|
| Total Documents | Documents in `brain.documents` |
| Total Chunks | Sum of `chunk_count` across all documents |
| Queries (24h) | Queries logged via `logQuery()` in the last 24 hours |
| Avg Relevance | Average `top_score` for queries in the last 24 hours |
| Low-Coverage Queries | Queries that returned 0 results in the last 24 hours |

Low-coverage queries indicate gaps in the knowledge base -- add documents covering those topics to improve coverage.

### Security Considerations

- **URL validation**: The ingest-URL endpoint validates the URL with `new URL(url)` and only fetches `http`/`https` URLs. SSRF to internal ranges is not explicitly blocked at the application layer -- if internet access must be restricted, use a network-level egress policy.
- **File size**: Uploads are limited to 20 MB per file. For larger documents, split them or use the GitHub wiki connector.
- **PDF parsing**: `pdf-parse` is loaded dynamically and runs in the same process as the core server. Malformed PDFs that crash `pdf-parse` will leave the document in `status = 'error'`; the server itself is unaffected.
- **GitHub token**: Use a fine-grained personal access token scoped to `Contents: Read` on the specific repository. Set it as `GITHUB_TOKEN` in the environment. Tokens are never stored -- they are read from the environment at request time.

### Knowledge Base Troubleshooting

**Document stuck in `processing`** -- If a document stays in `processing` after 30 seconds, the ingestion likely threw an unhandled error. Check core server logs for a stack trace. You may need to delete the document and re-ingest.

**PDF shows status `error`** -- `pdf-parse` may fail on encrypted or malformed PDFs. Convert to `.txt` or `.md` before uploading.

**GitHub wiki returns no documents** -- Ensure the repository has a wiki (GitHub Wikis is a separate setting per repo). The connector uses the repository contents API (`/repos/:owner/:repo/contents/`) -- this works for repos where the wiki is stored as markdown files in the repo root, but not for GitHub's separate wiki pages endpoint. Use a separate wiki clone if needed. For private repos, verify `GITHUB_TOKEN` has `Contents: Read` permission.

**`kb_search` returns no results** -- Check the Health panel; if `Total Chunks` is 0, no documents have been successfully ingested. Lower `minScore` (default 0.6) -- try 0.3 for broader recall. Verify the personality filter matches the documents' `personalityId`.

---

## Citations & Grounding

### Enabling Citations

Citations are enabled per personality via the `enableCitations` body config:

```json
{
  "body": {
    "enableCitations": true,
    "groundednessMode": "off"
  }
}
```

When enabled, the AI system prompt includes a numbered source list instructing the model to produce inline `[1]`, `[2]` citations referencing retrieved knowledge base documents and memories.

### Groundedness Modes

The `groundednessMode` setting controls how ungrounded claims are handled:

| Mode | Behavior |
|------|----------|
| `off` (default) | No grounding check performed |
| `annotate_only` | Ungrounded sentences get `[unverified]` appended |
| `block_unverified` | Response blocked entirely if grounding score < 0.3 |
| `strip_unverified` | Ungrounded sentences removed from response |

Grounding is checked using token-overlap similarity between each response sentence and the retrieved source texts. A sentence is considered grounded if its best match score exceeds the threshold.

### Source Types

Citations can reference four source types:

- **memory** -- Episodic/semantic memories from the brain
- **knowledge** -- Knowledge base entries
- **document_chunk** -- Specific chunks from ingested documents
- **web_search** -- Results from web search tool calls

### Document Provenance Scoring

Each knowledge base document can be scored on 8 provenance dimensions:

1. **Authority** (0.0--1.0) -- Credibility of the source
2. **Currency** (0.0--1.0) -- Timeliness of the information
3. **Objectivity** (0.0--1.0) -- Neutrality / freedom from bias
4. **Accuracy** (0.0--1.0) -- Factual correctness
5. **Methodology** (0.0--1.0) -- Research rigor
6. **Coverage** (0.0--1.0) -- Breadth of topic coverage
7. **Reliability** (0.0--1.0) -- Consistency and reproducibility
8. **Provenance** (0.0--1.0) -- Chain-of-custody clarity

The composite `trust_score` is a weighted average of these dimensions. Documents with no provenance data default to 0.5.

#### Provenance API

```bash
# Get provenance scores
GET /api/v1/brain/documents/:id/provenance

# Update provenance scores
PUT /api/v1/brain/documents/:id/provenance
Content-Type: application/json
{
  "scores": {
    "authority": 0.9,
    "currency": 0.8,
    "objectivity": 0.7,
    "accuracy": 0.9,
    "methodology": 0.6,
    "coverage": 0.8,
    "reliability": 0.85,
    "provenance": 0.9
  }
}
```

### Citation Feedback

Users can provide relevance feedback on individual citations:

```bash
POST /api/v1/brain/citations/:messageId/feedback
Content-Type: application/json
{
  "citationIndex": 1,
  "sourceId": "source-uuid",
  "relevant": false
}
```

Feedback is stored and can be used as a quality signal for knowledge base maintenance.

### Grounding Stats

Get aggregate grounding statistics for a personality:

```bash
GET /api/v1/brain/grounding/stats?personalityId=<id>&windowDays=30
```

Returns average score, total messages checked, and count of low-grounding messages.

### Citations Dashboard

When citations are enabled:

- Assistant messages show a **Sources** section below the brain context with numbered references, type badges, and document titles.
- `[N]` markers in the response text are rendered as superscript citation links.
- A grounding score badge (green/yellow/red) appears on assistant messages.
- Clicking a citation opens a slide-in drawer with full source content and feedback buttons.

---

## Per-Personality Memory Scoping

Each personality maintains its own private pool of memories and knowledge. By default, one personality's context does not appear in another's recall. The **Omnipresent Mind** toggle gives an orchestrator personality read access to the shared cross-agent pool.

### Default Behaviour (Isolated)

When a personality creates a memory during a chat session it is stored with that personality's `personality_id`. When it recalls context, only its own memories (and legacy entries with no owner) are returned.

```
T.Ron   recalls -> only T.Ron memories + unowned legacy entries
FRIDAY  recalls -> only FRIDAY memories + unowned legacy entries
```

### Omnipresent Mind (Shared Pool)

When **Omnipresent Mind** is enabled on a personality, its queries carry no personality filter -- it sees every memory and knowledge entry in the system, regardless of which personality created it.

```
OrchestratorAI (omnipresent: true) recalls -> all entries from all personalities
```

Omnipresent mode uses the same unfiltered SQL query that the system used before scoping was introduced. There is no performance overhead relative to that previous behaviour.

### Legacy Data

Entries created before per-personality scoping was activated have a `NULL` personality ID. These are considered shared and are always included in recall results for every personality, omnipresent or not.

### Enabling Omnipresent Mind

1. Open the **Personality Editor** for the target personality.
2. Navigate to the **Brain** section.
3. Toggle **Omnipresent Mind** on.
4. Save.

> **Warning**: An omnipresent personality can read memories from every other agent on the system. Only enable this for trusted orchestrator agents.

### Heartbeat Stats

The Tasks > Heartbeats view displays per-personality memory stats. Each row in the `system_health` check execution log reflects counts scoped to that personality:

```
T.Ron   -- Memories: 45, Knowledge: 2, RSS: 198MB, Heap: 85/113MB
FRIDAY  -- Memories: 12, Knowledge: 1, RSS: 198MB, Heap: 85/113MB
```

RSS and Heap remain process-level figures -- all personalities share the same Node.js process. Only the memory/knowledge counts are personality-scoped. An omnipresent personality shows the full system aggregate.

### Vector Recall Scoping

`recall()` resolves a `personalityId` before entering the vector path and passes it through all three search layers:

1. **External vector store** (`VectorMemoryManager.searchMemories` / `searchKnowledge`) -- the `personalityId` is stored as metadata at index time and matched at query time.
2. **pgvector RRF** (`queryMemoriesByRRF` / `queryKnowledgeByRRF`) -- SQL filter `AND (personality_id = $N OR personality_id IS NULL)` added when a scoped personality ID is provided.
3. **Post-fetch safety filter** -- `getMemoryBatch` results are filtered in-process to handle index entries written before scoping was introduced (which lack `personalityId` metadata).

`undefined` as a personality ID means omnipresent -- the query is unfiltered, which is the correct behaviour for personalities with **Omnipresent Mind** enabled.

#### Per-Personality Self-Identity

`seedBaseKnowledge()` is called at every startup with all enabled personalities. It seeds a `self-identity` knowledge entry per personality, scoped to that personality's ID, with content `"I am {name}"`. Legacy global `self-identity` entries (created before scoping with `personality_id IS NULL`) are automatically deleted and replaced on startup.

Generic entries (`hierarchy`, `purpose`, `interaction`) remain global -- shared by all personalities.

### Dashboard -- Vector Memory Explorer

The Agents page shows a personality filter dropdown at the top of the Vector Memory Explorer tab:

- **All Personalities** -- shows all entries; each row has a personality badge (or "Global" for unowned entries).
- **Specific personality** -- filters memories, knowledge, and semantic search to that personality.

Vector Memory is the first/default tab in the Agents page (tab order: Vector Memory > Web > Multimodal > Swarm > A2A Network).

### Scoped Brain Endpoints

All brain query endpoints accept an optional `?personalityId=` query parameter:

| Endpoint | Purpose |
|----------|---------|
| `GET /api/v1/brain/memories?personalityId=<id>` | List memories for one personality |
| `GET /api/v1/brain/knowledge?personalityId=<id>` | List knowledge for one personality |
| `GET /api/v1/brain/stats?personalityId=<id>` | Stats scoped to one personality |
| `GET /api/v1/brain/search/similar?personalityId=<id>` | Semantic search scoped to one personality |

Omit `personalityId` to get unscoped (system-wide) results.

### Concurrency Safety

Chat requests from different personalities run concurrently. The implementation resolves the `effectivePersonalityId` early in each request handler and passes it directly to each brain call -- no shared mutable state is involved. Concurrent requests from different personalities are fully independent.

### Memory Scoping Scenarios

**Dedicated security agent (isolated)** -- A personality set to isolated mode (default) accumulates its own context over time without memories from other personalities appearing in its recall.

**Orchestrator that coordinates all agents** -- Create a supervisor personality and enable **Omnipresent Mind**. It can recall memories from all agents, giving it full situational awareness for coordination tasks.

**Checking what a specific personality knows** -- Use the API:

```bash
curl "$BASE_URL/api/v1/brain/stats?personalityId=<personality-uuid>"
curl "$BASE_URL/api/v1/brain/memories?personalityId=<personality-uuid>&limit=20"
```

### Memory Scoping Troubleshooting

**Stats look identical for all personalities** -- Check whether `personality_id` is being persisted on new memories. Older chat-created memories will have `NULL` personality IDs and appear in everyone's count.

**Personality sees zero memories** -- A newly created personality has no history. Legacy unowned memories are shared, but if none exist, recall returns empty. This is expected.

**Omnipresent personality still shows low counts** -- Verify the toggle is saved: check `GET /api/v1/soul/personalities/:id` and confirm `body.omnipresentMind === true`. If the field is missing or false, the personality is in isolated mode.

---

## Cognitive ML Memory Enhancements

> Phase 125-D -- Context-Dependent Retrieval, Working Memory, and Salience Classification

The Brain module uses AI/ML techniques from cognitive science to improve memory retrieval beyond simple keyword and vector similarity search. These features build on the ACT-R activation and Hebbian learning from Phase 124.

| Feature | Cognitive Model | ML Technique | Config Key |
|---------|----------------|-------------|------------|
| Context-Dependent Retrieval | Tulving's Encoding Specificity | Embedding fusion | `brain.contextRetrieval` |
| Working Memory Buffer | Baddeley's Working Memory | Trajectory prediction | `brain.workingMemory` |
| Salience Classification | Damasio's Somatic Markers | Anchor embedding similarity | `brain.salience` |

All features are **opt-in** (disabled by default) and require the vector memory system to be enabled.

### Context-Dependent Retrieval

Retrieval is most effective when the search context matches the context in which the memory was encoded. Instead of searching with just the query embedding, the system fuses it with a conversation context centroid:

```
searchVector = λ · queryEmbedding + (1-λ) · contextCentroid
```

The context centroid is the mean of the last N message embeddings in the conversation. This biases results toward memories that were created during similar conversational topics.

#### Configuration

```json
{
  "brain": {
    "contextRetrieval": {
      "enabled": true,
      "queryWeight": 0.7,
      "contextWindowSize": 5,
      "minContextMessages": 2
    }
  }
}
```

- **queryWeight** (0.0--1.0): Higher values favor the literal query; lower values favor context. Default 0.7.
- **contextWindowSize**: Number of recent messages to include in the context window. Default 5.
- **minContextMessages**: Minimum messages before context fusion activates. Below this threshold, raw query embedding is used. Default 2.

#### API

```typescript
// Feed conversation messages for context tracking
await brain.feedContext("user's message about database performance");
await brain.feedContext("assistant's response about indexing strategies");

// Subsequent recalls automatically use context-fused search
const memories = await brain.recall({ search: "slow queries" });
// Results are biased toward database/performance memories

// Clear context on conversation reset
brain.clearContext();
```

### Working Memory Buffer

A capacity-limited scratchpad (default 7 items, from Miller's 7+/-2 law) that tracks the most relevant items for the current conversation. Includes predictive pre-fetching based on embedding trajectory analysis.

#### How It Works

1. Each query embedding is added to a rolling trajectory window
2. A recency-weighted centroid predicts the next likely topic
3. The vector store is searched with the predicted embedding
4. Matching items are cached for instant access on the next query

#### Configuration

```json
{
  "brain": {
    "workingMemory": {
      "enabled": true,
      "capacity": 7,
      "prefetchLimit": 5,
      "prefetchThreshold": 0.3,
      "recencyDecay": 0.8,
      "minQueriesForPrediction": 2
    }
  }
}
```

- **capacity**: Maximum items in the buffer. Excess items are evicted by lowest score. Default 7.
- **prefetchLimit**: Number of items to pre-fetch per prediction cycle. Default 5.
- **prefetchThreshold** (0.0--1.0): Minimum similarity score for pre-fetched items. Default 0.3.
- **recencyDecay** (0.0--1.0): Exponential decay factor for trajectory weighting (newer = heavier). Default 0.8.
- **minQueriesForPrediction**: Minimum queries in the trajectory before prediction activates. Default 2.

#### API

```typescript
// Check what's in working memory
const items = brain.getWorkingMemoryItems();
// [{ id, content, score, source: 'retrieval' | 'prefetch' }]

// Get buffer stats
const stats = brain.getWorkingMemoryStats();
// { size: 5, prefetchSize: 3, trajectorySize: 4 }
```

### Salience Classification

Classifies memory content against anchor embeddings for 5 emotion/urgency dimensions. Memories with high salience scores are prioritized during retrieval. No extra model is needed -- the existing embedding provider computes cosine similarity against pre-defined anchor texts.

#### Dimensions

| Dimension | What it detects | Default Weight |
|-----------|----------------|---------------|
| Urgency | Time-sensitive, critical, blocking situations | 0.30 |
| Error | Bugs, crashes, failures, security breaches | 0.25 |
| Frustration | User confusion, disappointment, stuck states | 0.15 |
| Success | Breakthroughs, completions, positive outcomes | 0.15 |
| Curiosity | Exploratory questions, learning intent | 0.15 |

#### Configuration

```json
{
  "brain": {
    "salience": {
      "enabled": true,
      "urgencyWeight": 0.30,
      "errorWeight": 0.25,
      "frustrationWeight": 0.15,
      "successWeight": 0.15,
      "curiosityWeight": 0.15,
      "compositeBlendWeight": 0.1
    }
  }
}
```

#### API

```typescript
// Classify text salience on demand
const scores = await brain.classifySalience("the server is down and customers are affected");
// { urgency: 0.85, error: 0.72, frustration: 0.61, success: 0.1, curiosity: 0.05, composite: 0.68 }

// Retrieve cached salience for a stored memory
const cached = await brain.getMemorySalience(memoryId);
```

### Future Features (Scaffolded)

> **Note:** These features are scaffolded for future development and are **not yet active**. Types and interfaces are defined but no runtime behavior exists.

- **LLM Reconsolidation** -- When a recalled memory overlaps with new context (cosine 0.7--0.95), the LLM decides whether to keep, update, or split the memory. Mirrors biological memory reconsolidation where recalled memories become labile.
- **Semantic Schema Clustering** -- Periodic k-means clustering over memory embeddings discovers emergent topic groups. LLM-generated cluster labels become first-class knowledge entries. The k-means algorithm is implemented; the full pipeline is pending.
- **RL Retrieval Optimization** -- Thompson Sampling (Beta-Bernoulli bandit) learns optimal retrieval scoring weights from user feedback. Automatically tunes the balance between content match, ACT-R activation, Hebbian boost, and salience for each personality.

### Cognitive ML Architecture

```
Query
  |
  +-- Context Retriever ---- fuse query + context embeddings
  |                             |
  |                             v
  +-- Vector Search <---- context-fused vector
  |       |
  |       v
  +-- Working Memory ---- add results, run pre-fetch
  |       |
  |       v
  +-- Cognitive Ranking -- ACT-R activation + Hebbian boost
  |       |
  |       v
  +-- Results (salience metadata attached)
```

All three features compose with the existing ACT-R activation and Hebbian learning from Phase 124. They run at different points in the retrieval pipeline and can be enabled independently.

---

## Conversation Branching & Replay

SecureYeoman supports git-like branching for conversations, enabling fork-from-message, replay-with-different-model, tree visualization, and batch A/B testing.

### Branching

#### Fork from a Message

Click the branch icon (GitBranch) on any message bubble to create a new conversation that starts with all messages up to and including that point. The new conversation is linked to the original as a child branch.

```bash
curl -X POST /api/v1/conversations/:id/branch \
  -d '{"messageIndex": 3, "title": "Experiment A", "branchLabel": "test-v2"}'
```

#### View Branch Tree

Click the branch tree button in the chat header to see a ReactFlow visualization of all branches rooted at the current conversation. Each node shows:
- Conversation title
- Message count
- Quality score (if scored)
- Branch label

Click any node to navigate to that conversation.

#### List Child Branches

```bash
GET /api/v1/conversations/:id/branches
# -> { branches: Conversation[] }
```

### Replay

#### Single Replay

Replay a conversation with a different model. All user messages are re-sent to the new model, generating fresh assistant responses.

```bash
curl -X POST /api/v1/conversations/:id/replay \
  -d '{"model": "gpt-4", "provider": "openai"}'
# -> { replayConversationId, replayJobId }
```

The replay runs asynchronously. Check progress:
```bash
GET /api/v1/replay-jobs/:id
```

#### Batch Replay

Compare multiple conversations against a new model:

```bash
curl -X POST /api/v1/conversations/replay-batch \
  -d '{
    "sourceConversationIds": ["conv-1", "conv-2", "conv-3"],
    "replayModel": "claude-3-opus",
    "replayProvider": "anthropic"
  }'
```

#### Replay Report

After a batch completes, get the pairwise comparison report:

```bash
GET /api/v1/replay-jobs/:id/report
# -> {
#   job: ReplayJob,
#   results: ReplayResult[],
#   summary: { sourceWins, replayWins, ties, avgSourceQuality, avgReplayQuality }
# }
```

### Branching Dashboard

**Diff View** -- The replay diff view shows source and replay conversations side-by-side: user messages span both columns, assistant responses appear in parallel for easy comparison, and quality scores with pairwise winner are displayed in the header.

**Batch Panel** -- Allows multi-selecting conversations, configuring model/provider for batch replay, monitoring job progress with live polling, and viewing detailed win/loss/tie reports.

### Quality Scoring

If the Conversation Quality Scorer is active, replayed conversations are automatically scored. The system compares quality scores to determine a pairwise winner:
- Scores within 0.05 = **tie**
- Higher score wins

### Branching Auth Permissions

| Endpoint | Permission |
|----------|-----------|
| Branch, Replay | `chat:write` / `chat:execute` |
| List, Tree, Report | `chat:read` |

---

## See Also

- [ADR 005 -- Brain, Memory & Knowledge](../adr/005-brain-memory-knowledge.md)
- [ADR 019 -- RAG Eval & Cognitive ML](../adr/019-rag-eval-cognitive-ml.md)
- [Getting Started](./getting-started.md)
