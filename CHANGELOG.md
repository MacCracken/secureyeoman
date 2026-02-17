# Changelog

All notable changes to SecureYeoman are documented in this file.

---

## Phase 13: Dashboard & Tooling — Complete (2026.2.17)

### Browser Automation Session Manager (new)
- New `browser.sessions` PostgreSQL table for tracking browser automation sessions
- `BrowserSessionStorage` class extending `PgBaseStorage` with full CRUD, filtering, and stats
- REST API routes: `GET /api/v1/browser/sessions`, `GET /api/v1/browser/sessions/:id`, `POST /api/v1/browser/sessions/:id/close`, `GET /api/v1/browser/config`, `GET /api/v1/browser/sessions/stats`
- Session event instrumentation on all 6 Playwright browser tools (`browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_pdf`)
- Dashboard `BrowserAutomationPage` component with stats cards, status/tool filters, paginated session table, expandable row detail with screenshot preview and close button
- Dashboard API client functions: `fetchBrowserSessions`, `fetchBrowserSession`, `closeBrowserSession`, `fetchBrowserConfig`

### Web Scraper Configuration Panel (new)
- `WebScraperConfigPage` component with URL allowlist management, rate limiting, and proxy settings
- `WebPage` wrapper component with sub-tabs for Browser Automation and Scraper Config
- Extended `McpFeatureConfig` with scraper settings (allowedUrls, webRateLimitPerMinute, proxy fields)
- PATCH `/api/v1/mcp/config` now supports scraper configuration updates
- Web tab in Agents page gated by active personality's `mcpFeatures` (exposeWeb/exposeWebScraping/exposeWebSearch/exposeBrowser)

### Vector Memory Explorer (new)
- `VectorMemoryExplorerPage` component with 4 sub-tabs: Semantic Search, Memories, Knowledge, Add Entry
- Semantic search with configurable similarity threshold, type filtering, and similarity score visualization
- Memory and knowledge browsing with expandable rows, delete actions, and reindex button
- Manual memory entry form with type, source, importance, and content fields
- Dashboard API client functions: `addMemory`, `deleteMemory`
- Vector Memory tab always visible in Agents page (brain is a core subsystem)

---

## Phase 11 (Partial): Expanded Integrations — In Progress

### Mistral AI Provider (new)
- New `MistralProvider` using OpenAI-compatible API at `https://api.mistral.ai/v1`
- Known models: mistral-large-latest, mistral-medium-latest, mistral-small-latest, codestral-latest, open-mistral-nemo
- Full streaming, tool calling, and fallback chain support
- Added to shared types, config schemas, and AI client factory

### Developer Tool Integrations (new)
- **Jira**: REST API v3 adapter with issue/comment webhooks, Basic Auth (email:apiToken)
- **AWS**: Lambda invocation + STS GetCallerIdentity, AWS Signature V4 (no SDK dependency)
- **Azure DevOps**: Work item + build webhooks, PAT-based Basic Auth

### MCP Pre-built Integrations (new)
- Featured MCP Servers grid on the MCP tab with one-click connect
- Pre-built catalog: Bright Data, Exa, E2B, Supabase
- Inline env var form, auto-detection of already-connected servers

### Connections Page Consolidation
- Restructured from 6 flat tabs to 2 top-level tabs: **Integrations** and **MCP**
- Integrations tab contains sub-tabs: Messaging, Email, Calendar, DevOps, OAuth
- OAuth moved from top-level into Integrations sub-tabs
- New DEVOPS_PLATFORMS entries: jira, aws, azure
- PLATFORM_META entries added for Jira, AWS, Azure DevOps with setup steps

---

## Phase 10: Dashboard UX Enhancements — Complete

### Cost Analytics Page (new)
- New `/costs` route with dedicated sidebar link (DollarSign icon, above Settings)
- Summary cards: Cost Today, Cost This Month, Total API Calls, Avg Latency
- Token overview: Tokens Used Today, Tokens Cached Today, API Errors
- Provider breakdown table sorted by cost (descending) with totals footer
- Cost recommendations section with priority badges (high/medium/low)
- New `/api/v1/costs/breakdown` endpoint exposing per-provider usage stats
- ResourceMonitor "Estimated Cost" section now clickable, navigates to `/costs`

### Sub-Agent Execution Tree
- Visual tree view in delegation detail (History tab > expand delegation > Show Execution Tree)
- Hierarchical display using `parentDelegationId` with depth-based indentation
- Each node shows: status icon, task, status badge, depth, token usage bar, duration
- Fetches tree data lazily via `fetchDelegation(id)` on toggle

