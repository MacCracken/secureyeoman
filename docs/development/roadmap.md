# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| 139 | OpenTelemetry & SIEM Integration | P1 — enterprise | Planned |
| 140 | RAG Evaluation Metrics | P1 — differentiation | Planned |
| 141 | Cognitive ML — Advanced Features | P2 — ML | Planned |
| 142 | Prompt Versioning & A/B Testing | P2 — iteration | Planned |
| 143 | Extensible Guardrail Pipeline | P2 — security | Planned |
| 144 | IDE Experience | P3 — power user UX | Planned |
| — | Engineering Backlog (incl. Security Hardening) | Ongoing | Pick-up opportunistically |
| Future | LLM Providers, Voice, Infrastructure, Dev Ecosystem | Future / Demand-Gated | — |

### Recently Completed (see [Changelog](../../CHANGELOG.md))
| Phase | Name |
|-------|------|
| 135 | Agent Evaluation Harness — [ADR 206](../adr/206-agent-eval-harness.md) |
| 136 | Data Loss Prevention (DLP) — [ADR 207](../adr/207-data-loss-prevention.md) |
| 137 | Multi-Region & HA — [ADR 208](../adr/208-multi-region-ha.md) |
| 138 | Supply Chain Security & Compliance Artifacts — [ADR 209](../adr/209-supply-chain-security.md) |
| — | Startup & Resource Optimization — [2026.3.5f] |

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

## License Up: Tier Audit & Enforcement Activation

**Priority**: P1 — Commercial. Must complete before public release.

**Prerequisite**: Phase 106 (license gating infrastructure — ✅).

- [ ] **Tier audit** — Comprehensive audit of all features into tiers:
  - **Community** (free): Chat, personalities, basic brain/memory, manual workflows, MCP tools, marketplace skills, basic editor, training dataset export, community skills, basic observability (metrics dashboard read-only)
  - **Pro** (mid-tier, new): Advanced editor/canvas, knowledge base connectors, observability dashboards, CI/CD read-only status, provider account management, advanced workflow templates, computer-use episodes, custom integrations, advanced brain features (document ingestion, source guides)
  - **Enterprise**: Adaptive learning pipeline (distillation, fine-tune, evaluation, DPO, counterfactual generation), SSO/SAML, multi-tenancy (RLS), CI/CD webhook integration + workflow triggers, advanced alert rules (create/edit/delete), A2A federation, swarm orchestration advanced modes, audit chain export, confidential computing / TEE-aware provider routing, remote attestation verification
- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates.
- [ ] **Upgrade prompts** — "Upgrade to Pro" and "Upgrade to Enterprise" CTAs in `FeatureLock` with pricing page links.
- [ ] **License key purchase flow** — Integration with payment provider or manual key issuance workflow. Dashboard license management page.
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.

---

## Phase 139: OpenTelemetry & SIEM Integration

**Priority**: P1 — Enterprise procurement checkbox. Unblocks deals where Prometheus alone isn't sufficient.

**What exists**: `otel.ts` with `initTracing()` at startup. `otel-fastify-plugin.ts` for route spans. UUIDv7 correlation IDs on all requests.

- [ ] **Deep OTel instrumentation** — Extend spans to AI provider calls, tool executions, workflow steps, A2A calls. Currently only Fastify request-level spans.
- [ ] **Distributed trace context** — Propagate trace IDs across sub-agent delegations and cross-cluster federation calls.
- [ ] **Trace-aware logging** — Enrich Pino entries with `traceId` and `spanId` for log-to-trace correlation.
- [ ] **SIEM log forwarding** — Structured output for Splunk HEC, Elastic ECS, Azure Sentinel CEF, AWS CloudWatch. Configurable via `observability.siem`.
- [ ] **Audit chain → SIEM bridge** — Real-time forwarding of audit chain events with severity mapping.
- [ ] **Cost attribution dashboards** — Per-tenant, per-personality, per-workflow cost tracking. Budget alerts. CSV chargeback reports.
- [ ] **SLO monitoring** — Response latency, tool success rate, retrieval quality SLOs. Burn-rate alerting.

