# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| — | Engineering Backlog | Ongoing | Security hardening complete; test coverage improvements ongoing |
| Future | Consumer Experience, Enterprise Upgrades, Dev Ecosystem, Infra, Full Triangle | Future / Demand-Gated | — |

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

---

## License Up: Tier Audit & Enforcement Activation

**Priority**: P1 — Commercial. Must complete before public release.

**Prerequisites**: Phase 106 (license gating infrastructure — ✅), Schema Tier Split (above).

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

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Current Status (2026-03-11)

**All suites above target.** Core unit: 89.31% stmt / 79.10% branches (target 88% / 77%). Dashboard: 71.12% stmt / 67.71% branches (target 70% — met). MCP: 70.20% stmt (target 70% — met).

| Suite | Files | Tests | Stmts % | Branch % | Status |
|-------|-------|-------|---------|----------|--------|
| Core Unit | 642 | 15,827 | 89.31 | 79.10 | All passing |
| Dashboard | 179 | 4,105 | 71.12 | 67.71 | All passing — target met |
| MCP | 75 | 1,111 | 70.20 | 51.50 | All passing |
| Core E2E | 7 | 53 | — | — | All passing |
| Core DB (integration) | 41 | 890 | — | — | All passing (clean DB verified) |

**Remaining improvement areas:**

| Suite | Area | Notes |
|-------|------|-------|
| Core Unit | `sandbox/`, `config/`, `cli/commands/` | Branch coverage gaps in exec paths and flag parsing |
| Dashboard | ConnectionsPage, CommunityTab, voice hooks | Next target: 75% stmt |
| MCP | `web-tools.ts`, `security-tools.ts`, `network-tools.ts` | Handler-level tests would push toward 75% |
| Core E2E | Expand coverage | Currently 7 files / 53 tests; add training, delegation, analytics flows |

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

*OpenAI WebSocket transport implemented (2026-03-09). Remaining item:*

- [ ] **Warm-up / pre-generation** — Support `generate: false` mode to pre-load model state and tools on the connection before the first user message, reducing first-response latency for personality activations.

---

### Consumer Experience

*Lower barrier to entry and improve daily-use experience for individual users and small teams.*

- [ ] **One-click cloud deploy templates** — Railway (`railway.json`), Render (`render.yaml`), and DigitalOcean (`app.json`) deploy templates with pre-configured environment variables. Enables zero-DevOps setup for non-technical users. Include "Deploy to X" buttons in README.
- [ ] **Conversation share & export UX** — Dashboard UI for sharing and downloading conversations. Share: generate a unique link (optionally time-limited or password-protected). Export: download as Markdown, JSON, or PDF from conversation header menu. Backend: conversation export exists via `POST /api/v1/training/export`; this adds a user-facing wrapper with dedicated routes and dashboard components.

---

### Enterprise Upgrades

*Security hardening and compliance capabilities for enterprise deployments.*

- [ ] **WebAuthn/FIDO2 auth** — Hardware key authentication for admins. Passwordless login with security keys (YubiKey, Touch ID, Windows Hello). Attestation and assertion flows via `@simplewebauthn/server`.
- [ ] **HSM Integration** — Hardware Security Module integration for key management. PKCS#11 interface for signing, encryption, and key rotation. Cloud HSM support (AWS CloudHSM, Azure Dedicated HSM, GCP Cloud HSM).
- [ ] **SCIM provisioning** — RFC 7644 SCIM 2.0 server for automated user lifecycle management. Auto-create, update, deactivate users from IdP directories (Okta, Azure AD, Google Workspace). Group-to-role mapping. Complements existing SSO/OIDC/SAML.
- [ ] **Per-tenant rate limiting & token budgets** — Extend existing rate limiter with tenant-scoped rules: API request quotas, LLM token spend caps, and storage limits per tenant. Quota usage dashboard in Mission Control. Proactive warnings at 80%/90% thresholds. Builds on `rate-limiter.ts` sliding-window infrastructure.
- [ ] **Break-glass emergency access** — Documented recovery procedure when admin is locked out. Sealed recovery key generated at install time (printed once, never stored). Break-glass creates a time-limited admin session with full audit trail. Distinct from existing personality emergency stop (`POST /api/v1/security/autonomy/:id/emergency-stop`), which halts agent actions but not platform access.
- [ ] **Access review & entitlement reporting** — "Who has access to what" report endpoint. Periodic access review campaigns: admin schedules a review, reviewers approve/revoke each user's permissions, results logged to audit chain. Supports SOC 2 CC6.1 / SOX access certification requirements.
- [ ] **Formal compliance audit scope documentation** — Published SOC 2 Type II audit scope document mapping SY controls to Trust Services Criteria. ISO 27001 Statement of Applicability. Builds on existing `compliance-mapping.ts` (NIST, SOC 2, ISO 27001, HIPAA, EU AI Act) by adding narrative evidence descriptions and control ownership.

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
- [ ] **Cryptographic audit chain bridge** — SecureYeoman audit events forwarded to AGNOS cryptographic audit chain. Shared correlation IDs, immutable cross-project audit trail.
- [ ] **Cross-project agent delegation** — SecureYeoman brain delegates to AGNOSTIC QA agents running on AGNOS. Full chain: task → brain → A2A → QA agent → AGNOS sandbox → results → brain.
- [ ] **Shared vector store / RAG pipeline** — AGNOS embedded vector store accessible from SecureYeoman and AGNOSTIC. Shared knowledge base: code, docs, QA findings, audit logs.
- [ ] **Unified agent marketplace** — Single marketplace spanning SecureYeoman skills, AGNOSTIC QA capabilities, and AGNOS native agents. Cross-project discovery and installation.

---

### Ideas & Exploration

*Lower-priority ideas. Not scheduled — track here for future consideration.*

- [ ] **Offline-first PWA** — ServiceWorker + IndexedDB. Closes mobile gap without native apps.

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

*Last updated: 2026-03-11 (AGNOS handshake fully verified with type/timestamp fixes; dashboard coverage 71.12%; forge adapters done). See [Changelog](../../CHANGELOG.md) for full history.*
