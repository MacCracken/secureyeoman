# SecureYeoman — Your AI. Your Rules. Your Infrastructure.

Self-hosted, enterprise-hardened, answerable only to you. Your data moves when you say so.

**v2026.3.18** | AGPL-3.0 | 485 MCP Tools | 56 CLI Commands | ~22,000 Tests

---

## 13 AI Providers. Zero Secrets Exposed.

Anthropic, OpenAI, Gemini, Ollama, DeepSeek, OpenCode, Mistral, LM Studio, LocalAI, x.ai Grok, Letta, Groq, OpenRouter.

---

## Built for Security. Designed for You.

### Enterprise Security
- RBAC + SSO/OIDC + SAML 2.0 + WebAuthn/FIDO2
- Multi-tenancy with PostgreSQL RLS isolation
- Five sandboxing modes + externalization gate
- TEE-aware provider routing + attestation verification
- DLP — PII classification, egress scanning, watermarking
- Break-glass emergency access + SCIM 2.0 provisioning
- Organizational Intent — hard boundaries & OPA policies
- 7-layer application defense + global rate limiting

### Audit & Compliance
- Cryptographic integrity (HMAC-SHA256)
- Streaming audit export — JSON-Lines, CSV, syslog RFC 5424
- Departmental Risk Register & ATHI threat governance
- Risk Assessment — composite 0-100 score across 5 domains
- Immutable, tamper-evident logs + Prometheus metrics
- Supply chain: SBOM (CycloneDX), SLSA L3, signed releases

### Security Operations
- 37 network evaluation tools
- Twingate zero-trust tunnel (13 tools)
- NVD / CVE vulnerability lookups
- Kali toolkit (nmap, nuclei, sqlmap)

### 485 MCP Tools & 38 Integrations
- 38 platform integrations
- 5 code forge adapters + artifact registries
- 485 tools, 9 resources, 4 prompts
- SSRF protection + encrypted creds

### Multi-Agent & Workflows
- A2A protocol (E2E encrypted)
- Swarms + Teams + Council of AIs
- DAG workflows — 19 step types
- ReactFlow visual builder + L3 approval gates

### Cognitive Memory & Knowledge
- Hybrid FTS + vector (RRF)
- Knowledge Base & RAG (PDF, HTML, Markdown, URL)
- Inline citations & groundedness checking
- Memory audits — compression, reorganization, coherence

### Developer Experience
- 56 CLI commands + full-screen TUI
- Rich lifecycle hooks
- Sandboxed code execution
- Desktop control (consent-gated)

### Flexible Deployment
- Single binary + Docker + K8s Helm
- Edge/IoT binary (Go, 7.2 MB) for constrained devices
- Local / LAN / Public TLS modes
- Multi-user workspaces + SSO
- Voice I/O — 14 TTS + 10 STT providers
- Fleet dashboard with node overview + GPU detection

### Ecosystem & Skills
- Portable .skill.json import / export
- Marketplace + Community origins with unified schema
- Trust Tier install pipeline (sandboxed execution)
- Companion apps: Shruti DAW, Rasa image editor, Tazama video editor, Mneme knowledge base

### Train & Evaluate
- Distillation (priority / curriculum / counterfactual)
- LoRA fine-tuning + LLM-as-Judge auto-eval
- Experiment registry & model versioning
- A/B testing + conversation branching & replay
- Conversation analytics (sentiment, entities)

### Simulation Engine
- Tick driver — realtime / accelerated / turn-based
- Emotion & mood model (Russell's circumplex)
- 3D spatial & proximity engine (6 trigger types)
- Autoresearch: HP tuning, chaos escalation, CB autotuning

---

## Security by Design, Not Afterthought

The OpenClaw security crisis (2026): 13+ CVEs (20+ GHSAs) including CVSS 8.8 RCE, 1,184+ malicious marketplace skills (12% of ClawHub), 42,000+ exposed instances, Gartner ban.

**SecureYeoman: 0 CVEs (2026)**

### Competitive Comparison

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| RBAC / SSO / SAML / WebAuthn | Yes | No | No | No | Partial |
| Multi-tenancy | Yes | No | No | No | No |
| Secrets / Vault | Yes | No | No | No | Partial |
| Cryptographic Audit | Yes | No | No | No | No |
| MCP Tools | 485 | ~100 | ~50 | ~30 | ~200 |
| CVEs (2026) | 0 | 13+ | 0 | - | 0 |
| Network Security Tools | 37 | 0 | 0 | 0 | 0 |
| Workflow Orchestration | DAG (19 types) | Basic | No | No | Basic |
| Kubernetes / Helm | Yes | No | No | No | Yes |
| Integrations | 38 | ~15 | ~10 | ~5 | ~20 |
| AI Training Pipeline | Yes | No | No | No | No |

---

## The Business Case for Sovereign AI

- **CISO** — Zero CVEs. Not because we're lucky — because we're paranoid.
- **COO** — No cloud dependency means no cloud surprises. Your schedule, your uptime.
- **CFO / Legal** — Every compliance framework needs controls. We ship them, not slide decks.
- **CTO** — One binary. 485 tools. Six fewer vendor contracts.
- **CEO / Board** — Your competitors are patching. You're shipping.

[Read the White Paper](whitepaper.html) — three security pillars, compliance readiness, multi-agent governance.

---

## Getting Started

### Single Binary
```bash
curl -fsSL https://secureyeoman.ai/install | bash
secureyeoman init
secureyeoman start
open http://localhost:18789
```

### Docker
```bash
docker run -d --name secureyeoman \
    -p 18789:18789 \
    -e SECUREYEOMAN_ADMIN_PASSWORD=change-me-32chars \
    -v sy-data:/home/secureyeoman/.secureyeoman \
    ghcr.io/maccracken/secureyeoman:latest
```

### Kubernetes
```bash
helm repo add secureyeoman https://maccracken.github.io/secureyeoman
helm install secureyeoman secureyeoman/secureyeoman \
    --namespace secureyeoman --create-namespace \
    --set adminPassword=change-me-32chars
```

---

Copyright 2026 SecureYeoman — AGPL-3.0
