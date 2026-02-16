# ADR 032: LLM-Powered Memory Consolidation

## Status

Proposed

## Context

As the Brain accumulates memories over time, redundant and overlapping entries degrade retrieval quality. The current decay/pruning system removes old or low-importance memories but cannot detect semantic duplicates — two memories saying the same thing in different words both persist indefinitely.

Agent Zero's memory consolidation system demonstrates that LLM-driven deduplication with safety thresholds keeps a knowledge base clean and coherent as it grows.

## Decision

### Hybrid Trigger Model

Consolidation runs at two levels:

**On-Save Quick Check** (inline, every memory save):
1. Before inserting a new memory, perform a fast vector similarity search (from ADR 031) against existing memories
2. If any result exceeds 0.95 cosine similarity, auto-deduplicate (REPLACE with merged metadata) without LLM call
3. If results between 0.85–0.95 exist, flag for scheduled consolidation
4. Below 0.85 — insert directly, no consolidation needed

**Scheduled Deep Consolidation** (background job):
1. Runs on a user-configurable schedule (default: daily at 02:00 local time)
2. Scans flagged memories plus performs broader similarity sweeps across all memory areas
3. Groups candidate pairs/clusters and sends them to the utility LLM for analysis
4. LLM decides from 5 actions: MERGE, REPLACE, KEEP_SEPARATE, UPDATE, SKIP

### ConsolidationManager

```typescript
interface ConsolidationManager {
  onMemorySave(memory: Memory): Promise<Memory>;       // quick check
  runDeepConsolidation(): Promise<ConsolidationReport>; // scheduled
  getSchedule(): CronExpression;
  setSchedule(cron: CronExpression): void;
}

interface ConsolidationAction {
  action: 'MERGE' | 'REPLACE' | 'KEEP_SEPARATE' | 'UPDATE' | 'SKIP';
  sourceIds: string[];
  resultMemory?: Partial<Memory>;  // for MERGE/UPDATE
  reasoning: string;
}
```

### Safety Mechanisms

- **Similarity threshold for REPLACE**: 0.9 minimum — below this, MERGE is the most destructive allowed action
- **Race condition protection**: Optimistic locking on memory IDs during consolidation batch — if a memory is modified mid-consolidation, skip it
- **Timeout**: 60 seconds per consolidation batch (group of ~10 candidates)
- **Fallback**: On any LLM call failure or timeout, insert memory directly without consolidation
- **Dry-run mode**: Configurable flag to log proposed actions without executing them
- **Audit trail**: Every consolidation action (including KEEP_SEPARATE and SKIP) logged to the audit chain

### LLM Prompt

The consolidation prompt provides the utility LLM with:
- The candidate memories (content + metadata + timestamps)
- Instructions for each action type and when to apply it
- Output schema (JSON with action, reasoning, and optional merged content)
- Explicit instruction to prefer KEEP_SEPARATE when uncertain

### Configuration

```yaml
brain:
  consolidation:
    enabled: true
    schedule: "0 2 * * *"           # cron expression, configurable via settings UI
    quickCheck:
      autoDedup_threshold: 0.95      # auto-replace without LLM
      flagThreshold: 0.85           # flag for deep consolidation
    deepConsolidation:
      replaceThreshold: 0.9         # minimum similarity for REPLACE action
      batchSize: 10                 # candidates per LLM call
      timeoutMs: 60000
      dryRun: false
    model: null                     # null = use default utility model
```

### Dashboard Integration

- Settings UI: schedule picker (cron builder or preset intervals)
- Metrics panel: consolidation runs, actions taken (by type), memory count over time
- Manual trigger button for on-demand deep consolidation

## Consequences

### Positive
- Prevents memory bloat from semantic duplicates
- Quick check adds minimal latency to normal memory saves (~5ms for vector search)
- LLM-driven decisions handle nuance that rule-based dedup cannot
- Full audit trail enables investigation and rollback

### Negative
- Deep consolidation consumes utility LLM tokens on each run
- Quick check depends on vector memory (ADR 031) being enabled
- Race conditions during consolidation require careful locking

### Dependencies
- **ADR 031 (Vector Semantic Memory)**: Required for similarity search in both quick check and deep consolidation
