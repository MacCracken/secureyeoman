# ADR 064: Phase 19 — Per-Personality Access (Skills/MCP Separation & Integration Enforcement)

**Status**: Accepted
**Date**: 2026-02-19
**Phase**: 19 — Per-Personality Access

---

## Context

Prior to this change, the MCP "Discovered Tools" view mixed two conceptually distinct sets:

1. **Discovered tools** — tools registered by external MCP servers YEOMAN connects to as a *client* (e.g., a browser control server, a code execution server)
2. **Exposed skills** — YEOMAN's own active skills converted to `McpToolDef` shape via `mcpServer.getExposedTools()` so they can be advertised to external MCP *clients* connecting TO YEOMAN

The `/api/v1/mcp/tools` route combined both:

```typescript
const external = mcpClient.getAllTools();
const exposed = await mcpServer.getExposedTools();
const allTools = [...external, ...exposed]; // skills leaked into Discovered Tools
```

An attempt to filter skills out using `tool.serverId === localServer?.id` was silently broken: exposed tools used the hardcoded string `'secureyeoman-local'` as their `serverId`, while `localServer?.id` is a DB UUID — they never matched, and all skills always passed the filter.

Separately, installed marketplace and community skills (which land in the soul/brain skills table with `source: 'marketplace' | 'community'`) had no dedicated view. Users could filter for them in the Personal Skills tab but there was no first-class "what have I installed?" surface.

The Personality schema has carried `selectedIntegrations: string[]` since Phase 15 and is exposed in the Personality Editor UI, but it was never enforced in the message routing path — every inbound integration message was forwarded to the task executor regardless of which integrations the active personality was configured to allow. The `selectedServers` field (for MCP tools) has been enforced in `chat-routes.ts` since Phase 9; integrations lacked the equivalent gate.

Additionally, several point-of-install bugs were fixed in this phase:

- **personalityId not persisted on install** — `MarketplaceManager.install()` did not accept or forward a `personalityId`. Skills installed to a specific personality always showed as "Global" in the Personal Skills view.
- **Cost Summary data loss after restart** — `applyModelSwitch()` created a new `AIClient` without passing the existing `UsageTracker`, discarding all in-memory records. The Summary tab reads from the tracker; the History tab queries the DB directly. Every restart (or saved model default) silently cleared the Summary.

---

## Decisions

### 1. Integration Access Enforcement — Inbound Message Gate

`MessageRouter.handleInbound()` now checks the active personality's `selectedIntegrations` array against `message.integrationId` before routing to the task executor.

```
Inbound message
  → store message (always — audit trail)
  → skip if empty
  → get active personality
  → if selectedIntegrations.length > 0 AND integrationId not in list → DROP (log + return)
  → submit to task executor
```

Semantics:
- **Empty `selectedIntegrations` (default)** = allow all integrations. Fully backward compatible — no existing personality has restrictions.
- **Non-empty list** = allowlist. Only messages from listed integration IDs reach the task executor.
- Messages from blocked integrations are still **stored** (for audit) but not processed.
- Outbound responses naturally stay within the same integration (`integrationManager.sendMessage(message.integrationId, ...)`) — no separate outbound gate needed for the common case.

The pattern directly mirrors `selectedServers` enforcement in `chat-routes.ts`:

```typescript
// MCP tools (chat-routes.ts — existing)
if (!selectedServers.includes(tool.serverName)) continue;

// Integration messages (message-router.ts — new)
if (allowedIntegrations.length > 0 && !allowedIntegrations.includes(message.integrationId)) {
  logger.info(`Blocked: integration ${message.integrationId} not in personality allowlist`);
  return;
}
```

### 2. Backend: `/api/v1/mcp/tools` returns only external tools

The route now returns exactly `mcpClient.getAllTools()` — tools discovered from external MCP servers the user has added. YEOMAN's own exposed skills are irrelevant to this endpoint.

Dead code removed from `mcp-routes.ts`:
- `LOCAL_MCP_NAME`, `GIT_TOOL_PREFIXES`, `FS_TOOL_PREFIXES`, `WEB_TOOL_PREFIXES`, `WEB_SCRAPING_TOOLS`, `WEB_SEARCH_TOOLS`, `BROWSER_TOOL_PREFIXES` constants
- The broken `tool.serverId === localServer?.id` filter block

### 2. Dashboard: Dedicated "Installed" tab in Skills

A new **Installed** tab (Dashboard → Skills) sits alongside Personal Skills, Marketplace, and Community. It surfaces all soul/brain skills with `source: 'marketplace' | 'community'`.

**Features:**
- Fetches all soul skills, filters client-side for marketplace/community sources
- **Personality filter** — All Personalities / Global (No Personality) / per-personality; shows live `X of Y installed` count
- Groups results into **Marketplace** and **Community** sections with counts
- Same list-card format as Personal Skills (status badge, source label, personality/Global pill)
- Enable/disable toggle and remove (delete) actions
- Empty state guiding users to the Marketplace or Community tab to install skills

