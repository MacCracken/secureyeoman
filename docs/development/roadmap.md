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
- [ ] **Base knowledge generic entries per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally. These may need per-personality variants. Low urgency.
- [ ] **Consumer UX: Settings page split** — Extract `<AuditChainTab>`, `<SoulSystemTab>`, `<RateLimitingTab>` from the `SettingsPage.tsx` monolith into dedicated tab components.

---

## Timeline

| Phase | Name | Priority | Status |
|-------|------|----------|--------|
| XX | QA & Manual Testing | P1 — ongoing | 🔄 Continuous |
| — | Dashboard Performance Optimization | P1 — cross-cutting | ✅ Complete |
| 78 | Advanced Editor — Full IDE Mode | P2 — power user priority | Ready |
| 79 | Multi-Instance Federation | P2 — platform surface | Planned |
| 80 | API Gateway Mode | P2 — platform surface | Planned |
| 81 | Conversation Branching & Replay | P3 — developer experience | Planned |
| 82 | Knowledge Base & RAG Platform | P3 — knowledge platform | Planned |
| 86 | Inline Citations & Grounding | P4 — trust layer | Planned *(requires Phase 82)* |
| 83 | Content Guardrails | P3 — enterprise compliance | Planned *(grounding check requires Phase 82)* |
| 84 | LLM-as-Judge Evaluation | P3 — ML quality signal | Planned |
| 85 | Conversation Analytics | P3 — operational insight | Planned |
| 87 | LLM Lifecycle Platform — Core | P4 — model ops | Planned |
| 88 | Marketplace Shareables | P4 — community growth | Planned |
| Future | Observability & Telemetry, Workflow & Personality Versioning, LLM Lifecycle Advanced, Responsible AI, Voice Pipeline, Native Clients, Infrastructure | Future / Demand-Gated | — |

---

## Phase 78: Advanced Editor — Full IDE Mode

**Priority**: P2 — High value for power users.

**Status**: Ready. The current Advanced Editor (`/editor` → Advanced mode) provides a Monaco pane, a file manager, a task panel, and an embedded terminal. This phase upgrades it into a self-contained browser IDE on par with VS Code's web mode.

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

A bottom panel with tabbed views replacing the current single `MultiTerminal`:

| Tab | Contents |
|---|---|
| **Terminal** | Multiple named terminal tabs; resize via drag handle |
| **Problems** | Linter / TypeScript errors and warnings; click to jump to source location |
| **Output** | Stdout/stderr from background tasks and workflow runs |
| **Test Results** | Pass/fail tree from the last test run; re-run button; click to navigate to failing test |
| **Task Log** | Real-time streaming log from the selected active task |

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

## Phase 79: Multi-Instance Federation

**Priority**: P2 — Platform surface expansion. The A2A protocol already enables cross-instance agent delegation. Extend to allow SecureYeoman instances to share knowledge bases, personalities, and skills — useful for enterprise deployments with multiple teams.

- [ ] **Instance registry** — Peer SecureYeoman instances register with each other via `POST /api/v1/federation/peers` (URL + shared secret). Peers listed in a new Federation tab in ConnectionsPage. Health checks via `GET /api/v1/health/ready` poll.
- [ ] **Knowledge base federation** — Query a peer instance's knowledge base from a local personality. `kb_search` MCP tool gains `instanceId?` param; routes to peer's `/api/v1/brain/search` via the authenticated federation channel.
- [ ] **Personality export/import** — Export a full personality bundle (config + skills + knowledge base + voice profile) as an encrypted archive. Import on another instance with credentials re-mapping. Enables team-to-team personality transfer without manual re-configuration.
- [ ] **Federated marketplace** — Browse and install skills from a peer instance's marketplace. Pull-model: local admin approves which peer's marketplace to federate. No central server required.

---

## Phase 80: API Gateway Mode

**Priority**: P2 — Platform surface expansion. Use SecureYeoman as an authenticated AI proxy and middleware layer — external applications POST a prompt + personality ID and receive a response, without needing direct LLM API access or system prompt management.

