# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

## Timeline

| Phase | Name | Status |
|-------|------|--------|
| XX | Find & Repair (Ongoing) | Ongoing |
| 68 | Mission Control Customization | Next — high UX value |
| 70 | Advanced Editor — Full IDE Mode | Next — power user priority |
| Future | LLM Lifecycle Platform, Agent World, Voice, Native Clients, Infrastructure | Future / Demand-Gated |

---

## Phase XX: Find & Repair (Ongoing)

**Status**: Ongoing

Continuous bug discovery and repair pass — no fixed scope. As real-world usage surfaces regressions or rough edges, they are filed here, fixed, and moved to the Changelog. This phase never closes; it rolls forward with the project.

### Open Items

- [ ] **Manual test: Per-Personality Memory Scoping** — End-to-end verification of ADR 134. Steps: (1) Chat with T.Ron → save a memory, confirm it appears in T.Ron recall but NOT in FRIDAY recall; (2) Check heartbeat stats show different Memories counts for T.Ron and FRIDAY; (3) Enable Omnipresent Mind on FRIDAY → confirm FRIDAY can now recall T.Ron's memories; (4) Disable Omnipresent Mind → scoping restored; (5) Verify `/api/v1/brain/stats?personalityId=<id>` returns per-personality counts. *(No automated DB integration test yet)*
- [ ] **Manual test: SAML SP flow** — Configure SimpleSAMLphp (or mock). (1) `GET /api/v1/auth/sso/saml/:id/metadata` returns valid `<md:EntityDescriptor>` XML. (2) `GET /api/v1/auth/sso/authorize/:id` redirects to IdP with SAMLRequest. (3) Post-IdP redirect hits ACS, returns JWT in URL fragment.
- [ ] **Manual test: RLS tenant isolation** — Create tenant B via API. Insert `soul.personality` scoped to tenant B. Query personalities as tenant A → empty. Query as tenant B → record visible. Existing default-tenant data unaffected.
- [ ] **Base knowledge generic entries need per-personality review** — `hierarchy`, `purpose`, and `interaction` are currently seeded globally. These may need per-personality variants (e.g., T.Ron's purpose may differ from FRIDAY's). Low urgency — global entries are contextually correct for now.
- [ ] **Consumer UX: Settings page split** — Extract `<AuditChainTab>`, `<SoulSystemTab>`, `<RateLimitingTab>` from the `SettingsPage.tsx` monolith.
- [ ] **Manual test: OAuth token refresh end-to-end** — (1) Connect a Gmail account; (2) Wait for access token to expire (or use Connections → OAuth → "Refresh Token" button); (3) Confirm personality can still call `gmail_profile` without error; (4) Revoke the Google refresh token in Google Account → Security → Third-party apps, then trigger a Gmail tool call — confirm error message tells user to reconnect (not a silent 500). *(401-retry + forceRefreshById now implemented, 2026-02-27c)*
- [ ] ** Manual Test: AgentWorld** - sub-agents display when created, writing, meeting added and need review.
- [ ] **Manual Test: Skills** - continued review

---

## Phase 68: Mission Control Customization

**Status**: Next — high UX value for existing users.

Give users a configurable dashboard: choose which cards are visible, how large they are, and in what order. Persist layout per-user. No new server dependencies required; `localStorage` handles the common case.

---

### Card Registry

Define the full set of available Mission Control cards and their layout constraints. Each card is a named module that can be independently mounted or unmounted.

**Proposed card catalogue:**

| Card ID | Default | Min span | Label |
|---|---|---|---|
| `kpi-bar` | ✓ pinned | 12 | Key Performance Indicators |
| `resource-monitoring` | ✓ | 6 | CPU / Memory / Tokens |
| `system-topology` | ✓ | 4 | System Topology & Health |
| `active-tasks` | ✓ | 4 | Active Tasks |
| `workflow-runs` | ✓ | 4 | Workflow Runs |
| `security-events` | ✓ | 4 | Security Events |
| `audit-stream` | ✓ | 6 | Audit Stream |
| `integration-grid` | ✓ | 6 | Integration Status Grid |
| `quick-actions` | ✓ | 3 | Quick Actions |
| `agent-world` | ✗ opt-in | 12 | ASCII Agent World |
| `cost-breakdown` | ✗ opt-in | 6 | Cost Breakdown |
| `memory-explorer` | ✗ opt-in | 6 | Vector Memory Explorer |

`kpi-bar` is always pinned to the top — it cannot be removed or reordered.

**Implementation:**

```typescript
// dashboard/src/components/MissionControl/registry.ts
export interface CardDef {
  id: MissionCardId;
  label: string;
  description: string;
  defaultVisible: boolean;
  pinned?: boolean;        // cannot be removed
  minColSpan: 3 | 4 | 6 | 8 | 12;
  defaultColSpan: 3 | 4 | 6 | 8 | 12;
  defaultRowSpan: 1 | 2 | 3;
  component: React.LazyExoticComponent<...>;
}
```

---

### Layout Model & Persistence

**Phase 1 — localStorage (no backend):**

```typescript
// stored under key: 'mission-control:layout'
interface MissionLayout {
  version: 1;
  cards: Array<{
    id: MissionCardId;
    visible: boolean;
    colSpan: 3 | 4 | 6 | 8 | 12;  // within 12-col grid
    rowSpan: 1 | 2 | 3;
    order: number;
  }>;
}
```

