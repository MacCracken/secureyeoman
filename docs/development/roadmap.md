# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| 145 | Cross-Project MCP Expansion | P2 | 3 future items remaining |
| — | Engineering Backlog (incl. Security Hardening) | Ongoing | Pick-up opportunistically |
| Future | LLM Providers, Voice, Infra, Dev Ecosystem, Unified Dev Env, Full Triangle | Future / Demand-Gated | — |

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

- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates.
- [ ] **Upgrade prompts** — "Upgrade to Pro" and "Upgrade to Enterprise" CTAs in `FeatureLock` with pricing page links.
- [ ] **License key purchase flow** — Integration with payment provider or manual key issuance workflow. Dashboard license management page.
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.

---

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Current Status (2026-03-08)

**Core unit: 89.31% stmt / 79.10% branches** (target 88% / 77% — exceeded).

| Suite | Files | Tests | Stmts % | Branch % | Status |
|-------|-------|-------|---------|----------|--------|
| Core Unit | 620 | 15,364 | 89.31 | 79.10 | All passing |
| Dashboard | 164 | 3,201 | 62.37 | 61.98 | All passing |
| MCP | 72 | 1,066 | 61.80 | 48.51 | All passing |
| Core E2E | 7 | 53 | — | — | All passing |
| Core DB (integration) | 41 | 890 | — | — | All passing (clean DB verified) |

**Improvement areas per suite:**

| Suite | Area | Notes |
|-------|------|-------|
| Core Unit | `sandbox/`, `config/`, `cli/commands/` | Branch coverage gaps in exec paths and flag parsing |
| Core Unit | `training/federated/`, `workflow/` | Manager logic branches, engine conditions |
| Dashboard | API client, complex components | 62% stmt coverage — significant improvement from 44%, continue sweep |
| MCP | Tool handlers, manifest | 62% stmt coverage — improved from 58%, continue sweep |
| Core E2E | Expand coverage | Currently 7 files / 53 tests; add training, delegation, analytics flows |

### Security Hardening — Architectural (2026-03-09 Audit)

Items identified in the deep security audit that require design decisions or multi-file refactors. All quick-fix findings were resolved; these remain as planned work.

| Item | Severity | Description | Decision Needed |
|------|----------|-------------|-----------------|
| Encrypt OAuth tokens at rest | CRITICAL | `oauth_tokens` table stores access/refresh tokens in plaintext. Need envelope encryption (AES-256-GCM + key from SecretsManager). | Encryption key management strategy |
| Move OAuth state to DB/Redis | CRITICAL | `OAUTH_STATES`, `PENDING_GMAIL_TOKENS`, `PENDING_OAUTH_USERINFO` maps are per-process — broken in multi-replica. SSO state already uses DB. | Redis vs DB for ephemeral state |
| Persist 2FA state to DB | HIGH | 2FA secret/enabled/recovery codes are in-memory only — lost on restart, silently disabling 2FA. | DB schema for 2FA fields on auth.users |
| Add JWT aud/iss claims | HIGH | Session JWTs lack `aud` and `iss` claims. Federation tokens have them, session tokens don't. Risk: cross-context token acceptance. | Migration path for existing tokens |
| Hash recovery codes | HIGH | 2FA recovery codes stored as plaintext Set in memory. Should be SHA-256 hashed with timing-safe comparison. | Combine with 2FA DB persistence |
| Rate-limit 2FA verification | HIGH | No rate limit on TOTP code verification — 6-digit code brute-forceable in ~55 min at 100 req/s. | Rate limit strategy (per-user lockout?) |
| Encrypt OIDC client secrets | HIGH | SSO provider `client_secret` stored plaintext in `auth.identity_providers`. | Use SecretsManager or column encryption |
| Replace `vm.runInNewContext` | HIGH | Dynamic tool sandbox uses Node `vm` module — escapable via prototype chain. Needs `isolated-vm` or WebAssembly sandbox. | Performance impact of isolate overhead |
| Implement PKCE for OAuth flows | MEDIUM | OAuth flows lack PKCE (code_verifier/code_challenge). OIDC SSO has it; OAuth doesn't. | Backward compat with existing connections |
| Authorization code pattern for SSO tokens | MEDIUM | Tokens passed in URL fragment after SSO login — visible in browser history, extractable by XSS. Use one-time code exchange instead. | Frontend token handling refactor |
| Nonce-based CSP | MEDIUM | `script-src 'unsafe-inline'` weakens XSS protection. Need nonce-based CSP compatible with Vite. | Vite plugin for CSP nonces |
| `rememberMe` token lifetime | LOW | 30-day access token with `rememberMe` is excessive. Access tokens should be short-lived (1h) regardless; only extend refresh token. | User-facing behavior change |
| MCP service token least privilege | MEDIUM | MCP self-mints `admin` role JWT. Should use dedicated `mcp-service` role with minimal permissions. | Define MCP-required permissions |
| Require webhook secrets | MEDIUM | Multiple adapters (Jira, Linear, Azure, GitLab) silently skip verification when no webhook secret is configured. | Enforce at init vs warn-only |
| IDOR checks on document/memory ops | HIGH | Document GET/DELETE accept arbitrary IDs with no ownership validation. Any authenticated user can read/delete others' documents. | Add `createdBy` field or personality ownership check |

