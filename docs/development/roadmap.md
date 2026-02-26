# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 52 | Dashboard Evolution | Next |
| 53 | Security, Audio & Integrations | Planned |
| 54 | Local-First AI | Planned |
| 55 | Voice & Community | Demand-Gated |
| 56 | Native Clients | Demand-Gated |
| 57 | Infrastructure & Platform | Demand-Gated |

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open Items

- [x] **Coverage thresholds** — `packages/core` v8 coverage now meets all four thresholds (statements ≥ 87%, functions ≥ 87%, lines ≥ 87%, branches ≥ 75%). *(Closed 2026-02-25)*
- [x] **Bug**: Dashboard Tasks > Heartbeat Task count now uses server-computed personality-aware `enabledTasks`/`totalTasks` from the status endpoint, matching MetricsPage. *(Closed 2026-02-26)*
- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 133. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(New feature — no automated DB integration test yet)*
- [ ] **Bug**: https issues with storybook - Framing 'http://localhost:6006/' violates the following Content Security Policy directive: "default-src 'self'". The request has been blocked. Note that 'frame-src' was not explicitly set, so 'default-src' is used as a fallback. - probably need a cleaner way to .env the http/https switch.

---

## Phase 52: Dashboard Evolution

**Status**: Next — Phase 51 WebSocket push complete

Consolidates major UX surface work: Mission Control as the new default landing page, sidebar reorganization, Personality Editor ontological restructure, advanced editor workspace, and voice activity detection.

### Sidebar Reorganization

*Do first — structural foundation for all navigation changes below.*

- [ ] **Sidebar Reorganization** — Consolidate nav into mission-aligned sections:

  ```
  Mission Control (default home)
  Chat
  Editor
  Personality
  Skills
  Proactive
  Intent                          ← promoted from Settings > Intent
  ┌ Automation (collapsible)
  │   ├ Tasks
  │   └ Workflows
  Connections
  ┌ Administration (collapsible)
  │   ├ Settings
  │   ├ Users
  │   ├ Workspaces
  │   └ API Keys
  ```

### Mission Control Dashboard

- [ ] **Mission Control Dashboard** — Consolidated command-center view replacing Metrics as the default landing page. Multi-panel grid: (1) System status graph (expanded ReactFlow); (2) Active tasks with progress; (3) Live security event feed; (4) Resource monitoring (CPU, memory, tokens, costs); (5) Agent/Personality health heartbeats; (6) Integration status grid; (7) Audit stream; (8) Workflow runs with DAG preview; (9) Quick actions (emergency stop, pause all). Dark theme default, auto-refresh via WebSocket, click-to-drill.

### Personality Editor — Ontological Restructure

- [x] **Ontological restructure complete** — Spirit-Pathos: Morphogenesis + new Empathy Resonance toggle. Brain-Intellect: Chronoception, Default Model, Model Fallbacks, Analytical Depth (5-level pill selector over thinkingConfig), Extended Thinking — all grouped in a "Thinking" sub-section. Body-Endowments: Voice + Preferred Language at the top. Soul-Essence: stripped to identity-only fields. Migration `048_personality_empathy_resonance.sql` adds `empathy_resonance BOOLEAN` to DB. *(Closed 2026-02-26)*

### Advanced Editor Mode

- [ ] **Advanced Editor Mode** — Add toggle in Settings > Security > Developers. When enabled, replaces the current EditView with an advanced coding workspace featuring: (1) Canvas with movable terminal prompt windows; (2) Clean file manager as a sidebar column or popout; (3) Task list panel with Jira-style priorities, supporting internal task management or external integrations (Trello, GitHub Projects, etc.).

### Voice Activity Detection

- [x] **Energy-based VAD** — Replaced fixed silence timers with RMS-threshold VAD using `getByteTimeDomainData`. `hasVoicedRef` guards against premature stop. `vadThreshold: 0.015` default added to both hook configs. *(Closed 2026-02-26)*