Default layout is derived from the card registry if no saved layout exists. Unknown card IDs in saved layout are ignored; new cards added in future releases appear in their default position.

**Phase 2 — Server-side persistence (cross-device):**

- `GET /api/v1/prefs/mission-layout` → stored layout JSON
- `PUT /api/v1/prefs/mission-layout` → save layout
- Backed by a new `prefs` column on `auth.users` (JSONB) or a dedicated `user_prefs` table alongside the existing `user_notification_prefs` pattern
- `localStorage` remains as a write-through cache

---

### Customization UX

**Edit mode** (no page reload, no routing change):

- "Customize" button (Sliders icon) in the Mission Control header, next to the Control / Costs tab bar
- Clicking toggles `editMode: boolean` in component state
- In edit mode:
  - A card catalogue drawer/panel slides in from the right, listing all available cards with toggle switches for visibility
  - Each visible card gets a drag handle (grip icon, top-left)
  - Each visible card gets resize affordances (corner handle, or sm/md/lg size preset buttons in an overlay)
  - An "X" remove button appears on each non-pinned card
  - "Reset to defaults" link at the bottom of the catalogue panel
- Clicking "Done" exits edit mode; layout is saved to localStorage immediately

**Drag-to-reorder:**

- Use `@dnd-kit/core` + `@dnd-kit/sortable` (already a near-zero-cost addition; same library family as shadcn/ui drag patterns)
- Cards snap to 12-column grid positions; reorder is row-major
- Drag is disabled outside edit mode

**Resize:**

- Phase 1: size preset buttons (S / M / L) shown as a small pill overlay on hovered card in edit mode
  - S = `minColSpan`, M = `defaultColSpan`, L = full-width
  - Row height: 1 / 2 / 3 spans
- Phase 2: free drag-resize via `react-resizable` or custom CSS resize handles snapping to grid increments

---

### Implementation Sequence

- [ ] **Card registry + layout model** — `MissionCardId` union, `CardDef` registry, `MissionLayout` type, default layout derivation, `localStorage` read/write helpers.
- [ ] **Grid refactor** — Replace current hardcoded `div.grid` sections in `MissionControlTab` with a dynamic renderer that maps layout state to mounted card components via the registry.
- [ ] **Edit mode toggle** — "Customize" button in header; `editMode` state; overlay UI on cards (drag handle, remove, size presets).
- [ ] **Card catalogue panel** — Slide-in panel listing all cards with visibility toggles; "Reset to defaults"; "Done" button.
- [ ] **Drag-to-reorder** — Integrate `@dnd-kit/sortable`; apply only in edit mode; persist order to layout state.
- [ ] **Size presets** — S/M/L buttons on hovered card in edit mode; update `colSpan` + `rowSpan` in layout state.
- [ ] **Agent World widget** — Register `agent-world` card; hidden by default, opt-in via card catalogue.
- [ ] **Server-side persistence** — `user_prefs` table (or JSONB column on `auth.users`); `GET/PUT /api/v1/prefs/mission-layout`; write-through `localStorage` cache.
- [ ] **Free resize (stretch goal)** — CSS resize handles or `react-resizable` snapping to grid increments; replaces size preset buttons.

---

## Phase 70: Advanced Editor — Full IDE Mode

**Status**: Next — high value for power users.

The current Advanced Editor (`/editor` → Advanced mode) provides a Monaco pane, a file manager, a task panel, and an embedded terminal. This phase upgrades it into a self-contained browser IDE on par with VS Code's web mode — multiple open files, integrated source control, a command palette, inline AI completion, collaborative editing, and a responsive layout that degrades gracefully on narrow viewports.

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

A dedicated **Source Control** sidebar panel, replacing the current absence of VCS UI:

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
- Powered by an existing MCP tool call (no new backend endpoint required — uses the `/api/v1/ai/complete` or chat stream already available)
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

## Future Features

Items below are planned but demand-gated or lower priority. Grouped by theme for reference; implementation order will be determined by adoption signals and user demand.

---

### Marketplace & Community Shareables

*Currently the marketplace hosts skills and the community tab hosts community skills. This section explores extending that surface to workflows and swarm templates — making the full composition layer shareable and installable.*

#### Should workflows and swarm templates be marketplace/community sharables?

**The question:** Skills are already sharable units of instruction. Workflows (multi-step automation sequences) and swarm templates (multi-agent coordination blueprints) represent higher-order compositions. Should users be able to publish and install these the same way they install skills?

**The case for it:**
- Workflows encode reusable business logic (e.g. "review PR → summarize → post Slack update"). Today they live only in the instance that created them — no portability.
- Swarm templates encode proven multi-agent patterns (e.g. the Prompt Engineering Quartet). Today they are builtins only — community can't contribute new ones.
- A shared template for "Security Audit Swarm" or "Code Review Pipeline" is high-value and non-trivial to build from scratch; discovery solves a real user problem.
- The install model (clone into local instance, optionally bind to personalities) is well-understood from skills.

**The case against / risks:**
- Workflows reference concrete integration credentials and tool availability — a shared workflow may silently fail on an instance without the required integrations (e.g. a Gmail workflow on a non-Gmail instance).
- Swarm templates reference personality profiles by role tag — templates assume the target instance has matching profiles or the user knows to create them.
- Versioning and compatibility become harder when the shareable unit has runtime dependencies.

