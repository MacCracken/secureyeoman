# Development Roadmap

> Development phases and progress for SecureYeoman

---

## Timeline

| Phase | Name | Release | Status |
|-------|------|---------|--------|
| 1 | Foundation | 2026.2.15 | Complete |
| 2 | Security | 2026.2.15 | Complete |
| 3 | Infrastructure | 2026.2.15 | Complete |
| 4 | Dashboard | 2026.2.15 | Complete |
| 5 | Integrations & Platforms | 2026.2.15 | Complete |
| 6 | Production Hardening | 2026.2.15 | Complete |
| | **Release 2026.2.15** | **2026-02-15** | **Released** |
| 7 | Cognitive & Memory | 2026.2.16 | Complete |
| 8 | Extensions & Intelligence | 2026.2.16 | Complete |
| | **Release 2026.2.16** | **2026-02-16** | **Released** |
| 9 | WebMCP & Browser Tools | 2026.2.17 | Complete |
| 10 | Kubernetes Deployment | 2026.2.17 | Complete |
| 11 | Dashboard UX | 2026.2.17 | Complete |
| 12 | Expanded Integrations | 2026.2.17 | Complete |
| 13 | Dashboard & Tooling | 2026.2.17 | Complete |
| 14 | Dashboard Chat Enhancements | 2026.2.17 | Complete |
| | **Release 2026.2.17** | **2026-02-17** | **Released** |
| 15 | Integration Expansion | — | In Progress |
| 16 | Integration Expansion II | — | Pending |
| 17 | Advanced Capabilities | — | Pending |

---

## Phase Overview

```
Phase 1       Phase 2       Phase 3       Phase 4       Phase 5       Phase 6
Foundation    Security      Infra         Dashboard     Integrations  Production
   |             |             |             |             |             |
   v             v             v             v             v             v
[Core Agent] [RBAC/Crypto] [Brain/Comms] [React UI]   [Platforms]   [Hardening]
                                    ── Release 2026.2.15 ──

Phase 7       Phase 8
Cognitive     Extensions
   |             |
   v             v
[Memory/AI]  [Hooks/A2A]
     ── Release 2026.2.16 ──

Phase 9       Phase 10      Phase 11      Phase 12      Phase 13      Phase 14
WebMCP        Kubernetes    Dashboard UX  Integrations+ Dash & Tools  Chat Markdown
   |             |             |             |             |             |
   v             v             v             v             v             v
[Web Tools]   [K8s Deploy]  [UX Polish]   [Expand]      [Browser/Vec] [ChatMarkdown]
                              ── Release 2026.2.17 ──

Phase 15      Phase 16      Phase 17
Integration  Productivity  Advanced
Expansion    Services      Capabilities
    |            |            |
    v            v            v
[Dev UX /    [Productivity  [WebGL/ML/
Persistence  Cloud/Svc     HSM/CRDT]
 /MCP]        Integrations]
```

---

## Phase 1: Foundation — [ADR 000](../adr/000-secureyeoman-architecture-overview.md)

**Status**: Complete

- [x] TypeScript project structure with strict mode, ESLint, Prettier, Vitest
- [x] Configuration management (YAML + env vars + Zod validation)
- [x] Base agent loop with task queue, event-driven architecture, graceful shutdown
- [x] Multi-provider AI integration (Anthropic, OpenAI, Gemini, Ollama, LM Studio, LocalAI, OpenCode Zen, DeepSeek, Mistral)
- [x] Structured logging with UUID v7, correlation IDs, SQLite WAL storage
- [x] Cryptographic audit chain (HMAC-SHA256, integrity verification)
- [x] Log query API with REST endpoint

---

## Phase 2: Security — [ADR 015](../adr/015-rbac-capture-permissions.md), [ADR 027](../adr/027-gateway-security-hardening.md)

**Status**: Complete

### Authentication & Authorization
- [x] RBAC with role definitions (Admin, Operator, Auditor, Viewer), inheritance, persistent storage
- [x] Full RBAC management via REST API (role CRUD, user-role assignments), Dashboard UI, and CLI (`secureyeoman role`)
- [x] JWT authentication with refresh token rotation, blacklisting
- [x] API key authentication with rate limiting and revocation
- [x] Gateway middleware for per-route RBAC enforcement

