# Agent Replay & Debugging Guide

Record full execution traces from agent conversations and replay them for debugging, regression testing, and model comparison. Complements the [Agent Eval Harness](agent-eval-harness.md).

## Quick Start

### 1. Enable the Feature

```yaml
agentReplay:
  enabled: true
  maxStepsPerTrace: 200
  maxToolResultLength: 10000
  retentionDays: 30
  maxConcurrentReplays: 2
```

### 2. View Traces

List recorded traces:

```
GET /api/v1/agent-replay/traces
GET /api/v1/agent-replay/traces?personalityId=<id>
GET /api/v1/agent-replay/traces?conversationId=<id>
GET /api/v1/agent-replay/traces?tags=regression,debug
```

Get a single trace with full step detail:

```
GET /api/v1/agent-replay/traces/:traceId
```

Get a summary (step counts, tool names, blocked tools):

```
GET /api/v1/agent-replay/traces/:traceId/summary
```

### 3. Replay a Trace

Mock replay (uses recorded tool results, instant):

```
POST /api/v1/agent-replay/traces/:traceId/replay
{
  "model": "claude-sonnet-4-6",
  "tags": ["regression-test"],
  "label": "Testing with Sonnet"
}
```

### 4. Compare Two Traces

```
GET /api/v1/agent-replay/diff?traceA=<id>&traceB=<id>
```

Returns tool call differences, output match, timing/cost deltas, and step-by-step alignment.

### 5. View Replay Chain

See how a trace evolved through multiple replays:

```
GET /api/v1/agent-replay/traces/:traceId/chain
```

## Trace Step Types

Each trace contains an ordered list of steps:

| Type | Fields | Description |
|------|--------|-------------|
| `llm_call` | model, tokens, cost, stopReason | Each LLM API call |
| `tool_call` | toolName, args, result, blocked | Each tool invocation |
| `guard_check` | guardName, passed, findings | Security guard evaluation |
| `brain_retrieval` | memoriesUsed, knowledgeUsed, mode | RAG/memory retrieval |
| `error` | message, source, recovered | Errors during execution |

## Replay Modes

- **Mock replay**: Replays the trace using recorded tool results. No LLM calls. Instant and deterministic. Use for inspecting traces with different display/analysis.

- **Live replay** (programmatic): Re-executes the same input with real LLM and tool calls. Supports model/personality/provider overrides. Use for regression testing — same input, different model, compare outputs.

## Configuration Reference

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `enabled` | boolean | `false` | Enable trace recording |
| `maxStepsPerTrace` | number | `200` | Max steps before truncation |
| `maxToolResultLength` | number | `10000` | Truncate tool results beyond this |
| `retentionDays` | number | `30` | Auto-delete traces older than this |
| `maxConcurrentReplays` | number | `2` | Limit simultaneous replays |

## Related

- [Agent Eval Harness](agent-eval-harness.md) — structured scenario testing
- [ADR 022](../adr/022-agent-replay-debugging.md) — architecture decision record
