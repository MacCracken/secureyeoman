# ADR 052 — Outbound Webhooks

**Status**: Accepted
**Date**: 2026-02-18
**Phase**: 15 — Integration Architecture Improvements

---

## Context

SecureYeoman supports inbound webhooks (external systems pushing events *in*) but had no mechanism
for pushing events *out* to external systems when integration activity occurred.  Users wanting to
react to agent activity (message received, integration started/stopped, errors) had to poll the
REST API.

Problems:
1. No event-driven notification when messages are received or integrations change state.
2. External automation tools (Zapier, n8n, custom pipelines) have no way to subscribe to
   SecureYeoman activity.
3. Monitoring and alerting integrations require polling rather than push.

---

## Decision

### 1. `outbound_webhooks` PostgreSQL Table (migration 014)

A new table stores subscriptions:

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v7 |
| `name` | TEXT | Human-readable name |
| `url` | TEXT | Target callback URL |
| `secret` | TEXT nullable | HMAC-SHA256 signing secret |
| `events` | JSONB | Subscribed event type array |
| `enabled` | BOOLEAN default true | Toggle without deleting |
| `last_fired_at` | BIGINT nullable | Unix ms of last successful delivery |
| `last_status_code` | INTEGER nullable | HTTP status from last delivery attempt |
| `consecutive_failures` | INTEGER default 0 | Incremented on failure, reset on success |
| `created_at` / `updated_at` | BIGINT | Unix ms |

### 2. Event Types

| Event | Fired when |
|-------|-----------|
| `message.inbound` | A `UnifiedMessage` is received by any integration |
| `message.outbound` | A message is sent via `IntegrationManager.sendMessage()` |
| `integration.started` | An adapter starts successfully |
| `integration.stopped` | An adapter is stopped |
| `integration.error` | An adapter fails to start |

### 3. `OutboundWebhookStorage`

Standard CRUD class (`integrations/outbound-webhook-storage.ts`):

- `createWebhook()`, `getWebhook()`, `listWebhooks()`, `updateWebhook()`, `deleteWebhook()`
- `listForEvent(event)` — returns enabled webhooks whose `events` JSONB array contains the
  given event string; uses PostgreSQL `@>` operator for containment check
- `recordSuccess(id, statusCode)` — updates `last_fired_at`, `last_status_code`, resets
  `consecutive_failures` to 0
- `recordFailure(id, statusCode)` — increments `consecutive_failures`

### 4. `OutboundWebhookDispatcher`

`integrations/outbound-webhook-dispatcher.ts`:

- `dispatch(event, data)` — **fire-and-forget**: returns immediately, delivers in background
- Fetches matching webhooks via `storage.listForEvent(event)`
- For each webhook: POSTs `{ event, timestamp, data }` as JSON
- Includes `X-SecureYeoman-Event` header on every request
- Includes `X-Webhook-Signature: sha256=<hmac>` when a `secret` is configured
- Retries with exponential backoff up to `maxRetries` (default: 3, base delay: 1 s)
- On success: calls `recordSuccess()`; on all retries exhausted: calls `recordFailure()`

### 5. Wiring

**`IntegrationManager`**:
- New `outboundWebhookDispatcher` private field; set via `setOutboundWebhookDispatcher()`
- Fires `integration.started` after `integration.start()` succeeds
- Fires `integration.error` when `integration.init()` or `integration.start()` throws
- Fires `integration.stopped` after `integration.stop()` completes
- Fires `message.outbound` after `sendMessage()` stores the outbound record

**`MessageRouter`**:
- New optional `outboundWebhookDispatcher` dep; set via `setOutboundWebhookDispatcher()`
- Fires `message.inbound` at the top of `handleInbound()` (before storage/task execution)

**`GatewayServer`**:
- Creates `OutboundWebhookStorage` and `OutboundWebhookDispatcher` alongside existing stores
- Calls `integrationManager.setOutboundWebhookDispatcher()` and
  `messageRouter?.setOutboundWebhookDispatcher()` so both lifecycle and message events are covered
- Passes `outboundWebhookStorage` to `registerIntegrationRoutes()`

**`SecureYeoman`**:
- New `getMessageRouter()` accessor exposes the `MessageRouter` instance to the gateway server

### 6. REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/outbound-webhooks` | List subscriptions (filter: `enabled`) |
| `GET` | `/api/v1/outbound-webhooks/:id` | Get a subscription |
| `POST` | `/api/v1/outbound-webhooks` | Create a subscription |
| `PUT` | `/api/v1/outbound-webhooks/:id` | Update a subscription |
| `DELETE` | `/api/v1/outbound-webhooks/:id` | Delete a subscription |

---

## Consequences

### Positive

- **Event-driven external integrations** — tools like n8n, Zapier, or custom services can
  subscribe to SecureYeoman activity without polling.
- **Fire-and-forget delivery** — the agent's response latency is unaffected by slow webhook
  consumers.
- **Retry with backoff** — transient failures are handled automatically; persistent failures
  are tracked via `consecutive_failures`.
- **HMAC signing** — consumers can verify payload authenticity if a `secret` is configured.
- **Audit trail** — `last_fired_at`, `last_status_code`, and `consecutive_failures` give
  operators visibility into delivery health without a separate log table.

### Negative / Trade-offs

- **Fire-and-forget** — delivery failures do not surface to the API caller. Consumers must
  monitor the `consecutive_failures` field or implement their own dead-letter queue.
- **No delivery log** — individual delivery attempts are not persisted; only the latest
  status is stored. A full delivery log is a future enhancement.
- **In-process retries** — if the process restarts mid-retry, the retry is lost. A persistent
  job queue (e.g. BullMQ/Redis) would survive restarts; deferred pending need validation.

---

## Alternatives Considered

- **Persistent job queue (BullMQ/Redis)** — guarantees at-least-once delivery across restarts.
  Deferred: adds Redis dependency; in-process retries cover most use cases.
- **Server-Sent Events push** — considered for dashboard notification. Separate concern;
  outbound webhooks target external systems, not dashboard clients.
- **Extension hook point** — using `multimodal:*` or a new hook point. Rejected: hooks are
  for in-process extensions; webhooks are for external HTTP consumers.
