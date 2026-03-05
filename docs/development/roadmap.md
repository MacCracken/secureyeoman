# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| 125-E | Cognitive ML — Advanced Features | P2 — ML | Planned |
| 129 | Confidential Computing — TEE Full Stack | P2 — security | Planned |
| 127 | IDE Experience (Basic Editor) | P3 — power user UX | Planned |
| — | Engineering Backlog (incl. Security Hardening) | Ongoing | Pick-up opportunistically |
| License Up | Tier Audit & Enforcement Activation | P1 — commercial | Planned (pre-release) |
| Future | LLM Providers, LLM Lifecycle, Responsible AI, Voice, Infrastructure | Future / Demand-Gated | — |

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

## Phase 125-E: Cognitive ML — Advanced Features (Pending)

**Priority**: P2 — Builds on Phase 125-D scaffolds. Requires active ML features to be validated in production first.

- [ ] **LLM Reconsolidation** — Wire `ReconsolidationManager` into `BrainManager.recall()`. When retrieved memory overlaps with query context (cosine 0.7–0.95), call AIProvider to decide keep/update/split. Add cooldown tracking per memory. Add REST endpoint `POST /brain/memories/:id/reconsolidate`. Add MCP tool `memory_reconsolidate`.
- [ ] **Semantic Schema Clustering** — Complete `SchemaClusteringManager` pipeline: export embeddings from vector store, run k-means, filter by `minClusterSize`, label via LLM, upsert schema knowledge entries. Add scheduled worker alongside CognitiveMemoryManager. Add REST endpoint `GET /brain/schemas` and MCP tool `brain_schemas`.
- [ ] **RL Retrieval Optimization** — Wire `RetrievalOptimizer` into `compositeScore()`. Connect `PreferenceLearner.recordFeedback()` to `optimizer.recordFeedback()`. Persist arm posteriors in `brain.meta`. Add dashboard widget showing arm stats and convergence.
- [ ] **Salience-boosted compositeScore()** — Blend salience composite into the existing `compositeScore()` function as a new term. Load cached salience from `brain.meta` during cognitive ranking. Configurable via `salience.compositeBlendWeight`.
- [ ] **Context Retrieval for Knowledge** — Extend context-fused search to `getRelevantContext()` knowledge path (currently only memories). Use `searchKnowledgeByVector()`.
- [ ] **Working Memory REST API** — Expose working memory buffer via `GET /brain/working-memory` and `GET /brain/working-memory/stats`. Add MCP tools `brain_working_memory` and `brain_working_memory_stats`.

---

### 129: Confidential Computing — TEE Full Stack

*Extends Phase 128 (Tier 1: config + routing) with hardware-level TEE integration, attestation APIs, and encrypted model/data handling. Builds on the existing `TeeAttestationVerifier`, `TeeConfigSchema`, and AIClient/ModelRouter TEE filtering.*

**Priority**: P2 — Security/competitive differentiator. Depends on Phase 128 (TEE-aware routing — completed).

#### Remote Attestation (Tier 2a)
- [ ] **Azure MAA attestation** — Call Azure Attestation Service to verify SGX/SEV-SNP claims for Azure OpenAI endpoints. Async `verifyAzureAttestation()` in `TeeAttestationVerifier`. Cache results per `attestationCacheTtlMs`. Requires Azure MAA SDK or REST calls.
- [ ] **NVIDIA RAA attestation** — Verify NVIDIA Remote Attestation API for H100/H200 CC mode on self-hosted GPU inference. Parse GPU attestation reports (PPCIE measurements). Useful for local Ollama/vLLM on confidential GPUs.
- [ ] **AWS Nitro attestation** — Verify Nitro Enclave attestation documents (COSE_Sign1 format). PCR validation against expected measurements. For AWS-hosted inference endpoints.
- [ ] **Attestation REST API** — `GET /api/v1/security/tee/providers` (list provider TEE capabilities), `GET /api/v1/security/tee/attestation/:provider` (last attestation result), `POST /api/v1/security/tee/verify/:provider` (force re-verify). Auth: `security:read`/`security:write`.

