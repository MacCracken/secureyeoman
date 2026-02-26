## [2026.2.26-ui-theme-consistency] — 2026-02-26

### Dashboard — UI Theme Consistency (Secrets & Intent)

#### Changed

- **Security > API Keys / Secrets — consistent visual language** — `SecretsPanel` in `SecuritySettings.tsx` was visually inconsistent with the adjacent `ApiKeysSettings` component. Overhauled to match:
  - Wrapped in `card p-4 space-y-4` — same inner-card structure as API Keys.
  - Added outer `space-y-6` wrapper with `h2 text-xl font-semibold text-primary` section header (matching API Keys).
  - **"+ Add Secret" button**: `btn btn-primary btn-sm` → `btn btn-ghost text-sm flex items-center gap-1` with `w-4 h-4` icon — identical style to "Create Key".
  - **Add Secret form container**: `card p-4` → `p-3 rounded-lg bg-muted/30 space-y-3` — matching the Create Key inline form.
  - **Form inputs**: `input w-full font-mono text-sm` (utility class) → explicit `px-2 py-1 rounded border bg-background text-foreground font-mono text-sm w-full focus:outline-none focus:ring-2 focus:ring-primary` — consistent with API Keys input styling.
  - **Form buttons**: `btn-sm` → `text-sm px-3 py-1` (matching API Keys form).
  - **Keys list rows**: heavy `divide-y border` wrapper → `space-y-2` with `bg-muted/30` per-row (matching API Keys row style).
  - `ConfirmDialog` moved to top of render tree (matching API Keys pattern).
  - `<form onSubmit>` converted to `<div onClick>` handler pattern (matching API Keys).

- **Settings > Intent — Create Intent inline form** — `IntentEditor.tsx` "Create Intent" flow updated to match the shared theming:
  - **"+ Create Intent" button**: raw `bg-primary text-primary-foreground rounded` inline styles → `btn btn-ghost text-sm flex items-center gap-1` with `w-4 h-4` icon — identical to "Create Key" / "Add Secret".
  - **Create form**: full-screen `fixed inset-0 bg-black/50` modal replaced with an inline `p-3 rounded-lg bg-muted/30 space-y-3` panel — same pattern as Add Secret and Create Key.
  - **Textarea**: raw border/bg classes → `px-2 py-1 rounded border bg-background text-foreground font-mono text-xs w-full focus:outline-none focus:ring-2 focus:ring-primary resize-y`.
  - **Create/Cancel buttons**: raw inline styles → `btn btn-primary text-sm px-3 py-1` / `btn btn-ghost text-sm px-3 py-1`.
  - Cancel now also resets the JSON editor back to the starter template.
  - Empty state hidden while the create form is expanded (reduces visual clutter).

---

## [2026.2.25-phase-51-real-time-infrastructure] — 2026-02-25

### Feature — Phase 51: Real-Time Infrastructure

#### Added

- **`notifications` table** (migration `047_notifications.sql`) — PostgreSQL-backed persistent
  notification model. Stores `type`, `title`, `body`, `level` (info/warn/error/critical),
  `source`, `metadata`, `read_at`, and `created_at`. Two indexes: descending `created_at` for
  list queries and a partial index on unread rows for count queries.
- **`NotificationStorage`** (`src/notifications/notification-storage.ts`) — `PgBaseStorage`
  subclass with `create()`, `list()`, `markRead()`, `markAllRead()`, `delete()`, `unreadCount()`.
- **`NotificationManager`** (`src/notifications/notification-manager.ts`) — thin orchestration
  layer. `notify()` persists to DB and broadcasts to connected WebSocket clients via `setBroadcast()`.
  The broadcast callback is wired by the gateway after startup to avoid circular dependencies.
- **Notification REST API** (`src/notifications/notification-routes.ts`) at `/api/v1/notifications`:
  - `GET /` — list with `unreadOnly`, `limit`, `offset` query params
  - `GET /count` — lightweight unread count for badge polling
  - `POST /:id/read` — mark single notification read
  - `POST /read-all` — mark all read, returns updated count
  - `DELETE /:id` — delete notification
- **`notifications` WebSocket channel** — added to `CHANNEL_PERMISSIONS` in `gateway/server.ts`.
  Notifications are broadcast as `{ type: 'update', channel: 'notifications', payload: { notification } }`.
- **Heartbeat → notification wiring** — `HeartbeatManager.executeNotifyAction()` now calls
  `notificationManager?.notify()` for every notify action (regardless of external channel),
  creating a DB record and pushing to the WS channel. External delivery stubs unchanged.
- **`HeartbeatManager.setNotificationManager()`** — new method for wiring, called in
  `secureyeoman.ts` Step 6.6 after both managers are initialized.
- **`SecureYeoman.getNotificationManager()`** — public getter.
- **Dashboard API functions** (`packages/dashboard/src/api/client.ts`):
  `fetchNotifications`, `fetchNotificationCount`, `markNotificationRead`,
  `markAllNotificationsRead`, `deleteNotification`.
- **`ServerNotification` type** (`packages/dashboard/src/types.ts`).
- **`NotificationBell.tsx` upgrade** — now handles two notification origins:
  - *Local* (existing behavior preserved): security and task WS events, `localStorage`-backed.
  - *Server* (new): events from the `notifications` WS channel, DB-backed via REST API.
  Subscribes to the `notifications` WS channel on mount. `markRead`/`delete` call the REST API
  for server notifications. Combined unread count badge. Per-item dismiss button added.
- **ADR 133** (`docs/adr/133-real-time-infrastructure.md`).
- **Notifications guide** (`docs/guides/notifications.md`).

#### Tests

- `notification-storage.test.ts` — 14 unit tests with mocked `PgBaseStorage` methods.
- `notification-routes.test.ts` — 15 route tests with mocked `NotificationManager`.

#### Out of Scope (Phase 51)

- Real Slack/Discord/email/Telegram delivery (stubs remain pending IntegrationManager interface audit)
- Per-user notification preferences
- Notification retention/cleanup job

---

## [2026.2.25-per-personality-memory-scoping] — 2026-02-25

### Feature — Per-Personality Memory Scoping + Omnipresent Mind

#### Added

- **`omnipresentMind` toggle** — New boolean field on `BodyConfigSchema` (default `false`). When enabled, the personality queries the full cross-agent memory and knowledge pool (same unfiltered query as the previous system-wide behaviour). When disabled (default), queries are scoped to entries created by that personality plus legacy entries with no owner (`personality_id IS NULL`).
- **Per-personality brain stats** — `GET /api/v1/brain/stats?personalityId=<id>` returns counts scoped to the given personality. The heartbeat `system_health` check now logs accurate per-personality stats instead of system-wide aggregates.
- **Scoped memory + knowledge endpoints** — `GET /api/v1/brain/memories?personalityId=` and `GET /api/v1/brain/knowledge?personalityId=` filter results to a specific personality.
- **Omnipresent Mind toggle in PersonalityEditor** — Brain section now includes an Omnipresent Mind toggle with a warning that enabling it grants cross-agent memory access.

#### Changed

- **`BrainManager.remember()` / `recall()` / `learn()` / `queryKnowledge()` / `getStats()`** — All core methods accept an optional `personalityId` override and resolve it through `resolvePersonalityId()` (returns `undefined` for omnipresent personalities, scoped ID otherwise).
- **Chat routes** — `effectivePersonalityId` is computed once per request from the resolved personality's `omnipresentMind` flag (`undefined` if omnipresent, personality UUID if isolated). Threaded to `gatherBrainContext()` and the post-response memory save. Concurrent requests are safe — no shared mutable state is used.
- **Heartbeat** — `setActivePersonalityIds()` now carries `omnipresentMind` per entry. For `system_health` checks, `effectivePid` is computed per personality inside the log-persistence loop; other check types (maintenance) run once to avoid duplication.
- **`BodyConfig` in `soul/presets.ts`, `soul/manager.ts`, `soul/soul-routes.ts`** — All inline body config objects updated to include `omnipresentMind: false`.

#### Efficiency

- Omnipresent mode issues the same unfiltered SQL query used before scoping existed — zero performance regression.
- Non-omnipresent mode adds a simple indexed `WHERE personality_id = $1 OR personality_id IS NULL` clause — potentially faster than the previous full scan.

#### Tests

- `brain-routes.test.ts` — 4 new tests: `GET /memories?personalityId=` passes id to `recall`; `GET /knowledge?personalityId=` passes id to `queryKnowledge`; `GET /stats?personalityId=` passes id to `getStats`; `GET /stats` without param calls `getStats(undefined)`.

#### Docs

- ADR 133: `docs/adr/133-per-personality-memory-scoping.md`
- Guide: `docs/guides/per-personality-memory-scoping.md`

---

## [2026.2.25-heartbeat-multi-personality-log] — 2026-02-25

### Fix — Heartbeat Execution Log Now Shows All Active Agents

#### Fixed

- **Execution log only ever showed T.Ron (the default personality)** — `HeartbeatManager.beat()` persisted a single log entry per check tagged with one `activePersonalityId`. With multiple active personalities, every run was attributed only to the default agent; FRIDAY never appeared in the expanded card history.
- **`HeartbeatManager.setActivePersonalityIds(personalities)`** — new method stores the full roster of active personalities. On each beat, one log entry is written **per personality** so all agents appear in the execution history.
- **Startup wiring** (`secureyeoman.ts` Step 6.6) — now calls `listPersonalities({ limit: 200 })` in parallel with `getActivePersonality()` and passes the full roster to `setActivePersonalityIds()`.
- **`soul-routes.ts` — `POST /activate` and `PUT /:id`** — both routes refresh the full personality roster via `listPersonalities` and call `setActivePersonalityIds()` after every personality change.

#### Changed

- **Heartbeat card header pills** — switched from `flex-col` stacking back to `inline-block` horizontal layout with `overflow: visible` on the wrapper to prevent clipping by the parent `overflow-hidden` card container.
- **Execution history scroll** — expanded card history capped at `240px` with internal scroll and sticky column headers; page no longer extends unboundedly when a card is expanded.

---

## [2026.2.25-heartbeat-all-personalities] — 2026-02-25

### Fix — Heartbeat Task Cards Show All Personalities

#### Fixed

- **Heartbeat task cards only showed the default personality** — `/brain/heartbeat/tasks` was building the `personalities[]` list from `getEnabledPersonalities()` (WHERE is_active = true) plus the default. Because the standard activate flow is exclusive (one `is_active` at a time), only the active personality appeared. Changed to `listPersonalities({ limit: 200 })` so all created personalities are listed — the heartbeat is system-wide and serves every agent.

#### Tests

- `brain-routes.test.ts` — new test asserts `tasks[0].personalities` contains all personalities (not just the enabled one). `makeMockSoul()` updated with `getEnabledPersonalities` (was missing, causing a pre-existing 500 on the status test) and `listPersonalities` returning a two-personality roster.

---

## [2026.2.25-heartbeat-personality-attribution] — 2026-02-25

### Fix — Heartbeat Log Entries Now Record the Active Personality

#### Fixed

- **Heartbeat log entries always showed "system"** — `HeartbeatManager.beat()` was hardcoding `personalityId: null` on every `logStorage.persist()` call. Log entries are now tagged with the currently active personality's ID.
- **`HeartbeatManager.setActivePersonalityId(id)`** — new method (mirrors `setPersonalitySchedule`) stores the active personality ID and stamps it on all subsequent log entries.
- **Startup wiring** (`secureyeoman.ts` Step 6.6) — after resolving the active personality's schedule, its ID is also passed to `setActivePersonalityId` so the first beat after server start is already attributed.
- **`soul-routes.ts` — `POST /activate` and `PUT /:id`** — both routes now call `setActivePersonalityId` alongside the existing `setPersonalitySchedule` call whenever the active personality changes.
- **`SoulManager.setDefaultPersonality` / `clearDefaultPersonality`** — both methods now call `setActivePersonalityId` to keep attribution in sync when the default personality changes via the manager layer.

#### Tests

- `heartbeat.test.ts` — 3 new tests in `heartbeat log storage`: null personalityId before `setActivePersonalityId`, correct ID after calling it, revert to null after `setActivePersonalityId(null)`.
- `soul-routes.test.ts` — 3 new tests in `heartbeatManager wiring`: POST activate calls `setActivePersonalityId`, PUT update calls it for the active personality, PUT update does NOT call it for a non-active personality. `mockHeartbeatManager()` updated to include `setActivePersonalityId: vi.fn()`.

---

## [2026.2.25-task-consolidation] — 2026-02-25

### Dashboard — Security Dashboard Re-org + Task Consolidation

#### Changed

- **Security Dashboard tab order** — tabs are now: Overview, Audit Log, Autonomy, ML *(conditional)*, Reports, System. Tasks tab removed from Security Dashboard.
- **Tasks page consolidated** — `/tasks` is the single source of truth for all task management. Two sub-tabs: **Tasks** (paginated history, CRUD, filters, date range, CSV/JSON export) and **Heartbeats** (card view with expandable execution history and per-personality association). Sub-tab selection preserved in URL (`?view=heartbeats`).
- **Heartbeat cards** — Heartbeats sub-tab shows a card per monitor: enabled/disabled indicator, type badge, interval, last-run time, personality pills, live status badge (ok/warning/error from last execution), expandable execution history table.
- **Personality association** — Agent/Personality column in the Tasks table now renders personality names as styled pill badges (`.bg-primary/10`) instead of plain text.
- **Security page subtitle** updated: "Monitor security events, manage tasks, and generate reports" → "Monitor security events, audit logs, and system health".

---

## [2026.2.25-governance-hardening] — 2026-02-25

### Phase 50: Governance Hardening

Closes the deferred items from Phase 48 (Organizational Intent) and Phase 49 (AI Autonomy Audit). ADR 132.

### Added

- **OPA sidecar service** — `opa` Docker Compose service (`opa` and `full` profiles) using `openpolicyagent/opa:latest`. SSRF-blocking capabilities config (`opa/capabilities.json`) disables `http.send` and `net.lookup_ip_addr` before accepting user-authored Rego.
- **`OpaClient` module** (`src/intent/opa-client.ts`) — typed wrapper for the OPA REST API: `uploadPolicy`, `deletePolicy`, `evaluate`, `isHealthy`. `fromEnv()` factory auto-detects `OPA_ADDR`. All operations are non-fatal (fall back on network error).
- **`CelEvaluator` module** (`src/intent/cel-evaluator.ts`) — CEL expression evaluator supporting `==`, `!=`, `<`, `>`, `<=`, `>=`, `&&`, `||`, `!`, parentheses, string/number/boolean literals, and `ctx.key` field access. Legacy `key=value AND key=value` format is auto-detected and remains fully backward-compatible.
- **`IntentManager.syncPoliciesWithOpa(record)`** — uploads `rego` fields from `hardBoundaries[]` and `policies[]` to OPA on every create/update. Called automatically by intent routes.
- **Hard boundary OPA evaluation** — `checkHardBoundaries()` now evaluates `boundary_{id}/allow` via OPA when configured and boundary has a `rego` field. Falls back to substring matching on OPA error or when OPA is not configured.
- **MCP tool signal dispatch** — `_fetchMcpToolSignal()` handles `mcp_tool`-typed data sources via optional `callMcpTool` callback injected into `IntentManagerDeps`.
- **Dashboard Policies tab** — New **Policies** tab in `IntentEditor.tsx` shows the active intent's policies grouped by enforcement mode (block/warn), with OPA Rego badge and expandable Rego source viewer.
- **96 tests** — 24 new CEL evaluator tests, 15 new OPA client tests, 32 new IntentManager tests (CEL, OPA boundary, MCP signal, syncPoliciesWithOpa). All pass.
- **Docs** — `docs/adr/132-governance-hardening.md`, `docs/guides/governance-hardening.md`.

### Changed

- `_evalActiveWhen()` in `IntentManager` — delegates to `evalCel()` instead of the inline simple parser.
- `_matchesPolicy()` in `IntentManager` — uses injected `OpaClient` instance instead of ad-hoc `fetch(process.env.OPA_ADDR)`.
- `IntentManagerDeps` — adds `opaClient?: OpaClient | null` and `callMcpTool?` optional fields.
- `POST /api/v1/intent` and `PUT /api/v1/intent/:id` — call `syncPoliciesWithOpa()` after save.
- `packages/core/package.json` — added `@open-policy-agent/opa: ^2.0.0`.

---

## [2026.2.25-sub-agents-tab-order] — 2026-02-25

### Sub-Agents — Profiles Tab First

### Changed

- **Sub-Agents tab order** — Profiles is now the first tab (`Profiles → Active → Swarms → History`). Default selected tab on open remains `Active`. The change makes the profile library immediately discoverable without affecting the runtime-focused default view.

---

## [2026.2.25-marketplace-skill-preview] — 2026-02-25

### Marketplace & Community — Skill Preview Before Installation

### Added

- **Skill preview modal** — Every skill card in the Marketplace and Community tabs now has a **Preview** button (eye icon). Clicking it opens a full-detail modal before the user commits to installing. The modal shows:
  - Name, version badge, source badge (YEOMAN / Community), category, install count
  - Author name with clickable GitHub and website links (when present) and license
  - Full description
  - Complete **Instructions** (the system prompt injected when the skill is active) in a scrollable monospace block
  - **Trigger Patterns** — each regex pattern that activates the skill, displayed as code blocks
  - **MCP Tools** — names of any MCP tools the skill requires, as chips
  - Tags
  - Last-updated date
  - Install / Uninstall / Close actions in the footer — the user can install directly from the preview without closing first
  - Closes on Escape key or clicking the backdrop

### Changed

- **`SkillCard` footer layout** — The single full-width Install/Uninstall button is now accompanied by a small **Preview** ghost button to its left. The install CTA retains visual priority (`flex-1`).
- **`MarketplaceSkill` dashboard type** (`types.ts`) — Added `authorInfo?: { name, github?, website?, license? }`, `tools: { name, description }[]`, and `triggerPatterns: string[]` to match the fields already present in the shared Zod schema and returned by the API.

---

## [2026.2.25-personality-editor-relabelling] — 2026-02-25

### Personality Editor — Language & Label Overhaul

Renamed labels throughout the Personality Editor's Soul tab to better reflect the platform's ontological vocabulary. No functional changes — purely cosmetic.

### Changed

- **Section header** `Soul — Identity` → `Soul — Essence`
- **Name** → `Identity`
- **Description** → `Identity Abstract`
- **System Prompt** → `Core Heuristics`
- **Traits** → `Disposition`
- **Sex** → `Physiognomy (Gender)` *(dropdown options unchanged: unspecified / male / female / non-binary)*
- **FRIDAY preset Core Heuristics** updated — removed generic "helpful assistant" framing; now reads: *"You are FRIDAY, a security-first assistant specializing in infrastructure hardening, code vulnerability analysis, and operational resilience. You combine technical precision with proactive threat mitigation, catching security flaws before they reach production."*
- **Morphogenesis** toggle (formerly "Include Sacred Archetypes") — description updated to *"Weaves the Sacred Archetypes into the system prompt — these are the foundational patterns that give this personality its actual shape and character"*
- **Ontostasis** toggle (formerly "Protect from deletion") — description updated to *"Locks this personality's existence — prevents any AI-initiated deletion. Only a human admin can remove it from the dashboard"*
- **Protostasis** toggle (formerly "Default personality") — description updated to reflect first-presence framing for both create and edit states

---

## [2026.2.25-chronoception-and-coverage] — 2026-02-25

### Chronoception, Chat Bubble Timestamps & Test Coverage

### Added

- **Chronoception — per-personality date/time injection** — New `injectDateTime` toggle (labelled "Chronoception") in the Personality Editor. When enabled, the current date and time are injected into the personality's system prompt on every conversation turn so the AI always knows when it is without being asked. The timestamp is formatted using the personality's configured active-hours timezone. Backed by:
  - DB migration `046_personality_inject_datetime.sql` (`inject_date_time BOOLEAN DEFAULT false`)
  - `PersonalitySchema` — `injectDateTime: z.boolean().default(false)`
  - `composeSoulPrompt()` — injects a `## Current Date & Time` section when enabled, locale-formatted with the personality's timezone
  - `PersonalityEditor.tsx` — "Chronoception" toggle with description "Injects the current date and time into the system prompt so the personality always knows when it is"

- **Chat bubble timestamps** — Every message bubble (user and assistant) now shows the date and time it was sent/received (`Mon DD YYYY HH:MM:SS`) in the bubble header, derived from the existing `ChatMessage.timestamp` field. The date is included for historical conversation reference. No schema changes required.

### Improved

- **`creation-tool-executor.ts` test coverage** — Test suite expanded from 40 → 82 tests, covering all previously untested tool branches:
  - `create_skill` — success path, `normalizeSkillName()` snake_case and kebab-case normalisation, personality scoping, error catch
  - `update_skill`, `delete_skill` (including name-fallback when skill not found)
  - `update_task` — with/without task storage
  - `create_personality` (including sex defaulting), `update_personality`
  - `delegate_task`, `list_sub_agents`, `get_delegation_result` — with/without sub-agent manager
  - `create_swarm` — with/without swarm manager
  - `create_custom_role` — including `action` (singular) vs `actions` (plural) permissions normalisation; `assign_role`
  - `create_experiment` — with/without experiment manager
  - `a2a_connect`, `a2a_send` — with/without A2A manager
  - `create_workflow`, `update_workflow`, `delete_workflow`, `trigger_workflow` — with/without workflow manager
  - Gating edge cases: policy-fetch error falls through (fail-safe allow), approval store unavailable returns error, no `personalityId` skips policy check entirely

---

## [2026.2.25-marketplace-install-state] — 2026-02-25

### Marketplace & Community — Contextual Install State

### Fixed

- **Install button shows as "installed" across all personalities** — `marketplace.skills.installed` was a single global boolean set to `true` the moment any personality installed a skill. Switching to a different personality continued to show "Uninstall" even though that personality had no installation. Fixed by computing `installed` contextually from `brain.skills` per the selected personality (or global) context.

### Changed

- **GET `/api/v1/marketplace`** now accepts an optional `personalityId` query param:
  - `personalityId=` (empty string) → **Global context**: `installed = true` only if a `personality_id IS NULL` brain skill record exists for this skill.
  - `personalityId=<uuid>` → **Personality context**: `installed = true` only if a personality-specific brain skill record exists; `installedGlobally = true` if a global record also exists.
  - Omitted → backward-compatible: uses the stored boolean (for existing API callers).
- **`MarketplaceSkill`** gains an `installedGlobally: boolean` field — `true` when the skill has a global (`personality_id IS NULL`) brain skill record.
- **POST `/api/v1/marketplace/:id/uninstall`** now accepts `personalityId` in the body. Removes only the matching brain skill record (personality-specific or global). The marketplace catalog `installed` flag is only reset to `false` when no brain skill records remain for that skill across all contexts.
- **POST `/api/v1/marketplace/:id/install`** no longer exits early on `skill.installed`. Checks whether the target context (personality or global) already has a brain skill record before creating one, preventing duplicates.
- **Marketplace & Community tabs**: query key includes `selectedPersonalityId` so the installed state re-evaluates when the user switches the "Install to" dropdown. Queries are gated on `hasInitialized` to avoid a flash of stored-boolean data before personality list loads.
- **SkillCard** renders three states:
  - `installed = true` → **Uninstall** button (personality-specific installation)
  - `installed = false`, `installedGlobally = true` → **"Installed globally"** label with globe icon (managed from Global context)
  - neither → **Install** button

---

## [2026.2.25-agent-quality] — 2026-02-25

### Agent Quality & Chat Stream Reliability

### Fixed

- **Chat response duplication in agentic tool loops** — The streaming route was passing the cumulative content from *all* previous iterations as the `content` field of each assistant turn pushed to the messages array. This caused the model to re-state the full response preamble on every continuation turn after a tool call, producing exponentially growing duplicate output. Fixed by tracking `iterContentStart` (the index into `contentPartsS` where the current iteration begins) and only including that iteration's text in the assistant push message. The `done` event still sends the full accumulated content as before.
- **Personality "dying" during long tool chains** — `MAX_TOOL_ITERATIONS` raised from 10 → 20 in both the streaming and non-streaming routes. Comprehensive multi-tool tasks (system tests, diagnostics) were hitting the 10-iteration cap and terminating mid-response.
- **Sub-agent profile token budget floor mismatch** — The dashboard Sub-Agents profile form allowed `maxTokenBudget` as low as 1,000 (`min={1000}`), but `manager.ts` enforces a hard `MIN_TOKEN_BUDGET = 20_000`. Changed the UI minimum to 20,000 to match, preventing profiles that store a misleadingly low budget in the DB.

### Improved

- **SSE keepalive during long tool chains** — Streaming route now emits an SSE comment line (`: keepalive`) between tool execution iterations. This resets connection timeout timers on proxies and browsers without triggering the client-side data handler, preventing stream disconnects on multi-tool tasks.
- **Soul prompt token budget raised** — `maxPromptTokens` schema max lifted 32,000 → 100,000 (both global `SoulConfigSchema` and per-personality `BodySchema`). Global default raised 32,000 → 64,000. With many skills, large knowledge bases, and memories, 32 k was insufficient for power users. Settings pages updated to reflect new ranges (1,024–100,000 tokens).
- **Thinking token budget raised** — `ThinkingPersonalityConfigSchema.budgetTokens` max lifted 32,000 → 64,000 to match Claude's extended-thinking ceiling. Slider in PersonalityEditor updated accordingly.

- **Metrics page stale after personality enable/disable** — Global `QueryClient` has `staleTime: 30_000`, so navigating away and back within 30 seconds served cached heartbeat/personality counts without re-fetching. Added `staleTime: 0` override to `heartbeatStatus` and `personalities` queries in `MetricsPage` so they always fetch fresh data on mount.
- **Org intent toggle greyed out in personality editor** — Toggle was gated on `allowOrgIntent` (a server-side security policy with no dashboard UI control) instead of `allowIntentEditor` (the user-facing toggle in Settings → Security → Developers). Fixed gate condition and updated help text.

### Investigation

- **Sub-agent overhead root-cause documented** — Identified that the primary driver of the 30 K–50 K per-delegation overhead is unconditional injection of all registered MCP tools into every sub-agent call (~10,000–15,000 tokens across 20–30 tools). The `MIN_TOKEN_BUDGET = 20_000` hard floor adds a further baseline. No soul prompt or brain context is injected into sub-agents (good).

### Sub-agent tool pruning

- **`toolMatchesProfile()` helper in `manager.ts`** — Wildcard-aware tool filter that runs on every sub-agent delegation. Supports `[]` (all tools, backwards-compatible), `*` (all), `prefix_*` (prefix match, e.g. `web_*`, `fs_*`), and exact names. Empty `allowedTools` on user-created profiles is unchanged — all tools remain accessible by default.
- **Built-in profiles focused** (`profiles.ts`) — Each of the four built-in profiles now carries a focused `allowedTools` list rather than `[]`:
  - **researcher** — `web_*`, `memory_recall`, `knowledge_search`, `knowledge_get`, `knowledge_store` (~8–10 tools, was 200+)
  - **coder** — `fs_*`, `git_*`, `memory_recall`, `knowledge_search`, `knowledge_get` (~20 tools, was 200+)
  - **analyst** — 14 specific tools: targeted web search, memory, knowledge, system metrics, audit, task queries
  - **summarizer** — 3 tools: memory recall + knowledge lookup only
  - Profile changes auto-apply on next restart via `ON CONFLICT DO UPDATE` seed.
