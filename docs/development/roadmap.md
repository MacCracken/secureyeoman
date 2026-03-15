# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| — | Dashboard Audit & Repair | P1 — quality | Planned (pre-release) |
| — | E2E Test Expansion | P1 — quality | Planned |
| 16 | Shruti DAW Ecosystem Integration | P2 — platform | 16A–C done; dashboard panel remaining |
| 17 | Native Mobile Experience | P2 — platform | Planned (17A–E) |
| — | Engineering Backlog | Ongoing | Test coverage improvements ongoing |
| Future | Consumer Experience, Enterprise Upgrades, Dev Ecosystem, Shipping & Logistics, Infra, Full Triangle, Simulation Engine | Future / Demand-Gated | Demand-gated |

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

- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates. Currently defaults to `false` for development.
- [ ] **Solopreneur tier definition** — Define Solopreneur as enterprise-feature-equivalent with single-tenant / single-seat constraints. Decide on `LicenseTier` implementation approach (see note above).
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.
- [ ] **Pricing page** — Public-facing pricing comparison page for secureyeoman.ai. Feature breakdown per tier, FAQ, upgrade flow.
- [ ] **LemonSqueezy product setup** — Create store, products, and variants in LemonSqueezy dashboard. Configure webhook URL pointing to licensing service. Set `VITE_LEMONSQUEEZY_*_URL` env vars in dashboard build.

### Repository & Public Identity

- [ ] **Transfer repositories to `yeoman.maccracken`** — Transfer `secureyeoman` and `secureyeoman-community-repo` to the `yeoman.maccracken` GitHub account. This will be the public-facing org. Update all references: README badges, install scripts (`curl -fsSL https://secureyeoman.ai/install`), Docker image paths (GHCR), Helm chart repo URLs, community sync default URL, and CI/CD workflow `GITHUB_REPOSITORY` refs.
- [ ] **Post-transfer fixups** — Update `package.json` repository fields, CHANGELOG links, ADR cross-references, dashboard "Report Issue" URLs, and any hardcoded GitHub URLs in docs or code. Verify GitHub redirect from old org works for existing clones.

### Payment & Monetization

**Architecture**: Separate `secureyeoman-licensing` repo (`../secureyeoman-licensing/`). Lightweight Fastify + SQLite service that receives LemonSqueezy webhooks, mints Ed25519-signed keys, and serves key retrieval API. SY dashboard opens LemonSqueezy checkout overlay in-app, polls licensing service for key after purchase, auto-applies via `POST /api/v1/license/key`.

- [ ] **LemonSqueezy account setup** — Create store, 3 products (Pro/Solopreneur/Enterprise), configure webhook URL, obtain API key + signing secret. Test mode available for end-to-end purchase testing without real charges.
- [ ] **End-to-end test** — Test mode purchase → webhook → key mint → dashboard retrieval → auto-apply → enforcement check. Confirm round-trip.
- [ ] **Renewal & lifecycle** — Auto-renewal reminders (30/14/7 days before expiry). Handle `subscription_expired` / `subscription_payment_failed` webhooks. Upgrade path: pro-rate remaining time when moving up tiers.
- [ ] **Refund handling** — `order_refunded` webhook → revoke license key in records DB. Key continues to validate offline (Ed25519 is self-contained) but records DB tracks revocation for audit.
- [ ] **Key re-delivery** — "Lost your license key?" flow in dashboard: enter email → licensing service returns key preview → email verification → full key delivered.

### $YEOMAN Token — Crypto Payment Channel

*Speculative — demand-gated. Introduces a crypto payment option alongside traditional fiat. NOT a prerequisite for launch.*

- [ ] **Token design** — ERC-20 or Solana SPL token ($YEOMAN). Fixed supply or capped inflation. Utility: license purchases, marketplace skill tips, community governance votes. NOT a security — no profit-sharing, no staking rewards, pure utility.
- [ ] **License purchase with $YEOMAN** — Accept $YEOMAN as payment for Pro/Solopreneur/Enterprise licenses at a discount (e.g. 20% off vs fiat). Smart contract escrow: tokens held until license key delivered. On-chain receipt serves as proof of purchase.
- [ ] **Community marketplace tipping** — Skill authors can receive $YEOMAN tips from users. Displayed on skill cards in marketplace. Incentivizes community contribution without SY taking a cut.
- [ ] **Governance voting** — $YEOMAN holders vote on roadmap priorities (feature requests, integration order). Lightweight on-chain governance — advisory, not binding. Builds community ownership.
- [ ] **Token launch logistics** — Fair launch (no VC allocation, no pre-mine beyond treasury). DEX liquidity pool. Community airdrop to early adopters and community skill authors. Legal review for utility token classification per jurisdiction.