### Encryption & Secrets
- [x] AES-256-GCM encryption at rest with scrypt KDF
- [x] System keyring integration (macOS Keychain, Linux Secret Service)
- [x] Secret rotation with dual-key JWT verification and grace periods

### Input Validation & Protection
- [x] Input validation pipeline (size limits, encoding normalization, injection detection)
- [x] Prompt injection defense (6 pattern families, blocking + warning modes)
- [x] Rate limiting with sliding window counters (per-user, per-IP, per-API-key, global)

### Sandboxing
- [x] Cross-platform sandbox abstraction (`Sandbox` interface, `SandboxManager`)
- [x] Linux: V1 soft sandbox + V2 Landlock kernel enforcement via forked worker
- [x] macOS: `sandbox-exec` profile generation with deny-default policy
- [x] NoopSandbox fallback with warning

### Additional
- [x] Soul system (personality, skills, onboarding, 18 REST endpoints)
- [x] mTLS with client certificate authentication
- [x] Redis-backed distributed rate limiting

---

## Phase 3: Infrastructure — [ADR 004](../adr/004-mcp-protocol.md)

**Status**: Complete

- [x] CLI entry point (`--port`, `--host`, `--config`, `--log-level`, `--tls`)
- [x] SQLite task storage with filtering, pagination, and metrics
- [x] Security events query API
- [x] Rate limit metrics integration
- [x] Brain system (memory, knowledge, skills with decay and pruning)
- [x] E2E encrypted inter-agent communication (X25519 + Ed25519 + AES-256-GCM)
- [x] Model fallback chain on rate limits (429) / provider unavailability (502/503)

---

## Phase 4: Dashboard — [ADR 001](../adr/001-dashboard-chat.md), [ADR 008](../adr/008-coding-ide-view.md), [ADR 009](../adr/009-voice-interface.md)

**Status**: Complete

- [x] React + Vite + TypeScript with URL routing (react-router-dom v7)
- [x] TanStack Query for server-state management
- [x] WebSocket client with auto-reconnection and channel subscriptions
- [x] Overview page with stat cards (tasks, heartbeat, audit, memory), services status panel
- [x] MetricsGraph (ReactFlow with custom node types, live connection edges, click-to-detail)
- [x] TaskHistory with advanced filtering (status + type), live data
- [x] SecurityEvents with severity-based styling, live data, heartbeat task viewer
- [x] ConnectionManager with connect forms, start/stop/delete, error retry
- [x] ResourceMonitor with CPU/Memory gauges, token/cost tracking, real history
- [x] Soul/Personality UI (onboarding wizard, personality editor, skills manager)
- [x] Login page with JWT auth, automatic token refresh on 401
- [x] Coding IDE view (Monaco editor with personality-scoped AI chat sidebar)
- [x] Voice interface (browser-native SpeechRecognition + speechSynthesis)
- [x] Session timeout warning, ErrorBoundary, ConfirmDialog
- [x] Responsive mobile layout, dark/light theme

---

## Phase 5: Integrations & Platforms — [ADR 025](../adr/025-cli-webhook-googlechat-integrations.md), [ADR 030](../adr/030-unified-connections-oauth.md)

**Status**: Complete

### Architecture
- [x] Plugin architecture (`Integration` interface, `IntegrationManager`, `IntegrationStorage`, factory pattern)
- [x] Message abstraction (`UnifiedMessage`, `MessageAttachment`, `PlatformAdapter`, `MessageRouter`)
- [x] REST API routes for CRUD + start/stop + messages with RBAC
- [x] Conversation management, auto-reconnect, per-platform rate limiting

### Messaging Platforms (8)

| Platform | Status |
|----------|--------|
| Telegram | Stable |
| Discord | Stable |
| Slack | Stable |
| Google Chat | Stable |
| WhatsApp | Stable |
| Signal | Stable |
| Microsoft Teams | Stable |
| iMessage | Beta |

### MCP Ecosystem — [ADR 026](../adr/026-mcp-service-package.md)

| Transport | Status |
|----------|--------|
| stdio (local) | Supported |
| streamable-http | Supported |
| SSE | Supported |

