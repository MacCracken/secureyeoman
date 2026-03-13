# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| 15 | Agent Binary (Tier 2.5) | P2 — platform | Planned |
| 16 | Shruti DAW Ecosystem Integration | P2 — platform | Planned |
| — | Engineering Backlog | Ongoing | Test coverage improvements ongoing |
| Future | Consumer Experience, Enterprise Upgrades, Dev Ecosystem, Infra, Full Triangle, Simulation Engine | Future / Demand-Gated | Demand-gated |

## Phase XX: QA & Manual Testing (Ongoing)

**Priority**: P0 — Ongoing. Continuous verification of features that lack automated integration coverage. Items move to Changelog when confirmed working; new regressions are added here as discovered.

### Manual Tests — Authentication & Multi-Tenancy

- [ ] **SAML SP flow** — Code complete (`sso-routes.ts`, `saml-adapter.ts`, tested). Manual verification: (1) `GET /api/v1/auth/sso/saml/:id/metadata` returns valid `<md:EntityDescriptor>` XML. (2) `GET /api/v1/auth/sso/authorize/:id` redirects to IdP with SAMLRequest. (3) Post-IdP redirect hits ACS, returns JWT. Needs live IdP (SimpleSAMLphp or Keycloak) to confirm end-to-end.
- [ ] **RLS tenant isolation** — Schema supports tenant_id. Manual verification: Create tenant B, insert scoped personality, cross-query confirms isolation. Needs multi-tenant instance to test.
- [ ] **OAuth token refresh end-to-end** — Auto-refresh implemented (`oauth-token-service.ts`, 5 min buffer). Manual verification: (1) Connect Gmail; (2) wait for expiry; (3) confirm `gmail_profile` still works; (4) Revoke in Google → confirm reconnect prompt. Needs live Google OAuth credentials.

### Manual Tests — Agent & Personality Features

- [ ] **Per-Personality Memory Scoping** — Code complete (personalityId throughout brain module, 42+ files). Manual verification: (1) Chat with T.Ron → save memory, confirm NOT in FRIDAY recall; (2) heartbeat stats differ per personality; (3) Omnipresent Mind toggle; (4) `/api/v1/brain/stats?personalityId=<id>` per-personality counts. Needs running instance with 2+ personalities.
- [ ] **AgentWorld sub-agents** — Code complete (AgentWorldWidget, AgentWorldNode in AdvancedEditor). Manual verification: delegation cards in grid/map/large views, disappear on completion.
- [ ] **Adaptive Learning Pipeline** — Code complete (`distillation-manager.ts`, `conversation-quality-scorer.ts`). Manual verification: quality scorer runs on schedule, distillation `priorityMode: 'failure-first'` ordering works.

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

- [ ] **Docker MCP Tools** — Code complete (`docker-tools.ts`: docker_ps, docker_logs, docker_exec, registered in manifest). Manual verification: Enable `MCP_EXPOSE_DOCKER=true` (socket mode), verify listing/logs/exec. Test DinD mode via `MCP_DOCKER_MODE=dind` + `MCP_DOCKER_HOST`.
- [ ] **Canvas Workspace** — Code complete (AdvancedEditorPage, CanvasWidget, canvas-layout, canvas-event-bus, canvas-registry). Manual verification: widget CRUD, resize, localStorage persistence, frozen-output pinning, worktree selector.
- [ ] **Unified editor features** — Manual verification: Brain toggle + memory capture, ModelWidget switch, Agent World panel views, MultiTerminal tabs, `allowAdvancedEditor` redirect.

---

## License Up: Tier Audit & Enforcement Activation

**Priority**: P1 — Commercial. Must complete before public release.

**Prerequisites**: Phase 106 (license gating infrastructure — ✅).

### Planned Pricing

| Tier | Price | Target |
|------|-------|--------|
| Community | Free | Hobbyists, evaluators |
| Pro | $20/yr | Developers, power users |
| Solopreneur | $100/yr | Solo operators, consultants — all enterprise features for individuals |
| Enterprise | $1,000/yr | Organizations, regulated industries — multi-tenancy + SLA |
| Support | Additional | Priority support, onboarding, custom integrations — priced by scope |

**Note**: The current codebase has 3 tiers (`community | pro | enterprise`). The Solopreneur tier is a licensing distinction (enterprise features, single-tenant, no SLA), not a code-level tier. Implementation options: (a) map Solopreneur to `enterprise` tier with a `seats: 1` claim, or (b) add `solopreneur` as a 4th `LicenseTier` value. Decision deferred to implementation.

### Tasks

- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates.
- [ ] **Upgrade prompts** — "Upgrade to Pro", "Upgrade to Solopreneur", and "Upgrade to Enterprise" CTAs in `FeatureLock` with pricing page links.
- [ ] **Solopreneur tier definition** — Define Solopreneur as enterprise-feature-equivalent with single-tenant / single-seat constraints. Decide on `LicenseTier` implementation approach (see note above).
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.
- [ ] **Pricing page** — Public-facing pricing comparison page for secureyeoman.ai. Feature breakdown per tier, FAQ, upgrade flow.

### Repository & Public Identity

- [ ] **Transfer repositories to `yeoman.maccracken`** — Transfer `secureyeoman` and `secureyeoman-community-repo` to the `yeoman.maccracken` GitHub account. This will be the public-facing org. Update all references: README badges, install scripts (`curl -fsSL https://secureyeoman.ai/install`), Docker image paths (GHCR), Helm chart repo URLs, community sync default URL, and CI/CD workflow `GITHUB_REPOSITORY` refs.
- [ ] **Post-transfer fixups** — Update `package.json` repository fields, CHANGELOG links, ADR cross-references, dashboard "Report Issue" URLs, and any hardcoded GitHub URLs in docs or code. Verify GitHub redirect from old org works for existing clones.

### Payment & Monetization

- [ ] **Payment provider integration** — Evaluate and integrate Stripe or LemonSqueezy. LemonSqueezy preferred for simplicity (built-in global tax/VAT, merchant of record, simpler compliance). Stripe if more control needed. Flow: user selects tier → checkout → webhook fires → Ed25519 license key generated with tier/seats/expiry claims → delivered via email + dashboard download. No phone-home required (preserves air-gap story).
- [ ] **License key purchase flow** — Dashboard license management page: view current tier, expiry, upgrade/renew. Webhook handler for payment events (purchase, renewal, refund, cancellation). Automatic key delivery. Manual key issuance fallback for enterprise/PO-based sales.
- [ ] **Renewal & lifecycle** — Auto-renewal reminders (30/14/7 days before expiry). Expired-key grace period (7 days, read-only mode). Upgrade path: pro-rate remaining time when moving up tiers.

### $YEOMAN Token — Crypto Payment Channel

*Speculative — demand-gated. Introduces a crypto payment option alongside traditional fiat. NOT a prerequisite for launch.*

- [ ] **Token design** — ERC-20 or Solana SPL token ($YEOMAN). Fixed supply or capped inflation. Utility: license purchases, marketplace skill tips, community governance votes. NOT a security — no profit-sharing, no staking rewards, pure utility.
- [ ] **License purchase with $YEOMAN** — Accept $YEOMAN as payment for Pro/Solopreneur/Enterprise licenses at a discount (e.g. 20% off vs fiat). Smart contract escrow: tokens held until license key delivered. On-chain receipt serves as proof of purchase.
- [ ] **Community marketplace tipping** — Skill authors can receive $YEOMAN tips from users. Displayed on skill cards in marketplace. Incentivizes community contribution without SY taking a cut.
- [ ] **Governance voting** — $YEOMAN holders vote on roadmap priorities (feature requests, integration order). Lightweight on-chain governance — advisory, not binding. Builds community ownership.
- [ ] **Token launch logistics** — Fair launch (no VC allocation, no pre-mine beyond treasury). DEX liquidity pool. Community airdrop to early adopters and community skill authors. Legal review for utility token classification per jurisdiction.

---

## Phase 14: Edge/IoT A2A Binary — ✅ Complete

