# Architecture Overview

> Technical architecture and system design for SecureYeoman

## Table of Contents

1. [System Architecture](#system-architecture)
2. [Core Components](#core-components)
3. [Security Architecture](#security-architecture)
4. [Data Flow](#data-flow)
5. [Technology Stack](#technology-stack)
6. [Design Decisions](#design-decisions)

---

## System Architecture

### High-Level Architecture

```
┌─────────────────────────────────────────────────────────┐
│                SecureYeoman Dashboard                    │
│            (React + TanStack + ReactFlow)               │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Overview │ │   Chat   │ │  Tasks   │ │  General  │ │
 │  │          │ │          │ │          │ │  Security │ │
 │  │          │ │          │ │          │ │API Keys   │ │
│  └──────────┘ └────┬─────┘ └──────────┘ └───────────┘  │
└─────────────────────┼─────────────────────────────────┘
                      │ WebSocket + REST
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  SecureYeoman Gateway                   │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   Security  │ │   Metrics   │ │    Audit    │        │
│  │    Layer    │ │  Collector  │ │    Chain    │        │
│  └──────┬──────┘ └──────┬──────┘ └──────┬──────┘        │
│         └───────────────┼───────────────┘               │
│                         ▼                               │
│  ┌──────────┐ ┌──────────────────────────────────────┐  │
│  │   Chat   │ │         Sandboxed Agent Engine        │  │
│  │  Routes  │ │ (Anthropic, OpenAI, Gemini, Ollama, OpenCode) │  │
│  └────┬─────┘ └──────────────────────────────────────┘  │
│       │  ┌────────────┐ ┌───────────────┐                │
│       └──│ SoulManager│ │ Model Switch  │                │
│          └────────────┘ └───────────────┘                │
└─────────────────────────────────────────────────────────┘
```

### Monorepo Structure

```
secureyeoman/
├── README.md                   # Project overview
├── CONTRIBUTING.md             # Development guide
├── SECURITY.md                 # Security policy
├── LICENSE                     # AGPL-3.0-only
├── LICENSE.commercial          # Commercial license template
├── packages/
│   ├── shared/                 # Shared types and utilities
│   │   └── src/types/          # TypeScript interfaces + Zod schemas
│   ├── core/                   # Agent engine
│   │   └── src/
│   │       ├── ai/             # Multi-provider AI client, chat + model routes
│   │       ├── cli/            # CLI commands (license, crew, agents, etc.)
│   │       ├── config/         # Configuration management
│   │       ├── gateway/        # Fastify server + auth + rate limiting
│   │       ├── logging/        # Audit chain + storage
│   │       ├── sandbox/        # Cross-platform sandbox (Landlock, macOS)
│   │       ├── security/       # RBAC, auth, secrets, input validation
│   │       ├── brain/          # Memory, knowledge, skills, documents (RAG)
│   │       ├── comms/          # E2E encrypted agent comms
│   │       ├── soul/           # Personality + identity + archetypes
│   │       ├── task/           # Task execution + storage
│   │       ├── integrations/   # Platform adapters (31 platforms)
│   │       ├── extensions/     # Lifecycle hook system + extension manager
│   │       ├── execution/      # Sandboxed code execution
│   │       ├── a2a/            # Agent-to-Agent protocol
│   │       ├── proactive/      # Proactive assistance + triggers
│   │       ├── training/       # Distillation, fine-tuning, evaluation, ML pipeline
│   │       ├── telemetry/      # OTel, alert engine, Prometheus, job events
│   │       ├── workflow/       # DAG workflow engine + templates
│   │       ├── licensing/      # Ed25519 license manager (AGPL + commercial)
│   │       ├── storage/        # PostgreSQL migrations, pools, pg-pool
│   │       └── utils/          # Crypto utilities
│   ├── dashboard/              # React dashboard (Vite + Tailwind)
│   │   └── src/
│   │       ├── components/     # UI components
│   │       ├── hooks/          # React hooks
│   │       └── api/            # API client
│   ├── mcp/                    # MCP service (180+ tools, 7 resources, 4 prompts)
│   │   └── src/tools/          # Tool implementations + manifest
│   ├── desktop/                # Tauri v2 desktop shell
│   │   └── src-tauri/          # Rust + Tauri config
│   └── mobile/                 # Capacitor v6 mobile shell
│       └── capacitor.config.ts
├── site/                       # Project website (Astro)
├── tests/                      # Security, load, and chaos tests
│   ├── security/               # Injection, JWT, RBAC, rate limit tests
│   ├── load/                   # k6 load test scripts
│   └── chaos/                  # Database corruption, crash recovery tests
├── deploy/                     # Deployment configurations
│   ├── grafana/                # Grafana dashboard JSON
│   ├── prometheus/             # Prometheus alert rules
│   └── logging/                # Loki, Promtail, docker-compose configs
├── scripts/                    # Utility scripts (license key gen, icons, build)
├── docs/                       # Documentation
│   ├── adr/                    # 151 Architecture Decision Records
│   ├── api/                    # REST + WebSocket API reference
│   ├── guides/                 # 58 user guides
│   ├── ops/                    # Grafana dashboards, operational runbooks
│   ├── security/               # Security model + threat model
│   └── development/            # Architecture, roadmap, functional audit
└── .github/                    # CI/CD workflows
```

---

## Core Components

### 1. Agent Engine (Core)

**Location**: `packages/core/src/`

**Responsibilities**:
- Task execution and lifecycle management
- Multi-provider AI integration
- Resource monitoring and metrics collection
- Audit logging and integrity verification

**Key Modules**:
- `ai/` - AI provider abstraction (Anthropic, OpenAI, Gemini, Ollama) with configurable fallback chain on rate limits / provider unavailability; includes `chat-routes.ts` which exposes both a blocking (`POST /api/v1/chat`) and a streaming (`POST /api/v1/chat/stream`) agentic loop — see [Chat Routes](#chat-routes) below
- `ai/embeddings/` - Embedding providers (local SentenceTransformers, OpenAI/Gemini API) for vector semantic memory
- `brain/vector/` - Vector store adapters (FAISS, Qdrant) with VectorMemoryManager orchestrating semantic indexing and search
- `brain/consolidation/` - LLM-powered memory consolidation with on-save dedup and scheduled deep analysis
- `chat/compression/` - 3-tier progressive history compression (message → topic → bulk) with LLM summarization
- `agents/` - Sub-agent delegation system with specialized profiles (researcher, coder, analyst, summarizer), recursive delegation, token budgets, and context isolation
- `extensions/` - Lifecycle extension hooks with 24 hook points (observe, transform, veto semantics), filesystem-based plugin discovery, EventEmitter integration, and outbound webhook dispatch
- `execution/` - Sandboxed code execution tool supporting Python, Node.js, and shell runtimes with persistent sessions, streaming output, approval policies, and secrets filtering
- `a2a/` - Agent-to-Agent protocol for cross-instance delegation using E2E encrypted messaging, mDNS/DNS-SD discovery, capability negotiation, and trust progression (untrusted/verified/trusted)
- `proactive/` - ProactiveManager orchestrating 5 trigger types (schedule, event, pattern, webhook, llm), a suggestion queue with approve/dismiss/expire lifecycle, and pattern learning via BrainManager analysis. Reuses HeartbeatManager for scheduling, ExtensionManager for hook emission, IntegrationManager for multi-platform delivery, and BrainManager for behavioral pattern queries. All proactive behavior is gated by the `allowProactive` security policy flag (default: false) and audited in the cryptographic chain. Backed by PostgreSQL storage (PgBaseStorage) with 3 dedicated tables: `proactive_triggers`, `proactive_suggestions`, and `proactive_patterns`.
- `mcp/` - MCP client manager (external server connections, tool discovery), MCP health monitor (periodic checks, auto-disable), MCP credential manager (AES-256-GCM encrypted credential storage, injection into server environment)
- `task/` - Task queue, execution, and persistence
- `logging/` - Structured logging with cryptographic audit chain
- `config/` - Configuration loading and validation

### Chat Routes

**Location**: `packages/core/src/ai/chat-routes.ts`

The chat routes implement the agentic loop — iterating AI calls and tool executions until the model returns a response with no pending tool calls.

**Two endpoints are available:**

| Endpoint | Transport | Use Case |
|---|---|---|
| `POST /api/v1/chat` | JSON (blocking) | Programmatic callers, integrations, scripts |
| `POST /api/v1/chat/stream` | SSE (`text/event-stream`) | Dashboard, TUI, any interactive interface |

**Streaming Agentic Loop (`POST /api/v1/chat/stream`)**

The streaming endpoint emits `ChatStreamEvent` objects as each step of the loop completes. Clients receive live feedback throughout a potentially long tool-execution chain rather than waiting for the final response.

```
Client                    Gateway                   AI Provider / Tools
  │                          │                              │
  │   POST /chat/stream      │                              │
  ├─────────────────────────►│                              │
  │                          │   chatStream()               │
  │                          ├─────────────────────────────►│
  │  data: thinking_delta    │◄── thinking chunk ───────────┤
  │◄─────────────────────────┤                              │
  │  data: content_delta     │◄── text chunk ───────────────┤
  │◄─────────────────────────┤                              │
  │                          │◄── tool_use block ───────────┤
  │  data: tool_start        │                              │
  │◄─────────────────────────┤                              │
  │                          │   executeCreationTool()       │
  │                          │   or mcpClient.callTool()    │
  │  data: creation_event    │                              │
  │◄─────────────────────────┤                              │
  │  data: tool_result       │                              │
  │◄─────────────────────────┤   [loop until no tool calls] │
  │  data: done              │                              │
  │◄─────────────────────────┤                              │
```

**Tool Routing**

Within the loop, tool names are resolved in this order:
1. Creation tool registry (`executeCreationTool`) — handles `create_*`, `update_*`, `delete_*`, `assign_*`, `trigger_*`, etc.
2. MCP client (`mcpClient.callTool`) — forwards to the appropriate connected MCP server
3. Unknown — returns an error tool result and continues the loop

**Extended Thinking**

When the active personality has `body.thinkingConfig.enabled = true` and the provider is Anthropic, the request includes `thinking: { type: 'enabled', budget_tokens: N }`. The streaming path emits `thinking_delta` events as thinking text arrives. The final `done` event includes `thinkingContent` (concatenated text) for storage and display. Thinking blocks are round-tripped in `history` on subsequent turns.

**`ChatStreamEventSchema`** (defined in `packages/shared/src/types/ai.ts`) is the single source of truth for the event union. Both the server emitter and all clients (dashboard hooks, TUI, integration test harnesses) import the same schema.

---

### 2. Security Layer

**Location**: `packages/core/src/security/`

**Responsibilities**:
- Authentication and authorization (RBAC)
- Encryption and secret management
- Input validation and sanitization
- Rate limiting and threat detection

**Key Modules**:
- `rbac.ts` - Role-based access control with full CRUD (custom roles, user-role assignments)
- `rbac-storage.ts` - PostgreSQL persistent storage for role definitions and assignments
- `auth.ts` - JWT and API key authentication
- `auth-routes.ts` - Auth + RBAC role management REST endpoints (7 routes)
- `secrets.ts` - Encrypted storage and keyring integration
- `rate-limiter.ts` - Sliding window rate limiting

### 3. Gateway Server

**Location**: `packages/core/src/gateway/`

**Responsibilities**:
- HTTP API endpoints
- WebSocket real-time updates
- Request routing and middleware
- Health checks and metrics export

**Features**:
- Fastify-based REST API
- WebSocket server for real-time updates
- Authentication middleware
- Request validation and rate limiting

### 4. Dashboard UI

**Location**: `packages/dashboard/src/`

**Responsibilities**:
- Real-time monitoring interface
- Task history and management
- Security event monitoring
- System configuration

**Key Components**:
- `DashboardLayout` - Responsive shell with adaptive header, nav, and footer
- `OverviewPage` - Stat cards (tasks, heartbeat, audit, memory), services status panel (core, Postgres, audit chain, MCP, uptime, version), and system flow graph
- `StatusBar` - Inline connection/WebSocket/reconnecting status indicators
- `Sidebar` - Collapsible nav with conditional items: Agents (when sub-agents or A2A enabled), Extensions (when enabled), Proactive (when enabled), Experiments (when `allowExperiments` policy enabled)
- `MetricsGraph` - ReactFlow visualization with live connection edges reflecting health, database, MCP, and security status; accepts `metrics`, `health`, `mcpServers`, and `onNodeClick` props; clicking nodes navigates to existing detail views or the Security > System Details tab
- `AgentsPage` - Consolidated view combining SubAgentsPage and A2APage with tabbed interface when both are enabled
- `ExperimentsPage` - Standalone A/B experiments page, gated by `allowExperiments` security policy (must be explicitly enabled after initialization)
- `EditorPage` - Monaco-based code editor with terminal, sessions, and history panels
- `TaskHistory` - Historical task browser
- `SecurityEvents` - Audit log viewer with heartbeat task section (auto-expandable via URL param)
- `ConnectionManager` - Platform integration UI
- `ChatPage` - Conversational AI interface with `ChatMarkdown` for rich assistant message rendering; uses `useChatStream()` hook to consume the SSE streaming endpoint and renders `ThinkingBlock` components and active-tool badges in real time
- `ThinkingBlock` - Collapsible component displaying the model's extended thinking text; auto-opens while streaming is active, collapses to a summary line when the response completes
- `useChatStream()` hook - React hook (`useChat.ts`) that opens a `POST /api/v1/chat/stream` SSE connection and accumulates `thinking_delta`, `content_delta`, `tool_start`/`tool_result`, and `done` events into reactive component state
- `ChatMarkdown` - Markdown renderer for assistant messages: react-markdown + remark-gfm (GFM tables/task-lists/alerts), Prism syntax highlighting (react-syntax-highlighter, dark/light theme-aware), mermaid v11 diagram rendering with error fallback, KaTeX math via remark-math + rehype-katex, GitHub-style alert callouts, and styled tables with overflow handling

### 5. Soul System

**Location**: `packages/core/src/soul/`

**Responsibilities**:
- Personality management (create, enable/disable, set-default, update, delete)
- Prompt composition following the "In Our Image" hierarchy (Soul > Spirit > Brain > Body > Heart)
- Sacred archetypes cosmological preamble
- User profile and owner context injection
- Skill management (delegated to Brain when available)
- AI-driven resource creation/deletion via capability-gated `creationConfig` tools

**Multi-active personality model** (ADR 125) — multiple personalities may run simultaneously. Three personality flags govern lifecycle:

| Flag | Type | Exclusive | Description |
|------|------|-----------|-------------|
| `isActive` | `boolean` | No | Personality's heartbeat and proactive checks run; can be toggled independently per personality |
| `isDefault` | `boolean` | Yes | Used for new chats, `GET /soul/personality`, and the HeartbeatManager schedule; exactly one personality holds this flag |
| `isArchetype` | `boolean` | — | System preset seeded at startup; deletion permanently blocked |

The default personality is the sole source of identity in the composed prompt for new chat sessions. The agent name is stored separately for display purposes but is not injected into the system prompt — the personality's own `name` and `systemPrompt` fields define the complete identity.

**Personality deletion guards** — three independent protections apply before `SoulStorage.deletePersonality()` is ever called:
1. **Archetype guard** — `SoulManager.deletePersonality()` throws `"Cannot delete a system archetype personality."` if `isArchetype = true`.
2. **Default personality guard** — throws if the target personality is the current default (`isDefault = true`).
3. **`deletionProtected` flag** — throws if `personality.deletionProtected` is `true`. Set via the **Ontostasis** toggle in the dashboard (or the REST API).

**AI self-deletion guard** — when the AI invokes `delete_personality`, `creation-tool-executor.ts` compares the target ID against the calling personality's context ID. A personality cannot delete itself; this check is in the executor (not the manager) because only the executor has the calling context.

> **`locked` vs `deletionProtected`** — `deletionProtected` blocks deletion only. A future `locked` flag will block edits (edit-immutability, deferred RBAC story).

**Key Modules**:
- `archetypes.ts` - Sacred archetypes constant and `composeArchetypesPreamble()`
- `storage.ts` - PostgreSQL persistence for personalities, skills, users; maps `deletion_protected` ↔ `deletionProtected`
- `manager.ts` - SoulManager with prompt composition orchestrating all four layers; deletion guards
- `creation-tools.ts` - Tool schemas for AI resource creation/deletion (skills, tasks, personalities, roles, experiments, workflows, A2A)
- `creation-tool-executor.ts` - Executor for AI creation tools; self-deletion guard; delegates to managers
- `soul-routes.ts` - REST API endpoints

### 6. Spirit System

**Location**: `packages/core/src/spirit/`

**Responsibilities**:
- Passion, inspiration, and pain point management
- Emotional prompt composition (`## Spirit` section)
- Sits between Soul (identity) and Brain (knowledge) in the hierarchy

**Key Modules**:
- `storage.ts` - SQLite persistence for passions, inspirations, pains
- `manager.ts` - SpiritManager with `composeSpiritPrompt()`
- `spirit-routes.ts` - REST API endpoints

### 7. Brain System

**Location**: `packages/core/src/brain/`

**Responsibilities**:
- Memory storage and retrieval (episodic, semantic, procedural, preference)
- Knowledge base management with confidence tracking
- Skill registry (moved from Soul for separation of concerns)
- Context injection into AI prompts (`## Brain` section) from relevant memories/knowledge

**Key Modules**:
- `storage.ts` - SQLite persistence for memories, knowledge, and skills
- `manager.ts` - BrainManager with memory decay, pruning, and context retrieval
- `brain-routes.ts` - REST API endpoints including knowledge CRUD (PUT/DELETE), heartbeat task management, and external brain sync
- `external-sync.ts` - ExternalBrainSync for exporting to Obsidian, Git Repo, or Filesystem

### 8. Body System

**Location**: `packages/core/src/body/`

**Responsibilities**:
- Physical form and capability management (vision, limb movement, auditory, haptic)
- Heart subsystem for vital signs and periodic self-checks
- Per-task heartbeat scheduling — each task has its own `intervalMs` so checks run at different frequencies
- Reflective tasks that record episodic memories for self-improvement
- Body prompt injection (`## Body` section with `### Heart` subsection) into the composed Soul prompt

**Key Modules**:
- `heart.ts` - HeartManager wrapping HeartbeatManager, owns `### Heart` prompt subsection including task schedule
- `heartbeat.ts` - HeartbeatManager with per-task scheduling, `updateTask()`, reflective task handler, and `lastRunAt` tracking

### 9. Agent Communication (Comms)

**Location**: `packages/core/src/comms/`

**Responsibilities**:
- E2E encrypted messaging between SecureYeoman instances
- Peer agent discovery and management
- Secret sanitization (strips API keys, tokens from payloads)
- Local message log with retention policies

**Key Modules**:
- `crypto.ts` - X25519 key exchange + Ed25519 signing + AES-256-GCM encryption
- `storage.ts` - Peer registry and message log persistence
- `agent-comms.ts` - AgentComms orchestrator
- `comms-routes.ts` - REST API endpoints

### 10. Sandbox System

**Location**: `packages/core/src/sandbox/`

**Responsibilities**:
- Cross-platform execution isolation
- Resource limits and monitoring
- Filesystem access control
- Network restriction enforcement

**Features**:
- Platform-specific implementations:
  - **Linux**: V1 soft sandbox (path validation, resource tracking) + V2 Landlock kernel enforcement via forked worker process (graceful fallback to V1 if kernel lacks Landlock support)
  - **macOS**: `sandbox-exec` profile generation with deny-default policy; falls back to resource tracking when sandbox-exec is unavailable
  - **Other**: NoopSandbox fallback with warning
- Resource usage tracking (memory peak, CPU time)
- Violation detection and reporting
- SandboxManager auto-detects platform capabilities and selects the appropriate implementation

### 11. Integration Framework

**Location**: `packages/core/src/integrations/`

**Responsibilities**:
- Platform adapter lifecycle management (init, start, stop, health)
- Message normalization between platform-specific and unified formats
- Message routing from inbound messages to AI and back to platform

**Key Modules**:
- `manager.ts` - IntegrationManager with factory registration and lifecycle control
- `conversation.ts` - ConversationManager with per-platform context windows
- `types.ts` - Integration, PlatformAdapter, UnifiedMessage interfaces

**Platform Adapters**:
- `telegram/` - grammy bot API with long-polling
- `discord/` - discord.js v14 with slash commands and embeds
- `slack/` - Slack Bolt with socket mode
- `github/` - Octokit REST + webhook handler with signature verification

### 12. Logging & File Writer

**Location**: `packages/core/src/logging/`

**Responsibilities**:
- Structured JSON logging via Pino
- Append-only JSONL file output
- Log rotation with gzip compression
- Full-text search via FTS5

**Key Modules**:
- `sqlite-storage.ts` - SQLite audit storage with WAL mode and FTS5
- `file-writer.ts` - AppendOnlyLogWriter (JSONL, O_APPEND)
- `log-rotation.ts` - LogRotator (size/age-based, gzip compression)

### 13. Monitoring (Prometheus)

**Location**: `packages/core/src/gateway/prometheus.ts`

**Responsibilities**:
- `/metrics` endpoint in Prometheus text exposition format
- Task, resource, and security counter metrics
- Integration with Grafana dashboards and alert rules

**Deployment configs**: `deploy/prometheus/`, `deploy/grafana/`, `deploy/logging/`

---

## Security Architecture

### Defense in Depth

```
┌─────────────────────────────────────────────────────────┐
│                    Network Layer                        │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   TLS 1.3   │ │ Domain WL   │ │ Rate Limit  │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                  Application Layer                      │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │     RBAC    │ │ Input Val   │ │   JWT Auth  │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────┬───────────────────────────────┘
                          │
┌─────────────────────────┴───────────────────────────────┐
│                   Execution Layer                       │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐        │
│  │   Sandbox   │ │ Encryption  │ │   Audit     │        │
│  └─────────────┘ └─────────────┘ └─────────────┘        │
└─────────────────────────────────────────────────────────┘
```

### Security Features

| Layer | Mechanism | Purpose |
|-------|-----------|---------|
| **Network** | TLS 1.3, Domain Whitelisting | Secure communication, prevent unauthorized access |
| **Application** | RBAC, JWT, Input Validation | Access control, prevent injection attacks |
| **Execution** | Sandboxing, Encryption, Audit | Isolate untrusted code, protect data, track access |

---

## Data Flow

### Request Processing Flow

```
1. Client Request
   ↓
2. Gateway Authentication
   ↓ (JWT/API Key)
3. RBAC Authorization
   ↓ (Permission Check)
4. Input Validation
   ↓ (Sanitization)
5. Rate Limit Check
   ↓ (Sliding Window)
6. Task Creation
   ↓ (Queue)
7. Sandboxed Execution
   ↓ (Resource Limits)
8. AI Provider Call
   ↓ (Multi-provider)
9. Response Processing
   ↓ (Validation)
10. Audit Logging
    ↓ (Cryptographic Chain)
11. Client Response
```

### Streaming Chat Data Flow

```
1. Client sends POST /api/v1/chat/stream (JSON body)
   ↓
2. Gateway Authentication + RBAC
   ↓
3. Personality resolved → thinkingConfig read
   ↓
4. Provider chatStream() called → SSE connection opened
   ↓ (per chunk)
5a. thinking_delta event → client renders thinking text live
5b. content_delta event → client streams response text live
   ↓ (on tool_use block)
6. tool_start event emitted → creation tool or MCP tool executed
   ↓
7. creation_event emitted (if resource created/updated/deleted)
   ↓
8. tool_result event emitted → result appended to history
   ↓ (loop back to step 4 with updated history)
9. done event emitted → final content, thinkingContent, creationEvents
   ↓
10. Client closes SSE connection
```

### Audit Data Flow

```
Task Execution
   ↓
Event Capture (Structured Logger)
   ↓
Entry Creation (UUID v7 + Hash)
   ↓
Chain Verification (HMAC-SHA256)
   ↓
SQLite Storage (WAL Mode)
   ↓
Query API (REST Endpoint)
   ↓
Dashboard Display (WebSocket)
```

---

## Technology Stack

### Backend

| Component | Technology | Reason |
|-----------|------------|--------|
| Runtime | Node.js 20 LTS | TypeScript support, async performance |
| Framework | Fastify | High performance, built-in validation |
| Database | SQLite | Zero-config, portable, ACID compliant |
| Cryptography | Node.js crypto | Native implementation, FIPS compliant |
| Testing | Vitest | Fast, Vite-native, modern |

### Frontend

| Component | Technology | Reason |
|-----------|------------|--------|
| Framework | React 18 | Component ecosystem, concurrent features |
| Build Tool | Vite | Fast HMR, modern bundling |
| State Management | TanStack Query | Cache management, real-time updates |
| UI Components | Tailwind CSS | Utility-first, consistent |
| Visualization | ReactFlow | Interactive node graphs |
| Markdown Rendering | react-markdown + remark-gfm | Full GFM rendering for chat messages |
| Syntax Highlighting | react-syntax-highlighter (Prism) | Language-aware code block highlighting, theme-aware |
| Diagram Rendering | mermaid v11 | Interactive SVG diagrams from fenced code blocks |
| Math Rendering | remark-math + rehype-katex + KaTeX | LaTeX inline and block math typesetting |
| TypeScript | TypeScript 5 | Type safety, developer experience |

### Development

| Tool | Purpose |
|------|---------|
| ESLint + Prettier | Code quality and formatting |
| Husky | Git hooks for pre-commit checks |
| GitHub Actions | CI/CD pipeline |
| Docker | Containerization and deployment |

---

## Design Decisions

### 1. Monorepo vs Multi-repo

**Decision**: Monorepo with npm workspaces

**Rationale**:
- Shared TypeScript types between packages
- Unified tooling and configuration
- Simplified dependency management
- Atomic commits across packages

### 2. Database Choice

**Decision**: SQLite with PostgreSQL abstraction

**Rationale**:
- SQLite: Zero-config, perfect for single-user local deployment
- PostgreSQL: Scalable for multi-user enterprise deployments
- Abstraction layer for flexibility

### 3. Authentication Strategy

**Decision**: JWT + API keys with refresh rotation

**Rationale**:
- JWT: Stateless, works well with distributed systems
- API Keys: Simple for programmatic access
- Refresh rotation: Balance security and usability

### 4. Real-time Communication

**Decision**: WebSocket for system broadcasts; SSE for streaming chat responses

**Rationale**:
- WebSocket: Full-duplex, low latency for system-level broadcasts (task updates, health, metrics)
- SSE (`POST /api/v1/chat/stream`): Unidirectional, HTTP/2-compatible, connection-per-request — maps naturally to the streaming agentic loop where the client sends one request and receives a sequence of progress events
- Both are standardised and well-supported across proxies and firewalls

### 5. Security Model

**Decision**: Defense in depth with audit first

**Rationale**:
- Multiple layers prevent single point of failure
- Comprehensive logging for compliance and forensics
- Security as a first-class citizen, not an afterthought

### 6. Plugin Architecture

**Decision**: TypeScript interfaces with dynamic imports

**Rationale**:
- Type-safe plugin development
- Runtime flexibility for integrations
- Sandboxed plugin execution

---

## Performance Considerations

### Scalability

| Component | Scaling Strategy |
|-----------|------------------|
| Gateway | Horizontal scaling with load balancer |
| Database | Read replicas, connection pooling |
| AI Calls | Provider rotation, caching, retry |
| Dashboard | Code splitting, lazy loading |

### Caching

| Layer | Cache Type | Duration |
|-------|------------|----------|
| API Response | In-memory | 5 minutes |
| AI Calls | Token cache | 1 hour |
| RBAC | Permission cache | 30 minutes |
| Audit Queries | SQLite WAL | Real-time |

### Monitoring

- Real-time metrics via WebSocket
- Prometheus export for observability
- Structured logging for debugging
- Performance profiling with built-in timers

---

## Kubernetes Deployment

SecureYeoman supports production deployment on Kubernetes via Helm charts located in `deploy/helm/secureyeoman/`.

### Architecture

```
                    ┌─────────────┐
                    │   Ingress   │  (nginx / ALB / GCE)
                    │  TLS + WSS  │
                    └──────┬──────┘
            ┌──────────────┼──────────────┐
            ▼              ▼              ▼
     ┌────────────┐ ┌────────────┐ ┌────────────┐
     │  Dashboard  │ │    Core    │ │    MCP     │
     │   (nginx)   │ │  (Fastify) │ │  (Fastify) │
     │  :80 static │ │   :18789   │ │   :3001    │
     └──────┬─────┘ └──────┬─────┘ └────────────┘
            │              │
            └──► proxy ►───┘──────► Managed PostgreSQL
                                     (RDS / Cloud SQL)
```

### Components

| Deployment | Image | Port | Purpose |
|-----------|-------|------|---------|
| `secureyeoman` | `ghcr.io/maccracken/secureyeoman` | 18789, 443 | Gateway + dashboard (SPA via @fastify/static) + AGNOS (LLM Gateway 8088, Agent Runtime 8090) |
| `secureyeoman-mcp` | `ghcr.io/maccracken/secureyeoman` | 3001 | MCP server (same image, different entrypoint) |

### Key Features

- **Scaling**: HPA scales core (2-10 replicas) and MCP (1-5 replicas) on CPU
- **Security**: Non-root containers, read-only root FS, seccomp RuntimeDefault, NetworkPolicies
- **Observability**: Prometheus ServiceMonitor, 9 PrometheusRule alerts, Grafana dashboard auto-discovery
- **Secrets**: Native K8s Secrets or ExternalSecret CRD (AWS/GCP/Azure)
- **Environments**: Separate values files for dev, staging, production

See [Kubernetes Deployment Guide](../guides/kubernetes-deployment.md) for setup instructions.

---

## Related Documentation

- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Development Roadmap](roadmap.md)
- [Kubernetes Deployment Guide](../guides/kubernetes-deployment.md)

---

*This architecture document reflects the current state of SecureYeoman and evolves as the system develops.*