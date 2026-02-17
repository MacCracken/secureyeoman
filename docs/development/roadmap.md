# Development Roadmap

> Development phases and progress for SecureYeoman

---

## Development Phases

```
Phase 1          Phase 2          Phase 2.5        Phase 3          Phase 4          Phase 5          Phase 6          Phase 8          Phase 9
Foundation       Security         Infrastructure   Dashboard        Integrations     Production       Cognitive        WebMCP           Kubernetes
   |                |                |                |                |                |                |                |                |
   v                v                v                v                v                v                v                v                v
[Core Agent] -> [RBAC/Crypto] -> [Brain/Comms] -> [React UI] -> [Platforms] -> [Hardening] -> [Intelligence] -> [Web Tools] -> [K8s Deploy]
   |                |                |                |                |                |                |                |                |
   +- Task Loop     +- Encryption    +- CLI           +- Metrics       +- Telegram      +- Load Testing  +- Vector Memory +- Web Scraping  +- Helm Chart
   +- Logging       +- Sandbox       +- Brain/Soul    +- History       +- Discord       +- Security Test +- Consolidation +- Web Search    +- GHCR Images
   +- Config        +- Validation    +- E2E Comms     +- Connections   +- Slack         +- Prometheus    +- History Comp. +- Browser (WIP) +- HPA/PDB
   +- Storage       +- Rate Limit    +- Fallbacks     +- Security      +- GitHub        +- Docs          +- Sub-Agents    +- Health Monitor+- NetworkPolicy
   +- AI Providers  +- mTLS          +- Task Storage  +- Soul UI       +- Webhooks      +- Deployment    +- Hooks/CodeExec+- Credentials   +- Observability
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

**Status**: Mostly Complete | **Reference**: [MCP Servers Directory](https://mcpservers.org/)

Connect SecureYeoman to external MCP servers from the ecosystem for extended capabilities.

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
- [x] ~~**Pre-built Integrations**~~ — Moved to [Phase 11: MCP Pre-built Integrations](#mcp-pre-built-integrations)

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
- [x] Vision processing pipeline for inline images (Discord, Slack, Telegram adapters)
- [x] Voice message transcription in integration adapters (auto-STT for voice messages)
- [x] Voice output for integration responses (TTS audio attachments in Telegram/Discord)
- [x] Image generation tool exposure via MCP (5 multimodal MCP tools)
- [x] Dashboard multimodal job viewer (consolidated into Agents page as sub-tab)
- [x] Per-personality TTS voice/model selection (personality voice → OpenAI TTS voice)

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
| Phase 7.3: Multimodal I/O | Complete |
| Phase 8.1: Web Scraping Tools | Complete |
| Phase 8.2: Web Search Tools | Complete |
| Phase 8.3: Browser Automation | Complete (Playwright) |
| Phase 8.6: MCP Infrastructure (Health/Credentials) | Complete |
| Phase 8.5: Anti-Bot & Proxy Integration | Complete |
| Phase 9: Kubernetes Deployment | Complete |
| Phase 8.8: Memory/Brain Hardening | Complete |
| **2026.2.17 Release** | **Released 2026-02-17** |
| Phase 10: Dashboard UX Enhancements | Planned |
| Phase 11: Integration Expansion | Planned |

---

## Phase 8.5: Anti-Bot & Proxy Integration — [ADR 044](../adr/044-anti-bot-proxy-integration.md)

**Status**: Complete

- [x] Proxy rotation (Bright Data, ScrapingBee, ScraperAPI) with round-robin/random strategies
- [x] CAPTCHA detection (heuristic response analysis)
- [x] Retry logic with exponential backoff + jitter
- [x] Geo-targeting via ISO country codes
- [x] Browser proxy integration (Playwright)
- [x] Feature toggle: `MCP_PROXY_ENABLED` (default: false)

---

## Phase 8.8: Memory/Brain Hardening — [ADR 045](../adr/045-memory-audit-hardening.md)

**Status**: Complete

Comprehensive audit and hardening of the Brain/Memory system addressing 20+ issues.

- [x] Fix critical pruning bug (deleted highest instead of lowest importance)
- [x] SQL injection fix via parameterized JSONB path queries
- [x] Content size limits (`maxContentLength` config, default 4096)
- [x] Prompt injection sanitization in `getRelevantContext()`
- [x] FAISS vector store `compact()` for phantom vector cleanup
- [x] Vector store sync on memory prune/maintenance
- [x] Importance floor pruning (`importanceFloor` config, default 0.05)
- [x] Consolidation flaggedIds persistence across restarts
- [x] Full 5-field cron matching for consolidation scheduler
- [x] Deep consolidation timeout enforcement via `Promise.race()`
- [x] Qdrant proper typing and auto-reconnect
- [x] External sync pagination (PAGE_SIZE=500)
- [x] Brain route rate limiting (60/min mutations, 5/min admin ops)
- [x] Query limit cap (MAX_QUERY_LIMIT=200) on all GET routes
- [x] Input validation on POST/PUT brain routes
- [x] 18 missing brain routes added to RBAC permission map
- [x] Path traversal validation on sync config updates

---

## Phase 9: Kubernetes Deployment — [ADR 042](../adr/042-kubernetes-deployment.md)

**Status**: Complete

Production-grade Kubernetes deployment using Helm charts, cloud-agnostic design (EKS/GKE/AKS), GHCR image registry, and managed PostgreSQL support.

**Decisions**:
- **Packaging**: Helm Chart (over raw manifests or Kustomize) for templating and environment overrides
- **Registry**: GitHub Container Registry (GHCR) for image hosting
- **Cloud support**: Cloud-agnostic — EKS, GKE, AKS all supported via values overrides
- **Database**: External managed PostgreSQL (RDS/Cloud SQL/Azure Database)
- **Observability**: Prometheus Operator CRDs (ServiceMonitor, PrometheusRule), Grafana sidecar dashboards

**Deliverables**:
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
- [x] Deployment guide and ADRs

---

## Phase 10: Dashboard UX Enhancements

**Status**: Planned

Comprehensive dashboard improvements and new UI components for better user experience.

### Dashboard UI (from Phase 8.7)

- [ ] Web scraper configuration panel
- [ ] Browser automation session manager
- [ ] Extraction history and results viewer

### Dashboard Improvements

#### Component Development

- [ ] **Storybook** — Component development environment for dashboard UI components

#### Integration Management

- [ ] **Integration Management UI** — Visual integration grid by category (Messaging, Productivity, Dev Tools, Services) with status indicators, connect/disconnect flows, and health metrics

#### Memory & Intelligence

- [ ] **Vector Memory Explorer** — Dashboard view for semantic search across memories with similarity scores, embedding visualization, and manual memory entry
- [ ] **Memory Consolidation Panel** — View consolidation runs, merged memories, trends chart (memory count over time), and manual trigger option
- [ ] **History Compression Viewer** — Per-conversation compression indicators, tier breakdown (current/topic/bulk), and token usage by tier

#### Agent Visualization

- [x] **Inline Form Pattern** — Replaced modal dialogs with inline collapsible card forms on Sub-Agents, Extensions, and A2A pages (ADR 039)
- [ ] **Sub-Agent Execution Tree** — Visual tree of spawned sub-agents with status, depth, and results; budget consumption per agent

#### Developer Tools

- [ ] **Lifecycle Hook Debugger** — Hook registration view, execution log, and test trigger for each hook point
- [ ] **Code Execution Console** — In-browser code editor with output streaming, session management, and approval queue

#### Analytics & Monitoring

- [ ] **Cost Analytics Dashboard** — Token usage by provider, daily/weekly/monthly trends, cost projections
- [ ] **Audit Log Explorer** — Advanced filtering, export to CSV/JSON, integrity verification status

#### Administration

- [ ] **Workspace Management** — Multi-workspace admin UI with user assignment, role management per workspace

### Multimodal Dashboard (from Phase 7.3) — Complete

- [x] Vision processing pipeline for inline images (integration-level image routing)
- [x] Voice message transcription in integration adapters (auto-STT for voice messages)
- [x] Voice output for integration responses (TTS audio attachments in Telegram/Discord/etc.)
- [x] Image generation tool exposure via MCP
- [x] Dashboard multimodal job viewer (consolidated into Agents page as sub-tab)
- [x] Per-personality TTS voice/model selection (link voice field to TTS config)

---

## Phase 11: Integration Expansion

**Status**: Planned

Expand integration ecosystem with new platforms, architecture improvements, and platform-specific enhancements.

### Productivity Integrations

- [ ] **Airtable** — Base CRUD operations, record management, view filtering
- [ ] **Linear/Jira** — Issue creation, status updates, sprint management, webhook listeners
- [ ] **Todoist** — Task management, project sync, due date handling

### Developer Tools Integrations

- [ ] **Jira** — Full REST API integration: issues, projects, workflows, comments
- [ ] **AWS** — Lambda invocation, S3 operations, SNS publishing, CloudWatch logs
- [ ] **Azure DevOps** — Work item management, build triggers, release pipelines

### Services & Cloud Integrations

- [ ] **Spotify** — Playback control, playlist management, now playing info
- [ ] **YouTube** — Video search, channel info, playlist management
- [ ] **Figma** — File access, comment sync, design file metadata
- [ ] **Stripe** — Payment status webhooks, customer lookup, invoice triggers
- [ ] **Zapier** — Zap trigger webhooks, action dispatch, webhook transformation

### AI Provider Expansions

- [ ] **Mistral** — Full API integration with chat completion, embeddings support

### Integration Architecture Improvements

- [ ] **Skill/Plugin Marketplace** — Community submission portal with signature verification, version management, rating system
- [ ] **Dynamic Integration Loading** — Load/unload integrations at runtime without restart
- [ ] **OAuth2 First-Class Support** — Unified OAuth2 flow for Google services (Gmail, Calendar, Drive)
- [ ] **Webhook Transformation Rules** — Custom payload transformation templates with variable substitution
- [ ] **Integration Health Monitoring** — Per-integration health metrics, alerting on failure thresholds
- [ ] **Outbound Webhooks** — Event-driven HTTP callbacks for integration events

### Platform-Specific Enhancements

#### Telegram
- [ ] Inline keyboards with callback buttons
- [ ] Photo/document upload and download
- [ ] Voice message handling

#### Discord
- [ ] Thread support for multi-turn conversations
- [ ] Modal dialogs for complex forms
- [ ] Slash command registration

#### Slack
- [ ] Interactive messages with block actions
- [ ] Modal dialogs (surface API)
- [ ] Workflow builder integration

#### GitHub
- [ ] PR review automation via AI (auto-review suggestions)
- [ ] Code search and file browsing tools
- [ ] Issue automation workflows

### MCP Pre-built Integrations

- [ ] One-click connect for popular MCP servers (Bright Data, Exa, E2B, Supabase)

---

## Future Enhancements

- ML-based anomaly detection
- Mobile app (native iOS/Android)
- Browser automation agent (Playwright/Puppeteer with vision model)
- ChromaDB as additional vector backend option

### Research Areas

- Sandbox: seccomp vs eBPf, gVisor, WASM isolation
- Encryption: libsodium vs WebCrypto, HSM integration
- Visualization: WebGL for large graphs, layout algorithms (Dagre, ELK)
- Real-time: Redis pub/sub, CRDT for collaborative editing

---

## Related Documentation
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Configuration Reference](../configuration.md)
- [Getting Started Guide](../guides/getting-started.md)
- [Changelog](../../CHANGELOG.md)

---

*Last updated: February 2026*