- [x] MCP Server Discovery — Auto-discover tools from registered servers
- [x] Tool Routing — Route tool calls to appropriate external MCP server
- [x] Remote Server Support — First-class support for HTTP-based remote MCP servers
- [x] Dashboard UI — Server registration, tool browser, status indicators, credential management

---

## Phase 6: Production Hardening

**Status**: Complete

- [x] Load testing and performance benchmarks
- [x] Security testing and vulnerability scanning
- [x] Prometheus metrics integration
- [x] Documentation (API reference, guides, ADRs)
- [x] Deployment configuration and Docker support

---

## Phase 7: Cognitive & Memory — [ADR 031](../adr/031-vector-semantic-memory.md), [ADR 032](../adr/032-memory-consolidation.md), [ADR 033](../adr/033-progressive-history-compression.md), [ADR 034](../adr/034-sub-agent-delegation.md)

**Status**: Complete

### Vector Memory
- [x] FAISS and Qdrant vector store backends
- [x] Semantic search across memories with similarity scoring
- [x] Embedding pipeline with batched indexing

### Memory Consolidation
- [x] Scheduled consolidation with cron-based triggers
- [x] Deep consolidation via LLM-driven memory merging
- [x] FlaggedIds persistence across restarts

### History Compression
- [x] Progressive conversation compression (summary chains)
- [x] Token budget management for long conversations

### Sub-Agent Delegation
- [x] Sub-agent spawning with budget limits and depth controls
- [x] Execution tree tracking with status and results
- [x] Parent-child lifecycle management

### RBAC Management
- [x] Full RBAC management via REST API, Dashboard UI, and CLI (`secureyeoman role`)

---

## Phase 8: Extensions & Intelligence — [ADR 035](../adr/035-lifecycle-extension-hooks.md), [ADR 036](../adr/036-sandboxed-code-execution.md), [ADR 037](../adr/037-a2a-protocol.md), [ADR 040](../adr/040-proactive-assistance.md), [ADR 041](../adr/041-multimodal-io.md)

**Status**: Complete

### Lifecycle Hooks
- [x] Hook registration system with typed extension points
- [x] Pre/post hooks for task execution, message handling, memory operations

### Code Execution
- [x] Sandboxed code execution in isolated environments
- [x] Language support with timeout enforcement

### A2A Protocol
- [x] Agent-to-agent communication protocol
- [x] Service discovery and capability negotiation

### Integration Expansion
- [x] DeepSeek AI provider
- [x] Google Calendar integration
- [x] Notion integration
- [x] GitLab integration

### Adaptive Learning
- [x] Feedback collection system (inline ratings, explicit corrections)
- [x] User preference profile (stored in Brain as 'preference' memories)
- [x] Behavioral pattern analyzer (conversation analysis)
- [x] Adaptive response tuning (preference injection into system prompt)

### Proactive Assistance
- [x] Trigger system with 5 types: schedule, event, pattern, webhook, llm
- [x] Suggestion queue with approve/dismiss/expire lifecycle
- [x] 5 built-in triggers (daily standup, weekly review, idle check-in, memory insight, webhook alert)
- [x] Pattern learning — LLM analysis of Brain memories for recurring patterns
- [x] Dashboard UI — trigger manager, suggestion queue, pattern explorer
- [x] Security gate (`allowProactive` policy flag, default: false)
- [x] WebSocket push for real-time suggestion delivery

### Multimodal I/O
- [x] Multimodal type system (Vision, STT, TTS, ImageGen, Haptic schemas + job tracking)
- [x] MultimodalManager with OpenAI TTS/STT and DALL-E integration
- [x] REST API routes (analyze, transcribe, speak, generate, haptic trigger)
- [x] Vision processing pipeline for inline images (Discord, Slack, Telegram)
- [x] Voice message transcription (auto-STT for voice messages)
- [x] Voice output for integration responses (TTS audio attachments)
- [x] Image generation tool exposure via MCP (5 multimodal MCP tools)
- [x] Per-personality TTS voice/model selection
- [x] Haptic feedback (`POST /api/v1/multimodal/haptic/trigger`) — pattern dispatch via `multimodal:haptic-triggered` extension hook; dashboard capability toggle enabled

---

