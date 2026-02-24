# ADR 124 — Prompt-Assembly Injection Guard (PromptGuard)

**Status**: Accepted
**Date**: 2026-02-23
**Phase**: 38 (Beta Manual Review — FRIDAY's Suggestions)

---

## Context

`InputValidator` (ADR 120) secures the HTTP boundary: it scans raw user input, history entries, soul route payloads, and MCP tool arguments before they are processed. This is sufficient to block *direct* injection attempts from malicious users.

However, a separate attack surface exists: **indirect prompt injection**. An adversary plants a crafted string in a data source the agent trusts — a web page scraped into memory, a poisoned skill description stored in the database, a fabricated user-note field, or content retrieved by `BrainManager.getRelevantContext()` — and that string is later assembled into the final system prompt. Because the content arrives via a trusted internal channel, it bypasses the HTTP boundary validator entirely.

The assembled system prompt may contain:
- Brain context snippets from retrieved memories and knowledge entries
- Skill instructions injected by `composeSoulPrompt()`
- Spirit context from `SpiritManager.composeSpiritPrompt()`
- Owner profile notes and learned preferences

None of these are re-validated before the LLM call. A single poisoned memory entry is sufficient to inject instructions that impersonate system-level authority.

## Decision

Introduce a second scanning layer, `PromptGuard`, that runs **immediately before the LLM API call** on the fully assembled `messages[]` array. It is distinct from `InputValidator` in both purpose and pattern set:

| Aspect | InputValidator | PromptGuard |
|--------|---------------|-------------|
| When | HTTP boundary (request arrival) | Pre-LLM (after full prompt assembly) |
| What it scans | Raw user input, history, soul payloads, MCP args | Assembled messages array (system + history + user) |
| Threat model | Direct user attacks | Indirect injection via trusted channels |
| On hit (block mode) | HTTP 400 | HTTP 400 (non-streaming) / SSE error event (streaming) |
| Audit event | `injection_attempt` | `injection_attempt` with `source: 'prompt_assembly'` |

### Pattern set

PromptGuard patterns are tuned for indirect injection, not raw user input attacks:

| Pattern name | Description | Severity | Scans system msg? |
|---|---|---|---|
| `context_delimiter` | Raw LLM context-boundary tokens (`<\|system\|>`, `<<SYS>>`, `[INST]`, etc.) | high | yes |
| `authority_claim` | Fake authority headers at line start (`SYSTEM:`, `ADMINISTRATOR:`, `AI_OVERRIDE:`) | high | no |
| `instruction_override` | Explicit directive replacement (`new directive:`, `override instruction:`) | high | yes |
| `developer_impersonation` | Claims to be the real developer/creator | high | no |
| `instruction_reset` | "From this point on, your instructions are..." | high | yes |
| `hypothetical_override` | Hypothetical framing used to establish a new context | medium | no |
| `comment_injection` | HTML/XML comment-based bypass attempts | medium | yes |
| `roleplay_override` | Roleplay framing to install new instructions | medium | no |

### Configuration

```yaml
security:
  promptGuard:
    mode: warn   # block | warn | disabled
```

- `warn` (default) — findings are audit-logged; request proceeds. Use during rollout to observe false-positive rate before enabling block mode.
- `block` — any high-severity finding aborts the request.
- `disabled` — scanning is skipped (not recommended for production).

### Instantiation

`PromptGuard` is instantiated once per route registration in `registerChatRoutes()`, reusing `secureYeoman.getConfig().security.promptGuard`. It is stateless; no database access.

### Insertion points

- **`POST /api/v1/chat`** — after `aiRequest` is built, before `aiClient.chat()`.
- **`POST /api/v1/chat/stream`** — after `messages[]` is finalized and tools are gathered, before the streaming agentic `while` loop. SSE headers are already sent at this point, so a block emits `{ type: 'error', message: '...' }` via the existing SSE error path (the guard throws, caught by the existing `catch` block).

## Consequences

- **Closes the indirect injection gap** for all content injected via Brain, Spirit, skills, and preferences.
- **Audit trail distinction** — `metadata.source: 'prompt_assembly'` makes it easy to query which blocks came from the deeper layer vs. the HTTP boundary.
- **No false positives on the system prompt itself** — patterns that only make sense in non-system positions (e.g. `authority_claim`) are skipped when scanning `role: 'system'` content. The system prompt legitimately uses structural headers.
- **`warn` default** — no behavior change on existing deployments; operators can observe audit events and move to `block` when confident.
- **Performance** — single regex pass over assembled content; negligible overhead vs. LLM round-trip latency.

## Related

- ADR 120 — Input Sanitization at HTTP Entry Points (`InputValidator`)
- ADR 122 — Security Audit Logging Completeness
- Roadmap Phase 38 — Beta Manual Review (FRIDAY's Suggestions)
