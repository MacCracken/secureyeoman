# Changelog

All notable changes to SecureYeoman are documented in this file.

---

## Phase 19: Skills / MCP Tool Separation (2026-02-19) — [ADR 064](docs/adr/064-skills-mcp-tool-separation.md)

### Integration Access Enforcement
- **`MessageRouter.handleInbound()`** now enforces `selectedIntegrations` per-personality allowlist. Messages from integrations not in the list are dropped (logged, stored for audit, but not forwarded to the task executor). An empty `selectedIntegrations` array (the default) allows all integrations — fully backward compatible.
- **`MessageRouterDeps.getActivePersonality`** return type extended to include `selectedIntegrations?: string[]`
- **`secureyeoman.ts`** — `getActivePersonality` callback now returns `selectedIntegrations: p.body?.selectedIntegrations ?? []` alongside `voice`
- Mirrors the existing `selectedServers` MCP enforcement pattern in `chat-routes.ts`; both integration platforms and MCP servers are now gated by personality allowlist

### MCP Discovered Tools — Skills Removed, Feature Gate Corrected
- **`GET /api/v1/mcp/tools`** no longer merges YEOMAN's skill-as-tool set (`mcpServer.getExposedTools()`) into the response. Skills are not MCP tools and do not belong in the Discovered Tools view.
- **Feature config filter restored and corrected** — YEOMAN's own tools (`serverName === 'YEOMAN MCP'`) are now filtered by the global feature toggles (Git, Filesystem, Web, Browser). The previous filter checked `tool.serverId === localServer?.id` which silently failed (hardcoded string `'secureyeoman-local'` vs DB UUID — never matched). Fixed to `tool.serverName === LOCAL_MCP_NAME`.
- **Architecture**: External tools always pass through. YEOMAN's own tools pass only when the corresponding feature toggle is enabled. This is the gate between "available" and "exposed to the system"; personality `selectedServers` is the subsequent per-personality gate.

### MCP Discovered Tools — Dashboard Fixes
- **`ConnectionsPage`** — `isLocal` variable and `{!isLocal && ...}` guard removed from the tool list; all tools in the list are now toggleable (the guard was suppressing the eye button for YEOMAN tools, which are now always external-server tools).
- **`LocalServerCard` `toolCount`** — Fixed from `t.serverId === localServer.id` (always zero — same UUID mismatch) to `t.serverName === LOCAL_MCP_NAME`. The tool count on the YEOMAN MCP card now correctly reflects how many YEOMAN tools are currently exposed and updates when feature toggles change.

### Skills — Installed Tab
- **New "Installed" tab** — Dashboard → Skills now has four tabs: Personal Skills | Marketplace | Community | **Installed**
- **Installed tab** surfaces all soul/brain skills with `source: 'marketplace' | 'community'` in a single view
- **Personality filter** — All Personalities / Global (No Personality) / per-personality; shows live `X of Y installed` count
- **Grouped by source** — Marketplace section and Community section with counts
- **Same list-card format** as Personal Skills (status badge, source label, personality/Global pill, description)
- **Actions** — Enable/disable toggle and remove (delete) with a descriptive confirmation dialog
- **Empty states** — "No installed skills" with guidance to the Marketplace/Community tabs; "No skills for this personality" when filtered

### personalityId Bug Fix (Marketplace Install)
- **`MarketplaceManager.install(id, personalityId?)`** now accepts and forwards `personalityId` to `brainManager.createSkill()`. Previously all installed skills showed as "Global" regardless of which personality was selected.
- **`POST /api/v1/marketplace/:id/install`** — Route now extracts `personalityId` from request body
- **`SkillSchema` / `SkillCreateSchema`** (`packages/shared/src/types/soul.ts`) — Added `personalityId` (nullable optional) and `personalityName` (computed, excluded from create)
- **Brain storage** — `createSkill()` INSERT now includes `personality_id` column; `rowToSkill()` maps `personality_id` back
- **Soul storage** — Same `personality_id` changes for the no-brain fallback path
- **`soulManager.listSkills()`** — Enriches returned skills with `personalityName` via a personalities lookup when `personalityId` is set
- **Personal Skills source filter** — Now includes Marketplace and Community options in the dropdown
- **Migration `020_soul_skills_personality.sql`** — `ALTER TABLE soul.skills ADD COLUMN IF NOT EXISTS personality_id TEXT` with index
- **2 new tests** in `marketplace.test.ts`: personalityId persisted on install; null personalityId (Global) on install without personality

### Cost Summary — Data Loss After Restart Fix
- **Root cause** — `applyModelSwitch()` created a new `AIClient` without passing the existing `UsageTracker`, discarding all in-memory records. The Summary tab reads from the tracker; the History tab queries the DB directly. Any saved model default triggered this on every startup.
- **`AIClientDeps.usageTracker?`** — New optional field; constructor uses provided tracker if present, creates a fresh one otherwise
- **`applyModelSwitch()`** now passes `usageTracker: this.aiClient?.getUsageTracker()` so the tracker (and all its DB-seeded records) survives model switches and Docker rebuilds

### Types
- **`Skill.source`** (`packages/dashboard/src/types.ts`) — Extended from `'user' | 'ai_proposed' | 'ai_learned'` to include `'marketplace' | 'community'` to match the actual API response and enable type-safe filtering in the Installed tab

### Files Changed
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
- `docs/adr/064-skills-mcp-tool-separation.md` (new)

---

## Community Skills — Docker Fix & Dashboard Community Tab (2026-02-18)

### Docker Path Fix
- **`community-skills/`** — New directory bundled inside the project root containing the 5 seed skills. Resolves `Path not found: ../secureyeoman-community-skills` error in Docker where the external repo is outside the build context.
- **`Dockerfile`** — `COPY community-skills/ community-skills/` added to both builder and runtime stages so `/app/community-skills` is always present in the container
- **Default `COMMUNITY_REPO_PATH`** changed from `../secureyeoman-community-skills` → `./community-skills`
- **`.env`, `.env.example`, `.env.dev.example`** — Updated default and comment

### Dashboard — Community Tab
- **Three-tab layout** — Dashboard → Skills now has: **Personal Skills** | **Marketplace** | **Community**
- **Community tab** mirrors the Marketplace card grid and adds:
  - **Sync button** — calls `POST /api/v1/marketplace/community/sync`; shows inline result (added / updated / skipped / errors)
  - **Repo path + last synced** info line (from `GET /community/status`)
  - **Per-personality required** — no Global option; defaults to active personality; install disabled until personality selected; warning notice when unselected
  - **Community badge** (`GitBranch` icon) on each card
  - **Empty state** with setup instructions
- **Marketplace tab** reorganised into two named sections: **YEOMAN Built-ins** (Shield badge, primary tint) and **Published**; community skills excluded from this view
- **Shared `SkillCard` component** extracted for reuse between Marketplace and Community tabs
- **`MarketplaceSkill` type** added to `packages/dashboard/src/types.ts` (replaces `any[]` in API client)
- **`fetchMarketplaceSkills`** updated to accept optional `source` param
- **`syncCommunitySkills()`** and **`fetchCommunityStatus()`** added to dashboard API client

### Files Changed
- `community-skills/README.md` (new)
- `community-skills/skills/**/*.json` (5 seed skills, new)
- `Dockerfile`
- `packages/core/src/secureyeoman.ts`
- `packages/dashboard/src/components/SkillsPage.tsx`
- `packages/dashboard/src/api/client.ts`
- `packages/dashboard/src/types.ts`
- `packages/core/src/marketplace/marketplace.test.ts`
- `.env`, `.env.example`, `.env.dev.example`
- `docs/adr/063-community-skills-registry.md`

---

## Phase 18: Community Skills Registry (2026-02-18) — [ADR 063](docs/adr/063-community-skills-registry.md)

### Community Skills Repo (`secureyeoman-community-skills`)
- **`README.md`** — Full description, skill format spec, category list, installation instructions, liability disclaimer
- **`CONTRIBUTING.md`** — Contribution standards, quality bar, review criteria
- **`schema/skill.schema.json`** — JSON Schema (draft-07) for community skill validation; editor-side validation
- **5 seed skills** — `code-reviewer`, `sql-expert` (development); `meeting-summarizer` (productivity); `security-researcher` (security); `data-formatter` (utilities)

### Source Tracking
- **`MarketplaceSkillSchema`** (`packages/shared/src/types/marketplace.ts`) — New `source: z.enum(['builtin', 'community', 'published']).default('published')` field on all marketplace skills
- **`SkillSourceSchema`** (`packages/shared/src/types/soul.ts`) — Added `'community'` so installed community skills get `source: 'community'` in BrainSkill
- **`seedBuiltinSkills()`** — Built-in YEOMAN skills now seeded with `source: 'builtin'`
- **`install()`** — Community skills install into the Brain with `source: 'community'`; all others remain `'marketplace'`

### Sync API
- **`POST /api/v1/marketplace/community/sync`** — Reads all `*.json` files under the configured community repo path; upserts skills with `source: 'community'`; returns `{ added, updated, skipped, errors }`. Path is config-locked (no user-supplied path in body — prevents traversal).
- **`GET /api/v1/marketplace/community/status`** — Returns `{ communityRepoPath, skillCount, lastSyncedAt }`
- **`GET /api/v1/marketplace?source=community`** — Filter marketplace search by source

### Schema / DB Changes
- **`019_marketplace_source.sql`** — `ALTER TABLE marketplace.skills ADD COLUMN IF NOT EXISTS source TEXT NOT NULL DEFAULT 'published'`; retroactively tags existing YEOMAN built-ins as `source = 'builtin'`

### Environment
- **`.env`, `.env.example`, `.env.dev.example`** — `COMMUNITY_REPO_PATH` variable documented (defaults to `../secureyeoman-community-skills`)

### Files Changed
- `../secureyeoman-community-skills/README.md`
- `../secureyeoman-community-skills/CONTRIBUTING.md`
- `../secureyeoman-community-skills/schema/skill.schema.json`
- `../secureyeoman-community-skills/skills/development/code-reviewer.json`
- `../secureyeoman-community-skills/skills/development/sql-expert.json`
- `../secureyeoman-community-skills/skills/productivity/meeting-summarizer.json`
- `../secureyeoman-community-skills/skills/security/security-researcher.json`
- `../secureyeoman-community-skills/skills/utilities/data-formatter.json`
- `packages/shared/src/types/marketplace.ts`
- `packages/shared/src/types/soul.ts`
- `packages/core/src/storage/migrations/019_marketplace_source.sql`
- `packages/core/src/marketplace/storage.ts`
- `packages/core/src/marketplace/manager.ts`
- `packages/core/src/marketplace/marketplace-routes.ts`
- `packages/core/src/marketplace/marketplace.test.ts`
- `packages/core/src/secureyeoman.ts`
- `.env`, `.env.example`, `.env.dev.example`
- `docs/adr/063-community-skills-registry.md`
- `docs/development/roadmap.md`