---

## Phase 140: RAG Evaluation Metrics

**Priority**: P1 — Quantitative proof of knowledge retrieval quality. No competitor measures this.

*Overlap note*: Phase 141 (Cognitive ML) includes retrieval optimizer, context retrieval, and salience scoring. RAG metrics should be co-developed with Phase 141 to share evaluation infrastructure.

- [ ] **Faithfulness score** — LLM-as-Judge or NLI-based scoring against retrieved context.
- [ ] **Answer relevance** — Semantic similarity between question and answer.
- [ ] **Context recall / precision** — Did retrieval find all relevant docs? Were retrieved chunks used?
- [ ] **Retrieval latency percentiles** — p50/p95/p99 for vector search, FTS, hybrid RRF.
- [ ] **Chunk utilization rate** — Referenced chunks vs discarded. Indicates chunking quality.
- [ ] **Dashboard widget** — RAG quality metrics with time-series trends and threshold alerts.

---

## Phase 141: Cognitive ML — Advanced Features

**Priority**: P2 — Builds on Phase 125-D scaffolds. Requires active ML features to be validated in production first.

- [ ] **LLM Reconsolidation** — Wire `ReconsolidationManager` into `BrainManager.recall()`. When retrieved memory overlaps with query context (cosine 0.7–0.95), call AIProvider to decide keep/update/split. Add cooldown tracking per memory. Add REST endpoint `POST /brain/memories/:id/reconsolidate`. Add MCP tool `memory_reconsolidate`.
- [ ] **Semantic Schema Clustering** — Complete `SchemaClusteringManager` pipeline: export embeddings from vector store, run k-means, filter by `minClusterSize`, label via LLM, upsert schema knowledge entries. Add scheduled worker alongside CognitiveMemoryManager. Add REST endpoint `GET /brain/schemas` and MCP tool `brain_schemas`.
- [ ] **RL Retrieval Optimization** — Wire `RetrievalOptimizer` into `compositeScore()`. Connect `PreferenceLearner.recordFeedback()` to `optimizer.recordFeedback()`. Persist arm posteriors in `brain.meta`. Add dashboard widget showing arm stats and convergence.
- [ ] **Salience-boosted compositeScore()** — Blend salience composite into the existing `compositeScore()` function as a new term. Load cached salience from `brain.meta` during cognitive ranking. Configurable via `salience.compositeBlendWeight`.
- [ ] **Context Retrieval for Knowledge** — Extend context-fused search to `getRelevantContext()` knowledge path (currently only memories). Use `searchKnowledgeByVector()`.
- [ ] **Working Memory REST API** — Expose working memory buffer via `GET /brain/working-memory` and `GET /brain/working-memory/stats`. Add MCP tools `brain_working_memory` and `brain_working_memory_stats`.

---

## Phase 142: Prompt Versioning & A/B Testing

**Priority**: P2 — Valuable for teams iterating on prompts. Compliance teams want audit trails.

*Overlap note*: Phase 114 (Versioning) already stores `PersonalityVersion` snapshots with diff support. This extends that to structured A/B testing and prompt-specific tooling.

- [ ] **Prompt version store** — Versioned snapshots of system prompts, skill instructions, tool descriptions. Diff view. Rollback.
- [ ] **A/B testing** — Route % of conversations to variant prompts. Track outcomes. Statistical significance.
- [ ] **Prompt changelog** — Annotated history with rationale. Exportable for compliance.
- [ ] **Template variables** — `{{variable}}` substitution. Centralized safety preamble, compliance disclaimers.
- [ ] **Prompt linting** — Detect conflicting instructions, overly long prompts, missing safety boundaries.

---

## Phase 143: Extensible Guardrail Pipeline

**Priority**: P2 — Pluggable filter chain beyond ResponseGuard.

