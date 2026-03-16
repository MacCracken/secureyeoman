# SecureYeoman — Your AI. Your Rules. Your Infrastructure.

Most AI assistants serve their platform. SecureYeoman serves you — self-hosted, enterprise-hardened, and answerable only to you.

Keep it local. Go hybrid. Connect any provider. Your data only moves when you say so.

**v2026.3.15** | AGPL-3.0 | 462 MCP Tools | 56 CLI Commands | ~22,000 Tests

**Testers Wanted!** We need your feedback to shape SecureYeoman's future. [Leave Feedback](https://github.com/MacCracken/secureyeoman/discussions)

---

## 13 AI Providers. Zero Secrets Exposed.

Anthropic, OpenAI, Gemini, Ollama, DeepSeek, OpenCode, Mistral, LM Studio, LocalAI, x.ai Grok, Letta, Groq, OpenRouter.

---

## Built for Security. Designed for You.

### Enterprise Security
RBAC (Admin/Operator/Auditor/Viewer), JWT + API key auth, mTLS, AES-256-GCM encryption. Six sandboxing modes: Landlock, seccomp, V8 isolate, namespaces, gVisor, WASM. Unified SecretsManager — env, keyring, file, Vault/OpenBao, or auto. TLS lifecycle with auto-generated certs and expiry monitoring. Organizational Intent with hard boundaries and soft policies.

- RBAC + SSO/OIDC + SAML 2.0 + WebAuthn/FIDO2
- Multi-tenancy with PostgreSQL RLS isolation
- Global rate limiting + sandbox artifact scanning
- Five sandboxing modes + externalization gate
- TEE-aware provider routing + attestation verification
- DLP — PII classification, egress scanning, watermarking
- Break-glass emergency access + SCIM 2.0 provisioning
- Access review campaigns + compliance SoA generator
- Organizational Intent — hard boundaries & OPA policies

### Audit & Compliance
HMAC-SHA256 cryptographic audit chain. Prometheus metrics with Grafana dashboards. Departmental Risk Register with heatmaps, appetite tracking, and executive summaries. ATHI threat governance for AI-specific risk scenarios.

- Cryptographic integrity (HMAC-SHA256)
- Streaming audit export — JSON-Lines, CSV, syslog RFC 5424
- Departmental Risk Register & ATHI threat governance
- Risk Assessment — composite 0–100 score across 5 domains
- Immutable, tamper-evident logs + Prometheus metrics
- Supply chain: SBOM (CycloneDX), SLSA L3, signed releases

### Security Operations
37 MCP tools for active network evaluation. Device discovery, port scanning, SSH automation, NetBox IPAM, NVD/CVE lookups, PCAP capture. Twingate zero-trust remote access. Kali Security Toolkit included.

- 37 network evaluation tools
- Twingate zero-trust tunnel (13 tools)
- NVD / CVE vulnerability lookups
- Kali toolkit (nmap, nuclei, sqlmap)

### 462 MCP Tools & 38 Integrations
Telegram, Discord, Slack, WhatsApp, Signal, MS Teams, GitHub, GitLab, Gmail, Google Calendar, Jira, Notion, AWS, Azure DevOps, and more. 5 code forge adapters: Delta, GitHub, GitLab, Bitbucket, Gitea. Artifact registries: GHCR, GitLab, JFrog Artifactory. 462 tools, 9 resources, 4 prompts. SSRF protection + encrypted credentials.

- 38 platform integrations
- 5 code forge adapters + artifact registries
- 462 tools · 9 resources · 4 prompts
- SSRF protection + encrypted creds

### Multi-Agent & Workflows
A2A protocol with E2E encryption and mDNS peer discovery. Sub-agent delegation with budget and depth controls. Agent Swarms (sequential, parallel, dynamic). Teams — coordinator LLM dynamically assigns tasks. Council of AIs — multi-round group deliberation. DAG workflow engine with 19 step types. OR-trigger dependencies. ReactFlow visual builder with human approval gates.

