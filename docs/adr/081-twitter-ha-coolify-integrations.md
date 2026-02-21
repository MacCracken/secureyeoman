# ADR 081 — Twitter/X Integration + Home Assistant & Coolify MCP Prebuilts

**Date**: 2026-02-21
**Status**: Accepted

---

## Context

Real-world agent workflows (documented in community usage) rely heavily on three platforms that SecureYeoman did not previously support:

1. **Twitter/X** — monitoring mentions, posting replies, building morning briefings from timeline content.
2. **Home Assistant** — smart home control (lights, devices, sensors) as part of automation workflows.
3. **Coolify** — self-hosted PaaS management; monitoring services, triggering deploys.

The key question for each was the *integration model*: full native adapter vs. one-click MCP server connection.

---

## Decisions

### Twitter/X — Full Native Integration (Messaging tab)

**Rationale**: Twitter is a bidirectional messaging channel — agents receive mentions (inbound) and post replies (outbound). This matches exactly the `Integration` interface used by Telegram, Discord, and Slack. A full native adapter gives the same unified-message routing, audit trail, and rate-limit throttling as every other messaging platform.

**Implementation**:
- `TwitterIntegration` in `packages/core/src/integrations/twitter/`
- Uses the `twitter-api-v2` npm package (well-maintained, typed, supports both App-only and User context)
- **Read** (mention polling): App-only Bearer Token; polls `GET /2/users/:id/mentions` at a configurable interval (default: 300 s to respect free-tier rate limits)
- **Write** (posting replies): OAuth 1.0a — `apiKey` + `apiKeySecret` + `accessToken` + `accessTokenSecret`; Bearer-only mode silently supports read-only use
- `sinceId` tracking prevents duplicate message delivery across poll cycles
- `platformRateLimit.maxPerSecond = 0.033` (~2/min) applied to outbound `sendMessage()` calls

**API tier note**: Twitter's free tier allows ~1 mention read / 15-min window and 17 posts / 24 h. Users on Basic or higher tiers may reduce `pollIntervalMs`. The platform rate limit field can be tuned in a sub-class or future per-integration config.

---

### Home Assistant — One-Click MCP Prebuilt (streamable-http)

**Rationale**: Home Assistant ships a native MCP server at `/api/mcp` (since HA 2025.2). It uses the Streamable HTTP transport and supports OAuth 2.0 or Long-Lived Access Tokens. There is no npm package to install — the server is already running inside HA.

A full native integration adapter would add no value: HA's MCP server already exposes fine-grained tools (turn on/off entities, query states, run automations) that are richer than anything a bespoke adapter could provide. Connecting via MCP is the correct abstraction.

**Implementation**: Added to `McpPrebuilts.tsx` as a `streamable-http` prebuilt:
- User provides their HA base URL (e.g. `https://homeassistant.local:8123`) and a Long-Lived Access Token
- URL resolved as `{HA_URL}/api/mcp`
- Token stored as `HA_TOKEN` env var alongside the server config

**MCP setup in HA**: Settings → Devices & Services → Add Integration → "Model Context Protocol Server". Entities must be exposed via voice assistant settings to appear as MCP tools.

---

### Coolify — One-Click MCP Prebuilt via MetaMCP (streamable-http)

**Rationale**: Coolify does not ship a dedicated MCP server, but it supports deploying [MetaMCP](https://github.com/metatool-ai/metamcp) — an MCP aggregator that proxies multiple upstream MCP servers behind a single HTTP endpoint with namespace management and middleware.

A native Coolify integration adapter would only surface Coolify API calls. MetaMCP is more flexible: once deployed on Coolify, it can aggregate Coolify's own tooling plus any other MCP servers the user runs there.

**Implementation**: Added to `McpPrebuilts.tsx` as a `streamable-http` prebuilt:
- User provides the MetaMCP endpoint URL (e.g. `https://metamcp.myhost.com/mcp/v1`) and an API key
- The full URL is passed as-is (no suffix appended)
- API key stored as `METAMCP_API_KEY` env var alongside the server config

---

### McpPrebuilts — Transport-Aware Prebuilt Interface

The `PrebuiltServer` interface was extended to support both `stdio` and `streamable-http` transports:

```typescript
interface PrebuiltServer {
  transport?: 'stdio' | 'streamable-http';  // default: 'stdio'
  command?: string;        // stdio: npx command
  urlTemplate?: string;    // streamable-http: {KEY} tokens substituted from env values
  urlKeys?: string[];      // keys rendered as text (URL) inputs instead of password inputs
  requiredEnvVars: { key: string; label: string }[];
}
```

For `streamable-http` prebuilts, `connectMut` resolves the URL template and calls `addMcpServer({ transport: 'streamable-http', url, env })` instead of the `stdio` path.

---

### Obsidian — No Dedicated Integration Needed

Obsidian vaults are plain Markdown files on the filesystem. SecureYeoman's existing MCP filesystem tools (`fs_read`, `fs_write`, `fs_search` — enabled via `MCP_EXPOSE_FILESYSTEM=true`) provide full vault access without any Obsidian-specific adapter. No new integration is required.

---

## Consequences

- `twitter-api-v2` added to `@secureyeoman/core` dependencies
- `'twitter'` added to `PlatformSchema` in `@secureyeoman/shared`
- Twitter appears in the **Messaging** tab of the Connections page (default — not in DEVOPS / EMAIL / PRODUCTIVITY sets)
- Home Assistant and Coolify appear in the **MCP** tab under Featured MCP Servers
- Existing `stdio`-only prebuilt behaviour is unchanged; the extension is backward-compatible
