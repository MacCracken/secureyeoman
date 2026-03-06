# ADR 009: Integrations & Platforms

**Status**: Accepted

## Context

SecureYeoman connects to 32 external platforms spanning messaging, email, calendar, DevOps, productivity, and CI/CD. This ADR consolidates decisions governing the connection architecture, OAuth2 authentication, platform adapters, webhook subsystem, CI/CD integration, and cross-integration routing rules.

## Decisions

### 1. Connection Architecture

**Unified Connections View.** All integrations consolidated into a two-level hierarchy: Integrations (Messaging, Email, Calendar, DevOps, Productivity, OAuth) and MCP (Featured Servers, Registered Servers).

**Dynamic Integration Loading.** Zero-downtime credential rotation via `IntegrationManager.reloadIntegration(id)` (stop + fetch latest config + start). External plugin support via `INTEGRATION_PLUGIN_DIR` -- plugins export `platform`, `createIntegration`, and optional `configSchema`.

### 2. OAuth2 & Authentication

**OAuth2 First-Class Support.** Dedicated `oauth_tokens` PostgreSQL table with `UNIQUE(provider, email)`. `OAuthTokenService` provides automatic token refresh when within 5 minutes of expiry. Single authentication for all Google services (Gmail, Calendar, Drive share the same token record).

**Authorization Code Flow.** CSRF protection via state parameter (10-minute expiry). Tokens exchanged server-side. Integration storage reused for OAuth connections (platform suffixed with `_oauth`).

### 3. Platform Adapters

**Core Messaging.** All adapters implement the `Integration` interface with platform-native interaction patterns:
- **Telegram** (`grammy`): Inline keyboards, file attachments, reply markup
- **Discord** (`discord.js v14`): Slash commands, modal dialogs, thread awareness
- **Slack** (`@slack/bolt`): Block Kit actions, modal dialogs, Workflow Builder
- **GitHub** (`@octokit/rest`): PR/issue events, auto-labeling, code search, review creation

**Services & Productivity.** Figma (polling), Stripe (webhook with HMAC verification), Zapier (bidirectional webhook), Linear (webhook + GraphQL). All also available as MCP Featured Servers.

**Additional Messaging.** Twitter/X (`twitter-api-v2`, OAuth 1.0a write), QQ (OneBot v11 protocol), DingTalk (Custom Robot webhook), Line (Messaging API with HMAC verification).

**Developer Tools.** Jira (Basic Auth, no SDK), AWS (SigV4 from scratch), Azure DevOps (PAT-based). All use plain `fetch`.

**CLI and Webhook.** CLI adapter as lightweight passthrough. Generic webhook adapter with HMAC-SHA256 signing and timing-safe verification.

### 4. Webhooks

**Transformation Rules.** Configurable JSONPath extraction rules map arbitrary webhook payloads to `UnifiedMessage` fields. Rules stored in PostgreSQL with priority ordering and optional event-type filtering. Template engine with `{{field}}` substitution.

**Outbound Webhooks.** Event-driven subscriptions with event type filters. Five event types: `message.inbound`, `message.outbound`, `integration.started`, `integration.stopped`, `integration.error`. Fire-and-forget delivery with exponential backoff retry (up to 3 attempts). Optional HMAC-SHA256 signing.

### 5. CI/CD Integration

**Bidirectional.** Outbound: 21 MCP tools across GitHub Actions, Jenkins, GitLab CI, Northflank. Inbound: webhook endpoint with platform-specific HMAC verification, canonical `CiEvent` normalization, workflow dispatch. Two workflow step types: `ci_trigger` and `ci_wait`. Four built-in templates.

### 6. Routing Rules

**Cross-Integration Routing.** Priority-ordered evaluation engine running after message storage, before task executor. Four action types: `forward` (relay to different integration/chat), `reply` (same conversation, different integration), `personality` (override personality), `notify` (webhook POST). All matching rules fire (no short-circuit). Dry-run endpoint for testing.

## Consequences

**Positive:**
- 32 platform integrations from a single unified interface.
- Zero-downtime credential rotation without restarting other integrations.
- Cross-integration routing enables complex workflows without code.
- Webhook transformation handles arbitrary payload schemas.
- Single OAuth token serves all Google services.

**Negative:**
- Plugin loading accepts arbitrary file paths; restricted to admin roles.
- OAuth tokens stored in plain text (matching existing security posture).
- Outbound webhook delivery failures are fire-and-forget; no persistent job queue.
- All routing rules evaluated on every message; caching needed at high rule counts.