### Memory Consolidation Panel — Enhanced
- Stats overview cards: Total Memories, Total Merged, Consolidation Runs, Avg Duration
- Consolidation trends stacked bar chart (last 10 runs) with color-coded actions (merged/replaced/updated/kept)
- Legend for trend bar colors
- Updated styling from raw Tailwind gray classes to dashboard theme tokens (card, muted-foreground, etc.)

### Audit Log Enhancements
- Date-range filtering with native date pickers (From/To) wired to existing `from`/`to` API parameters
- Saved filter presets stored in localStorage
- Preset chips with one-click apply and remove (×) button
- Save preset flow: inline name input with Enter/Escape keyboard support
- "Clear all" button when any filter is active

### Deferred to Phase 12
- Integration management UI, vector memory explorer, lifecycle hook debugger, web scraper config panel, browser automation session manager, Storybook, workspace management admin UI

---

## [2026.2.17] — 2026-02-17

### Phase 8.8: Memory/Brain Hardening — [ADR 045](docs/adr/045-memory-audit-hardening.md)

#### Security
- Fixed SQL injection via context key interpolation in `BrainStorage.queryMemories()` — now uses parameterized JSONB path with regex key validation
- Added prompt injection sanitization (`sanitizeForPrompt()`) in `BrainManager.getRelevantContext()` — strips known injection markers before composing prompt context
- Added input validation on brain REST route POST/PUT handlers (content type checking, non-empty enforcement)
- Added rate limiting on mutation endpoints (60/min for memories/knowledge, 5/min for maintenance/reindex/consolidation/sync)
- Added `MAX_QUERY_LIMIT = 200` cap on all GET route `limit` parameters to prevent unbounded queries
- Added path traversal validation on external sync config updates
- Added 18 missing brain routes to RBAC `ROUTE_PERMISSIONS` map (heartbeat, logs, search, consolidation, sync endpoints)

#### Bug Fixes
- **Critical**: Fixed memory pruning to delete lowest-importance memory instead of highest — added `sortDirection` support to `queryMemories()` and used `sortDirection: 'asc'` in prune path
- Fixed FAISS vector store phantom vectors — added `compact()` method to rebuild index without deleted entries, `clear()` to wipe, and `deletedCount` tracking
- Fixed expired PG memories not removed from vector store — `runMaintenance()` now syncs pruned IDs to vector store
- Fixed consolidation `flaggedIds` lost on restart — now persisted to `brain.meta` with snapshot-based clearing during deep runs
- Fixed cron scheduler only matching minute/hour — now implements full 5-field cron matching (minute, hour, day-of-month, month, day-of-week)
- Fixed `deepConsolidation.timeoutMs` config never enforced — wrapped with `Promise.race()` timeout
- Fixed Qdrant client typed as `any` — added `QdrantClientLike` interface with proper typing and auto-reconnect on failure
- Fixed external sync fetching all memories in single query — paginated with PAGE_SIZE=500

#### Enhancements
- Added `maxContentLength` config (default 4096) — enforced in `remember()` and `learn()`
- Added `importanceFloor` config (default 0.05) — memories decayed below floor auto-pruned in maintenance
- Added `sortDirection` and `offset` fields to `MemoryQuery` interface
- Added `pruneByImportanceFloor()` to `BrainStorage`
- `pruneExpiredMemories()` now returns pruned IDs (was count)
- `runMaintenance()` returns enhanced stats with `vectorSynced` count
- Added optional `compact()` method to `VectorStore` interface

### Phase 7.3: Multimodal I/O — Complete

#### Integration Wiring
- Wired MultimodalManager into IntegrationManager via late-injection setter pattern
- Vision processing for image attachments in Discord and Slack adapters
- Voice message transcription already working in Telegram adapter (now connected)

#### Voice Output (TTS)
- TTS audio in outbound responses via metadata on `sendMessage()`
- Telegram sends voice messages (OGG via grammy `InputFile`)
- Discord attaches audio files to embed messages
- MessageRouter synthesizes TTS when multimodal is enabled

#### Per-Personality Voice
- MessageRouter reads active personality's `voice` field for TTS voice selection
- Maps to OpenAI TTS voices (alloy, echo, fable, onyx, nova, shimmer)

#### MCP Multimodal Tools
- `multimodal_generate_image` — DALL-E image generation
- `multimodal_analyze_image` — Vision analysis
- `multimodal_speak` — Text-to-speech
- `multimodal_transcribe` — Speech-to-text
- `multimodal_jobs` — List multimodal processing jobs