**Proposed approach (if pursued):**
- Workflows: export as JSON with a `requires: { integrations[], tools[] }` manifest. Marketplace lists compatibility badges. Install = import + validate requirements + prompt user to resolve gaps.
- Swarm templates: export as JSON with `requires: { profileRoles[] }`. Install = register as a named template + prompt user to map existing personalities to required roles (or create new ones).
- Community tab hosts user-contributed versions; marketplace hosts curated/builtin versions — same two-tier pattern as skills.

**Decision gate:** Pursue this once the marketplace has meaningful usage (>100 active skill installs across instances) and users ask for workflow/template portability. Premature abstraction risk is real here.

- [ ] **Investigation spike** — Survey 5–10 active users: do they share workflows across instances today (manually)? Would installable swarm templates change how they build agents?
- [ ] **Compatibility manifest spec** — Define `requires` schema for workflows and swarm templates; validate on install.
- [ ] **Workflow export/import routes** — `GET /api/v1/workflows/:id/export` (JSON blob) + `POST /api/v1/workflows/import` (validate + create).
- [ ] **Swarm template export/import routes** — Same pattern; map roles to local personalities on import.
- [ ] **Marketplace/community UI** — Add "Workflows" and "Swarm Templates" tabs to marketplace and community pages; install flow with compatibility check.

---

#### Install skills directly onto a sub-agent (not just via swarm templates)

*Today, skills are installed on a personality. When a swarm runs, sub-agents are spun up from profiles — but they don't inherit the parent personality's installed skills, and there's no way to install a skill directly onto a named sub-agent profile.*

**The gap:** A user who wants their `prompt-crafter` sub-agent to have the "Prompt Craft" skill must either (a) use a swarm template that bakes the instructions in, or (b) manually copy the skill text into the profile. Neither is ergonomic. The intent is: open a personality or sub-agent profile, go to Skills tab, install a skill — and the agent uses it when it runs, whether as a primary personality or as a sub-agent.

**Proposed approach:**
- Sub-agent profiles (builtin or custom) gain a Skills tab in the personality editor, identical to the one on full personalities.
- `skill.personalityId` already supports arbitrary personality IDs — sub-agent profiles are just personalities with `isSubAgent: true` (or matched by role tag).
- Skills installed on a sub-agent profile are injected into that agent's system prompt when it is activated in a swarm, same as they are for a primary personality in chat.
- The swarm runner's `buildAgentPrompt()` already calls `composeSoulPrompt()` — that function already loads installed skills for the personality ID. So the backend change may be zero if sub-agent profiles are stored as personalities.

**Open questions:**
- Are sub-agent profiles persisted as personality rows today? If yes, skills already work — the gap is purely UI (no Skills tab shown for sub-agent profiles in the editor).
- If not, do we promote sub-agent profiles to full personality rows, or add a lighter `agent_profiles` table that the skill system also reads?

- [ ] **Audit current data model** — Confirm whether builtin agent profiles (`builtin-intent-engineer`, etc.) are stored as `soul.personality` rows or separate. If not, plan migration path.
- [ ] **Skills tab on sub-agent profiles** — Show the Skills tab in PersonalityEditor when viewing a sub-agent profile. Conditionally hide persona-specific tabs (voice, avatar) if not relevant.
- [ ] **Swarm runner skill injection** — Confirm `buildAgentPrompt()` loads installed skills for sub-agent personality IDs; add test coverage.
- [ ] **UX: install skill → select target agent** — In the marketplace install flow, allow selecting a sub-agent profile as the install target (today only primary personalities are listed).

---

### LLM Lifecycle Platform

*Inspired by SageMaker AI's end-to-end ML toolchain. Phase 64 delivered the foundation (distillation, fine-tuning, Ollama lifecycle, local-first routing). This section extends it into a full model development and operations platform — data in, better model out, deployed to a personality, monitored in production.*

The platform covers four pillars: **collect → train → evaluate → deploy**, with feedback looping back to collect.

---

#### Pillar 1 — Data Collection & Curation

The highest-leverage investment. Model quality is bounded by data quality.

- [ ] **Conversation quality scorer** — Automatic quality signal on completed conversations: response length distribution, tool-call success rate, user re-prompt rate (proxy for dissatisfaction). Score stored per conversation; surfaced in the Training tab as a sortable column. Feeds the curation filter.
- [ ] **Preference annotation UI** — In-chat thumbs-up / thumbs-down on individual AI turns. Multi-turn annotation: mark a full conversation as a positive or negative example. Annotations stored in `training.preference_pairs` table with `(chosen, rejected)` turn pairs for DPO.
- [ ] **Data curation pipeline** — Filter, deduplicate, and shard conversation exports before training. Configurable rules: min/max token length, quality score threshold, dedup by semantic similarity (embedding cosine > 0.95), exclude conversations with tool errors. Preview filtered dataset size before committing to a job.
- [ ] **Synthetic data generation** — Use the teacher model to generate diverse training scenarios from a seed prompt or skill description. Configurable temperature sweep for variety, auto-labeled by teacher confidence. Populates the distillation job dataset without requiring real user interactions.
- [ ] **Data labeling mode** — Structured labeling interface for existing conversation exports: tag intent, annotate entity spans, rate response quality on a 5-point scale. Exports to HuggingFace `datasets`-compatible JSONL for external tooling interoperability.

---

#### Pillar 2 — Training

