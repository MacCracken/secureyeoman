# Spec: `@friday/mcp` — Internal MCP Service Package

**Status**: Proposed
**Date**: 2026-02-13
**Target Version**: 1.4.0

---

## 1. Executive Summary

Create a new monorepo package `packages/mcp` (`@friday/mcp`) that implements a standalone MCP (Model Context Protocol) service for F.R.I.D.A.Y. This service exposes FRIDAY's internal capabilities (brain knowledge, skills, tasks, integrations, audit log) as MCP tools, resources, and prompts — and can also proxy connections to external MCP servers.

The MCP service is **security-first**: it does not run independently and **requires authentication through SecureYeoman's auth system**. It auto-registers with the dashboard's MCP Servers page so the agent can use its own tools out of the box.

Reference implementation: https://github.com/modelcontextprotocol/servers

---

## 2. Design Principles

1. **Security-first** — All transports require SecureYeoman JWT validation. No anonymous access. RBAC enforced on every tool call. Audit-logged.
2. **Own service, shared auth** — Runs as its own Fastify process on a dedicated port but delegates authentication to SecureYeoman's `AuthService`. Cannot start without a valid connection to the core gateway.
3. **Auto-discovery** — On startup, the MCP service registers itself with the core's `McpStorage` so the dashboard MCP Servers page shows it immediately. Users can disable this via `MCP_AUTO_REGISTER=false` in `.env`.
4. **Defense in depth** — Path validation on filesystem tools, input sanitization on all tool args, rate limiting per-tool, sandboxed execution for code tools, secret redaction in all outputs.
5. **Minimal dependencies** — Uses `@modelcontextprotocol/sdk` for protocol compliance. No heavy frameworks beyond Fastify (shared with core).

---

## 3. Package Structure

```
packages/mcp/
├── package.json                    # @friday/mcp
├── tsconfig.json
├── src/
│   ├── index.ts                    # Package exports
│   ├── cli.ts                      # Entry point: `friday-mcp` binary
│   ├── server.ts                   # McpServiceServer — Fastify + MCP protocol handler
│   ├── auth/
│   │   └── proxy-auth.ts           # Validates JWTs by calling SecureYeoman's /api/v1/auth/verify
│   ├── config/
│   │   └── config.ts               # Loads config from env vars + optional YAML
│   ├── tools/
│   │   ├── index.ts                # Tool registry — collects and exports all tools
│   │   ├── brain-tools.ts          # knowledge.search, knowledge.get, knowledge.store, memory.recall
│   │   ├── task-tools.ts           # task.create, task.list, task.get, task.cancel
│   │   ├── integration-tools.ts    # integration.list, integration.send, integration.status
│   │   ├── soul-tools.ts           # personality.get, personality.switch, skill.list, skill.execute
│   │   ├── audit-tools.ts          # audit.query, audit.verify, audit.stats
│   │   ├── system-tools.ts         # system.health, system.metrics, system.config
│   │   └── filesystem-tools.ts     # fs.read, fs.write, fs.list, fs.search (sandboxed)
│   ├── resources/
│   │   ├── index.ts                # Resource registry
│   │   ├── knowledge-resources.ts  # friday://knowledge/{id}, friday://knowledge/all
│   │   ├── personality-resources.ts # friday://personality/active, friday://personality/{id}
│   │   ├── config-resources.ts     # friday://config/current (redacted secrets)
│   │   └── audit-resources.ts      # friday://audit/recent, friday://audit/stats
│   ├── prompts/
│   │   ├── index.ts                # Prompt registry
│   │   ├── soul-prompts.ts         # friday:compose-prompt — full soul+spirit+brain prompt
│   │   ├── task-prompts.ts         # friday:plan-task — structured task planning template
│   │   └── analysis-prompts.ts     # friday:analyze-code, friday:review-security
│   ├── transport/
│   │   ├── stdio.ts                # stdio transport (for local CLI usage)
│   │   ├── sse.ts                  # SSE transport (for browser/dashboard)
│   │   └── streamable-http.ts      # Streamable HTTP transport (primary)
│   ├── middleware/
│   │   ├── rate-limiter.ts         # Per-tool rate limiting (token bucket)
│   │   ├── input-validator.ts      # Zod schema validation + injection detection on tool args
│   │   ├── audit-logger.ts         # Logs every tool call, resource read, and prompt request
│   │   └── secret-redactor.ts      # Strips secrets/tokens from tool outputs before returning
│   ├── dashboard/
│   │   ├── routes.ts               # Fastify routes for the MCP dashboard UI
│   │   └── static/                 # Built dashboard assets (served by Fastify)
│   └── registration/
│       └── auto-register.ts        # Registers this server with SecureYeoman's McpStorage on boot
└── tests/
    ├── server.test.ts              # Server lifecycle, auth enforcement, transport selection
    ├── tools/
    │   ├── brain-tools.test.ts     # Knowledge CRUD, memory recall
    │   ├── task-tools.test.ts      # Task creation, listing, cancellation
    │   ├── integration-tools.test.ts
    │   ├── soul-tools.test.ts
    │   ├── audit-tools.test.ts
    │   ├── system-tools.test.ts
    │   └── filesystem-tools.test.ts # Path validation, sandbox enforcement
    ├── resources/
    │   ├── knowledge-resources.test.ts
    │   └── personality-resources.test.ts
    ├── prompts/
    │   └── soul-prompts.test.ts
    ├── middleware/
    │   ├── rate-limiter.test.ts
    │   ├── input-validator.test.ts
    │   ├── audit-logger.test.ts
    │   └── secret-redactor.test.ts
    ├── auth/
    │   └── proxy-auth.test.ts      # JWT validation delegation
    └── registration/
        └── auto-register.test.ts   # Auto-registration with core
```

