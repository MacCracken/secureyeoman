# ADR 051 — Webhook Transformation Rules

**Status**: Accepted
**Date**: 2026-02-18
**Phase**: 15 — Integration Architecture Improvements

---

## Context

SecureYeoman's inbound webhook handler for the generic `webhook` platform converts a raw HTTP
body into a `UnifiedMessage` using a fixed mapping:

```typescript
text     = String(body.text ?? '')
senderId = String(body.senderId ?? 'external')
chatId   = String(body.chatId ?? 'default')
```

This works for webhook senders that structure their payloads exactly as `UnifiedMessage` expects.
Real-world webhook providers (GitHub, Stripe, PagerDuty, custom services) use their own schemas.
Previously, users had to write a custom adapter or pre-process the payload externally.

Problems:
1. No way to map arbitrary JSON fields to `UnifiedMessage` fields without code changes.
2. No mechanism to filter or reshape payloads based on event type.
3. Users with multiple webhook integrations needed separate adapters for each schema variant.

---

## Decision

### 1. `webhook_transform_rules` PostgreSQL Table (migration 013)

A new table stores ordered extraction rules per integration (or globally):

| Column | Type | Description |
|--------|------|-------------|
| `id` | TEXT PK | UUID v7 |
| `integration_id` | TEXT nullable | Target integration; NULL = applies to all |
| `name` | TEXT | Human-readable rule name |
| `match_event` | TEXT nullable | Optional event header filter (e.g. `push`) |
| `priority` | INTEGER default 100 | Applied in ascending order (lower = first) |
| `enabled` | BOOLEAN default true | Toggle without deleting |
| `extract_rules` | JSONB | Array of `ExtractRule` objects |
| `template` | TEXT nullable | `{{field}}` template for the `text` output |
| `created_at` / `updated_at` | BIGINT | Unix ms |

### 2. `WebhookTransformStorage`

Standard CRUD class (`integrations/webhook-transform-storage.ts`):

- `createRule(data)`, `getRule(id)`, `updateRule(id, update)`, `deleteRule(id)`
- `listRules(filter?)` — when `integrationId` is specified, returns rules for that integration
  **plus** global rules (where `integration_id IS NULL`), sorted by `priority ASC`.

### 3. `WebhookTransformer`

`integrations/webhook-transformer.ts` applies matching rules to a raw payload:

1. Fetches enabled rules for `integrationId` (including global rules).
2. Skips rules whose `matchEvent` does not match the `X-Webhook-Event` header value.
3. For each `ExtractRule`, evaluates the JSONPath expression against the payload.
4. Extracted values that match known `UnifiedMessage` fields (`text`, `senderId`, `senderName`,
   `chatId`) are placed directly in the patch; all other extracted fields go into `metadata`.
5. If `template` is set, renders it using `{{fieldName}}` placeholder substitution.
6. Returns a `WebhookPatch` (partial `UnifiedMessage`) that the caller merges over the adapter's
   default normalisation.

**JSONPath subset supported:**
- `$.field` — top-level property
- `$.a.b.c` — nested properties
- `$.arr[0].field` — array index + property

### 4. `WebhookTransformer` wired into `integration-routes.ts`

The `/api/v1/webhooks/custom/:id` handler:
1. Verifies the HMAC signature as before.
2. If `webhookTransformer` is available and transformation rules exist, applies them to the raw
   body, optionally reading the `X-Webhook-Event` request header for event-type matching.
3. Merges the patch into the parsed payload and passes the result to `adapter.handleInbound()`.

`WebhookTransformStorage` is injected as an optional dep into `IntegrationRoutesOptions`.

### 5. REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET` | `/api/v1/webhook-transforms` | List rules (filter: `integrationId`, `enabled`) |
| `GET` | `/api/v1/webhook-transforms/:id` | Get a single rule |
| `POST` | `/api/v1/webhook-transforms` | Create a rule |
| `PUT` | `/api/v1/webhook-transforms/:id` | Update a rule |
| `DELETE` | `/api/v1/webhook-transforms/:id` | Delete a rule |

---

## Example

**Rule definition:**
```json
{
  "name": "GitHub push text",
  "integrationId": "intg_abc123",
  "matchEvent": "push",
  "priority": 10,
  "extractRules": [
    { "field": "text",     "path": "$.head_commit.message" },
    { "field": "senderId", "path": "$.pusher.name", "default": "github-bot" },
    { "field": "repo",     "path": "$.repository.full_name" }
  ],
  "template": "[{{repo}}] {{text}} — by {{senderId}}"
}
```

**Inbound payload (X-Webhook-Event: push):**
```json
{
  "head_commit": { "message": "fix: null pointer" },
  "pusher": { "name": "alice" },
  "repository": { "full_name": "org/myrepo" }
}
```

**Resulting `UnifiedMessage.text`:**
```
[org/myrepo] fix: null pointer — by alice
```

---

## Consequences

### Positive

- **No-code schema mapping** — webhook payloads from any provider can be mapped to
  `UnifiedMessage` fields via simple JSONPath rules in the dashboard.
- **Event-scoped rules** — `matchEvent` allows different rules for `push` vs `pull_request`
  events from the same integration without complex branching.
- **Global rules** — `integration_id = NULL` rules apply to all webhook integrations, enabling
  cross-cutting transforms (e.g. always extract a `correlation_id`).
- **Priority ordering** — multiple rules for the same integration are applied sequentially;
  later rules can override earlier extractions.
- **Zero adapter changes** — existing webhook adapters are unchanged; transforms happen at the
  route boundary.

### Negative / Trade-offs

- **JSONPath subset only** — advanced JSONPath features (filters, recursive descent, wildcards)
  are not supported. Complex transformations still require a custom adapter.
- **No JavaScript expressions** — the template engine supports only `{{field}}` placeholders.
  Conditional or computed values require a rule per scenario.

---

## Alternatives Considered

- **Full JSONPath library** — adding `jsonpath-plus` or `@jsonpath-plus/jsonpath-plus` as a
  dependency. Rejected to avoid an extra dependency; the subset covers ~90% of real use cases.
- **JSONata / Handlebars templates** — richer expression languages. Deferred; can be added to
  `WebhookTransformer` without changing the storage schema.
- **Inline JavaScript evaluation** — rejected on security grounds (arbitrary code execution).
