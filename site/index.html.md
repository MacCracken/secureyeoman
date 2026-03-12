# SecureYeoman — Your AI. Your Rules. Your Infrastructure.

Most AI assistants serve their platform. SecureYeoman serves you — self-hosted, enterprise-hardened, and answerable only to you. Keep it local. Go hybrid. Connect any provider. Your data only moves when you say so.

**v2026.3.12** | AGPL-3.0 License | 462 MCP Tools | 56 CLI Commands

---

## Connect Any AI Provider. Expose Zero Secrets.

13 supported providers: Anthropic, OpenAI, Gemini, Ollama, DeepSeek, OpenCode Zen, Mistral, LM Studio, LocalAI, x.ai Grok, Letta, Groq, OpenRouter.

---

## Core Capabilities

### 1. Enterprise Security

RBAC with 4 permission levels, SSO/OIDC (Okta, Azure AD, Auth0), SAML 2.0, WebAuthn/FIDO2, OPA policy enforcement, tamper-evident HMAC-SHA256 audit chain. Outbound Credential Proxy — the AI model never sees raw API keys. Break-glass emergency access for disaster recovery.

- RBAC + SSO/OIDC + SAML 2.0 + WebAuthn/FIDO2
- OPA policy gating + CEL evaluator
- HMAC-SHA256 cryptographic audit chain
- Global rate limiting + sandbox artifact scanning
- Outbound Credential Proxy
- TEE-aware provider routing + attestation verification
- Break-glass emergency access (sealed recovery key)
- SCIM 2.0 provisioning (Users + Groups)
- Access review campaigns + entitlement reporting
- Per-tenant rate limits + token budgets
- Compliance SoA generator (NIST, SOC 2, ISO 27001, HIPAA, EU AI Act)

### 2. Sandboxed Execution

Landlock + seccomp kernel isolation, V8 isolate + WASM/gVisor for high-risk tasks, Skill Trust Tiers, ToolOutputScanner credential redaction (20 patterns). macOS sandbox-exec support.

- Landlock + seccomp + sandbox-exec
- V8 isolate + WASM / gVisor high-risk isolation
- Skill Trust Tiers (3 levels)
- ToolOutputScanner — 20-pattern credential redaction

### 3. Prompt Security & Content Guardrails

Injection detection scoring, PII scanning (SSN, credit card, email, phone), toxicity classification, topic restrictions, jailbreak thresholds. ResponseGuard checks every LLM response for instruction injection, cross-turn influence, and exfiltration attempts.

- Injection scoring (weighted severity)
- PII scanning & redaction
- Toxicity & topic guardrails
- ResponseGuard output scanner

### 4. 462 MCP Tools & Integrations

38 platform integrations: Telegram, Discord, Slack, WhatsApp, Signal, MS Teams, Gmail, GitHub, Jira, Linear, Notion, and more. 5 code forge adapters (Delta, GitHub, GitLab, Bitbucket, Gitea) with artifact registries (GHCR, GitLab, JFrog Artifactory). 462 built-in MCP tools, 9 resources, and 4 prompts — with SSRF protection, rate limiting, and audit logging.

- 38 platform integrations
- 5 code forge adapters + artifact registries
- 462 tools, 9 resources, 4 prompts
- SSRF protection + rate limiting
- Full audit trail on every tool call

### 5. Multi-Agent & Workflows

A2A protocol with E2E encryption and mDNS peer discovery. Sub-agent delegation with budget and depth controls. Agent Swarms (sequential, parallel, dynamic). Teams — a coordinator LLM dynamically assigns tasks to members at runtime. DAG workflow engine with 19 step types, OR-trigger dependencies, and a ReactFlow visual builder with human approval gates.

- A2A protocol (E2E encrypted)
- Swarms + Teams + Council of AIs
- DAG workflows — 19 step types
- ReactFlow visual builder + L3 approval gates

### 6. Cognitive Memory & Knowledge

Vector semantic search (FAISS/Qdrant/ChromaDB) fused with tsvector full-text search via Reciprocal Rank Fusion. Knowledge Base ingestion — PDF, HTML, Markdown, plain text, URL crawl, GitHub Wiki. Proactive context compaction at 80% window fill.

- Hybrid FTS + vector (RRF)
- Knowledge Base & RAG (PDF, HTML, Markdown, URL)
- Inline citations & groundedness checking
- Memory audits — compression, reorganization, coherence

### 7. Developer Experience

56-command CLI with shell completions and `--json` scripting output. Full-screen TUI (`secureyeoman tui`). Rich lifecycle hook system with observe/transform/veto semantics. Sandboxed code execution (Python, Node.js, shell). Desktop control — screen capture, keyboard/mouse, clipboard — gated by explicit consent and audit trail.

- 56 CLI commands + full-screen TUI
- Rich lifecycle hooks
- Sandboxed code execution
- Desktop control (consent-gated)

### 8. Flexible Deployment

Single ~123 MB binary (Linux x64/arm64, macOS arm64), Docker, or Kubernetes with Helm, HPA, PDB, and NetworkPolicies. Edge/IoT binary (Go, 7.2 MB, zero dependencies — runs on any Linux target). Three network modes — Local, LAN, or Public TLS. Multi-user workspaces, voice I/O (14 TTS + 10 STT providers), and portable skill marketplace sync. Per-user notification preferences with quiet hours and severity filters across 38 platforms.

