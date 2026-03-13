# Organizational Intent Guide

Phase 48 introduces **Machine Readable Organizational Intent** — a structured, versioned document that agents can reason within. Instead of ad-hoc guidance buried in personality system prompts or Slack messages, `OrgIntent` formalizes:

- **Goals** — what the organization is trying to achieve
- **Signals** — live data sources that indicate goal health
- **Data Sources** — connections to metrics, APIs, or MCP tools
- **Authorized Actions** — what agents are explicitly allowed to do
- **Trade-off Profiles** — speed vs. thoroughness, cost vs. quality, autonomy vs. confirmation
- **Hard Boundaries** — rules agents must never violate
- **Delegation Framework** — decision boundaries per tenant/team
- **Context** — stable facts (org name, industry, environment)

## Enabling

In your `secureyeoman.yaml`:

```yaml
security:
  allowOrgIntent: true
```

Or toggle **Settings → Security → Organizational Intent** in the dashboard.

## Creating an Intent Document

### Via REST API

```bash
curl -X POST http://localhost:18789/api/v1/intent \
  -H "Content-Type: application/json" \
  -d '{
    "name": "ACME Org Intent Q1 2026",
    "goals": [
      {
        "id": "grow-arr",
        "name": "Grow ARR to $5M",
        "description": "Increase annual recurring revenue through new logos and expansion",
        "priority": 1,
        "successCriteria": "Monthly ARR reporting shows $5M run rate",
        "ownerRole": "ceo",
        "skills": ["revenue-analyzer"],
        "signals": ["arr-signal"],
        "authorizedActions": ["send-sales-summary"]
      }
    ],
    "signals": [
      {
        "id": "arr-signal",
        "name": "Monthly ARR",
        "dataSources": ["billing-api"],
        "direction": "below",
        "threshold": 5000000,
        "warningThreshold": 4500000
      }
    ],
    "dataSources": [
      {
        "id": "billing-api",
        "name": "Billing API",
        "type": "http",
        "connection": "https://billing.internal/api/arr/current"
      }
    ],
    "tradeoffProfiles": [
      {
        "id": "default",
        "name": "Balanced",
        "speedVsThoroughness": 0.5,
        "costVsQuality": 0.6,
        "autonomyVsConfirmation": 0.4,
        "isDefault": true
      }
    ],
    "hardBoundaries": [
      {
        "id": "no-pii",
        "rule": "deny: export customer PII",
        "rationale": "GDPR compliance — agents must never bulk-export customer PII"
      }
    ],
    "delegationFramework": {
      "tenants": [
        {
          "id": "engineering",
          "principle": "Agents act as a senior engineer; escalate architectural decisions",
          "decisionBoundaries": [
            "Can merge PRs under 500 lines with passing CI",
            "Cannot change infrastructure or deploy to production without human approval"
          ]
        }
      ]
    },
    "context": [
      { "key": "orgName", "value": "ACME Corp" },
      { "key": "industry", "value": "SaaS" },
      { "key": "dataRegion", "value": "EU" }
    ]
  }'
```

### Activating an Intent

```bash
# List available intent docs
curl http://localhost:18789/api/v1/intent

# Activate the one you want
curl -X POST http://localhost:18789/api/v1/intent/{id}/activate
```

## Prompt Injection

When an intent doc is active, `SoulManager` automatically injects the following sections into every soul prompt (before skill instructions):

```
## Organizational Goals
### Grow ARR to $5M (priority 1)
Increase annual recurring revenue...
Success criteria: Monthly ARR reporting shows $5M run rate
Signals:
  - Monthly ARR is healthy (4200000) [healthy]

## Organizational Context
orgName: ACME Corp
industry: SaaS

## Trade-off Profile
Active profile: **Balanced**
- Speed vs Thoroughness: 50% thoroughness preference
- Cost vs Quality: 60% quality preference
- Autonomy vs Confirmation: 40% confirmation preference

## Decision Boundaries
[engineering] Agents act as a senior engineer; escalate architectural decisions
  - Can merge PRs under 500 lines with passing CI
  - Cannot change infrastructure or deploy to production without human approval
```

## Signal Monitoring

Signals are refreshed every 5 minutes (configurable via `intent.signalRefreshIntervalMs`). The current value of any signal can be read via:

- **REST**: `GET /api/v1/intent/signals/{signalId}/value`
- **MCP tool**: `intent_signal_read` (requires `exposeOrgIntentTools: true` in MCP config)

Signal status:
- `healthy` — value is within normal range
- `warning` — value has crossed `warningThreshold`
- `critical` — value has crossed `threshold`

## Hard Boundaries

Hard boundary rules are evaluated before agent actions. Rule syntax:

| Prefix | Behavior |
|--------|----------|
| `deny: <phrase>` | Blocks any action whose description contains the phrase |
| `tool: <name>` | Blocks a specific MCP tool name |
| (bare) | Substring match against action description |

When a boundary is violated, an entry is written to `intent_enforcement_log` with `event_type = boundary_violated` and the action is refused.

## Trade-off Profiles

Profiles are injected into the soul prompt as natural-language guidance. Agents use them to calibrate:

- How much to invest in research vs. acting quickly
- Whether to use cheaper models or prefer quality
- When to ask for confirmation vs. acting autonomously

Only the `isDefault: true` profile is injected. You can have multiple profiles and switch the default by updating the document.

## Enforcement Log

All boundary violations and action blocks are written to the enforcement log. Query via:

```bash
# All events
GET /api/v1/intent/enforcement-log

# Filtered
GET /api/v1/intent/enforcement-log?eventType=boundary_violated&limit=50
GET /api/v1/intent/enforcement-log?agentId=agent-123&since=1700000000000
```

Or view in **Settings → Intent → Enforcement Log** in the dashboard.

## Configuration Reference

```yaml
security:
  allowOrgIntent: true   # master toggle

intent:
  filePath: ./orgIntent.yaml           # optional file-based bootstrap
  signalRefreshIntervalMs: 300000      # 5 minutes (default)
```

MCP config (`mcp.yaml`):

```yaml
exposeOrgIntentTools: true   # enables the intent_signal_read MCP tool
```

## API Reference

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/intent` | List all intent docs (metadata) |
| `POST` | `/api/v1/intent` | Create new intent doc |
| `GET` | `/api/v1/intent/active` | Get active intent doc |
| `GET` | `/api/v1/intent/:id` | Get full intent doc |
| `PUT` | `/api/v1/intent/:id` | Update intent doc |
| `DELETE` | `/api/v1/intent/:id` | Delete intent doc |
| `POST` | `/api/v1/intent/:id/activate` | Set as active intent |
| `GET` | `/api/v1/intent/enforcement-log` | Query enforcement log |
| `GET` | `/api/v1/intent/signals/:id/value` | Read live signal value |
