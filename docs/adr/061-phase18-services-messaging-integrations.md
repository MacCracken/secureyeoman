# ADR 061 — Phase 18: Services & Messaging Integrations

**Status**: Accepted
**Phase**: 18
**Date**: 2026-02-18

---

## Context

Phase 18 includes expanding the integration surface with three categories of new connectors:

1. **Services integrations** — Figma (design), Stripe (payments), Zapier (automation). These platforms have official or well-established MCP server packages, making them ideal candidates for the One-Click MCP Featured Servers system in addition to standard integration adapters.

2. **Messaging integrations** — QQ, DingTalk, and Line. These are widely-used messaging platforms in East Asia and enterprise environments, completing the messaging coverage alongside Telegram, Discord, Slack, WhatsApp, Signal, Teams, and iMessage.

All six platforms were already reserved in the `PlatformSchema` enum (QQ, DingTalk, Line added in this ADR). The implementation follows the established adapter pattern (ADR 005, ADR 034) and the One-Click MCP pattern (ADR 026, ADR 046).

---

## Decision

### Services Integrations (Figma, Stripe, Zapier)

Each platform gets **both** an integration adapter **and** a Featured MCP Server entry:

| Platform | Adapter Type | MCP Package | Auth |
|----------|-------------|-------------|------|
| Figma | Polling (REST) | `figma-developer-mcp` | Personal Access Token |
| Stripe | Webhook | `@stripe/mcp-server-stripe` | Secret Key + Webhook Signing Secret |
| Zapier | Webhook (bidirectional) | `@zapier/mcp-server` | Optional HMAC secret + Catch-hook URL |

**Figma** — polls `GET /v1/files/:fileKey/comments` at a configurable interval; new unresolved comments are dispatched as `UnifiedMessage`; `sendMessage()` posts a comment via `POST /v1/files/:fileKey/comments`. `testConnection()` calls `GET /v1/me`.

**Stripe** — implements `WebhookIntegration`; verifies Stripe's `t=<ts>,v1=<sig>` HMAC-SHA256 signature format; handles `payment_intent.succeeded/failed`, `customer.created/deleted`, `invoice.paid/payment_failed`; `sendMessage()` is a no-op (event-source only). `testConnection()` calls `GET /v1/account`.

**Zapier** — implements `WebhookIntegration`; receives any Zap trigger payload inbound; `sendMessage()` POSTs to a configured catch-hook URL outbound; optional HMAC verification. `testConnection()` validates outbound URL if configured.

### Productivity Integrations (Linear)

| Platform | Adapter Type | Protocol | Auth |
|----------|-------------|----------|------|
| Linear | Webhook | Linear Webhooks API + GraphQL | Personal API Key + optional Webhook Signing Secret |

**Linear** — receives `Issue` and `Comment` events from Linear webhooks; HMAC-SHA256 signature verification using the webhook signing secret (optional — events accepted unsigned if no secret configured); `sendMessage()` creates a new issue in the configured team via the Linear GraphQL API (`issueCreate` mutation); `testConnection()` queries `viewer { id name organization { name } }`. Also ships as an MCP Featured Server (`@linear/mcp-server`) for agent tool access to issues, projects, and cycles.

---

### Messaging Integrations (QQ, DingTalk, Line)

| Platform | Adapter Type | Protocol | Auth |
|----------|-------------|----------|------|
| QQ | Polling + OneBot v11 HTTP push | CQ-HTTP / go-cqhttp | HTTP URL + optional access token |
| DingTalk | Webhook (inbound + outbound) | DingTalk Custom Robot | Robot webhook URL + optional HMAC token |
| Line | Webhook | Line Messaging API | Channel Secret + Channel Access Token |

**QQ** — targets a running CQ-HTTP/go-cqhttp instance; sends via `POST /send_private_msg` and `POST /send_group_msg`; inbound events delivered via OneBot v11 HTTP push to our webhook endpoint; `testConnection()` calls `GET /get_login_info`.

**DingTalk** — receives events from a DingTalk outgoing robot; sends text/markdown messages to the robot's webhook URL or per-event `sessionWebhook`; optional HMAC-SHA256 token verification; `testConnection()` verifies outbound URL configuration.

**Line** — standard Line Messaging API webhook; HMAC-SHA256 base64 signature verification using `channelSecret`; handles message (text/sticker/image), follow, unfollow, join, leave events; supports both reply-token replies (< 30s) and push messages.

---

## Architecture

### New Files

```
packages/core/src/integrations/
  figma/adapter.ts   figma/index.ts
  stripe/adapter.ts  stripe/index.ts
  zapier/adapter.ts  zapier/index.ts
  qq/adapter.ts      qq/index.ts
  dingtalk/adapter.ts dingtalk/index.ts
  line/adapter.ts    line/index.ts
  linear/adapter.ts  linear/index.ts
```

### Modified Files

- `packages/shared/src/types/integration.ts` — `qq`, `dingtalk`, `line` added to `PlatformSchema` (linear was pre-existing)
- `packages/core/src/integrations/types.ts` — rate limits added for all 7 platforms
- `packages/core/src/secureyeoman.ts` — 7 new `registerPlatform()` calls
- `packages/dashboard/src/components/ConnectionsPage.tsx` — 7 new `PLATFORM_META` entries; `figma`, `stripe`, `zapier` added to `DEVOPS_PLATFORMS`; `linear` added to `PRODUCTIVITY_PLATFORMS`; `Figma`, `CreditCard`, `Zap`, `Building2`, `LayoutGrid` imported from lucide-react
- `packages/dashboard/src/components/McpPrebuilts.tsx` — Figma, Stripe, Zapier, Linear added to `PREBUILT_SERVERS`

### Platform Categorization (Dashboard)

- **DevOps & Services tab**: figma, stripe, zapier (alongside github, gitlab, jira, aws, azure)
- **DevOps & Services tab (productivity)**: linear (alongside notion, via `PRODUCTIVITY_PLATFORMS`)
- **Messaging tab**: qq, dingtalk, line (catch-all, same as telegram, discord, slack, etc.)

---

## Consequences

### Positive

- Figma, Stripe, Zapier, and Linear benefit from both the integration adapter (direct event handling) and the MCP One-Click path (agent tool access via MCP tools), giving operators two ways to connect each service.
- Linear's optional webhook secret means operators can start receiving events immediately without a signing secret, then add one later to harden security.
- Line's `channelSecret`-based HMAC verification matches the Line Messaging API spec exactly.
- QQ's OneBot v11 protocol support enables connection to any compatible gateway (go-cqhttp, Lagrange, etc.) without vendor lock-in.
- DingTalk's `sessionWebhook` routing allows contextual replies within the originating conversation.

### Negative / Risks

- QQ's full message delivery requires an external CQ-HTTP gateway process; the adapter cannot operate standalone.
- Stripe's `sendMessage()` is intentionally a no-op — operators who need to send Stripe API calls should use the Stripe MCP server instead.
- Line reply tokens expire after 30 seconds; push messages should be used for delayed responses.

### Neutral

- All 6 adapters follow the established Integration/WebhookIntegration interface — no new patterns introduced.
- No new npm dependencies required (all adapters use native `fetch` and Node.js `crypto`).
