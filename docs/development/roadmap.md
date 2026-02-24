# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| | **Release 2026.2.23** | **2026-02-23** | **Released** |
| 48 | Machine Readable Org Intent | — | Planned |
| 49 | AI Autonomy Level Audit | — | Planned |
| XX | Find & Repair (Ongoing) | — | Ongoing |

---

## Phase 48: Machine Readable Language of Organizational Intent

**Status**: Planned | **Priority**: High — architectural layer that elevates SecureYeoman from agent tooling to organizational AI governance. Builds on Phase 44 (Skill Routing) primitives.

A structured, machine-interpretable format for expressing what an organization wants its agents to do — active goals agents can act on, the signals that indicate success in *this org's context*, the data sources that carry those signals, what actions the agent is authorized to take to improve them, how to navigate trade-offs, and where the hard limits are. Below all of that: a delegation framework that translates organizational tenants into concrete decision boundaries agents can reason within.

Today this lives in strategy docs, onboarding wikis, and Slack messages. This phase gives it a formal home.

### 48.1 — Intent Schema

The `OrgIntent` document (`orgIntent.yaml`, loaded via config) is a versioned schema (`apiVersion: secureyeoman.io/v1`) with seven top-level sections. All sections are optional; the schema is incrementally adoptable.

- [ ] **`goals[]`** — What the org wants agents to actively pursue. Each goal: `id`, `name`, `description`, `priority` (`critical | high | medium | low`), `activeWhen` (optional condition), `successCriteria`, `ownerRole`, `skills[]` (skill slugs that serve this goal), `signals[]` (signal ids that measure progress toward this goal), `authorizedActions[]` (action ids the agent may take to advance this goal). Goals are not skills — a goal is *what the org wants*; skills are *how agents do things*.
- [ ] **`signals[]`** — Domain-specific indicators of success meaningful in *this org's context*. Not generic metrics — the org declares what customer satisfaction, quality, or throughput actually means here. Each signal: `id`, `name`, `description`, `dataSources[]` (refs to data source registry), `direction` (`higher_is_better | lower_is_better`), `threshold` (value at which the signal is considered healthy), `warningThreshold`. Agents use signals to understand whether they are moving in the right direction.
- [ ] **`dataSources[]`** — Registry of data sources agents can read to evaluate signals. Each source: `id`, `name`, `type` (`api | mcp_tool | database | webhook | feed`), `connection` (URL or MCP tool name), `authSecret` (ref to SecretsManager key), `schema` (shape of what comes back — lets agents interpret the data without trial and error). Phase 41 SecretsManager handles credentials.
- [ ] **`authorizedActions[]`** — What the agent is empowered to do. Distinct from skills (which describe capability) — authorized actions declare *permission scope*. Each action: `id`, `description`, `appliesToGoals[]`, `appliesToSignals[]`, `requiredRole`, `conditions` (optional — e.g. only when signal is below threshold), `mcpTools[]` (specific MCP tool names this action permits). Agents check authorized actions before acting; unauthorized actions are blocked with a structured explanation.
- [ ] **`tradeoffProfiles[]`** — Named stances for navigating trade-offs the org has thought through in advance. Each profile: `id`, `name`, `speedVsThoroughness` (0 = always thorough, 1 = always fast), `costVsQuality` (0 = always quality, 1 = always minimize cost), `autonomyVsConfirmation` (0 = always confirm with human, 1 = always act autonomously), `notes` (plain language rationale). A `default` profile is required; additional named profiles can be activated per role or goal. Agents use the active profile to resolve ambiguous decisions without escalating.
- [ ] **`hardBoundaries[]`** — Inviolable constraints the agent may never cross regardless of goal priority, trade-off profile, or escalation. Distinct from `policies[]` (which support `warn` and can be overridden) — hard boundaries are always-block with no override path. Each boundary: `id`, `rule` (natural language), `rego` (optional machine-evaluable expression), `rationale` (why this line exists). Evaluated before policies, before tool execution.
- [ ] **`delegationFramework`** — Org tenants (core principles like "customer first", "never sacrifice data integrity for speed") translated into concrete decision boundaries agents can reason within. `tenants[]`: each tenant has `id`, `principle` (the value), `decisionBoundaries[]` (specific rules derived from the principle with `id`, `rule`, `examples[]`). This is what makes abstract org values operational — an agent that encounters an ambiguous situation can check whether its proposed action violates a derived decision boundary before acting.
- [ ] **`context[]`** — Stable org facts injected into every session: org name, industry, regulatory environment, key contacts, default language. Background agents should not need to be told repeatedly.
- [ ] **`OrgIntentSchema` Zod definition** in `packages/core/src/intent/` — validate on load, surface structured errors for malformed documents.

### 48.2 — Signal Awareness & Data Source Registry

