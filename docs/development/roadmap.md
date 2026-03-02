# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Phase XX: QA & Manual Testing (Ongoing)

**Priority**: P1 — Ongoing. Continuous verification of features that lack automated integration coverage. Items move to Changelog when confirmed working; new regressions are added here as discovered.

### Open Items

- [ ] **Review: Catalog section** — Further review of the Catalog page (Skills, Workflows, Swarm Templates) across all tabs (Personal, Marketplace, Community, Installed). Assess UX, labelling, install/uninstall flows, filtering, search, sync behaviour, and any missing functionality before considering the section production-ready.
- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 134. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **Manual test: SAML SP flow** — Configure SimpleSAMLphp (or mock). (1) `GET /api/v1/auth/sso/saml/:id/metadata` returns valid `<md:EntityDescriptor>` XML. (2) `GET /api/v1/auth/sso/authorize/:id` redirects to IdP with SAMLRequest. (3) Post-IdP redirect hits ACS, returns JWT in URL fragment.
- [ ] **Manual test: RLS tenant isolation** — Create tenant B via API. Insert `soul.personality` scoped to tenant B. Query personalities as tenant A → empty. Query as tenant B → record visible. Existing default-tenant data unaffected.
- [ ] **Manual test: OAuth token refresh end-to-end** — (1) Connect a Gmail account; (2) Wait for access token to expire (or use Connections → OAuth → "Refresh Token" button); (3) Confirm personality can still call `gmail_profile` without error; (4) Revoke the Google refresh token in Google Account → Security → Third-party apps, then trigger a Gmail tool call — confirm error message tells user to reconnect (not a silent 500).
- [ ] **Manual test: AgentWorld sub-agents** — Sub-agents display when created, writing, meeting added. Verify delegation cards appear in grid/map/large views, disappear when delegation completes.
- [ ] **Manual test: Skills** — Continued review of marketplace + community install/uninstall flow, per-personality skill injection, and sub-agent skill inheritance.
- [ ] **Manual test: Docker MCP Tools** — Enable `MCP_EXPOSE_DOCKER=true` (socket mode). Verify `docker_ps` lists containers, `docker_logs` streams output, `docker_exec` runs commands correctly. Enable DinD mode via `MCP_DOCKER_MODE=dind` + `MCP_DOCKER_HOST` and repeat.
- [ ] **Manual test: Workflow export/import round-trip** — Export a workflow with required integrations. Import on a fresh instance; verify compatibility warnings surface correctly for missing integrations. Install a community workflow from Marketplace → Workflows tab; verify it appears in workflow definitions.
- [ ] **Manual test: Workflows & Swarms marketplace-only lifecycle** — Verify that after a clean rebuild: (1) Installed tab → Workflows shows zero items; (2) Installed tab → Swarm Templates shows zero items; (3) Marketplace tab → Workflows shows all YEOMAN built-ins (research-report-pipeline, code-review-webhook, parallel-intelligence-gather, distill-and-eval, finetune-and-deploy, dpo-loop, pr-ci-triage, build-failure-triage, daily-pr-digest, dev-env-provision) under "YEOMAN Workflows"; (4) Marketplace tab → Swarm Templates shows all YEOMAN built-ins (research-and-code, analyze-and-summarize, parallel-research, code-review, prompt-engineering-quartet) under "YEOMAN Swarm Templates"; (5) Click Install on a workflow → it now appears in Installed tab; (6) Community tab → Sync pulls in community workflows and swarm templates from the configured repo path; (7) Community tab → Workflows and Community tab → Swarm Templates show the synced items; (8) Search filters work across all views. Architecture note: builtin workflows are seeded with `createdBy: 'system'` and builtin swarms with `isBuiltin: true` — these flags are how Installed tab excludes them. Community sync wires `workflowManager` and `swarmManager` into `MarketplaceManager` via `setDelegationManagers()` (called from `bootDelegationChain()`).
- [ ] **Manual test: Canvas Workspace** — Navigate to `/editor/advanced` (or click "Canvas Mode →" in the editor toolbar). Create ≥3 widgets, resize, move, minimize one. Reload page → verify layout is restored from localStorage. Pin a terminal output → frozen-output widget appears adjacent. Worktree selector lists git worktrees.
- [ ] **Manual test: Unified editor features** — At `/editor` (standard editor): (1) Click Brain icon → toggle memory on; run a terminal command → verify it appears in the personality's memory via `/api/v1/brain/memories`; (2) Click CPU icon → ModelWidget popup shows current model; switch model → toolbar label updates; (3) Click Globe icon → Agent World panel expands below the main row; switch between Grid/Map/Large views; close via × and verify `localStorage('editor:showWorld')` is `'false'`; (4) Open 3 terminal tabs in MultiTerminal → verify each has independent output; (5) Set `allowAdvancedEditor: true` in security policy → `/editor` should redirect to Canvas workspace.
- [ ] **Manual test: Adaptive Learning Pipeline** — Verify conversation quality scorer runs on schedule (check `training.conversation_quality` table grows). Trigger a distillation job with `priorityMode: 'failure-first'` → confirm lower-scored conversations appear first in the export.
- [ ] **Base knowledge generic entries per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally. These may need per-personality variants. Low urgency.
- [ ] **Consumer UX: Settings page split** — Extract `<AuditChainTab>`, `<SoulSystemTab>`, `<RateLimitingTab>` from the `SettingsPage.tsx` monolith into dedicated tab components.
- [ ] **Validate workflow condition strings at save time** — `evaluateCondition()` in `WorkflowEngine` silently returns `false` for malformed JS expressions (e.g. `steps.nonexistent.output`). Move the `new Function(expr)` compile step to `createWorkflow`/`updateWorkflow` validation so operators get an immediate 400 error with the syntax problem, not a silent skip at runtime.
- [ ] **Injection detection early-exit after first blocking match** — `InputValidator.detectInjection()` loops through all `INJECTION_PATTERNS` even after setting `blocked = true`. Once a pattern with `block: true` is matched, the loop should break; subsequent patterns only accumulate score, wasting CPU. Benchmark shows this matters at 8 KB inputs with multiple attack vectors.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P1 — ongoing | 🔄 Continuous |
| 93 | License-Gated Feature Reveal | P2 — commercial | Planned |
| 94 | Test Coverage: Path to 88%/77% | P2 — engineering quality | 🔄 In Progress (80.85%/68.76%) |
| 100 | Editor Improvements (Auto-Claude Style) | P3 — power user UX | 🔄 In Progress (unification ✅, IDE features planned) |
| 101 | Inline Citations & Grounding | P4 — trust layer | Planned |
| 102 | Reasoning Strategies, Security Templates & Portable Personalities | P2 — capability + distribution | Planned |
| Future | Workflow Versioning, LLM Lifecycle Advanced, Responsible AI, Voice Pipeline, Infrastructure | Future / Demand-Gated | — |

