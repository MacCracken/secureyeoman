# ADR 040: Proactive Assistance (Phase 7.2)

**Status**: Accepted
**Date**: 2026-02-16
**Deciders**: SecureYeoman Core Team

---

## Context

SecureYeoman currently operates in a purely reactive mode — it responds when a user sends a message, executes a task on demand, or fires a scheduled heartbeat check. There is no mechanism for SecureYeoman to initiate contact, surface timely insights, or act on observed patterns without being explicitly asked.

As SecureYeoman accumulates knowledge about the user (Phase 7.1 Adaptive Learning — preferences, behavioral patterns, interaction history), a natural next step is to leverage that knowledge proactively. Users should not have to remember to ask SecureYeoman for a daily standup summary, a weekly review, or a heads-up about a deadline — SecureYeoman should anticipate these needs and surface them through the appropriate channel at the right time.

The challenge is providing this capability without making SecureYeoman intrusive, without creating a security surface for unauthorized agent-initiated actions, and without duplicating infrastructure already present in HeartbeatManager, ExtensionManager, BrainManager, and IntegrationManager.

---

## Decision

Introduce a **ProactiveManager** module under `packages/core/src/proactive/` that provides a general-purpose trigger and suggestion engine. ProactiveManager is the single coordination layer for all proactive behavior in SecureYeoman.

### Trigger Types

ProactiveManager supports five trigger types:

| Type | Description |
|------|-------------|
| `schedule` | Cron-based or interval-based time triggers (e.g., daily at 09:00) |
| `event` | React to internal SecureYeoman events emitted by ExtensionManager hooks (e.g., `task_completed`, `memory_save_after`) |
| `pattern` | Fire when BrainManager detects a recurring behavioral pattern meeting a threshold |
| `webhook` | External HTTP POST to a dedicated proactive webhook endpoint activates a trigger |
| `llm` | An LLM prompt is evaluated on a schedule; the trigger fires only when the model returns affirmative |

### Core Design

**ProactiveManager** owns:
- A trigger registry backed by PostgreSQL via `PgBaseStorage` (consistent with other persistent subsystems)
- A suggestion queue for storing generated suggestions before delivery
- A pattern store for recording LLM-identified behavioral patterns from Brain memories
- Scheduling via the unified HeartbeatManager infrastructure (reuses existing scheduler, avoids a second cron system)
- Delivery via IntegrationManager (sends to all connected platforms) or WebSocket push to dashboard
- Extension hook emission so that `proactive_trigger_fired` and `proactive_suggestion_created` events are observable by extensions

**Built-in Triggers** (5 pre-registered, disabled by default):
1. `daily-standup` — Schedule trigger, 09:00 local time on weekdays, generates a task/meeting summary
2. `weekly-review` — Schedule trigger, Friday 17:00, summarizes the week's activity from Brain memories
3. `idle-check-in` — Event trigger on inactivity pattern, suggests re-engagement after configurable quiet period
4. `memory-insight` — Pattern trigger, surfaces knowledge patterns detected in recent Brain activity
5. `webhook-alert` — Webhook trigger, template for external system integration

### Security Gate

All proactive behavior requires the `allowProactive` flag in `SecurityConfigSchema` to be `true` (default: `false`). When `allowProactive` is `false`:
- All proactive trigger scheduling is suspended
- Incoming webhook trigger endpoints return 403
- The Security Policy API exposes and accepts the `allowProactive` field
- Changes are audited in the cryptographic audit chain

This follows the same pattern established for `allowSubAgents`, `allowA2A`, `allowExtensions`, and `allowExecution`.

### Suggestion Queue

When a trigger fires, ProactiveManager does not immediately send a message. Instead, it:
1. Uses BrainManager + the active personality to compose a suggestion via an LLM call
2. Writes the suggestion to the suggestion queue with status `pending`
3. Pushes the suggestion to the dashboard via WebSocket (`proactive:suggestion` channel)
4. If the trigger's `autoSend` flag is `true` and a delivery integration is configured, immediately delivers via IntegrationManager

