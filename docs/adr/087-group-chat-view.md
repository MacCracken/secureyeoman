# ADR 087 — Group Chat View

**Status**: Accepted
**Date**: 2026-02-21
**Phase**: 33

---

## Context

SecureYeoman connects to many messaging platforms simultaneously (Telegram, Slack, Discord, WhatsApp, Teams, Twitter/X, Signal, …). Before this phase, each integration was isolated — operators could see integration health in the Connections view, but there was no unified surface for reading conversations across integrations or sending replies.

Real-world usage of multi-integration deployments surfaced a clear pain point: operators had to switch between separate platform apps to monitor and respond to messages. A unified group-chat-style view was the logical solution, mirroring familiar UX patterns from Slack and Discord.

---

## Decision

Implement a **Group Chat View** as a standalone page (`/group-chat`) with three panes:

1. **Channel list** — sorted by most recent activity; one row per `(integrationId, chatId)` pair
2. **Message thread** — paginated message history for the selected channel, newest-first, then reversed for display
3. **Reply box** — free-text input; sends via the existing `IntegrationManager.sendMessage()` pipeline

### Data model

Rather than introducing a new database table, the group-chat view is a **read projection over the existing `messages` table** with an added `personality_id` column (migration 030). A channel is defined as a unique `(integration_id, chat_id)` pair that has at least one message. This keeps storage simple and avoids duplication.

New `group_chat_pins` table added for future pinned-message support (schema-only, not yet surfaced in UI).

### Architecture

| Layer | Component | Notes |
|-------|-----------|-------|
| Storage | `GroupChatStorage` (extends `PgBaseStorage`) | `listChannels()` + `listMessages()` |
| API | `GET/POST /api/v1/group-chat/channels[/:integrationId/:chatId/messages]` | Registered in `GatewayServer` |
| Dashboard | `GroupChatPage.tsx` | Lazy-loaded; added to `DashboardLayout` and `Sidebar` |
| WebSocket | `group_chat` channel | Permission: `integrations:read` |

Personality name resolution is done via a secondary `SELECT` from `soul.personalities` — no JOIN that could break if the soul schema changes.

### Real-time updates

The channel list and message thread both use `refetchInterval` via React Query (15s and 5s respectively). WebSocket push is wired via the `group_chat` channel for future use; current polling is sufficient for initial release.

---

## Consequences

**Positive**
- Operators can monitor and respond to all connected integrations from one screen
- Zero new schema complexity for the core message path
- Reply pipeline reuses the hardened `IntegrationManager.sendMessage()` path

**Negative / Trade-offs**
- Read scalability: `listChannels()` uses a `GROUP BY` with correlated subqueries; will need an index-backed materialised view at very high message volumes
- No real-time push yet — polling is acceptable for now but will need to be replaced with WS events before mobile app ships
- Threads, reactions, and pinned messages were explicitly deferred (see Future Features)

---

## Alternatives Considered

| Option | Why rejected |
|--------|-------------|
| New `channels` table | Duplication; existing `messages` table already contains all needed data |
| WS-only (no REST) | REST is simpler to test and cache; WS can be added later |
| Platform-native embeds | Not feasible — each platform has different embedding constraints |

---

## Amendment 1 — Schema-qualification bug fix (2026-02-21)

**Problem:** `030_group_chat.sql` and `GroupChatStorage` referenced bare table names `messages` and `integrations` without the `integration.` schema prefix. PostgreSQL's default `search_path` (`"$user", public`) does not include the `integration` schema, so migration 030 threw `relation "messages" does not exist` on any fresh database, blocking cold-start entirely.

**Fix:**
- `packages/core/src/storage/migrations/030_group_chat.sql` — all references updated to `integration.messages`, `integration.integrations`, and `integration.group_chat_pins`
- `packages/core/src/integrations/group-chat-storage.ts` — all five SQL query strings updated to use `integration.messages` and `integration.integrations`

**Test coverage added:** `packages/core/src/integrations/group-chat-storage.test.ts` — assertions that every generated SQL string contains `integration.messages` / `integration.integrations`, plus full functional coverage of `listChannels()` and `listMessages()`.