- [ ] **Gateway endpoint** — `POST /api/v1/gateway` accepts `{ personalityId, messages[], stream? }` with an API key. Returns the personality's response (streaming or buffered). The personality's full system prompt, tool set, memory, and guardrails apply transparently. External apps never see the underlying model or credentials.
- [ ] **Per-key personality binding** — Each API key can be pre-bound to a specific personality ID; the `personalityId` field becomes optional. Useful for embedding a specific agent in a product without exposing configuration.
- [ ] **Rate limiting per key** — Gateway API keys have configurable rate limits (requests/min, tokens/day) enforced at the gateway layer. Quota exhausted → `429` with `Retry-After`. Usage tracked per key in `auth.api_key_usage`.
- [ ] **Gateway analytics** — Dashboard panel showing per-key usage, latency percentiles, error rates, and top personalities accessed. Export as CSV for billing/chargeback in multi-team deployments.

---

## Phase 81: Conversation Branching & Replay

**Priority**: P3 — Developer experience. Git-like branching of conversations enables prompt engineering workflows, model comparison, and debugging without losing conversation history.

- [ ] **Branch from message** — Right-click any message in a conversation → "Branch from here". Creates a new conversation forked at that point. Fork relationship stored in `conversations.parent_conversation_id` + `conversations.fork_message_index`. Dashboard: branch indicator icon in the conversation list.
- [ ] **Replay with different model** — From a completed conversation, select "Replay" → choose a different model or personality configuration. The replay re-runs all user turns through the new config. Side-by-side diff view comparing original vs. replay responses.
- [ ] **Branch tree view** — Visualise the tree of conversation forks for a root conversation. Nodes show fork point, model config, and outcome (user rating or quality score). Useful for systematic prompt engineering iterations.
- [ ] **Replay batch** — Select a set of conversations and replay them all with a new model config. Results aggregated as a quality comparison report. Essentially a manual A/B test on historical traffic.

---

## Phase 82: Knowledge Base & RAG Platform

**Priority**: P3 — Knowledge platform. Transforms SecureYeoman from a conversation system into a knowledge system. Document ingestion unlocks enterprise use cases that the current memory-only brain cannot serve, and enables the grounding and guardrails phases that follow.

Inspired by Amazon Bedrock Knowledge Bases + Kendra + Q Business.

- [ ] **Document ingestion** — Upload PDF, DOCX, HTML, Markdown, or plain text files via the dashboard. Files are automatically chunked (configurable strategy: fixed-size, sentence-boundary, or semantic), embedded with the active embedding model, and stored in the personality's vector namespace. Supports drag-and-drop + multi-file batch upload. `POST /api/v1/brain/documents/upload` (multipart). Ingestion status tracked as a background task.
- [ ] **Multimodal document extraction** — For PDFs and images, extract text using a Tesseract or Docling sidecar before embedding. Handles scanned documents, invoices, diagrams with captions. Inspired by Amazon Textract. Runs as a pre-processing step before the embedding pipeline.
- [ ] **Knowledge base MCP tools** — `kb_search(query, personalityId?, topK?)`, `kb_add_document(url_or_text)`, `kb_list_documents()`, `kb_delete_document(id)`. AI can query its own knowledge base mid-conversation and self-populate it with discovered URLs or pasted content.
- [ ] **Hybrid search** — Combine vector similarity (semantic) with BM25 keyword search. Reciprocal Rank Fusion to merge ranked lists. Configurable alpha weight between semantic and keyword scores. Improves recall for exact-term queries (part numbers, proper nouns) where pure embedding search underperforms.
- [ ] **Enterprise knowledge connectors** — Sync content from external sources into the personality's knowledge base on a configurable schedule. MVP connectors:
  - `github_wiki` — Clone and index a GitHub repo's wiki or markdown docs
  - `notion` — Sync Notion pages/databases via Notion API
  - `confluence` — Sync Confluence spaces via Confluence REST API
  - `google_drive` — Sync Google Drive folder via OAuth (reuse existing Google integration)
  - `web_crawl` — Crawl a URL with configurable depth; index pages as documents
  - Connector config stored in personality settings; sync history in dashboard Knowledge tab
- [ ] **Document access control** — Per-document `visibility: 'private' | 'shared'`. Private documents visible only to the owning personality's queries. Shared documents available to all personalities. Enforced at query time via namespace prefix filtering.
- [ ] **Knowledge base analytics** — Track which documents are retrieved most often, which queries return low-relevance results (below configurable similarity threshold), and coverage gaps (queries with no results). Surface as a "Knowledge Health" panel in the dashboard.

