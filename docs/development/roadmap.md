# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Phase XX: QA & Manual Testing (Ongoing)

**Priority**: P1 — Ongoing. Continuous verification of features that lack automated integration coverage. Items move to Changelog when confirmed working; new regressions are added here as discovered.

### Open Items

- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 134. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **Manual test: SAML SP flow** — Configure SimpleSAMLphp (or mock). (1) `GET /api/v1/auth/sso/saml/:id/metadata` returns valid `<md:EntityDescriptor>` XML. (2) `GET /api/v1/auth/sso/authorize/:id` redirects to IdP with SAMLRequest. (3) Post-IdP redirect hits ACS, returns JWT in URL fragment.
- [ ] **Manual test: RLS tenant isolation** — Create tenant B via API. Insert `soul.personality` scoped to tenant B. Query personalities as tenant A → empty. Query as tenant B → record visible. Existing default-tenant data unaffected.
- [ ] **Manual test: OAuth token refresh end-to-end** — (1) Connect a Gmail account; (2) Wait for access token to expire (or use Connections → OAuth → "Refresh Token" button); (3) Confirm personality can still call `gmail_profile` without error; (4) Revoke the Google refresh token in Google Account → Security → Third-party apps, then trigger a Gmail tool call — confirm error message tells user to reconnect (not a silent 500).
- [ ] **Manual test: AgentWorld sub-agents** — Sub-agents display when created, writing, meeting added. Verify delegation cards appear in grid/map/large views, disappear when delegation completes.
- [ ] **Manual test: Skills** — Continued review of marketplace + community install/uninstall flow, per-personality skill injection, and sub-agent skill inheritance.
- [ ] **Manual test: Docker MCP Tools** — Enable `MCP_EXPOSE_DOCKER=true` (socket mode). Verify `docker_ps` lists containers, `docker_logs` streams output, `docker_exec` runs commands correctly. Enable DinD mode via `MCP_DOCKER_MODE=dind` + `MCP_DOCKER_HOST` and repeat.
- [ ] **Manual test: Workflow export/import round-trip** — Export a workflow with required integrations. Import on a fresh instance; verify compatibility warnings surface correctly for missing integrations. Install a community workflow from Marketplace → Workflows tab; verify it appears in workflow definitions.
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
| 78b | Canvas Workspace — Infinite Desktop | P2 — power user | ✅ Complete |
| 83 | Observability & Telemetry + CrewAI Enhancements | P2 — ops + ML | ✅ Complete |
| 84 | Notebook Mode: Long Context Windowing | P2 — knowledge UX | ✅ Complete |
| 82 | Knowledge Base & RAG Platform | P2 — knowledge | ✅ Complete |
| 90 | CI/CD Integration | P2 — developer lifecycle | ✅ Complete |
| 91 | Native Clients Scaffold (Tauri Desktop + Capacitor Mobile) | P2 — distribution | ✅ Complete |
| 92 | Adaptive Learning Pipeline | P2 — ML quality & training | ✅ Complete |
| 89 | Marketplace Shareables | P3 — community growth | ✅ Complete |
| 93 | License-Gated Feature Reveal | P2 — commercial | Planned |
| 94 | Test Coverage: Path to 88%/77% | P2 — engineering quality | 🔄 In Progress (80.85%/68.76%) |
| 95 | Content Guardrails | P2 — enterprise compliance | Planned |
| 96 | Conversation Analytics | P3 — operational intelligence | Planned |
| 97 | LLM-as-Judge Evaluation | P3 — ML quality signal | Planned |
| 98 | LLM Lifecycle Platform — Completion | P3 — model ops | Planned |
| 99 | Conversation Branching & Replay | P3 — developer experience | Planned |
| 100 | Editor Improvements (Auto-Claude Style) | P3 — power user UX | 🔄 In Progress (unification ✅, IDE features planned) |
| 101 | Inline Citations & Grounding | P4 — trust layer | Planned |
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

## Phase 94: Test Coverage — Path to 88% / 77%

**Priority**: P2 — Engineering quality. **Current baseline 2026-03-01**: **80.85% stmt · 68.76% branches · 82.62% fn · 81.56% lines** across 409 files / 8,892 core tests (10,400 total across all packages). Growth driven by Phase 89-A/B/C zero-coverage sweeps (+250 tests). Configured thresholds in `vitest.config.ts`: 87% stmt / 75% branch / 87% fn / 87% line (target: ≥ 88% stmt / ≥ 77% branch).

