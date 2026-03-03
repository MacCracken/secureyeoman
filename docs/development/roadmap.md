# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

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

### Manual Tests — Desktop & Editor

- [ ] **Docker MCP Tools** — Enable `MCP_EXPOSE_DOCKER=true` (socket mode). Verify `docker_ps` lists containers, `docker_logs` streams output, `docker_exec` runs commands correctly. Enable DinD mode via `MCP_DOCKER_MODE=dind` + `MCP_DOCKER_HOST` and repeat.
- [ ] **Canvas Workspace** — Navigate to `/editor/advanced` (or click "Canvas Mode →" in the editor toolbar). Create ≥3 widgets, resize, move, minimize one. Reload page → verify layout is restored from localStorage. Pin a terminal output → frozen-output widget appears adjacent. Worktree selector lists git worktrees.
- [ ] **Unified editor features** — At `/editor` (standard editor): (1) Click Brain icon → toggle memory on; run a terminal command → verify it appears in the personality's memory via `/api/v1/brain/memories`; (2) Click CPU icon → ModelWidget popup shows current model; switch model → toolbar label updates; (3) Click Globe icon → Agent World panel expands below the main row; switch between Grid/Map/Large views; close via × and verify `localStorage('editor:showWorld')` is `'false'`; (4) Open 3 terminal tabs in MultiTerminal → verify each has independent output; (5) Set `allowAdvancedEditor: true` in security policy → `/editor` should redirect to Canvas workspace.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P0 — ongoing | 🔄 Continuous |
| 105 | Test Coverage: Path to 88%/77% | P1 — engineering quality | 🔄 Near target (87.01%/76.01%) |
| 106 | License-Gated Feature Reveal | P1 — commercial | 🔄 In Progress (context ✅, card ✅, CLI guard ✅) |
| 107 | Reasoning Strategies, Security Templates & Portable Personalities | P2 — capability + distribution | 🔄 In Progress (107-A ✅, 107-B ✅, 107-C ✅, community templates ✅) |
| 109 | Editor Improvements (Auto-Claude Style) | P3 — power user UX | 🔄 In Progress (unification ✅, IDE features planned) |
| 110 | Inline Citations & Grounding | P3 — trust layer | Planned |
| 111 | Departmental Risk Register & Risk Posture Tracking | P2 — risk governance | 🔄 In Progress (111-A ✅, 111-B ✅, 111-E ✅, 111-F partial) |
| 112 | Multi-Account AI Provider Keys & Per-Account Cost Tracking | P2 — cost governance | Planned |
| Future | Workflow Versioning, LLM Lifecycle Advanced, Responsible AI, Voice Pipeline, Infrastructure | Future / Demand-Gated | — |

---

## Phase 105: Test Coverage: Path to 88%/77%

**Priority**: P1 — Engineering quality. Current: **87.01% statements / 76.01% branches** (up from 80.85%/68.76%). Target: 88% statements / 77% branches. Less than 1% from both targets.

*Previously Phase 94. Renumbered for sequential ordering.*

**Current counts (2026-03-02)**: 12,796+ tests total — Core unit: 10,139 (393 files), Dashboard: 957 (63 files), MCP: 660 (49 files), DB integration: ~1,225 (60 files). Functions: 86.83%, Lines: 87.92%.

**Remaining gap analysis**: Statements need +0.99pp (≈45 more covered statements). Branches need +0.99pp (≈35 more covered branches). Biggest uncovered areas by module: training (3.72% stmt), telemetry (5.45%), workflow (1.72%), tenants (6.81%). These are DB-heavy integration modules — most gain comes from adding integration tests that exercise the storage + manager layers with a running Postgres database.

---

## Phase 106: License-Gated Feature Reveal

**Priority**: P1 — Commercial. Enterprise features are built and instrumented but not yet gated. This phase makes the tier boundary real: community installs see upgrade prompts; enterprise installs unlock the full feature set. Directly tied to revenue (ADR 171).

*Previously Phase 93. Renumbered for sequential ordering.*

Enterprise features gated by this phase: `adaptive_learning`, `sso_saml`, `multi_tenancy`, `cicd_integration`, `advanced_observability`.

- [ ] **Gateway route guards** — Add `requiresLicense(feature: EnterpriseFeature)` hook to the routes that serve enterprise functionality (training advanced modes, SAML endpoints, RLS multi-tenant API, CI/CD webhook, alert rules). Returns `402 Payment Required` with `{ error: 'enterprise_license_required', feature: '<name>' }` for community-tier callers. `LicenseManager` singleton accessed via `secureYeoman.getLicenseManager()` inside route plugins.
- [ ] **Feature lock UX** — Components for guarded features (Training advanced modes, SSO config, Multi-tenancy settings, CI/CD platforms, Alert Rules) wrap in a `<FeatureLock feature="adaptive_learning">` guard component. Community-tier users see the feature greyed out with a lock icon and an "Upgrade to Enterprise" prompt linking to `docs/guides/licensing.md` rather than a blank 403.

---

## Phase 107: Reasoning Strategies, Security Templates & Portable Personalities

