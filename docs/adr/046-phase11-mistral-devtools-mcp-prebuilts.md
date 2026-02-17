# ADR 046: Phase 11 — Mistral Provider, Developer Tools, MCP Pre-builts, Connections Consolidation

**Status**: Accepted

**Date**: 2026-02-17

---

## Context

Phase 10 (Dashboard UX Enhancements) is complete. SecureYeoman now has a mature dashboard with cost analytics, sub-agent visualization, memory consolidation panels, and audit log enhancements. Phase 11 begins expanding the platform across four workstreams:

1. **Provider Support** — Adding Mistral AI to expand model choice beyond Anthropic, OpenAI, Gemini, Ollama, DeepSeek, and OpenCode Zen.
2. **Developer Tool Integrations** — Native adapters for Jira, AWS, and Azure DevOps to serve engineering teams using SecureYeoman as an AI assistant within their dev workflows.
3. **MCP Pre-built Integrations** — Reducing friction for connecting popular MCP servers by providing a one-click catalog in the dashboard.
4. **Connections Page Consolidation** — The Connections page has accumulated flat tabs that are hard to navigate; restructuring is needed.

---

## Decisions

### 1. Mistral AI Provider

**Decision**: Implement `MistralProvider` using the OpenAI-compatible API at `https://api.mistral.ai/v1`, following the same pattern established for DeepSeek.

**Rationale**:
- Mistral AI exposes an OpenAI-compatible chat completions API, so the implementation cost is minimal — identical to the DeepSeek adapter.
- Reusing the `OpenAICompatibleProvider` base pattern keeps the AI client factory consistent and avoids bespoke SDK dependencies.
- Mistral models (especially `codestral-latest`) offer competitive code generation performance and are a common alternative to OpenAI in European deployments.

**Known models** (registered in static model list):
- `mistral-large-latest`
- `mistral-medium-latest`
- `mistral-small-latest`
- `codestral-latest`
- `open-mistral-nemo`

**Configuration**:
- `MISTRAL_API_KEY` environment variable (required)
- `MISTRAL_BASE_URL` environment variable (optional, defaults to `https://api.mistral.ai/v1`)
- Provider key: `mistral` in `AIProviderConfig`

**Scope**:
- Full streaming support via OpenAI-compatible SSE
- Tool calling support (Mistral function calling API is OpenAI-compatible)
- Included in fallback chain support
- Added to shared types (`AIProvider` union), config schemas (`AIProviderConfigSchema`), and AI client factory

---

### 2. Developer Tool Integrations

**Decision**: Implement native REST API adapters for Jira, AWS, and Azure DevOps without third-party SDK dependencies.

**Rationale**:
- SDK dependencies add significant bundle weight and introduce version compatibility risks.
- All three platforms expose well-documented REST APIs that are sufficient for the integration use cases.
- Keeping integrations dependency-free aligns with the existing pattern (e.g., GitLab, GitHub adapters use plain `fetch`).

#### 2a. Jira Integration

- **Auth**: Basic Auth using `email:apiToken` encoded as Base64 (`Authorization: Basic <base64>`)
- **API**: Atlassian REST API v3 (`https://<domain>.atlassian.net/rest/api/3/`)
- **Capabilities**:
  - Issue retrieval and creation
  - Comment creation on issues
  - Webhook listener for `jira:issue_created`, `jira:issue_updated`, `comment_created` events
  - Webhook secret verification via `X-Hub-Signature` header
- **Config fields**: `domain`, `email`, `apiToken`, `webhookSecret` (optional)
- **Dashboard**: PLATFORM_META entry with setup steps (generate API token at id.atlassian.com)

#### 2b. AWS Integration

- **Auth**: AWS Signature Version 4 (SigV4) — implemented from scratch without the AWS SDK
- **Capabilities**:
  - Lambda function invocation (`POST /2015-03-31/functions/:name/invocations`)
  - STS `GetCallerIdentity` for credential verification
- **Config fields**: `accessKeyId`, `secretAccessKey`, `region`, `sessionToken` (optional for assumed roles)
- **SigV4 implementation**: Canonical request construction, string-to-sign, HMAC-SHA256 signing chain, date/datetime headers
- **Dashboard**: PLATFORM_META entry with setup steps (IAM user with minimal permissions)

#### 2c. Azure DevOps Integration

- **Auth**: PAT (Personal Access Token) encoded as Basic Auth (`Authorization: Basic <base64(':' + pat)>`)
- **API**: Azure DevOps REST API v7.1 (`https://dev.azure.com/<org>/`)
- **Capabilities**:
  - Work item creation and retrieval (PATCH with JSON Patch document)
  - Build listing and triggering
  - Webhook listener for `workitem.created`, `workitem.updated`, `build.complete` events
  - Webhook basic auth verification
- **Config fields**: `organization`, `project`, `personalAccessToken`, `webhookUsername`, `webhookPassword`
- **Dashboard**: PLATFORM_META entry under DevOps category with setup steps

---

### 3. MCP Pre-built Integrations

