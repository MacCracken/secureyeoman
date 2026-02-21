# SECUREYEOMAN

[![Version](https://img.shields.io/badge/Version-2026.2.21-blue.svg)](https://github.com/MacCracken/secureyeoman/releases/tag/v2026.2.21)
[![CI](https://github.com/MacCracken/secureyeoman/actions/workflows/ci.yml/badge.svg)](https://github.com/MacCracken/secureyeoman/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Security: Enterprise-Grade](https://img.shields.io/badge/Security-Enterprise--Grade-green.svg)]()
[![Tests: 6744+](https://img.shields.io/badge/Tests-6744%2B-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Helm-326CE5.svg)](https://helm.sh/)

> A secure, local-first AI assistant with enterprise-grade protection and comprehensive observability. Comes with default Agent Personality F.R.I.D.A.Y.

* **F**riendly
* **R**eliable
* **I**ntelligent
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
- **Offers Flexibility**: Multi-provider AI support (Anthropic, OpenAI, Gemini, Ollama, DeepSeek, Mistral, Grok, Letta, and more)
- **Learns and Adapts**: Editable personality, learnable skills, and a marketplace for sharing them
- **Selectable Personalities**: Ships with built-in personality presets — including the security watchdog **T.Ron** — each instantly instantiable via the UI or API

---

## Key Features

- **Security** — RBAC, JWT + API key auth, mTLS, AES-256-GCM encryption, sandboxed execution, ToolOutputScanner credential redaction, Skill Trust Tiers, Outbound Credential Proxy
- **AI Integration** — 11 providers with automatic fallback chains; dynamic model discovery and routing
- **Agent Architecture** — Soul/Spirit/Brain/Body cognitive model; personality presets (F.R.I.D.A.Y., T.Ron); per-personality active hours
- **Cognitive Memory** — Vector search (FAISS/Qdrant/ChromaDB), hybrid FTS + RRF, content-chunked indexing, proactive context compaction, self-repairing task loop
- **Dashboard** — React + Vite + Tailwind; rich Markdown chat, Mermaid diagrams, KaTeX math, real-time collaborative editing (Yjs CRDT), Group Chat, WebGL graph visualization
- **Multi-Agent** — Sub-agent delegation, Agent Swarms (sequential/parallel/dynamic), A2A protocol, dynamic tool creation, intelligent model routing
- **MCP Protocol** — 58+ tools, 7 resources, 4 prompts; Kali Security Toolkit; Agnostic QA Bridge; streamable HTTP, SSE, and stdio transports
- **Integrations** — 31 platforms: Telegram, Discord, Slack, WhatsApp, Signal, MS Teams, GitHub, GitLab, Google Chat, Gmail, Google Calendar, Email (IMAP/SMTP), Jira, Notion, AWS, Azure DevOps, Linear, Airtable, DingTalk, LINE, QQ, Twitter/X, Spotify, Stripe, YouTube, Zapier, Figma, Todoist, iMessage, CLI, Generic Webhook
- **Team Collaboration** — Multi-user workspaces, SSO/OIDC (Okta, Azure AD, Auth0), CRDT collaborative editing, presence indicators
- **Deployment** — Single binary (~80 MB), Docker (~80 MB), Kubernetes Helm chart; Linux x64/arm64 + macOS arm64
- **Extensions** — 38 lifecycle hook points, TypeScript plugin modules, hot-reload support
- **CLI** — 24 commands, full-screen TUI (`secureyeoman tui`), shell completions, `--json` scripting output

See the [Feature Reference](docs/features.md) for the complete breakdown.

---

## Prerequisites

- **Node.js** 20 LTS or later (source installs only)
- **AI Provider API Key**: At least one of Anthropic, OpenAI, Google Gemini, OpenCode Zen, DeepSeek, Mistral, Grok, Letta, or Ollama (local)

---

## Installation

See the [Getting Started Guide](docs/guides/getting-started.md) for full installation instructions including Docker Compose profiles, Kubernetes Helm deployment, and cloud-specific configs (EKS, GKE, AKS).

### Required Environment Variables

At minimum, set these four security keys and one AI provider key:

```bash
SECUREYEOMAN_SIGNING_KEY="your-32-char-signing-key"
SECUREYEOMAN_TOKEN_SECRET="your-32-char-token-secret"
SECUREYEOMAN_ENCRYPTION_KEY="your-32-char-encryption-key"
SECUREYEOMAN_ADMIN_PASSWORD="your-32-char-admin-password"

ANTHROPIC_API_KEY="sk-ant-..."   # or OPENAI_API_KEY, GOOGLE_GENERATIVE_AI_API_KEY, etc.
```

See [.env.example](.env.example) and the [Configuration Reference](docs/configuration.md) for all options.

---

## Usage

See the [Getting Started Guide](docs/guides/getting-started.md) for full usage documentation. A brief overview:

**Dashboard** — Access http://localhost:18789 for the full UI: chat, tasks, security events, personality editor, connections, and settings.

**CLI:**
```bash
secureyeoman start                              # start the server
secureyeoman health                             # check server health
secureyeoman model switch anthropic claude-sonnet-4-6
secureyeoman tui                                # full-screen terminal dashboard
secureyeoman help                               # all commands
```

**API:**
```bash
TOKEN=$(curl -s -X POST http://localhost:18789/api/v1/auth/login \
  -H "Content-Type: application/json" \
  -d '{"password":"your-admin-password"}' | jq -r '.accessToken')

curl http://localhost:18789/health
curl http://localhost:18789/api/v1/audit?limit=50 -H "Authorization: Bearer $TOKEN"
```

See the [REST API Reference](docs/api/rest-api.md) and [WebSocket API](docs/api/websocket-api.md).

**MCP Integration** — Connect to any MCP-compatible client (Claude Desktop, etc.):

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

---

## Usage Nuances

### AI Provider Authentication — Use API Keys, Not OAuth

> [!WARNING]
> **Never use OAuth tokens, session cookies, or credentials from Claude.ai, ChatGPT, or any other
> AI provider's consumer product.** This violates every major provider's Terms of Service and can
> result in account suspension or permanent bans.

Always connect AI providers using official API keys from their developer consoles. See [AI Provider API Keys](docs/guides/ai-provider-api-keys.md) for details and provider links.

---

## Documentation

| Topic | Link |
|-------|------|
| **Getting Started** | [Getting Started Guide](docs/guides/getting-started.md) |
| **Configuration** | [Config Reference](docs/configuration.md) |
| **Feature Reference** | [Full Feature Breakdown](docs/features.md) |
| **REST API** | [REST API Reference](docs/api/rest-api.md) |
| **WebSocket API** | [WebSocket API](docs/api/websocket-api.md) |
| **OpenAPI Spec** | [OpenAPI 3.1](docs/openapi.yaml) |
| **Security Model** | [Security Model](docs/security/security-model.md) |
| **Deployment** | [Deployment Guide](docs/deployment.md) |
| **Kubernetes** | [Kubernetes Deployment Guide](docs/guides/kubernetes-deployment.md) |
| **Integrations** | [Integration Setup](docs/guides/integrations.md) |
| **AI Provider Keys** | [AI Provider API Keys](docs/guides/ai-provider-api-keys.md) |
| **Security Testing** | [Security Testing Guide](docs/guides/security-testing.md) |
| **Troubleshooting** | [Troubleshooting Guide](docs/troubleshooting.md) |
| **Architecture Overview** | [Architecture](docs/development/architecture.md) |
| **Architecture Decisions** | [ADRs](docs/adr/) (100 records) |
| **Roadmap** | [Development Roadmap](docs/development/roadmap.md) |
| **Changelog** | [CHANGELOG.md](CHANGELOG.md) |
| **Contributing** | [Contributing Guide](CONTRIBUTING.md) |
| **Code of Conduct** | [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md) |
| **Security Policy** | [SECURITY.md](SECURITY.md) |

---

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, test database configuration, running tests, code style, building, versioning, and how to contribute community skills.

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