#### Sandbox & Execution (Tier 2b)
- [ ] **SGX sandbox backend** — Add `'sgx'` to `SandboxManager` technology selector. Execute code inside Intel SGX enclaves using Gramine or Occlum. Requires SGX-capable hardware + driver.
- [ ] **SEV sandbox backend** — Add `'sev'` to `SandboxManager` technology selector. Launch sandboxed execution in AMD SEV-SNP VMs. Requires SEV-capable CPU + KVM.
- [ ] **Encrypted model weights at rest** — Sealed storage for local model weights. Keys bound to platform PCR measurements (TPM/TEE). Models decrypted only inside TEE boundary. Integration with Ollama model storage.
- [ ] **Nitro Enclaves for key management** — Extend HSM roadmap item. Use AWS Nitro Enclaves for audit chain signing keys and credential encryption. Alternative to Vault for cloud-native deployments.

#### Full Pipeline (Tier 3)
- [ ] **Confidential GPU inference** — Detect NVIDIA CC mode on local GPUs. Verify GPU is in confidential mode before loading training datasets or running fine-tuning jobs. Block non-CC GPUs when `confidentialCompute: 'required'`.
- [ ] **End-to-end confidential pipeline** — Prompt → TEE-verified inference → encrypted response → TEE-sealed memory storage. Full chain-of-custody attestation recorded in audit log with cryptographic proof.
- [ ] **TEE-aware training pipeline** — Require TEE attestation before sending training data to fine-tuning endpoints. Verify data never leaves enclave boundary. Integration with `TrainingModule` job dispatch.
- [ ] **Dashboard TEE status** — Provider TEE status indicators in ModelWidget and provider accounts page. Attestation freshness badges, verification history timeline, TEE coverage percentage across active providers.

### 127: IDE Experience (Basic Editor)

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

### Security Hardening (from 2026-03-05 Audit)


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

## Wrap-Up — Pre-Release Gating

Items below represent the final steps required before public release. They depend on completed phases and focus on enforcement activation, tier auditing, and commercialization.

### License Up: Tier Audit & Enforcement Activation

**Priority**: P1 — Commercial. Must complete before public release.

**Prerequisite**: Phase 106 (license gating infrastructure — ✅).

- [ ] **Tier audit** — Comprehensive audit of all features into tiers:
  - **Community** (free): Chat, personalities, basic brain/memory, manual workflows, MCP tools, marketplace skills, basic editor, training dataset export, community skills, basic observability (metrics dashboard read-only)
  - **Pro** (mid-tier, new): Advanced editor/canvas, knowledge base connectors, observability dashboards, CI/CD read-only status, provider account management, advanced workflow templates, computer-use episodes, custom integrations, advanced brain features (document ingestion, source guides)
  - **Enterprise**: Adaptive learning pipeline (distillation, fine-tune, evaluation, DPO, counterfactual generation), SSO/SAML, multi-tenancy (RLS), CI/CD webhook integration + workflow triggers, advanced alert rules (create/edit/delete), A2A federation, swarm orchestration advanced modes, audit chain export, confidential computing / TEE-aware provider routing, remote attestation verification
- [ ] **Pro tier in LicenseManager** — Add `'pro'` to `LicenseTier`. Rename `EnterpriseFeature` → `LicensedFeature`. Add pro-tier features. Update license key generation script + validation.
- [ ] **Enable enforcement** — Set `SECUREYEOMAN_LICENSE_ENFORCEMENT=true` as default in `.env.example`. Update all env templates.
- [ ] **Upgrade prompts** — "Upgrade to Pro" and "Upgrade to Enterprise" CTAs in `FeatureLock` with pricing page links.
- [ ] **License key purchase flow** — Integration with payment provider or manual key issuance workflow. Dashboard license management page.
- [ ] **Grace period** — Existing community installs get 30-day grace period when enforcement activates, with countdown banner.

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

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