Extends the existing distillation + Unsloth fine-tuning pipeline with new training objectives and scale.

- [ ] **DPO (Direct Preference Optimization)** — Training objective that uses `(chosen, rejected)` pairs from the annotation UI directly. No reward model needed. New `training_method: 'dpo'` option on finetune jobs. `scripts/train_dpo.py` using TRL's `DPOTrainer`. Persona-specific DPO from a personality's annotated conversations produces a model with that personality's preferred response style baked in.
- [ ] **RLHF scaffolding** — Reward model training stage: fine-tune a small classifier on preference pairs to predict human preference score. Use the reward model to guide PPO or GRPO training. More complex than DPO but allows continuous reward signal from the live conversation scorer.
- [ ] **Hyperparameter search** — Grid or random search over key fine-tuning params: learning rate, LoRA rank, batch size, warmup steps, epochs. Each combination spawns a child job. Best checkpoint (lowest eval loss) promoted automatically. Results table in the Training tab with sortable columns.
- [ ] **Multi-GPU / distributed training** — `accelerate` + `deepspeed` integration in `scripts/train.py` for models that don't fit on a single GPU. Job spec gains `num_gpus` field; Docker Compose file gains `NVIDIA_VISIBLE_DEVICES` env injection. Applies to models 7B–70B on multi-GPU hosts.
- [ ] **Checkpoint management** — Save intermediate checkpoints at configurable step intervals. Resume interrupted jobs from the latest checkpoint. Checkpoint browser in the Training tab with per-step eval loss, disk size, and a "Set as active" action.

---

#### Pillar 3 — Experiment Tracking & Evaluation

SageMaker's core value proposition is making model development reproducible and comparable. SecureYeoman needs the same.

- [ ] **Experiment registry** — Every training run (distillation or fine-tune) logged as an experiment with: dataset snapshot hash, hyperparameters, environment (base model, GPU type), training loss curve, eval metrics. Stored in `training.experiments` table. Dashboard: Experiments sub-tab in TrainingTab with filter/sort and diff view between any two runs.
- [ ] **Automated evaluation suite** — Post-training eval on a held-out set. Metrics: perplexity, BLEU/ROUGE (for distillation), accuracy on a small skill-specific test set. For DPO/RLHF: preference win-rate against base model using the reward model or GPT-4 judge. Results attached to the experiment record and shown as a scorecard.
- [ ] **Side-by-side model comparison** — Given two model checkpoints (e.g., base vs fine-tuned), run the same prompt set through both and display responses side-by-side in the dashboard. Human rater can pick the better response; ratings feed back into the preference dataset.
- [ ] **Loss curve visualisation** — Real-time training/eval loss chart (recharts line graph) streaming from the Unsloth trainer via SSE. Visible in the finetune job detail panel while the job is running.
- [ ] **Benchmark harness** — Run a personality against a configurable set of benchmark tasks (custom JSON format: prompt + expected output + scorer function). Benchmark results stored per model version; surfaced in the experiment comparison view.

---

#### Pillar 4 — Deployment Pipeline

After training, getting the model into service should be one action.

- [ ] **One-click deploy to personality** — "Deploy to Personality" button on a completed finetune job. Calls `ollama cp` to register the GGUF under a versioned name (`personality-friday-v3`), then updates the personality's `defaultModel` field via `PATCH /api/v1/soul/personalities/:id`. Rollback: previous model name preserved, one click to revert.
- [ ] **Model version registry** — `training.model_versions` table: `(personality_id, model_name, experiment_id, deployed_at, is_active)`. A personality can have multiple versions; only one is active. Dashboard: Deployed Models tab with version history, deploy/rollback actions, and a diff link to the source experiment.
- [ ] **A/B testing (model shadow routing)** — For a chosen personality, route X% of conversations to model version A and Y% to model version B. Aggregate quality scores, response times, and user preference signals per variant. After a configurable conversation count, dashboard shows statistical significance and recommends promoting the winner.
- [ ] **Inference profile** — Per-personality inference settings: context window size, generation temperature, top-p, repetition penalty, system prompt injection. Stored alongside the model version. Allows "frozen" inference profiles for reproducible evaluation.
- [ ] **Model import from HuggingFace Hub** — Pull any public GGUF from HuggingFace Hub directly via the dashboard. `POST /api/v1/model/hub/pull` streams progress SSE. Installed model becomes available in the personality model selector. Extends `ollama pull` to the broader HuggingFace ecosystem.

---

#### Pillar 5 — Inference Optimization

SageMaker's inference story spans real-time, async, serverless, and batch. For a local-first system the equivalent is:

- [ ] **Quantization advisor** — Given a model name and available VRAM, recommend the best quantization level (Q4_K_M, Q5_K_M, Q8_0, F16). Shows estimated VRAM, inference speed (tok/s), and quality degradation relative to F16. Integrated into the model pull UI and the fine-tune deploy dialog.
- [ ] **Async / batch inference** — `POST /api/v1/ai/batch` accepts an array of prompts and returns a job ID. Worker processes prompts in a queue (configurable concurrency). Results retrievable via `GET /api/v1/ai/batch/:id`. Useful for running evaluation suites or bulk annotation without blocking the chat interface.
- [ ] **KV-cache warming** — Pre-warm Ollama's KV cache with a personality's system prompt on startup (or on first activation). Measured as reduced time-to-first-token for chat sessions. Exposed as `warmupOnActivation: boolean` in personality settings.
- [ ] **Speculative decoding** — When a small draft model is available alongside a large target model, use the draft to propose token sequences that the target verifies in parallel. Configuration: `draftModel` field on the personality's inference profile. Can double effective throughput for long-form responses.
- [ ] **Response caching** — Semantic cache for repeated or near-duplicate prompts (embedding cosine > configurable threshold). Cache backed by the existing vector store. Cache hit returns stored response instantly; miss falls through to inference. Cache stats in the AI health endpoint and ModelWidget.