- **`allowedTools` input in Sub-Agents profile form** — New textarea in the Create Profile panel accepts tool patterns (one per line, blank = all tools). Parsed and passed to the API on create. Profile cards now display the pattern count ("3 tool patterns") or "All tools" when unconstrained.

---

## [2026.2.25-tls2] — 2026-02-25

### TLS via Env Vars, MCP HTTPS Fix, Dashboard Local-Network Guard Removed

### Added

- **TLS gateway config via env vars** — All gateway TLS settings are now controllable through environment variables, eliminating the need for a `secureyeoman.yaml` file for the common TLS dev setup. New vars: `SECUREYEOMAN_TLS_ENABLED`, `SECUREYEOMAN_TLS_CERT_PATH`, `SECUREYEOMAN_TLS_KEY_PATH`, `SECUREYEOMAN_TLS_CA_PATH`, `SECUREYEOMAN_TLS_AUTO_GENERATE`, `SECUREYEOMAN_ALLOW_REMOTE_ACCESS`, `SECUREYEOMAN_CORS_ORIGINS`. Env vars override yaml config; yaml still works for advanced use.
- **MCP `CoreApiClient` HTTPS dispatcher** — `core-client.ts` now creates a per-connection undici `Agent` with `rejectUnauthorized: false` specifically for MCP→core HTTPS traffic. This allows MCP to reach the core when the TLS cert is for a public hostname (e.g. `dev.example.com`) without needing `NODE_TLS_REJECT_UNAUTHORIZED=0` globally. All other HTTPS calls (web tools, external APIs) still verify certificates normally.

### Fixed

- **Dashboard client-side `isLocalNetwork` guard removed** — `DashboardLayout.tsx` had a frontend hostname check that blocked access from any hostname not in a hardcoded RFC 1918 / `localhost` list (e.g. `dev.secureyeoman.ai` or any custom hostname). This was redundant with the server-side guard and incorrectly blocked valid `allowRemoteAccess` deployments. Removed. Access control is now entirely server-side.

### Changed

- **`secureyeoman.yaml` no longer required for TLS dev setup** — The `./secureyeoman.yaml:/app/secureyeoman.yaml:ro` bind mount removed from `docker-compose.yml`. All TLS, remote-access, and CORS config now flows via `.env.dev`. The yaml file still works for advanced/production config if present at any of the standard search paths.
- **`NODE_TLS_REJECT_UNAUTHORIZED=0` removed** — No longer needed in `.env.dev` or `docker-compose.yml` environment section. The MCP client handles this internally per-connection.

---

## [2026.2.25-tls] — 2026-02-25

### Remote Access, Dual HTTP/HTTPS & IPv6-mapped IP Fix

### Added

- **`gateway.allowRemoteAccess`** — New boolean config option (default `false`). When `true`, bypasses the local-network-only guard so the gateway is reachable from public/routable IPs. Intended for enterprise deployments with a wildcard or CA-signed TLS cert. Without TLS, the default remains local-only. SecureYeoman stays **local-first** — this is an explicit opt-in only.
- **`VITE_GATEWAY_URL` / `MCP_CORE_URL` in `.env.dev`** — Gateway URLs are set directly in `.env.dev` (e.g. `https://core:18789`) rather than via a `GATEWAY_SCHEME` interpolation variable. Docker Compose variable substitution only reads from the host shell or root `.env`, not from `env_file:` — setting the full URLs directly avoids this footgun.
- **Dual-protocol Docker healthcheck** — `core` container healthcheck tries HTTPS first (`NODE_TLS_REJECT_UNAUTHORIZED=0 node … health --url https://...`), falls back to HTTP. Works in both plain and TLS configurations without changes.
- **`secureyeoman.yaml` local config file** — Documented pattern for machine-specific config (TLS paths, remote access, CORS origins) via a gitignored `secureyeoman.yaml` at the repo root, bind-mounted into the `core` container.
- **`certs/` bind mount in docker-compose** — `core` service mounts `./certs:/app/certs:ro` and `./secureyeoman.yaml:/app/secureyeoman.yaml:ro` so cert files and local config are available at runtime without baking them into the image.
- **`NODE_TLS_REJECT_UNAUTHORIZED=0` for MCP container** — MCP service uses Node.js native `fetch()` to reach core; when core serves HTTPS with a hostname-specific cert (e.g. `dev.secureyeoman.ai`), inter-container traffic to `https://core:18789` fails hostname validation. Dev-only workaround in `docker-compose.yml`. Does not affect production where the cert hostname matches or where the MCP service reaches core via a matching hostname.

### Fixed

- **IPv6-mapped IPv4 addresses blocked by local-network guard** — `isPrivateIP()` in `gateway/server.ts` did not handle `::ffff:`-prefixed addresses (e.g. `::ffff:172.20.0.3`), causing Docker inter-container requests to be rejected as non-local. Strips the `::ffff:` prefix before the RFC 1918 range checks.
- **Duplicate `MCP_CORE_URL` in `.env.dev`** — The URL was declared twice (once for HTTPS at the top, once for HTTP in the MCP section). The later value always won, silently reverting to HTTP. Removed the duplicate; a single `MCP_CORE_URL` now lives at the top of the file.

---



### Dev HTTPS & Wildcard Certificate Support

### Added

- **Vite dev server HTTPS** — `vite.config.ts` now reads `VITE_TLS_CERT` and `VITE_TLS_KEY` from `.env.dev` (via `loadEnv`) to serve the dashboard over HTTPS in development. Cert paths are resolved relative to the repo root.
- **`VITE_ALLOWED_HOSTS` support** — Vite's `allowedHosts` is driven by `VITE_ALLOWED_HOSTS` (comma-separated) in `.env.dev`, keeping custom hostnames out of version control.
- **Gateway TLS config** — `gateway.tls.certPath`, `keyPath`, `caPath` documented for wildcard/ACM cert use. `certs/` directory gitignored.

### Fixed

- **Encrypted ACM private key** — AWS ACM exports private keys with a passphrase. The dev server would fail with `bad decrypt` if the encrypted key was passed directly. Documented `openssl rsa` decrypt step; `.env.dev` now points to `certs/private_key_decrypted.txt`.
- **`loadEnv` not reading `.env.dev` in container** — `vite.config.ts` previously used `process.env` directly, missing file-based env vars inside the Docker `dashboard-dev` container. Switched to `loadEnv(mode, repoRoot, '')` merged with `process.env` (process env takes priority, preserving Docker-injected `VITE_GATEWAY_URL`).
- **Duplicate `buildFrontMatter` export in MCP** — `web-tools.ts` exported `buildFrontMatter` both via `export { buildFrontMatter }` (re-export from utils) and in the bottom `export {}` block, causing `TS2300` and breaking the MCP build.

### Documentation

- `docs/guides/tls-certificates.md` — Added AWS ACM wildcard cert setup, encrypted key decrypt instructions, and Vite dev server HTTPS section.
- `docs/configuration.md` — Added `VITE_GATEWAY_URL`, `VITE_HOST`, `VITE_ALLOWED_HOSTS`, `VITE_TLS_CERT`, `VITE_TLS_KEY` env var reference.
- `.env.dev.example` / `.env.example` — Added `VITE_ALLOWED_HOSTS`, `VITE_TLS_CERT`, `VITE_TLS_KEY` with placeholder values.

---

## [2026.2.25] — 2026-02-25

### Phase XX.8 — Memory, Performance & Code Quality Sprint

A comprehensive audit of memory leaks, performance bottlenecks, and code duplication. 27 items found across three categories; all resolved without behavioral changes.

### Security

- **Streaming tool-filter security gap closed** — The `/api/v1/chat/stream` handler previously skipped the network-tool and Twingate-tool gate checks that the non-streaming path enforced. All MCP tool categories (git, fs, web, browser, network, Twingate) are now filtered via a shared `filterMcpTools()` function applied identically to both paths (`chat-routes.ts`).

### Fixed

- **`nextCronRun()` was a stub** — `SkillScheduler.nextCronRun()` returned `from + checkIntervalMs` for all cron expressions (a placeholder). Replaced with a full 5-field cron parser supporting `*`, `*/N`, `a-b`, `a-b/N`, and comma-separated lists. Skills now fire at their actual scheduled times.
- **`signalCache` leaked stale signals on intent reload** — `IntentManager.reloadActiveIntent()` rebuilt the goal index without clearing `signalCache`, so stale signal evaluations persisted. Added `this.signalCache.clear()` at the top of `reloadActiveIntent()`.
- **`skill-resources` loaded all skills to serve one** — The `yeoman://skills/{id}` MCP resource fetched all skills from `GET /api/v1/soul/skills` and searched locally. Changed to `GET /api/v1/soul/skills/:id` — O(n) → O(1).

### Performance

- **Parallel brain recall** — `brainManager.recall()` and `brainManager.queryKnowledge()` were sequential awaits in both streaming and non-streaming handlers. Wrapped in `Promise.all([...])` in both paths.
- **Batch memory fetch** — `BrainManager` hybrid search issued N individual `getMemory(id)` calls after RRF ranking. Replaced with a single `WHERE id = ANY($1)` batch query.
- **`mcpStorage.getConfig()` cache** — `McpStorage.getConfig()` made a DB round-trip on every tool-filter check (once per chat request). Added a 5-second in-process cache; `setConfig()` invalidates it immediately.
- **DB indexes** — Added three missing indexes via migration `045_performance_indexes.sql`: `soul.skills (enabled, status, usage_count DESC)`, `autonomy_audit_runs (status)`, `intent_enforcement_log (personality_id)`.
- **`listSkills` window function** — `SoulStorage.listSkills()` ran separate `COUNT(*)` and `SELECT` queries. Replaced with `COUNT(*) OVER ()` window function in a single query.
- **`ResponseCache` auto-eviction** — `ResponseCache` exposed `evictExpired()` but had no background timer; expired entries only left when the FIFO limit was hit. Added a `setInterval` timer (period = TTL) so stale entries are proactively purged.
- **Pre-compiled trigger RegExp** — `isSkillInContext()` called `new RegExp(pattern, 'i')` on every invocation. Added a module-level `Map<string, RegExp | null>` cache (`triggerPatternCache`) so each pattern string compiles once.

### Memory

