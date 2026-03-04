# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

- [ ] enterprise department per - what other business units can we provide tools for, additonal skills/worksflows/swarms/security, legal, business risks are already covers as will as intents; where else can we improve

## Phase XX: QA & Manual Testing (Ongoing)

**Priority**: P0 — Ongoing. Continuous verification of features that lack automated integration coverage. Items move to Changelog when confirmed working; new regressions are added here as discovered.

### Manual Tests — Authentication & Multi-Tenancy

- [ ] **SAML SP flow** — Configure SimpleSAMLphp (or mock). (1) `GET /api/v1/auth/sso/saml/:id/metadata` returns valid `<md:EntityDescriptor>` XML. (2) `GET /api/v1/auth/sso/authorize/:id` redirects to IdP with SAMLRequest. (3) Post-IdP redirect hits ACS, returns JWT in URL fragment.
- [ ] **RLS tenant isolation** — Create tenant B via API. Insert `soul.personality` scoped to tenant B. Query personalities as tenant A → empty. Query as tenant B → record visible. Existing default-tenant data unaffected.
- [ ] **OAuth token refresh end-to-end** — (1) Connect a Gmail account; (2) Wait for access token to expire (or use Connections → OAuth → "Refresh Token" button); (3) Confirm personality can still call `gmail_profile` without error; (4) Revoke the Google refresh token in Google Account → Security → Third-party apps, then trigger a Gmail tool call — confirm error message tells user to reconnect (not a silent 500).

### Manual Tests — Agent & Personality Features

- [ ] **Per-Personality Memory Scoping** — End-to-end verification of ADR 133. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **AgentWorld sub-agents** — Sub-agents display when created, writing, meeting added. Verify delegation cards appear in grid/map/large views, disappear when delegation completes.
- [ ] **Adaptive Learning Pipeline** — Verify conversation quality scorer runs on schedule (check `training.conversation_quality` table grows). Trigger a distillation job with `priorityMode: 'failure-first'` → confirm lower-scored conversations appear first in the export.

### Manual Tests — Marketplace & Workflows

- [ ] **Skills marketplace flow** — Continued review of marketplace + community install/uninstall flow, per-personality skill injection, and sub-agent skill inheritance.
- [ ] **Workflow export/import round-trip** — Export a workflow with required integrations. Import on a fresh instance; verify compatibility warnings surface correctly for missing integrations. Install a community workflow from Marketplace → Workflows tab; verify it appears in workflow definitions.
- [ ] **Workflows & Swarms marketplace lifecycle** — Verify that after a clean rebuild: (1) Installed tab → Workflows shows zero items; (2) Installed tab → Swarm Templates shows zero items; (3) Marketplace tab → Workflows shows all YEOMAN built-ins (research-report-pipeline, code-review-webhook, parallel-intelligence-gather, distill-and-eval, finetune-and-deploy, dpo-loop, pr-ci-triage, build-failure-triage, daily-pr-digest, dev-env-provision) under "YEOMAN Workflows"; (4) Marketplace tab → Swarm Templates shows all YEOMAN built-ins (research-and-code, analyze-and-summarize, parallel-research, code-review, prompt-engineering-quartet) under "YEOMAN Swarm Templates"; (5) Click Install on a workflow → it now appears in Installed tab; (6) Community tab → Sync pulls in community workflows and swarm templates from the configured repo path; (7) Community tab → Workflows and Community tab → Swarm Templates show the synced items; (8) Search filters work across all views. Architecture note: builtin workflows are seeded with `createdBy: 'system'` and builtin swarms with `isBuiltin: true` — these flags are how Installed tab excludes them. Community sync wires `workflowManager` and `swarmManager` into `MarketplaceManager` via `setDelegationManagers()` (called from `bootDelegationChain()`).
- [ ] **Catalog section review** — Further review of the Catalog page (Skills, Workflows, Swarm Templates) across all tabs (Personal, Marketplace, Community, Installed). Assess UX, labelling, install/uninstall flows, filtering, search, sync behaviour, and any missing functionality before considering the section production-ready.

### Manual Tests — License Gating (Phase 106)

- [ ] **Enforcement off (default)** — Start without `SECUREYEOMAN_LICENSE_ENFORCEMENT`. Verify all enterprise features (distillation, SSO admin, tenants, CI/CD webhook, alert rules) return normal responses — no 402s. Dashboard shows no lock overlays on TrainingTab, ConnectionsPage CI/CD section, or AlertRulesTab.
- [ ] **Enforcement on, no license** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true`, no `SECUREYEOMAN_LICENSE_KEY`. POST to `/api/v1/training/distillation/jobs` → 402 with `{ error: 'enterprise_license_required', feature: 'adaptive_learning' }`. Same for SSO admin routes (POST/PUT/DELETE `/api/v1/auth/sso/providers`), tenant CRUD, CI/CD webhook, and alert write routes. GET read-only routes still return 200.
- [ ] **Enforcement on, valid enterprise key** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` with a valid enterprise license key that includes all features. All guarded routes return normal responses. Dashboard `<FeatureLock>` components render children without lock overlay.
- [ ] **Dashboard lock overlay** — With enforcement on and no license: navigate to Training tab → distillation/finetune sub-tabs show dimmed content with lock icon, "Adaptive Learning Pipeline" label, and "Upgrade to Enterprise" link. Connections page CI/CD section shows lock overlay. Alert rules create/edit forms show lock overlay.
- [ ] **Provider cost tracking** — With multi-account providers configured, verify cost dashboard still loads and CSV export works (Phase 112 regression check after Phase 106 wiring changes).

