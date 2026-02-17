# Development Roadmap

> Development phases and progress for F.R.I.D.A.Y.

---

## Development Phases

```
Phase 1          Phase 2          Phase 2.5        Phase 3          Phase 4          Phase 5          Phase 6          Phase 8
Foundation       Security         Infrastructure   Dashboard        Integrations     Production       Cognitive        WebMCP
   |                |                |                |                |                |                |                |
   v                v                v                v                v                v                v                v
[Core Agent] -> [RBAC/Crypto] -> [Brain/Comms] -> [React UI] -> [Platforms] -> [Hardening] -> [Intelligence] -> [Web Tools]
   |                |                |                |                |                |                |                |
   +- Task Loop     +- Encryption    +- CLI           +- Metrics       +- Telegram      +- Load Testing  +- Vector Memory +- Web Scraping
   +- Logging       +- Sandbox       +- Brain/Soul    +- History       +- Discord       +- Security Test +- Consolidation +- Web Search
   +- Config        +- Validation    +- E2E Comms     +- Connections   +- Slack         +- Prometheus    +- History Comp. +- Browser (WIP)
   +- Storage       +- Rate Limit    +- Fallbacks     +- Security      +- GitHub        +- Docs          +- Sub-Agents    +- Health Monitor
   +- AI Providers  +- mTLS          +- Task Storage  +- Soul UI       +- Webhooks      +- Deployment    +- Hooks/CodeExec+- Credentials
```

---

## Phase 1: Foundation

**Status**: Complete

- TypeScript project structure with strict mode, ESLint, Prettier, Vitest
- Configuration management (YAML + env vars + Zod validation)
- Base agent loop with task queue, event-driven architecture, graceful shutdown
- Multi-provider AI integration (Anthropic, OpenAI, Gemini, Ollama, LM Studio, LocalAI, OpenCode Zen, DeepSeek)
- Structured logging with UUID v7, correlation IDs, SQLite WAL storage
- Cryptographic audit chain (HMAC-SHA256, integrity verification)
- Log query API with REST endpoint

---

## Phase 2: Security Layer

**Status**: Complete

### Authentication & Authorization
- RBAC with role definitions (Admin, Operator, Auditor, Viewer), inheritance, persistent storage
- Full RBAC management via REST API (role CRUD, user-role assignments), Dashboard UI, and CLI (`secureyeoman role`)
- JWT authentication with refresh token rotation, blacklisting
- API key authentication with rate limiting and revocation
- Gateway middleware for per-route RBAC enforcement

### Encryption & Secrets
- AES-256-GCM encryption at rest with scrypt KDF
- System keyring integration (macOS Keychain, Linux Secret Service)
- Secret rotation with dual-key JWT verification and grace periods

### Input Validation & Protection
- Input validation pipeline (size limits, encoding normalization, injection detection)
- Prompt injection defense (6 pattern families, blocking + warning modes)
- Rate limiting with sliding window counters (per-user, per-IP, per-API-key, global)

### Sandboxing
- Cross-platform sandbox abstraction (`Sandbox` interface, `SandboxManager`)
- Linux: V1 soft sandbox + V2 Landlock kernel enforcement via forked worker
- macOS: `sandbox-exec` profile generation with deny-default policy
- NoopSandbox fallback with warning

### Additional
- Soul system (personality, skills, onboarding, 18 REST endpoints)
- mTLS with client certificate authentication
- Redis-backed distributed rate limiting

---

## Phase 2.5: Core Infrastructure Gaps

**Status**: Complete

- CLI entry point (`--port`, `--host`, `--config`, `--log-level`, `--tls`)
- SQLite task storage with filtering, pagination, and metrics
- Security events query API
- Rate limit metrics integration
- Brain system (memory, knowledge, skills with decay and pruning)
- E2E encrypted inter-agent communication (X25519 + Ed25519 + AES-256-GCM)
- Model fallback chain on rate limits (429) / provider unavailability (502/503)

---

## Phase 3: Dashboard

**Status**: Complete

- React + Vite + TypeScript with URL routing (react-router-dom v7)
- TanStack Query for server-state management
- WebSocket client with auto-reconnection and channel subscriptions
- Overview page with stat cards (tasks, heartbeat, audit, memory), services status panel (core, Postgres, audit chain, MCP, uptime, version)
- MetricsGraph (ReactFlow with custom node types, live connection edges for health/database/MCP/security status, click-to-detail node expansion via System Details tab)
- TaskHistory with advanced filtering (status + type), live data
- SecurityEvents with severity-based styling, live data, heartbeat task viewer
- ConnectionManager with connect forms, start/stop/delete, error retry
- ResourceMonitor with CPU/Memory gauges, token/cost tracking, real history
- Soul/Personality UI (onboarding wizard, personality editor, skills manager)
- Login page with JWT auth, automatic token refresh on 401
- Coding IDE view (Monaco editor with personality-scoped AI chat sidebar)
- Voice interface (browser-native SpeechRecognition + speechSynthesis)
- Session timeout warning, ErrorBoundary, ConfirmDialog
- Responsive mobile layout, dark/light theme

---

## Phase 4: Integrations

