# Content Guardrails Guide

Content Guardrails enforce output-side content policies on AI responses. They run after ResponseGuard in the chat pipeline, catching PII, off-topic content, toxicity, blocked terms, and unverified citations before responses reach users.

## Enabling

Set `security.contentGuardrails.enabled: true` in your configuration or toggle it on via the dashboard Security page under "Content Guardrails".

## PII Detection & Redaction

Detects five PII types in AI responses:

| Type | Example | Redacted As |
|------|---------|-------------|
| Email | user@example.com | [EMAIL REDACTED] |
| Phone | 555-123-4567 | [PHONE REDACTED] |
| SSN | 123-45-6789 | [SSN REDACTED] |
| Credit Card | 4111 1111 1111 1111 | [CARD REDACTED] |
| IP Address | 192.168.1.100 | [IP REDACTED] |

**Modes:**
- `disabled` — no PII scanning
- `detect_only` — log findings without modifying text
- `redact` — replace detected PII with placeholder tokens

```yaml
security:
  contentGuardrails:
    enabled: true
    piiMode: redact
```

## Topic Restrictions

Block responses that touch specified topics using keyword-based Jaccard overlap.

```yaml
security:
  contentGuardrails:
    blockedTopics:
      - "nuclear weapons"
      - "insider trading"
    topicThreshold: 0.75
```

Per-personality additions can extend the global list:

```yaml
body:
  contentGuardrails:
    blockedTopicAdditions:
      - "competitor analysis"
```

## Toxicity Filtering

Uses an external HTTP classifier to detect toxic content. Expects `POST` with `{ text }` body and `{ score, categories? }` response.

```yaml
security:
  contentGuardrails:
    toxicityEnabled: true
    toxicityMode: block      # block | warn | audit_only
    toxicityClassifierUrl: "https://your-classifier.example.com/classify"
    toxicityThreshold: 0.7
```

The filter is **fail-open** — if the classifier is unreachable or returns an error, responses pass through.

## Custom Block Lists

Block specific terms or patterns in responses.

```yaml
security:
  contentGuardrails:
    blockList:
      - "confidential project name"
      - "regex:password[=:]\\s*\\S+"
```

- Plain strings use word-boundary matching (case-insensitive)
- Prefix with `regex:` for regex patterns (max 200 characters)
- Invalid regex patterns are silently skipped
- Per-personality additions via `blockListAdditions`

## Grounding Verification

Verify that quoted citations and "according to" claims exist in the knowledge base.

```yaml
security:
  contentGuardrails:
    groundingEnabled: true
    groundingMode: flag    # flag | block
```

- `flag` — appends `[unverified]` to unverified citations
- `block` — rejects responses containing unverified citations

Requires a populated knowledge base (see [Knowledge & Memory Guide](./knowledge-memory.md)).

## Audit Trail

All guardrail findings are recorded in the audit chain with:
- Finding type (pii, block_list, topic, toxicity, grounding)
- Action taken (block, warn, redact, flag)
- Content hash (SHA-256) of the triggering text segment
- Source and personality context

## Dashboard Configuration

The Security page includes a "Content Guardrails" card with:
- Master enable/disable toggle
- PII mode selector
- Toxicity controls (toggle, mode, classifier URL, threshold slider)
- Block list editor (textarea, one entry per line)
- Blocked topics editor (textarea, one per line)
- Grounding controls (toggle, mode selector)

## API

Content guardrail settings are part of the security policy API:

```
GET  /api/v1/security/policy    # includes contentGuardrails* fields
PATCH /api/v1/security/policy   # update any contentGuardrails* field
```
