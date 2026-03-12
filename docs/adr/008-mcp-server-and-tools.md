# ADR 008: MCP Server & Tools

**Status**: Accepted

## Context

SecureYeoman exposes a comprehensive Model Context Protocol (MCP) server with 400+ tools, 9 resources, and 4 prompts. This ADR consolidates decisions governing the MCP service architecture, tool registration, transport layer, tool categories, and context optimization.

## Decisions

### 1. MCP Service Architecture

**Dedicated Package.** MCP is extracted into a dedicated `@secureyeoman/mcp` package as a peer of `core`, `dashboard`, and `shared` in the monorepo.

**Auth Delegation.** The MCP service requires a live SecureYeoman core instance. On first boot, core auto-provisions a service API key (`sck_…` prefix, `role: service`) — the hash is stored in `auth.api_keys` and the raw key encrypted (AES-256-GCM) in `internal.auto_secrets`. MCP retrieves the key on startup by polling core's private-network-only bootstrap endpoint (`GET /api/v1/internal/mcp-bootstrap`) with exponential backoff (8 retries). All MCP→core requests use the `x-api-key` header. User-facing requests are authenticated by delegating JWT validation to `POST /api/v1/auth/verify` on the core gateway. The service role has scoped permissions: `auth:read`, `mcp:execute,read,write`, `brain:read,write`, `soul:read`, `internal:read`, `integrations:read,write`. RBAC permissions enforced per-tool. Every tool call logged to the audit chain. All tool outputs pass through `secret-redactor` middleware.

**Filesystem Isolation.** Disabled by default (`MCP_EXPOSE_FILESYSTEM=false`). When enabled, paths validated against an explicit allowlist. Requires `system.admin` RBAC role.

**Auto-registration.** On startup, registers itself with core's `McpStorage`. On shutdown, de-registers. Dashboard MCP Servers page immediately reflects status.

### 2. Tool Registration & Manifest

Tools registered via `registerTool` + `wrapToolHandler`, which automatically applies rate limiting, input validation, audit logging, and secret redaction. The tool manifest (`packages/mcp/src/tools/manifest.ts`) is the single source of truth for AI-visible tools.

**Skills/MCP Tool Separation.** `/api/v1/mcp/tools` returns tools discovered from external MCP servers only. SecureYeoman's own skills are managed through the Skills system, preventing leakage between the two roles.

**Two-Level Feature Gating.** All tool categories use global (`mcp.config` table) and per-personality (`soul.personalities.body.mcpFeatures` JSONB) gates. `filterMcpTools()` applies both: `globalConfig.expose<Feature> && perPersonality.expose<Feature>`. Per-personality toggles greyed out when global is off. All flags default to `false`.

**Pre-built Catalog.** "Featured MCP Servers" grid with one-click connect. Cards show name, description, transport type, and required env var count. Supports both `stdio` and `streamable-http` transports.

### 3. Transport

Three MCP transports: **Streamable HTTP** (primary, JSON-RPC over HTTP POST), **SSE** (browser clients), **stdio** (Claude Desktop, local CLI). Remote MCP access supported via zero-trust networking proxy with 30-minute session TTL.

### 4. Tool Categories

**Web Tools (12).** Scraping (4), search (2), browser automation (6 via Playwright). SSRF protection blocks private IPs, cloud metadata, non-HTTP protocols. Rate limited (10 req/min default). Output capped at 500 KB.

**Connected Account Tools.** Gmail (7), Twitter/X (10), GitHub API (18+) with SSH key management. Mode enforcement on Gmail (suggest/draft/auto). OAuth auto-refresh on 401.

**Trading Tools (5).** REST API bridge to trading backend via native `fetch`.

**Device Control.** One-click `stdio` MCP prebuilt using `uvx mcp-device-server` (18+ tools for camera, printer, audio, screen).

**Diagnostic Tools.** Two channels: core self-diagnostics (prompt injection) and sub-agent reporting (3 MCP tools for status, query, ping).

**CI/CD Tools (21).** GitHub Actions (6), Jenkins (5), GitLab CI (5), Northflank (5). Webhook ingest with platform-specific HMAC verification. `ci_trigger` and `ci_wait` workflow step types.

**Security Toolkits.** Kali (15 pentest tools), Network (38 tools: discovery, scanning, SSH, NetBox, NVD/CVE, PCAP), Docker (14 tools).

**Financial Charting.** 8 chart types via server-side SVG engine with MCP tools.

**Health Monitoring.** 60-second periodic health checks for external MCP servers with auto-disable after configurable failure threshold.

**Credential Management.** AES-256-GCM encrypted storage. Key derived from `SECUREYEOMAN_TOKEN_SECRET` via SHA-256 + salt. Credentials injected into server spawn environment. API exposes keys only, never decrypted values.

### 5. Context Optimization

**Smart Schema Delivery.** Two-pass tool schema selector: Pass 1 filters by feature flags. Pass 2 selects schemas by relevance -- core tools always included, optional-group tools included only when recent conversation matches group keywords. A compact catalog block lists all available tools so the AI knows what exists without full schemas.

Configuration: `alwaysSendFullSchemas` (default `false`) bypasses relevance filter when `true`.

## Consequences

**Positive:**
- Clean separation between MCP service and core agent orchestration.
- Full MCP protocol compliance across all three transports.
- 60-90% token reduction on cold requests via smart schema delivery.
- Two-level feature gating provides granular per-personality tool access.
- Pre-built catalog eliminates discovery and configuration friction.

**Negative:**
- Service-to-service communication adds ~1-5ms latency per core API call.
- Tools in `index.ts` but missing from `manifest.ts` are silently invisible.
- Smart schema delivery may miss relevant tools if keywords don't match; `alwaysSendFullSchemas` restores deterministic behavior.