**Status**: Complete

- Plugin architecture (`Integration` interface, `IntegrationManager`, `IntegrationStorage`, factory pattern)
- Message abstraction (`UnifiedMessage`, `MessageAttachment`, `PlatformAdapter`, `MessageRouter`)
- REST API routes for CRUD + start/stop + messages with RBAC
- Telegram, Discord, Slack, GitHub, Google Chat, CLI, Generic Webhook adapters
- Conversation management, auto-reconnect, per-platform rate limiting

---

## Phase 4.5: Integration Expansion

**Status**: Complete

Expand integrations across multiple categories to reach parity with platforms like OpenClawd AI.

### Integration Categories

#### Messaging (Complete: 8)

| Platform | Status | Priority |
|----------|--------|----------|
| Telegram | ✅ Stable | — |
| Discord | ✅ Stable | — |
| Slack | ✅ Stable | — |
| Google Chat | ✅ Stable | — |
| iMessage | 🟡 Beta | — |
| WhatsApp | ✅ Stable | — |
| Signal | ✅ Stable | — |
| Microsoft Teams | ✅ Stable | — |

#### Productivity (Phase 7)

| Platform | Status | Priority |
|----------|--------|----------|
| Gmail | ✅ Stable | — |
| Google Calendar | ✅ Stable | — |
| Notion | ✅ Stable | — |
| Airtable | 🔲 Planned | Medium |
| Linear/Jira | 🔲 Planned | Medium |
| Todoist | 🔲 Planned | Low |

#### Developer Tools (Phase 7)

| Platform | Status | Priority |
|----------|--------|----------|
| GitHub | ✅ Stable | — |
| GitLab | ✅ Stable | — |
| Jira | 🔲 Planned | Medium |
| AWS | 🔲 Planned | Medium |
| Azure DevOps | 🔲 Planned | Low |

#### Services & Cloud (Phase 7)

| Platform | Status | Priority |
|----------|--------|----------|
| Spotify | 🔲 Planned | Medium |
| YouTube | 🔲 Planned | Low |
| Figma | 🔲 Planned | Low |
| Stripe | 🔲 Planned | Low |
| Zapier | 🔲 Planned | Medium |

#### AI Providers (Phase 7)

| Platform | Status | Priority |
|----------|--------|----------|
| Anthropic (Claude) | ✅ Stable | — |
| OpenAI (GPT) | ✅ Stable | — |
| Gemini | ✅ Stable | — |
| Ollama | ✅ Stable | — |
| LM Studio | ✅ Stable | — |
| LocalAI | ✅ Stable | — |
| OpenCode Zen | ✅ Stable | — |
| DeepSeek | ✅ Stable | — |
| Mistral | 🔲 Planned | Medium |

### Integration Architecture Improvements

- [ ] Skill/Plugin marketplace with community submissions
- [ ] Dynamic integration loading (no restart required)
- [ ] OAuth2 first-class support for all Google services
- [ ] Webhook transformation rules (custom payloads)
- [ ] Integration health monitoring with alerting
- [ ] Outbound webhooks for events

### Platform-Specific Enhancements

- [ ] Telegram inline keyboards, photo/document/voice attachments
- [ ] Discord thread support for multi-turn conversations
- [ ] Slack interactive messages (blocks, modals)
- [ ] GitHub PR review automation via AI
- [ ] GitHub code search and file browsing

### Dashboard Improvements

- [ ] **Storybook** — Component development environment for dashboard UI components
- [ ] **Integration Management UI** — Visual integration grid by category (Messaging, Productivity, Dev Tools, Services) with status indicators, connect/disconnect flows, and health metrics
- [ ] **Vector Memory Explorer** — Dashboard view for semantic search across memories with similarity scores, embedding visualization, and manual memory entry
- [ ] **Memory Consolidation Panel** — View consolidation runs, merged memories, trends chart (memory count over time), and manual trigger option
- [ ] **History Compression Viewer** — Per-conversation compression indicators, tier breakdown (current/topic/bulk), and token usage by tier
- [x] **Inline Form Pattern** — Replaced modal dialogs with inline collapsible card forms on Sub-Agents, Extensions, and A2A pages (ADR 039)
- [ ] **Sub-Agent Execution Tree** — Visual tree of spawned sub-agents with status, depth, and results; budget consumption per agent
- [ ] **Lifecycle Hook Debugger** — Hook registration view, execution log, and test trigger for each hook point
- [ ] **Code Execution Console** — In-browser code editor with output streaming, session management, and approval queue
- [ ] **Cost Analytics Dashboard** — Token usage by provider, daily/weekly/monthly trends, cost projections
- [ ] **Audit Log Explorer** — Advanced filtering, export to CSV/JSON, integrity verification status
- [ ] **Workspace Management** — Multi-workspace admin UI with user assignment, role management per workspace

### Adaptive Learning (7.1)

- [x] Feedback collection system (inline ratings, explicit corrections)
- [x] User preference profile (stored in Brain as 'preference' memories)
- [x] Behavioral pattern analyzer (conversation analysis)
- [x] Adaptive response tuning (preference injection into system prompt)

