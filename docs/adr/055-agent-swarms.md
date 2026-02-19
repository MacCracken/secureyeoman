# ADR 055: Agent Swarms

**Status**: Accepted
**Phase**: 17
**Date**: 2026-02-18

---

## Context

Phase 17 adds coordinated multi-agent execution ("swarms") on top of the existing sub-agent delegation system (ADR 034, Phase 6.3). Individual `delegate_task` calls allow one-shot specialist delegation, but complex tasks benefit from a coordinated pipeline of specialists working in sequence or in parallel.

The goal is a first-class orchestration layer that:
- Defines reusable **SwarmTemplates** (role pipelines + strategy)
- Executes **SwarmRuns** via the existing `SubAgentManager.delegate()` primitive
- Exposes progress and results through REST routes and the dashboard

---

## Decision

### Orchestration Strategies

| Strategy | Behaviour |
|----------|-----------|
| `sequential` | Roles execute one at a time; each member receives the previous member's result as context |
| `parallel` | All roles execute simultaneously via `Promise.all`; optional coordinator profile synthesizes results |
| `dynamic` | A coordinator profile is delegated to; it uses the existing `delegate_task` tool to spawn agents as needed |

### No New AI Dependencies

Swarms do **not** introduce a new AI client or model provider. All delegations flow through the existing `SubAgentManager`, which manages its own `AIClient`, token budgets, depth limits, and timeout enforcement.

### Built-in Templates

Four templates are seeded on startup:

| ID | Strategy | Roles |
|----|----------|-------|
| `research-and-code` | sequential | researcher → coder → reviewer |
| `analyze-and-summarize` | sequential | researcher → analyst → summarizer |
| `parallel-research` | parallel | researcher × 2 → analyst (coordinator synthesizes) |
| `code-review` | sequential | coder → reviewer |

### MCP Tool

`create_swarm` is added to `DELEGATION_TOOLS` so that sub-agents can spawn swarms during a delegation.

### Hook Points

`swarm:before-execute` and `swarm:after-execute` are added to the `HookPoint` union (extensions/types.ts), enabling extension authors to observe or veto swarm execution.

---

## Consequences

**Positive**
- Reusable, named orchestration patterns eliminate ad-hoc multi-delegation code
- Sequential strategy naturally handles context chaining (researcher hands off to coder)
- Parallel strategy provides horizontal scaling for independent research subtasks
- Dynamic strategy preserves full flexibility for coordinator-driven exploration

**Negative / Risks**
- Sequential runs are synchronous and block the HTTP request for their full duration; very long pipelines should be run asynchronously in future iterations
- `parallel` delegations all count against `maxConcurrent` simultaneously; templates with many roles may hit the concurrency limit
- Dynamic strategy effectiveness depends on the coordinator profile's system prompt quality

See ADR 057 for the `allowSwarms` security policy toggle and per-personality swarms enablement added in the same phase.

---

## Alternatives Considered

1. **Build a separate agent runtime** — rejected; adds a new AI dependency and duplicates lifetime/token management already in `SubAgentManager`
2. **Event-driven/async runs** — deferred; would require a separate worker/queue; out of scope for Phase 17
3. **LangGraph-style state machines** — rejected; too complex for the current use cases; can revisit in a later phase
