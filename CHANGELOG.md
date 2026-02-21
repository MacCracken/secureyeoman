# Changelog

All notable changes to SecureYeoman are documented in this file.

---

## Roadmap — Markdown for Agents added to Future Features (2026-02-21)

Added a new **Markdown for Agents** section to `docs/development/roadmap.md` Future Features, based on [Cloudflare's Markdown for Agents specification](https://blog.cloudflare.com/markdown-for-agents/). The spec uses HTTP content negotiation (`Accept: text/markdown`) to deliver clean, LLM-optimized markdown instead of raw HTML — achieving up to 80% token reduction.

Eight concrete tasks have been written across two tracks:

**Consumer track** (improvements to `web-tools.ts`):
- `Accept: text/markdown` content negotiation in `web_scrape_markdown` — native markdown when the server supports it, HTML→markdown fallback otherwise
- Token savings telemetry — surface `x-markdown-tokens` header and estimated savings in tool output
- `Content-Signal` header enforcement — refuse to feed `ai-input=no` content to agents
- YAML front matter extraction — parse fenced front matter for cheap metadata access
- New `web_fetch_markdown` dedicated tool — lightweight single-URL markdown fetch with token reporting

**Producer track** (YEOMAN serving content to external agents):
- Personality system prompts as `text/markdown` MCP resources at `yeoman://personalities/{id}/prompt`
- Skill definitions as `text/markdown` MCP resources at `yeoman://skills/{id}`
- `x-markdown-tokens` response header middleware on all markdown MCP endpoints

---

## Agnostic QA Sub-Agent Team — Full Integration Complete (2026-02-21) — ADR 090 amendment

Agnostic Priorities 1–4 are now implemented in `webgui/api.py`. The YEOMAN MCP bridge has been updated to take full advantage of all new endpoints and auth modes. All nine `agnostic_*` tools are now end-to-end functional.

### What changed in YEOMAN

- **`packages/shared/src/types/mcp.ts`** — added `agnosticApiKey: z.string().optional()` to `McpServiceConfigSchema`
- **`packages/mcp/src/config/config.ts`** — maps `AGNOSTIC_API_KEY` env var to `agnosticApiKey`
- **`packages/mcp/src/tools/agnostic-tools.ts`** — full rewrite:
  - `getAuthHeaders()` replaces `getToken()`: returns `{ 'X-API-Key': key }` (preferred) or `{ Authorization: 'Bearer ...' }` (JWT fallback)
  - `agnostic_submit_qa` adds `callback_url`, `callback_secret`, `business_goals`, `constraints`
  - Removed all "not yet implemented" error stubs — both `agnostic_submit_qa` and `agnostic_task_status` are live
- **`packages/mcp/src/tools/agnostic-tools.test.ts`** — updated tests: API key auth, no-login assertion, callback_url schema, updated error message text

### What changed in docs

- `docs/configuration.md` — added `AGNOSTIC_API_KEY` row, updated auth description
- `docs/adr/090-agnostic-qa-sub-agent-team.md` — amendment section, updated tools table (all ✅), updated config example
- `docs/development/roadmap.md` — marked 3 Future Features items done: `POST /api/tasks`, API key auth, webhook callbacks
- `agnostic/TODO.md` — P1–P4 marked ✅ Implemented; Integration Reference table fully green
- `packages/core/src/cli/commands/agnostic.ts` — updated JSDoc comment to show `AGNOSTIC_API_KEY`

### What remains deferred

- A2A protocol bridge (Agnostic as a peer via structured delegation messages)
- Auto-start toggle (`AGNOSTIC_AUTO_START=true` on `secureyeoman start`)

---

## Phase 33 Quality Gate Closed (2026-02-21)

All CI / Quality Gate open items uncovered during the Phase 34 Final Inspection run have been resolved. The tracking section has been removed from the roadmap; the permanent record is here.

### Typecheck — All Fixed
- **discord.js v13 → v14** — Bumped `packages/core` to `^14.25.1`, removed stray root dep.
- **Missing `@types/express`** — Added to `packages/core` devDependencies.
- **Missing `@testing-library/dom`** — Added as explicit devDep in `packages/dashboard`.
- **Missing `graphology-types`** — Added as explicit devDep in `packages/dashboard`.
- **`@storybook/react` unresolvable** — Added as explicit devDep in `packages/dashboard`.

### Lint — All Fixed
- **ESLint 0 errors** — 36 errors cleared (see ESLint Zero-Error Pass entry below).

### Security — Blocked Upstream (tracked in dependency-watch.md)
- **`minimatch <10.2.1`** (10 high-severity ReDoS, dev-only) — requires ESLint v10; blocked until `typescript-eslint` publishes an ESLint-v10-compatible release.
- **`undici <6.23.0`** (4 moderate) — in the `discord.js@14` dependency chain; blocked until discord.js ships a patch bumping its bundled undici to `>=6.23.0`.

---

## ESLint Zero-Error Pass (2026-02-21) — Phase 33 Lint

### Quality

- **0 ESLint errors** — Resolved all 36 errors deferred from Phase 34 Final Inspection. Errors spanned `no-unnecessary-type-conversion` (15), `no-confusing-void-expression` (5), `no-unnecessary-type-parameters` (3), `no-deprecated` (2), `dot-notation` (2), `array-type` (2), storybook parsing (2), `prefer-optional-chain`, `no-unused-expressions`, `no-unnecessary-template-expression`, `no-redundant-type-constituents`, `non-nullable-type-assertion-style`.
- **Storybook files linted** — Added `.storybook/*.ts` to `packages/dashboard/tsconfig.node.json` so the parser can resolve project types for Storybook config.
- **Deprecated `Figma` icon replaced** — `ConnectionsPage.tsx` now uses `Globe` (lucide-react) in place of the deprecated brand icon.
- **`JSX` namespace updated** — `PresenceBanner.tsx` now uses `React.JSX.Element` per the current TypeScript + React type conventions.
- **Test fixes** — `packages/dashboard` test files updated to fix pre-existing failures: `fetchMultimodalConfig` mock added to `MultimodalPage.test.tsx` and `AgentsPage.test.tsx`; `scrollIntoView` polyfilled in `GroupChatPage.test.tsx`; Connect-button selectors and ElevenLabs index corrected in `McpPrebuilts.test.tsx`.

### Files Changed
| File | Change |
|------|--------|
| `packages/core/src/body/heartbeat.ts` | `as string` → `!` assertion (`non-nullable-type-assertion-style`) |
| `packages/core/src/cli/commands/agnostic.test.ts` | Removed 13 redundant `String()` wrappers around `string` params |
| `packages/core/src/cli/commands/agnostic.ts` | `Array<T>` → `T[]` (×2); void arrow shorthand → block body |
| `packages/core/src/cli/commands/security.ts` | `x && x.includes()` → `x?.includes()` |
| `packages/core/src/storage/pg-base.test.ts` | Removed unused `<T>` type parameters from 3 test-helper methods |
| `packages/dashboard/tsconfig.node.json` | Added `.storybook/*.ts` to `include` |
| `packages/dashboard/src/components/ConnectionsPage.tsx` | Replaced deprecated `Figma` icon with `Globe` |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | Added block bodies to 4 void `onChange` arrow functions |
| `packages/dashboard/src/components/PresenceBanner.tsx` | `JSX.Element` → `React.JSX.Element` |
| `packages/dashboard/src/components/RoutingRulesPage.tsx` | Removed redundant `Number()` wrapper; removed literal `'new'` from union type |
| `packages/dashboard/src/components/SkillsPage.tsx` | Ternary statement → `if/else` |
| `packages/mcp/src/tools/agnostic-tools.ts` | `headers['Authorization']` → `headers.Authorization` (×2); removed unnecessary template literal and `String()` wrapper |

---

## Per-Personality Active Hours (2026-02-21) — ADR 091

### New Features

- **Active hours scheduling** — Each personality can now define a schedule of active hours (`body.activeHours`) during which heartbeat checks and proactive triggers are allowed to run. Outside the configured window, the personality's body is at rest and `HeartbeatManager.beat()` returns immediately with no checks executed.
- **`PersonalityActiveHoursSchema`** — New Zod schema in `@secureyeoman/shared` with `enabled`, `start`/`end` (HH:mm UTC), `daysOfWeek` (mon–sun array), and `timezone` fields. Stored in the existing `body` JSONB column — no database migration required.
- **`setPersonalitySchedule()`** — New public method on `HeartbeatManager` for pushing the active personality's schedule. Called on startup (seed), on personality activation, and on personality update.
- **UI** — New "Active Hours — Brain Schedule" collapsible section in PersonalityEditor's Body panel: enable toggle, time pickers for start/end, day-of-week buttons, and timezone select.

### Files Changed
| File | Change |
|------|--------|
| `packages/shared/src/types/soul.ts` | `PersonalityActiveHoursSchema`, `PersonalityActiveHours` type, `activeHours` in `BodyConfigSchema` |
| `packages/core/src/body/heartbeat.ts` | `personalitySchedule` field, `setPersonalitySchedule()`, `isWithinPersonalityActiveHours()`, gate in `beat()`, exposed in `getStatus()` |
| `packages/core/src/soul/soul-routes.ts` | `heartbeatManager` in `SoulRoutesOptions`; push schedule on activate and update-of-active |
| `packages/core/src/gateway/server.ts` | Pass `heartbeatManager` to `registerSoulRoutes` |
| `packages/core/src/secureyeoman.ts` | Seed active personality schedule after heartbeat init |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | `activeHours` state, seed in `startEdit`/`startCreate`, merge in `handleSave`, Active Hours UI in `BodySection` |
| `packages/core/src/body/heartbeat.test.ts` | Personality active hours test suite (6 tests) |
| `packages/core/src/soul/soul-routes.test.ts` | HeartbeatManager wiring tests (5 tests) |
| `docs/adr/091-per-personality-active-hours.md` | ADR — schema, enforcement point, push pattern, trade-offs |

---

## Kali Security Toolkit MCP (2026-02-21) — ADR 089

### New Features

- **`sec_*` MCP tools** — 14 security tools exposed via MCP: `sec_nmap`, `sec_gobuster`, `sec_ffuf`, `sec_sqlmap`, `sec_nikto`, `sec_nuclei`, `sec_whatweb`, `sec_wpscan`, `sec_hashcat`, `sec_john`, `sec_theharvester`, `sec_dig`, `sec_whois`, and `sec_shodan`. All tools are disabled by default and gated by `MCP_EXPOSE_SECURITY_TOOLS=true`.
- **Three deployment modes** — `native` (run tools from host PATH), `docker-exec` (run via `docker exec` into a managed Kali container), and a future pre-built image path. Mode selected via `MCP_SECURITY_TOOLS_MODE`.
- **Scope enforcement** — `validateTarget()` checks every active-tool invocation against `MCP_ALLOWED_TARGETS` (comma-separated CIDRs, hostnames, URL prefixes). `*` wildcard available for lab/CTF mode. Scope violations throw a `ScopeViolationError` before any subprocess is spawned.
- **Dynamic availability checks** — `registerSecurityTools()` is async; it runs `which <bin>` (or `docker exec <container> which <bin>` in docker-exec mode) at startup and only registers tools whose binaries are present. Missing tools are silently skipped.
- **`secureyeoman security` CLI** — Four subcommands manage the Kali container lifecycle: `setup` (pull `kalilinux/kali-rolling`, start container, install tools), `teardown` (stop + rm container), `update` (apt-get upgrade inside container), `status` (container state + per-tool availability table + env var snapshot).
- **Community skills independence** — `ethical-whitehat-hacker` and `security-researcher` community skills (prompt instructions) are parsed and injected by the Soul Manager regardless of `MCP_EXPOSE_SECURITY_TOOLS`. Skills provide AI reasoning capabilities on any system; the `sec_*` tools are an optional additive layer for systems that have Docker or native Kali tools.
- **Shodan integration** — `sec_shodan` performs a Shodan host lookup via the REST API (no binary required). Enabled when `SHODAN_API_KEY` is set.

### New Files

| File | Purpose |
|------|---------|
| `packages/mcp/src/tools/security-tools.ts` | `registerSecurityTools()` — 14 `sec_*` MCP tools with scope validation, docker-exec/native dispatch, availability checks |
| `packages/mcp/src/tools/security-tools.test.ts` | Unit tests: disabled guard, enabled registration, docker-exec mode, scope validation, wildcard, shodan |
| `packages/core/src/cli/commands/security.ts` | `secureyeoman security` CLI — setup/teardown/update/status subcommands |
| `packages/core/src/cli/commands/security.test.ts` | Unit tests: all four subcommands, failure paths, missing Docker, container-exists guard |
| `docs/adr/089-kali-security-toolkit-mcp.md` | ADR — three deployment modes, tool surface, scope enforcement, community skills independence, trade-offs |

### Modified Files

- **`packages/shared/src/types/mcp.ts`** — Added `exposeSecurityTools`, `securityToolsMode`, `securityToolsContainer`, `allowedTargets`, `shodanApiKey` to `McpServiceConfigSchema`
- **`packages/mcp/src/config/config.ts`** — Added env var parsing for `MCP_EXPOSE_SECURITY_TOOLS`, `MCP_SECURITY_TOOLS_MODE`, `MCP_SECURITY_TOOLS_CONTAINER`, `MCP_ALLOWED_TARGETS`, `SHODAN_API_KEY`
- **`packages/mcp/src/tools/index.ts`** — `registerAllTools` made async; added `await registerSecurityTools()`
- **`packages/mcp/src/cli.ts`** and **`packages/mcp/src/server.ts`** — `await registerAllTools()`
- **`packages/core/src/cli.ts`** — Registered `securityCommand`
- **`docs/development/roadmap.md`** — Added Kali Security Toolkit future enhancements section (CIDR-aware scope validation, scope manifest UI, prebuilt image, structured output normalization, Hydra)
- **`docs/guides/getting-started.md`** — Added Security Toolkit (Optional) section with setup walkthrough, env vars, lifecycle commands, community skills note
- **`docs/configuration.md`** — Added Security Toolkit subsection with 5-row env var table

---

## Agnostic QA Sub-Agent Team (2026-02-21) — ADR 090

### New Features

- **`agnostic_*` MCP tools** — Nine tools bridge YEOMAN agents to the [Agnostic](https://github.com/MacCracken/agnostic) Python/CrewAI 6-agent QA platform: `agnostic_health`, `agnostic_agents_status`, `agnostic_agents_queues`, `agnostic_dashboard`, `agnostic_session_list`, `agnostic_session_detail`, `agnostic_generate_report`, `agnostic_submit_qa`, `agnostic_task_status`. All disabled by default; enabled via `MCP_EXPOSE_AGNOSTIC_TOOLS=true`.
- **JWT auth with in-process caching** — The bridge logs in via `POST /api/auth/login` on first use and caches the JWT keyed by `agnosticUrl`; auto-refreshes before expiry. No manual token management required.
- **Incremental readiness** — Read-only tools (health, agents status, queue depths, session list/detail, report generation) work immediately once Agnostic is running. `agnostic_submit_qa` and `agnostic_task_status` return an actionable error referencing `agnostic/TODO.md Priority 1` until Agnostic implements `POST /api/tasks`.
- **`secureyeoman agnostic` CLI** — Five subcommands manage the Agnostic Docker Compose stack: `start` (`docker compose up -d`), `stop` (`docker compose down`), `status` (NDJSON container table + API URL hint), `logs [agent] [--follow] [--tail N]` (streaming or buffered), `pull` (`docker compose pull`).
- **Agnostic path auto-detection** — The CLI finds the agnostic directory from `--path` flag, `AGNOSTIC_PATH` env var, or auto-detection of `../agnostic`, `~/agnostic`, `~/Repos/agnostic`, `~/Projects/agnostic`.
- **`agnostic/TODO.md`** — A prioritised REST API improvement backlog written to the Agnostic repo covering 7 items: `POST /api/tasks` + `GET /api/tasks/{id}` (P1), API key auth (P2), webhook callbacks (P3), agent-specific task endpoints (P4), OpenAPI schema + TS client generation (P5), enhanced `/health` (P6), CORS headers (P7).

### New Files

| File | Purpose |
|------|---------|
| `packages/mcp/src/tools/agnostic-tools.ts` | `registerAgnosticTools()` — 9 `agnostic_*` MCP tools with JWT caching and incremental readiness |
| `packages/mcp/src/tools/agnostic-tools.test.ts` | Unit tests: disabled guard, health (unauthenticated), auth caching, read-only tools, submit_qa P1 error |
| `packages/core/src/cli/commands/agnostic.ts` | `secureyeoman agnostic` CLI — start/stop/status/logs/pull subcommands |
| `packages/core/src/cli/commands/agnostic.test.ts` | Unit tests: help, path resolution, all subcommands including NDJSON status parsing and log filtering |
| `docs/adr/090-agnostic-qa-sub-agent-team.md` | ADR — two-layer integration design (lifecycle CLI + MCP bridge), tool table, TODO.md summary, trade-offs |
| `/home/macro/Repos/agnostic/TODO.md` | Prioritised REST API improvements for YEOMAN integration |

### Modified Files

- **`packages/shared/src/types/mcp.ts`** — Added `exposeAgnosticTools`, `agnosticUrl`, `agnosticEmail`, `agnosticPassword` to `McpServiceConfigSchema`
- **`packages/mcp/src/config/config.ts`** — Added env var parsing for `MCP_EXPOSE_AGNOSTIC_TOOLS`, `AGNOSTIC_URL`, `AGNOSTIC_EMAIL`, `AGNOSTIC_PASSWORD`
- **`packages/mcp/src/tools/index.ts`** — Added `registerAgnosticTools()`
- **`packages/core/src/cli.ts`** — Registered `agnosticCommand`
- **`docs/development/roadmap.md`** — Added Agnostic QA Sub-Agent Team future enhancements section; added Phase 32 Agnostic reference
- **`docs/guides/getting-started.md`** — Added Agnostic QA Sub-Agent Team (Optional) section
- **`docs/configuration.md`** — Added Agnostic QA Team Bridge subsection with 4-row env var table

---

## Phase 32 (2026-02-21): Cross-Integration Routing Rules

### New Features

- **Routing rules engine** — Priority-ordered rule evaluation system that runs after a message is stored but before the task executor processes it. Rules specify trigger conditions (platform allowlist, integration allowlist, chatId/senderId/keyword regex patterns, direction) and a single action. All matching rules fire; evaluation is fire-and-forget so rule failures never drop a message.
- **Four action types** — `forward` relays the message (optionally via Mustache template) to a different `(integrationId, chatId)`; `reply` is the same but scoped conceptually to the same conversation on a different integration; `personality` invokes an `onPersonalityOverride` callback with a specified personality ID; `notify` HTTP POSTs the message payload to a webhook URL (10 s `AbortSignal` timeout).
- **Pattern matching** — Trigger patterns evaluated with `new RegExp(pattern, 'i')`; invalid regex strings fall back to silent literal substring matching; `null` patterns are wildcards (always match).
- **Match analytics** — Each matched rule has `match_count` incremented and `last_matched_at` updated non-blocking via `recordMatch()`. Surfaced in the rule list UI.
- **Dry-run test endpoint** — `POST /api/v1/routing-rules/:id/test` evaluates a rule against synthetic params without sending anything. Used by the rule builder's test panel.
- **Visual rule builder** — `RoutingRulesPage` embedded as the **Routing Rules** tab in the Connections page (`/connections?tab=routing`). Lists rules with enable/disable toggles, edit, inline dry-run test panel, and delete. `RuleForm` covers all trigger fields and action-type-specific configuration. Redirect from `/routing-rules` → `/connections?tab=routing`.
- **Cross-integration routing wired into `MessageRouter`** — `RoutingRulesManager.processMessage()` called from `handleInbound()` via fire-and-forget `void` wrapper; routing rule failures cannot delay or drop message processing.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/integrations/routing-rules-storage.ts` | `RoutingRulesStorage` (extends `PgBaseStorage`) — CRUD + `listEnabled()` + `recordMatch()` |
| `packages/core/src/integrations/routing-rules-manager.ts` | `RoutingRulesManager` — `evaluateRules()`, `applyRule()`, `processMessage()`, `testRule()` |
| `packages/core/src/integrations/routing-rules-routes.ts` | REST API: `GET/POST/PUT/DELETE /api/v1/routing-rules[/:id]` + `POST /api/v1/routing-rules/:id/test` |
| `packages/dashboard/src/components/RoutingRulesPage.tsx` | Visual rule builder embedded in ConnectionsPage as the Routing Rules tab |
| `packages/dashboard/src/components/RoutingRulesPage.test.tsx` | Unit tests: empty state, rule list render, form open, create rule, enable/disable toggle, dry-run panel |
| `docs/adr/088-cross-integration-routing-rules.md` | ADR — rule schema, action types, evaluation pipeline, dry-run design, trade-offs |

### Modified Files

- **`packages/core/src/integrations/message-router.ts`** — Added `setRoutingRulesManager()` setter and fire-and-forget `processMessage()` call in `handleInbound()` after the empty-message guard
- **`packages/core/src/secureyeoman.ts`** — Added `RoutingRulesStorage`, `RoutingRulesManager` fields and initialisation; added `getRoutingRulesStorage()` / `getRoutingRulesManager()` getters; wires `RoutingRulesManager` → `MessageRouter` after integration manager is ready
- **`packages/core/src/gateway/server.ts`** — Registered routing-rules REST routes via `registerRoutingRulesRoutes()`
- **`packages/dashboard/src/api/client.ts`** — Added `RoutingRule` interface; added `fetchRoutingRules()`, `createRoutingRule()`, `updateRoutingRule()`, `deleteRoutingRule()`, `testRoutingRule()` API functions
- **`packages/dashboard/src/components/ConnectionsPage.tsx`** — Added `'routing'` to `TabType`; added Routing Rules tab button with `ArrowRightLeft` icon; added `<RoutingRulesTab>` pane
- **`packages/dashboard/src/components/DashboardLayout.tsx`** — Added `/routing-rules` → `/connections?tab=routing` redirect route
- **`docs/development/roadmap.md`** — Added Phase 32 to timeline; removed Cross-Integration Routing Rules from Future Features
- **`README.md`** — Updated Integrations and Dashboard feature descriptions; updated test and ADR counts

---

## Phase 31 (2026-02-21): Group Chat View

### New Features

- **Unified channel list** — `/group-chat` page with three panes: channel list (all `(integrationId, chatId)` pairs sorted by most recent activity, 15 s refetch), message thread (paginated history, newest-first reversal for display, 5 s refetch), and reply box (free-text; `Enter` sends, `Shift+Enter` newlines).
- **Read projection over existing messages table** — No new table required. Channels are derived by `GROUP BY (integration_id, chat_id)` with correlated subqueries for last message, unread count, and personality. Migration 030 added `personality_id` to the `messages` table; personality names resolved via a secondary `SELECT` from `soul.personalities` to avoid JOIN fragility.
- **Group Chat pins schema** — `group_chat_pins` table added for future pinned-message support (schema-only; not yet surfaced in UI). See ADR 087.
- **Reply pipeline** — Reuses the hardened `IntegrationManager.sendMessage()` path; no new send logic.
- **WebSocket channel** — `group_chat` WebSocket channel registered with `integrations:read` permission in `CHANNEL_PERMISSIONS`; current polling is sufficient for initial release; WS push ready for future use.
- **Sidebar navigation** — `MessagesSquare` icon and **Group Chat** nav item added before Connections in `Sidebar.tsx`; lazy-loaded page at `/group-chat` in `DashboardLayout.tsx`.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/integrations/group-chat-storage.ts` | `GroupChatStorage` (extends `PgBaseStorage`) — `listChannels()` + `listMessages()` |
| `packages/core/src/integrations/group-chat-routes.ts` | REST API: `GET /api/v1/group-chat/channels`, `GET /api/v1/group-chat/channels/:integrationId/:chatId/messages`, `POST /api/v1/group-chat/channels/:integrationId/:chatId/messages` |
| `packages/dashboard/src/components/GroupChatPage.tsx` | Three-pane Group Chat UI with `MessageBubble`, `timeAgo()`, `platformIcon()` |
| `packages/dashboard/src/components/GroupChatPage.test.tsx` | Unit tests: empty state, channel list render, message thread on click, send message |
| `docs/adr/087-group-chat-view.md` | ADR — read-projection design, 3-pane layout, polling vs WS trade-offs |

### Modified Files

- **`packages/core/src/secureyeoman.ts`** — Added `GroupChatStorage` field and initialisation (Step 5.76); added `getGroupChatStorage()` getter
- **`packages/core/src/gateway/server.ts`** — Registered group-chat REST routes via `registerGroupChatRoutes()`; added `group_chat` to `CHANNEL_PERMISSIONS`
- **`packages/dashboard/src/api/client.ts`** — Added `GroupChatChannel`, `GroupChatMessage` interfaces; added `fetchGroupChatChannels()`, `fetchGroupChatMessages()`, `sendGroupChatMessage()` API functions
- **`packages/dashboard/src/components/DashboardLayout.tsx`** — Added lazy import and `/group-chat` route
- **`packages/dashboard/src/components/Sidebar.tsx`** — Added `MessagesSquare` import and Group Chat nav item
- **`docs/development/roadmap.md`** — Added Phase 31 to timeline; removed Group Chat View from Future Features
- **`README.md`** — Updated Dashboard feature description; updated test and ADR counts

---

## Phase 30 (2026-02-21): Letta Stateful Agent Provider

### New Features

- **Letta provider** (`provider: letta`) — Adds Letta as the 11th AI provider. Letta is a stateful agent platform where each agent maintains persistent memory across requests using in-context memory blocks and archival vector storage. Unlike all other SecureYeoman providers (which are stateless chat completion endpoints), Letta agents accumulate and recall context across the lifetime of the provider instance.
- **Agent lifecycle management** — `LettaProvider` lazily creates one Letta agent on first use and caches the agent ID for the provider's lifetime. Concurrent first-request races are coalesced into a single creation promise. Set `LETTA_AGENT_ID` in `.env` to reuse a pre-existing agent and skip creation entirely.
- **Streaming support** — `chatStream()` uses Letta's SSE stream endpoint (`POST /v1/agents/{id}/messages/stream` with `streaming: true`), yielding `content_delta`, `usage`, and `done` chunks in the unified `AIStreamChunk` format.
- **Tool/function calling** — `client_tools` are sent via the messages endpoint; `tool_calls` in `assistant_message` responses are mapped to the unified `ToolCall[]` format.
- **Dynamic model discovery** — `GET /v1/models` is called when `LETTA_API_KEY` is set. Falls back to `getKnownModels()` when the endpoint is unreachable.
- **Self-hosted support** — Set `LETTA_BASE_URL` to point at a self-hosted Letta server, or use `LETTA_LOCAL=true` as shorthand for `http://localhost:8283`.
- **Model tier registration** — Letta model IDs (`openai/gpt-4o`, `openai/gpt-4o-mini`, `anthropic/claude-sonnet-4-20250514`, `anthropic/claude-haiku-3-5-20241022`) are added to the `ModelRouter` tier map so intelligent routing works across Letta models.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/ai/providers/letta.ts` | `LettaProvider` — stateful Letta agent adapter using native `fetch` |
| `packages/core/src/ai/providers/letta.test.ts` | Unit tests: constructor, agent lifecycle, chat, streaming, error mapping, model discovery |
| `docs/adr/086-letta-provider.md` | ADR — agent vs. completion design, SDK vs. fetch decision, trade-offs |

### Modified Files

- **`packages/shared/src/types/ai.ts`** — Added `'letta'` to `AIProviderNameSchema` enum
- **`packages/shared/src/types/config.ts`** — Added `'letta'` to `ModelConfigSchema.provider` and `FallbackModelConfigSchema.provider` enums
- **`packages/core/src/ai/client.ts`** — Imported `LettaProvider`; added `case 'letta'` to `createProvider()` factory
- **`packages/core/src/ai/cost-calculator.ts`** — Added Letta model pricing entries (`openai/gpt-4o`, `openai/gpt-4o-mini`, `anthropic/claude-*`), `FALLBACK_PRICING.letta`, `PROVIDER_KEY_ENV.letta = 'LETTA_API_KEY'`, and `getAvailableModelsAsync()` dynamic discovery task for Letta
- **`packages/core/src/ai/model-routes.ts`** — Added `'letta'` to `validProviders` list in `POST /api/v1/model/switch`
- **`packages/core/src/ai/model-router.ts`** — Added Letta model IDs to `MODEL_TIER` map (fast: `openai/gpt-4o-mini`, `anthropic/claude-haiku-*`; capable: `openai/gpt-4o`, `anthropic/claude-sonnet-*`)
- **`.env.example`** — Added `LETTA_API_KEY`, `LETTA_BASE_URL`, `LETTA_AGENT_ID`, `LETTA_LOCAL` entries
- **`.env.dev.example`** — Added `LETTA_API_KEY`, `LETTA_BASE_URL`, `LETTA_AGENT_ID`, `LETTA_LOCAL` entries
- **`docs/development/roadmap.md`** — Added Phase 30 to timeline
- **`README.md`** — Added Letta to AI Integration feature table and provider count
- **`docs/guides/ai-provider-api-keys.md`** — Added Letta API key setup section

---

## Phase 29 (2026-02-21): Intelligent Model Routing

### New Features

- **Heuristic task profiler** — `profileTask()` analyses a task string and returns `{ complexity, taskType, estimatedInputTokens }`. Task types: `summarize`, `classify`, `extract`, `qa`, `code`, `reason`, `plan`, `general`. Complexity: `simple` / `moderate` / `complex` derived from word count, multi-clause indicators, and task type.
- **ModelRouter** — Selects the cheapest appropriate model for a delegation or swarm role without sacrificing quality. Routes `fast`-tier tasks (summarise, classify, extract, QA) to cheap/fast models (Haiku, gpt-4o-mini, Gemini Flash) and `capable`-tier tasks (code, reason, plan) to balanced models (Sonnet, gpt-4o). Respects the personality's `allowedModels` policy; falls back to the profile's configured default when confidence < 0.5 or no candidates survive filtering. Targets ≥30% cost reduction on mixed sub-agent workloads.
- **Cost-aware swarm scheduling** — `SwarmManager` now accepts a `ModelRouter` and profiles each role's task type before delegation. Injects a `modelOverride` into each `DelegationParams` so cheaper models handle simple roles while capable models handle reasoning-heavy ones. Applies to both sequential and parallel swarm strategies.
- **`POST /api/v1/model/estimate-cost`** — Pre-execution cost estimate endpoint. Accepts `{ task, context?, tokenBudget?, roleCount?, allowedModels? }` and returns task profile, selected model, tier, confidence, estimated cost in USD, and a cheaper alternative when one exists. Enables dashboards and scripts to show cost estimates before committing to a swarm run.
- **`AIClient.getCostCalculator()`** — Exposes the client's internal `CostCalculator` instance for use by the router and route handlers.
- **`SecureYeoman.getCostCalculator()`** — Proxy to `AIClient.getCostCalculator()` for use in Fastify route options.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/ai/model-router.ts` | `ModelRouter`, `profileTask()`, tier definitions, routing algorithm |
| `packages/core/src/ai/model-router.test.ts` | Unit tests: task type detection, complexity scoring, tier routing, allowedModels filtering, cost estimation, fallback |
| `docs/adr/085-intelligent-model-routing.md` | ADR — design rationale; heuristic vs. ML approach; what was deferred |

### Modified Files

- **`packages/shared/src/types/delegation.ts`** — Added optional `modelOverride` field to `DelegationParamsSchema` (additive, no breaking change)
- **`packages/core/src/agents/manager.ts`** — Added `costCalculator?` to `SubAgentManagerDeps`; constructs `ModelRouter`; resolves model via override → router → profile default → system default in `executeDelegation()`
- **`packages/core/src/agents/swarm-manager.ts`** — Added `costCalculator?` and `allowedModels?` to `SwarmManagerDeps`; constructs `ModelRouter`; added `selectModelForRole()` private helper; added `estimateSwarmCost()` public method; injects `modelOverride` in sequential and parallel role delegations
- **`packages/core/src/ai/client.ts`** — Added `getCostCalculator()` method
- **`packages/core/src/ai/model-routes.ts`** — Added `POST /api/v1/model/estimate-cost` route
- **`packages/core/src/secureyeoman.ts`** — Added `getCostCalculator()` method
- **`docs/development/roadmap.md`** — Added Phase 31 to timeline; removed Intelligent Model Routing from Future Features

---

## Phase 30 (2026-02-21): Multimodal Provider Abstraction — Voicebox + ElevenLabs

### New Features

- **TTS provider routing** — `synthesizeSpeech()` now dispatches to Voicebox local Qwen3-TTS when `TTS_PROVIDER=voicebox`. Existing OpenAI path unchanged. `VOICEBOX_URL` (default `http://localhost:17493`) and `VOICEBOX_PROFILE_ID` env vars configure the Voicebox connection.
- **STT provider routing** — `transcribeAudio()` now dispatches to Voicebox local Whisper when `STT_PROVIDER=voicebox`. Supports MLX (Apple Silicon) and PyTorch backends transparently.
- **Provider info in config endpoint** — `GET /api/v1/multimodal/config` now returns a `providers` object with `active`, `available`, and `voiceboxUrl` for both TTS and STT.
- **Speech Providers card in MultimodalPage** — New read-only card above the job stats shows which TTS and STT providers are active (highlighted badge) and what's available, with env var switch hints.
- **ElevenLabs MCP prebuilt** — One-click `stdio` MCP connection to ElevenLabs via the official `@elevenlabs/mcp` package. Provides 3,000+ voices, voice cloning, and 32-language synthesis as MCP tools. Requires `ELEVENLABS_API_KEY`.

### New Files

| File | Purpose |
|------|---------|
| `docs/adr/084-multimodal-provider-abstraction.md` | ADR — provider routing design; Voicebox selection rationale; ElevenLabs prebuilt; deferred items |

### Modified Files

- **`packages/core/src/multimodal/manager.ts`** — Added `getVoiceboxUrl()`, `transcribeViaVoicebox()`, `synthesizeViaVoicebox()` private methods; refactored `transcribeAudio()` and `synthesizeSpeech()` to branch on `STT_PROVIDER` / `TTS_PROVIDER` env vars
- **`packages/core/src/multimodal/multimodal-routes.ts`** — Updated config endpoint to include `providers` (active/available/voiceboxUrl) for TTS and STT
- **`packages/core/src/multimodal/manager.test.ts`** — Added voicebox STT/TTS routing tests (7 new tests: happy path, URL normalisation, error cases, missing PROFILE_ID)
- **`packages/dashboard/src/components/MultimodalPage.tsx`** — Added `ProviderCard` + `ProviderBadge` components; fetches config via `useQuery`; `Radio` icon imported
- **`packages/dashboard/src/components/McpPrebuilts.tsx`** — Added ElevenLabs prebuilt entry
- **`packages/dashboard/src/components/McpPrebuilts.test.tsx`** — Added ElevenLabs to expected servers list; added ElevenLabs connect flow test
- **`docs/development/roadmap.md`** — Added phases 29–30 to timeline; added Multimodal I/O Enhancement future features section

---

## Phase 29 (2026-02-21): Device Control MCP Prebuilt — Local Peripheral Access

### New Features

- **Device Control MCP prebuilt** — One-click `stdio` MCP connection to locally attached peripherals via `uvx mcp-device-server`. Provides 18+ tools across four categories: camera capture/recording (webcam), printer management (list, print, cancel jobs), audio recording/playback (microphone + speakers), and screen recording. No API keys required — device server auto-detects connected hardware.

### New Files

| File | Purpose |
|------|---------|
| `docs/adr/083-device-control-mcp-prebuilt.md` | ADR — integration model; native TS alternative considered and rejected; no-env-vars prebuilt pattern established |

### Modified Files

- **`packages/dashboard/src/components/McpPrebuilts.tsx`** — Added `Device Control` prebuilt entry (`uvx mcp-device-server`, `requiredEnvVars: []`, prerequisite note for uv/ffmpeg/PortAudio)
- **`packages/dashboard/src/components/McpPrebuilts.test.tsx`** — Added Device Control to expected servers list; updated Home Assistant button indices (10→11); added Device Control note and no-env-vars connect tests
- **`docs/guides/integrations.md`** — Added Device Control row to Supported Platforms table and MCP tab list; added Device Control setup section
- **`README.md`** — Updated MCP Protocol feature row to include Device Control prebuilt

---

## Phase 28 (2026-02-21): Semantic Search MCP Prebuilts — Meilisearch & Qdrant

### New Features

- **Meilisearch MCP prebuilt** — One-click `stdio` MCP connection to a Meilisearch instance via the official `meilisearch-mcp` Python package (`uvx meilisearch-mcp`). Provides hybrid full-text + vector search, facets, typo tolerance, and multi-index queries as MCP tools.
- **Qdrant MCP prebuilt** — One-click `stdio` MCP connection to a Qdrant vector database via the official `mcp-server-qdrant` Python package (`uvx mcp-server-qdrant`). Lets agents query existing Qdrant collections independently of the Brain module's managed storage.
- **Prerequisite note UI** — `PrebuiltServer.note` field surfaces runtime requirements (e.g. "requires uv") as a yellow advisory callout in the expanded connect form. Python-based prebuilts use this to inform users about the `uv` prerequisite.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/integrations/twitter/adapter.test.ts` | Full unit test suite for `TwitterIntegration` (mock `twitter-api-v2`) |
| `packages/dashboard/src/components/McpPrebuilts.test.tsx` | Component tests for `McpPrebuilts` — render, expand/collapse, note, URL vs password inputs, stdio and streamable-http connect flows, validation |
| `docs/adr/082-semantic-search-mcp-prebuilts.md` | ADR — Meilisearch/Qdrant integration model; QMD not needed rationale |

### Modified Files

- **`packages/dashboard/src/components/McpPrebuilts.tsx`** — Added `note` field to `PrebuiltServer` interface; yellow advisory callout rendered in expanded form; added Meilisearch and Qdrant prebuilt entries

---

## Phase 27 (2026-02-21): Twitter/X Integration + Home Assistant & Coolify MCP Prebuilts

### New Features

- **Twitter/X integration** — Full messaging-platform adapter in the Messaging tab. Polls mentions via Bearer Token (App-only), posts replies via OAuth 1.0a. `sinceId` tracking, configurable poll interval (default 5 min), normalized to `UnifiedMessage` with `tw_` prefix.
- **Home Assistant MCP prebuilt** — One-click `streamable-http` MCP connection to HA's native `/api/mcp` endpoint. User provides HA URL + Long-Lived Access Token; exposes all voice-assistant-exposed entities as MCP tools.
- **Coolify (MetaMCP) MCP prebuilt** — One-click `streamable-http` MCP connection to a MetaMCP instance deployed on Coolify. Aggregates multiple MCP servers behind a single endpoint.
- **Transport-aware MCP prebuilts** — `McpPrebuilts` component extended to support `streamable-http` prebuilts alongside existing `stdio` ones. URL template substitution (`{KEY}` tokens) resolves user-provided values at connect time.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/integrations/twitter/adapter.ts` | `TwitterIntegration` adapter — mention polling + tweet replies |
| `packages/core/src/integrations/twitter/index.ts` | Re-export |
| `docs/adr/081-twitter-ha-coolify-integrations.md` | ADR — integration model decisions for each platform |

### Modified Files

- **`packages/shared/src/types/integration.ts`** — Added `'twitter'` to `PlatformSchema`
- **`packages/core/src/secureyeoman.ts`** — Imported and registered `TwitterIntegration`
- **`packages/core/package.json`** — Added `twitter-api-v2` dependency
- **`packages/dashboard/src/components/ConnectionsPage.tsx`** — Added `twitter` entry to `PLATFORM_META` (Messaging tab)
- **`packages/dashboard/src/components/McpPrebuilts.tsx`** — Extended `PrebuiltServer` interface for HTTP transport; added Home Assistant and Coolify prebuilts
- **`docs/guides/integrations.md`** — Added Twitter/X, Home Assistant, Coolify, and Obsidian vault setup sections
- **`docs/development/roadmap.md`** — Added Group Chat view and Mobile App future feature items

---

## Phase 26 (2026-02-21): Real-Time Collaboration — Presence Indicators + CRDT

### New Features

- **Presence Indicators** — `PresenceBanner` component shows who else is editing the same personality system prompt or skill instructions in real time (colored dots + name label).
- **CRDT collaborative editing** — Y.Text (Yjs) CRDT ensures concurrent edits converge without data loss. System prompts and skill instructions are now collaboratively editable.

### New WebSocket Endpoint

- **`/ws/collab/:docId`** — Binary Yjs/y-websocket protocol endpoint. Handles sync (state vector exchange + incremental updates) and awareness (presence). Auth via `?token=` query param, same as `/ws/metrics`.
  - `docId` format: `personality:<uuid>` or `skill:<uuid>`
  - Server resolves display name from soul users table; falls back to role label.

### New Files

| File | Purpose |
|------|---------|
| `packages/core/src/soul/collab.ts` | `CollabManager` — Y.Doc lifecycle, Yjs relay, awareness, DB persistence |
| `packages/core/src/soul/collab.test.ts` | Unit tests (lifecycle, sync, awareness, debounce, presence) |
| `packages/core/src/storage/migrations/029_collab_docs.sql` | `soul.collab_docs(doc_id, state, updated_at)` |
| `packages/dashboard/src/hooks/useCollabEditor.ts` | Yjs hook: text state, sync, presence, null-safe disabled mode |
| `packages/dashboard/src/hooks/useCollabEditor.test.ts` | Hook tests (WS mock, binary messages, presence, cleanup) |
| `packages/dashboard/src/components/PresenceBanner.tsx` | Presence UI banner |
| `packages/dashboard/src/components/PresenceBanner.test.tsx` | Component tests (render, labels, color dots) |
| `docs/adr/080-real-time-collaboration.md` | ADR — Yjs vs Automerge, unified endpoint design |

### Modified Files

- **`packages/core/src/soul/storage.ts`** — Added `saveCollabDoc` / `loadCollabDoc` methods
- **`packages/core/src/storage/migrations/manifest.ts`** — Registered migration 029
- **`packages/core/src/gateway/server.ts`** — Added `CollabManager` field, `soul` channel permission, `/ws/collab` route
- **`packages/core/src/soul/soul-routes.ts`** — `broadcast` option; emits `soul` events on personality/skill update
- **`packages/dashboard/src/components/PersonalityEditor.tsx`** — `systemPrompt` textarea wired to `useCollabEditor` + `PresenceBanner`
- **`packages/dashboard/src/components/SkillsPage.tsx`** — `instructions` textarea wired to `useCollabEditor` + `PresenceBanner`
- **`packages/core/package.json`** — Added `yjs` dependency
- **`packages/dashboard/package.json`** — Added `yjs` dependency

### Architecture

See [ADR 080](docs/adr/080-real-time-collaboration.md) for the full design rationale (Yjs vs Automerge, custom server vs Hocuspocus, persistence strategy).

---

## Phase 24 (2026-02-20 → 2026-02-21): Testing All the Things

### Coverage Achieved

- **`@secureyeoman/core` coverage thresholds met** — All four Vitest coverage thresholds now pass:
  - Lines: **84.16%** (threshold: 80%) ✅
  - Functions: **85.32%** (threshold: 80%) ✅
  - Branches: **71.3%** (threshold: 70%) ✅
  - Statements: **83.7%** (threshold: 80%) ✅

### New Test Files (122 added)

- **Integration adapters** — Full test suites for all 30 platform adapters: Slack, Discord, Telegram, WhatsApp, GitHub, GitLab, Gmail, Email (IMAP/SMTP), Google Calendar, Google Chat, Line, Linear, Notion, Jira, Azure DevOps, AWS Lambda, Stripe, Airtable, YouTube, Spotify, Figma, Todoist, Zapier, Signal, DingTalk, QQ, Webhook, iMessage, Teams, CLI
- **CLI commands** — `init.ts`, `start.ts`, `mcp-server.ts` (join existing `migrate.ts`, `extension.ts`)
- **Body layer** — `capture-process.ts` (sandbox lifecycle, platform detection, timeout enforcement)
- **Storage & security** — `pg-pool.ts`, `pg-base.ts`, keyring providers (Linux secret service, macOS Keychain, Windows DPAPI), `cert-gen.ts`, `agent-comms.ts`
- **Brain & memory** — `brain/storage.ts`, `brain/vector/manager.ts`, `faiss-store.ts`, `qdrant-store.ts`, `external-sync.ts`, `consolidation/executor.ts`
- **Soul/Spirit/Config** — `soul/storage.ts`, `spirit/storage.ts`, `system-preferences-storage.ts`
- **MCP** — `mcp/client.ts`, `mcp/server.ts`

### Integration Test Gaps — Closed

- **`multi-user.integration.test.ts`** (6 tests) — concurrent session isolation, logout scope, viewer/admin concurrency, refresh token rotation, multi-key lifecycle
- **`workspace-rbac.integration.test.ts`** (7 tests) — workspace CRUD, member add/role-update/remove, viewer RBAC enforcement, last-admin protection, invalid role rejection

### Test Count

| Package | Before Phase 24 | After Phase 24 |
|---------|-----------------|----------------|
| `@secureyeoman/core` | 2,170 tests / 161 files | **5,594 tests / 285 files** |
| `@secureyeoman/mcp` | 326 tests / 31 files | 326 tests / 31 files |
| `@secureyeoman/dashboard` | 406 tests / 32 files | 406 tests / 32 files |
| **Total** | **2,902 / 224 files** | **6,326 / 348 files** |

---

## Phase 25 (2026-02-20): Bug Fixes — Single Binary Smoke Test

### Verified

- **`--version` on all runnable targets** — `secureyeoman --version` exits 0 and
  prints `secureyeoman v2026.2.19` for linux-x64 (Tier 1). arm64 and darwin-arm64
  targets skipped on x86_64 Linux; will be validated in CI cross-platform builds.

- **`config validate --json` on all runnable targets** — exits 0 with
  `{"valid":true,...}` using a minimal smoke config (Ollama provider, audit and
  encryption disabled, only `SECUREYEOMAN_TOKEN_SECRET` and
  `SECUREYEOMAN_ADMIN_PASSWORD` required). Tier 1 linux-x64 passes.

- **`health --json` on Tier 1 linux-x64** — binary starts against a fresh
  PostgreSQL smoke database (created and dropped per run), all 30 migrations apply,
  `/health` returns `{"status":"ok"}`, `health --json` exits 0 and reports
  `status=ok`. Tier 2 (lite) linux-x64 will be validated in CI once Bun is
  available in the build environment.

### Bugs Fixed

- **`start.ts`: version hardcoded as `v1.5.1`** — `secureyeoman --version` and the
  startup banner both printed the stale hardcoded string `v1.5.1` regardless of the
  current release version. Fixed by introducing `packages/core/src/version.ts`
  (exports `VERSION = '2026.2.19'`) and importing it in `start.ts`; `--version`
  now prints the correct release version.

- **`server.ts`: `/health` returned `"version":"0.0.0"`** — The health endpoint
  read the version from `package.json` via `getPackageVersion()`. In a Bun-compiled
  standalone binary `import.meta.url` resolves into the virtual FS root
  (`/$bunfs/`) and `package.json` is not bundled, so every path check failed and
  the fallback `'0.0.0'` was always returned. Fixed by replacing `getPackageVersion()`
  with a direct import of `VERSION` from `version.ts`.

- **Audit chain key conflict on repeated smoke test runs** — Running the smoke test
  a second time against the same PostgreSQL database failed with
  `Audit chain integrity compromised: last entry signature invalid` because the
  previous run had written audit entries signed with a different dummy key.
  Fixed in `scripts/smoke-test-binary.sh`: each binary test now creates and drops a
  fresh uniquely-named database (`sy_smoke_<pid>_<epoch>`) so there are no leftover
  entries from prior runs.

- **`build-binary.sh`: Tier 2 lite binaries failed to compile** — The Tier 2 build
  did not include `--external` flags for `playwright`, `playwright-core`, `electron`,
  and `chromium-bidi`, causing `bun build --compile` to fail with
  `Could not resolve: "electron"` errors. Tier 1 already excluded these optional
  dependencies; Tier 2 now uses the same flags.

### New Files

- `packages/core/src/version.ts` — Single source of truth for the release version
  string in compiled binaries. Exported constant `VERSION`; updated automatically
  by `scripts/set-version.sh`. Eliminates the need to read `package.json` at runtime.

- `scripts/smoke-test-binary.sh` — End-to-end binary smoke test script. Accepts
  `--build` to compile all targets before testing. For each binary: checks
  `--version`, runs `config validate --json` (offline), and starts the server
  against a fresh PostgreSQL database to verify `health --json` returns `status=ok`.
  Skips binaries that cannot run on the current platform/arch. Cleans up the smoke
  database on exit.

### Files Changed

- `packages/core/src/version.ts` — new file; `VERSION = '2026.2.19'`
- `packages/core/src/cli/commands/start.ts` — imports `VERSION`; `--version` output
  and banner now use the constant instead of the hardcoded string `v1.5.1`
- `packages/core/src/gateway/server.ts` — imports `VERSION`; `/health` version field
  now uses the constant; removed `getPackageVersion()` helper that silently fell back
  to `'0.0.0'` in binary mode
- `scripts/set-version.sh` — now also updates the `VERSION` constant in
  `packages/core/src/version.ts` alongside the `package.json` files
- `scripts/smoke-test-binary.sh` — new smoke test script (see New Files above)
- `scripts/build-binary.sh` — Tier 2 lite targets now include the same
  `--external playwright --external playwright-core --external electron
  --external chromium-bidi` flags as Tier 1; without these the Tier 2 compile
  failed with unresolved module errors
- `.github/workflows/release-binary.yml` — added `postgres` service container and
  `Smoke test` step (`bash scripts/smoke-test-binary.sh`) after binary compilation;
  smoke test runs against `localhost:5432` before the GitHub Release is created

---

## Phase 25 (2026-02-20): Bug Fixes — Helm / Kubernetes

### Verified

- **All 30 migrations apply via pre-install hook** — `helm install` on a kind cluster against
  fresh Postgres; the pre-install Job (`secureyeoman migrate`, hook weight -5) applied all 30
  migrations and exited 0 before the Deployment rolled out.

- **Core pod Running and healthy** — `/health` returned
  `{"status":"ok","checks":{"database":true,"auditChain":true}}` immediately after the
  Deployment became available.

- **Rolling restart fast-path confirmed** — `kubectl rollout restart deployment/sy-secureyeoman-core`
  completed cleanly; new pod started without executing any migration SQL; migration count
  remained at 30.

- **Idempotent `helm upgrade`** — pre-upgrade hook ran `secureyeoman migrate`; fast-path
  returned immediately (all 30 already applied); no duplicate inserts.

### Bugs Fixed

- **`migrate.ts` wrong config path: `config.database` → `config.core.database`** — The
  `initPoolFromConfig` call used the top-level `config.database` which does not exist in
  `ConfigSchema`. The database config is nested under `core` (`config.core.database`). Every
  migrate Job attempt failed with
  `TypeError: undefined is not an object (evaluating 'dbConfig.passwordEnv')`.

- **Chart missing required app secrets** — `secret.yaml` and `values.yaml` lacked
  `SECUREYEOMAN_SIGNING_KEY`, `SECUREYEOMAN_TOKEN_SECRET`, `SECUREYEOMAN_ENCRYPTION_KEY`,
  `SECUREYEOMAN_ADMIN_PASSWORD`. Core pods failed with `Missing required secrets`.
  Added to both files.

- **Chart missing `SECUREYEOMAN_LOG_FORMAT`** — Without this, core pods used the `pretty`
  log format which spawns pino transport worker threads that fail in the lean binary image.
  Added `SECUREYEOMAN_LOG_FORMAT: "json"` to `configmap.yaml`.

- **`migrate-job.yaml`: ServiceAccount, ConfigMap, and secrets unavailable at hook time** —
  The Job used the app ServiceAccount and a ConfigMap that don't exist at pre-install time
  (regular chart resources). Fixed: `serviceAccountName: default`; DB config inlined as env
  vars; secrets extracted to a new hook-only Secret (`migrate-secret.yaml`, weight -10).

### New Files

- `deploy/helm/secureyeoman/templates/migrate-job.yaml` — pre-install/pre-upgrade Helm hook
  Job running `secureyeoman migrate` (hook weight -5); `backoffLimit: 3`;
  `activeDeadlineSeconds: 300`; non-root, read-only root filesystem, all capabilities dropped.

- `deploy/helm/secureyeoman/templates/migrate-secret.yaml` — pre-install/pre-upgrade hook
  Secret (weight -10) providing `POSTGRES_PASSWORD` and app secrets to the migrate Job before
  the main chart `secret.yaml` resource exists.

- `packages/core/src/cli/commands/migrate.ts` — new `secureyeoman migrate` CLI subcommand:
  loads config, initialises pool, runs migrations, exits 0/1. Used by the Helm hook Job and
  can be run standalone (CI, manual pre-migration).

### Files Changed

- `packages/core/src/cli/commands/migrate.ts` — `config.database` → `config.core.database`
- `packages/core/src/cli.ts` — registered `migrateCommand`
- `packages/core/src/storage/migrations/runner.ts` — Postgres advisory lock
  (`pg_advisory_lock(hashtext('secureyeoman_migrations'))`) wraps the per-entry loop;
  double-check fast-path after lock acquired; `pg_advisory_unlock` in `finally`
- `deploy/helm/secureyeoman/values.yaml` — added `migration.hookEnabled: true`; added
  `secrets.signingKey`, `tokenSecret`, `encryptionKey`, `adminPassword`
- `deploy/helm/secureyeoman/templates/secret.yaml` — added four required app secrets
- `deploy/helm/secureyeoman/templates/configmap.yaml` — added `SECUREYEOMAN_LOG_FORMAT: "json"`

---

## Phase 24 (2026-02-20): Migration Integrity — Helm / Kubernetes

### Verified

- **`helm lint` passes** — No errors; one informational warning (missing `icon` field in
  `Chart.yaml`).

- **`helm template` renders cleanly** — All resources render without errors; checksum
  annotations computed; hook resources carry correct `helm.sh/hook` annotations and weights.

- **kind cluster: 30 migrations applied via hook** — `helm install` on `kind-sy-test`;
  pre-install migrate Job ran to completion; `SELECT COUNT(*) FROM schema_migrations`
  returned 30.

- **Core pod healthy** — `/health` returned
  `{"status":"ok","checks":{"database":true,"auditChain":true}}`.

- **Rolling restart fast-path** — `kubectl rollout restart` completed; new pod did not run
  any migration SQL; count remained 30.

---

## Phase 24 (2026-02-20): Migration Integrity — Binary & Docker Production (Binary-Based)

### Verified

- **Binary — all 30 migrations apply on fresh Postgres** — Bun 1.3.9 compiled binary
  (`npm run build:binary`) runs `secureyeoman start` against a fresh Postgres instance;
  all 30 manifest entries applied without error; `health --json` returned
  `{"status":"ok","database":true,"auditChain":true}`.

- **Binary — fast-path on restart** — Second `secureyeoman start` against the already-migrated
  database triggers the fast-path in `runner.ts` (latest manifest ID matches latest DB row →
  immediate return); migration count remains 30; no duplicate inserts.

- **Docker production (binary image) — all 30 migrations apply on fresh Postgres** —
  `docker build` from `Dockerfile` (binary-based `debian:bookworm-slim` image); container
  run against fresh Postgres applies all 30 migrations, creates default workspace, emits
  JSON logs cleanly.

- **Docker production (binary image) — idempotency on restart** — Second container run
  against already-migrated database leaves `schema_migrations` count unchanged at 30 and
  workspace count unchanged at 1.

### Bugs Fixed

- **`manifest.ts` — Bun binary detection used `.startsWith` instead of `.includes`** —
  In Bun 1.3.9, `import.meta.url` inside a compiled standalone binary is a `file://` URL
  (`file:///$bunfs/root/<binary-name>`), not a bare `/$bunfs/` path. The check
  `import.meta.url.startsWith('/$bunfs/')` was always `false`; `fileURLToPath` then resolved
  the virtual FS URL to `/$bunfs/root/` as `__dirname`; every `readFileSync` call threw
  `ENOENT: /$bunfs/root/001_initial_schema.sql`. Fixed by changing to
  `import.meta.url.includes('/$bunfs/')`.

- **`.dockerignore` missing `!dist/migrations/` exception** — `dist/` was globally excluded;
  only `!dist/secureyeoman-linux-x64` was whitelisted. `docker build` failed with
  `"/dist/migrations": not found`. Fixed by adding `!dist/migrations/` to `.dockerignore`.

- **pino transport worker threads crash in lean binary Docker image** — `pino`'s transport API
  (`pino/file`, `pino-pretty`) spawns a `thread-stream` worker that dynamically `require()`s
  modules at runtime. In the `debian:bookworm-slim` image there are no `node_modules`; the
  worker threw `ModuleNotFound resolving "node_modules/thread-stream/lib/worker.js"`. Fixed by
  having `createTransport()` return `undefined` for `json` stdout — `pino(options)` writes JSON
  to fd 1 synchronously, no worker thread needed.

- **No env-var override for log format** — There was no way to select JSON logging without a
  YAML config file. Added `SECUREYEOMAN_LOG_FORMAT` env var to `config/loader.ts`
  (`json` | `pretty`). The `Dockerfile` now sets `ENV SECUREYEOMAN_LOG_FORMAT=json`.

### Files Changed

- `packages/core/src/storage/migrations/manifest.ts` — `.startsWith` → `.includes` for Bun binary detection; updated comment explaining `file:///$bunfs/` URL format
- `.dockerignore` — added `!dist/migrations/` exception
- `.gitignore` — clarified `dist/` comment to mention `dist/migrations/`
- `packages/core/src/logging/logger.ts` — JSON stdout bypasses worker-thread pino transport; added comment explaining why
- `packages/core/src/config/loader.ts` — `SECUREYEOMAN_LOG_FORMAT` env-var support
- `Dockerfile` — `ENV SECUREYEOMAN_LOG_FORMAT=json`; `COPY dist/migrations/ /usr/local/bin/migrations/`; updated dashboard comment
- `scripts/build-binary.sh` — `mkdir dist/migrations && cp *.sql`; `--external` flags for playwright deps; `--assets` flag commented out with Bun version note

---

## Phase 25 (2026-02-20): Bug Fixes — Docker Cold-Start (production)

### Verified

- **All 30 migrations apply cleanly on a fresh database** — Cold-start (`docker compose down -v
  && docker compose up`) against postgres + core (no profile) applied all 30 manifest entries
  without error.

- **Default workspace created** — `WorkspaceManager` logged `Default workspace created` with
  a valid UUID on first boot against an empty database.

- **Healthcheck passes** — `health --json` returned `{"status":"ok","version":"2026.2.19",
  "checks":{"database":true,"auditChain":true}}`. Both containers reached Docker `healthy`
  status within the configured `start_period`.

- **No MCP or dashboard-dev services start** — Production profile (no `--profile` flag) starts
  only `postgres` + `core`, confirming profile gating is correct.

### Notes

- The `core` service in `docker-compose.yml` uses `Dockerfile.dev` (Node.js multi-stage build)
  for local docker compose in both dev and production profiles. The binary-based `Dockerfile`
  (Bun-compiled single binary) is for GitHub release artifacts and is covered separately by
  the "Single binary smoke test" item in Phase 25.

---

## Phase 24 (2026-02-20): Migration Integrity — Docker Dev

### Verified

- **All 30 migrations apply cleanly on a fresh database** — Cold-start (`docker compose
  --profile dev down -v && up --build`) applied all 30 manifest entries (001–028, with two
  `006_*` and two `007_*` pairs) without error. All entries recorded in `schema_migrations`.

- **Idempotency confirmed** — Restarting `core` against an already-migrated database triggers
  the fast-path in `runner.ts` (latest manifest ID matches latest DB row → immediate return)
  with no migration SQL executed and no duplicate-key errors.

### Bugs Fixed

- **`proactive` schema missing from `truncateAllTables`** — `test-setup.ts` listed 16 schemas
  to truncate between tests but omitted `proactive` (added by migration 028). Any test writing
  to `proactive.heartbeat_log` would leave rows that leaked into subsequent tests. Fixed by
  adding `'proactive'` to the schema list.

### Tests Added

- **`packages/core/src/storage/migrations/runner.test.ts`** — Four integration tests for the
  migration runner against the test Postgres instance:
  1. Fresh apply — wipes `schema_migrations`, re-runs, confirms all 30 IDs present in order
  2. Idempotent second call — re-runs on a fully-migrated DB, confirms row count unchanged
  3. Partial-state recovery — deletes last entry, re-runs, confirms it is re-applied without
     re-running already-applied migrations (fast-path bypassed; per-entry skip engaged)
  4. Timestamp validation — every row carries a positive numeric `applied_at` value

### Files Changed

- `packages/core/src/storage/migrations/runner.test.ts` — new file (4 integration tests)
- `packages/core/src/test-setup.ts` — `proactive` schema added to `truncateAllTables`

---

## Phase 25 (2026-02-20): Bug Fixes — Docker Cold-Start (dev)

### Bug Fixes

- **`package-lock.json` out of sync with `package.json`** — `@vitest/coverage-v8` was added
  to `packages/core/package.json` but `npm install` was never run to update the lock file.
  `npm ci` (used in `Dockerfile.dev`) enforces strict lock-file parity and failed immediately,
  making the dev Docker image unbuildable. Fixed by running `npm install` to regenerate
  `package-lock.json`.

- **`skill-scheduler.ts`: two TypeScript API mismatches** — Two violations of the `SecureLogger`
  interface that blocked the TypeScript build:
  1. `getLogger('skill-scheduler')` — `getLogger()` is a zero-argument global getter, not a
     per-component factory. The name argument was removed.
  2. `logger.error({ err }, 'Schedule event handler error')` — Arguments were in pino's
     native `(obj, msg)` order, but `SecureLogger.error` is `(msg: string, context?: LogContext)`.
     Fixed by swapping to `logger.error('Schedule event handler error', { err })`.

- **`028_heartbeat_log` migration omitted from manifest** — `028_heartbeat_log.sql` (which
  creates the `proactive` schema and `proactive.heartbeat_log` table) was never registered in
  `packages/core/src/storage/migrations/manifest.ts`. The runner only applies manifested
  entries; it does not auto-discover SQL files. On every cold-start the migration was skipped,
  and `HeartbeatManager` emitted repeated `WARN: relation "proactive.heartbeat_log" does not
  exist` on every heartbeat cycle. Fixed by adding the entry to the manifest.

### Files Changed

- `package-lock.json` — regenerated to include `@vitest/coverage-v8@4.0.18` and its
  transitive deps
- `packages/core/src/soul/skill-scheduler.ts` — `getLogger()` call corrected (no arg);
  `logger.error` arg order fixed
- `packages/core/src/storage/migrations/manifest.ts` — `028_heartbeat_log` entry added

---

## Phase 25 (2026-02-20): Bug Fixes

### Bug Fixes

- **Skills Community: stale "clone repo" instruction removed** — The Community tab empty
  state in `SkillsPage.tsx` still showed "Clone `secureyeoman-community-skills` alongside
  this project, then click Sync to import skills." This instruction predates the git URL
  fetch feature (ADR 076) which made manual cloning unnecessary. The empty state now reads
  "Click Sync to import skills from the community repo — the repo is fetched automatically
  when `COMMUNITY_GIT_URL` is configured." No backend changes required.

- **Auth & SSO: authorize scheme calculation** — The `x-forwarded-proto` header check in
  `sso-routes.ts` had an operator precedence bug: `header ?? encrypted ? 'https' : 'http'`
  was parsed as `(header ?? encrypted) ? 'https' : 'http'`. When a reverse proxy set
  `x-forwarded-proto: http`, the truthy string `'http'` caused the ternary to evaluate to
  `'https'`, producing an `https://` redirect URI for plain-HTTP deployments and causing
  OIDC redirect URI mismatch errors. Fixed with explicit parentheses.

- **Auth & SSO: PKCE state not consumed on provider mismatch** — In `sso-manager.ts`,
  `deleteSsoState()` was called *after* the provider ID mismatch check. A mismatched
  callback would throw before consuming the state, leaving it valid for up to 10 minutes.
  Fixed by moving `deleteSsoState()` immediately after the null check so the one-time token
  is always invalidated before any subsequent validation.

- **SPA serving: `decorateReply` + asset 404s** — Two defects in the dashboard SPA serving
  path in `gateway/server.ts`:
  1. `@fastify/static` was registered with `decorateReply: false`, which removes
     `reply.sendFile()` from the reply prototype. The `setNotFoundHandler` called
     `reply.sendFile('index.html', distPath)` for every non-API 404, so all SPA routes
     (e.g. `/dashboard/settings`) failed with a TypeError caught as a 500 instead of
     serving the app shell.
  2. The handler had no guard for URLs with file extensions, so missing static assets
     (e.g. `/assets/app.abc123.js`) would have served `index.html` as JavaScript —
     causing browser parse errors — once the `decorateReply` bug was fixed.
  Fixed by removing `decorateReply: false` (restoring the default `true`) and adding an
  extension check: URLs whose last path segment contains a `.` now return JSON 404
  instead of the SPA shell. Query strings are stripped before all URL checks.

- **Workspace RBAC: six defects fixed** — A full audit of workspace-scoped role enforcement
  identified and fixed the following:

  1. **Missing ROUTE_PERMISSIONS entries** — Six workspace and user-management routes were absent
     from the `ROUTE_PERMISSIONS` map in `auth-middleware.ts`, causing them to fall through to the
     admin-only default-deny path:
     - `PUT /api/v1/workspaces/:id` → `workspaces:write` (operators can update workspaces)
     - `GET /api/v1/workspaces/:id/members` → `workspaces:read` (viewers can list members)
     - `PUT /api/v1/workspaces/:id/members/:userId` → `workspaces:write`
     - `GET /api/v1/users` → `auth:read`
     - `POST /api/v1/users` → `auth:write`
     - `DELETE /api/v1/users/:id` → `auth:write`

  2. **No workspace existence check before addMember** — `POST /api/v1/workspaces/:id/members`
     did not verify the workspace existed before calling `addMember`, potentially inserting orphaned
     member rows. Added a `get()` guard that returns 404 on missing workspace.

  3. **No role validation** — The `role` body parameter was accepted as a free-form string in
     both `POST members` and `PUT members/:userId`. Invalid values (e.g. `"superadmin"`) were
     silently stored. Both routes now validate against `WorkspaceRoleSchema` and return 400
     with a clear message on invalid input.

  4. **No workspace-scoped admin enforcement** — Mutating workspace operations (PUT workspace,
     POST/PUT/DELETE members) only checked the global RBAC role, not whether the requester held
     `owner` or `admin` rank within the specific workspace. Added a `requireWorkspaceAdmin()`
     helper that reads the requester's workspace membership and returns 403 if they are only a
     `member` or `viewer`; global `admin` users always bypass the check.

  5. **Last-admin protection missing** — `DELETE /api/v1/workspaces/:id/members/:userId` allowed
     removing the last `owner`/`admin` from a workspace, orphaning it with no privileged member.
     The handler now fetches the member list, counts admins, and returns 400 if removal would leave
     zero admins.

  6. **`updateMemberRole` returned wrong `joinedAt`** — `WorkspaceStorage.updateMemberRole()` set
     `joinedAt: Date.now()` (the mutation timestamp) on the returned member object instead of
     the member's original `joined_at` value. Fixed by re-fetching the updated row via
     `getMember()` after the UPDATE.

  Bonus fix: `ensureDefaultWorkspace` now adds the bootstrap admin user as `owner` (the highest
  workspace role) instead of `admin`, correctly reflecting their status as workspace creator.

- **Heartbeat Task execution log** — Heartbeat check results were only emitted to the pino
  logger and the audit chain; there was no way to audit past runs, see the last-result status
  per check, or diagnose recurring failures. Fixed with end-to-end persistence:

  1. **Migration 028** — New `proactive.heartbeat_log` table with columns `id`, `check_name`,
     `personality_id`, `ran_at`, `status` (`ok`/`warning`/`error`), `message`, `duration_ms`,
     `error_detail`. Indexed on `check_name`, `ran_at DESC`, and `status`.

  2. **HeartbeatLogStorage** — New `packages/core/src/body/heartbeat-log-storage.ts` class
     extending `PgBaseStorage`. Provides `persist(entry)` and `list(filter)` with `checkName`,
     `status`, `limit`, and `offset` filter support.

  3. **HeartbeatManager persistence** — `HeartbeatManager` now accepts an optional
     `logStorage?: HeartbeatLogStorage` parameter (added as the 6th constructor arg, fully
     backward-compatible). The `beat()` loop times each check individually (`checkStart`
     timestamp) and calls `logStorage.persist()` after every `runCheck()` call — including
     failed checks, where `errorDetail` captures the error stack. Failures to persist are
     logged as warnings and never propagate.

  4. **`GET /api/v1/proactive/heartbeat/log`** — New route in `proactive-routes.ts` backed
     by `HeartbeatLogStorage.list()`. Query params: `?checkName=&status=&limit=&offset=`.
     Returns `{ entries: HeartbeatLogEntry[], total: number }`. Mapped to
     `proactive:read` in `ROUTE_PERMISSIONS` (accessible to operators, viewers, and admins).
     Returns 503 if the log storage is not available (heartbeat disabled).

  5. **Dashboard: `HeartbeatTaskRow` status badge and history panel** — The enabled/disabled
     badge in the heartbeat task row is replaced by a clickable status toggle. Clicking it
     expands an inline history panel that lazy-fetches the 10 most recent log entries for that
     check via `fetchHeartbeatLog({ checkName, limit: 10 })`. The status badge shows the
     last-result status (`ok` → green, `warning` → amber, `error` → red) once log data is
     loaded; falls back to Active/Disabled when no log data exists yet.

### Files Changed

- `packages/dashboard/src/components/SkillsPage.tsx` — community tab empty-state copy updated;
  removed stale "clone repo" instruction
- `packages/core/src/storage/migrations/028_heartbeat_log.sql` — new migration
- `packages/core/src/body/heartbeat-log-storage.ts` — HeartbeatLogStorage class (new file)
- `packages/core/src/body/heartbeat.ts` — optional logStorage param; per-check timing;
  persist after every runCheck()
- `packages/core/src/body/index.ts` — exports HeartbeatLogStorage, HeartbeatLogEntry,
  HeartbeatLogFilter
- `packages/core/src/secureyeoman.ts` — creates HeartbeatLogStorage, threads it into
  HeartbeatManager, exposes getHeartbeatLogStorage()
- `packages/core/src/proactive/proactive-routes.ts` — GET /api/v1/proactive/heartbeat/log
  route; logStorage added to opts
- `packages/core/src/gateway/server.ts` — passes logStorage to registerProactiveRoutes;
  removed `decorateReply: false`, added asset extension guard in `setNotFoundHandler`,
  stripped query string before URL checks
- `packages/core/src/gateway/auth-middleware.ts` — ROUTE_PERMISSIONS entry for heartbeat log;
  6 missing workspace/user management entries added
- `packages/dashboard/src/types.ts` — HeartbeatLogEntry interface
- `packages/dashboard/src/api/client.ts` — fetchHeartbeatLog() function
- `packages/dashboard/src/components/TaskHistory.tsx` — HeartbeatTaskRow rewritten with
  last-result status badge and expandable execution history panel
- `packages/core/src/body/heartbeat-log-storage.test.ts` — 8 unit tests (new file)
- `packages/core/src/body/heartbeat.test.ts` — 4 logStorage integration tests added
- `packages/dashboard/src/components/TaskHistory.test.tsx` — 4 new heartbeat log tests;
  fetchHeartbeatLog added to mock
- `packages/core/src/security/sso-manager.ts` — state consumed before provider mismatch check
- `packages/core/src/gateway/sso-routes.ts` — operator-precedence fix in authorize scheme
  calculation
- `packages/core/src/security/sso-manager.test.ts` — state-consumed-on-mismatch, IDP error,
  malformed callback tests
- `packages/core/src/gateway/sso-routes.test.ts` — scheme-calculation, callback error tests
- `packages/core/src/workspace/workspace-routes.ts` — workspace-scoped admin check,
  role validation, workspace existence guard, last-admin protection
- `packages/core/src/workspace/storage.ts` — `updateMemberRole` now returns actual `joinedAt`
  via post-UPDATE `getMember()` re-fetch
- `packages/core/src/workspace/manager.ts` — `ensureDefaultWorkspace` uses `owner` role
- `packages/core/src/workspace/workspace.test.ts` — extended coverage: pagination,
  upsert, joinedAt fix, updateMemberRole null, ensureDefaultWorkspace idempotency
- `packages/core/src/workspace/workspace-routes.test.ts` — workspace-scoped admin checks,
  role validation, existence guard, last-admin protection, full CRUD coverage
- `packages/core/src/gateway/auth-middleware.test.ts` — 18 new workspace/user RBAC enforcement
  tests; workspace route stubs registered
- `docs/adr/005-team-workspaces.md` — Phase 25 Corrections section added
- `docs/adr/068-rbac-audit-phase-22.md` — Phase 25 Corrections section added
- `docs/adr/071-sso-oidc-implementation.md` — Phase 25 Corrections section added
- `docs/adr/076-community-git-url-fetch.md` — Phase 25 Corrections section added
- `docs/adr/079-heartbeat-execution-log.md` — new ADR

---

## Phase 24 (2026-02-20): Sub-Agent Execution Bug Fixes — [ADR 072](docs/adr/072-extensible-sub-agent-types.md)

### Bug Fixes

- **Binary timeout + kill path** — `executeBinaryDelegation` now accepts `timeoutMs` and
  `signal`. A `killChild()` helper sends SIGTERM when the timeout fires or the AbortSignal
  triggers; a 5-second follow-up SIGKILL ensures the process is reaped even if it ignores
  SIGTERM. Previously the spawned process ran indefinitely, leaking resources.

- **MCP-bridge: tool not found** — Added an explicit guard before `Promise.race`: if
  `mcpTool` does not match any tool in the connected MCP servers, the delegation fails
  immediately with `status: 'failed'` and a clear message
  (`MCP tool "X" not found in any connected server`). Previously `serverId` silently
  became `''`, producing an opaque error inside `callTool`.

- **MCP-bridge: template malformation** — Interpolated `mcpToolInput` that produces invalid
  JSON now fails the delegation with a descriptive error and a `logger.warn` entry showing
  both the raw template and the interpolated string. Previously the code silently fell back
  to `{ task, context }`, discarding the template intent.

- **Extension hooks wired** — `SubAgentManagerDeps` gains an optional `extensionManager`
  field. All four hook points declared in Phase 21 are now emitted:
  `agent:binary-before-execute`, `agent:binary-after-execute`,
  `agent:mcp-bridge-before-execute`, `agent:mcp-bridge-after-execute`.

### Files Changed

- `packages/core/src/agents/manager.ts` — binary timeout/kill, MCP guard, template error,
  hook emissions, `extensionManager` dep wired
- `docs/adr/072-extensible-sub-agent-types.md` — Phase 24 Corrections section added

---

## Phase 23 (2026-02-20): Community Marketplace Improvements

### Added

- **Rich Author Metadata** — Community skill `author` field now supports a structured object
  (`name`, `github`, `website`, `license`) in addition to the legacy string form. Both are
  accepted; string form is backward-compatible. The `authorInfo` field is surfaced in API
  responses, enabling rich attribution display in the dashboard.

- **`AuthorInfoSchema`** — New exported Zod schema in `packages/shared/src/types/marketplace.ts`.
  `MarketplaceSkillSchema` extended with optional `authorInfo` field.

- **DB migration 027** — `ALTER TABLE marketplace.skills ADD COLUMN author_info JSONB NULL`.

- **Git URL Fetch** — `POST /api/v1/marketplace/community/sync` accepts an optional `repoUrl`
  body parameter. When `allowCommunityGitFetch` security policy is enabled, the server clones
  (first sync) or pulls (subsequent syncs) the specified git repository before scanning for skill
  files. Uses `execFile` (not `exec`) to prevent shell injection; only `https://` and `file://`
  URLs are accepted.

- **`allowCommunityGitFetch` policy toggle** — New boolean in `SecurityConfigSchema` (default
  `false`). Toggleable via `PATCH /api/v1/security/policy`, `secureyeoman policy set
  allowCommunityGitFetch true`, and live-updated on the `MarketplaceManager` instance without
  restart.

- **`communityGitUrl` policy field** — Default git URL for community skills repo when git fetch
  is enabled. Overridable via `COMMUNITY_GIT_URL` env var.

- **`COMMUNITY_GIT_URL` env var** — Documented in `.env.example`.

- **`validateGitUrl()` / `gitCloneOrPull()`** — New `packages/core/src/marketplace/git-fetch.ts`
  utility.

- **CLI policy flag** — `allowCommunityGitFetch` added to `ALL_POLICY_FLAGS` in
  `packages/core/src/cli/commands/policy.ts`.

- **Community skill JSON Schema** — `community-skills/schema/skill.schema.json` (JSON Schema
  draft-07) documents the full skill format including the new `author` object shape.

- **ADR 076** — `docs/adr/076-community-git-url-fetch.md` (security rationale for policy gate,
  execFile, and URL allowlist).

- **ADR 077** — `docs/adr/077-community-skill-author-metadata.md` (backward-compat design for
  rich author field).

- **`COMMUNITY_IMPROVEMENTS.md`** — Root-level feature specification document.

- **CONTRIBUTING.md** — New "Contributing Community Skills" section with JSON format reference,
  quality bar, security review checklist, rejection criteria, and submission instructions.

### Updated

- All 11 bundled community skill JSON files updated to object `author` form (YEOMAN / MacCracken /
  secureyeoman.ai).
- `README.md` — Community Skills section updated with git fetch instructions and
  `COMMUNITY_IMPROVEMENTS.md` link.

### Files Changed

- `packages/shared/src/types/marketplace.ts` — `AuthorInfoSchema`, `authorInfo` on skill schema
- `packages/shared/src/types/config.ts` — `allowCommunityGitFetch`, `communityGitUrl`
- `packages/core/src/storage/migrations/027_marketplace_author_info.sql` — new migration
- `packages/core/src/storage/migrations/manifest.ts` — migration registered
- `packages/core/src/marketplace/storage.ts` — `author_info` in CRUD + `rowToSkill()`
- `packages/core/src/marketplace/git-fetch.ts` — new git utility
- `packages/core/src/marketplace/manager.ts` — git fetch + author parsing + `updatePolicy()`
- `packages/core/src/secureyeoman.ts` — new deps + `updateSecurityPolicy` extension
- `packages/core/src/gateway/server.ts` — policy endpoints + `getConfig` route option
- `packages/core/src/marketplace/marketplace-routes.ts` — `repoUrl` body + policy check
- `packages/core/src/cli/commands/policy.ts` — `allowCommunityGitFetch` flag
- `packages/core/src/marketplace/marketplace.test.ts` — author + git fetch + validateGitUrl tests
- `community-skills/skills/**/*.json` — 11 files updated to object author
- `community-skills/schema/skill.schema.json` — new JSON Schema
- `CONTRIBUTING.md` — community skills section
- `.env.example` — `COMMUNITY_GIT_URL` documentation
- `docs/adr/076-community-git-url-fetch.md` — new ADR
- `docs/adr/077-community-skill-author-metadata.md` — new ADR
- `COMMUNITY_IMPROVEMENTS.md` — new spec document

---

## Phase 23 (2026-02-20): x.ai Grok Provider — [ADR 078](docs/adr/078-xai-grok-provider.md)

### Added

- **x.ai Grok as a 10th AI provider** — `GrokProvider` uses the OpenAI-compatible API at `https://api.x.ai/v1`. Set `XAI_API_KEY` to enable. Supported models: `grok-3`, `grok-3-mini`, `grok-2-1212`, `grok-2-vision-1212`. Full streaming, tool-calling, and fallback chain support.
- **Grok dynamic model discovery** — `GET /api/v1/model/info` fetches live model list from `https://api.x.ai/v1/models` when `XAI_API_KEY` is set; falls back to known models list if the endpoint is unreachable.
- **Grok pricing in cost calculator** — Input/output costs added for all four known Grok models.
- **`XAI_API_KEY` / `XAI_BASE_URL` added to `.env.example` and `.env.dev.example`** — `XAI_BASE_URL` is optional (defaults to `https://api.x.ai/v1`) for custom endpoint overrides.
- **Mistral and Grok added to `POST /api/v1/model/switch`** — `validProviders` list was missing `mistral` (bug fix) and did not yet include `grok`.
- **Mistral dynamic model discovery** — `getAvailableModelsAsync()` now also fetches live Mistral models when `MISTRAL_API_KEY` is set, consistent with the DeepSeek pattern.
- **Optional base URL overrides** — `DEEPSEEK_BASE_URL` and `MISTRAL_BASE_URL` env vars added alongside `XAI_BASE_URL` for custom/self-hosted endpoint support.

### Files Changed

- `packages/core/src/ai/providers/grok.ts` — new: `GrokProvider`
- `packages/core/src/ai/providers/grok.test.ts` — new: 16 unit tests
- `packages/shared/src/types/ai.ts` — `AIProviderNameSchema` enum extended with `'grok'`
- `packages/shared/src/types/config.ts` — `FallbackModelConfigSchema` and `ModelConfigSchema` extended with `'grok'`
- `packages/core/src/ai/client.ts` — import + factory `case 'grok'`
- `packages/core/src/ai/index.ts` — export `GrokProvider`, `GrokModelInfo`
- `packages/core/src/ai/model-routes.ts` — `validProviders` extended with `'mistral'` and `'grok'`
- `packages/core/src/ai/chat-routes.ts` — `PROVIDER_KEY_ENV` extended with `grok: 'XAI_API_KEY'`
- `packages/core/src/ai/cost-calculator.ts` — pricing, model map, `PROVIDER_KEY_ENV`, `FALLBACK_PRICING`, dynamic discovery for Mistral and Grok
- `.env.example` — AI provider section reorganised: `XAI_API_KEY`, `XAI_BASE_URL`, `DEEPSEEK_BASE_URL`, `MISTRAL_BASE_URL`, `OLLAMA_HOST`, `GOOGLE_API_KEY`, `OPENCODE_API_KEY` added; entries sorted and annotated
- `.env.dev.example` — `XAI_API_KEY` added
- `docs/adr/078-xai-grok-provider.md` — new ADR

---

## Phase 23 (2026-02-20): Development Environment Fixes

### Changed

- **`docker-compose.yml` env file** — Default `env_file` for the `secureyeoman` and `mcp` services changed from `.env` to `.env.dev`, aligning compose with the development workflow (`.env` is for production deployments; `.env.dev` is the developer copy of `.env.dev.example`).
- **`@vitest/coverage-v8` dependency** — Moved from dev-only transitive dependency to an explicit entry in `packages/core/package.json` to ensure `npm run test:coverage` is stable across clean installs.

### Files Changed

- `docker-compose.yml` — `env_file: .env` → `env_file: .env.dev` for `secureyeoman` and `mcp` services
- `packages/core/package.json` — `@vitest/coverage-v8 ^4.0.18` added to dependencies; optional deps alphabetically sorted

---

## Phase 22 (complete): OWASP Top 10 Security Review (2026-02-20)

### Security Fixes

- **A01 — Broken Access Control (WebSocket fail-secure)** — WebSocket channel subscription handler now denies channel access when a client has no `role` set, rather than silently skipping the permission check. Prevents unauthenticated clients from subscribing to role-gated channels.
- **A03 — Injection (terminal command hardening)** — Replaced the weak string-based blocklist in `terminal-routes.ts` with regex patterns that handle whitespace variation. Added a shell-metacharacter + sensitive-path layer that blocks injection sequences (`;`, `|`, `` ` ``, `$()`, `${}`) combined with paths under `/etc`, `/root`, `/boot`, `/proc`, `/sys`, `/dev`. Added a working-directory guard that rejects `exec` requests whose `cwd` points into sensitive system directories.
- **A05 — Security Misconfiguration (error handler type safety)** — Fixed TypeScript strict error in the global `setErrorHandler`: `err` is typed as `unknown`, so accessing `.message` required a cast. Replaced with `(err as Error).message` to eliminate the compile error and retain the correct 5xx suppression.
- **A10 — SSRF (server-side request forgery)** — Introduced `packages/core/src/utils/ssrf-guard.ts` with `isPrivateUrl()` / `assertPublicUrl()`. Blocks loopback (127/8, ::1), RFC 1918 (10/8, 172.16/12, 192.168/16), link-local / cloud metadata (169.254/16, fe80::/10), CGN (100.64/10), non-HTTP(S) schemes, and known localhost aliases. Applied at three SSRF-vulnerable call sites:
  - `OutboundWebhookDispatcher.deliverWithRetry` — blocks delivery to private URLs even for already-stored webhooks
  - `POST /api/v1/integrations/outbound-webhooks` — rejects webhook creation targeting private addresses
  - `A2AManager.addPeer` — rejects peer registration targeting private addresses

### Deferred to Phase 23 Backlog

- **A04** — Proactive trigger approval gate for new action types (requires config schema changes)
- **A07** — 10-minute expiry on pending 2FA secrets (currently stored indefinitely until consumed or user re-requests)
- **A08** — Marketplace skill cryptographic signing/verification (requires author keypair infrastructure)
- **A10 (partial)** — SSO redirect URI constructed from `x-forwarded-proto`/`host` headers; full fix requires per-provider redirect URI whitelist in config

### Files Changed

- `packages/core/src/gateway/server.ts` — WebSocket fail-secure; `(err as Error).message` cast
- `packages/core/src/gateway/terminal-routes.ts` — regex blocklist, shell injection layer, cwd guard
- `packages/core/src/utils/ssrf-guard.ts` — new: `isPrivateUrl()`, `assertPublicUrl()`
- `packages/core/src/integrations/outbound-webhook-dispatcher.ts` — SSRF guard on delivery
- `packages/core/src/integrations/integration-routes.ts` — SSRF guard on webhook creation
- `packages/core/src/a2a/manager.ts` — SSRF guard on peer registration

---

## Phase 22 (complete): API Consistency (2026-02-20)

### Changes

- **Standardised error response shape** — All route handlers now return `{ error, message, statusCode }` via the new `sendError(reply, code, message)` helper in `packages/core/src/utils/errors.ts`. The global `setErrorHandler` in `GatewayServer` catches body-parse failures and uncaught throws with the same shape. Previous single-field `{ error: "..." }` responses are eliminated.
- **`limit`/`offset` pagination on all list endpoints** — Every SQL-backed list method now accepts `opts?: { limit?: number; offset?: number }` and returns `{ <entity>, total: number }`. Affected storage classes: `SoulStorage` (personalities, skills, users), `SpiritStorage` (passions, inspirations, pains), `SubAgentStorage` (profiles), `McpStorage` (servers), `WorkspaceStorage` (workspaces, members), `A2AStorage` (peers), `ProactiveStorage` (triggers), `ExecutionStorage` (sessions), `ExperimentStorage` (experiments), `SwarmStorage` (templates), `DashboardStorage` (dashboards). In-memory list endpoints (reports, MCP tools/resources, builtin triggers, active delegations) are sliced at the route layer using `paginate()` from `packages/core/src/utils/pagination.ts`.
- **Test database provisioning** — Added `scripts/init-test-db.sh` (mounted into `/docker-entrypoint-initdb.d/`) to create `secureyeoman_test` on first container init. Added root `db:create-test` npm script for existing containers whose data dir is already initialised.

### Files Changed

- `packages/core/src/utils/errors.ts` — `httpStatusName()`, `sendError()` helpers
- `packages/core/src/utils/pagination.ts` — new `paginate()` utility
- `packages/core/src/gateway/server.ts` — `setErrorHandler`; import `sendError`; inline sends → `sendError`
- `packages/core/src/gateway/auth-routes.ts` — all error sends → `sendError`
- `packages/core/src/gateway/auth-middleware.ts` — all error sends → `sendError`
- `packages/core/src/gateway/oauth-routes.ts` — all error sends → `sendError`
- `packages/core/src/gateway/sso-routes.ts` — all error sends → `sendError`
- `packages/core/src/gateway/terminal-routes.ts` — all error sends → `sendError`
- `packages/core/src/soul/soul-routes.ts` — all error sends → `sendError`
- `packages/core/src/soul/storage.ts` — pagination on listPersonalities, listSkills, listUsers
- `packages/core/src/soul/manager.ts` — passthrough opts
- `packages/core/src/brain/brain-routes.ts` — all error sends → `sendError`
- `packages/core/src/spirit/spirit-routes.ts` — all error sends → `sendError`
- `packages/core/src/spirit/storage.ts` — pagination on listPassions, listInspirations, listPains
- `packages/core/src/spirit/manager.ts` — passthrough opts
- `packages/core/src/mcp/mcp-routes.ts` — all error sends → `sendError`; pagination
- `packages/core/src/mcp/storage.ts` — pagination on listServers
- `packages/core/src/integrations/integration-routes.ts` — all error sends → `sendError`
- `packages/core/src/agents/agent-routes.ts` — all error sends → `sendError`; pagination on profiles
- `packages/core/src/agents/storage.ts` — pagination on listProfiles
- `packages/core/src/agents/swarm-routes.ts` — all error sends → `sendError`; pagination on templates
- `packages/core/src/agents/swarm-storage.ts` — pagination on listTemplates
- `packages/core/src/execution/execution-routes.ts` — all error sends → `sendError`; pagination on sessions
- `packages/core/src/execution/storage.ts` — pagination on listSessions
- `packages/core/src/a2a/a2a-routes.ts` — all error sends → `sendError`; pagination on peers
- `packages/core/src/a2a/storage.ts` — pagination on listPeers
- `packages/core/src/proactive/proactive-routes.ts` — all error sends → `sendError`; pagination on triggers
- `packages/core/src/proactive/storage.ts` — pagination on listTriggers
- `packages/core/src/reporting/report-routes.ts` — all error sends → `sendError`; in-memory paginate
- `packages/core/src/dashboard/dashboard-routes.ts` — all error sends → `sendError`; pagination
- `packages/core/src/dashboard/storage.ts` — pagination on list
- `packages/core/src/workspace/workspace-routes.ts` — all error sends → `sendError`; pagination
- `packages/core/src/workspace/storage.ts` — pagination on list, listMembers
- `packages/core/src/experiment/experiment-routes.ts` — all error sends → `sendError`; pagination
- `packages/core/src/experiment/storage.ts` — pagination on list
- `packages/core/src/marketplace/marketplace-routes.ts` — all error sends → `sendError`
- `packages/core/src/chat/conversation-routes.ts` — all error sends → `sendError`
- `packages/core/src/multimodal/multimodal-routes.ts` — all error sends → `sendError`
- `packages/core/src/browser/browser-routes.ts` — all error sends → `sendError`
- `packages/core/src/extensions/extension-routes.ts` — all error sends → `sendError`
- `packages/core/src/comms/comms-routes.ts` — all error sends → `sendError`
- `scripts/init-test-db.sh` — new: creates secureyeoman_test DB
- `docker-compose.yml` — mount init-test-db.sh into postgres initdb.d
- `package.json` — add `db:create-test` script
- `docs/development/roadmap.md` — mark error shape and pagination as complete

---

## Phase 22 (complete): Secrets Hygiene (2026-02-19)

### Fixes

- **`skill-scheduler.ts` logging** — Replaced `console.error` in `SkillScheduler.emitEvent` with a pino logger (`getLogger('skill-scheduler')`), ensuring handler errors flow through standard log redaction instead of bypassing it.
- **Integration API credential masking** — `GET /api/v1/integrations`, `GET /api/v1/integrations/:id`, `POST /api/v1/integrations`, and `PUT /api/v1/integrations/:id` now apply `sanitizeForLogging` to `integration.config` before serialising the response. Platform credentials (bot tokens, PATs, webhook secrets) are returned as `[REDACTED]`. Internal operations continue to use unmasked values.
- **`McpCredentialManager` wired** — `McpCredentialManager` is now instantiated in `GatewayServer` using `requireSecret(this.config.auth.tokenSecret)` and passed to `registerMcpRoutes`. MCP credential write endpoints now encrypt values at rest with AES-256-GCM before storage.

### Documentation

- **`docs/security/security-model.md`** — Added **Secrets Hygiene** section documenting confirmed-secure items, Phase 22 fixes, and two accepted risks: SSO token fragment delivery and integration credentials at-rest.

### Files Changed

- `packages/core/src/soul/skill-scheduler.ts` — import `getLogger`; module-level `logger`; replace `console.error`
- `packages/core/src/integrations/integration-routes.ts` — import `sanitizeForLogging`; add `maskIntegration` helper; apply to 4 response sites
- `packages/core/src/gateway/server.ts` — import `McpCredentialManager` and `requireSecret`; instantiate and wire credential manager
- `docs/security/security-model.md` — new Secrets Hygiene section

---

## Phase 22 (complete): Naming & Consistency (2026-02-19)

### Changes

- **Shared error helper** — Extracted the duplicate `errorMessage()` function (present in 12 route files) into `packages/core/src/utils/errors.ts` as the exported `toErrorMessage(err: unknown): string`. All route files now import from this single location.
- **Route parameter standardised to `opts`** — Eight route registrars that used `deps` as the parameter name (`agent-routes.ts`, `swarm-routes.ts`, `extension-routes.ts`, `execution-routes.ts`, `a2a-routes.ts`, `proactive-routes.ts`, `multimodal-routes.ts`, `browser-routes.ts`) are now consistent with the rest of the codebase.
- **Descriptive local variable names** — Single-letter variables `ws`, `m`, and `ok` replaced with `workspace`, `member`, and `removed` in `workspace-routes.ts` and `workspace/manager.ts`.
- **Void response shape** — `POST /api/v1/soul/skills/:id/enable` and `POST /api/v1/soul/skills/:id/disable` now return `{ success: true }` instead of `{ message: 'Skill enabled/disabled' }`, consistent with other void-operation endpoints.
- **ADR 074** — Documents the agreed naming conventions for route parameters, error extraction, void responses, and local variable names.

---

## Phase 22 (complete): Major Audit (2026-02-19)

### Fixes

- **HTTP 204 on DELETE** — All 26 DELETE endpoints across the API now correctly return `204 No Content` with an empty body, replacing the previous `200 OK` with `{ "message": "..." }` JSON. Affected routes: soul, workspace, brain, spirit, comms, integrations, MCP, execution, agents, swarms, experiments, dashboard, extensions, conversations, proactive, model, A2A, marketplace.
- **HTTP 202 on async POST** — `POST /api/v1/execution/run` now returns `202 Accepted` instead of `200 OK` to correctly signal that execution is asynchronous.
- **Structured logging** — Replaced `console.log` / `console.error` calls in `heartbeat.ts` and `pg-pool.ts` with `this.logger.info` / `getLogger().error` structured logger calls.
- **TypeScript `as any` elimination** — Removed 8 unsafe `as any` casts from `packages/core/src/agents/storage.ts` and `packages/core/src/proactive/manager.ts`; corrected `getTrigger` return type in `proactive/storage.ts` to include `lastFiredAt?: number`.
- **Zod schema fix** — Split `AgentProfileSchema` in `packages/shared/src/types/delegation.ts` into a base `ZodObject` and separate refinements so that `AgentProfileCreateSchema` and `AgentProfileUpdateSchema` can use `.omit()` without hitting the `ZodEffects` limitation.
- **Stale TODO cleanup** — Removed 6 outdated TODO comments from `heartbeat.ts` switch cases (slack, telegram, discord, email, command, llm).

### Files Changed

- `packages/core/src/soul/soul-routes.ts` — 3 DELETE handlers → 204
- `packages/core/src/workspace/workspace-routes.ts` — 3 DELETE handlers → 204
- `packages/core/src/brain/brain-routes.ts` — 2 DELETE handlers → 204
- `packages/core/src/spirit/spirit-routes.ts` — 3 DELETE handlers → 204
- `packages/core/src/comms/comms-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/integrations/integration-routes.ts` — 3 DELETE handlers → 204
- `packages/core/src/mcp/mcp-routes.ts` — 2 DELETE handlers → 204
- `packages/core/src/execution/execution-routes.ts` — 2 DELETE handlers → 204; POST /run → 202
- `packages/core/src/agents/agent-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/agents/swarm-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/experiment/experiment-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/dashboard/dashboard-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/extensions/extension-routes.ts` — 3 DELETE handlers → 204
- `packages/core/src/chat/conversation-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/proactive/proactive-routes.ts` — 2 DELETE handlers → 204
- `packages/core/src/ai/model-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/a2a/a2a-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/marketplace/marketplace-routes.ts` — 1 DELETE handler → 204
- `packages/core/src/body/heartbeat.ts` — console.log → logger.info; 6 TODO comments removed
- `packages/core/src/storage/pg-pool.ts` — console.error → getLogger().error
- `packages/core/src/agents/storage.ts` — 6 `as any` casts removed
- `packages/core/src/proactive/storage.ts` — getTrigger return type corrected
- `packages/core/src/proactive/manager.ts` — 2 `as any` casts removed
- `packages/shared/src/types/delegation.ts` — AgentProfileBaseSchema split from ZodEffects
- `packages/core/src/__integration__/soul.integration.test.ts` — DELETE assertions updated to 204
- `packages/core/src/body/heartbeat.test.ts` — consoleSpy tests updated to assert on logger.info

---

## Phase 22 (complete): Documentation & ADR Audit (2026-02-19)

### Documentation Fixes

- **Getting-started guide** — Removed nonexistent `dev:core` script reference; corrected dashboard URL to `:18789`; updated health-check version field; removed stale `v1.2 Features` section; fixed `security.codeExecution` → `execution` config key; removed bogus `dashboard:` config block; updated A2A peer docs; fixed MCP verify URL; corrected optional env var names (`PORT`/`HOST`/`LOG_LEVEL` → `SECUREYEOMAN_PORT`/`SECUREYEOMAN_HOST`/`SECUREYEOMAN_LOG_LEVEL`)
- **Configuration reference** — Audited all YAML fields against `config.ts` schema: corrected `execution` runtime values (`node` not `nodejs`), `sessionTimeout` default (1800000 ms), `approvalPolicy` enum values; fixed `extensions` defaults; removed undocumented fields; fixed `a2a.discoveryMethod` valid values; removed non-schema A2A fields; corrected `security.allowSubAgents` default; fixed `conversation.compression` defaults; added missing model providers (lmstudio, localai, deepseek, mistral) to provider list; corrected env var names throughout the Environment Variables table
- **API reference** — `docs/api/rest-api.md` and `docs/openapi.yaml` updated to reflect `204 No Content` on all DELETE endpoints and `202 Accepted` on `POST /api/v1/execution/run`
- **README audit** — Corrected admin login curl (removed spurious `username` field); fixed MCP stdio path (`dist/index.js` → `dist/cli.js`); updated ADR count (43 → 75); added `Authorization` headers to community sync curl examples; replaced unrecognised `REDIS_URL` env var with a comment pointing to the YAML `security.rateLimiting.redisUrl` field

### ADR Audit

- **Coverage check** — Confirmed all 26 migrations (001–026) have corresponding ADRs; spot-checked implementation accuracy in ADRs 001, 013, 021, 026, 031, 046, 050, 069 — all accurate
- **Status corrections** — ADR 018 (Proactive Heartbeat) updated from `Proposed` to `Superseded → ADR 040`; ADRs 014–017 and 019–023 confirmed as `Proposed` for genuinely unshipped features; all `Accepted` ADRs verified against implementation
- **Gap fill** — Identified and wrote ADR 075 for the onboarding wizard (Phase 21 feature had no ADR)

### Dependency Audit

- `npm audit` reviewed; 2 risks accepted and formally documented in [Dependency Watch](docs/development/dependency-watch.md): eslint/ajv ReDoS (dev-only, not reachable at runtime) and MCP SDK SSE deprecation (upstream migration pending)

### Files Changed

- `docs/guides/getting-started.md` — multiple accuracy fixes
- `docs/configuration.md` — full YAML field audit and corrections
- `docs/api/rest-api.md` — 204/202 status code updates
- `docs/openapi.yaml` — 204/202 status code updates
- `README.md` — curl fixes, path fixes, ADR count update
- `docs/adr/018-proactive-heartbeat.md` — status updated to Superseded
- `docs/adr/075-onboarding-wizard.md` — NEW
- `docs/development/dependency-watch.md` — 2 new accepted-risk entries

---

## Phase 21 (complete): Onboarding (2026-02-19)

### Feature

- **First-install CLI wizard** — `secureyeoman init` now walks new users through AI provider selection (anthropic / openai / gemini / ollama / deepseek / mistral), model name, API key entry (written to `.env`), gateway port, and database backend choice (SQLite or PostgreSQL). Answers populate both `.env` and a complete `secureyeoman.yaml` covering `core`, `model`, `gateway`, `storage`, and `soul` sections.
- **Dashboard onboarding wizard — model step** — `OnboardingWizard.tsx` gains a fourth step between *Personality* and *Confirm*: provider picker + model name field with per-provider defaults. Sets `personality.defaultModel`; "Clear" button falls back to the server default.
- **Config file generation** — `secureyeoman init` produces a fully populated `secureyeoman.yaml` on first run; skipped if the file already exists.

### Files Changed

- `packages/core/src/cli/commands/init.ts` — provider/model/key/port/DB prompts; extended YAML output; extended `.env` output (API key + DATABASE_URL)
- `packages/dashboard/src/components/OnboardingWizard.tsx` — 4-step wizard (`name → personality → model → confirm`); provider buttons + model input; `Cpu` icon; `defaultModel` wired to mutation payload

---

## Phase 22 (complete): Single Binary Distribution (2026-02-19) — [ADR 073](docs/adr/073-single-binary-distribution.md)

### Feature

- **Bun compile pipeline** — `scripts/build-binary.sh` produces self-contained executables for Linux x64/arm64 and macOS arm64. No Node.js, npm, or runtime required on target machines.
- **Two-tier distribution** — Tier 1 binaries (PostgreSQL-backed) include the embedded dashboard; Tier 2 `lite` binaries (SQLite, Linux only) have no external dependencies for edge/embedded deployments.
- **`mcp-server` subcommand** — The core binary now includes an `mcp-server` subcommand, eliminating the need for a separate `secureyeoman-mcp` process in single-binary deployments.
- **Docker image: 80 MB** — `Dockerfile` rebuilt from `debian:bookworm-slim` + pre-compiled binary, down from ~600 MB multi-stage Node.js image.
- **Storage backend abstraction** — `packages/core/src/storage/backend.ts` resolves `pg` or `sqlite` automatically (`auto` mode): PostgreSQL when `DATABASE_URL` is set, SQLite otherwise. Configurable via `storage.backend` in config.
- **GitHub Actions release workflow** — `.github/workflows/release-binary.yml` triggers on version tags, cross-compiles all targets, uploads artifacts and `SHA256SUMS` to GitHub Releases.
- **Install script** — `site/install.sh` detects OS/arch, fetches the latest release tag, downloads the correct binary, and sets it executable.

### Files Changed

- `scripts/build-binary.sh` — NEW: Bun compile pipeline (Tier 1 + Tier 2, SHA256 checksums)
- `packages/mcp/src/cli.ts` — refactored to export `runMcpServer(argv)` for embedding; direct-execution guard preserved
- `packages/core/src/cli/commands/mcp-server.ts` — NEW: `mcp-server` subcommand forwarding to `@secureyeoman/mcp`
- `packages/core/src/cli.ts` — registered `mcp-server` command
- `packages/core/src/storage/backend.ts` — NEW: `resolveBackend()` auto-detection logic
- `packages/shared/src/types/config.ts` — `StorageBackendConfigSchema`; `storage` field added to `ConfigSchema`
- `Dockerfile` — replaced multi-stage Node build with binary-based `debian:bookworm-slim` image
- `docker-compose.yml` — removed separate dashboard service (gateway now serves SPA); MCP service uses `mcp-server` subcommand; added `dashboard-dev` profile
- `package.json` — added `build:binary` script
- `.github/workflows/release-binary.yml` — NEW: GitHub Actions release workflow
- `site/install.sh` — NEW: curl-pipe install script
- `docs/adr/073-single-binary-distribution.md` — NEW

---

## Phase 21 (complete): Extensible Sub-Agent Types + Gateway Prerequisites (2026-02-19) — [ADR 072](docs/adr/072-extensible-sub-agent-types.md)

### Feature

- **`binary` sub-agent type** — Agent profiles with `type: 'binary'` spawn an external process, write the delegation as JSON to stdin, and read the result from stdout. Zero token cost; gated by `security.allowBinaryAgents` policy.
- **`mcp-bridge` sub-agent type** — Agent profiles with `type: 'mcp-bridge'` call a named MCP tool directly (no LLM loop). Supports Mustache interpolation (`{{task}}`, `{{context}}`) in `mcpToolInput`. Zero token cost.
- **MCP tool wiring fix** — `manager.ts` lines 302–304: `mcpClient.listTools()` was never appended to the LLM sub-agent tools array. Fixed: MCP tools are now filtered by `allowedTools` and included in every LLM delegation.
- **Migration manifest** — `packages/core/src/storage/migrations/manifest.ts` statically imports all SQL files as text. `runner.ts` now uses the manifest instead of `readdirSync(__dirname)`, making migrations work inside Bun compiled binaries.
- **SPA static serving** — `@fastify/static` registered after all API routes; non-API 404s return `index.html` (SPA fallback). `resolveDashboardDist()` checks CLI flag → env var → relative path → `/usr/share/secureyeoman/dashboard`.
- **`--dashboard-dist` CLI flag** — `secureyeoman start --dashboard-dist <path>` overrides the dashboard distribution directory.
- **4 new extension hook points** — `agent:binary-before-execute`, `agent:binary-after-execute`, `agent:mcp-bridge-before-execute`, `agent:mcp-bridge-after-execute`.

### Files Changed

- `packages/shared/src/types/delegation.ts` — `AgentProfileSchema` extended with `type`, `command`, `commandArgs`, `commandEnv`, `mcpTool`, `mcpToolInput`; Zod cross-field refinements for `binary`/`mcp-bridge`
- `packages/shared/src/types/config.ts` — `allowBinaryAgents: boolean` added to `SecurityConfigSchema`
- `packages/core/src/storage/migrations/026_agent_profile_types.sql` — NEW: `type`, `command`, `command_args`, `command_env`, `mcp_tool`, `mcp_tool_input` columns + DB constraints
- `packages/core/src/storage/migrations/manifest.ts` — NEW: static SQL manifest (001–026)
- `packages/core/src/storage/migrations/runner.ts` — replaced `readdirSync` with `MIGRATION_MANIFEST` import
- `packages/core/src/agents/storage.ts` — `ProfileRow`, `profileFromRow()`, `createProfile()`, `updateProfile()` updated with new fields
- `packages/core/src/agents/manager.ts` — type dispatch fork; `executeBinaryDelegation()`; `executeMcpBridgeDelegation()`; MCP tool wiring fix; MCP tool call dispatch in tool handler
- `packages/core/src/extensions/types.ts` — 4 new `HookPoint` values
- `packages/core/src/gateway/server.ts` — `@fastify/static` registration; `resolveDashboardDist()`; SPA fallback `setNotFoundHandler`; SSO routes registered
- `packages/core/src/cli/commands/start.ts` — `--dashboard-dist` flag
- `packages/core/package.json` — added `@fastify/static ^8.0.0`
- `docs/adr/072-extensible-sub-agent-types.md` — NEW

---

## Phase 20b (complete): SSO/OIDC (2026-02-19) — [ADR 071](docs/adr/071-sso-oidc-implementation.md)

### Feature

- **OIDC identity providers** — Admins configure Okta, Azure AD, Auth0 (and any standards-compliant OIDC issuer) via `POST /api/v1/auth/sso/providers`. Credentials stored in `auth.identity_providers`.
- **PKCE authorization flow** — `GET /api/v1/auth/sso/authorize/:providerId` initiates OIDC discovery + PKCE. State stored in `auth.sso_state` (PostgreSQL, 10-minute TTL) — survives restarts.
- **Callback + JWT issuance** — `GET /api/v1/auth/sso/callback/:providerId` exchanges the code, fetches userinfo, provisions or looks up the local user, and redirects to the dashboard with a SecureYeoman JWT.
- **JIT user provisioning** — On first IDP login, a `auth.users` row and `auth.identity_mappings` record are created automatically (`auto_provision: true`). Provisioning can be disabled per provider to require pre-created accounts.
- **SSO state table** — `auth.sso_state` stores PKCE verifier + redirect URI per login attempt. `cleanupExpiredSsoState()` called on callback to prune stale rows.
- **`openid-client` v6** — Standards-compliant OIDC/OAuth2 client with Issuer discovery and PKCE support.

### Files Changed

- `packages/core/src/storage/migrations/024_sso_identity_providers.sql` — NEW: `auth.identity_providers`, `auth.identity_mappings`
- `packages/core/src/storage/migrations/025_sso_state.sql` — NEW: `auth.sso_state`
- `packages/core/src/security/sso-storage.ts` — NEW: `SsoStorage` (IDP CRUD, mapping CRUD, state CRUD)
- `packages/core/src/security/sso-manager.ts` — NEW: `SsoManager` (OIDC discovery, PKCE, callback, JIT provisioning)
- `packages/core/src/gateway/sso-routes.ts` — NEW: SSO route handlers (authorize, callback, provider management)
- `packages/core/src/secureyeoman.ts` — `SsoStorage` + `SsoManager` initialized; `getSsoStorage()` / `getSsoManager()` getters; shutdown cleanup
- `packages/core/package.json` — added `openid-client ^6.0.0`
- `docs/adr/071-sso-oidc-implementation.md` — NEW

---

## Phase 20a (complete): Workspace Management (2026-02-19) — [ADR 070](docs/adr/070-workspace-management-ui.md)

### Feature

- **Multi-user foundation** — `auth.users` table added (migration 022). Stores `id, email, display_name, hashed_password (nullable for SSO-only), is_admin`. Admin singleton row seeded on migration. `auth.api_keys.user_id` already linked — no schema change needed there.
- **User CRUD** — `AuthStorage` gains `createUser()`, `getUserById()`, `getUserByEmail()`, `listUsers()`, `updateUser()`, `deleteUser()` (admin row protected). `AuthService` exposes thin user management wrappers + `createUserSession(userId, role)` for SSO token issuance.
- **Workspace improvements** — `WorkspaceManager` gains `update()`, `listMembers()`, `getMember()`, `updateMemberRole()`, and `ensureDefaultWorkspace()`. The last method runs on boot: creates a "Default" workspace and adds the admin user as owner if no workspaces exist.
- **Workspace schema additions** — Migration 023 adds `identity_provider_id`, `sso_domain` to `workspace.workspaces` and `display_name` to `workspace.members`.
- **Complete workspace REST API** — `workspace-routes.ts` rewritten:
  - `PUT /api/v1/workspaces/:id` — update workspace
  - `GET /api/v1/workspaces/:id/members` — list members
  - `POST /api/v1/workspaces/:id/members` — add member
  - `PUT /api/v1/workspaces/:id/members/:userId` — change role
  - `DELETE /api/v1/workspaces/:id/members/:userId` — remove member
  - `GET /api/v1/users` — list users (admin)
  - `POST /api/v1/users` — create user (admin)
  - `DELETE /api/v1/users/:id` — delete user (admin)
- **Token claims extended** — `TokenPayloadSchema` gains optional `email` and `displayName` fields (non-breaking; existing tokens remain valid).

### Files Changed

- `packages/shared/src/types/security.ts` — `UserSchema`, `UserCreateSchema`, `UserUpdateSchema`; optional `email` + `displayName` in `TokenPayloadSchema`
- `packages/shared/src/types/index.ts` — new type exports
- `packages/core/src/storage/migrations/022_users.sql` — NEW: `auth.users` table + admin seed row
- `packages/core/src/storage/migrations/023_workspace_improvements.sql` — NEW: workspace schema additions
- `packages/core/src/security/auth-storage.ts` — user CRUD methods
- `packages/core/src/security/auth.ts` — `createUserSession(userId, role)`; user management wrappers
- `packages/core/src/workspace/storage.ts` — `WorkspaceUpdate`; `update()`, `listMembers()`, `getMember()`, `updateMemberRole()`
- `packages/core/src/workspace/manager.ts` — `update()`, `listMembers()`, `getMember()`, `updateMemberRole()`, `ensureDefaultWorkspace()`
- `packages/core/src/workspace/workspace-routes.ts` — full REST API rewrite with member + user endpoints
- `packages/core/src/secureyeoman.ts` — `ensureDefaultWorkspace()` called on boot; `dashboardDist` option threaded through
- `docs/adr/070-workspace-management-ui.md` — NEW

---

## Phase 20 (complete): Skill Deletion & Marketplace Sync (2026-02-19) — [ADR 069](docs/adr/069-skill-personality-scoping-and-deletion-sync.md)

### Bug Fix

- **Skill deletion not updating marketplace installed state** — Deleting a brain skill via the personality editor (`DELETE /api/v1/soul/skills/:id`) now resets `marketplace.skills.installed` to `false` when the last brain record for that skill is removed. Previously, the marketplace continued to show the skill as installed even after deletion, preventing re-install.
- **Marketplace uninstall only removed first brain skill copy** — `marketplace.uninstall()` used `Array.find()` so only the first matching brain skill (by name+source) was deleted. Skills installed for multiple personalities left orphan records in `brain.skills` that continued to appear in chat. Fixed to use `Array.filter()` + loop to delete all copies.
- **`onBrainSkillDeleted()` added to `MarketplaceManager`** — New method called by `SoulManager` after a brain skill is deleted; checks if any remaining brain records share the same name+source and, if none remain, resets `marketplace.installed = false`.
- **`GET /api/v1/soul/skills?personalityId=<id>`** — New query param returns skills for a personality plus global skills (`personality_id IS NULL`), allowing UIs to surface and manage globally-installed skills.
- **`getActiveTools()` not personality-scoped** — `getActiveTools()` in `brain/manager.ts` and `soul/manager.ts` called `getEnabledSkills()` without a `personalityId`, so tools from all personalities were exposed in every chat. Additionally, `chat-routes.ts` resolved the personality _after_ calling `getActiveTools()`, so the fix had no value to pass even when the parameter existed. Fixed by adding `personalityId?` to both `getActiveTools()` signatures and reordering `chat-routes.ts` to resolve personality before tool gathering.

### Files Changed

- `packages/core/src/brain/types.ts` — `forPersonalityId` added to `SkillFilter`
- `packages/core/src/brain/storage.ts` — `getEnabledSkills(personalityId?)` OR clause; `listSkills()` `forPersonalityId` branch
- `packages/core/src/brain/manager.ts` — `getActiveSkills(personalityId?)`; `getActiveTools(personalityId?)`
- `packages/core/src/soul/types.ts` — `personalityId` and `forPersonalityId` added to `SkillFilter`
- `packages/core/src/soul/manager.ts` — `marketplace` field, `setMarketplaceManager()`, `deleteSkill()` notifies marketplace; `composeSoulPrompt()` passes personality id; `getActiveTools(personalityId?)` propagates to brain
- `packages/core/src/ai/chat-routes.ts` — personality resolved before `getActiveTools()`; `personality?.id ?? null` passed
- `packages/core/src/marketplace/manager.ts` — `uninstall()` deletes all matching brain records; `onBrainSkillDeleted()` added
- `packages/core/src/soul/soul-routes.ts` — `personalityId` query param on `GET /api/v1/soul/skills`
- `packages/core/src/secureyeoman.ts` — `soulManager.setMarketplaceManager()` wired after marketplace init
- `packages/core/src/marketplace/marketplace.test.ts` — 3 new tests
- `packages/core/src/soul/soul.test.ts` — 2 new integration tests
- `docs/adr/069-skill-personality-scoping-and-deletion-sync.md` — new ADR

---

## Phase 20 (complete): Personality-Scoped Skill Filtering (2026-02-19) — [ADR 069](docs/adr/069-skill-personality-scoping-and-deletion-sync.md)

### Bug Fix

- **Chat showed skills from all personalities** — `composeSoulPrompt()` called `getActiveSkills()` without `personalityId`, so all enabled brain skills (across all personalities) appeared in the active personality's system prompt. Skills installed for personality A polluted personality B's context. Fixed by passing `personality?.id ?? null` from `soul/manager.ts` through `brain/manager.ts` to `brain/storage.ts`, where `getEnabledSkills(personalityId)` adds `AND (personality_id = $1 OR personality_id IS NULL)`.

### Files Changed

- `packages/core/src/brain/types.ts` — `personalityId` added to `SkillFilter`
- `packages/core/src/brain/storage.ts` — `getEnabledSkills(personalityId?)` with AND clause
- `packages/core/src/brain/manager.ts` — `getActiveSkills(personalityId?)`
- `packages/core/src/soul/manager.ts` — `composeSoulPrompt()` passes `personality?.id ?? null`

---

## Phase 20 (complete): Security — RBAC Audit (2026-02-19) — [ADR 068](docs/adr/068-rbac-audit-phase-22.md)

### Security

- **Fixed `connections` → `integrations` resource naming** — `role_operator` and `role_viewer` referenced `connections` but every integration route requires `integrations`. Operator and viewer now correctly access `/api/v1/integrations/*`.
- **Fixed mTLS role assignment** — `createAuthHook` now looks up the persisted RBAC role for the certificate CN via `rbac.getUserRole()` instead of hardcoding `operator` for all mTLS clients. Falls back to `operator` when no assignment exists.
- **Replaced wildcard auth-management permissions** — `POST /api/v1/auth/verify`, `GET/POST /api/v1/auth/api-keys`, and `DELETE /api/v1/auth/api-keys/:id` no longer use `{ resource: '*', action: '*' }`. They now map to `auth:read` or `auth:write` specifically. `auth:write` remains admin-only; `auth:read` is granted to operator.
- **Expanded `role_operator`** — Added 15 new resource permissions: `spirit`, `brain`, `comms`, `model`, `mcp`, `dashboards`, `workspaces`, `experiments`, `marketplace`, `multimodal`, `chat`, `execution`, `agents`, `proactive`, `browser`, `extensions`, `auth:read`.
- **Expanded `role_viewer`** — Added read-only access to `integrations`, `spirit`, `brain`, `model`, `mcp`, `marketplace`, `dashboards`, `workspaces`, `reports`, `chat`.
- **Expanded `role_auditor`** — Added read access to `execution`, `agents`, `proactive`, `browser`.
- **Added ~80 missing ROUTE_PERMISSIONS entries** across 12 route groups: soul sub-routes, spirit, chat/conversations, execution, terminal, agents, proactive, A2A, browser, extensions, auth management, OAuth management, integration extras, webhooks, model extras.
- **Added `/api/v1/auth/reset-password` to TOKEN_ONLY_ROUTES** — password reset is token-authenticated, no RBAC check needed.

### Files Changed

- `packages/core/src/security/rbac.ts` — updated operator, viewer, auditor role definitions
- `packages/core/src/gateway/auth-middleware.ts` — Fix A (mTLS role lookup), Fix B (auth wildcard), Fix C (~80 new ROUTE_PERMISSIONS), Fix D (rbac in AuthHookOptions), TOKEN_ONLY_ROUTES
- `packages/core/src/gateway/server.ts` — pass `rbac` to `createAuthHook`
- `packages/core/src/__integration__/helpers.ts` — pass `rbac` to `createAuthHook`
- `packages/core/src/__integration__/soul.integration.test.ts` — pass `rbac` to `createAuthHook`
- `packages/core/src/gateway/auth-middleware.test.ts` — new test cases for operator role, mTLS role assignment, auth management routes
- `docs/adr/068-rbac-audit-phase-22.md` — new ADR
- `docs/security/security-model.md` — updated RBAC permission matrix

---

## Phase 20 (complete): Bug Fix — Costs Page Blanks After Restart (2026-02-19)

### Bug Fix

- **Costs/totals blank after restart** — The lazy AI usage init (Phase 20 performance work) deferred `aiClient.init()` until the first chat call. The metrics and costs API endpoints read directly from the in-memory usage tracker without triggering init, so the dashboard showed zeroes until a chat was made. Fixed by firing `init()` as a non-blocking background task immediately after `AIClient` construction — startup speed is unchanged, but the tracker is seeded within milliseconds so metrics are accurate from the first poll.

### Files Changed

- `packages/core/src/secureyeoman.ts` — `void this.aiClient.init().catch(...)` replaces removed init call
- `docs/adr/067-performance-startup-memory-optimizations.md` — decision updated to reflect background-fire approach

---

## Phase 20 (complete): Startup & Memory Performance Optimizations (2026-02-19) — [ADR 067](docs/adr/067-performance-startup-memory-optimizations.md)

### Performance

- **Migration fast-path** — `runMigrations()` now issues a single `SELECT id … ORDER BY id DESC LIMIT 1` after ensuring the tracking table exists. If the result matches the highest-numbered `.sql` file, all migrations are applied and the function returns immediately — no per-file DB round-trips. Saves ~300–700 ms on every boot after initial setup.
- **Lazy AI usage history init** — `aiClient.init()` (loading historical token/cost records from PostgreSQL) is no longer called at startup. `AIClient.chat()` and `AIClient.chatStream()` call `ensureInitialized()` which lazily triggers the load on the first AI request. The `init()` method is now idempotent. Saves ~300–500 ms from the startup critical path.
- **Bounded WebSocket client map** — `GatewayServer` now enforces `gateway.maxWsClients` (default 100). When a new connection arrives at the cap, the oldest idle client (lowest `lastPong`) is evicted with close code 1008 and a warning is logged. Eliminates unbounded memory growth under misbehaving dashboard clients.
- **PostgreSQL pool size default 10** — `database.poolSize` default reduced from 20 to 10; saves ~50–80 MB PostgreSQL memory at default config. Field is documented: increase for multi-user/SaaS deployments. Fully configurable via `secureyeoman.yaml` or env var.

### Files Changed

- `packages/core/src/storage/migrations/runner.ts` — fast-path check
- `packages/core/src/ai/client.ts` — `initPromise`, `ensureInitialized()`, idempotent `init()`
- `packages/core/src/secureyeoman.ts` — removed eager `aiClient.init()` call
- `packages/core/src/gateway/server.ts` — cap + oldest-idle eviction on connect
- `packages/shared/src/types/config.ts` — `maxWsClients` in GatewayConfig, `poolSize` default 10
- `docs/adr/067-performance-startup-memory-optimizations.md` — new ADR

---

## Phase 20 (complete): Personality Editor — Brain Skills Visibility (2026-02-19) — [ADR 066](docs/adr/066-personality-brain-skills-visibility.md)

### UX

- **Brain section reordered** — External Knowledge Base block moved to the top of the Brain section (was at the bottom); Knowledge and Skills sub-sections follow as collapsible children.
- **Skills sub-section** — New collapsible Skills panel inside the Brain section lists all skills scoped to the personality being edited. Each skill shows a pencil Edit button that navigates directly to the Skills → Personal tab with the skill's edit form pre-opened.
- **Empty state with navigable links** — When no skills are associated, the panel shows an empty state with links to the Skills Marketplace, Community tab, and Skills → Personal tab so users can quickly add skills from the right source.
- **"Save first" hint** — For new (unsaved) personalities, the Skills sub-section shows a hint to save the personality before managing skills.
- **Cross-page navigation via router state** — `navigate('/skills', { state: { openSkillId } })` carries intent to `SkillsPage`; `MySkillsTab` reads the state, calls `startEdit`, then clears the state via `navigate('/skills', { replace: true, state: null })`. Deep-linking to the Community tab from the empty-state link uses the same pattern (`location.state.initialTab = 'community'`).
- **9 new tests** — `PersonalityEditor.test.tsx` (5 tests: list renders, edit opens form, Brain shows skills, Brain empty state, Edit navigates) and `SkillsPage.test.tsx` (4 tests: renders, opens edit form on openSkillId, clears state, initialTab community).

### Files Changed

- `packages/dashboard/src/components/PersonalityEditor.tsx` — `BrainSection` reordered and split into sub-sections; `fetchSkills` added; `useNavigate` added; `personalityId` prop added
- `packages/dashboard/src/components/SkillsPage.tsx` — `useNavigate` added; `getInitialTab` reads `initialTab` from state; `MySkillsTab` reads `openSkillId` from state; both clear state after use
- `packages/dashboard/src/components/PersonalityEditor.test.tsx` — New test file (5 tests)
- `packages/dashboard/src/components/SkillsPage.test.tsx` — New test file (4 tests)
- `docs/adr/066-personality-brain-skills-visibility.md` — New ADR

---

## Phase 20 (complete): Dagre Layout Algorithm (2026-02-19) — [ADR 058](docs/adr/058-webgl-graph-rendering.md)

### Visualization

- **`layout` prop added to `WebGLGraph`** — New `layout?: 'forceatlas2' | 'dagre'` prop selects between organic force-directed and hierarchical DAG layout. Default remains `'forceatlas2'` (no breaking change for existing consumers).
- **Dagre integration** — When `layout="dagre"`, the component builds a `dagre.graphlib.Graph`, runs `dagre.layout()` for top-down (`rankdir: 'TB'`) coordinate assignment, and applies the resulting `x`/`y` positions to the graphology graph via `setNodeAttribute` before rendering. Settings: `nodesep: 60`, `ranksep: 80`.
- **SubAgentsPage delegation tree uses Dagre** — The execution tree `<WebGLGraph>` now passes `layout="dagre"`, replacing ForceAtlas2 (which is unsuited to directed acyclic hierarchies). A2A peer-network graph is unchanged (`forceatlas2`).
- **New dependencies** — `dagre@^0.8.5` (runtime), `@types/dagre@^0.7.52` (dev-only type definitions).
- **6 new tests** — `WebGLGraph.test.tsx` gains layout-specific coverage: forceatlas2 default, explicit forceatlas2, dagre invocation, TB `rankdir` configuration, dagre node/edge registration count, and `x`/`y` position application via `setNodeAttribute`.

### Files Changed

- `packages/dashboard/src/components/WebGLGraph.tsx` — `layout` prop, dagre branch, `WebGLGraphLayout` type export
- `packages/dashboard/src/components/WebGLGraph.test.tsx` — 6 new layout tests (13 total)
- `packages/dashboard/src/components/SubAgentsPage.tsx` — `layout="dagre"` on delegation tree graph
- `packages/dashboard/package.json` — `dagre`, `@types/dagre` added
- `docs/adr/058-webgl-graph-rendering.md` — Updated to document dagre integration

---

## Phase 20 (complete): Personal Skills — Edit Bug Fix (2026-02-19)

### Bug Fixes

- **Personal Skills edit form restored** — Clicking the edit (pencil) button on any skill in the Personal tab now correctly opens the inline edit form. Previously, `startEdit()` set `editing` to the skill's UUID but the form only rendered when `editing === 'new'`, so the form never appeared for existing skills.
- **`handleSubmit` create/update logic corrected** — The original condition `if (editing)` is truthy for both `'new'` and a UUID, causing the create path to call `updateSkill('new', …)` (which fails on the backend). Logic is now explicit: `editing === 'new'` → `createSkill`; existing ID → `updateSkill` (or `createSkill` for non-user-source skills).
- **Marketplace/built-in skill protection** — Editing a skill whose `source` is not `'user'` (marketplace, community, ai_proposed, ai_learned) now creates a fresh personal copy via `createSkill` rather than mutating the installed record. The original marketplace entry is left untouched. A contextual note is shown in the form when this behaviour applies.
- **Author attribution on save** — `source` is always forced to `'user'` on submit, ensuring every saved skill is attributed to the user regardless of the original skill's source.
- **Personality scoping on edit** — `startEdit()` now falls back to `activePersonality?.id` when the skill has no `personalityId`, so edited copies are correctly associated with the active personality.
- **Trigger input cleared on edit open** — `triggerInput` is reset to `''` when opening an existing skill for editing; existing patterns are already rendered as removable badges and do not need to be re-populated in the text field.

### Files Changed

- `packages/dashboard/src/components/SkillsPage.tsx` — `handleSubmit`, `startEdit`, form render condition, submit button

---

## Phase 20 (complete): CLI Output Improvements (2026-02-19) — [ADR 065](docs/adr/065-cli-enhancements-completions-validate-plugin.md)

### Rich Output — Color & Progress
- **`colorContext(stream)`** added to `cli/utils.ts` — returns `{ green, red, yellow, dim, bold, cyan }` helpers bound to the given output stream. Colors are stripped automatically on non-TTY streams and when `NO_COLOR` is set (respects the [NO_COLOR standard](https://no-color.org/)).
- **`Spinner` class** added to `cli/utils.ts` — TTY-aware braille spinner for long-running operations. Non-TTY mode: `start()` is silent, `stop()` prints a single `✓`/`✗` summary line (safe for pipes and CI).
- **`health`** — Status label, check labels now colored: green `OK`/`pass`, red `ERROR`/`FAIL`
- **`status`** — Server status, Sub-Agents, Policy labels now colored: green enabled/allowed, red disabled/restricted
- **`config validate`** — ✓/✗ markers and `Result: PASS`/`FAIL` line now colored
- **`memory consolidate` / `memory reindex`** — Progress spinner shown during HTTP request flight
- **`multimodal vision-analyze` / `speak` / `transcribe` / `generate`** — Progress spinner for all async submit operations

### JSON Output — Remaining Commands
- **`browser`** — `--json` added to `list`, `stats`, `config`, `session`
- **`memory`** — `--json` added to `search`, `memories`, `knowledge`, `stats`, `consolidate`, `reindex`
- **`scraper`** — `--json` added to `config`, `tools`, `servers`
- **`multimodal`** — `--json` added to `config`, `jobs`, `vision-analyze`, `speak`, `transcribe`, `generate`
- All CLI commands (except interactive `repl`/`init`) now support `--json` for scripting

### Tests
- **27 new tests** across `utils.test.ts`, `browser.test.ts`, `memory.test.ts`, `scraper.test.ts`, `multimodal.test.ts` covering color context, Spinner, and all new `--json` paths

### Files Changed
- `packages/core/src/cli/utils.ts` — `colorContext()`, `Spinner`
- `packages/core/src/cli/utils.test.ts` — 8 new tests
- `packages/core/src/cli/commands/health.ts` — color output
- `packages/core/src/cli/commands/status.ts` — color output
- `packages/core/src/cli/commands/config.ts` — color output in validate
- `packages/core/src/cli/commands/browser.ts` — `--json`
- `packages/core/src/cli/commands/browser.test.ts` — 4 new tests
- `packages/core/src/cli/commands/memory.ts` — `--json` + Spinner
- `packages/core/src/cli/commands/memory.test.ts` — 6 new tests
- `packages/core/src/cli/commands/scraper.ts` — `--json`
- `packages/core/src/cli/commands/scraper.test.ts` — 4 new tests
- `packages/core/src/cli/commands/multimodal.ts` — `--json` + Spinner
- `packages/core/src/cli/commands/multimodal.test.ts` — 5 new tests

---

## Phase 20 (complete): CLI Enhancements (2026-02-19) — [ADR 065](docs/adr/065-cli-enhancements-completions-validate-plugin.md)

### Shell Completions
- **New `completion` command** — `secureyeoman completion <bash|zsh|fish>` prints a shell completion script to stdout
- Supports bash (`_secureyeoman_completions` function, `complete -F`), zsh (`#compdef` + `_arguments`), and fish (`complete -c secureyeoman`)
- All commands, subcommands, and key flags are included
- Standard sourcing pattern: `source <(secureyeoman completion bash)` or permanent fish install
- **7 tests** in `completion.test.ts`

### Configuration Validation
- **New `config validate` subcommand** — `secureyeoman config validate [--config PATH] [--json]`
- Runs a full pre-startup check: config structure (`loadConfig`) + required secrets (`validateSecrets`)
- Reports each check individually with ✓/✗ marker; exits 0 on full pass, 1 on any failure
- `--json` outputs `{ valid, checks[] }` for CI pipeline integration
- Existing `secureyeoman config` (no subcommand) behaviour unchanged — backward compatible
- **6 new tests** added to `config.test.ts`

### Plugin Management
- **New `plugin` command** — `secureyeoman plugin <list|info|add|remove> [--dir PATH] [--json]`
- Plugin directory resolved from `--dir` flag or `INTEGRATION_PLUGIN_DIR` env var (consistent with runtime)
- `list` — scans plugin dir for `.js`/`.mjs` files and directory-based plugins (`index.js`)
- `info <platform>` — shows file, path, and whether the plugin is loadable
- `add <path>` — validates plugin exports (`platform` + `createIntegration`) then copies to plugin dir
- `remove <platform>` — deletes plugin file; both `add` and `remove` print a "restart required" reminder
- **20 tests** in `plugin.test.ts`

### Files Changed
- `packages/core/src/cli/commands/completion.ts` — New
- `packages/core/src/cli/commands/completion.test.ts` — New (7 tests)
- `packages/core/src/cli/commands/config.ts` — Add `validate` subcommand
- `packages/core/src/cli/commands/config.test.ts` — Add 6 tests
- `packages/core/src/cli/commands/plugin.ts` — New
- `packages/core/src/cli/commands/plugin.test.ts` — New (20 tests)
- `packages/core/src/cli.ts` — Register `completionCommand`, `pluginCommand`
- `docs/adr/065-cli-enhancements-completions-validate-plugin.md` — New ADR

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