### Manual Tests — Desktop & Editor

- [ ] **Docker MCP Tools** — Enable `MCP_EXPOSE_DOCKER=true` (socket mode). Verify `docker_ps` lists containers, `docker_logs` streams output, `docker_exec` runs commands correctly. Enable DinD mode via `MCP_DOCKER_MODE=dind` + `MCP_DOCKER_HOST` and repeat.
- [ ] **Canvas Workspace** — Navigate to `/editor/advanced` (or click "Canvas Mode →" in the editor toolbar). Create ≥3 widgets, resize, move, minimize one. Reload page → verify layout is restored from localStorage. Pin a terminal output → frozen-output widget appears adjacent. Worktree selector lists git worktrees.
- [ ] **Unified editor features** — At `/editor` (standard editor): (1) Click Brain icon → toggle memory on; run a terminal command → verify it appears in the personality's memory via `/api/v1/brain/memories`; (2) Click CPU icon → ModelWidget popup shows current model; switch model → toolbar label updates; (3) Click Globe icon → Agent World panel expands below the main row; switch between Grid/Map/Large views; close via × and verify `localStorage('editor:showWorld')` is `'false'`; (4) Open 3 terminal tabs in MultiTerminal → verify each has independent output; (5) Set `allowAdvancedEditor: true` in security policy → `/editor` should redirect to Canvas workspace.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| 109 | Editor Improvements | P3 — power user UX | 🔄 In Progress |
| 117 | Excalidraw Diagramming — MCP Tools & Marketplace Skill | P3 — capability + visualization | Planned |
| 120 | Canvas Editor Improvements | P3 — canvas improvements | Planned |
| ~~121~~ | ~~Security Hardening & Code Audit~~ | ~~P1~~ | ✅ Done — ADR 195 |
| — | Engineering Backlog | Ongoing | Pick-up opportunistically |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| Future | LLM Providers, LLM Lifecycle, Responsible AI, Voice, Infrastructure | Future / Demand-Gated | — |

---

## Phase 109: Editor Improvements (Auto-Claude Style)

**Priority**: P3 — High value for power users. Demand-gated — implement incrementally based on user feedback.

*Previously Phase 100. Renumbered for sequential ordering. Includes "settings page split" from Phase XX.*

**Remaining IDE features** — Auto-Claude–style patterns (plan display, step-by-step approval, AI commit messages, context badges), multi-file editing (tabs, split panes), project explorer, integrated Git, command palette, inline AI completion (Copilot-style), multi-file search & replace, collaborative editing (Yjs CRDT), keybindings editor, layout persistence, responsive/mobile layout, training integration (export/annotation), and plugin/extension system.

---

## Phase 117: Excalidraw Diagramming — MCP Tools & Marketplace Skill

**Priority**: P3 — Capability + visualization. AI-generated diagrams are a high-value output for architecture reviews, threat models, system design, and documentation. This phase adds first-class Excalidraw support: MCP tools for programmatic diagram creation/rendering, and a marketplace skill that teaches the AI to generate professional diagrams from natural language. Inspired by [excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill) — improved with broader diagram type coverage, a richer element template library, MCP tool integration, workflow step support, and tighter integration with existing YEOMAN features (knowledge base, canvas workspace, export pipeline).

Two sub-phases: MCP tools → marketplace skill & workflow integration.

### 117-A: Excalidraw MCP Tools

*New tool group in `packages/mcp/src/tools/excalidraw-tools.ts`. Follows `wrapToolHandler()` pattern. Feature-gated via `exposeExcalidraw: boolean` in `McpServiceConfigSchema` + `exposeDiagramming: boolean` in `McpFeaturesSchema` (per-personality gate).*

