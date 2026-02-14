# ADR 025: CLI, Webhook, and Google Chat Integration Completion

**Status**: Implemented
**Date**: 2026-02-13
**Version**: 1.3.4

## Context

The integration framework (Phase 4) established the `Integration` interface, `IntegrationManager`, and adapter pattern with four stable platform adapters (Telegram, Discord, Slack, GitHub) and two beta adapters (Google Chat, iMessage). Three platform types defined in the `PlatformSchema` — `cli`, `webhook`, and `googlechat` — had frontend metadata in the dashboard `ConnectionManager` but were either missing backend adapters or not registered with the `IntegrationManager`:

- **Google Chat** — Adapter existed (`googlechat/adapter.ts`) but was never imported or registered in `secureyeoman.ts`, causing it to show as "Coming Soon" on the dashboard
- **CLI** — No adapter existed; the built-in REST API / CLI interface had no dashboard presence
- **Webhook** — No adapter existed; no generic HTTP webhook inbound/outbound capability

## Decision

### 1. Register Google Chat Adapter

Import and register the existing `GoogleChatIntegration` in `secureyeoman.ts`. No adapter code changes needed — the adapter was already complete with `init()`, `start()`, `stop()`, `sendMessage()`, and `isHealthy()` implementations. Promoted from Beta to Stable.

### 2. CLI Adapter (New)

Create a lightweight passthrough adapter (`cli/adapter.ts`) that:
- Implements the `Integration` interface with `platform: 'cli'`
- `sendMessage()` is a no-op (returns empty string) since CLI consumers read responses via the REST API directly
- Exists primarily so the CLI shows as "Connected" on the dashboard Connections page
- Rate limit: 100 msg/s (effectively unlimited for local use)

### 3. Generic Webhook Adapter (New)

Create a full-featured webhook adapter (`webhook/adapter.ts`) that:
- Implements `WebhookIntegration` (extends `Integration` with webhook methods)
- **Outbound**: POSTs JSON payloads to a configurable `webhookUrl` with optional HMAC-SHA256 signing via `X-Webhook-Signature` header
- **Inbound**: `handleInbound()` normalizes arbitrary JSON payloads to `UnifiedMessage` format
- **Signature verification**: `verifyWebhook()` uses timing-safe comparison of HMAC-SHA256 signatures; skips verification when no secret is configured
- Rate limit: 30 msg/s

### 4. Inbound Webhook Route

Add `POST /api/v1/webhooks/custom/:id` route to `integration-routes.ts`:
- Validates the integration exists and is platform `webhook`
- Retrieves the running adapter via new `IntegrationManager.getAdapter()` method
- Verifies signature if configured
- Calls `adapter.handleInbound()` to normalize and route the message

### 5. IntegrationManager.getAdapter()

Add a public method to expose running adapter instances. Required by the webhook route to call platform-specific methods (`verifyWebhook`, `handleInbound`) not on the base `Integration` interface.

### 6. Dashboard Cleanup

- Remove dead `helpUrl` links from all platform metadata (docs are not served by the dashboard, so these were broken external links)
- Sort Available Platforms and Configured Integrations alphabetically by display name

## Consequences

- All 8 platforms defined in `PlatformSchema` now have registered adapters and appear as "Available" with Connect buttons on the dashboard
- Google Chat promoted from Beta to Stable
- External services can now push data into FRIDAY via the generic webhook endpoint
- The `getAdapter()` method is a narrow API surface; it exposes the raw adapter which could theoretically be misused, but is only called from the trusted route handler
- Removing `helpUrl` means no "Docs" links on platform cards until a documentation serving solution is implemented

## Test Coverage

| Component | Tests |
|-----------|-------|
| CLI adapter | 14 |
| Webhook adapter | 23 |
| Google Chat adapter | 20 |
| IntegrationManager.getAdapter() | 2 |
| **Total new tests** | **59** |

---

**Previous**: [ADR 024: Dashboard Settings Restructuring](./024-dashboard-settings-restructuring.md)
