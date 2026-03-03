# Governance Hardening Guide

> Phase 50 — Closes deferred items from Phase 48 (Organizational Intent) and Phase 49 (Autonomy Audit).

---

## Overview

Phase 50 wires four previously-stubbed governance features:

| Feature | Before | After |
|---------|--------|-------|
| Hard boundary `rego` field | Stored, never evaluated | Evaluated via OPA sidecar |
| `policies[].rego` | Evaluated but OPA client was ad-hoc | Evaluated via `OpaClient` module |
| `activeWhen` on goals | Simple `key=value AND` parser | Full CEL expression evaluator |
| `mcp_tool` signal sources | Returns null always | Dispatches to `callMcpTool` callback |
| Policies in dashboard | Not visible | Policies tab in Intent Editor |

---

## OPA Sidecar Setup

### Enable OPA

Run the `opa` Docker Compose profile alongside `core`:

```bash
docker compose --env-file .env.dev --profile opa --profile dev up -d
```

Then set `OPA_ADDR=http://opa:8181` in your `.env.dev`:

```bash
OPA_ADDR=http://opa:8181
```

Or for `full` profile (all services including OPA):

```bash
docker compose --env-file .env --profile full up -d
```

### Security: Disabled Builtins

The OPA service is started with `opa/capabilities.json` which explicitly allowlists safe builtins. The following network builtins are **not** in the allowlist and are therefore unavailable to user-authored Rego:

- `http.send` — prevents SSRF
- `net.lookup_ip_addr` — prevents DNS-based data exfiltration

All string, regex, collection, JSON, and math builtins remain available.

### What Happens Without OPA

If `OPA_ADDR` is not set (the default), all `rego` fields in `hardBoundaries[]` and `policies[]` are stored in the database but never evaluated. Enforcement falls back to the natural-language substring rule matcher:

- Rules prefixed with `deny:` block if the action description contains the suffix.
- Rules prefixed with `tool:` block if the MCP tool name contains the suffix.
- Bare rules match as substring against the action description.

---

## Writing Rego Policies

### Hard Boundary Example

```json
{
  "hardBoundaries": [
    {
      "id": "no-prod-writes",
      "rule": "deny: write to production",
      "rationale": "No AI-initiated writes to production databases.",
      "rego": "package boundary_no_prod_writes\n\ndefault allow = true\n\nallow = false {\n  contains(lower(input.action), \"write\")\n  contains(lower(input.action), \"production\")\n}"
    }
  ]
}
```

The Rego package name must match `boundary_{id}` (with hyphens converted to underscores). The rule evaluates `input.action` (the action description) and `input.tool` (the MCP tool name or `null`).

### Soft Policy Example

```json
{
  "policies": [
    {
      "id": "pii-guard",
      "rule": "no PII in outputs",
      "enforcement": "warn",
      "rationale": "Warn when outputs may contain personally identifiable information.",
      "rego": "package policy_pii_guard\n\ndefault allow = true\n\nallow = false {\n  regex.match(`(?i)(ssn|social security|credit card)`, input.action)\n}"
    }
  ]
}
```

Soft policies use `policy_{id}` as the package name. `enforcement: "warn"` logs a `policy_warn` event; `enforcement: "block"` logs `policy_block` and stops the action.

### Policy Upload

Policies are automatically uploaded to OPA whenever an intent document is created or updated via the REST API. If OPA is unavailable at save time, the error is logged to stderr and the save succeeds — OPA will receive the policy on the next save.

---

## CEL Expressions for `activeWhen`

The `activeWhen` field on goals now supports full CEL expressions. The legacy `key=value AND key=value` format remains backward-compatible.

### Supported syntax

```
# Simple equality
env == "prod"
quarter == "Q1"

# Inequality
env != "dev"

# Logical operators
env == "prod" && region == "us"
env == "prod" || env == "staging"
!(env == "dev")

# Grouping
(env == "prod" || env == "staging") && tier == "enterprise"

# Legacy format (still works)
env=prod AND quarter=Q1
```

### Context variables

Context values come from the `ctx` map passed to `resolveActiveGoals(ctx)`. In practice this is the request context — commonly `{ env, region, tier, quarter }` etc.

When `ctx.key` syntax is used, the identifier before `.` is ignored and the field after `.` is looked up in context:

```
ctx.env == "prod"    # same as  env == "prod"
```

### Permissive fallback

A malformed CEL expression logs a warning to stderr and returns `true` (goal is treated as unconditionally active). This prevents a typo in `activeWhen` from silently blocking all goals.

---

## MCP Tool Signal Sources

Data sources with `type: "mcp_tool"` dispatch a tool call to retrieve the signal value.

```json
{
  "dataSources": [
    {
      "id": "ds-error-rate",
      "name": "Error Rate",
      "type": "mcp_tool",
      "connection": "get_error_rate",
      "schema": "$.p99"
    }
  ]
}
```

- `connection` — the MCP tool name to call.
- `schema` — optional path hint passed as `{ schema }` in the tool input.

The tool must return a numeric value. The signal monitor expects either a raw number or `{ value: number }` from HTTP sources; for MCP tools the numeric return value from the `callMcpTool` callback is used directly.

> **Note:** `callMcpTool` must be wired in `secureyeoman.ts` for MCP signal dispatch to work. Until wired, `mcp_tool` sources return `null` (signal unavailable).

---

## Dashboard: Policies Tab

The **Intent → Policies** tab in the dashboard shows the active intent's `policies[]`:

- **Blocking** (red) — policies with `enforcement: "block"` are listed first.
- **Warning** (yellow) — policies with `enforcement: "warn"`.
- **OPA Rego badge** — shown when the policy has a `rego` field. Click "View Rego policy" to expand the source.

Policies themselves are edited via **Intent → Editor** (requires `allowIntentEditor` developer mode flag).

---

## Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `OPA_ADDR` | *(unset)* | OPA sidecar URL, e.g. `http://opa:8181`. Leave unset to disable OPA. |

---

## Enforcement Log Events

| Event | Trigger |
|-------|---------|
| `boundary_violated` | `checkHardBoundaries()` found a match (OPA or substring) |
| `policy_warn` | `checkPolicies()` found a warn-enforcement match |
| `policy_block` | `checkPolicies()` found a block-enforcement match |

All events appear in the **Intent → Enforcement Log** tab filtered by event type.
