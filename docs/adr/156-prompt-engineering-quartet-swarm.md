# ADR 156: Prompt Engineering Quartet Swarm Template

**Status**: Accepted
**Phase**: 72b
**Date**: 2026-02-28

---

## Context

Four prompt-engineering skills were promoted from the community skills repo to the core marketplace as builtin skills (Phase 72 / `[2026.2.28l]`):

- **Prompt Craft** — diagnoses and rewrites prompts using optimal techniques
- **Context Engineering** — designs the information architecture of an AI inference call
- **Intent Engineering** — resolves ambiguous or underspecified requests before execution
- **Specification Engineering** — formalizes confirmed intent as a verifiable task contract

These skills form a natural sequential pipeline: clarify intent → design context → craft prompt → specify contract. The existing swarm template system (ADR 055) supports exactly this pattern via the `sequential` strategy.

The goal is to expose this pipeline as a first-class builtin swarm template so any personality with swarms enabled can invoke the full prompt-engineering workflow in one call.

---

## Decision

### New Agent Profiles (4)

Each skill is distilled into a dedicated `AgentProfile` in `packages/core/src/agents/profiles.ts`. The system prompts preserve the core decision frameworks from the marketplace skills but are reformatted as directive agent instructions.

| Profile ID | Name | Budget | Tool Scope |
|---|---|---|---|
| `builtin-intent-engineer` | `intent-engineer` | 40,000 tokens | memory + knowledge (read) |
| `builtin-context-engineer` | `context-engineer` | 50,000 tokens | memory + knowledge (read/write) |
| `builtin-prompt-crafter` | `prompt-crafter` | 50,000 tokens | memory + knowledge (read) |
| `builtin-spec-engineer` | `spec-engineer` | 60,000 tokens | memory + knowledge (read/write) |

**Tool scope rationale**: All four profiles are reasoning-only roles that operate on provided context. No filesystem, git, or web access is needed. Knowledge store write access is granted to context-engineer and spec-engineer so they can persist reusable patterns (context architectures, spec templates) for future runs.

**Budget rationale**: Intent engineering is the lightest phase (clarification reasoning). Context and prompt craft are mid-weight (design + synthesis). Specification is the heaviest (structured document generation with multiple required sections).

### New Swarm Template (1)

`prompt-engineering-quartet` added to `packages/core/src/agents/swarm-templates.ts`:

```
Strategy: sequential

Pipeline:
  1. intent-engineer   → resolve ambiguity, confirm what is actually wanted
         ↓ (output becomes context for next agent)
  2. context-engineer  → design information architecture for the target use case
         ↓
  3. prompt-crafter    → diagnose weaknesses, select technique, rewrite prompt
         ↓
  4. spec-engineer     → formalize as verifiable contract (ACs, constraints, decomposition)
```

**Why sequential (not parallel)?** Each stage depends on the previous stage's output. The intent-engineer's clarified goal is required input for context design. The context architecture informs the prompt-crafter's technique selection. The prompt-crafter's rewritten prompt is the artifact the spec-engineer formalizes.

**Why no coordinatorProfile?** The spec-engineer is the natural final synthesizer — its output (problem statement + ACs + constraints + decomposition) is the finished deliverable. A separate coordinator would add latency and tokens without improving output quality.

### No Changes to Storage or Routes

The new profiles and template are picked up automatically by the existing seeding infrastructure:

- `SwarmStorage.seedBuiltinTemplates()` upserts `BUILTIN_SWARM_TEMPLATES` on startup
- `SubAgentManager` seeds profiles from `BUILTIN_PROFILES` on startup

No migration or route changes are required.

---

## Consequences

### Positive
- One-command invocation of a complete prompt engineering workflow via `create_swarm` tool
- Each phase is independently inspectable as a `SwarmMember` result
- Sequential context chaining means each agent builds on prior agents' work — the spec-engineer sees the intent, context architecture, and rewritten prompt
- Narrow tool scopes minimize blast radius of each sub-agent

### Negative / Trade-offs
- Four sequential delegations make this the highest-latency builtin template (~4× a single delegation)
- Token cost is additive: 40k + 50k + 50k + 60k = 200k budget allocation before the swarm task itself
- The `sequential` chain means a failure in any stage aborts the remaining stages

### Neutral
- Builtin profile count: 4 → 8
- Builtin template count: 4 → 5
- No new dependencies, routes, or migrations