---

## Dashboard: Productivity Tab — Airtable, Todoist, Spotify, YouTube (2026-02-18)

Four new platform options added to the Connections → Integrations → **Productivity** tab. All four platforms were already reserved in `PlatformSchema`; this release adds the dashboard UI metadata (`PLATFORM_META` entries) and surfaces them in the Productivity tab.

- **Airtable** — personal access token + optional Base ID; record management and view filtering
- **Todoist** — API token; task and project management
- **Spotify** — Client ID + Client Secret + OAuth2 refresh token; playback control and playlist access
- **YouTube** — YouTube Data API v3 key; video search, channel data, playlist management

### Files changed
- **`packages/dashboard/src/components/ConnectionsPage.tsx`** — `Database`, `ListTodo`, `Music2`, `PlayCircle` imported from lucide-react; `airtable`, `todoist`, `spotify`, `youtube` `PLATFORM_META` entries added; all four added to `PRODUCTIVITY_PLATFORMS`
- **`packages/dashboard/src/components/ConnectionsPage.test.tsx`** — 4 new platform visibility tests under the Productivity sub-tab
- **`docs/guides/integrations.md`** — 4 platforms added to the supported platform table and the tab organisation table
- **`docs/development/roadmap.md`** — Airtable, Todoist, Spotify, YouTube marked `[x]`; Spotify and YouTube moved from Services & Cloud into Productivity Integrations section

---

## Dashboard: Integration Access Control & Branding Fix (2026-02-18)

### Connections — Email tab
- Fixed branding copy: "Friday" replaced with "SecureYeoman" in the Email tab description, Gmail label tooltip, and Gmail label placeholder.

### Personality Editor — Integration Access
- **`packages/shared/src/types/soul.ts`** — `selectedIntegrations: z.array(z.string()).default([])` added to `BodyConfigSchema` alongside the existing `selectedServers` field.
- **`packages/dashboard/src/components/PersonalityEditor.tsx`** — New **Integration Access** collapsible section in the Body panel (mirrors the MCP Connections section). Fetches configured integrations from `/api/v1/integrations`; displays each integration as a labelled checkbox (displayName + platform); selected IDs are persisted in `body.selectedIntegrations`. An empty selection means no restriction — all integrations are accessible. `selectedIntegrations` state wired through load, save, and `BodySectionProps`.
- **`docs/development/roadmap.md`** — Roadmap item added for backend enforcement of `selectedIntegrations` (per-personality inbound routing gate + sub-agent delegation chain enforcement).

---

## Dashboard: Productivity Integration View (2026-02-18) — [ADR 062](docs/adr/062-productivity-view-calendar-consolidation.md)

### Dashboard — Connections › Integrations sub-tabs

- **New "Productivity" sub-tab** added to Connections → Integrations, positioned between Calendar and DevOps. Surfaces Notion, Stripe, Google Calendar, and Linear — tools centred on work and productivity workflows.
- **Calendar sub-tab removed** — Google Calendar moved into the Productivity tab; the standalone Calendar view is no longer necessary.
- **Stripe moved** from `DEVOPS_PLATFORMS` to `PRODUCTIVITY_PLATFORMS` — better reflects its role as a business/productivity service rather than a DevOps tool.
- **Linear** remains in `PRODUCTIVITY_PLATFORMS`; now surfaces exclusively under the Productivity tab (previously shown alongside DevOps).
- **`packages/dashboard/src/components/ConnectionsPage.tsx`** — `IntegrationSubTab` union updated; `CALENDAR_PLATFORMS` constant removed; `PRODUCTIVITY_PLATFORMS` extended with `googlecalendar` and `stripe`; `DEVOPS_PLATFORMS` no longer contains `stripe`; `unregisteredCalendarPlatforms` variable removed; `unregisteredProductivityPlatforms` variable added; sub-tab array and render blocks updated.
- **`packages/dashboard/src/components/ConnectionsPage.test.tsx`** — Stripe and Linear platform tests updated to navigate to the Productivity sub-tab; Google Calendar and Notion platform tests added under Productivity; Calendar sub-tab navigation removed; Productivity sub-tab navigation test added.

---

## Phase 18: Services & Messaging Integrations (2026-02-18) — [ADR 061](docs/adr/061-phase18-services-messaging-integrations.md)

### Services Integrations

- **Figma** (`packages/core/src/integrations/figma/`) — REST polling adapter; polls file comments via `X-Figma-Token`; `sendMessage()` posts comments; `testConnection()` via `GET /v1/me`; One-Click MCP Featured Server (`figma-developer-mcp`, requires `FIGMA_API_KEY`)
- **Stripe** (`packages/core/src/integrations/stripe/`) — `WebhookIntegration`; verifies `Stripe-Signature` HMAC-SHA256 (`t=<ts>,v1=<sig>` format); handles `payment_intent.succeeded/failed`, `customer.created/deleted`, `invoice.paid/payment_failed`; `testConnection()` via `GET /v1/account`; One-Click MCP Featured Server (`@stripe/mcp-server-stripe`, requires `STRIPE_SECRET_KEY`)
- **Zapier** (`packages/core/src/integrations/zapier/`) — `WebhookIntegration`; receives Zap trigger payloads inbound; `sendMessage()` POSTs to configured catch-hook URL; optional HMAC verification; One-Click MCP Featured Server (`@zapier/mcp-server`, requires `ZAPIER_API_KEY`)

### Productivity Integrations

- **Linear** (`packages/core/src/integrations/linear/`) — `WebhookIntegration`; HMAC-SHA256 signature verification (optional — unsigned events accepted if no secret configured); handles `Issue` create/update/remove and `Comment` events; `sendMessage()` creates issues via Linear GraphQL `issueCreate` mutation; `testConnection()` via `viewer` query; One-Click MCP Featured Server (`@linear/mcp-server`, requires `LINEAR_API_KEY`)

### Messaging Integrations

- **QQ** (`packages/core/src/integrations/qq/`) — OneBot v11 (CQ-HTTP/go-cqhttp) HTTP API; polls `/get_friend_list` for health; sends via `/send_private_msg` and `/send_group_msg`; `handleInboundEvent()` for OneBot HTTP push; `testConnection()` via `/get_login_info`
- **DingTalk** (`packages/core/src/integrations/dingtalk/`) — `WebhookIntegration`; custom robot webhook inbound/outbound; text and markdown message support; `sessionWebhook` in-conversation reply routing; optional HMAC token verification; `testConnection()` verifies outbound URL
- **Line** (`packages/core/src/integrations/line/`) — `WebhookIntegration`; HMAC-SHA256 base64 signature verification; handles message (text/sticker/image), follow, unfollow, join, leave events; reply-token and push-message outbound paths; `testConnection()` via `GET /v2/bot/info`

### Platform Enum & UI

- **`packages/shared/src/types/integration.ts`** — `qq`, `dingtalk`, `line` added to `PlatformSchema` (linear was pre-existing)
- **`packages/core/src/integrations/types.ts`** — rate limits for all 7 new platforms
- **`packages/core/src/secureyeoman.ts`** — 7 new `registerPlatform()` calls with imports
- **`packages/dashboard/src/components/ConnectionsPage.tsx`** — 7 new `PLATFORM_META` entries (Figma/CreditCard/Zap/Building2/LayoutGrid icons); figma+stripe+zapier added to `DEVOPS_PLATFORMS`; linear added to `PRODUCTIVITY_PLATFORMS`
- **`packages/dashboard/src/components/McpPrebuilts.tsx`** — Figma, Stripe, Zapier, Linear added to `PREBUILT_SERVERS` (8 total featured servers)
- **`packages/dashboard/src/components/ConnectionsPage.test.tsx`** — 11 new tests: 7 platform name visibility tests + 4 MCP featured server tab tests

---

## Phase 17: ML Security & Sandbox Isolation — Complete (2026-02-18) [ADR 060](docs/adr/060-ml-security-sandbox-isolation.md)

- `allowAnomalyDetection` global policy toggle (ML anomaly detection engine, default off)
- `sandboxGvisor` global policy toggle (gVisor kernel isolation layer, default off)
- `sandboxWasm` global policy toggle (WASM execution isolation, default off)
- Dashboard: ML Security card (Brain icon) + Sandbox Isolation card (Cpu icon) in Settings → Security
- CLI: 3 new flags in `secureyeoman policy get` / `secureyeoman policy set`
- 8 new SecuritySettings tests; all existing tests updated with 3 new mock fields

---

## Phase 17: Dynamic Tool Creation — [ADR 059](docs/adr/059-dynamic-tool-creation.md)

Global `allowDynamicTools` / `sandboxDynamicTools` security policy toggles; per-personality `allowDynamicTools` in creation config; `secureyeoman policy` CLI command.

- **`packages/shared/src/types/config.ts`** — Added `allowDynamicTools: z.boolean().default(false)` and `sandboxDynamicTools: z.boolean().default(true)` to `SecurityConfigSchema`
- **`packages/shared/src/types/soul.ts`** — Added `allowDynamicTools: z.boolean().default(false)` to `CreationConfigSchema`
- **`packages/core/src/secureyeoman.ts`** — `updateSecurityPolicy()` and `loadSecurityPolicyFromDb()` handle both DTC flags
- **`packages/core/src/gateway/server.ts`** — GET/PATCH `/api/v1/security/policy` include `allowDynamicTools` and `sandboxDynamicTools`
- **`packages/dashboard/src/api/client.ts`** — `SecurityPolicy` interface and fallback defaults updated
- **`packages/dashboard/src/components/SecuritySettings.tsx`** — Dynamic Tool Creation card (Wrench icon) after Sub-Agent Delegation; Sandboxed Execution sub-toggle visible only when DTC enabled; `Wrench` imported from lucide-react
- **`packages/dashboard/src/components/PersonalityEditor.tsx`** — `allowDynamicTools` added to `creationConfig` state, `creationItems`, `toggleCreationItem` key union, and `toggleAllCreation`; `dtcBlockedByPolicy` gate respects global policy
- **`packages/core/src/cli/commands/policy.ts`** — New `secureyeoman policy` CLI command: `get`, `set <flag> <true|false>`, `dynamic-tools get|enable|disable`, `dynamic-tools sandbox enable|disable`, `dynamic-tools personality get|enable|disable [--personality-id ID]`
- **`packages/core/src/cli/commands/policy.test.ts`** — 8 CLI tests
- **`packages/core/src/cli.ts`** — `policyCommand` registered
- **`packages/dashboard/src/components/SecuritySettings.test.tsx`** — All mock policy objects updated with DTC fields; 7 new DTC tests + AI model default persistence test
- **`docs/adr/059-dynamic-tool-creation.md`** — ADR: opt-in model, sandbox-first approach, AI model default persistence status
- **`docs/development/roadmap.md`** — DTC marked `[x]`

---

## Phase 17: WebGL Graph Rendering — [ADR 058](docs/adr/058-webgl-graph-rendering.md)