### Visual Polish

- [ ] **Personality image upload** — Allow a personality to receive a custom avatar image.
- [ ] **Switchable Theme Presets** — Expand beyond light/dark binary. Implement theme presets (e.g., opencode, vi, vscode) with a theme picker in dashboard settings. Consider CSS variable-based theming for user extensibility.

---

## Phase 53: Security, Audio & Integrations

**Status**: Planned

Completes the Kali security toolkit, hardens audio input/output, and delivers real external notification delivery deferred from Phase 51.

### Security Toolkit Completion

Core Kali toolkit shipped (ADR 089). The `sec_*` MCP tools, `secureyeoman security` CLI, and three deployment modes are live.

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining.
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments.
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

### Audio Quality

- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated. Reduces perceived latency for long text.
- [ ] **Audio validation before STT** — Validate duration 2–30s, RMS > 0.01, peak < 0.99. Return a clear error rather than passing bad audio to the API.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` in multimodal config. Surface as dropdown in the provider card UI alongside provider selection.

### Notification Delivery

*Delivery stubs wired in Phase 51 — this section provides real dispatch.*

- [ ] **Real Slack/Discord/email/Telegram delivery** — Implement actual external dispatch behind the `executeNotifyAction()` stubs, gated on IntegrationManager interface audit.
- [ ] **Per-user notification preferences** — Per-user channel preferences and quiet-hours configuration.
- [ ] **Notification retention/cleanup job** — TTL and auto-prune policy for the notifications table.

---

## Phase 54: Local-First AI

**Status**: Planned — strategic priority for sovereign AI positioning

Privacy-first, offline-capable AI processing via on-device models. Completes the "sovereign AI" positioning — currently all inference goes to cloud providers even in a self-hosted deployment.

**Feature toggle in `config.yml`:**

```yaml
ai:
  localMode:
    enabled: true
    provider: "ollama"               # ollama | lmstudio | localai
    model: "llama3.1:8b-instruct-q4_K_M"
    embeddingModel: "nomic-embed-text"
    fallbackToCloud: false
```

- [ ] **Local model inference** — When `ai.localMode.enabled: true`, route LLM requests to the configured local provider instead of cloud APIs. Swap provider/model at runtime via config reload.
- [ ] **Local embedding generation** — Use `nomic-embed-text` (or configured `embeddingModel`) for vectorizing memories, knowledge, and document chunks. Eliminates external embedding API calls.
- [ ] **Hybrid cloud/local switch** — Runtime toggle between local-only, cloud-only, or local-first-with-cloud-fallback. Expose in dashboard settings alongside the existing model picker.
- [ ] **Offline detection** — When `ai.localMode.enabled: true` and the local provider is unreachable, surface a clear "Local AI Unavailable" state in the dashboard — don't silently fall back to cloud unless `fallbackToCloud: true`.
- [ ] **Model lifecycle management** — MCP tools for pulling, listing, and removing local models (`ollama pull`, `ollama list`, `ollama rm`). Surface model disk usage in dashboard.
- [ ] **Quantization awareness** — Document recommended model quantizations (Q4_K_M, Q5_K_S, etc.) for different hardware tiers. Auto-detect available RAM and suggest appropriate model size.

---

## Phase 55: Voice & Community

**Status**: Demand-Gated — implement when voice profile and marketplace demand justifies the investment.

Completes voice identity infrastructure and community skill distribution.

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

## Phase 56: Native Clients

**Status**: Demand-Gated — implement once REST/WebSocket API is stable and adoption justifies native packaging.

### Mobile

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

### Desktop

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

---

## Phase 57: Infrastructure & Platform

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

*Last updated: 2026-02-26 (Sidebar reorg: promoted Intent to top-level nav item; Tailwind config updated for multi-theme CSS variable prep; TaskHistory agent name resolution fix)*
