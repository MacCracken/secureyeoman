# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| | **Release 2026.2.23** | **2026-02-23** | **Released** |
| 48 | Machine Readable Org Intent | 2026-02-24 | **Complete** |
| Tier2-MA | Markdown for Agents: MCP Content Negotiation | 2026-02-24 | **Complete** |
| Tier2-MA.1 | Dashboard Type Fixes (allowIntentEditor, respectContentSignal UI) | 2026-02-24 | **Complete** |
| Tier2-MA.2 | Docker Build Fix (personality-resources.ts cast, shared rebuild) | 2026-02-24 | **Complete** |
| 49 | AI Autonomy Level Audit | 2026-02-24 | **Complete** |
| 50 | Intent Goal Lifecycle Events | — | Planned |
| XX | Find & Repair (Ongoing) | — | Ongoing |

---

## Phase 49: AI Autonomy Level Audit

**Status**: Complete | **Priority**: High — governance review that informs how Phase 48 `tradeoffProfiles` and `authorizedActions` are configured. Should be run before any production deployment and periodically thereafter.

Structured review of every human and AI role in a SecureYeoman deployment against the five-level autonomy framework. Ensures each agent, skill, and workflow is operating at an explicitly chosen and documented autonomy level — not by accident.

> **Framework source:** *"Levels of Autonomy for AI Agents"* — Knight First Amendment Institute (arXiv:2506.12469, 2025). Companion framing: *"Intelligent AI Delegation"* — Google DeepMind (arXiv:2602.11865, Feb 2026), which addresses task allocation, authority transfer, and accountability in mixed human-AI delegation networks. Together they define both the autonomy scale and the governance obligations at each level.

---

### The Five Levels

Autonomy is defined as the extent to which an agent is designed to act without user involvement. As the level rises, the *human role* shifts from active driver to passive monitor.

| Level | Human Role | Agent Behaviour | Control Mechanism | Representative Example |
|-------|------------|-----------------|-------------------|------------------------|
| **L1** | **Operator** | Executes on direct command only; no independent initiative | Human issues every instruction | MCP tool called explicitly by user |
| **L2** | **Collaborator** | Shares planning and execution; fluid handoffs between human and agent | Either party can steer; human retakes control at will | Sub-agent working alongside user through a task breakdown |
| **L3** | **Consultant** | Agent leads; pauses to request human expertise or preferences | Agent asks targeted questions; human provides context | Deep-research skill that runs autonomously but checks in on ambiguous scope |
| **L4** | **Approver** | Agent operates independently; surfaces high-risk or pre-defined decisions for sign-off | Explicit approval gate before irreversible actions | Authorized-action engine with `autonomyVsConfirmation` set to 0.4–0.6 |
| **L5** | **Observer** | Agent acts fully autonomously within constraints; human monitors and can trigger emergency stop | Audit feed + hard boundaries + emergency stop only | Fully autonomous background agent bounded by Phase 48 hard boundaries |

---

### 49.1 — Project Role Mapping

Current SecureYeoman capabilities mapped to their default and maximum autonomy levels. The gap between *current default* and *maximum possible* is the risk surface the audit is designed to surface and govern.

| Feature / Component | Current Default Level | Max Possible Level | Governing Control |
|---------------------|-----------------------|--------------------|-------------------|
| MCP tool call (user-initiated) | **L1** | L1 | Explicit user command |
| Skill invocation via chat | **L1** | L2 | Soul prompt + user intent |
| Sub-agent task execution (Phase 43) | **L2** | L3 | Task breakdown; human retakes at any step |
| Workflow engine (workflow-engine.ts) | **L2** | L4 | Workflow definition; human approval nodes |
| Goal-driven skill routing (Phase 44/48) | **L3** | L4 | `authorizedActions[]` + `useWhen` guards |
| Authorized action engine (Phase 48) | **L3–L4** | L4 | `autonomyVsConfirmation` trade-off profile |
| Signal-triggered actions (Phase 48.2) | **L4** | L5 | Signal threshold + hard boundaries |
| Background autonomous agent | **L4** | L5 | Hard boundaries + `intent_boundary_violated` audit |
| Twingate service key rotation (Phase 41/45) | **L4** | L4 | Rotation policy; SecretsManager gates |
| Network config push (Phase 46) | **L4** | L4 | Scope manifest + `MCP_ALLOWED_TARGETS` |

**Design principle:** No feature should silently operate at a higher level than its documented default. Escalation to a higher level requires explicit configuration and produces audit events.

---

### 49.2 — Audit Checklist

The audit is a structured point-in-time review. Run it before production, after major capability additions (new skills, new MCP tools, new autonomous workflows), and at least quarterly for L4/L5 deployments.

#### A. Inventory

- [ ] List every active skill and classify its autonomy level (L1–L5) based on how it behaves when invoked without additional user input.
- [ ] List every active workflow and identify all nodes where human approval is required vs. absent.
- [ ] List all background agents and confirm each has an associated hard boundary set in `OrgIntent.hardBoundaries[]`.
- [ ] List all signal-triggered actions and confirm each maps to an `authorizedActions[]` entry with `conditions` set.