---

## 4. Configuration

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `MCP_ENABLED` | `true` | Master kill switch for the MCP service |
| `MCP_PORT` | `3001` | Port for the MCP HTTP/SSE server |
| `MCP_HOST` | `127.0.0.1` | Bind address (localhost only by default) |
| `MCP_TRANSPORT` | `streamable-http` | Default transport: `stdio`, `sse`, `streamable-http` |
| `MCP_AUTO_REGISTER` | `true` | Auto-register with SecureYeoman's McpStorage on startup |
| `MCP_CORE_URL` | `http://127.0.0.1:18789` | SecureYeoman gateway URL for auth delegation and API calls |
| `SECUREYEOMAN_TOKEN_SECRET` | *(required)* | Shared JWT secret — MCP self-mints a service token on startup |
| `MCP_EXPOSE_FILESYSTEM` | `false` | Enable filesystem tools (disabled by default — high risk) |
| `MCP_ALLOWED_PATHS` | *(empty)* | Comma-separated allowed filesystem paths (when fs enabled) |
| `MCP_RATE_LIMIT_PER_TOOL` | `30` | Default max tool calls per second per tool |
| `MCP_LOG_LEVEL` | `info` | Log level: trace, debug, info, warn, error, fatal |
| `MCP_TLS_CERT` | *(optional)* | Path to TLS certificate for HTTPS |
| `MCP_TLS_KEY` | *(optional)* | Path to TLS private key for HTTPS |

### Shared Config Schema Addition

Add to `packages/shared/src/types/mcp.ts`:

```typescript
export const McpServiceConfigSchema = z.object({
  enabled: z.boolean().default(true),
  port: z.number().int().min(1024).max(65535).default(3001),
  host: z.string().default('127.0.0.1'),
  transport: McpTransportSchema.default('streamable-http'),
  autoRegister: z.boolean().default(true),
  coreUrl: z.string().url().default('http://127.0.0.1:18789'),
  exposeFilesystem: z.boolean().default(false),
  allowedPaths: z.array(z.string()).default([]),
  rateLimitPerTool: z.number().int().min(1).max(1000).default(30),
  logLevel: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('info'),
});
```

---

## 5. Authentication & Authorization

### Auth Flow

```
MCP Client (Claude, dashboard, external)
    │
    │  MCP request + Authorization: Bearer <JWT>
    ▼
┌─────────────────────────┐
│  @friday/mcp service    │
│                         │
│  1. Extract JWT from    │
│     Authorization header│
│     or MCP auth param   │
│                         │
│  2. POST to core:       │
│     /api/v1/auth/verify │
│     with the JWT        │
│                         │
│  3. Core returns:       │
│     { valid, userId,    │
│       role, permissions }│
│                         │
│  4. Check RBAC:         │
│     Does role have      │
│     permission for this │
│     tool/resource?      │
│                         │
│  5. Execute or reject   │
└─────────────────────────┘
```

### RBAC Permission Mapping

| MCP Capability | Required Permission |
|----------------|-------------------|
| `brain-tools.*` | `brain.read` / `brain.write` |
| `task-tools.*` | `tasks.read` / `tasks.write` |
| `integration-tools.*` | `integrations.read` / `integrations.write` |
| `soul-tools.*` | `soul.read` / `soul.write` |
| `audit-tools.*` | `audit.read` |
| `system-tools.*` | `system.read` |
| `filesystem-tools.*` | `system.admin` (admin only) |
| `resources.*` | `brain.read` (read-only access) |
| `prompts.*` | `soul.read` |

