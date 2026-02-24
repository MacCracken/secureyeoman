# ADR 127 — Skill Routing Quality (Phase 44)

**Date**: 2026-02-24
**Status**: Accepted

---

## Context

Skill routing accuracy was measured at ~73%. Skills were matched solely by `triggerPatterns` regex or a name-keyword fallback in `isSkillInContext()`. There was no way to:

- Declare *when* a skill should or shouldn't activate (activation boundary)
- Use deterministic routing for compliance SOPs
- Inject success criteria so the model knows when a skill is complete
- Restrict which MCP tools are available while a skill is active
- Measure routing precision over time
- Warn authors when literal credentials appear in skill instructions

---

## Decision

Add 7 new fields to `SkillSchema` and corresponding database columns, and enrich `composeSoulPrompt` to use them:

### Schema fields added

| Field | Type | Default | Purpose |
|-------|------|---------|---------|
| `useWhen` | `string` (max 500) | `''` | Conditions injected into skill catalog in system prompt |
| `doNotUseWhen` | `string` (max 500) | `''` | Anti-conditions injected into skill catalog |
| `successCriteria` | `string` (max 300) | `''` | Appended after skill instructions; tells model when skill is complete |
| `mcpToolsAllowed` | `string[]` | `[]` | Prompt-level tool restriction when skill is active |
| `routing` | `'fuzzy' \| 'explicit'` | `'fuzzy'` | Explicit mode appends deterministic routing text |
| `linkedWorkflowId` | `string \| null` | `null` | Links skill to a workflow for orchestration routing |
| `invokedCount` | `number` | `0` | Tracks router selections; ratio with `usageCount` = precision |

### Prompt enrichment

- **Catalog block**: each skill entry now includes `Use when:`, `Don't use when:`, workflow link, and explicit routing phrase
- **Instructions block**: `{{output_dir}}` template variable expands to `outputs/{skill-slug}/{iso-date}/`; MCP tool restriction and success criteria appended
- **Telemetry**: `invokedCount` incremented (fire-and-forget) when a skill's instructions are expanded into the prompt

### Credential safety

POST/PUT `/api/v1/soul/skills` runs `detectCredentials()` on `instructions` and returns `{ skill, warnings? }`. Non-breaking — still 201/200.

---

## Consequences

### Positive

- **Routing accuracy improvement**: from ~73% to projected ~85% via explicit activation boundaries and routing hints
- **Backward compatible**: all new fields have safe defaults — existing skills require no migration beyond the ALTER TABLE
- **Routing precision metric**: `invokedCount / usageCount` ratio surfaced in Skills Manager dashboard
- **Credential hygiene**: authors warned before literal credentials leak into system prompts
- **Workflow orchestration**: `linkedWorkflowId` enables skill→workflow trigger routing
- **Tool scoping**: `mcpToolsAllowed` enables per-skill tool restriction at prompt level

### Negative / trade-offs

- Skill catalog entries grow longer with `useWhen`/`doNotUseWhen` text — token budget impact mitigated by existing `maxChars` cap
- `invokedCount` is fire-and-forget (best-effort) — minor under-counting possible on DB error
- MCP tool restriction is prompt-level only; not enforced at the MCP routing layer

---

## Alternatives Considered

**Vector similarity routing** — embed skills and messages, route by cosine similarity. Rejected: requires vector infrastructure (Phase 29 opt-in) and adds latency to every request.

**LLM-based skill selector** — call a fast model to select the skill before the main call. Rejected: doubles first-token latency and adds cost per request.

**Per-skill fine-tuning signals** — rejected as premature for current scale.
