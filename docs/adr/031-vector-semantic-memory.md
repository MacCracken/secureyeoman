# ADR 031: Vector Semantic Memory

## Status

Implemented

## Context

The Brain system currently stores memories, knowledge, and skills with retrieval based on type, category, recency, and importance scoring. This works for structured lookups but fails when the agent needs to find conceptually related information that doesn't share exact keywords — e.g., recalling a conversation about "deployment strategies" when the current query mentions "release pipelines."

Agent Zero's FAISS-backed vector memory demonstrates that semantic similarity search dramatically improves recall relevance for AI agents, with configurable thresholds and metadata filtering.

## Decision

### Embedding Provider Abstraction

A pluggable `EmbeddingProvider` interface allowing users to run one or both:

```typescript
interface EmbeddingProvider {
  readonly name: string;
  embed(texts: string[]): Promise<number[][]>;
  dimensions(): number;
}
```

**Implementations**:
- **LocalEmbeddingProvider**: SentenceTransformers via a Python sidecar process (default). No external API needed — private and free. Uses `all-MiniLM-L6-v2` (384 dimensions) as default model
- **ApiEmbeddingProvider**: OpenAI (`text-embedding-3-small`), Gemini (`text-embedding-004`), or any OpenAI-compatible endpoint. Configured per-provider like existing AI client

Users select one or both providers in config. When both are configured, local is used for indexing (cost-free batch operations) and API for queries (higher quality single-shot retrieval), or users can pin a single provider for both.

### Vector Storage Backends

Two backends, selected via config:

**FAISS (default)**:
- In-process via `faiss-node` npm binding
- Flat L2 index for small datasets (<100k vectors), IVF index for larger
- Disk persistence to `~/.secureyeoman/data/vectors/`
- Best for single-node deployments

**Qdrant**:
- Client/server via `@qdrant/js-client-rest`
- Collection per memory area (memories, knowledge, skills)
- Supports distributed deployments alongside existing Postgres/Redis options
- Payload filtering maps to existing Brain metadata queries

**ChromaDB**: Reserved as future option (noted in roadmap).

```typescript
interface VectorStore {
  insert(id: string, embedding: number[], metadata: Record<string, unknown>): Promise<void>;
  search(query: number[], limit: number, threshold: number, filter?: MetadataFilter): Promise<VectorResult[]>;
  delete(ids: string[]): Promise<void>;
  count(): Promise<number>;
}
```

### BrainStorage Integration

The existing `BrainStorage` interface gains vector methods without breaking current implementations:

- `saveMemory()` now also generates and stores an embedding
- `queryMemories()` gains an optional `semanticQuery` parameter — when provided, vector search is used instead of keyword/category filtering
- `queryKnowledge()` same treatment
- Existing non-vector queries continue to work unchanged (backwards compatible)
- A migration command indexes existing memories/knowledge on first run

### Retrieval Configuration

```yaml
brain:
  vector:
    enabled: true
    provider: local          # local | api | both
    backend: faiss           # faiss | qdrant
    similarityThreshold: 0.7 # cosine similarity minimum (0-1)
    maxResults: 10
    local:
      model: all-MiniLM-L6-v2
    api:
      provider: openai       # follows ai provider config
      model: text-embedding-3-small
    qdrant:
      url: http://localhost:6333
      collection: secureyeoman-brain
    faiss:
      indexType: flat         # flat | ivf
      persistDir: ~/.secureyeoman/data/vectors
```

## Consequences

### Positive
- Semantic recall finds conceptually related memories regardless of keyword overlap
- Local-first default requires no external API calls — aligns with privacy principles
- FAISS/Qdrant choice maps to existing single-node vs distributed deployment patterns
- Backwards compatible — existing Brain queries still work

### Negative
- FAISS native bindings add a compiled dependency (platform-specific builds)
- Local embedding model requires ~100MB download on first run
- Vector indexing adds latency to memory saves (~50ms local, ~200ms API)
- Two storage systems (SQLite + vector) must stay synchronized

### Risks
- Embedding model quality affects retrieval precision — needs tuning per use case
- FAISS index corruption requires rebuild from SQLite source of truth
