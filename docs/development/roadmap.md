# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 50 | Governance Hardening | Planned |
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

- [x] Marketplace and Community - Install displays as installed once it is installed to one personality; user should be able to install to any agent without being confused by the buttons state when user switch 'install to' agent.  This should be dynamic in that if not on global, only items installed to the agent should be displayed as installed.
- [x] Chat stream — agent output repeats response preamble after every tool call (cumulative content bug in streaming agentic loop).
- [x] Chat stream — personality appears to "die" / terminate during long multi-tool responses (MAX_TOOL_ITERATIONS = 10 cap hit; SSE keepalive missing).

### Improvements

- [ ] Marketplace and Community - add the ability to review the full skill before installation.  Lets give the user the ability to review all necessary items of the skill.
- [ ] Security Dashboard - re-org tab view; Overview, Audit Log, Autonomy, ML, Reports, System, Tasks
- [ ] Tasks History, separation of task and heartbeats into their own subviews.
- [ ] Tasks and History needs consolidation; remove from Security Dashboard.
- [ ] after Tasks consolidation - insure each personality is associated
- [ ] Chat (any context) with personality; need to provide time date awareness to the conversasion. Without asking personality to check the time/data for response accuracy.
- [ ] Agents > Sub-Agents > Profile shoud be first tab, but keep default as Active.
- [x] **Sub-agent task-aware tool pruning** — Root-cause of 30 K–50 K overhead per delegation: all registered MCP tools (~20–30, ~10,000–15,000 tokens) are injected unconditionally into every sub-agent call regardless of relevance. Implement tool filtering based on the profile's `allowedTools` list or a task-type classifier so simple delegations don't carry the full tool catalog. See `packages/core/src/agents/manager.ts` lines 390–407.
- [ ] dashboard - Allow for personality image to recieve an image

---

## Phase 50: Governance Hardening

**Status**: Planned

Closes the deferred items from Phase 48 (ADR 128) and Phase 49 (ADR 130). The schema, `OPA_ADDR` hook, and `rego` storage fields are already in place — this phase wires them together and adds the OPA service.

**Architecture decision:** `@open-policy-agent/opa-wasm` is ruled out — it requires Rego to be pre-compiled to `.wasm` at build time and cannot evaluate user-defined policies stored as source text at runtime. The correct approach is the **OPA sidecar** pattern: OPA runs as a Docker/k8s sidecar service, and policies are uploaded as raw Rego source via `PUT /v1/policies/{id}`. TypeScript client: `@open-policy-agent/opa` v2.0.0.

**Security note:** User-defined Rego can contain `http.send` and `net.lookup_ip_addr`, enabling SSRF and data exfiltration. OPA's capabilities config must disable these built-ins before accepting user-authored policy input.

- [ ] **OPA sidecar service** — Add `opa` service to `docker-compose.yml` using `openpolicyagent/opa:latest`. Configure `capabilities` to disable `http.send` and `net.lookup_ip_addr`. Set `OPA_ADDR=http://opa:8181` in core service env. Add `@open-policy-agent/opa` v2.0.0 to `packages/core/package.json`.
- [ ] **Wire `checkHardBoundaries()` to OPA** — `HardBoundarySchema` already has a `rego` field (stored, never evaluated). When `OPA_ADDR` is set and a boundary has `rego`, upload it as `PUT /v1/policies/boundary_{id}` on intent save and call `POST /v1/data/boundary_{id}/allow` during enforcement. Fall back to substring matching on OPA error. (`checkPolicies()` already follows this pattern — hard boundaries need the same treatment.)
- [ ] **Policy upload on save** — When an intent doc is saved via `PUT /api/v1/intent/:id`, iterate its `hardBoundaries[]` and `policies[]` and `PUT` any `rego` snippets to OPA. Delete removed policies from OPA via `DELETE /v1/policies/{id}`. `IntentStorage` already persists the `rego` field; the upload step is missing.
- [ ] **CEL expression evaluation for `activeWhen`** — Replace the simple `key=value AND key=value` conjunction parser in `_evalActiveWhen()` with CEL. The `GoalSchema.activeWhen` and `AuthorizedActionSchema.conditions` fields are already annotated "CEL expression" in comments — they fall back to substring evaluation today.
- [ ] **Soft policies surface in dashboard** — `policies[]`, `PolicySchema`, `checkPolicies()`, and `policy_warn`/`policy_block` enforcement log events are fully implemented in the backend. The `IntentEditor.tsx` dashboard component does not yet expose policy management. Add a Policies tab/section with rule, `rego`, enforcement mode, and rationale fields.
- [ ] **MCP-tool-dispatch signal sources** — `DataSourceSchema` already declares `type: 'mcp_tool'` but `_fetchSignalValue()` only handles `type: 'http'`. Wire MCP-type data sources to call the appropriate MCP tool and parse the numeric result.

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

*Last updated: 2026-02-25 (Reorganized into phases 50–56; removed Tier system)*