### Proactive Assistance — [ADR 040](../adr/040-proactive-assistance.md)

- [x] Trigger system with 5 types: schedule, event, pattern, webhook, llm
- [x] Suggestion queue with approve/dismiss/expire lifecycle
- [x] 5 built-in triggers (daily standup, weekly review, idle check-in, memory insight, webhook alert)
- [x] Pattern learning — LLM analysis of Brain memories to surface recurring behavioral patterns
- [x] Dashboard UI — trigger manager, suggestion queue, pattern explorer, status panel
- [x] Security gate (`allowProactive` policy flag, default: false)
- [x] WebSocket push for real-time suggestion delivery to dashboard

### MCP Ecosystem Expansion

**Status**: Planned | **Reference**: [MCP Servers Directory](https://mcpservers.org/)

Connect FRIDAY to external MCP servers from the ecosystem for extended capabilities.

#### Currently Supported
| Transport | Status |
|----------|--------|
| stdio (local) | ✅ |
| streamable-http | ✅ |
| SSE | ✅ |

#### External MCP Categories to Support

| Category | Example Servers | Priority |
|----------|---------------|----------|
| **Web Scraping** | Bright Data, Firecrawl, Browserbase | High |
| **Search** | Exa, Tavily, DuckDuckGo | High |
| **Development** | Playwright, Chrome DevTools, E2B | High |
| **Database** | Supabase, PostgreSQL, SQLite | Medium |
| **Cloud** | Cloudflare Workers, AWS, Azure | Medium |
| **Communication** | Slack, Discord, Notion | Medium |
| **Productivity** | Linear, Jira, Todoist | Medium |
| **Finance** | Alpha Vantage, Yahoo Finance | Low |
| **Code Analysis** | Context7, DeepWiki, CIE | Low |

#### Deliverables

- [x] **MCP Server Discovery** — Auto-discover tools from registered servers
- [x] **Tool Routing** — Route tool calls to appropriate external MCP server
- [x] **Remote Server Support** — First-class support for HTTP-based remote MCP servers
- [x] **Server Health Monitoring** — Periodic health checks, latency tracking, auto-disable on failure threshold
- [x] **Credential Management** — AES-256-GCM encrypted credential storage per server, secure injection into server environment
- [x] **Dashboard UI** — Server registration, tool browser, status indicators, feature toggles, credential management
- [ ] **Pre-built Integrations** — One-click connect for popular MCP servers

#### Example Integrations

```
# Bright Data (Web Scraping)
command: "npx"
args: ["@brightdata/mcp"]
env: { API_TOKEN: "..." }

# Exa (AI Search)
command: "npx"
args: ["exa-mcp-server"]
env: { EXA_API_KEY: "..." }

# E2B (Code Execution)
command: "npx"
args: ["@e2b/mcp-server"]
env: { E2B_API_KEY: "..." }

# Supabase (Database)
url: "https://mcp.supabase.io"
```

### Multimodal I/O — [ADR 041](../adr/041-multimodal-io.md)

- [x] Multimodal type system (Vision, STT, TTS, ImageGen schemas + job tracking)
- [x] MultimodalManager with OpenAI TTS/STT and DALL-E integration
- [x] REST API routes (analyze, transcribe, speak, generate)
- [x] PostgreSQL job storage with stats
- [x] Extension hooks (image-analyzed, audio-transcribed, speech-generated, image-generated)
- [x] Security gate (`allowMultimodal` policy flag)
- [x] Vocalization capability toggle in Personality Editor
- [ ] Vision processing pipeline for inline images (integration-level image routing)
- [ ] Voice message transcription in integration adapters (auto-STT for voice messages)
- [ ] Voice output for integration responses (TTS audio attachments in Telegram/Discord/etc.)
- [ ] Image generation tool exposure via MCP
- [ ] Dashboard multimodal job viewer (history, stats, playback)
- [ ] Per-personality TTS voice/model selection (link voice field to TTS config)

---

## Phase 5: Production Hardening

**Status**: Complete

- Docker packaging (multi-stage Dockerfile, docker-compose, non-root user, healthcheck)
- CI/CD pipeline (lint, typecheck, test, build, security audit, docker build; Node 20+22 matrix)
- Load testing (k6 scripts: API endpoints, auth flow, WebSocket, task creation)
- Security testing (injection, JWT manipulation, rate limit bypass, RBAC, audit integrity)
- Chaos testing (database corruption, crash recovery, resource exhaustion)
- Prometheus metrics endpoint with Grafana dashboard and alert rules
- Log aggregation (append-only JSONL file writer, log rotation with gzip, Loki + Promtail)
- MCP service (`@friday/mcp`) — 34+ tools (including 6 web, 6 browser placeholders), 7 resources, 4 prompts; health monitoring, credential management
- Skill marketplace with cryptographic signature verification
- Team workspaces with workspace-scoped RBAC
- A/B testing framework, audit report generator, cost optimization

---

## Test Coverage

| Package | Tests | Files |
|---------|-------|-------|
| `@friday/core` | 1360+ | 76 |
| `@friday/mcp` | 260+ | 29 |
| `@friday/dashboard` | 124 | 13 |
| Security + Chaos | ~76 | 8 |
| **Total** | **1800+** | **118+** |

All core modules maintain >80% coverage thresholds.

---

## Timeline Summary

| Milestone | Status |
|-----------|--------|
| Phase 1: Foundation | Complete |
| Phase 2: Security | Complete |
| Phase 2.5: Infrastructure | Complete |
| Phase 3: Dashboard | Complete |
| Phase 4: Integrations | Complete |
| Phase 4.5: Integration Expansion | Complete |
| Phase 5: Production | Complete |
| **2026.2.15 Release** | **Released 2026-02-15** |
| Phase 6.1a: Vector Memory | Complete |
| Phase 6.1b: Memory Consolidation | Complete |
| Phase 6.2: History Compression | Complete |
| Phase 6.3: Sub-Agent Delegation | Complete |
| RBAC Management (API + Dashboard + CLI) | Complete |
| **2026.2.16 Release** | **Released 2026-02-16** |
| Phase 6.4a: Lifecycle Hooks | Complete |
| Phase 6.4b: Code Execution | Complete |
| Phase 6.5: A2A Protocol | Complete |
| Phase 7: Integration Expansion | Complete (DeepSeek, Google Calendar, Notion, GitLab) |
| Phase 7.1: Adaptive Learning | Complete |
| Phase 7.2: Proactive Assistance | Complete |
| Phase 7.3: Multimodal I/O | In Progress |
| Phase 8.1: Web Scraping Tools | Complete |
| Phase 8.2: Web Search Tools | Complete |
| Phase 8.3: Browser Automation | Complete (Playwright) |
| Phase 8.6: MCP Infrastructure (Health/Credentials) | Complete |
| Phase 8.7: Dashboard UI (Toggles/Health/Credentials) | Complete |

---

## Phase 8: WebMCP — Web Intelligence & Browser Automation

**Status**: In Progress (8.1, 8.2, 8.3, 8.6, 8.7 Complete; 8.4–8.5 Planned) | **Reference**: [Bright Data MCP](https://github.com/brightdata/brightdata-mcp)

Enable FRIDAY with real-time web browsing, scraping, and browser automation capabilities.

### Inspiration

The [Bright Data MCP](https://github.com/brightdata/brightdata-mcp) provides:
- Web search with AI-optimized results
- Clean markdown extraction from any webpage
- Anti-bot protection and geo-restriction bypass
- Full browser automation (Pro)
- 60+ specialized tools for e-commerce, social, finance, maps

### Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                         WebMCP Layer                            │
├─────────────────┬─────────────────┬───────────────────────────┤
│  Web Scraper    │  Browser        │  Web Search              │
│  (HTML/Markdown)│  Automation     │  (AI-optimized)          │
├─────────────────┼─────────────────┼───────────────────────────┤
│  Playwright/    │  Puppeteer/     │  SerpAPI/               │
│  Cheerio        │  CDP            │  Tavily                 │
├─────────────────┴─────────────────┴───────────────────────────┤
│                    Anti-Bot/Proxy Layer                        │
│                 (Bright Data / ScraperAPI)                    │
└─────────────────────────────────────────────────────────────────┘
```

### Deliverables

#### 8.1 — Web Scraping Tools

- [x] `web_scrape_markdown` — Convert any webpage to clean LLM-ready markdown
- [x] `web_scrape_html` — Raw HTML extraction with optional CSS selector
- [x] `web_scrape_batch` — Process multiple URLs in parallel (max 10)
- [x] `web_extract_structured` — Extract structured JSON from pages based on field descriptions

#### 8.2 — Web Search Tools

- [x] `web_search` — Web search with configurable backend (DuckDuckGo, SerpAPI, Tavily)
- [x] `web_search_batch` — Batch search for research tasks (max 5 queries)

#### 8.3 — Browser Automation (Complete — Playwright)

- [x] `browser_navigate` — Navigate to URL, return title + URL + content snippet
- [x] `browser_screenshot` — Capture viewport or full page as base64 PNG
- [x] `browser_click` — Click element by CSS selector with configurable wait
- [x] `browser_fill` — Fill form field by CSS selector
- [x] `browser_evaluate` — Execute JavaScript in browser context, return JSON
- [x] `browser_pdf` — Generate PDF from webpage as base64
- [x] `BrowserPool` manager — lazy launch, page limit enforcement, timeout, graceful shutdown
- [x] `playwright` as optional dependency (users install separately)

#### 8.4 — Specialized Extractors

- [ ] E-commerce: Amazon, Walmart, eBay product data
- [ ] Social: Twitter/X, LinkedIn, YouTube data
- [ ] Finance: Stock prices, news, market data
- [ ] Maps: Google Maps, business listings

#### 8.5 — Anti-Bot & Proxy Integration

- [ ] Proxy rotation support (Bright Data, ScrapingBee, ScraperAPI)
- [ ] CAPTCHA handling
- [ ] Rate limiting and retry logic
- [ ] Geo-targeting for location-specific data

#### 8.6 — MCP Infrastructure

- [x] **Health Monitoring** — Periodic health checks for external MCP servers (60s interval), latency tracking, auto-disable after consecutive failures
- [x] **Credential Management** — AES-256-GCM encrypted credential storage per server, secure injection into server environment on spawn
- [x] **SSRF Protection** — Blocks private IPs (10.x, 172.16-31.x, 192.168.x), localhost, cloud metadata (169.254.169.254), file:// protocol; URL allowlist enforcement; max 3 redirect hops with re-validation
- [x] **Rate Limiting** — Web-specific rate limiter (10 req/min default, configurable via `MCP_WEB_RATE_LIMIT`)
- [x] **Output Safety** — 500KB output cap per tool call with truncation marker
- [x] **Feature Toggles** — `exposeWeb`, `exposeWebScraping`, `exposeWebSearch`, `exposeBrowser` with dashboard UI toggles and sub-toggles

#### 8.7 — Dashboard UI

- [x] Web Tools toggle (Globe icon) with collapsible scraping/search sub-toggles
- [x] Browser Automation toggle (preview label)
- [x] Health dot indicators (green/yellow/red) per external server card with latency tooltip
- [x] Credentials section per server (key listing with masked values, add/delete forms)
- [ ] Web scraper configuration panel
- [ ] Browser automation session manager
- [ ] Extraction history and results viewer

### Integration Points

| Component | Integration |
|-----------|-------------|
| MCP Tools | New `web-tools.ts` module |
| Dashboard | New "Web Intelligence" tab |
| Brain | Store scraped knowledge |
| Code Execution | Browser sessions in sandbox |

### Pricing Tiers

| Tier | Features | Cost |
|------|----------|------|
| Free | 100 searches, basic scraping | Included |
| Pro | Full browser automation, unlimited | API-based |
| Enterprise | Custom proxies, deduped data | Custom |

### Success Metrics

| Metric | Target |
|--------|--------|
| Scraping success rate | >95% |
| Page load time (avg) | <3s |
| Browser automation reliability | >90% |

---

## Phase 6: Cognitive Architecture

**Status**: Complete (6.1a, 6.1b, 6.2, 6.3, 6.4a, 6.4b, 6.5 Complete) | **ADRs**: 031–037
**Inspired by**: Comparative analysis with [agent-zero](https://github.com/agent0ai/agent-zero) cognitive patterns

```
Phase 6.1           Phase 6.2           Phase 6.3           Phase 6.4
Memory              Context             Multi-Agent          Extensibility
Foundations         Intelligence        Architecture         & Execution
    |                   |                   |                   |
    v                   v                   v                   v
[Vector Memory] -> [History       ] -> [Sub-Agent   ] -> [Hooks      ]
[Consolidation]    [Compression   ]    [Delegation  ]    [Code Exec  ]
    |                   |                   |                   |
    +- Embeddings       +- 3-tier compress  +- Specialized      +- 24 lifecycle hooks
    +- FAISS/Qdrant     +- LLM summarize    |  profiles         +- TS plugins + events
    +- Semantic recall  +- Persistent DB    +- Context isolation +- Sandboxed runtimes
    +- LLM dedup        +- Token budgeting  +- RBAC inheritance  +- Approval flow
```

---

### Phase 6.1: Memory Foundations

#### 6.1a — Vector Memory with Semantic Embeddings — [ADR 031](../adr/031-vector-semantic-memory.md)

**Priority**: Highest | **Complexity**: High

Upgrade the Brain from keyword/category-based lookups to vector-based semantic similarity search.

**Decisions**:
- **Embedding providers**: Configurable — local-first (SentenceTransformers) or API-based (OpenAI, Gemini). Users choose one or both, following the MCP model of offering enterprise in-house capability
- **Vector backends**: FAISS (default, in-process) and Qdrant (distributed deployments). ChromaDB reserved as future option
- **Integration**: Extends existing BrainStorage — vector indexing alongside current SQLite, not replacing it
- **Retrieval**: Cosine similarity with configurable thresholds, metadata filtering via existing Brain query patterns

**Deliverables**:
- [x] Embedding provider abstraction (local + API)
- [x] FAISS vector store adapter
- [x] Qdrant vector store adapter
- [x] BrainStorage extension for vector-indexed memories and knowledge
- [x] Migration path for existing Brain data
- [x] Configuration in `secureyeoman.yaml` under `brain.vector`
- [x] Dashboard UI for similarity search exploration

#### 6.1b — LLM-Powered Memory Consolidation — [ADR 032](../adr/032-memory-consolidation.md)

**Priority**: High | **Complexity**: Medium | **Depends on**: 6.1a

Prevent memory bloat through intelligent deduplication — an LLM analyzes similar memories and decides whether to merge, replace, update, or keep them separate.

**Decisions**:
- **Trigger model**: Hybrid — quick similarity check on every memory save (fast near-duplicate detection), plus scheduled deep consolidation for broader semantic merging
- **Schedule**: User-configurable interval via settings UI (default: daily)
- **Safety**: 0.9 similarity threshold for destructive REPLACE actions, race condition protection, 60s timeout per batch, fallback to direct insertion on failure
- **Actions**: MERGE, REPLACE, KEEP_SEPARATE, UPDATE, SKIP — decided by utility LLM call

**Deliverables**:
- [x] ConsolidationManager with on-save quick check
- [x] Scheduled deep consolidation job (configurable interval)
- [x] LLM consolidation prompt templates
- [x] Settings UI for schedule configuration
- [x] Audit trail entries for all consolidation actions
- [x] Metrics: consolidation runs, merges performed, memory count trends

---

### Phase 6.2: Context Intelligence

#### Progressive History Compression — [ADR 033](../adr/033-progressive-history-compression.md)

**Priority**: High | **Complexity**: Medium

Replace hard truncation with intelligent multi-tier history compression so the agent maintains coherent context across long and multi-session conversations.

**Decisions**:
- **Persistence**: Compressed history stored in SQLite, survives restarts — enables long-running multi-session conversations
- **Tiers**: Message → Topic → Bulk, with percentage-based token allocation (50% current topic, 30% historical topics, 20% bulk archives)
- **Compression escalation**: Large message truncation → LLM summarization → bulk merging (groups of 3) → oldest bulk removal
- **Scope**: Per-conversation, per-platform — integrates with existing ConversationManager

**Deliverables**:
- [x] HistoryCompressor with 3-tier compression pipeline
- [x] Token counting integration (reuse existing AI cost calculator)
- [x] LLM summarization prompts for topic/bulk compression
- [x] SQLite schema for persistent compressed history
- [x] ConversationManager integration
- [x] Configuration: tier allocation percentages, max tokens per tier
- [x] Dashboard: conversation history viewer with compression indicators

---

### Phase 6.3: Multi-Agent Architecture

#### Sub-Agent Delegation System — [ADR 034](../adr/034-sub-agent-delegation.md)

**Priority**: Medium | **Complexity**: High

Enable the primary agent to spawn subordinate agents with specialized personas for focused subtask execution.

**Decisions**:
- **Profiles**: Specialized — sub-agents get distinct prompt profiles optimized for their task type (researcher, coder, analyst, etc.), not inheriting parent Soul
- **Context isolation**: Each sub-agent gets its own conversation context, sealed after completion to prevent bleed into parent
- **Hierarchy**: Configurable max depth (default: 3); sub-agents can delegate further
- **Resource control**: Sub-agents inherit parent's RBAC scope (cannot escalate), with per-agent token budgets

**Deliverables**:
- [x] SubAgentManager: spawn, monitor, collect results
- [x] Agent profile definitions (database-stored profiles with system prompts)
- [x] Default profiles: researcher, coder, analyst, summarizer
- [x] Context isolation and sealing mechanism
- [x] Token budget tracking per sub-agent
- [x] RBAC inheritance and delegation rules
- [x] Dashboard: sub-agent execution tree visualization
- [x] MCP tools: `delegate_task`, `list_sub_agents`, `get_delegation_result`

---

### Phase 6.4: Extensibility & Execution

#### 6.4a — Lifecycle Extension Hooks — [ADR 035](../adr/035-lifecycle-extension-hooks.md)

**Priority**: Medium | **Complexity**: Medium

Expose 20+ lifecycle hooks that let users inject custom logic at key stages without modifying core code.

**Decisions**:
- **Dual system**: TypeScript plugin modules for deep customization + EventEmitter/webhook emission for lightweight integrations. Plugin authors can also emit custom events
- **Discovery**: Filesystem-based — `extensions/` directory with numeric prefix ordering (`_10_`, `_50_`)
- **Override**: User extensions in `~/.secureyeoman/extensions/` override built-in defaults with same filename

**Hook categories**:

| Phase | Hooks |
|-------|-------|
| Agent lifecycle | `agent_init`, `agent_shutdown` |
| Message loop | `message_loop_start`, `message_loop_end`, `prompt_assembly_before`, `prompt_assembly_after` |
| LLM calls | `before_llm_call`, `after_llm_call`, `stream_chunk`, `stream_end` |
| Tool execution | `tool_execute_before`, `tool_execute_after` |
| Memory | `memory_save_before`, `memory_save_after`, `memory_recall_before` |
| Sub-agent | `delegation_before`, `delegation_after`, `sub_agent_sealed` |
| Integration | `message_received`, `message_sent`, `platform_connected` |
| Security | `auth_success`, `auth_failure`, `rate_limit_hit` |

**Deliverables**:
- [x] ExtensionManager with filesystem discovery and loading
- [x] Hook registry with typed signatures per hook point
- [x] EventEmitter integration for lightweight subscribers
- [x] Webhook dispatch for external hook consumers
- [x] User extension directory support with override semantics
- [x] Documentation: hook catalog, extension authoring guide
- [x] Example extensions: logging enhancer, custom memory filter, Slack notifier

#### 6.4b — Sandboxed Code Execution Tool — [ADR 036](../adr/036-sandboxed-code-execution.md)

**Priority**: Medium | **Complexity**: Medium

Let the agent write and execute code (Python, Node.js, shell) within the existing Landlock/seccomp sandbox to solve novel problems dynamically.

**Decisions**:
- **Sandbox**: Always enabled — leverages existing Landlock (Linux) and macOS sandbox infrastructure. Not optional
- **User opt-in**: The personality's ability to *create* code requires explicit enablement:
  - Config toggle: `security.codeExecution.enabled` in `secureyeoman.yaml` (admin-only)
  - Auto-approve toggle: `security.codeExecution.autoApprove` — if `false` (default), every execution requires per-execution user approval via dashboard prompt
  - If `autoApprove: true`, executions proceed without prompting (for trusted/automated environments)
- **Runtimes**: Python (child process), Node.js (isolated-vm), shell (sandboxed subprocess)
- **Persistent sessions**: Shell sessions survive across commands within a conversation
- **Limits**: Configurable max execution time (default 180s), max output size (default 1MB), memory limits via existing sandbox config

**Deliverables**:
- [x] CodeExecutionTool with multi-runtime support
- [x] Approval flow: dashboard prompt for per-execution approval when autoApprove is off
- [x] Persistent session manager (session pool per conversation)
- [x] Output streaming to dashboard via WebSocket
- [x] Streaming secrets filter for code output (prevent API key leakage in stdout)
- [x] MCP tools: `execute_code`, `list_sessions`, `kill_session`
- [x] Configuration schema under `security.codeExecution`
- [x] Audit trail entries for all code executions (input code + output captured)

---

### Phase 6.5: A2A Protocol Interoperability — [ADR 037](../adr/037-a2a-protocol.md)

**Priority**: Low | **Complexity**: High | **Depends on**: 6.3

Enable FRIDAY instances to discover and delegate tasks to other FRIDAY (or compatible) agents over the network using a standardized Agent-to-Agent protocol.

**Decisions**:
- **Protocol**: Extend existing E2E encrypted comms layer with delegation-specific message types (task offer, accept, result, status)
- **Discovery**: Static peer list (existing comms), mDNS for LAN, DNS-SD for WAN
- **Capability negotiation**: Agents advertise available profiles and token budgets
- **Security**: All A2A messages use existing X25519 + Ed25519 + AES-256-GCM encryption

**Deliverables**:
- [x] A2A message types (delegation request/response/status/result)
- [x] Capability advertisement and negotiation protocol
- [x] mDNS/DNS-SD agent discovery
- [x] Remote delegation transport (extends SubAgentManager)
- [x] Trust and authorization model for cross-instance delegation
- [x] Dashboard: remote agent discovery and delegation UI

#### Security Policy Dashboard

- Security Settings page now includes policy toggles for high-risk capabilities:
  - Sub-Agent Delegation toggle (existing) with A2A Networks as nested sub-item
  - Lifecycle Extensions toggle (new card)
  - Sandbox Execution toggle (new card, enabled by default)
  - Proactive Assistance toggle
  - Multimodal I/O toggle
  - Experiments toggle (must be explicitly enabled after initialization)
- Policy toggles stored in SecurityConfigSchema with default values: `allowSubAgents: true`, `allowA2A: false`, `allowExtensions: false`, `allowExecution: true`, `allowProactive: false`, `allowMultimodal: false`, `allowExperiments: false`
- Security Policy API (`GET/PATCH /api/v1/security/policy`) returns/accepts all fields with immediate effect (no restart required)
- Changes are audited in the cryptographic audit chain

#### Dashboard Navigation Consolidation

- **Agents page**: Consolidated Sub-Agents and A2A Network into a single Agents view with tabbed interface when both features are enabled; shows single view when only one is active
- **Experiments page**: Extracted from Editor bottom panel into standalone sidebar page, gated by `allowExperiments` security policy; only visible in sidebar when enabled
- **Proactive page**: Built-In Triggers section now shows triggers as read-only reference; enabling is per-personality via the Personality Editor
- **Sidebar**: Conditional nav items (Agents, Extensions, Proactive, Experiments) appear only when their respective security policies allow them

---

### Phase 6 Dependency Graph

```
Phase 6.1                  Phase 6.2              Phase 6.3              Phase 6.4
┌──────────┐              ┌──────────┐           ┌──────────┐           ┌──────────┐
│6.1a Vector│──────┬──────│6.2 History│           │6.4a Hooks│           │          │
│  Memory   │      │      │ Compress  │           │          │           │          │
└──────────┘      │      └──────────┘           └──────────┘           │          │
                    │                                                     │          │
┌──────────┐      │      ┌──────────┐                                  │6.4b Code │
│6.1b Memory│◄─────┘      │6.3 Sub-  │                                  │  Exec    │
│  Consol.  │             │  Agents  │                                  │          │
└──────────┘             └──────────┘                                  └──────────┘

  6.1b depends on 6.1a — all others are independent but ordered by value
```

---

### Phase 7: Adaptive Intelligence

```
Phase 7.1           Phase 7.2           Phase 7.3
Adaptive        Proactive         Multimodal
Learning        Assistance        Input/Output
    |                |                  |
    v                v                  v
[Feedback     ] -> [Triggers    ] -> [Vision     ]
[Preferences  ]    [Suggestions ]    [Voice      ]
[Patterns     ]    [Rules Engine]    [Image Gen  ]
```

---

### Phase 6 Success Metrics

| Metric | Target |
|--------|--------|
| Memory recall relevance (semantic vs keyword) | 40% improvement in retrieval precision |
| Context coherence over 50+ message conversations | No critical context loss |
| Complex task completion (multi-step) | 30% improvement with sub-agent delegation |
| Extension adoption | 5+ community extensions within 3 months of hook release |
| Code execution task coverage | 25% of tasks benefit from dynamic code generation |

---

## Future Enhancements

- Distributed deployment (Kubernetes)
- ML-based anomaly detection
- Mobile app (native iOS/Android)
- Browser automation agent (Playwright/Puppeteer with vision model)
- ChromaDB as additional vector backend option

### Research Areas

- Sandbox: seccomp vs eBPF, gVisor, WASM isolation
- Encryption: libsodium vs WebCrypto, HSM integration
- Visualization: WebGL for large graphs, layout algorithms (Dagre, ELK)
- Real-time: Redis pub/sub, CRDT for collaborative editing

---

## Phase 7: Adaptive Intelligence

**Status**: Planned

#### 7.1 — Adaptive Learning Engine

**Priority**: High | **Complexity**: High

Enable FRIDAY to learn from interactions and improve its understanding of user preferences, working patterns, and communication styles over time.

**Decisions**:
- **Learning approach**: Implicit (behavioral patterns) + Explicit (user feedback/ratings)
- **Feedback mechanisms**: Thumbs up/down on responses, preference prompts, correction commands
- **Pattern storage**: Extend Brain with new memory types for user preferences,习惯, interaction styles
- **Adaptation scope**: Response formatting, tool selection, timing, verbosity, persona adjustments

**Deliverables**:
- [x] Feedback collection system (inline ratings, explicit corrections)
- [x] User preference profile (stored in Brain as 'preference' memories)
- [x] Behavioral pattern analyzer (conversation analysis)
- [x] Adaptive response tuning (preference injection into system prompt)
- [ ] Explicit correction UI (inline text correction)
- [ ] Preference visualization dashboard
- [ ] Privacy controls: user can view/export/clear learned preferences

#### 7.2 — Proactive Assistance — [ADR 040](../adr/040-proactive-assistance.md)

**Priority**: Medium | **Complexity**: Medium | **Status**: Complete

Enable FRIDAY to anticipate user needs and take initiative based on learned patterns and context.

**Decisions**:
- **Trigger types**: 5 types — `schedule` (cron/interval), `event` (internal hooks), `pattern` (Brain-detected), `webhook` (external HTTP), `llm` (LLM-evaluated condition)
- **Notification channels**: All connected integrations (Slack, Discord, etc.) via IntegrationManager + WebSocket push to dashboard
- **Approval flow**: User-configurable per trigger — `autoSend: true` for immediate delivery, or suggestion queue for manual review
- **Security gate**: `allowProactive` flag in security policy (default: `false`); audited in cryptographic chain

**Deliverables**:
- [x] ProactiveManager with 5 trigger types and unified scheduling via HeartbeatManager
- [x] Suggestion queue with pending/approved/dismissed/expired lifecycle
- [x] 5 built-in triggers: daily standup, weekly review, idle check-in, memory insight, webhook alert
- [x] Pattern learning — periodic LLM analysis of Brain memories to detect recurring patterns
- [x] Dashboard UI — trigger manager, suggestion queue, pattern explorer, status panel
- [x] Security gate (`allowProactive` in Security Policy API)
- [x] PostgreSQL storage via PgBaseStorage (proactive_triggers, proactive_suggestions, proactive_patterns)
- [x] REST API — 17 endpoints under `/api/v1/proactive/`
- [x] WebSocket push for real-time suggestion delivery

#### 7.3 — Multimodal Input/Output

**Priority**: Medium | **Complexity**: High

Expand beyond text to support images, voice, and potentially video for both input and output.

**Decisions**:
- **Vision input**: Image analysis via Claude Vision / GPT-4V / Gemini Vision
- **Voice input**: Already implemented in dashboard (SpeechRecognition), integrate into core message loop
- **Voice output**: Already implemented in dashboard (speechSynthesis), integrate into integrations
- **Image generation**: Integration with DALL-E / Stable Diffusion for generating images in responses

**Deliverables**:
- [x] Multimodal type system (Vision, STT, TTS, ImageGen schemas + job tracking)
- [x] MultimodalManager with OpenAI TTS/STT and DALL-E integration
- [x] REST API routes (analyze, transcribe, speak, generate)
- [x] PostgreSQL job storage with stats
- [x] Extension hooks (image-analyzed, audio-transcribed, speech-generated, image-generated)
- [x] Security gate (`allowMultimodal` policy flag)
- [x] Vocalization capability toggle in Personality Editor
- [ ] Vision processing pipeline for inline images (integration-level image routing)
- [ ] Voice message transcription in integration adapters (auto-STT for voice messages)
- [ ] Voice output for integration responses (TTS audio attachments in Telegram/Discord/etc.)
- [ ] Image generation tool exposure via MCP
- [ ] Dashboard multimodal job viewer (history, stats, playback)
- [ ] Per-personality TTS voice/model selection (link voice field to TTS config)

---

## Related Documentation

- [Architecture Overview](architecture.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: February 2026*