**Priority**: P2 — Capability expansion + distribution. Inspired by [fabric](https://github.com/danielmiessler/fabric)'s patterns/strategies architecture. Six workstreams: composable reasoning strategies, security-domain prompt templates, CLI UX improvements, portable markdown personality format with injection model, personality-core distillation for transport, and ATHI threat governance taxonomy.

*Previously Phase 102. Renumbered for sequential ordering. Includes "base knowledge generic entries per-personality review" from Phase XX.*

### 107-A Remaining Items

*107-A (Reasoning Strategies Layer) and 107-C (CLI Enhancements) are complete — see Changelog [2026.3.2]. The items below were scoped under 107-A but not yet implemented.*

- [ ] **Deterministic routing preference** — Encode a "Code → CLI → Prompt → Skill" dispatch hierarchy in `SkillExecutor` and `WorkflowEngine`, inspired by [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)'s principle that deterministic code paths should be preferred over LLM-routed paths when both can solve the task. When a workflow step or skill action can be resolved by a direct function call or shell command with known output, prefer that over sending the task to the LLM. Concretely: `WorkflowEngine` step dispatch checks for a `deterministic` flag on step config; when set, the step runs its `command` or `function` directly and only falls through to AI routing on failure. Skill routing order: code action → HTTP action → AI-assisted action. Reduces token cost and latency for routine operations.
- [ ] **Base knowledge per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally. These may need per-personality variants. Low urgency.

### 107-B: Security Prompt Templates

*Pre-built security-focused prompt templates inspired by fabric's security patterns. Delivered as marketplace skills and workflow templates with structured output specifications.*

- [x] **STRIDE threat model template** — Skill + workflow template. Input: system description (architecture doc, API spec, or free-text). Output: structured STRIDE per-element analysis with severity scores (Critical/High/Medium/Low), attack trees, and recommended mitigations. Output format: markdown with tables. *(Done — see Changelog [2026.3.2])*
- [x] **SIGMA rule generator** — Skill that converts threat intelligence reports, IOC lists, or incident descriptions into SIEM-ready SIGMA detection rules (YAML). Includes logsource, detection, and condition fields. Validates output against SIGMA schema. *(Done — see Changelog [2026.3.2])*
- [x] **Malware analysis template** — 8-section structured analysis: executive summary, IOCs (hashes, IPs, domains, URLs), MITRE ATT&CK technique mapping, behavioral analysis, YARA rule generation, network indicators, persistence mechanisms, and recommended pivots. Anti-hallucination guard: "Acknowledge missing information rather than inventing indicators." *(Done — see Changelog [2026.3.2])*
- [x] **Email header forensics** — Analyzes raw email headers for SPF/DKIM/DMARC/ARC authentication results. Generates DNS lookup verification scripts. Identifies header anomalies and spoofing indicators. *(Done — see Changelog [2026.3.2])*
- [x] **TTRC analysis (Time to Remediate/Compromise)** — Calculates and visualizes the ratio between how long it takes to find and fix vulnerabilities vs. how long it takes attackers to exploit them. Outputs narrative + data for dashboard metrics. *(Done — see Changelog [2026.3.2])*
- [x] **Security architecture review** — Generates "secure by design" review questions for a given system architecture. Covers: authentication, authorization, data protection, network segmentation, supply chain, logging, incident response, and compliance alignment. *(Done — see Changelog [2026.3.2])*
- [x] **Log analysis template** — Structured log analysis for security events. Identifies anomalies, correlates events, generates timeline, suggests investigation paths. Supports common log formats (syslog, JSON, CEF). *(Done — see Changelog [2026.3.2])*
- [x] **Community security patterns directory** — Added `security-templates/` to the community repo structure with 7 unique templates (incident-response-playbook, cloud-security-posture, api-security-assessment, supply-chain-risk, data-classification, network-segmentation-review, compliance-gap-analysis). Each template is a directory with `system.md` (system prompt), `user.md` (input template with `{{placeholders}}`), and `metadata.json` (validated by `schema/security-template.schema.json`). `CommunitySyncResult` gains `securityTemplatesAdded`/`securityTemplatesUpdated`. Sync reads `system.md` + `user.md` and stores as marketplace skills with `security-template` tag. *(Done — see Changelog [2026.3.2])*

### 107-D: Portable Personality Format — Markdown Injection Model

*Bidirectional conversion between SecureYeoman's native personality format and portable markdown documents. The injection model serializes personalities TO markdown for transport/sharing and parses markdown back INTO the native format. Not flat-file storage — markdown is the interchange format.*

- [ ] **`PersonalityMarkdownSerializer`** — `packages/core/src/soul/personality-serializer.ts`. Methods: `toMarkdown(personality: Personality): string` and `fromMarkdown(md: string): PersonalityCreate`. The markdown format uses structured sections with YAML frontmatter:
  ```
  ---
  name: FRIDAY
  version: 2026.3.2
  traits: [analytical, security-focused, direct]
  defaultModel: { provider: ollama, model: llama3 }
  category: security
  tags: [assistant, security, general-purpose]
  ---
  # Identity & Purpose
  <system prompt text>
  # Skills
  - skill_name: description (autonomy: L3)
  # Configuration
  <YAML block of body config subset — only non-default values>
  # Reasoning Strategy
  <default strategy slug and description>
  ```
- [ ] **Export route** — `GET /api/v1/soul/personalities/:id/export?format=md` returns the markdown document. Also supports `format=json` (existing raw format). Content-Disposition header for download.
- [ ] **Import route** — `POST /api/v1/soul/personalities/import` accepts `multipart/form-data` with `.md` or `.json` file. Parses markdown via `fromMarkdown()`, validates against `PersonalityCreateSchema`, creates the personality. Returns `{ personality, warnings[] }` — warnings for referenced skills/integrations not found locally.
- [ ] **CLI export/import** — `secureyeoman personality export <name> [--format md|json] [--output file]` and `secureyeoman personality import <file>`. Round-trip: `export | import` produces an equivalent personality.
- [ ] **Marketplace markdown transport** — Community repo `personalities/` directory uses `.md` files. `CommunitySyncResult` gains `personalitiesAdded`/`personalitiesUpdated`. Marketplace → Personalities tab shows imported community personalities with a "Community" badge.
- [ ] **Dashboard export/import** — Export button on PersonalityEditor toolbar (downloads `.md` file). Import button on Personalities list page (file upload dialog with preview of parsed personality before confirmation).
- [ ] **TELOS-style guided personality creation** — Structured onboarding wizard for creating personalities from natural language, inspired by [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)'s TELOS goal framework. Instead of filling raw schema fields, the user answers 5–8 guided questions: "What is this personality's mission?", "What topics should it focus on?", "What tools does it need?", "What reasoning style should it use?", "What tone and communication style?", "What constraints or guardrails?". Answers are parsed into a `PersonalityCreate` object and previewed as a rendered markdown personality card before confirmation. Accessible from: (1) "Create with Wizard" button on Personalities list page, (2) `secureyeoman personality create --wizard` CLI flag. The wizard is an alternative to direct JSON/markdown creation — both paths produce the same native personality object.

### 107-E: Personality Core Distillation to Markdown

*Automated extraction of a personality's effective runtime state — not just its config, but the composed prompt including injected skills, memory context, active integrations, and strategy — into a single portable markdown document. This is the "distilled" view: what the AI actually sees.*

- [ ] **`distillPersonality()` method** — `SoulManager` method that calls `composeSystemPrompt()` with all active skills, memory snippets, integration contexts, and strategy prefix, then wraps the result in the portable markdown format from 107-D. The distilled document includes a `# Runtime Context` section listing: active skills (count + names), memory entries (count), connected integrations, applied strategy, and model configuration.
- [ ] **Distillation route** — `GET /api/v1/soul/personalities/:id/distill` returns the distilled markdown. Accepts `?includeMemory=true` to embed the personality's top-k memory entries (default: metadata only, not full content — avoids leaking sensitive learned data).
- [ ] **Distillation diff** — `GET /api/v1/soul/personalities/:id/distill/diff` compares the current distilled state against the last exported/tagged version. Returns a unified diff. Useful for understanding "what changed in what the AI sees" vs. "what changed in the config."
- [ ] **CLI distill** — `secureyeoman personality distill <name> [--include-memory] [--output file]`. Outputs the full composed prompt as a readable markdown document.
- [ ] **Transport use case** — Distilled personalities can be imported on another SecureYeoman instance. Skills and integrations referenced in the distilled doc that aren't available locally are listed as warnings. The system prompt is imported as-is; skills are matched by name/slug when available.

### 107-F: ATHI Threat Governance Framework

*Actors/Techniques/Harms/Impacts taxonomy for AI threat modeling, adapted from Daniel Miessler's ATHI framework. Positioned as an organizational governance tool — extends SecureYeoman's existing security audit capabilities with an AI-specific threat lens communicable to non-technical stakeholders.*

- [ ] **ATHI schema** — `packages/shared/src/types/security.ts`: `AthiActor` (nation_state, cybercriminal, insider, hacktivist, competitor, automated_agent), `AthiTechnique` (prompt_injection, data_poisoning, model_theft, supply_chain, social_engineering, adversarial_input, privilege_escalation), `AthiHarm` (data_breach, misinformation, service_disruption, privacy_violation, financial_loss, reputational_damage, safety_risk), `AthiImpact` (regulatory_penalty, operational_downtime, customer_trust_loss, ip_theft, legal_liability). `AthiThreatScenario`: `{ actor, techniques[], harms[], impacts[], likelihood, severity, mitigations[], status }`.
- [ ] **ATHI storage & migration** — `security.athi_scenarios` table. Fields: id, org_id (nullable, for multi-tenancy), title, description, actor, techniques (JSONB), harms (JSONB), impacts (JSONB), likelihood (1-5), severity (1-5), risk_score (computed: likelihood × severity), mitigations (JSONB), status (identified | assessed | mitigated | accepted | monitoring), created_by, created_at, updated_at.
- [ ] **ATHI manager** — `packages/core/src/security/athi-manager.ts`. CRUD + `getRiskMatrix()` (actor × technique heat map), `getTopRisks(limit)`, `getMitigationCoverage()` (% of scenarios with at least one mitigation), `generateExecutiveSummary()` (non-technical narrative for board-level reporting).
- [ ] **ATHI routes** — `GET/POST/PUT/DELETE /api/v1/security/athi/scenarios`. `GET /api/v1/security/athi/matrix` (risk heat map data). `GET /api/v1/security/athi/summary` (executive narrative). Auth: `security:read`/`security:write`.
- [ ] **AI-assisted scenario generation** — Skill/workflow template: given an organization description and its AI usage patterns, generate candidate ATHI threat scenarios. Uses the malware analysis and threat modeling security templates from 107-B as building blocks. Output reviewed by human before persisting.
- [ ] **Dashboard: ATHI tab** — New sub-tab in SecurityPage. Risk matrix visualization (likelihood × severity heat map). Scenario list with filters by actor/technique/status. Executive summary export (PDF/markdown). Mitigation coverage gauge.
- [ ] **CLI: `secureyeoman athi`** — Subcommands: `list`, `show <id>`, `create`, `matrix`, `summary`. `--format json|table|markdown` output modes.
- [ ] **Integration with existing security features** — ATHI scenarios can reference audit events (link scenario → observed events). Security Events tab cross-references ATHI scenarios when displaying events that match a known technique pattern. Alert rules can trigger on ATHI-mapped event patterns.

---

## Phase 109: Editor Improvements (Auto-Claude Style)

**Priority**: P3 — High value for power users. Demand-gated — implement incrementally based on user feedback.

*Previously Phase 100. Renumbered for sequential ordering. Includes "settings page split" from Phase XX.*

**Remaining IDE features** — Auto-Claude–style patterns (plan display, step-by-step approval, AI commit messages, context badges), multi-file editing (tabs, split panes), project explorer, integrated Git, command palette, inline AI completion (Copilot-style), multi-file search & replace, collaborative editing (Yjs CRDT), keybindings editor, layout persistence, responsive/mobile layout, training integration (export/annotation), and plugin/extension system.

- [ ] **Settings page split** — Extract `<AuditChainTab>`, `<SoulSystemTab>`, `<RateLimitingTab>` from the `SettingsPage.tsx` monolith into dedicated tab components.

### 109-B: Canvas Workspace Improvements

*Extends the Phase 100 canvas workspace (`/editor/advanced`) with power-user features. The 11-widget canvas is functional; these items address the gaps identified during QA.*

- [ ] **Inter-widget communication** — Event bus for widget-to-widget data flow. Primary use case: terminal output → auto-populate an editor widget with the result, or terminal error → create a chat widget pre-seeded with the error for AI diagnosis. `CanvasEventBus` singleton with `emit(event)` / `on(event, handler)` / `off()`. Widgets subscribe in `useEffect` and clean up on unmount.
- [ ] **Canvas keyboard shortcuts** — `Cmd/Ctrl+1..9` to focus widget by position order. `Cmd/Ctrl+W` to close focused widget. `Cmd/Ctrl+N` to open widget catalog. `Cmd/Ctrl+S` to force-save layout. `Escape` to exit fullscreen. Implemented via a `useCanvasShortcuts` hook attached to the canvas container.
- [ ] **Multiple saved layouts & export** — Replace single `canvas:workspace` localStorage key with a named-layout system. `canvas:layouts` stores `{ [name]: CanvasLayout }`. Layout switcher dropdown in the canvas toolbar. Export layout as JSON; import from file. Presets: "Dev" (terminal + editor + git), "Ops" (CI/CD + pipeline + training live), "Chat" (chat + agent world + task kanban).
- [ ] **Mission card embedding** — Extract the mission card renderer from `MissionControlPage` into a reusable `<MissionCardEmbed cardId={id} />` component. Wire it into `MissionCardNode` widget (currently a placeholder). Card shows objective, progress, and linked tasks.

---

## Phase 110: Inline Citations & Grounding

**Priority**: P3 — Trust layer. Groundedness enforcement is the anchor item; web grounding is a stretch goal. Requires the Phase 82 knowledge base retrieval layer (complete — see [knowledge-base.md](../guides/knowledge-base.md)).

*Previously Phase 101. Renumbered for sequential ordering.*

Inspired by Google Cloud Vertex AI Grounding and Azure Groundedness Detection.

- [ ] **Source-attributed responses** — When the AI uses retrieved knowledge base documents in a response, inject inline citations (`[1]`, `[2]`) and render a **Sources** section at the bottom of the response. Citation text includes: document title, page/chunk number, and a short excerpt. Stored as structured metadata on the conversation turn. Enabled per personality via `enableCitations: boolean`.
- [ ] **Groundedness enforcement** — Post-processing pass: before returning a response, check each factual claim against the retrieved chunks using an embedding similarity threshold. Claims with no supporting chunk above threshold are flagged as `[unverified]` inline. Configurable mode: `annotate_only`, `block_unverified`, or `strip_unverified`.
- [ ] **Web grounding** — Ground AI responses in live web search results, not just the local knowledge base. When web grounding is enabled and the query requires current information, perform a search (via existing web-search MCP tool), retrieve top results, and include them as retrieved context with citations.
- [ ] **Grounding confidence score** — Per-response aggregate grounding score: what fraction of claims are supported by retrieved sources above threshold? Stored on the conversation turn. Low-grounding responses flagged in the Audit Log. Rolling average per personality surfaced in the Analytics tab as a "Response Trustworthiness" metric.
- [ ] **Citation feedback** — Users can click a citation to see the full source chunk in a side drawer. They can mark citations as "not relevant" — negative feedback stored as a weak signal for the knowledge base quality scoring system.
- [ ] **Document provenance scoring** — 8-dimension quality evaluation for knowledge base documents, inspired by [Substrate](https://github.com/danielmiessler/Substrate)'s library science methodology. Each `brain.documents` row gains a `source_quality` JSONB column scoring: Authority, Currency, Objectivity, Accuracy, Methodology, Coverage, Reliability, and Provenance (each 0.0–1.0). Composite `trust_score` (weighted average) used to boost/demote chunks during RAG retrieval in `BrainManager.recall()`. Auto-populated where possible (e.g., `.gov` URLs score high on Authority; age of document drives Currency). Manual override via document detail UI. Documents with no provenance data default to a neutral score (0.5). Trust scores surfaced in the Knowledge Base → Health panel and in citation footnotes when Phase 110 citations are enabled.

---

## Phase 111: Departmental Risk Register & Risk Posture Tracking

**Priority**: P2 — Risk governance. The existing system-wide risk assessment engine (Phase 53) produces composite 0–100 scores across 5 weighted domains but has no department dimension, no persistent risk register with owners/mitigations/due dates, no per-department risk appetite thresholds, and no trending or cross-department comparison. This phase adds all of those — tracking both risk **inputs** (what feeds risk) and risk **outputs** (what risk produces).

Departments are first-class organizational units — they define **who owns what** within the org hierarchy. The dashboard surfaces two distinct views per department: an **Intent view** (what the department aims to achieve — mission, objectives, risk appetite strategy, mitigation plans, and compliance targets) and a **Risk view** (the department's current exposure — scores, register entries, heatmaps, and trends). Intent and risk are deliberately separated so stakeholders can reason about *goals* independently from *threats*, while cross-referencing between them when needed (e.g., "is our mitigation plan reducing risk toward our appetite target?").

Six sub-phases: data model → shared types & backend → integration → reports & outputs → CLI → dashboard.

### 111-A: Data Model ✅

*Migration `003_departmental_risk.sql` — 3 new tables plus 2 ALTER statements. All tables in the `risk` schema. Done — see Changelog [2026.3.2].*

- [x] **`risk.departments` table** — Organizational units with hierarchy, intent, and risk appetite. Columns: `id` (UUID PK), `name` (VARCHAR 200, UNIQUE per tenant), `description` (TEXT), `mission` (TEXT, nullable — department's stated purpose/charter, displayed in the Intent view), `objectives` (JSONB array, nullable — `[{ title, description, targetDate?, status: 'active'|'achieved'|'deferred' }]`, tracked goals that the department is working toward), `parent_id` (UUID FK self-referential, nullable — supports org tree), `team_id` (UUID FK → `agents.teams`, nullable — links department to a team for ownership resolution), `risk_appetite` (JSONB — per-domain thresholds: `{ infrastructure: 40, application: 35, governance: 50, data: 30, operational: 45 }`, each 0–100), `compliance_targets` (JSONB, nullable — `[{ framework: 'ISO27001'|'NIST'|'SOC2'|..., scope, targetDate? }]`, regulatory/compliance goals), `metadata` (JSONB, extensible), `tenant_id` (UUID FK), `created_at`, `updated_at`. Indexes: `idx_departments_parent_id`, `idx_departments_tenant_id`, `idx_departments_team_id`.
  - **Inputs**: department name, description, mission statement, objectives, parent department (hierarchy), linked team, per-domain risk appetite thresholds, compliance targets.
  - **Outputs**: queryable org tree with intent data (mission/objectives/compliance targets) for the Intent view; appetite thresholds consumed by alert integration (111-C) and heatmap (111-D) for the Risk view.

- [x] **`risk.register_entries` table** — Persistent risk register with ownership and mitigation tracking. Columns: `id` (UUID PK), `department_id` (UUID FK → `risk.departments`), `title` (VARCHAR 300), `description` (TEXT), `category` (VARCHAR 50 — `infrastructure`, `application`, `governance`, `data`, `operational`), `severity` (VARCHAR 20 — `critical`, `high`, `medium`, `low`, `info`), `likelihood` (INTEGER 1–5), `impact` (INTEGER 1–5), `risk_score` (INTEGER, computed: likelihood × impact, stored for indexing), `owner` (VARCHAR 200 — person or team name), `mitigations` (JSONB array — `[{ description, status: 'planned'|'in_progress'|'implemented'|'verified', dueDate, completedAt }]`), `status` (VARCHAR 20 — `open`, `mitigating`, `accepted`, `closed`, `transferred`), `due_date` (TIMESTAMPTZ, nullable), `source` (VARCHAR 50 — `manual`, `assessment`, `enforcement`, `external` — how the entry was created), `source_ref` (VARCHAR 200, nullable — links to originating assessment/finding/enforcement ID), `evidence_refs` (JSONB array — links to audit log entries, assessment IDs, external finding IDs), `tenant_id` (UUID FK), `created_by` (VARCHAR 200), `created_at`, `updated_at`, `closed_at` (TIMESTAMPTZ, nullable). Indexes: `idx_register_department_id`, `idx_register_status`, `idx_register_category`, `idx_register_risk_score DESC`, `idx_register_due_date`, `idx_register_tenant_id`.
  - **Inputs**: risk title, description, category/domain, severity, likelihood, impact, owner, mitigations with status and due dates, evidence references, source attribution (manual entry vs. auto-created from enforcement).
  - **Outputs**: queryable risk register for department scorecards, overdue risk alerts, mitigation progress tracking, GRC-compatible CSV export.

- [x] **`risk.department_scores` table** — Historical score snapshots for trending. Columns: `id` (UUID PK), `department_id` (UUID FK → `risk.departments`), `scored_at` (TIMESTAMPTZ), `overall_score` (NUMERIC 5,2 — composite 0–100), `domain_scores` (JSONB — `{ infrastructure: N, application: N, governance: N, data: N, operational: N }`), `open_risks` (INTEGER — count of open register entries at snapshot time), `overdue_risks` (INTEGER — count of open entries past due_date), `appetite_breaches` (JSONB — `[{ domain, score, threshold }]` for any domain exceeding appetite), `assessment_id` (UUID, nullable — links to the assessment that triggered this snapshot), `tenant_id` (UUID FK), `created_at`. Indexes: `idx_dept_scores_department_scored` (department_id, scored_at DESC), `idx_dept_scores_tenant_id`.
  - **Inputs**: triggered by assessment completion or manual snapshot; captures point-in-time scores, open/overdue risk counts, and appetite breach details.
  - **Outputs**: time-series data for trend charts, week-over-week/month-over-month delta calculations, historical appetite breach log.

- [x] **ALTER `risk.assessments`** — Add `department_id` (UUID FK → `risk.departments`, nullable, DEFAULT NULL). Existing rows unaffected. New index: `idx_assessments_department_id`. When set, the assessment's composite score is attributed to that department and triggers a `risk.department_scores` snapshot on completion.
  - **Inputs**: optional department_id on new assessments (backward-compatible — null = system-wide).
  - **Outputs**: department-scoped assessment queries, automatic score snapshot creation.

- [x] **ALTER `risk.external_findings`** — Add `department_id` (UUID FK → `risk.departments`, nullable, DEFAULT NULL). New index: `idx_external_findings_department_id`. Allows imported vulnerability scan findings to be attributed to a department.
  - **Inputs**: optional department_id on external finding import.
  - **Outputs**: department-scoped finding queries, per-department vulnerability counts in scorecards.

### 111-B: Shared Types & Backend ✅

*Types, storage, manager, and routes. ~20 endpoints. Done — see Changelog [2026.3.2].*

- [x] **Shared types** — `packages/shared/src/types/departmental-risk.ts`. Types: `Department`, `DepartmentCreate`, `DepartmentUpdate`, `DepartmentObjective`, `ComplianceTarget`, `RegisterEntry`, `RegisterEntryCreate`, `RegisterEntryUpdate`, `DepartmentScore`, `DepartmentScorecard` (composite: department + latest scores + open/overdue counts + appetite status), `DepartmentIntentSummary` (composite: mission + objectives + compliance targets + appetite strategy — the Intent view data), `RiskHeatmapCell` (department × domain matrix), `RiskTrendPoint` (time-series datum), `DepartmentExecutiveSummary`, `RiskAppetite` (per-domain thresholds object), `MitigationItem`, `RegisterEntryStatus`, `RegisterEntrySource`, `RiskCategory`. Zod schemas for all create/update inputs. Export from `packages/shared/src/index.ts`.
  - **Inputs**: type definitions consumed by backend validation and frontend forms.
  - **Outputs**: shared contract between API, CLI, and dashboard. Intent and risk types are deliberately separate so each view can be loaded independently.

- [x] **`DepartmentRiskStorage`** — `packages/core/src/risk-assessment/department-risk-storage.ts`. Methods: `createDepartment`, `getDepartment`, `updateDepartment`, `deleteDepartment`, `listDepartments` (with `parentId` filter for tree queries), `getDepartmentTree` (recursive CTE returning nested structure), `createRegisterEntry`, `getRegisterEntry`, `updateRegisterEntry`, `deleteRegisterEntry`, `listRegisterEntries` (filters: departmentId, status, category, severity, overdue, owner), `getRegisterStats` (counts by status/severity), `recordDepartmentScore`, `listDepartmentScores` (departmentId + date range), `getLatestScores` (all departments, latest snapshot each), `getAppetiteBreaches` (departments where latest score exceeds appetite in any domain).
  - **Inputs**: CRUD parameters, filter/pagination options, date ranges for trending queries.
  - **Outputs**: department trees, register entry lists, score time-series, appetite breach alerts, aggregate stats.

- [x] **`DepartmentRiskManager`** — `packages/core/src/risk-assessment/department-risk-manager.ts`. Orchestration layer over storage. Methods: `createDepartment`, `updateDepartment`, `deleteDepartment` (cascade check — reject if register entries exist, or `force: true` to cascade), `listDepartments`, `getDepartmentTree`, `createRegisterEntry`, `updateRegisterEntry`, `closeRegisterEntry` (sets status=closed, closed_at=now), `listRegisterEntries`, `snapshotDepartmentScore` (queries current assessment scores for department, counts open/overdue register entries, computes appetite breaches, writes to `department_scores`), `snapshotAllDepartments` (batch snapshot after a system-wide assessment), `getDepartmentScorecard` (assembles `DepartmentScorecard` composite), `getHeatmap` (department × domain matrix — one row per department, one column per domain, cell = latest score with appetite-breach flag), `getTrend` (department score history over configurable window, default 90 days), `getExecutiveSummary` (cross-department narrative: highest-risk department, most-improved, most-deteriorated, system-wide appetite compliance %).
  - **Inputs**: department/entry CRUD, snapshot triggers, date ranges, heatmap/trend/summary queries.
  - **Outputs**: scorecards, heatmaps, trend data, executive summaries, appetite breach lists — consumed by routes, CLI, dashboard, and reports (111-D).

- [x] **`department-risk-routes.ts`** — `packages/core/src/risk-assessment/department-risk-routes.ts`. ~22 endpoints registered as a Fastify plugin. **Department CRUD**: `GET /api/v1/risk/departments` (list, `?parentId=` for subtree), `GET /api/v1/risk/departments/tree` (full hierarchy), `POST /api/v1/risk/departments`, `GET /api/v1/risk/departments/:id`, `PUT /api/v1/risk/departments/:id`, `DELETE /api/v1/risk/departments/:id`. **Intent view**: `GET /api/v1/risk/departments/:id/intent` (returns `DepartmentIntentSummary` — mission, objectives, compliance targets, appetite strategy), `PUT /api/v1/risk/departments/:id/objectives` (update objectives array), `PUT /api/v1/risk/departments/:id/compliance-targets` (update compliance targets). **Register CRUD** (risk view): `GET /api/v1/risk/departments/:id/register` (list entries for department), `POST /api/v1/risk/departments/:id/register`, `GET /api/v1/risk/register/:entryId`, `PUT /api/v1/risk/register/:entryId`, `DELETE /api/v1/risk/register/:entryId`, `POST /api/v1/risk/register/:entryId/close`. **Scores & Analytics** (risk view): `POST /api/v1/risk/departments/:id/snapshot` (trigger manual snapshot), `GET /api/v1/risk/departments/:id/scores` (history, `?from=&to=`), `GET /api/v1/risk/departments/:id/scorecard`, `GET /api/v1/risk/heatmap`, `GET /api/v1/risk/trend` (`?departmentId=&days=`), `GET /api/v1/risk/summary` (executive summary), `GET /api/v1/risk/appetite/breaches`. **Reports**: `GET /api/v1/risk/reports/department/:id` (`?format=json|html|md|csv`), `GET /api/v1/risk/reports/executive` (`?format=json|html|md`), `GET /api/v1/risk/reports/register` (`?format=json|csv`).
  - **Inputs**: HTTP requests with path params, query filters, JSON bodies validated against Zod schemas.
  - **Outputs**: JSON responses (lists, scorecards, heatmaps, trends, summaries), HTML/Markdown/CSV report downloads. Intent and risk endpoints are separate so the dashboard can load each view independently.

- [x] **Wiring** — `secureyeoman.ts`: add `departmentRiskStorage`, `departmentRiskManager` fields; initialize in `initialize()` after pool is ready; expose via `getDepartmentRiskManager()`. `server.ts`: register `departmentRiskRoutes` plugin under `/api/v1/risk`. `auth-middleware.ts`: add route entries under `risk:read`/`risk:write` permissions (department CRUD = write, register CRUD = write, queries/reports = read, snapshots = write). *(Done — see Changelog [2026.3.2])*
  - **Inputs**: initialization dependencies (pool, config).
  - **Outputs**: fully wired manager accessible from routes, CLI, and integration hooks.

### 111-C: Integration

*Connects departmental risk to existing subsystems: alerts, metrics, enforcement log, and assessments.*

- [x] **Alert integration — appetite breach** — When `snapshotDepartmentScore` detects any domain score exceeding the department's risk appetite threshold, build a synthetic `AlertManager` snapshot: `{ risk: { appetite_breach: { department, domain, score, threshold, delta } } }` and call `alertManager.evaluate()`. Operators can define alert rules like "fire when risk.appetite_breach.delta > 10". Uses the fire-and-forget pattern from Phase 104 `emitJobCompletion`. *(Done — see Changelog [2026.3.2])*
  - **Inputs**: department score snapshot with appetite comparison.
  - **Outputs**: alert rule evaluation → Slack/PagerDuty/OpsGenie/webhook/ntfy notifications when appetite is breached.

- [ ] **MetricsSnapshot extension** — Add `departmentalRisk?: { departmentCount: number, openRegisterEntries: number, overdueEntries: number, appetiteBreaches: number }` to `MetricsSnapshot` in shared types. Populated during the 5-second metrics broadcast cycle by querying `DepartmentRiskManager.getRegisterStats()` (cached, refreshed every 30s). Surfaces in Prometheus `/metrics` endpoint and Grafana dashboards.
  - **Inputs**: periodic metrics collection from department risk manager.
  - **Outputs**: Prometheus gauges (`secureyeoman_risk_departments_total`, `secureyeoman_risk_register_open`, `secureyeoman_risk_register_overdue`, `secureyeoman_risk_appetite_breaches`), Grafana panels.

- [ ] **Enforcement log attribution** — When the enforcement engine logs a boundary violation or policy breach (existing `security.enforcement_log`), check if the triggering personality or user is associated with a department (via team membership). If so, auto-create a `risk.register_entries` row with `source: 'enforcement'`, `source_ref: enforcement_log_id`, `category` mapped from the violation type, `severity` mapped from enforcement severity. Deduplication: if an open register entry with the same `source_ref` already exists, skip. This turns enforcement events into trackable risks with owners and mitigations.
  - **Inputs**: enforcement log events with personality/user context.
  - **Outputs**: auto-created register entries attributed to the responsible department; links enforcement → risk register for audit trail.

- [ ] **Backward-compatible `department_id` on assessments** — The existing `POST /api/v1/risk/assessments` route accepts an optional `department_id` in the request body. When provided, the assessment is scoped to that department and on completion triggers `snapshotDepartmentScore`. Existing assessments without `department_id` continue to work as system-wide assessments. The risk assessment engine's scoring logic is unchanged — only attribution is added.
  - **Inputs**: optional `department_id` on assessment creation.
  - **Outputs**: department-scoped assessments, automatic score snapshots on completion.

### 111-D: Reports & Outputs

*`DepartmentRiskReportGenerator` — produces formatted reports from manager data. Consumed by routes (111-B) and CLI (111-E).*

- [ ] **`DepartmentRiskReportGenerator`** — `packages/core/src/risk/department-risk-report-generator.ts`. Stateless class, takes `DepartmentRiskManager` as dependency. Methods:
  - `generateDepartmentScorecard(departmentId, format: 'json'|'html'|'md'|'csv')` — Single department report: current scores by domain, appetite compliance status (pass/breach per domain), open/overdue register entry summary, top 5 highest-risk entries, 90-day trend sparkline data, mitigation completion rate.
  - `generateExecutiveSummary(format: 'json'|'html'|'md')` — Cross-department summary: highest-risk department, most-improved (largest score decrease over 30 days), most-deteriorated, system-wide appetite compliance percentage, total open/overdue register entries, risk distribution by category (pie chart data).
  - `generateRegisterReport(filters, format: 'json'|'csv')` — Filtered register export: all open entries, optionally filtered by department/category/severity/owner. CSV format is GRC-tool compatible (columns: ID, Department, Title, Category, Severity, Likelihood, Impact, Risk Score, Owner, Status, Due Date, Mitigations, Created, Updated).
  - `generateHeatmapHtml(heatmapData)` — Self-contained HTML document with a department × domain risk matrix. Cells colored green/yellow/orange/red based on score thresholds. Appetite threshold lines overlaid. Suitable for embedding in emails or exporting as a standalone artifact.
  - **Inputs**: department IDs, filters, format selection, heatmap data from manager.
  - **Outputs**: JSON (structured data for API consumers), HTML (standalone reports for email/embedding), Markdown (for documentation/wiki), CSV (GRC-tool import — ISO 27001/NIST compatible columns).

### 111-E: CLI ✅

*`secureyeoman risk` command. Alias: `rsk`. Done — see Changelog [2026.3.2].*

- [x] **`packages/core/src/cli/commands/risk.ts`** — Subcommands:
  - `risk departments` — List all departments (tree view with indentation for hierarchy). `--format table|json|tree` (default: tree).
  - `risk departments create <name>` — Interactive: prompts for description, parent department (select from existing), team link (select from existing teams), and risk appetite thresholds per domain.
  - `risk register [--department <name>] [--status open|mitigating|accepted|closed] [--severity critical|high|medium|low] [--overdue]` — List register entries with filters. Default: all open entries across all departments. `--format table|json|csv`.
  - `risk register add <department>` — Interactive: prompts for title, description, category, severity, likelihood, impact, owner, and optional due date.
  - `risk heatmap [--format table|json]` — Department × domain risk matrix. Table format renders colored cells (ANSI red/yellow/green) in the terminal. Appetite breaches marked with `!`.
  - `risk summary` — Executive summary text output. Highest-risk department, most improved, appetite compliance %, total open/overdue counts.
  - `risk report <department> [--format md|html|csv|json] [--output file]` — Generate and save/print a department scorecard report.
  - Register in `cli.ts` with alias `rsk`.
  - **Inputs**: CLI arguments and interactive prompts.
  - **Outputs**: formatted terminal output (tables, trees, ANSI-colored heatmaps), file exports (MD/HTML/CSV/JSON).

### 111-F: Dashboard 🔄

*New "Departments" sub-tab in the existing `RiskAssessmentTab`. Department selector dropdown at the top; below it, two distinct view tabs — **Intent** and **Risk** — so stakeholders can reason about goals independently from threats. Lazy-loaded components. Basic DepartmentsSection with Intent/Risk toggle, scorecard, heatmap, and API functions done (see Changelog [2026.3.2]). Detailed panel items below remain open.*

#### Intent View — "What does this department aim to achieve?"

- [ ] **Mission & objectives panel** — Displays the department's mission statement (editable rich text), objectives list (title, description, target date, status badge — active/achieved/deferred), and compliance targets (framework name, scope, target date). "Edit" button opens inline editing. Objectives can be reordered by drag-and-drop.
  - **Inputs**: `GET /api/v1/risk/departments/:id/intent` API response.
  - **Outputs**: rendered mission statement, objectives progress list, compliance target checklist.

- [ ] **Appetite strategy panel** — Visual representation of the department's risk appetite thresholds: 5-domain radar chart (one axis per domain, 0–100) with the appetite boundary drawn as a filled polygon and the current score overlaid as a second polygon. At a glance: "where are we willing to accept risk, and where are we today?" Appetite thresholds editable via sliders (same as department form modal). Preset buttons: Conservative (30), Moderate (50), Aggressive (70).
  - **Inputs**: department risk appetite from `GET /api/v1/risk/departments/:id`, current scores from scorecard.
  - **Outputs**: radar chart comparing appetite vs. current exposure; inline appetite editing.

- [ ] **Mitigation plans panel** — Aggregated view of all in-progress mitigations across the department's register entries. Grouped by status (planned → in progress → implemented → verified). Progress bar showing mitigation completion rate. Overdue mitigations highlighted. Links back to the originating register entry in the Risk view.
  - **Inputs**: mitigation data extracted from `GET /api/v1/risk/departments/:id/register?status=open,mitigating`.
  - **Outputs**: mitigation progress dashboard with status grouping, completion rate, and overdue highlighting.

#### Risk View — "What is this department's current exposure?"

- [ ] **Department scorecard panel** — Shows the selected department's current scores by domain (bar chart), appetite thresholds overlaid as reference lines, open/overdue register entry counts, and a 90-day trend sparkline. Appetite breaches highlighted in red.
  - **Inputs**: `GET /api/v1/risk/departments/:id/scorecard` API response.
  - **Outputs**: visual scorecard with score gauges, appetite threshold indicators, and trend sparkline.

- [ ] **Risk register panel** — Sortable/filterable table of register entries for the selected department. Columns: Title, Category, Severity, Risk Score (likelihood × impact), Owner, Status, Due Date, Mitigations (count + progress bar). Click to expand: full description, mitigation details, evidence links. Inline status update (dropdown). "Add Risk" button opens a form modal.
  - **Inputs**: `GET /api/v1/risk/departments/:id/register` with filter query params.
  - **Outputs**: interactive register table with inline editing, filtering, sorting, and drill-down.

- [ ] **Trend chart** — Recharts `LineChart` showing score history over time for one or more departments. Multi-department comparison mode: select up to 5 departments to overlay. Toggleable domain breakdown (show individual domain scores vs. composite only). Time range selector: 30d / 90d / 180d / 1y.
  - **Inputs**: `GET /api/v1/risk/trend?departmentId=&days=` API response (one or more series).
  - **Outputs**: multi-series line chart with domain breakdown toggle and time range controls.

#### Cross-Department Views (shared across both perspectives)

- [ ] **Heatmap grid** — Cross-department overview: rows = departments, columns = 5 risk domains, cells = score (colored green/yellow/orange/red). Cells exceeding appetite threshold get a warning icon overlay. Click a cell to navigate to that department's Risk view. Responsive: collapses to a card-per-department layout on narrow screens.
  - **Inputs**: `GET /api/v1/risk/heatmap` API response.
  - **Outputs**: interactive color-coded matrix with appetite breach indicators and navigation.

- [ ] **Executive summary panel** — Rendered markdown/HTML of the executive summary. Key metrics cards at top: highest-risk department (with score), most-improved (with delta), appetite compliance % (gauge), total open risks, total overdue risks. Suitable for screenshot or PDF export. "Export" dropdown: Markdown, HTML, CSV (register only).
  - **Inputs**: `GET /api/v1/risk/summary` API response.
  - **Outputs**: executive summary display with key metric cards, formatted narrative, and export options.

- [ ] **Department form modal** — Create/edit department modal. Two sections: **Organization** (name, description, mission, objectives, parent department via searchable dropdown, linked team via dropdown) and **Risk Governance** (risk appetite sliders per domain 0–100 with preset buttons: Conservative = 30, Moderate = 50, Aggressive = 70; compliance targets). Validation: name required, appetite values in range.
  - **Inputs**: user form input, department tree and team list for selectors.
  - **Outputs**: `POST /PUT /api/v1/risk/departments` API calls, optimistic UI update.

---

## Phase 112: Multi-Account AI Provider Keys & Per-Account Cost Tracking

**Priority**: P2 — Cost governance. Today each provider has a single API key (stored as an env var like `ANTHROPIC_API_KEY` via `SecretsManager`). Personalities reference provider + model but not *which account*. Organizations that use separate billing accounts per team, project, or cost center have no way to route personality A through one API key and personality B through another. This phase introduces **provider accounts** — multiple named API keys per provider with key validation on connect, account metadata (email/username), per-account cost tracking, and personality-level account selection.

Four sub-phases: data model & backend → key validation & account discovery → personality wiring & cost tracking → dashboard & CLI.

### 112-A: Data Model & Backend

*Migration `004_provider_accounts.sql` + new storage/manager/routes.*

- [ ] **`ai.provider_accounts` table** — Multiple named accounts per provider. Columns: `id` (UUID PK), `provider` (VARCHAR 50 — `anthropic`, `openai`, `gemini`, `deepseek`, `mistral`, `grok`, `groq`, `openrouter`, `ollama`, `lmstudio`, `localai`, `opencode`, `letta`), `label` (VARCHAR 200 — user-chosen name, e.g. "Team Alpha — OpenAI", "Personal — Anthropic"), `secret_name` (VARCHAR 200 — the `SecretsManager` key name where the actual API key is stored, e.g. `OPENAI_API_KEY_TEAM_ALPHA`), `is_default` (BOOLEAN DEFAULT false — one default per provider per tenant, enforced by partial unique index), `account_info` (JSONB, nullable — `{ email?, username?, orgId?, orgName?, plan?, rateLimit? }` populated by key validation), `status` (VARCHAR 20 — `active`, `invalid`, `expired`, `rate_limited`), `last_validated_at` (TIMESTAMPTZ, nullable), `base_url` (VARCHAR 500, nullable — custom endpoint override for this account), `tenant_id` (UUID FK), `created_by` (VARCHAR 200), `created_at`, `updated_at`. Indexes: `idx_provider_accounts_provider` (provider, tenant_id), `idx_provider_accounts_default` (provider, tenant_id) WHERE `is_default = true` (unique partial — enforces one default per provider per tenant).
- [ ] **`ai.account_cost_records` table** — Per-account cost tracking. Columns: `id` (UUID PK), `account_id` (UUID FK → `ai.provider_accounts`), `personality_id` (UUID FK → `soul.personalities`, nullable — null for non-personality API calls), `model` (VARCHAR 100), `input_tokens` (INTEGER), `output_tokens` (INTEGER), `total_tokens` (INTEGER), `cost_usd` (NUMERIC 10,6 — calculated from token counts × model pricing), `request_id` (VARCHAR 200, nullable — provider-side request ID for reconciliation), `recorded_at` (TIMESTAMPTZ DEFAULT NOW()), `tenant_id` (UUID FK). Indexes: `idx_cost_records_account_recorded` (account_id, recorded_at DESC), `idx_cost_records_personality` (personality_id, recorded_at DESC), `idx_cost_records_tenant_id`.
- [ ] **`ProviderAccountStorage`** — `packages/core/src/ai/provider-account-storage.ts`. Methods: `createAccount`, `getAccount`, `updateAccount`, `deleteAccount`, `listAccounts` (filters: provider, tenant), `getDefaultAccount(provider)`, `setDefaultAccount(accountId)` (unsets previous default for that provider+tenant), `recordCost`, `getCostSummary` (filters: accountId, personalityId, dateRange — returns aggregate totals), `getCostBreakdown` (grouped by model or personality or day), `getAccountsByProvider(provider)`.
- [ ] **`ProviderAccountManager`** — `packages/core/src/ai/provider-account-manager.ts`. Orchestration layer. Methods: `addAccount(provider, label, apiKey, baseUrl?)` (stores key via `SecretsManager`, creates DB row, triggers validation), `removeAccount(accountId)` (deletes DB row + secret, prevents deleting the sole account for a provider that has personalities referencing it), `setDefault(accountId)`, `listAccounts`, `getAccountForPersonality(personalityId, provider)` (returns the personality's assigned account, or the provider default, or the sole account — resolution chain), `validateAccount(accountId)` (tests key, updates `account_info` + `status` + `last_validated_at`), `validateAllAccounts()` (batch validation, e.g. on startup or schedule), `getCostDashboard(filters)` (assembles cost summary + breakdown for dashboard consumption), `resolveApiKey(provider, personalityId?)` (the key resolution method called by `AIClient` — returns the actual API key string from SecretsManager for the resolved account).
- [ ] **`provider-account-routes.ts`** — `packages/core/src/ai/provider-account-routes.ts`. Endpoints: `GET /api/v1/ai/accounts` (list all, `?provider=` filter), `POST /api/v1/ai/accounts` (add account — body: `{ provider, label, apiKey, baseUrl? }`), `GET /api/v1/ai/accounts/:id`, `PUT /api/v1/ai/accounts/:id` (update label, base URL), `DELETE /api/v1/ai/accounts/:id`, `POST /api/v1/ai/accounts/:id/set-default`, `POST /api/v1/ai/accounts/:id/validate` (trigger key test), `POST /api/v1/ai/accounts/:id/rotate-key` (replace API key without changing account identity — new key validated before old one is removed), `GET /api/v1/ai/accounts/:id/costs` (`?from=&to=&groupBy=model|personality|day`), `GET /api/v1/ai/costs/summary` (cross-account cost overview, `?from=&to=`).
- [ ] **Wiring** — `secureyeoman.ts`: add `providerAccountStorage`, `providerAccountManager` fields; initialize after pool + secretsManager ready; expose `getProviderAccountManager()`. `server.ts`: register `providerAccountRoutes`. `auth-middleware.ts`: routes under `ai:read`/`ai:write` (account CRUD + rotate = write, list + costs = read, validate = write).
- [ ] **Shared types** — `packages/shared/src/types/provider-accounts.ts`: `ProviderAccount`, `ProviderAccountCreate`, `ProviderAccountUpdate`, `AccountInfo`, `AccountStatus`, `CostRecord`, `CostSummary`, `CostBreakdown`, `CostBreakdownGroupBy`. Zod schemas. Export from index.

### 112-B: Key Validation & Account Discovery

*When a user connects an API key, validate it and pull back account metadata. Provider-specific validation logic.*

- [ ] **`ProviderKeyValidator`** — `packages/core/src/ai/provider-key-validator.ts`. Per-provider validation that tests the key and retrieves account info. Method: `validate(provider, apiKey, baseUrl?): Promise<{ valid: boolean, error?: string, accountInfo?: AccountInfo }>`. Provider-specific logic:
  - **Anthropic** — `GET /v1/messages` with minimal request or `GET /v1/models` (when available). Extract: org name from response headers (`anthropic-organization`), rate limits from headers.
  - **OpenAI** — `GET /v1/models` (lightweight, returns model list confirming key works). `GET /v1/organization/users/me` or `/v1/me` if available. Extract: org ID, org name, user email from response.
  - **Google Gemini** — `GET /v1beta/models` with API key param. Extract: available models (confirms key scope).
  - **DeepSeek / Mistral / Grok / Groq** — `GET /v1/models` (OpenAI-compatible). Extract: available model list.
  - **OpenRouter** — `GET /api/v1/auth/key` (returns key metadata: label, usage, rate limit, credits remaining). Extract: credits, rate limit, label.
  - **Local providers (Ollama, LM Studio, LocalAI)** — `GET /api/tags` or `GET /v1/models` health check. No API key needed; validates endpoint reachability. Extract: available models, version.
  - Timeout: 10s per validation. Non-blocking — runs in background, updates `provider_accounts.status` + `account_info` + `last_validated_at` on completion.
- [ ] **Scheduled re-validation** — Optional background job (configurable interval, default: daily) that calls `validateAllAccounts()`. Marks accounts as `invalid` if the key no longer works (revoked, expired). Emits alert via `AlertManager` when an account transitions from `active` to `invalid` — synthetic snapshot: `{ ai: { account_invalid: { provider, label, error } } }`.
- [ ] **Backward compatibility & existing entry points** — On first startup after migration, auto-import existing single-key env vars (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, etc.) as provider accounts with `label: 'Default'`, `is_default: true`. Existing personalities with no account assignment continue to resolve to the default account. Zero-config upgrade path — existing installs work identically until the user adds a second key. Three existing key-entry surfaces are preserved and upgraded: (1) the **dashboard** `ProviderKeysSettings` component (currently single-key per provider — becomes the multi-account UI in 112-D); (2) the **`secureyeoman init` wizard** Step 2 "API Keys — Connect AI providers" (adds the initial key as the default account); (3) the **`/api/v1/secrets` REST API** (remains as the low-level secret store — account management is layered above it). The new **`secureyeoman provider` CLI** (112-D) provides full post-setup account management from the terminal, filling the gap where no CLI existed for adding/rotating/listing provider keys after initial setup.

### 112-C: Personality Wiring & Cost Tracking

*Personalities gain an optional account reference. AIClient resolves the correct key. Every API call logs cost.*

- [ ] **Personality schema update** — Add `defaultAccount` field to `DefaultModelSchema` in `packages/shared/src/types/soul.ts`: `{ provider: string, model: string, accountId?: string }`. The `accountId` is optional — when omitted, the provider's default account is used. Personality fallbacks also gain optional `accountId`. No migration needed — `defaultModel` is already JSONB on `soul.personalities`.
- [ ] **AIClient key resolution** — Modify `packages/core/src/ai/client.ts` to call `providerAccountManager.resolveApiKey(provider, personalityId)` instead of directly reading `process.env[apiKeyEnv]`. Resolution chain: (1) personality's explicit `accountId` → (2) provider default for tenant → (3) sole account for provider → (4) legacy env var fallback (`process.env[apiKeyEnv]` for backward compat). The resolved `accountId` is attached to the request context for cost recording.
- [ ] **Cost recording hook** — After every AI API call completes (success or failure), `AIClient` calls `providerAccountManager.recordCost({ accountId, personalityId, model, inputTokens, outputTokens, totalTokens, costUsd, requestId })`. Cost calculation uses the existing `CostCalculator` pricing tables. Fire-and-forget — cost recording failures are logged but never block the response.
- [ ] **Cost aggregation queries** — `getCostDashboard` supports: per-account totals (daily/weekly/monthly), per-personality totals, per-model breakdown, cross-account comparison. Powers both the dashboard cost panels and the future "Cost budget alerts" roadmap item (LLM Provider Improvements section).

### 112-D: Dashboard & CLI

*ProviderKeysSettings redesign, PersonalityEditor account selector, cost dashboard, CLI commands.*

- [ ] **ProviderKeysSettings redesign** — Replace the current single-key-per-provider UI (`packages/dashboard/src/components/ProviderKeysSettings.tsx`) with a multi-account view. Each provider section expands to show a list of accounts (label, status badge, account info, default star icon). "Add Account" button per provider. Per-account actions: set default, validate (with spinner + result), rotate key, delete. New account form: label input, API key input (masked), optional base URL. On save, key is validated automatically — success shows account info (email/org/plan), failure shows error with retry option.
- [ ] **PersonalityEditor account selector** — In the Model section of `PersonalityEditor.tsx`, add an "Account" dropdown below the provider/model selectors. Behavior: (1) when the user selects a provider that has only one account, the dropdown is hidden (implicit); (2) when the provider has multiple accounts, the dropdown appears showing all accounts for that provider with the default pre-selected and marked with a "(Default)" suffix; (3) the user can switch to any account; (4) the selection is saved as `defaultModel.accountId`. The dropdown shows: account label, status indicator (green dot = active, red = invalid), and account info (email/org) as secondary text.
- [ ] **Cost dashboard panel** — New "Costs" sub-tab in the existing Settings → General or a dedicated section in the Developer page. Components:
  - **Cost overview cards** — Total spend (this month), daily average, top provider by spend, top personality by spend.
  - **Cost by account table** — Rows: each provider account. Columns: Provider, Account Label, This Month, Last Month, Delta %, Total All-Time. Sortable.
  - **Cost by personality chart** — Recharts `BarChart` — top 10 personalities by spend in the selected period. Period selector: 7d / 30d / 90d.
  - **Cost trend line** — Recharts `LineChart` — daily spend over time, one line per account (toggleable). Optional: overlay budget lines if cost budget alerts are configured (future Phase — LLM Provider Improvements).
  - **Export** — CSV download of cost records for accounting/chargeback.
- [ ] **CLI commands** — `secureyeoman provider` (alias: `prov`). Subcommands:
  - `provider list [--provider <name>]` — List all accounts, grouped by provider. Shows: label, status, default flag, account info (email/org).
  - `provider add <provider>` — Interactive: prompts for label, API key (masked input), optional base URL. Validates key on save, displays account info on success.
  - `provider validate [--all | --provider <name> | --account <label>]` — Trigger key validation. Shows result per account.
  - `provider set-default <provider> <label>` — Set the default account for a provider.
  - `provider costs [--provider <name>] [--personality <name>] [--from <date>] [--to <date>] [--format table|json|csv]` — Cost report.
  - `provider rotate <provider> <label>` — Interactive: prompts for new API key, validates, then replaces.

---

## Engineering Backlog

Non-phase items tracked for future improvement. Pick up opportunistically or when touching adjacent code.

### Test Coverage — Final 1% Push (Phase 105)

Current: 87.01% stmt / 76.02% branches. Target: 88% / 77%. Gap: <1% each.

**Highest-impact targets by coverage gap** (directory-level, sorted by branch gap):

| Directory | Stmts | Branches | Priority |
|-----------|-------|----------|----------|
| `body/actuator/` | 75.63% | 61.17% | HIGH — desktop control branch coverage |
| `logging/` | 74.93% | 62.18% | HIGH — audit chain + export branches |
| `licensing/` | 67.30% | 63.63% | HIGH — license validation branches |
| `notifications/` | 90.00% | 64.22% | MEDIUM — good stmt, weak branch |
| `sandbox/` | 77.67% | 66.16% | MEDIUM — sandbox exec branches |
| `cli/commands/` | 76.83% | 68.12% | MEDIUM — flag parsing branches |
| `config/` | 81.81% | 69.01% | MEDIUM — config validation branches |
| `training/` | 78.81% | 69.84% | MEDIUM — manager logic branches |
| `workflow/` | 91.78% | 72.70% | LOW — good stmt, branch gap in engine conditions |

- [ ] **Licensing branch coverage** — `licensing/` at 67.30% stmt / 63.63% branch. License validation branching (expired, invalid signature, missing claims, feature checks) is fully unit-testable. The `TestLicenseManager` pattern is already established.
- [ ] **Logging branch coverage** — `logging/` at 74.93% stmt / 62.18% branch. Audit chain integrity verification, export format branches, and log rotation logic are unit-testable with mocked storage.
- [ ] **Actuator branch coverage** — `body/actuator/` at 75.63% stmt / 61.17% branch. Desktop control action dispatch and platform-specific branching.
- [ ] **Notification branch coverage** — `notifications/` at 90% stmt / 64.22% branch. Notification preference filtering and channel dispatch branches.

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Observability & Telemetry (Phase 83 remnants)

*As SecureYeoman moves into production deployments, operators need distributed tracing, metrics export, and correlation tooling beyond what the built-in audit log provides.*

**Remaining / Future improvements (demand-gated)**:
- [ ] **Histogram metrics** — Replace avg-latency gauge with proper p50/p95/p99 histograms per route using OpenMetrics format.
- [ ] **AI completion spans** — Instrument every `aiClient.chat()` call with a child span including model, input/output token counts.
- [ ] **MCP tool call spans** — Wrap each MCP tool invocation in a span for end-to-end tracing through agent → tool → external API.
- [ ] **Personality activity heatmap** — Per-personality request rate in Grafana.

---

### Workflow & Personality Versioning

*Git-like version control for workflows and personality configurations. As teams grow and production personalities accumulate significant configuration, the ability to diff, rollback, and publish specific versions becomes critical.*

Versions use the project's date-based format: `YYYY.M.D` (e.g., `2026.2.28`). Same-day patches append a numeric suffix: `2026.2.28-1`. This keeps versioning consistent with the Changelog and skill files.

- [ ] **Personality version history** — Every save to a personality's configuration (system prompt, tools, skills, model) creates an immutable version snapshot in `soul.personality_versions`. Dashboard: "History" tab in PersonalityEditor showing timestamp, author, and a short diff summary. Click any version to preview it; one-click rollback.
- [ ] **Workflow version control** — Same pattern for workflows: `workflow.versions` table. Visual diff between two versions using the existing ReactFlow DAG renderer (added/removed/changed nodes highlighted). Export any version as JSON; import replaces current with confirmation.
- [ ] **Named releases** — Tag a personality or workflow version with a date-based label matching the project's release format (e.g., `2026.2.28`, `2026.3.1`; same-day patch: `2026.2.28-1`). Named releases surfaced in the version history UI. API: `GET /api/v1/soul/personalities/:id/versions/:tag`.
- [ ] **Configuration drift detection** — Compare current production personality config against the last tagged release; surface diff count as a badge in the PersonalityEditor header. *"You have 3 uncommitted changes since 2026.2.28."*

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

### Responsible AI

*Inspired by Azure Responsible AI Dashboard and Google Vertex AI Explainability. Required for EU AI Act compliance and enterprise governance.*

- [ ] **Cohort-based error analysis** — Slice evaluation results by conversation metadata (topic category, user role, time-of-day, personality configuration) and show error rate per cohort. Dashboard: heat-map table with drill-down.
- [ ] **Fairness metrics** — For any evaluation dataset that includes demographic metadata, compute parity metrics: demographic parity, equalized odds, and disparate impact ratio across groups. Alert when a fine-tuned model shows a fairness regression.
- [ ] **Model explainability (SHAP)** — For classification-style tasks run SHAP value attribution on fine-tuned model outputs. Show which input tokens contributed most to each prediction. Rendered as a token-level heat map in the experiment detail view.
- [ ] **Data provenance audit** — Every training dataset records which conversations were included, which were filtered out (and why), and which were synthetic. Full lineage queryable: "was this user's conversation used in training?" Important for GDPR right-to-erasure compliance.
- [ ] **Model card generation** — Auto-generate a structured model card for each deployed personality model: intended use, training data summary, known limitations, evaluation results, fairness scores, and deployment date. Aligned with Hugging Face Model Card format and EU AI Act transparency requirements.

---

### LLM Provider Improvements

*Demand-gated. Enhances the multi-provider AI client with reliability, routing intelligence, and new provider coverage.*

- [ ] **Gemini Flash 2.0 provider** — Add `gemini-2.0-flash` and `gemini-2.0-flash-lite` to the Gemini provider with native function calling, 1M context window support, and grounding via Google Search.
- [ ] **Anthropic extended thinking** — Surface `thinking: { type: 'enabled', budget_tokens }` on Claude 3.7+ models. Per-personality `thinkingBudgetTokens` field. Dashboard: thinking indicator + expandable reasoning block in chat.
- [ ] **OpenAI o3 / o3-mini** — Add `o3` and `o3-mini` to the OpenAI provider. Support `reasoning_effort: 'low' | 'medium' | 'high'` param. Per-personality reasoning effort override.
- [ ] **Mistral AI provider** — `MistralProvider` wrapping the official `@mistralai/mistralai` SDK. Models: `mistral-large-latest`, `mistral-small-latest`, `codestral-latest`. Function calling, JSON mode.
- [ ] **Groq provider** — `GroqProvider` using `@groq-sdk`. Ultra-low latency inference for Llama 3, Mixtral, and Gemma. Auto-selected by `localFirst` routing when Groq is configured.
- [ ] **Provider health scoring** — Track each provider's rolling error rate + p95 latency. Prefer providers with high health scores in fallback chains. Dashboard: provider health table in ModelWidget with green/amber/red indicators.
- [ ] **Smart context management** — When a conversation exceeds 80% of a model's context limit, automatically summarise the oldest turns (using the same model or a faster summary model). Transparent to the user; logged in the conversation metadata. Configurable in personality settings: `contextOverflowStrategy: 'summarise' | 'truncate' | 'error'`.
- [ ] **Cost budget alerts** — Per-personality and per-user daily/monthly cost caps. Alert (notification + optional block) when the cap is approached (80%) or hit (100%). Configurable in the personality editor and security policy.
- [ ] **Streaming tool call support for all providers** — Standardise streaming tool call chunks across Anthropic, OpenAI, Gemini, and Mistral so the UI can show partial tool arguments as they stream.
- [ ] **Local model auto-discovery** — On startup, query Ollama (`/api/tags`) and LM Studio (`/v1/models`) to auto-populate the model list without manual configuration. Refresh every 60s. Surface new models as suggestions in ModelWidget.

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

### Theme Editor & Custom Themes

*Demand-Gated — extends the 10/10/10 theme system (ADR 175) with user-created themes.*

- [ ] **Theme editor** — Visual theme editor in Appearance settings: live-preview color pickers for all CSS variables (background, foreground, primary, secondary, muted, accent, destructive, border, ring, success, warning, info). Export as JSON; import to apply.
- [ ] **Theme upload** — Users upload a JSON theme file via the dashboard. Stored per-user in `settings.custom_themes`. Custom themes appear in a "Custom" section below the built-in themes.
- [ ] **Community theme gallery** — Browse and install community-shared themes from the Marketplace. Themes are shareable JSON files with metadata (name, author, preview colors, dark/light flag). Marketplace sync includes `themes/` directory.
- [ ] **Theme scheduling** — Auto-switch between a light and dark theme based on time of day or OS schedule. Configurable transition time.

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

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Dependency Watch](dependency-watch.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-03-02 — See [Changelog](../../CHANGELOG.md) for full history.*