sigma.js + graphology + ForceAtlas2 layout; reusable `WebGLGraph` component; applied to delegation trees and A2A peer network topology.

- **`packages/dashboard/package.json`** — Added `graphology ^0.25.4`, `sigma ^2.4.0`, `@react-sigma/core ^3.5.0`, `graphology-layout-forceatlas2 ^0.10.1`
- **`packages/dashboard/src/components/WebGLGraph.tsx`** — New reusable WebGL graph component: WebGL detection with graceful fallback, `SigmaContainer` + `GraphLoader` inner component pattern, ForceAtlas2 auto-layout (100 iterations), `onNodeClick` event wiring
- **`packages/dashboard/src/components/WebGLGraph.test.tsx`** — 7 tests: WebGL available/unavailable, node/edge count, click event, custom height, empty graph
- **`packages/dashboard/src/components/SubAgentsPage.tsx`** — Delegation detail "Show Execution Tree" section gains `List` / `Share2` view toggle; graph mode renders colored nodes (status colors) with delegation tree edges
- **`packages/dashboard/src/components/A2APage.tsx`** — New 4th "Network" tab: peer topology graph with trust-level node colors and online/offline edge colors; trust-level and edge-color legend; empty state when no peers

---

## Phase 17: Agent Swarms — Complete (2026.2.18)

### Swarms Security Policy & Per-Personality Sub-Agent Settings — [ADR 057](docs/adr/057-swarms-policy-and-per-personality-subagent-settings.md)
Global `allowSwarms` policy toggle and per-personality A2A/Swarms enablement in creation config.

- **`packages/shared/src/types/config.ts`** — Added `allowSwarms: z.boolean().default(false)` to `SecurityConfigSchema`
- **`packages/shared/src/types/soul.ts`** — Added `allowA2A` and `allowSwarms` boolean fields to `CreationConfigSchema`
- **`packages/core/src/secureyeoman.ts`** — `updateSecurityPolicy()` and `loadSecurityPolicyFromDb()` handle `allowSwarms`
- **`packages/core/src/gateway/server.ts`** — GET/PATCH `/api/v1/security/policy` include `allowSwarms`
- **`packages/dashboard/src/api/client.ts`** — `SecurityPolicy` interface includes `allowSwarms`
- **`packages/dashboard/src/components/SecuritySettings.tsx`** — Agent Swarms toggle nested under Sub-Agent Delegation alongside A2A, uses `Layers` icon
- **`packages/dashboard/src/components/SubAgentsPage.tsx`** — Swarms tab positioned second (`active → swarms → history → profiles`); hidden when `allowSwarms` is false; `useEffect` resets to Active tab when policy is disabled
- **`packages/dashboard/src/components/PersonalityEditor.tsx`** — A2A Networks and Agent Swarms nested sub-toggles appear when `creationConfig.subAgents` is enabled; both respect global security policy (shown as "Blocked" when policy disallows)
- **Tests** — 3 new tests in `SecuritySettings.test.tsx`, 2 new tests in `SubAgentsPage.test.tsx`

### Per-Personality Model Fallbacks — [ADR 056](docs/adr/056-per-personality-model-fallbacks.md)
Each personality can define an ordered fallback chain (max 5) tried when the primary model fails.

- **`packages/shared/src/types/soul.ts`** — `ModelFallbackEntrySchema` + `modelFallbacks: z.array(...).max(5).default([])` on `PersonalitySchema`
- **`packages/core/src/storage/migrations/018_personality_model_fallbacks.sql`** — `model_fallbacks JSONB NOT NULL DEFAULT '[]'`
- **`packages/core/src/soul/storage.ts`** — `PersonalityRow`, `rowToPersonality`, `createPersonality`, `updatePersonality` include `model_fallbacks`
- **`packages/core/src/ai/client.ts`** — `chat()` and `chatStream()` accept optional `requestFallbacks`; per-request fallbacks override system fallbacks
- **`packages/core/src/ai/chat-routes.ts`** — `resolvePersonalityFallbacks()` maps personality `modelFallbacks` to `FallbackModelConfig[]` and passes to `aiClient.chat()`
- **`packages/dashboard/src/components/PersonalityEditor.tsx`** — Model Fallbacks UI after Default Model; Include Sacred Archetypes moved to after System Prompt; `pendingFallback` dropdown filtered to exclude default and already-added models
- **`packages/core/src/cli/commands/model.ts`** — `personality-fallbacks get/set/clear` subcommand with `--personality-id`
- **Tests** — 5 new storage tests, 9 new CLI tests

### Agent Swarms — [ADR 055](docs/adr/055-agent-swarms.md)
Coordinated multi-agent execution with role-based specialization, built on top of the existing sub-agent delegation system (ADR 034).

- **`packages/shared/src/types/swarm.ts`** — Zod schemas: `SwarmStrategy`, `SwarmStatus`, `SwarmRoleConfig`, `SwarmTemplate`, `SwarmMember`, `SwarmRun`, `SwarmRunParams`
- **`packages/core/src/storage/migrations/017_swarms.sql`** — Tables: `agents.swarm_templates`, `agents.swarm_runs`, `agents.swarm_members` with indexes
- **`packages/core/src/agents/swarm-templates.ts`** — `BUILTIN_SWARM_TEMPLATES`: `research-and-code`, `analyze-and-summarize`, `parallel-research`, `code-review`
- **`packages/core/src/agents/swarm-storage.ts`** — `SwarmStorage` extending `PgBaseStorage`; template CRUD, run lifecycle, member tracking
- **`packages/core/src/agents/swarm-manager.ts`** — `SwarmManager`; dispatches `sequential` (for-loop with context chaining), `parallel` (`Promise.all` + optional coordinator), `dynamic` (single coordinator delegation) strategies via `SubAgentManager.delegate()`
- **`packages/core/src/agents/swarm-routes.ts`** — REST: `GET/POST /api/v1/agents/swarms/templates`, `POST/GET/GET/:id/POST/:id/cancel /api/v1/agents/swarms`
- **`packages/core/src/agents/tools.ts`** — Added `create_swarm` MCP tool
- **`packages/core/src/extensions/types.ts`** — Added `'swarm:before-execute'` and `'swarm:after-execute'` hook points
- **`packages/dashboard/src/components/SwarmsPage.tsx`** — Template grid with strategy badges + role chip pipeline, launch form, run history with member pipeline
- **`packages/dashboard/src/components/SwarmsPage.test.tsx`** — Disabled state, template cards, strategy badge, Launch button, run history
- **`packages/dashboard/src/components/SubAgentsPage.tsx`** — Added 4th tab `'swarms'` with `Layers` icon

---

## Phase 16: Integration Enhancements — Complete (2026.2.18)

### Storybook Developer Integration — [ADR 054](docs/adr/054-storybook-developer-integration.md)
Component development environment integrated into Developers section as its own subview; gated by `allowStorybook` security policy toggle in Settings > Security > Developers; disabled state mirrors Experiments pattern; enabled state provides quick-start instructions, component story gallery, and iframe to localhost:6006

### Platform-Specific Integration Enhancements — [ADR 053](docs/adr/053-platform-specific-integration-enhancements.md)
- **Telegram** — `callback_query:data` handler normalises inline keyboard button taps to `UnifiedMessage` (metadata: `callbackData`, `callbackQueryId`); `message:document` handler adds file attachments with `metadata.fileId`; `sendMessage()` forwards `replyMarkup` metadata as `reply_markup` to grammy
- **Discord** — Upgraded to discord.js v14 (`GatewayIntentBits`, `EmbedBuilder`, `addFields`, `REST`, `Routes`, `MessageContent` intent); slash command registration via `REST.put` on the `ready` event (guild-scoped = instant, global = ~1 hour); thread channel detection via `ChannelType` (`metadata.isThread`, `metadata.threadId`); `/feedback` slash command opens a `ModalBuilder` paragraph input; modal submit handler normalises to `UnifiedMessage` with `metadata.isModalSubmit`; `sendMessage()` supports `threadId` and `startThread` metadata
- **Slack** — `app.action({ type: 'button' }, ...)` normalises Block Kit button interactions to `UnifiedMessage` with `metadata.isBlockAction`; `sendMessage()` passes `blocks` metadata to `chat.postMessage`; `/friday-modal` command opens a `plain_text_input` modal via `client.views.open`; `app.view('friday_modal', ...)` submission normalised with `metadata.isModalSubmit`; `WorkflowStep('friday_process', ...)` registered for Slack Workflow Builder with `metadata.isWorkflowStep`
- **GitHub** — `pull_request_review` and `pull_request_review_comment` webhook handlers normalise review events (metadata: `reviewState`, `reviewId`, `path`, `line`); `sendMessage()` with `metadata.reviewEvent` calls `octokit.pulls.createReview` instead of `issues.createComment`; issue auto-labeling on `opened` events via `config.autoLabelKeywords: Record<string, string[]>`; code search trigger detection on `@friday search:` comments sets `metadata.isCodeSearchTrigger` and `metadata.searchQuery`

### ChromaDB Vector Backend
- **`packages/core/src/brain/vector/chroma-store.ts`** — new `ChromaVectorStore` implementing the `VectorStore` interface; connects to a running ChromaDB server via its HTTP REST API v1; cosine similarity (`hnsw:space: cosine`; `score = 1 − distance`); no extra npm dependencies — uses Node.js global `fetch`; collection UUID caching with `withReconnect<T>` retry pattern (clears cached ID and retries once on transient failure); clamps `n_results` to collection count to prevent ChromaDB's `n_results > count` error
- **`packages/shared/src/types/soul.ts`** — added `'chroma'` to `VectorConfigSchema` backend enum; added `chroma` config section with `url` (default `http://localhost:8000`) and `collection` (default `secureyeoman_memories`) fields
- **`packages/core/src/brain/vector/index.ts`** — factory updated to instantiate `ChromaVectorStore` when `config.backend === 'chroma'`; exports `ChromaVectorStore` and `ChromaStoreConfig`
- **`packages/core/src/brain/vector/chroma-store.test.ts`** — 24 tests using `vi.stubGlobal('fetch', ...)` (no real ChromaDB server required); covers: `ensureCollection` error propagation, collection UUID caching/reuse, `insert`/`insertBatch`, cosine distance → similarity conversion, threshold filtering, `n_results` clamping, `delete`, `count`, `healthCheck`, `close` (cache invalidation), reconnect retry

---

## Phase 15: Integration Expansion — Complete (2026.2.18) — [ADR 049](docs/adr/049-dynamic-integration-loading.md), [ADR 050](docs/adr/050-oauth2-first-class-support.md), [ADR 051](docs/adr/051-webhook-transformation-rules.md), [ADR 052](docs/adr/052-outbound-webhooks.md), [ADR 048](docs/adr/048-eslint-ajv-vulnerability-accepted-risk.md)

