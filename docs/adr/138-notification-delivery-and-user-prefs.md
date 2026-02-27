# ADR 138: Notification Delivery and Per-User Preferences

**Status:** Accepted
**Date:** 2026-02-26
**Phase:** 55 — Notifications & Integrations

---

## Context

Phase 51 wired the in-app notification system (DB persistence + WebSocket broadcast). External dispatch
was stubbed with `console.log` in `heartbeat.ts` pending an IntegrationManager interface audit. That
audit is complete — every platform adapter already exposes a stable
`sendMessage(chatId, text, metadata?)` API.

Two gaps remained:

1. **Real external dispatch** — heartbeat `notify` actions logged intent but never actually dispatched
   to Slack, Telegram, Discord, or email adapters.
2. **Per-user routing** — all notifications went to a single system-configured channel. Users needed
   fine-grained control over which platforms they receive alerts on, at what severity threshold, and
   during which hours.

---

## Decision

### A — Real External Dispatch

A new `getAdaptersByPlatform(platform)` method was added to `IntegrationManager` that iterates the
running `registry` Map and returns all `Integration` instances whose `config.platform` matches.

`executeNotifyAction()` in `heartbeat.ts` was updated to call real adapters:

- If `config.integrationId` is set → `getAdapter(integrationId)` (specific integration)
- Otherwise → `getAdaptersByPlatform(channel)` (all running adapters for that platform)
- Per-recipient, per-adapter try/catch with warning on failure and audit record
- `metadata: { subject: check.name }` passed for email channel

### B — Two-Tier Dispatch Model

Two dispatch mechanisms coexist:

| Tier | Source | Configuration | Who |
|------|--------|---------------|-----|
| **Admin-configured** | Heartbeat `notify` action config | YAML / dashboard heartbeat config | System-level alerts |
| **User-preference fan-out** | `NotificationManager._fanout()` | `/api/v1/users/me/notification-prefs` | Per-user external alerts |

The admin tier fires when a heartbeat check triggers a `notify` action. The user-preference tier
fires on *every* `notificationManager.notify()` call (including the one inside `executeNotifyAction`
itself), routing to each user's preferred external channels.

### C — Per-User Notification Preferences

A new `auth.user_notification_prefs` table (migration 056) stores per-user delivery preferences:

- `channel` — `slack`, `telegram`, `discord`, `email`
- `chat_id` — platform-specific identifier (Slack channel ID, Telegram chat ID, email address)
- `integration_id` — optional; if null, the first running adapter for the platform is used
- `enabled` — toggle without deletion
- `min_level` — `info | warn | error | critical` — level threshold filter
- `quiet_hours_start / end` — UTC hour range during which no external dispatch occurs (supports
  overnight wrap-around: `start > end` means the quiet window crosses midnight)

`NotificationManager._fanout()` iterates all enabled prefs, applies level + quiet-hours filters, then
calls `adapter.sendMessage(chatId, body, { subject: title })`.

### D — Retention Cleanup

`NotificationStorage.deleteOlderThan(maxAgeMs)` was added and wired via
`NotificationManager.startCleanupJob(retentionDays)`. The job fires immediately on startup and
repeats every 24 hours. The `notifications.retentionDays` config field (default: 30) controls the
window. The timer is `unref()`'d to not block process shutdown.

---

## Alternatives Considered

**Single dispatch path** — route everything through the user-preference fan-out only.
Rejected: the admin-tier heartbeat dispatch is a system concern (not user-owned) and must work even
when no users have preferences configured.

**Separate notification service** — dedicated microservice for delivery.
Rejected: over-engineered for current scale. The IntegrationManager adapter pattern already provides
the necessary abstraction.

**Per-pref rate limiting** — token-bucket per pref before sendMessage.
Deferred: the IntegrationManager's existing per-integration rate limiter handles platform limits at
the platform level. Per-pref limiting is a future concern if abuse is observed.

---

## Consequences

- **No backwards-incompatible changes** — the WS broadcast and DB notification path are unchanged.
- `notifications.retentionDays: 30` default trims old notifications on every startup.
- Users can self-configure external delivery via `Settings → Notifications` in the dashboard.
- Heartbeat dispatch now calls real adapters. If no adapter is running for a configured channel,
  a warning is logged and the heartbeat result is not affected.
- The user-preference fan-out is fire-and-forget from the caller's perspective — any per-pref
  failure is caught, logged, and does not propagate.