### Service-to-Service Auth

The MCP service self-mints a service JWT on startup using the shared `SECUREYEOMAN_TOKEN_SECRET` (HS256, `sub: "mcp-service"`, `role: "admin"`, 365-day expiry). No manual token management is needed.

This token is used for:
- Auto-registration with `McpStorage`
- Proxying tool calls to core API endpoints
- Reading knowledge, tasks, integrations, etc.

---

## 6. Tools Specification

### Brain Tools (`brain-tools.ts`)

| Tool Name | Description | Input Schema | Core API |
|-----------|-------------|-------------|----------|
| `knowledge_search` | Search brain knowledge by query | `{ query: string, limit?: number }` | `GET /api/v1/brain/knowledge?q=` |
| `knowledge_get` | Get a specific knowledge entry | `{ id: string }` | `GET /api/v1/brain/knowledge/:id` |
| `knowledge_store` | Store new knowledge | `{ content: string, type: string, source?: string }` | `POST /api/v1/brain/knowledge` |
| `memory_recall` | Recall relevant memories | `{ query: string, types?: string[] }` | `GET /api/v1/brain/memory?q=` |

### Task Tools (`task-tools.ts`)

| Tool Name | Description | Input Schema | Core API |
|-----------|-------------|-------------|----------|
| `task_create` | Create a new task | `{ name: string, type: string, description?: string }` | `POST /api/v1/tasks` |
| `task_list` | List tasks with filters | `{ status?: string, type?: string, limit?: number }` | `GET /api/v1/tasks` |
| `task_get` | Get task details | `{ id: string }` | `GET /api/v1/tasks/:id` |
| `task_cancel` | Cancel a running task | `{ id: string }` | `DELETE /api/v1/tasks/:id` |

### Integration Tools (`integration-tools.ts`)

| Tool Name | Description | Input Schema | Core API |
|-----------|-------------|-------------|----------|
| `integration_list` | List all integrations | `{ platform?: string }` | `GET /api/v1/integrations` |
| `integration_send` | Send message via integration | `{ integrationId: string, chatId: string, text: string }` | `POST /api/v1/integrations/:id/messages` |
| `integration_status` | Check integration health | `{ id: string }` | `GET /api/v1/integrations/:id` |

### Soul Tools (`soul-tools.ts`)

| Tool Name | Description | Input Schema | Core API |
|-----------|-------------|-------------|----------|
| `personality_get` | Get active personality | `{}` | `GET /api/v1/soul/personality` |
| `personality_switch` | Switch active personality | `{ id: string }` | `POST /api/v1/soul/personality/:id/activate` |
| `skill_list` | List available skills | `{ status?: string }` | `GET /api/v1/soul/skills` |
| `skill_execute` | Execute a skill | `{ skillId: string, input?: object }` | `POST /api/v1/soul/skills/:id/execute` |

### Audit Tools (`audit-tools.ts`)

| Tool Name | Description | Input Schema | Core API |
|-----------|-------------|-------------|----------|
| `audit_query` | Query audit log | `{ event?: string, level?: string, limit?: number }` | `GET /api/v1/audit` |
| `audit_verify` | Verify audit chain integrity | `{}` | `POST /api/v1/audit/verify` |
| `audit_stats` | Get audit statistics | `{}` | `GET /api/v1/audit/stats` |

### System Tools (`system-tools.ts`)

| Tool Name | Description | Input Schema | Core API |
|-----------|-------------|-------------|----------|
| `system_health` | Get system health status | `{}` | `GET /health` |
| `system_metrics` | Get system metrics snapshot | `{}` | `GET /api/v1/metrics` |
| `system_config` | Get current config (redacted) | `{}` | In-memory (secrets stripped) |

### Filesystem Tools (`filesystem-tools.ts`) — Opt-in via `MCP_EXPOSE_FILESYSTEM=true`

| Tool Name | Description | Input Schema | Security |
|-----------|-------------|-------------|----------|
| `fs_read` | Read a file | `{ path: string }` | Path validation against `MCP_ALLOWED_PATHS` |
| `fs_write` | Write a file | `{ path: string, content: string }` | Path validation + admin only |
| `fs_list` | List directory contents | `{ path: string }` | Path validation |
| `fs_search` | Search files by glob | `{ pattern: string, path?: string }` | Path validation |