> Note: `vitest.config.ts` already excludes `src/**/index.ts`, `src/**/types.ts`, `src/secureyeoman.ts`, and `src/cli.ts` from coverage instrumentation. The gap is in logic files only.

### Why Coverage Is Low

Most source files already have a companion `*.test.ts`. The gap is depth, not breadth:
- Route handlers in `gateway/server.ts` (≈ 3,000 lines) are exercised only for happy-path flows; every `4xx`/`5xx` branch represents uncovered lines.
- Integration adapters (31 platforms) mock external clients; error branches, retry logic, and auth-failure paths are rarely asserted.
- Platform-specific code (`body/`, `sandbox/`, `security/keyring/`) guards on OS detection; tests running on a single host skip the other branches.
- AI provider implementations (`ai/providers/`) share base-class paths but each has unique error/retry branches that tests do not exercise.
- CLI commands (`cli/commands/`) test top-level dispatch but rarely exercise `--json` output mode, interactive prompts, or `--help` edge cases.

### Target Lift per Module

| Module | Actual stmt % | Branch % | Goal stmt | Remaining gap |
|--------|--------------|----------|-----------|---------------|
| `gateway/server.ts` | **62%** | 52% | 75% | `4xx`/`5xx` route branches, malformed body, DB error stubs (3,000-line file — biggest single lever). |
| `ai/client.ts` + providers | **80%** | 74% | 88% | Rate-limit 429, malformed response, fallback-chain exhaustion. |
| `integrations/` adapters × 31 | ~40% | ~35% | 70% | Table-driven per adapter: `send()` error, `validate()` bad config, `connect()`/`disconnect()` lifecycle. |
| `brain/vector/` stores | **97%** | 78% | 97% ✅ | Near-target; FAISS/Qdrant/Chroma already well-covered. |
| `sandbox/` (linux/darwin) | **77%** | 72% | 85% | Landlock unavailable fallback, seccomp profile load failure, resource-limit apply error. |
| `body/` desktop control | **76–96%** | 58–96% | 85% | Actuator error paths (clipboard deny, camera permission-denied). |
| `security/keyring/` providers | ~55% | ~40% | 70% | Mock `libsecret`/`security` CLI; service unavailable fallback. |
| `cli/commands/` | **65%** | 55% | 80% | `--json` mode, `--help`, non-zero exit on bad args. |
| `workflow/` | **87%** | 68% | 90% | Branch hot-spots: `triggerMode: 'any'` all-deps-fail, `outputSchemaMode: 'strict'` rejection, human-approval timeout. |
| `training/` pipeline | **82%** | 67% | 85% | Distillation `status: 'failed'` retry, LoRA sidecar timeout, evaluation threshold-miss. |
| `federation/` | **78%** | 52% | 80% | Branch coverage on peer-sync conflict, CRUD edge cases already tested (Phase 89-A). |
| `soul/manager.ts` | ~78% | ~67% | 85% | Prompt composition branches (all platform flags off, SAML role injection, per-personality hours). |

### Branch-Coverage Hot Spots (68.76% → 77%)

Branch coverage is the hardest gap. Key ternaries / conditionals to reach:

- **`ai/client.ts`** — fallback-chain index incrementing, local-first guard, provider-specific error `instanceof` checks.
- **`gateway/auth-middleware.ts`** — every `if (!token)`, `if (role < required)`, API-key vs JWT path, tenant header validation.
- **`integrations/manager.ts`** — `switch (platform)` has 31 arms; most untested in CI.
- **`security/rate-limiter.ts`** — Redis unavailable fallback to in-memory, sliding-window reset, per-IP vs per-user precedence.
- **`workflow/workflow-engine.ts`** — `triggerMode: 'any'` with all-deps-fail, `outputSchemaMode: 'strict'` rejection path, human-approval timeout.
- **`brain/chunker.ts`** — overlapping-window edge cases when chunk size > content length.
- **`soul/skill-executor.ts`** — trust-tier enforcement (`blocked`, `sandboxed`, `trusted`), `doNotUseWhen` predicate evaluation.
- **`sandbox/linux-sandbox.ts`** — Landlock unavailable fallback, seccomp profile load failure, resource limit apply error.

### Non-Code Levers (config / infrastructure wins)