- A2A protocol (E2E encrypted)
- Swarms + Teams + Council of AIs
- DAG workflows — 19 step types
- ReactFlow visual builder + L3 approval gates

### Cognitive Memory & Knowledge
Vector semantic search (FAISS/Qdrant/ChromaDB). tsvector full-text search via Reciprocal Rank Fusion. Knowledge Base ingestion — PDF, HTML, Markdown, plain text, URL crawl, GitHub Wiki. Inline citations with provenance scoring and groundedness checking. Scheduled memory audits with compression and reorganization.

- Hybrid FTS + vector (RRF)
- Knowledge Base & RAG (PDF · HTML · Markdown · URL)
- Inline citations & groundedness checking
- Memory audits — compression, reorganization, coherence

### DDoS & Bot Defense
7-layer application defense: connection limits, body size enforcement, adaptive rate limiting, backpressure, IP reputation, distributed low-rate detection, request fingerprinting. Built for self-hosted deployments without a reverse proxy.

### Developer Experience
56-command CLI with shell completions and --json scripting output. Full-screen TUI (secureyeoman tui). Rich lifecycle hook system with observe/transform/veto semantics. Sandboxed code execution (Python, Node.js, shell). Desktop control — screen capture, keyboard/mouse, clipboard (consent-gated).

- 56 CLI commands + full-screen TUI
- Rich lifecycle hooks
- Sandboxed code execution
- Desktop control (consent-gated)

### Flexible Deployment
Single ~123 MB binary (Linux x64/arm64, macOS arm64). Docker or Kubernetes with Helm, HPA, PDB, NetworkPolicies. Edge/IoT binary — 7.2 MB static Go binary with A2A peer discovery, sandboxed execution, fleet management. Three network modes — Local, LAN, or Public TLS. Multi-user workspaces. Voice I/O (14 TTS + 10 STT providers). Portable skill marketplace sync.

- Single binary + Docker + K8s Helm
- Edge/IoT binary (Go, 7.2 MB) for constrained devices
- Local / LAN / Public TLS modes
- Multi-user workspaces + SSO
- Voice I/O — 14 TTS + 10 STT providers, voice profiles, streaming
- Fleet dashboard with node overview + GPU detection

### Ecosystem
15 integrated services: Agnostic (multi-agent orchestration), AGNOS (AI-native OS), Synapse (LLM controller), Delta (code forge), BullShift (trading), Photisnadi (task management), Shruti (DAW), Rasa (image editor), Mneme (knowledge base), Aequi (accounting), Edge (IoT fleet), Tazama (video editor), Paideia (learning), Dianoia (reasoning), Lexis (language).

### Skills & Marketplace
Portable .skill.json import/export. Marketplace + Community origins with unified schema. Skill routing with useWhen, doNotUseWhen, successCriteria fields. Trust Tier import pipeline with sandboxed execution.

- Portable .skill.json import / export
- Marketplace + Community origins with unified schema
- Skill routing quality — useWhen / successCriteria
- Trust Tier install pipeline (sandboxed execution)

### AI Training & Evaluation
Conversation dataset export. Knowledge distillation (priority / curriculum / counterfactual). LoRA fine-tuning via Unsloth. LLM-as-Judge (pointwise scoring, pairwise comparison). Conversation quality scoring. Computer-use RL episodes. Live training stream (SSE).

- Distillation (priority / curriculum / counterfactual)
- LoRA fine-tuning
- LLM-as-Judge auto-eval
- Conversation analytics (sentiment, entities)

### ML Lifecycle Platform
Preference annotation. Experiment registry. Model versioning. A/B testing framework. Conversation branching — branch from any message, replay with different model. Batch-replay entire conversations for comparison.

- Experiment registry & model versioning
- A/B testing framework
- Conversation branching & replay
- Preference annotation