---

## Phase 86: Inline Citations & Grounding

> **Requires Phase 82 (Knowledge Base & RAG Platform)** — all items depend on the retrieval layer delivered there.

**Priority**: P4 — Trust layer. Groundedness enforcement is the anchor item; web grounding is a stretch goal.

Inspired by Google Cloud Vertex AI Grounding and Azure Groundedness Detection.

- [ ] **Source-attributed responses** — When the AI uses retrieved knowledge base documents in a response, inject inline citations (`[1]`, `[2]`) and render a **Sources** section at the bottom of the response. Citation text includes: document title, page/chunk number, and a short excerpt. Stored as structured metadata on the conversation turn. Enabled per personality via `enableCitations: boolean`.
- [ ] **Groundedness enforcement** — Post-processing pass: before returning a response, check each factual claim against the retrieved chunks using an embedding similarity threshold. Claims with no supporting chunk above threshold are flagged as `[unverified]` inline. Configurable mode: `annotate_only`, `block_unverified`, or `strip_unverified`.
- [ ] **Web grounding** — Ground AI responses in live web search results, not just the local knowledge base. When web grounding is enabled and the query requires current information, perform a search (via existing web-search MCP tool), retrieve top results, and include them as retrieved context with citations.
- [ ] **Grounding confidence score** — Per-response aggregate grounding score: what fraction of claims are supported by retrieved sources above threshold? Stored on the conversation turn. Low-grounding responses flagged in the Audit Log. Rolling average per personality surfaced in the Analytics tab as a "Response Trustworthiness" metric.
- [ ] **Citation feedback** — Users can click a citation to see the full source chunk in a side drawer. They can mark citations as "not relevant" — negative feedback stored as a weak signal for the knowledge base quality scoring system.

---

## Phase 83: Content Guardrails

**Priority**: P3 — Enterprise compliance. Required for regulated industries (healthcare, finance, legal). PII redaction and topic restrictions are the must-have items; toxicity and grounding checks are the depth tier.

Complements Phase 77 (Prompt Security) which guards the input side. This phase operates on AI outputs before they reach the user.

- [ ] **PII detection & redaction** — Detect and optionally redact personally identifiable information in AI outputs before they reach the user: names, email addresses, phone numbers, SSNs, credit card numbers, IP addresses. Configurable per personality: `detect_only` (flag + audit) or `redact` (replace with `[REDACTED]`). Uses NER model (spaCy or Comprehend-compatible) or regex patterns for low-latency enforcement.
- [ ] **Topic restrictions** — Block AI from discussing configurable topic categories, regardless of system prompt. Example: `blocked_topics: ['competitor products', 'legal advice', 'medical diagnosis']`. Implemented as an embedding-based classifier: compare the input/output embedding against a set of seed topic embeddings; block if similarity exceeds threshold. Configurable per personality in the security settings.
- [ ] **Toxicity filter** — Block or warn on outputs containing hate speech, harassment, or explicit content. Uses an external classifier endpoint (configurable: local Ollama model, OpenAI Moderation API, or custom). Modes: `block` (refuses to send output), `warn_user`, `audit_only`.
- [ ] **Custom block lists** — Per-personality keyword/phrase deny lists with regex support. Applied as a fast pre-filter before the semantic checks. Useful for brand protection, legal compliance, or content policy enforcement.
- [ ] **Guardrail audit trail** — Every guardrail trigger (PII redaction, topic block, toxicity flag) logged to the audit chain with: rule that fired, original content hash (not plaintext), action taken, and conversation ID. Queryable in the Audit Log tab with a "Guardrail Events" filter.
- [ ] **Grounding check** *(requires Phase 82)* — Detect hallucinated citations or factual claims that contradict the personality's knowledge base. If the AI asserts a fact with a citation, verify the citation exists in the knowledge base. Flag unverifiable claims with a `[unverified]` annotation in the response. Optional mode: block responses with unverifiable claims outright.

---

## Phase 84: LLM-as-Judge Evaluation

**Priority**: P3 — Closes the ML quality loop. Phase 73 delivered the pipeline mechanics (data_curation → training_job → evaluation → conditional_deploy → human_approval). This phase adds the qualitative signal layer that makes evaluation trustworthy beyond loss metrics.