---

## Phase 93: License-Gated Feature Reveal

**Priority**: P2 — Commercial. Enterprise features are built and instrumented but not yet gated. This phase makes the tier boundary real: community installs see upgrade prompts; enterprise installs unlock the full feature set. Directly tied to revenue (ADR 171).

Enterprise features gated by this phase: `adaptive_learning`, `sso_saml`, `multi_tenancy`, `cicd_integration`, `advanced_observability`.

- [ ] **Gateway route guards** — Add `requiresLicense(feature: EnterpriseFeature)` hook to the routes that serve enterprise functionality (training advanced modes, SAML endpoints, RLS multi-tenant API, CI/CD webhook, alert rules). Returns `402 Payment Required` with `{ error: 'enterprise_license_required', feature: '<name>' }` for community-tier callers. `LicenseManager` singleton accessed via `secureYeoman.getLicenseManager()` inside route plugins.
- [ ] **License context in dashboard** — On app load, call `GET /api/v1/license/status` and store the result in a top-level React context (`LicenseContext`). All downstream components read from this context — no prop drilling.
- [ ] **Feature lock UX** — Components for guarded features (Training advanced modes, SSO config, Multi-tenancy settings, CI/CD platforms, Alert Rules) wrap in a `<FeatureLock feature="adaptive_learning">` guard component. Community-tier users see the feature greyed out with a lock icon and an "Upgrade to Enterprise" prompt linking to `docs/guides/licensing.md` rather than a blank 403.
- [ ] **Settings → License card enhancements** — The existing `LicenseCard` in Settings → General should show: current tier chip, list of available features as green chips and locked features as grey chips, expiry countdown banner if expiring within 30 days.
- [ ] **CLI guard** — `secureyeoman` CLI commands that wrap enterprise API endpoints (e.g., `secureyeoman training`, `secureyeoman crew`) should surface the `402` error as a human-readable message: *"This command requires an Enterprise license. Run `secureyeoman license status` to check your current tier."*