### AI Model System Default
- **Migration 016** — `system_preferences` PostgreSQL table (`key TEXT PRIMARY KEY`, `value TEXT`, `updated_at BIGINT`) — generic key-value store for system-level settings
- **`SystemPreferencesStorage`** — new `packages/core/src/config/system-preferences-storage.ts`; extends `PgBaseStorage`; methods: `init()`, `get(key)`, `set(key, value)` (upsert via `ON CONFLICT`), `delete(key)`, `list()`
- **`SecureYeoman`** — initializes `SystemPreferencesStorage` at Step 5.6; after `AIClient.init()` applies stored `model.provider` / `model.model` via `switchModel()`; new public methods: `setModelDefault(provider, model)` (validates, switches, persists), `clearModelDefault()` (removes both keys), `getModelDefault()` (returns `{ provider, model }` or `null`); new `getSystemPreferences()` accessor
- **`GET /api/v1/model/default`** — returns `{ provider, model }` (either set values or `null / null`)
- **`POST /api/v1/model/default`** — sets persistent model default; body: `{ provider, model }`
- **`DELETE /api/v1/model/default`** — clears persistent model default
- **Dashboard API client** — new `ModelDefaultResponse` interface; `fetchModelDefault()`, `setModelDefault(data)`, `clearModelDefault()` functions added to `packages/dashboard/src/api/client.ts`
- **Settings > Security** — "AI Model Default" card added as the **top section** (above MCP Servers); shows current default badge (green = set, muted = using config file); provider `<select>` with all 9 providers + model `<input>` + Set Default button + Clear link; queries `['model-default']` and `['model-info']`; mutations invalidate both query keys on success
- **`secureyeoman model` CLI command** — new `packages/core/src/cli/commands/model.ts`; subcommands: `info` (show current provider/model/maxTokens/temperature), `list [--provider PROV]` (list available models with pricing), `switch <provider> <model>` (transient), `default get/set/clear` (persistent); `--json` flag; default URL `http://127.0.0.1:18789`; registered in `cli.ts`

### Settings Security Reorganization
- **MCP Servers card moved to top** — Settings > Security — MCP Servers card moved to the top of the security settings list for higher visibility; now appears before Proactive Assistance, Multimodal I/O, Sub-Agent Delegation, and Code Execution cards

### Cost History View
- **Migration 015** — `015_usage_personality.sql` adds `personality_id TEXT` column and index to `usage_records` table
- **`UsageRecord.personalityId?`** — Optional `personalityId` field added to the `UsageRecord` interface in `usage-tracker.ts`
- **`UsageStorage` updated** — `insert()` persists `personality_id`; `loadRecent()` maps it back; new `queryHistory(filter)` method returns SQL-aggregated rows grouped by day or hour with SUM of tokens/cost and COUNT of calls; supports optional `from`, `to`, `provider`, `model`, `personalityId`, and `groupBy` filters
- **`AIClient.setSoulManager()`** — New method for post-construction SoulManager injection; `trackUsage()` and streaming `done` chunk handler both call `soulManager.getActivePersonality()` to populate `personalityId` on each usage record
- **`SecureYeoman`** — Calls `aiClient.setSoulManager()` immediately after SoulManager initialization; stores `usageStorage` as a class field with `getUsageStorage()` accessor
- **`GET /api/v1/costs/history`** — New gateway endpoint; query params: `from`, `to`, `provider`, `model`, `personalityId`, `groupBy` (day|hour); returns `{ records, totals }`
- **`fetchCostHistory(params)`** — New dashboard API client function with `CostHistoryParams`, `CostHistoryRow`, and `CostHistoryResponse` types
- **CostsPage History tab** — Summary/History tab switcher added to Cost Analytics page; History tab has filter bar (From, To, Provider, Model, Personality dropdown from API, Group By), results table with Date / Provider / Model / Personality / Tokens / Cost / Calls columns, totals footer row, and empty state

### Email (SMTP) Confirmed Operational
- **Email integration confirmed fully operational** — IMAP receive + SMTP send implemented in `packages/core/src/integrations/email/adapter.ts` (374 lines); registered in `secureyeoman.ts`; documented in `docs/guides/integrations.md` with provider presets
- **REST API docs updated** — `docs/api/rest-api.md` POST /api/v1/integrations section now includes a complete Email (SMTP) curl example showing all 12 config fields with ProtonMail Bridge defaults and a config field reference table

### OAuth2 First-Class Support — [ADR 050](docs/adr/050-oauth2-first-class-support.md)
- **`oauth_tokens` PostgreSQL table** (migration 012) — unified storage for OAuth2 tokens with `UNIQUE(provider, email)` constraint; `upsertToken` keeps the record current on re-authentication
- **`OAuthTokenStorage`** — CRUD wrapper; `listTokens()` returns metadata only (no raw token values)
- **`OAuthTokenService`** — automatic token refresh 5 minutes before expiry via Google's token endpoint; `getValidToken(provider, email)` is the single access point for all integrations
- **`googlecalendar` and `googledrive` OAuth providers** — added to `OAUTH_PROVIDERS` in `oauth-routes.ts`; both request `access_type=offline` so refresh tokens are issued; redirect to `/connections/calendar` and `/connections/drive` respectively
- **`GoogleCalendarIntegration` updated** — uses `OAuthTokenService` when `oauthTokenService` dep is available and `email` is set in config; falls back to inline token path for backward compatibility
- **`IntegrationManager.setOAuthTokenService()`** — enables post-construction injection (parallel to `setMultimodalManager`)
- **`GET /api/v1/auth/oauth/tokens`** — list all stored OAuth tokens (provider, email, scopes, expiry — no raw token values)
- **`DELETE /api/v1/auth/oauth/tokens/:id`** — revoke a stored token
- **`truncateAllTables()` updated** — now also truncates public-schema user tables so `oauth_tokens`, `usage_records`, and future tables are cleaned between tests

### Outbound Webhooks — [ADR 052](docs/adr/052-outbound-webhooks.md)
- **`outbound_webhooks` PostgreSQL table** (migration 014) — stores event-subscribed HTTP callback endpoints; tracks `last_fired_at`, `last_status_code`, `consecutive_failures` for delivery health monitoring
- **`OutboundWebhookStorage`** — CRUD with `listForEvent(event)` using PostgreSQL `@>` JSONB containment for efficient subscriber lookup; `recordSuccess()`/`recordFailure()` update delivery counters
- **`OutboundWebhookDispatcher`** — fire-and-forget delivery with exponential backoff retries (default 3 retries, 1 s base); `X-SecureYeoman-Event` header always included; `X-Webhook-Signature` HMAC-SHA256 header included when `secret` is configured
- **Event types**: `message.inbound`, `message.outbound`, `integration.started`, `integration.stopped`, `integration.error`
- **`IntegrationManager`** — fires `integration.started`, `integration.stopped`, `integration.error`, and `message.outbound` events; dispatcher injected via `setOutboundWebhookDispatcher()`
- **`MessageRouter`** — fires `message.inbound` at the start of `handleInbound()`; dispatcher injected via `setOutboundWebhookDispatcher()`
- **`SecureYeoman.getMessageRouter()`** — new accessor for the gateway server to wire the dispatcher into the message router
- **`GET /api/v1/outbound-webhooks`** — list subscriptions (filter: `enabled`)
- **`GET /api/v1/outbound-webhooks/:id`** — retrieve a subscription
- **`POST /api/v1/outbound-webhooks`** — create a subscription
- **`PUT /api/v1/outbound-webhooks/:id`** — update a subscription (partial)
- **`DELETE /api/v1/outbound-webhooks/:id`** — delete a subscription

### Webhook Transformation Rules — [ADR 051](docs/adr/051-webhook-transformation-rules.md)
- **`webhook_transform_rules` PostgreSQL table** (migration 013) — stores ordered JSONPath extraction rules per integration (or globally with `integration_id = NULL`); fields: `match_event`, `priority`, `enabled`, `extract_rules` (JSONB), `template`
- **`WebhookTransformStorage`** — CRUD wrapper with `listRules(filter?)` that returns integration-specific rules plus global (null integrationId) rules, sorted by priority ascending
- **`WebhookTransformer`** — applies matching rules to raw inbound payloads; supports JSONPath subset (`$.field`, `$.a.b`, `$.arr[0].field`), `default` fallback values, `{{field}}` template rendering, `matchEvent` header filter, and per-rule `enabled` toggle
- **`/api/v1/webhooks/custom/:id` updated** — transformation patch applied between signature verification and `adapter.handleInbound()`; reads `X-Webhook-Event` header for event-type filtering
- **`GET /api/v1/webhook-transforms`** — list all transform rules (filter: `integrationId`, `enabled`)
- **`GET /api/v1/webhook-transforms/:id`** — retrieve a single rule
- **`POST /api/v1/webhook-transforms`** — create a new transform rule
- **`PUT /api/v1/webhook-transforms/:id`** — update a rule (partial update)
- **`DELETE /api/v1/webhook-transforms/:id`** — delete a rule

### Dynamic Integration Loading — [ADR 049](docs/adr/049-dynamic-integration-loading.md)
- **`IntegrationManager.reloadIntegration(id)`** — stops a running integration, re-fetches the latest config from PostgreSQL, and starts a fresh adapter instance; enables zero-downtime credential rotation (update via `PUT /api/v1/integrations/:id` then call `/reload`)
- **`IntegrationManager.setPluginLoader()` / `getLoadedPlugins()` / `loadPlugin()`** — plugin loader attached to the manager for runtime plugin introspection and on-demand loading
- **`INTEGRATION_PLUGIN_DIR` env var** — on startup, SecureYeoman scans the directory for `.js`/`.mjs` plugin files and registers each as a platform factory; plugins not present in the binary are auto-discovered
- **`POST /api/v1/integrations/:id/reload`** — reload a single integration in-place without affecting others
- **`GET /api/v1/integrations/plugins`** — list all externally loaded plugins (platform, path, schema presence)
- **`POST /api/v1/integrations/plugins/load`** — load an external plugin at runtime from an absolute file path and register its platform factory immediately

### Lifecycle Hook Debugger
- **`HookExecutionEntry` type** — new entry shape in `types.ts`: hookPoint, handlerCount, durationMs, vetoed, errors, timestamp, isTest flag
- **`ExtensionManager` execution log** — in-memory circular buffer (max 200 entries); every `emit()` call appends an entry after dispatch
- **`ExtensionManager.testEmit()`** — fires a test emit at any hook point with optional JSON payload; entries are marked `isTest: true` so the UI can distinguish them from live events
- **`ExtensionManager.getExecutionLog()`** — returns entries newest-first, optionally filtered by hook point and limited in count
- **Two new API routes** on `extension-routes.ts`:
  - `GET /api/v1/extensions/hooks/log?hookPoint=&limit=` — query the execution log
  - `POST /api/v1/extensions/hooks/test` — trigger a test emit, returns `{ result, durationMs }`