### Simulation Engine
Enterprise-tier simulation framework. Tick-driven execution (realtime, accelerated, turn-based). Emotion & mood modeling using Russell's circumplex (10 mood labels, 12 trait modifiers). 3D spatial & proximity engine with 6 zone-based trigger types. Autoresearch experiment runner for autonomous AI-driven research loops with metric-driven retain/discard cycles.

- Tick driver — realtime / accelerated / turn-based
- Emotion & mood model (Russell's circumplex)
- 3D spatial & proximity engine (6 trigger types)
- Autoresearch: HP tuning, chaos escalation, CB autotuning

---

## Built for Every Mission

- **Security Operations** — Scan networks, detect anomalies, triage CVEs, and automate incident response — 37 network security tools built in.
- **Zero-Trust Access** — Provision Twingate service accounts, rotate service keys, and proxy private MCP servers — no VPN required.
- **DevSecOps Pipelines** — Review code, run tests, manage PRs across 5 code forges (Delta, GitHub, GitLab, Bitbucket, Gitea), enforce security policies, and automate your entire dev workflow.
- **Enterprise Automation** — Orchestrate multi-agent DAG workflows across swarms of personalities — approvals, reports, escalations.
- **Threat Intelligence** — Aggregate data across 38 platforms, enrich findings with NVD CVE lookups, and surface insights your team can act on.
- **Communications & Productivity** — Manage email, schedule meetings, draft reports, and coordinate across platforms — fully automated.

---

## Security by Design, Not Afterthought

The OpenClaw security crisis (2026): 10+ CVEs including CVSS 8.8 RCE, 824–1,184+ malicious marketplace skills, 30,000+ exposed instances, Gartner ban, Palo Alto Networks warning.

**SecureYeoman: 0 CVEs (2026)**

### Unique to SecureYeoman
1. **Enterprise Auth Stack** — RBAC, SSO/OIDC, SAML 2.0, mTLS, HMAC-SHA256, PostgreSQL RLS
2. **Credential Redaction** — ToolOutputScanner with 20 credential patterns
3. **DAG Workflow Builder** — 19 step types
4. **Hybrid FTS + Vector (RRF)**
5. **Network Security Toolkit** — 37 MCP tools
6. **Zero-Trust Remote Access** — Twingate integration (13 tools)
7. **Organizational Intent** — Machine-readable governance layer
8. **Risk Assessment Engine** — Five-domain composite scoring (0–100)
9. **True Key Sovereignty** — Outbound Credential Proxy (vs TrustClaw)
10. **Air-Gap Capable** — Self-hosted (vs Manus AI SaaS)

### Competitive Comparison

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| RBAC · SSO/OIDC · SAML · WebAuthn | Yes | No | No | No | Partial |
| Multi-tenancy | Yes | No | No | No | No |
| Secrets / Vault | Yes | No | No | No | Partial |
| Cryptographic Audit | Yes | No | No | No | No |
| MCP Tools | 462 | ~100 | ~50 | ~30 | ~200 |
| CVEs (2026) | 0 | 10+ | — | — | — |
| Network Security Tools | 37 | 0 | 0 | 0 | 0 |
| Workflow Orchestration | DAG (19 types) | Basic | No | No | Basic |
| Kubernetes / Helm | Yes | No | No | No | Yes |
| Integrations | 38 | ~15 | ~10 | ~5 | ~20 |
| CLI / Web | Both | Web | CLI | CLI | Web |
| RAM Footprint | ~1 GB | ~2 GB | ~500 MB | ~200 MB | ~1.5 GB |
| AI Training Pipeline | Yes | No | No | No | No |
| ML Lifecycle (A/B, Versioning) | Yes | No | No | No | No |

---

## The Business Case for Sovereign AI

**$4.88M** Average data breach cost (IBM, 2024)

### CISO — Risk Quantification
- 0 CVEs on record
- HMAC-SHA256 audit chain
- 5 sandboxing modes

### COO — Business Continuity
- Self-hosted — zero platform dependency
- Your data never leaves
- Immutable tamper-evident logs

### CFO / Legal — Compliance Pathway
RBAC with four roles, SSO/OIDC, SAML 2.0, WebAuthn/FIDO2, SCIM 2.0, PostgreSQL RLS, access review campaigns, compliance SoA generator (NIST, SOC 2, ISO 27001, HIPAA, EU AI Act).

### CTO — Operational Efficiency
- 38 network security tools
- 38 platform integrations
- 462 MCP tools
- Single ~123 MB binary or Helm chart
- Replaces 6+ point tools

### CEO / Board — Strategic Advantage
- Autonomous agent workflows at scale
- Governance-first architecture
- Sovereign AI — answerable only to you
- Deploy safely while competitors patch

[Read the White Paper: Architectural Sovereignty & Agentic Governance](whitepaper.html) — covers three security pillars, compliance readiness (GDPR, HIPAA, SOC 2, EU AI Act), and multi-agent governance model.

---

## Getting Started

### Single Binary
```bash
# Install SecureYeoman (Linux/macOS)
curl -fsSL https://secureyeoman.ai/install | bash

# First-time setup
secureyeoman init

# Start the server
secureyeoman start

# Access the dashboard
open http://localhost:18789
```

### npm
```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
npm install
cp .env.example .env
# Edit .env with API keys
npm run dev
```

### Docker (multi-arch: amd64 + arm64)
```bash
docker run -d --name secureyeoman \
    -p 18789:18789 \
    -e SECUREYEOMAN_ADMIN_PASSWORD=change-me-32chars \
    -v sy-data:/home/secureyeoman/.secureyeoman \
    ghcr.io/maccracken/secureyeoman:latest

open http://localhost:18789
docker logs -f secureyeoman
```

### Kubernetes
```bash
helm repo add secureyeoman \
    https://maccracken.github.io/secureyeoman
helm repo update

helm install secureyeoman secureyeoman/secureyeoman \
    --namespace secureyeoman --create-namespace \
    --set adminPassword=change-me-32chars

helm test secureyeoman -n secureyeoman
```

### Source
```bash
git clone https://github.com/MacCracken/secureyeoman.git
cd secureyeoman
npm install
cp .env.example .env
# Only admin password required — API keys added later via dashboard
npm run build
npm start
```

### Edge/IoT Binary
```bash
curl -fsSL https://secureyeoman.ai/install.sh | bash -s -- --edge
```

---

## Architecture

Multi-layered security with comprehensive observability at every level.

- **React Dashboard** — Vite + Tailwind + WebSocket
- **SecureYeoman Gateway** — Fastify + RBAC + Rate Limiting (Auth, Metrics, Audit, Encryption)
- **SecureYeoman Core** — Soul, Spirit, Brain, Body, Task, Security
- **PostgreSQL** — Backend data store
- **Integrations** — Telegram, Discord, Slack, WhatsApp, Signal, MS Teams, Google Chat, GitHub, GitLab, Gmail/Calendar, Email, Jira, Notion, AWS, Azure DevOps

---

## Community

- **License**: AGPL-3.0
- **Tests**: ~22,000
- **TypeScript Files**: 2,310
- **GitHub**: [github.com/MacCracken/secureyeoman](https://github.com/MacCracken/secureyeoman)
- **Discussions**: [GitHub Discussions](https://github.com/MacCracken/secureyeoman/discussions)

**Contribute**: We welcome contributions! Help us build the future of secure AI assistants — Bug Reports, Features, Docs, Tests.

- [Full Documentation](https://github.com/MacCracken/secureyeoman)
- [API Reference](https://github.com/MacCracken/secureyeoman)
- [Changelog](https://github.com/MacCracken/secureyeoman)

---

Copyright 2026 SecureYeoman — AGPL-3.0
