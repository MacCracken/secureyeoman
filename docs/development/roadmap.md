# Development Roadmap

> Open items only — see [Changelog](../../CHANGELOG.md) for completed work.

---

- [ ] ideas: Board of Directors, Council of AI's
- [ ] enterprise department per - what other business units can we provide tools for, additonal skills/worksflows/swarms/security, legal, business risks are already covers as will as intents; where else can we improve

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
| 106 | License-Gated Feature Reveal | P1 — commercial | 🔄 In Progress (context ✅, card ✅, CLI guard ✅, route guards + feature lock UX remaining) |
| 107 | Reasoning Strategies, Security Templates & Portable Personalities | P2 — capability + distribution | ✅ Complete — see Changelog [2026.3.2] and [2026.3.3] |
| 109 | Editor Improvements (Auto-Claude Style) | P3 — power user UX | 🔄 In Progress (unification ✅, IDE features + canvas improvements planned) |
| 110 | Inline Citations & Grounding | P3 — trust layer | ✅ Complete — see Changelog [2026.3.3] |
| 111 | Departmental Risk Register & Risk Posture Tracking | P2 — risk governance | ✅ Complete — see Changelog [2026.3.2] and [2026.3.3] |
| 112 | Multi-Account AI Provider Keys & Per-Account Cost Tracking | P2 — cost governance | Planned |
| 113 | Sandbox Artifact Scanning & Externalization Gate | P1 — security boundary | Planned |
| 114 | Excalidraw Diagramming — MCP Tools & Marketplace Skill | P3 — capability + visualization | Planned |
| 115 | Memory Audits, Compression & Reorganization | P2 — memory quality + governance | Planned |
| Future | LLM Lifecycle Advanced, Responsible AI, Voice Pipeline, Infrastructure | Future / Demand-Gated | — |

---

## Phase 106: License-Gated Feature Reveal

**Priority**: P1 — Commercial. Enterprise features are built and instrumented but not yet gated. This phase makes the tier boundary real: community installs see upgrade prompts; enterprise installs unlock the full feature set. Directly tied to revenue (ADR 171).

*Previously Phase 93. Renumbered for sequential ordering.*

Enterprise features gated by this phase: `adaptive_learning`, `sso_saml`, `multi_tenancy`, `cicd_integration`, `advanced_observability`.

- [ ] **Gateway route guards** — Add `requiresLicense(feature: EnterpriseFeature)` hook to the routes that serve enterprise functionality (training advanced modes, SAML endpoints, RLS multi-tenant API, CI/CD webhook, alert rules). Returns `402 Payment Required` with `{ error: 'enterprise_license_required', feature: '<name>' }` for community-tier callers. `LicenseManager` singleton accessed via `secureYeoman.getLicenseManager()` inside route plugins.
- [ ] **Feature lock UX** — Components for guarded features (Training advanced modes, SSO config, Multi-tenancy settings, CI/CD platforms, Alert Rules) wrap in a `<FeatureLock feature="adaptive_learning">` guard component. Community-tier users see the feature greyed out with a lock icon and an "Upgrade to Enterprise" prompt linking to `docs/guides/licensing.md` rather than a blank 403.

---

## Phase 107: Reasoning Strategies, Security Templates & Portable Personalities

*Complete — see Changelog [2026.3.2] and [2026.3.3]. ADRs 181–186.*

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

*Complete — see Changelog [2026.3.3]. ADR 190.*

---

## Phase 111: Departmental Risk Register & Risk Posture Tracking

*Complete — see Changelog [2026.3.2] and [2026.3.3]. ADR 185.*

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

### 112-B: LLM Provider Improvements

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

## Phase 113: Sandbox Artifact Scanning & Externalization Gate

**Priority**: P1 — Security boundary. The sandbox isolates execution (Landlock, seccomp, `sandbox-exec`) but currently returns results to the caller unchecked. Any artifact produced inside the sandbox — code, data, files, serialized objects — can flow out without review. This phase adds a mandatory scanning and approval gate: nothing leaves the sandbox without being inspected for malicious intent, injection payloads, embedded secrets, or policy violations.