- **Raise vitest thresholds** — bump `vitest.config.ts` thresholds from `{ stmt: 87, branch: 75 }` to `{ stmt: 88, branch: 77 }` to match the target.
- **Shared test helpers** — extract repeated `mockPool()` / `mockQuery()` boilerplate into `src/test-utils.ts` so branches are reachable inside existing per-file test files without duplication.
- **`vi.stubEnv` patterns** — several platform guards (`process.platform`, `process.env.CI`) branch on environment values that can be overridden with `vi.stubEnv()` inside existing tests to cover the else-branch.

### Acceptance Criteria

- [ ] `vitest run --coverage` reports ≥ 88% statements across core package.
- [ ] `vitest run --coverage` reports ≥ 77% branches across core package.
- [ ] No existing test degraded (test count stable or growing).
- [ ] `vitest.config.ts` thresholds bumped to `{ stmt: 88, branch: 77, fn: 88, lines: 88 }` and enforced in CI.
- [ ] `docs/development/coverage-plan.md` created with per-file before/after table when work begins.

---

## Phase 95: Content Guardrails

**Priority**: P2 — Enterprise compliance. Required for regulated industries (healthcare, finance, legal) and a key differentiator in enterprise sales. PII redaction and topic restrictions are the must-have items; toxicity and grounding checks are the depth tier.

Complements Phase 77 (Prompt Security) which guards the input side. This phase operates on AI outputs before they reach the user.

- [ ] **PII detection & redaction** — Detect and optionally redact personally identifiable information in AI outputs before they reach the user: names, email addresses, phone numbers, SSNs, credit card numbers, IP addresses. Configurable per personality: `detect_only` (flag + audit) or `redact` (replace with `[REDACTED]`). Uses NER model (spaCy or Comprehend-compatible) or regex patterns for low-latency enforcement.
- [ ] **Topic restrictions** — Block AI from discussing configurable topic categories, regardless of system prompt. Example: `blocked_topics: ['competitor products', 'legal advice', 'medical diagnosis']`. Implemented as an embedding-based classifier: compare the input/output embedding against a set of seed topic embeddings; block if similarity exceeds threshold. Configurable per personality in the security settings.
- [ ] **Toxicity filter** — Block or warn on outputs containing hate speech, harassment, or explicit content. Uses an external classifier endpoint (configurable: local Ollama model, OpenAI Moderation API, or custom). Modes: `block` (refuses to send output), `warn_user`, `audit_only`.
- [ ] **Custom block lists** — Per-personality keyword/phrase deny lists with regex support. Applied as a fast pre-filter before the semantic checks. Useful for brand protection, legal compliance, or content policy enforcement.
- [ ] **Guardrail audit trail** — Every guardrail trigger (PII redaction, topic block, toxicity flag) logged to the audit chain with: rule that fired, original content hash (not plaintext), action taken, and conversation ID. Queryable in the Audit Log tab with a "Guardrail Events" filter.
- [ ] **Grounding check** — Detect hallucinated citations or factual claims that contradict the personality's knowledge base. If the AI asserts a fact with a citation, verify the citation exists in the knowledge base. Flag unverifiable claims with a `[unverified]` annotation in the response. Optional mode: block responses with unverifiable claims outright.

---

## Phase 96: Conversation Analytics

**Priority**: P3 — Operational intelligence. Surfaces the hidden signal in the conversation store. Sentiment and engagement metrics are fast wins that feed directly into the training curation pipeline. Entity extraction and anomaly detection are deeper investments.

Inspired by Amazon Comprehend.

- [ ] **Sentiment tracking** — Per-turn sentiment score (positive / neutral / negative) computed asynchronously after each AI response. Stored in `conversations.turn_sentiments`. Dashboard: sentiment trend chart per personality over time; alert when rolling average drops below threshold. Feeds directly into the quality scorer for training data curation.
- [ ] **Engagement metrics** — Per-personality metrics: average conversation length, follow-up question rate (proxy for clarity), conversation abandonment rate, and tool-call success rate. Surfaced in a new Analytics tab in the dashboard alongside the existing cost metrics.
- [ ] **Conversation summarisation pipeline** — Batch job that computes a 2–3 sentence summary for each conversation above a configurable length. Summaries stored on the conversation record and surfaced in the conversation list (replacing the current raw first-turn preview). Also feeds the knowledge base: long conversations can be summarised and added as documents automatically.
- [ ] **Key phrase extraction** — Surface the most frequent topics discussed per personality over a rolling window. Dashboard: "Topic Cloud" widget in the Analytics tab. Useful for identifying gaps between what users ask about vs. what the personality's knowledge base covers.
- [ ] **Entity extraction** — Extract named entities (people, organisations, locations, products, dates) from conversation history using an NER model. Stored as tags on conversations. Enables searching conversations by entity (`GET /api/v1/conversations?entity=AcmeCorp`) and building a graph of frequently discussed topics per personality.
- [ ] **Anomaly detection on usage patterns** — Flag unusual usage spikes (10× normal message rate), off-hours activity from known users, or patterns consistent with credential stuffing. Generates audit events and optionally triggers notifications via the existing NotificationManager.

