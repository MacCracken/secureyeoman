# ADR 098 — Self-Repairing Task Loop

**Status:** Accepted
**Date:** 2026-02-21
**Phase:** 35 — Fix All the Bugs + Security Hardening

---

## Context

The current `RetryManager` retries after transient API failures (rate limits, 502/503, network timeouts). It does not help when an agent task **gets stuck without an error**:

- **Timeout without failure** — the LLM keeps calling a slow tool, making no progress; the task eventually times out. No retry can help.
- **Tool-call repetition** — the LLM calls the same tool with the same arguments twice in a row, indicating it is stuck in a reasoning loop. A blind re-try of the same context produces the same loop.

Neither condition triggers `RetryManager` because neither produces an exception. The result is a hanging task that eventually times out with no diagnostic information.

---

## Decision

Implement a **stuck-task detection layer** as a stateful per-session `TaskLoop` class.

### TaskLoop: `packages/core/src/ai/task-loop.ts`

```typescript
const loop = new TaskLoop({ timeoutMs: 30_000, repetitionThreshold: 2 });

// After each tool invocation:
loop.recordToolCall('web_search', { query: '…' }, 'ok');

// Before the next LLM call:
const stuck = loop.checkStuck();
if (stuck) {
  const recovery = loop.buildRecoveryPrompt(stuck);
  messages.push({ role: 'user', content: recovery });
}
```

#### Stuck detection conditions

| Condition | Trigger |
|-----------|---------|
| **Timeout** | `Date.now() - startedAt >= timeoutMs` (default: 30 s) |
| **Repetition** | Same `toolName` + `toolArgs` appears `repetitionThreshold` consecutive times in history (default: 2) |

Both conditions are checked by `checkStuck()` which returns a `StuckReason | null`.

#### Recovery prompt

`buildRecoveryPrompt(reason)` constructs a diagnostic message that is injected as a `user` turn (or appended to the system prompt) before the next LLM call:

**Timeout example:**
> *"Your previous attempt stalled after 31 204ms. Last tool: web_fetch → error: 503. Try a different approach or decompose the problem into smaller steps."*

**Repetition example:**
> *"Your previous attempt is looping: Tool "sql_query" was called 2 consecutive times with identical arguments. Last outcome: error: no rows. Try a different approach, use a different tool, or decompose the problem."*

The model receives elapsed time, the last tool name, and its outcome — giving it enough diagnostic context to choose a different strategy rather than repeating the failed reasoning.

### Integration surface

`TaskLoop` is a thin, stateless-per-instance helper with no external dependencies. It is designed to be instantiated by:

- **Agent task handlers** in `TaskExecutor` (one `TaskLoop` per task execution).
- **Sub-agent delegation loops** in future A2A integration.
- Any caller that runs a multi-turn tool-calling loop.

The class is exported from `packages/core/src/ai/index.ts` alongside `RetryManager`.

---

## Consequences

**Positive:**
- Provides diagnostic context to the model when it is stuck, enabling self-correction rather than blind retry.
- Zero external dependencies — pure TypeScript.
- `reset()` allows instance reuse across task retries without re-allocation.

**Neutral:**
- `TaskLoop` is a building block, not a full agent loop implementation. Callers are responsible for integrating it into their tool-calling loop.
- Default `timeoutMs: 30_000` may be too short for legitimate long-running tools (e.g. code compilation). Callers should tune this to their task's expected tool latency.

**Negative / trade-offs:**
- Repetition detection uses exact argument matching (`JSON.stringify`). Minor argument variations (key ordering differences) defeat detection. This is a deliberate simplicity trade-off — normalising argument order would add complexity for a rare edge case.
- The recovery prompt is heuristic. The model may still fail to recover from a deeply stuck state. In the worst case, the task continues until the outer `TaskExecutor` timeout fires.

---

## Related

- `packages/core/src/ai/task-loop.ts`
- `packages/core/src/ai/retry-manager.ts`
- `packages/core/src/task/executor.ts`
