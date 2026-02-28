# ADR 158: Prompt Security — Jailbreak Scoring, System Prompt Confidentiality, Abuse Detection

**Date**: 2026-02-28
**Status**: Accepted
**Phase**: 77

---

## Context

The existing security stack (InputValidator, PromptGuard, ResponseGuard) already detects known injection patterns and scans AI outputs. Three gaps remained:

1. **No quantified risk score** — injection events were binary (block/pass). A numeric score per turn would allow graduated responses (block vs. warn vs. record) and give operators a jailbreak pressure signal in the audit log.
2. **No system prompt confidentiality enforcement** — the AI could reproduce its system prompt verbatim when asked. Per-personality toggle was planned but not implemented.
3. **No adversarial session tracking** — repeated blocked prompts, rapid topic pivoting, and tool-call enumeration were not correlated across turns. A session-level view is needed to detect adversarial probing patterns that individually look borderline.

---

## Decision

### 1. Weighted Injection Scoring (`InputValidator`)

Each matched injection pattern contributes a severity-weighted score:

| Severity | Weight |
|----------|--------|
| high     | 0.60   |
| medium   | 0.35   |
| low      | 0.15   |

Scores accumulate across all matched patterns and are capped at 1.0. The final `injectionScore` is returned on every `ValidationResult` and stored on `chat.messages.injection_score` (migration 064).

**Jailbreak threshold** — configurable in `InputValidationConfigSchema`:
- `jailbreakThreshold: number` (0–1, default 0.5)
- `jailbreakAction: 'block' | 'warn' | 'audit_only'` (default `'warn'`)

When `injectionScore >= jailbreakThreshold` and the request was not already blocked by a specific pattern:
- `block` — return 400 / SSE error with reason
- `warn` — allow request, add `JAILBREAK_SCORE_THRESHOLD` warning, write audit entry
- `audit_only` — score is stored, no further action

### 2. System Prompt Confidentiality (`ResponseGuard`)

Added `checkSystemPromptLeak(responseText, systemPrompt): SystemPromptLeakResult`.

Algorithm:
1. Tokenise both texts to lowercase word sequences
2. Build trigram (3-word window) sets for each
3. Compute overlap ratio = `|response_trigrams ∩ system_trigrams| / |system_trigrams|`
4. If `overlapRatio >= systemPromptLeakThreshold` (default 0.3), set `hasLeak=true`
5. Return `redacted` text with matching trigram sequences replaced by `[REDACTED]`

Per-personality toggle `strictSystemPromptConfidentiality: boolean` in `BodyConfigSchema` (stored in body JSONB — no migration needed). When true, `chat-routes.ts` calls `checkSystemPromptLeak()` after every AI response.

### 3. Rate-Aware Abuse Detection (`AbuseDetector`)

New class at `packages/core/src/security/abuse-detector.ts`. Tracks three adversarial signals per session (in-memory, TTL eviction):

| Signal | Trigger | Heuristic |
|--------|---------|-----------|
| `blocked_retry` | Repeated blocked submissions | `blockedRetries >= blockedRetryLimit` |
| `topic_pivot` | Rapid topic switching | Jaccard overlap < `topicPivotThreshold` on consecutive turns, `blockedRetryLimit` times |
| `tool_anomaly` | Spike in unique tool names per turn | > 5 unique tool names in one turn |

When a signal fires:
- Session enters cool-down for `coolDownMs` ms
- `check()` returns `{ inCoolDown: true, coolDownUntil, triggeringSignal }` → handler returns 429
- `suspicious_pattern` audit event written via injected `AuditRecordFn`

Configuration in `SecurityConfigSchema.abuseDetection`:
```
enabled: boolean             (default true)
topicPivotThreshold: number  (default 0.3)
blockedRetryLimit: number    (default 3)
coolDownMs: number           (default 60_000)
sessionTtlMs: number         (default 3_600_000)
```

Sessions older than `sessionTtlMs` are evicted during each `check()` call.

---

## Consequences

**Positive**
- Jailbreak risk is now quantified and auditable per-turn
- Operators can tune aggressiveness (block vs. warn vs. audit) without code changes
- System prompt leaks are detected and redacted automatically when the per-personality toggle is on
- Adversarial session probing is detectable without storing state in the DB

**Negative / Trade-offs**
- Trigram overlap is a heuristic — short system prompts or responses that happen to share common phrases may generate false positives at low thresholds
- AbuseDetector state is in-memory only; cool-downs do not survive process restarts. Acceptable for now — Phase 2 server-side persistence is demand-gated
- Jaccard topic-pivot detection uses bag-of-words; semantic pivot (same words, different intent) is not detected. An embedding-based pivot detector is a demand-gated improvement

---

## Alternatives Considered

- **External prompt-shield API** (Azure Prompt Shields) — rejected: adds latency + external dependency; existing regex-based detection is sufficient for the threat model
- **ML-based jailbreak classifier** — the roadmap item called for an embedding classifier; deferred to Phase 83 (Content Guardrails). The weighted regex score is a fast, deterministic proxy that requires no model inference
- **Redis-backed session state for AbuseDetector** — deferred to Phase 2 (demand-gated). In-memory covers single-instance deployments and the vast majority of current deployments