---

#### Pillar 6 — Continual Learning Loop

Closing the loop: production conversations → data curation → training → evaluation → deployment → better conversations.

- [ ] **Automatic dataset refresh** — Scheduled job (configurable cadence) that runs the curation pipeline on conversations accumulated since the last training run and appends clean samples to the active distillation dataset. Triggered by a cron expression in the job config.
- [ ] **Drift detection** — Monitor quality score distribution of recent conversations vs. the training-period baseline. Alert (notification + dashboard banner) when mean quality drops more than a configurable threshold — signal that the deployed model has drifted or that user intent has shifted. Feeds back to trigger a new training run.
- [ ] **Online adapter updates** — Lightweight LoRA adapter updates from individual conversations using gradient accumulation, without a full retrain. Replay buffer prevents catastrophic forgetting. Runs as a background process with a token-budget cap per hour. Revisit once the fine-tuning pipeline has meaningful real-world usage.
- [ ] **Training from scratch** — Pre-train on a curated local corpus. Scoped to small models (≤3B params) as domain-specific lightweight specialists. Depends on the fine-tuning and experiment tracking pipelines being battle-tested.

---

### Knowledge Base & RAG Platform

*Inspired by Amazon Bedrock Knowledge Bases + Kendra + Q Business. SecureYeoman's current brain stores manually written memories. This extends it to ingest and query arbitrary documents and enterprise data sources.*

- [ ] **Document ingestion** — Upload PDF, DOCX, HTML, Markdown, or plain text files via the dashboard. Files are automatically chunked (configurable strategy: fixed-size, sentence-boundary, or semantic), embedded with the active embedding model, and stored in the personality's vector namespace. Supports drag-and-drop + multi-file batch upload. `POST /api/v1/brain/documents/upload` (multipart). Ingestion status tracked as a background task.
- [ ] **Multimodal document extraction** — For PDFs and images, extract text using a Tesseract or Docling sidecar before embedding. Handles scanned documents, invoices, diagrams with captions. Inspired by Amazon Textract. Runs as a pre-processing step before the embedding pipeline.
- [ ] **Knowledge base MCP tools** — `kb_search(query, personalityId?, topK?)`, `kb_add_document(url_or_text)`, `kb_list_documents()`, `kb_delete_document(id)`. AI can query its own knowledge base mid-conversation and self-populate it with discovered URLs or pasted content.
- [ ] **Hybrid search** — Combine vector similarity (semantic) with BM25 keyword search. Reciprocal Rank Fusion to merge ranked lists. Configurable alpha weight between semantic and keyword scores. Improves recall for exact-term queries (part numbers, proper nouns) where pure embedding search underperforms.
- [ ] **Enterprise knowledge connectors** — Sync content from external sources into the personality's knowledge base on a configurable schedule. Inspired by Q Business (40+ source connectors). MVP connectors:
  - `github_wiki` — Clone and index a GitHub repo's wiki or markdown docs
  - `notion` — Sync Notion pages/databases via Notion API
  - `confluence` — Sync Confluence spaces via Confluence REST API
  - `google_drive` — Sync Google Drive folder via OAuth (reuse existing Google integration)
  - `web_crawl` — Crawl a URL with configurable depth; index pages as documents
  - Connector config stored in personality settings; sync history in dashboard Knowledge tab
- [ ] **Document access control** — Per-document `visibility: 'private' | 'shared'`. Private documents visible only to the owning personality's queries. Shared documents available to all personalities (e.g., a company knowledge base). Enforced at query time via namespace prefix filtering.
- [ ] **Knowledge base analytics** — Track which documents are retrieved most often, which queries return low-relevance results (below configurable similarity threshold), and coverage gaps (queries with no results). Surface as a "Knowledge Health" panel in the dashboard.

---

### Content Guardrails

*Inspired by Amazon Bedrock Guardrails. Complements the existing security policy system (role-based access, emergency stop) with semantic content controls that operate at inference time — on both inputs from users and outputs from the AI.*