---

## Phase 97: LLM-as-Judge Evaluation

**Priority**: P3 — Closes the ML quality loop. Phase 73 delivered the pipeline mechanics (data_curation → training_job → evaluation → conditional_deploy → human_approval). Phase 92 added factored tool-call metrics and conversation quality scoring. This phase adds the qualitative signal layer that makes evaluation trustworthy beyond loss metrics.

Inspired by Google Cloud Vertex AI Evaluation Service and Azure AI Evaluation SDK.

- [ ] **Pointwise LLM scoring** — For each response in an evaluation set, prompt the judge model to rate it on: **groundedness**, **coherence**, **relevance**, **fluency**, **harmlessness**. Each dimension scored 1–5 with a brief rationale. Scores stored per experiment in `training.eval_scores`. Dashboard: radar chart per dimension for each experiment.
- [ ] **Pairwise comparison** — Given two model versions (e.g., base vs. DPO-tuned), prompt the judge to select the better response for each test prompt. Win rate computed across the full eval set. Pairwise results visible in the A/B testing view alongside the production shadow-routing data.
- [ ] **Auto-eval on finetune completion** — Configurable: when a finetune job completes, automatically run LLM-as-Judge pointwise eval on the held-out set and attach scores to the experiment record. If mean groundedness or coherence drops below threshold, pipeline blocks the deployment step and sends a notification. Zero-touch quality gate.
- [ ] **Evaluation dataset versioning** — Pin the held-out evaluation set at job creation time (snapshot of prompt/expected-response pairs). Eval scores are always against the same snapshot, so experiments are directly comparable even as the training corpus grows. Stored in `training.eval_datasets` with a content hash.
- [ ] **Custom judge prompts** — Per-personality judge prompt templates: define what "good" means for a specific personality. Judge model and judge prompt configurable independently of the personality's inference model.

---

## Phase 98: LLM Lifecycle Platform — Completion

**Priority**: P3 — Model operations. Phase 64 + 73 built the pipeline mechanics (distillation, fine-tuning, Ollama lifecycle, curation, evaluation, deploy). Phase 92 added conversation quality scoring, loss curve streaming, and counterfactual synthetic data. This phase completes the remaining operational gaps: preference annotation, experiment tracking, and the deployment story.

Advanced items (DPO, RLHF, continual learning, multi-GPU) are demand-gated in the Future Features section.

### Data Collection & Curation

- [ ] **Preference annotation UI** — In-chat thumbs-up / thumbs-down on individual AI turns. Multi-turn annotation: mark a full conversation as a positive or negative example. Annotations stored in `training.preference_pairs` for DPO.
- [ ] **Data curation pipeline** — Filter, deduplicate, and shard conversation exports before training. Configurable rules: min/max token length, quality score threshold, dedup by semantic similarity (embedding cosine > 0.95), exclude conversations with tool errors. Preview filtered dataset size before committing to a job.

### Experiment Tracking & Evaluation

- [ ] **Experiment registry** — Every training run logged as an experiment with: dataset snapshot hash, hyperparameters, environment, training loss curve, eval metrics. Stored in `training.experiments`. Dashboard: Experiments sub-tab in TrainingTab with filter/sort and diff view between any two runs.
- [ ] **Side-by-side model comparison** — Given two model checkpoints, run the same prompt set through both and display responses side-by-side in the dashboard. Human rater can pick the better response; ratings feed back into the preference dataset.

### Deployment Pipeline