---

## Dashboard Audit & Repair

**Priority**: P1 — Quality. Pre-release.

**Goal**: Systematic audit of the dashboard codebase for bugs, UX issues, accessibility, and code quality. Findings become tracked repair items — fix critical/high now, defer medium/low to engineering backlog.

- [ ] **Component audit** — Review all major pages and panels for correctness, responsiveness, error states, and loading states
- [ ] **Accessibility pass** — Keyboard navigation, ARIA labels, color contrast, screen reader compatibility
- [ ] **State management audit** — TanStack Query cache invalidation, optimistic updates, stale data handling
- [ ] **Error boundary coverage** — Ensure all major sections have error boundaries with user-friendly fallbacks
- [ ] **Performance audit** — Bundle size analysis, unnecessary re-renders, lazy loading of heavy components
- [ ] **Repair items** — Tracked as sub-tasks; critical/high fixed pre-release, medium/low added to engineering backlog

---

## E2E Test Expansion

**Priority**: P1 — Quality. Currently 8 files / 67 tests. Target: cover all major user flows.

**Goal**: Expand backend E2E test suite (`src/__e2e__/`) to cover flows that unit tests can't adequately verify — multi-step API sequences, cross-module interactions, auth flows.

- [ ] **Training & distillation flows** — Job creation, status polling, completion. Dataset upload → finetune → evaluation pipeline.
- [ ] **Delegation & A2A flows** — Task delegation to sub-agents, A2A message routing, swarm coordination
- [ ] **Analytics & reporting flows** — Metrics aggregation, cost tracking, CSV/JSON export
- [ ] **Brain & RAG flows** — Knowledge ingestion, recall, memory scoping across personalities
- [ ] **Marketplace flows** — Skill install/uninstall, workflow import, community sync
- [ ] **MCP tool execution flows** — Tool discovery, execution via streamable HTTP, config toggling

---

## Phase 16: Shruti DAW Ecosystem Integration

**Priority**: P2 — Platform. See [ADR 034](../adr/034-ecosystem-integrations.md).

**Goal**: Complete remaining Shruti DAW integration. Client, routes, MCP tools, voice bridge all complete (85 tests). Remaining: dashboard panel.

### 16C: Dashboard Integration

- [ ] **Dashboard panel** — Shruti card in ecosystem services panel. (Deferred — dashboard work tracked separately.)

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

**Remaining improvement areas:**

| Suite | Area | Notes |
|-------|------|-------|
| Core Unit | `sandbox/`, `config/`, `cli/commands/` | Branch coverage gaps in exec paths and flag parsing |
| Dashboard | ConnectionsPage, CommunityTab, voice hooks | Next target: 75% stmt |
| MCP | `web-tools.ts`, `security-tools.ts`, `network-tools.ts` | Handler-level tests would push toward 75% |
| Core E2E | Expand coverage | Currently 8 files / 67 tests (incl. binary smoke); add training, delegation, analytics flows |

### Security Audit — Deferred Items (2026-03-13)

Items identified during code audit rounds 1–3, intentionally deferred due to low exploitability or narrow attack surface. Pick up when touching adjacent code.

| Area | File | Issue | Risk | Notes |
|------|------|-------|------|-------|
| Auth | `src/security/auth.ts` L145–164 | Timing side-channel on 2FA hydration — `scrypt` timing reveals whether a user has 2FA enabled | Low | Requires local network position + high-precision timing. Fix: constant-time dummy `scrypt` when no 2FA configured. |
| Chaos | `src/chaos/chaos-manager.ts` L95–101 | TOCTOU race in experiment delete — running check and deletion are not atomic | Low | Admin-only feature, narrow window. Fix: `DELETE ... WHERE id = $1 AND status != 'running'` single-query guard. |
| Workflow | `src/workflow/workflow-engine.ts` L559–569 | Webhook header prototype pollution residual — `__proto__`/`constructor`/`prototype` filtered, but `Object.create(null)` base would be safer | Very Low | Already filtered for known dangerous keys. Fix: use `Object.create(null)` for header accumulation object. |

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

### Native Clients — Desktop

*Phase 91 delivered the Tauri v2 desktop scaffold (complete 2026-03-01).*

- [ ] **Auto-update** — Tauri updater for desktop (delta bundles via `tauri-plugin-updater`).
- [ ] **Desktop system tray enhancements** — Quick-access menu: active personality selector, last conversation shortcut, toggle notifications. Global keyboard shortcut to focus the window.

---

### Phase 17: Native Mobile Experience

