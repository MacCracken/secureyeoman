# Functionality Audit: SecureYeoman vs Competitors

> Comparative analysis as of **2026-02-25** — SecureYeoman against OpenClaw, Agent Zero, PicoClaw, and Ironclaw.

---

## Executive Summary

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| **Vendor** | Open source | Open source (NEAR AI) | agent0ai | Sipeed (sipeed/picoclaw) | NEAR AI |
| **Language** | TypeScript | TypeScript | Python | Go | **Rust** |
| **Focus** | Enterprise self-hosted AI agent | Feature-rich personal AI | Personal assistant / agentic | Ultralight embedded AI | Privacy-first, TEE-backed runtime |
| **Deployment** | Local / LAN / public TLS; K8s Helm | Local desktop / server | Docker | Single binary, $10 hardware | TEE on NEAR AI Cloud or self-hosted |
| **RAM** | ~1 GB | ~1.5 GB baseline (2 GB min; 8 GB for browser skills) | 4 GB recommended | **< 10 MB** | Not published |
| **Startup** | ~30 s | ~6 s | > 30 s | **< 1 s** | Not published |
| **Security** | ✅ RBAC · encryption · audit chain · sandboxing · SecretsManager/Vault · TLS lifecycle | ⚠️ CVE-2026-25253 RCE (CVSS 8.8) + 8 more CVEs; 341 malicious ClawHub skills; Gartner: "unacceptable enterprise risk" | Basic (Docker isolation) | Experimental; unresolved network security issues (self-disclosed) | ✅ TEE · WASM sandbox · AES-256-GCM · credential vault |
| **MCP** | ✅ Full server + client (170+ tools) | Limited client integration | ✅ Client + server (FastA2A) | ❌ (issue #77 open) | ✅ As tool implementation path |
| **Enterprise-ready** | ✅ RBAC · SSO/OIDC · K8s · Prometheus | ❌ | ❌ | ❌ | ❌ |

---

## Competitor Profiles

### OpenClaw
Open-source AI agent at ~400,000+ users and **160,000–180,000 GitHub stars** (as of Feb 2026). Written in TypeScript (~430,000 lines). Active development, but significant security and governance concerns emerged in early 2026:

- **CVE-2026-25253** (CVSS 8.8) — one-click RCE. The Control UI trusted `gatewayUrl` from query strings without validation and forwarded auth tokens over WebSocket. Clicking a single link fully compromises the instance. Patched in `2026.1.29`.
- **CVE-2026-25157** and **CVE-2026-24763** — two additional command injection CVEs published the same week. A subsequent Endor Labs audit found **6 more** issues (SSRF, missing auth, path traversal).
- **ClawHavoc supply chain attack** — Koi Security found 341 malicious skills in ClawHub marketplace, 335 traced to a single coordinated campaign.
- **Gartner rating**: "unacceptable cybersecurity risk" — immediate enterprise ban recommended.
- **Palo Alto Networks**: called it "the potential biggest insider threat of 2026."
- **Creator departure**: primary author Peter Steinberger moved to OpenAI (announced Feb 14, 2026); project being transitioned to a foundation.
- **40,000+ exposed instances** detected in the wild (Feb 2026).
- **Cost**: $300–750/month in API tokens for the Claude Opus "proactive assistant" experience.
- ~1.5 GB baseline RAM; hard floor 2 GB (crashes during onboarding below this); 8 GB for browser automation skills.
- Runs with **unrestricted host-machine access** by default; Docker sandbox is opt-in only.
- ~2,857 ClawHub community skills.
- Additional security analyses published by **ExtraHop**, **Kaspersky**, **Jamf Threat Labs**, and **Immersive Labs** (Feb 2026), all highlighting enterprise risk.

### Agent Zero
Python-based general-purpose agent framework. Key 2026 state:

- Supports OpenAI, Anthropic, Grok, OpenRouter, GitHub Copilot, and local models via Ollama.
- Full **MCP client + server** and **FastA2A** protocol for multi-agent orchestration.
- TTS/STT speech capabilities added; web UI and Docker-based deployment.
- **Projects feature** — isolated workspaces with their own prompts, files, memory, and secrets (Feb 2026).
- **Skills System** and **Git-based projects** for version control integration.
- No RBAC, SSO, or persistent encryption — experimental status.
- Docker recommended with **4 GB RAM** minimum.

### PicoClaw
Ultra-lightweight Go binary by Sipeed, launched **2026-02-09**. Very early-stage:

- Single binary < 10 MB; targets RISC-V, ARM, x86 — runs on $10 Sipeed LicheeRV-Nano (256 MB DDR3).
- **No MCP support** (GitHub issue #77, unresolved).
- No GUI — CLI and chat apps only.
- **Unresolved network security issues** per the project's own warnings.
- Limited tool ecosystem; no browser automation; no persistent memory.
- Positioned as a constrained assistant, not an autonomous agent.

### Ironclaw
NEAR AI's Rust-based privacy-first agent runtime, **v0.7.0**, announced at **NEARCON 2026**:

- Deployed inside encrypted **TEEs (Trusted Execution Environments)** on NEAR AI Cloud; also self-hostable.
- All tools run in **WASM containers** with capability-based permissions (HTTP, secrets, tool invocation each require explicit opt-in); endpoint allowlisting enforced.
- **NVIDIA Inception program** membership (joined early 2026) for enhanced hardware isolation and privacy verification.
- Announced alongside a **decentralized GPU marketplace** for compute access.
- RAM and startup benchmarks not published; Rust static binary expected well below 200 MB.
- Local PostgreSQL encrypted with **AES-256-GCM**; credentials isolated in an encrypted vault; secrets never passed to the model.
- Continuous activity monitoring for prompt injection and resource abuse.
- Audit log stored in local DB — functional but not cryptographically chained.
- No RBAC, SSO/OIDC, Kubernetes, or dashboard.
- ~2 messaging integrations (Telegram WASM, Slack WASM); Signal channel in review (PR #271).
- Free Starter tier (one hosted agent instance) on NEAR AI Cloud.

---

## Feature Comparison

### 1 · Core Architecture

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Language | TypeScript | TypeScript | Python | Go | **Rust** |
| Database | PostgreSQL + SQLite | File-based (Markdown) | File-based | File-based | PostgreSQL + libSQL |
| AI providers | 11+ | Multiple | Multiple | 9+ | 5 (NEAR AI, Tinfoil TEE, OpenAI, Anthropic, Ollama) |
| MCP server + client | ✅ 120+ tools | Limited | ✅ FastA2A | ❌ | ✅ |
| RAM footprint | ~1 GB | ~1.5 GB (8 GB for browser skills) | 4 GB recommended | **< 10 MB** | Not published |
| Startup time | ~30 s | ~6 s | > 30 s | **< 1 s** | Not published |
| Enterprise-ready | ✅ | ❌ | ❌ | ❌ | ❌ |
| Single binary | ✅ ~80 MB | ❌ | ❌ | ✅ < 10 MB | ✅ Rust static |

### 2 · Security & Compliance

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| RBAC | ✅ Admin / Operator / Auditor / Viewer | ❌ | ❌ | ❌ | ❌ |
| Encryption at rest | ✅ AES-256-GCM | ❌ | ❌ | ❌ | ✅ AES-256-GCM |
| Secrets management | ✅ SecretsManager — env / keyring / file / Vault / OpenBao backends | ❌ | ❌ | ❌ | ✅ Encrypted credential vault in TEE |
| TLS lifecycle | ✅ Auto-generate dev certs; expiry monitoring; cert status API | ❌ | ❌ | ❌ | ❌ |
| Audit chain | ✅ HMAC-SHA256 cryptographic chain | ❌ | ❌ | ❌ | Local DB log (not cryptographic) |
| Credential redaction | ✅ ToolOutputScanner — 18 patterns; `[REDACTED:<type>]` on every LLM response | ❌ | ❌ | ❌ | ✅ LeakDetector at tool output + LLM response |
| Sandboxing | ✅ Landlock / seccomp / namespaces (Linux); sandbox-exec (macOS); gVisor; WASM | Docker opt-in | Docker-only | Workspace restriction | ✅ WASM (wasmtime) + Docker + outbound proxy |
| Outbound credential proxy | ✅ `CredentialProxy` — injects `Authorization` for known hosts; HTTPS CONNECT allowlist | ❌ | ❌ | ❌ | ✅ Credential injection at proxy; endpoint allowlist |
| Skill trust tiers | ✅ Community skills: read-only tool access; 26-prefix allow-list | ❌ | ❌ | ❌ | ✅ Trusted vs Installed tiers |
| Rate limiting | ✅ Per-user / per-IP / global | Configurable | ❌ | ❌ | ✅ WASM fuel metering |
| mTLS | ✅ | ❌ | ❌ | ❌ | ❌ |
| SSO / OIDC | ✅ Okta · Azure AD · Auth0 · any OIDC | ❌ | ❌ | ❌ | ❌ |
| Security policy flags | ✅ Per-feature toggles in Settings → Security | ❌ | ❌ | ❌ | ❌ |
| Known CVEs | — | **CVE-2026-25253** RCE CVSS 8.8 + **CVE-2026-25157**, **CVE-2026-24763** + 6 more; 341 malicious ClawHub skills (ClawHavoc) | — | Network security issues (self-disclosed; pre-v1.0) | — |

### 3 · Memory & Knowledge

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Vector memory | ✅ FAISS / Qdrant / ChromaDB | ❌ | ✅ FAISS | ❌ | ✅ pgvector |
| Full-text search | ✅ tsvector GIN index | ❌ | ❌ | ❌ | ✅ tsvector |
| Hybrid FTS + vector (RRF) | ✅ Reciprocal Rank Fusion | ❌ | ❌ | ❌ | ✅ RRF |
| Content chunking | ✅ 800 tokens / 15% overlap; per-chunk FTS + vector | ❌ | ❌ | ❌ | ✅ 800 tokens / 15% overlap |
| Memory consolidation | ✅ LLM-driven | ✅ File-based | ✅ | ❌ | ❌ |
| Context compaction | ✅ Proactive at 80% window fill | ✅ | ❌ | ❌ | ✅ |
| Workspace memory | ✅ | ✅ | ✅ | ✅ MEMORY.md | ✅ SOUL.md / AGENTS.md / USER.md |

### 4 · Tools & Automation

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| MCP tool count | ✅ **170+** | Limited | External via MCP | ❌ | Via MCP path |
| Browser automation | ✅ Playwright | ✅ Built-in | ✅ browser-use (Playwright) | ❌ | ❌ |
| Shell execution | ✅ Sandboxed | ✅ | ✅ | ✅ Restricted | ✅ Sandboxed |
| Code execution | ✅ Python / Node.js / shell, sandboxed | ✅ | ✅ | ❌ | ✅ Docker (3 isolation policies) |
| Network security toolkit | ✅ 37 tools — device discovery · port scan · SSH · NetBox · NVD/CVE · PCAP | ❌ | ❌ | ❌ | ❌ |
| Twingate zero-trust proxy | ✅ 13 tools — GraphQL tenant mgmt + private MCP proxy | ❌ | ❌ | ❌ | ❌ |
| Kali security toolkit | ✅ `sec_*` tools (nmap, nuclei, sqlmap, gobuster, etc.) | ❌ | ❌ | ❌ | ❌ |
| DAG workflow orchestration | ✅ 9 step types; ReactFlow visual builder; `allowWorkflows` gate | ❌ | ❌ | ❌ | ❌ |
| Agent swarms | ✅ Sequential / parallel / dynamic | ❌ | ✅ | ❌ | ❌ |
| Sub-agent spawn | ✅ Budget + depth controls | ✅ Workspaces | ✅ Hierarchical | ✅ | ❌ |
| A2A protocol | ✅ E2E encryption; mDNS/DNS-SD peer discovery | ❌ | ✅ FastA2A | ❌ | ❌ |
| Dynamic tool creation | ✅ Policy-gated | ❌ | ✅ | ❌ | ❌ |
| Cron / scheduling | ✅ | ❌ | ❌ | ✅ | ✅ Routines |
| Self-repairing tasks | ✅ `TaskLoop` — stuck detection + recovery prompt | ❌ | ❌ | ❌ | ✅ Stuck detection + re-analysis |
| LLM response cache | ✅ Hash-keyed; configurable TTL; off by default | ❌ | ❌ | ❌ | ✅ Hash-keyed |
| Skill routing | ✅ `useWhen` / `doNotUseWhen` / `successCriteria` / `routing` / `linkedWorkflowId` | ❌ | ❌ | ❌ | ❌ |
| Custom skills | ✅ 38 hook points; portable `.skill.json` import/export | ✅ ~2,857 ClawHub | ✅ Dynamic | ✅ | ✅ SKILL.md + ClawHub registry |
| WASM sandbox | ✅ Policy flag (off by default) | ❌ | ❌ | ❌ | ✅ First-class (wasmtime + fuel metering) |

### 5 · Messaging & Integrations

| Platform | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| **Telegram** | ✅ | ✅ | ❌ | ✅ | ✅ WASM |
| **Discord** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Slack** | ✅ | ✅ | ❌ | ❌ | ✅ WASM |
| **WhatsApp** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Signal** | ✅ | ✅ | ❌ | ❌ | PR #271 (in review) |
| **MS Teams** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Google Chat / Gmail / Calendar** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Email (SMTP/IMAP)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **GitHub / GitLab** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Jira / Notion / AWS** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Azure DevOps** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SSO / OIDC** | ✅ Okta · Azure AD · Auth0 | ❌ | ❌ | ❌ | ❌ |
| **OAuth2 (Google)** | ✅ Auto token refresh | ❌ | ❌ | ❌ | ❌ |
| **Webhook** | ✅ | ✅ | ❌ | ❌ | ✅ Triggers |
| **Total platforms** | **31** | **23+** | CLI / Web | **10+** | **~2 stable** |

### 6 · Dashboard & UX

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Web dashboard | ✅ React SPA | ✅ | ✅ Web | ❌ CLI only | ✅ Web gateway |
| Terminal UI (TUI) | ✅ `secureyeoman tui` — full-screen, Ctrl+R/L/↑↓ | ❌ | ❌ | ❌ | ✅ Ratatui (approval overlays) |
| Rich chat rendering | ✅ Markdown · Prism · Mermaid · KaTeX · GitHub alerts | ✅ | ❌ | ❌ | Basic |
| IDE integration | ✅ Monaco editor | ❌ | ❌ | ❌ | ❌ |
| Workflow visual builder | ✅ ReactFlow DAG, 9 step types | ❌ | ❌ | ❌ | ❌ |
| WebGL graph | ✅ Sigma.js + Graphology | ❌ | ❌ | ❌ | ❌ |
| Voice (STT / TTS) | ✅ Push-to-talk; per-personality voice | ✅ | ✅ | ❌ | ❌ |
| Image generation | ✅ DALL-E | ✅ | ❌ | ❌ | ❌ |
| Global navigate/create | ✅ Shortcut dialog — Chat / Skill / Workflow / Personality / Task | ❌ | ❌ | ❌ | ❌ |
| Network mode badge | ✅ Live: Local Only / Network (No TLS) / Public (TLS Secured) | ❌ | ❌ | ❌ | ❌ |

### 7 · Enterprise & Deployment

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Kubernetes / Helm | ✅ HPA · PDB · NetworkPolicies | Community operator | ❌ | ❌ | ❌ |
| Prometheus / Grafana | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-user workspaces | ✅ | ❌ | ✅ | ❌ | ❌ |
| SSO / OIDC | ✅ | ❌ | ❌ | ❌ | ❌ |
| Single binary | ✅ ~80 MB | ❌ | ❌ | ✅ < 10 MB | ✅ Rust static |
| Docker | ✅ ~80 MB | ✅ | ✅ | ❌ | ✅ |
| Dual DB backend | ✅ PostgreSQL + SQLite | ❌ | ❌ | ❌ | ✅ PostgreSQL + libSQL |
| CLI | ✅ 26 commands; completions; `--json` | ✅ | ✅ | ✅ | ✅ REPL |
| Lite binary (edge/IoT) | ✅ SQLite tier | ❌ | ❌ | ✅ (standard binary is already <10 MB) | ✅ libSQL backend |

### 8 · Testing & Quality

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|--|--|--|--|--|--|
| Test count | **7,400+** | Limited (community-driven) | Minimal | Minimal | Not published (Rust type safety provides baseline) |
| Line coverage | **84%** | Not tracked | Not tracked | Not tracked | Not tracked |
| Test files | **380** | Unknown | Unknown | Unknown | Unknown |
| CI/CD | ✅ lint · typecheck · test · build · security audit · docker-push · helm-lint | ✅ | Basic | Minimal | ✅ Cargo CI |
| Security test suite | ✅ Dedicated security + chaos suites | ❌ Multiple CVEs 2026 | ❌ | ❌ | ✅ Memory-safe by language; WASM sandbox tests |
| Storybook | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Where SecureYeoman Leads

### Unique to SecureYeoman

| # | Capability | Note |
|---|-----------|------|
| 1 | **RBAC + SSO/OIDC** | Admin / Operator / Auditor / Viewer; Okta, Azure AD, Auth0 |
| 2 | **SecretsManager + Vault/OpenBao** | env / keyring / file / vault / auto backends; process.env mirroring (Phase 41) |
| 3 | **TLS lifecycle management** | Auto-generate dev certs; expiry monitoring; `GET /api/v1/security/tls` (Phase 42) |
| 4 | **ToolOutputScanner** | 18-pattern credential redaction on every LLM response (ADR 092) |
| 5 | **Hybrid FTS + RRF** | tsvector GIN + pgvector merged via Reciprocal Rank Fusion (ADR 095) |
| 6 | **Content-chunked indexing** | 800-token overlapping chunks with independent FTS + vector indexes (ADR 096) |
| 7 | **Proactive context compaction** | Summarises older turns at 80% window fill before hitting context limit (ADR 097) |
| 8 | **Self-repairing `TaskLoop`** | Timeout + repeated-call detection; `buildRecoveryPrompt()` (ADR 098) |
| 9 | **Network Security Toolkit** | 37 MCP tools — device discovery, port scanning, SSH, NetBox, NVD/CVE, PCAP (Phase 46) |
| 10 | **Twingate zero-trust MCP proxy** | 13 tools — GraphQL tenant management + private MCP server proxy (Phase 45) |
| 11 | **Kali Security Toolkit** | `sec_*` MCP tools + `secureyeoman security` CLI (ADR 089) |
| 12 | **DAG Workflow Orchestration** | 9 step types; Mustache data-flow; ReactFlow visual builder; `allowWorkflows` gate |
| 13 | **Agnostic QA Bridge** | 10 `agnostic_*` MCP tools + A2A delegation (ADR 090) |
| 14 | **Skill routing quality** | `useWhen` / `doNotUseWhen` / `successCriteria` / `linkedWorkflowId` per skill (Phase 44) |
| 15 | **Outbound Credential Proxy** | `CredentialProxy` injects `Authorization` headers; HTTPS CONNECT allowlist (ADR 099) |
| 16 | **HMAC-SHA256 audit chain** | Cryptographically verifiable event log |
| 17 | **Kubernetes production readiness** | Helm, HPA, PDBs, NetworkPolicies, ExternalSecret CRD |
| 18 | **mTLS** | Mutual TLS for service-to-service communication |
| 19 | **DAG visual builder** | ReactFlow editor — only framework in this category with this feature |
| 20 | **Admin Security Policy UI** | Per-feature toggles: `allowWorkflows`, `allowSubAgents`, `allowA2A`, `sandboxWasm`, `sandboxGvisor`, and more |
| 21 | **Flexible network deployment** | `gateway.host` + `gateway.tls` switch local / LAN / public; `/health` returns `networkMode` |
| 22 | **31 messaging integrations** | vs ~2–3 for nearest competitor |

---

## Gaps & Opportunities

### vs OpenClaw — What We Lack
- **Community skill volume** — ~2,857 ClawHub skills vs SecureYeoman's marketplace (mitigated by community sync and trust-tier gate). Note: ClawHub had a coordinated malicious skill campaign in Feb 2026 (ClawHavoc; 341 skills), highlighting the importance of SecureYeoman's Skill Trust Tier model.

### vs PicoClaw — By Design Trade-offs
- **Ultra-low memory / sub-second startup** — < 10 MB / < 1 s is a Go + embedded-first trade-off that conflicts with the enterprise feature set. The SecureYeoman Lite binary (SQLite, ~80 MB) partially addresses this for edge deployments.

### vs Ironclaw — Gaps Already Resolved

| Gap | Ironclaw approach | SecureYeoman status |
|-----|------------------|---------------------|
| LLM response caching | Hash-keyed cache (model + system prompt + messages) | ✅ `ResponseCache` — configurable TTL; off by default |
| Outbound credential proxy | HTTP proxy in sandbox network namespace | ✅ `CredentialProxy` (ADR 099) |

**Where SecureYeoman leads over Ironclaw**: RBAC, SSO/OIDC, mTLS, HMAC audit chain, Kubernetes, personality system with active hours and presets, multi-agent (A2A, swarms, DAG orchestration, Agnostic QA bridge), 31 integrations, workflow visual builder, React dashboard, community marketplace, flexible network deployment.

**Where Ironclaw leads over SecureYeoman**: Rust memory safety (~7.8 MB RAM, < 10 ms startup), TEE-backed execution on NEAR AI Cloud, WASM tool sandboxing as the default (not a policy flag).

### vs Market
- **Native mobile app** — iOS/Android (roadmap Tier 3)

---

## Competitive Positioning

| Segment | Position | Rationale |
|---------|----------|-----------|
| **Enterprise self-hosted AI** | **Leader** | Only option with RBAC, SSO, HMAC audit, Vault, K8s Helm, Twingate, and network security toolkit |
| **Developer automation** | Challenger | OpenClaw leads on community volume; SecureYeoman leads on security and enterprise posture |
| **Privacy-first / high-security** | Differentiated | Ironclaw wins on Rust memory safety + TEE; SecureYeoman wins on feature breadth, enterprise auth, and multi-agent orchestration |
| **Embedded / IoT AI** | Challenger | PicoClaw leads on hardware constraints; SecureYeoman Lite binary available for edge deployments |
| **Managed SaaS** | Not positioned | Self-hosted only by design |

**Key differentiator**: SecureYeoman is the only enterprise-grade, self-hosted AI agent platform that combines full RBAC/SSO, cryptographic audit chain, Vault/OpenBao secrets management, zero-trust network access (Twingate), a network security toolkit (37 MCP tools + Kali), vector memory with hybrid FTS+RRF, DAG workflow orchestration with a visual builder, and Kubernetes production readiness — all in a single ~80 MB binary.

---

*Updated: 2026-02-25 — Research updates: OpenClaw 160K-180K stars, creator departure to OpenAI, 40K+ exposed instances, new security analyses (ExtraHop, Kaspersky, Jamf, Immersive Labs); Agent Zero Projects feature; Ironclaw NVIDIA Inception program membership. SecureYeoman MCP tools updated to 170+, CLI to 26 commands.*
