# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 57 | Dashboard UX | In Progress |
| 58 | Security Toolkit | Planned |
| 59 | Local-First AI | Planned |
| 60 | Voice & Community | Demand-Gated |
| 61 | Native Clients | Demand-Gated |
| 62 | Infrastructure & Platform | Demand-Gated |

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open Items

- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 134. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **Manual test: One Skill Schema + Community Marketplace** — End-to-end verification of ADR 135. Steps: (1) Dashboard → Marketplace → confirm All / Marketplace / Community filter tabs render; (2) Sync community skills via `POST /api/v1/marketplace/community/sync` with a local repo path; (3) Switch to Community tab → confirm community skills appear with "Community" badge; (4) Install a community skill that has `mcpToolsAllowed` set → confirm the brain skill record carries the same `mcpToolsAllowed` value; (5) Dashboard → Skills → Installed tab → confirm the installed community skill shows "Community" in the Source column; (6) Uninstall the skill → confirm `installed` resets to false and card returns to "Install" state.
- [ ] **Base knowledge generic entries need per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally (shared by all personalities). These may need per-personality variants or at least personality-aware content (e.g., T.Ron's purpose may differ from FRIDAY's). Low urgency — global entries are contextually correct for now.
- [ ] **Enterprise: Multi-tenancy** — Add `tenant_id` to all schema tables + PostgreSQL row-level security (RLS) policies. Extend RBAC to include tenant scope. Required before SaaS deployments.
- [ ] **Enterprise: Audit log export** — `POST /api/v1/audit/export` with JSON-Lines, CSV, syslog RFC 5424 output. Required for SOC2 evidence collection and SIEM integration.
- [ ] **Enterprise: Backup & Disaster Recovery API** — `BackupManager` + REST endpoints (`POST /api/v1/admin/backups`, restore). Document tested RTO/RPO.
- [ ] **Enterprise: SAML 2.0 support** — SAML adapter with JIT user provisioning and group→role attribute mapping (OIDC already present).
- [ ] **Consumer UX: Onboarding wizard** — `OnboardingWizard` component gated behind `hasCompletedOnboarding`. Steps: personality → API keys → security policy → done.
- [ ] **Consumer UX: Accessibility audit** — Add `eslint-plugin-jsx-a11y`, axe-core CI step, global `focus-visible` ring, 44px touch targets on mobile.
- [ ] **Consumer UX: Settings page split** — Extract `<AuditChainTab>`, `<SoulSystemTab>`, `<RateLimitingTab>` from the 619-line `SettingsPage.tsx` monolith.
- [ ] **Observability: Correlation IDs** — `onRequest` hook that reads `X-Correlation-ID` header or generates a UUIDv7 and threads it through gateway, heartbeat, and audit logs.

---

## Phase 57: Dashboard UX

**Status**: In Progress — Advanced Editor Mode shipped (2026-02-26); two items remain.

Deferred visual polish and power-user tooling from Phase 53. CSS variable theming infrastructure is already in place; both items can be implemented independently.

- [ ] **Intent creation form** — The "New → Intent" entry in the sidebar dialog currently navigates directly to the Intent Editor. Convert it to a guided creation form in the dialog: structured fields matching the intent schema (name, description, hard boundaries, policies, signal conditions) instead of raw JSON entry. Include an **Import JSON** button as an escape hatch for power users who already have an intent document. Form pre-fills the Intent Editor on submit; JSON import parses and validates against the intent schema before navigating.
- [ ] **Switchable Theme Presets** — Expand beyond light/dark binary. Implement theme presets (e.g., opencode, vi, vscode) with a theme picker in dashboard settings. CSS variable-based theming already in place (`hsl(var(--X))` pattern). Pre-work required: audit remaining blue/primary buttons in dark theme — only light theme should use blue (`btn-primary`); dark theme uses muted/ghost variants. Complete button audit before adding preset switcher.

---

## Phase 58: Security Toolkit Completion

**Status**: Planned

Core Kali toolkit shipped (ADR 089). This phase hardens its operational surface.

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining.
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments.
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

---

## Phase 59: Local-First AI

**Status**: Planned — strategic priority for sovereign AI positioning

Privacy-first, offline-capable AI processing via on-device models. Completes the "sovereign AI" positioning for fully self-hosted deployments.

> **Note:** Local LLM inference (Ollama, LM Studio, LocalAI), runtime model switching (`POST /api/v1/model/switch`), persistence (`POST /api/v1/model/default`), dashboard model picker, and CLI (`secureyeoman model switch/default`) are already fully implemented. The remaining items below close the gaps for local-first as a complete operational mode.

### Local-First Operational Mode