---

## AGNOS Built-in Integration

SecureYeoman is being promoted from consumer project to **flagship built-in tool** on AGNOS. AGNOS-side recipe created (`recipes/marketplace/secureyeoman.toml`). Items below are SecureYeoman-side work.

| Item | Effort | Status | Description |
|------|--------|--------|-------------|
| Agent registration with daimon | 1 hour | Not started | On gateway startup, batch-register all active agent profiles with AGNOS via **`POST /v1/agents/register/batch`** (new endpoint). Send heartbeats every 30s. Deregister on shutdown. The batch endpoint is idempotent — safe to call on every restart |
| MCP tool registration with daimon | 2 hours | Not started | Register SecureYeoman's MCP tools with daimon's MCP server (`POST /v1/mcp/tools`) so any AGNOS agent can discover and invoke them. Prioritize high-value tools: web_search, github_*, docker_*, knowledge_*, workflow_* |
| Audit event forwarding | 1 hour | Not started | Forward SecureYeoman audit chain events to AGNOS audit subsystem (`POST /v1/audit/forward` @ port 8090) when `AGNOS_AUDIT_URL` is set. Reuse existing HMAC-SHA256 audit entries |
| Add app icon for marketplace | 30 min | Not started | Create `assets/secureyeoman.png` (256x256+) and `.svg`. Copy to `$PKG/usr/share/icons/` in recipe install step |
| Shared vector store bridge | 2 hours | Not started | When `AGNOS_RUNTIME_URL` is set, optionally use AGNOS vector store (`POST /v1/vectors/insert`, `POST /v1/vectors/search`) as a backend alongside local FAISS/Qdrant. Enables cross-project RAG (SecureYeoman knowledge accessible to other AGNOS agents) |
| Verify sandbox in AGNOS | 2 hours | Not started | Test SecureYeoman inside AGNOS with Landlock/seccomp sandbox active. Verify all integration APIs work through allowed hosts. Verify PostgreSQL data persistence in `~/.local/share/secureyeoman/` |
| Pre-configure AGNOS defaults | 30 min | Not started | On startup, call **`GET /v1/discover`** (new endpoint) to auto-detect AGNOS capabilities. Auto-enable AGNOS provider as primary, set `MCP_EXPOSE_AGNOS_TOOLS=true`, configure token budget reporting. No manual config needed |
| Subscribe to AGNOS events | 1 hour | Not started | Connect to **`GET /v1/events/subscribe?topics=agent.*,task.*`** (new SSE endpoint) for real-time AGNOS event streaming. Wire events into SecureYeoman's extension hook system (`agent:after-delegate`, etc.) for cross-platform observability |
| Publish events to AGNOS | 30 min | Not started | On swarm completion, task execution, and error events, publish to **`POST /v1/events/publish`** (new endpoint). Enables other AGNOS agents to react to SecureYeoman activity |
| Query sandbox profiles | 30 min | Not started | On dashboard init, call **`GET /v1/sandbox/profiles/list`** (new endpoint) to show available AGNOS sandbox presets. Display in SecureYeoman's Execution settings panel |