*Strategy: Build a sovereign, native-first mobile app — not just a WebView wrapper. Differentiator vs. OpenClaw (messaging-as-interface) and generic SaaS AI apps. SecureYeoman mobile = your private AI agent in your pocket, running on your infrastructure, secured by your rules. Capacitor v8 scaffold exists (2026-03-01); this phase builds it into a production-grade native app.*

#### 17A — Foundation & Secure Connectivity

*Core infrastructure that all subsequent mobile work depends on.*

- [ ] **Tailscale / WireGuard connectivity layer** — Capacitor plugin or embedded Tailscale client for secure tunnel to private SY instances behind home networks or enterprise firewalls. Zero-config for Tailscale users (authenticate once, auto-discover SY instance via MagicDNS). Fallback: manual WireGuard config import. This is the killer feature — no port forwarding, no public exposure, just open the app and you're connected to your sovereign instance.
- [ ] **Biometric authentication** — Face ID / Touch ID / fingerprint via `@capacitor/biometrics`. Gate app access and sensitive operations (API key viewing, personality deletion, license management). Store JWT refresh token in secure enclave (iOS Keychain / Android Keystore), unlock with biometric.
- [ ] **Push notification bridge** — Firebase Cloud Messaging (Android) + APNs (iOS) via `@capacitor/push-notifications`. Core sends notification → new `PushDispatcher` in notification fan-out chain → device token registry (per-user, per-device) → platform-specific push. Notification types: proactive suggestions, security alerts, heartbeat warnings, task completions, agent messages. Tap-to-action deep links.
- [ ] **Device token management** — `POST /api/v1/devices/register` endpoint. Tracks device ID, platform, push token, last seen. Auto-cleanup stale tokens (30 days inactive). Multi-device support — user can have phone + tablet registered simultaneously.
- [ ] **Secure local storage** — `@capacitor/preferences` for non-sensitive settings. `@capacitor-community/secure-storage` for tokens, keys, connection profiles. Encrypted at rest on both platforms.

#### 17B — Core Mobile UX

*Mobile-optimized interface — not just responsive web, but native-feeling interactions.*

- [ ] **Mobile navigation shell** — Bottom tab bar (Chat, Dashboard, Notifications, Settings) replacing sidebar. Gesture navigation (swipe between conversations, pull-to-refresh). Native status bar integration, safe area handling, haptic feedback on key actions.
- [ ] **Mobile chat interface** — Optimized chat view: native keyboard handling, quick-reply suggestions, voice input button, attachment picker (camera, files, photos). Streaming responses with typing indicator. Conversation list with search, swipe-to-archive.
- [ ] **At-a-glance dashboard** — Compact mission control: system health card, active personality, unread notification badge, recent agent activity feed, cost summary. Not a port of the full desktop dashboard — a purpose-built mobile overview.
- [ ] **Notification center** — Native notification grouping (by source: security, proactive, agents, system). In-app notification tray with mark-read, dismiss, action buttons. Proactive suggestion cards with approve/dismiss inline. Badge count on app icon.
- [ ] **Mobile settings** — Connection profile management (add/switch SY instances), notification preferences (per-type toggle, quiet hours), biometric toggle, theme selection (subset of 45 themes optimized for OLED), Tailscale/WireGuard status.

#### 17C — Offline-First & Sync

*Leverage existing IndexedDB/offline infrastructure in dashboard, extend with native capabilities.*

- [ ] **Offline conversation cache** — Cache recent conversations in device storage. Read-only access when disconnected. Pending message queue (compose offline, send on reconnect). Sync status indicator per conversation.
- [ ] **Background sync** — `@capacitor/background-task` for periodic sync when app is backgrounded. Pull new notifications, sync conversation updates, refresh proactive suggestions. Respect battery optimization (adaptive sync frequency).
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices via the existing REST API. Offline-first with conflict resolution (last-write-wins for preferences, merge for conversations).
- [ ] **Connection resilience** — Graceful handling of Tailscale tunnel drops (auto-reconnect with exponential backoff). Visual connection state indicator (connected / reconnecting / offline). Queue critical actions during brief disconnects.

#### 17D — Native Device Integration

*Capabilities that only a native app can provide — the reason this isn't just a PWA.*

- [ ] **Voice interaction** — Push-to-talk or wake-word activation via `@capacitor-community/speech-recognition`. Stream audio to SY for transcription → agent processing → TTS response via device speaker. Hands-free mode for driving/cooking.
- [ ] **Camera & document capture** — Snap a photo or scan a document → send to agent for analysis. OCR pipeline: capture → `@capacitor/camera` → upload to SY → vision model analysis → response. Useful for: receipt scanning, whiteboard capture, code screenshot analysis.
- [ ] **Share extension** — iOS Share Sheet / Android Share Intent target. Share URLs, text, images, files from any app directly into SY for agent processing. "Send to SecureYeoman" as a system-wide action.
- [ ] **Widgets** — iOS WidgetKit / Android App Widgets. At-a-glance: system health status, unread notification count, quick-chat launcher, active personality display. Home screen presence without opening the app.
- [ ] **Shortcuts & automation** — iOS Shortcuts / Android Quick Settings tile. "Ask SecureYeoman" Siri Shortcut. Tasker/Automate integration on Android. Quick Settings tile for toggle notifications or switch personality.

