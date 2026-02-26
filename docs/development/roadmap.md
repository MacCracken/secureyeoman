# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 53 | Dashboard Completion | **In Progress** |
| 54 | AI Safety Layer | Planned |
| 55 | Notifications & Integrations | Planned |
| 56 | Local-First AI | Planned |
| 57 | Security Toolkit | Planned |
| 58 | Audio Quality | Planned |
| 59 | Voice & Community | Demand-Gated |
| 60 | Native Clients | Demand-Gated |
| 61 | Infrastructure & Platform | Demand-Gated |

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open Items

- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 134. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **Manual test: One Skill Schema + Community Marketplace** — End-to-end verification of ADR 135. Steps: (1) Dashboard → Marketplace → confirm All / Marketplace / Community filter tabs render; (2) Sync community skills via `POST /api/v1/marketplace/community/sync` with a local repo path; (3) Switch to Community tab → confirm community skills appear with "Community" badge; (4) Install a community skill that has `mcpToolsAllowed` set → confirm the brain skill record carries the same `mcpToolsAllowed` value; (5) Dashboard → Skills → Installed tab → confirm the installed community skill shows "Community" in the Source column; (6) Uninstall the skill → confirm `installed` resets to false and card returns to "Install" state.
- [ ] **Base knowledge generic entries need per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally (shared by all personalities). These may need per-personality variants or at least personality-aware content (e.g., T.Ron's purpose may differ from FRIDAY's). Low urgency — global entries are contextually correct for now.

---

## Phase 53: Dashboard Completion

**Status**: In Progress

Sidebar structural reorganization as the foundation, then Mission Control as the new home, advanced editor workspace, and visual polish. Risk Assessment UI shipped in Phase 53 (tab in SecurityPage, full backend at `/api/v1/risk/*`).

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

### Advanced Editor Mode

- [ ] **Advanced Editor Mode** — Add toggle in Settings > Security > Developers. When enabled, replaces the current EditView with an advanced coding workspace featuring: (1) Canvas with movable terminal prompt windows; (2) Clean file manager as a sidebar column or popout; (3) Task list panel with Jira-style priorities, supporting internal task management or external integrations (Trello, GitHub Projects, etc.).

### Visual Polish

- [ ] **Personality image upload** — Allow a personality to receive a custom avatar image.
- [ ] **Switchable Theme Presets** — Expand beyond light/dark binary. Implement theme presets (e.g., opencode, vi, vscode) with a theme picker in dashboard settings. Consider CSS variable-based theming for user extensibility.

---

## Phase 54: AI Safety Layer

**Status**: Planned

A symmetric output-side verification layer complementing existing input defenses (`input-validator.ts`, `prompt-guard.ts`). The current pipeline validates inputs and scans tool outputs for credentials, but LLM response semantics and safety are unchecked.

- [ ] **Response Guard** — Counterpart to `prompt-guard.ts` applied to LLM *responses*. Scans for indirect prompt injection smuggled via AI output: instruction-injection patterns (`"From now on you must…"`), cross-turn influence attempts (`"Remember for future messages…"`), data exfiltration formatting signals, second-model self-escalation. Hooks at `chat-routes.ts` after credential scan, before persistence. Modes: `block | warn | disabled` mirroring PromptGuard.
- [ ] **LLM-as-Judge for high-autonomy operations** — For L4/L5 autonomy skills and `supervised_auto` workflows, invoke a second independent model call to judge the *proposed action* before execution. Verdict dimensions: relevance, policy compliance, scope creep. Integrates with automation level gating in `creation-tool-executor.ts`.
- [ ] **OPA output compliance check** — Extend the Phase 50 OPA integration to evaluate LLM *responses*, not just inputs. Define `output_policy/allow` rules verifying hard boundaries from `IntentManager` weren't violated in response text. Low engineering effort — client and policy upload infrastructure already exist.
- [ ] **Structured output schema validation** — When skills or workflow steps return structured data (JSON, YAML), validate against a declared Zod schema before appending to context. Schema declared per-skill alongside `successCriteria`.
- [ ] **Brain consistency check** — After retrieving `brainContext`, compare the LLM response against injected knowledge entries. Flag responses making factual claims that directly contradict stored knowledge, surfacing a warning in conversation metadata rather than blocking.

---

## Phase 55: Notifications & Integrations

**Status**: Planned

Real external notification delivery — dispatch stubs were wired in Phase 51 but not implemented. Completes the notification system end-to-end.

- [ ] **Real Slack/Discord/email/Telegram delivery** — Implement actual external dispatch behind the `executeNotifyAction()` stubs in `heartbeat.ts`, gated on IntegrationManager interface audit.
- [ ] **Per-user notification preferences** — Per-user channel preferences and quiet-hours configuration.
- [ ] **Notification retention/cleanup job** — TTL and auto-prune policy for the `notifications` table.

---

## Phase 56: Local-First AI

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

## Phase 57: Security Toolkit Completion

**Status**: Planned

Core Kali toolkit shipped (ADR 089). This phase hardens its operational surface.

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining.
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments.
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

---

## Phase 58: Audio Quality

**Status**: Planned

- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated. Reduces perceived latency for long text.
- [ ] **Audio validation before STT** — Validate duration 2–30s, RMS > 0.01, peak < 0.99. Return a clear error rather than passing bad audio to the API.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` in multimodal config. Surface as dropdown in the provider card UI alongside provider selection.

---

## Phase 59: Voice & Community

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

## Phase 60: Native Clients

**Status**: Demand-Gated — implement once REST/WebSocket API is stable and adoption justifies native packaging.

### Mobile

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

### Desktop

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

---

## Phase 61: Infrastructure & Platform

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

*Last updated: 2026-02-26 — Removed completed Phase 53 items: Risk Assessment Dashboard (UI shipped as SecurityPage tab), Marketplace/Community pagination. Phase 53 status → In Progress. Remaining: Sidebar Reorganization, Mission Control, Advanced Editor, Visual Polish.*