- [ ] **One-click deploy to personality** — "Deploy to Personality" button on a completed finetune job. Calls `ollama cp` to register the GGUF under a versioned name (`personality-friday-v3`), then updates the personality's `defaultModel` field. Rollback: previous model name preserved.
- [ ] **Model version registry** — `training.model_versions` table: `(personality_id, model_name, experiment_id, deployed_at, is_active)`. Dashboard: Deployed Models tab with version history, deploy/rollback actions, and diff link to source experiment.
- [ ] **A/B testing (model shadow routing)** — Route X% of conversations to model version A and Y% to model version B. Aggregate quality comparison across both variants via the existing `ConversationQualityScorer`; promote winner automatically or manually.

---

## Phase 99: Conversation Branching & Replay

**Priority**: P3 — Developer experience. Git-like branching of conversations enables prompt engineering workflows, model comparison, and debugging without losing conversation history.

- [ ] **Branch from message** — Right-click any message in a conversation → "Branch from here". Creates a new conversation forked at that point. Fork relationship stored in `conversations.parent_conversation_id` + `conversations.fork_message_index`. Dashboard: branch indicator icon in the conversation list.
- [ ] **Replay with different model** — From a completed conversation, select "Replay" → choose a different model or personality configuration. The replay re-runs all user turns through the new config. Side-by-side diff view comparing original vs. replay responses.
- [ ] **Branch tree view** — Visualise the tree of conversation forks for a root conversation. Nodes show fork point, model config, and outcome (user rating or quality score). Useful for systematic prompt engineering iterations.
- [ ] **Replay batch** — Select a set of conversations and replay them all with a new model config. Results aggregated as a quality comparison report. Essentially a manual A/B test on historical traffic.

---

## Phase 100: Editor Improvements (Auto-Claude Style)

**Priority**: P3 — High value for power users.

Phase 78b (Canvas Workspace) is complete — 2026-03-01. The Canvas route moved from `/editor/canvas` to `/editor/advanced` and the `allowAdvancedEditor` security policy now gates access to it (ADR 173 — 2026-03-01).

**Completed in ADR 173 (2026-03-01):**

- ✅ **`MultiTerminal`** — tabbed terminal panel (up to 4 tabs) now in the standard `/editor` page
- ✅ **Memory toggle** — Brain icon in editor toolbar; auto-saves completed commands to episodic memory
- ✅ **Model selector** — CPU icon in editor toolbar; `ModelWidget` popup; auto-switches on personality change
- ✅ **Agent World panel** — Globe icon; collapsible panel below editor/chat row; grid/map/large views

**Remaining open items** target Auto-Claude–style patterns: keeping the human in the loop with confirmations, surfacing AI-generated context inline, and making each edit session faster via smart defaults.

---

### Auto-Claude Style Improvements

- **Pre-edit plan display** — before AI applies a multi-file change, show a structured plan card inline in the chat: files to be modified, lines touched, estimated risk. User can approve, reject, or expand individual steps. Mirrors the `EnterPlanMode` / `ExitPlanMode` pattern in Claude Code.
- **Step-by-step approval** — opt-in "step-by-step" mode: AI requests confirmation before each individual tool call (file write, terminal exec, git commit). A compact "approve / skip / stop" inline widget appears in the task panel without requiring a full page interaction.
- **AI-generated commit messages** — after a session's AI edits, "Generate Commit Message" button calls the personality LLM with a diff summary. Editable before committing.
- **Context badges** — Monaco line decorations show which lines were AI-suggested in the current session (gold gutter icon). Hover reveals the AI's reasoning. Badge fades on manual edit.
- **Selective memory push** — "Remember this snippet" action in the editor context menu: sends selected code + its file path to the personality's knowledge base (`POST /api/v1/brain/knowledge`).
- **Smart CWD** — terminal auto-follows the active editor file's directory unless the user has explicitly `cd`'d elsewhere. Reduces context-switching fatigue.

---

### Multi-File Editing

The single Monaco pane becomes a tabbed editor with split-pane support:

- **Tab bar** — open files appear as tabs; middle-click or `×` to close; drag to reorder; pin tabs to prevent accidental closure
- **Split panes** — vertical and horizontal splits; each pane maintains its own tab stack and cursor position
- **File history** — `Alt+Left` / `Alt+Right` navigate recently visited files (breadcrumb at top of each pane)
- **Dirty indicator** — unsaved files show a `●` in their tab; confirm-on-close guard

---

### Project Explorer

The current `FileManagerPanel` is replaced by a full collapsible file-tree sidebar (VSCode Explorer column):

