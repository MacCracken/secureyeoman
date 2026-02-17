# ADR 026: MCP Service Package (`@secureyeoman/mcp`)

**Status**: Accepted
**Date**: 2026-02-13
**Target Version**: 1.4.0

## Context

The current MCP implementation (ADR 004) lives inside `@secureyeoman/core` as three classes (`McpClientManager`, `McpServer`, `McpStorage`) with a REST API layer. This approach has limitations:

1. **Tight coupling** — MCP logic is embedded in the core agent, making it hard to evolve independently or disable cleanly
2. **Incomplete protocol** — The current `McpServer` is a thin wrapper that exposes skills as tools and knowledge as one resource, but does not implement the full MCP protocol (JSON-RPC 2.0, transports, prompts)
3. **No standalone operation** — Cannot be used with Claude Desktop or other MCP clients via stdio/SSE
4. **Limited tool surface** — Only exposes skills; doesn't expose tasks, integrations, audit, filesystem, or system tools
5. **No auth on protocol level** — MCP endpoints inherit Fastify auth but the MCP protocol messages themselves aren't authenticated

The reference implementation at `github.com/modelcontextprotocol/servers` demonstrates the pattern: each MCP server is its own package with transport-agnostic tool/resource/prompt registration and dedicated security boundaries.

## Decision

### Create `packages/mcp` as a new workspace package

The MCP service becomes a peer of `core`, `dashboard`, and `shared` in the monorepo:

```
packages/
├── core/          # SecureYeoman agent engine
├── dashboard/     # React dashboard
├── mcp/           # MCP service (NEW)
└── shared/        # Shared types and schemas
```

### Security Architecture

**Auth delegation, not independence:**
- The MCP service does NOT run independently. It requires a live SecureYeoman core instance.
- On startup, the MCP service self-mints a service JWT using the shared `SECUREYEOMAN_TOKEN_SECRET` (HS256, `sub: "mcp-service"`, `role: "admin"`, 365-day expiry). No manual token configuration is needed.
- All user-facing requests are authenticated by delegating JWT validation to `POST /api/v1/auth/verify` on the core gateway.
- RBAC permissions are enforced per-tool using the same permission model as core API endpoints.
- Every tool call is logged to the audit chain via core's audit API.

**Filesystem isolation:**
- Filesystem tools are disabled by default (`MCP_EXPOSE_FILESYSTEM=false`).
- When enabled, paths are validated against an explicit allowlist (`MCP_ALLOWED_PATHS`).
- Requires `system.admin` RBAC role.

**Secret redaction:**
- All tool outputs pass through a `secret-redactor` middleware that strips tokens, keys, and passwords before returning to clients.

### Auto-Registration

On startup (unless `MCP_AUTO_REGISTER=false`), the service registers itself with core's `McpStorage` via `POST /api/v1/mcp/servers`. This causes the dashboard MCP Servers page to immediately show the internal server. On shutdown, it de-registers.

### Transport Support

Three MCP transports, matching the reference implementations:
1. **Streamable HTTP** (primary) — JSON-RPC over HTTP POST, supports streaming
2. **SSE** — Server-Sent Events for browser clients
3. **stdio** — Standard I/O for Claude Desktop and local CLI usage

### Dashboard

A lightweight dashboard served by the MCP service's Fastify instance. Access requires authenticating through SecureYeoman first (redirect-based auth gate). Provides tool catalog, resource browser, prompt preview, and call logs.

## Alternatives Considered

### 1. Expand MCP inside `@secureyeoman/core`
**Rejected.** Increases core's complexity and coupling. MCP protocol handling (JSON-RPC, transports) is a distinct concern from agent orchestration.

### 2. Fully independent MCP service with its own auth
**Rejected.** Duplicates auth infrastructure, creates a second attack surface, and risks credential sprawl. Delegating to core's auth keeps the security boundary tight.

### 3. Use MCP SDK's built-in auth
**Rejected.** The MCP SDK's auth is designed for public registries. SecureYeoman needs enterprise RBAC tied to its own user model.

## Consequences

### Positive
- Clean separation of concerns — MCP protocol handling isolated from agent core
- Full MCP protocol compliance — tools, resources, prompts, all three transports
- Claude Desktop integration via stdio transport
- 20+ tools exposing SecureYeoman's full capability surface
- Dashboard for tool testing and monitoring
- Independently deployable (as Docker container alongside core)

### Negative
- New package to maintain (build, test, version)
- Service-to-service communication adds latency (~1-5ms per core API call)
- Auto-registration requires `SECUREYEOMAN_TOKEN_SECRET` to be set (shared with core)
- Filesystem tools increase attack surface (mitigated by opt-in + admin-only + path allowlist)

### Neutral
- Existing `McpClientManager` in core continues to work for connecting to external MCP servers
- Existing dashboard MCP Servers page continues to work; the internal server just appears as another entry
- Dashboard Overview services status panel shows enabled/total MCP server count; system flow graph displays an MCP Servers node with live connection edges
- The `@secureyeoman/shared` MCP types are extended but not broken

## Test Plan

| Area | Expected Tests |
|------|---------------|
| Server lifecycle (start, stop, auto-register, de-register) | 15+ |
| Auth delegation (valid JWT, invalid JWT, expired, missing) | 10+ |
| RBAC enforcement per tool | 20+ |
| Tool implementations (7 tool modules x ~8 tests each) | 56+ |
| Resource providers | 15+ |
| Prompt providers | 10+ |
| Middleware (rate limiter, input validator, audit logger, secret redactor) | 30+ |
| Transport tests (streamable-http, SSE, stdio) | 15+ |
| Filesystem security (path validation, traversal, symlinks) | 15+ |
| Integration test (end-to-end tool call through core) | 10+ |
| **Total** | **200+** |

## References

- [ADR 004: MCP Protocol Support](./004-mcp-protocol.md)
- [MCP Reference Servers](https://github.com/modelcontextprotocol/servers)
- [MCP TypeScript SDK](https://github.com/modelcontextprotocol/typescript-sdk)
- [Full Implementation Spec](../specs/mcp-service-implementation.md)

---

**Previous**: [ADR 025: CLI, Webhook, Google Chat Integrations](./025-cli-webhook-googlechat-integrations.md)
