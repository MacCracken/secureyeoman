# ADR 033: Progressive History Compression

## Status

Proposed

## Context

The ConversationManager tracks message history per platform/channel, but long conversations either exhaust context windows or are hard-truncated, losing critical earlier context. Multi-session conversations have no continuity — restarting FRIDAY loses all conversational state.

Agent Zero's 3-tier compression system (Message → Topic → Bulk) with percentage-based token allocation demonstrates an effective approach to graceful context degradation over long conversations.

## Decision

### Three-Tier Compression Architecture

```
┌─────────────────────────────────────────────────┐
│                Context Window Budget              │
│                                                   │
│  ┌─────────────────────────────────────────────┐ │
│  │ Current Topic (50%)                          │ │
│  │ Full messages from active conversation topic │ │
│  ├─────────────────────────────────────────────┤ │
│  │ Historical Topics (30%)                      │ │
│  │ Summarized previous topics                   │ │
│  ├─────────────────────────────────────────────┤ │
│  │ Bulk Archives (20%)                          │ │
│  │ Highly compressed older sessions             │ │
│  └─────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────┘
```

**Tier 1 — Messages**: Raw message objects within the current topic. No compression applied. When the current topic exceeds its allocation, individual large messages are truncated to a character limit.

**Tier 2 — Topics**: When a topic boundary is detected (subject change, explicit user topic switch, or token threshold), the current topic is sealed and summarized by the utility LLM into a Topic summary. Historical topics are ordered by recency.

**Tier 3 — Bulk Archives**: When historical topics exceed their allocation, groups of 3 oldest topics are merged into a Bulk archive via LLM summarization. When bulk archives exceed their allocation, the oldest bulk is dropped.

### Compression Escalation

Applied in order when a tier exceeds its token budget:

1. **Large message truncation** — messages over 2000 characters truncated with `[truncated]` marker
2. **Topic summarization** — sealed topics compressed to ~200 token summaries via utility LLM
3. **Bulk merging** — 3 oldest topics merged into single bulk summary (~300 tokens)
4. **Oldest bulk removal** — last resort, drops oldest bulk archive

### Persistent Storage

Compressed history persists in SQLite, surviving restarts:

```sql
CREATE TABLE conversation_history (
  id TEXT PRIMARY KEY,
  conversation_id TEXT NOT NULL,
  platform TEXT NOT NULL,
  tier TEXT NOT NULL CHECK(tier IN ('message', 'topic', 'bulk')),
  content TEXT NOT NULL,          -- JSON: original messages or summary text
  token_count INTEGER NOT NULL,
  sequence INTEGER NOT NULL,      -- ordering within tier
  created_at TEXT NOT NULL,
  sealed_at TEXT,                 -- when topic/bulk was sealed
  FOREIGN KEY (conversation_id) REFERENCES conversations(id)
);

CREATE INDEX idx_history_conv_tier ON conversation_history(conversation_id, tier, sequence);
```

### Token Counting

Reuses the existing AI cost calculator's token counting for the active provider's tokenizer. Approximate counts cached per message to avoid repeated tokenization.

### Topic Boundary Detection

- **Explicit**: User says "new topic", "let's move on", or similar trigger phrases
- **Temporal**: Gap of >30 minutes between messages in the same conversation
- **Token threshold**: Current topic exceeds 60% of its allocation — force seal and summarize
- **Manual**: Dashboard UI button to seal current topic

### HistoryCompressor Interface

```typescript
interface HistoryCompressor {
  addMessage(conversationId: string, message: ConversationMessage): Promise<void>;
  getContext(conversationId: string, maxTokens: number): Promise<CompressedContext>;
  sealCurrentTopic(conversationId: string): Promise<void>;
  getHistory(conversationId: string): Promise<HistoryTier[]>;
}

interface CompressedContext {
  currentTopic: ConversationMessage[];
  historicalTopics: TopicSummary[];
  bulkArchives: BulkSummary[];
  totalTokens: number;
  compressionRatio: number;
}
```

### Configuration

```yaml
conversation:
  history:
    compression:
      enabled: true
      tiers:
        currentTopic: 0.50       # 50% of context budget
        historicalTopics: 0.30   # 30%
        bulkArchives: 0.20      # 20%
      maxMessageChars: 2000      # truncation threshold
      topicSummaryTokens: 200   # target size for topic summaries
      bulkSummaryTokens: 300    # target size for bulk summaries
      bulkMergeSize: 3          # topics per bulk merge
      topicBoundary:
        silenceMinutes: 30      # time gap for auto-topic-boundary
        tokenThreshold: 0.60    # force seal at this % of allocation
    model: null                  # null = use default utility model
```

## Consequences

### Positive
- Long conversations maintain coherent context instead of hard-truncating
- Multi-session continuity — conversations resume with compressed history intact
- Token-aware budgeting prevents context overflow regardless of conversation length
- Progressive degradation preserves recent context at full fidelity

### Negative
- Topic summarization consumes utility LLM tokens
- Lossy compression — specific details from old topics may be lost
- Topic boundary detection heuristics may misfire (mitigated by manual seal option)
- SQLite storage grows with conversation count (mitigated by existing data retention policies)
