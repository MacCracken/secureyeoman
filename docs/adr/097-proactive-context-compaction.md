# ADR 097 — Proactive Context Compaction

**Status:** Accepted
**Date:** 2026-02-21
**Phase:** 35 — Fix All the Bugs + Security Hardening

---

## Context

The previous failure mode for long conversations is **reactive**: the LLM call fails with a `context length exceeded` error, which surfaces as a cryptic 502 to the user. The `RetryManager` cannot help here because the error is not a transient network failure — the same overflowing context would fail again.

This wastes a full API round-trip (incurring latency and cost), produces an unhelpful error message, and forces the user to manually clear the conversation.

---

## Decision

Implement **proactive context compaction** in `chat-routes.ts`. Before sending the message array to the LLM, estimate the token count and trigger compaction when usage exceeds 80% of the model's context-window size.

### ContextCompactor: `packages/core/src/ai/context-compactor.ts`

```typescript
const compactor = new ContextCompactor({
  thresholdFraction: 0.80,   // trigger at 80% of context window
  preserveRecentTurns: 4,    // keep last 2 user+assistant pairs verbatim
});

if (compactor.needsCompaction(messages, model)) {
  const result = await compactor.compact(messages, model, summariser);
  if (result.compacted) messages = result.messages;
}
```

#### Token estimation

Uses the `~4 chars/token` heuristic (consistent with `model-router.ts`). Fast, zero-dependency — no tokeniser library required. Accurate enough for threshold decisions; the 80% trigger gives a 20% safety margin for estimation error.

#### Model context-window registry

A static lookup table maps known model names to their context-window sizes. Unknown models fall back to a conservative 8 192-token default.

| Model | Context window |
|-------|---------------|
| `claude-*` | 200 000 |
| `gpt-4o` | 128 000 |
| `gpt-4-turbo` | 128 000 |
| `gemini-2.0-flash` | 1 000 000 |
| `grok-3*` | 131 072 |
| `deepseek-*` | 64 000 |
| _(unknown)_ | 8 192 |

#### Compaction strategy

1. Separate system messages (preserved verbatim at the front).
2. Identify the oldest conversational turns (`toSummarise`).
3. Preserve the last `preserveRecentTurns` turns verbatim.
4. Call the `summariser` callback with a transcript of the turns to summarise.
5. Inject the summary as a `[Context summary: …]` system message between the original system prompt and the preserved recent turns.

The `summariser` is a caller-provided async callback that calls the LLM (or any other summarisation backend). In `chat-routes.ts`, it uses the same `aiClient` with `{ source: 'context_compaction' }` metadata so that compaction calls are distinguishable in usage logs.

#### Graceful failure

Compaction is best-effort. If the summariser throws (e.g. the AI client is unavailable), the chat route logs a warning and continues with the original uncompacted context. The LLM call may still succeed if the estimate was too conservative.

### Integration in `chat-routes.ts`

```typescript
const currentModel = personality?.defaultModel ?? 'unknown';
if (compactor.needsCompaction(messages, currentModel)) {
  const result = await compactor.compact(messages, currentModel, async (prompt) => {
    const resp = await aiClient.chat({ messages: [{ role: 'user', content: prompt }] }, { source: 'context_compaction' });
    return resp.content;
  });
  if (result.compacted) messages = [...result.messages];
}
```

---

## Consequences

**Positive:**
- Prevents cryptic `context length exceeded` failures before they happen.
- Saves one API round-trip per overflow event.
- Long-running conversations remain usable without manual intervention.
- The user-facing chat response is always returned (compaction is invisible unless the conversation was already very long).

**Neutral:**
- Compaction itself requires an extra LLM call (summarisation). This is cheaper than the primary call because it uses the full fast-tier model and sends only the transcript to summarise.
- `preserveRecentTurns: 4` means the last 2 exchanges are never summarised — sufficient for most conversational contexts.

**Negative / trade-offs:**
- The summary is lossy. Specific details from the summarised portion may not be recoverable from the summary. This is acceptable: if a user needs precise history they can scroll the UI rather than relying on the LLM's in-context recall.
- The 80% threshold means compaction fires slightly before strictly necessary. This is intentional — firing at 95% would reduce the token budget available for the summary call.

---

## Related

- `packages/core/src/ai/context-compactor.ts`
- `packages/core/src/ai/chat-routes.ts`
- [ADR 033 — Progressive History Compression](033-progressive-history-compression.md)