#### Dashboard
- Multimodal job viewer with type/status filters, pagination, expandable rows
- Stats cards (total, completed, failed, success rate)
- Multimodal view consolidated into Agents page as a sub-tab (before Sub-Agents)
- Standalone `/multimodal` route redirects to `/agents`
- Multimodal tab and Agents nav visibility gated by `allowMultimodal` security policy
- Fixed enabled check: uses `securityPolicy.allowMultimodal` (not `multimodalConfig.enabled`)

### Phase 8.5: Anti-Bot & Proxy Integration

#### Proxy Rotation
- Multi-provider proxy support: Bright Data, ScrapingBee, ScraperAPI
- Round-robin and random rotation strategies
- Geo-targeting via ISO 3166-1 alpha-2 country codes
- Feature toggle: `MCP_PROXY_ENABLED` (default: false)

#### CAPTCHA Detection
- Heuristic CAPTCHA detection (reCAPTCHA, hCaptcha, Cloudflare challenge)
- Auto-retry with provider rotation on CAPTCHA detection

#### Retry Logic
- Exponential backoff with jitter for 429, 503, 502, 500, network errors
- Configurable max retries and base delay

#### Browser Integration
- Playwright browser launch respects proxy configuration

#### Documentation
- ADR 044: Anti-Bot & Proxy Integration

### Phase 9: Kubernetes Production Deployment

#### Helm Chart
- Full Helm chart at `deploy/helm/friday/` with templates for core, MCP, and dashboard deployments
- Values files for dev, staging, and production environments
- Ingress with TLS support (nginx, ALB, GCE via annotations)
- HorizontalPodAutoscaler for core (2-10 replicas) and MCP (1-5 replicas)
- PodDisruptionBudgets for all services
- NetworkPolicies with explicit ingress/egress rules per service
- ServiceAccount with configurable annotations (for IRSA/Workload Identity)

#### Dashboard Production Image
- New `packages/dashboard/Dockerfile` — multi-stage build (node:20-alpine + nginx:1.27-alpine)
- Custom `nginx.conf` serving static SPA with API/WebSocket reverse proxy to core
- Security headers, gzip compression, static asset caching

#### CI/CD
- `docker-push` job: builds and pushes 3 images to GHCR on tag push (`v*`)
- `helm-lint` job: lints chart and runs `helm template` dry-run on every push
- OCI labels added to root Dockerfile for GHCR metadata

#### Observability
- Prometheus `ServiceMonitor` CRD for auto-discovery scraping
- `PrometheusRule` CRD with all 9 alert rules migrated from Docker setup
- Grafana dashboard ConfigMap with sidecar auto-discovery label
- Pod annotations for legacy Prometheus scraping

#### Security Hardening
- Non-root containers (UID 1000 for core/MCP, UID 101 for nginx dashboard)
- Read-only root filesystem with explicit writable mounts
- All Linux capabilities dropped, privilege escalation blocked
- Seccomp RuntimeDefault profile on all pods
- ExternalSecret CRD template for AWS Secrets Manager, GCP Secret Manager, Azure Key Vault

#### Testing
- Helm test pod (curls core `/health` endpoint)
- Kubernetes smoke test script (`tests/k8s/smoke-test.sh`) for kind/k3d

#### Documentation
- ADR 042: Kubernetes Deployment decision record
- ADR 043: Kubernetes Observability decision record
- Kubernetes deployment guide (`docs/guides/kubernetes-deployment.md`)
- Updated architecture docs with K8s deployment section
- Updated security model with K8s security section
- Updated roadmap with Phase 9

#### Repository
- Updated all repo URL references from `MacCracken/FRIDAY` to `MacCracken/secureyeoman`
- Renamed all product-level "F.R.I.D.A.Y." / "FRIDAY" references to "SecureYeoman" across 79 files (preserving "F.R.I.D.A.Y." as the default agent personality name)

---

## [2026.2.16c] — 2026-02-16

### Dashboard: Navigation Consolidation & Experiments

#### Agents Page (Consolidated)
- Merged Sub-Agents and A2A Network into a single **Agents** page accessible from the sidebar
- Tabbed interface when both features are enabled; shows single view when only one is active
- Disabled state when neither sub-agents nor A2A is enabled
- `/a2a` route redirects to `/agents` for backward compatibility