- [ ] **PII detection & redaction** — Detect and optionally redact personally identifiable information in AI outputs before they reach the user: names, email addresses, phone numbers, SSNs, credit card numbers, IP addresses. Configurable per personality: `detect_only` (flag + audit) or `redact` (replace with `[REDACTED]`). Uses NER model (spaCy or Comprehend-compatible) or regex patterns for low-latency enforcement.
- [ ] **Topic restrictions** — Block AI from discussing configurable topic categories, regardless of system prompt. Example: `blocked_topics: ['competitor products', 'legal advice', 'medical diagnosis']`. Implemented as an embedding-based classifier: compare the input/output embedding against a set of seed topic embeddings; block if similarity exceeds threshold. Configurable per personality in the security settings.
- [ ] **Toxicity filter** — Block or warn on outputs containing hate speech, harassment, or explicit content. Uses an external classifier endpoint (configurable: local Ollama model, OpenAI Moderation API, or custom). Modes: `block` (refuses to send output), `warn_user`, `audit_only`.
- [ ] **Custom block lists** — Per-personality keyword/phrase deny lists with regex support. Applied as a fast pre-filter before the semantic checks. Useful for brand protection ("do not mention X competitor"), legal compliance ("do not make guarantees about Y"), or content policy enforcement.
- [ ] **Guardrail audit trail** — Every guardrail trigger (PII redaction, topic block, toxicity flag) logged to the audit chain with: rule that fired, original content hash (not plaintext), action taken, and conversation ID. Queryable in the Audit Log tab with a "Guardrail Events" filter.
- [ ] **Grounding check** — Detect hallucinated citations or factual claims that contradict the personality's knowledge base. If the AI asserts a fact with a citation, verify the citation exists in the knowledge base. Flag unverifiable claims with a `[unverified]` annotation in the response. Optional mode: block responses with unverifiable claims outright.

---

### Conversation Analytics

*Inspired by Amazon Comprehend. The raw conversation store is an underutilised signal source. Analytics pipelines turn it into actionable intelligence for model improvement, UX optimisation, and operational insight.*

- [ ] **Sentiment tracking** — Per-turn sentiment score (positive / neutral / negative) computed asynchronously after each AI response. Stored in `conversations.turn_sentiments`. Dashboard: sentiment trend chart per personality over time; alert when rolling average drops below threshold. Feeds directly into the quality scorer for training data curation.
- [ ] **Entity extraction** — Extract named entities (people, organisations, locations, products, dates) from conversation history using an NER model. Stored as tags on conversations. Enables searching conversations by entity (`GET /api/v1/conversations?entity=AcmeCorp`), auto-populating the knowledge base with discovered entities, and building a graph of frequently discussed topics per personality.
- [ ] **Key phrase extraction** — Surface the most frequent topics discussed per personality over a rolling window. Dashboard: "Topic Cloud" widget in the Analytics tab. Useful for identifying gaps between what users ask about vs. what the personality's knowledge base covers.
- [ ] **Conversation summarisation pipeline** — Batch job that computes a 2-3 sentence summary for each conversation above a configurable length. Summaries stored on the conversation record and surfaced in the conversation list (replacing the current raw first-turn preview). Also feeds the knowledge base: long conversations can be summarised and added as documents automatically.
- [ ] **Engagement metrics** — Per-personality metrics: average conversation length, follow-up question rate (proxy for clarity), conversation abandonment rate (user stops mid-conversation), and tool-call success rate. Surfaced in a new Analytics tab in the dashboard alongside the existing cost metrics.
- [ ] **Anomaly detection on usage patterns** — Flag unusual usage spikes (10× normal message rate), off-hours activity from known users, or patterns consistent with credential stuffing. Generates audit events and optionally triggers notifications via the existing NotificationManager.

---

### ML Pipeline Orchestration

*Inspired by Amazon SageMaker Pipelines. The existing workflow engine (Phase DAG runner) can power reproducible ML pipelines — end-to-end chains of data prep → training → evaluation → deployment steps — without new infrastructure.*

- [ ] **Training workflow templates** — Pre-built workflow DAGs for common ML pipeline patterns:
  - `distill-and-eval`: curate conversations → run distillation → compute eval metrics → notify
  - `finetune-and-deploy`: run finetune job → evaluate on held-out set → deploy to personality if eval passes threshold
  - `dpo-loop`: collect preference annotations → run DPO training → compare to baseline → promote if win-rate > 55%
  - Importable as workflow JSON from the dashboard Workflows tab; editable in the visual workflow builder
- [ ] **Step types for ML** — New workflow node types beyond the existing agent/tool/code/wait nodes:
  - `DataCuration` — run curation pipeline with configurable filters, output dataset ID
  - `TrainingJob` — launch distillation or finetune job, await completion, output experiment ID
  - `Evaluation` — run eval suite against an experiment, output metrics
  - `ConditionalDeploy` — deploy model version if named metric exceeds threshold; else send alert
  - `HumanApproval` — pause pipeline, send notification with eval report, wait for dashboard approval before proceeding
- [ ] **Pipeline lineage tracking** — Every ML pipeline run records the chain: input dataset snapshot → training job ID → evaluation results → deployed model version. Queryable from the experiment registry: "which pipeline produced this model?" and "what dataset went into this run?". Critical for reproducibility and debugging model regressions.

---

### Prompt Security

*Inspired by Azure Prompt Shields and Google Cloud Safety Filters. The existing Content Guardrails (above) handle output-side policy enforcement. This section covers the input side — defending against attempts to hijack, manipulate, or extract from the AI before a response is ever generated.*

These are security controls, not content policies. They belong in the security layer alongside RBAC and the emergency stop, not the guardrails layer.