- **Debugger tab** added as the 4th tab on `ExtensionsPage` (Extensions → Hooks → Webhooks → **Debugger**):
  - **Test Trigger panel** — grouped `<optgroup>` selector covering all 38 hook points across 9 categories, JSON payload textarea, **Fire Test** button, inline result chip showing OK / vetoed / errors + duration
  - **Execution Log** — live-refreshing list (5 s interval, manual refresh button), filter by hook point, colored left-border per outcome (green OK, yellow vetoed, red error), `test` purple badge for manually fired events, handler count, duration, error preview with overflow tooltip, timestamp
  - Empty state with guidance to use the test trigger or wait for system events

### Developers Sidebar & Settings Consolidation
- **New `DeveloperPage`** — unified "Developers" view in the dashboard sidebar that hosts both the Extensions and Experiments pages as switchable tab views (Extensions | Experiments tabs)
- **Sidebar** — replaced the separate Extensions and Experiments nav items with a single **Developers** entry; item is visible when either feature is enabled (`allowExtensions || allowExperiments`)
- **Settings > Security** — Extensions and Experiments policy toggles removed from their standalone cards and consolidated into a new **Developers** section at the bottom of the security settings list; section mirrors the Sub-Agent Delegation layout with both toggles as sub-items
- Old `/extensions` and `/experiments` routes now redirect to `/developers` for backward compatibility

### AI Cost Persistence
- **`UsageStorage`** — new `PgBaseStorage`-backed storage class (`packages/core/src/ai/usage-storage.ts`) with a `usage_records` PostgreSQL table; persists every AI call (provider, model, token breakdown, cost, timestamp)
- **`UsageTracker`** — now accepts an optional `UsageStorage`; `record()` writes to DB fire-and-forget; new async `init()` loads the last 90 days of records on startup so daily/monthly cost totals survive process restarts
- **`AIClient`** — accepts `usageStorage` in `AIClientDeps`; exposes `init()` that delegates to the tracker
- **`SecureYeoman`** — creates and initialises `UsageStorage`, wires it to `AIClient`, and calls `aiClient.init()` during startup (Step 5.6); 90-day retention window with indexed `recorded_at` for fast rollup queries

### MCP Tool API Migration (from previous session)
- All 42 `server.tool()` calls across 10 MCP tool files migrated to the non-deprecated `server.registerTool()` API
- `SSEServerTransport` in `packages/mcp/src/transport/sse.ts` kept for legacy client compat with targeted `eslint-disable` comments
- Removed unused `fetchWithRetry` and `ProxyRequestOptions` imports from `web-tools.ts`

### CLI Modernization
- **New CLI commands** for managing recent subsystems:
  - `secureyeoman browser` — Manage browser automation sessions (list, stats, config, session details)
  - `secureyeoman memory` — Vector memory operations (search, memories, knowledge, stats, consolidate, reindex)
  - `secureyeoman scraper` — Web scraper/MCP configuration (config, tools, servers)
  - `secureyeoman multimodal` — Multimodal I/O operations (config, jobs, vision-analyze, speak, transcribe, generate)
- Commands follow the existing modular command router pattern and connect to REST APIs

### Haptic Body Capability
- **`HapticRequestSchema` / `HapticResultSchema`** — Zod schemas in `packages/shared/src/types/multimodal.ts`; request accepts a `pattern` (single ms duration or on/off array up to 20 steps, max 10 000 ms per step) and optional `description`; result returns `triggered`, `patternMs` (total pattern duration), and `durationMs`
- **`'haptic'` in `MultimodalJobTypeSchema`** — haptic is now a first-class job type alongside `vision`, `stt`, `tts`, and `image_gen`
- **`haptic` config block in `MultimodalConfigSchema`** — `enabled` (default `true`) and `maxPatternDurationMs` (default 5 000 ms) enforce a server-side cap on total pattern length
- **`MultimodalManager.triggerHaptic()`** — validates config gate, enforces max pattern duration, creates a job entry, emits `multimodal:haptic-triggered` extension hook (connected clients respond via Web Vibration API or equivalent), returns result
- **`'multimodal:haptic-triggered'` hook point** — added to `HookPoint` union in `packages/core/src/extensions/types.ts`; follows the same observe/transform/veto semantics as all other hook points
- **`POST /api/v1/multimodal/haptic/trigger`** — new REST endpoint in `multimodal-routes.ts`; validates body via `HapticRequestSchema`, delegates to `MultimodalManager.triggerHaptic()`
- **Dashboard UI** — haptic capability toggle in Personality Editor (Body > Capabilities) enabled; previously showed "Not available" badge, now renders the same toggle switch as Auditory/Vision

### Tooling
- `npm audit fix` run; 12 moderate ajv/ESLint vulnerabilities formally documented as accepted risk in [ADR 048](docs/adr/048-eslint-ajv-vulnerability-accepted-risk.md)
- Lint errors reduced from 51 → 0; warnings reduced from 1640 → 1592

---

## Phase 14: Dashboard Chat Enhancements — Complete (2026.2.17) — [ADR 047](docs/adr/047-dashboard-chat-markdown.md)

### Chat Markdown Rendering (new)

- New `ChatMarkdown` component (`packages/dashboard/src/components/ChatMarkdown.tsx`) replacing plain text rendering for all assistant messages in `ChatPage` and `EditorPage`
- **react-markdown + remark-gfm** — assistant messages render as full GitHub-Flavored Markdown (headings, emphasis, tables, strikethrough, autolinks)
- **react-syntax-highlighter (Prism)** — fenced code blocks render with syntax highlighting, language label in the top-right corner, and automatic dark/light theme switching via CSS variables
- **mermaid v11** — ` ```mermaid ` code blocks are intercepted before syntax highlighting and rendered as interactive SVG diagrams via the Mermaid JS library; parse errors fall back to a styled error callout with the raw source preserved
- **remark-math + rehype-katex + katex** — `$inline$` and `$$block$$` LaTeX expressions render as typeset math via KaTeX; KaTeX CSS loaded globally
- **GitHub-style alerts** — blockquotes beginning with `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, or `[!CAUTION]` render as themed callout boxes with icon and colored left border matching the GitHub alert palette
- **Task list checkboxes** — `- [ ]` and `- [x]` GFM task list items render as styled read-only checkboxes (pointer-events disabled)
- **Enhanced table styling** — `overflow-x-auto` wrapper, hover row highlighting, and border styling consistent with the dashboard theme
- **"Thinking..." label** — pending/streaming indicator in both `ChatPage` and `EditorPage` now shows a "Thinking..." text label alongside the existing bouncing dots animation

### New Dashboard Dependencies
- `react-markdown` — core markdown-to-React renderer
- `remark-gfm` — GFM extension for react-markdown (tables, task lists, strikethrough, autolinks)
- `react-syntax-highlighter` + `@types/react-syntax-highlighter` — Prism-based syntax highlighting
- `mermaid` — diagram and flowchart rendering (v11)
- `remark-math` + `rehype-katex` + `katex` — LaTeX/math rendering pipeline

---

## Phase 13: Dashboard & Tooling — Complete (2026.2.17)

### Browser Automation Session Manager (new)
- New `browser.sessions` PostgreSQL table for tracking browser automation sessions
- `BrowserSessionStorage` class extending `PgBaseStorage` with full CRUD, filtering, and stats
- REST API routes: `GET /api/v1/browser/sessions`, `GET /api/v1/browser/sessions/:id`, `POST /api/v1/browser/sessions/:id/close`, `GET /api/v1/browser/config`, `GET /api/v1/browser/sessions/stats`
- Session event instrumentation on all 6 Playwright browser tools (`browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_pdf`)
- Dashboard `BrowserAutomationPage` component with stats cards, status/tool filters, paginated session table, expandable row detail with screenshot preview and close button
- Dashboard API client functions: `fetchBrowserSessions`, `fetchBrowserSession`, `closeBrowserSession`, `fetchBrowserConfig`

### Web Scraper Configuration Panel (new)
- `WebScraperConfigPage` component with URL allowlist management, rate limiting, and proxy settings
- `WebPage` wrapper component with sub-tabs for Browser Automation and Scraper Config
- Extended `McpFeatureConfig` with scraper settings (allowedUrls, webRateLimitPerMinute, proxy fields)
- PATCH `/api/v1/mcp/config` now supports scraper configuration updates
- Web tab in Agents page gated by active personality's `mcpFeatures` (exposeWeb/exposeWebScraping/exposeWebSearch/exposeBrowser)

### Vector Memory Explorer (new)
- `VectorMemoryExplorerPage` component with 4 sub-tabs: Semantic Search, Memories, Knowledge, Add Entry
- Semantic search with configurable similarity threshold, type filtering, and similarity score visualization
- Memory and knowledge browsing with expandable rows, delete actions, and reindex button
- Manual memory entry form with type, source, importance, and content fields
- Dashboard API client functions: `addMemory`, `deleteMemory`
- Vector Memory tab always visible in Agents page (brain is a core subsystem)

---

## Phase 12: Expanded Integrations — Complete (2026.2.17) — [ADR 046](docs/adr/046-phase11-mistral-devtools-mcp-prebuilts.md)

### Mistral AI Provider (new)
- New `MistralProvider` using OpenAI-compatible API at `https://api.mistral.ai/v1`
- Known models: mistral-large-latest, mistral-medium-latest, mistral-small-latest, codestral-latest, open-mistral-nemo
- Full streaming, tool calling, and fallback chain support
- Added to shared types, config schemas, and AI client factory

### Developer Tool Integrations (new)
- **Jira**: REST API v3 adapter with issue/comment webhooks, Basic Auth (email:apiToken)
- **AWS**: Lambda invocation + STS GetCallerIdentity, AWS Signature V4 (no SDK dependency)
- **Azure DevOps**: Work item + build webhooks, PAT-based Basic Auth

### MCP Pre-built Integrations (new)
- Featured MCP Servers grid on the MCP tab with one-click connect
- Pre-built catalog: Bright Data, Exa, E2B, Supabase
- Inline env var form, auto-detection of already-connected servers

### Connections Page Consolidation
- Restructured from 6 flat tabs to 2 top-level tabs: **Integrations** and **MCP**
- Integrations tab contains sub-tabs: Messaging, Email, Calendar, DevOps, OAuth
- OAuth moved from top-level into Integrations sub-tabs
- New DEVOPS_PLATFORMS entries: jira, aws, azure
- PLATFORM_META entries added for Jira, AWS, Azure DevOps with setup steps

---

## Phase 11: Dashboard UX — Complete (2026.2.17) — [ADR 039](docs/adr/039-inline-form-pattern.md)

### Cost Analytics Page (new)
- New `/costs` route with dedicated sidebar link (DollarSign icon, above Settings)
- Summary cards: Cost Today, Cost This Month, Total API Calls, Avg Latency
- Token overview: Tokens Used Today, Tokens Cached Today, API Errors
- Provider breakdown table sorted by cost (descending) with totals footer
- Cost recommendations section with priority badges (high/medium/low)
- New `/api/v1/costs/breakdown` endpoint exposing per-provider usage stats
- ResourceMonitor "Estimated Cost" section now clickable, navigates to `/costs`