Four sub-phases: scanning engine → externalization gate & policy → malicious intent guards & active defense → dashboard & audit.

### 113-A: Artifact Scanning Engine

*Core scanning capabilities. Each scanner is a pluggable module behind a common `ArtifactScanner` interface.*

- [ ] **`ArtifactScanner` interface** — `packages/core/src/sandbox/scanning/types.ts`. Common contract: `scan(artifact: SandboxArtifact): Promise<ScanResult>`. `SandboxArtifact` describes the output: `{ id, type: 'code' | 'data' | 'binary' | 'serialized' | 'file', content: Buffer | string, metadata: { language?, mimeType?, sourceStep?, sandboxId? } }`. `ScanResult`: `{ passed: boolean, severity: 'clean' | 'info' | 'warning' | 'critical', findings: ScanFinding[], scannedAt: Date, scannerName: string }`. `ScanFinding`: `{ rule: string, description: string, severity, location?: { line?, col?, offset? }, evidence?: string }`.
- [ ] **Code review scanner** — `packages/core/src/sandbox/scanning/code-scanner.ts`. Static analysis of code artifacts for malicious patterns. Detection categories: (1) **Command injection** — shell exec calls (`exec`, `spawn`, `system`, `popen`, `subprocess`, backticks), eval/Function constructor, dynamic import of remote URLs; (2) **Data exfiltration** — outbound network calls (`fetch`, `http.request`, `XMLHttpRequest`, `WebSocket`) to non-allowlisted hosts, DNS exfil patterns, encoded payloads in URL params; (3) **Privilege escalation** — filesystem writes outside sandbox boundary, `/etc/passwd` reads, `chmod`/`chown`, setuid patterns, `/proc` or `/sys` access; (4) **Supply chain** — `require()`/`import` of unexpected packages, `npm install`/`pip install` in generated scripts, CDN script injection; (5) **Obfuscation** — excessive base64/hex encoding, char code construction (`String.fromCharCode`), `atob`/`btoa` chains building executable strings, intentional variable name obfuscation heuristics. Configurable severity thresholds per category. Supports JavaScript, TypeScript, Python, Shell, and SQL via language-specific rule sets.
- [ ] **Secrets scanner** — `packages/core/src/sandbox/scanning/secrets-scanner.ts`. Detects credentials, API keys, tokens, and PII that should never leave the sandbox. Leverages patterns from the existing `SecretsFilter` (`packages/core/src/security/secrets-filter.ts`) but applied to outbound artifacts rather than inbound logs. Detection: API key formats (AWS `AKIA*`, GitHub `ghp_*`/`gho_*`, Anthropic `sk-ant-*`, etc.), private keys (PEM headers), JWTs, connection strings, high-entropy strings above configurable threshold (Shannon entropy > 4.5 on tokens > 20 chars). PII patterns: email addresses, phone numbers, SSNs (configurable per jurisdiction). Redaction mode: optionally replace detected secrets with `[REDACTED:<type>]` rather than blocking.
- [ ] **Binary & data scanner** — `packages/core/src/sandbox/scanning/data-scanner.ts`. Scans non-code artifacts (JSON, CSV, serialized objects, binary files). Detection: (1) **Polyglot files** — files that are valid in multiple formats (e.g., a JPEG that is also valid JavaScript), detected via magic byte analysis + content structure mismatch; (2) **Embedded executables** — ELF/PE/Mach-O headers inside data files; (3) **Serialization attacks** — unsafe deserialization markers (Python pickle opcodes, Java `ObjectInputStream` patterns, PHP `unserialize` with class instantiation); (4) **Oversized payloads** — artifacts exceeding configured size limits (default: 10MB per artifact, 50MB total per sandbox run); (5) **JSONL/CSV injection** — formula injection (`=CMD|`, `+cmd|`) in data exports destined for spreadsheet consumption.
- [ ] **Composite scanner pipeline** — `packages/core/src/sandbox/scanning/scanner-pipeline.ts`. `ScannerPipeline` runs all registered scanners in parallel against an artifact. Aggregates results: overall verdict is the worst severity across all scanners. Short-circuits on first `critical` finding if `failFast: true` (configurable). Returns composite `ScanReport`: `{ artifactId, overallVerdict, scanResults: ScanResult[], duration, policyDecision: 'allow' | 'quarantine' | 'block' }`.