**AGNOS-side work (done):**
- Marketplace recipe created (`recipes/marketplace/secureyeoman.toml`) with `flagship = true`
- Sandbox profile: desktop seccomp, Landlock for data dir + IPC + fonts
- Service ports declared (18789 core, 3000 dashboard, 3001 MCP)
- Systemd user service unit included for headless mode
- Depends on hoosh (llm-gateway) and daimon (agent-runtime)
- **Handshake endpoints implemented** (6 new endpoints, 10 tests):
  - `GET /v1/discover` — service discovery (capabilities, endpoints, companion services)
  - `POST /v1/agents/register/batch` — batch agent registration (idempotent, up to 100)
  - `GET /v1/events/subscribe` — SSE event stream with topic wildcards
  - `POST /v1/events/publish` — publish events to pub/sub broker
  - `GET /v1/events/topics` — list active topics with subscriber counts
  - `GET /v1/sandbox/profiles/list` — list all sandbox presets

---

## Phase 145: Cross-Project MCP Expansion — Remaining

| Item | Status | Description |
|------|--------|-------------|
| Merge agnostic into agnosticos | Future | Agnostic becomes a package within agnosticos — collapses to single service |
| Photisnadi in SY container | Future | Photisnadi baked into agnosticos base image or run as separate container. User choice via `PHOTISNADI_ENABLED` flag. When embedded, supervisord manages Photisnadi process; when external, SY proxies via SUPABASE_URL |
| Task tracker widget — third-party aggregator | Future | Extend TaskTrackerWidget to aggregate tasks from third-party trackers (Photisnadi, Trello, Jira, Linear, Todoist, Asana) via adapter interface. Unified view of all external task sources. Widget auto-selects adapters based on configured integrations |

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

*OpenAI WebSocket transport implemented (2026-03-09). Persistent connections via `wss://api.openai.com/v1/responses` with incremental turn submission, connection pooling, and automatic HTTP fallback. Enabled per-model via `useWebSocket: true` in ModelConfig.*

- [x] **WebSocket transport layer** — `OpenAIWsTransport` with persistent connections (up to 59 min), automatic reconnection on transient failures, and LRU pool eviction. Provider-agnostic `WsConnection` interface.
- [x] **Incremental turn submission** — `previous_response_id` + delta-only input on subsequent turns. Full context sent only on first turn or after connection reset.
- [x] **Connection pooling & lifecycle** — Configurable pool size (default 3), idle timeout (5 min), ping/pong keepalive (30s), hard lifetime cap (59 min). LRU eviction when pool is full.
- [ ] **Warm-up / pre-generation** — Support `generate: false` mode to pre-load model state and tools on the connection before the first user message, reducing first-response latency for personality activations.
- [x] **Fallback to HTTP** — Automatic fallback after 3 consecutive WS failures (60s cooldown). `OpenAIWsProvider` wraps `OpenAIProvider` as HTTP fallback — transparent to calling code.
- [x] **Provider support matrix** — OpenAI implemented. Feature-gated via `ModelConfig.useWebSocket`. Watch list for other providers:
  - **Anthropic** — No WebSocket API as of 2026-03. SSE streaming only.
  - **Google Gemini** — No WebSocket API. Server-sent events via REST.
  - **Mistral / Groq / DeepSeek** — HTTP-only. No announced plans.
  - Track provider announcements — add support as APIs ship.

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

*Last updated: 2026-03-09 (Removed completed Phase 145 items, added Security Hardening — Architectural backlog from deep audit). See [Changelog](../../CHANGELOG.md) for full history.*
