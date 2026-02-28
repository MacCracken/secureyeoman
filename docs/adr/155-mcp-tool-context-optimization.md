# ADR 155 — MCP Tool Context Optimization

**Date:** 2026-02-28
**Status:** Accepted

## Context

MCP tools are sent as full JSON schemas on every chat request (`AIRequest.tools`). With ~160 tools in the manifest and two-level feature gating, an average request with several feature groups enabled sends ~80 tool schemas — approximately 4,000–10,000 tokens — even when the conversation has nothing to do with those tools.

Skills already use a compact catalog + contextual expansion pattern (ADR 135). This phase applies the same discipline to MCP tools.

### Secondary bug discovered

`filterMcpTools()` treated all `github_*`-prefixed tools identically, gating Phase-70 REST API tools (`github_profile`, `github_list_repos`, `github_sync_fork`, …) under `exposeGit` instead of `exposeGithub`. This meant the 20 Phase-70 GitHub API tools were effectively inaccessible unless the user also enabled the `exposeGit` flag (a completely different feature). Fixed in the same pass.

## Decision

### 1. Fix `filterMcpTools()` github_ split bug

Introduce `isGitCliTool()` and `GITHUB_CLI_PREFIXES` to distinguish:
- **CLI git tools**: `git_*`, `github_pr_*`, `github_issue_*`, `github_repo_*` → gated by `exposeGit`
- **Phase-70 REST API tools**: all other `github_*` → gated by `exposeGithub`

### 2. Add `alwaysSendFullSchemas` config flag

New field in `McpFeatureConfig` (default `false`). When `true`, the Phase 72 relevance filter is bypassed — all feature-flag-allowed schemas are sent on every request. Useful for power users or integrations needing deterministic tool availability.

Exposed as a toggle in Security → Scope tab (between the Scope Manifest heading and the Security Tools toggle).

### 3. Add `selectMcpToolSchemas()` — two-pass selector

Replaces the direct `filterMcpTools()` call in both chat handlers:

**Pass 1** (unchanged): Feature-flag filter. Returns `allAllowed` — all tools the personality may access.

**Pass 2** (new): Relevance filter. Returns `schemasToSend` — schemas to actually include in `AIRequest.tools`:
- If `alwaysSendFullSchemas: true` → `schemasToSend = allAllowed` (bypass).
- **Core tools** (`brain_*`, `task_*`, `sys_*`, `soul_*`, `audit_*`, `intent_*`, `mem_*`, `ollama_*`, etc.) always included — they are short and almost always needed.
- **Optional-group tools**: included only when:
  - The current message contains a keyword from `TOOL_GROUP_KEYWORDS[group]`, OR
  - The recent conversation history (last 20 messages) contains a keyword for that group (proxy for "AI already used a tool from this group").
- **Custom server tools** (non-YEOMAN MCP): always included — external schemas are not controllable.

### 4. Add `buildMcpToolCatalog()` — compact catalog for system prompt

After `selectMcpToolSchemas()`, the `allAllowed` list is used to build a compact catalog block injected into the system prompt (appended to the existing soul prompt). Format mirrors the skills catalog:

```
## Available MCP Tools
Full tool schemas are loaded on-demand based on conversation context. All listed tools are available to call.

**GitHub API (OAuth)** (20): `github_profile`, `github_list_repos`, …
**Gmail** (7): `gmail_profile`, `gmail_list_messages`, …
```

This tells the AI what tools exist without sending full JSON schemas, so it can request them naturally in conversation and they will be included in the next turn's schemas.

### 5. Telemetry

Both chat handlers emit a `mcp_tools_selected` audit event (level `debug`) with:
- `tools_available_count` — total from Pass 1
- `tools_sent_count` — total from Pass 2
- `full_schemas` — whether bypass was active

### 6. Soul manager: add `github_sync_fork`

`platformTools.github` and `writeOnlyTools.github` in `soul/manager.ts` updated to include `github_sync_fork` (missed in Phase 70c).

## Architecture

```
Chat request arrives
       ↓
soulManager.composeSoulPrompt() → base system prompt
       ↓
selectMcpToolSchemas() →
  Pass 1: feature-flag filter → allAllowed[]
  Pass 2: relevance filter    → schemasToSend[]
       ↓
buildMcpToolCatalog(allAllowed) → catalog string
       ↓
Append catalog to system prompt
       ↓
AIRequest.tools = schemasToSend
       ↓
AI sees catalog in system prompt → knows all tools
AI can only invoke tools in AIRequest.tools this turn
If AI needs a group that wasn't included → context shift on next turn
```

## Alternatives Considered

- **Per-request ML relevance scoring**: Rejected — adds latency and a model dependency for a meta-task. Keyword heuristics are simpler, transparent, and effective.
- **Group-level sticky mode** (always send schemas for groups used in this session): Too coarse — session can drift. History scan (last 20 messages) achieves the same goal with natural expiry.
- **Catalog-only (no schemas at all)**: Rejected — the AI cannot invoke tools it has no schema for. Schemas are required for tool calls; the catalog is supplementary context only.
- **Change `composeSoulPrompt()` signature**: Rejected in favor of appending the catalog in chat-routes post-composition, avoiding a breaking signature change to `SoulManager`.

## Consequences

- **Token reduction**: ~60–90% of tool tokens saved on cold requests (no prior tool use, unrelated message). On-topic requests still send the relevant group's schemas.
- **GitHub API tools now work correctly**: The `exposeGithub` flag gates the Phase-70 tools as originally intended.
- **`alwaysSendFullSchemas: false` is the default**: Existing deployments get the optimization automatically on upgrade. Power users can opt out via the dashboard toggle.
- **No behavior change with `alwaysSendFullSchemas: true`**: Backward-compatible escape hatch.
- **Audit log**: `mcp_tools_selected` events at debug level for measuring real-world savings without dashboard noise.

## Files Changed

| File | Change |
|---|---|
| `packages/core/src/mcp/storage.ts` | Add `alwaysSendFullSchemas` to `McpFeatureConfig` + defaults |
| `packages/core/src/mcp/mcp-routes.ts` | Add `exposeGithub` + `alwaysSendFullSchemas` to PATCH body type |
| `packages/core/src/ai/chat-routes.ts` | Fix `filterMcpTools()` github split; add `TOOL_GROUP_KEYWORDS`, `selectMcpToolSchemas()`, `buildMcpToolCatalog()`; update both call sites; telemetry |
| `packages/core/src/soul/manager.ts` | Add `github_sync_fork` to `platformTools.github` + `writeOnlyTools.github` |
| `packages/dashboard/src/api/client.ts` | Add `alwaysSendFullSchemas` to `McpConfigResponse` + fallback |
| `packages/dashboard/src/components/ScopeManifestTab.tsx` | Add Smart Schema Delivery toggle |
| `packages/core/src/ai/mcp-tool-selection.test.ts` | 30 new unit tests for `filterMcpTools`, `selectMcpToolSchemas`, `buildMcpToolCatalog` |
| `packages/dashboard/src/components/ScopeManifestTab.test.tsx` | 4 new tests for the toggle |