---

## Phase 100: Editor Improvements (Auto-Claude Style)

**Priority**: P3 — High value for power users. Demand-gated — implement incrementally based on user feedback.

**Remaining IDE features** — Auto-Claude–style patterns (plan display, step-by-step approval, AI commit messages, context badges), multi-file editing (tabs, split panes), project explorer, integrated Git, command palette, inline AI completion (Copilot-style), multi-file search & replace, collaborative editing (Yjs CRDT), keybindings editor, layout persistence, responsive/mobile layout, training integration (export/annotation), and plugin/extension system.

---

## Phase 101: Inline Citations & Grounding

**Priority**: P4 — Trust layer. Groundedness enforcement is the anchor item; web grounding is a stretch goal. Requires the Phase 82 knowledge base retrieval layer (complete — see [knowledge-base.md](../guides/knowledge-base.md)).

Inspired by Google Cloud Vertex AI Grounding and Azure Groundedness Detection.

- [ ] **Source-attributed responses** — When the AI uses retrieved knowledge base documents in a response, inject inline citations (`[1]`, `[2]`) and render a **Sources** section at the bottom of the response. Citation text includes: document title, page/chunk number, and a short excerpt. Stored as structured metadata on the conversation turn. Enabled per personality via `enableCitations: boolean`.
- [ ] **Groundedness enforcement** — Post-processing pass: before returning a response, check each factual claim against the retrieved chunks using an embedding similarity threshold. Claims with no supporting chunk above threshold are flagged as `[unverified]` inline. Configurable mode: `annotate_only`, `block_unverified`, or `strip_unverified`.
- [ ] **Web grounding** — Ground AI responses in live web search results, not just the local knowledge base. When web grounding is enabled and the query requires current information, perform a search (via existing web-search MCP tool), retrieve top results, and include them as retrieved context with citations.
- [ ] **Grounding confidence score** — Per-response aggregate grounding score: what fraction of claims are supported by retrieved sources above threshold? Stored on the conversation turn. Low-grounding responses flagged in the Audit Log. Rolling average per personality surfaced in the Analytics tab as a "Response Trustworthiness" metric.
- [ ] **Citation feedback** — Users can click a citation to see the full source chunk in a side drawer. They can mark citations as "not relevant" — negative feedback stored as a weak signal for the knowledge base quality scoring system.
- [ ] **Document provenance scoring** — 8-dimension quality evaluation for knowledge base documents, inspired by [Substrate](https://github.com/danielmiessler/Substrate)'s library science methodology. Each `brain.documents` row gains a `source_quality` JSONB column scoring: Authority, Currency, Objectivity, Accuracy, Methodology, Coverage, Reliability, and Provenance (each 0.0–1.0). Composite `trust_score` (weighted average) used to boost/demote chunks during RAG retrieval in `BrainManager.recall()`. Auto-populated where possible (e.g., `.gov` URLs score high on Authority; age of document drives Currency). Manual override via document detail UI. Documents with no provenance data default to a neutral score (0.5). Trust scores surfaced in the Knowledge Base → Health panel and in citation footnotes when Phase 101 citations are enabled.

---

## Phase 102: Reasoning Strategies, Security Templates & Portable Personalities

**Priority**: P2 — Capability expansion + distribution. Inspired by [fabric](https://github.com/danielmiessler/fabric)'s patterns/strategies architecture. Six workstreams: composable reasoning strategies, security-domain prompt templates, CLI UX improvements, portable markdown personality format with injection model, personality-core distillation for transport, and ATHI threat governance taxonomy.

### 102-A: Reasoning Strategies Layer

*Composable meta-reasoning instructions that can be applied to any personality's system prompt. Orthogonal to the personality itself — "use chain-of-thought with FRIDAY" or "use tree-of-thought with T.Ron".*

- [ ] **Strategy schema & storage** — `ReasoningStrategySchema` in `packages/shared/src/types/soul.ts`: `{ id, name, slug, description, promptPrefix, category, isBuiltin }`. Migration adds `soul.reasoning_strategies` table. Category enum: `chain_of_thought | tree_of_thought | reflexion | self_refine | self_consistent | chain_of_density | argument_of_thought | standard`.
- [ ] **Built-in strategies** — Seed 8 strategies matching fabric's set: CoT ("Think step by step"), ToT ("Generate multiple reasoning paths, select the best"), Reflexion ("Answer, critique, refine"), Self-Refine ("Iteratively improve"), Self-Consistent ("Multiple samples, majority vote"), Chain-of-Density (density-based summarization), Argument-of-Thought (argument-structured reasoning), Standard (baseline/no prefix). Stored as builtins with `isBuiltin: true`.
- [ ] **Strategy injection in SoulManager** — `manager.ts` `composeSystemPrompt()` accepts optional `strategyId`. When set, prepends the strategy's `promptPrefix` before the personality's system prompt. Strategy sits between Sacred Archetypes preamble and personality identity.
- [ ] **Per-conversation strategy selection** — `POST /api/v1/chat` and `/chat/stream` accept optional `strategyId` query param. Stored on the conversation metadata. Default: `null` (no strategy override; personality uses its own prompt as-is).
- [ ] **Per-personality default strategy** — New `defaultStrategyId` field on `PersonalityCreate`. When set and no per-conversation override, this strategy is always applied.
- [ ] **Strategy CRUD routes** — `GET/POST/PUT/DELETE /api/v1/soul/strategies`. Builtin strategies are read-only. Custom strategies support full CRUD. Auth: `soul:read`/`soul:write`.
- [ ] **Dashboard: Strategy selector** — Dropdown in chat interface header (next to model selector) listing available strategies. Selected strategy shown as a chip. Strategy management UI in Settings → Soul System tab.
- [ ] **CLI: `secureyeoman strategy`** — Subcommands: `list`, `show <slug>`, `create`, `delete`. `--strategy <slug>` flag on `secureyeoman chat` and `secureyeoman execute`.
- [ ] **Strategy-aware evaluation** — `EvaluationManager` records which strategy was active during evaluated conversations. Evaluation results filterable by strategy to measure which reasoning approach works best for which task type.
- [ ] **Deterministic routing preference** — Encode a "Code → CLI → Prompt → Skill" dispatch hierarchy in `SkillExecutor` and `WorkflowEngine`, inspired by [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)'s principle that deterministic code paths should be preferred over LLM-routed paths when both can solve the task. When a workflow step or skill action can be resolved by a direct function call or shell command with known output, prefer that over sending the task to the LLM. Concretely: `WorkflowEngine` step dispatch checks for a `deterministic` flag on step config; when set, the step runs its `command` or `function` directly and only falls through to AI routing on failure. Skill routing order: code action → HTTP action → AI-assisted action. Reduces token cost and latency for routine operations.

### 102-B: Security Prompt Templates

*Pre-built security-focused prompt templates inspired by fabric's security patterns. Delivered as marketplace skills and workflow templates with structured output specifications.*

- [ ] **STRIDE threat model template** — Skill + workflow template. Input: system description (architecture doc, API spec, or free-text). Output: structured STRIDE per-element analysis with severity scores (Critical/High/Medium/Low), attack trees, and recommended mitigations. Output format: markdown with tables.
- [ ] **SIGMA rule generator** — Skill that converts threat intelligence reports, IOC lists, or incident descriptions into SIEM-ready SIGMA detection rules (YAML). Includes logsource, detection, and condition fields. Validates output against SIGMA schema.
- [ ] **Malware analysis template** — 8-section structured analysis: executive summary, IOCs (hashes, IPs, domains, URLs), MITRE ATT&CK technique mapping, behavioral analysis, YARA rule generation, network indicators, persistence mechanisms, and recommended pivots. Anti-hallucination guard: "Acknowledge missing information rather than inventing indicators."
- [ ] **Email header forensics** — Analyzes raw email headers for SPF/DKIM/DMARC/ARC authentication results. Generates DNS lookup verification scripts. Identifies header anomalies and spoofing indicators.
- [ ] **TTRC analysis (Time to Remediate/Compromise)** — Calculates and visualizes the ratio between how long it takes to find and fix vulnerabilities vs. how long it takes attackers to exploit them. Outputs narrative + data for dashboard metrics.
- [ ] **Security architecture review** — Generates "secure by design" review questions for a given system architecture. Covers: authentication, authorization, data protection, network segmentation, supply chain, logging, incident response, and compliance alignment.
- [ ] **Log analysis template** — Structured log analysis for security events. Identifies anomalies, correlates events, generates timeline, suggests investigation paths. Supports common log formats (syslog, JSON, CEF).
- [ ] **Community security patterns directory** — Add `security-templates/` to the community repo structure. Each template is a directory with `system.md` (system prompt), `user.md` (optional input template), and `metadata.json` (category, tags, required integrations). `CommunitySyncResult` gains `securityTemplatesAdded`/`securityTemplatesUpdated`.

### 102-C: CLI Enhancements

*Unix-philosophy CLI improvements inspired by fabric's composable piping model.*

- [ ] **Stdin piping** — `secureyeoman chat` reads from stdin when not a TTY. Enables `cat report.txt | secureyeoman chat -p friday` and `pbpaste | secureyeoman chat --strategy cot`. Input piped as the user message; response written to stdout.
- [ ] **`--dry-run` flag** — Preview the full composed prompt (system prompt + strategy prefix + personality + skills + user message) without sending to the AI provider. Outputs the prompt to stdout. Useful for debugging prompt composition and reviewing what the AI will see.
- [ ] **`--output` / `-o` flag** — Write AI response to a file instead of (or in addition to) stdout. `secureyeoman chat -p friday -o response.md "Analyze this threat"`.
- [ ] **Personality aliasing** — `secureyeoman alias create wisdom "chat -p friday --strategy cot"`. Stored in `~/.config/secureyeoman/aliases.json`. Usage: `secureyeoman wisdom "Analyze this document"`. `secureyeoman alias list` / `secureyeoman alias delete <name>`.
- [ ] **Pipeline chaining** — Stdout output is clean (no progress spinners or status messages when piped) so responses can chain: `secureyeoman chat -p friday "Analyze this" | secureyeoman chat -p t-ron "Summarize"`. Detect non-TTY stdout and suppress decorations.
- [ ] **`--copy` / `-c` flag** — Copy AI response to system clipboard (xclip/xsel on Linux, pbcopy on macOS, clip on Windows). Complement to stdin piping for quick workflows.
- [ ] **`--format` flag** — Output format control: `markdown` (default), `json` (structured response with metadata), `plain` (strip markdown formatting). JSON mode includes token counts, model used, strategy applied, and timing.

### 102-D: Portable Personality Format — Markdown Injection Model

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

### 102-E: Personality Core Distillation to Markdown

*Automated extraction of a personality's effective runtime state — not just its config, but the composed prompt including injected skills, memory context, active integrations, and strategy — into a single portable markdown document. This is the "distilled" view: what the AI actually sees.*

- [ ] **`distillPersonality()` method** — `SoulManager` method that calls `composeSystemPrompt()` with all active skills, memory snippets, integration contexts, and strategy prefix, then wraps the result in the portable markdown format from 102-D. The distilled document includes a `# Runtime Context` section listing: active skills (count + names), memory entries (count), connected integrations, applied strategy, and model configuration.
- [ ] **Distillation route** — `GET /api/v1/soul/personalities/:id/distill` returns the distilled markdown. Accepts `?includeMemory=true` to embed the personality's top-k memory entries (default: metadata only, not full content — avoids leaking sensitive learned data).
- [ ] **Distillation diff** — `GET /api/v1/soul/personalities/:id/distill/diff` compares the current distilled state against the last exported/tagged version. Returns a unified diff. Useful for understanding "what changed in what the AI sees" vs. "what changed in the config."
- [ ] **CLI distill** — `secureyeoman personality distill <name> [--include-memory] [--output file]`. Outputs the full composed prompt as a readable markdown document.
- [ ] **Transport use case** — Distilled personalities can be imported on another SecureYeoman instance. Skills and integrations referenced in the distilled doc that aren't available locally are listed as warnings. The system prompt is imported as-is; skills are matched by name/slug when available.

### 102-F: ATHI Threat Governance Framework

*Actors/Techniques/Harms/Impacts taxonomy for AI threat modeling, adapted from Daniel Miessler's ATHI framework. Positioned as an organizational governance tool — extends SecureYeoman's existing security audit capabilities with an AI-specific threat lens communicable to non-technical stakeholders.*

- [ ] **ATHI schema** — `packages/shared/src/types/security.ts`: `AthiActor` (nation_state, cybercriminal, insider, hacktivist, competitor, automated_agent), `AthiTechnique` (prompt_injection, data_poisoning, model_theft, supply_chain, social_engineering, adversarial_input, privilege_escalation), `AthiHarm` (data_breach, misinformation, service_disruption, privacy_violation, financial_loss, reputational_damage, safety_risk), `AthiImpact` (regulatory_penalty, operational_downtime, customer_trust_loss, ip_theft, legal_liability). `AthiThreatScenario`: `{ actor, techniques[], harms[], impacts[], likelihood, severity, mitigations[], status }`.
- [ ] **ATHI storage & migration** — `security.athi_scenarios` table. Fields: id, org_id (nullable, for multi-tenancy), title, description, actor, techniques (JSONB), harms (JSONB), impacts (JSONB), likelihood (1-5), severity (1-5), risk_score (computed: likelihood × severity), mitigations (JSONB), status (identified | assessed | mitigated | accepted | monitoring), created_by, created_at, updated_at.
- [ ] **ATHI manager** — `packages/core/src/security/athi-manager.ts`. CRUD + `getRiskMatrix()` (actor × technique heat map), `getTopRisks(limit)`, `getMitigationCoverage()` (% of scenarios with at least one mitigation), `generateExecutiveSummary()` (non-technical narrative for board-level reporting).
- [ ] **ATHI routes** — `GET/POST/PUT/DELETE /api/v1/security/athi/scenarios`. `GET /api/v1/security/athi/matrix` (risk heat map data). `GET /api/v1/security/athi/summary` (executive narrative). Auth: `security:read`/`security:write`.
- [ ] **AI-assisted scenario generation** — Skill/workflow template: given an organization description and its AI usage patterns, generate candidate ATHI threat scenarios. Uses the malware analysis and threat modeling security templates from 102-B as building blocks. Output reviewed by human before persisting.
- [ ] **Dashboard: ATHI tab** — New sub-tab in SecurityPage. Risk matrix visualization (likelihood × severity heat map). Scenario list with filters by actor/technique/status. Executive summary export (PDF/markdown). Mitigation coverage gauge.
- [ ] **CLI: `secureyeoman athi`** — Subcommands: `list`, `show <id>`, `create`, `matrix`, `summary`. `--format json|table|markdown` output modes.
- [ ] **Integration with existing security features** — ATHI scenarios can reference audit events (link scenario → observed events). Security Events tab cross-references ATHI scenarios when displaying events that match a known technique pattern. Alert rules can trigger on ATHI-mapped event patterns.

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Observability & Telemetry (Phase 83 remnants)

*As SecureYeoman moves into production deployments, operators need distributed tracing, metrics export, and correlation tooling beyond what the built-in audit log provides.*

**Remaining / Future improvements (demand-gated)**:
- [ ] **Workflow/job completion notifications** — Emit metric events when workflows, distillation jobs, and evaluation runs complete (or fail). Events fed into the existing `AlertManager` evaluation loop so operators can define alert rules like "notify me when any workflow takes >5 minutes" or "alert on distillation failure". Adds `ntfy` as a fifth alert channel type alongside slack/pagerduty/opsgenie/webhook — lightweight push notifications to mobile/desktop without requiring a full messaging platform. Inspired by [PAI](https://github.com/danielmiessler/Personal_AI_Infrastructure)'s ntfy/Discord notification routing for long-running tasks. Dashboard: alert rule templates for common job-completion patterns pre-populated in the Alert Rules UI.
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