- [ ] **`excalidraw_create`** — Generate an Excalidraw scene JSON from a structured description. Input: `{ title: string, elements: ExcalidrawElementSpec[], theme?: 'light' | 'dark', gridMode?: boolean }`. `ExcalidrawElementSpec` is a simplified schema: `{ type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text' | 'frame' | 'image', label?: string, x: number, y: number, width?: number, height?: number, strokeColor?: string, backgroundColor?: string, groupId?: string, boundElementIds?: string[] }`. Outputs valid Excalidraw JSON (`{ type: 'excalidraw', version: 2, elements: [], appState: {} }`). The tool handles ID generation, z-index ordering, bound arrow linkage, and group semantics so the AI only needs to specify the logical layout.
- [ ] **`excalidraw_from_description`** — Higher-level tool: takes a natural language description and diagram type, returns Excalidraw JSON. Input: `{ description: string, diagramType: 'architecture' | 'sequence' | 'flowchart' | 'entity_relationship' | 'network_topology' | 'threat_model' | 'mindmap' | 'timeline' | 'org_chart' | 'class_diagram' | 'state_machine' | 'deployment' | 'freeform', style?: 'minimal' | 'detailed' | 'technical', colorPalette?: string }`. Delegates to the AI personality with the excalidraw-diagram skill instructions injected as context, then parses the response into valid Excalidraw JSON. The diagram type hint drives layout strategy: hierarchical top-down for org charts, left-to-right for sequences, radial for mindmaps, swim-lane for flowcharts, zone-based for architecture diagrams.
- [ ] **`excalidraw_render`** — Render an Excalidraw JSON scene to PNG or SVG. Input: `{ scene: ExcalidrawScene | string, format: 'png' | 'svg', width?: number, height?: number, scale?: number, darkMode?: boolean }`. Uses `@excalidraw/utils` (`exportToSvg`/`exportToBlob`) in a lightweight rendering context (no Playwright dependency — the `@excalidraw/utils` package handles headless export natively). Returns base64-encoded image data. SVG output preserves editability. PNG output at configurable resolution (default: 2x scale for high-DPI).
- [ ] **`excalidraw_validate`** — Visual validation pipeline inspired by the reference project's render-and-check approach. Input: `{ scene: ExcalidrawScene }`. Checks: (1) **Overlapping elements** — bounding box intersection detection for non-connected elements; (2) **Orphaned arrows** — arrows with `startBinding` or `endBinding` pointing to non-existent elements; (3) **Text overflow** — text elements whose content exceeds their container bounds (estimated via character count × avg char width); (4) **Unbalanced layouts** — center-of-mass deviation from canvas center beyond threshold; (5) **Missing labels** — shapes with no text binding in diagram types that expect labels (architecture, ER, flowchart); (6) **Color contrast** — text-on-background contrast ratio below WCAG AA threshold (4.5:1). Returns `{ valid: boolean, issues: ValidationIssue[], suggestions: string[] }`. The AI can call this after `excalidraw_create`, fix issues, and re-render — enabling the iterative self-correction loop.
- [ ] **`excalidraw_modify`** — Patch an existing scene. Input: `{ scene: ExcalidrawScene, operations: PatchOperation[] }`. `PatchOperation`: `{ op: 'add' | 'update' | 'delete' | 'move' | 'restyle', elementId?: string, element?: ExcalidrawElementSpec, properties?: Partial<ExcalidrawElementSpec> }`. Enables incremental refinement without regenerating the entire scene. Maintains element IDs and bound arrow references through modifications.
- [ ] **`excalidraw_templates`** — List available element templates and color palettes. Input: `{ category?: string }`. Returns pre-built component groups: cloud provider icons (AWS/GCP/Azure as grouped shapes), database cylinders, server racks, user/actor icons, lock/shield security icons, container/pod shapes, queue/topic shapes, load balancer shapes. Templates are defined in `packages/mcp/src/tools/excalidraw-templates.ts` as reusable `ExcalidrawElementSpec[]` groups with relative positioning — the AI places them by specifying an anchor point.
- [ ] **Manifest & registration** — Add 6 tools to `manifest.ts` (`excalidraw_create`, `excalidraw_from_description`, `excalidraw_render`, `excalidraw_validate`, `excalidraw_modify`, `excalidraw_templates`). Register in `tools/index.ts` via `registerExcalidrawTools()`. Feature flag: `exposeExcalidraw` in MCP config (default: `true`).

### 117-B: Marketplace Skill & Workflow Integration

*A marketplace skill that teaches the AI to generate professional Excalidraw diagrams, plus workflow step support for automated diagram generation.*

- [ ] **`excalidraw-diagram` marketplace skill** — `packages/core/src/marketplace/skills/excalidraw-diagram.ts`. `Partial<MarketplaceSkill>` following the established pattern. `category: 'productivity'`, `author: 'YEOMAN'`, `routing: 'fuzzy'`, `autonomyLevel: 'L1'`. Instructions encode the full diagramming methodology:
  - **Visual argumentation principles** — shapes mirror concepts (fan-outs for one-to-many, timelines for sequences, convergence for aggregation, containment/frames for boundaries). Not generic boxes-and-arrows.
  - **Diagram type catalog** — 12 supported types with layout rules: architecture (zone-based, trust boundaries as dashed frames), sequence (left-to-right timeline, actor lifelines), flowchart (top-down swim lanes, decision diamonds), ER (entity boxes with PK/FK notation, relationship arrows with cardinality labels), network topology (hierarchical layers — internet/DMZ/internal/data), threat model (DFD elements + trust boundaries + STRIDE annotations, integrates with the existing `stride-threat-model` skill output), mindmap (radial hierarchy from center), timeline (horizontal with milestone markers), org chart (top-down tree), class diagram (UML-style compartmented rectangles), state machine (states as rounded rectangles, transitions as labeled arrows), deployment (infrastructure zones with service boxes).
  - **Color palette system** — Default palette: `{ primary: '#1e40af', secondary: '#7c3aed', accent: '#059669', warning: '#d97706', danger: '#dc2626', neutral: '#6b7280', background: '#f8fafc', surface: '#ffffff' }`. Palette is overridable per invocation. Zone backgrounds use 10% opacity fills. Arrows inherit source node color. Text always high-contrast against its background.
  - **Element template awareness** — Instructions reference the `excalidraw_templates` MCP tool for reusable component groups. The AI is taught to compose diagrams from templates rather than raw primitives where applicable.
  - **Iterative refinement loop** — The skill instructions teach the AI to: (1) generate the initial scene via `excalidraw_create` or `excalidraw_from_description`; (2) validate via `excalidraw_validate`; (3) fix any issues via `excalidraw_modify`; (4) render via `excalidraw_render` and present to the user. If the user requests changes, loop from step 3.
  - **Evidence embedding** — For technical diagrams (architecture, deployment, threat model), the skill instructs the AI to embed relevant code snippets, config fragments, or API signatures as text annotations within frames — making diagrams self-documenting.
  - `triggerPatterns`: `\\b(excalidraw|diagram|architecture.?diagram|draw.{0,10}(system|architecture|flow|sequence|er|network|topology|mindmap|org.?chart|class|state|deployment))\\b`, `(create|generate|make|draw|sketch|design).{0,20}(diagram|visual|chart|illustration|schematic|blueprint|dfd|data.?flow)`.
  - `useWhen`: 'User asks to create, generate, or modify any kind of visual diagram, system architecture drawing, flowchart, ER diagram, network topology, threat model DFD, or Excalidraw scene.'
  - `doNotUseWhen`: 'User asks for data charts (bar, line, pie — use Recharts), dashboards, or non-diagrammatic visualizations. User wants to edit an existing image that is not Excalidraw.'
  - `mcpToolsAllowed`: `['excalidraw_create', 'excalidraw_from_description', 'excalidraw_render', 'excalidraw_validate', 'excalidraw_modify', 'excalidraw_templates']`.