- Single binary + Docker + K8s Helm
- Edge/IoT binary (Go, 7.2 MB) for constrained devices
- Local / LAN / Public TLS modes
- Multi-user workspaces + SSO
- Voice I/O — 14 TTS + 10 STT providers, voice profiles, streaming

### 9. Skills & Marketplace

Package any capability as a portable `.skill.json` and share it via the built-in marketplace or community repo. Skill routing lets the agent self-select the right tool using `useWhen`, `doNotUseWhen`, and `successCriteria` fields. Import pipeline enforces Trust Tiers so untrusted community skills are sandboxed before execution.

- Portable `.skill.json` import / export
- Marketplace + Community origins with unified schema
- Skill routing quality — useWhen / successCriteria
- Trust Tier install pipeline (sandboxed execution)

### 10. AI Training & Evaluation

Conversation dataset export, knowledge distillation, LoRA fine-tuning via Unsloth, LLM-as-Judge (pointwise scoring, pairwise comparison), conversation quality scoring, computer-use RL episodes, and live training stream (SSE). Autoresearch patterns for hyperparameter tuning, chaos escalation, and circuit breaker autotuning.

- Distillation (priority / curriculum / counterfactual)
- LoRA fine-tuning
- LLM-as-Judge auto-eval
- Conversation analytics (sentiment, entities)
- Autoresearch (HP search, chaos escalation, CB autotuning)

### 11. ML Lifecycle Platform

Preference annotation, experiment registry, model versioning, A/B testing, and conversation branching — branch from any message, replay with a different model, or batch-replay entire conversations for comparison.

- Experiment registry & model versioning
- A/B testing framework
- Conversation branching & replay
- Preference annotation

### 12. Simulation Engine

Enterprise-tier simulation framework built on personality, cognitive memory, and workflow subsystems. Tick-driven execution (realtime, accelerated, turn-based), emotion & mood modeling (Russell's circumplex, 10 mood labels, 12 trait modifiers), 3D spatial & proximity engine with zone-based triggers, and an autoresearch experiment runner for autonomous AI-driven research loops.

- Tick driver (realtime / accelerated / turn-based)
- Emotion & mood model (Russell's circumplex)
- 3D spatial & proximity engine (6 trigger types)
- Autoresearch experiment runner (fixed-budget, metric-driven)

---

## Use Cases

- **Security Operations** — Scan networks, detect anomalies, triage CVEs, and automate incident response — 37 network security tools built in.
- **Zero-Trust Access** — Provision Twingate service accounts, rotate service keys, and proxy private MCP servers — no VPN required.
- **DevSecOps Pipelines** — Review code, run tests, manage PRs across 5 code forges, enforce security policies, and automate your entire dev workflow.
- **Enterprise Automation** — Orchestrate multi-agent DAG workflows across swarms of personalities — approvals, reports, escalations.
- **Threat Intelligence** — Aggregate data across 38 platforms, enrich findings with NVD CVE lookups, and surface insights your team can act on.
- **Communications & Productivity** — Manage email, schedule meetings, draft reports, and coordinate across platforms — fully automated.
- **Edge & IoT** — Deploy a 7.2 MB Go binary to constrained devices, with A2A peer discovery, sandboxed execution, and fleet management.

---

## Comparison Highlights

| Capability | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| Data Residency | 100% local | Cloud default | Docker | Local | TEE cloud |
| RBAC + SSO | Full + WebAuthn | None | None | None | None |
| Multi-tenancy | RLS-enforced | No | No | No | No |
| MCP Tools | 462 | Limited | External | Client | Via path |
| Cryptographic Audit | HMAC-SHA256 | No | No | No | Local DB only |
| Workflow Orchestration | DAG + Visual | No | No | No | No |
| Code Forge Adapters | 5 forges | 1 (GitHub) | None | None | None |
| Integrations | 38 platforms | 23+ | CLI/Web | 11+ | ~4 |
| AI Training Pipeline | Full | No | No | No | No |
| ML Lifecycle (A/B, Versioning) | Full | No | No | No | No |
| Simulation Engine | Full | No | No | No | No |
| Edge/IoT Binary | 7.2 MB Go | No | No | Yes | No |

---

## Getting Started

```bash
# One-line install
curl -fsSL https://secureyeoman.ai/install.sh | bash

# Or pull the Docker image (multi-arch: amd64 + arm64)
docker pull ghcr.io/maccracken/secureyeoman:latest

# Or clone and build
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman && npm install && npm run build

# Edge/IoT binary (Linux amd64/arm64/armv7)
curl -fsSL https://secureyeoman.ai/install.sh | bash -s -- --edge
```

---

## Community

- **License**: AGPL-3.0
- **ADRs**: 37
- **GitHub**: [github.com/MacCracken/secureyeoman](https://github.com/MacCracken/secureyeoman)
- **Discussions**: [GitHub Discussions](https://github.com/MacCracken/secureyeoman/discussions)

---

Copyright 2026 SecureYeoman — AGPL-3.0
