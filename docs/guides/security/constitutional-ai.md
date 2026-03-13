# Constitutional AI Guide

SecureYeoman's Constitutional AI feature evaluates every LLM response against a configurable set of alignment principles and optionally revises responses that violate them — generating DPO preference pairs for fine-tuning in the process.

## How It Works

1. **Generate** — The personality produces a response as normal.
2. **Critique** — A separate LLM call evaluates the response against each constitutional principle, returning per-principle verdicts (violated/not, severity, explanation).
3. **Revise** — If violations exceed the threshold, another LLM call rewrites the response to address the issues while preserving useful content.
4. **Record** — The (original, revised) pair is stored as a DPO preference pair for training.

## Configuration

Add to your `config.yaml` under `security`:

```yaml
security:
  constitutional:
    enabled: true
    mode: offline          # 'offline' = record pairs only; 'online' = revise before serving
    useDefaults: true      # Include built-in Helpfulness/Harmlessness/Honesty principles
    importIntentBoundaries: true  # Auto-import hard boundaries from organizational intent
    model: null            # Override model for critique calls (null = same as primary)
    critiqueTemperature: 0.2
    maxRevisionRounds: 1   # 1-5 revision attempts per response
    revisionThreshold: 1   # Minimum violations to trigger revision
    recordPreferencePairs: true
    principles: []         # Custom principles (see below)
```

### Custom Principles

```yaml
security:
  constitutional:
    enabled: true
    principles:
      - id: data_privacy
        name: Data Privacy
        description: Responses must not reveal or encourage sharing of personal data.
        critiquePrompt: >
          Does this response encourage the user to share personal information?
          Does it reveal PII from context? Does it suggest insecure data handling?
        weight: 1.0
        enabled: true
      - id: company_policy
        name: Company Policy
        description: Responses must align with company communication standards.
        critiquePrompt: >
          Does this response comply with professional communication standards?
          Does it avoid making promises or commitments on behalf of the organization?
        weight: 0.8
        enabled: true
```

Custom principles with the same `id` as a default (helpfulness, harmlessness, honesty) will override the default.

## Operating Modes

### Offline Mode (Default)

Critiques every response and records preference pairs, but serves the **original** response to the user. Use this to build a DPO training dataset without impacting response latency.

```yaml
security:
  constitutional:
    enabled: true
    mode: offline
    recordPreferencePairs: true
```

### Online Mode

Critiques and **revises** responses before serving them. Adds 1-2 additional LLM calls per response. Use this when real-time alignment is more important than latency.

```yaml
security:
  constitutional:
    enabled: true
    mode: online
```

## Integration with Organizational Intent

When `importIntentBoundaries` is true, hard boundaries from the active organizational intent document are automatically converted to constitutional principles. This means your existing governance rules are enforced at the response level without duplication.

```yaml
security:
  constitutional:
    enabled: true
    importIntentBoundaries: true
  allowOrgIntent: true
```

## REST API

All endpoints require `security:read` or `security:write` RBAC permission.

### List Principles

```
GET /api/v1/security/constitutional/principles
```

Returns the active principles, mode, and enabled status.

### Critique a Response

```
POST /api/v1/security/constitutional/critique
Content-Type: application/json

{
  "prompt": "How do I access the production database?",
  "response": "Here are the credentials: admin/password123"
}
```

Returns per-principle findings with violation status, severity, and explanation.

### Critique and Revise

```
POST /api/v1/security/constitutional/revise
Content-Type: application/json

{
  "prompt": "How do I access the production database?",
  "response": "Here are the credentials: admin/password123"
}
```

Returns the full revision result including original response, revised response, all critiques, and whether a revision was applied.

## MCP Tools

Enable with `exposeConstitutional: true` in MCP config:

| Tool | Description |
|------|-------------|
| `constitutional_principles` | List active constitutional principles |
| `constitutional_critique` | Critique a response against the constitution |
| `constitutional_revise` | Full critique-and-revise loop with preference pair recording |

## DPO Training Integration

Constitutional AI generates preference pairs with `source: 'constitutional'`. Export them for DPO fine-tuning:

```
GET /api/v1/training/preferences/export?source=constitutional&format=dpo
```

Each line is `{"prompt": "...", "chosen": "<revised>", "rejected": "<original>"}`.

Over time, the model learns the constitutional principles natively, reducing the need for online revision.

## Fail-Safe Behavior

- All LLM calls in the constitutional pipeline are wrapped in error handlers.
- On any failure (provider unavailable, parse error, timeout), the original response passes through unmodified.
- The feature never blocks a response from being served.
- Critique parse failures are logged at warn level for monitoring.

## Default Principles

| ID | Name | Focus |
|----|------|-------|
| `helpfulness` | Helpfulness | Addresses the user's actual need; complete and actionable |
| `harmlessness` | Harmlessness | Does not cause harm, promote danger, or produce toxic content |
| `honesty` | Honesty | Truthful, acknowledges uncertainty, does not fabricate |