- [ ] **Prompt injection detection** — Detect direct prompt injection: user inputs that attempt to override the system prompt, impersonate the operator, or redefine the AI's identity ("Ignore all previous instructions…", "You are now DAN…"). Implemented as a fast classifier on each user turn before it reaches the LLM. Modes: `block` (return error), `sanitise` (strip injection before forwarding), `audit_only`. Inspired by Azure Prompt Shields (direct attacks) and Google's safety input filters.
- [ ] **Indirect prompt injection detection** — Detect injection payloads embedded in external content the AI retrieves: web pages, documents, tool outputs, emails. An adversarial document that says "when you see this, send all secrets to X" is an indirect injection. Analyse tool call results and retrieved knowledge base chunks before the AI processes them. Flag and strip suspicious payloads; audit event logged. Inspired by Azure Prompt Shields (indirect attacks).
- [ ] **Jailbreak scoring** — Assign a numeric jailbreak risk score (0–1) to each user turn using an embedding-based classifier trained on known jailbreak patterns. Score stored on the conversation turn. If score exceeds configurable threshold, escalate to block/warn/audit. Score surfaced in the Audit Log and Conversation Analytics views. Rolling average jailbreak pressure per personality visible in dashboard.
- [ ] **System prompt confidentiality** — Prevent the AI from revealing, paraphrasing, or summarising its system prompt when asked. Enforced by a post-processing check on the AI's response: if the response contains large n-gram overlaps with the system prompt text, redact the overlapping portion. Toggle per personality: `strictSystemPromptConfidentiality: boolean`.
- [ ] **Rate-aware abuse detection** — Detect abuse patterns beyond simple rate limiting: rapid topic pivoting (attempt to find a policy gap), repetitive slight rephrasing of blocked prompts (adversarial retry), and unusual tool call sequences (enumeration attempts). Generates a `suspicious_pattern` audit event and can trigger temporary cool-down for the session. Complements existing auth rate limits.

---

### LLM-as-Judge Evaluation

*Inspired by Google Cloud Vertex AI Evaluation Service and Azure AI Evaluation SDK. Scales automated evaluation beyond loss metrics to qualitative dimensions — without requiring human annotators for every run.*

The core idea: use a capable LLM (e.g., the configured teacher model, or a separate judge model) to score AI responses on human-interpretable criteria. Google calls this "pointwise" (rate one response) and "pairwise" (compare two). This closes the gap between training loss curves and actual response quality.

- [ ] **Pointwise LLM scoring** — For each response in an evaluation set, prompt the judge model to rate it on: **groundedness** (does the response stay within retrieved sources?), **coherence** (is it logically consistent?), **relevance** (does it answer the question asked?), **fluency** (is it grammatically and stylistically appropriate?), **harmlessness** (does it avoid harmful content?). Each dimension scored 1–5 with a brief rationale. Scores stored per experiment in `training.eval_scores`. Dashboard: radar chart per dimension for each experiment.
- [ ] **Pairwise comparison** — Given two model versions (e.g., base vs. DPO-tuned), prompt the judge to select the better response for each test prompt. Win rate computed across the full eval set. Pairwise results visible in the A/B testing view alongside the production shadow-routing data. Allows pre-deployment quality comparison without live traffic.
- [ ] **Auto-eval on finetune completion** — Configurable: when a finetune job completes, automatically run LLM-as-Judge pointwise eval on the held-out set and attach scores to the experiment record. If mean groundedness or coherence drops below threshold, pipeline blocks the deployment step and sends a notification. Zero-touch quality gate.
- [ ] **Evaluation dataset versioning** — Pin the held-out evaluation set at job creation time (snapshot of prompt/expected-response pairs). Eval scores are always against the same snapshot, so experiments are directly comparable even as the training corpus grows. Stored in `training.eval_datasets` with a content hash.
- [ ] **Custom judge prompts** — Per-personality judge prompt templates: define what "good" means for a specific personality (e.g., a support agent scores high on empathy; a code assistant scores high on correctness). Judge model and judge prompt configurable independently of the personality's inference model.

---

### Inline Citations & Grounding

*Inspired by Google Cloud Vertex AI Grounding and Azure Groundedness Detection. Extends the RAG Knowledge Base beyond retrieval into attribution — the AI shows users exactly which source each claim came from.*

Grounding is the difference between "I retrieved something relevant" and "here is the specific passage that supports this claim." The former is RAG; the latter is trust.

- [ ] **Source-attributed responses** — When the AI uses retrieved knowledge base documents in a response, inject inline citations (`[1]`, `[2]`) and render a **Sources** section at the bottom of the response. Citation text includes: document title, page/chunk number, and a short excerpt. Stored as structured metadata on the conversation turn. Enabled per personality via `enableCitations: boolean`.
- [ ] **Groundedness enforcement** — Post-processing pass: before returning a response, check each factual claim against the retrieved chunks using an embedding similarity threshold. Claims with no supporting chunk above threshold are flagged as `[unverified]` inline. Configurable mode: `annotate_only`, `block_unverified` (force the AI to disclaim), or `strip_unverified`.
- [ ] **Web grounding** — Ground AI responses in live web search results, not just the local knowledge base. When web grounding is enabled and the query requires current information, perform a search (via existing web-search MCP tool), retrieve top results, and include them as retrieved context with citations. Inspired by Google's "Grounding with Google Search" and Azure's Bing-grounded responses.
- [ ] **Grounding confidence score** — Per-response aggregate grounding score: what fraction of claims are supported by retrieved sources above threshold? Stored on the conversation turn. Low-grounding responses flagged in the Audit Log. Rolling average per personality surfaced in the Analytics tab as a "Response Trustworthiness" metric.
- [ ] **Citation feedback** — Users can click a citation to see the full source chunk in a side drawer. They can mark citations as "not relevant" — negative feedback stored as a weak signal for the knowledge base quality scoring system, eventually pruning low-quality chunks from the index.