Inspired by Google Cloud Vertex AI Evaluation Service and Azure AI Evaluation SDK.

- [ ] **Pointwise LLM scoring** — For each response in an evaluation set, prompt the judge model to rate it on: **groundedness**, **coherence**, **relevance**, **fluency**, **harmlessness**. Each dimension scored 1–5 with a brief rationale. Scores stored per experiment in `training.eval_scores`. Dashboard: radar chart per dimension for each experiment.
- [ ] **Pairwise comparison** — Given two model versions (e.g., base vs. DPO-tuned), prompt the judge to select the better response for each test prompt. Win rate computed across the full eval set. Pairwise results visible in the A/B testing view alongside the production shadow-routing data.
- [ ] **Auto-eval on finetune completion** — Configurable: when a finetune job completes, automatically run LLM-as-Judge pointwise eval on the held-out set and attach scores to the experiment record. If mean groundedness or coherence drops below threshold, pipeline blocks the deployment step and sends a notification. Zero-touch quality gate.
- [ ] **Evaluation dataset versioning** — Pin the held-out evaluation set at job creation time (snapshot of prompt/expected-response pairs). Eval scores are always against the same snapshot, so experiments are directly comparable even as the training corpus grows. Stored in `training.eval_datasets` with a content hash.
- [ ] **Custom judge prompts** — Per-personality judge prompt templates: define what "good" means for a specific personality. Judge model and judge prompt configurable independently of the personality's inference model.

---

## Phase 85: Conversation Analytics

**Priority**: P3 — Operational intelligence. Surfaces the hidden signal in the conversation store. Sentiment and engagement metrics are fast wins that feed directly into the training curation pipeline. Entity extraction and anomaly detection are deeper investments.

Inspired by Amazon Comprehend.

- [ ] **Sentiment tracking** — Per-turn sentiment score (positive / neutral / negative) computed asynchronously after each AI response. Stored in `conversations.turn_sentiments`. Dashboard: sentiment trend chart per personality over time; alert when rolling average drops below threshold. Feeds directly into the quality scorer for training data curation.
- [ ] **Engagement metrics** — Per-personality metrics: average conversation length, follow-up question rate (proxy for clarity), conversation abandonment rate, and tool-call success rate. Surfaced in a new Analytics tab in the dashboard alongside the existing cost metrics.
- [ ] **Conversation summarisation pipeline** — Batch job that computes a 2–3 sentence summary for each conversation above a configurable length. Summaries stored on the conversation record and surfaced in the conversation list (replacing the current raw first-turn preview). Also feeds the knowledge base: long conversations can be summarised and added as documents automatically.
- [ ] **Key phrase extraction** — Surface the most frequent topics discussed per personality over a rolling window. Dashboard: "Topic Cloud" widget in the Analytics tab. Useful for identifying gaps between what users ask about vs. what the personality's knowledge base covers.
- [ ] **Entity extraction** — Extract named entities (people, organisations, locations, products, dates) from conversation history using an NER model. Stored as tags on conversations. Enables searching conversations by entity (`GET /api/v1/conversations?entity=AcmeCorp`) and building a graph of frequently discussed topics per personality.
- [ ] **Anomaly detection on usage patterns** — Flag unusual usage spikes (10× normal message rate), off-hours activity from known users, or patterns consistent with credential stuffing. Generates audit events and optionally triggers notifications via the existing NotificationManager.

---

## Phase 87: LLM Lifecycle Platform — Core

**Priority**: P4 — Model operations. Phase 64 + 73 built the pipeline mechanics (distillation, fine-tuning, Ollama lifecycle, curation, evaluation, deploy). This phase adds the operational layer that makes model development reproducible and the deployment story complete.

Advanced items (DPO, RLHF, continual learning, multi-GPU) are demand-gated in the Future Features section.

### Data Collection & Curation

- [ ] **Conversation quality scorer** — Automatic quality signal on completed conversations: response length distribution, tool-call success rate, user re-prompt rate (proxy for dissatisfaction). Score stored per conversation; surfaced in the Training tab as a sortable column.
- [ ] **Preference annotation UI** — In-chat thumbs-up / thumbs-down on individual AI turns. Multi-turn annotation: mark a full conversation as a positive or negative example. Annotations stored in `training.preference_pairs` for DPO.
- [ ] **Data curation pipeline** — Filter, deduplicate, and shard conversation exports before training. Configurable rules: min/max token length, quality score threshold, dedup by semantic similarity (embedding cosine > 0.95), exclude conversations with tool errors. Preview filtered dataset size before committing to a job.
- [ ] **Synthetic data generation** — Use the teacher model to generate diverse training scenarios from a seed prompt or skill description. Configurable temperature sweep for variety, auto-labeled by teacher confidence.

