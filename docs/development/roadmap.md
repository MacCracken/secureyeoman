# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 50 | Governance Hardening | Complete |
| 51 | Security Toolkit Completion | Planned |
| 52 | Multimodal I/O Enhancement | Planned |
| 53 | Local-First AI | Planned |
| 54 | Marketplace Evolution | Demand-Gated |
| 55 | Native Clients | Demand-Gated |
| 56 | Infrastructure & Platform | Demand-Gated |

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open

- [x] Investigation into notifications — no dedicated notification model exists. Audit log pipeline is intact (events → DB → REST → dashboard polling). "No items" = audit log empty in that session, not a bug. Missing feature: transient user-facing notification model. Added as improvement item below.

### Improvements

- [x] Security Dashboard - re-org tab view; Overview, Audit Log, Autonomy, ML, Reports, System, Tasks
- [x] Tasks History, separation of task and heartbeats into their own subviews.
- [x] Tasks and History needs consolidation; remove from Security Dashboard.
- [x] after Tasks consolidation - insure each personality is associated — heartbeat log entries now carry `personalityId` via `HeartbeatManager.setActivePersonalityId()`. Wired at startup, on activate, on update, and on set-default.
- [x] Agents > Sub-Agents > Profile shoud be first tab, but keep default as Active.
- [ ] **Notifications** — No transient user notification model exists. Heartbeat `notify` actions (Slack/Email/Discord) are stubs (console-only). Real-time event push is missing (dashboard polls REST every 10s). Acknowledgements are localStorage-only. Needs: notification table + API + bell UI + WebSocket push + heartbeat integration delivery.
- [ ] dashboard - Allow for personality image to recieve an image
- [ ] **Switchable Theme Presets** — Expand beyond light/dark binary. Implement theme presets (e.g., opencode, vi, vscode) with a theme picker in dashboard settings. Consider CSS variable-based theming for user extensibility or a larger built-in preset library.

### Personality Editor — Ontological Restructure

Reorganise the Soul tab fields so each section truly reflects its metaphor. Three targeted moves plus two new capability toggles:

- [ ] **Spirit — Pathos**: Relocate the Morphogenesis toggle (Sacred Archetypes) into the Spirit section. This is the "soul" of the character — the foundational archetypes that give it form belong here, not in a generic settings list. Add an **Empathy Resonance** toggle that controls how strongly the personality mirrors and adapts to the user's detected emotional register.
- [ ] **Brain — Intellect**: Move Default Model and Model Fallbacks from the Soul tab into the Brain section. These are the "grey matter" decisions — which model thinks for this personality and what it falls back to. Add an **Analytical Depth** control (maps to reasoning effort / extended thinking budget) so cognitive intensity is configured alongside the model itself.
- [ ] **Body — Endowments**: Relocate Voice and Preferred Language from the Soul tab into the Body section. These are the physical expression layer — how the AI speaks and in what tongue. Body → Endowments is the natural home for anything that governs the sensory/physical interface with the world.
- [ ] **Brain — Intellect (Chronoception)**: Move the Chronoception (date/time injection) toggle from the Soul — Essence section into Brain — Intellect. Knowing the current time is a cognitive/analytical concern, not an identity one.

---

## Phase 50: Governance Hardening

**Status**: Complete — see [ADR 132](../adr/132-governance-hardening.md) and [Guide](../guides/governance-hardening.md)

Closed all deferred items from Phase 48 (ADR 128) and Phase 49 (ADR 130).

- [x] **OPA sidecar service** — `opa` service in `docker-compose.yml` (`opa` + `full` profiles). `opa/capabilities.json` blocks `http.send` and `net.lookup_ip_addr`. `OPA_ADDR` env var in core service. `@open-policy-agent/opa` v2.0.0 in `packages/core/package.json`. New `OpaClient` module at `src/intent/opa-client.ts`.
- [x] **Wire `checkHardBoundaries()` to OPA** — `_matchesBoundaryWithOpa()` evaluates `boundary_{id}/allow` when OPA is configured and boundary has `rego`. Falls back to substring matching on OPA error/null.
- [x] **Policy upload on save** — `IntentManager.syncPoliciesWithOpa(record)` uploads all `rego` fields from `hardBoundaries[]` and `policies[]` on create and update. Called from `POST /api/v1/intent` and `PUT /api/v1/intent/:id`.
- [x] **CEL expression evaluation for `activeWhen`** — `src/intent/cel-evaluator.ts` implements a CEL subset (==, !=, <, >, <=, >=, &&, ||, !, grouping). Legacy `key=value AND` format remains backward-compatible via format detection heuristic.
- [x] **Soft policies surface in dashboard** — Policies tab added to `IntentEditor.tsx` showing blocking/warning policies, OPA Rego badge, expandable Rego source view, enforcement event description.
- [x] **MCP-tool-dispatch signal sources** — `_fetchMcpToolSignal()` added to `IntentManager`. Dispatches via optional `callMcpTool` callback injected at construction. Passes `schema` hint from `ds.schema`.