- [ ] **`SignalMonitor`** — At session start (and on a configurable refresh interval), resolves the current value of active signals by querying their registered data sources. Caches values with TTL. Emits `intent_signal_degraded` when a signal crosses its warning threshold.
- [ ] **`intent_signal_read` MCP tool** — Agents call this to get the current value of a named signal. Returns value, threshold, direction, and a plain-language status (`healthy | warning | critical`). Lets agents proactively check whether they are having the desired effect.
- [ ] **Signal context injection** — `composeSoulPrompt` includes a `signals` block summarizing the current state of signals relevant to active goals: e.g. `"CSAT: 78% (warning — below 80% threshold, trending down 3% this week)"`. Agents have live awareness of what's working and what isn't.
- [ ] **`intent_signal_degraded` audit event** — Emitted when a monitored signal crosses its warning threshold. Surfaced in the Security Feed and optionally triggers a notification.

### 48.3 — Goal Resolution & Authorized Action Engine

- [ ] **`GoalResolver`** — Loads the active `OrgIntent` and resolves which goals apply to the current agent, role, and session context. Returns an ordered list by priority. Goals with `activeWhen` expressions are evaluated against session context.
- [ ] **Goal injection into soul prompts** — `composeSoulPrompt` gains a `goals` block: active goals with their success criteria, relevant signals, and a summary of authorized actions available to advance them. The agent knows *what to pursue*, *how to measure progress*, and *what it's allowed to do*.
- [ ] **Authorized action enforcement** — Before executing a skill or MCP tool call, evaluate whether the action falls within `authorizedActions[]` for the current goal and role. Unauthorized actions return a structured refusal: which action was attempted, why it's not authorized, what alternatives are available.
- [ ] **Goal-to-skill affinity** — Goals with `skills[]` elevate those skill slugs in the Phase 44 router when the goal is active.
- [ ] **`intent_goal_activated` / `intent_goal_completed` / `intent_action_blocked` audit events**.

### 48.4 — Trade-off & Delegation Engine

- [ ] **`TradeoffResolver`** — Resolves the active trade-off profile for the current session (default → role override → goal override). Injects the active profile into `composeSoulPrompt` as a `tradeoffs` block: `"Speed vs thoroughness: lean thorough (0.3). Cost vs quality: lean quality (0.2). Autonomous action: confirm for irreversible actions (0.4)."` Agents have a clear stance to reference when a decision could go either way.
- [ ] **Hard boundary enforcement** — Evaluated as the outermost gate before any policy check or tool execution. Always-block. Returns boundary `id` and `rationale` in the refusal. No escalation path — these are not negotiable.
- [ ] **`DelegationFrameworkResolver`** — At session start, loads the active `delegationFramework` and injects the relevant tenants and their derived decision boundaries into the agent's operating context. When an agent encounters an ambiguous situation, it can reason: *does this proposed action violate a decision boundary derived from our tenants?* Boundaries are injected as a structured block, not narrative prose, so they are reliably machine-parseable.
- [ ] **`intent_boundary_violated` audit event** — Emitted on hard boundary enforcement. Includes boundary id, action attempted, agent id, session id.

### 48.5 — Soft Policy Enforcement

- [ ] **Runtime policy evaluation** — Evaluated after hard boundaries, before tool execution. `warn` enforcement logs and proceeds; `block` halts with a structured refusal including policy id and rule.
- [ ] **`rego` policy evaluation** — Policies with a `rego` field evaluate via embedded OPA WASM bundle or sidecar OPA instance (`OPA_ADDR` env var). Falls back to natural-language-only if OPA is unavailable.
- [ ] **`intent_policy_warn` / `intent_policy_block` audit events**.

### 48.6 — Dashboard UI

- [ ] **Intent editor** — Full CRUD for `OrgIntent` documents. Tabbed sections: Goals, Signals, Data Sources, Authorized Actions, Trade-off Profiles, Hard Boundaries, Delegation Framework, Context. Goal editor wires signals and authorized actions inline. Trade-off profile editor uses sliders with plain-language labels at each end.
- [ ] **Signal dashboard** — Live view of all monitored signals with current value, threshold, trend sparkline, and status badge. Click-through to the goals and authorized actions connected to each signal.
- [ ] **Delegation framework editor** — Visual editor for tenants and their derived decision boundaries. Each tenant expands to show its boundaries with inline examples. Drag to reorder priority.
- [ ] **Enforcement log** — Unified filterable feed: hard boundary violations, policy blocks/warns, unauthorized action attempts. Filterable by type, agent, session, boundary/policy id.

### 48.7 — Docs

- [ ] **`docs/guides/organizational-intent.md`** — Full authoring guide: schema overview, goal vs signal vs authorized action vs policy vs hard boundary, trade-off profiles explained with examples, delegation framework authoring (tenant → decision boundary translation), data source registration, OPA policy guide, migration path from ad-hoc system prompts to structured intent.

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

*Last updated: 2026-02-24 (Phase 49 added: AI Autonomy Level Audit; Phase 48: Machine Readable Org Intent; Phases 44, 45 complete — see Changelog)*