**Decision**: Add a "Featured MCP Servers" grid to the MCP tab in the Connections page, providing a static catalog of pre-configured popular MCP servers with one-click connect UX.

**Rationale**:
- MCP server registration currently requires users to know the correct `command`, `args`, and environment variable names. This is a significant friction point for non-technical users.
- A static catalog of well-known servers solves the discovery and configuration-template problem without requiring a remote catalog service.
- Four servers cover the highest-demand use cases identified in Phase 4.5 planning: web scraping (Bright Data), AI-powered search (Exa), code execution sandbox (E2B), and database access (Supabase).

**Pre-built catalog** (4 servers):

| Server | Transport | Package | Required Env Vars |
|--------|-----------|---------|-------------------|
| Bright Data | stdio | `@brightdata/mcp` (npx) | `API_TOKEN` |
| Exa | stdio | `exa-mcp-server` (npx) | `EXA_API_KEY` |
| E2B | stdio | `@e2b/mcp-server` (npx) | `E2B_API_KEY` |
| Supabase | streamable-http | `https://mcp.supabase.io` | `SUPABASE_ACCESS_TOKEN` |

**UX**:
- Featured grid appears at the top of the MCP tab above the existing registered servers list
- Each card shows: server name, description, transport type, required env var count
- "Connect" button opens an inline env var form (same inline card pattern from ADR 039)
- Auto-detection: if a server matching the pre-built config is already registered, the card shows "Connected" badge
- On submit, calls the existing `POST /mcp/servers` API with the pre-filled config

**Implementation**: Static `PREBUILT_MCP_SERVERS` constant in the dashboard; no backend changes required.

---

### 4. Connections Page Consolidation

**Decision**: Restructure the Connections page from 6 flat top-level tabs to a 2-level hierarchy: **Integrations** and **MCP** as top-level tabs, with Integrations containing 5 sub-tabs.

**Rationale**:
- The Connections page previously had flat tabs: Messaging, Email, Calendar, MCP, DevOps, OAuth. As integrations grew this became unwieldy.
- The Messaging/Email/Calendar/DevOps/OAuth categories are all "integration adapters" and belong under a unified Integrations top-level tab.
- MCP is a distinct subsystem (external server connectivity) and warrants its own top-level tab.
- OAuth connections are contextually related to integrations (Google OAuth unlocks Gmail/Calendar), so moving OAuth into Integrations sub-tabs is more coherent than a standalone top-level tab.

**New structure**:

```
Connections
├── Integrations
│   ├── Messaging    (Telegram, Discord, Slack, WhatsApp, Signal, Teams, iMessage, Google Chat)
│   ├── Email        (Gmail, IMAP/SMTP)
│   ├── Calendar     (Google Calendar)
│   ├── DevOps       (GitHub, GitLab, Jira, AWS, Azure DevOps)
│   └── OAuth        (Google OAuth token management)
└── MCP
    ├── Featured Servers (pre-built catalog grid)
    └── Registered Servers (existing MCP server management)
```

**Previous structure** (6 flat tabs):
```
Connections: Messaging | Email | Calendar | MCP | DevOps | OAuth
```

**Config additions**:
- `DEVOPS_PLATFORMS` constant extended with entries: `jira`, `aws`, `azure`
- `PLATFORM_META` entries added for Jira, AWS, Azure DevOps with display name, description, config fields, and setup steps

---

## Consequences

### Positive

- **Provider coverage**: Adding Mistral expands model selection to a widely-used European AI provider, giving users more fallback options and model diversity.
- **Developer workflow integration**: Jira, AWS, and Azure DevOps adapters make SecureYeoman directly useful for engineering teams managing projects and infrastructure via AI assistant.
- **MCP onboarding**: The pre-built catalog reduces the time-to-first-connection for popular MCP servers from "understand the config format and find the package name" to "enter API key and click Connect".
- **Navigation clarity**: The 2-level Connections hierarchy makes it easier to find integration types as the number of supported platforms grows.
- **No SDK bloat**: All three developer tool adapters use plain `fetch` with manual auth implementations, keeping bundle size and dependency surface minimal.

### Negative / Trade-offs

- **Static catalog**: The pre-built MCP server catalog is hardcoded in the dashboard. New servers require a code change and release rather than dynamic discovery. Accepted for Phase 11; a remote catalog could be introduced later.
- **SigV4 complexity**: Implementing AWS Signature V4 from scratch introduces a non-trivial auth implementation that must be maintained. The alternative (AWS SDK) was rejected due to bundle size concerns but the custom implementation must be carefully tested.
- **Sub-tab navigation depth**: Adding sub-tabs under Integrations increases click depth by one level for users who previously had direct tab access. Mitigated by remembering the last active sub-tab in component state.

---

## Related

- ADR 039: Inline Form Pattern (MCP pre-built connect UX follows same pattern)
- ADR 040: Proactive Assistance
- ADR 041: Multimodal I/O
- [Phase 11 Roadmap](../development/roadmap.md#phase-11-expanded-integrations-partial)
- [CHANGELOG.md](../../CHANGELOG.md)