---

## Phase 51: Security Toolkit Completion

**Status**: Planned

Core Kali toolkit shipped (ADR 089). The `sec_*` MCP tools, `secureyeoman security` CLI, and three deployment modes (native/docker-exec/prebuilt) are live. This phase completes the remaining toolkit items.

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining (e.g. nmap port list → gobuster per open port → nuclei per service).
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments where `secureyeoman security setup` is not convenient.
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

---

## Phase 52: Multimodal I/O Enhancement

**Status**: Planned

Provider picker shipped in Phase 40; expanded to 10 TTS and 7 STT providers. This phase completes voice quality and usability improvements.

- [ ] **Energy-based VAD** — Replace the fixed 2-second silence timer in `usePushToTalk` and `useTalkMode` with RMS-threshold Voice Activity Detection. The Web Audio API `AnalyserNode` is already wired in both hooks — needs threshold logic instead of a `setTimeout`.
- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated. Reduces perceived latency for long text.
- [ ] **Audio validation before STT** — Validate duration 2–30s, RMS > 0.01, peak < 0.99. Return a clear error rather than passing bad audio to the API.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` in multimodal config. Surface as dropdown in the provider card UI alongside provider selection.
- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call.

---

## Phase 53: Local-First AI

**Status**: Planned

Privacy-first, offline-capable AI processing via on-device models. Completes the "sovereign AI" positioning — currently all inference goes to cloud providers even in a self-hosted deployment.

**Feature toggle in `config.yml`:**

```yaml
ai:
  localMode:
    enabled: true                    # Switch: local vs cloud
    provider: "ollama"               # ollama | lmstudio | localai
    model: "llama3.1:8b-instruct-q4_K_M"
    embeddingModel: "nomic-embed-text"
    fallbackToCloud: false           # If local fails, fail or use cloud
```

- [ ] **Local model inference** — When `ai.localMode.enabled: true`, route LLM requests to the configured local provider instead of cloud APIs. Swap provider/model at runtime via `ai.localMode` config reload.
- [ ] **Local embedding generation** — Use `nomic-embed-text` (or configured `embeddingModel`) for vectorizing memories, knowledge, and document chunks. Eliminates external embedding API calls.
- [ ] **Hybrid cloud/local switch** — Runtime toggle between local-only, cloud-only, or local-first-with-cloud-fallback. Expose in dashboard settings alongside the existing model picker.
- [ ] **Offline detection** — When `ai.localMode.enabled: true` and the local provider is unreachable, surface a clear "Local AI Unavailable" state in the dashboard — don't silently fall back to cloud unless `fallbackToCloud: true`.
- [ ] **Model lifecycle management** — MCP tools for pulling, listing, and removing local models (`ollama pull`, `ollama list`, `ollama rm`). Surface model disk usage in dashboard.
- [ ] **Quantization awareness** — Document recommended model quantizations (Q4_K_M, Q5_K_S, etc.) for different hardware tiers. Auto-detect available RAM and suggest appropriate model size.

---

## Phase 54: Marketplace Evolution

**Status**: Demand-Gated — implement once the community skill repo has meaningful scale.

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default).
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI.

---

## Phase 55: Native Clients

**Status**: Demand-Gated — implement once REST/WebSocket API is stable and adoption justifies native packaging.

### Mobile

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

### Desktop

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

---

## Phase 56: Infrastructure & Platform

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

*Last updated: 2026-02-25 (Security Dashboard re-org; Tasks consolidated to /tasks with Tasks + Heartbeats sub-tabs; personality association; heartbeat log personality attribution fix)*
