# ADR 163 — Phase 83: CrewAI-Inspired Workflow & Team Enhancements

**Date**: 2026-02-28
**Status**: Accepted

---

## Context

Following analysis of the CrewAI framework, four high-value improvements were identified for SecureYeoman's multi-agent system. These add expressive OR-trigger semantics to workflows, a dynamic auto-manager Team primitive, strict schema enforcement mode, and a YAML-based crew CLI.

The design goals:
1. Do not break existing behavior (all changes are additive / opt-in).
2. Align with SecureYeoman's governance philosophy: audit everything, enforce policy at every layer.
3. Keep the implementation close to existing patterns (Swarm for inspiration, not for coupling).

---

## Decisions

### Feature 1 — Workflow `triggerMode: 'any' | 'all'`

**Decision**: Add `triggerMode` to `WorkflowStepSchema` with default `'all'` (preserving backward compatibility).

`triggerMode: 'any'` lowers the initial `inDegree` of the step to `min(1, deps.length)` in the topological sort, placing it in the tier immediately after its earliest dependency rather than waiting for all. A runtime guard in `executeStep` skips the step if _all_ of its declared deps failed or were skipped, preventing vacuous execution.

**Alternatives rejected**:
- A separate `OR` edge type on `WorkflowEdge` — introduces a second source of truth and complicates the topo-sort.
- A `dependsOnAny` array field — redundant with `dependsOn`; two lists with different semantics is confusing.

### Feature 2 — Team Primitive (Auto-Manager)

**Decision**: Introduce a `Team` entity (stored in `agents.teams`) where a coordinator LLM reads member descriptions and dynamically assigns each task. Implemented as `TeamStorage` + `TeamManager` + `team-routes.ts`.

Differs from Swarms:
- Swarm: pre-wired delegation graph, deterministic topology.
- Team: ad-hoc coordinator decision per run; no topology defined upfront.

The coordinator prompt asks the LLM to respond with `{"assignTo": [...], "reasoning": "..."}`. Invalid JSON falls back to the first team member. Multiple assigned members are dispatched in parallel; results are synthesized by a second LLM call.

**Alternatives rejected**:
- Extending the Swarm `strategy` enum with `'auto'` — conflates two different concepts; Swarms are deterministic, Teams are not.
- Storing the coordinator decision in a policy file — too rigid; the whole point is dynamic assignment.

### Feature 3 — Strict Output Schema Enforcement

**Decision**: Add `outputSchemaMode: 'audit' | 'strict'` to `step.config` (a `Record<string, unknown>` field that already exists). `'strict'` throws inside `executeStep`, which propagates through `onError` normally — so `onError: 'continue'` still works as expected.

**Alternatives rejected**:
- A top-level `WorkflowDefinition.strictSchemas` flag — too coarse; some steps in a workflow may need strict enforcement while others do not.

### Feature 4 — `secureyeoman crew` CLI

**Decision**: New `crew` command (alias `team`) with six subcommands: `list`, `show`, `import`, `export`, `run`, `runs`. YAML import uses the `yaml` package (already a dependency). `run` polls the run status endpoint with a configurable `--timeout` flag.

**Alternatives rejected**:
- Adding `crew` as a sub-command of `agents` — the team concept is distinct enough to warrant its own top-level command, consistent with `world`, `training`, etc.

---

## Consequences

- `WorkflowStep` has a new optional `triggerMode` field. Existing stored workflow definitions without it default to `'all'` (no migration needed).
- `agents.teams` and `agents.team_runs` tables added (migration 068).
- `TeamManager` requires `SubAgentManager` to be running; silently skips init if delegation is disabled.
- Builtin teams (3 templates) are seeded on startup.
- `secureyeoman crew` available immediately; no config changes required.