## Phase 9: WebMCP & Browser Tools — [ADR 038](../adr/038-webmcp-ecosystem-tools.md), [ADR 044](../adr/044-anti-bot-proxy-integration.md), [ADR 045](../adr/045-memory-audit-hardening.md)

**Status**: Complete

### Web Scraping
- [x] Web scraping tools with HTML-to-markdown conversion
- [x] URL allowlists and content extraction

### Web Search
- [x] Web search tools with multiple provider support
- [x] Result ranking and deduplication

### Browser Automation
- [x] Playwright-based browser automation
- [x] Screenshot capture and DOM interaction

### MCP Infrastructure
- [x] Server health monitoring — periodic checks, latency tracking, auto-disable on failure
- [x] Credential management — AES-256-GCM encrypted storage per server, secure injection

### Anti-Bot & Proxy
- [x] Proxy rotation (Bright Data, ScrapingBee, ScraperAPI) with round-robin/random strategies
- [x] CAPTCHA detection (heuristic response analysis)
- [x] Retry logic with exponential backoff + jitter
- [x] Geo-targeting via ISO country codes
- [x] Browser proxy integration (Playwright)
- [x] Feature toggle: `MCP_PROXY_ENABLED` (default: false)

### Memory/Brain Hardening
- [x] Fix critical pruning bug (deleted highest instead of lowest importance)
- [x] SQL injection fix via parameterized JSONB path queries
- [x] Content size limits (`maxContentLength` config, default 4096)
- [x] Prompt injection sanitization in `getRelevantContext()`
- [x] FAISS vector store `compact()` for phantom vector cleanup
- [x] Vector store sync on memory prune/maintenance
- [x] Importance floor pruning (`importanceFloor` config, default 0.05)
- [x] Deep consolidation timeout enforcement via `Promise.race()`
- [x] Qdrant proper typing and auto-reconnect
- [x] Brain route rate limiting (60/min mutations, 5/min admin ops)
- [x] Input validation on POST/PUT brain routes
- [x] 18 missing brain routes added to RBAC permission map
- [x] Path traversal validation on sync config updates

---

## Phase 10: Kubernetes Deployment — [ADR 042](../adr/042-kubernetes-deployment.md), [ADR 043](../adr/043-kubernetes-observability.md)

**Status**: Complete

Production-grade Kubernetes deployment using Helm charts, cloud-agnostic design (EKS/GKE/AKS), GHCR image registry, and managed PostgreSQL support.

- [x] Helm chart with templates for core, MCP, dashboard deployments
- [x] Production nginx Dockerfile for dashboard SPA
- [x] Ingress with TLS (cert-manager), WebSocket support
- [x] HPA (core 2-10 replicas, MCP 1-5 replicas on CPU)
- [x] PodDisruptionBudgets for all services
- [x] NetworkPolicies (deny-all default, explicit allow rules)
- [x] SecurityContext hardening (non-root, read-only FS, drop all caps, seccomp RuntimeDefault)
- [x] ServiceMonitor + PrometheusRule (9 alert rules migrated)
- [x] Grafana dashboard ConfigMap with sidecar auto-discovery
- [x] ExternalSecret CRD support (AWS/GCP/Azure)
- [x] CI/CD: GHCR image push on tags, Helm lint in CI
- [x] Values files for dev, staging, production environments
- [x] Kubernetes smoke test (kind/k3d)

---

## Phase 11: Dashboard UX — [ADR 039](../adr/039-inline-form-pattern.md)

**Status**: Complete

### Costs View
- [x] Cost Analytics Page — token usage by provider, daily/weekly/monthly trends, cost projections

### Agent Visualization
- [x] Inline Form Pattern — replaced modal dialogs with inline collapsible card forms on Sub-Agents, Extensions, and A2A pages
- [x] Sub-Agent Execution Tree — visual tree of spawned sub-agents with status, depth, results, and budget consumption

### Memory & Intelligence
- [x] Memory Consolidation Panel — consolidation runs, merged memories, trends chart, manual trigger

### Security & Audit
- [x] Audit Log Enhancements — date-range filtering and saved filter presets

---

## Phase 12: Expanded Integrations — [ADR 046](../adr/046-phase11-mistral-devtools-mcp-prebuilts.md)