- [ ] **Skill registration** — Export from `skills/index.ts`. Add to `BUILTIN_SKILLS` in `marketplace/storage.ts`. Update `storage.test.ts` mock count (18→19 skills).
- [ ] **`diagram_generation` workflow step type** — New step type in `workflow-engine.ts`. Config: `{ diagramType, descriptionTemplate: '{{steps.researcher.output}}', style?, colorPalette?, format?: 'png' | 'svg' | 'json' }`. Calls `excalidraw_from_description` → `excalidraw_validate` → `excalidraw_render` internally. Output: `{ scene: ExcalidrawScene, renderedImage: string (base64), validationIssues: ValidationIssue[] }`. Enables workflows like "research a system → generate architecture diagram → attach to report".
- [ ] **Workflow templates** — 2 new templates appended to `BUILTIN_WORKFLOW_TEMPLATES`:
  - `architecture-diagram-pipeline` — agent (gather system description from input or knowledge base) → `diagram_generation` (architecture type) → transform (wrap in markdown report with embedded image) → resource (save to memory). `autonomyLevel: 'L2'`.
  - `threat-model-with-dfd` — agent (STRIDE analysis via `stride-threat-model` skill) → `diagram_generation` (threat_model type, description from STRIDE output) → transform (combine written threat model + DFD diagram) → `human_approval` (24h timeout) → resource (save to knowledge base). `autonomyLevel: 'L3'`.
- [ ] **Canvas workspace integration** — The existing canvas workspace (`/editor/advanced`) gains an Excalidraw widget type. When the AI generates an Excalidraw scene via MCP tools, the canvas can display it as an interactive embedded Excalidraw editor (using the `@excalidraw/excalidraw` React component). Users can manually refine AI-generated diagrams. Widget persists the scene JSON in `canvas:workspace` layout storage. Bi-directional: manual edits are saved; the AI can read the current scene state via `excalidraw_modify` for further AI-assisted refinement.
- [ ] **Knowledge base integration** — Excalidraw scenes can be stored as knowledge base documents (`brain.documents` with `format: 'excalidraw'`). The `DocumentManager.ingestBuffer()` path extracts text labels from the scene JSON for vector embedding — making diagrams searchable by their content. When recalled during RAG, the diagram is returned as both the scene JSON (for rendering) and a text summary of its elements.

---

### 120: Canvas Workspace Improvements

*Extends the Phase 100 canvas workspace (`/editor/advanced`) with power-user features. The 11-widget canvas is functional; these items address the gaps identified during QA.*

- [ ] **Inter-widget communication** — Event bus for widget-to-widget data flow. Primary use case: terminal output → auto-populate an editor widget with the result, or terminal error → create a chat widget pre-seeded with the error for AI diagnosis. `CanvasEventBus` singleton with `emit(event)` / `on(event, handler)` / `off()`. Widgets subscribe in `useEffect` and clean up on unmount.
- [ ] **Canvas keyboard shortcuts** — `Cmd/Ctrl+1..9` to focus widget by position order. `Cmd/Ctrl+W` to close focused widget. `Cmd/Ctrl+N` to open widget catalog. `Cmd/Ctrl+S` to force-save layout. `Escape` to exit fullscreen. Implemented via a `useCanvasShortcuts` hook attached to the canvas container.
- [ ] **Multiple saved layouts & export** — Replace single `canvas:workspace` localStorage key with a named-layout system. `canvas:layouts` stores `{ [name]: CanvasLayout }`. Layout switcher dropdown in the canvas toolbar. Export layout as JSON; import from file. Presets: "Dev" (terminal + editor + git), "Ops" (CI/CD + pipeline + training live), "Chat" (chat + agent world + task kanban).
- [ ] **Mission card embedding** — Extract the mission card renderer from `MissionControlPage` into a reusable `<MissionCardEmbed cardId={id} />` component. Wire it into `MissionCardNode` widget (currently a placeholder). Card shows objective, progress, and linked tasks.