- Tree shows full project directory hierarchy with expand/collapse
- Context menu: New File, New Folder, Rename, Delete, Copy Path, Reveal in Terminal
- Multi-select for batch operations
- File icons by type (via a small icon font or emoji fallback)
- Search box at the top of the tree for quick file filtering
- Watcher integration — tree reflects file-system changes without manual refresh

---

### Integrated Git

A dedicated **Source Control** sidebar panel:

- Shows modified / staged / untracked files grouped by status
- Stage / unstage individual files or hunks (inline diff with `+`/`−` line decorations)
- Commit message box + `Commit` button; `Commit & Push` shortcut
- Branch switcher dropdown in the panel header; `New Branch` action
- **Diff view** — clicking a modified file opens a side-by-side diff in the editor pane
- **Blame** — `Toggle Blame` in the editor context menu annotates each line with author + commit hash

---

### Command Palette

`Ctrl+Shift+P` (or `Cmd+Shift+P` on macOS) opens a full fuzzy-search command palette:

- All editor actions registered as commands: `Open File`, `Close Tab`, `Split Right`, `Toggle Terminal`, `Run Tests`, `Format Document`, `Git: Stage All`, `Git: Commit`, …
- Recent commands shown at the top; keyboard shortcut displayed alongside each entry
- File search (`Ctrl+P`) and symbol search (`Ctrl+T` / `@` prefix) as nested modes within the same overlay
- Extensible — plugins register commands via the palette API

---

### Problems & Output Panels

A bottom panel with tabbed views extending the existing multi-tab terminal:

| Tab | Contents | Status |
|---|---|---|
| **Terminal** | Multiple named terminal tabs; up to 4 tabs with independent history | ✅ Done (ADR 173) |
| **Problems** | Linter / TypeScript errors and warnings; click to jump to source location | Planned |
| **Output** | Stdout/stderr from background tasks and workflow runs | Planned |
| **Test Results** | Pass/fail tree from the last test run; re-run button; click to navigate to failing test | Planned |
| **Task Log** | Real-time streaming log from the selected active task | Planned |

---

### Inline AI Completion (Copilot-style)

Ghost-text completions powered by the configured personality's LLM:

- Suggestions appear as greyed-out ghost text at the cursor as the user pauses typing (debounced 400 ms)
- `Tab` accepts the full suggestion; `Ctrl+→` accepts word-by-word; `Escape` dismisses
- `Alt+]` / `Alt+[` cycle through alternative suggestions
- Powered by an existing MCP tool call — uses the `/api/v1/ai/complete` or chat stream already available
- Configurable: enable/disable per file type; max suggestion tokens; which personality provides completions

---

### Multi-File Search & Replace

- `Ctrl+Shift+F` opens a sidebar search panel
- Regex toggle; case-sensitive toggle; include / exclude glob patterns
- Results grouped by file with inline match preview and line numbers
- Replace-all with per-file or global confirmation; diff preview before applying

---

### Collaborative Editing

Realtime multi-cursor editing for multiple SecureYeoman users connected to the same instance:

