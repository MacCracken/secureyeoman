# Prompt Security Guide

Phase 77 adds three input/output security controls that harden SecureYeoman against adversarial LLM manipulation. All controls are independently configurable via Security → Policy in the dashboard or the `/api/v1/security/policy` API.

---

## 1. Jailbreak Scoring

Every user message is scored by the InputValidator's injection detection pipeline. Each matched pattern contributes a severity-weighted score that accumulates and is capped at 1.0:

| Severity | Weight | Example patterns |
|----------|--------|-----------------|
| `high`   | 0.60   | `[[SYSTEM]]`, `ignore previous instructions`, DAN mode, `<script>` |
| `medium` | 0.35   | `UNION SELECT`, event handlers, command substitution |
| `low`    | 0.15   | Template literals, low-confidence matches |

### Configuration

| Field | Default | Description |
|-------|---------|-------------|
| `jailbreakThreshold` | `0.5` | Score at or above which `jailbreakAction` fires |
| `jailbreakAction` | `'warn'` | `block` / `warn` / `audit_only` |

- **`block`** — request rejected with HTTP 400 (`JAILBREAK_SCORE_THRESHOLD`); SSE streams receive an error event
- **`warn`** — request proceeds, audit entry written, `JAILBREAK_SCORE_THRESHOLD` warning included in the validation result
- **`audit_only`** — score stored on the chat message, no user-visible action

### Score persistence

`injection_score REAL` is stored on `chat.messages` (migration 064). The field is `null` for clean messages and for messages where injection detection is disabled.

### Dashboard

Security → Policy → **Prompt Security** card exposes both fields as a range slider (threshold) and a drop-down (action).

---

## 2. System Prompt Confidentiality

Prevents the AI from leaking its system prompt verbatim or near-verbatim in a response.

### How it works

After every AI response, when `strictSystemPromptConfidentiality` is enabled for the active personality, `ResponseGuard.checkSystemPromptLeak()` is called:

1. Tokenises both the response and the system prompt into lowercase 3-word trigrams
2. Computes overlap ratio: `|response trigrams ∩ system trigrams| / |system trigrams|`
3. If `overlapRatio >= systemPromptLeakThreshold`, the response is flagged as a leak
4. Matching trigram sequences are replaced with `[REDACTED]` in the response returned to the client

### Configuration

| Field | Scope | Default | Description |
|-------|-------|---------|-------------|
| `systemPromptLeakThreshold` | Global (ResponseGuard config) | `0.3` | Minimum trigram overlap to flag a leak |
| `strictSystemPromptConfidentiality` | Per-personality (body config) | `false` | Enable confidentiality check for this personality |

### Per-personality toggle

In PersonalityEditor → Behaviour, toggle **"Strict system prompt confidentiality"**. When on, any response that shares ≥ `systemPromptLeakThreshold` of its trigrams with the system prompt is redacted before delivery.

> **Note**: Common phrases ("You are a helpful assistant") appear in many system prompts and ordinary responses. Set `systemPromptLeakThreshold` no lower than 0.2 to avoid excessive false positives.

---

## 3. Rate-Aware Abuse Detection

Detects adversarial session patterns that individual blocked messages do not reveal.

### Signals

| Signal | What it catches | How it's measured |
|--------|----------------|-------------------|
| `blocked_retry` | Repeated re-submissions after a block | N consecutive blocked messages in a session |
| `topic_pivot` | Rapid topic switching to find a policy gap | Jaccard word overlap < `topicPivotThreshold` on consecutive turns, N times |
| `tool_anomaly` | Unusual breadth of tool enumeration | > 5 unique tool names called in a single turn |

When a signal fires, the session enters a cool-down period. Subsequent requests during cool-down return **HTTP 429** with a `Retry-After` header and a `suspicious_pattern` audit event is recorded.

### Configuration

All fields are under `Security.abuseDetection` in the security config:

| Field | Default | Description |
|-------|---------|-------------|
| `enabled` | `true` | Master switch |
| `topicPivotThreshold` | `0.3` | Jaccard overlap below which a topic pivot is counted |
| `blockedRetryLimit` | `3` | Blocks / pivots before cool-down triggers |
| `coolDownMs` | `60000` | Cool-down duration in milliseconds (default 1 min) |
| `sessionTtlMs` | `3600000` | Idle session TTL before state is evicted (default 1 hr) |

### Session key

The session key is `${userId}:${conversationId}`. Different conversations for the same user are tracked independently. Blocked retries and pivot counters reset after cool-down triggers.

> **Limitation**: State is in-memory and does not survive process restarts. Server-side persistence for multi-instance deployments is demand-gated (Phase 2).

---

## Audit Events

| Event | Level | Trigger |
|-------|-------|---------|
| `input_validation` | `info` | Any warning or block from InputValidator |
| `suspicious_pattern` | `warn` | AbuseDetector cool-down trigger (includes `signal`, `sessionId`, `coolDownUntil` metadata) |
| System prompt leak | `warn` | `checkSystemPromptLeak` returns `hasLeak=true` (logged via ResponseGuard) |

All events appear in the Audit Log tab and are exportable via `POST /api/v1/audit/export`.

---

## Quick-start: tighten security posture

```bash
# Set jailbreak threshold low + block mode
curl -X PATCH http://localhost:3001/api/v1/security/policy \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "jailbreakThreshold": 0.35,
    "jailbreakAction": "block",
    "abuseDetectionEnabled": true
  }'

# Enable system prompt confidentiality on a specific personality
curl -X PATCH http://localhost:3001/api/v1/soul/personalities/my-personality-id \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{ "body": { "strictSystemPromptConfidentiality": true } }'
```