**Priority**: P2 — Platform. Aligned with [AGNOS Phase 14](https://github.com/MacCracken/agnosticos/blob/main/docs/development/roadmap.md) (Edge Boot Profile, A2A Networking, Hardware Targets, Fleet Management).

**Goal**: A minimal, headless SecureYeoman binary (`secureyeoman-edge`) that runs on edge/IoT devices as an A2A sub-agent. No dashboard, no brain/soul — just agent runtime, A2A transport, and task execution. Pairs with AGNOS to deliver a full OS + agent stack for edge hardware.

> All Phase 14 sub-phases (14A–14E) are complete as of 2026-03-12. See [Changelog](../../CHANGELOG.md) `[2026.3.12-2]` for details.

### 14A: Edge Binary — ✅ Complete (2026-03-11)

- [x] **`secureyeoman-edge` build target** — 7.2 MB static Go binary (`CGO_ENABLED=0`). A2A transport, task executor, memory store, metrics, scheduler, sandbox, messaging, LLM, rate limiting. Cross-compiled: linux-amd64, linux-arm64, linux-armv7. Verified in AGNOS edge container. 83 unit tests + 20 smoke tests.
- [x] **`secureyeoman edge --register` CLI mode** — Self-registration to parent SY. Sends capabilities (CPU, GPU, memory, arch, tags). TOFU certificate pinning for parent TLS.
- [x] **Headless agent executor** — Sandboxed command execution (allowlist/blocklist, symlink resolution, output truncation), webhook tasks, LLM inference tasks via scheduler.
- [x] **Minimal config schema** — `StartConfig`: parent URL, registration token, port, host, log level. No soul/spirit/brain/marketplace.

### 14B: A2A Edge Networking — ✅ Complete (2026-03-12)

- [x] **mDNS peer discovery** — `_secureyeoman._tcp` advertisement + `StartDiscoveryLoop()` auto-registers found peers.
- [x] **WireGuard mesh support** — DB fields for WireGuard public key, endpoint, tunnel IP per edge node. `PUT /api/v1/edge/nodes/:id/wireguard` REST endpoint. Parent distributes mesh configs to fleet.
- [x] **Heartbeat & watchdog** — 30s heartbeat loop, peer liveness tracking, configurable timeout.
- [x] **Bandwidth-aware task acceptance** — Edge nodes report `bandwidthMbps` and `latencyMs` in capabilities (Go + TS). Parent-side routing via `findBestNodeForTask()` scoring (memory, cores, GPU, latency, bandwidth).

### 14C: Fleet Management — ✅ Complete (2026-03-12)

- [x] **Edge node registry** — `edge.nodes` DB table (migration 023) + `EdgeStore` CRUD + 14 REST endpoints under `/api/v1/edge/*`. Supports upsert, heartbeat, WireGuard config, decommission, delete.
- [x] **SY dashboard — Fleet panel** — `FleetPanel.tsx`: node overview cards (total/online/offline/GPU), sortable table, 30s auto-refresh.
- [x] **Capability-based task routing** — `POST /api/v1/edge/route` with scoring algorithm: factors memory, CPU cores, GPU, latency, bandwidth. `findBestNodeForTask()` in EdgeStore with tag/arch/latency constraints.
- [x] **OTA updates with Ed25519** — SHA-256 + Ed25519 signature verification in Go updater. `edge.ota_updates` table tracks update history. `verifyEd25519()` in `updater.go`. REST: `POST /api/v1/edge/nodes/:id/update`, `GET /api/v1/edge/nodes/:id/updates`.

### 14D: MCP Edge Tools — ✅ Complete (2026-03-12)

- [x] **`edge_list`** — List registered edge nodes with health, capabilities, load. Filters by status, arch, tags.
- [x] **`edge_deploy`** — Deploy a task to a specific edge node or auto-select by capability requirements.
- [x] **`edge_update`** — Push OTA update with SHA-256 and Ed25519 signature verification.
- [x] **`edge_health`** — Detailed health report for a specific edge node (capabilities, bandwidth, WireGuard, version, heartbeat).
- [x] **`edge_decommission`** — Decommission an edge node, marking it permanently offline and removing from task routing.

### 14E: Hardware Targets — ✅ Complete (2026-03-12)

- [x] **Raspberry Pi 4/5 (aarch64)** — Cross-compiled `linux-arm64` binary. AGNOS Pi image validation pending.
- [x] **x86_64 NUC/mini-PC** — `linux-amd64` binary. Validated in AGNOS edge container.
- [x] **RISC-V** — `linux-riscv64` cross-compilation target added to `build-binary.sh` (both `--edge` and production paths).
- [x] **OCI container image** — Verified running inside `ghcr.io/maccracken/agnosticos:edge` (10 MB Alpine). ARMv7 cross-compile for broader IoT targets.

---

## Phase 15: Agent Binary (Tier 2.5)

**Priority**: P2 — Platform. See [ADR 039](../adr/039-agent-binary-tier.md).

**Goal**: A streamlined, headless SecureYeoman binary (`secureyeoman-agent`) for autonomous agent workloads. Includes soul, AI providers, and A2A delegation — but not brain/RAG, training, analytics, dashboard, or enterprise compliance subsystems. SQLite-only, <5s boot, 100–200 MB RAM. Enables scaling agent count independently of platform instances.

### 15A: AgentRuntime Core

- [ ] **`AgentRuntime` class** — `src/agent/agent-runtime.ts`, parallel to `EdgeRuntime`. Initializes: config, logger, SQLite, auth (delegated or local), RBAC, soul manager, AI provider router, A2A transport, slim gateway.
- [ ] **Agent CLI entry point** — `src/agent/cli.ts` with `start`, `register`, `status` subcommands. Bun build target for tree-shaking.
- [ ] **Slim gateway** — ~15–20 routes: health, A2A receive/capabilities, chat completions, soul CRUD (personality, skills, tools), model list, tool-call, auth token validation.
- [ ] **SQLite schema subset** — Agent-specific migration with soul tables (personalities, skills, dynamic_tools), auth tables (api_keys), and audit log. No brain, training, simulation, edge fleet tables.

### 15B: Parent Registration & Delegation

- [ ] **Parent registration** — `secureyeoman-agent register --parent-url <url> --token <token>`. Registers with parent SY, receives API key, stores parent URL for delegation.
- [ ] **Auth delegation** — Agent validates incoming tokens against parent's auth service via REST call. Caches valid tokens locally (5 min TTL).
- [ ] **Knowledge delegation** — RAG queries forwarded to parent's brain via A2A message. Agent has no local vector store.
- [ ] **Audit forwarding** — Agent events batched and forwarded to parent's audit chain (reuses AGNOS hook pattern: batch 50, flush 5s).

### 15C: Build & Distribution

- [ ] **Build script tier** — `SECUREYEOMAN_BUILD_TIER=agent` in `build-binary.sh`. Targets: `secureyeoman-agent-linux-x64`, `linux-arm64`, `darwin-arm64`.
- [ ] **Conditional module init** — `SECUREYEOMAN_BUILD_TIER` env var gates module loading. Agent tier loads: soul, AI, delegation (subset), auth (subset), security (subset). Skips: brain, training, analytics, simulation, marketplace, dashboard, DLP, TEE, supply chain, edge fleet, SCIM, break glass.
- [ ] **Container image** — `Dockerfile.agent` with minimal Node.js/Bun base. Target: <120 MB image.
- [ ] **Docker compose profile** — `agent` profile for running alongside full SY.

---

## Phase 16: Shruti DAW Ecosystem Integration

**Priority**: P2 — Platform. See [ADR 040](../adr/040-shruti-ecosystem-integration.md).

**Goal**: Add Shruti (Rust-native DAW) as the 8th ecosystem service, giving SY agents music production, audio recording/editing, spectral analysis, and AI-assisted mixing capabilities. Shruti is at MVP v1 (723 tests, 6 MCP tools, AgentApi with 35+ methods) but needs an HTTP server wrapper before SY can connect.

### 16A: Shruti HTTP Server (Shruti repo)

- [ ] **`shruti serve` subcommand** — Axum or Actix-web server on port 8050 wrapping `AgentApi`. Bearer token auth. Endpoints: session CRUD, track management, transport control, export, analysis, mixer, undo/redo, MCP tool-call dispatch.
- [ ] **Health endpoint** — `GET /health` returning version, uptime, active session, audio device info.
- [ ] **Docker image** — `Dockerfile` for headless Shruti server (no GUI dependencies). Multi-stage Rust build.

### 16B: SY Integration

- [ ] **Ecosystem registration** — Add `shruti` to `EcosystemServiceId` union and `SERVICE_REGISTRY` in `service-discovery.ts`. Port 8050, env `SHRUTI_URL`, secret `SHRUTI_API_KEY`.
- [ ] **Integration client** — `integrations/shruti/shruti-client.ts` HTTP client with methods for all Shruti API endpoints (session, tracks, transport, export, analysis, mixer, undo/redo).
- [ ] **MCP tools** — `mcp/tools/shruti-tools.ts` with 10 tools (`shruti_session_create`, `shruti_session_open`, `shruti_track_add`, `shruti_track_list`, `shruti_region_add`, `shruti_transport`, `shruti_export`, `shruti_analyze`, `shruti_mix`, `shruti_edit`). Gated by `exposeShrutiTools` / `MCP_EXPOSE_SHRUTI_TOOLS`.
- [ ] **Config fields** — `shrutiUrl`, `shrutiApiKey`, `exposeShrutiTools` in `McpServiceConfig`.
- [ ] **Docker compose** — `shruti` and `shruti-dev` services with `shruti` and `full-dev` profiles.

### 16C: Voice-Driven Music Production

- [ ] **STT → Shruti intent bridge** — SY's STT providers transcribe user speech, forward to Shruti's `parse_voice_input()` for DAW-specific intents (play, stop, mute track 2, set tempo 120).
- [ ] **TTS confirmation** — Agent speaks back confirmations via SY's TTS providers ("Track 2 muted", "Exporting session to WAV").
- [ ] **Dashboard panel** — Shruti card in ecosystem services panel. When connected: active session name, track count, transport state, recent analysis results.

---

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Current Status (2026-03-12)

**All suites above target.** Core unit: 89.31% stmt / 79.10% branches (target 88% / 77%). Dashboard: 71.12% stmt / 67.71% branches (target 70% — met). MCP: 70.20% stmt (target 70% — met).

| Suite | Files | Tests | Stmts % | Branch % | Status |
|-------|-------|-------|---------|----------|--------|
| Core Unit | 698 | 16,648 | 89.31 | 79.10 | All passing |
| Dashboard | 180 | 4,131 | 71.12 | 67.71 | All passing — target met |
| MCP | 76 | 1,124 | 70.20 | 51.50 | All passing |
| Core E2E | 8 | 67 | — | — | All passing (incl. binary smoke) |
| Core DB (integration) | 41 | 890 | — | — | All passing (clean DB verified) |
| Go Edge | 16 | 83 | — | — | All passing (19.4s) |

**Refactoring:**

- [x] **auth-middleware.test.ts decomposition** — ✅ Split into 3 focused files: `auth-middleware.test.ts` (56 tests, integration), `auth-middleware-db-authn.test.ts` (24 tests, authentication/bypass), `auth-middleware-db-rbac.test.ts` (32 tests, RBAC enforcement). Total: 112 tests across 2,036 lines.

**Remaining improvement areas:**

| Suite | Area | Notes |
|-------|------|-------|
| Core Unit | `sandbox/`, `config/`, `cli/commands/` | Branch coverage gaps in exec paths and flag parsing |
| Dashboard | ConnectionsPage, CommunityTab, voice hooks | Next target: 75% stmt |
| MCP | `web-tools.ts`, `security-tools.ts`, `network-tools.ts` | Handler-level tests would push toward 75% |
| Core E2E | Expand coverage | Currently 8 files / 67 tests (incl. binary smoke); add training, delegation, analytics flows |

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Trading Dashboard Enhancements

*Improve the financial widgets and live trading experience. Builds on the existing market data proxy, BullShift integration, and chart components.*

- [ ] **BullShift WebSocket streaming** — Replace simulated trade events with real WebSocket feed from BullShift server. Connect to 5 channels (trades, quotes, order updates, positions, account). Requires BullShift WebSocket endpoint implementation.
- [ ] **Multi-symbol watchlist** — Persistent watchlist with configurable symbols. Sparkline mini-charts per symbol. Drag-to-reorder. Saved in localStorage.
- [ ] **Order execution panel** — Place market/limit orders directly from the trading widget. Confirmation dialog, position size calculator, risk/reward preview. Wired to `bullshift_submit_order` MCP tool.
- [ ] **Portfolio P&L chart** — Time-series portfolio value chart using WaterfallChart and RiskReturnScatter components. Unrealized vs realized P&L breakdown.
- [ ] **Intraday charts** — Sub-daily candlestick resolution (1m, 5m, 15m, 1h). Requires intraday market data provider support (Finnhub WebSocket or AlphaVantage intraday endpoints).
- [ ] **Technical indicators** — EMA, RSI, MACD, Bollinger Bands overlay on candlestick chart. Configurable indicator panel below the main chart.
- [ ] **Alert integration** — Visual alert markers on chart (price levels, triggered alerts from `bullshift_create_alert`). Toast notifications when alerts fire.
- [ ] **Entity Eye state from trading** — Wire Entity Eye state to trading activity: active when orders executing, thinking when analyzing, training when backtesting.

---

### Developer Ecosystem & Community Growth

*Only way to close the skill gap at scale.*

- [ ] **Skill SDK** — `npx create-secureyeoman-skill` scaffolding tool. Generates skill directory with schema, test harness, README template, and CI config.
- [ ] **Skill testing framework** — Mock MCP context, simulate tool calls, assert outputs. `SkillTestRunner` class.
- [ ] **Skill submission pipeline** — `secureyeoman skill publish` validates schema, runs tests, opens PR to community repo.
- [ ] **API client libraries** — Python (`secureyeoman-py`) and Go (`secureyeoman-go`) SDKs from OpenAPI spec.
- [ ] **Interactive tutorials** — Guided onboarding flows in dashboard: "Create your first skill," "Set up SSO," "Build a workflow."

---

### Community Marketplace

*Demand-Gated — implement when marketplace adoption justifies the investment.*

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

### WebSocket Mode for AI Providers

*OpenAI WebSocket transport implemented (2026-03-09).*

- [x] **Warm-up / pre-generation** — ✅ Complete (2026-03-12). `WsWarmup` class pre-acquires WS connection and sends minimal `max_output_tokens: 1` request with system prompt and tools to seed `lastResponseId` chain. Integrated into `OpenAIWsProvider.warmup()`. 7 tests.

---

### Consumer Experience

*Lower barrier to entry and improve daily-use experience for individual users and small teams.*

- [ ] **One-click cloud deploy templates** — Railway (`railway.json`), Render (`render.yaml`), and DigitalOcean (`app.json`) deploy templates with pre-configured environment variables. Enables zero-DevOps setup for non-technical users. Include "Deploy to X" buttons in README.
- [ ] **Conversation share & export UX** — Dashboard UI for sharing and downloading conversations. Share: generate a unique link (optionally time-limited or password-protected). Export: download as Markdown, JSON, or PDF from conversation header menu. Backend: conversation export exists via `POST /api/v1/training/export`; this adds a user-facing wrapper with dedicated routes and dashboard components.

---

### Enterprise Upgrades

*Security hardening and compliance capabilities for enterprise deployments.*

- [ ] **HSM Integration** — Hardware Security Module integration for key management. PKCS#11 interface for signing, encryption, and key rotation. Cloud HSM support (AWS CloudHSM, Azure Dedicated HSM, GCP Cloud HSM).

---

### Infrastructure & Platform

*Demand-Gated — implement once operational scale or compliance requirements justify the investment.*

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.
- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based graph layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.
- [ ] **Agent World — Configurable FPS** — fps slider in card settings popover (1–16 fps), persisted in layout config. Only worthwhile if users report animation overhead on low-power devices.
- [ ] **Photisnadi in SY container** — Photisnadi baked into agnosticos base image or run as separate container. User choice via `PHOTISNADI_ENABLED` flag. When embedded, supervisord manages Photisnadi process; when external, SY proxies via SUPABASE_URL.
- [ ] **Task tracker widget — third-party aggregator** — Extend TaskTrackerWidget to aggregate tasks from third-party trackers (Photisnadi, Trello, Jira, Linear, Todoist, Asana) via adapter interface. Unified view of all external task sources.

---

### IDE Extensions

*Lower-priority IDE features. Implement when the core IDE experience is stable and user demand warrants.*

- [ ] **Responsive / mobile layout** — Adaptive layout for smaller screens.
- [ ] **Plugin / extension system** — Third-party editor extensions.

---

### Cross-Project — Full Triangle Convergence

*Ambitious unification of SecureYeoman, AGNOSTIC, and AGNOS. Depends on Phases B–C being stable.*

- [ ] **Unified dev environment** — Shared `docker-compose.unified.yml` with networking across all three projects. Single `.env.unified` for common secrets.
- [ ] **Unified SSO across all three projects** — OAuth2/OIDC federation: single identity provider, shared sessions. SecureYeoman as IdP or external OIDC provider.
- [x] **Cryptographic audit chain bridge** — ✅ Implemented (`agnos-hooks.ts`): batched forwarding (size 50, flush 5s) to AGNOS `POST /v1/audit/forward`. 13 tests. Shared correlation IDs via event metadata.
- [ ] **Cross-project agent delegation** — SecureYeoman brain delegates to AGNOSTIC QA agents running on AGNOS. Full chain: task → brain → A2A → QA agent → AGNOS sandbox → results → brain.
- [x] **Shared vector store / RAG pipeline** — ✅ Implemented (`brain/vector/agnos-store.ts`): `AgnosVectorStore` delegates to AGNOS runtime, batches inserts in chunks of 100. 7 tests.
- [ ] **Unified agent marketplace** — Single marketplace spanning SecureYeoman skills, AGNOSTIC QA capabilities, and AGNOS native agents. Cross-project discovery and installation.

---

### Simulation Engine — Enterprise

*Enterprise-tier licensed feature (`simulation`). A general-purpose live simulation framework built on existing personality, cognitive memory, workflow, voice, and multi-agent subsystems. Subsets below target specific simulation domains.*

#### Core Simulation Infrastructure

- [x] **Simulation tick driver** — ✅ Implemented (`simulation/tick-driver.ts`): Three modes (realtime, accelerated, turn-based). Per-personality configs, pause/resume, tick counting, sim-time epoch. Integrates with mood engine and cognitive memory decay. 17 tests.
- [x] **Emotion & mood model** — ✅ Implemented (`simulation/mood-engine.ts`): Russell's circumplex model (valence/arousal → 10 mood labels). 12 personality trait modifiers. Exponential decay toward baselines. Mood state CRUD + event log. 14 tests.
- [x] **Spatial & proximity awareness** — ✅ Implemented (`simulation/spatial-engine.ts`): 3D entity locations, named zones with bounding boxes, 6 proximity trigger types, declarative rules with cooldown and mood effects, per-tick evaluation. 30 tests.
- [x] **Experiment runner (autoresearch)** — ✅ Implemented (`simulation/experiment-runner.ts`): Autonomous research loop inspired by Karpathy's autoresearch. Fixed-budget experimentation, single-scope modification, metric-driven retain/discard, baseline promotion, experiment journaling. Pluggable `createProposer()` / `createExecutor()` callbacks allow domain-specific autoresearch (see below). 34 tests. Three domain integrations already built:
  - **Hyperparameter search** (`training/hyperparam-autoresearch.ts`): Iterative HP search with automatic space narrowing and convergence detection. 17 tests.
  - **Chaos engineering** (`chaos/chaos-autoresearch.ts`): Iterative resilience improvement with escalation levels, target cycling, and composite resilience scoring. 16 tests.
  - **Circuit breaker tuning** (`resilience/circuit-breaker-autotuner.ts`): Threshold/timeout tuning via observation-based detection scoring. 19 tests.
- [x] **Training executor bridge** — ✅ Implemented (`simulation/training-executor.ts`): Bridges experiment runner to FinetuneManager, EvaluationManager, ExperimentRegistryManager via interface wrappers. 13 tests.
- [x] **Entity relationship graph** — ✅ Implemented (`simulation/relationship-graph.ts`): Persistent inter-entity relationships with affinity (-1 to 1), trust (0 to 1), interaction tracking. 8 relationship types, group membership, tick-driven decay. 14 REST endpoints. Interaction events auto-adjust scores and optionally trigger mood effects. 40 tests.
- [x] **Simulation dashboard panel** — ✅ Implemented (`dashboard/components/simulation/SimulationPanel.tsx`): 4-tab monitoring panel (Tick, Mood, Spatial, Relationships). Real-time tick state with play/pause/advance controls, valence/arousal progress bars with mood label badges, entity/zone tables, relationship affinity/trust bars, group membership display. Gated by `allowSimulation` security policy. 20 tests.

#### Game NPCs

- [ ] **Game state adapter interface** — Pluggable adapter that ingests world/entity state from external game engines (Unity, Unreal, Godot, custom) via HTTP or WebSocket. Feeds location, inventory, relationships, and world events into personality context. Adapter registry pattern matching existing provider systems.
- [ ] **Dialogue & behavior templates** — Pre-built workflow templates for common NPC patterns: merchant bartering, quest-giving, gossip propagation, guard patrol logic, companion decision-making. Importable from marketplace. Parameterized via personality traits.
- [ ] **NPC swarm coordination** — Multi-NPC scene orchestration using existing swarm/council primitives. Coordinated group behaviors: crowd reactions, faction politics, marketplace haggling between NPCs. Council consensus for group decisions.
- [ ] **Voice persona per NPC** — Assign distinct TTS voice profiles per NPC character. Real-time voice streaming for in-game dialogue. Emotion-modulated speech (pitch/speed/tone shift based on mood state). Builds on existing 14-provider TTS system.
- [ ] **NPC fine-tuning pipeline** — Curate training data from player-NPC interactions. Fine-tune personality models on game-specific dialogue, lore, and behavior patterns. A/B test NPC variants. Drift detection for NPC quality regression.

#### Digital Twins

- [ ] **Asset state adapter** — Ingest real-time telemetry from physical assets (IoT sensors, SCADA, BMS) via MQTT, OPC-UA, or HTTP webhooks. Map sensor readings to personality context variables. Pairs with edge binary (`secureyeoman-edge`) for on-premise data collection.
- [ ] **Twin lifecycle management** — CRUD for digital twin entities: bind a personality to a physical asset, configure update frequency, set alert thresholds. Twins inherit cognitive memory for historical state tracking and anomaly awareness.
- [ ] **Predictive state projection** — Workflow templates that use historical memory + current telemetry to project future asset state (maintenance windows, failure probability, capacity planning). Leverages existing LLM routing for inference.
- [ ] **Twin-to-twin communication** — Swarm coordination between digital twins representing interconnected systems (e.g., HVAC + electrical + occupancy). Council consensus for system-wide optimization decisions.
- [ ] **Twin dashboard widgets** — Real-time telemetry cards, historical trend charts, anomaly timeline, and predictive maintenance calendar per twin entity.

#### Training Simulations

- [ ] **Scenario authoring** — Define training scenarios as parameterized workflow templates: learning objectives, branching decision points, scoring rubrics, time pressure settings. Marketplace-publishable.
- [ ] **Simulated actors** — Personalities configured as training counterparts (simulated customer, patient, adversary, interviewer). Behavior adjustable by difficulty level. Emotion model drives realistic escalation/de-escalation.
- [ ] **Trainee session tracking** — Record trainee interactions per scenario run. Score against rubric criteria. Track progression across repeated attempts. Export reports for compliance/certification evidence.
- [ ] **Adaptive difficulty** — Auto-adjust simulated actor behavior based on trainee performance. Uses cognitive memory of past sessions to identify weak areas and increase challenge selectively.
- [ ] **Debrief & replay** — Post-scenario debrief: annotated conversation replay, decision-point analysis, alternative path exploration. Builds on existing agent replay infrastructure.

#### Organizational Modeling

- [ ] **Org entity adapter** — Model departments, teams, roles, and processes as simulation entities. Ingest org data from HR systems (BambooHR, Workday) or SCIM directory sync. Each entity gets a personality representing its function and constraints.
- [ ] **Process simulation** — Define business processes as workflow DAGs with simulated handoffs between org entities. Measure throughput, bottlenecks, and failure modes. What-if analysis: add/remove roles, change approval chains, shift workloads.
- [ ] **Change impact modeling** — Simulate organizational changes (reorgs, policy shifts, tool migrations) before deployment. Entities react based on personality traits and relationship graph. Surface predicted friction points and adoption curves.
- [ ] **Stakeholder sentiment tracking** — Emotion model applied to org entities: track morale, resistance, engagement over simulated time. Dashboard heatmap of organizational sentiment across departments.

#### Multi-Agent Research

- [ ] **Hypothesis exploration swarms** — Spawn agent swarms that independently research a hypothesis from different angles (literature review, data analysis, counter-argument, synthesis). Council consensus produces a weighted conclusion with confidence scores.
- [ ] **Simulated peer review** — Personalities configured as domain-expert reviewers with distinct perspectives and biases. Submit research outputs for simulated peer review cycles. Iterative feedback loops via workflow engine.
- [ ] **Longitudinal study simulation** — Time-series simulation of research phenomena: model evolving variables, inject events at scheduled ticks, observe emergent patterns. Cognitive memory tracks accumulated observations across simulated time.

#### Scientific Modeling

- [ ] **Model definition DSL** — Declarative schema for defining scientific models: state variables, equations/rules (symbolic or code), initial conditions, parameter ranges, and output observables. Stored as workflow-compatible JSON. Importable/exportable for reproducibility.
- [ ] **Parameter sweep engine** — Batch exploration of parameter spaces: grid search, Latin hypercube sampling, or Bayesian optimization. Each parameter set runs as a parallel workflow. Results aggregated into comparison dashboards with sensitivity analysis. Foundation already in place via `ExperimentRunner` autoresearch framework and `HyperparamAutoresearch` (iterative narrowing, convergence detection).
- [ ] **Agent-based modeling (ABM)** — Map simulation entities to scientific agents (cells, organisms, particles, economic actors). Each agent is a personality with domain-specific rules and stochastic behavior. Tick driver advances population state. Emergent phenomena observed via relationship graph and spatial awareness.
- [ ] **Experiment journaling** — Automatic provenance logging: every simulation run records parameters, random seeds, model version, and full output trace to audit chain. Reproducible reruns from journal entries. Exportable as supplementary material for publications. Core journaling infrastructure already in `ExperimentRunner` (hypothesis tracking, run status, metric recording, retain/discard decisions).
- [ ] **Data ingestion adapters** — Import observational/experimental datasets (CSV, HDF5, NetCDF, FITS) as simulation initial conditions or validation baselines. Adapter registry for domain-specific formats. Comparison tools for simulated vs. observed data with statistical goodness-of-fit metrics.
- [ ] **Visualization & export** — Time-series plots, phase diagrams, population dynamics charts, spatial heatmaps. Export simulation results as publication-ready figures (SVG/PNG), raw data (CSV/Parquet), or Jupyter-compatible notebooks. Dashboard widgets for interactive exploration.
- [ ] **LLM-assisted analysis** — Post-simulation agent that interprets results: identifies trends, flags anomalies, suggests follow-up experiments, generates natural-language summaries of findings. Personality tunable per scientific domain (bio, physics, econ, climate).
- [ ] **Collaborative model sharing** — Publish validated models to the community marketplace. Versioned model registry with citation metadata (DOI-ready). Peer review workflow using simulated reviewer personalities. Fork and extend community models.

---

### Ideas & Exploration

*Lower-priority ideas. Not scheduled — track here for future consideration.*

- [x] **Offline-first PWA** — ✅ Complete (2026-03-12). `vite-plugin-pwa` with Workbox, `manifest.webmanifest`, service worker registration, `idb`-backed IndexedDB cache (`offline-db.ts`), `useOffline` hook with auto-sync mutation queue, `OfflineBanner` component, NetworkFirst caching for conversations/settings/personalities API. 5 tests.

---

## Dependency Watch

See [dependency-watch.md](dependency-watch.md) for tracked third-party dependencies with known issues requiring upstream resolution.

---

## Related Documentation

- [System Architecture](../adr/001-system-architecture.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-03-12 (Phase 15 Agent Binary + Phase 16 Shruti DAW added; Phase 14 complete). See [Changelog](../../CHANGELOG.md) for full history.*