Suggestions expire after a configurable TTL (default: 24 hours). Expired suggestions are cleared by a maintenance endpoint.

### Storage

Proactive data is stored in PostgreSQL using `PgBaseStorage`:
- `proactive_triggers` — trigger definitions and scheduling config
- `proactive_suggestions` — suggestion queue with status tracking
- `proactive_patterns` — detected behavioral patterns from Brain analysis

This is consistent with the existing use of PostgreSQL for RBAC and other persistent configuration.

### Pattern Learning

ProactiveManager periodically queries BrainManager for recent episodic and preference memories. An LLM call analyzes the memories to identify recurring patterns (e.g., "user asks for deployment help every Monday morning"). Detected patterns are:
- Stored in `proactive_patterns` with confidence scores
- Surfaced in the dashboard for user review
- Convertible to triggers via the `POST /api/v1/proactive/patterns/:id/convert` endpoint

### Dashboard UI

A dedicated Proactive Assistance page in the dashboard provides:
- Trigger management (create, enable, disable, test, delete)
- Built-in trigger cards with one-click enable
- Suggestion queue with approve/dismiss actions
- Pattern explorer showing detected behavioral patterns with confidence scores
- Status panel showing ProactiveManager health and last-fire timestamps

---

## Alternatives Considered

### Alternative: Extend HeartbeatManager directly

HeartbeatManager is purpose-built for health/maintenance tasks. Extending it with conditional LLM-driven delivery, suggestion queuing, and external webhook receipt would overload a component whose scope is intentionally narrow. A separate manager preserves separation of concerns.

### Alternative: Implement as an Extension

Extensions (Phase 6.4a) run synchronously in the hook lifecycle and are not designed for long-running scheduled background behavior. An extension cannot register persistent triggers, manage a suggestion queue, or receive external webhooks. Extensions can observe proactive events but cannot implement the proactive system itself.

### Alternative: Use a dedicated task queue for all triggers

All trigger types could be modeled as Tasks in the existing task queue. However, this would pollute the task history with internal scheduling noise, complicate filtering, and require changes to TaskStorage to support trigger-specific metadata. A dedicated storage model is cleaner.

---

## Consequences

### Positive

- SecureYeoman gains initiative — can surface timely, context-aware suggestions without user prompting
- Built-in trigger templates reduce configuration friction for common patterns
- Security gate (`allowProactive`) ensures the feature is opt-in and audited
- Reuses existing infrastructure: HeartbeatManager scheduling, ExtensionManager hooks, IntegrationManager delivery, BrainManager pattern queries, WebSocket push
- Dashboard provides full visibility and control over proactive behavior
- Pattern learning closes the loop between Adaptive Learning (7.1) and Proactive Assistance (7.2)

### Negative

- Adds a new persistent storage schema (3 new tables in PostgreSQL)
- LLM-based trigger evaluation (`llm` type) incurs token costs on a schedule — users must be aware of potential costs
- Incorrect trigger configuration could lead to spammy notifications; documentation and sensible defaults are important

### Migration Path

- `allowProactive` defaults to `false` — existing deployments are unaffected until the user explicitly enables the feature
- Built-in triggers are pre-registered but disabled by default — no immediate behavior change on upgrade
- The `proactive_*` tables are created by schema migration on startup if they do not exist
- No changes to existing API endpoints; all proactive endpoints are additive under `/api/v1/proactive/`

---

## Related ADRs

- [ADR 035 — Lifecycle Extension Hooks](035-lifecycle-extension-hooks.md): Extension hook system that ProactiveManager emits events into
- [ADR 031 — Vector Semantic Memory](031-vector-semantic-memory.md): BrainManager vector search used for pattern detection
- [ADR 037 — A2A Protocol](037-a2a-protocol.md): Security policy pattern that `allowProactive` follows