#### 17E — App Store & Distribution

*Production readiness for public distribution.*

- [ ] **App icons & splash screens** — Production icon set (all required sizes for iOS + Android). Adaptive icons (Android 13+). Splash screen with brand animation.
- [ ] **App Store compliance** — Privacy nutrition labels (iOS), data safety section (Android). Review guideline compliance: no remote code execution claims, proper content ratings, privacy policy URL. TestFlight / Play Console internal testing tracks.
- [ ] **Release pipeline** — CI workflow: `npm run build:dashboard` → `npx cap sync` → Fastlane (iOS) / Gradle (Android) → TestFlight / Play Console upload. Triggered by CalVer tag. Signing key management via CI secrets.
- [ ] **Auto-update** — App Store / Play Store release channels. In-app update prompts for critical updates (`@capacitor/app-update` or platform APIs). Version compatibility check against SY server version.

---

### Shipping & Logistics Intelligence

*Unified shipping operations via MCP integrations and native tools. Manage multi-carrier shipping, track packages, optimize fulfillment, and automate logistics workflows from within SecureYeoman.*

- [ ] **Featured MCP servers** — Shippo, ShipBob, and ShipStation added to the dashboard MCP prebuilt picker. One-click connect with API key configuration. Covers rate shopping, label generation, tracking, inventory, and fulfillment.
- [ ] **Logistics MCP tools (native)** — Built-in `logistics_*` MCP tool set: `logistics_track_shipment`, `logistics_get_rates`, `logistics_create_label`, `logistics_address_verify`. Unified interface across carriers via EasyPost or direct carrier APIs. Registered in `manifest.ts`, gated by `exposeLogisticsTools` flag.
- [ ] **Shipment tracking dashboard widget** — Real-time package tracking card: carrier, status, ETA, map visualization. Multi-shipment list with filter/search. Status change notifications via proactive engine.
- [ ] **Shipping workflow templates** — Pre-built workflows: order-to-ship automation (new order → rate shop → cheapest label → tracking notification), return processing, batch label generation, carrier performance comparison.
- [ ] **Address validation integration** — Validate and autocorrect shipping addresses before label purchase. Surface suggestions in chat and dashboard. Reduces failed deliveries.
- [ ] **Carrier analytics** — Cost-per-shipment, delivery time, and exception rate dashboards across carriers. Historical trend analysis. Carrier performance scoring to inform rate shopping decisions.

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

- [ ] **Plugin / extension system** — Third-party editor extensions.

---

### Cross-Project — Full Triangle Convergence

*Ambitious unification of SecureYeoman, AGNOSTIC, and AGNOS. Depends on Phases B–C being stable.*

- [ ] **Unified dev environment** — Shared `docker-compose.unified.yml` with networking across all three projects. Single `.env.unified` for common secrets.
- [ ] **Unified SSO across all three projects** — OAuth2/OIDC federation: single identity provider, shared sessions. SecureYeoman as IdP or external OIDC provider.
- [ ] **Cross-project agent delegation** — SecureYeoman brain delegates to AGNOSTIC QA agents running on AGNOS. Full chain: task → brain → A2A → QA agent → AGNOS sandbox → results → brain.
- [ ] **Unified agent marketplace** — Single marketplace spanning SecureYeoman skills, AGNOSTIC QA capabilities, and AGNOS native agents. Cross-project discovery and installation.

---

### Simulation Engine — Enterprise

*Enterprise-tier licensed feature (`simulation`). A general-purpose live simulation framework built on existing personality, cognitive memory, workflow, voice, and multi-agent subsystems. Subsets below target specific simulation domains.*

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

## Dependency Watch

See [dependency-watch.md](dependency-watch.md) for tracked third-party dependencies with known issues requiring upstream resolution.

---

## Related Documentation

- [Go-Live Checklist](go-live-checklist.md)
- [System Architecture](../adr/001-system-architecture.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Marketing Strategy](../marketing-strategy.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-03-14 (Pruned completed items — Phases 14, 15, DDoS, WebSocket warm-up, Simulation core infra, PWA, and other `[x]` items moved to Changelog). See [Changelog](../../CHANGELOG.md) for full history.*