---

---

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Final 1% Push (Phase 105)

Current: 87.01% stmt / 76.02% branches. Target: 88% / 77%. Gap: <1% each.

**Highest-impact targets by coverage gap** (directory-level, sorted by branch gap):

| Directory | Stmts | Branches | Priority |
|-----------|-------|----------|----------|
| `body/actuator/` | 75.63% | 61.17% | HIGH — desktop control branch coverage |
| `logging/` | 74.93% | 62.18% | HIGH — audit chain + export branches |
| `licensing/` | 67.30% | 63.63% | HIGH — license validation branches |
| `notifications/` | 90.00% | 64.22% | MEDIUM — good stmt, weak branch |
| `sandbox/` | 77.67% | 66.16% | MEDIUM — sandbox exec branches |
| `cli/commands/` | 76.83% | 68.12% | MEDIUM — flag parsing branches |
| `config/` | 81.81% | 69.01% | MEDIUM — config validation branches |
| `training/` | 78.81% | 69.84% | MEDIUM — manager logic branches |
| `workflow/` | 91.78% | 72.70% | LOW — good stmt, branch gap in engine conditions |

- [ ] **Licensing branch coverage** — `licensing/` at 67.30% stmt / 63.63% branch. License validation branching (expired, invalid signature, missing claims, feature checks) is fully unit-testable. The `TestLicenseManager` pattern is already established.
- [ ] **Logging branch coverage** — `logging/` at 74.93% stmt / 62.18% branch. Audit chain integrity verification, export format branches, and log rotation logic are unit-testable with mocked storage.
- [ ] **Actuator branch coverage** — `body/actuator/` at 75.63% stmt / 61.17% branch. Desktop control action dispatch and platform-specific branching.
- [ ] **Notification branch coverage** — `notifications/` at 90% stmt / 64.22% branch. Notification preference filtering and channel dispatch branches.
- [ ] **Analytics routes tests** — No `analytics-routes.test.ts` exists despite 11 endpoints. Add route-level tests especially for error paths (503 when storage unavailable, 400 for missing params).
- [ ] **Capture-permissions tests** — `body/capture-permissions.ts` has no test file. Security-critical RBAC permission enforcement for screen capture operations.

### Database Performance

- [x] **Add LIMIT to unbounded SELECTs** — Added LIMIT to 11 unbounded queries across finetune-manager, distillation-manager, oauth-token-storage, conversation-storage, federation-storage, autonomy-audit, rbac-storage, alert-storage, extensions/storage (2), brain/storage.
- [x] **N+1 query in marketplace sync** — Hoisted `listDefinitions()` before the loop, built a lookup Map. Also fixed directory-based sync N+1.
- [x] **N+1 in code execution init** — Added `expireStaleSessions(timeoutMs)` batch method to storage. Replaced loop with single UPDATE.
- [x] **PG pool `statement_timeout`** — Added `statement_timeout: 30_000` and `allowExitOnIdle: true` to pool config.
- [x] **MCP health checks parallelization** — Replaced sequential `for...of` with `Promise.allSettled()`.

### Memory & Timer Cleanup

