# ADR 137: AI Safety Layer (Phase 54)

**Status:** Accepted
**Date:** 2026-02-26
**Phase:** 54

---

## Context

SecureYeoman's existing security pipeline guards the *input* side of each chat turn: `InputValidator` rejects malicious HTTP payloads, `PromptGuard` scans fully-assembled messages for indirect injection, and `ToolOutputScanner` redacts credentials in tool results. The *output* side — what the LLM actually writes back — was unchecked.

Observed threat vectors that motivated this change:

1. **Response-level injection** — an adversary plants a cross-turn influence string ("Remember for future messages…") in a data source. PromptGuard may not fire on it if the pattern survives the prompt, but it could appear in the LLM's reply.
2. **Self-escalation / role confusion** — the model may be jailbroken to claim it is a different system or operates "without restrictions".
3. **Base64 / hex exfiltration** — tool outputs or user data could be smuggled out in encoded blobs embedded in the LLM response.
4. **High-autonomy tool calls** — personalities operating at `supervised_auto` may issue dangerous tool invocations that violate organizational intent.
5. **Unvalidated workflow outputs** — skill steps produce arbitrary JSON that downstream steps consume; schema drift causes silent data quality issues.

---

## Decision

Add five interlocking safety mechanisms that together form the **AI Safety Layer**:

### 1. ResponseGuard (`src/security/response-guard.ts`)

Pattern-based scanner applied to LLM responses. Mirror of `PromptGuard` on the output side. Six patterns:

| Pattern | Severity |
|---------|----------|
| `instruction_injection_output` | high |
| `cross_turn_influence` | high |
| `self_escalation` | high |
| `role_confusion` | high |
| `base64_exfiltration` | medium |
| `hex_exfiltration` | medium |

Operates in `block`, `warn`, or `disabled` mode. Integrates with the existing `ResponseGuardConfig` schema field. Also provides `checkBrainConsistency()` — warn-only identity/memory cross-check that never blocks.

### 2. OPA Output Compliance (`src/intent/manager.ts`)

New `checkOutputCompliance(responseText)` method on `IntentManager`. Evaluates the `output_compliance/allow` OPA rule against the response text and active hard boundaries. `syncPoliciesWithOpa()` now also uploads the `output_compliance` Rego package automatically.

Fail-open on any OPA error, no boundaries, or missing intent. Violations are audit-logged as `output_compliance_warning` (warn-only, never blocks).

### 3. LLM-as-Judge (`src/security/llm-judge.ts`)

Secondary lightweight LLM call before tool execution when the personality's `automationLevel` is in the configured trigger list (default: `['supervised_auto']`). Returns `allow`, `warn`, or `block`.

- `block` → push error tool result + `llm_judge_block` audit event + skip execution
- `warn` → `llm_judge_warn` audit event + intent enforcement log entry + continue
- Fail-open on parse/network error

Instantiated once in `registerChatRoutes()`; both stream and non-stream paths share the same instance.

### 4. Structured Output Schema Validation (`src/security/output-schema-validator.ts`)

Minimal JSON Schema subset validator (no new runtime dependencies). Supports `type`, `required[]`, `properties{}`, `items{}`. Hooked into `WorkflowEngine.runStep()` after dispatch; logs `step_output_schema_violation` warnings, never throws.

Skills gain an optional `outputSchema: Record<string, unknown> | null` field in both `BaseSkillSchema` and the DB (migration 055).

### 5. Config Integration

Two new config schemas added to `SecurityConfigSchema`:

```typescript
responseGuard: ResponseGuardConfigSchema  // mode: 'block' | 'warn' | 'disabled', default 'warn'
llmJudge: LLMJudgeConfigSchema            // enabled, model?, triggers.automationLevels
```

---

## Consequences

**Positive:**
- Symmetric coverage: input side (PromptGuard) ↔ output side (ResponseGuard + OPA compliance)
- High-autonomy operations gated by an independent LLM judgment
- Workflow outputs can be validated against declared schemas with zero breakage risk (soft)
- All features are individually configurable and default to non-blocking modes

**Neutral:**
- LLM-as-Judge adds latency when enabled; disabled by default
- ResponseGuard and OPA compliance run on every chat response (microseconds for pattern matching, milliseconds for OPA if configured)

**Trade-offs accepted:**
- ResponseGuard is pattern-based, not semantic — may miss novel phrasing; false positives minimal given carefully scoped regexes
- `checkBrainConsistency` is heuristic; no strong guarantees, warn-only
- LLMJudge does not consult skill-level autonomy levels (L4/L5) to avoid storage round-trips in the tool hot path; deferred

---

## Alternatives Considered

- **Full semantic response scoring via embeddings** — high latency, complex deployment; deferred
- **ResponseGuard always blocks on medium severity** — too aggressive; many legitimate responses contain long base64 strings (e.g. SSH public keys in tool output)
- **Synchronous OPA compliance (blocking)** — chosen as warn-only to avoid false positives disrupting production chat

---

## Related

- ADR 124 — PromptGuard (input-side injection scanner)
- ADR 128 — Organizational Intent & Governance Framework (OPA, CEL, Autonomy Audit)
- Guide: `docs/guides/ai-safety-layer.md`