### 3. Dashboard: ConnectionsPage `isLocal` guard removed

The Discovered Tools list previously suppressed the eye/visibility-toggle button for tools belonging to `LOCAL_MCP_NAME`. Since YEOMAN's own exposed skills are no longer in the list, all tools shown are from external servers and the toggle is always rendered.

### 4. Types: `Skill.source` extended in dashboard

The dashboard-local `Skill` interface was narrowed to `'user' | 'ai_proposed' | 'ai_learned'`. Extended to include `'marketplace' | 'community'` to reflect the actual API response and enable type-safe filtering in the Installed tab.

### 5. personalityId persisted through the full install flow

`MarketplaceManager.install(id, personalityId?)` now accepts and forwards `personalityId`:
- Route extracts `personalityId` from request body and passes to manager
- `SkillCreateSchema` carries `personalityId` through to `brainManager.createSkill()`
- Brain and soul storage INSERT includes `personality_id` column
- `soulManager.listSkills()` enriches returned skills with `personalityName` via a personalities lookup
- `SkillSchema` / `SkillCreateSchema` (shared types) updated with `personalityId` and `personalityName`
- Migration `020_soul_skills_personality.sql` adds `personality_id` to `soul.skills` (mirrors `brain.skills.personality_id` from migration 002)
- Personal Skills source filter dropdown now includes Marketplace and Community options

### 6. Cost Summary tracker preserved across model switches

`applyModelSwitch()` was creating a new `AIClient` without carrying the existing `UsageTracker`, discarding all in-memory usage records. Fix:
- Added `usageTracker?: UsageTracker` to `AIClientDeps`; constructor uses it if provided, otherwise creates fresh
- `applyModelSwitch()` passes `usageTracker: this.aiClient?.getUsageTracker()` to the replacement client so accumulated records survive model switches and restarts

---

## Rationale

The MCP client role (discovering external tools) and MCP server role (exposing skills to external clients) are orthogonal. Mixing them in "Discovered Tools" made the distinction opaque and the filter logic hard to maintain. The route is now a direct, one-line reflection of `mcpClient.getAllTools()`.

The Installed tab fills a genuine gap: users needed a single place to see, enable/disable, and remove marketplace-installed skills without filtering through Personal Skills.

The personalityId and Cost Summary fixes are correctness bugs — the data was always being written or stored correctly but the code paths that read and display it were not propagating the values.

---

## Consequences

**Positive:**
- Integration access enforcement now matches MCP server enforcement — both gated by personality allowlist
- Empty allowlist = allow all (zero config required for existing deployments)
- Clean conceptual separation: Connections → MCP shows only external connections; Skills → Installed shows skills you've installed
- Backend route is a single line — no complex filter or ID-matching logic
- Personality-scoped installed skill management in one dedicated view
- Type safety for `Skill.source` across the dashboard codebase
- personalityId correctly reflected in Personal Skills and Installed tab views
- Cost Summary survives Docker rebuilds, restarts, and model switches

**Negative / Trade-offs:**
- Removing a skill via the Installed tab calls `deleteSkill()` on the soul/brain skill but does **not** mark the corresponding `marketplace.skills` row as `installed: false`. Users who remove from the Installed tab then revisit the Marketplace tab will see the skill still shown as installed until they uninstall from the Marketplace tab. This sync gap is tracked for a future release.

---

## Future

- **Sub-agent delegation integration gate** — When a sub-agent spawns with a specific personality profile, enforce that profile's `selectedIntegrations` on any outbound integration calls made by the delegated task. Requires delegation context to carry integration restrictions through the call chain.
- Align Installed → Remove with marketplace uninstall to keep the `installed` flag in sync
- Add name search/filter in the Installed tab
- Show install date and per-personality install count in the Installed tab
- Feature-flag filtering for what YEOMAN exposes to external MCP clients (the removed feature-toggle constants) belongs on the MCP Server configuration page, not the discovery route

---

## Files Changed

- `packages/core/src/integrations/message-router.ts`
- `packages/core/src/mcp/mcp-routes.ts`
- `packages/core/src/ai/client.ts`
- `packages/core/src/secureyeoman.ts`
- `packages/core/src/marketplace/manager.ts`
- `packages/core/src/marketplace/marketplace-routes.ts`
- `packages/core/src/marketplace/marketplace.test.ts`
- `packages/core/src/brain/storage.ts`
- `packages/core/src/soul/storage.ts`
- `packages/core/src/soul/manager.ts`
- `packages/core/src/storage/migrations/020_soul_skills_personality.sql`
- `packages/shared/src/types/soul.ts`
- `packages/dashboard/src/components/SkillsPage.tsx`
- `packages/dashboard/src/components/ConnectionsPage.tsx`
- `packages/dashboard/src/types.ts`
