# ADR 100 — BullShift MCP Trading Tools

**Date**: 2026-02-22
**Status**: Accepted

---

## Context

BullShift is a cross-platform trading platform (Flutter + Rust) with a high-performance order execution engine. Its Rust backend previously exposed only an FFI interface intended for Flutter consumption.

SecureYeoman agents and MCP clients (e.g. Claude Desktop) have no way to query positions or submit trades through natural language without FFI, which requires the Flutter host process.

The goal is to make BullShift's core trading actions available as MCP tools with the minimum viable surface area — no new databases, no auth system, no persistent integration adapter.

---

## Decision

**Add 5 MCP tools in the `@secureyeoman/mcp` package** that call a new lightweight REST API server in the BullShift repo:

### BullShift side (prerequisite)

A new `api_server` binary target (`rust/src/bin/api_server.rs`) using Axum 0.7 exposes:

| Method | Path             | Description            |
|--------|------------------|------------------------|
| GET    | `/health`        | Liveness check         |
| POST   | `/v1/orders`     | Submit a trading order |
| GET    | `/v1/positions`  | List open positions    |
| GET    | `/v1/account`    | Account balance/margin |
| DELETE | `/v1/orders/:id` | Cancel an open order   |

Configuration is entirely via env vars (`ALPACA_API_KEY`, `ALPACA_API_SECRET`, `ALPACA_SANDBOX`, `BULLSHIFT_PORT=8787`). The server is a standalone binary — it does not require the Flutter app to be running.

### SecureYeoman MCP side

`packages/mcp/src/tools/trading-tools.ts` registers 5 tools via the standard `registerTool` + `wrapToolHandler` pattern (rate limiting, input validation, audit logging, secret redaction all applied automatically):

| Tool name                  | Description                     |
|----------------------------|---------------------------------|
| `bullshift_health`         | Verify API server is reachable  |
| `bullshift_get_account`    | Account balance and margin info |
| `bullshift_get_positions`  | List all open positions         |
| `bullshift_submit_order`   | Place a market/limit/stop order |
| `bullshift_cancel_order`   | Cancel an open order by ID      |

The BullShift URL is read from `BULLSHIFT_API_URL` (default `http://localhost:8787`), keeping discovery simple and the tool file dependency-free (native `fetch` only).

---

## Why this approach over alternatives

### Alternative A: BullShift as a full `Integration` adapter
Register BullShift alongside Slack/GitHub/etc. in `packages/core/src/integrations/`. This gives agents persistent event subscriptions and bi-directional routing — but requires a running Flutter/FFI process or a gRPC bridge, and the integration lifecycle (connect/start/stop/health) is significantly heavier. Tracked for **ADR 101 / 2026.6.x**.

### Alternative B: Expose BullShift directly via gRPC
BullShift already has `tonic` in its Cargo.toml. A gRPC endpoint would give typed contracts and bi-directional streaming. However it adds protobuf definition maintenance and requires a gRPC MCP transport shim. Deferred until the need for streaming market data events justifies the overhead.

### Alternative C: MCP prebuilt (npx/uvx package)
BullShift is not a published MCP server package. A prebuilt entry would require publishing and versioning a separate package. Direct tool registration keeps the integration self-contained in this repo.

**Chosen:** REST + native fetch is the lowest friction path. No new packages, no generated code, no persistent process requirements beyond the `api_server` binary.

---

## Remaining integration paths (future ADRs)

| Path | ADR | Target |
|---|---|---|
| SecureYeoman as AI provider in BullShift | — | 2026.5.x (BullShift) |
| Full BullShift Integration adapter (event subscriptions) | ADR 101 | 2026.6.x |
| Trade audit trail via SecureYeoman audit chain | ADR 101 | 2026.6.x |
| BullRunnr news feed from SecureYeoman integrations | ADR 101 | 2026.6.x |
| RBAC for multi-user trading access | ADR 101 | 2026.6.x |

---

## Consequences

- `packages/mcp/src/tools/index.ts` grows by one `registerTradingTools` call
- `BULLSHIFT_API_URL` is a new optional env var for the MCP service (documented in guides)
- The BullShift `api_server` binary is opt-in — BullShift's Flutter app is unaffected
- Agents that call `bullshift_submit_order` execute real (or paper) trades; the tool description includes an explicit confirmation note
- All 5 tools are covered by the standard MCP middleware stack (audit log, rate limit, secret redaction)

---

## Related

- [ADR 004 — MCP Protocol](004-mcp-protocol.md)
- [ADR 026 — MCP Service Package](026-mcp-service-package.md)
- [ADR 064 — Skills/MCP Tool Separation](064-skills-mcp-tool-separation.md)
- [ADR 082 — Semantic Search MCP Prebuilts](082-semantic-search-mcp-prebuilts.md)