#### B. Level Assignment Review

- [ ] For each L3 item: confirm there is a documented `useWhen` / `doNotUseWhen` and a defined escalation path when the agent's consultation question goes unanswered.
- [ ] For each L4 item: confirm the approval gate is reachable (not buried or auto-dismissed) and that the `autonomyVsConfirmation` value in the active trade-off profile is deliberately chosen.
- [ ] For each L5 item: confirm a hard boundary (`hardBoundaries[]`) and an emergency stop path exist. Document the exact stop procedure for each L5 agent.
- [ ] Verify no item is *de facto* operating at a higher level than its documented classification (e.g. a workflow classified L3 that in practice never pauses for input).

#### C. Authority & Accountability (DeepMind Delegation Lens)

- [ ] **Task allocation** — Each delegated task has a clear owner (human role or agent id). No orphaned tasks where accountability is ambiguous.
- [ ] **Authority transfer** — Escalation from L3 → L4 or L4 → L5 requires an explicit configuration change, not drift. Document who is authorized to approve that change.
- [ ] **Accountability mechanisms** — Every L4/L5 action produces an audit event (`intent_action_blocked`, `intent_boundary_violated`, or skill invocation log). Confirm the Security Feed surfaces them.
- [ ] **Intent communication** — The active `OrgIntent` document is current. Goals, authorized actions, and hard boundaries reflect the organization's current intent — not a stale first draft.
- [ ] **Trust calibration** — Trade-off profiles (`autonomyVsConfirmation`) are reviewed with the stakeholders who will be the human Approver or Observer for each agent.

#### D. Gap Remediation

- [ ] For any item where current default level > desired level: add an approval gate, restrict `authorizedActions[]`, or lower `autonomyVsConfirmation`.
- [ ] For any L5 item missing an emergency stop path: block promotion to L5 until the stop mechanism is implemented and tested.
- [ ] Document the agreed level for each item in `OrgIntent.context[]` as a stable org fact so future agents and operators have a shared reference point.

---

## Phase 50: Intent Goal Lifecycle Events

**Status**: Planned | **Priority**: Medium — requires persistent goal-state snapshot infrastructure before goal activation/completion can be detected reliably.

Adds deterministic audit events for the goal lifecycle inside an active `OrgIntent` document. Phase 48 shipped the goal engine (resolver, affinity, authorized actions) but deferred the lifecycle events because detecting a goal's transition to "active" or "completed" requires a persistent snapshot of prior goal state — none exists yet.

### 50.1 — Goal State Persistence

- [ ] **Active goal snapshot** — Store a per-intent snapshot of which goals are currently active (evaluated against their `conditions[]`) in the DB (new column or separate table). On each `reloadActiveIntent()` / signal refresh cycle, diff the new evaluation against the snapshot to detect transitions.
- [ ] **`intent_goal_activated` enforcement log event** — Emitted when a goal transitions from inactive → active (condition newly satisfied). Logs `goalId`, `rule` (the condition text), and `agentId` if available.
- [ ] **`intent_goal_completed` enforcement log event** — Emitted when a goal transitions from active → inactive and a completion marker is present (e.g. `goal.completionCondition` string or external signal crossing threshold in the opposite direction). Deferred until `completionCondition` field is defined in `GoalSchema`.

### 50.2 — Schema Extension

- [ ] **`completionCondition` on `GoalSchema`** — Optional string field (same deny:/tool: pattern as boundaries) describing what constitutes goal completion. When a signal or context fact matches, goal is marked completed and `intent_goal_completed` fires.

### 50.3 — Dashboard

- [ ] **Goal lifecycle timeline** — In the intent editor / signals tab, surface a timeline of `intent_goal_activated` and `intent_goal_completed` events from the enforcement log per goal, so operators can see when goals activate and whether they resolve.

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open

*Add observed bugs here as they are found; mark fixed when resolved.*

- [ ] (none yet)

---

## Future Features

*Demand-gated — implement only once real-world usage confirms the need. Ordered by priority within each tier.*

---

### Tier 1 — Near Term

#### Kali Security Toolkit Enhancements

*Core implementation shipped (ADR 089). The `sec_*` MCP tools, `secureyeoman security` CLI, and three deployment modes (native/docker-exec/prebuilt) are live.*

- [ ] **Scope manifest UI** — Dashboard panel for managing `MCP_ALLOWED_TARGETS` — add/remove CIDRs, hostnames, URL prefixes. Wildcard (`*`) mode requires explicit acknowledgement checkbox. Reads/writes the running server's environment or a persisted config table.
- [ ] **Structured output normalization** — Parse nmap XML (`-oX`), sqlmap JSON (`--output-format=json`), nuclei JSONL (`-j`), and gobuster output into a consistent `{ tool, target, command, parsed, exit_code }` MCP envelope for richer agent chaining (e.g. nmap port list → gobuster per open port → nuclei per service).
- [ ] **`ghcr.io/secureyeoman/mcp-security-toolkit` prebuilt image** — Publish a versioned Kali-based Docker image as a one-click MCP prebuilt in `McpPrebuilts.tsx` for cloud deployments where `secureyeoman security setup` is not convenient.
- [ ] **Hydra live brute-force** — Credential testing against authorized targets. Requires scope enforcement proven stable and an additional per-tool authorization flag beyond `MCP_ALLOWED_TARGETS`.