- **`UsageTracker` unbounded growth** — `UsageTracker` loaded up to 90 days of usage records into a `records[]` array on startup and kept them forever. Replaced with `todayRecords[]` (today only, typically <100 entries) plus DB-aggregated `monthCostUsd` and `providerStats` accumulators seeded at init. `UsageStorage` gained `loadToday()`, `loadMonthCostUsd()`, `loadProviderStats()`, and `getTotalCallCount()` helpers.
- **`tokenCache` unbounded** — The module-level `tokenCache: Map<string, number>` in `token-counter.ts` grew without bound. Capped at 2 000 entries with FIFO eviction.
- **`agentReports` ephemeral store** — The `agentReports` Map in `diagnostic-routes.ts` had no TTL. Added a background `setInterval` that evicts reports older than 10 minutes every 5 minutes (timer `.unref()`'d).

### Refactoring

- **`buildFrontMatter` shared utility** — The function was copy-pasted in three files (`web-tools.ts`, `personality-resources.ts`, `skill-resources.ts`). Extracted to `packages/mcp/src/utils/front-matter.ts`; all three import from there.
- **Brain context helpers** — The brain recall + preference-injection block was duplicated verbatim in the non-streaming and streaming chat handlers (~30 lines each). Extracted to `gatherBrainContext()` and `applyPreferenceInjection()` module-level helpers.
- **`AbortSignal.timeout()` in twingate-tools** — `twingateQuery()` and `mcpJsonRpc()` used the verbose `AbortController + setTimeout + try/finally clearTimeout` pattern. The rest of the codebase already uses `AbortSignal.timeout()` (available since Node.js 17, required ≥20). Both functions updated to match.
- **`SkillScheduler` uses `setInterval`** — The scheduler used recursive `setTimeout` (a new timer object each cycle). Replaced with a single `setInterval` instance, cleaned up in `stop()`.

### Tests

- **`skill-scheduler.test.ts`** — 4 new cron-expression tests covering `*/5 * * * *` (step fields), `0 9 * * *` (specific hour), `0 0 1 * *` (day-of-month), and `5,35 * * * *` (comma-separated values).
- **`response-cache.test.ts`** — 2 new tests verifying the background auto-eviction timer fires and evicts expired entries, and that `clear()` stops the timer.

### Documentation

- **ADR 131** — `docs/adr/131-memory-performance-code-quality-sprint.md` documents all 18 changes, their root causes, and the resolution approach.

---

## [2026.2.24] — 2026-02-24

### Phase XX.7 — Settings Active Souls Polish

### Changed

- **Active Souls badge order** — Badges in Settings → General → Active Souls now render in priority order: **Active** → **Always On** → **Default** → Preset → Off-hours → token budget. Previously Default appeared before Active/Always On.
- **Active Souls read-only** — Removed the enable/disable power button and default-star action buttons from each soul row. The section is now informational only; all soul management is done via the existing **Manage Souls** link. Simplified `SoulRow` props accordingly (`onEnable`, `onDisable`, `onSetDefault`, `onClearDefault`, `isMutating` removed).

---

### Phase XX.6 — Personality Editor Brain / Org Intent Scope Fix

### Fixed

- **Org Intent toggle scope error** — `securityPolicy` and `globalMcpConfig` were only queried inside `BodySection` but `BrainSection` is rendered by the top-level `PersonalityEditor`. Added the same two `useQuery` calls (`['mcpConfig']` and `['security-policy']`) to `PersonalityEditor` so that `orgIntentMcpEnabled` is correctly computed when wiring `BrainSection` props — resolves `TS2304: Cannot find name 'securityPolicy'` / `'globalMcpConfig'`.
- **Org Intent moved from MCP tools to Brain section** — The Organizational Intent toggle no longer lives in Body → MCP Tools. It is now the first item in Brain → Intellect, rendered as a proper toggle (matching the style of other Brain toggles) gated on `securityPolicy.allowOrgIntent && globalMcpConfig.exposeOrgIntentTools`.

### Tests

- **2 new tests in `PersonalityEditor.test.tsx`** — Cover Org Intent toggle disabled when policy is off (default) and enabled when both `allowOrgIntent` and `exposeOrgIntentTools` are `true`.
- **2 new tests in `SecuritySettings.test.tsx`** — Cover Twingate card heading render and `updateSecurityPolicy({ allowTwingate: true })` call. Fixed pre-existing gap: added `fetchAgentConfig` and `updateAgentConfig` to the mock (required by new Security Settings agent-config feature).
- **2 new tests in `ConnectionsPage.test.tsx`** — Cover Twingate row hint text ("Enable Twingate in Security settings first") when `allowTwingate: false`, and row description ("Agents can reach private MCP servers…") when `allowTwingate: true`. Added missing `fetchSecurityPolicy` mock.

---

### Phase XX.5 — Onboarding Improvements

### Changed

- **`init` wizard step numbering** — Interactive prompts now show `[n/totalSteps]` step indicators (e.g. `[1/8] Agent identity`). Full mode shows 8 steps; `--env-only` shows 5.
- **Updated AI provider model defaults** — `anthropic` default updated from `claude-sonnet-4-20250514` → `claude-sonnet-4-6`; `gemini` updated from `gemini-1.5-pro` → `gemini-2.0-flash`.
- **Post-setup next steps panel** — Both the API-onboarding success path and the config-file fallback path now print a `Next steps:` block listing the four most common follow-up commands (`start`, `health`, `repl`, `integration`). Replaces the old single-line "Start the server with: secureyeoman start" message.
- **Setup banner updated** — Added "Configure your AI agent in under 2 minutes." tagline to the welcome box.

### Tests

- 2 new tests in `init.test.ts` — cover `Next steps` output in the config-file fallback path and the API-onboarding success path. Total CLI tests: **392 passing**.

---

### Phase XX.4 — CLI Polish

### Fixed

- **Wrong default port in `model` and `policy` commands** — Both commands used `DEFAULT_URL = 'http://127.0.0.1:18789'` instead of the correct `3000`. Corrected.
- **`config` in REPL tab-completion but unimplemented** — The `REPL_COMMANDS` array (used for `<Tab>` completion) included `'config'` but `handleLine` had no matching case and `HELP_TEXT` didn't document it. Removed `'config'` from tab completion while the full implementation was pending, then implemented it fully (see Added below).

### Added

- **`extractCommonFlags()` helper in `utils.ts`** — Extracts `--url`, `--token`, and `--json` from `argv` in one call, returning `{ baseUrl, token, json, rest }`. The resolved `baseUrl` now respects the `SECUREYEOMAN_URL` environment variable (previously each command only fell back to its hard-coded default). Refactored 16 CLI command files to use the helper, removing ~100 lines of boilerplate.
- **`--json` on `agnostic status`** — Outputs `{ containers, running, total }` as JSON. Useful for scripting and CI pipelines.
- **`--json` on `security status`** — Outputs `{ container, state, tools, config }` as JSON. Tool availability is checked per-tool (same as the human-readable view).
- **Shell completion for `agents`, `mcp-server`, `tui`, `security`, `agnostic`, and `migrate`** — Added all 6 missing commands to `COMMANDS` array in `completion.ts` and wrote bash `case`, zsh `_arguments`, and fish `complete` blocks for each, including their subcommands (`setup/teardown/update/status`, `start/stop/status/logs/pull`, `status/enable/disable`) and flags (`--path`, `--follow`, `--tail`, `--json`, `--port`).
- **REPL `config` command** — `config` in the REPL session now calls `GET /api/v1/config` on the connected server and prints `Model`, `Environment`, and `Gateway` from the runtime configuration. Falls back to raw JSON dump if the response omits the known sections. Documented in `HELP_TEXT`, included in tab-completion.

### Tests

- 7 new tests across `agnostic.test.ts` (2) and `security.test.ts` (2) for `--json`; `completion.test.ts` (+3) for missing commands; `repl.test.ts` (+5) for `config` command and help text. `repl.test.ts` and `init.test.ts` updated to include `mockExtractCommonFlags` in their `vi.mock('../utils.js', ...)` blocks. Total CLI tests: **390 passing**.

---

### Phase XX.3 — MCP Tool Visibility Fixes

### Fixed

- **`GET /api/v1/mcp/tools` not filtering `network_*` / `netbox_*` / `nvd_*` / `subnet_*` / `wildcard_*` / `pcap_*` tools** — The endpoint already filtered git, filesystem, web, browser, and desktop tools by `McpFeatureConfig`, but the network and Twingate tool groups were missing from the filter. Added `NETWORK_TOOL_PREFIXES` and `TWINGATE_TOOL_PREFIXES` checks so toggling **Network Tools** or **Twingate** in Connections → MCP now correctly removes those tools from the Discovered Tools list and counts.
- **`netbox_*` tools not updating when NetBox Write is toggled** — `allowNetBoxWrite` lives in `SecurityPolicy`, which the tools route couldn't access. Added `getNetBoxWriteAllowed?: () => boolean` to `McpRoutesOptions`; `GatewayServer` wires it to `config.security.allowNetBoxWrite`. When the callback returns `false`, all `netbox_*` tools are excluded from the response, matching user expectation that enabling write access is a prerequisite for NetBox tool availability. The frontend `toolCount` filter in `ConnectionsPage` mirrors this logic using `securityPolicy?.allowNetBoxWrite`.
- **Twingate toggle visual grey-out** — The Twingate Zero-Trust Tunnel row in Connections → MCP now applies the same `opacity-50 / cursor-not-allowed` disabled styling as NetBox Write does when its parent gate is off. When `securityPolicy.allowTwingate` is `false` the row is greyed and the checkbox is disabled with a tooltip reading "Enable Twingate in Security settings first".
- **"Allow Twingate" master gate missing from Security settings** — Removed in a previous session when the Twingate card was relocated to Connections. Restored as a lean `PolicyToggle` card (below Network Tools) that controls `allowTwingate` in `SecurityPolicy`, keeping it consistent with the `allowNetworkTools` pattern.

### Tests

- **7 new unit tests in `mcp-routes.test.ts`** — Cover `exposeNetworkTools` on/off, `exposeTwingateTools` on/off, `getNetBoxWriteAllowed` returning false/true/absent for `netbox_*` tools. All 37 route tests pass.

---

### Phase 50 — Intent Goal Lifecycle Events

### Added

- **`completionCondition` field on `GoalSchema`** — Optional string describing what constitutes goal completion. Uses the same deny:/tool: prefix matching as hard boundaries. When a goal transitions from active → inactive and this field is present, a `goal_completed` enforcement log event is emitted.
- **`'goal_completed'` in `EnforcementEventTypeSchema`** — Joins the existing `'goal_activated'` event; both are now surfaced in the dashboard enforcement log filter and the new `GoalTimeline` component.
- **`intent_goal_snapshots` table** (migration `044_goal_lifecycle.sql`) — Persists per-intent goal active-state snapshots (`intent_id`, `goal_id`, `is_active`, `activated_at`, `completed_at`). Enables transition detection across process restarts.
- **`IntentStorage` snapshot + timeline methods**:
  - `getGoalSnapshots(intentId)` — loads DB snapshot into a `Map<goalId, GoalSnapshotRecord>`
  - `upsertGoalSnapshot(intentId, goalId, isActive, now, setActivatedAt, setCompletedAt)` — INSERT … ON CONFLICT DO UPDATE
  - `getGoalTimeline(intentId, goalId)` — enforcement log entries for a single goal (`goal_activated` + `goal_completed` events, oldest-first)
- **`itemId` filter on `queryEnforcementLog`** — Enables per-goal timeline queries via `?itemId=goalId` on `GET /api/v1/intent/enforcement-log`.
- **`IntentManager._diffGoals(ctx)`** — Compares current `resolveActiveGoals(ctx)` evaluation against the in-memory snapshot. On inactive→active: emits `goal_activated` and upserts snapshot with `activatedAt`. On active→inactive with `completionCondition`: emits `goal_completed` and sets `completedAt`. Updates both in-memory and DB snapshots.
- **`IntentManager._seedGoalSnapshot()`** — Called once during `initialize()`. Loads DB snapshot and seeds the in-memory map without firing events (correct prior state for new processes).
- **`_diffGoals` wired into three call sites**:
  - `initialize()` — seeds via `_seedGoalSnapshot()` then starts refresh timer
  - `reloadActiveIntent()` — diffs immediately when the active intent changes (doc swap, activation, update)
  - `_startSignalRefresh()` — diffs once per refresh cycle (outside signal loop)
- **`IntentManager.getGoalTimeline(intentId, goalId)`** — public passthrough to storage
- **`GET /api/v1/intent/:id/goals/:goalId/timeline`** — new endpoint; returns `{ entries: EnforcementLogEntry[] }` for a goal's lifecycle events; 404s if intent doc not found
- **`fetchGoalTimeline(intentId, goalId)`** in dashboard API client
- **`completionCondition?: string`** on `OrgIntentGoal` dashboard interface
- **`GoalTimeline` component** in `IntentEditor.tsx` — collapsible per-goal card in the Signals tab showing `Activated` / `Completed` event chips with timestamps; lazy-loaded on expand via `useQuery`
- **Goal History section** in `SignalDashboard` — appears below Signal Health cards when the active intent has goals; renders one `GoalTimeline` per goal
- **`goal_completed` colour** added to `EnforcementLogFeed` event type map (emerald) and dropdown filter
- **25 new tests** (82 total across 3 intent test files):
  - `intent-schema.test.ts` — `completionCondition` present/absent parsing (+2)
  - `intent-manager.test.ts` — `goal_activated` emission, no duplicate events, `goal_completed` with/without `completionCondition`, `initialize()` seed-without-events, DB snapshot seeding, `getGoalTimeline` passthrough (+15)
  - `intent-routes.test.ts` — `itemId` filter passthrough, `GET /:id/goals/:goalId/timeline` success + 404 (+5), `makeStorage`/`makeManager` updated with new methods (+3 runner changes)

---

### Phase 49.1 — Autonomy Level Build Fixes

### Fixed

- **`brain/storage.ts` `rowToSkill` missing `autonomyLevel`** — The brain module's local `rowToSkill` mapper was not updated when `autonomyLevel` was added to `SkillSchema` in Phase 49, causing a `TS2741` compile error. Added `autonomyLevel: 'L1'` default to match the schema default.
- **`creation-tool-executor.ts` `createSkill` call missing `autonomyLevel`** — The AI skill-creation tool passed an object literal without `autonomyLevel`, triggering `TS2345`. Added `autonomyLevel: 'L1'` so AI-created skills default to the lowest oversight tier.
- **`workflow-routes.ts` `createDefinition` call missing `autonomyLevel`** — The POST workflow handler passed a creation payload without `autonomyLevel`, triggering `TS2345`. Added `autonomyLevel: 'L2'` matching the schema default for workflows.
- **`workflow-templates.ts` three template definitions missing `autonomyLevel`** — All three built-in workflow template objects lacked `autonomyLevel`, causing `TS2741` on each. Added `autonomyLevel: 'L2' as const` to each template.

---

### Phase 49 — AI Autonomy Level Audit

### Added

- **`autonomyLevel` field on skills and workflows** — New `AutonomyLevelSchema` enum (`L1`–`L5`) added to `SkillSchema` (default `'L1'`) and `WorkflowDefinitionSchema` (default `'L2'`). Documents the intended human oversight tier for governance purposes; orthogonal to the runtime `automationLevel` field on personality body config.
- **`emergencyStopProcedure` field on skills and workflows** — Optional text field (max 1000 chars) surfaced in the Emergency Stop Registry for L4/L5 items. Describes exactly how to disable the item in an emergency.
- **`autonomy_audit_runs` table** (migration `043_autonomy_audit.sql`) — Persisted audit runs with a JSONB `items` array (16 checklist items across four sections: Inventory, Level Assignment Review, Authority & Accountability, Gap Remediation). Each item tracks `status` (`pending | pass | fail | deferred`) and a free-text note.
- **`AutonomyAuditStorage`** (`packages/core/src/security/autonomy-audit.ts`) — `PgBaseStorage` subclass: `createAuditRun`, `updateAuditItem`, `finalizeRun`, `listAuditRuns`, `getAuditRun`, `getOverview`. `getOverview` queries `soul.skills` and `workflow.definitions` and returns items grouped by autonomy level.
- **`AutonomyAuditManager`** — Wraps storage with business logic: deep-clones `DEFAULT_CHECKLIST_ITEMS` on run creation, generates structured Markdown + JSON reports on finalization, `emergencyStop(type, id, actor)` disables the target and records an `autonomy_emergency_stop` audit event (severity: warning).
- **REST API** (`packages/core/src/security/autonomy-routes.ts`) — Seven endpoints at `/api/v1/autonomy/`:
  - `GET /overview` — skills + workflows grouped by autonomy level
  - `GET /audits` — list all runs
  - `POST /audits` — create a run
  - `GET /audits/:id` — get a run
  - `PUT /audits/:id/items/:itemId` — mark an item pass / fail / deferred
  - `POST /audits/:id/finalize` — generate report
  - `POST /emergency-stop/:type/:id` — disable skill or workflow (requires `admin` role)
- **Level escalation warning** — PUT skill or workflow now compares `autonomyLevel` before and after. If the level rises (e.g. L2 → L4), the response includes a `warnings[]` array. The dashboard intercepts this and shows a `ConfirmDialog` before the operator proceeds.
- **Security → Autonomy tab** in `SecurityPage.tsx` — three panels:
  - **Overview panel** — filterable table of all skills and workflows with colour-coded level badges (L1=green → L5=red). Displays emergency stop procedure text.
  - **Audit wizard** — step-through form for Sections A–D. Each item has pass / fail / deferred buttons and a note field. Step 5 finalizes and renders the Markdown report.
  - **Emergency Stop Registry** — L5 items only; red "Emergency Stop" button (disabled unless `role === 'admin'`); confirmation modal before execution.
- **`autonomyLevel` select + `emergencyStopProcedure` textarea** in `SkillsManager.tsx` form — `emergencyStopProcedure` field is revealed only for L4 and L5.
- **`AutonomyAuditManager` lazy getter** in `SecureYeoman` — storage is initialized at Step 2.08; the manager is wired lazily on first `getAutonomyAuditManager()` call (after `soulManager` and `workflowManager` are available).
- **30 unit + route tests** in `packages/core/src/security/autonomy-audit.test.ts` — covers `DEFAULT_CHECKLIST_ITEMS` structure, deep-clone on run creation, `updateAuditItem`, `finalizeRun` report content, `emergencyStop` skill + workflow, and all 7 REST endpoints including 403 for non-admin emergency stop.
- **`docs/guides/ai-autonomy-audit.md`** — Operator guide: framework overview table, level definitions with SecureYeoman examples, step-by-step audit procedure (Sections A–D), escalation warning model, emergency stop setup, quarterly cadence recommendation.
- **`docs/adr/130-ai-autonomy-level-audit.md`** — ADR: Status Accepted; context (Phase 48 governance gap), decision (L1–L5 on skills + workflows + audit run system + dashboard), consequences, alternatives considered.

---

### Phase Tier2-MA.2 — Docker Build Fix

### Fixed

- **`personality-resources.ts` TypeScript cast error** — `(result as Record<string, unknown>)?.personality ?? (result as Record<string, unknown>)` was typed as `{}` by the TypeScript compiler (the `??` expression narrows to `NonNullable<unknown>`), causing `Property 'systemPrompt' does not exist on type '{}'` and breaking `docker compose --profile dev build`. Fixed by splitting into `const raw = result as Record<string, unknown>; const p = (raw.personality ?? raw) as Record<string, unknown>;`
- **Shared package rebuild** — `respectContentSignal` added to `McpServiceConfigSchema` in `packages/shared` requires `npm run build` there before dependent packages (`mcp`, `core`, `dashboard`) can typecheck. The Docker multi-stage build handles this automatically via the workspace build order; documented for local development.

---

### Phase Tier2-MA.1 — Dashboard Type Fixes

### Fixed

- **`allowIntentEditor` missing from all `SecurityPolicy` mocks** — Added `allowIntentEditor: false` to 43 mock objects across 14 test files and the `client.ts` fallback object; eliminates all 53 pre-existing `TS2741` errors
- **`IntentDocEditor.tsx` cast error** — `localDoc as Record<string, unknown>` changed to `localDoc as unknown as Record<string, unknown>` to satisfy TypeScript's strict overlap check between `OrgIntentDoc` and `Record<string, unknown>`
- **`exposeOrgIntentTools` in `PersonalityEditor`** — Added checkbox to the MCP features section (was defined in types but missing from UI); gated by `globalMcpConfig?.exposeOrgIntentTools`
- **`respectContentSignal` global toggle** in ConnectionsPage "Content Negotiation" section — persisted via `PATCH /api/v1/mcp/config`
- **`web_fetch_markdown` gated by `exposeWebScraping`** in both filtering loops in `chat-routes.ts`
- **`McpFeatureConfig` and `McpConfigResponse`** updated with `respectContentSignal: boolean` (default `true`) across `storage.ts`, `mcp-routes.ts`, `types.ts`, `client.ts`
- `tsc --noEmit` now passes with **0 errors** on the dashboard package

---

### Phase 48.6 — Intent Document Editor (Developer Preview)

### Added

- **`IntentDocEditor` component** (`packages/dashboard/src/components/IntentDocEditor.tsx`) — Full field-level CRUD editor for `OrgIntentDoc` documents. Nine section editors with sidebar navigation: Goals, Signals, Data Sources, Authorized Actions, Trade-off Profiles, Hard Boundaries, Policies, Delegation Framework, Context. Each section supports inline add / edit / delete with typed form fields and sliders. Local dirty state tracking with a single "Save All Changes" mutation via `PATCH /api/v1/intent/:id`.
- **`allowIntentEditor` security policy flag** — New boolean flag (default `false`) gating the editor in the dashboard. Wired through `packages/shared/src/types/config.ts` → `secureyeoman.ts` `updateSecurityPolicy()` → `server.ts` GET/PATCH `/api/v1/security/policy` → CLI `policy` command `ALL_POLICY_FLAGS` → `SecurityPolicy` interface in dashboard `client.ts`.
- **PolicyToggle "Intent Document Editor"** in SecuritySettings.tsx Developers section — enables/disables the editor tab. Gated under `allowOrgIntent` (editor only appears when the intent system itself is also enabled).
- **Editor tab in `IntentEditor`** — `editor` added to `IntentTab` union; tab shown only when `allowIntentEditor` is `true`; marked with a `dev` badge. "Edit" button on each intent doc card switches to the editor tab pre-loaded with that doc.

### Fixed

- **Security policy API missing flags** (`packages/core/src/gateway/server.ts`) — `allowNetworkTools`, `allowNetBoxWrite`, `allowTwingate`, and `allowOrgIntent` were not included in the GET `/api/v1/security/policy` response or PATCH body, meaning the dashboard could attempt to read/write them but the server silently discarded the values. All four flags now correctly flow in both directions.
- **Same omission in `secureyeoman.ts`** — `updateSecurityPolicy()` signature and the `persistSecurityPolicyToDb` allowed-keys list were missing the same four flags; corrected as part of the same fix.

---

### Phase Tier2-MA — Markdown for Agents: MCP Content Negotiation

### Added

- **`ContentSignalBlockedError`** — thrown by `safeFetch` when a server responds with `Content-Signal: ai-input=no` and `config.respectContentSignal` is `true`; includes override instruction
- **`parseFrontMatter`** — zero-dependency YAML front matter parser (regex-based, flat key/value)
- **`buildFrontMatter`** — flat key→value front matter serialiser; quotes values containing colons
- **`estimateTokens`** — `Math.ceil(length / 4)` token estimate helper
- **`Accept: text/markdown` negotiation** in `web_scrape_markdown` and `web_fetch_markdown` — requests markdown natively; falls back to `htmlToMarkdown` when server responds with HTML
- **Token count telemetry** — `x-markdown-tokens` response header surfaced as `markdownTokens`; falls back to `estimateTokens`; output includes `*Token estimate: N*` line
- **`Content-Signal: ai-input=no` enforcement** — gated by `MCP_RESPECT_CONTENT_SIGNAL` (default `true`); set `false` to disable
- **`web_fetch_markdown` tool** (tool #7) — lean single-URL markdown fetch; reassembles YAML front matter from upstream metadata + `source` + `tokens`; no proxy, no batch, no selector
- **`yeoman://personalities/{id}/prompt`** MCP resource — personality system prompt as `text/markdown` with YAML front matter (`name`, `description`, `isDefault`, `isArchetype`, `model`, `tokens`)
- **`yeoman://skills/{id}`** MCP resource (`skill-resources.ts`) — skill instructions as `text/markdown` with YAML front matter (`name`, `description`, `source`, `status`, `routing`, `useWhen`, `doNotUseWhen`, `successCriteria`, `tokens`)
- **`respectContentSignal`** field on `McpServiceConfigSchema` (default `true`) and `MCP_RESPECT_CONTENT_SIGNAL` env var in `config.ts`
- ~19 new unit tests across `web-tools.test.ts`, `personality-resources.test.ts`, `skill-resources.test.ts`
- ADR 129: `docs/adr/129-markdown-for-agents-mcp-content-negotiation.md`
- Guide: `docs/guides/markdown-for-agents.md`

---

### Phase 48.2 — Intent Pipeline Enforcement & Dashboard

### Added

- **`PolicySchema`** (`packages/core/src/intent/schema.ts`) — `id`, `rule`, `rego?`, `enforcement: 'warn'|'block'`, `rationale`; stored as JSONB in the existing `org_intents` doc (no migration needed)
- **`policies[]`** field on `OrgIntentDocSchema` — soft-policy layer evaluated after hard boundaries
- **`intent_signal_degraded`** added to `EnforcementEventTypeSchema` — emitted when a monitored signal transitions healthy→warning, healthy→critical, or warning→critical during background refresh
- **`IntentManager.getPermittedMcpTools()`** — returns `Set<string>` of permitted tool names derived from `authorizedActions[].mcpTools`; returns `null` when no restriction applies
- **`IntentManager.getGoalSkillSlugs()`** — returns `Set<string>` of skill slugs from all currently active goals; consumed by `SoulManager` for affinity elevation
- **`IntentManager.checkPolicies(actionDescription, mcpTool?)`** — evaluates `policies[]` using the same deny:/tool: prefix matching as hard boundaries; supports OPA sidecar evaluation via `OPA_ADDR` env + `policy.rego` field with natural-language fallback; logs `policy_warn`/`policy_block` to enforcement log
- **Pipeline enforcement in `ai/chat-routes.ts`** — three ordered gates before each tool dispatch: (1) hard boundary check → blocked tool result + audit event; (2) policy check → warn continues, block halts; (3) authorized tool check → blocks tools not in `authorizedActions[].mcpTools` when any action restricts tools
- **Goal-to-skill affinity** (`soul/manager.ts`) — after `skillsToExpand` is built, skills linked to active goals via `goals[].skills[]` are merged in unconditionally, ensuring full instruction injection regardless of keyword match
- **Signal degradation tracking** in `IntentManager._startSignalRefresh()` — captures prior cache status per signal and logs `intent_signal_degraded` on status regressions
- **Signals tab** in `IntentEditor` dashboard component — live signal cards showing current value, threshold, status badge, and direction icon; auto-refreshes every 60 s
- **Delegation tab** in `IntentEditor` — collapsible view of `delegationFramework.tenants[]` with principle and decision boundaries; read-only
- **Create Intent flow** in `IntentEditor` docs tab — "Create Intent" button opens a modal with a JSON editor pre-filled with a starter template; submits via `POST /api/v1/intent`
- `OrgIntentSignal` and `OrgIntentDelegationTenant` interfaces in dashboard `client.ts` for typed rendering
- Enforcement log filter updated with `intent_signal_degraded` option and colour coding
- **13 new unit tests** in `intent-manager.test.ts` covering `getPermittedMcpTools` (3), `getGoalSkillSlugs` (2), `checkPolicies` (5), signal degradation tracking (2)

---

### Phase 48.1 — Dashboard Type Fixes

### Fixed

- **`SecurityPolicy` mocks** in 15 dashboard test files missing `allowTwingate` (Phase 45) and `allowOrgIntent` (Phase 48) fields — added both as `false` after `allowCommunityGitFetch`
- **`McpConfigResponse`** (`packages/dashboard/src/api/client.ts`) — added `exposeOrgIntentTools: boolean` to interface and default fallback object
- **`PersonalityEditor.tsx`** — renamed local state field `exposeTwingate` → `exposeTwingateTools` to match the backend `McpFeaturesConfig` field name introduced in Phase 45
- **`types.ts`** `mcpFeatures` blocks — added `exposeTwingateTools?: boolean` and `exposeOrgIntentTools?: boolean` to optional `mcpFeatures` in `PersonalityBody` and `PersonalityCreate`; added both as required fields on `McpFeaturesConfig`
- **`ConnectionsPage.test.tsx`** — added `exposeTwingateTools: false` and `exposeOrgIntentTools: false` to `McpConfigResponse` mock; all 15 affected test files now satisfy the full `McpConfigResponse` shape

---

### Phase 48 — Machine Readable Organizational Intent

### Added

- **`OrgIntentSchema`** (`packages/core/src/intent/schema.ts`) — Zod schema for all 8 top-level sections: `goals`, `signals`, `dataSources`, `authorizedActions`, `tradeoffProfiles`, `hardBoundaries`, `delegationFramework`, `context`
- **`IntentStorage`** (`packages/core/src/intent/storage.ts`) — PostgreSQL CRUD for `org_intents` + `intent_enforcement_log` tables
- **`IntentManager`** (`packages/core/src/intent/manager.ts`) — GoalResolver, SignalMonitor (HTTP fetch + TTL cache), TradeoffResolver, DelegationFrameworkResolver, HardBoundaryEnforcer (deny:/tool: rules), AuthorizedActionChecker, `composeSoulContext()` for prompt injection
- **DB migration** `042_org_intent.sql` — `org_intents` + `intent_enforcement_log` tables with indexes; unique partial index enforces single-active constraint
- **REST routes** (`packages/core/src/intent/routes.ts`) — full CRUD (`/api/v1/intent`), activation (`/activate`), signal read (`/signals/:id/value`), enforcement log query
- **`allowOrgIntent: boolean`** to `SecurityConfigSchema` — operator kill switch
- **`intent` config block** to `ConfigSchema` — `filePath` (file-based bootstrap) + `signalRefreshIntervalMs` (default 5 min)
- **Step 2.07** in `SecureYeoman.initialize()` — IntentManager init after DB pool (when `allowOrgIntent: true`)
- **`getIntentManager()`** public getter on `SecureYeoman`
- **Soul prompt injection** — `composeSoulPrompt` appends `## Organizational Goals`, `## Organizational Context`, `## Trade-off Profile`, `## Decision Boundaries` blocks when an active intent doc exists
- **`SoulManager.setIntentManager()`** — wired from SecureYeoman after SoulManager construction
- **`intent_signal_read` MCP tool** (`packages/mcp/src/tools/intent-tools.ts`) — reads live signal value from active intent; gated by `exposeOrgIntentTools` in `McpServiceConfig`
- **`exposeOrgIntentTools: boolean`** to `McpServiceConfigSchema`
- **IntentEditor dashboard component** (`packages/dashboard/src/components/IntentEditor.tsx`) — intent doc list with activate/delete, enforcement log feed with event-type filter
- **Settings → Intent tab** in SettingsPage
- Intent API functions in dashboard API client: `fetchIntents`, `fetchActiveIntent`, `fetchIntent`, `createIntent`, `updateIntent`, `deleteIntent`, `activateIntent`, `fetchEnforcementLog`, `readSignal`
- Audit events: `intent_doc_created`, `intent_doc_activated`
- **53 unit tests** across `intent-schema.test.ts` (16), `intent-manager.test.ts` (25), `intent-routes.test.ts` (18)
- Guide: `docs/guides/organizational-intent.md`

---

### Phase 45 — Twingate Remote MCP Access

### Added

- 13 `twingate_*` MCP tools across two groups: 9 GraphQL tenant management tools and 4 remote MCP proxy tools
- **Tenant management tools**: `twingate_resources_list`, `twingate_resource_get`, `twingate_groups_list`, `twingate_service_accounts_list`, `twingate_service_account_create`, `twingate_service_key_create`, `twingate_service_key_revoke`, `twingate_connectors_list`, `twingate_remote_networks_list` — GraphQL API calls to `https://{network}.twingate.com/api/graphql/`
- **Remote MCP proxy tools**: `twingate_mcp_connect`, `twingate_mcp_list_tools`, `twingate_mcp_call_tool`, `twingate_mcp_disconnect` — JSON-RPC 2.0 proxy to private MCP servers reachable via the Twingate Client tunnel
- `allowTwingate: boolean` to `SecurityConfig` — operator-level kill switch (same pattern as `allowDesktopControl`)
- `exposeTwingate: boolean` to `McpFeaturesSchema` — per-personality toggle
- `exposeTwingateTools`, `twingateNetwork`, `twingateApiKey` to `McpServiceConfigSchema` and `McpFeatureConfig`
- Service key storage via SecretsManager: `TWINGATE_SVC_KEY_{accountId}` — raw token never returned in tool response after storage
- Supplemental audit events: `twingate_key_create`, `twingate_key_revoke` (warning level); `twingate_mcp_tool_call` (info level)
- In-memory MCP proxy session store (`Map<sessionId, ProxySession>`) with 30-minute idle TTL and automatic 5-minute pruning
- Security Settings toggle ("Twingate Remote Access") in dashboard
- Per-personality Twingate checkbox in Personality Editor MCP Features section (disabled with helper text when global toggle is off)
- `TWINGATE_API_KEY`, `TWINGATE_NETWORK`, `MCP_EXPOSE_TWINGATE_TOOLS` env vars documented in `docs/configuration.md`
- ADR 127: `docs/adr/127-twingate-remote-mcp-access.md`
- Guide: `docs/guides/twingate.md` — prerequisites, configuration, workflow, service key lifecycle, troubleshooting
- 19 unit tests in `packages/mcp/src/tools/twingate-tools.test.ts`

---

### Phase 44 — Skill Routing Quality

### Added
- `useWhen` / `doNotUseWhen` on `SkillSchema` — routing intent injected into skill catalog in system prompts
- `successCriteria` on `SkillSchema` — injected at end of skill instructions so model knows when skill is complete
- `mcpToolsAllowed` on `SkillSchema` — restrict available MCP tools per skill (prompt-level enforcement)
- `routing` on `SkillSchema` (`fuzzy` | `explicit`) — explicit mode appends deterministic routing text for SOPs and compliance workflows
- `linkedWorkflowId` on `SkillSchema` — links skill to a workflow for orchestration routing
- `invokedCount` telemetry field — tracks how often the router selects each skill; ratio with `usageCount` = routing precision
- `{{output_dir}}` template variable in skill instructions — expands to `outputs/{skill-slug}/{iso-date}/`
- Credential placeholder enforcement — warns on literal credentials in skill instructions (suggest `$VAR_NAME`)
- Routing precision displayed in Skills Manager dashboard (when `invokedCount > 0`)
- DB migration `041_skill_routing_quality.sql` — 7 new columns on `soul.skills` (all with safe defaults)
- `detectCredentials()` utility exported from `soul-routes.ts`
- `expandOutputDir()` helper in `soul/manager.ts`
- `incrementInvoked()` on `SoulStorage` and `incrementSkillInvoked()` on `SoulManager`
- ADR 127: `docs/adr/127-skill-routing-quality.md`
- Guide: `docs/guides/skill-routing.md`

---


### Docker Build Fixes — Phase 46 Type Integration

#### Fixed

- **`initializeKeyring` signature** (`packages/core/src/config/loader.ts`) — parameter type now includes `'vault'`; vault backend is passed through as `'env'` for keyring init (vault secrets handled separately by `SecretsManager`). Resolves `TS2345` when `security.secretBackend = 'vault'`.

- **`McpFeatureConfig` interface** (`packages/core/src/mcp/storage.ts`) — added Phase 46 network fields: `exposeNetworkTools`, `allowedNetworkTargets`, `netboxUrl?`, `netboxToken?`, `nvdApiKey?`; updated `MCP_CONFIG_DEFAULTS` accordingly. Resolves `TS2339` when `chat-routes.ts` referenced `globalConfig.exposeNetworkTools`.

- **`chat-routes.ts`** — replaced `(globalConfig as Record<string, unknown>).allowNetworkTools` with `globalConfig.exposeNetworkTools` (correct typed field, no cast needed). Resolves `TS2352`.

- **Inline `mcpFeatures` default objects** — added all 6 network flags (`exposeNetworkDevices`, `exposeNetworkDiscovery`, `exposeNetworkAudit`, `exposeNetBox`, `exposeNvd`, `exposeNetworkUtils`) to the fallback literal objects in `soul/manager.ts`, `soul/presets.ts`, and `soul/soul-routes.ts`. Resolves `TS2740` (missing required fields on `McpFeatures`).

---

### Phase 41: Secrets Management + Phase 42: TLS Certificates

#### Added

##### Phase 41 — Unified Secrets Management

- **`SecretsManager`** (`packages/core/src/security/secrets-manager.ts`) — single facade over all secret backends:
  - `env` — read/write to `process.env`
  - `keyring` — delegates to `KeyringManager` (macOS Keychain / Linux Secret Service)
  - `file` — AES-256-GCM `SecretStore`
  - `vault` — OpenBao / HashiCorp Vault KV v2 (see below)
  - `auto` — prefers keyring if available, then file, then env
  - Every write mirrors to `process.env` for backwards-compatible sync `getSecret()` access
- **`VaultBackend`** (`packages/core/src/security/vault-backend.ts`) — OpenBao / Vault KV v2:
  - AppRole authentication (role_id + secret_id → short-lived token)
  - Token cached in memory; auto-refreshed on 403 (token expiry)
  - Static token mode (set `vault.tokenEnv`)
  - Optional namespace header (Vault Enterprise / OpenBao namespaces)
  - `vaultFallback: true` (default) — falls back to env on network failure
- **Config additions** (`packages/shared/src/types/config.ts`):
  - `security.secretBackend` gains `'vault'` option
  - `security.vault` block: `address`, `mount`, `namespace`, `roleIdEnv`, `secretIdEnv`, `tokenEnv`, `fallback`
- **`SecretBackend` type** (`packages/core/src/security/keyring/types.ts`) gains `'vault'`
- **`SecureYeoman` wiring** (`packages/core/src/secureyeoman.ts`):
  - Initializes `SecretsManager` at Step 2.05 (after keyring)
  - Updates `onRotate` callback to persist rotated values via `SecretsManager.set()` (vault/file/keyring)
  - Exposes `getSecretsManager()`, `getRotationManager()`, `getKeyringManager()` public getters
- **REST API** (`/api/v1/secrets`): list key names, check existence, put (create/update), delete
  - Name validation: uppercase alphanumeric/underscore only
  - PUT/DELETE emit `secret_access` audit events
- **Dashboard — Settings → Security → Secrets panel**: list, add (name + value), delete secret keys; values write-only
- **API client** (`packages/dashboard/src/api/client.ts`): `fetchSecretKeys`, `checkSecret`, `setSecret`, `deleteSecret`
- **Guide**: `docs/guides/secrets-management.md`
- **Tests**: 31 unit tests (VaultBackend: 13, SecretsManager: 18)

##### Phase 42 — TLS Certificate Lifecycle

- **`TlsManager`** (`packages/core/src/security/tls-manager.ts`):
  - `ensureCerts()` — returns resolved `{ certPath, keyPath, caPath }` or null (TLS disabled)
  - Auto-generates self-signed dev certs via existing `generateDevCerts()` when `autoGenerate: true` and no cert files are configured; reuses on-disk certs unless expired
  - Detects cert expiry via `openssl x509 -enddate`; re-generates when expired
  - `getCertStatus()` — returns expiry info, `expired`, `expiryWarning` (< 30 days), `autoGenerated` flag
- **Config addition** (`packages/shared/src/types/config.ts`): `gateway.tls.autoGenerate: boolean` (default `false`)
- **`SecureYeoman` wiring**:
  - Initializes `TlsManager` at Step 2.06 (before database)
  - `startGateway()` calls `tlsManager.ensureCerts()` and injects resolved cert paths into gateway config (enables auto-gen flow without modifying original config)
  - Exposes `getTlsManager()` public getter
- **REST API**:
  - `GET /api/v1/security/tls` — cert status (expiry, paths, flags)
  - `POST /api/v1/security/tls/generate` — regenerate self-signed cert (blocked in production)
- **Dashboard — Security overview** `TlsCertStatusCard`:
  - Shows TLS enabled/disabled, valid/expiring/expired state, days remaining
  - Regenerate button for self-signed certs
- **API client**: `fetchTlsStatus`, `generateTlsCert`, `TlsCertStatus` interface
- **Guide**: `docs/guides/tls-certificates.md`
- **Tests**: 12 unit tests (TlsManager: 12)

---

### Phase 46 — Network Evaluation & Protection (YeomanMCP)

#### Added

37 new MCP tools in 6 fine-selectable toolsets, each controlled by a per-personality `mcpFeatures` flag AND a global `security.allowNetworkTools` operator gate (same AND logic as `exposeWebScraping`/`exposeWebSearch`).

**Toolsets:**

- **`exposeNetworkDevices`** (46.1) — SSH device automation via `ssh2`: `network_device_connect`, `network_show_command`, `network_config_push` (dry-run supported), `network_health_check`, `network_ping_test`, `network_traceroute`. Active tools enforce `MCP_ALLOWED_NETWORK_TARGETS` scope.

- **`exposeNetworkDiscovery`** (46.2 + 46.3) — CDP/LLDP discovery and routing/switching analysis: `network_discovery_cdp`, `network_discovery_lldp`, `network_topology_build` (recursive + Mermaid output), `network_arp_table`, `network_mac_table`, `network_routing_table`, `network_ospf_neighbors`, `network_ospf_lsdb`, `network_bgp_peers`, `network_interface_status`, `network_vlan_list`.

- **`exposeNetworkAudit`** (46.4) — Security auditing: `network_acl_audit`, `network_aaa_status`, `network_port_security`, `network_stp_status`, `network_software_version`.

- **`exposeNetBox`** (46.5) — NetBox source-of-truth integration via plain `fetch()`: `netbox_devices_list`, `netbox_interfaces_list`, `netbox_ipam_ips`, `netbox_cables`, `netbox_reconcile` (live CDP vs NetBox drift report). Read-only by default; `allowNetBoxWrite` gate for future write operations.

- **`exposeNvd`** (46.6) — NVD CVE database via REST API v2.0: `nvd_cve_search`, `nvd_cve_by_software` (CPE match for IOS version strings), `nvd_cve_get`. `NVD_API_KEY` optional; surfaced rate-limit errors guide users to the key registration page.

- **`exposeNetworkUtils`** (46.7 + 46.8) — `subnet_calculator`, `subnet_vlsm` (VLSM planning), `wildcard_mask_calc` (pure computation, no deps); `pcap_upload`, `pcap_protocol_hierarchy`, `pcap_conversations`, `pcap_dns_queries`, `pcap_http_requests` (tshark system binary; detected at startup with graceful "not installed" error).

**New shared types:**
- `McpFeaturesSchema` gains 6 network flags (all `default(false)`)
- `SecurityConfigSchema` gains `allowNetworkTools` and `allowNetBoxWrite` (both `default(false)`)
- `McpServiceConfigSchema` gains `exposeNetworkTools`, `allowedNetworkTargets`, `netboxUrl`, `netboxToken`, `nvdApiKey`

**New env vars:** `MCP_EXPOSE_NETWORK_TOOLS`, `MCP_ALLOWED_NETWORK_TARGETS`, `NETBOX_URL`, `NETBOX_TOKEN`, `NVD_API_KEY`

**Dependencies:** `ssh2` added to `optionalDependencies` in `packages/mcp`

**Docs:** `docs/guides/network-tools.md`, `docs/adr/126-network-evaluation-protection.md`, `docs/configuration.md` updated with all new env vars.

---

### Metrics — Active Agents Count + Heartbeat Multi-Personality Badges

#### Fixed

- **"Active Agents" stat card now shows enabled personalities + live sub-agent delegations** — The card value is the sum of `isActive` personalities and any currently running `activeDelegations`. The subtitle shows `"Default Name · N sub-agents"` when delegations are running, or `"N souls · N sub-agents"` when no default is set, collapsing to just the default name when no delegations are active. Clicking navigates to `/personality`.

- **Heartbeat tasks only tagged one personality** — `GET /api/v1/brain/heartbeat/tasks` called `soulManager.getActivePersonality()` (the `is_default` row only) and stamped every task with that single personality's id/name. With multiple enabled personalities the extras were invisible. The endpoint now calls `getEnabledPersonalities()` and `getActivePersonality()` in parallel, deduplicates by id, and attaches the full set as a `personalities: [{ id, name }]` array on each task. The legacy `personalityId` / `personalityName` fields are kept for backwards compatibility (pointing at the default personality).

- **`HeartbeatTaskCard` (SecurityPage) renders a badge per personality** — The task card now iterates `task.personalities[]` and renders a distinct `primary/10` badge for each name. Falls back gracefully to the legacy `personalityName` field when talking to an older backend.

#### Types

- `HeartbeatTask` in `types.ts` gains `personalities?: { id: string; name: string }[]`; legacy fields annotated `@deprecated`.

---

### Soul — Clearable Default, Chat Fallback, and Empty State

#### Added

- **`POST /api/v1/soul/personalities/clear-default`** — new route that removes the default flag from all personalities without activating a replacement. Complements the existing `set-default` route. RBAC: inherited from soul routes. If a heartbeat schedule was tied to the default personality, it is cleared.

- **`SoulStorage.clearDefaultPersonality()`** — single-query UPDATE that sets `is_default = false` for any personality that currently holds the flag.

- **`SoulManager.clearDefaultPersonality()`** — delegates to storage and additionally calls `heartbeat.setPersonalitySchedule(null)` so the heartbeat loop no longer references a now-default-less personality.

- **`clearDefaultPersonality()` API client function** — dashboard `POST /soul/personalities/clear-default` thin wrapper, consistent with other soul mutations.

- **Chat and EditorChat — alphabetical fallback when no default is set** — `ChatPage` and `EditorPage` previously resolved `undefined` when no personality carried `isDefault = true`, producing a blank selector with no active personality. Both pages now fall back to the alphabetically first personality when no default exists, so the UI always has something loaded without requiring the user to manually select one.

- **Chat and EditorChat — "no personalities" empty state** — when `fetchPersonalities` resolves but returns an empty list (i.e., the user skipped or cleared onboarding), the message area now displays a friendly prompt with a direct link to `/personality` instead of the generic start-conversation hint.

#### Fixed

- **PersonalityEditor — default toggle was locked ON** — the toggle for "Set as default" was unconditionally `disabled` whenever the editing personality already had `isDefault = true`. Users had no way to clear the default without deleting the personality. The lock has been removed: the toggle is now always enabled and fires `clearDefaultPersonality()` when unchecked (or `setDefaultPersonality()` when checked), exactly like any other toggle mutation.

- **PersonalityEditor — new personality "Set as default" not applied on save** — the `createMut.onSuccess` callback called `setEditing(null)` immediately without checking `setActiveOnSave`. If the user ticked "Set as default" before creating a personality, the flag was silently dropped. The callback now calls `setDefaultMut.mutate(result.personality.id)` when `setActiveOnSave` is true before clearing state.

- **SettingsPage — default star is now a toggle button** — the filled star indicator next to the default personality in the soul list was a non-interactive `<span>`. It is now a `<button>` that calls `clearDefaultPersonality()` when clicked, matching the affordance of the empty-star buttons on other personalities which call `setDefaultPersonality()`.

#### Tests

- `soul-routes.test.ts` — added `clearDefaultPersonality` to mock manager; added route test for `POST /api/v1/soul/personalities/clear-default`
- `storage.test.ts` — added `clearDefaultPersonality` test; fixed `setActivePersonality` mock count (transaction now runs 3 internal queries, not 2, because `is_default` is also cleared); fixed `deletePersonality` mock to include the preceding `getPersonality` SELECT used for archetype guard
- `PersonalityEditor.test.tsx` — corrected "Enable all resources" → "Enable all orchestration" to match actual `aria-label`; added `aria-label="Default personality"` to the sr-only checkbox; added 3 new default-toggle tests
- `SettingsPage.test.tsx` — updated learningMode assertion from obsolete `'observe, suggest'` text to `'User Authored'`; changed `maxSkills`/`maxPromptTokens` assertions from `getByText` to `getByDisplayValue` (values live in `<input>` fields, not text nodes)

---

### CLI — Lazy Loading, Env-Var URL, and Route Fix

#### Changed

- **All CLI commands now lazy-loaded** — `cli.ts` previously imported all 25+ command modules at startup, pulling in the entire application (including `createSecureYeoman`, `TuiRenderer`, browser automation, etc.) regardless of which command was invoked. Commands are now registered with `router.registerLazy()` and their module is only `import()`-ed when that specific command runs. Running lightweight commands like `secureyeoman health` or `secureyeoman status` no longer loads the full gateway stack.

- **`router.ts` — `LazyCommand` interface + `registerLazy()` method** — the router now accepts lazy command registrations that carry only metadata (name, aliases, description, usage). A thin wrapper `Command` is stored in the registry; the real module is imported on first `.run()` call.

- **`defaultBaseUrl()` helper in `cli/utils.ts`** — all commands can now read the `SECUREYEOMAN_URL` environment variable as the default server address instead of using the hardcoded `http://127.0.0.1:3000`. Useful for scripting against non-default hosts without passing `--url` on every invocation.

#### Fixed

- **`role` command — inconsistent base URL** — `role.ts` was using `http://localhost:18789/api/v1` as its base URL (port 18789, with the `/api/v1` path prefix baked in), differing from every other command (port 3000, root base). All `apiCall` paths have been updated to include the full `/api/v1/` prefix and the command now uses `defaultBaseUrl()` for consistency.

---

### Settings — UI Polish and Container Fix

#### Fixed

- **Soul config save — "Not found" error** — `docker compose --profile dev build` rebuilds the image but leaves old containers running. Containers are now force-recreated (`up -d --force-recreate`) after builds so the new `PATCH /api/v1/soul/config` route is actually served.

- **Save error banner visibility in dark mode** — the inline error on the Soul System card was a plain `text-destructive` text line, nearly invisible on dark backgrounds. Replaced with a banner that has `bg-destructive/10` fill, `border-destructive/40` border, and a `✕` icon glyph for clear visibility in both themes.

---

### Soul Config — Runtime Editable via Settings > General

#### Added

- **Soul config is now persisted and editable at runtime** — previously, `enabled`, `learningMode`, `maxSkills`, and `maxPromptTokens` were read-only (loaded from YAML at startup with no write path). Changes now survive restarts via the `soul.meta` table.

- **`PATCH /api/v1/soul/config`** — new endpoint accepts any subset of the four fields, validates with zod, updates the in-memory config, and persists the merged result. RBAC: `soul:write`.

- **Storage persistence** (`soul/storage.ts`):
  - `getSoulConfigOverrides()` — reads key `soul_config` from `soul.meta`, JSON-parses, returns `{}` if missing or malformed
  - `setSoulConfigOverrides(overrides)` — upserts key `soul_config` with JSON value; no migration needed (`soul.meta` already exists)

- **Manager override lifecycle** (`soul/manager.ts`):
  - `loadConfigOverrides()` — called at startup, merges DB overrides over the file-baseline: `this.config = { ...this.baseConfig, ...overrides }`
  - `updateConfig(patch)` — validates the merged config via `SoulConfigSchema.parse()`, updates in-memory config, persists full config to DB
  - `baseConfig` (readonly) stores the original YAML config so `loadConfigOverrides` always merges on top of a clean baseline

- **Dashboard — Settings > General → Soul System card is now a form**:
  - Toggle switch for `enabled`
  - Three checkboxes for learning modes: User Authored / AI Proposed / Autonomous
  - Number input for `maxSkills` (1–200)
  - Number input for `maxPromptTokens` (1024–32000 tokens, step 1024)
  - Save button with loading state (`useMutation`) and inline error display

#### Changed

- **`SoulConfig` defaults bumped** (schema defaults only; existing deployments with YAML overrides are unaffected):
  - `maxSkills`: 50 → **100**
  - `maxPromptTokens`: 16000 → **32000**

#### Fixed

- **Dashboard TS error in `ChatPage` / `EditorPage`** — `title` prop passed directly to a Lucide `<Star>` icon (not a valid prop on Lucide SVG components). Wrapped in `<span title="...">` instead.

---

### Chat UI — Phase Separation + Persistence

#### Changed

- **Chat messages now show three visually distinct phases** in both `ChatPage` and `EditorPage` (and their historical message records):
  - **Phase 1 — Thinking**: `ThinkingBlock` (collapsible, auto-open while live, auto-close on completion)
  - **Phase 2 — Tools used**: `Wrench` icon section with grey tool-call badges + primary-coloured creation sparkle cards; thin `border-t` divider after thinking
  - **Phase 3 — Response**: `ChatMarkdown` / streaming text; thin `border-t` divider after thinking or tools
  - Creation events (sparkle cards) moved **before** the response text — tools run before the response, and the display now reflects that ordering

- **Tool call badges persist in historical messages** — previously the animated "Using tools" badges cleared after streaming completed and were invisible in history. Tool calls are now:
  - Accumulated client-side into `completedToolCalls` during streaming
  - Included in the `done`-event message stored in `messages` state
  - Saved to DB via new `tool_calls_json JSONB` column (migration `039_message_thinking_tools.sql`)
  - Restored as grey (non-animated) badges when a conversation is reloaded

- **Thinking content persists in historical messages** — `thinkingContent` was always sent in the `done` SSE event but never written to the DB, so it disappeared after a page reload. Now saved to `thinking_content TEXT` column (same migration `039`) and restored on conversation load.

- **Delegation sparkle badge enriched** — `delegate_task` streaming badge now shows `"Delegation → {profile}: {task…}"` (first 50 chars of task) instead of the generic `"Delegation"` label. Applied in the streaming path of `chat-routes.ts`.

#### Fixed

- Phase 3 `border-t` divider now also fires when `toolCalls` exist but `creationEvents` do not (divider was previously conditional on `creationEvents` only).

### Sub-Agent Token Budget

#### Fixed

- **Token budget exhaustion on every delegation** — AI was consistently specifying low values (`maxTokenBudget: 8000–10000`) based on misleading tool description guidance ("typical tasks need 5,000–20,000 tokens"). Two-part fix:
  - `delegate_task` tool description in `agents/tools.ts` rewritten: "Leave unset (strongly recommended) — most tasks require 30,000–80,000 tokens to complete properly; values below 20,000 almost always cause premature termination."
  - Hard minimum floor of 20,000 tokens added in `SubAgentManager.delegate()` — `Math.max(20_000, Math.min(...))` — prevents any AI-specified value below 20k from taking effect regardless of what the model passes.

### Soul — Multi-Active Agents, Default Personality, Archetype Protection, Active-Hours Indicator

#### Added

- **Multi-active agents** — `is_active` is now non-exclusive; multiple personalities can be running simultaneously. New endpoints:
  - `POST /api/v1/soul/personalities/:id/enable` — additively marks a personality active without touching others
  - `POST /api/v1/soul/personalities/:id/disable` — removes a personality from the active set
  - Corresponding `SoulManager.enablePersonality()` / `disablePersonality()` + `SoulStorage` methods

- **Default chat personality (`is_default`)** — a new exclusive flag replaces `is_active` as the single "dashboard/new-chat" personality. New endpoint:
  - `POST /api/v1/soul/personalities/:id/set-default` — atomically moves the default flag; also updates the heartbeat schedule
  - `getActivePersonality()` (storage + manager) now queries `WHERE is_default = true`
  - Migration copies the current `is_active = true` row to `is_default = true` so existing deployments need no manual intervention

- **Archetype protection (`is_archetype`)** — preset-seeded personalities gain `is_archetype = true`. Deletion is blocked at both the storage layer and the manager layer regardless of `deletionMode`. Error: `"Cannot delete a system archetype personality."` Seeds updated: `seedAvailablePresets()` and `createDefaultPersonality()` now pass `{ isArchetype: true }` to storage.

- **Active-hours indicator (`isWithinActiveHours`)** — a computed boolean injected by the API layer (not stored) on all personality responses:
  - `GET /api/v1/soul/personality` and `GET /api/v1/soul/personalities` both include `isWithinActiveHours`
  - `POST /activate` and `POST /set-default` responses also include it
  - Logic: exported helper `isPersonalityWithinActiveHours(p)` in `manager.ts` checks timezone-aware day-of-week and HH:MM window against `body.activeHours`; returns `false` when `activeHours.enabled` is `false`

#### Migration

- `040_personality_multi_active.sql` — `ALTER TABLE soul.personalities ADD COLUMN IF NOT EXISTS is_default BOOLEAN NOT NULL DEFAULT false, ADD COLUMN IF NOT EXISTS is_archetype BOOLEAN NOT NULL DEFAULT false; UPDATE ... SET is_default = true WHERE is_active = true`
- `039_message_thinking_tools.sql` — added to migration manifest (was previously implemented but omitted)

### Soul — Per-Personality Prompt Budget

#### Added

- **Per-personality prompt token budget** — souls can now override the global `maxPromptTokens` server config with their own value. When set, the per-soul budget controls how many tokens are reserved for that soul's composed system prompt (identity, skills, active-hours context). Falls back to the global default when not set.
  - `BodyConfigSchema` in `packages/shared/src/types/soul.ts` gains `maxPromptTokens?: number` (range 1,024–32,000); stored in the existing `body` JSONB column — no migration required
  - `SoulManager.composeSystemPrompt()` resolves the budget as `personality?.body?.maxPromptTokens ?? this.config.maxPromptTokens`
  - `Personality` and `PersonalityCreate` body types in `packages/dashboard/src/types.ts` updated to include `maxPromptTokens?: number`

### Dashboard — Settings General + Soul Edit

#### Changed

- **Agent card removed from Settings > General** — agent name is now managed within the soul edit/create view in the Personality editor, not in Settings.

- **Soul System card** — "Max Prompt Tokens" renamed to "Default Prompt Budget" with subtitle "overridable per soul"; "Max Skills" gains subtitle "global limit across all souls" to clarify that both values are server-config defaults, not per-soul limits.

- **Active Souls — schedule badges corrected**:
  - Active souls with **no active hours configured** now show an `Always On` badge (green, `Zap` icon) instead of nothing
  - Active souls with active hours configured but currently **outside the window** show `Off-hours` (amber, `Clock` icon) — previously this badge fired for both cases

- **Active Souls — per-soul token budget badge** — souls with a custom `body.maxPromptTokens` that differs from the global default now show a compact token count badge (e.g. `24,000 tkns`) in their row

#### Added

- **Prompt Budget section in PersonalityEditor — Brain tab** — new collapsible "Prompt Budget" section (between Active Hours and Extended Thinking):
  - Checkbox: "Override global prompt budget" — when unchecked shows "Using global default (X tokens)"
  - When checked: range slider 1,024–32,000 tokens (step 256) with live token count label
  - Value saved into `body.maxPromptTokens`; cleared (`undefined`) when override is disabled
  - Global default fetched from `GET /soul/config` and shown as reference

### Dashboard — PersonalityEditor Multi-Active UI

#### Changed

- **Personality list card badges** — each card now shows a distinct set of status badges:
  - `Active` (green) — personality is in the active set (`is_active`)
  - `Default` (star, primary) — the new-chat / dashboard default (`is_default`)
  - `Online` (pulsing green dot) — currently within active hours (`isWithinActiveHours`)
  - `Preset` (muted) — system archetype, shown instead of allowing deletion (`isArchetype`)

- **Action buttons replaced** — `CheckCircle2` activate button split into two independent controls:
  - `Star` button — set a personality as default; filled/primary when already default
  - `Power` button — toggle enable/disable for non-default personalities; grayed out (non-interactive) when personality is default (default is always on)

- **Card highlight keyed to `isDefault`** — primary border + ring previously tracked `isActive`; now tracks `isDefault` to visually identify the dashboard personality.

- **Editor form "Default personality" toggle** — replaces the old "Set as active personality on save" footer checkbox. For new personalities: sets `setActiveOnSave`; for existing: immediately calls `POST /set-default`. Editor header shows the personality's name (instead of generic "Edit Personality") and a star subtitle when editing the default.

- **Delete button guards** — `disabled` condition updated from `isActive` to `isDefault || isArchetype`; tooltip and aria-label distinguish archetype ("System preset — cannot be deleted") from default ("Switch to another personality before deleting"). Archetype guard fires before deletion-mode check.

- **`setActiveOnSave` reset on cancel** — clicking Cancel in the editor now resets the flag, preventing a stale "set active" intent from carrying over to the next opened personality.

#### Added

- `enablePersonality(id)`, `disablePersonality(id)`, `setDefaultPersonality(id)` — new API client functions in `packages/dashboard/src/api/client.ts`; wired to `useMutation` hooks in `PersonalityEditor`.
- `isDefault`, `isArchetype`, `isWithinActiveHours` fields added to the `Personality` type in `packages/dashboard/src/types.ts`.

---

## [2026.2.23]

### Phase 43 — Sub-Agent UX + Bug Fixes

#### Fixed

- **MCP tool callthrough — all YEOMAN MCP tools now execute in the direct chat interface**
  Previously `McpClientManager.callTool()` was a stub returning `{ result: "Tool X called with args", args }` — every call from the AI in the chat interface returned a silent fake acknowledgment instead of executing the tool. Root cause: no call path existed from core → YEOMAN MCP server for tool dispatch.

  Full fix implemented across four layers:
  - **`packages/mcp/src/tools/tool-utils.ts`** — `wrapToolHandler()` now populates a `globalToolRegistry` module-level `Map<string, handler>` alongside every `server.registerTool()` call. Handlers in the registry are the fully-wrapped versions (rate-limiting, audit logging, secret redaction included).
  - **`packages/mcp/src/server.ts`** — new `POST /api/v1/internal/tool-call` endpoint on the YEOMAN MCP server. Authenticates with the same `ProxyAuth` JWT. Looks up the tool name in `globalToolRegistry` and calls the handler directly — bypasses the MCP JSON-RPC protocol overhead (no `initialize` handshake required). Returns the `ToolResult` content block.
  - **`packages/core/src/mcp/client.ts`** — `callTool()` implemented: mints a short-lived service JWT (`jose`, HS256, 5 min expiry), fetches `{server.url}/api/v1/internal/tool-call`, throws on non-2xx. `tokenSecret` added to `McpClientManagerDeps` and passed from `secureyeoman.ts`.
  - **`MCP_ADVERTISE_URL`** — auto-registration was storing `http://0.0.0.0:3001` as the YEOMAN MCP server's URL (the bind address, not the reachable address). Added `MCP_ADVERTISE_URL` env var (`McpServiceConfig.advertiseUrl`) used in `auto-register.ts` for the registered URL. Set to `http://mcp:3001` in `docker-compose.yml` and `http://127.0.0.1:3001` in `.env.dev`. Upsert in `POST /api/v1/mcp/servers` now updates the URL field on re-registration (`McpStorage.updateServerUrl()`).

- **`diag_ping_integrations` — now reports actual MCP server connectivity**
  Previously returned only `{ id, type: 'mcp_server' }` — no health check, no tool count, no URL. Now returns `{ id, type, toolCount, reachable, url, latencyMs }` per selected MCP server. Health check: `GET {url}/health` with 3s timeout via `AbortSignal.timeout`. `McpClientManager` passed into `DiagnosticRoutesOptions`.

- **Sub-agent schema error (`tools.X.custom.input_schema.type` issue)** — MCP tools with empty `inputSchema: {}` lost the required `type: "object"` property when passed to the Anthropic API. Fixed in `agents/manager.ts` and both streaming + non-streaming paths in `chat-routes.ts`: if `raw.type` is absent, schema is normalised to `{ type: 'object', properties: {}, ...raw }`.

- **`delegate_task` label showing tool name instead of task content** — name resolution in `chat-routes.ts` used `args.name` but `delegate_task` stores the task description in `args.task`. Fixed: fallback chain now includes `args.task` before `toolCall.name` in both streaming and non-streaming paths.

- **Token budget exhaustion ("1000 tokens")** — `delegate_task` tool description gave no budget guidance; AI consistently picked `maxTokenBudget: 1000`. Description in `agents/tools.ts` rewritten: states system default is 50,000 tokens, typical tasks need 5,000–20,000, and values below 3,000 risk incomplete results.

- **`SubAgentManager` null after runtime toggle** — `updateSecurityPolicy({ allowSubAgents: true })` updated the config flag but left `subAgentManager` null (it was only initialised at startup). Extracted `bootDelegationChain()` private method; called at startup and lazily from `updateSecurityPolicy()` when `allowSubAgents` transitions to `true` and the manager is absent.

- **YEOMAN MCP tools not appearing in direct chat function interface** — `selectedServers.length > 0` gate in `chat-routes.ts` blocked all YEOMAN MCP tool injection when the personality had no external servers configured. Fixed: YEOMAN MCP tools (identified by `serverName === 'YEOMAN MCP'`) are always injected when `body.enabled` is true, filtered only by `mcpFeatures` flags (git, fs, web, browser, desktop gates). External server tools still require `selectedServers`. Applied to both streaming and non-streaming code paths.

#### Changed

- **SecuritySettings — one-click Sub-Agent Delegation provision** — toggling the Sub-Agents security policy on now also enables `agentConfig.enabled` in the same click if delegation config is currently off. Eliminates the two-step "enable policy → enable delegation" flow. "Delegation is active" confirmation badge shown when both are on.

- **PersonalityEditor — delegation status card** — when the `subAgents` capability is toggled on, a status card appears below it: green "Delegation is ready" when the security policy allows it, amber warning with a link to Security Settings when `allowSubAgents` is false.

---

### Changed

- **Proactive triggers** — removed green background on enabled trigger rows; state is now communicated entirely by the active button color. Enable Assistance and Learning rows also no longer turn green when on.
- **Approval mode color coding** (Proactive triggers + Deletion): Auto → green, Suggest → amber, Manual → blue.
- **Automation Level color coding**: Supervised → green, Semi-Auto → amber, Full Manual → blue.
- **Emergency Stop button** — removed box wrapper; now an inline row matching Deletion/Automation style. Button is always solid red (white text) — active state shows "⏹ Stop Active", inactive shows "⏹ Emergency Stop".
- **Resources — enable all toggle labels** — "All enabled" text label added alongside the mini toggle in Creation and Orchestration section headers so the control is self-explanatory.
- **Resources — Creation/Orchestration toggle-all bug fixed** — "Enable all" in the Creation section was incorrectly setting `subAgents` (an Orchestration key), causing the Orchestration toggle to appear linked. Fixed: Creation toggle only affects creation keys; Orchestration toggle now correctly covers `subAgents`, `workflows`, `allowDynamicTools`, `allowA2A`, and `allowSwarms`.

### Resources Section UI Improvements

#### Changed

- **Resources — per-section enable toggles** — removed the global "All enabled / Enable all" toggle from the Resources section header. The Creation and Orchestration CollapsibleSections now each have their own small toggle in their header row (click the section label area to expand/collapse; click the toggle to enable/disable all items in that section without affecting the other). `CollapsibleSection` updated to accept an optional `headerRight` slot rendered with `stopPropagation` so the toggle and the expand chevron don't interfere.

### Proactive + Resources UI Redesign

#### Changed

- **Proactive built-in triggers — per-item approval mode** — removed the shared global "Approval Mode" selector. Each built-in trigger (Daily Standup, Weekly Summary, etc.) now has its own 3-phase inline button: `Auto | Suggest | Manual`. Clicking the active mode deactivates the trigger; clicking any inactive mode activates it with that mode. Per-item modes persist via new `builtinModes` field added to `ProactivePersonalityConfigSchema`.
- **Deletion + Automation Level — inline 3-segment controls** — replaced the CollapsibleSection + radio-group pattern with always-visible segmented button rows. Deletion shows `Auto | Suggest | Manual`; Automation shows `Supervised | Semi-Auto | Full Manual`. The description line updates inline to reflect the active selection.
- **Emergency Stop — prominent red button** — replaced the CollapsibleSection + checkbox with a flat inline card. When inactive it shows a neutral "⏹ Emergency Stop" button (red hover); when active the whole row is red with a "⏹ Stop Active" button.
- **`ProactivePersonalityConfigSchema`** — removed `approvalMode` (global); added `builtinModes` object with per-trigger defaults matching each trigger's natural mode (`dailyStandup: auto`, `weeklySummary: suggest`, etc.). All default objects in `manager.ts`, `presets.ts`, `soul-routes.ts`, `storage.ts`, and test fixtures updated.

### Persistence Bug Fixes + UI Toggles

#### Fixed

- **Diagnostics capability not persisting** — `diagnostics` was missing from all three `enabledCaps` state initialisations in `PersonalityEditor.tsx` (initial state, load-from-personality, and reset). Editing a personality and saving with Diagnostics enabled now survives a page refresh.
- **Delegate Tasks setting not persisting on restart** — `SubAgentManager.setEnabled()` was runtime-only and never written to the database. Added `getStoredEnabled()` / `storeEnabled()` to `SubAgentStorage` using the `system_preferences` table (key: `agents.delegation.enabled`). On startup, `initialize()` now restores the persisted value; on toggle, the value is written to DB before the response is returned.

#### Changed

- **Archetypes checkbox → toggle switch** — Morphogenesis (formerly "Include Sacred Archetypes") in the Soul — Essence section of the personality editor converted from a plain `<input type="checkbox">` to the standard inline toggle style used throughout the editor.
- **Deletion protection surfaced at Soul level** — Ontostasis (formerly "Protect from deletion") toggle added directly in the Soul — Essence section (no need to open Body → Resources → Deletion). Maps `deletionMode: 'manual'` (on) / `'auto'` (off). The detailed radio group in the Body section is retained for fine-grained control.

### Multi-Provider TTS/STT Expansion

#### Features

**10 TTS providers, 7 STT providers — all detected at runtime, only connected providers shown**

| Provider | TTS | STT | Auth |
|---|---|---|---|
| OpenAI | ✓ | ✓ (Whisper) | `OPENAI_API_KEY` |
| Voicebox (local) | ✓ | ✓ | `VOICEBOX_URL` reachable |
| ElevenLabs | ✓ | ✓ (Scribe v2) | `ELEVENLABS_API_KEY` |
| Deepgram | ✓ (Aura-2) | ✓ (Nova-3) | `DEEPGRAM_API_KEY` |
| Cartesia | ✓ (Sonic-3) | — | `CARTESIA_API_KEY` |
| Google Cloud | ✓ (Neural2) | ✓ (latest_long) | `GOOGLE_API_KEY` |
| Azure AI Speech | ✓ | ✓ | `SPEECH_KEY` + `SPEECH_REGION` |
| Play.ht | ✓ (Play3.0-mini) | — | `PLAYHT_API_KEY` + `PLAYHT_USER_ID` |
| OpenedAI Speech (local) | ✓ | — | `OPENEDAI_SPEECH_URL` reachable |
| Kokoro (local, ONNX) | ✓ | — | `kokoro-js` package installed |
| AssemblyAI | — | ✓ (Universal-2) | `ASSEMBLYAI_API_KEY` |

- **`detectAvailableProviders()`** now returns `metadata: Record<string, { label, category }>` so the dashboard can display human-readable names and group providers by local vs cloud
- **`sanitizeErrorMessage()`** expanded to redact `sk_…` (ElevenLabs) and `Token …` (Deepgram) patterns
- **Dashboard `ProviderSection`** redesigned: shows only connected providers (not greyed-out unconfigured), splits cloud and local rows with a `local` label; no more ghost badges
- All implementations use `fetch()` REST calls — no new required npm packages; `kokoro-js` remains optional

#### Environment variables added

| Var | Purpose |
|---|---|
| `ELEVENLABS_API_KEY` | ElevenLabs TTS + STT |
| `ELEVENLABS_VOICE_ID` | Default ElevenLabs voice (optional, default: Rachel) |
| `ELEVENLABS_MODEL` | ElevenLabs TTS model (optional, default: `eleven_multilingual_v2`) |
| `ELEVENLABS_STT_MODEL` | ElevenLabs STT model (optional, default: `scribe_v2`) |
| `DEEPGRAM_API_KEY` | Deepgram TTS + STT |
| `DEEPGRAM_TTS_MODEL` | Deepgram TTS voice (optional, default: `aura-2-thalia-en`) |
| `DEEPGRAM_STT_MODEL` | Deepgram STT model (optional, default: `nova-3`) |
| `CARTESIA_API_KEY` | Cartesia TTS |
| `CARTESIA_VOICE_ID` | Cartesia voice UUID (optional, has default) |
| `CARTESIA_MODEL` | Cartesia model (optional, default: `sonic-3`) |
| `GOOGLE_API_KEY` | Google Cloud TTS + STT (shared with Gemini vision) |
| `GOOGLE_TTS_VOICE` | Google TTS voice name (optional, default: `en-US-Neural2-C`) |
| `GOOGLE_STT_MODEL` | Google STT model (optional, default: `latest_long`) |
| `SPEECH_KEY` | Azure AI Speech TTS + STT |
| `SPEECH_REGION` | Azure region (e.g. `eastus`) |
| `AZURE_TTS_VOICE` | Azure voice name (optional, default: `en-US-AvaMultilingualNeural`) |
| `PLAYHT_API_KEY` | Play.ht TTS |
| `PLAYHT_USER_ID` | Play.ht user ID |
| `PLAYHT_VOICE` | Play.ht voice S3 URL (optional, has default) |
| `OPENEDAI_SPEECH_URL` | OpenedAI Speech local server URL |
| `KOKORO_VOICE` | Kokoro voice name (optional, default: `af_heart`) |
| `ASSEMBLYAI_API_KEY` | AssemblyAI STT |

### exposeDesktopControl MCP Feature Toggle

#### Features

**Three-level Remote Desktop Control gate in Yeoman MCP**

- `McpServiceConfig.exposeDesktopControl` (default `false`) — MCP service-level toggle; all `desktop_*` tool handlers wrapped in `desktopHandler()` closure that returns a `not enabled` error when the toggle is off. Mirrors the `exposeBrowser` pattern in browser-tools.ts.
- `McpFeaturesSchema.exposeDesktopControl` — per-personality toggle in `packages/shared/src/types/soul.ts`, following the same schema pattern as `exposeBrowser`.
- **ConnectionsPage** — Remote Desktop Control row in Feature Toggles grid. Toggle is locked (disabled, opacity-50) when `SecurityPolicy.allowDesktopControl` is false — the env-level gate propagated from Security Settings.
- **PersonalityEditor** — Remote Desktop Control per-personality toggle in the Yeoman MCP features section, after Browser Automation. Disabled with "enable in Connections first" hint when the global MCP config toggle is off.
- **`McpFeatureConfig` (storage)** — `exposeDesktopControl` field added to `packages/core/src/mcp/storage.ts` type, defaults, and `PATCH /api/v1/mcp/config` body schema so the toggle is correctly persisted to the DB.
- **Tools list filter** — `desktop_*` tools hidden from `GET /api/v1/mcp/tools` when `exposeDesktopControl` is false, matching the `browser_*` filter pattern.

#### Fixes

- `packages/core/src/mcp/storage.ts` — `exposeDesktopControl` was missing from `McpFeatureConfig` interface and `MCP_CONFIG_DEFAULTS`, causing the toggle to silently fail to save.
- `packages/core/src/mcp/mcp-routes.ts` — `exposeDesktopControl` was absent from the `PATCH /api/v1/mcp/config` body type, so the field was dropped before reaching storage.

#### Tests

- `packages/mcp/src/tools/desktop-tools.test.ts` — complete rewrite: 31 tests covering tool registration (all 14 names), `exposeDesktopControl=false` gate (parametric across all tools), per-tool API endpoint routing, and audit logger wiring. Uses `createMockServer()` handler capture pattern matching `browser-tools.test.ts`.
- `packages/core/src/multimodal/manager.test.ts` — 16 new tests: ElevenLabs/Deepgram/Cartesia TTS routing, Deepgram/ElevenLabs STT routing, `detectAvailableProviders()` `configured[]` and `metadata` assertions.

### Phase 40 — Desktop Control + Multimodal Provider Selection

#### Features

**Desktop Control — `vision` + `limb_movement` capability runtime** (Phase 40)

Security gate: `SecurityConfig.allowDesktopControl` (default `false`) is the outer system switch; `body.capabilities[]` on the active personality is the inner per-agent gate. Both must be true for any `desktop_*` tool to execute. `allowCamera` is a secondary flag for camera capture only.

*Capture drivers (`packages/core/src/body/capture/`):*
- `screen.ts` — cross-platform screenshot via `screenshot-desktop` (X11/macOS/Windows) with `@napi-rs/screenshot` as Wayland fallback. Supports `display`, `window`, and `region` target types; applies `CaptureFilters.blurRegions` (black rectangles) via optional `canvas` package; returns base64 + MIME type + dimensions.
- `windows.ts` — window and display enumeration platform-dispatched via subprocess: `wmctrl -lG` + `xrandr` (Linux), AppleScript `osascript` (macOS), PowerShell `Get-Process` + `Get-CimInstance` (Windows). Returns typed `WindowInfo[]` and `DisplayInfo[]`.
- `camera.ts` — single-frame camera capture via `ffmpeg` subprocess with platform-specific device sources (v4l2 / avfoundation / dshow). Requires `allowCamera: true`.

*Actuator drivers (`packages/core/src/body/actuator/`):*
- `input.ts` — keyboard and mouse control via lazy-loaded `@nut-tree/nut-js` (optional; clear error if absent). Exports `moveMouse`, `clickMouse`, `scrollMouse`, `typeText`, `pressKey`, `releaseKey`. Window management (`focusWindow`, `resizeWindow`, `minimizeWindow`) via subprocess (wmctrl / osascript / PowerShell).
- `clipboard.ts` — `readClipboard`, `writeClipboard`, `clearClipboard` via `clipboardy`.
- `sequence.ts` — `executeSequence(steps[])` runs an ordered list of up to 50 `InputAction` steps atomically with configurable per-step delay. Action types: `mouse_move`, `mouse_click`, `mouse_scroll`, `type`, `key_press`, `key_release`, `clipboard_write`, `clipboard_read`, `wait`.

*Core API (`packages/core/src/body/desktop-routes.ts`):* 14 REST endpoints under `/api/v1/desktop/*` wrapping all drivers. Registered in `GatewayServer` when `allowDesktopControl` is enabled. Enables MCP tools to call drivers without importing core directly.

*SecurityConfig additions (`packages/shared/src/types/config.ts`):*
- `allowDesktopControl: boolean` (default `false`)
- `allowCamera: boolean` (default `false`)
Both persisted in `security.policy` DB table; toggleable at runtime via `PATCH /api/v1/security/policy`.

**MCP `desktop_*` tool family** (14 tools in `packages/mcp/src/tools/desktop-tools.ts`)

All tools check `allowDesktopControl` + the relevant capability before executing. Remote MCP clients are subject to the same gate — no bypass path.

| Tool | Capability | Description |
|------|-----------|-------------|
| `desktop_screenshot` | `vision` | Capture screen/window/region; returns base64 image |
| `desktop_window_list` | `vision` | List open windows with id, title, app, bounds |
| `desktop_display_list` | `vision` | List monitors with bounds, scale, primary flag |
| `desktop_camera_capture` | `vision` + `allowCamera` | Capture camera frame |
| `desktop_window_focus` | `limb_movement` | Bring window to foreground |
| `desktop_window_resize` | `limb_movement` | Resize/reposition window |
| `desktop_mouse_move` | `limb_movement` | Move cursor |
| `desktop_click` | `limb_movement` | Click at position |
| `desktop_scroll` | `limb_movement` | Scroll at coordinates |
| `desktop_type` | `limb_movement` | Type text with inter-key delay |
| `desktop_key` | `limb_movement` | Press key combination (e.g. `ctrl+c`) |
| `desktop_clipboard_read` | `limb_movement` | Read clipboard text |
| `desktop_clipboard_write` | `limb_movement` | Write to clipboard |
| `desktop_input_sequence` | `limb_movement` | Execute `InputSequence` atomically (max 50 steps) |

Audit events: `desktop_capture` and `desktop_input` emitted on all tool calls; surfaced in Security Feed.

**Multimodal provider selection** (runtime-switchable vision/TTS/STT providers)

- `MultimodalConfig.vision.provider`: `claude` | `openai` | `gemini` (default `claude`)
- `MultimodalConfig.stt.provider` and `tts.provider` expanded to include `voicebox`
- `MultimodalManager.detectAvailableProviders()` — detects configured providers by env var presence (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GOOGLE_API_KEY`) and Voicebox health check (`GET ${VOICEBOX_URL}/health`, 3s timeout)
- `MultimodalManager.analyzeImage()` now routes to OpenAI GPT-4o or Gemini 1.5 Pro in addition to the existing Claude path; provider priority: env var override > DB preference > config default
- **New endpoint**: `PATCH /api/v1/multimodal/provider` — body `{ type: 'vision'|'tts'|'stt', provider: string }`. Validates provider is in `configured` list (returns 400 with message if not). Stores selection in `system_preferences` table.
- Provider preferences persisted via `SystemPreferencesStorage` (key-value reads/writes to `system_preferences` table, migration 016)

**Dashboard UI additions**

- `SecuritySettings.tsx` — new **Desktop Control** card: master `allowDesktopControl` toggle with prominent warning banner; `allowCamera` sub-toggle (only active when master is on). Matches existing security card pattern.
- `MultimodalPage.tsx` — interactive provider selection: vision/TTS/STT provider cards with availability badges. Configured-but-inactive providers are clickable (triggers `PATCH /api/v1/multimodal/provider`). Unconfigured providers shown greyed-out with "API key not configured" tooltip.
- `PersonalityEditor.tsx` — `vision` and `limb_movement` capability toggles show a "Requires Desktop Control to be enabled in Security Settings" tooltip and disabled state when `allowDesktopControl` is `false`.

**`composeBodyPrompt()` wiring** (`packages/core/src/soul/manager.ts`)

When `vision` is in `body.capabilities[]` and `allowDesktopControl` is true, injects tool list and usage guidance into the system prompt. Same for `limb_movement`. When the gate is off, entries read `vision: disabled` / `limb_movement: disabled`.

#### Fixes

- `packages/shared/src/types/index.ts` — `PromptGuardConfig` added to barrel exports (was defined in `config.ts` but missing from re-export; caused Docker build failures)
- `packages/core/src/security/prompt-guard.ts` — guarded `messages[idx]` array access with `if (!msg) continue` (required by `noUncheckedIndexedAccess`)

#### Tests

New test files (57 tests):
- `packages/mcp/src/tools/desktop-tools.test.ts` — tool registration, security/capability gates, API endpoint routing per tool type, audit logger
- `packages/core/src/body/actuator/sequence.test.ts` — all 9 action types, execution order, 50-step limit, clipboard read collection
- `packages/core/src/body/actuator/clipboard.test.ts` — read/write/clear with mocked `clipboardy`
- `packages/core/src/body/capture/windows.test.ts` — wmctrl/xrandr parsing, error fallback, `WindowInfo`/`DisplayInfo` type shape
- `packages/core/src/multimodal/multimodal-routes.test.ts` — 7 new tests for `PATCH /api/v1/multimodal/provider` (validation, configured-provider gate, `setProvider` invocation)

---

### Phase 39 — Diagnostic Tools

#### Features

**Diagnostic Tools — two-channel agent self-diagnostics** (ADR 123)

- `'diagnostics'` added to `BodyCapabilitySchema` in `packages/shared/src/types/soul.ts` — single capability toggle, no DB migration required
- **Channel A — prompt injection**: `composeBodyPrompt()` in `SoulManager` now appends a `### Diagnostics` block when the capability is enabled. Inline data: process uptime, memory RSS, 1-minute CPU load average, connected MCP server count, integration count. Sourced directly from `process` and `os` — no REST round-trip.
- **Channel B — MCP tools** (`packages/mcp/src/tools/diagnostic-tools.ts`): three new tools gated by `body.capabilities.includes('diagnostics')`:
  - `diag_report_status` — sub-agent pushes health report (uptime, task count, last error, memory) to orchestrator via `POST /api/v1/diagnostics/agent-report`
  - `diag_query_agent` — orchestrator reads a sub-agent's last report via `GET /api/v1/diagnostics/agent-report/:agentId`; also requires `allowSubAgents`
  - `diag_ping_integrations` — returns running/healthy status for all integrations + MCP server connectivity (`toolCount`, `reachable`, `url`, `latencyMs`) for selected servers from the active personality
- **Core API** (`packages/core/src/diagnostics/diagnostic-routes.ts`): three new Fastify routes serving Channel B tools. Agent reports stored in ephemeral in-memory Map (lost on restart; intentional for live-status data).
- **Audit logging**: all three MCP tools emit `diagnostic_call` audit events (in addition to the standard `mcp_tool_call` from `wrapToolHandler`).
- **Dashboard**: `diagnostics` entry added to `capabilityInfo` map in `PersonalityEditor.tsx` (icon 🩺, description "Self-diagnostics snapshot and sub-agent health reporting"). Toggle appears automatically in Body → Capabilities section.

### Phase 38 — Beta Manual Review

#### Breaking Changes

- **`deletionProtected` removed** — the boolean `deletion_protected` DB column and `deletionProtected` API field have been replaced by `body.resourcePolicy.deletionMode` (tri-state enum: `auto` | `request` | `manual`). Run migration 037 before deploying. Clients reading `deletionProtected` from the API must switch to `body.resourcePolicy.deletionMode`.

---

#### Features

**Prompt-assembly injection guard** (ADR 124)

- `PromptGuard` in `packages/core/src/security/prompt-guard.ts` — stateless scanner that runs immediately before the LLM API call on the fully assembled `messages[]` array. Closes the indirect injection gap not covered by `InputValidator` (ADR 120): injected content arriving via brain/memory retrieval, skill instructions, spirit context, or owner profile notes.
- Eight pattern families: `context_delimiter` (raw LLM boundary tokens), `authority_claim` (fake `SYSTEM:` / `ADMIN:` headers), `instruction_override` (`new instructions:`), `developer_impersonation`, `instruction_reset` (`from this point on`), `hypothetical_override`, `comment_injection` (HTML/XML comment bypass), `roleplay_override`. Each tagged high or medium severity.
- System-message scoping: patterns that only make sense in non-system positions (e.g. `authority_claim`) are skipped when scanning `role: 'system'` content — no false positives on legitimate structural headers.
- Configurable via `security.promptGuard.mode`: `warn` (default — audit-log findings, request proceeds), `block` (high-severity finding aborts with HTTP 400 / SSE error event), `disabled`.
- Wired into both `/api/v1/chat` and `/api/v1/chat/stream`. Streaming path emits an SSE error event and throws (caught by existing `catch` block) because SSE headers are already sent.
- Audit events tagged `metadata.source: 'prompt_assembly'` to distinguish from HTTP-boundary `InputValidator` blocks.
- `PromptGuardConfig` type + `PromptGuardConfigSchema` added to `packages/shared/src/types/config.ts`, field `promptGuard` added to `SecurityConfigSchema`.
- Sub-agent dashboard: `enabled` logic simplified to `securityPolicy.allowSubAgents` as the single gate (removed redundant `config.enabled` double-check).
- Unit tests: `packages/core/src/security/prompt-guard.test.ts`

---

**Chat responsive layout + viewport hint** (ADR 119)

- `ChatPage.tsx`: added `min-h-0` to flex containers so `overflow-y-auto` works correctly in nested flex columns; replaced invalid `pl-68` with `sm:pl-64`; added `md:max-w-[70%]` to message bubbles
- `useChat` / `useChatStream`: read `window.innerWidth` at send time and pass `clientContext.viewportHint` (`mobile` | `tablet` | `desktop`) in the POST body
- `composeSoulPrompt()`: appends a single bracketed viewport hint line after skills (e.g. `[Interface: mobile — prefer concise responses; avoid wide tables and long code blocks.]`)
- No DB migration required — `clientContext` is transient

**Input sanitization wired to HTTP entry points** (ADR 120)

- `InputValidator.validateObject()`: new helper that validates all string values in a nested object recursively; fixes the MCP tool-utils type mismatch
- `/api/v1/chat` and `/api/v1/chat/stream`: validate `message` and `history[].content`; blocked inputs return 400 and record `injection_attempt` audit event
- `/api/v1/soul/personalities` (POST/PUT) and `/api/v1/soul/skills` (POST/PUT): validate `name`, `systemPrompt`/`instructions`, `description`; highest-risk fields since they compose the LLM system prompt
- `SecureYeoman.getValidator()`: new public getter exposing the shared `InputValidator` instance

**Per-personality rate limit config + dedicated chat rule** (ADR 121)

- `STATIC_RULES` gains `chat_requests` (30/min/user) applied to both `/chat` and `/chat/stream`
- `ResourcePolicySchema.rateLimitConfig`: new optional field (`chatRequestsPerMinute?: number`, `enabled?: boolean`) stored in existing `body` JSONB — no migration
- Chat routes enforce per-personality override: dynamically registers `chat_personality_<id>` rule; `enabled: false` bypasses rate limiting entirely for that personality
- 429 responses include `retryAfter` seconds

**Security audit logging completeness** (ADR 122)

- Rate limit exceeded on chat: records `rate_limit` event to audit chain (previously only `logger.warn`)
- `PATCH /api/v1/security/policy`: records `config_change` event with changed field names and `updatedBy` userId
- Invalid API key in `validateApiKey()`: now records `auth_failure` event (previously only incremented counter for JWT failures)
- Input validation failures in chat/soul routes: `injection_attempt` events (see ADR 120)
- `GET /api/v1/security/events`: `ai_request` and `ai_response` added to `SECURITY_EVENT_TYPES` so they appear in the dashboard security feed

**Tri-state deletion gating (`auto` / `request` / `manual`)** (ADR 113) — personalities now have a three-mode deletion policy stored in `body.resourcePolicy.deletionMode`:

| Mode | Behaviour |
|---|---|
| `auto` (default) | Deletion proceeds immediately with no confirmation |
| `request` (Suggest) | Dashboard shows a confirmation dialog; AI-initiated deletion is blocked |
| `manual` (Manual) | Deletion is fully blocked at the backend until mode is changed |

- Accessible in PersonalityEditor under **Body → Resources → Deletion**
- AI tool executor respects both `request` and `manual` gating (blocks with a clear error message)
- Migration 037 upgrades existing `deletion_protected = true` rows to `deletionMode = 'manual'`

**Per-personality automation level and emergency stop** (ADR 114) — `body.resourcePolicy` now has two new fields:

| Field | Values | Effect |
|---|---|---|
| `automationLevel` | `supervised_auto` (default) · `semi_auto` · `full_manual` | Controls which AI-initiated tool calls are queued for human review before execution |
| `emergencyStop` | `false` (default) · `true` | Kill-switch: when `true`, all AI-initiated mutations are blocked immediately regardless of automation level |

- **Pending Approvals queue** (`soul.pending_approvals`, migration 038): AI tool calls that exceed the configured automation level are queued here instead of executed immediately
- **Review Queue API**: `GET /api/v1/soul/approvals`, `GET /api/v1/soul/approvals/count`, `POST /api/v1/soul/approvals/:id/approve`, `POST /api/v1/soul/approvals/:id/reject`
- **Dashboard**: Automation Level (radio group) and Emergency Stop (checkbox) controls added to PersonalityEditor under **Body → Resources**

**`secureyeoman agents` command** (ADR 118) — new CLI entry point for viewing and toggling agent feature flags at runtime without restarting the server.

Subcommands:
- `status` — show all four feature flags (`sub-agents`, `a2a`, `swarms`, `binary-agents`) with enabled/disabled indicators and descriptions
- `enable <feature>` — enable the named feature via `PATCH /api/v1/security/policy`
- `disable <feature>` — disable the named feature

All changes take effect immediately in the running process; they are not persisted to `secureyeoman.yaml`. Use `--json` for script-friendly output.

Changes: `packages/core/src/cli/commands/agents.ts`, registered in `packages/core/src/cli.ts`.

**`secureyeoman mcp-quickbooks` command** (ADR 117) — new CLI entry point for managing the QuickBooks Online MCP toolset without editing environment files manually.

Subcommands:
- `status` — shows whether `MCP_EXPOSE_QUICKBOOKS_TOOLS` is set, lists all five credential variables with present/missing indicators, and exits non-zero when tools are enabled but credentials are incomplete
- `enable` — prints the env vars to add to `.env`
- `disable` — disables the toolset

Changes: `packages/core/src/cli/commands/mcp-quickbooks.ts` (alias: `mcp-qbo`), registered in `packages/core/src/cli.ts`.

**New `POST /api/v1/chat/stream` SSE endpoint** (ADR 112) — full streaming agentic loop that emits real-time events for every meaningful step: `thinking_delta`, `content_delta`, `tool_start`, `tool_result`, `mcp_tool_start`, `mcp_tool_result`, `creation_event`, `done`, `error`. Extended thinking support for Anthropic provider. New `ThinkingBlock.tsx` collapsible dashboard component. New `useChatStream()` React hook. All four chat surfaces now consume this endpoint.

**Symmetric AI creation tools** (ADR 111) — the AI can now delete what it creates, subject to the same `creationConfig` capability gate: `delete_personality`, `delete_custom_role`, `revoke_role`, `delete_experiment`. Self-deletion guard prevents a personality from deleting itself.

**Input and output token counts exposed separately** — all token usage surfaces now break down `totalTokens` into `inputTokens` and `outputTokens`. Dashboard CostsPage, MetricsPage, and ResourceMonitor display the input/output split inline beneath the total. Token pie charts updated to show three slices: Input, Output, Cached.

**Configurable login attempt rate limiting** — `SECUREYEOMAN_AUTH_LOGIN_MAX_ATTEMPTS` and `SECUREYEOMAN_AUTH_LOGIN_WINDOW_MS` env vars control the auth rate limit. Defaults unchanged (5 attempts / 15 min). Dev environment ships with relaxed values (100 attempts / 60 s).

---

#### Bug Fixes

**Task History duration always displayed as '-'** — two bugs combined. (1) `executor.submit()` called `taskStorage.storeTask(task)` without `await`, creating a race condition where subsequent `updateTask(RUNNING)` / `updateTask(COMPLETED)` calls could execute before the INSERT was committed. (2) `formatDuration()` in `TaskHistory.tsx` used `if (!ms)` which evaluates to true for `durationMs = 0`, returning `'-'` for any completed task faster than 1 ms. Fixed: `storeTask` is now awaited in `executor.ts`; `formatDuration` uses `if (ms == null)` and displays `<1ms` for sub-millisecond durations. Also fixed three missing `await` on `taskStorage.getTask()`, `updateTaskMetadata()`, and `deleteTask()` calls in the `GET/PUT/DELETE /api/v1/tasks/:id` route handlers — without these awaits the `!task` null guard ran on a Promise (always truthy) and never returned 404.

**CLI `integration create` sent wrong field name; dashboard didn't unwrap server response** — the `secureyeoman integration create` command sent `name: <value>` but the backend schema expects `displayName`. Separately, `createIntegration()` in the dashboard API client returned the raw `{ integration: {...} }` wrapper object instead of the inner `IntegrationInfo`, causing `integration.id` to be `undefined` and the "Integration undefined not found" error. Fixed: CLI now sends `displayName`; `client.ts` unwraps the response.

**Dynamic tool "entry is not defined" gave no context** — when a dynamic tool's sandboxed implementation code threw a `ReferenceError` (e.g. using an undeclared variable like `entry`), `DynamicToolManager.execute()` forwarded the raw VM exception message with no indication it came from the tool's own code. Fixed: error message now reads `Dynamic tool "<name>" implementation error: <message>. Check the tool's implementation code for undefined variables or logic errors.`

**Chat stream responses never appeared after streaming** — `useChatStream.handleSend` used a raw `fetch('/api/v1/chat/stream', ...)` call with no `Authorization` header. The backend returned 401 Unauthorized; the frontend did not check `res.ok`, so it silently tried to parse the 401 error body as SSE, found no `data:` events, and finished with nothing added to the message list. The "Thinking…" indicator would vanish and the conversation remained empty. Fixed by reading the token via `getAccessToken()` and injecting `Authorization: Bearer <token>` into the stream request headers. Also added a `res.ok` guard that throws a descriptive error (surfaced in the chat as an error message) for any non-2xx response.

**Docker build broken by TypeScript errors** — `docker compose --profile dev build` failed during `npm run build`. Four errors resolved:

| File | Error | Fix |
|---|---|---|
| `packages/shared/src/types/metrics.ts` | `ResourceMetricsSchema` missing `inputTokensToday` / `outputTokensToday` | Added both fields to Zod schema |
| `packages/dashboard/src/api/client.ts` | `fetchCostHistory` catch-block fallback missing `inputTokens` / `outputTokens` | Added both fields to fallback object |
| `packages/dashboard/src/components/ChatPage.test.tsx` | `.find()` return used without null guard (strict null checks) | Added `!` non-null assertion on all four call sites |
| `packages/dashboard/src/components/MetricsPage.test.tsx` | Six mock `totals` objects missing `inputTokens` / `outputTokens` | Added both fields to all six mock objects |

**Chat history lost when switching conversations** — `useChatStream` was missing the `useEffect` that loads conversation history when `conversationId` changes (which `useChat` had). `brainContext` was also not being surfaced from streaming responses.

**Resource action recording** (ADR 110) — task history entries were silently dropped (`storeTask()` called without `await`); workflow tools were missing from `CREATION_TOOL_LABELS`; sparkle cards always showed "created" regardless of actual operation. Chat routes now own all persistence; `toolAction()` helper derives the correct verb.

**Dashboard `/metrics` page returned 401/404 on refresh** — `resolveDashboardDist()` had an extra `../` in its path. Backend Prometheus endpoint renamed from `/metrics` to `/prom/metrics` to remove the route collision. Auth hooks now skip enforcement for non-API, non-WebSocket paths.

**Login page network status was static** — "Local Network Only" was a hardcoded label; replaced with a live indicator fetching from `/health` (matches the About dialog logic).

**Community Skills toggle reset on restart** — `'allowCommunityGitFetch'` was missing from `policyKeys` in `loadSecurityPolicyFromDb`; the value was saved but never restored. Sparkle icons lost on conversation reload; fixed by persisting `creation_events_json` to `chat.messages` (migration 035).

**Task View status and duration stuck after creation** — `TaskHistory.tsx` was using `refetchInterval: false` and `staleTime: 5000`. Now polls every 2 s while tasks are active and re-fetches immediately after mutations.

**Community Skills sync failures** — hardened `gitCloneOrPull` against stale/non-git directories. Docker named volume replaces bind mount to fix root-ownership issue when the host directory is absent.

---

#### Security

**CSRF not applicable to Bearer-token API** (ADR 115) — documented. No `Set-Cookie` headers are emitted anywhere in the auth flow; CSRF exploit vector does not apply. Comment guard added to `packages/core/src/gateway/server.ts` requiring future developers to add `@fastify/csrf-protection` if cookies are ever introduced.

**CIDR-aware scope validation** (ADR 116) — `validateTarget()` in Kali security tools now correctly handles CIDR ranges via IPv4 bitmask comparison. Previous substring match failed silently for ranges like `10.10.10.0/24` (would not match `10.10.10.5`). New matching rules for `MCP_ALLOWED_TARGETS`:
- `10.10.10.0/24` — CIDR range; any IP in the subnet matches
- `.example.com` — domain suffix; matches apex and all subdomains
- `example.com` — hostname; matches exact host and any subdomain
- `*` — wildcard (existing behaviour unchanged)

---

## Phase 55 — Navigate & Create: Workflows + Test Fixes (2026-02-22) `v2026.2.22`

### Enhancement: Workflows in Navigate & Create

**`packages/dashboard/src/components/NewEntityDialog.tsx`**:
- Imported `GitMerge` from `lucide-react`
- Added **Workflow** entry to `NAV_ITEMS` (`/workflows`, "Create an automation") so users can jump directly to workflow creation from the global Navigate & Create dialog

### Test Fixes

**`packages/core/src/ai/switch-model.test.ts`**:
- Added `BASE_RESPONSE_CACHE` constant (`{ enabled: false, ttlMs: 300_000, maxEntries: 500 }`)
- All 5 model config objects now include `responseCache: BASE_RESPONSE_CACHE`
- Fixes `TypeError: Cannot read properties of undefined (reading 'enabled')` caused by `AIClient` accessing `config.model.responseCache.enabled` without an optional chain

**`packages/dashboard/src/components/Sidebar.test.tsx`**:
- `BASE_POLICY` now includes `allowWorkflows: true`
- Fixes "shows a Workflows nav link" and "Skills link appears before Workflows" tests that were failing because the policy gate hid the link

**`packages/dashboard/src/components/SkillsPage.test.tsx`**:
- `fetchSecurityPolicy` added to the `vi.mock('../api/client', ...)` block
- `mockFetchSecurityPolicy` typed and defaulted to `{ allowCommunityGitFetch: false }` in `beforeEach`
- "shows removed count in sync result" test rewritten: enables policy, waits for Community tab button, clicks it, then clicks Sync — avoids the initialTab→useEffect reset race

**`packages/dashboard/src/components/GroupChatPage.test.tsx`**:
- Regex updated from `/No conversations yet/i` to `/No active conversations/i` to match actual component copy

### Version

All packages bumped `2026.2.21` → `2026.2.22`.

---

## Phase 54 — Security Policy Toggles: Workflows & Community Skills (2026-02-22)

### New Feature: Workflow Orchestration Security Toggle

A new `allowWorkflows` security policy flag gates the Workflows page and all DAG-based workflow
features. Disabled by default on fresh install; an admin enables it once in Settings > Security.

**`packages/shared/src/types/config.ts`**:
- Added `allowWorkflows: z.boolean().default(false)` to `SecurityConfigSchema`

**`packages/core/src/gateway/server.ts`**:
- `GET /api/v1/security/policy` — returns `allowWorkflows`
- `PATCH /api/v1/security/policy` — accepts `allowWorkflows?: boolean`

**`packages/core/src/secureyeoman.ts`**:
- `updateSecurityPolicy()` handles `allowWorkflows`
- `loadSecurityPolicyFromDb()` key allowlist includes `allowWorkflows`

**`packages/core/src/cli/commands/policy.ts`**:
- `allowWorkflows` added to `ALL_POLICY_FLAGS`; usable via `secureyeoman policy set allowWorkflows true`

**`packages/dashboard/src/api/client.ts`**:
- `allowWorkflows: boolean` added to `SecurityPolicy` interface; fallback value `false`

**`packages/dashboard/src/components/SecuritySettings.tsx`**:
- Imported `GitMerge` icon
- New **Workflow Orchestration** `PolicyToggle` card added after the Proactive Assistance section

**`packages/dashboard/src/components/Sidebar.tsx`**:
- `workflowsEnabled = securityPolicy?.allowWorkflows ?? false`
- `/workflows` nav item filtered out when disabled

### New Feature: Community Skills Security Toggle

The existing `allowCommunityGitFetch` backend flag (which already blocked the sync API) is now also
enforced in the dashboard UI. The Community tab in Skills is hidden when the policy is off, and a new
toggle card in Settings > Security gives admins one-click control.

**`packages/dashboard/src/api/client.ts`**:
- `allowCommunityGitFetch: boolean` added to `SecurityPolicy` interface; fallback value `false`

**`packages/dashboard/src/components/SkillsPage.tsx`**:
- Imports `fetchSecurityPolicy`
- `useQuery` fetches the security policy on mount (staleTime 30 s, shared key `security-policy`)
- `communityEnabled = securityPolicy?.allowCommunityGitFetch ?? false`
- Community tab button wrapped in `{communityEnabled && ...}`
- `<CommunityTab />` guarded by `communityEnabled`
- `useEffect` falls back to Personal tab if the policy is disabled while Community tab is active

**`packages/dashboard/src/components/SecuritySettings.tsx`**:
- Imported `GitBranch` icon
- `communityGitFetchAllowed` extracted from policy
- New **Community Skills** `PolicyToggle` card added at the end of the policy list

### Tests

**`packages/dashboard/src/components/SecuritySettings.test.tsx`**:
- All 9 inline policy mock objects updated to include `allowWorkflows: false, allowCommunityGitFetch: false`
- 4 new tests: Workflow Orchestration toggle renders/off-by-default + calls updateSecurityPolicy; Community Skills toggle renders/off-by-default + calls updateSecurityPolicy

**`packages/dashboard/src/components/Sidebar.test.tsx`**:
- `BASE_POLICY.allowWorkflows` changed to `false` (matches fresh-install default)
- `BASE_POLICY.allowCommunityGitFetch: false` added
- "shows a Workflows nav link" test now overrides policy with `allowWorkflows: true`
- "Skills link appears before Workflows" test similarly updated
- New test: "Workflows is hidden when allowWorkflows is false (default)"

**`packages/dashboard/src/components/SkillsPage.test.tsx`**:
- `fetchSecurityPolicy` added to module mock and typed reference
- `beforeEach` sets `mockFetchSecurityPolicy.mockResolvedValue({ allowCommunityGitFetch: false })`
- "renders community tab" test updated to explicitly enable `allowCommunityGitFetch: true`
- "shows removed count" test updated: mocks policy with `allowCommunityGitFetch: true`, navigates to Community tab via button click rather than initial state
- 3 new tests: Community tab hidden by default; visible when policy enabled; falls back to Personal when policy disabled while on Community path

Total: +11 new tests, 61 passing.

---

## Phase 53 — Workflow Engine + Navigation (2026-02-22)

### New Feature: DAG-Based Workflow Orchestration Engine

A complete workflow engine — distinct from Proactive triggers — for user-defined deterministic
automation. Supports 9 step types, Mustache-style data-flow templates, topological execution,
retry policies, and a ReactFlow visual builder in the dashboard.

**`packages/shared/src/types/workflow.ts`** (new):
- `WorkflowStepTypeSchema` — 9 types: `agent`, `tool`, `mcp`, `condition`, `transform`, `resource`, `webhook`, `subworkflow`, `swarm`
- `WorkflowStepSchema` with `dependsOn`, `retryPolicy`, `onError` (fail/continue/skip/fallback), `fallbackStepId`, `condition`
- `WorkflowTriggerSchema` — 5 types: `manual`, `schedule`, `event`, `webhook`, `skill`
- `WorkflowDefinitionSchema`, `WorkflowRunSchema`, `WorkflowStepRunSchema` + create/update variants

**`packages/core/src/storage/migrations/034_workflow_schema.sql`** (new):
- `workflow.definitions`, `workflow.runs`, `workflow.step_runs` tables with indexes

**`packages/core/src/workflow/workflow-storage.ts`** (new):
- `PgBaseStorage` extension; full CRUD for definitions, runs, step runs; `seedBuiltinWorkflows`

**`packages/core/src/workflow/workflow-engine.ts`** (new):
- Kahn's algorithm topological sort with cycle detection
- Tier-based parallel execution via `Promise.all`
- `dispatchStep` for all 9 types; `resolveTemplate` for `{{steps.id.output}}` tokens; `evaluateCondition` via `new Function` (closed scope: only `steps` and `input`)

**`packages/core/src/workflow/workflow-templates.ts`** (new):
- 3 built-in templates: Research Report Pipeline, Code Review + Webhook, Parallel Intelligence Gather

**`packages/core/src/workflow/workflow-manager.ts`** (new):
- `triggerRun()` creates run record then `setImmediate(() => engine.execute(...))` — returns 202 immediately; `initialize()` seeds built-in templates

**`packages/core/src/workflow/workflow-routes.ts`** (new):
- 9 REST endpoints; `/runs/:runId` registered before `/:id` to avoid Fastify route collision

**`packages/core/src/secureyeoman.ts`**:
- `WorkflowStorage` + `WorkflowManager` initialized after swarm manager; `getWorkflowManager()` accessor; cleanup in shutdown

**`packages/core/src/gateway/server.ts`**:
- `registerWorkflowRoutes()` called after swarm routes; `workflows` channel added to `CHANNEL_PERMISSIONS`

**`packages/mcp/src/tools/workflow-tools.ts`** (new):
- 5 tools: `workflow_list`, `workflow_get`, `workflow_run`, `workflow_run_status`, `workflow_cancel`

**`packages/dashboard/src/api/client.ts`**:
- `WorkflowDefinition`, `WorkflowStep`, `WorkflowEdge`, `WorkflowTrigger`, `WorkflowRun`, `WorkflowStepRun` interfaces
- `fetchWorkflows`, `fetchWorkflow`, `createWorkflow`, `updateWorkflow`, `deleteWorkflow`, `triggerWorkflow`, `fetchWorkflowRuns`, `fetchWorkflowRun`, `cancelWorkflowRun`

**`packages/dashboard/src/pages/WorkflowsPage.tsx`** (new):
- Stat cards (total/enabled/disabled), definition table with Run/Edit/Delete; toast with run ID on trigger

**`packages/dashboard/src/pages/WorkflowBuilder.tsx`** (new):
- ReactFlow DAG editor; left step-type palette (9 types), center canvas, right config panel per node type; `definitionToFlow` / `flowToDefinition` converters; dagre auto-layout

**`packages/dashboard/src/pages/WorkflowRunDetail.tsx`** (new):
- Polls every 2 s while running; step timeline with status icons, duration, collapsible input/output JSON

### New Feature: Tasks Page + Navigation Order

**`packages/dashboard/src/components/Sidebar.tsx`**:
- Added Tasks nav item (after Security) and Workflows nav item (after Proactive)
- Nav order: Metrics → Security → Tasks → Chat → Editor → Personality → Skills → Proactive → Workflows → Connections → Developers → Settings

**`packages/dashboard/src/components/DashboardLayout.tsx`**:
- `/tasks` route now renders `<TaskHistory />` instead of `<SecurityPage />`
- Added `/workflows`, `/workflows/:id/builder`, `/workflows/runs/:runId` routes with lazy imports

**`packages/dashboard/src/components/Sidebar.test.tsx`**:
- 4 new tests: Tasks link to /tasks; Workflows link to /workflows; Skills before Workflows; Tasks between Security and Skills

**`packages/dashboard/src/components/DashboardLayout.test.tsx`**:
- Updated `/tasks` routing test to assert `TaskHistory` renders

### New Feature: "+ New" Button — Memory Form

The Memory option in the `+ New` dialog now opens an inline form instead of navigating away.

**`packages/dashboard/src/components/NewEntityDialog.tsx`**:
- Memory CONFIG_ITEM changed from `kind: 'nav'` to `kind: 'form', step: 'memory'`
- `renderMemory()` — two-tab switcher: **Vector Memory** (type, content, source, importance slider) and **Knowledge Base** (topic, content textarea)
- `addMemoryMut` calls `addMemory()`; `learnKnowledgeMut` calls `learnKnowledge()`; both invalidate their query cache on success

---

## Phase 52 — QuickBooks Online MCP Integration (2026-02-22)

### New Feature: Native `qbo_*` MCP Tools for QuickBooks Online

YEOMAN MCP now ships 59 native QuickBooks Online tools covering the full accounting lifecycle —
invoices, customers, vendors, bills, expenses, chart of accounts, reports, and more.

**`packages/mcp/src/tools/quickbooks-tools.ts`** (new):

**CRUD tools for 11 core QBO entities** (prefix `qbo_`):

| Entity | Create | Get | Search | Update | Delete |
|--------|--------|-----|--------|--------|--------|
| Account | ✓ | ✓ | ✓ | ✓ | — (deactivate) |
| Bill | ✓ | ✓ | ✓ | ✓ | ✓ |
| BillPayment | ✓ | ✓ | ✓ | ✓ | ✓ |
| Customer | ✓ | ✓ | ✓ | ✓ | — (deactivate) |
| Employee | ✓ | ✓ | ✓ | ✓ | — (deactivate) |
| Estimate | ✓ | ✓ | ✓ | ✓ | ✓ |
| Invoice | ✓ | ✓ | ✓ | ✓ | ✓ |
| Item | ✓ | ✓ | ✓ | ✓ | — (deactivate) |
| JournalEntry | ✓ | ✓ | ✓ | ✓ | ✓ |
| Purchase | ✓ | ✓ | ✓ | ✓ | ✓ |
| Vendor | ✓ | ✓ | ✓ | ✓ | — (deactivate) |

**Additional tools**:
- `qbo_health` — verify credentials and connectivity; returns company name
- `qbo_get_company_info` — full company settings (address, phone, fiscal year, country)
- `qbo_report_profit_loss` — P&L report for any date range with Cash or Accrual accounting
- `qbo_report_balance_sheet` — Balance Sheet as-of any date

**Authentication**: OAuth 2.0 refresh-token flow. Access tokens are refreshed automatically and
cached for their 3 600 s lifetime. Configurable via env vars or through the Dashboard.

**Configuration**:

| Env Var | Purpose | Default |
|---------|---------|---------|
| `MCP_EXPOSE_QUICKBOOKS_TOOLS` | Enable all `qbo_*` tools | `false` |
| `QUICKBOOKS_CLIENT_ID` | Intuit app Client ID | — |
| `QUICKBOOKS_CLIENT_SECRET` | Intuit app Client Secret | — |
| `QUICKBOOKS_REALM_ID` | Company / Realm ID | — |
| `QUICKBOOKS_REFRESH_TOKEN` | OAuth 2.0 refresh token | — |
| `QUICKBOOKS_ENVIRONMENT` | `sandbox` or `production` | `sandbox` |

Obtain credentials at [https://developer.intuit.com/](https://developer.intuit.com/). Get an initial
refresh token via the [Intuit OAuth 2.0 Playground](https://developer.intuit.com/app/developer/playground).

**Dashboard — QuickBooks Online prebuilt** (`packages/dashboard/src/components/McpPrebuilts.tsx`):
- QuickBooks Online added to the one-click prebuilt server list in the Connections page
- Connects via `npx -y quickbooks-online-mcp-server` (official Intuit npm package) as an
  alternative to the built-in native `qbo_*` tools
- Credential form: Client ID, Client Secret, Realm ID, Refresh Token, Environment

**`packages/shared/src/types/mcp.ts`**:
- Six new fields added to `McpServiceConfigSchema`: `exposeQuickBooksTools`, `quickBooksEnvironment`,
  `quickBooksClientId`, `quickBooksClientSecret`, `quickBooksRealmId`, `quickBooksRefreshToken`

**`packages/mcp/src/config/config.ts`**:
- All six QuickBooks config fields parsed from environment variables

---

## Phase 51 — Skills Import, Delete Refresh Fix & Community Sync Prune (2026-02-22)

### New Feature: Import Skills from JSON

Users can now import a `.skill.json` file directly into their Personal skills library using an
**Import** button placed next to the existing "+ Add Skill" button.

**`packages/dashboard/src/components/SkillsPage.tsx`**:
- Import button (Upload icon, secondary style) added to `MySkillsTab` header, next to Add Skill
- `handleImportClick` prefers the **File System Access API** (`showOpenFilePicker`) which opens the
  picker in the user's home directory (`startIn: 'home'`), falling back to a hidden
  `<input type="file">` for browsers that don't support the API (Firefox)
- File validation (dual-check) — rejects files that fail either:
  - Extension check: must end in `.json`
  - MIME type check: must be `application/json`, `text/json`, or empty string (OS default)
- Schema check: `$schema` field must equal `'sy-skill/1'`; any other value or missing field shows an error
- On success, strips server-managed fields and calls `createSkill`, then shows a success banner
- Both error and success banners are dismissible

### Bug Fix: Skills List Not Refreshing After Delete

Deleting a skill previously required a full page refresh before the list updated.

**Root cause**: The server correctly returns `204 No Content` on DELETE, but `request()` in
`packages/dashboard/src/api/client.ts` always called `response.json()`, which throws a
`SyntaxError` on an empty body, preventing `onSuccess` from firing and TanStack Query's
`invalidateQueries` from running.

**Fix**: Added `parseResponseBody<T>(response)` helper that:
- Returns `undefined` immediately for `204` responses
- Reads body as text first; parses as JSON only when text is non-empty
- Both response paths in `request()` now use `parseResponseBody` instead of `response.json()`

### Bug Fix: Community Sync Prune — Stale Skills Removed

Community skills that were removed from the repository were not deleted from the database on the
next sync, leaving orphaned entries visible in the Community tab.

**Root cause**: `syncFromCommunity` in `packages/core/src/marketplace/manager.ts` was append-only —
it upserted new/updated skills but never deleted skills whose files had been removed.

**Fix**: After the upsert loop, the sync now reconciles the database:
1. Queries all `source='community'` skills from storage (up to 1 000 entries)
2. Deletes any entry whose `name` is not in the set of names processed during the current sync
3. Increments `CommunitySyncResult.removed` for each deletion

`CommunitySyncResult` interface updated with `removed: number`. Dashboard sync result banner updated
to display "X removed" when the count is greater than zero. `syncCommunitySkills` client function
type updated accordingly.

---

## Phase 50 — Skills JSON Export (2026-02-22)

### New Feature: Export AI-Learned Skills as Portable JSON

Users can now export individual AI-learned skills as `.skill.json` files, allowing them to back
up, share, or re-import skills on another machine or into a different Personality.

**`packages/dashboard/src/components/SkillsPage.tsx`**:
- `AI_SOURCES` constant (`Set<string>`) gates the export button to `ai_learned` and `ai_proposed` skills only
- `exportSkill(skill)` helper strips server-managed runtime fields (`id`, `createdAt`, `updatedAt`,
  `usageCount`, `lastUsedAt`, `personalityName`) and serialises the rest as
  `{ $schema: 'sy-skill/1', ...exportable }` — compatible with the `SkillCreate` contract
- Download triggered via `Blob` + `URL.createObjectURL` + programmatic `<a>` click; filename is
  derived from the skill name (`my-skill.skill.json`)
- Export button (Download icon, primary colour) added to:
  - **Personal tab** (`SkillsManager`) — between Edit and Delete
  - **Installed tab** (`InstalledSkillsTab` `renderSkill`) — between the enable/disable toggle and Delete

---

## Phase 49 — Workspaces Settings View + Full Dialog Wiring (2026-02-22)

### New Feature: Workspaces Settings Tab

A new **Workspaces** tab is added to Settings, positioned after Keys.

**`packages/dashboard/src/api/client.ts`** — 8 new workspace API functions:
- `fetchWorkspaces`, `createWorkspace`, `updateWorkspace`, `deleteWorkspace`
- `fetchWorkspaceMembers`, `addWorkspaceMember`, `updateWorkspaceMemberRole`, `removeWorkspaceMember`
- Typed `Workspace` and `WorkspaceMember` interfaces exported from the client

**`packages/dashboard/src/components/WorkspacesSettings.tsx`** (new) — Full CRUD component:
- Lists all workspaces with member count and creation date
- Inline create form (name + description)
- Inline edit (name + description in-row)
- Delete with confirmation banner
- Expandable **Members Panel** per workspace — shows all members with role badges, role
  selector, remove button; "Add" flow filters already-added users out of the dropdown
- Role icons: Owner (crown), Admin (shield), Member (user), Viewer (eye)

**`packages/dashboard/src/components/SettingsPage.tsx`**:
- `'workspaces'` added to `TabType` union
- Building2 tab button inserted after Keys
- `{activeTab === 'workspaces' && <WorkspacesSettings />}` render

### `+ New` Dialog — Workspace now fully wired

**`packages/dashboard/src/components/NewEntityDialog.tsx`**:
- Workspace tile changed from `kind: 'nav'` to `kind: 'form'` with step `'workspace'`
- Renders a sub-form (name, description) that calls `createWorkspace` directly
- Invalidates `['workspaces']` on success; shows inline error on failure

---

## Phase 48 — + New Dialog: Expanded Creation Grid (2026-02-22)

### Dashboard `+ New` Button — all creation abilities surfaced

**`packages/dashboard/src/components/NewEntityDialog.tsx`** completely rebuilt:

**Create & Configure section** — 3-column, 4-row grid. Form-based tiles (solid border,
primary icon) open a sub-form; navigate tiles (dashed border, muted icon) open the page.

| Row | Col 1 | Col 2 | Col 3 |
|-----|-------|-------|-------|
| 1 | Skill | Task | Memory → `/settings` |
| 2 | Personality | Sub-Agent | *(Coming Soon)* |
| 3 | **Proactive Trigger** | Extension | Experiment |
| 4 | User | Workspace | Custom Role |

Five new form-backed steps (all call the real API and invalidate their query keys):
- **Proactive Trigger** — mirrors `CreateTriggerForm` from `ProactivePage.tsx`: Name, Type
  (schedule/event/pattern/webhook/llm), conditional Cron/Event Type, Action Type, Approval
  Mode, Content; calls `createProactiveTrigger` → invalidates `['proactive-triggers']`
- **Extension** — mirrors `ExtensionsPage.tsx`: Extension ID, Version, Name, Hooks (one per
  line textarea parsed to `{point, semantics, priority}`); calls `registerExtension` →
  invalidates `['extensions']`
- **User** — mirrors `UsersSettings.tsx`: Email, Display Name, Password, Admin checkbox;
  calls `createUser` → invalidates `['auth-users']`
- **Sub-Agent** — name + description → navigates to `/agents?create=true&tab=profiles`
- **Custom Role** — name + description → navigates to `/settings?tab=security&create=true`

**Navigate & Create section** — 3-column, 2-row grid (all dashed, navigate directly):
Conversation, MCP Server, A2A Peer, **Report**, **Routing Rule** (`/connections?tab=routing`),
**Integration**

Dialog widened to `max-w-lg` with `max-h-[90vh] overflow-y-auto`.

---

## Phase 47 — Skill Personality Scoping + Installed Tab Sources (2026-02-22)

### Fixes

**AI-created skills show "Global" instead of personality name**

`executeCreationTool` now accepts an optional `ExecutionContext` (`personalityId`,
`personalityName`). `chat-routes.ts` passes the resolved personality when calling the executor.
`create_skill` sets `personalityId` from this context so the skill is scoped to the creating
personality and the UI shows the personality name rather than "Global".

**AI-created skill names use underscores and lowercase**

A `normalizeSkillName()` helper in `creation-tool-executor.ts` converts AI-generated names
(`my_new_skill`) to properly cased, space-separated names (`My New Skill`) before saving.

**Installed tab shows nothing**

The Installed tab previously filtered to `source === 'marketplace' || 'community'` only —
AI-created (`ai_learned`, `ai_proposed`) and user-created skills were invisible there.

Changes to `SkillsPage.tsx` `InstalledSkillsTab`:
- Shows **all** skills grouped by source: AI Created, User Created, Marketplace, Community.
- Empty state replaced with **Available Sources** cards (each shows a description; Marketplace and
  Community cards are clickable and navigate to the corresponding tab).
- `onNavigateTab` prop wired from `SkillsPage` so source cards can switch tabs directly.

---

## Phase 46 — Chat Contextual Creation Cards + Message Editing (2026-02-22)

Improves all chat contexts (dashboard, editor, integrated) with two features:

### Creation Event Contextual Cards

When a personality uses a creation tool (`create_skill`, `create_task`, `create_personality`, etc.)
during the agentic tool-execution loop, the response now includes a `creationEvents` array.
Each successful creation is rendered as a small inline card below the assistant message bubble
(Sparkles icon + label + item name), giving the user immediate confirmation of what was created.

- **`packages/core/src/ai/chat-routes.ts`**: collects `creationEvents` during the tool loop and
  attaches them to the chat response.
- **`packages/dashboard/src/types.ts`**: adds `CreationEvent` interface; `ChatMessage` and
  `ChatResponse` now carry `creationEvents?: CreationEvent[]`.
- **`packages/dashboard/src/hooks/useChat.ts`**: passes `creationEvents` from API response into
  the in-memory message state.
- **`packages/dashboard/src/components/ChatPage.tsx`**: renders creation event cards on assistant
  messages.
- **`packages/dashboard/src/components/EditorPage.tsx`**: same creation event pills in the editor
  sidebar chat.

### Message Editing (resend from edit point)

User messages now show a **pencil icon on hover**. Clicking it:
1. Populates the textarea with the original message content.
2. Shows an "Editing message" banner above the input with a cancel (×) button.
3. On send (or Enter), the conversation is truncated to just before the edited message, the new
   version is sent with the truncated history, and the assistant responds fresh.  The edited branch
   is not persisted to the existing conversation to avoid ghost messages in history.

- **`packages/dashboard/src/hooks/useChat.ts`**: exposes `resendFrom(messageIndex, newContent)` in
  `UseChatReturn`.
- **`packages/dashboard/src/components/ChatPage.tsx`**: `editingMsgIdx` state, `doSend()` router,
  `handleCancelEdit`, edit banner, send button icon switches to ✓ when in edit mode, message bubble
  gets a ring highlight while being edited.

### "Accept edits regardless of toggle state"

Both `resendFrom` and the edit UI work independently of the memory toggle — message editing is
never gated by `memoryEnabled`. The memory preference is respected for the re-sent message (brain
context recalled / saved according to the current toggle), but editing itself is always available.

---

## Phase 45 — creationConfig Tool Injection Bug Fix (2026-02-22)

Fixes a silent capability gap: when a personality had resource-creation abilities enabled via
`creationConfig` toggles (skills, tasks, personalities, subAgents, etc.), the system prompt told
the AI it had permission but no matching `Tool` definitions were ever injected into the AI's tool
list. The AI could see its permissions but had no structured function signatures to act on them.

### What changed

**`packages/core/src/soul/creation-tools.ts`** (new file):

- Defines `Tool` schemas for every `creationConfig` capability: `create_skill`, `update_skill`,
  `delete_skill`, `create_task`, `update_task`, `create_personality`, `update_personality`,
  `create_custom_role`, `assign_role`, `create_experiment`, `a2a_connect`, `a2a_send`,
  `register_dynamic_tool`, plus delegation tools (`delegate_task`, `list_sub_agents`,
  `get_delegation_result`, `create_swarm`) imported from `agents/tools.ts`.
- Exports `getCreationTools(config, bodyEnabled)` — returns only the tools for toggles that are
  `true`. Returns `[]` when `body.enabled` is `false` unconditionally.

**`packages/core/src/soul/manager.ts`** — `getActiveTools()`:

- Now resolves the personality (by `personalityId` or falls back to active) and calls
  `getCreationTools()` on its `body.creationConfig`.
- Creation tools are appended alongside existing skill-based tools so the full tool list is
  correct in every context: dashboard chat, integration messages, heartbeat, CLI, etc.
- Zero changes required in chat-routes, message-router, or any context-specific handler.

**`packages/core/src/soul/manager.test.ts`**:

- Seven new tests covering: body disabled suppresses creation tools; each major toggle injects the
  right tool names; creation tools combine correctly with skill-based tools; brain path works.

---

## Phase 44 — Heartbeat Task History & Reliability Fixes (2026-02-22)

Fixes five heartbeat-related issues: execution history not visible in the dashboard, log route
gated behind a disabled feature flag, heartbeat section hidden by default, status badges missing
in collapsed state, "never run" shown after restart despite prior runs, and a spurious memory
warning triggered by normal V8 heap behaviour.

### What changed

**`SecurityPage.tsx`** — expandable execution history per heartbeat task:

- New `HeartbeatTaskCard` component replaces the static heartbeat card rendering in `TasksTab`.
- Heartbeat Tasks section now **open by default** (was collapsed, making tasks invisible).
- Always-on `heartbeat-log-latest` query (limit 1, `refetchInterval: 30s`) populates the status
  badge in collapsed state — previously badges only appeared after expanding the card.
- Expanded state fetches `fetchHeartbeatLog({ checkName, limit: 10 })` and renders a table of
  recent executions: status icon, ran-at timestamp, duration, message, and error detail.
- Expand/collapse toggle with `ChevronDown` / `ChevronUp` and accessible `aria-label`.
- Full history query uses `enabled: expanded` and `refetchInterval: 30_000` while open.

**`brain-routes.ts` / `proactive-routes.ts` / `server.ts`** — log route always registered:

- `/api/v1/proactive/heartbeat/log` was inside `registerProactiveRoutes`, which is only called
  when `allowProactive: true` (default `false`). The route was never reachable, so `fetchHeartbeatLog`
  always silently returned `{ entries: [], total: 0 }`.
- Moved the route into `registerBrainRoutes` alongside the other heartbeat routes so it is
  registered whenever `heartbeatLogStorage` is available, independent of the proactive system.
- `HeartbeatLogStorage` added to `BrainRoutesOptions`; passed from `server.ts` at registration.
- Removed the route and `HeartbeatLogStorage` import from `proactive-routes.ts`.

**`heartbeat.ts`** — `taskLastRun` persists across restarts:

- Added `async initialize(): Promise<void>` that seeds the in-memory `taskLastRun` map from the
  most recent `heartbeat_log` row for each configured check.
- Previously restarting the process always showed "never run" even when runs had been recorded.

**`heartbeat.ts`** — memory check uses RSS threshold instead of heap ratio:

- `checkSystemHealth` previously warned when `heapUsed > heapTotal * 0.9`; V8 keeps `heapTotal`
  close to `heapUsed` by design, so this ratio almost always fires.
- Replaced with an RSS-based absolute threshold (default **512 MB**, configurable via
  `check.config.warnRssMb`).
- Message and `data` payload now include `rssMb`, `externalMb`, and heap figures.

**`heartbeat-log-storage.ts`** — BIGINT parsed correctly:

- `ran_at` (`BIGINT`) and `duration_ms` are now wrapped with `Number()` since the `pg` driver
  returns `BIGINT` columns as strings in Node.js.

**`secureyeoman.ts`**:

- `await this.heartbeatManager.initialize()` called before `start()` so `lastRunAt` is hydrated
  from the database on every startup.

### Files changed

- `packages/dashboard/src/components/SecurityPage.tsx` — open by default; always-on status badge query; `HeartbeatTaskCard` with expandable log
- `packages/core/src/brain/brain-routes.ts` — heartbeat log route moved here; `heartbeatLogStorage` added to options
- `packages/core/src/proactive/proactive-routes.ts` — heartbeat log route removed; `HeartbeatLogStorage` import removed
- `packages/core/src/gateway/server.ts` — pass `heartbeatLogStorage` to `registerBrainRoutes`; removed from proactive routes call
- `packages/core/src/body/heartbeat.ts` — `initialize()` method; RSS-based memory warning
- `packages/core/src/body/heartbeat-log-storage.ts` — `Number()` parsing for BIGINT columns
- `packages/core/src/secureyeoman.ts` — call `heartbeatManager.initialize()` before `start()`
- `packages/core/src/body/heartbeat.test.ts` — updated memory warning test to use RSS mock

---

## Phase 43 — Costs Tab Consolidated into MetricsPage (2026-02-22)

Moves the standalone **Costs** page into `MetricsPage` as a third tab, giving the metrics
dashboard a unified **Overview | Costs | Full Metrics** view. The `/costs` route now redirects to
`/metrics` for backward compatibility, and the **Costs** sidebar link is removed.

### What changed

**`MetricsPage.tsx`** — third Costs tab added:

- `type Tab` extended to `'overview' | 'costs' | 'full'`; tab bar now renders three ARIA tabs.
- `CostsTab` component (ported from `CostsPage`): internal **Summary** / **History** sub-tabs.
- `CostSummaryTab`: provider cost-breakdown cards, monthly/daily/today stats, recommendations.
- `CostHistoryTab`: date-range, provider, model, and personality filter form; cost history table
  powered by `fetchCostHistory`.
- Sub-components `CostSummaryCard` and `RecommendationCard` moved inline.
- `onViewCosts` callback (used by Overview and Full Metrics cards) switches to the Costs tab
  internally — no URL navigation required.

**Routing** (`DashboardLayout.tsx`):

| Path | Before | After |
|------|--------|-------|
| `/costs` | Rendered `CostsPage` | `<Navigate to="/metrics" replace />` |

`CostsPage` lazy import removed.

**Sidebar** (`Sidebar.tsx`):

- Costs nav item (`DollarSign`, `to="/costs"`) removed from `NAV_ITEMS_WITHOUT_AGENTS`.
- `DollarSign` import removed from `lucide-react`.

**`ResourceMonitor.tsx`**:

- `navigate('/costs')` on the Estimated Cost card updated to `navigate('/metrics')`.

### Files changed

- `packages/dashboard/src/components/MetricsPage.tsx` — Costs tab + sub-components
- `packages/dashboard/src/components/DashboardLayout.tsx` — removed `CostsPage` import; `/costs` redirect
- `packages/dashboard/src/components/Sidebar.tsx` — removed Costs nav item
- `packages/dashboard/src/components/ResourceMonitor.tsx` — updated navigate target
- `packages/dashboard/src/components/MetricsPage.test.tsx` — 7 new Costs tab tests; cost API mocks added to all `beforeEach` blocks
- `packages/dashboard/src/components/Sidebar.test.tsx` — removed 2 costs-link tests; updated "Developers hidden" anchor
- `docs/adr/106-costs-tab-in-metrics.md` — new ADR

---

## Phase 42 — Metrics Dashboard: Overview & Full Metrics Views (2026-02-22)

Replaces the old **Dashboard Overview** (`/`) with a dedicated **Metrics** page at `/metrics`,
featuring two tabs — **Overview** and **Full Metrics** — that surface all available
`MetricsSnapshot` fields through professional Recharts visualisations.

### What changed

**New `MetricsPage` component** (`packages/dashboard/src/components/MetricsPage.tsx`):

- **Overview tab** (default): six KPI stat cards, a System Health list, a combined CPU + Memory
  area sparkline, Token Usage donut pie, Task Performance progress bar, Estimated Cost card, and
  the live System Topology ReactFlow graph.
- **Full Metrics tab**: three labelled sections (Task Performance, Resource Usage, Security) with
  comprehensive charts:
  - *Tasks*: status distribution donut, duration percentiles bar (Min / Avg / p50 / p95 / p99 /
    Max colour-coded from green → red), tasks-by-type horizontal bar.
  - *Resources*: dual CPU + Memory area time-series, tokens/API health (donut + error-rate bar),
    disk utilisation, cost breakdown.
  - *Security*: auth success/failure bar, events-by-severity donut, permission denial rate,
    injection attempts, audit chain integrity badge.
- Tab switcher uses an ARIA `tablist` / `tab` / `aria-selected` pattern.
- `MetricsGraph` is lazy-loaded inside a `Suspense` boundary within `MetricsPage` to keep
  ReactFlow out of the initial parse.

**Routing updates** (`DashboardLayout.tsx`):

| Path | Before | After |
|------|--------|-------|
| `/` | Rendered embedded `OverviewPage` | Redirects to `/metrics` |
| `/metrics` | 404 → `/` | Renders `MetricsPage` |
| `*` (unmatched) | Redirected to `/` | Redirects to `/metrics` |

**Sidebar** (`Sidebar.tsx`):

- Nav item renamed **Overview → Metrics**, route updated `/ → /metrics`, icon changed
  `LayoutDashboard → BarChart2`.

**Cleanup in `DashboardLayout.tsx`**:

- Removed `OverviewPage`, `StatCard`, `ServiceStatus`, `formatUptime` (moved to `MetricsPage`).
- Removed lazy imports for `MetricsGraph` and `ResourceMonitor` (now consumed inside `MetricsPage`).

### Files changed

- `packages/dashboard/src/components/MetricsPage.tsx` — new component
- `packages/dashboard/src/components/DashboardLayout.tsx` — routing + cleanup
- `packages/dashboard/src/components/Sidebar.tsx` — nav rename + icon
- `packages/dashboard/src/components/MetricsPage.test.tsx` — 27 new tests
- `packages/dashboard/src/components/DashboardLayout.test.tsx` — updated routing tests
- `packages/dashboard/src/components/Sidebar.test.tsx` — 2 new Metrics nav tests
- `docs/adr/105-metrics-dashboard.md` — new ADR

---

## Phase 41b — Resource Creation "Enable All" Respects A2A / Swarms Policy (2026-02-22)

Fixed a bug where clicking **"Enable all"** in Personality → Body → Resource Creation did not
enable **A2A Networks** or **Agent Swarms** even when those features were permitted by the
security policy.

### What changed

- **`toggleAllCreation` in `PersonalityEditor.tsx`** — `allowA2A` and `allowSwarms` now follow
  `newValue` when toggling all on/off, subject to their respective policy gates
  (`a2aBlockedByPolicy` / `swarmsBlockedByPolicy`). Previously the two fields were always
  preserved at their current value ("not toggled by Enable All"). The fix mirrors the existing
  pattern used for `subAgents` and `allowDynamicTools`.

- **`aria-label` on Resource Creation checkboxes** — "Enable all" master toggle, individual item
  toggles, and A2A/Swarms sub-item toggles now carry `aria-label` values. Improves
  accessibility and enables reliable role-based test queries.

### Behaviour matrix

| Policy `allowA2A` | Policy `allowSwarms` | "Enable all" result |
|-------------------|----------------------|---------------------|
| `true`            | `true`               | Both enabled        |
| `true`            | `false`              | A2A enabled, Swarms blocked |
| `false`           | `true`               | A2A blocked, Swarms enabled |
| `false`           | `false`              | Both blocked        |

### Files changed

- `packages/dashboard/src/components/PersonalityEditor.tsx` — fix `toggleAllCreation`; add `aria-label` to three checkboxes
- `packages/dashboard/src/components/PersonalityEditor.test.tsx` — 4 new tests covering all matrix cases

---

## Phase 41 — ML Security Dashboard Tab (2026-02-22)

Adds an **ML** tab to the Security page that surfaces anomaly detection telemetry: a
deterministic risk score, per-category detection counts, a Recharts bar chart timeline, and a
paginated event feed filtered to ML-relevant event types. Also moves the **Tasks** tab to
immediately after Overview.

### What changed

- **`GET /api/v1/security/ml/summary?period=24h|7d|30d`** — new endpoint in `server.ts` that
  queries the audit log for `anomaly`, `injection_attempt`, `sandbox_violation`, and
  `secret_access` events, computes a 0–100 risk score, buckets events for a trend chart, and
  returns the `allowAnomalyDetection` flag. Returns a zeroed structure rather than 500 when
  audit storage is unavailable.

- **`MlSecuritySummary` + `fetchMlSummary()`** — new type and function in
  `packages/dashboard/src/api/client.ts`. `fetchSecurityEvents` extended with `type` and
  `offset` query parameters (backward-compatible).

- **`MLSecurityTab` component** (inside `SecurityPage.tsx`) — detection status banner (enabled /
  disabled), period selector, five stat cards including a color-coded risk score badge, a
  Recharts `BarChart` timeline, and a click-to-expand paginated event feed. Summary refetches
  every 30 s; event feed every 15 s.

- **Tab reorder** — new order: `Overview | Tasks | Audit Log | ML | Reports | System`.

### Files changed

- `packages/core/src/gateway/server.ts` — `GET /api/v1/security/ml/summary` endpoint
- `packages/dashboard/src/api/client.ts` — `MlSecuritySummary`, `fetchMlSummary`, extended `fetchSecurityEvents`
- `packages/dashboard/src/components/SecurityPage.tsx` — ML tab + `MLSecurityTab` component + tab reorder
- `packages/dashboard/src/components/SecurityPage.test.tsx` — `fetchMlSummary` mock + 8 ML tab tests
- `docs/adr/104-ml-security-dashboard.md` — new ADR
- `docs/api/rest-api.md` — new endpoint documented
- `docs/guides/security-testing.md` — ML detection section added

---

## Phase 40 — Personality-Scoped Chat History (2026-02-22)

Switching personalities in the Chat view now shows only that personality's conversations.
Previously, all conversations were shown regardless of which personality was active, making
multi-personality workflows confusing.

### What changed

- **`GET /api/v1/conversations` accepts `?personalityId=<id>`** — returns only conversations
  belonging to that personality (both results and total count). The unfiltered path is unchanged.

- **`ConversationStorage.listConversations()`** — gains an optional `personalityId` filter that
  adds a `WHERE personality_id = $1` clause when provided.

- **`fetchConversations()` (dashboard API client)** — forwards the new `personalityId` option
  as a query parameter.

- **`ChatPage.tsx` conversation query key** — changed from `['conversations']` to
  `['conversations', effectivePersonalityId]`. React Query fetches a fresh filtered list
  whenever the selected personality changes; previous personality lists remain cached for
  instant re-display on back-navigation.

- **Personality switch clears chat state** — clicking a different personality in the picker now
  resets the active conversation and message history so users start a fresh scoped session,
  preventing cross-personality context leakage in the UI.

### Files changed

- `packages/core/src/chat/conversation-storage.ts` — `listConversations` opts + SQL filter
- `packages/core/src/chat/conversation-routes.ts` — `personalityId` query param
- `packages/core/src/chat/conversation-storage.test.ts` — 3 new personality-filter tests
- `packages/core/src/chat/conversation-routes.test.ts` — `personalityId` param test
- `packages/dashboard/src/api/client.ts` — `fetchConversations` gains `personalityId?`
- `packages/dashboard/src/components/ChatPage.tsx` — scoped query key + clear on switch
- `docs/adr/103-personality-scoped-chat-history.md` — new ADR
- `docs/api/rest-api.md` — conversation CRUD endpoints documented; `personalityId` param added

---

## Phase 39e — Community Skills Sync: Default URL, Docker Path & Git (2026-02-22)

Fixed three gaps that prevented community skill sync from working out-of-the-box in Docker.

### What changed

- **Hardcoded default `communityGitUrl`** — `secureyeoman.ts` now falls back to
  `https://github.com/MacCracken/secureyeoman-community-skills` when neither the
  `communityGitUrl` policy field nor `COMMUNITY_GIT_URL` env var is set. Enabling
  `allowCommunityGitFetch` is now sufficient to sync the official community repo with zero
  additional configuration.

- **`COMMUNITY_REPO_PATH` baked into Docker images** — Both `Dockerfile.dev` and the production
  `Dockerfile` now set `ENV COMMUNITY_REPO_PATH=/usr/share/secureyeoman/community-skills`,
  matching the path where bundled skills are copied and where `docker-compose.yml` mounts the
  host `./community-skills` directory. Previously the process defaulted to `./community-skills`
  relative to the working dir (`/app`), which does not exist.

- **`git` installed in runtime images** — `git` is now installed via `apk` (Alpine/`Dockerfile.dev`)
  and `apt-get` (Debian/`Dockerfile`) so `gitCloneOrPull()` works without extra setup.

- **Community empty-state copy updated** — `SkillsPage.tsx` no longer tells users to configure
  `COMMUNITY_GIT_URL`. The new text reads: *"git fetch runs automatically when
  `allowCommunityGitFetch` is enabled."*

### Files changed

- `packages/core/src/secureyeoman.ts` — hardcoded default fallback for `communityGitUrl`
- `Dockerfile.dev` — `RUN apk add --no-cache git` + `ENV COMMUNITY_REPO_PATH`
- `Dockerfile` — `RUN apt-get install git` + `ENV COMMUNITY_REPO_PATH`
- `packages/dashboard/src/components/SkillsPage.tsx` — community empty-state copy
- `packages/core/src/marketplace/manager.test.ts` — two new `syncFromCommunity` tests
- `.env.example` / `.env.dev.example` — updated community section comments
- `docs/adr/076-community-git-url-fetch.md` — updated fallback list and Phase 39e corrections
- `secureyeoman_test` database created in Docker Postgres container

---

## Phase 39 — Users Settings Dashboard + UI Consistency (2026-02-22)

Added a **Users** tab to `Settings` (positioned between Keys and Roles) so operators can
manage system users entirely from the dashboard — no direct database access required.
Also aligned button and form-field styles across Settings tabs for visual consistency.

### What's new

- **`UserInfo` interface** — `id`, `email`, `displayName`, `isAdmin`, `isBuiltin`, `createdAt`,
  `lastLoginAt`
- **4 API client functions** — `fetchUsers`, `createUser`, `updateUser`, `deleteUser` hitting
  the `/auth/users` REST endpoints introduced in Phase 20a (ADR 070)
- **`UsersSettings` component** — inline create / edit / delete UI with:
  - Admin badge (yellow) for admin users
  - `built-in` badge and suppressed delete button for the system admin singleton
  - Two-step inline delete confirmation
  - Joined date and last login timestamp per row

### Tab order

```
General | Security | Keys | Users | Roles | Logs
```

### UI consistency

- **Add User** and **Create Key** header buttons switched to `btn-ghost text-sm` (matching
  **Add Custom Role**)
- **Users** and **Roles** form fields (labels, inputs, buttons) aligned to the ApiKeys style:
  `bg-muted/30` container, `text-xs text-muted-foreground` labels, `bg-background` inputs with
  `focus:ring-primary`, `btn btn-primary text-sm px-3 py-1` / `btn btn-ghost` action buttons

### Files changed

- `packages/dashboard/src/api/client.ts` — `UserInfo` + 4 API functions
- `packages/dashboard/src/components/UsersSettings.tsx` — new component
- `packages/dashboard/src/components/UsersSettings.test.tsx` — 20 unit tests
- `packages/dashboard/src/components/SettingsPage.tsx` — `users` tab wired before `roles`
- `packages/dashboard/src/components/SettingsPage.test.tsx` — 5 new tests + mock updates
- `packages/dashboard/src/components/ApiKeysSettings.tsx` — button style update
- `packages/dashboard/src/components/SecuritySettings.tsx` — `RoleForm` field style update
- `docs/adr/102-users-settings-dashboard.md` — decision record

---

## Phase 39a — Personality Model Dropdowns Grouped by Provider (2026-02-22)

The **Default Model** and **Model Fallbacks** dropdowns in Personality > Edit/Create Personality > Soul
now group models by provider using `<optgroup>` elements, matching the style used in Security Settings
and the New Entity dialog. Model names are displayed without the `provider/` prefix since the group
label already identifies the provider.

### What changed

- **Default Model select** — flat option list replaced with `<optgroup>` per provider; empty groups
  are never rendered; model options show only the model name
- **Model Fallbacks select** — same grouping; providers whose models are all already selected (as
  default or as existing fallbacks) are omitted from the list entirely
- Provider labels use the same friendly map as `SecuritySettings`:
  Anthropic, OpenAI, Gemini, Ollama (Local), OpenCode (Zen), LM Studio (Local), LocalAI (Local),
  DeepSeek, Mistral

### Files changed

- `packages/dashboard/src/components/PersonalityEditor.tsx` — updated two selects

---

## Phase 39d — Built-in Trigger Explanations Restored (2026-02-22)

The **Built-in Triggers** card on the Proactive > Overview tab now shows a **When** and
**Produces** explanation for each of the five known built-in triggers, describing when they
fire and what output they generate.

### Explanations added

| Trigger | When | Produces |
|---|---|---|
| **Daily Standup Reminder** | Fires each morning on a configurable schedule (default 09:00) | Brief check-in message with tasks, blockers, and priorities |
| **Weekly Summary** | Fires once a week (Monday morning or Friday afternoon) | Digest of the week's conversations, decisions, and open action items |
| **Contextual Follow-up** | Fires when a conversation ended without a clear resolution | Resurfaces the unfinished thread for continuation or closure |
| **Integration Health Alert** | Fires when a connected integration reports an error | Alert with affected integration name, last error, and remediation steps |
| **Security Alert Digest** | Fires on a configurable cadence when new security events exist | Summary of audit events, anomaly detections, and policy violations |

### Implementation

- `BUILTIN_EXPLANATIONS` static map keyed by trigger `id` (matches the camelCase builtin keys)
- Each trigger card conditionally renders a bordered `When` / `Produces` block when a matching
  explanation exists; unknown/future builtins degrade gracefully showing only name and description

### Files changed

- `packages/dashboard/src/components/ProactivePage.tsx` — `BUILTIN_EXPLANATIONS` map + updated trigger card rendering
- `packages/dashboard/src/components/ProactivePage.test.tsx` — 2 new tests: known builtin shows explanation; unknown builtin degrades gracefully

---

## Phase 39c — Sidebar Nav Order: Costs Above Developers (2026-02-22)

Corrected the sidebar navigation order so **Costs** always appears above **Developers**.
Previously Costs was listed after Developers; since Developers is conditionally shown
(requires extensions, experiments, or storybook to be enabled), having Costs below it
produced an inconsistent ordering.

### What changed

- `NAV_ITEMS_WITHOUT_AGENTS` — swapped `Costs` and `Developers` entries so Costs precedes
  Developers in the static list; the existing filter logic is unchanged

### Files changed

- `packages/dashboard/src/components/Sidebar.tsx` — reordered two nav items
- `packages/dashboard/src/components/Sidebar.test.tsx` — new test file with 4 tests:
  Costs above Developers when both visible; Costs present when Developers hidden;
  Developers hidden with no developer features; Developers shown when `allowExtensions` true

---

## Phase 39b — Active Hours Moved to Brain Section (2026-02-22)

The **Active Hours** subsection in Personality > Edit/Create Personality was misclassified under
Body. It now lives inside the **Brain — Intellect** section, after Skills, since it governs the
brain's scheduling schedule (when heartbeat checks and proactive triggers fire), not the body's
physical capabilities.

### What changed

- `BrainSection` gains `activeHours` + `onActiveHoursChange` props; the Active Hours
  `<CollapsibleSection>` is rendered inside Brain, after Skills
- `BodySectionProps` and `BodySection` no longer own `activeHours` / `onActiveHoursChange`
- Render site passes `activeHours` state to `BrainSection` instead of `BodySection`
- Section label simplified from `"Active Hours — Brain Schedule"` to `"Active Hours"`
- Two new tests added: one asserting Active Hours appears in the Brain section, one verifying
  the enable toggle reveals the time/day/timezone fields

### Files changed

- `packages/dashboard/src/components/PersonalityEditor.tsx` — moved Active Hours to BrainSection
- `packages/dashboard/src/components/PersonalityEditor.test.tsx` — 2 new tests

---

## Phase 38 — LLM Response Caching (2026-02-22)

Added an in-memory, TTL-keyed response cache to `AIClient`. Identical non-streaming requests
(same provider, model, messages, temperature, tool set) are served from the cache instead of
making a live API call. Primary use-case: heartbeat probes on aggressive schedules that
repeatedly pay for identical API calls.

### How it works

- Keyed by SHA-256 of `{ provider, model, messages, temperature, maxTokens, toolNames }`.
- In-memory `Map` with configurable TTL (default **5 minutes**) and max entries (default **500**).
- Eviction: TTL checked on `get()`; FIFO eviction when `maxEntries` is reached.
- Cache hits are audit-logged as `ai_cache_hit`; token counters are not incremented.
- Streaming (`chatStream()`) and fallback responses are never cached.
- **Off by default** — enable via `model.responseCache.enabled: true` in config.

### Configuration

```yaml
model:
  responseCache:
    enabled: true    # off by default
    ttlMs: 300000    # 5 minutes
    maxEntries: 500
```

### Files changed

- `packages/core/src/ai/response-cache.ts` — new `ResponseCache` class
- `packages/core/src/ai/response-cache.test.ts` — unit tests
- `packages/core/src/ai/client.ts` — cache check/store in `chat()`, `getCacheStats()`
- `packages/core/src/ai/client.test.ts` — cache integration tests
- `packages/core/src/ai/index.ts` — exports `ResponseCache`, `CacheStats`
- `packages/shared/src/types/config.ts` — `ResponseCacheConfigSchema`, `ResponseCacheConfig`
- `packages/shared/src/types/index.ts` — exports `ResponseCacheConfigSchema`, `ResponseCacheConfig`
- `docs/adr/101-llm-response-caching.md` — decision record
- `docs/development/roadmap.md` — item removed (completed)

---

## Phase 37 — BullShift MCP Trading Tools (2026-02-22)

Added 5 MCP tools to `@secureyeoman/mcp` that connect to the BullShift trading platform's new REST API server, enabling any MCP client to query positions and submit trades through natural language.

### New tools (`packages/mcp/src/tools/trading-tools.ts`)

| Tool | Description |
|---|---|
| `bullshift_health` | Verify BullShift API server is reachable |
| `bullshift_get_account` | Account balance, available funds, margin |
| `bullshift_get_positions` | All open positions with P&L |
| `bullshift_submit_order` | Place market/limit/stop/stop-limit orders |
| `bullshift_cancel_order` | Cancel an open order by ID |

All tools go through the standard middleware stack (rate limiter, input validator, audit logger, secret redactor).

### Files changed

- `packages/mcp/src/tools/trading-tools.ts` — new tool file
- `packages/mcp/src/tools/trading-tools.test.ts` — registration + error-path tests
- `packages/mcp/src/tools/index.ts` — registered `registerTradingTools`
- `docs/adr/100-bullshift-mcp-trading-tools.md` — decision record
- `docs/guides/bullshift-trading-tools.md` — integration guide

### Configuration

Set `BULLSHIFT_API_URL` (default `http://localhost:8787`) in the MCP service environment.

---

## Phase 36 — Coverage Push to 87%+ (2026-02-22)

Raised `@secureyeoman/core` vitest coverage thresholds and added targeted tests across the highest-gap files to meet them. Total test count across all packages grew from ~6744 to **7071**.

### Coverage achieved (`@secureyeoman/core`)

| Metric | Before | After | Threshold |
|--------|--------|-------|-----------|
| Lines | 84% | **87.94%** | 87% ✓ |
| Functions | 85% | **88.14%** | 87% ✓ |
| Statements | 85% | **87.58%** | 87% ✓ |
| Branches | 71% | **75.15%** | 75% ✓ |

### Test files extended

- `src/ai/chat-routes.test.ts` — MCP tool gathering, context compaction trigger/error, model fallback and history filtering branches
- `src/agents/manager.test.ts` — binary profile spawn (success, non-zero exit, ENOENT), MCP tool dispatch, recursive `delegate_task`, AI-throws path, mcp-bridge invalid JSON
- `src/soul/skill-scheduler.test.ts` — `activeHours` normal window, `executeScheduledSkill` success/failure via `vi.spyOn`, past `startAt` interval calculation

### Threshold config updated

- `packages/core/vitest.config.ts` — thresholds: `lines/functions/statements: 87`, `branches: 75`

### Files changed

- `packages/core/src/ai/chat-routes.test.ts`
- `packages/core/src/agents/manager.test.ts`
- `packages/core/src/soul/skill-scheduler.test.ts`
- `packages/core/vitest.config.ts`
- `README.md` — test badge updated to 7071
- `docs/development/roadmap.md` — coverage and regression items marked complete

---

## Phase 36 — Memory Baseline + Startup Time Tests (2026-02-21)

Closes the startup-time and memory-baseline items in the Phase 36 Final Inspection checklist.

### Memory baseline — `packages/core/src/memory-baseline.test.ts` (new)

Process-level integration test that:

1. Applies all DB migrations in-process (`beforeAll`) — child takes the fast-path.
2. Spawns `tsx src/cli.ts start --log-level error` as a real child process.
3. Polls `/health` until `status:ok`, then waits 1 s for post-init allocations to settle.
4. Reads `VmRSS` from `/proc/<pid>/status` (same value as `process.memoryUsage().rss`).
5. Asserts RSS < 300 MB.

**Observed result:** **68.9 MB RSS** — 77% below the 300 MB budget. Vitest timeout 16 s (10 s startup + 1 s settle + 5 s buffer).

### Startup time — `packages/core/src/startup-time.test.ts` (new)

`packages/core/src/startup-time.test.ts` (new) — process-level integration test that:

1. Applies all DB migrations in-process (`beforeAll`) so the child takes the migration fast-path (single `SELECT` with no advisory lock).
2. Spawns `tsx src/cli.ts start --log-level error` as a real child process with a synthetic but valid set of required environment variables.
3. Polls `GET http://127.0.0.1:19191/health` every 100 ms until `{ status: 'ok' }` is returned.
4. Asserts wall-clock elapsed time < 10 000 ms.
5. Kills the child with SIGTERM (SIGKILL fallback after 2 s) in `finally`.

**Observed result:** 2.37 s wall-clock on a local dev machine with the test database already migrated (fast-path active). Vitest timeout set to 15 s (10 s budget + 5 s breathing room for spawn/teardown overhead).

**Requires:** PostgreSQL reachable via `TEST_DB_* / DATABASE_* / POSTGRES_PASSWORD` env vars (same as `runner.test.ts`).

### Files changed

- `packages/core/src/startup-time.test.ts` (new)
- `docs/development/roadmap.md` — startup-time item marked `[x]`

---

## Phase 35 — Outbound Credential Proxy at Sandbox Boundary (2026-02-21)

Closes the last functional-audit gap versus Ironclaw (ADR 099). The "Outbound Network Proxy" row in `docs/development/functional-audit.md` moves from ❌ to ✅.

### Design rationale

Sandboxed processes previously received secrets as environment variables, which are visible to any code running inside the process and appear in `/proc/self/environ` on Linux. The `CredentialProxy` eliminates this exposure: credentials are held exclusively in the **parent** process; sandboxed children receive only `http_proxy=http://127.0.0.1:PORT`.

- **Plain HTTP** — proxy validates target hostname against the allowlist, injects the matching credential header, forwards the request, and pipes the response back. Returns `403` for blocked hosts.
- **HTTPS CONNECT** — proxy validates hostname and creates a raw TCP tunnel. Header injection is not possible inside TLS; allowlist enforcement provides defence-in-depth.
- Credential-rule hosts are implicitly added to the allowlist.
- Proxy lifecycle managed by `SandboxManager.startProxy()` / `stopProxy()`, URL surfaced in `getStatus()`.
- Policy toggle `sandboxCredentialProxy` in the Security Policy (dashboard Sandbox Isolation card, CLI, REST API).

### Files changed

- `packages/core/src/sandbox/credential-proxy.ts` (new) — `CredentialProxy` class
- `packages/core/src/sandbox/credential-proxy.test.ts` (new) — 10 unit tests
- `packages/core/src/sandbox/manager.ts` — `startProxy`, `stopProxy`, `getStatus` (adds `credentialProxyUrl`)
- `packages/core/src/sandbox/index.ts` — re-exports `CredentialProxy`, `CredentialProxyHandle`, `CredentialRule`, `CredentialProxyConfig`
- `packages/core/src/sandbox/types.ts` — `credentialProxy?` in `SandboxCapabilities`
- `packages/shared/src/types/config.ts` — `SandboxProxyCredentialSchema`, `credentialProxy` sub-object in `SandboxConfigSchema`, `sandboxCredentialProxy` in `SecurityConfigSchema`
- `packages/core/src/secureyeoman.ts` — `sandboxCredentialProxy` in `updateSecurityPolicy` + `policyKeys`
- `packages/core/src/gateway/server.ts` — `sandboxCredentialProxy` in GET/PATCH policy + sandbox status
- `packages/core/src/cli/commands/policy.ts` — `sandboxCredentialProxy` in `ALL_POLICY_FLAGS`
- `packages/dashboard/src/api/client.ts` — `sandboxCredentialProxy` in `SecurityPolicy` + fallback
- `packages/dashboard/src/components/SecuritySettings.tsx` — `PolicyToggle` in Sandbox Isolation card
- `packages/dashboard/src/components/SecuritySettings.test.tsx` — mock policy field
- `docs/adr/099-sandbox-credential-proxy.md` (new)
- `docs/development/roadmap.md` — bullet marked `[x]`
- `docs/development/functional-audit.md` — Outbound Network Proxy row ❌ → ✅
- `docs/configuration.md` — `security.sandbox.credentialProxy` section
- `README.md` — Outbound Credential Proxy in security feature list
- `docs/guides/security-testing.md` — proxy verification note

---

## Hotfix — Group Chat schema-qualification bug (2026-02-21)

Discovered during cold-start memory baseline check: migration 030 (`030_group_chat.sql`) and `GroupChatStorage` referenced bare table names `messages` and `integrations`, which do not exist in PostgreSQL's default `public` search path. The actual tables live in the `integration` schema. This caused a fatal `relation "messages" does not exist` error on any fresh database, preventing the server from starting.

**Root cause:** Missing `integration.` schema prefix on all table references added in Phase 31 (Group Chat View, ADR 087).

**Impact:** Cold-start on a fresh database; existing databases with migrations already applied were unaffected at runtime (the migration was already recorded as applied, so the broken SQL was never re-executed). The `GroupChatStorage` runtime queries would also fail on any unqualified `messages` reference in the existing schema.

**Fix:**
- All `messages` → `integration.messages` and `integrations` → `integration.integrations` in migration and storage class
- `group_chat_pins` table moved to `integration` schema in the migration
- `dist/migrations/030_group_chat.sql` updated alongside source

**Tests added:** `packages/core/src/integrations/group-chat-storage.test.ts` — 16 test cases covering `listChannels()` and `listMessages()`, including schema-qualification assertions.

**Files changed:**
- `packages/core/src/storage/migrations/030_group_chat.sql` — schema-qualified table names
- `packages/core/src/integrations/group-chat-storage.ts` — schema-qualified SQL; ADR reference corrected (086 → 087)
- `packages/core/src/integrations/group-chat-storage.test.ts` (new)
- `dist/migrations/030_group_chat.sql` — dist copy updated
- `docs/adr/087-group-chat-view.md` — Amendment 1

---

## Phase 34 Complete — Agnostic A2A Bridge + Auto-Start Toggle (2026-02-21)

Closes the remaining two items from the Agnostic QA Sub-Agent Team future-enhancements list (ADR 090 Amendment 2).

### AGNOSTIC_AUTO_START — one-command launch

`secureyeoman start` now optionally brings up the Agnostic Docker stack before printing the gateway banner.

Set `AGNOSTIC_AUTO_START=true` in your environment. The start command reuses the same path-resolution logic as `secureyeoman agnostic start`:
1. `AGNOSTIC_PATH` env var
2. `../agnostic` (sibling directory)
3. `~/agnostic`, `~/Repos/agnostic`, `~/Projects/agnostic`

Compose failure is non-fatal — a warning is logged and the gateway starts regardless. `resolveAgnosticPath()` and `compose()` are now exported from `agnostic.ts` for reuse.

**Files changed:**
- `packages/core/src/cli/commands/agnostic.ts` — exported `resolveAgnosticPath` and `compose`
- `packages/core/src/cli/commands/start.ts` — auto-start logic + `AGNOSTIC_AUTO_START` in help text
- `packages/core/src/cli/commands/start.test.ts` — 6 new test cases

### agnostic_delegate_a2a — A2A protocol delegation

New MCP tool `agnostic_delegate_a2a` sends a structured `a2a:delegate` message to Agnostic's A2A receive endpoint (`POST /api/v1/a2a/receive`). The payload carries all standard QA task fields. On a 404 response (Agnostic P8 not yet implemented), the tool returns the prepared message as guidance rather than a silent error.

`A2AManager.addTrustedLocalPeer()` registers a pre-configured local service as a trusted A2A peer without the SSRF guard. `POST /api/v1/a2a/peers/local` REST endpoint wraps it for runtime registration.

Agnostic P8 (`POST /api/v1/a2a/receive`) is documented in `agnostic/TODO.md`.

**Files changed:**
- `packages/mcp/src/tools/agnostic-tools.ts` — `agnostic_delegate_a2a` (10th Agnostic MCP tool)
- `packages/mcp/src/tools/agnostic-tools.test.ts` — 5 new test cases
- `packages/core/src/a2a/manager.ts` — `addTrustedLocalPeer()` method
- `packages/core/src/a2a/a2a-routes.ts` — `POST /api/v1/a2a/peers/local` route
- `docs/adr/090-agnostic-qa-sub-agent-team.md` — Amendment 2 (2026-02-21)
- `agnostic/TODO.md` — P8 A2A receive endpoint spec

---

## Phase 35 — Ironclaw Security & Architecture Improvements, Medium Priority (2026-02-21)

Four medium-priority items from the Ironclaw comparative analysis completed:

### Hybrid FTS + Vector Search with Reciprocal Rank Fusion (ADR 095)

`packages/core/src/storage/migrations/029_fts_rrf.sql` — adds `search_vec tsvector` columns to `brain.memories` and `brain.knowledge` with GIN indexes and auto-maintenance triggers.

`packages/core/src/brain/storage.ts` — new `queryMemoriesByRRF()` and `queryKnowledgeByRRF()` methods run both a `tsvector @@ to_tsquery` FTS query and a `pgvector` cosine similarity query, then merge results via RRF (`score = Σ 1/(60 + rank_i)`). Both degrade gracefully when `search_vec` is NULL (pre-migration rows) or when no embedding is available.

`packages/core/src/brain/manager.ts` — `recall()` now uses hybrid RRF first, falls back to pure vector search, then to ILIKE text search. Improves recall for exact terms, named entities, and command strings that are poorly served by pure vector search.

### Content-Chunked Workspace Indexing (ADR 096)

`packages/core/src/brain/chunker.ts` — new `chunk(content, options?)` function splits documents at paragraph/sentence boundaries within an 800-token budget with 15% overlap. Returns `DocumentChunk[]` with index, text, and estimated token count.

`packages/core/src/storage/migrations/030_document_chunks.sql` — new `brain.document_chunks` table stores per-chunk content with FTS vector (`search_vec`) and optional pgvector `embedding` column. Includes GIN + HNSW indexes and a FTS maintenance trigger.

`packages/core/src/brain/storage.ts` — new `createChunks()`, `deleteChunksForSource()`, `updateChunkEmbedding()`, and `queryChunksByRRF()` methods.

`packages/core/src/brain/manager.ts` — `remember()` and `learn()` chunk content longer than 200 characters (best-effort, no failure if table unavailable). `forget()` and `deleteKnowledge()` clean up orphaned chunks.

### Proactive Context Compaction (ADR 097)

`packages/core/src/ai/context-compactor.ts` — new `ContextCompactor` class estimates token usage before each LLM call using a `~4 chars/token` heuristic. Triggers compaction at 80% of the model's context-window size (configurable via `thresholdFraction`). Summarises older turns via a caller-provided `summariser` callback; preserves the last `preserveRecentTurns` turns verbatim; injects a `[Context summary: …]` system message.

Model context-window registry covers Anthropic (200 k), OpenAI (128 k), Gemini (1 M), Grok (131 k), DeepSeek (64 k), and Mistral (32 k) models. Unknown models fall back to a conservative 8 192-token default.

`packages/core/src/ai/chat-routes.ts` — wired before every `aiClient.chat()` call. On failure, compaction is best-effort and the request proceeds uncompacted with a warn log.

### Self-Repairing Task Loop (ADR 098)

`packages/core/src/ai/task-loop.ts` — new `TaskLoop` class tracks tool-call history per agent session and detects two stuck conditions:

| Condition | Default threshold |
|-----------|------------------|
| Timeout | 30 000 ms |
| Tool-call repetition | 2 consecutive identical calls |

`buildRecoveryPrompt(reason)` generates a diagnostic message — elapsed time, last tool, last outcome — to inject as a `user` turn before the next LLM call. The model receives diagnostic context rather than repeating the same failed reasoning.

Exported from `packages/core/src/ai/index.ts` alongside `RetryManager` for use in task handlers and agent loops.

### Files changed

- `packages/core/src/storage/migrations/029_fts_rrf.sql` (new)
- `packages/core/src/storage/migrations/030_document_chunks.sql` (new)
- `packages/core/src/brain/chunker.ts` (new)
- `packages/core/src/brain/chunker.test.ts` (new)
- `packages/core/src/ai/context-compactor.ts` (new)
- `packages/core/src/ai/context-compactor.test.ts` (new)
- `packages/core/src/ai/task-loop.ts` (new)
- `packages/core/src/ai/task-loop.test.ts` (new)
- `packages/core/src/brain/storage.ts` — `queryMemoriesByRRF`, `queryKnowledgeByRRF`, `createChunks`, `deleteChunksForSource`, `updateChunkEmbedding`, `queryChunksByRRF`
- `packages/core/src/brain/manager.ts` — hybrid RRF recall, chunk-on-save, chunk-on-delete
- `packages/core/src/ai/chat-routes.ts` — proactive context compaction wired in
- `packages/core/src/ai/index.ts` — `ContextCompactor`, `TaskLoop` exported
- `docs/adr/095-hybrid-fts-rrf.md` (new)
- `docs/adr/096-content-chunked-indexing.md` (new)
- `docs/adr/097-proactive-context-compaction.md` (new)
- `docs/adr/098-self-repairing-task-loop.md` (new)
- `docs/development/roadmap.md` — medium items marked complete; low-priority items moved to Future Features

---

## T.Ron — Personality Presets (2026-02-21)

Introduces a built-in personality preset system with **T.Ron** as the first curated security-focused personality alongside the existing FRIDAY default.

### Personality Presets

`packages/core/src/soul/presets.ts` — a new `PERSONALITY_PRESETS` catalogue of static personality templates that can be instantiated into the database.

Each `PersonalityPreset` carries: a stable `id` slug, `name`, human-readable `summary`, and the full `PersonalityCreate` `data` payload used when instantiating.

**Built-in presets:**

| ID | Name | Purpose |
|----|------|---------|
| `friday` | FRIDAY | Friendly, Reliable, Intelligent Digitally Adaptable Yeoman — the default helpful assistant |
| `t-ron` | T.Ron | Tactical Response & Operations Network — communications monitor, MCP watchdog, and guardian against rogue AI incursions |

### T.Ron — Security Watchdog Personality

T.Ron is purpose-built for adversarial vigilance:

- **Communications monitor** — flags prompt injection, unexpected privilege escalation, and out-of-context tool calls before they reach the LLM.
- **MCP guardian** — validates every MCP server tool call against the user's stated intent; alerts when tool outputs contain embedded instructions.
- **Rogue-AI defence** — refuses instructions embedded in tool outputs, web pages, or external data unless explicitly authorised by the verified user; surfaces and reports any takeover attempt.
- **Minimal footprint** — prefers read-only operations; challenges broad permission requests.

Proactive config defaults: `integrationHealthAlert: true`, `securityAlertDigest: true`, autonomous learning disabled (`enabled: false`), minimum confidence threshold raised to `0.9`.

### API

Two new endpoints added to `soul-routes.ts`:

| Method | Endpoint | Description |
|--------|----------|-------------|
| `GET` | `/api/v1/soul/personalities/presets` | List all built-in presets |
| `POST` | `/api/v1/soul/personalities/presets/:id/instantiate` | Create a personality from a preset (body overrides optional) |

### `SoulManager` additions

- `listPersonalityPresets()` — returns the full `PERSONALITY_PRESETS` array.
- `createPersonalityFromPreset(presetId, overrides?)` — merges overrides onto the preset data and delegates to `storage.createPersonality()`.

### Exports

`soul/index.ts` now re-exports `PERSONALITY_PRESETS`, `getPersonalityPreset`, and `PersonalityPreset` from `presets.ts`.

### Files changed

- `packages/core/src/soul/presets.ts` (new)
- `packages/core/src/soul/manager.ts` — `listPersonalityPresets()` + `createPersonalityFromPreset()`
- `packages/core/src/soul/soul-routes.ts` — two new preset endpoints
- `packages/core/src/soul/index.ts` — preset exports
- `packages/core/src/soul/soul-routes.test.ts` — preset endpoint coverage
- `docs/api/rest-api.md` — preset endpoint documentation

---

## Phase 35 — Ironclaw Security Hardening & TUI (2026-02-21)

Three items from the Phase 35 high-priority backlog closed:

### ToolOutputScanner — credential leak detection (ADR 092)

`packages/core/src/security/tool-output-scanner.ts` — a new scanner that redacts credentials from LLM responses before they reach the caller.

- **18 built-in patterns:** OpenAI / Anthropic API keys, GitHub PAT variants (`ghp_`, `github_pat_`, `gho_`, `ghs_`, `ghr_`), AWS access key IDs and secret assignments, PEM private key blocks, database connection strings (PostgreSQL, MySQL, MongoDB, Redis, AMQP), `Authorization: Bearer` headers, JWTs, Slack tokens, Stripe keys, Twilio tokens, Discord bot tokens, generic `api_key=` assignments, GCP service account JSON fields.
- **SecretStore integration:** `createScannerWithSecrets()` accepts known secrets from the keyring and generates literal-match patterns automatically — no manual pattern maintenance for managed secrets.
- **Integration:** `chat-routes.ts` scans every LLM response with `scanner.scan(response.content, 'llm_response')` before returning it to the caller. Matches are replaced with `[REDACTED:<type>]` and a `warn` log entry is emitted.
- **Tests:** 35+ test cases in `tool-output-scanner.test.ts`.

### Skill Trust Tiers — community skills read-only (ADR 092)

`packages/core/src/soul/skill-trust.ts` — `applySkillTrustFilter(tools, source)` gates tool access by skill source.

| Source | Tool access |
|--------|-------------|
| `user` / `ai_proposed` / `ai_learned` / `marketplace` | Full |
| `community` | Read-only (26 name-prefix allow-list) |

- `SoulManager.getActiveTools()` and `BrainManager.getActiveTools()` both call `applySkillTrustFilter()` per skill before accumulating the final tool list.
- Community skill *instructions* still inject into the system prompt normally — only the available tool set is restricted.
- Tests: `skill-trust.test.ts` covers full-access sources, community filtering, mixed sets, and `isReadOnlyTool()` prefix logic.

### TUI — full-screen terminal dashboard (ADR 093)

`secureyeoman tui` (alias: `dashboard`) — a zero-dependency, full-screen terminal dashboard.

**Panels:** header bar (brand, server URL), live status pane (health, uptime, active personality, model/provider), scrollable chat history with word-wrap, input bar with live cursor.

**Key bindings:** `Enter` send, `Ctrl+R` refresh status, `Ctrl+L` clear chat, `↑↓` / `Page Up/Down` scroll, `Ctrl+C` / `q` quit.

**Implementation:** Node.js `readline` + ANSI escape codes only — no new npm dependencies. Alternate screen buffer preserves terminal history. Non-TTY environments receive a clear error. Status polled every 30 s; `conversationId` preserved across chat turns.

### Files changed

- `packages/core/src/security/tool-output-scanner.ts` (new)
- `packages/core/src/security/tool-output-scanner.test.ts` (new)
- `packages/core/src/soul/skill-trust.ts` (new)
- `packages/core/src/soul/skill-trust.test.ts` (new)
- `packages/core/src/cli/commands/tui.ts` (new)
- `packages/core/src/ai/chat-routes.ts` — scanner integration
- `packages/core/src/soul/manager.ts` — `getActiveTools()` trust filter
- `packages/core/src/brain/manager.ts` — `getActiveTools()` trust filter
- `packages/core/src/cli.ts` — `tuiCommand` registered
- `docs/adr/092-tool-output-scanner-skill-trust-tiers.md` (new)
- `docs/adr/093-tui-terminal-dashboard.md` (new)
- `docs/development/roadmap.md` — high-priority items marked complete

---

## Roadmap Cleanup (2026-02-21)

Removed all completed `[x]` items from `docs/development/roadmap.md` — open items only, per the file's stated policy. Corrected the duplicate "Phase 35" heading: Final Inspection is now correctly labelled **Phase 36** (matching the timeline table). All removed items were already documented in prior changelog entries:

| Removed item | Changelog entry |
|---|---|
| Format / Typecheck / Lint passing | Phase 33 Quality Gate Closed |
| `POST /api/tasks`, API key auth, webhook callbacks (Agnostic) | Agnostic QA Sub-Agent Team — Full Integration Complete |
| Routing-focused descriptions on community skills | Community Skill Routing Descriptions |
| `triggerPatterns` hygiene pass on community skills | `triggerPatterns` Hygiene Pass — Full Pipeline Wiring |
| Presence Indicators + CRDT | Phase 26: Real-Time Collaboration |

---

## `triggerPatterns` Hygiene Pass — Full Pipeline Wiring (2026-02-21)

`triggerPatterns` now flows end-to-end from community skill JSON files through the marketplace catalog into installed brain skills, and all 29 community skills (11 bundled + 18 external) ship with 5 concrete patterns each.

### What changed

**Pipeline wiring (was broken)**

| Layer | Before | After |
|-------|--------|-------|
| `MarketplaceSkillSchema` | No `triggerPatterns` field | `z.array(z.string().max(500)).default([])` |
| `marketplace.skills` DB | No column | `trigger_patterns JSONB DEFAULT '[]'` (migration 032) |
| `marketplace/storage.ts` | Not written/read | INSERT, UPDATE, `rowToSkill` all handle `triggerPatterns` |
| `syncFromCommunity()` | Field silently dropped | Mapped from JSON `triggerPatterns` array |
| `install()` | Not forwarded | Passed to `SkillCreateSchema.parse()` |

Migration `032_marketplace_trigger_patterns.sql` was added and registered in `manifest.ts` (which also backfilled the missing `030_group_chat` and `031_routing_rules` manifest entries).

**Community skills — 5 patterns each**

- All 11 bundled skills in `community-skills/skills/` updated
- All 18 external skills in `secureyeoman-community-skills/skills/` updated (7 previously description-only skills also received routing descriptions)
- Both `skill.schema.json` files updated to declare `triggerPatterns` as a valid property

**How `isSkillInContext()` uses them**

Each pattern is compiled as a case-insensitive `RegExp` and tested against the user message. A match injects the skill's instructions into the system prompt for that turn. If the array is empty, the engine falls back to substring matching on the skill name — accurate but coarser.

### Files changed

- `packages/shared/src/types/marketplace.ts` — `MarketplaceSkillSchema` + `triggerPatterns`
- `packages/core/src/storage/migrations/032_marketplace_trigger_patterns.sql` (new)
- `packages/core/src/storage/migrations/manifest.ts` — 030, 031, 032 entries
- `packages/core/src/marketplace/storage.ts` — INSERT / UPDATE / rowToSkill
- `packages/core/src/marketplace/manager.ts` — syncFromCommunity + install
- `community-skills/schema/skill.schema.json` + all 11 bundled skill JSONs
- `secureyeoman-community-skills/schema/skill.schema.json` + all 18 external skill JSONs
- `community-skills/README.md` — `triggerPatterns` authoring guide
- `docs/adr/063-community-skills-registry.md` — JSON schema contract updated
- `docs/development/roadmap.md` — item marked done

---

## Community Skill Routing Descriptions (2026-02-21)

All 11 community skill descriptions rewritten with explicit routing guidance, inspired by [OpenAI's Skills + Shell Tips](https://developers.openai.com/blog/skills-shell-tips/) blog post. The core insight: Glean improved skill routing accuracy from 73% → 85% by changing descriptions from "what it does" to "Use when / Don't use when" contracts.

The skill catalog in `composeSoulPrompt` emits `- **Name**: Description` for every enabled skill. These one-liners are the model's routing signal — every character counts. Old descriptions said what a skill is; new descriptions tell the model when to fire it and, critically, when to leave it alone.

| Skill | Change summary |
|-------|---------------|
| Code Reviewer | Added "Use when: PR/diff/function review. Don't use when: writing new code, debugging runtime errors." |
| Git Assistant | Added "Use when: commit message, branching, conflict resolution. Don't use when: code debugging, CI setup." |
| SQL Expert | Added "Use when: query writing/optimization/schema. Don't use when: ORM issues, non-SQL databases." |
| Universal Script Assistant | Clarified scope (narrative scripts only). Added "Don't use when: code scripts, shell, automations." |
| Email Composer | Added "Use when: email drafting/editing. Don't use when: social posts, long-form docs, chat." |
| Meeting Summarizer | Added "Use when: transcript/notes input. Don't use when: non-meeting content." |
| Recruiting Expert | Condensed long description. Added "Don't use when: general professional docs not related to hiring." |
| Technical Writer | Added "Use when: feature/API/system documentation. Don't use when: emails, meeting summaries." |
| Security Researcher | Added "Don't use when: live attacks/scanning — use sec_* MCP tools for that." |
| Data Formatter | Added "Use when: format conversion/validation. Don't use when: scale data processing, database queries." |
| Regex Builder | Added "Don't use when: full parsers, general string transformations." |

A new **Skill Routing Quality** section has been added to `docs/development/roadmap.md` Future Features with 7 further tasks: `triggerPatterns` hygiene pass, `useWhen`/`doNotUseWhen` schema fields, `successCriteria`, `mcpToolsAllowed` per-skill tool gating, explicit routing mode, invocation accuracy telemetry, and output directory convention.

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