#### Experiments Page (Standalone)
- Extracted experiments from the Editor bottom panel into a standalone sidebar page
- Gated by `allowExperiments` security policy flag (default: `false`)
- Must be explicitly enabled after initialization via Settings > Security
- Only visible in sidebar when the policy is enabled

#### Security Settings
- Added **Experiments** toggle to Security Settings page
- Added `allowExperiments: boolean` to `SecurityConfigSchema` (default: `false`)

#### Proactive Page
- Removed quick-enable buttons from Built-In Triggers section
- Triggers are now read-only reference; enabling is per-personality via the Personality Editor
- Added informational note about per-personality configuration

#### Sidebar
- Conditional navigation items: Agents, Extensions, Proactive, and Experiments appear only when their respective security policies are enabled

---

## [2026.2.16b] — 2026-02-16

### Phase 7.3: Multimodal I/O

#### Vision Analysis
- Image analysis via existing AIClient vision capability (Claude / GPT-4o)
- Supports JPEG, PNG, GIF, WebP up to 20MB
- REST endpoint: `POST /api/v1/multimodal/vision/analyze`

#### Speech-to-Text (STT)
- Audio transcription via OpenAI Whisper API
- Supports OGG, MP3, WAV, WebM, M4A, FLAC formats
- REST endpoint: `POST /api/v1/multimodal/audio/transcribe`

#### Text-to-Speech (TTS)
- Speech synthesis via OpenAI TTS API
- Multiple voices (alloy, echo, fable, onyx, nova, shimmer)
- REST endpoint: `POST /api/v1/multimodal/audio/speak`

#### Image Generation
- Image generation via OpenAI DALL-E 3
- Configurable size, quality, and style
- REST endpoint: `POST /api/v1/multimodal/image/generate`

#### Infrastructure
- `MultimodalManager` orchestrator with job tracking in PostgreSQL
- `MultimodalStorage` extends PgBaseStorage (migration 010)
- Security policy toggle: `allowMultimodal` in SecuritySettings dashboard
- 4 extension hook points: `multimodal:image-analyzed`, `multimodal:audio-transcribed`, `multimodal:speech-generated`, `multimodal:image-generated`
- `MediaHandler.toBase64()` helper for file conversion
- Telegram adapter handles photo and voice messages via MultimodalManager
- Dashboard API client functions for all multimodal endpoints
- **Reference**: ADR 041

---

## [2026.2.16] — 2026-02-16

### Dashboard: Inline Form Pattern

#### Replace Modal Dialogs with Inline Cards
- Replaced popup modal dialogs (`fixed inset-0 bg-black/50`) with collapsible inline card forms across all feature pages
- **SubAgentsPage**: Delegate Task and New Profile forms now render inline below the header/tab area
- **ExtensionsPage**: Register Extension, Register Hook, and Register Webhook forms now render inline within their respective tabs
- **A2APage**: Add Peer and Delegate Task forms now render inline
- All inline forms use `useMutation` with `onSuccess` cleanup instead of manual `setSubmitting` state
- Forms follow the ExperimentsPage card pattern: `card p-4 space-y-3` with X close button
- Input styling standardized to `w-full bg-card border border-border rounded-lg px-3 py-2 text-sm`
- CodeExecutionPage unchanged (already used inline forms)
- **Reference**: ADR 039

### Phase 7: Integration Expansion

#### DeepSeek AI Provider
- New `DeepSeekProvider` using OpenAI-compatible API at `https://api.deepseek.com`
- Requires `DEEPSEEK_API_KEY` env var; optional `DEEPSEEK_BASE_URL` override
- Known models: `deepseek-chat`, `deepseek-coder`, `deepseek-reasoner`
- Full chat, streaming, and tool use support
- Added to provider factory, cost calculator (pricing table + dynamic model fetch), and model switching
- 9 unit tests

#### Google Calendar Integration
- `GoogleCalendarIntegration` adapter using Calendar API v3 with OAuth2 tokens
- Polling-based event monitoring with configurable interval
- Quick-add event creation via `sendMessage()`
- Token refresh reusing Gmail's OAuth pattern
- Dashboard: PLATFORM_META with OAuth token config fields and setup steps
- 7 unit tests