- [x] **Timer cleanup in `SecureYeoman.cleanup()`** — Added `notificationManager.stopCleanupJob()` call. (abuseDetector, skillScheduler, mcpHealthMonitor, consolidationManager are not SecureYeoman fields — they're local or passed as options.)
- [x] **Missing `.unref()` on timers** — Added `.unref()` to `usagePruneTimer`, `riskScheduleTimer`, and `expiryTimer`.
- [x] **`UsageAnomalyDetector` periodic eviction** — Added 60s `setInterval` eviction timer with `.unref()` and `stop()` method.
- [x] **`ConsolidationManager.flaggedIds` unbounded** — Added `MAX_FLAGGED_IDS = 10_000` cap with oldest-first eviction via `addFlaggedId()` helper.
- [x] **`ConversationManager.conversations` cap** — Added `MAX_CONVERSATIONS = 10_000` cap with oldest-first eviction in `addMessage()`.
- [ ] **Storage object cleanup** — ~20 storage objects initialized but never closed in `cleanup()`: `heartbeatLogStorage`, `alertStorage`, `notificationStorage`, `scanHistoryStore`, `riskAssessmentStorage`, `departmentRiskStorage`, `athiStorage`, `providerAccountStorage`, `analyticsStorage`, `autonomyAuditStorage`, `groupChatStorage`, `routingRulesStorage`, `backupStorage`, `tenantStorage`, `strategyStorage`, `pipelineLineageStorage`. Consider a registry pattern for systematic cleanup.

### Async & Startup Performance

- [ ] **Parallel `ensureTables()` during init** — `secureyeoman.ts:388-1845` runs many independent storage init calls sequentially. After migrations complete, group independent `ensureTables()` and `init()` calls into `Promise.all()` batches.
- [x] **Marketplace sync `readFileSync` → async** — Converted all `readFileSync` calls to `await fs.promises.readFile` in marketplace/manager.ts.
- [x] **`AbuseDetector.evictStale()` hot path** — Removed per-check `evictStale()` call; existing 60s interval timer handles eviction.
- [ ] **Response cache key optimization** — `ai/response-cache.ts:65` computes `JSON.stringify` + SHA-256 on the full messages array for every cache lookup (hot path). Consider a faster hash (xxhash/FNV) or incremental key building.

### Code Quality & Consistency

- [ ] **Unify error response format** — Two competing patterns: `sendError()` returns `{ error, message, statusCode }` (~60% of routes) vs. inline `reply.code(N).send({ error: '...' })` with single key (~40%). Migrate all to `sendError()`. Affected: `analytics-routes.ts` (12 instances), `multimodal-routes.ts`, `diagnostic-routes.ts`, `chat-routes.ts`, `desktop-routes.ts`, `extension-routes.ts`.
- [x] **Adopt `toErrorMessage()` utility** — Replaced ~110 instances across 28 route files with `toErrorMessage()` from `utils/errors.ts`.
- [ ] **Extract `initOptional()` helper** — `secureyeoman.ts` has 14+ identical try/catch/warn blocks for non-fatal manager init. Extract to `private initOptional<T>(name: string, init: () => T): T | null`. Saves ~120 lines.
- [x] **Standardize `reply.code()` vs `reply.status()`** — Replaced 28 instances in `training-routes.ts` (21) and `cicd-webhook-routes.ts` (7).
- [ ] **Standardize pagination parsing** — Different routes use `Number()` vs `parseInt()` vs `Math.min()` with inconsistent max caps. Create a shared `parsePagination(query)` utility with consistent parsing and upper bounds.
- [ ] **Consistent response wrapping** — Some endpoints return raw arrays, others wrap in `{ data }` or named keys. Establish and document a convention.
- [x] **Workflow condition failure logging** — Added `warn`-level log with expression and error context to `evaluateCondition()` catch block.
- [x] **Silent catch blocks in `getMetrics()`** — Added `debug`-level logging to both silent catch blocks.

### Dependency Cleanup

- [x] **Move `@vitest/coverage-v8` to devDependencies** — Moved from production `dependencies` to `devDependencies`.
- [x] **Remove `discord.js` from dashboard** — Removed from `packages/dashboard/package.json`.
- [x] **Move `eslint` + `typescript-eslint` to devDependencies** — Moved from `dependencies` to `devDependencies` in dashboard.
- [x] **Remove `@types/express`** — Removed from core devDependencies. Replaced Express types in `capture-permissions.ts` with inline types.
- [x] **Evaluate `@hapi/boom` removal** — Removed `@hapi/boom` from core dependencies. Replaced `Boom` type cast in `whatsapp/adapter.ts` with inline structural type.

### Type Safety

- [ ] **Dashboard API client types** — `packages/dashboard/src/api/client.ts` has 36 `: any` annotations, especially around risk departments, ATHI scenarios, versioning, citations. Import proper types from `@secureyeoman/shared`.
- [ ] **Fastify typed route params** — 18 occurrences of unsafe `request.params as { ... }` casts across route files. Use Fastify's generic route parameters: `FastifyRequest<{ Params: { id: string } }>`.
- [x] **Remove dead Express import** — Removed unused `type { Response, NextFunction } from 'express'` from `capture-permissions.ts`.
- [x] **Delete `debug2.test.ts`** — Deleted debugging artifact `brain/debug2.test.ts`.

### Configuration Centralization

- [ ] **Centralize `process.env` access** — Multiple modules read `process.env.*` directly instead of via config loader: `secureyeoman.ts` (`INTEGRATION_PLUGIN_DIR`, `COMMUNITY_REPO_PATH`), `opa-client.ts` (`OPA_ADDR`), `workflow-engine.ts` (`GITHUB_TOKEN`), `license-manager.ts` (`SECUREYEOMAN_LICENSE_ENFORCEMENT`), `pg-pool.ts`. Centralize into `ConfigSchema` with startup validation.

### Future Architecture (Consider When Touching Adjacent Code)

- [ ] **`SecureYeoman` God Object decomposition** — The class is 4000+ lines with 138 nullable fields managing every subsystem directly. Consider breaking into composed domain modules (e.g., `AnalyticsModule`, `SecurityModule`, `IntegrationModule`) that each own their storage/manager pairs. The main class would compose these modules. This addresses the root cause of cleanup gaps, duplication, and init complexity.
- [ ] **Fastify JSON Schema validation** — No route registrations use Fastify's built-in JSON Schema validation. All validation is manual `if (!body.name?.trim())` checks. Add schema definitions for at least auth, execution, and federation routes for automatic 400 responses on malformed input.
- [ ] **Worker threads for CPU-intensive ops** — No `worker_threads` usage anywhere. SHA-256 for audit chain entries (hot path), vector similarity in BrainStorage, and JSON.stringify+SHA-256 for cache keys all run on the main event loop. Consider a small worker pool for audit chain hashing.

---

## Wrap-Up — Pre-Release Gating

Items below represent the final steps required before public release. They depend on completed phases and focus on enforcement activation, tier auditing, and commercialization.

### License Up: Tier Audit & Enforcement Activation

**Priority**: P1 — Commercial. Must complete before public release.

**Prerequisite**: Phase 106 (license gating infrastructure — ✅).

- [ ] **Tier audit** — Comprehensive audit of all features into tiers:
  - **Community** (free): Chat, personalities, basic brain/memory, manual workflows, MCP tools, marketplace skills, basic editor, training dataset export, community skills, basic observability (metrics dashboard read-only)
  - **Pro** (mid-tier, new): Advanced editor/canvas, knowledge base connectors, observability dashboards, CI/CD read-only status, provider account management, advanced workflow templates, computer-use episodes, custom integrations, advanced brain features (document ingestion, source guides)
  - **Enterprise**: Adaptive learning pipeline (distillation, fine-tune, evaluation, DPO, counterfactual generation), SSO/SAML, multi-tenancy (RLS), CI/CD webhook integration + workflow triggers, advanced alert rules (create/edit/delete), A2A federation, swarm orchestration advanced modes, audit chain export
- [ ] **Pro tier in LicenseManager** — Add `'pro'` to `LicenseTier`. Rename `EnterpriseFeature` → `LicensedFeature`. Add pro-tier features. Update license key generation script + validation.
- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates.
- [ ] **Upgrade prompts** — "Upgrade to Pro" and "Upgrade to Enterprise" CTAs in `FeatureLock` with pricing page links.
- [ ] **License key purchase flow** — Integration with payment provider or manual key issuance workflow. Dashboard license management page.
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Observability & Telemetry (Phase 83 remnants)

*As SecureYeoman moves into production deployments, operators need distributed tracing, metrics export, and correlation tooling beyond what the built-in audit log provides.*

**Remaining / Future improvements (demand-gated)**:
- [ ] **Histogram metrics** — Replace avg-latency gauge with proper p50/p95/p99 histograms per route using OpenMetrics format.
- [ ] **AI completion spans** — Instrument every `aiClient.chat()` call with a child span including model, input/output token counts.
- [ ] **MCP tool call spans** — Wrap each MCP tool invocation in a span for end-to-end tracing through agent → tool → external API.
- [ ] **Personality activity heatmap** — Per-personality request rate in Grafana.

---

### LLM Lifecycle Platform — Advanced

*Extends the completed training pipeline (Phases 64, 73, 92, 97, 98) with advanced training objectives, scale, and continual learning. Demand-gated pending real-world usage.*

#### Advanced Training

- [ ] **DPO (Direct Preference Optimization)** — Training objective using `(chosen, rejected)` pairs from the annotation UI directly. New `training_method: 'dpo'` option on finetune jobs. `scripts/train_dpo.py` using TRL's `DPOTrainer`.
- [ ] **RLHF scaffolding** — Reward model training stage: fine-tune a small classifier on preference pairs; use the reward model to guide PPO or GRPO training.
- [ ] **Hyperparameter search** — Grid or random search over key fine-tuning params: learning rate, LoRA rank, batch size, warmup steps, epochs. Each combination spawns a child job. Best checkpoint promoted automatically.
- [ ] **Multi-GPU / distributed training** — `accelerate` + `deepspeed` integration for models that don't fit on a single GPU. Job spec gains `num_gpus` field.
- [ ] **Checkpoint management** — Save intermediate checkpoints at configurable step intervals. Resume interrupted jobs from the latest checkpoint. Checkpoint browser in the Training tab.

#### Inference Optimization

- [ ] **Async / batch inference** — `POST /api/v1/ai/batch` accepts an array of prompts; returns a job ID. Worker processes prompts in a queue (configurable concurrency). Useful for running evaluation suites or bulk annotation without blocking the chat interface.
- [ ] **KV-cache warming** — Pre-warm Ollama's KV cache with a personality's system prompt on startup. Exposed as `warmupOnActivation: boolean` in personality settings.
- [ ] **Speculative decoding** — When a small draft model is available alongside a large target model, use the draft to propose token sequences that the target verifies in parallel. `draftModel` field on the personality's inference profile.
- [ ] **Response caching** — Semantic cache for repeated or near-duplicate prompts (embedding cosine > configurable threshold). Cache backed by the existing vector store. Cache stats in the AI health endpoint and ModelWidget.

#### Continual Learning

- [ ] **Automatic dataset refresh** — Scheduled job that runs the curation pipeline on conversations accumulated since the last training run and appends clean samples to the active distillation dataset.
- [ ] **Drift detection** — Monitor quality score distribution of recent conversations vs. the training-period baseline. Alert when mean quality drops more than a configurable threshold.
- [ ] **Online adapter updates** — Lightweight LoRA adapter updates from individual conversations using gradient accumulation, without a full retrain. Replay buffer prevents catastrophic forgetting. *(Revisit once fine-tuning pipeline has meaningful real-world usage.)*
- [ ] **Training from scratch** — Pre-train on a curated local corpus. Scoped to small models (≤3B params) as domain-specific lightweight specialists.

---

### Responsible AI

*Inspired by Azure Responsible AI Dashboard and Google Vertex AI Explainability. Required for EU AI Act compliance and enterprise governance.*

- [ ] **Cohort-based error analysis** — Slice evaluation results by conversation metadata (topic category, user role, time-of-day, personality configuration) and show error rate per cohort. Dashboard: heat-map table with drill-down.
- [ ] **Fairness metrics** — For any evaluation dataset that includes demographic metadata, compute parity metrics: demographic parity, equalized odds, and disparate impact ratio across groups. Alert when a fine-tuned model shows a fairness regression.
- [ ] **Model explainability (SHAP)** — For classification-style tasks run SHAP value attribution on fine-tuned model outputs. Show which input tokens contributed most to each prediction. Rendered as a token-level heat map in the experiment detail view.
- [ ] **Data provenance audit** — Every training dataset records which conversations were included, which were filtered out (and why), and which were synthetic. Full lineage queryable: "was this user's conversation used in training?" Important for GDPR right-to-erasure compliance.
- [ ] **Model card generation** — Auto-generate a structured model card for each deployed personality model: intended use, training data summary, known limitations, evaluation results, fairness scores, and deployment date. Aligned with Hugging Face Model Card format and EU AI Act transparency requirements.

---

### Voice Pipeline: AWS Polly + Transcribe

*The existing multimodal pipeline (Phase 58) uses Whisper for STT and Voicebox/OpenAI for TTS. When operating in an AWS ecosystem, Polly and Transcribe are the natural drop-in replacements.*

- [ ] **AWS Transcribe STT provider** — `TranscribeProvider` in `multimodal/stt/transcribe.ts`. Streams audio to Amazon Transcribe via the Streaming Transcription API (WebSocket) for real-time STT. Supports: 100+ languages, custom vocabulary, speaker diarization.
- [ ] **AWS Polly TTS provider** — `PollyProvider` in `multimodal/tts/polly.ts`. Calls Amazon Polly's `SynthesizeSpeech` endpoint. Supports: 60+ languages, Neural Text-To-Speech (NTTS) voices, SSML for prosody control. Per-personality voice ID stored in personality settings.
- [ ] **AWS voice profile system** — Each personality can have a named Polly voice ID (`Joanna`, `Matthew`, `Aria`, etc.) plus a custom lexicon (pronunciation guide for domain-specific terms).
- [ ] **Custom vocabulary for Transcribe** — Personality-specific custom vocabulary: product names, technical terms, proper nouns that Whisper frequently mishears. Managed via `POST /api/v1/multimodal/transcribe/vocabulary`.
- [ ] **Provider auto-selection** — When `TRANSCRIBE_REGION` is set, prefer Transcribe over Whisper. When `POLLY_REGION` is set, prefer Polly over Voicebox. Fallback gracefully if credentials are absent.
- [ ] **Task/workflow completion voice announcements** — When voice is enabled, announce workflow completions, distillation job results, and long-running task outcomes via TTS. Triggered by the same metric events that feed the AlertManager (see Observability section). Configurable per-personality: `voiceAnnouncements: boolean` + `voiceAnnouncementEvents: ('workflow_complete' | 'job_complete' | 'eval_complete')[]`. Particularly valuable for the Tauri desktop client (Phase 91) where the user may be working in another window. Inspired by [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)'s ElevenLabs voice notification system.

---

### Voice & Community

*Demand-Gated — implement when voice profile and marketplace demand justifies the investment.*

- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call.
- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default).
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI.