**Filesystem Security:**
- All paths resolved and validated against `MCP_ALLOWED_PATHS` allowlist
- Symlink resolution to prevent traversal
- Requires `system.admin` RBAC permission
- Disabled by default (`MCP_EXPOSE_FILESYSTEM=false`)
- File size limits enforced (max 10MB read, 1MB write)
- Binary files returned as base64 with mime type

---

## 7. Resources Specification

| URI | Name | Description | MIME Type |
|-----|------|-------------|-----------|
| `friday://knowledge/all` | Knowledge Base | All knowledge entries | `application/json` |
| `friday://knowledge/{id}` | Knowledge Entry | Specific knowledge entry | `application/json` |
| `friday://personality/active` | Active Personality | Current personality config | `application/json` |
| `friday://personality/{id}` | Personality | Specific personality | `application/json` |
| `friday://config/current` | System Config | Current config (secrets redacted) | `application/json` |
| `friday://audit/recent` | Recent Audit Events | Last 100 audit entries | `application/json` |
| `friday://audit/stats` | Audit Statistics | Chain stats and counts | `application/json` |

---

## 8. Prompts Specification

| Prompt Name | Description | Arguments |
|-------------|-------------|-----------|
| `friday:compose-prompt` | Full Soul + Spirit + Brain system prompt | `{ personalityId?: string }` |
| `friday:plan-task` | Structured task planning template | `{ taskDescription: string, constraints?: string }` |
| `friday:analyze-code` | Code analysis with security focus | `{ code: string, language: string }` |
| `friday:review-security` | Security review checklist | `{ target: string, scope?: string }` |

---

## 9. Auto-Registration with Core

### Startup Sequence

```
1. Load config from env vars
2. Validate MCP_CORE_URL is reachable (GET /health)
3. Self-mint service JWT using SECUREYEOMAN_TOKEN_SECRET
4. If MCP_AUTO_REGISTER=true:
   a. POST /api/v1/mcp/servers with:
      {
        name: "FRIDAY Internal MCP",
        description: "Built-in MCP server exposing FRIDAY tools, resources, and prompts",
        transport: <MCP_TRANSPORT>,
        url: "http://<MCP_HOST>:<MCP_PORT>",
        enabled: true
      }
   b. Store the returned server ID for cleanup on shutdown
5. Start Fastify HTTP server on MCP_PORT
6. Start MCP protocol handler (stdio/SSE/streamable-http)
7. Log startup banner
```

### Shutdown Sequence

```
1. Stop accepting new connections
2. Drain in-flight requests (30s timeout)
3. If auto-registered: DELETE /api/v1/mcp/servers/:id to de-register
4. Close Fastify server
5. Log shutdown complete
```

---

## 10. Dashboard Integration

The MCP service includes a lightweight dashboard accessible at `http://<MCP_HOST>:<MCP_PORT>/` — but **only after authenticating through SecureYeoman**.

### Auth Gate

The MCP dashboard does **not** have its own login page. Instead:

1. User navigates to the MCP service URL
2. MCP service checks for a valid `friday-session` cookie or `Authorization` header
3. If missing/invalid, redirects to `<MCP_CORE_URL>/login?redirect=<MCP_URL>`
4. After login, SecureYeoman redirects back with a session token
5. MCP service validates the token via core's auth verify endpoint

### Dashboard Pages

| Route | Content |
|-------|---------|
| `/` | Overview — server status, uptime, tool/resource/prompt counts |
| `/tools` | Tool catalog with descriptions, input schemas, test invocation form |
| `/resources` | Resource browser with URI list and content preview |
| `/prompts` | Prompt catalog with argument forms and rendered preview |
| `/logs` | Recent tool call log (from audit middleware) |
| `/settings` | Runtime config display (read-only, secrets redacted) |

---

## 11. Transport Details

### Streamable HTTP (Primary)

```
POST /mcp/v1
Content-Type: application/json
Authorization: Bearer <JWT>

{ "jsonrpc": "2.0", "method": "tools/call", "params": { ... }, "id": 1 }
```

- Request/response JSON-RPC 2.0
- Supports streaming via `Transfer-Encoding: chunked` for long-running tools
- All requests authenticated

### SSE (Browser/Dashboard)

```
GET /mcp/v1/sse
Authorization: Bearer <JWT>

→ Server-Sent Events stream for notifications
→ POST /mcp/v1/message for client-to-server messages
```

### stdio (Local CLI)

```bash
SECUREYEOMAN_TOKEN_SECRET=<secret> friday-mcp --transport stdio
```