#### Notion Integration
- `NotionIntegration` adapter using Notion API with internal integration token
- Polling for database changes and page updates
- Page creation via `sendMessage()` with auto-title
- Rate limit set to 3 req/sec (Notion's strict limits)
- Dashboard: PLATFORM_META with API key and database ID fields
- 7 unit tests

#### GitLab Integration
- `GitLabIntegration` implementing `WebhookIntegration` for push, merge_request, note, and issue events
- REST API v4 for posting comments on issues and merge requests
- `X-Gitlab-Token` header verification for webhook security
- Configurable `gitlabUrl` for self-hosted GitLab instances
- Webhook route registered at `/api/v1/webhooks/gitlab/:id`
- Dashboard: PLATFORM_META with PAT, webhook secret, and GitLab URL fields
- 15 unit tests

#### Adaptive Learning Engine (7.1)
- `PreferenceLearner` class storing feedback as `preference` type memories via BrainManager
- `POST /api/v1/chat/feedback` endpoint for thumbs-up/thumbs-down/correction feedback
- Conversation pattern analysis: detects response length preferences and code-heavy usage
- `injectPreferences()` appends learned preferences to system prompt when memory is enabled
- Dashboard: thumbs-up/thumbs-down buttons on assistant messages in ChatPage
- API client: `submitFeedback()` function
- 11 unit tests

### Browser Automation Label Fix
- Removed "(preview)" badge and "coming soon" tooltip from Browser Automation toggle
- Updated tooltip to "Browser automation via Playwright"

### Test Connection Button for Integrations
- New `testConnection()` optional method on `Integration` interface for validating credentials without starting
- REST endpoint `POST /api/v1/integrations/:id/test` — calls adapter's `testConnection()` and returns `{ ok, message }`
- Dashboard: "Test" button on each integration card (Messaging tab) next to Start/Stop
  - Spinner while testing, green check/red X with message, auto-clears after 5s
- API client: `testIntegration(id)` function

### Browser Automation — Playwright Implementation (Phase 8.3)
- Replaced 6 placeholder browser tools with real Playwright implementations:
  - `browser_navigate` — Navigate to URL, return title + URL + content snippet
  - `browser_screenshot` — Capture viewport or full page as base64 PNG
  - `browser_click` — Click element by CSS selector with configurable wait
  - `browser_fill` — Fill form field by CSS selector
  - `browser_evaluate` — Execute JavaScript in browser context, return JSON
  - `browser_pdf` — Generate PDF from webpage as base64
- New `BrowserPool` manager (`browser-pool.ts`): lazy browser launch, page pool with `MCP_BROWSER_MAX_PAGES` limit, `MCP_BROWSER_TIMEOUT_MS` enforcement, graceful shutdown
- `playwright` added as optional dependency in `@friday/mcp`
- Browser pool shutdown wired into `McpServiceServer.stop()` lifecycle
- Config gate preserved: all tools return NOT_AVAILABLE when `MCP_EXPOSE_BROWSER=false`
- 18 unit tests (config gate, all 6 tools enabled/disabled, pool limit enforcement, shutdown)

### RBAC Management — Dashboard, API & CLI
- 7 new REST endpoints for role CRUD (`GET/POST/PUT/DELETE /auth/roles`) and user-role assignments (`GET/POST /auth/assignments`, `DELETE /auth/assignments/:userId`)
- Built-in roles protected from mutation/deletion; custom roles auto-prefixed with `role_`
- Dashboard: Settings > Security now shows full role list with Built-in badges, inline create/edit forms, delete with confirmation, and a User Assignments table with assign/revoke
- CLI: `secureyeoman role` command with `list`, `create`, `delete`, `assign`, `revoke`, `assignments` subcommands
- Personality Resource Creation config extended with `customRoles` and `roleAssignments` toggles (between Sub-Agents and Experiments)

### Security Policy Toggles
- Security Policy API (`GET/PATCH /api/v1/security/policy`) for managing high-risk capabilities
- SecurityConfigSchema extended with 3 new fields:
  - `allowA2A: z.boolean().default(false)` — Allow A2A networking (nested under sub-agents)
  - `allowExtensions: z.boolean().default(false)` — Allow lifecycle extension hooks
  - `allowExecution: z.boolean().default(true)` — Allow sandboxed code execution (enabled by default)
- Dashboard: Security Settings page now shows toggles for all 4 policy fields (Sub-Agent Delegation, A2A Networks, Lifecycle Extensions, Sandbox Execution)
- A2A Networks toggle appears as nested sub-item under Sub-Agent Delegation toggle
- All policy changes audited in cryptographic audit chain and take effect immediately

### Phase 8: WebMCP — Web Intelligence & Browser Automation

#### Web Scraping Tools (8.1)
- 4 web scraping tools: `web_scrape_markdown` (HTML→markdown), `web_scrape_html` (raw HTML with CSS selector), `web_scrape_batch` (parallel multi-URL, max 10), `web_extract_structured` (field-based JSON extraction)
- SSRF protection: blocks private IPs (10.x, 172.16-31.x, 192.168.x), localhost, cloud metadata (169.254.169.254), `file://` protocol
- URL allowlist enforcement when `MCP_ALLOWED_URLS` is configured (domain + subdomain matching)
- Max 3 redirect hops with re-validation per hop; 500KB output cap with truncation marker
- HTML→markdown via `node-html-markdown`; fallback tag stripper for environments without the dependency

#### Web Search Tools (8.2)
- 2 web search tools: `web_search` (single query), `web_search_batch` (parallel, max 5 queries)
- Configurable search backend: DuckDuckGo (default, no API key), SerpAPI, Tavily
- Web-specific rate limiter (10 req/min default, configurable via `MCP_WEB_RATE_LIMIT`)

#### Browser Automation (8.3 — Complete)
- 6 browser tools implemented with Playwright: `browser_navigate`, `browser_screenshot`, `browser_click`, `browser_fill`, `browser_evaluate`, `browser_pdf`
- `BrowserPool` manager for lazy browser launch, page pool with configurable limit, timeout enforcement, graceful shutdown
- `playwright` as optional dependency (users install separately with `npm install playwright && npx playwright install chromium`)
- Feature toggle `MCP_EXPOSE_BROWSER` controls availability; config for engine, headless mode, max pages, timeout
- Dashboard: Browser Automation toggle with "(preview)" label

#### MCP Infrastructure (8.6)
- **Health Monitoring**: `McpHealthMonitor` class with periodic checks (60s default), latency tracking, consecutive failure counting, auto-disable after threshold (default 5)
- **Credential Management**: `McpCredentialManager` with AES-256-GCM encryption at rest, key derivation from `SECUREYEOMAN_TOKEN_SECRET`, credential injection into server spawn environment
- REST API: `GET /mcp/health`, `GET /mcp/servers/:id/health`, `POST /mcp/servers/:id/health/check`, `GET/PUT/DELETE /mcp/servers/:id/credentials/:key`
- Database migrations: `006_mcp_health.sql` (server_health table), `007_mcp_credentials.sql` (server_credentials table)

#### Dashboard (8.7)
- Web Tools toggle (Globe icon) with collapsible Scraping/Search sub-toggles on YEOMAN MCP server card
- Browser Automation toggle with "(preview)" label
- Health dot indicators (green/yellow/red) per external server card with latency tooltip
- Credentials section per external server: expandable key listing (masked values), add key/value form, delete button

### Phase 6: Cognitive Architecture (6.1a, 6.1b, 6.2, 6.3, 6.4a, 6.4b, 6.5)

#### Vector Semantic Memory (6.1a)
- Embedding provider abstraction with local (SentenceTransformers via Python child process) and API (OpenAI/Gemini) backends
- FAISS vector store adapter with flat L2 index, cosine normalization, and disk persistence
- Qdrant vector store adapter with auto-collection creation and cosine distance
- VectorMemoryManager orchestrating embedding + vector store for semantic indexing and search
- pgvector migration (003) adding `embedding vector(384)` columns with HNSW indexes
- BrainStorage extended with `queryMemoriesBySimilarity()` and `queryKnowledgeBySimilarity()` using pgvector `<=>` operator
- BrainManager integration: `remember()`, `recall()`, `forget()`, `learn()`, `deleteKnowledge()`, `getRelevantContext()` all use vector search with text fallback
- New `semanticSearch()` public method on BrainManager
- REST endpoints: `GET /brain/search/similar`, `POST /brain/reindex`
- Dashboard: SimilaritySearch component with text input, threshold slider, type filter, and score indicators
- Configuration via `brain.vector` in `secureyeoman.yaml`

#### LLM-Powered Memory Consolidation (6.1b)
- ConsolidationManager with on-save quick check (>0.95 auto-dedup, >0.85 flag for review)
- Scheduled deep consolidation with configurable cron schedule
- LLM consolidation prompts: MERGE, REPLACE, KEEP_SEPARATE, UPDATE, SKIP actions
- ConsolidationExecutor with optimistic locking and audit trail logging
- REST endpoints: `POST /brain/consolidation/run`, `GET/PUT /brain/consolidation/schedule`, `GET /brain/consolidation/history`
- Dashboard: ConsolidationSettings component with schedule picker, dry-run toggle, manual run, and history table
- Configuration via `brain.consolidation` in `secureyeoman.yaml`

#### Progressive History Compression (6.2)
- 3-tier compression pipeline: message (50%) → topic (30%) → bulk (20%)
- Topic boundary detection via keywords, temporal gaps, and token thresholds
- LLM summarization for topic and bulk summaries with configurable models
- Approximate token counter (~4 chars/token)
- CompressionStorage extending PgBaseStorage with migration (004)
- HistoryCompressor with `addMessage()`, `getContext()`, `sealCurrentTopic()`, `getHistory()`
- ConversationManager integration with non-blocking compression
- REST endpoints: `GET /conversations/:id/history`, `POST /conversations/:id/seal-topic`, `GET /conversations/:id/compressed-context`
- Dashboard: ConversationHistory component with tiered view, token budget bars, and seal topic button
- Configuration via `conversation.history.compression` in `secureyeoman.yaml`

#### Sub-Agent Delegation System (6.3)
- SubAgentManager with recursive delegation, token budgets, and configurable max depth (default: 3)
- 4 built-in agent profiles: researcher (50k tokens), coder (80k), analyst (60k), summarizer (30k)
- SubAgentStorage extending PgBaseStorage with profile CRUD, delegation tracking, and recursive tree queries
- Delegation tools: `delegate_task`, `list_sub_agents`, `get_delegation_result` with depth-based filtering
- Agentic execution loop with AbortController timeout, conversation sealing, and audit trail
- Database migration (005) creating `agents` schema with profiles, delegations, and delegation_messages tables
- REST API: full CRUD for profiles, delegate endpoint, delegation listing/filtering/cancel, sealed conversation retrieval
- Dashboard: SubAgentsPage with Active/History/Profiles tabs, delegate dialog, token usage bars, cancel support
- Configuration via `delegation` section in `secureyeoman.yaml`

#### Lifecycle Extension Hooks (6.4a)
- ExtensionManager with filesystem-based discovery (built-in, user, workspace directories) and numeric prefix ordering
- 24 lifecycle hook points across agent, message loop, LLM, tool, memory, sub-agent, integration, and security events
- Three hook semantics: observe (side-effect only), transform (modify data), veto (cancel operation)
- TypeScript plugin modules with typed hook signatures and hot-reload support
- EventEmitter integration for lightweight in-process subscribers
- Outbound webhook dispatch with HMAC-SHA256 signing and configurable timeout
- User extension directory (`~/.secureyeoman/extensions/`) with override semantics
- REST API: `GET/DELETE /extensions`, `POST /extensions/reload`, `GET /extensions/hooks`, `GET/POST/DELETE /extensions/webhooks`, `POST /extensions/discover`
- Configuration via `extensions` section in `secureyeoman.yaml`
- Example extensions: logging enhancer, custom memory filter, Slack notifier

#### Sandboxed Code Execution (6.4b)
- CodeExecutionTool with Python, Node.js, and shell runtime support
- Always-on sandbox: all code runs within existing Landlock/seccomp/macOS sandbox infrastructure
- Two-level opt-in: master `enabled` switch + `autoApprove` toggle for per-execution approval flow
- Dashboard approval prompt with "Approve & Trust Session" for session-scoped auto-approval
- Persistent session manager with sessions surviving across tool calls within a conversation
- Output streaming to dashboard via WebSocket (`code_execution:{sessionId}` channel)
- Streaming secrets filter: 256-byte buffered window masking API keys, tokens, passwords in stdout/stderr
- MCP tools: `execute_code`, `list_sessions`, `kill_session`
- REST API: `POST /execution/run`, `GET /execution/sessions`, `DELETE /execution/sessions/:id`, `GET /execution/history`, `POST /execution/approve/:id`
- Full audit trail for all code executions (input code, output summary, exit code, approval metadata)
- Configuration via `execution` section in `secureyeoman.yaml`

#### A2A Protocol (6.5)
- Agent-to-Agent protocol extending E2E encrypted comms layer with delegation-specific message types
- 8 A2A message types: delegation_offer, delegation_accept, delegation_reject, delegation_status, delegation_result, delegation_cancel, capability_query, capability_response
- Three discovery mechanisms: static peer list, mDNS (`_friday-a2a._tcp`) for LAN, DNS-SD for WAN
- Capability negotiation: agents advertise available profiles, token budgets, current load, and protocol version
- Trust progression model: untrusted (discovery only) -> verified (limited delegation) -> trusted (full delegation)
- Remote delegation transport extending SubAgentManager; remote delegations tagged with `remote: true` in unified delegation tree
- Per-peer rate limiting and allowlists/denylists for delegation authorization
- Cryptographic proof: signed hash of sealed conversation in delegation results
- REST API: `GET/POST/DELETE /a2a/peers`, `POST /a2a/discover`, `POST /a2a/delegate`, `GET /a2a/delegations`, `GET /a2a/messages`
- Dashboard: remote agent discovery, peer management, and remote delegation UI with network icon
- Configuration via `a2a` section in `secureyeoman.yaml`

#### DOMPurify XSS Protection
- DOMPurify sanitization utility with `sanitizeHtml()` (allows formatting tags) and `sanitizeText()` (strips all HTML)
- SafeHtml React component for safe rendering of HTML content
- Applied to all dashboard components displaying AI/user-generated content: ChatPage, SecurityEvents, PersonalityEditor, SkillsPage, CodePage, NotificationBell, TaskHistory, ConnectionsPage

---

## [2026.2.15] — 2026-02-15

### Initial Release

SecureYeoman — a secure, local-first AI assistant with enterprise-grade protection and comprehensive observability.

#### Security
- RBAC (Admin/Operator/Auditor/Viewer) with role inheritance and persistent storage
- JWT + API key authentication with refresh token rotation and blacklisting
- AES-256-GCM encryption at rest with scrypt KDF
- Sandboxed execution (Linux Landlock, macOS sandbox-exec, seccomp-bpf, namespace isolation)
- mTLS with client certificate authentication
- 2FA (TOTP) with recovery codes
- Rate limiting (per-user, per-IP, per-API-key, global; Redis-backed distributed mode)
- HTTP security headers (HSTS, CSP, X-Frame-Options, Referrer-Policy, Permissions-Policy)
- CORS policy enforcement
- Input validation and prompt injection defense (6 pattern families)
- Secret rotation with dual-key JWT verification
- Encrypted config file support (.enc.yaml)
- Cryptographic audit trails (HMAC-SHA256 chain) with retention enforcement

#### AI Integration
- Anthropic Claude, OpenAI GPT, Google Gemini, Ollama, LM Studio, LocalAI (local), OpenCode Zen
- Automatic fallback chains on rate limits/outages
- Dynamic model discovery across all providers
- Token counting, cost calculation, usage tracking

#### Agent Architecture
- Soul (identity, archetypes, personality) with "In Our Image" sacred hierarchy
- Spirit (passions, inspirations, pains) — emotional core
- Brain (memory, knowledge, skills with decay and pruning)
- Body (heartbeat, vital signs, screen capture)

#### Dashboard
- React + Vite + Tailwind + TanStack Query
- Real-time WebSocket updates with channel-based RBAC
- Overview page with stat cards (Tasks Today, Active Tasks, Heartbeat, Audit Entries, Memory Usage)
- Services status panel (Core, Database/Postgres, Audit Chain, MCP Servers, Uptime, Version)
- System flow graph (ReactFlow) with live connection edges reflecting health, database, MCP, and security status; click-to-navigate node detail expansion (Security > System Details tab)
- Task history, security events, resource monitor
- Personality editor, skills manager, code editor (Monaco) with AI chat sidebar
- Voice interface (push-to-talk, speech recognition and synthesis)
- Notification bell, search bar (Ctrl+K), user preferences
- Audit log export, log retention settings, security settings
- Responsive design with dark/light theme

#### Integrations
- Telegram, Discord, Slack, GitHub, Google Chat, CLI, Generic Webhook
- Plugin architecture with unified message routing
- Per-platform rate limiting, auto-reconnect, conversation management

#### MCP Protocol
- Standalone `@friday/mcp` service (22+ tools, 7 resources, 4 prompts)
- Streamable HTTP, SSE, and stdio transports
- Auto-registration with core; JWT auth delegation
- Connect external MCP servers with persistent tool discovery

#### Marketplace
- Skill discovery, search, install/uninstall (syncs with Brain skills)
- Publish with cryptographic signature verification
- Built-in example skills

#### Team Collaboration
- Workspaces with isolation, member management, workspace-scoped RBAC

#### Reports and Analytics
- Audit report generator (JSON/HTML/CSV)
- Cost optimization recommendations
- A/B testing framework (experiments with variant routing and p-values)

#### Production
- Docker multi-stage builds with non-root user and health checks
- CI/CD pipeline (lint, typecheck, test, build, security audit; Node 20+22 matrix)
- Prometheus metrics, Grafana dashboards, Loki log aggregation
- Load testing (k6), security testing, chaos testing
- 1700+ tests across 115+ files

---

*Last updated: February 2026*
