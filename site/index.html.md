# SecureYeoman — Your AI. Your Rules. Your Infrastructure.

Self-hosted AI that answers only to you. Keep it local. Go hybrid. Connect any provider. Your data moves when you say so.

**v2026.3.15** | AGPL-3.0 | 462 MCP Tools | 56 CLI Commands | ~22,000 Tests

---

## 13 AI Providers. Zero Cloud Lock-In.

Anthropic, OpenAI, Gemini, Ollama, DeepSeek, Mistral, LM Studio, LocalAI, Grok, Letta, Groq, OpenRouter, OpenCode Zen.

---

## Core Capabilities

### Enterprise Security
RBAC with SSO/OIDC, SAML 2.0, WebAuthn/FIDO2. OPA policy enforcement. Tamper-evident HMAC-SHA256 audit chain. Outbound Credential Proxy — the AI never sees raw API keys. Break-glass emergency access. SCIM 2.0 provisioning. Multi-tenant RLS isolation.

### Sandboxed Execution
Landlock + seccomp kernel isolation. V8 isolate + WASM/gVisor for high-risk tasks. Skill Trust Tiers. ToolOutputScanner credential redaction (20 patterns).

### Prompt Security
Injection detection scoring, PII scanning & redaction, toxicity classification, topic restrictions. ResponseGuard scans every LLM response for instruction injection and exfiltration attempts.

### 462 MCP Tools & 38 Integrations
Telegram, Discord, Slack, WhatsApp, Signal, Teams, Gmail, GitHub, Jira, Linear, Notion, and more. 5 code forge adapters (Delta, GitHub, GitLab, Bitbucket, Gitea). SSRF protection, rate limiting, full audit trail.

### Multi-Agent & Workflows
A2A protocol with E2E encryption and mDNS peer discovery. Sub-agent delegation with budget controls. Agent Swarms, Teams, Council of AIs. DAG workflow engine with 19 step types and visual builder.

### Cognitive Memory & Knowledge
Hybrid vector + full-text search via Reciprocal Rank Fusion. Knowledge Base ingestion (PDF, HTML, Markdown, URL, GitHub Wiki). Inline citations. Proactive context compaction.

### DDoS & Bot Defense
7-layer application defense: connection limits, body size enforcement, adaptive rate limiting, backpressure, IP reputation, distributed low-rate detection, request fingerprinting. Built for self-hosted deployments without a reverse proxy.

### Developer Experience
56-command CLI with shell completions. Full-screen TUI. Lifecycle hooks (observe/transform/veto). Sandboxed code execution. Desktop control (consent-gated).

### Flexible Deployment
Single ~123 MB binary (Linux x64/arm64, macOS arm64), Docker, or Kubernetes with Helm. Edge/IoT binary (Go, 7.2 MB) for constrained devices. Local / LAN / Public TLS modes.

### Ecosystem
11 integrated services: Agnostic (multi-agent orchestration), AGNOS (AI-native OS), Synapse (LLM controller), Delta (code forge), BullShift (trading), Photisnadi (task management), Shruti (DAW), Rasa (image editor), Mneme (knowledge base), Aequi (accounting), Edge (IoT fleet).

### Skills & Marketplace
Portable `.skill.json` with routing quality fields. Community marketplace with Trust Tier sandboxing. Workflow and swarm template sharing.

### AI Training & Evaluation
Distillation, LoRA fine-tuning, LLM-as-Judge auto-eval, conversation quality scoring, A/B testing, experiment registry, model versioning, conversation branching & replay.

### Simulation Engine
Tick-driven execution, emotion & mood modeling, 3D spatial & proximity engine, autoresearch experiment runner. Enterprise-tier for game NPCs, digital twins, training simulations, and scientific modeling.

---

## Use Cases

- **Security Operations** — Network scanning, CVE triage, incident response automation
- **DevSecOps** — Code review, PR management across 5 forges, policy enforcement
- **Enterprise Automation** — Multi-agent DAG workflows with approvals and escalations
- **Edge & IoT** — 7.2 MB Go binary with A2A peer discovery and fleet management
- **Communications** — Email, scheduling, reporting across 38 platforms
- **Research** — Autonomous research loops, hypothesis exploration, peer review simulation

---

## Getting Started

```bash
# One-line install
curl -fsSL https://secureyeoman.ai/install.sh | bash

# Docker (multi-arch: amd64 + arm64)
docker pull ghcr.io/maccracken/secureyeoman:latest

# Edge/IoT binary
curl -fsSL https://secureyeoman.ai/install.sh | bash -s -- --edge
```

---

## Community

- **License**: AGPL-3.0
- **GitHub**: [github.com/MacCracken/secureyeoman](https://github.com/MacCracken/secureyeoman)
- **Discussions**: [GitHub Discussions](https://github.com/MacCracken/secureyeoman/discussions)

---

Copyright 2026 SecureYeoman — AGPL-3.0
