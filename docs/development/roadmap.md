# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| — | Engineering Backlog (incl. Security Hardening) | Ongoing | Pick-up opportunistically |
| Future | LLM Providers, Voice, Infrastructure, Dev Ecosystem | Future / Demand-Gated | — |

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

## License Up: Tier Audit & Enforcement Activation

**Priority**: P1 — Commercial. Must complete before public release.

**Prerequisite**: Phase 106 (license gating infrastructure — ✅).

- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates.
- [ ] **Upgrade prompts** — "Upgrade to Pro" and "Upgrade to Enterprise" CTAs in `FeatureLock` with pricing page links.
- [ ] **License key purchase flow** — Integration with payment provider or manual key issuance workflow. Dashboard license management page.
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.

---

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Current Status (2026-03-06)

**Core unit: 89.67% stmt / 79.49% branches** (target 88% / 77% — exceeded).

| Suite | Files | Tests | Stmts % | Branch % | Status |
|-------|-------|-------|---------|----------|--------|
| Core Unit | 607 | 15,110 | 89.67 | 79.49 | All passing |
| Dashboard | 100 | 1,408 | 44.56 | 46.32 | All passing |
| MCP | 57 | 820 | 58.51 | 46.51 | All passing |
| Core E2E | 7 | 53 | — | — | All passing |
| Core DB (integration) | 41 | 886 | — | — | All passing (clean DB verified) |

**Improvement areas per suite:**

| Suite | Area | Notes |
|-------|------|-------|
| Core Unit | `sandbox/`, `config/`, `cli/commands/` | Branch coverage gaps in exec paths and flag parsing |
| Core Unit | `training/federated/`, `workflow/` | Manager logic branches, engine conditions |
| Dashboard | All components | 44% stmt coverage — unit test sweep in progress |
| MCP | Tool handlers, manifest | 58% stmt coverage — unit test sweep in progress |
| Core E2E | Expand coverage | Currently 7 files / 53 tests; add training, delegation, analytics flows |

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Developer Ecosystem & Community Growth

*Only way to close the skill gap at scale.*

- [ ] **Skill SDK** — `npx create-secureyeoman-skill` scaffolding tool. Generates skill directory with schema, test harness, README template, and CI config.
- [ ] **Skill testing framework** — Mock MCP context, simulate tool calls, assert outputs. `SkillTestRunner` class.
- [ ] **Skill submission pipeline** — `secureyeoman skill publish` validates schema, runs tests, opens PR to community repo.
- [ ] **API client libraries** — Python (`secureyeoman-py`) and Go (`secureyeoman-go`) SDKs from OpenAPI spec.
- [ ] **Interactive tutorials** — Guided onboarding flows in dashboard: "Create your first skill," "Set up SSO," "Build a workflow."

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

### WebSocket Mode for AI Providers

*Demand-Gated — implement once adoption of multi-turn agentic workflows justifies the investment. OpenAI's WebSocket API (wss://api.openai.com/v1/responses) demonstrates up to ~40% faster end-to-end execution for tool-heavy rollouts (20+ tool calls) by maintaining persistent connections and sending only incremental inputs per turn.*

- [ ] **WebSocket transport layer** — Abstract a `WebSocketTransport` alongside the existing HTTP transport in the AI client. Persistent connection (up to 60 min) with automatic reconnection and exponential backoff. Provider-agnostic interface so other providers can adopt WebSocket mode as they ship it.
- [ ] **Incremental turn submission** — On subsequent turns within a connection, send only `previous_response_id` + new input items (tool outputs, user messages) instead of replaying the full conversation. Reduces payload size and provider-side reprocessing.
- [ ] **Connection pooling & lifecycle** — Connection pool per provider account (configurable pool size). Idle timeout, health checks, and graceful drain on shutdown. Metrics: active connections, reconnection count, average turn latency.
- [ ] **Warm-up / pre-generation** — Support `generate: false` mode to pre-load model state and tools on the connection before the first user message, reducing first-response latency for personality activations.
- [ ] **Fallback to HTTP** — Automatic fallback to standard HTTP streaming when WebSocket connection fails or provider doesn't support it. Transparent to calling code — the AI client selects transport based on provider capability and connection health.
- [ ] **Provider support matrix** — Initially OpenAI only. Track Anthropic, Google, and other provider WebSocket API availability. Feature-gated per provider in `AiProviderConfig`.

---

### Enterprise Upgrades

*Security hardening and compliance capabilities for enterprise deployments.*

- [ ] **WebAuthn/FIDO2 auth** — Hardware key authentication for admins. Passwordless login with security keys (YubiKey, Touch ID, Windows Hello). Attestation and assertion flows via `@simplewebauthn/server`.
- [ ] **HSM Integration** — Hardware Security Module integration for key management. PKCS#11 interface for signing, encryption, and key rotation. Cloud HSM support (AWS CloudHSM, Azure Dedicated HSM, GCP Cloud HSM).

---

### Infrastructure & Platform

*Demand-Gated — implement once operational scale or compliance requirements justify the investment.*

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.
- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based graph layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.
- [ ] **Agent World — Configurable FPS** — fps slider in card settings popover (1–16 fps), persisted in layout config. Only worthwhile if users report animation overhead on low-power devices.

---

### IDE Extensions

*Lower-priority IDE features. Implement when the core IDE experience is stable and user demand warrants.*

- [ ] **Responsive / mobile layout** — Adaptive layout for smaller screens.
- [ ] **Plugin / extension system** — Third-party editor extensions.

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

*Last updated: 2026-03-06 (Phase 144 complete, completed items pruned). See [Changelog](../../CHANGELOG.md) for full history.*