---

### Native Clients

*Phase 91 delivered the Tauri v2 desktop scaffold and Capacitor v6 mobile scaffold (both complete 2026-03-01). These items extend the scaffolds into polished native experiences.*

- [ ] **Mobile app — full feature parity** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. The Capacitor scaffold is in place; this item covers icon production, App Store review compliance, and push notifications.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices via the existing REST API. Offline-first with conflict resolution on reconnect.
- [ ] **Auto-update** — In-app update flow: Tauri updater for desktop (delta bundles via `tauri-plugin-updater`), App Store / Play Store release channels for mobile.
- [ ] **Desktop system tray enhancements** — Quick-access menu: active personality selector, last conversation shortcut, toggle notifications. Global keyboard shortcut to focus the window.

---

### Theme Editor & Custom Themes

*Demand-Gated — extends the 10/10/10 theme system (ADR 175) with user-created themes.*

- [ ] **Theme editor** — Visual theme editor in Appearance settings: live-preview color pickers for all CSS variables (background, foreground, primary, secondary, muted, accent, destructive, border, ring, success, warning, info). Export as JSON; import to apply.
- [ ] **Theme upload** — Users upload a JSON theme file via the dashboard. Stored per-user in `settings.custom_themes`. Custom themes appear in a "Custom" section below the built-in themes.
- [ ] **Theme scheduling** — Auto-switch between a light and dark theme based on time of day or OS schedule. Configurable transition time.

---

### Infrastructure & Platform

*Demand-Gated — implement once operational scale or compliance requirements justify the investment.*

- [ ] **HSM Integration** — Hardware Security Module integration for key management.
- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.
- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based graph layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.
- [ ] **Agent World — Configurable FPS** — fps slider in card settings popover (1–16 fps), persisted in layout config. Only worthwhile if users report animation overhead on low-power devices.

---

## Dependency Watch

See [dependency-watch.md](dependency-watch.md) for tracked third-party dependencies with known issues requiring upstream resolution.

---

## Related Documentation

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-03-03 — Completed Phase 121 (Security Hardening & Code Audit, ADR 195). See [Changelog](../../CHANGELOG.md) for full history.*