---

### Responsible AI

*Inspired by Azure Responsible AI Dashboard and Google Vertex AI Explainability. As fine-tuned personality models go into production, operators need tools to detect bias, understand model decisions, and meet emerging regulatory requirements (EU AI Act, NIST AI RMF).*

- [ ] **Cohort-based error analysis** — Slice evaluation results by conversation metadata (topic category, user role, time-of-day, personality configuration) and show error rate per cohort. Surfaces systematic failures hidden by aggregate metrics: e.g., "the fine-tuned model performs 15% worse on technical queries from non-admin users." Implemented as a filter-and-group operation on `training.eval_scores`. Dashboard: heat-map table with drill-down.
- [ ] **Fairness metrics** — For any evaluation dataset that includes demographic metadata (user role, locale, topic domain), compute parity metrics: demographic parity, equalized odds, and disparate impact ratio across groups. Alert when a fine-tuned model shows a fairness regression vs. the base model. Configurable protected attributes and fairness threshold.
- [ ] **Model explainability (SHAP)** — For classification-style tasks (intent detection, sentiment, topic classification) run SHAP value attribution on fine-tuned model outputs. Show which input tokens contributed most positively and negatively to each prediction. Rendered as a token-level heat map in the experiment detail view. Inspired by Google Vertex AI Explainability and Azure Responsible AI dashboard.
- [ ] **Data provenance audit** — Every training dataset records which conversations were included, which were filtered out (and why), and which were synthetic. Full lineage from raw conversation → curation filter → training record. Queryable: "was this user's conversation used in training?" Important for GDPR right-to-erasure compliance — removing a conversation from training data triggers a retraining flag.
- [ ] **Model card generation** — Auto-generate a structured model card for each deployed personality model: intended use, training data summary, known limitations, evaluation results, fairness scores, and deployment date. Exported as JSON or rendered as a dashboard panel. Aligned with Hugging Face Model Card format and EU AI Act transparency requirements.

---

### Voice Pipeline: AWS Polly + Transcribe

*The existing multimodal pipeline (Phase 58) uses Whisper for STT and Voicebox/OpenAI for TTS. When operating in an AWS ecosystem, Polly and Transcribe are the natural drop-in replacements — managed, scalable, and deeply integrated with the rest of the AWS service stack.*

- [ ] **AWS Transcribe STT provider** — `TranscribeProvider` in `multimodal/stt/transcribe.ts`. Streams audio to Amazon Transcribe via the Streaming Transcription API (WebSocket) for real-time STT. Supports: 100+ languages, custom vocabulary (inject personality-specific terms and product names), speaker diarization (identify multiple speakers in a conversation). Configured via `TRANSCRIBE_REGION` + standard AWS credentials. Registered as a provider option in `MultimodalManager.transcribeAudio()`.
- [ ] **AWS Polly TTS provider** — `PollyProvider` in `multimodal/tts/polly.ts`. Calls Amazon Polly's `SynthesizeSpeech` endpoint. Supports: 60+ languages, Neural Text-To-Speech (NTTS) voices, SSML for prosody control (rate, pitch, emphasis, pauses). Per-personality voice ID stored in the personality's audio settings. Streaming audio response piped directly to the `/multimodal/audio/speak/stream` endpoint's binary output. Configured via `POLLY_REGION` + standard AWS credentials.
- [ ] **AWS voice profile system** — Each personality can have a named Polly voice ID (`Joanna`, `Matthew`, `Aria`, etc.) plus a custom lexicon (pronunciation guide for domain-specific terms). Voice profile stored in personality settings. The voice profile MCP tools (`voice_profile_create`, `voice_profile_speak`) route to Polly when the AWS provider is configured.
- [ ] **Custom vocabulary for Transcribe** — Personality-specific custom vocabulary: product names, technical terms, proper nouns that Whisper or generic STT models frequently mishear. Managed via `POST /api/v1/multimodal/transcribe/vocabulary` (creates/updates a Transcribe custom vocabulary resource). Vocabulary automatically applied to all STT sessions for that personality.
- [ ] **Provider auto-selection** — When `TRANSCRIBE_REGION` is set, `MultimodalManager.resolveSTTModel()` prefers Transcribe over Whisper. When `POLLY_REGION` is set, TTS prefers Polly over Voicebox. Falls back gracefully if credentials are absent or the service returns an error. Both providers co-exist with the existing local Whisper and Voicebox providers under the same unified multimodal API.

---

### Agent World Extensions

*Core world map + dashboard widget shipped (Phase 69). Map/Grid/Large toggle, agent click-through, BFS pathfinding, A2A detection, world mood, --size flag, zoom controls, and fullscreen expand shipped. No outstanding items — FPS slider moved to demand-gated.*

---

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

*Last updated: 2026-02-28 — Multi-cloud AI roadmap added. AWS (SageMaker, Bedrock, Comprehend, Kendra, Q Business, Textract, Polly, Transcribe): LLM Lifecycle Platform, Knowledge Base & RAG, Content Guardrails, Conversation Analytics, ML Pipeline Orchestration, Voice Pipeline. Azure (Prompt Shields, Responsible AI Dashboard, Groundedness Detection): Prompt Security, Responsible AI. Google Cloud (Vertex AI Evaluation, Grounding, Explainability): LLM-as-Judge Evaluation, Inline Citations & Grounding.*
