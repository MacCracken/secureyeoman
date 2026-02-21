# SECUREYEOMAN

[![Version](https://img.shields.io/badge/Version-2026.2.21-blue.svg)](https://github.com/MacCracken/secureyeoman/releases/tag/v2026.2.21)
[![CI](https://github.com/MacCracken/secureyeoman/actions/workflows/ci.yml/badge.svg)](https://github.com/MacCracken/secureyeoman/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Security: Enterprise-Grade](https://img.shields.io/badge/Security-Enterprise--Grade-green.svg)]()
[![Tests: 6351+](https://img.shields.io/badge/Tests-6351%2B-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Helm-326CE5.svg)](https://helm.sh/)

> A secure, local-first AI assistant with enterprise-grade protection and comprehensive observability. Comes with default Agent Personality F.R.I.D.A.Y.

* **F**ully
* **R**esponsive
* **I**ntegrated
* **D**igitally
* **A**daptable
* **Y**eoman

---

## Quick Start

**Option A — Single binary (fastest):**
```bash
curl -fsSL https://secureyeoman.ai/install | bash
secureyeoman init
```

**Option B — Docker Compose:**
```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
cp .env.example .env   # edit with your API key + security keys
docker compose up -d
```

**Option C — From source:**
```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
cp .env.example .env
npm install && npm run dev
```

Then open http://localhost:18789 and complete the onboarding wizard.

---

## What is SECUREYEOMAN?

SECUREYEOMAN is a **secure autonomous agent system** built around the **SecureYeoman** core. Unlike traditional AI assistants, SECUREYEOMAN:

- **Prioritizes Security**: Enterprise-grade RBAC, encryption, sandboxing, and audit trails
- **Respects Privacy**: Local-first architecture with data that never leaves your system
- **Provides Observability**: Every action is logged with cryptographic integrity verification
- **Offers Flexibility**: Multi-provider AI support (Anthropic, OpenAI, Gemini, Ollama, DeepSeek, OpenCode Zen, Mistral, x.ai Grok)
- **Learns and Adapts**: Editable personality, learnable skills, and a marketplace for sharing them

---

## Key Features

| Category | Features |
|----------|----------|
| **Security** | RBAC (Admin/Operator/Auditor/Viewer), JWT + API key auth, mTLS, AES-256-GCM encryption at rest, sandboxed execution (Landlock/macOS sandbox), rate limiting (per-user, per-IP, global), HTTP security headers (HSTS, CSP, X-Frame-Options), CORS policy enforcement |
| **Observability** | Cryptographic audit trails (HMAC-SHA256 chain), Prometheus metrics, Grafana dashboards, structured JSONL log rotation, audit retention enforcement, audit export |
| **AI Integration** | Anthropic Claude, OpenAI GPT, Google Gemini, Ollama, LM Studio, LocalAI (local), OpenCode Zen, DeepSeek, Mistral, x.ai Grok; automatic fallback chains on rate limits/outages; dynamic model discovery |
| **Dashboard** | React + Vite + Tailwind; real-time WebSocket updates (channel-based RBAC); overview with stat cards (tasks, heartbeat, audit, memory) and services status panel (core, Postgres, audit chain, MCP); system flow graph (ReactFlow) with live connection edges; task history, security events, resource monitor, personality editor (Brain section shows associated skills with direct edit navigation), skills manager, code editor (Monaco), notification & retention settings; **WebGL graph visualization** (Sigma.js + graphology) with pluggable layout algorithms — ForceAtlas2 for hub-and-spoke peer networks, Dagre hierarchical layout for delegation trees and DAGs; **rich chat rendering** — assistant messages rendered as full Markdown with syntax-highlighted code (Prism, dark/light theme-aware), interactive Mermaid diagrams, KaTeX math expressions, GitHub-style alert callouts, task list checkboxes, and styled tables; **real-time collaborative editing** — personality system prompts and skill instructions use Yjs CRDT over a binary `/ws/collab` WebSocket; **presence indicators** — `PresenceBanner` shows who else is editing the same field in real time (colored dots + name label) |
| **Agent Architecture** | Soul (identity/archetypes/personality), Spirit (passions/inspirations/pains), Brain (memory/knowledge/skills with decay & pruning, vector semantic search via FAISS/Qdrant/ChromaDB, LLM-powered memory consolidation), Body (heartbeat/vital signs/screen capture, per-personality capabilities: vision, auditory, vocalization, limb movement, haptic) |
| **Cognitive Architecture** | Vector semantic memory (local SentenceTransformers + OpenAI/Gemini API embeddings), FAISS, Qdrant, and ChromaDB vector backends, LLM-powered memory consolidation with on-save dedup and scheduled deep analysis, 3-tier progressive history compression (message → topic → bulk) with AI summarization |
| **Extensions** | 38 lifecycle hook points (observe/transform/veto semantics), TypeScript plugin modules with filesystem discovery, EventEmitter integration, outbound webhook dispatch with HMAC signing, hot-reload support |
| **Code Execution** | Sandboxed code execution (Python, Node.js, shell) within Landlock/seccomp sandbox, persistent sessions, streaming output via WebSocket, approval policies (manual/auto/session-trust), streaming secrets filter, full audit trail |
| **A2A Protocol** | Agent-to-Agent cross-instance delegation via E2E encrypted messaging, peer discovery (mDNS/DNS-SD/static), capability negotiation, trust progression (untrusted/verified/trusted), remote delegation in unified delegation tree |
| **Multi-Agent Architecture** | Sub-agent delegation system with role-based profiles (researcher, coder, analyst, reviewer, summarizer); Agent Swarms with named templates and three strategies — `sequential` (context-chaining pipeline), `parallel` (`Promise.all` + optional coordinator synthesis), `dynamic` (coordinator-driven, uses `delegate_task` internally); `create_swarm` MCP tool; 4 built-in templates; dashboard Swarms tab; **Dynamic Tool Creation** — agents can generate and register new tools at runtime (Agent Zero-style), gated by `allowDynamicTools` security policy with `sandboxDynamicTools` isolation; **Extensible sub-agent types** — `llm` (agentic loop), `binary` (spawn external process via JSON stdin/stdout, zero token cost, gated by `allowBinaryAgents`), `mcp-bridge` (call MCP tool directly with Mustache template, zero token cost) |
| **Integrations** | Telegram (inline keyboards, document attachments), Discord (threads, modals, slash command registration via REST), Slack (Block Kit actions, modal dialogs, Workflow Builder steps), GitHub (PR review automation, issue auto-labeling, code search triggers), GitLab, Google Chat, Gmail, Email (IMAP/SMTP), Google Calendar, Notion, Jira, AWS, Azure DevOps, CLI, Generic Webhook — plugin architecture with unified message routing |
| **MCP Protocol** | Standalone `@secureyeoman/mcp` service (34+ tools including web scraping, search, browser automation placeholders; 7 resources, 4 prompts); SSRF-protected web tools; health monitoring for external servers; AES-256-GCM encrypted credential storage; streamable HTTP, SSE, and stdio transports; feature toggles with dashboard UI; one-click pre-built integrations for Bright Data, Exa, E2B, and Supabase |
| **Marketplace** | Skill discovery, search, install/uninstall (syncs with Brain skills), publish; **Community Skills** — local-path sync from [`secureyeoman-community-skills`](https://github.com/MacCracken/secureyeoman-community-skills) or any compatible repo; source tracking (`builtin` / `community` / `published`) |
| **Team Collaboration** | Multi-user foundation (`auth.users`); workspaces with isolation, member management, workspace-scoped RBAC; **SSO/OIDC** — Okta, Azure AD, Auth0 and any standards-compliant OIDC issuer via `openid-client` v6; PKCE flow; JIT user provisioning; per-workspace IDP binding; **CRDT collaborative editing** — Yjs Y.Text over `/ws/collab/:docId` (personality/skill scoped); server-resolved presence identities (display name from soul users table); DB-backed Y.Doc state (`soul.collab_docs`) survives server restarts |
| **Reports & Analytics** | Audit report generator (JSON/HTML/CSV), cost optimization recommendations, A/B testing framework |
| **Voice** | Push-to-talk (Ctrl+Shift+V), browser-native speech recognition & synthesis, voice overlay |
| **Deployment** | **Single binary** (Bun compile, ~80 MB, no runtime deps) for Linux x64/arm64 and macOS arm64; Tier 2 SQLite `lite` binary for edge/embedded; Docker image ~80 MB (binary-based, vs ~600 MB Node.js); Kubernetes Helm chart (EKS/GKE/AKS), GHCR image registry, HPA autoscaling, PodDisruptionBudgets, NetworkPolicies, ExternalSecret CRD support |
| **CLI** | 21 commands covering server management, health, config validation, integration management, role/extension management, browser automation, vector memory, web scraping, multimodal I/O, AI model switching, security policy, plugin management; shell completions (bash/zsh/fish); `--json` output on all commands for scripting; colored output (green/red status indicators, TTY-aware); progress spinners for long-running operations |
| **Development** | TypeScript strict mode, 6351+ tests across 351 files, CI/CD pipeline (lint/typecheck/test/build/security audit/docker-push/helm-lint); **Storybook** component development environment integrated into the Developers section (gated by `allowStorybook` security policy), with quick-start instructions, component story gallery, and iframe to localhost:6006 |

---

## Architecture

```
┌───────────────────────────────────────────────────────────┐
│                       Dashboard (React)                    │
│  Overview | Tasks | Security | Personality | Code | Chat  │
└───────────────────────┬───────────────────────────────────┘
                        │ REST + WebSocket
┌───────────────────────▼──────────────────────────────────┐
│                  Gateway (Fastify)                         │
│  Auth Middleware → RBAC → Rate Limiting → Security Headers│
├──────────────────────────────────────────────────────────┤
│                  SecureYeoman Core                         │
│  ┌─────┐ ┌──────┐ ┌──────┐ ┌──────┐ ┌─────┐ ┌────────┐ │
│  │ Soul│ │Spirit│ │Brain │ │ Body │ │Task │ │Logging │ │
│  └─────┘ └──────┘ └──────┘ └──────┘ └─────┘ └────────┘ │
│  ┌──────────┐ ┌───────────┐ ┌──────────┐ ┌───────────┐  │
│  │ Security │ │Integration│ │    AI    │ │    MCP    │  │
│  │RBAC/Crypt│ │  Manager  │ │ Provider │ │Client/Srv │  │
│  └──────────┘ └───────────┘ └──────────┘ └───────────┘  │
└──────────────────────────────────────────────────────────┘
         │              │              │
    ┌────▼────┐   ┌─────▼─────┐  ┌────▼────┐
    │ SQLite  │   │ Platforms │  │  MCP    │
    │  (WAL)  │   │ TG/DC/SL/ │  │ Service │
    │         │   │ GH/GC/WH  │  │(34+tools│
    └─────────┘   └───────────┘  └─────────┘
```

---

## Prerequisites

- **Node.js** 20 LTS or later
- **npm** (project uses npm workspaces)
- **AI Provider API Key**: At least one of Anthropic, OpenAI, Google Gemini, OpenCode Zen, or Ollama (local)

---

## Installation

### Single Binary

Download from [Releases](https://github.com/MacCracken/secureyeoman/releases) or use the install script:

```bash
curl -fsSL https://secureyeoman.ai/install | bash
```

Two tiers:

| Binary | Requires | Platforms |
|--------|----------|-----------|
| `secureyeoman-linux-x64` / `linux-arm64` / `darwin-arm64` | PostgreSQL | Tier 1 |
| `secureyeoman-lite-linux-x64` / `lite-linux-arm64` | Nothing (SQLite built-in) | Tier 2 |

```bash
secureyeoman init          # first-time setup wizard
secureyeoman start         # start the server (dashboard + API on port 18789)
secureyeoman mcp-server    # start the MCP server separately
```

### From Source

```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
npm install

# Configure
cp .env.example .env
# Edit .env with your API key and security keys (minimum 32 characters each)

# Start (core serves dashboard + API)
npm run dev
```

### Docker

```bash
# Core + PostgreSQL (dashboard served by core on port 18789)
docker compose up -d

# With MCP service
docker compose --profile mcp up -d

# Dashboard dev server (hot-reload Vite, for frontend development)
docker compose --profile dev up -d

# Fresh start (wipe database and data volumes)
docker compose down -v

# Backup database
docker compose exec postgres pg_dump -U secureyeoman secureyeoman > backup.sql

# Restore database
docker compose exec -T postgres psql -U secureyeoman secureyeoman < backup.sql

# Production image (requires pre-built binary: npm run build:binary)
docker build -t secureyeoman .
docker run --env-file .env -p 18789:18789 secureyeoman
```

### Kubernetes (Helm)

```bash
# Lint and install
helm lint deploy/helm/secureyeoman
helm install secureyeoman deploy/helm/secureyeoman \
  --namespace secureyeoman --create-namespace \
  --set secrets.postgresPassword=your-password \
  --set database.host=your-db-host.example.com

# Production deployment
helm install secureyeoman deploy/helm/secureyeoman \
  -f deploy/helm/secureyeoman/values-production.yaml \
  --namespace secureyeoman-production --create-namespace \
  --set secrets.postgresPassword=your-password \
  --set database.host=production-db.example.com
```

See the [Kubernetes Deployment Guide](docs/guides/kubernetes-deployment.md) for cloud-specific configurations (EKS, GKE, AKS).

### Environment Variables

Required:

```bash
# Security keys (generate your own, minimum 32 characters each)
SECUREYEOMAN_SIGNING_KEY="your-32-char-signing-key"
SECUREYEOMAN_TOKEN_SECRET="your-32-char-token-secret"
SECUREYEOMAN_ENCRYPTION_KEY="your-32-char-encryption-key"
SECUREYEOMAN_ADMIN_PASSWORD="your-32-char-admin-password"

# AI provider (at least one required)
ANTHROPIC_API_KEY="sk-ant-..."
# or OPENAI_API_KEY="sk-..."
# or GOOGLE_GENERATIVE_AI_API_KEY="..."
# or OPENCODE_API_KEY="..."
# or OLLAMA_BASE_URL="http://localhost:11434"
```

Optional:

```bash
# Server
SECUREYEOMAN_PORT=18789          # API port (default: 18789)
SECUREYEOMAN_HOST="0.0.0.0"     # Bind address
SECUREYEOMAN_LOG_LEVEL="info"   # trace|debug|info|warn|error

# MCP Service
MCP_ENABLED=true           # Enable standalone MCP service
MCP_PORT=3001              # MCP port (default: 3001)
MCP_TRANSPORT="streamable-http"  # streamable-http|sse|stdio
MCP_EXPOSE_FILESYSTEM=false      # Opt-in sandboxed file operations

# Redis (distributed rate limiting — set via YAML config, not env var)
# security.rateLimiting.redisUrl: "redis://localhost:6379"
```

See [.env.example](.env.example) for all options.

---

## Usage

### Dashboard

Access http://localhost:18789 after starting the system. The dashboard provides:

- **Overview**: Stat cards (tasks, heartbeat beats, audit entries, memory), services status (core, Postgres, audit chain, MCP servers, uptime, version), and system flow graph with live connection edges
- **Tasks**: Task history with create/edit/delete, filtering, and live updates
- **Security**: Security event log with severity filtering, heartbeat task viewer
- **Connections**: Integration management (connect/start/stop platforms), MCP server management
- **Personality**: Identity editor, archetype selector, skill builder; system prompt uses live collaborative editing (Yjs CRDT) with presence indicators showing co-editors in real time
- **Code**: Monaco editor with personality-scoped AI chat sidebar; assistant messages render as rich Markdown
- **Chat**: Conversational AI interface with full Markdown rendering — syntax-highlighted code blocks (Prism, language-labelled, theme-aware), interactive Mermaid diagrams, KaTeX math (`$inline$` / `$$block$$`), GitHub-style alert callouts (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]`, `[!IMPORTANT]`), task list checkboxes, and styled tables
- **Settings**: Notification preferences, log retention policy, API key management, audit export

### API

```bash
# Health check
curl http://localhost:18789/health

# Authenticate
TOKEN=$(curl -s -X POST http://localhost:18789/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-admin-password"}' | jq -r '.accessToken')

# Get metrics
curl http://localhost:18789/api/v1/metrics \
  -H "Authorization: Bearer $TOKEN"

# Create a task
curl -X POST http://localhost:18789/api/v1/tasks \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"type": "execute", "input": {"command": "echo hello"}}'

# Query audit log
curl http://localhost:18789/api/v1/audit?limit=50 \
  -H "Authorization: Bearer $TOKEN"
```

### CLI

```bash
# Start the server (default)
secureyeoman start

# Start with custom port
secureyeoman start --port 3001

# Check server health
secureyeoman health

# Show server status
secureyeoman status

# Show configuration
secureyeoman config

# Validate configuration before startup (CI/CD friendly)
secureyeoman config validate
secureyeoman config validate --json

# Manage integrations
secureyeoman integration list
secureyeoman integration connect telegram

# Manage RBAC roles
secureyeoman role list
secureyeoman role create operator

# Manage lifecycle hooks
secureyeoman extension list

# Run sandboxed code
secureyeoman execute --lang javascript --code "console.log('hello')"

# Manage A2A protocol
secureyeoman a2a list

# Browser automation
secureyeoman browser list
secureyeoman browser stats
secureyeoman browser config

# Vector memory
secureyeoman memory search "recent conversations"
secureyeoman memory stats
secureyeoman memory consolidate

# Web scraper / MCP tools
secureyeoman scraper config
secureyeoman scraper tools
secureyeoman scraper servers

# Multimodal I/O
secureyeoman multimodal config
secureyeoman multimodal jobs
secureyeoman multimodal speak "Hello world"

# AI model management
secureyeoman model info
secureyeoman model list
secureyeoman model switch anthropic claude-sonnet-4-6
secureyeoman model default get
secureyeoman model default set anthropic claude-haiku-4-5
secureyeoman model default clear

# Manage integration plugins
secureyeoman plugin list
secureyeoman plugin info <platform>
secureyeoman plugin add /path/to/plugin.js
secureyeoman plugin remove <platform>

# Shell completions
source <(secureyeoman completion bash)    # Bash
source <(secureyeoman completion zsh)     # Zsh
secureyeoman completion fish > ~/.config/fish/completions/secureyeoman.fish

# Security policy management
secureyeoman policy get
secureyeoman policy set allowDynamicTools true
secureyeoman policy set allowAnomalyDetection true    # ML anomaly detection
secureyeoman policy set sandboxGvisor true            # gVisor kernel isolation (requires gVisor on host)
secureyeoman policy set sandboxWasm true              # WASM execution isolation
secureyeoman policy dynamic-tools enable
secureyeoman policy dynamic-tools sandbox disable
secureyeoman policy dynamic-tools personality enable --personality-id <id>

# Show help
secureyeoman help
```

### MCP Integration

Connect SecureYeoman to any MCP-compatible client (Claude Desktop, etc.):

```json
{
  "mcpServers": {
    "secureyeoman": {
      "command": "node",
      "args": ["packages/mcp/dist/cli.js"],
      "env": {
        "MCP_TRANSPORT": "stdio",
        "MCP_CORE_URL": "http://127.0.0.1:18789",
        "SECUREYEOMAN_TOKEN_SECRET": "your-token-secret"
      }
    }
  }
}
```

Or connect via HTTP: `http://localhost:3001/mcp` (when running with `--profile mcp`).

### Community Skills

A `community-skills/` directory is bundled inside the project and available in Docker at `/app/community-skills` — no extra setup needed. Sync it from the Dashboard or API:

```bash
# Sync bundled skills (default — works in Docker and local dev)
curl -X POST http://localhost:18789/api/v1/marketplace/community/sync \
  -H "Authorization: Bearer $TOKEN"

# Browse community skills
curl "http://localhost:18789/api/v1/marketplace?source=community" \
  -H "Authorization: Bearer $TOKEN"
```

Or use the Dashboard → Skills → **Community** tab — includes a Sync button, per-personality install, and live sync results.

**Git URL Fetch (optional)** — The sync endpoint can clone or pull a git repository directly,
eliminating the need to manage a local clone manually. Enable the security policy toggle first:

```bash
# Enable git fetch (admin only)
secureyeoman policy set allowCommunityGitFetch true

# Sync directly from the official community repo (no manual clone needed)
curl -X POST http://localhost:18789/api/v1/marketplace/community/sync \
  -H "Authorization: Bearer $TOKEN"

# Or sync from a custom repo URL
curl -X POST http://localhost:18789/api/v1/marketplace/community/sync \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"repoUrl": "https://github.com/MyOrg/my-skills-repo"}'
```

Only `https://` and `file://` URLs are accepted. The policy is **OFF by default** for security.
Set `COMMUNITY_GIT_URL` in `.env` (or via policy) to configure the default URL. See
[COMMUNITY_IMPROVEMENTS.md](COMMUNITY_IMPROVEMENTS.md) for the full security model and developer
workflow.

**To use a pre-cloned local path** (original method, still supported):

```bash
git clone https://github.com/MacCracken/secureyeoman-community-skills.git
# Then set in .env:
COMMUNITY_REPO_PATH=/path/to/secureyeoman-community-skills
```

Community skills always install **per-personality** — select which personality gets the skill before installing.

---

## Usage Nuances

### AI Provider Authentication — Use API Keys, Not OAuth

> [!WARNING]
> **Never use OAuth tokens, session cookies, or credentials from Claude.ai, ChatGPT, or any other
> AI provider's consumer product.** This violates every major provider's Terms of Service and can
> result in account suspension or permanent bans.

**Anthropic enforcement (effective January 9, 2026):** OAuth tokens from Free, Pro, and Max Claude
accounts are blocked server-side from use in third-party applications. Anthropic documented this
policy formally on February 19, 2026. Real-world account suspensions have been reported — including
a case from the OpenCode project where a user's Max account was banned after the tool used an OAuth
token to call the API.

**Always connect AI providers using official API keys:**

```bash
# .env — correct approach
ANTHROPIC_API_KEY=sk-ant-api03-...   # from console.anthropic.com
OPENAI_API_KEY=sk-...               # from platform.openai.com/api-keys
GEMINI_API_KEY=AIzaSy...            # from aistudio.google.com/app/apikey
```

See the full guide: [AI Provider API Keys](docs/guides/ai-provider-api-keys.md)

---

## Project Structure

```
secureyeoman/
├── packages/
│   ├── shared/          # Shared TypeScript types and Zod schemas
│   ├── core/            # Agent engine, security, and integrations
│   │   └── src/
│   │       ├── ai/              # Multi-provider AI client + fallback chains
│   │       ├── brain/           # Memory, knowledge, skills (with decay/pruning)
│   │       ├── body/            # Vital signs (heartbeat, capture, health)
│   │       ├── comms/           # E2E encrypted agent comms (X25519 + AES-256-GCM)
│   │       ├── gateway/         # Fastify API server, auth, RBAC, security headers
│   │       ├── extensions/      # Lifecycle hook system and extension manager
│   │       ├── execution/       # Sandboxed code execution (Python, Node.js, shell)
│   │       ├── a2a/             # Agent-to-Agent protocol (discovery, delegation, messaging)
│   │       ├── integrations/    # Platform adapters (Telegram, Discord, Slack, GitHub, Google Chat, CLI, Webhook)
│   │       ├── logging/         # Audit chain + storage + file writer + rotation
│   │       ├── marketplace/     # Skill marketplace (discovery, install, publish)
│   │       ├── mcp/             # MCP client manager + tool storage
│   │       ├── security/        # RBAC, encryption, sandbox, rate limiting
│   │       ├── soul/            # Personality, identity, archetypes, CRDT collab
│   │       ├── spirit/          # Emotional core (passions, inspirations, pains)
│   │       └── task/            # Task executor + SQLite storage
│   ├── dashboard/       # React UI (Vite + Tailwind + TanStack Query)
│   └── mcp/             # Standalone MCP service (34+ tools, 7 resources, 4 prompts)
├── tests/               # Security, load (k6), and chaos tests
├── deploy/              # Docker, Helm chart, Prometheus, Grafana, Loki configs
├── docs/                # Documentation + ADRs (80 decision records)
│   ├── api/             # REST API + WebSocket API + OpenAPI 3.1 spec
│   ├── adr/             # Architecture Decision Records
│   ├── guides/          # Getting started, integrations
│   ├── security/        # Security model documentation
│   └── development/     # Roadmap
├── scripts/             # Utility scripts
└── .github/             # CI/CD workflows
```

---

## Development

### Running Tests

```bash
# All workspace tests
npm test

# Individual packages
npm test --workspace=@secureyeoman/core
npm test --workspace=@secureyeoman/mcp
npm test --workspace=@secureyeoman/dashboard

# With coverage
npm test -- --coverage

# Security + chaos tests
npx vitest run tests/security/ tests/chaos/
```

### Test Coverage

| Package | Tests | Files | Coverage |
|---------|-------|-------|----------|
| `@secureyeoman/core` | 5604 | 286 | 84% lines / 85% funcs / 71% branches ✅ |
| `@secureyeoman/mcp` | 326 | 31 | — |
| `@secureyeoman/dashboard` | 421 | 34 | — |
| **Total** | **6351** | **351** | |

### Building

```bash
# All packages
npm run build

# Individual
npm run build --workspace=@secureyeoman/core
npm run build --workspace=@secureyeoman/dashboard
npm run build --workspace=@secureyeoman/mcp
```

### Versioning

SecureYeoman uses **calendar versioning** in the format `YYYY.M.D` (e.g., `2026.2.17` for February 17, 2026). The version reflects the release date, not a semver progression.

To update the version across all packages:

```bash
npm run version:set -- 2026.3.1
```

This updates all `package.json` files in the monorepo. The core server reads its version from `package.json` at runtime, so no source changes are needed.

---

## Documentation

| Topic | Link |
|-------|------|
| **Getting Started** | [Getting Started Guide](docs/guides/getting-started.md) |
| **Configuration** | [Config Reference](docs/configuration.md) |
| **REST API** | [REST API Reference](docs/api/rest-api.md) |
| **WebSocket API** | [WebSocket API](docs/api/websocket-api.md) |
| **OpenAPI Spec** | [OpenAPI 3.1](docs/openapi.yaml) |
| **Security Model** | [Security Model](docs/security/security-model.md) |
| **Deployment** | [Deployment Guide](docs/deployment.md) |
| **Kubernetes** | [Kubernetes Deployment Guide](docs/guides/kubernetes-deployment.md) |
| **Integrations** | [Integration Setup](docs/guides/integrations.md) |
| **AI Provider Keys** | [AI Provider API Keys](docs/guides/ai-provider-api-keys.md) |
| **Troubleshooting** | [Troubleshooting Guide](docs/troubleshooting.md) |
| **Architecture Decisions** | [ADRs](docs/adr/) (80 records) |
| **Roadmap** | [Development Roadmap](docs/development/roadmap.md) |
| **Changelog** | [CHANGELOG.md](CHANGELOG.md) |
| **Contributing** | [Contributing Guide](CONTRIBUTING.md) |
| **Security Policy** | [SECURITY.md](SECURITY.md) |

---

## Contributing

We welcome contributions! Please see our [Contributing Guide](CONTRIBUTING.md) for:

- Development setup
- Code style and testing requirements
- Pull request process
- Community guidelines

---

## Security

Security is our top priority. For security issues:

- **DO NOT** open a public issue
- Email: security@secureyeoman.ai
- See our [Security Policy](SECURITY.md)

---

## License

This project is licensed under the [MIT License](LICENSE).

---

<div align="center">

**SECUREYEOMAN** - Your trusted digital Yeoman

</div>
