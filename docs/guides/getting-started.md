# Getting Started Guide

> How to install, configure, and run SecureYeoman

## Prerequisites

- API key for at least one AI provider (Anthropic, OpenAI, Google Gemini, OpenCode Zen, or Ollama)
- For Tier 1 binary or source installs: PostgreSQL 16+
- For source installs: Node.js 20 LTS, npm, Git

---

## Installation

### Option 1: Single Binary (Recommended)

No Node.js, npm, or runtime required:

```bash
curl -fsSL https://secureyeoman.ai/install | bash
secureyeoman init
```

Or download directly from [GitHub Releases](https://github.com/MacCracken/secureyeoman/releases):

| Binary | Requires | Platform |
|--------|----------|----------|
| `secureyeoman-linux-x64` | PostgreSQL | Linux x64 |
| `secureyeoman-linux-arm64` | PostgreSQL | Linux arm64 |
| `secureyeoman-darwin-arm64` | PostgreSQL | macOS Apple Silicon |
| `secureyeoman-lite-linux-x64` | Nothing (SQLite) | Linux x64 edge/embedded |
| `secureyeoman-lite-linux-arm64` | Nothing (SQLite) | Linux arm64 edge/embedded |

```bash
# Verify checksum
sha256sum -c SHA256SUMS

# Start
secureyeoman start
```

The API and dashboard are both available at http://localhost:18789.

### Option 2: From Source

```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
npm install

# Create environment file
cp .env.example .env
# Edit .env with your configuration

# Start the system
npm run dev
```

The API and dashboard will be available at http://localhost:18789.

### Option 3: Docker

```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
cp .env.example .env
# Edit .env with your configuration

# Run with Docker Compose (core + PostgreSQL)
docker compose up

# Run with MCP service included
docker compose --profile mcp up

# Dashboard dev server (hot-reload Vite, for frontend development only)
docker compose --profile dev up
```

Docker Compose services:

| Service | Port | Profile | Description |
|---------|------|---------|-------------|
| `postgres` | 5432 | *(default)* | PostgreSQL with pgvector |
| `core` | 18789 | *(default)* | Gateway API + agent engine + embedded dashboard |
| `mcp` | 3001 | `mcp` / `full` / `dev` | MCP protocol server (tools, resources, prompts) |
| `dashboard-dev` | 3000 | `dev` | Vite dev server for frontend development |

The core service serves the dashboard SPA at `/` and the REST API at `/api/v1/`. The MCP service self-mints a service JWT using the shared `SECUREYEOMAN_TOKEN_SECRET` — no manual token setup needed.

#### Production Docker image (binary-based)

For a production image, build the binary first (requires [Bun](https://bun.sh)):

```bash
npm run build:binary          # produces dist/secureyeoman-linux-x64
docker build -t secureyeoman .
docker run --env-file .env -p 18789:18789 secureyeoman
```

---

## Configuration

### Required Environment Variables

All security keys must be at least 32 characters long. Generate your own -- do not reuse examples.

```bash
# Required Security Keys
SECUREYEOMAN_SIGNING_KEY="your-signing-key-at-least-32-characters-long"
SECUREYEOMAN_TOKEN_SECRET="your-token-secret-at-least-32-characters-long"
SECUREYEOMAN_ENCRYPTION_KEY="your-encryption-key-at-least-32-characters-long"
SECUREYEOMAN_ADMIN_PASSWORD="your-admin-password-at-least-32-characters-long"
```

| Variable | Purpose |
|----------|---------|
| `SECUREYEOMAN_SIGNING_KEY` | HMAC-SHA256 signing for the audit chain |
| `SECUREYEOMAN_TOKEN_SECRET` | JWT token signing secret |
| `SECUREYEOMAN_ENCRYPTION_KEY` | AES-256-GCM encryption at rest |
| `SECUREYEOMAN_ADMIN_PASSWORD` | Admin login password for the dashboard and API |

### AI Provider Keys

At least one is required:

```bash
ANTHROPIC_API_KEY="sk-ant-..."
# or
OPENAI_API_KEY="sk-..."
# or
GOOGLE_GENERATIVE_AI_API_KEY="..."
# or
OPENCODE_API_KEY="..."
# or (for local Ollama -- no key needed, just the URL)
OLLAMA_BASE_URL="http://localhost:11434"
```

### Optional Variables

```bash
SECUREYEOMAN_PORT=18789              # Gateway port (dashboard + API)
SECUREYEOMAN_HOST=127.0.0.1          # Gateway bind address
SECUREYEOMAN_LOG_LEVEL=info          # trace|debug|info|warn|error
NODE_ENV=development
```

### Configuration File

For advanced configuration, create `~/.secureyeoman/config.yaml`:

```yaml
version: "1.0"
core:
  name: "F.R.I.D.A.Y."
  environment: development
  logLevel: info
  workspace: ~/.secureyeoman/workspace

security:
  rbac:
    enabled: true
    defaultRole: viewer
  encryption:
    enabled: true
    algorithm: aes-256-gcm
  sandbox:
    enabled: true
    technology: auto
  rateLimiting:
    enabled: true

model:
  provider: anthropic
  model: claude-sonnet-4-20250514
  maxTokens: 16384
  temperature: 0.7

soul:
  enabled: true
  learningMode: [user_authored]
  maxSkills: 50
  maxPromptTokens: 4096
```

See [Configuration Reference](../configuration.md) for all available fields.

### Vector Memory Setup (Optional)

To enable semantic vector memory, add to your config:

```yaml
brain:
  vector:
    enabled: true
    provider: local          # 'local' for SentenceTransformers, 'api' for OpenAI/Gemini
    backend: faiss           # 'faiss' (in-process), 'qdrant' (distributed), or 'chroma' (ChromaDB)
    similarityThreshold: 0.7
    maxResults: 10
    local:
      model: all-MiniLM-L6-v2
```

For local embeddings, ensure Python 3.9+ with `sentence-transformers` is installed. For API embeddings (OpenAI/Gemini), the corresponding API key must be configured.

For Qdrant backend, start a Qdrant instance:
```bash
docker run -p 6333:6333 qdrant/qdrant
```

For ChromaDB backend, start a ChromaDB instance (no extra npm deps required — uses native fetch):
```bash
docker run -p 8000:8000 chromadb/chroma
```
Then set `backend: chroma` and optionally configure `chroma.url` / `chroma.collection` in your soul config.

---

## Quick Start

### 1. Start the System

```bash
# Start core system (serves dashboard + API at :18789)
npm run dev

# Or start dashboard Vite dev server (hot-reload, requires core running)
npm run dev:dashboard

# Or start MCP service only (requires core running)
npm run dev:mcp
```

### 2. Access the Dashboard

Open your browser and navigate to:
- **Dashboard**: http://localhost:18789
- **API Health**: http://localhost:18789/health

> **Note:** `npm run dev:dashboard` starts a hot-reload Vite server on port 3000 for frontend development. For normal use, the dashboard is served by the core gateway at port 18789.

### 3. First Login

1. Open the dashboard at http://localhost:18789
2. Use the admin password you set in `SECUREYEOMAN_ADMIN_PASSWORD`
3. Complete the onboarding wizard to set up your agent personality

### 4. Create Your First Task

```bash
# Using the CLI
npx secureyeoman task create \
  --type execute \
  --input '{"command": "echo Hello F.R.I.D.A.Y.!"}'

# Using the API
curl -X POST http://localhost:18789/api/v1/tasks \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer <your-jwt-token>" \
  -d '{
    "type": "execute",
    "input": {"command": "echo Hello F.R.I.D.A.Y.!"}
  }'
```

### 5. Monitor in Real-Time

- The **Overview** page shows stat cards (tasks, heartbeat beats, audit entries, memory), a services status panel (core, Postgres, audit chain, MCP servers, uptime, version), and a system flow graph with live connection edges
- Watch task execution in the dashboard
- View metrics and resource usage
- Check security events in the audit log

---

## Verification

### Health Check

```bash
curl http://localhost:18789/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2026-02-19T00:00:00.000Z",
  "version": "2026.2.19",
  "uptime": 3600
}
```

### API Test

```bash
# Login and get a token
curl -X POST http://localhost:18789/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password": "your-admin-password"}'

# Fetch metrics with token
curl http://localhost:18789/api/v1/metrics \
  -H "Authorization: Bearer <accessToken>"
```

### WebSocket Connection

```javascript
// Test WebSocket connection in browser console
const ws = new WebSocket('ws://localhost:18789/ws/metrics');
ws.onmessage = (event) => console.log(JSON.parse(event.data));
ws.onopen = () => {
  ws.send(JSON.stringify({
    type: 'subscribe',
    payload: { channels: ['metrics'] }
  }));
};
```

---

## Running Tests

```bash
npm test              # All tests across all packages
npm test -- --run     # Non-watch mode
npm test -- --coverage

# Security + chaos tests
npx vitest run tests/security/ tests/chaos/
```

---

## MCP Service (Optional)

The MCP service (`@secureyeoman/mcp`) exposes SecureYeoman's capabilities as MCP tools, resources, and prompts for use with Claude Desktop and other MCP clients.

### 1. Configure Environment

The MCP service self-mints a service JWT using the shared `SECUREYEOMAN_TOKEN_SECRET`. No manual token needed — just enable it:

```bash
# MCP Service
MCP_ENABLED=true
# SECUREYEOMAN_TOKEN_SECRET is already set for core — MCP uses it automatically
```

All other MCP variables have sensible defaults. See [Configuration Reference](../configuration.md) for the full list.

### 2. Start the MCP Service

**Local development:**

```bash
npm run dev:mcp
```

**Docker:**

```bash
docker compose --profile mcp up
```

### 3. Verify

```bash
# Health check
curl http://localhost:3001/health

# Should return server status with tool/resource/prompt counts
```

The MCP service auto-registers with core on startup. You'll see it listed in the dashboard's MCP Servers page.

### 4. Claude Desktop (stdio)

For Claude Desktop integration, add to your Claude Desktop config:

```json
{
  "mcpServers": {
    "secureyeoman": {
      "command": "node",
      "args": ["packages/mcp/dist/cli.js", "--transport", "stdio"],
      "env": {
        "MCP_CORE_URL": "http://127.0.0.1:18789",
        "SECUREYEOMAN_TOKEN_SECRET": "<your-token-secret>"
      }
    }
  }
}
```

For full MCP configuration details, see the [Integration Setup Guide](integrations.md#mcp-service-secureyeomanmcp).

---

## Security Toolkit (Optional)

The security toolkit exposes a curated set of Kali Linux tools as MCP tools (`sec_nmap`, `sec_gobuster`, `sec_ffuf`, `sec_sqlmap`, `sec_nikto`, `sec_nuclei`, `sec_whatweb`, `sec_wpscan`, `sec_hashcat`, `sec_john`, `sec_theharvester`, `sec_dig`, `sec_whois`, `sec_shodan`) for use in authorized penetration testing, CTF challenges, and security research.

**Important:** The `ethical-whitehat-hacker` and `security-researcher` community skills work **independently** of the security toolkit. Skills are prompt instructions — they enhance agent reasoning regardless of whether the execution toolkit is installed. Install them from the marketplace whether or not you run the toolkit.

### Prerequisites

- Docker (for the recommended docker-exec mode)
- `MCP_EXPOSE_SECURITY_TOOLS=true` in your `.env`
- `MCP_ALLOWED_TARGETS` set to your authorized targets

### Setup

```bash
# Provision the Kali container and install all tools (~5 minutes first run)
secureyeoman security setup
```

This pulls `kalilinux/kali-rolling`, starts a persistent container named `kali-sy-toolkit`, and installs nmap, gobuster, ffuf, nikto, sqlmap, nuclei, whatweb, wpscan, hashcat, john, theHarvester, dig, and whois.

After setup, add to your `.env`:

```env
MCP_EXPOSE_SECURITY_TOOLS=true
MCP_SECURITY_TOOLS_MODE=docker-exec
MCP_SECURITY_TOOLS_CONTAINER=kali-sy-toolkit
MCP_ALLOWED_TARGETS=10.10.10.0/24,ctf.example.com
# SHODAN_API_KEY=<optional — enables sec_shodan>
```

### Verify

```bash
secureyeoman security status
```

This shows the container state and which tools are available.

### Lifecycle

```bash
secureyeoman security teardown  # stop and remove the container
secureyeoman security update    # apt-get upgrade inside the container
```

### Community Skills

Install the security skills from the marketplace to get AI-guided methodology, ethical framing, and reasoning — regardless of whether the toolkit is running:

- **ethical-whitehat-hacker** — Authorized penetration testing methodology, scope awareness, responsible disclosure
- **security-researcher** — Security research mindset, CVE analysis, threat modeling

See the [Community Skills Registry](https://github.com/MacCracken/secureyeoman-community-skills) for the full catalogue.

For full security toolkit configuration, see the [Configuration Reference](../configuration.md#security-toolkit).

---

## Agnostic QA Sub-Agent Team (Optional)

[Agnostic](https://github.com/MacCracken/agnostic) is a Python/CrewAI 6-agent QA platform that YEOMAN can spin up and orchestrate as a sub-agent team. Once running, YEOMAN agents can delegate full QA sessions — security audits, load tests, regression suites, compliance checks — via `agnostic_*` MCP tools.

### Prerequisites

- Docker and Docker Compose
- Agnostic cloned alongside this repo (or set `AGNOSTIC_PATH`)

```bash
git clone https://github.com/MacCracken/agnostic.git ../agnostic
```

### Start the Team

```bash
# Start all 6 agents + Redis + RabbitMQ + WebUI
secureyeoman agnostic start

# Check all containers are running
secureyeoman agnostic status
```

Then add to your `.env`:

```env
MCP_EXPOSE_AGNOSTIC_TOOLS=true
AGNOSTIC_URL=http://127.0.0.1:8000
AGNOSTIC_EMAIL=<your-email>
AGNOSTIC_PASSWORD=<your-password>
```

### Available MCP Tools

Once enabled, these tools are available to YEOMAN agents:

| Tool | Purpose |
|------|---------|
| `agnostic_health` | Check Agnostic is reachable |
| `agnostic_agents_status` | Per-agent live status |
| `agnostic_dashboard` | Aggregate QA metrics |
| `agnostic_session_list` | Recent QA sessions |
| `agnostic_session_detail` | Full results for a session |
| `agnostic_generate_report` | Generate executive/security/performance report |
| `agnostic_submit_qa` | Submit a QA task to the full team *(requires Agnostic TODO P1)* |
| `agnostic_task_status` | Poll task completion *(requires Agnostic TODO P1)* |

### Lifecycle Management

```bash
secureyeoman agnostic stop              # stop the stack
secureyeoman agnostic pull              # pull latest images
secureyeoman agnostic logs              # tail all logs
secureyeoman agnostic logs senior-qa    # tail a specific agent
secureyeoman agnostic logs -f           # follow mode
secureyeoman agnostic --help            # full usage
```

The Agnostic UI is available at http://localhost:8000.

For configuration details see the [Configuration Reference](../configuration.md#agnostic-qa-team-bridge) and [ADR 090](../adr/090-agnostic-qa-sub-agent-team.md).

---

## Next Steps

### Configure AI Providers

Set up multiple AI providers for redundancy:

```bash
# Add OpenAI
export OPENAI_API_KEY="sk-..."

# Add Gemini
export GOOGLE_GENERATIVE_AI_API_KEY="..."
```

### Set Up Integrations

Configure messaging platforms via the dashboard or API. See [Integration Setup Guide](integrations.md).

### Customize Your Agent

Edit personality and skills in the dashboard Soul Manager page.

### Explore the Dashboard

- **Metrics View**: Real-time system performance
- **Task History**: Browse and search past tasks
- **Security Events**: Monitor security alerts
- **Soul Manager**: Edit personality and skills
- **Connections**: Configure platform integrations
- **Chat**: Conversational AI interface with rich content rendering — assistant responses are displayed as full Markdown including syntax-highlighted code blocks (with language label and dark/light theme), interactive Mermaid diagrams (flowcharts, sequence diagrams, etc.), typeset math expressions via KaTeX (`$inline$` and `$$block$$`), GitHub-style alert callouts (`[!NOTE]`, `[!TIP]`, `[!WARNING]`, `[!CAUTION]`, `[!IMPORTANT]`), task list checkboxes, and styled tables
- **Code Editor**: Monaco-based editor with an AI chat sidebar that also uses the same rich Markdown rendering for assistant responses

### Configure Extensions

To add lifecycle hooks for custom behavior, create extension files in `~/.secureyeoman/extensions/`:

```bash
# Create extensions directory
mkdir -p ~/.secureyeoman/extensions

# Extensions are TypeScript/JavaScript files with numeric prefix ordering
# Example: ~/.secureyeoman/extensions/_50_custom_logger.ts
```

Enable extensions in your config:

```yaml
extensions:
  enabled: true
  directory: ~/.secureyeoman/extensions
  allowWebhooks: true
```

See [Configuration Reference](../configuration.md) for all extension options.

### Configure Code Execution

To enable the agent to write and execute code (Python, Node.js, shell) within the sandbox:

```yaml
execution:
  enabled: true
  approvalPolicy: first-time    # none | first-time | always
  allowedRuntimes:
    - python
    - node
    - shell
  sessionTimeout: 1800000       # 30 minutes
  maxConcurrent: 5
```

When `approvalPolicy` is `first-time` (default), each new session requires one approval before execution proceeds. Set `approvalPolicy: none` only in trusted/automated environments.

### Configure A2A Protocol

To enable cross-instance agent delegation via the Agent-to-Agent protocol:

```yaml
a2a:
  enabled: true
  discoveryMethod: mdns         # manual (static peer list), mdns (LAN), or hybrid
  port: 18790
  maxPeers: 10
  trustedPeers: []              # pre-trusted peer agent IDs
```

For LAN deployments, `mdns` auto-discovers other SecureYeoman instances. For manual or mixed setups, use `manual` or `hybrid`. Peers start as untrusted and can be promoted to verified or trusted via the dashboard or API.

---

## Troubleshooting

### Port Already in Use

```bash
lsof -i :18789
lsof -i :3000
# Kill the process or change ports via env vars
```

### Database Locked

If another instance is running, stop it first. SQLite uses WAL mode and only supports a single writer.

### AI Provider Connection Failed

Verify your API key is valid and you have network access to the provider's API endpoint.

### Debug Mode

```bash
LOG_LEVEL=debug npm run dev
```

For more troubleshooting help, see the [Troubleshooting Guide](../troubleshooting.md).

---

## Production Deployment

For production deployment considerations (systemd, Docker, reverse proxy, monitoring), see the [Deployment Guide](../deployment.md). For Kubernetes deployments, see the [Kubernetes Deployment Guide](kubernetes-deployment.md).

---

## Related Documentation

- [Configuration Reference](../configuration.md)
- [API Reference](../api/)
- [Security Model](../security/security-model.md)
- [Deployment Guide](../deployment.md)
- [Kubernetes Deployment Guide](kubernetes-deployment.md)
- [Troubleshooting Guide](../troubleshooting.md)