### Sub-Agent Execution Tree
- Visual tree view in delegation detail (History tab > expand delegation > Show Execution Tree)
- Hierarchical display using `parentDelegationId` with depth-based indentation
- Each node shows: status icon, task, status badge, depth, token usage bar, duration
- Fetches tree data lazily via `fetchDelegation(id)` on toggle

### Memory Consolidation Panel — Enhanced
- Stats overview cards: Total Memories, Total Merged, Consolidation Runs, Avg Duration
- Consolidation trends stacked bar chart (last 10 runs) with color-coded actions (merged/replaced/updated/kept)
- Legend for trend bar colors
- Updated styling from raw Tailwind gray classes to dashboard theme tokens (card, muted-foreground, etc.)

### Audit Log Enhancements
- Date-range filtering with native date pickers (From/To) wired to existing `from`/`to` API parameters
- Saved filter presets stored in localStorage
- Preset chips with one-click apply and remove (×) button
- Save preset flow: inline name input with Enter/Escape keyboard support
- "Clear all" button when any filter is active

### Deferred to Phase 12
- Integration management UI, vector memory explorer, lifecycle hook debugger, web scraper config panel, browser automation session manager, Storybook, workspace management admin UI

---

## [2026.2.17] — 2026-02-17 — [ADR 045](docs/adr/045-memory-audit-hardening.md), [ADR 041](docs/adr/041-multimodal-io.md), [ADR 044](docs/adr/044-anti-bot-proxy-integration.md), [ADR 042](docs/adr/042-kubernetes-deployment.md), [ADR 043](docs/adr/043-kubernetes-observability.md)

### Phase 8.8: Memory/Brain Hardening — [ADR 045](docs/adr/045-memory-audit-hardening.md)

#### Security
- Fixed SQL injection via context key interpolation in `BrainStorage.queryMemories()` — now uses parameterized JSONB path with regex key validation
- Added prompt injection sanitization (`sanitizeForPrompt()`) in `BrainManager.getRelevantContext()` — strips known injection markers before composing prompt context
- Added input validation on brain REST route POST/PUT handlers (content type checking, non-empty enforcement)
- Added rate limiting on mutation endpoints (60/min for memories/knowledge, 5/min for maintenance/reindex/consolidation/sync)
- Added `MAX_QUERY_LIMIT = 200` cap on all GET route `limit` parameters to prevent unbounded queries
- Added path traversal validation on external sync config updates
- Added 18 missing brain routes to RBAC `ROUTE_PERMISSIONS` map (heartbeat, logs, search, consolidation, sync endpoints)

#### Bug Fixes
- **Critical**: Fixed memory pruning to delete lowest-importance memory instead of highest — added `sortDirection` support to `queryMemories()` and used `sortDirection: 'asc'` in prune path
- Fixed FAISS vector store phantom vectors — added `compact()` method to rebuild index without deleted entries, `clear()` to wipe, and `deletedCount` tracking
- Fixed expired PG memories not removed from vector store — `runMaintenance()` now syncs pruned IDs to vector store
- Fixed consolidation `flaggedIds` lost on restart — now persisted to `brain.meta` with snapshot-based clearing during deep runs
- Fixed cron scheduler only matching minute/hour — now implements full 5-field cron matching (minute, hour, day-of-month, month, day-of-week)
- Fixed `deepConsolidation.timeoutMs` config never enforced — wrapped with `Promise.race()` timeout
- Fixed Qdrant client typed as `any` — added `QdrantClientLike` interface with proper typing and auto-reconnect on failure
- Fixed external sync fetching all memories in single query — paginated with PAGE_SIZE=500

#### Enhancements
- Added `maxContentLength` config (default 4096) — enforced in `remember()` and `learn()`
- Added `importanceFloor` config (default 0.05) — memories decayed below floor auto-pruned in maintenance
- Added `sortDirection` and `offset` fields to `MemoryQuery` interface
- Added `pruneByImportanceFloor()` to `BrainStorage`
- `pruneExpiredMemories()` now returns pruned IDs (was count)
- `runMaintenance()` returns enhanced stats with `vectorSynced` count
- Added optional `compact()` method to `VectorStore` interface

### Phase 7.3: Multimodal I/O — Complete

#### Integration Wiring
- Wired MultimodalManager into IntegrationManager via late-injection setter pattern
- Vision processing for image attachments in Discord and Slack adapters
- Voice message transcription already working in Telegram adapter (now connected)

#### Voice Output (TTS)
- TTS audio in outbound responses via metadata on `sendMessage()`
- Telegram sends voice messages (OGG via grammy `InputFile`)
- Discord attaches audio files to embed messages
- MessageRouter synthesizes TTS when multimodal is enabled

#### Per-Personality Voice
- MessageRouter reads active personality's `voice` field for TTS voice selection
- Maps to OpenAI TTS voices (alloy, echo, fable, onyx, nova, shimmer)

#### MCP Multimodal Tools
- `multimodal_generate_image` — DALL-E image generation
- `multimodal_analyze_image` — Vision analysis
- `multimodal_speak` — Text-to-speech
- `multimodal_transcribe` — Speech-to-text
- `multimodal_jobs` — List multimodal processing jobs

#### Dashboard
- Multimodal job viewer with type/status filters, pagination, expandable rows
- Stats cards (total, completed, failed, success rate)
- Multimodal view consolidated into Agents page as a sub-tab (before Sub-Agents)
- Standalone `/multimodal` route redirects to `/agents`
- Multimodal tab and Agents nav visibility gated by `allowMultimodal` security policy
- Fixed enabled check: uses `securityPolicy.allowMultimodal` (not `multimodalConfig.enabled`)

### Phase 8.5: Anti-Bot & Proxy Integration

#### Proxy Rotation
- Multi-provider proxy support: Bright Data, ScrapingBee, ScraperAPI
- Round-robin and random rotation strategies
- Geo-targeting via ISO 3166-1 alpha-2 country codes
- Feature toggle: `MCP_PROXY_ENABLED` (default: false)

#### CAPTCHA Detection
- Heuristic CAPTCHA detection (reCAPTCHA, hCaptcha, Cloudflare challenge)
- Auto-retry with provider rotation on CAPTCHA detection

#### Retry Logic
- Exponential backoff with jitter for 429, 503, 502, 500, network errors
- Configurable max retries and base delay

#### Browser Integration
- Playwright browser launch respects proxy configuration

#### Documentation
- ADR 044: Anti-Bot & Proxy Integration

### Phase 9: Kubernetes Production Deployment

#### Helm Chart
- Full Helm chart at `deploy/helm/friday/` with templates for core, MCP, and dashboard deployments
- Values files for dev, staging, and production environments
- Ingress with TLS support (nginx, ALB, GCE via annotations)
- HorizontalPodAutoscaler for core (2-10 replicas) and MCP (1-5 replicas)
- PodDisruptionBudgets for all services
- NetworkPolicies with explicit ingress/egress rules per service
- ServiceAccount with configurable annotations (for IRSA/Workload Identity)

#### Dashboard Production Image
- New `packages/dashboard/Dockerfile` — multi-stage build (node:20-alpine + nginx:1.27-alpine)
- Custom `nginx.conf` serving static SPA with API/WebSocket reverse proxy to core
- Security headers, gzip compression, static asset caching

#### CI/CD
- `docker-push` job: builds and pushes 3 images to GHCR on tag push (`v*`)
- `helm-lint` job: lints chart and runs `helm template` dry-run on every push
- OCI labels added to root Dockerfile for GHCR metadata

#### Observability
- Prometheus `ServiceMonitor` CRD for auto-discovery scraping
- `PrometheusRule` CRD with all 9 alert rules migrated from Docker setup
- Grafana dashboard ConfigMap with sidecar auto-discovery label
- Pod annotations for legacy Prometheus scraping

#### Security Hardening
- Non-root containers (UID 1000 for core/MCP, UID 101 for nginx dashboard)
- Read-only root filesystem with explicit writable mounts
- All Linux capabilities dropped, privilege escalation blocked
- Seccomp RuntimeDefault profile on all pods
- ExternalSecret CRD template for AWS Secrets Manager, GCP Secret Manager, Azure Key Vault

#### Testing
- Helm test pod (curls core `/health` endpoint)
- Kubernetes smoke test script (`tests/k8s/smoke-test.sh`) for kind/k3d

#### Documentation
- ADR 042: Kubernetes Deployment decision record
- ADR 043: Kubernetes Observability decision record
- Kubernetes deployment guide (`docs/guides/kubernetes-deployment.md`)
- Updated architecture docs with K8s deployment section
- Updated security model with K8s security section
- Updated roadmap with Phase 9

#### Repository
- Updated all repo URL references from `MacCracken/FRIDAY` to `MacCracken/secureyeoman`
- Renamed all product-level "F.R.I.D.A.Y." / "FRIDAY" references to "SecureYeoman" across 79 files (preserving "F.R.I.D.A.Y." as the default agent personality name)

---

## [2026.2.16c] — 2026-02-16 — [ADR 034](docs/adr/034-sub-agent-delegation.md)

### Dashboard: Navigation Consolidation & Experiments

#### Agents Page (Consolidated)
- Merged Sub-Agents and A2A Network into a single **Agents** page accessible from the sidebar
- Tabbed interface when both features are enabled; shows single view when only one is active
- Disabled state when neither sub-agents nor A2A is enabled
- `/a2a` route redirects to `/agents` for backward compatibility

#### Experiments Page (Standalone)
- Extracted experiments from the Editor bottom panel into a standalone sidebar page
- Gated by `allowExperiments` security policy flag (default: `false`)
- Must be explicitly enabled after initialization via Settings > Security
- Only visible in sidebar when the policy is enabled

#### Security Settings
- Added **Experiments** toggle to Security Settings page
- Added `allowExperiments: boolean` to `SecurityConfigSchema` (default: `false`)

#### Proactive Page
- Removed quick-enable buttons from Built-In Triggers section
- Triggers are now read-only reference; enabling is per-personality via the Personality Editor
- Added informational note about per-personality configuration

#### Sidebar
- Conditional navigation items: Agents, Extensions, Proactive, and Experiments appear only when their respective security policies are enabled

---

## [2026.2.16b] — 2026-02-16 — [ADR 041](docs/adr/041-multimodal-io.md)

### Phase 7.3: Multimodal I/O

#### Vision Analysis
- Image analysis via existing AIClient vision capability (Claude / GPT-4o)
- Supports JPEG, PNG, GIF, WebP up to 20MB
- REST endpoint: `POST /api/v1/multimodal/vision/analyze`

#### Speech-to-Text (STT)
- Audio transcription via OpenAI Whisper API
- Supports OGG, MP3, WAV, WebM, M4A, FLAC formats
- REST endpoint: `POST /api/v1/multimodal/audio/transcribe`

