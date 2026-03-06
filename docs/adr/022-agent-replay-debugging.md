# ADR 022 — Agent Replay & Debugging

**Status**: Accepted
**Date**: 2026-03-05

## Context

When debugging agent behavior — unexpected tool calls, wrong outputs, guard blocks — operators need to inspect the full execution trace: every LLM call, tool invocation, guard check, and brain retrieval. The eval harness (Phase 135) validates agent behavior against assertions, but doesn't capture or replay traces from live conversations. OpenTelemetry (Phase 139) exports spans but doesn't provide agent-level replay semantics.

## Decision

Add an execution trace recording and replay system that captures structured step-by-step traces from agent conversations and supports mock or live replay with overrides.

### Key design choices

1. **Structured trace steps**: Discriminated union of 5 step types (llm_call, tool_call, guard_check, brain_retrieval, error) rather than flat log entries. Each step has typed fields relevant to its kind.

2. **TraceRecorder injection**: The recorder is injected into the chat handler and collects steps as they happen. It does not intercept or modify execution — it's a passive observer.

3. **Two replay modes**: Mock replay (instant, deterministic, uses recorded tool results) for debugging/comparison. Live replay (re-executes with real LLM/tools) for regression testing with different models.

4. **Replay chains**: Each replay trace links to its source via `sourceTraceId`. The chain can be walked to see how behavior evolves across model/config changes.

5. **Trace diffing**: Compares two traces step-by-step — tool call differences, output match, timing/cost deltas. Useful for A/B model comparison and regression detection.

6. **Opt-in**: `ops.agentReplay.enabled` defaults to false. No overhead when disabled.

7. **Separate schema**: `agent_replay.traces` table with JSONB steps column. Indexes on conversation, personality, and replay chain.

## Consequences

- Operators can inspect exactly what happened during any agent conversation
- Mock replay enables fast "what-if" debugging without LLM costs
- Live replay enables regression testing: same input, different model → compare
- Trace diff complements eval harness for before/after comparison
- Retention-based cleanup prevents unbounded storage growth
- Future: chat-routes integration to auto-record traces when enabled

## Files

| File | Purpose |
|------|---------|
| `shared/types/agent-replay.ts` | Types: TraceStep union, ExecutionTrace, ReplayOptions, TraceDiff |
| `core/agent-replay/trace-recorder.ts` | Step collection during execution |
| `core/agent-replay/trace-store.ts` | PostgreSQL persistence |
| `core/agent-replay/replay-engine.ts` | Mock and live replay execution |
| `core/agent-replay/trace-differ.ts` | Trace comparison |
| `core/agent-replay/replay-routes.ts` | 8 REST endpoints |
| `core/storage/migrations/002_agent_replay.sql` | Database schema |