**Status**: Complete

### AI Providers
- [x] Mistral AI provider (OpenAI-compatible, mistral-large/medium/small/codestral/nemo)

### Developer Tool Integrations
- [x] Jira integration (REST API v3, Basic Auth, webhook support)
- [x] AWS integration (Lambda invoke, STS identity, SigV4 signing)
- [x] Azure DevOps integration (Work items, builds, PAT auth, webhooks)

### MCP Pre-built Integrations
- [x] One-click connect for Bright Data, Exa, E2B, Supabase

### Connections Page Consolidation
- [x] Restructured tabs: Integrations (Messaging/Email/Calendar/DevOps/OAuth sub-tabs) + MCP

### Integration Management UI
- [x] Connected-only integration cards with status indicators, connect/disconnect flows, compact add-picker

---

## Phase 13: Dashboard & Tooling

**Status**: Complete

### Memory & Intelligence
- [x] **Vector Memory Explorer** — Dashboard view for semantic search across memories with similarity scores, embedding visualization, and manual memory entry

### WebMCP Dashboard
- [x] **Web Scraper Configuration Panel** — UI for configuring scraping jobs, URL allowlists, and proxy settings
- [x] **Browser Automation Session Manager** — View active browser sessions, screenshots, and session lifecycle controls

---

## Phase 14: Dashboard Chat Enhancements — [ADR 047](../adr/047-dashboard-chat-markdown.md)

**Status**: Complete