*Overlap note*: Phase 136 (DLP) added PII detection, content classification, and egress scanning. Phase 95 (ContentGuardrail) added input/output guardrails with sync/async evaluation. This extends those into a user-pluggable pipeline with custom filters and per-personality configuration.

- [ ] **Filter plugin interface** — `GuardrailFilter` with `onInput`/`onOutput` hooks. Chain of responsibility.
- [ ] **Custom filter SDK** — User-written TypeScript filters loaded from `guardrails/` directory.
- [ ] **Per-personality filter config** — Different guardrail configs per personality.
- [ ] **Dry-run mode** — Observation mode for threshold tuning.
- [ ] **Filter metrics** — Activation rate, false positives, latency impact.

---

## Phase 144: IDE Experience

**Priority**: P3 — Power user UX.

*Evolves the basic editor (`/editor`) into a full IDE experience. The editor platform is mature (unified editor, MultiTerminal, model selectors, memory toggle, Agent World). These items add the missing IDE-class features for the standard editor view.*

- [ ] **Auto-Claude–style patterns** — Plan display, step-by-step approval, AI commit messages, context badges.
- [ ] **Multi-file editing** — Tabs, split panes.
- [ ] **Project explorer** — File tree sidebar with create/rename/delete.
- [ ] **Command palette** — `Cmd/Ctrl+K` fuzzy command search across all editor actions.
- [ ] **Inline AI completion** — Copilot-style ghost text suggestions from the active personality.
- [ ] **Multi-file search & replace** — Cross-file search with preview and batch replace.
- [ ] **Collaborative editing** — Yjs CRDT for real-time multi-user editing.
- [ ] **Keybindings editor** — UI for customizing keyboard shortcuts.
- [ ] **Responsive / mobile layout** — Adaptive layout for smaller screens.
- [ ] **Training integration** — Export/annotation hooks from editor to training pipeline.
- [ ] **Plugin / extension system** — Third-party editor extensions.

---

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Final Push (Phase 105)

Current: 86.35% stmt / 76.24% branches / 87.21% lines. Target: 88% stmt / 77% branches.

**Completed (2026-03-05)**: Licensing (+18 tests), Logging (+26 tests), Actuator (+10 tests), Notifications (+16 tests). Capture-permissions already had a test file (377 lines, 19 tests).

**Remaining targets by coverage gap** (directory-level):

| Directory | Priority |
|-----------|----------|
| `sandbox/` | MEDIUM — sandbox exec branches |
| `cli/commands/` | MEDIUM — flag parsing branches |
| `config/` | MEDIUM — config validation branches |
| `training/` | MEDIUM — manager logic branches |
| `workflow/` | LOW — good stmt, branch gap in engine conditions |

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Developer Ecosystem & Community Growth

*From Brainstorm #7. Only way to close the skill gap (87 vs 13,729) at scale.*

- [ ] **Skill SDK** — `npx create-secureyeoman-skill` scaffolding tool. Generates skill directory with schema, test harness, README template, and CI config.
- [ ] **Skill testing framework** — Mock MCP context, simulate tool calls, assert outputs. `SkillTestRunner` class.
- [ ] **Skill submission pipeline** — `secureyeoman skill publish` validates schema, runs tests, opens PR to community repo.
- [ ] **API client libraries** — Python (`secureyeoman-py`) and Go (`secureyeoman-go`) SDKs from OpenAPI spec.
- [ ] **Interactive tutorials** — Guided onboarding flows in dashboard: "Create your first skill," "Set up SSO," "Build a workflow."

---

### LLM Lifecycle — Deferred

- [ ] **Training from scratch** — Pre-train on a curated local corpus. Scoped to small models (≤3B params). *(Deferred — revisit when fine-tuning has real-world usage.)*

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

- [System Architecture](../adr/001-system-architecture.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-03-05. See [Changelog](../../CHANGELOG.md) for full history.*
