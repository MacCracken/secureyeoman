# ADR 088 — Cross-Integration Routing Rules

**Status**: Accepted
**Date**: 2026-02-21
**Phase**: 34

---

## Context

SecureYeoman's `MessageRouter.handleInbound()` processes every inbound message with a fixed pipeline: store → check access → submit to task executor. There was no mechanism to intercept messages and apply custom routing logic — forwarding an urgent Slack mention to a Telegram group, overriding the active personality for certain senders, or POSTing a raw payload to an external webhook.

Building per-integration routing hacks inside each adapter would be unmaintainable. A generalised rule system that evaluated declarative conditions and fired deterministic actions was the right abstraction.

---

## Decision

Implement **Cross-Integration Routing Rules** as a priority-ordered evaluation engine that runs after a message is stored but before the task executor processes it.

### Rule schema

Each rule specifies:

| Field | Description |
|-------|-------------|
| `triggerPlatforms[]` | Platform allowlist (`[]` = all) |
| `triggerIntegrationIds[]` | Integration allowlist (`[]` = all) |
| `triggerChatIdPattern` | Regex or `null` (wildcard) |
| `triggerSenderIdPattern` | Regex or `null` (wildcard) |
| `triggerKeywordPattern` | Regex or `null` (wildcard) on message text |
| `triggerDirection` | `inbound` / `outbound` / `both` |
| `actionType` | `forward` / `reply` / `personality` / `notify` |
| `priority` | 1–9999 (lower = evaluated first) |

### Action types

| Type | Behaviour |
|------|-----------|
| `forward` | Relay message text (optionally via Mustache template) to a different `(integrationId, chatId)` |
| `reply` | Same as forward but conceptually scoped to the same conversation on a different integration |
| `personality` | Invoke the `onPersonalityOverride` callback with the specified `actionPersonalityId` |
| `notify` | HTTP POST the message payload to `actionWebhookUrl` (10 s timeout) |

### Pattern matching

Patterns are evaluated with `new RegExp(pattern, 'i')`. Invalid regex strings fall back to literal substring matching. `null` patterns are wildcards (always match).

### Evaluation pipeline

1. `RoutingRulesManager.processMessage(message)` is called from `MessageRouter.handleInbound()` after the empty-message guard, in a fire-and-forget `void` wrapper — routing rule failures must never drop a message.
2. `evaluateRules()` calls `RoutingRulesStorage.listEnabled()` (priority-ASC sorted) and evaluates each rule's `evaluateRule()` function.
3. Each matched rule has `recordMatch()` called (non-blocking) to increment its `match_count` and update `last_matched_at` for analytics.
4. `applyRule()` executes the action with error isolation per-rule.

### Dry-run / test endpoint

`POST /api/v1/routing-rules/:id/test` evaluates a rule against synthetic params without sending anything. Used by the visual rule builder's test panel.

### Architecture

| Layer | Component | Notes |
|-------|-----------|-------|
| Storage | `RoutingRulesStorage` (extends `PgBaseStorage`) | Full CRUD + `listEnabled()` + `recordMatch()` |
| Engine | `RoutingRulesManager` | `evaluateRules()`, `applyRule()`, `testRule()` |
| API | `GET/POST/PUT/DELETE /api/v1/routing-rules[/:id]` + `POST /api/v1/routing-rules/:id/test` | Registered in `GatewayServer` |
| Dashboard | `RoutingRulesPage.tsx` | Embedded as a tab in `ConnectionsPage` |

---

## Consequences

**Positive**
- Operators can build complex cross-integration workflows without writing code
- Rule evaluation is non-blocking — a slow or failing webhook cannot delay message processing
- The dry-run endpoint enables safe rule testing before enabling in production
- Match statistics (`match_count`, `last_matched_at`) give operators observability into which rules are firing

**Negative / Trade-offs**
- `listEnabled()` fetches all rules on every inbound message; at very high rule counts (>1000) this will need caching
- Rules are applied in order; no short-circuit mechanism (first-match-wins) — all matching rules fire
- The `personality` action requires an `onPersonalityOverride` callback; the per-message personality override is not yet persisted to the active session state (future work)
- Regex patterns are not validated at creation time; invalid patterns fall back to substring matching silently

---

## Alternatives Considered

| Option | Why rejected |
|--------|-------------|
| Hardcoded forwarding per-integration | Not maintainable; doesn't scale to N integrations |
| Full workflow engine (n8n-style) | Too complex for v1; routing rules cover 90% of use cases |
| Evaluate rules synchronously (blocking) | Risk: a slow webhook blocks the message pipeline |
| Per-rule WebSocket trigger | Out of scope for v1; covered by `notify` action |
