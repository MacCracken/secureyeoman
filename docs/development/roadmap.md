# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| | **Release 2026.2.23** | **2026-02-23** | **Released** |
| 48 | Machine Readable Org Intent | — | In Progress |
| 49 | AI Autonomy Level Audit | — | Planned |
| XX | Find & Repair (Ongoing) | — | Ongoing |

---

## Phase 48: Machine Readable Language of Organizational Intent

**Status**: In Progress (schema, core engine, prompt injection, MCP tool, enforcement log, guide — complete; pipeline enforcement, policy layer, full dashboard UI — remaining) | **Priority**: High

### 48.2 — Signal Awareness

- [ ] **`intent_signal_degraded` audit event** — Emitted when a monitored signal crosses its warning threshold. Surfaced in the Security Feed and optionally triggers a notification.

### 48.3 — Goal Resolution & Authorized Action Engine

- [ ] **Authorized action enforcement** — Before executing a skill or MCP tool call, evaluate whether the action falls within `authorizedActions[]` for the current goal and role. Unauthorized actions return a structured refusal: which action was attempted, why it's not authorized, what alternatives are available.
- [ ] **Goal-to-skill affinity** — Goals with `skills[]` elevate those skill slugs in the Phase 44 router when the goal is active.
- [ ] **`intent_goal_activated` / `intent_goal_completed` / `intent_action_blocked` audit events**.

### 48.4 — Hard Boundary Enforcement

- [ ] **Hard boundary enforcement wired into execution pipeline** — `checkHardBoundaries()` exists in `IntentManager` but is not yet called from chat routes or tool dispatch. Must be evaluated as the outermost gate before any policy check or tool execution; always-block with no escalation path.

### 48.5 — Soft Policy Enforcement

- [ ] **Runtime policy evaluation** — Evaluated after hard boundaries, before tool execution. `warn` enforcement logs and proceeds; `block` halts with a structured refusal including policy id and rule.
- [ ] **`rego` policy evaluation** — Policies with a `rego` field evaluate via embedded OPA WASM bundle or sidecar OPA instance (`OPA_ADDR` env var). Falls back to natural-language-only if OPA is unavailable.
- [ ] **`intent_policy_warn` / `intent_policy_block` audit events**.

### 48.6 — Dashboard UI

- [ ] **Intent editor** — Full CRUD for `OrgIntent` documents. Tabbed sections: Goals, Signals, Data Sources, Authorized Actions, Trade-off Profiles, Hard Boundaries, Delegation Framework, Context. Goal editor wires signals and authorized actions inline. Trade-off profile editor uses sliders with plain-language labels at each end.
- [ ] **Signal dashboard** — Live view of all monitored signals with current value, threshold, trend sparkline, and status badge. Click-through to the goals and authorized actions connected to each signal.
- [ ] **Delegation framework editor** — Visual editor for tenants and their derived decision boundaries. Each tenant expands to show its boundaries with inline examples. Drag to reorder priority.

---

## Phase 49: AI Autonomy Level Audit

**Status**: Planned | **Priority**: High — governance review that informs how Phase 48 `tradeoffProfiles` and `authorizedActions` are configured. Should be run before any production deployment and periodically thereafter.

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

### 49.3 — Dashboard UI

- [ ] **Autonomy level overview panel** — Table of all active skills and workflows with their current autonomy level badge (L1–L5, colour-coded). Filterable by level. Click-through to the skill/workflow editor.
- [ ] **Audit run wizard** — Step-through checklist UI for sections A–D of the audit. Each item can be marked `pass`, `fail`, or `deferred` with a note. Generates a timestamped audit report (JSON + human-readable markdown).
- [ ] **Level escalation warning** — When a skill or workflow is saved with a higher autonomy level than its previous value, surface a confirmation modal: *"You are escalating [skill name] from L2 (Collaborator) to L4 (Approver). This removes the human confirmation step for [action]. Continue?"*
- [ ] **Emergency stop registry** — List of all L5 agents with their stop procedure documented inline. One-click emergency stop button per agent (requires `admin` role).

---

### 49.4 — Docs

- [ ] **`docs/guides/ai-autonomy-audit.md`** — Full audit guide: framework overview, level definitions with SecureYeoman examples, step-by-step audit procedure, remediation patterns, and quarterly review cadence. Link to `OrgIntent` authoring guide (Phase 48.7).

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

#### Markdown for Agents (MCP Content Negotiation)

*[Cloudflare's Markdown for Agents](https://blog.cloudflare.com/markdown-for-agents/) achieves up to 80% token reduction via `Accept: text/markdown` content negotiation.*

**Consumer — smarter web fetching in `web-tools.ts`:**

- [ ] **`Accept: text/markdown` in `web_scrape_markdown`** — Send `Accept: text/markdown, text/html;q=0.9` before falling back to HTML→markdown conversion.
- [ ] **Token savings telemetry in tool output** — Surface `x-markdown-tokens` header (or estimate) alongside content.
- [ ] **`Content-Signal` header enforcement** — Parse `Content-Signal: ai-input=no` and return an error rather than feeding the content to the agent. Configurable opt-out via `MCP_RESPECT_CONTENT_SIGNAL=false`.
- [ ] **YAML front matter extraction** — Parse YAML front matter from markdown responses and return metadata as structured preamble.
- [ ] **`web_fetch_markdown` dedicated tool** — Leaner, single-purpose: fetch one URL, return clean markdown, report token count and `Content-Signal`.

**Producer — serving YEOMAN content to external agents:**

- [ ] **Personality system prompts as `text/markdown` MCP resources** — URI `yeoman://personalities/{id}/prompt` with YAML front matter.
- [ ] **Skill definitions as `text/markdown` MCP resources** — URI `yeoman://skills/{id}` with front matter for agent-to-agent skill discovery.
- [ ] **`x-markdown-tokens` response header on all markdown MCP endpoints**.

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

*Last updated: 2026-02-24 (Phase 49 added: AI Autonomy Level Audit; Phase 48 in progress — schema, engine, prompt injection, MCP tool, enforcement log, guide complete; pipeline enforcement, policy layer, full dashboard UI remaining; Phases 44, 45 complete — see Changelog)*