- CRDT-based sync via [Yjs](https://github.com/yjs/yjs) over the existing WebSocket connection
- Remote cursors shown with user name labels in distinct colors
- Awareness panel: see who else has the file open; presence dot in the tab bar
- Conflict-free — no lock required; diverges gracefully when WebSocket drops and re-syncs on reconnect
- Gated by the `allowAdvancedEditor` security policy (Phase 57)

---

### Keyboard Shortcuts & Keybindings

- Full default keybinding set matching VS Code's defaults for familiarity
- **Keybindings editor** — Settings → Keyboard Shortcuts; search, filter by command, rebind with `Click to record`
- Bindings persisted to `localStorage` (Phase 1) then to `GET/PUT /api/v1/prefs/keybindings` (Phase 2, alongside mission-layout prefs)
- Import / export as JSON

---

### Layout Persistence

Per-workspace state survives page refresh:

- Open files and split-pane layout
- Panel sizes (explorer width, bottom panel height)
- Pinned tabs; active tab per pane
- Last cursor position per file
- Stored under `editor:workspace:<workspaceId>` in `localStorage` (Phase 1); server-side under `/api/v1/prefs/editor-workspace` (Phase 2)

---

### Responsive / Mobile Layout

- **Narrow viewport (< 768 px)** — single column: explorer hidden (accessible via hamburger), editor full width, bottom panel collapsed by default
- **Touch support** — tap-to-navigate in explorer; swipe-left to reveal explorer; pinch-zoom in editor
- **Tablet landscape** — two-column (explorer + editor, no task panel unless explicitly opened)

---

### Training Integration

- **"Export to Training Data"** context menu action on any selected code block — pre-fills the Training tab export dialog with the selection as a raw sample
- **Annotation mode** — highlight a response block, mark it as `good` / `bad`; annotations stored in the distillation job dataset automatically

---

### Implementation Sequence

- [ ] **Tab bar + multi-file state** — `EditorTab[]` state, open/close/reorder, dirty tracking, confirm-on-close
- [ ] **Split panes** — vertical/horizontal split; each pane has its own active tab; resize via drag handle
- [ ] **Project Explorer** — replace `FileManagerPanel` with full collapsible tree; context menu; file watcher
- [ ] **Multi-file search** — sidebar panel with Grep-backed search; regex + glob filters; replace-all
- [ ] **Command palette** — overlay with fuzzy search; all editor actions registered; file + symbol search modes
- [ ] **Problems / Output / Test Results tabs** — bottom panel tab bar; linter error feed; test result tree
- [ ] **Integrated Git panel** — modified/staged/untracked grouping; stage hunks; commit; branch switcher; diff view; blame
- [ ] **Inline AI completion** — ghost text at cursor; debounced LLM call; Tab/Escape/cycle shortcuts
- [ ] **Keybindings editor** — Settings page Keyboard Shortcuts tab; record binding; localStorage + server sync
- [ ] **Layout persistence** — workspace state per project ID in localStorage; server-side prefs endpoint
- [ ] **Collaborative editing** — Yjs CRDT over existing WebSocket; remote cursors; awareness panel
- [ ] **Responsive layout** — single-column narrow viewport; swipe-to-reveal explorer; touch support
- [ ] **Training integration** — "Export to Training Data" context menu action; annotation mode
- [ ] **Plugin / extension system** *(stretch goal)* — editor plugins register commands, panels, and language support via a stable internal API

---

## Phase 101: Inline Citations & Grounding

**Priority**: P4 — Trust layer. Groundedness enforcement is the anchor item; web grounding is a stretch goal. Requires the Phase 82 knowledge base retrieval layer (complete — see [knowledge-base.md](../guides/knowledge-base.md)).

Inspired by Google Cloud Vertex AI Grounding and Azure Groundedness Detection.

- [ ] **Source-attributed responses** — When the AI uses retrieved knowledge base documents in a response, inject inline citations (`[1]`, `[2]`) and render a **Sources** section at the bottom of the response. Citation text includes: document title, page/chunk number, and a short excerpt. Stored as structured metadata on the conversation turn. Enabled per personality via `enableCitations: boolean`.
- [ ] **Groundedness enforcement** — Post-processing pass: before returning a response, check each factual claim against the retrieved chunks using an embedding similarity threshold. Claims with no supporting chunk above threshold are flagged as `[unverified]` inline. Configurable mode: `annotate_only`, `block_unverified`, or `strip_unverified`.
- [ ] **Web grounding** — Ground AI responses in live web search results, not just the local knowledge base. When web grounding is enabled and the query requires current information, perform a search (via existing web-search MCP tool), retrieve top results, and include them as retrieved context with citations.
- [ ] **Grounding confidence score** — Per-response aggregate grounding score: what fraction of claims are supported by retrieved sources above threshold? Stored on the conversation turn. Low-grounding responses flagged in the Audit Log. Rolling average per personality surfaced in the Analytics tab as a "Response Trustworthiness" metric.
- [ ] **Citation feedback** — Users can click a citation to see the full source chunk in a side drawer. They can mark citations as "not relevant" — negative feedback stored as a weak signal for the knowledge base quality scoring system.

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

*Extends Phase 98 with advanced training objectives, scale, and continual learning. Demand-gated pending real-world usage of the Phase 64 + 73 + 98 pipeline.*

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

*Last updated: 2026-03-01 — Phases 89 (Marketplace Shareables), 90 (CI/CD Integration), 91 (Native Clients Scaffold), 92 (Adaptive Learning Pipeline), Dual Licensing (ADR 171), Canvas Workspace (78b) all complete. Roadmap reorganised: phases 93–101 replace legacy numbering (78a/81/83/85/86/87/88/90); completed phases removed from body. See [Changelog](../../CHANGELOG.md) for full history.*
