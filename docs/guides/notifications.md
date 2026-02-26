# Notifications Guide

SecureYeoman provides a persistent in-app notification system that surfaces alerts from the
heartbeat engine, security subsystem, and task engine directly in the dashboard bell.

---

## Overview

Notifications are stored in the PostgreSQL `notifications` table and pushed to connected
dashboard clients over the WebSocket `notifications` channel in real time. The dashboard bell
shows both server-persisted notifications and local WebSocket events (security, task updates).

---

## Notification Levels

| Level      | Use case                                      |
|------------|-----------------------------------------------|
| `info`     | Informational — heartbeat OK, task completed  |
| `warn`     | Degraded — high memory, slow response         |
| `error`    | Failure — check failed, integration down      |
| `critical` | Urgent — emergency stop required              |

---

## How Heartbeat Alerts Work

When a heartbeat check fires a `notify` action, the alert is automatically:

1. **Persisted** to the `notifications` table with `source: 'heartbeat'`.
2. **Broadcast** over the `notifications` WebSocket channel to all connected dashboards.
3. **Logged** via `logger.info('[HEARTBEAT ALERT]', ...)` for observability.

Example heartbeat config that triggers a notification on error:

```yaml
heartbeat:
  enabled: true
  intervalMs: 60000
  checks:
    - name: System Health
      type: system_health
      enabled: true
      actions:
        - condition: on_error
          action: notify
          config:
            channel: console
            messageTemplate: "{{check.name}} failed: {{result.message}}"
```

The `channel` field routes to an external integration (Slack, Discord, email, Telegram) when
`integrationManager` supports it. For now, all channels also persist an in-app notification.

---

## REST API

All endpoints require authentication.

### List notifications

```
GET /api/v1/notifications?unreadOnly=true&limit=20&offset=0
```

Response:
```json
{
  "notifications": [
    {
      "id": "01JXYZ...",
      "type": "heartbeat_alert",
      "title": "System Health",
      "body": "High RSS memory: 640MB (threshold: 512MB). ...",
      "level": "warn",
      "source": "heartbeat",
      "metadata": { "checkType": "system_health", "status": "warning" },
      "readAt": null,
      "createdAt": 1708876800000
    }
  ],
  "total": 42,
  "unreadCount": 7
}
```

### Get unread count

```
GET /api/v1/notifications/count
```

Lightweight endpoint used by the dashboard bell badge (polled every 15 s).

### Mark as read

```
POST /api/v1/notifications/:id/read
```

Returns `{ "ok": true }` on success or `404` if the notification was not found or already read.

### Mark all read

```
POST /api/v1/notifications/read-all
```

Returns `{ "updated": 7 }` with the count of rows updated.

### Delete

```
DELETE /api/v1/notifications/:id
```

Returns `{ "ok": true }` on success.

---

## WebSocket Channel

Subscribe to the `notifications` channel to receive real-time pushes:

```json
{ "type": "subscribe", "payload": { "channels": ["notifications"] } }
```

Messages pushed to the channel have the format:

```json
{
  "type": "update",
  "channel": "notifications",
  "payload": {
    "notification": {
      "id": "01JXYZ...",
      "type": "heartbeat_alert",
      "title": "System Health",
      "body": "High RSS memory: 640MB",
      "level": "warn",
      "source": "heartbeat",
      "readAt": null,
      "createdAt": 1708876800000
    }
  },
  "timestamp": 1708876800001,
  "sequence": 42
}
```

---

## Dashboard Bell

The notification bell in the header (`NotificationBell.tsx`) shows:

- **Server notifications** — heartbeat alerts and other DB-persisted events, received via
  the `notifications` WebSocket channel. `markRead` and `delete` call the REST API.
- **Local notifications** — security events and task completions received via the `security`
  and `tasks` WebSocket channels. Stored in `localStorage` as before.

Both types are merged and sorted by timestamp (newest first). The badge shows the combined
unread count.

---

## Programmatic Usage

From other core subsystems, inject `NotificationManager` and call `notify()`:

```typescript
await notificationManager.notify({
  type: 'my_alert',
  title: 'Something happened',
  body: 'Details about what happened',
  level: 'warn',
  source: 'my-subsystem',
  metadata: { someKey: 'someValue' },
});
```

This persists the row and broadcasts it over WebSocket in a single call.

---

## Database Schema

```sql
CREATE TABLE notifications (
  id          TEXT PRIMARY KEY,
  type        TEXT NOT NULL,
  title       TEXT NOT NULL,
  body        TEXT NOT NULL,
  level       TEXT NOT NULL CHECK (level IN ('info', 'warn', 'error', 'critical')),
  source      TEXT,
  metadata    JSONB,
  read_at     BIGINT,
  created_at  BIGINT NOT NULL
);
```

---

## Out of Scope (Phase 51)

- External delivery via Slack, Discord, email, Telegram — stubs logged, wired in follow-up
- Per-user notification preferences
- Notification retention/cleanup job
- Mobile push notifications