### Experiment Tracking & Evaluation

- [ ] **Experiment registry** — Every training run logged as an experiment with: dataset snapshot hash, hyperparameters, environment, training loss curve, eval metrics. Stored in `training.experiments`. Dashboard: Experiments sub-tab in TrainingTab with filter/sort and diff view between any two runs.
- [ ] **Loss curve visualisation** — Real-time training/eval loss chart (recharts line graph) streaming from the Unsloth trainer via SSE. Visible in the finetune job detail panel while the job is running.
- [ ] **Side-by-side model comparison** — Given two model checkpoints, run the same prompt set through both and display responses side-by-side in the dashboard. Human rater can pick the better response; ratings feed back into the preference dataset.

### Deployment Pipeline

- [ ] **One-click deploy to personality** — "Deploy to Personality" button on a completed finetune job. Calls `ollama cp` to register the GGUF under a versioned name (`personality-friday-v3`), then updates the personality's `defaultModel` field. Rollback: previous model name preserved.
- [ ] **Model version registry** — `training.model_versions` table: `(personality_id, model_name, experiment_id, deployed_at, is_active)`. Dashboard: Deployed Models tab with version history, deploy/rollback actions, and diff link to source experiment.
- [ ] **A/B testing (model shadow routing)** — Route X% of conversations to model version A and Y% to model version B. Aggregate quality scores, response times, and user preference signals per variant. Dashboard shows statistical significance and recommends promoting the winner.
- [ ] **Inference profile** — Per-personality inference settings: context window size, generation temperature, top-p, repetition penalty, system prompt injection. Stored alongside the model version.
- [ ] **Model import from HuggingFace Hub** — Pull any public GGUF from HuggingFace Hub directly via the dashboard. `POST /api/v1/model/hub/pull` streams progress SSE.
- [ ] **Quantization advisor** — Given a model name and available VRAM, recommend the best quantization level (Q4_K_M, Q5_K_M, Q8_0, F16). Shows estimated VRAM, inference speed, and quality degradation relative to F16.

---

## Phase 88: Marketplace Shareables

**Priority**: P4 — Community growth. Pursue once the marketplace has meaningful usage (>100 active skill installs across instances) and users ask for workflow/template portability.

### Workflows & Swarm Templates as Shareables

*Currently the marketplace hosts skills and the community tab hosts community skills. This section explores extending that surface to workflows and swarm templates.*

**Proposed approach (if pursued):**
- Workflows: export as JSON with a `requires: { integrations[], tools[] }` manifest. Marketplace lists compatibility badges. Install = import + validate requirements + prompt user to resolve gaps.
- Swarm templates: export as JSON with `requires: { profileRoles[] }`. Install = register as a named template + prompt user to map existing personalities to required roles.
- Community tab hosts user-contributed versions; marketplace hosts curated/builtin versions — same two-tier pattern as skills.

- [ ] **Investigation spike** — Survey 5–10 active users: do they share workflows across instances today (manually)? Would installable swarm templates change how they build agents?
- [ ] **Compatibility manifest spec** — Define `requires` schema for workflows and swarm templates; validate on install.
- [ ] **Workflow export/import routes** — `GET /api/v1/workflows/:id/export` (JSON blob) + `POST /api/v1/workflows/import` (validate + create).
- [ ] **Swarm template export/import routes** — Same pattern; map roles to local personalities on import.
- [ ] **Marketplace/community UI** — Add "Workflows" and "Swarm Templates" tabs to marketplace and community pages; install flow with compatibility check.

### Skills on Sub-Agent Profiles

*Today, skills are installed on a personality. Sub-agent profiles have no Skills tab.*