- Reads JSON-RPC from stdin, writes to stdout
- Auth via self-minted service JWT (no per-request headers)
- Intended for local development and Claude Desktop integration

---

## 12. Implementation Order

### Phase 1: Foundation
1. Create `packages/mcp/` with package.json, tsconfig.json
2. Implement `config.ts` — env var loading with Zod validation
3. Implement `proxy-auth.ts` — JWT validation via core API
4. Implement `server.ts` — Fastify server with MCP SDK integration
5. Implement `streamable-http.ts` transport
6. Implement `auto-register.ts` — registration with core on boot
7. Implement `cli.ts` — entry point with arg parsing
8. **Tests**: server lifecycle, auth enforcement, auto-registration
9. **ADR**: `docs/adr/026-mcp-service-package.md`

### Phase 2: Core Tools
1. Implement `brain-tools.ts` — knowledge search/get/store, memory recall
2. Implement `task-tools.ts` — task CRUD
3. Implement `system-tools.ts` — health, metrics, config
4. Implement middleware: `rate-limiter.ts`, `input-validator.ts`, `audit-logger.ts`, `secret-redactor.ts`
5. **Tests**: each tool suite, middleware behavior

### Phase 3: Extended Tools & Resources
1. Implement `integration-tools.ts` — list, send, status
2. Implement `soul-tools.ts` — personality, skills
3. Implement `audit-tools.ts` — query, verify, stats
4. Implement `filesystem-tools.ts` — sandboxed file ops (opt-in)
5. Implement all resource providers
6. Implement all prompt providers
7. **Tests**: each tool/resource/prompt suite

### Phase 4: Transports & Dashboard
1. Implement `sse.ts` transport
2. Implement `stdio.ts` transport
3. Build MCP dashboard (React, same toolchain as @friday/dashboard)
4. Implement auth gate redirect flow
5. Implement dashboard routes in `dashboard/routes.ts`
6. **Tests**: transport-specific tests, dashboard route tests

### Phase 5: Integration & Polish
1. Wire into root `package.json` scripts (build, dev, test)
2. Update `CHANGELOG.md`
3. Update `docs/guides/integrations.md` with MCP service section
4. Update `docs/api/rest-api.md` with MCP service endpoints
5. Add to Docker Compose as separate service
6. End-to-end test: Claude Desktop → MCP stdio → tool call → core API → response
7. **Documentation**: full setup guide, configuration reference

---

## 13. Security Checklist

- [ ] All transports require valid JWT (no anonymous access)
- [ ] RBAC permissions enforced per-tool, per-resource, per-prompt
- [ ] Every tool call logged to audit chain
- [ ] Secrets redacted from all tool outputs and resource responses
- [ ] Filesystem tools disabled by default, admin-only when enabled
- [ ] Path traversal prevention with symlink resolution
- [ ] Input validation (Zod) on all tool arguments
- [ ] Injection detection (SQL, XSS, command, template) on text inputs
- [ ] Rate limiting per-tool with configurable limits
- [ ] Service token scoped to minimum required permissions
- [ ] MCP service binds to localhost by default (no external exposure)
- [ ] TLS support for production deployments
- [ ] Auto-deregistration on shutdown (no stale entries)
- [ ] Max request body size enforced (1MB)
- [ ] Timeout enforcement on long-running tool calls (60s default)

---

## 14. Dependencies

```json
{
  "dependencies": {
    "@friday/shared": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.x",
    "fastify": "^5.x",
    "@fastify/compress": "^8.x",
    "zod": "^3.x"
  },
  "devDependencies": {
    "vitest": "^4.x",
    "typescript": "^5.x",
    "tsx": "^4.x"
  }
}
```

---

## 15. Success Criteria

1. `npm run dev --workspace=@friday/mcp` starts the MCP service and auto-registers with core
2. Dashboard MCP Servers page shows "FRIDAY Internal MCP" as connected
3. Claude Desktop can connect via stdio and invoke all tools
4. All tool calls require valid JWT and correct RBAC permissions
5. Every tool call appears in the audit log
6. `MCP_AUTO_REGISTER=false` prevents auto-registration
7. `MCP_ENABLED=false` prevents the service from starting entirely
8. Filesystem tools only work when explicitly enabled with valid allowed paths
9. All secrets are redacted from tool outputs
10. 200+ tests across tools, resources, prompts, middleware, auth, and registration

---

*This spec should be implemented following FRIDAY's existing patterns: TypeScript ESM, Vitest, Zod validation, Fastify, SQLite where persistence is needed, and the Yeoman security philosophy of deny-by-default.*
