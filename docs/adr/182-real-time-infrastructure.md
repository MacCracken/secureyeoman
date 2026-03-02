# ADR 182: Real-Time Infrastructure — Phase 51

**Date:** 2026-02-25
**Status:** Accepted
**Deciders:** Engineering

---

## Context

SecureYeoman's dashboard polled REST endpoints every 5–10 seconds for updates. Heartbeat
`notify` actions (Slack/Email/Discord/Telegram) were `logger.info()` stubs with no persistent
storage. When a heartbeat check fired an alert, nothing visible happened in the UI — the alert
was discarded after the log message.

`@fastify/websocket` was already installed and running on `/ws/metrics` with channel-based RBAC
subscriptions, `broadcast()`, and 7 pre-defined but dormant channels including `notifications`.
The infrastructure needed to be wired end-to-end.

---

## Decision

### Persistent notification model

A `notifications` table stores server-generated alerts. Rows contain:
- `id` (TEXT, UUIDv7)
- `type`, `title`, `body`, `level` (info/warn/error/critical)
- `source` (which subsystem generated the alert)
- `metadata` (JSONB, optional)
- `read_at` (BIGINT, null = unread)
- `created_at` (BIGINT epoch ms)

### Three-layer architecture

```
Event Source (heartbeat / future: task / audit)
  → NotificationManager.notify()
    → NotificationStorage.create()     (persist to PostgreSQL)
    → gateway.broadcast('notifications', { notification })  (push to WS clients)
  → HeartbeatManager (also calls IntegrationManager for Slack/Discord/email)
```

### REST API

Five endpoints at `/api/v1/notifications`:

| Method   | Path              | Description                          |
|----------|-------------------|--------------------------------------|
| GET      | `/`               | List notifications (paginated)       |
| GET      | `/count`          | Lightweight unread count             |
| POST     | `/:id/read`       | Mark single notification read        |
| POST     | `/read-all`       | Mark all read                        |
| DELETE   | `/:id`            | Delete notification                  |

### WebSocket channel

A new `notifications` channel was added to `CHANNEL_PERMISSIONS` in `gateway/server.ts`.
When `NotificationManager.notify()` is called, the persisted row is broadcast immediately
to all clients subscribed to the channel.

The broadcast callback is wired at gateway startup (after the gateway is fully constructed)
via `notificationManager.setBroadcast()`. This avoids a circular dependency between the
SecureYeoman init phase and the gateway.

### Dashboard bell (additive upgrade)

`NotificationBell.tsx` was upgraded to support both notification origins:

1. **Local (localStorage-backed)** — existing behavior preserved. Security and task WS events
   continue to be captured and displayed as before.
2. **Server (DB-backed)** — new. When a `notifications` channel WS message arrives, the
   notification is added to the display list. `markRead` and `delete` call the REST API.

The component subscribes to the `notifications` channel on mount via `subscribe(['notifications'])`.

### Heartbeat wiring

`HeartbeatManager.executeNotifyAction()` was updated to call
`notificationManager?.notify(...)` unconditionally before routing to integration channels
(Slack, Discord, etc.). External delivery stubs remain pending an IntegrationManager interface
audit.

---

## Alternatives Considered

### Server-Sent Events (SSE) instead of WebSocket

Rejected. WebSocket is already running and proven. Adding a parallel SSE infrastructure
would duplicate connection management for no benefit in this context.

### Separate notification service

Rejected. The notification model is lightweight and co-located with other storage classes.
A separate service introduces operational complexity without benefit at current scale.

### Client-side-only notifications (expand existing bell)

Rejected. Notifications need to survive page reloads and be queryable via REST for
automation (e.g., CI status checks, external monitors).

---

## Consequences

- Migration 047 must run before the service starts. The `notifications` table has two indexes:
  one on `created_at DESC` (list queries) and one partial index on unread rows (`read_at IS NULL`).
- The `NotificationManager.setBroadcast()` call in `gateway/server.ts` is the only point where
  the gateway lifecycle interleaves with the notification subsystem.
- External delivery (Slack/Discord/email/Telegram) via `IntegrationManager` is out of scope
  for Phase 51 and will be addressed after the integration dispatch API is stabilised.
- Per-user notification preferences and a retention/cleanup job are deferred to a future phase.