#### Text-to-Speech (TTS)
- Speech synthesis via OpenAI TTS API
- Multiple voices (alloy, echo, fable, onyx, nova, shimmer)
- REST endpoint: `POST /api/v1/multimodal/audio/speak`

#### Image Generation
- Image generation via OpenAI DALL-E 3
- Configurable size, quality, and style
- REST endpoint: `POST /api/v1/multimodal/image/generate`

#### Infrastructure
- `MultimodalManager` orchestrator with job tracking in PostgreSQL
- `MultimodalStorage` extends PgBaseStorage (migration 010)
- Security policy toggle: `allowMultimodal` in SecuritySettings dashboard
- 5 extension hook points: `multimodal:image-analyzed`, `multimodal:audio-transcribed`, `multimodal:speech-generated`, `multimodal:image-generated`, `multimodal:haptic-triggered`
- `MediaHandler.toBase64()` helper for file conversion
- Telegram adapter handles photo and voice messages via MultimodalManager
- Dashboard API client functions for all multimodal endpoints
- **Reference**: ADR 041

---

## [2026.2.16] — 2026-02-16 — [ADR 039](docs/adr/039-inline-form-pattern.md), [ADR 035](docs/adr/035-lifecycle-extension-hooks.md), [ADR 036](docs/adr/036-sandboxed-code-execution.md), [ADR 037](docs/adr/037-a2a-protocol.md), [ADR 038](docs/adr/038-webmcp-ecosystem-tools.md), [ADR 040](docs/adr/040-proactive-assistance.md)

### Dashboard: Inline Form Pattern

#### Replace Modal Dialogs with Inline Cards
- Replaced popup modal dialogs (`fixed inset-0 bg-black/50`) with collapsible inline card forms across all feature pages
- **SubAgentsPage**: Delegate Task and New Profile forms now render inline below the header/tab area
- **ExtensionsPage**: Register Extension, Register Hook, and Register Webhook forms now render inline within their respective tabs
- **A2APage**: Add Peer and Delegate Task forms now render inline
- All inline forms use `useMutation` with `onSuccess` cleanup instead of manual `setSubmitting` state
- Forms follow the ExperimentsPage card pattern: `card p-4 space-y-3` with X close button
- Input styling standardized to `w-full bg-card border border-border rounded-lg px-3 py-2 text-sm`
- CodeExecutionPage unchanged (already used inline forms)
- **Reference**: ADR 039

### Phase 7: Integration Expansion

#### DeepSeek AI Provider
- New `DeepSeekProvider` using OpenAI-compatible API at `https://api.deepseek.com`
- Requires `DEEPSEEK_API_KEY` env var; optional `DEEPSEEK_BASE_URL` override
- Known models: `deepseek-chat`, `deepseek-coder`, `deepseek-reasoner`
- Full chat, streaming, and tool use support
- Added to provider factory, cost calculator (pricing table + dynamic model fetch), and model switching
- 9 unit tests

#### Google Calendar Integration
- `GoogleCalendarIntegration` adapter using Calendar API v3 with OAuth2 tokens
- Polling-based event monitoring with configurable interval
- Quick-add event creation via `sendMessage()`
- Token refresh reusing Gmail's OAuth pattern
- Dashboard: PLATFORM_META with OAuth token config fields and setup steps
- 7 unit tests

