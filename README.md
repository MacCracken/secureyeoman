# SECUREYEOMAN

[![Version](https://img.shields.io/badge/Version-2026.3.4-blue.svg)](https://github.com/MacCracken/secureyeoman/releases/tag/v2026.3.4)
[![CI](https://github.com/MacCracken/secureyeoman/actions/workflows/ci.yml/badge.svg)](https://github.com/MacCracken/secureyeoman/actions/workflows/ci.yml)
[![License: AGPL v3](https://img.shields.io/badge/License-AGPL_v3-blue.svg)](https://www.gnu.org/licenses/agpl-3.0)
[![Commercial License](https://img.shields.io/badge/License-Commercial-green.svg)](LICENSE.commercial)
[![Security: Enterprise-Grade](https://img.shields.io/badge/Security-Enterprise--Grade-green.svg)]()
[![Tests: 14,229](https://img.shields.io/badge/Tests-14%2C229-brightgreen.svg)]()
[![TypeScript](https://img.shields.io/badge/TypeScript-5.4-blue.svg)](https://www.typescriptlang.org/)
[![Node.js](https://img.shields.io/badge/Node.js-20%20LTS-green.svg)](https://nodejs.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED.svg)](https://www.docker.com/)
[![Kubernetes](https://img.shields.io/badge/Kubernetes-Helm-326CE5.svg)](https://helm.sh/)

> Cloud AI made intelligence cheap. It also made everyone a tenant.
>
> SecureYeoman inverts the model: a sovereign AI that runs on your infrastructure, under your governance, with your data going nowhere. No cloud rent. No behavioral extraction. No AI that answers to someone else.
>
> A yeoman owns their land. So should you.

Ships with the default Agent Personality **F.R.I.D.A.Y.** — **F**riendly, **R**eliable, **I**ntelligent, **D**igitally **A**daptable **Y**eoman.

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

A **sovereign AI agent platform** that runs entirely on your infrastructure. SecureYeoman gives you multi-model intelligence, enterprise-grade security, and a full training pipeline — without sending a single byte of data off-premises.

- **Self-hosted, not SaaS** — single binary, Docker, or Kubernetes. Your data stays on your machines.
- **Governed by design** — RBAC, audit trails, cryptographic integrity, sandboxed execution, organizational intent policies.
- **Multi-agent orchestration** — swarms, teams, DAG workflows, A2A protocol, and a 271-tool MCP server.
- **Full ML lifecycle** — distillation, LoRA fine-tuning, LLM-as-Judge evaluation, conversation analytics, A/B experiments, and model versioning.

---

## Key Features

### Security & Governance

| Capability | Details |
|---|---|
| Authentication | JWT + API key, OIDC SSO (Okta/Azure AD/Auth0), SAML 2.0 |
| Authorization | RBAC, per-personality active hours, Organizational Intent (OPA) |
| Encryption | AES-256-GCM at rest, mTLS in transit, TLS lifecycle management |
| Sandboxing | Landlock, seccomp, gVisor, WASM |
| Sandbox Scanning | Artifact scanning, externalization gate, quarantine, threat classification, kill chain mapping |
| Rate Limiting | Global per-route limits (API/terminal/workflow/auth), Fastify onRequest hook |
| Prompt Security | Jailbreak scoring, system-prompt leak detection, abuse pattern detection, safe expression evaluator |
| Content Guardrails | PII redaction, topic restrictions, toxicity filtering, citation grounding, groundedness modes |
| Secrets Management | env / keyring / file / Vault / OpenBao backends |
| Audit | Cryptographic integrity verification, JSONL/CSV/syslog export |

### AI & Models

| Capability | Details |
|---|---|
| Providers | 13 — Anthropic, OpenAI, Gemini, Groq, OpenRouter, Ollama, LM Studio, LocalAI, DeepSeek, Mistral, Grok, Letta, OpenCode Zen |
| Multi-account | Multiple API keys per provider, per-account cost tracking, key validation, personality-level routing |
| Provider Health | Per-provider error rate / p95 latency tracking, automatic ranking, health endpoint |
| Cost Budgets | Per-personality daily/monthly USD limits, 80% warning alerts, 100% hard block |
| Routing | Automatic fallback chains, dynamic model discovery, local-first routing, reasoning effort passthrough |
| Ollama lifecycle | Pull, delete, quantization-aware memory warnings |

### Agents & Workflows

| Capability | Details |
|---|---|
| Cognitive model | Soul / Spirit / Brain / Body architecture; personality presets (F.R.I.D.A.Y., T.Ron) |
| Sub-agents | Delegation, Agent Swarms (sequential / parallel / dynamic, 5 templates) |
| Council of AIs | Multi-round group deliberation engine, facilitator-driven consensus, 2 bundled templates |
| Teams | Dynamic auto-manager with coordinator LLM, 3 built-in teams, `crew` CLI with YAML import/export |
| Workflows | DAG orchestration with 19 step types, `triggerMode: 'any'` OR-trigger, `outputSchemaMode: 'strict'`, visual ReactFlow builder |
| A2A Protocol | Cross-instance agent delegation with W3C trace propagation |
| Federation | Encrypted peer sync, federated knowledge search, personality bundle export/import |

### Training & Evaluation

| Capability | Details |
|---|---|
| Dataset export | ShareGPT, instruction, raw, and computer_use formats |
| Distillation | Priority, curriculum, and counterfactual modes |
| Fine-tuning | LoRA via Unsloth sidecar |
| Evaluation | Tool-name accuracy, arg-match, semantic similarity (Ollama) |
| LLM-as-Judge | Pointwise scoring, pairwise comparison, auto-eval quality gates |
| Conversation Analytics | Sentiment tracking, engagement metrics, entity extraction, summarization |
| Lifecycle Platform | Preference annotation, experiment registry, model versioning, A/B testing |
| Inline Citations | Source references with provenance scoring, groundedness checking, citation feedback |
| Adaptive Learning | Conversation quality scoring, computer-use RL episodes, live training stream (SSE) |

### Dashboard & Editor

| Capability | Details |
|---|---|
| Stack | React + Vite + Tailwind, 31-theme system |
| Chat | Rich Markdown, Mermaid diagrams, KaTeX math, conversation branching |
| Collaboration | Real-time CRDT editing (Yjs), group chat, presence indicators |
| Mission Control | Drag-and-drop card layout (12 cards, S/M/L resize) |
| Editor | Multi-terminal, memory panel, model selector, agent world map, canvas workspace |
| Visualization | WebGL graph, live network-mode badge (Local / LAN / Public) |

### Integrations & MCP

| Capability | Details |
|---|---|
| MCP server | 271 tools, 9 resources, 4 prompts; streamable HTTP, SSE, and stdio transports |
| Platforms | 32 — Telegram, Discord, Slack, WhatsApp, Signal, MS Teams, GitHub, GitLab, Google Chat, Gmail, Google Calendar, Email (IMAP/SMTP), Jira, Notion, AWS, Azure DevOps, Linear, Airtable, DingTalk, LINE, QQ, Twitter/X, Spotify, Stripe, YouTube, Zapier, Figma, Todoist, iMessage, CLI, Generic Webhook |
| CI/CD | 21 tools — GitHub Actions (6), Jenkins (5), GitLab CI (5), Northflank (5); `ci_trigger`/`ci_wait` workflow steps; webhook ingest |
| Security toolkits | Kali (15 pentest tools), Network (38 tools: discovery, scanning, SSH, NetBox, NVD/CVE, PCAP), Docker (14 tools) |
| Knowledge Base | Document ingestion (PDF, HTML, Markdown, URL, GitHub Wiki), RAG / Notebook / Hybrid modes, Source Guide |
| Cognitive Memory | ACT-R activation, Hebbian associative learning, context-dependent retrieval (embedding fusion), working memory buffer (predictive pre-fetch), salience classification (emotion/urgency tagging) |
| Memory Audits | Scheduled compression, reorganization, coherence checking, archive with reversibility |
| Skills & Marketplace | 24 builtin + 87 community skills (13 categories), skill trust tiers, 7 workflow + 2 swarm + 2 council templates, 7 security templates, 3 personalities, 3 themes |

### Enterprise & Operations

| Capability | Details |
|---|---|
| Versioning | Immutable snapshots, date-based tags, LCS diff, drift detection, rollback for personalities and workflows |
| Risk Management | Departmental risk register, ATHI threat governance, heatmaps, executive summaries |
| Licensing | Dual: AGPL-3.0 + commercial. Ed25519 offline validation, CLI + dashboard + API management |
| Multi-tenancy | PostgreSQL RLS partitioning, tenant CRUD API |
| Observability | OpenTelemetry (OTLP gRPC), Prometheus `/metrics`, alert rules engine (Slack/PagerDuty/OpsGenie/webhook), ECS logs, Grafana dashboards |
| API Gateway | Expose personalities as endpoints with per-key RPM/TPD rate limits, usage analytics (p50/p95), CSV export |
| Deployment | Single binary (~80 MB), Docker (~80 MB), Kubernetes Helm chart; Linux x64/arm64, macOS arm64, Windows x64 |
| Native clients | Tauri v2 desktop + Capacitor v6 mobile (shared dashboard frontend) |
| CLI | 39 commands, full-screen TUI, agent world ASCII map, shell completions, `--json` scripting output |
| Extensions | Rich lifecycle hook system, TypeScript plugin modules, hot-reload support |
| Backup & DR | `pg_dump`/`pg_restore`, download API, restore confirmation, scheduling |

See the [Feature Reference](docs/features.md) for the complete breakdown.

---

## Prerequisites

- **Node.js** 20 LTS or later (source installs only)
- **AI Provider API Key**: At least one of Anthropic, OpenAI, Google Gemini, OpenCode Zen, DeepSeek, Mistral, Grok, Letta, or Ollama (local)

---

## Network Access Modes

SecureYeoman supports **Local** (127.0.0.1, default), **LAN** (0.0.0.0, no TLS), and **Public** (0.0.0.0 + TLS) modes — selectable via `config.yml` or environment variables. The dashboard About panel and `/health` endpoint reflect the current mode.

> [!WARNING]
> Do **not** expose SecureYeoman to the internet without TLS enabled. Without TLS, API keys and session tokens travel in plaintext.

See the [Getting Started Guide](docs/guides/getting-started.md) and [Configuration Reference](docs/configuration.md) for setup details.

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
# → {"status":"ok","version":"2026.3.3","uptime":12345,"networkMode":"local",...}

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

> [!WARNING]
> **Never use OAuth tokens, session cookies, or credentials from Claude.ai, ChatGPT, or any other
> AI provider's consumer product.** This violates every major provider's Terms of Service and can
> result in account suspension or permanent bans. Always use official API keys from developer consoles.
> See [AI Provider API Keys](docs/guides/ai-provider-api-keys.md) for details.

---

## Documentation

**Start Here**

| Topic | Link |
|-------|------|
| Getting Started | [Getting Started Guide](docs/guides/getting-started.md) |
| Configuration | [Config Reference](docs/configuration.md) |
| Feature Reference | [Full Feature Breakdown](docs/features.md) |

**API**

| Topic | Link |
|-------|------|
| REST API | [REST API Reference](docs/api/rest-api.md) |
| WebSocket API | [WebSocket API](docs/api/websocket-api.md) |
| OpenAPI Spec | [OpenAPI 3.1](docs/openapi.yaml) |

**Operations**

| Topic | Link |
|-------|------|
| Deployment | [Deployment Guide](docs/deployment.md) |
| Kubernetes | [Kubernetes Guide](docs/guides/kubernetes-deployment.md) |
| Observability | [Observability Guide](docs/guides/observability.md) |
| Security Model | [Security Model](docs/security/security-model.md) |
| White Paper | [Architectural Sovereignty & Agentic Governance](docs/white-paper.md) |

**Development**

| Topic | Link |
|-------|------|
| Architecture | [Architecture Overview](docs/development/architecture.md) |
| ADRs | [199 Architecture Decision Records](docs/adr/) |
| Roadmap | [Development Roadmap](docs/development/roadmap.md) |
| Contributing | [Contributing Guide](CONTRIBUTING.md) |
| Changelog | [CHANGELOG.md](CHANGELOG.md) |

See [`docs/guides/`](docs/guides/) for all 64 guides, including integrations, CI/CD, knowledge base, security testing, content guardrails, and more.

---

## Development

See [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, test database configuration, running tests, code style, building, versioning, and how to contribute community skills.

---

## Getting Help

| Channel | Use it for |
|---------|------------|
| [GitHub Discussions](https://github.com/MacCracken/secureyeoman/discussions) | Questions, ideas, show-and-tell |
| [Troubleshooting Guide](docs/troubleshooting.md) | Common problems and fixes |
| [Configuration Reference](docs/configuration.md) | All YAML fields and env vars |
| [GitHub Issues](https://github.com/MacCracken/secureyeoman/issues) | Bug reports (include logs + OS/version) |
| security@secureyeoman.ai | Security vulnerabilities — **do not** open a public issue |

---

## Community

We welcome contributions — see [CONTRIBUTING.md](CONTRIBUTING.md) for development setup, code style, testing requirements, and the pull request process.

For security vulnerabilities, email security@secureyeoman.ai (do **not** open a public issue). See [SECURITY.md](SECURITY.md) and [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md).

---

## Licensing

SecureYeoman uses a dual-license model:

- **AGPL-3.0** — for open-source use, self-hosting, and contributors. Anyone offering the software as a hosted service to third parties must publish their modifications.
- **Commercial license** — for enterprises that cannot accept AGPL terms, or for SaaS providers who need to keep modifications private. See [`LICENSE.commercial`](LICENSE.commercial).

### Enterprise Features

The following features require a commercial license key:

| Feature | Tier |
|---------|------|
| Adaptive Learning Pipeline | Enterprise |
| SSO / SAML | Enterprise |
| Multi-Tenancy | Enterprise |
| CI/CD Integration | Enterprise |
| Advanced Observability | Enterprise |

Set your license key via the `SECUREYEOMAN_LICENSE_KEY` environment variable, `secureyeoman license set <key>`, or **Settings → General → License** in the dashboard.

See [`docs/guides/licensing.md`](docs/guides/licensing.md) for full details.

---

<div align="center">

**SECUREYEOMAN** - Your trusted digital Yeoman

</div>