#### Multimodal I/O Enhancement

*Provider picker shipped in Phase 40; expanded to 10 TTS and 7 STT providers.*

- [ ] **Energy-based VAD** — Replace the fixed 2-second silence timer in `usePushToTalk` and `useTalkMode` with RMS-threshold Voice Activity Detection. The Web Audio API `AnalyserNode` is already wired in both hooks — needs threshold logic instead of a `setTimeout`.
- [ ] **Streaming TTS via SSE** — Stream audio chunks from the TTS backend to the browser as they're generated. Uses Server-Sent Events. Reduces perceived latency for long text.
- [ ] **Audio validation before STT** — Validate duration 2–30s, RMS > 0.01, peak < 0.99. Return a clear error rather than passing bad audio to the API.
- [ ] **Whisper model size selection** — Expose `tiny | base | small | medium | large` in multimodal config. Surface as dropdown in the provider card UI alongside provider selection.
- [ ] **Voice profile system** — Named voice identities (`voice_profile_create`, `voice_profile_list`, `voice_profile_speak` MCP tools) backed by Voicebox profiles. Each personality can have a persistent voice identity.
- [ ] **Two-tier voice prompt caching** — Cache Voicebox voice prompts in memory (session) and on disk (MD5 keyed on audio bytes + reference text), avoiding reprocessing reference audio on every TTS call.

---

### Tier 2 — Medium Term

#### Localized Neural Networks

*Privacy-first, offline-capable AI processing via on-device models.*

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

**Components:**

- [ ] **Local model inference** — When `ai.localMode.enabled: true`, route LLM requests to the configured local provider instead of cloud APIs. Swap provider/model at runtime via `ai.localMode` config reload.
- [ ] **Local embedding generation** — Use `nomic-embed-text` (or configured `embeddingModel`) for vectorizing memories, knowledge, and document chunks. Eliminates external embedding API calls.
- [ ] **Hybrid cloud/local switch** — Runtime toggle between local-only, cloud-only, or local-first-with-cloud-fallback. Expose in dashboard settings alongside the existing model picker.
- [ ] **Offline detection** — When `ai.localMode.enabled: true` and the local provider is unreachable, surface a clear "Local AI Unavailable" state in the dashboard — don't silently fall back to cloud unless `fallbackToCloud: true`.
- [ ] **Model lifecycle management** — MCP tools for pulling, listing, and removing local models (`ollama pull`, `ollama list`, `ollama rm`). Surface model disk usage in dashboard.
- [ ] **Quantization awareness** — Document recommended model quantizations (Q4_K_M, Q5_K_S, etc.) for different hardware tiers. Auto-detect available RAM and suggest appropriate model size.

**Why this matters:** Privacy-sensitive deployments can process all AI requests locally. Reduces API costs for high-volume usage. Enables fully offline operation.

---

### Tier 3 — Long Term / Demand-Gated

#### Encryption

- [ ] **HSM Integration** — Hardware Security Module integration for key management.

#### Marketplace Evolution

- [ ] **Scheduled Auto-Sync** — Optional cron-style background sync from the configured community repo (configurable interval, off by default).
- [ ] **Hosted Discovery API** — A lightweight read-only API for browsing available community skills without cloning.
- [ ] **Cryptographic Skill Signing** — Authors sign skills with a keypair; SecureYeoman verifies signatures before installing. Reject unsigned skills in strict mode.
- [ ] **Skill Ratings & Downloads** — Community feedback mechanism (stars, download counts) surfaced in the marketplace UI.

#### Real-time Collaboration

- [ ] **Optimistic Locking** — `version` field on personalities and skills; API returns `409 Conflict` on stale saves; dashboard shows "Someone else edited this — reload?" banner.

#### Layout Algorithms

*Revisit once delegation trees and peer networks grow beyond a few dozen nodes and Dagre's static layout proves limiting.*

- [ ] **ELK Integration** — Eclipse Layout Kernel for advanced constraint-based layouts. ~2 MB WASM bundle — justified only when graph complexity outgrows Dagre.

#### Mobile Application

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.

#### Desktop Application

- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Offline indicator** — Detect when the connected SecureYeoman instance is unreachable.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

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

*Last updated: 2026-02-24 (Phase 48 complete — pipeline enforcement, policy layer, signal degradation, goal-to-skill affinity, full field-level intent editor, allowIntentEditor flag; Tier2-MA complete — Markdown for Agents MCP content negotiation; Tier2-MA.1 — dashboard type fixes, 0 tsc errors; Tier2-MA.2 — Docker build fix; Phase 49 complete — L1–L5 autonomy classification on skills + workflows, audit run system, escalation warnings, emergency stop registry, dashboard UI, docs; Phase 50 planned)*