### 113-B: Externalization Gate & Policy

*The enforcement layer. Wraps `SandboxResult` to ensure nothing exits without scanning. Configurable policy determines what happens on findings.*

- [ ] **`ExternalizationGate`** — `packages/core/src/sandbox/scanning/externalization-gate.ts`. Wraps the existing `Sandbox.run()` return path. Before `SandboxResult<T>` is returned to the caller, the gate: (1) extracts all artifacts from the result (the `result` field, any files written to the sandbox's writable directory, stdout/stderr captures); (2) runs each through the `ScannerPipeline`; (3) applies the configured `ExternalizationPolicy`; (4) returns the result only if policy allows, otherwise returns a sanitized result with findings attached. The gate is transparent to callers — same `SandboxResult<T>` type, but with an added `scanReport?: ScanReport` field.
- [ ] **`ExternalizationPolicy`** — Configurable per security policy (`packages/shared/src/types/security.ts`). Fields: `artifactScanning: { enabled: boolean, codeReview: boolean, secretsScanning: boolean, dataScanning: boolean, failFast: boolean, onCritical: 'block' | 'quarantine' | 'flag', onWarning: 'allow' | 'quarantine' | 'flag', quarantineDir: string, maxArtifactSizeMb: number, maxTotalSizeMb: number, allowedExternalHosts: string[], secretsRedactionMode: 'block' | 'redact' | 'flag' }`. Defaults: scanning enabled, all scanners on, block on critical, flag on warning.
- [ ] **Quarantine storage** — Artifacts that trigger `quarantine` policy are written to a configurable quarantine directory (default: `data/quarantine/`) with metadata sidecar files (scan report, timestamp, source sandbox run, requesting user). Quarantined artifacts require manual approval via API or dashboard before release. `QuarantineStorage`: `quarantine(artifact, scanReport)`, `listQuarantined(filters)`, `approveRelease(artifactId, approvedBy)`, `deleteQuarantined(artifactId)`, `getQuarantinedArtifact(artifactId)`.
- [ ] **Wiring into existing sandbox paths** — Integrate the gate into: (1) `SandboxManager.run()` — wraps all generic sandbox executions; (2) `EvaluationManager.sandboxFn` — tool execution correctness checks; (3) Training export routes (`exportEpisodes`, `exportAsDpo`) — scan JSONL output before streaming to client; (4) Workflow engine `ci_trigger`/`ci_wait` steps — scan any artifacts passed to external CI systems; (5) `ComputerUseManager.exportEpisodes` — scan recorded episodes before download. Each integration point calls `gate.inspect(artifacts)` and respects the policy verdict.
- [ ] **Alert integration** — On `critical` findings, emit an alert via `AlertManager` with synthetic snapshot: `{ sandbox: { artifact_blocked: { artifactType, scannerName, finding, sandboxId } } }`. On `quarantine`, emit `{ sandbox: { artifact_quarantined: { ... } } }`. Allows ntfy/Slack/PagerDuty notification of sandbox security events.

### 113-C: Malicious Intent Guards & Active Defense

*Beyond static scanning — behavioral analysis, threat scoring, and escalating responses when artifacts appear intentionally malicious rather than accidentally unsafe.*

- [ ] **Threat intent classifier** — `packages/core/src/sandbox/scanning/threat-classifier.ts`. Distinguishes *accidental* unsafe code (e.g., a beginner using `eval` for JSON parsing) from *intentionally malicious* artifacts (e.g., obfuscated reverse shell, staged payload delivery, encoded C2 beacons). Scoring model: each `ScanFinding` carries a base severity; the classifier layers on an `intentScore: 0.0–1.0` by analyzing co-occurrence patterns. A single `exec()` call is low intent; `exec()` + base64 decoding + network exfil + variable obfuscation in the same artifact pushes intent toward 1.0. Configurable threshold: `maliciousIntentThreshold` (default: 0.7) — artifacts scoring above this are treated as deliberately hostile. Output: `ThreatAssessment`: `{ intentScore, classification: 'benign' | 'suspicious' | 'likely_malicious' | 'confirmed_malicious', indicators: ThreatIndicator[], killChainStage?: string }`.
- [ ] **Kill chain mapping** — Each finding is mapped to a simplified attack stage: `reconnaissance` (environment probing, host enumeration), `weaponization` (payload construction, obfuscation), `delivery` (network exfil, outbound connections), `exploitation` (privilege escalation, sandbox escape attempts), `installation` (persistence mechanisms, cron/service creation), `command_and_control` (C2 callbacks, encoded beacons, heartbeat patterns), `exfiltration` (data staging, compressed archives with secrets). Artifacts that span multiple kill chain stages receive elevated intent scores. The kill chain stage is included in alerts and audit records for incident response context.
- [ ] **Behavioral pattern database** — `packages/core/src/sandbox/scanning/threat-patterns.ts`. Curated pattern sets for known malicious techniques: reverse shells (bash/python/perl/nc variants), web shells, cryptominers (pool connection strings, `stratum+tcp://`), ransomware indicators (mass file enumeration + encryption library imports + ransom note templates), credential harvesters (form spoofing, keylogger patterns), and supply chain attack signatures (typosquatted package names, postinstall hooks with network calls). Patterns are versioned and updatable — community pattern packs can be loaded via the marketplace sync mechanism (extending the existing `CommunitySyncResult`).
- [ ] **Sandbox runtime guards** — `packages/core/src/sandbox/scanning/runtime-guard.ts`. In addition to post-execution scanning, inject runtime monitoring *during* sandbox execution for high-risk operations. Guards: (1) **Network guard** — intercept outbound connections in real-time via the existing `CredentialProxy` infrastructure; block connections to known malicious IPs/domains (configurable blocklist + optional threat intelligence feed integration); log all connection attempts with destination, port, and payload preview; (2) **Filesystem guard** — monitor file writes during execution; alert on bulk file creation (>100 files), writes to sensitive paths, or creation of executable files; (3) **Process guard** — detect child process spawning chains (fork bombs, process hollowing attempts); kill the sandbox run if process count exceeds threshold (default: 10); (4) **Time-based anomaly guard** — detect long-running sandbox executions that may indicate crypto mining or slow-exfil; alert if execution time exceeds 2x the expected duration for the operation type. Guards fire `SandboxViolation` events in real-time — violations above the intent threshold trigger immediate sandbox termination (not just post-hoc scanning).
- [ ] **Escalating response system** — `packages/core/src/sandbox/scanning/escalation.ts`. `EscalationManager` determines the response severity based on the threat assessment. Response tiers: (1) **Flag** (`intentScore < 0.3`) — finding logged, artifact passes through, informational alert; (2) **Quarantine** (`0.3 ≤ intentScore < 0.7`) — artifact held for manual review, standard alert via `AlertManager`, sandbox run marked as suspicious in scan history; (3) **Block & alert** (`0.7 ≤ intentScore < 0.9`) — artifact destroyed, sandbox run terminated, high-priority alert (PagerDuty/Slack with `urgent` tag), source user/personality flagged for review, incident record created in audit chain; (4) **Block, alert & lock** (`intentScore ≥ 0.9`) — all of the above plus: the originating personality is automatically suspended (`status: 'suspended'`), the user's sandbox privileges are temporarily revoked (configurable cooldown, default: 1 hour), and a security incident is opened in the departmental risk register (Phase 111 integration) if the risk module is active. Each tier is configurable — thresholds and actions can be tuned in the security policy.
- [ ] **Repeat offender tracking** — `packages/core/src/sandbox/scanning/offender-tracker.ts`. Tracks malicious artifact submissions per user and per personality over a rolling window (default: 7 days). Metrics: total submissions, malicious count, quarantine count, block count, highest intent score. When a user/personality exceeds configurable thresholds (e.g., 3 blocks in 7 days), automatically escalate their default response tier — a user who normally gets `quarantine` at 0.5 intent score now gets `block & alert`. Persistent — tracked in the `sandbox.scan_history` table with an aggregate view. Decay: counts reduce over time if behavior improves (configurable decay rate). Dashboard: "repeat offender" badge on the quarantine dashboard and user profile.
- [ ] **Alert templates for sandbox threats** — Extend the existing `RULE_TEMPLATES` in `AlertRulesTab` with sandbox-specific templates: "Malicious artifact detected" (triggers on `sandbox.artifact_blocked` where `intentScore ≥ 0.7`), "Sandbox escape attempt" (triggers on `exploitation` kill chain stage), "Data exfiltration attempt" (triggers on `exfiltration` stage), "Repeat sandbox abuse" (triggers on repeat offender threshold breach), "Sandbox quarantine backlog" (triggers when quarantined artifact count exceeds threshold, ensuring quarantine queue doesn't go unreviewed). Templates pre-configure channel, severity, and cooldown for one-click setup.

### 113-D: Dashboard, CLI & Audit

*Visibility into what the sandbox produces and what was blocked.*

- [ ] **Scan history table** — `sandbox.scan_history` migration. Columns: `id`, `sandbox_run_id`, `artifact_type`, `verdict` (clean/warning/critical), `findings` (JSONB), `policy_decision` (allow/quarantine/block), `scanned_at`, `scanned_by` (user who triggered the sandbox run), `tenant_id`. Indexed on `verdict` + `scanned_at` for filtering. Every scan report is persisted regardless of verdict — provides a complete audit trail.
- [ ] **Quarantine dashboard** — New section in Security or Developer page. Lists quarantined artifacts: type, scan findings, quarantine timestamp, source. Actions: preview (safe render of content), approve release (with reason — logged to audit chain), delete. Bulk actions for triage.
- [ ] **Scan analytics** — Aggregate stats: total scans, pass rate, top finding categories, critical finding trend over time. Recharts bar/line charts. Surfaced in the Security dashboard or Observability section. Includes threat intent distribution histogram (how many artifacts at each intent score band) and kill chain stage breakdown.
- [ ] **Threat intelligence panel** — Dashboard section showing: active threat patterns loaded, last pattern update timestamp, top triggered rules (last 30 days), intent score distribution, kill chain coverage heatmap (which stages are being detected vs. blind spots). Helps security teams understand what the scanning engine is catching and where gaps exist.
- [ ] **CLI commands** — `secureyeoman sandbox` (alias: `sbx`). Subcommands: `sandbox scan <file>` (manual scan of a file through the pipeline — outputs scan result + threat assessment + intent score), `sandbox quarantine list` (list quarantined artifacts with intent scores and kill chain stages), `sandbox quarantine approve <id>` (release with reason — logged to audit chain), `sandbox quarantine delete <id>`, `sandbox policy show` (display current externalization policy including escalation thresholds), `sandbox threats` (summary of recent malicious detections, repeat offenders, and open quarantine items), `sandbox stats` (scan pass/fail summary with intent score breakdown).
- [ ] **Audit chain integration** — All scan events (block, quarantine, approve-release, escalation, personality suspension, privilege revocation) logged to the existing audit chain (`logging/audit-chain.ts`) with event types `sandbox.artifact.blocked`, `sandbox.artifact.quarantined`, `sandbox.artifact.released`, `sandbox.threat.escalated`, `sandbox.personality.suspended`, `sandbox.user.privileges_revoked`. Includes the full `ThreatAssessment` (intent score, classification, kill chain stage, indicators) in the audit record. Provides tamper-evident history of every artifact decision and security response for incident investigation and compliance reporting.

---

## Phase 114: Excalidraw Diagramming — MCP Tools & Marketplace Skill

**Priority**: P3 — Capability + visualization. AI-generated diagrams are a high-value output for architecture reviews, threat models, system design, and documentation. This phase adds first-class Excalidraw support: MCP tools for programmatic diagram creation/rendering, and a marketplace skill that teaches the AI to generate professional diagrams from natural language. Inspired by [excalidraw-diagram-skill](https://github.com/coleam00/excalidraw-diagram-skill) — improved with broader diagram type coverage, a richer element template library, MCP tool integration, workflow step support, and tighter integration with existing YEOMAN features (knowledge base, canvas workspace, export pipeline).

Two sub-phases: MCP tools → marketplace skill & workflow integration.

### 114-A: Excalidraw MCP Tools

*New tool group in `packages/mcp/src/tools/excalidraw-tools.ts`. Follows `wrapToolHandler()` pattern. Feature-gated via `exposeExcalidraw: boolean` in `McpServiceConfigSchema` + `exposeDiagramming: boolean` in `McpFeaturesSchema` (per-personality gate).*

- [ ] **`excalidraw_create`** — Generate an Excalidraw scene JSON from a structured description. Input: `{ title: string, elements: ExcalidrawElementSpec[], theme?: 'light' | 'dark', gridMode?: boolean }`. `ExcalidrawElementSpec` is a simplified schema: `{ type: 'rectangle' | 'ellipse' | 'diamond' | 'arrow' | 'line' | 'text' | 'frame' | 'image', label?: string, x: number, y: number, width?: number, height?: number, strokeColor?: string, backgroundColor?: string, groupId?: string, boundElementIds?: string[] }`. Outputs valid Excalidraw JSON (`{ type: 'excalidraw', version: 2, elements: [], appState: {} }`). The tool handles ID generation, z-index ordering, bound arrow linkage, and group semantics so the AI only needs to specify the logical layout.
- [ ] **`excalidraw_from_description`** — Higher-level tool: takes a natural language description and diagram type, returns Excalidraw JSON. Input: `{ description: string, diagramType: 'architecture' | 'sequence' | 'flowchart' | 'entity_relationship' | 'network_topology' | 'threat_model' | 'mindmap' | 'timeline' | 'org_chart' | 'class_diagram' | 'state_machine' | 'deployment' | 'freeform', style?: 'minimal' | 'detailed' | 'technical', colorPalette?: string }`. Delegates to the AI personality with the excalidraw-diagram skill instructions injected as context, then parses the response into valid Excalidraw JSON. The diagram type hint drives layout strategy: hierarchical top-down for org charts, left-to-right for sequences, radial for mindmaps, swim-lane for flowcharts, zone-based for architecture diagrams.
- [ ] **`excalidraw_render`** — Render an Excalidraw JSON scene to PNG or SVG. Input: `{ scene: ExcalidrawScene | string, format: 'png' | 'svg', width?: number, height?: number, scale?: number, darkMode?: boolean }`. Uses `@excalidraw/utils` (`exportToSvg`/`exportToBlob`) in a lightweight rendering context (no Playwright dependency — the `@excalidraw/utils` package handles headless export natively). Returns base64-encoded image data. SVG output preserves editability. PNG output at configurable resolution (default: 2x scale for high-DPI).
- [ ] **`excalidraw_validate`** — Visual validation pipeline inspired by the reference project's render-and-check approach. Input: `{ scene: ExcalidrawScene }`. Checks: (1) **Overlapping elements** — bounding box intersection detection for non-connected elements; (2) **Orphaned arrows** — arrows with `startBinding` or `endBinding` pointing to non-existent elements; (3) **Text overflow** — text elements whose content exceeds their container bounds (estimated via character count × avg char width); (4) **Unbalanced layouts** — center-of-mass deviation from canvas center beyond threshold; (5) **Missing labels** — shapes with no text binding in diagram types that expect labels (architecture, ER, flowchart); (6) **Color contrast** — text-on-background contrast ratio below WCAG AA threshold (4.5:1). Returns `{ valid: boolean, issues: ValidationIssue[], suggestions: string[] }`. The AI can call this after `excalidraw_create`, fix issues, and re-render — enabling the iterative self-correction loop.
- [ ] **`excalidraw_modify`** — Patch an existing scene. Input: `{ scene: ExcalidrawScene, operations: PatchOperation[] }`. `PatchOperation`: `{ op: 'add' | 'update' | 'delete' | 'move' | 'restyle', elementId?: string, element?: ExcalidrawElementSpec, properties?: Partial<ExcalidrawElementSpec> }`. Enables incremental refinement without regenerating the entire scene. Maintains element IDs and bound arrow references through modifications.
- [ ] **`excalidraw_templates`** — List available element templates and color palettes. Input: `{ category?: string }`. Returns pre-built component groups: cloud provider icons (AWS/GCP/Azure as grouped shapes), database cylinders, server racks, user/actor icons, lock/shield security icons, container/pod shapes, queue/topic shapes, load balancer shapes. Templates are defined in `packages/mcp/src/tools/excalidraw-templates.ts` as reusable `ExcalidrawElementSpec[]` groups with relative positioning — the AI places them by specifying an anchor point.
- [ ] **Manifest & registration** — Add 6 tools to `manifest.ts` (`excalidraw_create`, `excalidraw_from_description`, `excalidraw_render`, `excalidraw_validate`, `excalidraw_modify`, `excalidraw_templates`). Register in `tools/index.ts` via `registerExcalidrawTools()`. Feature flag: `exposeExcalidraw` in MCP config (default: `true`).

### 114-B: Marketplace Skill & Workflow Integration

*A marketplace skill that teaches the AI to generate professional Excalidraw diagrams, plus workflow step support for automated diagram generation.*

- [ ] **`excalidraw-diagram` marketplace skill** — `packages/core/src/marketplace/skills/excalidraw-diagram.ts`. `Partial<MarketplaceSkill>` following the established pattern. `category: 'productivity'`, `author: 'YEOMAN'`, `routing: 'fuzzy'`, `autonomyLevel: 'L1'`. Instructions encode the full diagramming methodology:
  - **Visual argumentation principles** — shapes mirror concepts (fan-outs for one-to-many, timelines for sequences, convergence for aggregation, containment/frames for boundaries). Not generic boxes-and-arrows.
  - **Diagram type catalog** — 12 supported types with layout rules: architecture (zone-based, trust boundaries as dashed frames), sequence (left-to-right timeline, actor lifelines), flowchart (top-down swim lanes, decision diamonds), ER (entity boxes with PK/FK notation, relationship arrows with cardinality labels), network topology (hierarchical layers — internet/DMZ/internal/data), threat model (DFD elements + trust boundaries + STRIDE annotations, integrates with the existing `stride-threat-model` skill output), mindmap (radial hierarchy from center), timeline (horizontal with milestone markers), org chart (top-down tree), class diagram (UML-style compartmented rectangles), state machine (states as rounded rectangles, transitions as labeled arrows), deployment (infrastructure zones with service boxes).
  - **Color palette system** — Default palette: `{ primary: '#1e40af', secondary: '#7c3aed', accent: '#059669', warning: '#d97706', danger: '#dc2626', neutral: '#6b7280', background: '#f8fafc', surface: '#ffffff' }`. Palette is overridable per invocation. Zone backgrounds use 10% opacity fills. Arrows inherit source node color. Text always high-contrast against its background.
  - **Element template awareness** — Instructions reference the `excalidraw_templates` MCP tool for reusable component groups. The AI is taught to compose diagrams from templates rather than raw primitives where applicable.
  - **Iterative refinement loop** — The skill instructions teach the AI to: (1) generate the initial scene via `excalidraw_create` or `excalidraw_from_description`; (2) validate via `excalidraw_validate`; (3) fix any issues via `excalidraw_modify`; (4) render via `excalidraw_render` and present to the user. If the user requests changes, loop from step 3.
  - **Evidence embedding** — For technical diagrams (architecture, deployment, threat model), the skill instructs the AI to embed relevant code snippets, config fragments, or API signatures as text annotations within frames — making diagrams self-documenting.
  - `triggerPatterns`: `\\b(excalidraw|diagram|architecture.?diagram|draw.{0,10}(system|architecture|flow|sequence|er|network|topology|mindmap|org.?chart|class|state|deployment))\\b`, `(create|generate|make|draw|sketch|design).{0,20}(diagram|visual|chart|illustration|schematic|blueprint|dfd|data.?flow)`.
  - `useWhen`: 'User asks to create, generate, or modify any kind of visual diagram, system architecture drawing, flowchart, ER diagram, network topology, threat model DFD, or Excalidraw scene.'
  - `doNotUseWhen`: 'User asks for data charts (bar, line, pie — use Recharts), dashboards, or non-diagrammatic visualizations. User wants to edit an existing image that is not Excalidraw.'
  - `mcpToolsAllowed`: `['excalidraw_create', 'excalidraw_from_description', 'excalidraw_render', 'excalidraw_validate', 'excalidraw_modify', 'excalidraw_templates']`.
- [ ] **Skill registration** — Export from `skills/index.ts`. Add to `BUILTIN_SKILLS` in `marketplace/storage.ts`. Update `storage.test.ts` mock count (18→19 skills).
- [ ] **`diagram_generation` workflow step type** — New step type in `workflow-engine.ts`. Config: `{ diagramType, descriptionTemplate: '{{steps.researcher.output}}', style?, colorPalette?, format?: 'png' | 'svg' | 'json' }`. Calls `excalidraw_from_description` → `excalidraw_validate` → `excalidraw_render` internally. Output: `{ scene: ExcalidrawScene, renderedImage: string (base64), validationIssues: ValidationIssue[] }`. Enables workflows like "research a system → generate architecture diagram → attach to report".
- [ ] **Workflow templates** — 2 new templates appended to `BUILTIN_WORKFLOW_TEMPLATES`:
  - `architecture-diagram-pipeline` — agent (gather system description from input or knowledge base) → `diagram_generation` (architecture type) → transform (wrap in markdown report with embedded image) → resource (save to memory). `autonomyLevel: 'L2'`.
  - `threat-model-with-dfd` — agent (STRIDE analysis via `stride-threat-model` skill) → `diagram_generation` (threat_model type, description from STRIDE output) → transform (combine written threat model + DFD diagram) → `human_approval` (24h timeout) → resource (save to knowledge base). `autonomyLevel: 'L3'`.
- [ ] **Canvas workspace integration** — The existing canvas workspace (`/editor/advanced`) gains an Excalidraw widget type. When the AI generates an Excalidraw scene via MCP tools, the canvas can display it as an interactive embedded Excalidraw editor (using the `@excalidraw/excalidraw` React component). Users can manually refine AI-generated diagrams. Widget persists the scene JSON in `canvas:workspace` layout storage. Bi-directional: manual edits are saved; the AI can read the current scene state via `excalidraw_modify` for further AI-assisted refinement.
- [ ] **Knowledge base integration** — Excalidraw scenes can be stored as knowledge base documents (`brain.documents` with `format: 'excalidraw'`). The `DocumentManager.ingestBuffer()` path extracts text labels from the scene JSON for vector embedding — making diagrams searchable by their content. When recalled during RAG, the diagram is returned as both the scene JSON (for rendering) and a text summary of its elements.

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

*Last updated: 2026-03-03 — See [Changelog](../../CHANGELOG.md) for full history.*