### Chat Markdown Rendering
- [x] **`ChatMarkdown` component** — Dedicated markdown renderer for all assistant messages in `ChatPage` and `EditorPage`
- [x] **react-markdown + remark-gfm** — Full GitHub-Flavored Markdown rendering (headings, emphasis, tables, strikethrough, autolinks)
- [x] **Syntax-highlighted code blocks** — react-syntax-highlighter (Prism) with language label and dark/light theme awareness
- [x] **Mermaid diagrams** — ` ```mermaid ` blocks rendered as interactive SVG via mermaid v11 with error handling fallback
- [x] **LaTeX / math rendering** — `$inline$` and `$$block$$` expressions rendered via remark-math + rehype-katex + KaTeX
- [x] **GitHub-style alerts** — `[!NOTE]`, `[!TIP]`, `[!IMPORTANT]`, `[!WARNING]`, `[!CAUTION]` blockquotes rendered as themed callout boxes
- [x] **Task list checkboxes** — `- [ ]` / `- [x]` GFM task items rendered as styled read-only checkboxes
- [x] **Enhanced table styling** — `overflow-x-auto` wrapper, hover states, and border styling consistent with dashboard theme
- [x] **"Thinking..." label** — Pending/streaming indicator in `ChatPage` and `EditorPage` shows text label alongside bouncing dots

---

## Phase 15: Integration Expansion

**Status**: In Progress

### Developer UX
- [x] **Developers Page** — Unified sidebar item combining Extensions and Experiments as switchable tabs (`/developers`)
- [x] **Security > Developers Section** — Lifecycle Extensions and Experiments policy toggles consolidated into a single "Developers" card in Settings > Security, matching the Sub-Agent Delegation pattern
- [x] **PolicyToggle label fix** — Sub-item toggles (A2A Networks, Lifecycle Extensions, Experiments) now display visible text labels alongside status indicators

### Settings Security Reorganization
- [ ] **MCP Servers** — Move MCP Servers to the top of the Security subview in Dashboard > Settings

### AI Cost Persistence
- [x] **`UsageStorage`** — PostgreSQL-backed storage for AI usage records (`usage_records` table, 90-day retention)
- [x] **`UsageTracker.init()`** — Async initialization method that loads historical records from the database on startup so cost/token data survives process restarts
- [x] **Fire-and-forget DB writes** — `record()` persists to PostgreSQL non-blocking (never delays AI call latency)
- [ ] **Cost History View** — Long-term historical cost analytics view in Cost Analytics page (beyond daily) with filtering by date range, provider, model, and personality

### MCP SDK Migration — [ADR 026](../adr/026-mcp-service-package.md)
- [x] **`server.tool()` → `server.registerTool()`** — Migrated all 42 MCP tool registrations across 10 tool files to the new stable API (audit, brain, integration, soul, system, task, multimodal, filesystem, browser, web tools)
- [x] **`SSEServerTransport`** — Retained for legacy client compatibility; deprecation warnings suppressed per ADR 048 policy with inline `eslint-disable-next-line` comments

### Tooling & Audit
- [x] **ESLint lint fixes** — Resolved all 51 lint errors (50 via `--fix`, 1 manual fix in `WebScraperConfigPage.tsx`); warnings reduced from 1640 → 1592
- [x] **ajv ReDoS accepted risk** — [ADR 048](../adr/048-eslint-ajv-vulnerability-accepted-risk.md) formally documents the ESLint-internal `ajv@6.x` GHSA-2g4f-4pwh-qvx6 finding as accepted risk (dev-only, zero production exposure)

### Dashboard & Tooling (deferred)
- [x] **Lifecycle Hook Debugger** — 4th tab on Extensions page: test trigger with grouped hook point selector + JSON payload, in-memory execution log (200-entry circular buffer, 5s live refresh, filter by hook point), per-entry status indicators (OK / vetoed / error), test vs live event badges

### CLI Cleanup
- [ ] **CLI Modernization** — Update and clean up CLI commands to align with latest subsystems (browser, vector memory, web scraper, A2A, multimodal)

### Settings & Preferences
- [ ] **AI Model System Default** — Ability for user to set AI model system default in Settings > General tab

### Communication
- [ ] **Email (SMTP)** — Send and receive emails via SMTP integration, email-to-message routing

---

## Phase 16: Integration Expansion II

**Status**: Pending

### Dashboard & Tooling
- [ ] **Storybook** — Component development environment for dashboard UI components, integrated into Developers section as its own view with Settings > Security > Developers toggle to enable/disable display (subview pattern like Extensions/Experiments)
- [ ] **Workspace Management** — Multi-workspace admin UI with user assignment, role management per workspace

### Security & Access
- [ ] **Roles & Permissions Review/Audit** — Comprehensive review of RBAC roles, permissions, and access controls to ensure completeness and alignment with feature set

### Productivity Integrations
- [ ] **Airtable** — Base CRUD operations, record management, view filtering
- [ ] **Linear** — Issue creation, status updates, sprint management, webhook listeners
- [ ] **Todoist** — Task management, project sync, due date handling

### Services & Cloud Integrations
- [ ] **Spotify** — Playback control, playlist management, now playing info
- [ ] **YouTube** — Video search, channel info, playlist management
- [ ] **Figma** — File access, comment sync, design file metadata
- [ ] **Stripe** — Payment status webhooks, customer lookup, invoice triggers
- [ ] **Zapier** — Zap trigger webhooks, action dispatch, webhook transformation

### Integration Architecture Improvements — [ADR 049](../adr/049-dynamic-integration-loading.md), [ADR 050](../adr/050-oauth2-first-class-support.md), [ADR 051](../adr/051-webhook-transformation-rules.md), [ADR 052](../adr/052-outbound-webhooks.md)
- [x] **Dynamic Integration Loading** — `reloadIntegration()` for zero-downtime credential rotation; `INTEGRATION_PLUGIN_DIR` auto-discovery; `POST /api/v1/integrations/:id/reload`, `GET /api/v1/integrations/plugins`, `POST /api/v1/integrations/plugins/load`
- [x] **OAuth2 First-Class Support** — Unified `OAuthTokenService` + `oauth_tokens` table; `googlecalendar`/`googledrive` OAuth providers; `GET/DELETE /api/v1/auth/oauth/tokens`; GoogleCalendarIntegration uses token service
- [x] **Webhook Transformation Rules** — `webhook_transform_rules` table (migration 013); `WebhookTransformStorage` + `WebhookTransformer`; JSONPath extraction, `{{field}}` templates, event filtering, priority ordering; full CRUD API at `/api/v1/webhook-transforms`
- [x] **Outbound Webhooks** — `outbound_webhooks` table (migration 014); `OutboundWebhookDispatcher` with fire-and-forget delivery, exponential backoff retries, HMAC signing; events: `message.inbound`, `message.outbound`, `integration.started`, `integration.stopped`, `integration.error`; full CRUD API at `/api/v1/outbound-webhooks`

### Personality Configuration
- [ ] **Per-Personality Model Defaults** — Ability to set model default and order of fallback per personality

### Vector Memory
- [ ] **ChromaDB Backend** — ChromaDB as additional vector backend option for memory storage

### Marketplace & Community
- [ ] **Provider Marketplace** — Centralized SecureYeoman skill provider marketplace (skill discovery, installation, management)
- [ ] **Community Skills** — Community-contributed skill extensions registry with `secureyeoman_community_skills.git` sub-repo support for portable, structured agent capabilities

### Platform-Specific Enhancements
- [ ] **Telegram** — Inline keyboards, photo/document handling, voice messages
- [ ] **Discord** — Thread support, modal dialogs, slash command registration
- [ ] **Slack** — Interactive messages with block actions, modal dialogs, workflow builder
- [ ] **GitHub** — PR review automation, code search tools, issue automation workflows

---

## Phase 17: Advanced Capabilities

**Status**: Pending

### Multi-Agent Systems
- [ ] **Agent Swarms** — Coordinated multi-agent execution for complex tasks with role-based specialization (researcher, coder, reviewer, etc.)
- [ ] **Dynamic Tool Creation** — Agent-driven tool generation at runtime (Agent Zero-style - agents create and register new tools as needed)

### Enterprise
- [ ] **SSO/SAML** — Single sign-on integration with enterprise identity providers (Okta, Azure AD, Auth0, etc.)
- [ ] **Managed Cloud Offering** — SaaS deployment option for organizations preferring managed infrastructure

### Visualization
- [ ] **WebGL Graph Rendering** — Investigate and basic implementation for large graph visualization
- [ ] **Layout Algorithms** — Dagre and ELK integration for automatic graph layout

### ML-based Security
- [ ] **Anomaly Detection** — Machine learning-based detection of unusual patterns in agent behavior, API calls, and security events

### Onboarding
- [ ] **First Install Onboarding** — CLI and Dashboard guided setup experience for new installations

### Encryption
- [ ] **HSM Integration** — Hardware Security Module integration for key management

### Real-time Collaboration
- [ ] **CRDT Implementation** — Conflict-free Replicated Data Types for collaborative editing

### Sandbox
- [ ] **gVisor Integration** — Additional sandbox isolation layer using gVisor
- [ ] **WASM Isolation** — WebAssembly-based code execution sandboxing

---

## Dependency Watch

Tracked third-party dependencies with known issues that require upstream resolution before action can be taken. Check these whenever running `npm update` or when the relevant packages release a new version.

| Dependency | Issue | Blocked By | Check When | ADR |
|---|---|---|---|---|
| `eslint` / `typescript-eslint` | `ajv@6.x` inside ESLint triggers GHSA-2g4f-4pwh-qvx6 (ReDoS, moderate). Dev-only, zero production exposure. Fix requires ESLint to internally upgrade to `ajv >= 8.18.0`. | ESLint 9.x hard-codes ajv 6 API — npm `overrides` breaks ESLint; `--force` downgrades typescript-eslint. | Any `eslint` or `typescript-eslint` release | [ADR 048](../adr/048-eslint-ajv-vulnerability-accepted-risk.md) |
| ~~MCP SDK — `tool` API~~ | ~~`@modelcontextprotocol/sdk` deprecated `.tool()` in favour of `.registerTool()`.~~ **Resolved in Phase 15** — all 42 call sites migrated to `server.registerTool()`. | — | — | [ADR 026](../adr/026-mcp-service-package.md) |
| MCP SDK — `SSEServerTransport` | `SSEServerTransport` deprecated in favour of `StreamableHTTPServerTransport`. Retained in `packages/mcp/src/transport/sse.ts` for legacy client compatibility; deprecation warnings suppressed. | Migration requires client-side transport compatibility verification. | MCP SDK releases | [ADR 026](../adr/026-mcp-service-package.md) |

---

## Future Enhancements

- Mobile app (native iOS/Android)

---

## Related Documentation

- [Architecture Overview](../adr/000-secureyeoman-architecture-overview.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: 2026-02-18 — Phases 15-17 added*
