# ADR 123 — Diagnostic Tools: Two-Channel Architecture

**Status**: Accepted
**Date**: 2026-02-23
**Phase**: 39

---

## Context

Agents need visibility into their own runtime state and the health of their connected systems. Two distinct use cases exist:

1. **Self-inspection** — the active personality wants to know process health, memory usage, config state, and heartbeat results mid-task without making an API call.
2. **Inter-agent reporting** — a sub-agent wants to push its health status to the orchestrator, or an orchestrator wants to poll a spawned sub-agent's status.

An earlier design proposed a single family of MCP tools for all diagnostic access. This was revised after recognising that the two use cases have fundamentally different architectures:

- Self-inspection data lives *inside* core. Routing it through MCP (core → REST API → MCP server → agent) adds an unnecessary round-trip and would require new REST endpoints purely to serve the MCP layer.
- Inter-agent reporting is *already* an MCP use case: sub-agents communicate with the orchestrator via MCP by design.

## Decision

Implement diagnostics as two independent channels with a single capability gate.

### Channel A — Core self-diagnostics (prompt injection)

`composeBodyPrompt()` in `packages/core/src/soul/manager.ts` assembles a `### Diagnostics` block inline when `'diagnostics'` is in `body.capabilities[]`. Data sourced directly from within the core process:

- `process.uptime()` → uptime string
- `process.memoryUsage().rss` → MB
- `os.loadavg()[0]` → 1-minute load average
- `personality.body.selectedServers.length` + `selectedIntegrations.length` → connection counts

This is passive context — assembled once per session start and on each prompt rebuild. It emits no audit event (same as the Heart block it sits alongside).

### Channel B — Sub-agent / external reporting (MCP tools)

Three tools registered in `packages/mcp/src/tools/diagnostic-tools.ts`:

| Tool | Direction | Purpose |
|------|-----------|---------|
| `diag_report_status` | sub-agent → core | Sub-agent stores a health report (uptime, task count, last error, memory) via `POST /api/v1/diagnostics/agent-report` |
| `diag_query_agent` | orchestrator → core | Orchestrator reads a sub-agent's most recent report via `GET /api/v1/diagnostics/agent-report/:agentId` |
| `diag_ping_integrations` | any → core | Returns running/healthy status for all integrations and connected MCP server IDs from the active personality's `selectedIntegrations` / `selectedServers` lists |

Agent reports are stored in an in-memory `Map<string, AgentReport>` in `diagnostic-routes.ts`. No DB persistence — reports are ephemeral live-status data, not audit records. Each new report for an agent ID replaces the previous.

### Capability gate

`'diagnostics'` added to `BodyCapabilitySchema`. A single enum value in `body.capabilities[]` enables both channels simultaneously:

- Channel A: `composeBodyPrompt()` includes/excludes the `### Diagnostics` block based on the capability.
- Channel B: each MCP tool handler checks `body.capabilities[]` on the active personality before executing.
- `diag_report_status` and `diag_query_agent` also require `SecurityConfig.allowSubAgents === true` since they are meaningless without sub-agent delegation enabled.

### Dashboard

The `'diagnostics'` enum entry surfaces automatically in the existing Body → Capabilities toggle list in `PersonalityEditor.tsx` (no structural UI changes needed). The `capabilityInfo` map entry adds icon `🩺` and description.

## Alternatives Considered

**Single MCP tool family for all diagnostics** — rejected. Routing self-inspection data through MCP for a personality that is the local core process adds needless latency and REST API surface. The heartbeat system already demonstrates the right pattern for pushing internal data into the prompt.

**No MCP tools, extend heartbeat only** — rejected. The heartbeat is scheduled and passive; sub-agents need an active push mechanism to report status to their orchestrator, and the orchestrator needs a way to query them on demand. MCP is the correct protocol for this.

**Per-tool boolean config (8 toggles)** — rejected as over-engineered. A single `'diagnostics'` capability is the right granularity for a read-only, low-risk feature set.

## Consequences

- No new DB migration required.
- No new `SecurityConfig` flag required (beyond `allowSubAgents` which already exists).
- Agent reports are lost on server restart — acceptable for live status data.
- `diag_ping_integrations` reports MCP server IDs only (not reachability latency) since the MCP server does not maintain live connection state per-personality; full connectivity testing would require a separate probe mechanism.