- [ ] **Audit current data model** — Confirm whether builtin agent profiles (`builtin-intent-engineer`, etc.) are stored as `soul.personality` rows or separate. If not, plan migration path.
- [ ] **Skills tab on sub-agent profiles** — Show the Skills tab in PersonalityEditor when viewing a sub-agent profile. Conditionally hide persona-specific tabs (voice, avatar) if not relevant.
- [ ] **Swarm runner skill injection** — Confirm `buildAgentPrompt()` loads installed skills for sub-agent personality IDs; add test coverage.
- [ ] **UX: install skill → select target agent** — In the marketplace install flow, allow selecting a sub-agent profile as the install target.

---

## Future Features — Demand-Gated

Items below are planned but demand-gated or lower priority. Grouped by theme. Implementation order will be determined by adoption signals and user demand.

---

### Observability & Telemetry

*As SecureYeoman moves into production deployments, operators need distributed tracing, metrics export, and correlation tooling beyond what the built-in audit log provides.*

- [ ] **OpenTelemetry tracing** — Instrument all HTTP requests, AI completions, MCP tool calls, and workflow steps with OTEL spans. Export via OTLP to any compatible collector (Jaeger, Tempo, Honeycomb, Datadog). Configurable via `OTEL_EXPORTER_OTLP_ENDPOINT` env var. Trace IDs propagated in response headers for external correlation.
- [ ] **Prometheus metrics endpoint** — `GET /metrics` exposing: request counts + latency histograms by route, AI token usage counters by personality + model, active workflow run gauges, error rates, memory/CPU from existing health checks. Scrape-ready for Prometheus; Grafana dashboard templates provided.
- [ ] **Correlation IDs on all log lines** — Attach `conversation_id`, `personality_id`, `trace_id`, and `user_id` to every structured log line. Enables log-to-trace correlation in Grafana Loki, Datadog, and Elastic. Currently some fields on some lines; goal: all fields on all lines consistently.
- [ ] **Real-time metrics push to dashboard** — Extend the existing WebSocket broadcast to push lightweight metric snapshots (token spend, error rate, active sessions) to the Mission Control dashboard every 10s without page refresh. Removes the need to poll `/health/deep` for operational awareness.
- [ ] **Alerting integration** — When a metric threshold is breached (error rate spike, token budget exceeded, quality score drift, audit chain gap), fire an outbound alert via Slack webhook, PagerDuty Events API, OpsGenie, or generic HTTP POST. Alert rules configured in the dashboard with threshold + channel. Builds on the existing NotificationManager.
- [ ] **Distributed trace correlation across A2A calls** — When an agent delegates to a peer instance via A2A, propagate the OTEL `traceparent` header so the full delegation chain appears as a single trace in the collector. Requires trace context injection in the A2A client and extraction in the A2A server handler.
- [ ] **Structured log export** — Emit structured JSON logs (in addition to existing human-readable logs) with trace IDs, conversation IDs, and personality IDs attached. Compatible with Elastic Common Schema (ECS) and Datadog Log Integration. Configurable output: stdout (default), file, or syslog socket.
- [ ] **Grafana dashboard bundle** — Pre-built Grafana dashboard JSON (importable via dashboard ID) covering: token spend over time, personality activity heatmap, workflow success/failure rates, audit event stream, AI provider latency comparison. Bundled in `docs/ops/grafana/`.

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

*Extends Phase 87 with advanced training objectives, scale, and continual learning. Demand-gated pending real-world usage of the Phase 64 + 73 + 87 pipeline.*

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

*Demand-Gated — implement once REST/WebSocket API is stable and adoption justifies native packaging.*

- [ ] **Mobile app** — Native iOS/Android companion app. Primary view: chat interface + at-a-glance overview stats. Connects to existing REST + WebSocket API.
- [ ] **Cross-device sync** — Conversation history, personality state, and notification preferences synced across devices.
- [ ] **Desktop app** — Native desktop client (Electron or Tauri) wrapping the existing dashboard SPA. Adds system tray, native notifications, global keyboard shortcut, and auto-launch on login.
- [ ] **Auto-update** — In-app update flow via the platform's native update mechanism.

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

*Last updated: 2026-02-28 — Phase 77 (Prompt Security) complete and removed from open items. Phase 86 (Inline Citations & Grounding) moved to follow Phase 82 (Knowledge Base) in both the timeline and body — it is fully gate-locked on Phase 82. Phase 83 grounding-check item annotated as also requiring Phase 82. Phase 83's input-side reference corrected to Phase 77.*