- [ ] **Local embedding generation** — Wire Ollama's native embedding endpoint (`/api/embeddings`) as an `EmbeddingProvider` alongside the existing SentenceTransformers and OpenAI/Gemini providers. Add `nomic-embed-text` and other Ollama-served models as selectable options in `brain.vector.api.provider`. The abstraction layer (`ai/embeddings/`) already exists; this is a new provider implementation + config enum entry.
- [ ] **Hybrid cloud/local switch** — Add `localFirst` routing mode: primary request goes to the configured local provider; on `ProviderUnavailableError` automatically falls back to the first cloud entry in the fallback chain. Distinct from the existing fallback chain which requires explicit config. Expose as a toggle in dashboard settings alongside the model picker.
- [ ] **Offline detection** — When the active provider is local and unreachable, surface a clear "Local AI Unavailable" banner in the dashboard rather than failing silently. Requires a `/api/v1/ai/health` endpoint that pings the configured local provider (Ollama `/api/tags`, LM Studio `/v1/models`) and returns reachability status. Error types already propagate correctly (`ProviderUnavailableError`); the gap is the health route and dashboard state.
- [ ] **Model lifecycle management** — `ollama pull <model>`, `ollama rm <model>` CLI subcommands and MCP tools. `ollama list` already works via `secureyeoman model list --provider ollama` (backed by `OllamaProvider.fetchAvailableModels()`). The gap is write operations: download and delete, plus surfacing disk usage per model.
- [ ] **Quantization awareness** — Document recommended quantizations (Q4_K_M, Q5_K_S, etc.) per hardware tier in a guide. Optionally: auto-detect host RAM via `os.totalmem()` at startup and emit a warning if the configured model's estimated VRAM requirement exceeds available memory.

### Model Training & Customisation

Train, fine-tune, and distill models directly from SecureYeoman's own data — conversations, memories, knowledge, and agent interactions. The goal is a closed loop: data lives here, models trained here, served here.

*Prerequisites: GPU-capable host for fine-tuning and training phases. Dataset export and distillation can run CPU-only.*

- [ ] **Training dataset export** — Export conversations, memories, knowledge entries, and heartbeat logs as structured training datasets. Output formats: ShareGPT JSONL (chat fine-tuning), instruction JSONL (Alpaca-style), and raw text corpus. Configurable filters: date range, personality, quality score, message length. Exposed via `POST /api/v1/training/export` and `secureyeoman training export` CLI. This is the prerequisite for all downstream training items.
- [ ] **Model distillation** — Use a cloud model (Claude, GPT-4o, etc.) as teacher: generate synthetic completions for prompts drawn from the exported dataset, producing a high-quality fine-tuning corpus without labelling by hand. Distillation jobs run as heartbeat tasks; output is a JSONL dataset ready for the fine-tuning pipeline.
- [ ] **LoRA / QLoRA fine-tuning** — Fine-tune a local base model (Llama 3, Mistral, Phi, etc.) on an exported dataset using parameter-efficient methods. Runs via a Docker sidecar container (Unsloth or HuggingFace PEFT + `accelerate`). SecureYeoman orchestrates job submission, streams training logs to the dashboard, and on completion registers the resulting adapter weights with Ollama for immediate use. Config: base model, LoRA rank/alpha, batch size, epochs, VRAM budget.
- [ ] **Continual / online learning** — Incremental adapter updates from new interactions without a full retrain cycle. High complexity: requires replay buffer management, learning rate scheduling, and drift detection to prevent catastrophic forgetting. Treat as research-grade; implement only once fine-tuning pipeline is stable and battle-tested.
- [ ] **Training from scratch** — Pre-train a model on a curated local corpus (documents, knowledge base, domain data). Extremely resource-intensive — even a 1B parameter model requires significant GPU-hours. Scope is constrained to small models (≤3B params) intended as lightweight specialists, not general-purpose replacements. Depends on the dataset export and fine-tuning pipeline being fully operational first.

---

## Phase 60: Voice & Community

**Status**: Demand-Gated — implement when voice profile and marketplace demand justifies the investment.

### Voice Profiles

- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call.

### Marketplace Evolution

*Implement once the community skill repo has meaningful scale.*

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default).
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI.

---

## Phase 61: Native Clients

**Status**: Demand-Gated — implement once REST/WebSocket API is stable and adoption justifies native packaging.

### Mobile

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

### Desktop

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

---

## Phase 62: Infrastructure & Platform

**Status**: Demand-Gated — implement once operational scale or compliance requirements justify the investment.

### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management.

### Collaboration

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.

### Graph Rendering

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.

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

*Last updated: 2026-02-26 — Phase 57 in progress (Advanced Editor Mode shipped; Intent form + Theme Presets open). Active queue: Phase 57 (Dashboard UX) → Phase 58 (Security Toolkit) → Phase 59 (Local-First AI). Phases 60–62 remain demand-gated.*