#### Notion Integration
- `NotionIntegration` adapter using Notion API with internal integration token
- Polling for database changes and page updates
- Page creation via `sendMessage()` with auto-title
- Rate limit set to 3 req/sec (Notion's strict limits)
- Dashboard: PLATFORM_META with API key and database ID fields
- 7 unit tests

#### GitLab Integration
- `GitLabIntegration` implementing `WebhookIntegration` for push, merge_request, note, and issue events
- REST API v4 for posting comments on issues and merge requests
- `X-Gitlab-Token` header verification for webhook security
- Configurable `gitlabUrl` for self-hosted GitLab instances
- Webhook route registered at `/api/v1/webhooks/gitlab/:id`
- Dashboard: PLATFORM_META with PAT, webhook secret, and GitLab URL fields
- 15 unit tests

#### Adaptive Learning Engine (7.1)
- `PreferenceLearner` class storing feedback as `preference` type memories via BrainManager
- `POST /api/v1/chat/feedback` endpoint for thumbs-up/thumbs-down/correction feedback
- Conversation pattern analysis: detects response length preferences and code-heavy usage
- `injectPreferences()` appends learned preferences to system prompt when memory is enabled
- Dashboard: thumbs-up/thumbs-down buttons on assistant messages in ChatPage
- API client: `submitFeedback()` function
- 11 unit tests

### Browser Automation Label Fix
- Removed "(preview)" badge and "coming soon" tooltip from Browser Automation toggle
- Updated tooltip to "Browser automation via Playwright"

### Test Connection Button for Integrations
- New `testConnection()` optional method on `Integration` interface for validating credentials without starting
- REST endpoint `POST /api/v1/integrations/:id/test` — calls adapter's `testConnection()` and returns `{ ok, message }`
- Dashboard: "Test" button on each integration card (Messaging tab) next to Start/Stop
  - Spinner while testing, green check/red X with message, auto-clears after 5s
- API client: `testIntegration(id)` function

### Browser Automation — Playwright Implementation (Phase 8.3)
- Replaced 6 placeholder browser tools with real Playwright implementations:
  - `browser_navigate` — Navigate to URL, return title + URL + content snippet
  - `browser_screenshot` — Capture viewport or full page as base64 PNG
  - `browser_click` — Click element by CSS selector with configurable wait
  - `browser_fill` — Fill form field by CSS selector
  - `browser_evaluate` — Execute JavaScript in browser context, return JSON
  - `browser_pdf` — Generate PDF from webpage as base64
- New `BrowserPool` manager (`browser-pool.ts`): lazy browser launch, page pool with `MCP_BROWSER_MAX_PAGES` limit, `MCP_BROWSER_TIMEOUT_MS` enforcement, graceful shutdown
- `playwright` added as optional dependency in `@secureyeoman/mcp`
- Browser pool shutdown wired into `McpServiceServer.stop()` lifecycle
- Config gate preserved: all tools return NOT_AVAILABLE when `MCP_EXPOSE_BROWSER=false`
- 18 unit tests (config gate, all 6 tools enabled/disabled, pool limit enforcement, shutdown)

### RBAC Management — Dashboard, API & CLI
- 7 new REST endpoints for role CRUD (`GET/POST/PUT/DELETE /auth/roles`) and user-role assignments (`GET/POST /auth/assignments`, `DELETE /auth/assignments/:userId`)
- Built-in roles protected from mutation/deletion; custom roles auto-prefixed with `role_`
- Dashboard: Settings > Security now shows full role list with Built-in badges, inline create/edit forms, delete with confirmation, and a User Assignments table with assign/revoke
- CLI: `secureyeoman role` command with `list`, `create`, `delete`, `assign`, `revoke`, `assignments` subcommands
- Personality Resource Creation config extended with `customRoles` and `roleAssignments` toggles (between Sub-Agents and Experiments)

### Security Policy Toggles
- Security Policy API (`GET/PATCH /api/v1/security/policy`) for managing high-risk capabilities
- SecurityConfigSchema extended with 3 new fields:
  - `allowA2A: z.boolean().default(false)` — Allow A2A networking (nested under sub-agents)
  - `allowExtensions: z.boolean().default(false)` — Allow lifecycle extension hooks
  - `allowExecution: z.boolean().default(true)` — Allow sandboxed code execution (enabled by default)
- Dashboard: Security Settings page now shows toggles for all 4 policy fields (Sub-Agent Delegation, A2A Networks, Lifecycle Extensions, Sandbox Execution)
- A2A Networks toggle appears as nested sub-item under Sub-Agent Delegation toggle
- All policy changes audited in cryptographic audit chain and take effect immediately

### Phase 8: WebMCP — Web Intelligence & Browser Automation

#### Web Scraping Tools (8.1)
- 4 web scraping tools: `web_scrape_markdown` (HTML→markdown), `web_scrape_html` (raw HTML with CSS selector), `web_scrape_batch` (parallel multi-URL, max 10), `web_extract_structured` (field-based JSON extraction)
- SSRF protection: blocks private IPs (10.x, 172.16-31.x, 192.168.x), localhost, cloud metadata (169.254.169.254), `file://` protocol
- URL allowlist enforcement when `MCP_ALLOWED_URLS` is configured (domain + subdomain matching)
- Max 3 redirect hops with re-validation per hop; 500KB output cap with truncation marker
- HTML→markdown via `node-html-markdown`; fallback tag stripper for environments without the dependency

#### Web Search Tools (8.2)
- 2 web search tools: `web_search` (single query), `web_search_batch` (parallel, max 5 queries)
- Configurable search backend: DuckDuckGo (default, no API key), SerpAPI, Tavily
- Web-specific rate limiter (10 req/min default, configurable via `MCP_WEB_RATE_LIMIT`)

#### Browser Automation (8.3 — Complete)
- 6 browser tools implemented with Playwright: `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_pdf`
- `BrowserPool` manager for lazy browser launch, page pool with configurable limit, timeout enforcement, graceful shutdown
- `playwright` as optional dependency (users install separately with `npm install playwright && npx playwright install chromium`)
- Feature toggle `MCP_EXPOSE_BROWSER` controls availability; config for engine, headless mode, max pages, timeout
- Dashboard: Browser Automation toggle with "(preview)" label

#### MCP Infrastructure (8.6)
- **Health Monitoring**: `McpHealthMonitor` class with periodic checks (60s default), latency tracking, consecutive failure counting, auto-disable after threshold (default 5)
- **Credential Management**: `McpCredentialManager` with AES-256-GCM encryption at rest, key derivation from `SECUREYEOMAN_TOKEN_SECRET`, credential injection into server spawn environment
- REST API: `GET /mcp/health`, `GET /mcp/servers/:id/health`, `POST /mcp/servers/:id/health/check`, `GET/PUT/DELETE /mcp/servers/:id/credentials/:key`
- Database migrations: `006_mcp_health.sql` (server_health table), `007_mcp_credentials.sql` (server_credentials table)

#### Dashboard (8.7)
- Web Tools toggle (Globe icon) with collapsible Scraping/Search sub-toggles on YEOMAN MCP server card
- Browser Automation toggle with "(preview)" label
- Health dot indicators (green/yellow/red) per external server card with latency tooltip
- Credentials section per external server: expandable key listing (masked values), add key/value form, delete button

### Phase 6: Cognitive Architecture (6.1a, 6.1b, 6.2, 6.3, 6.4a, 6.4b, 6.5)

#### Vector Semantic Memory (6.1a)
- Embedding provider abstraction with local (SentenceTransformers via Python child process) and API (OpenAI/Gemini) backends
- FAISS vector store adapter with flat L2 index, cosine normalization, and disk persistence
- Qdrant vector store adapter with auto-collection creation and cosine distance
- VectorMemoryManager orchestrating embedding + vector store for semantic indexing and search
- pgvector migration (003) adding `embedding vector(384)` columns with HNSW indexes
- BrainStorage extended with `queryMemoriesBySimilarity()` and `queryKnowledgeBySimilarity()` using pgvector `<=>` operator
- BrainManager integration: `remember()`, `recall()`, `forget()`, `learn()`, `deleteKnowledge()`, `getRelevantContext()` all use vector search with text fallback
- New `semanticSearch()` public method on BrainManager
- REST endpoints: `GET /brain/search/similar`, `POST /brain/reindex`
- Dashboard: SimilaritySearch component with text input, threshold slider, type filter, and score indicators
- Configuration via `brain.vector` in `secureyeoman.yaml`

#### LLM-Powered Memory Consolidation (6.1b)
- ConsolidationManager with on-save quick check (>0.95 auto-dedup, >0.85 flag for review)
- Scheduled deep consolidation with configurable cron schedule
- LLM consolidation prompts: MERGE, REPLACE, KEEP_SEPARATE, UPDATE, SKIP actions
- ConsolidationExecutor with optimistic locking and audit trail logging
- REST endpoints: `POST /brain/consolidation/run`, `GET/PUT /brain/consolidation/schedule`, `GET /brain/consolidation/history`
- Dashboard: ConsolidationSettings component with schedule picker, dry-run toggle, manual run, and history table
- Configuration via `brain.consolidation` in `secureyeoman.yaml`

#### Progressive History Compression (6.2)
- 3-tier compression pipeline: message (50%) → topic (30%) → bulk (20%)
- Topic boundary detection via keywords, temporal gaps, and token thresholds
- LLM summarization for topic and bulk summaries with configurable models
- Approximate token counter (~4 chars/token)
- CompressionStorage extending PgBaseStorage with migration (004)
- HistoryCompressor with `addMessage()`, `getContext()`, `sealCurrentTopic()`, `getHistory()`
- ConversationManager integration with non-blocking compression
- REST endpoints: `GET /conversations/:id/history`, `POST /conversations/:id/seal-topic`, `GET /conversations/:id/compressed-context`
- Dashboard: ConversationHistory component with tiered view, token budget bars, and seal topic button
- Configuration via `conversation.history.compression` in `secureyeoman.yaml`

#### Sub-Agent Delegation System (6.3)
- SubAgentManager with recursive delegation, token budgets, and configurable max depth (default: 3)
- 4 built-in agent profiles: researcher (50k tokens), coder (80k), analyst (60k), summarizer (30k)
- SubAgentStorage extending PgBaseStorage with profile CRUD, delegation tracking, and recursive tree queries
- Delegation tools: `delegate_task`, `list_sub_agents`, `get_delegation_result` with depth-based filtering
- Agentic execution loop with AbortController timeout, conversation sealing, and audit trail
- Database migration (005) creating `agents` schema with profiles, delegations, and delegation_messages tables
- REST API: full CRUD for profiles, delegate endpoint, delegation listing/filtering/cancel, sealed conversation retrieval
- Dashboard: SubAgentsPage with Active/History/Profiles tabs, delegate dialog, token usage bars, cancel support
- Configuration via `delegation` section in `secureyeoman.yaml`

#### Lifecycle Extension Hooks (6.4a)
- ExtensionManager with filesystem-based discovery (built-in, user, workspace directories) and numeric prefix ordering
- 24 lifecycle hook points across agent, message loop, LLM, tool, memory, sub-agent, integration, and security events
- Three hook semantics: observe (side-effect only), transform (modify data), veto (cancel operation)
- TypeScript plugin modules with typed hook signatures and hot-reload support
- EventEmitter integration for lightweight in-process subscribers
- Outbound webhook dispatch with HMAC-SHA256 signing and configurable timeout
- User extension directory (`~/.secureyeoman/extensions/`) with override semantics
- REST API: `GET/DELETE /extensions`, `POST /extensions/reload`, `GET /extensions/hooks`, `GET/POST/DELETE /extensions/webhooks`, `POST /extensions/discover`
- Configuration via `extensions` section in `secureyeoman.yaml`
- Example extensions: logging enhancer, custom memory filter, Slack notifier

#### Sandboxed Code Execution (6.4b)
- CodeExecutionTool with Python, Node.js, and shell runtime support
- Always-on sandbox: all code runs within existing Landlock/seccomp/macOS sandbox infrastructure
- Two-level opt-in: master `enabled` switch + `autoApprove` toggle for per-execution approval flow
- Dashboard approval prompt with "Approve & Trust Session" for session-scoped auto-approval
- Persistent session manager with sessions surviving across tool calls within a conversation
- Output streaming to dashboard via WebSocket (`code_execution:{sessionId}` channel)
- Streaming secrets filter: 256-byte buffered window masking API keys, tokens, passwords in stdout/stderr
- MCP tools: `execute_code`, `list_sessions`, `kill_session`
- REST API: `POST /execution/run`, `GET /execution/sessions`, `DELETE /execution/sessions/:id`, `GET /execution/history`, `POST /execution/approve/:id`
- Full audit trail for all code executions (input code, output summary, exit code, approval metadata)
- Configuration via `execution` section in `secureyeoman.yaml`

#### A2A Protocol (6.5)
- Agent-to-Agent protocol extending E2E encrypted comms layer with delegation-specific message types
- 8 A2A message types: delegation_offer, delegation_accept, delegation_reject, delegation_status, delegation_result, delegation_cancel, capability_query, capability_response
- Three discovery mechanisms: static peer list, mDNS (`_friday-a2a._tcp`) for LAN, DNS-SD for WAN
- Capability negotiation: agents advertise available profiles, token budgets, current load, and protocol version
- Trust progression model: untrusted (discovery only) -> verified (limited delegation) -> trusted (full delegation)
- Remote delegation transport extending SubAgentManager; remote delegations tagged with `remote: true` in unified delegation tree
- Per-peer rate limiting and allowlists/denylists for delegation authorization
- Cryptographic proof: signed hash of sealed conversation in delegation results
- REST API: `GET/POST/DELETE /a2a/peers`, `POST /a2a/discover`, `POST /a2a/delegate`, `GET /a2a/delegations`, `GET /a2a/messages`
- Dashboard: remote agent discovery, peer management, and remote delegation UI with network icon
- Configuration via `a2a` section in `secureyeoman.yaml`

#### DOMPurify XSS Protection
- DOMPurify sanitization utility with `sanitizeHtml()` (allows formatting tags) and `sanitizeText()` (strips all HTML)
- SafeHtml React component for safe rendering of HTML content
- Applied to all dashboard components displaying AI/user-generated content: ChatPage, SecurityEvents, PersonalityEditor, SkillsPage, CodePage, NotificationBell, TaskHistory, ConnectionsPage

---

## [2026.2.15] — 2026-02-15 — [ADR 000](docs/adr/000-secureyeoman-architecture-overview.md), [ADR 001](docs/adr/001-dashboard-chat.md), [ADR 004](docs/adr/004-mcp-protocol.md), [ADR 015](docs/adr/015-rbac-capture-permissions.md), [ADR 025](docs/adr/025-cli-webhook-googlechat-integrations.md), [ADR 026](docs/adr/026-mcp-service-package.md), [ADR 027](docs/adr/027-gateway-security-hardening.md), [ADR 030](docs/adr/030-unified-connections-oauth.md)

### Initial Release

SecureYeoman — a secure, local-first AI assistant with enterprise-grade protection and comprehensive observability.

#### Security
- RBAC (Admin/Operator/Auditor/Viewer) with role inheritance and persistent storage
- JWT + API key authentication with refresh token rotation and blacklisting
- AES-256-GCM encryption at rest with scrypt KDF
- Sandboxed execution (Linux Landlock, macOS sandbox-exec, seccomp-bpf, namespace isolation)
- mTLS with client certificate authentication
- 2FA (TOTP) with recovery codes
- Rate limiting (per-user, per-IP, per-API-key, global; Redis-backed distributed mode)
- HTTP security headers (HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- CORS policy enforcement
- Input validation and prompt injection defense (6 pattern families)
- Secret rotation with dual-key JWT verification
- Encrypted config file support (.enc.yaml)
- Cryptographic audit trails (HMAC-SHA256 chain) with retention enforcement

#### AI Integration
- Anthropic Claude, OpenAI GPT, Google Gemini, Ollama, LM Studio, LocalAI (local), OpenCode Zen
- Automatic fallback chains on rate limits/outages
- Dynamic model discovery across all providers
- Token counting, cost calculation, usage tracking

#### Agent Architecture
- Soul (identity, archetypes, personality) with "In Our Image" sacred hierarchy
- Spirit (passions, inspirations, pains) — emotional core
- Brain (memory, knowledge, skills with decay and pruning)
- Body (heartbeat, vital signs, screen capture)

#### Dashboard
- React + Vite + Tailwind + TanStack Query
- Real-time WebSocket updates with channel-based RBAC
- Overview page with stat cards (Tasks Today, Active Tasks, Heartbeat, Audit Entries, Memory Usage)
- Services status panel (Core, Database/Postgres, Audit Chain, MCP Servers, Uptime, Version)
- System flow graph (ReactFlow) with live connection edges reflecting health, database, MCP, and security status; click-to-navigate node detail expansion (Security > System Details tab)
- Task history, security events, resource monitor
- Personality editor, skills manager, code editor (Monaco) with AI chat sidebar
- Voice interface (push-to-talk, speech recognition and synthesis)
- Notification bell, search bar (Ctrl+K), user preferences
- Audit log export, log retention settings, security settings
- Responsive design with dark/light theme

#### Integrations
- Telegram, Discord, Slack, GitHub, Google Chat, CLI, Generic Webhook
- Plugin architecture with unified message routing
- Per-platform rate limiting, auto-reconnect, conversation management

#### MCP Protocol
- Standalone `@secureyeoman/mcp` service (22+ tools, 7 resources, 4 prompts)
- Streamable HTTP, SSE, and stdio transports
- Auto-registration with core; JWT auth delegation
- Connect external MCP servers with persistent tool discovery

#### Marketplace
- Skill discovery, search, install/uninstall (syncs with Brain skills)
- Publish with cryptographic signature verification
- Built-in example skills

#### Team Collaboration
- Workspaces with isolation, member management, workspace-scoped RBAC

#### Reports and Analytics
- Audit report generator (JSON/HTML/CSV)
- Cost optimization recommendations
- A/B testing framework (experiments with variant routing and p-values)

#### Production
- Docker multi-stage builds with non-root user and health checks
- CI/CD pipeline (lint, typecheck, test, build, security audit; Node 20+22 matrix)
- Prometheus metrics, Grafana dashboards, Loki log aggregation
- Load testing (k6), security testing, chaos testing
- 1700+ tests across 115+ files

---

*Last updated: 2026-02-18*
