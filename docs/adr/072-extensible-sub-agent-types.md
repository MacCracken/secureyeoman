# ADR 072: Extensible Sub-Agent Execution Types (llm / binary / mcp-bridge)

**Status:** Accepted  
**Date:** 2026-02-19  
**Phase:** 21

## Context

All sub-agent delegations previously ran as LLM agentic loops — every delegation consumed tokens even for deterministic tasks. Two new execution backends are needed:

- **binary**: spawn a local executable that speaks a simple JSON stdin/stdout protocol
- **mcp-bridge**: call a named MCP tool directly with a Mustache-interpolated input template

A pre-existing bug at `manager.ts:302–304` meant MCP tools were never wired to LLM sub-agents despite the comment.

## Decision

### Schema (migration 026)
Add `type TEXT DEFAULT 'llm'`, `command`, `command_args`, `command_env`, `mcp_tool`, `mcp_tool_input` to `agents.profiles`. DB constraints enforce that `binary` requires `command` and `mcp-bridge` requires `mcp_tool`.

### Types (delegation.ts)
`AgentProfileSchema` gains the 6 new fields with Zod refinements matching the DB constraints.

### Config (config.ts)
`SecurityConfigSchema` gains `allowBinaryAgents: boolean` (default `false`) — a kill switch for binary execution.

### Execution (manager.ts)
Type dispatch at the top of `executeDelegation()`:
- `'binary'` → `executeBinaryDelegation()`: checks `allowBinaryAgents`, spawns process, writes JSON to stdin, parses stdout.
- `'mcp-bridge'` → `executeMcpBridgeDelegation()`: template interpolation, `mcpClient.callTool()`, timeout via `Promise.race`.
- `'llm'` (default) → existing agentic loop.

**MCP tool wiring fix**: The `llm` path now populates `mcpTools` from `mcpClient.listTools()` and adds them to the tools array. The tool-call handler dispatches unknown tool names to `mcpClient.callTool()` before returning an error.

### New Hook Points (extensions/types.ts)
- `agent:binary-before-execute` / `agent:binary-after-execute`
- `agent:mcp-bridge-before-execute` / `agent:mcp-bridge-after-execute`

### Gateway Prerequisites
- **Migration manifest** (`manifest.ts`): static imports of all 26 SQL files → replaces `readdirSync(__dirname)` which fails in Bun compiled binaries.
- **Migration runner** (`runner.ts`): uses `MIGRATION_MANIFEST` instead of filesystem scan.
- **SPA serving** (`server.ts`): `@fastify/static` with SPA fallback; `resolveDashboardDist()` searches env var, CLI flag, conventional paths.
- **`--dashboard-dist`** flag added to `start` command.

## Consequences

### Positive
- Binary sub-agents: zero token cost for deterministic tasks (grep, jq, custom scripts).
- MCP-bridge sub-agents: zero token cost for MCP tool delegation.
- MCP tool wiring fix: LLM sub-agents can now use MCP tools as intended.
- Migration manifest: migrations apply correctly inside Bun compiled binary.
- SPA serving: no separate nginx/static server required.

### Negative
- Binary execution is a security-sensitive feature, hence the `allowBinaryAgents` kill switch.
- Mustache interpolation in `mcpToolInput` is minimal (only `{{task}}` and `{{context}}`).

### Risks
- Binary sub-agents inherit the process environment — `commandEnv` only adds, never restricts.
- The `binary` path has no sandbox isolation (unlike CodeExecutionManager's seccomp sandbox).

## Files Changed
- `packages/shared/src/types/delegation.ts` — 6 new profile fields + Zod refinements
- `packages/shared/src/types/config.ts` — allowBinaryAgents, StorageBackendConfig
- `packages/core/src/storage/migrations/026_agent_profile_types.sql` — NEW
- `packages/core/src/agents/storage.ts` — ProfileRow + profileFromRow + create/update
- `packages/core/src/agents/manager.ts` — type dispatch, executeBinaryDelegation, executeMcpBridgeDelegation, MCP fix
- `packages/core/src/extensions/types.ts` — 4 new hook points
- `packages/core/src/storage/migrations/manifest.ts` — NEW
- `packages/core/src/storage/migrations/runner.ts` — use manifest
- `packages/core/package.json` — add @fastify/static ^8.0.0
- `packages/core/src/gateway/server.ts` — SPA serving, dashboardDist option
- `packages/core/src/cli/commands/start.ts` — --dashboard-dist flag

---

## Phase 24 Corrections (2026-02-20)

Four defects discovered during the Phase 24 bug hunt:

1. **Binary timeout/kill** — `executeBinaryDelegation` was not receiving `timeoutMs` or
   `signal`; the spawned child process ran indefinitely on delegation timeout or abort.
   Fixed by adding these parameters and installing a `killChild()` helper that sends
   SIGTERM (then SIGKILL after 5 s) when either the timeout fires or the abort signal
   triggers.

2. **MCP tool not found — silent failure** — When `mcpTool` didn't match any connected
   server, `mcpBridgeToolDef` was `undefined` and `serverId` was silently coerced to `''`,
   producing an opaque error inside `callTool`. Fixed with an explicit early-return guard
   that fails the delegation with a clear "tool not found" message before the `Promise.race`.

3. **Template malformation — silent fallback** — A `mcpToolInput` template that produced
   invalid JSON after `{{task}}`/`{{context}}` interpolation was silently replaced by
   `{ task, context }`. The original template intent was lost with no signal to the caller.
   Fixed to fail the delegation with a descriptive error and a `logger.warn` entry.

4. **Extension hooks not wired** — The four hook points (`agent:binary-before-execute`,
   `agent:binary-after-execute`, `agent:mcp-bridge-before-execute`,
   `agent:mcp-bridge-after-execute`) were declared in `extensions/types.ts` but
   `SubAgentManagerDeps` had no `extensionManager` field and no `emit()` calls existed
   in either execution method. Fixed by adding the optional dep and emitting all four
   points at the correct lifecycle positions.

### Files Changed (Phase 24)
- `packages/core/src/agents/manager.ts` — all four fixes
