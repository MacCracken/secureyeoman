# Functionality Audit: SecureYeoman vs Competitors

> Comparative analysis as of **2026-02-28** — SecureYeoman against OpenClaw, Agent Zero, PicoClaw, Ironclaw, TrustClaw, Manus AI, ZeroClaw, and NanoBot.

---

## Executive Summary

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| **Vendor** | Open source | Open source (→ foundation; creator joined OpenAI Feb 14) | agent0ai | Sipeed (sipeed/picoclaw) | NEAR AI |
| **Latest version** | 2026.2.27 | 2026.2.26 | v0.9.8.2 | v0.1.2 (Feb 17) | **v0.12.0** (Feb 26) |
| **GitHub stars** | — | ~227K (1.36M npm/week) | ~13.5K | ~21K (launched Feb 9) | ~3.6K |
| **Language** | TypeScript | TypeScript | Python | Go | **Rust** |
| **Focus** | Enterprise self-hosted AI agent | Feature-rich personal AI | Personal assistant / agentic | Ultralight embedded AI | Privacy-first, TEE-backed runtime |
| **Deployment** | Local / LAN / public TLS; K8s Helm | Local desktop / server | Docker | Single binary, $10 hardware | TEE on NEAR AI Cloud **(no air-gap)** |
| **RAM** | ~1 GB | ~1.5 GB baseline (2 GB min; 8 GB for browser skills) | 4 GB recommended | **10–20 MB** (v0.1.2) | Not published |
| **Startup** | ~30 s | ~6 s | > 30 s | **< 1 s** | Not published |
| **Security** | ✅ RBAC · encryption · audit chain · sandboxing · SecretsManager/Vault · TLS lifecycle · ResponseGuard · OPA/CEL governance | ⚠️ CVE-2026-25253 RCE (CVSS 8.8) + CVE-2026-25157, CVE-2026-24763 + 6 more; 1,184+ malicious ClawHub skills (ClawHavoc); Gartner: "unacceptable enterprise risk" | Basic (Docker isolation) | Experimental; network security issues (self-disclosed) | ✅ TEE · WASM sandbox · AES-256-GCM · credential vault |
| **MCP** | ✅ Full server + client (170+ tools) | Limited client integration | ✅ Client + server | ❌ (on roadmap) | ✅ As tool implementation path |
| **Enterprise-ready** | ✅ RBAC · SSO/OIDC/SAML · multi-tenancy · K8s · Prometheus | ❌ | ❌ | ❌ | ❌ |

---

## Competitor Profiles

### OpenClaw
Open-source AI agent at **~227,000 GitHub stars** (43,412 forks; 1.36 million npm downloads/week) as of Feb 28, 2026 — one of the fastest-growing open source projects in history. Written in TypeScript (~430,000 lines). Latest release: `2026.2.26`. Creator Peter Steinberger announced joining OpenAI on **February 14, 2026** (Sam Altman personally announced it on X); project transitioning to an open-source foundation with OpenAI as sponsor. Active development continues, but serious and ongoing security and governance concerns:

- **CVE-2026-25253** (CVSS 8.8) — one-click RCE. The Control UI trusted `gatewayUrl` from query strings without validation and forwarded auth tokens over WebSocket. Clicking a single link fully compromises the instance. Patched in `2026.1.29`.
- **CVE-2026-25157** and **CVE-2026-24763** — two additional command injection CVEs published the same week. A subsequent Endor Labs audit found **6 more** issues (SSRF, missing auth, path traversal).
- **ClawHavoc supply chain attack** — Koi Security initially found 341 malicious skills in ClawHub; by Feb 16, 2026, confirmed malicious count grew to **824–1,184+** across an expanded registry of 10,700+ skills (Bitdefender: ~900, ≈ 20% of ecosystem). A separate `Cline CLI 2.3.0` supply chain attack installed OpenClaw on developer systems without consent. **30,000+ publicly exposed instances** detected (Censys: 21,639 by Jan 31, growing to 30,000+ by early Feb).
- **Snyk ToxicSkills study** — prompt injection found in 36% of examined skills; 1,467 malicious payloads identified across the skill supply chain.
- **Gartner rating**: "unacceptable cybersecurity risk" — immediate enterprise ban recommended.
- **Palo Alto Networks**: called it "the potential biggest insider threat of 2026."
- **Creator departure**: primary author Peter Steinberger moved to OpenAI (announced Feb 14, 2026); project transitioning to an independent open source foundation that OpenAI will support.
- **40,000+ exposed instances** detected in the wild (Censys: 21,639 by Jan 31, growing to 40,000+ by early Feb 2026).
- **Cost**: $300–750/month in API tokens for the Claude Opus "proactive assistant" experience.
- ~1.5 GB baseline RAM; hard floor 2 GB (crashes during onboarding below this); 8 GB for browser automation skills; gateway peaks at 6 GB under sustained load (GitHub issue #24689).
- Runs with **unrestricted host-machine access** by default; Docker sandbox is opt-in only.
- **ClawHub**: was 5,705 skills before cleanup; **~3,286 validated skills** after ClawHavoc removal.
- **Android**: native 4-step onboarding flow and 5-tab interface (Connect, Chat, Voice, Screen, Settings) added in 2026.2.23.
- Security analyses published by: **ExtraHop**, **Kaspersky**, **Jamf Threat Labs**, **Immersive Labs**, **Adversa AI**, **Trend Micro** (Atomic MacOS Stealer distribution via skills), **Bitdefender**, **Authmind**, **Snyk**, **Aryaka**, **Conscia**, **SecurityWeek** — all highlighting enterprise risk.

### Agent Zero
Python-based general-purpose agent framework. Latest release: **v0.9.8.2** (February 2026 — described as "one of the largest releases in Agent Zero history"). Key state:

- v0.9.8 introduced: **Skills framework** replacing legacy Instruments (new `SKILL.md` standard for portable skills), **real-time WebSocket state sync** replacing polling, **complete UI redesign** with process groups, message queue, and Git project support, **4 new LLM providers**.
- **17 new features, 13 improvements, 37 bug fixes** in v0.9.8.
- Full **MCP client + server** integration (use thousands of external MCP tools; expose Agent Zero as an MCP server).
- TTS/STT speech capabilities; web UI and Docker-based deployment.
- **Projects Management System** (v0.9.7, Nov 2025) — per-project custom instructions, memory, knowledge, files, and secrets.
- **Welcome screen** redesigned with security info/warning banners (missing API keys, system resources).
- No RBAC, SSO, or persistent encryption — experimental status.
- Docker recommended with **4 GB RAM** minimum (unchanged); local models require 8 GB+.

### PicoClaw
Ultra-lightweight Go binary by Sipeed, launched **2026-02-09**. Current version: **v0.1.2** (released Feb 17, 2026). ~**21,000 GitHub stars** (2,600 forks) — 5,000 stars in 4 days, 12,000 in one week:

- Single binary **10–20 MB** (originally <10 MB; grew in v0.1.2 with added features); targets RISC-V, ARM, x86 — runs on $10 Sipeed LicheeRV-Nano (256 MB DDR3). Boot time: < 1 s even on 0.6 GHz single-core.
- **No MCP support** (GitHub issue #290 — roadmap, no release date). Roadmap describes MCP for connecting to Google Drive, Slack, GitHub, and local databases without custom skill code.
- **v0.1.1 (Feb 13)**: Ollama local AI, I2C/SPI hardware tools, K8s health check endpoints, 32-bit arch support, Discord typing indicator, skill validation, Goreleaser CI/CD (270+ merged PRs).
- **v0.1.2 (Feb 17)**: Heartbeat improvements, cron re-enabled, concurrency/persistence safety fixes, GitHub Copilot provider, **symlink workspace escape security fix**.
- Messaging: Telegram, Discord, QQ, DingTalk, LINE, WeCom, Slack.
- No GUI — CLI and chat apps only. No browser automation. No persistent memory. No RBAC, no SSO.
- Positioned as a constrained assistant, not an autonomous agent. Not an enterprise competitor.

### Ironclaw
NEAR AI's Rust-based privacy-first agent runtime, publicly launched **2026-02-23**. Latest version: **v0.12.0** (released Feb 26, 2026). ~**3,600 GitHub stars**:

- Deployed inside encrypted **TEEs (Trusted Execution Environments)** on NEAR AI Cloud. **Cannot be self-hosted in an air-gapped environment** — requires NEAR AI Cloud infrastructure for TEE execution (dealbreaker for regulated industries).
- All tools run in **WASM containers** (wasmtime) with capability-based permissions; endpoint allowlisting enforced. Dynamic tool building: describe what you need, system builds it as a WASM tool at runtime.
- **v0.4.0 (Feb 17)**: Per-invocation approval checks, boot screen polish, lifecycle hooks system (6 interception points), tool-message sanitization, multi-tool approval resume flow.
- **v0.12.0 (Feb 26)**: Web improvements for WASM channel setup, **Signal channel implemented**, OpenRouter preset in setup wizard, thread session resolution improvements, sandbox config defaults updated.
- **NVIDIA Inception program** membership for hardware isolation and privacy verification.
- **Confidential GPU marketplace** — TEE-secured compute network for enterprise/government AI; hardware-signed attestation in < 30 s.
- **Multimodal Confidential Inference** — vision/audio models inside TEEs.
- RAM and startup benchmarks not published; Rust static binary expected well below 200 MB.
- Local PostgreSQL encrypted with **AES-256-GCM**; credentials isolated in an encrypted vault; secrets never passed to the model.
- Audit log stored in local DB — functional but not cryptographically chained.
- No RBAC, SSO/OIDC, Kubernetes, or dashboard.
- Messaging integrations: Telegram WASM, Slack WASM, **Signal** (v0.12.0).
- Free Starter tier (one hosted agent instance) on NEAR AI Cloud.

---

## Feature Comparison

### 1 · Core Architecture

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Language | TypeScript | TypeScript | Python | Go | **Rust** |
| Database | PostgreSQL + SQLite | File-based (Markdown) | File-based | File-based | PostgreSQL + libSQL |
| AI providers | 11+ | Multiple | Multiple | 9+ | 5 (NEAR AI, Tinfoil TEE, OpenAI, Anthropic, Ollama) |
| MCP server + client | ✅ 170+ tools | Limited | ✅ | ❌ (roadmap) | ✅ |
| RAM footprint | ~1 GB | ~1.5 GB (8 GB for browser skills; peaks 6 GB under load) | 4 GB recommended | **10–20 MB** | Not published |
| Startup time | ~30 s | ~6 s | > 30 s | **< 1 s** | Not published |
| Enterprise-ready | ✅ | ❌ | ❌ | ❌ | ❌ |
| Single binary | ✅ ~80 MB | ❌ | ❌ | ✅ < 10 MB | ✅ Rust static |
| Multi-tenancy | ✅ RLS-enforced tenant isolation | ❌ | ❌ | ❌ | ❌ |

### 2 · Security & Compliance

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| RBAC | ✅ Admin / Operator / Auditor / Viewer | ❌ | ❌ | ❌ | ❌ |
| Encryption at rest | ✅ AES-256-GCM | ❌ | ❌ | ❌ | ✅ AES-256-GCM |
| Secrets management | ✅ SecretsManager — env / keyring / file / Vault / OpenBao backends | ❌ | ❌ | ❌ | ✅ Encrypted credential vault in TEE |
| TLS lifecycle | ✅ Auto-generate dev certs; expiry monitoring; cert status API | ❌ | ❌ | ❌ | ❌ |
| Audit chain | ✅ HMAC-SHA256 cryptographic chain | ❌ | ❌ | ❌ | Local DB log (not cryptographic) |
| Correlation IDs | ✅ UUIDv7 via AsyncLocalStorage; `X-Correlation-ID` header; auto-enriched in audit entries | ❌ | ❌ | ❌ | ❌ |
| Credential redaction | ✅ ToolOutputScanner — 18 patterns; `[REDACTED:<type>]` on every LLM response | ❌ | ❌ | ❌ | ✅ LeakDetector at tool output + LLM response |
| Output safety scanner | ✅ ResponseGuard — 6 injection patterns; block/warn/disabled modes | ❌ | ❌ | ❌ | ❌ |
| Governance / OPA | ✅ OPA sidecar; CEL policy evaluator; hard boundaries + soft policies; output compliance | ❌ | ❌ | ❌ | ❌ |
| LLM-as-Judge | ✅ Secondary LLM review for high-autonomy tool calls | ❌ | ❌ | ❌ | ❌ |
| Sandboxing | ✅ Landlock / seccomp / namespaces (Linux); sandbox-exec (macOS); gVisor; WASM | Docker opt-in | Docker-only | Workspace restriction | ✅ WASM (wasmtime) + Docker + outbound proxy |
| Outbound credential proxy | ✅ `CredentialProxy` — injects `Authorization` for known hosts; HTTPS CONNECT allowlist | ❌ | ❌ | ❌ | ✅ Credential injection at proxy; endpoint allowlist |
| Skill trust tiers | ✅ Community skills: read-only tool access; 26-prefix allow-list | ❌ | ❌ | ❌ | ✅ Trusted vs Installed tiers |
| Rate limiting | ✅ Per-user / per-IP / global; login, refresh, password-reset buckets with Retry-After | Configurable | ❌ | ❌ | ✅ WASM fuel metering |
| mTLS | ✅ | ❌ | ❌ | ❌ | ❌ |
| SSO / OIDC | ✅ Okta · Azure AD · Auth0 · any OIDC | ❌ | ❌ | ❌ | ❌ |
| SAML 2.0 | ✅ SP-initiated SSO; group→role mapping | ❌ | ❌ | ❌ | ❌ |
| Multi-tenancy | ✅ RLS-enforced tenant isolation; tenant CRUD API | ❌ | ❌ | ❌ | ❌ |
| Security policy flags | ✅ Per-feature toggles in Settings → Security | ❌ | ❌ | ❌ | ❌ |
| Risk assessment | ✅ 5-domain composite score (0–100); findings lifecycle; external feeds | ❌ | ❌ | ❌ | ❌ |
| Known CVEs | — | **CVE-2026-25253** RCE CVSS 8.8 + **CVE-2026-25157**, **CVE-2026-24763** + 6 more; 824–1,184+ malicious ClawHub skills (ClawHavoc + ToxicSkills) | — | Network security issues (self-disclosed; pre-v1.0) | — |

### 3 · Memory & Knowledge

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Vector memory | ✅ FAISS / Qdrant / ChromaDB | ❌ | ✅ FAISS | ❌ | ✅ pgvector |
| Full-text search | ✅ tsvector GIN index | ❌ | ❌ | ❌ | ✅ tsvector |
| Hybrid FTS + vector (RRF) | ✅ Reciprocal Rank Fusion | ❌ | ❌ | ❌ | ✅ RRF |
| Content chunking | ✅ 800 tokens / 15% overlap; per-chunk FTS + vector | ❌ | ❌ | ❌ | ✅ 800 tokens / 15% overlap (flexible dims in v0.8.0) |
| Per-personality memory scoping | ✅ `personalityId` scoped recall; omnipresent mind toggle | ❌ | ❌ | ❌ | ❌ |
| Memory consolidation | ✅ LLM-driven | ✅ File-based | ✅ | ❌ | ❌ |
| Context compaction | ✅ Proactive at 80% window fill | ✅ | ❌ | ❌ | ✅ |
| Workspace memory | ✅ | ✅ | ✅ | ✅ MEMORY.md | ✅ SOUL.md / AGENTS.md / USER.md |

### 4 · Tools & Automation

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| MCP tool count | ✅ **170+** | Limited | External via MCP | ❌ (roadmap) | Via MCP path |
| Browser automation | ✅ Playwright | ✅ Built-in | ✅ browser-use (Playwright) | ❌ | ❌ |
| Shell execution | ✅ Sandboxed; cd navigation fixed | ✅ | ✅ | ✅ Restricted | ✅ Sandboxed |
| Code execution | ✅ Python / Node.js / shell, sandboxed | ✅ | ✅ | ❌ | ✅ Docker (3 isolation policies) |
| Network security toolkit | ✅ 37 tools — device discovery · port scan · SSH · NetBox · NVD/CVE · PCAP | ❌ | ❌ | ❌ | ❌ |
| Twingate zero-trust proxy | ✅ 13 tools — GraphQL tenant mgmt + private MCP proxy | ❌ | ❌ | ❌ | ❌ |
| Kali security toolkit | ✅ `sec_*` tools (nmap, nuclei, sqlmap, gobuster, hydra, etc.) | ❌ | ❌ | ❌ | ❌ |
| DAG workflow orchestration | ✅ 9 step types; ReactFlow visual builder; `allowWorkflows` gate | ❌ | ❌ | ❌ | ❌ |
| Agent swarms | ✅ Sequential / parallel / dynamic | ❌ | ✅ | ❌ | ❌ |
| Sub-agent spawn | ✅ Budget + depth controls | ✅ Workspaces | ✅ Hierarchical | ✅ | ❌ |
| A2A protocol | ✅ E2E encryption; mDNS/DNS-SD peer discovery | ❌ | ✅ | ❌ | ❌ |
| Dynamic tool creation | ✅ Policy-gated | ❌ | ✅ | ❌ | ❌ |
| Cron / scheduling | ✅ | ❌ | ✅ (redesigned scheduler in v0.9.8) | ✅ | ✅ Routines |
| Self-repairing tasks | ✅ `TaskLoop` — stuck detection + recovery prompt | ❌ | ❌ | ❌ | ✅ Stuck detection + re-analysis |
| LLM response cache | ✅ Hash-keyed; configurable TTL; off by default | ❌ | ❌ | ❌ | ✅ Hash-keyed |
| Skill routing | ✅ `useWhen` / `doNotUseWhen` / `successCriteria` / `routing` / `linkedWorkflowId` | ❌ | ❌ | ❌ | ❌ |
| Custom skills | ✅ 38 hook points; portable `.skill.json` import/export | ✅ ~3,286 ClawHub (post-cleanup) | ✅ Dynamic (`SKILL.md` standard) | ✅ | ✅ SKILL.md + ClawHub registry |
| WASM sandbox | ✅ Policy flag (off by default) | ❌ | ❌ | ❌ | ✅ First-class (wasmtime + fuel metering) |
| Backup & DR | ✅ `pg_dump`/`pg_restore`; 6 REST endpoints; dashboard Backup tab | ❌ | ❌ | ❌ | ❌ |
| Audit log export | ✅ JSONL / CSV / syslog RFC 5424; streamed; no buffering | ❌ | ❌ | ❌ | ❌ |

### 5 · Messaging & Integrations

| Platform | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| **Telegram** | ✅ | ✅ | ❌ | ✅ | ✅ WASM |
| **Discord** | ✅ | ✅ | ❌ | ✅ | ❌ |
| **Slack** | ✅ | ✅ | ❌ | ❌ | ✅ WASM |
| **WhatsApp** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Signal** | ✅ | ✅ | ❌ | ❌ | ✅ (v0.12.0, Feb 26) |
| **MS Teams** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **Google Chat / Gmail / Calendar** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Email (SMTP/IMAP)** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **GitHub / GitLab** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Jira / Notion / AWS** | ✅ | ✅ | ❌ | ❌ | ❌ |
| **Azure DevOps** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **SSO / OIDC** | ✅ Okta · Azure AD · Auth0 | ❌ | ❌ | ❌ | ❌ |
| **OAuth2 (Google)** | ✅ Auto token refresh | ❌ | ❌ | ❌ | ❌ |
| **Webhook** | ✅ | ✅ | ❌ | ❌ | ✅ Triggers |
| **Per-user notification prefs** | ✅ Quiet hours, min level, fan-out dispatch | ❌ | ❌ | ❌ | ❌ |
| **Total platforms** | **31** | **23+** | CLI / Web | **10+** | **3 stable** |

### 6 · Dashboard & UX

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Web dashboard | ✅ React SPA | ✅ | ✅ Web (redesigned v0.9.8) | ❌ CLI only | ✅ Web gateway |
| Terminal UI (TUI) | ✅ `secureyeoman tui` — full-screen, Ctrl+R/L/↑↓ | ❌ | ❌ | ❌ | ✅ Ratatui (approval overlays) |
| Rich chat rendering | ✅ Markdown · Prism · Mermaid · KaTeX · GitHub alerts | ✅ | ❌ | ❌ | Basic |
| IDE integration | ✅ Monaco editor (Standard + Advanced Editor modes) | ❌ | ❌ | ❌ | ❌ |
| Workflow visual builder | ✅ ReactFlow DAG, 9 step types | ❌ | ❌ | ❌ | ❌ |
| WebGL graph | ✅ Sigma.js + Graphology | ❌ | ❌ | ❌ | ❌ |
| Voice (STT / TTS) | ✅ Push-to-talk; per-personality voice; streaming binary TTS; Whisper model selector | ✅ | ✅ | ❌ | ❌ |
| Image generation | ✅ DALL-E | ✅ | ❌ | ❌ | ❌ |
| Multi-theme system | ✅ 18 named themes; CSS variable overrides; floating theme picker | ❌ | ❌ | ❌ | ❌ |
| Mission Control | ✅ Multi-panel command-center: KPI bar, topology, live feeds, resource monitoring, audit stream | ❌ | ❌ | ❌ | ❌ |
| Accessibility | ✅ jsx-a11y; focus-visible ring; 44px touch targets; axe-core smoke tests | ❌ | ❌ | ❌ | ❌ |
| Global navigate/create | ✅ Shortcut dialog — Chat / Skill / Workflow / Personality / Task | ❌ | ❌ | ❌ | ❌ |
| Network mode badge | ✅ Live: Local Only / Network (No TLS) / Public (TLS Secured) | ❌ | ❌ | ❌ | ❌ |
| Collaborative editing | ✅ Yjs CRDT; presence indicators; group chat | ❌ | ❌ | ❌ | ❌ |
| Mobile | ❌ (roadmap Tier 3) | ✅ Android native (4-step onboarding, 5-tab interface; added v2026.2.23) | ❌ | ❌ | ❌ |

### 7 · Enterprise & Deployment

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Kubernetes / Helm | ✅ HPA · PDB · NetworkPolicies | Community operator | ❌ | ❌ (K8s health checks added) | ❌ |
| Prometheus / Grafana | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-user workspaces | ✅ | ❌ | ✅ | ❌ | ❌ |
| SSO / OIDC + SAML 2.0 | ✅ | ❌ | ❌ | ❌ | ❌ |
| Multi-tenancy | ✅ RLS-enforced; tenant CRUD; slug validation | ❌ | ❌ | ❌ | ❌ |
| Single binary | ✅ ~80 MB | ❌ | ❌ | ✅ 10–20 MB | ✅ Rust static |
| Docker | ✅ ~80 MB | ✅ | ✅ | ❌ | ✅ |
| Dual DB backend | ✅ PostgreSQL + SQLite | ❌ | ❌ | ❌ | ✅ PostgreSQL + libSQL |
| CLI | ✅ 26 commands; completions; `--json`; 5-step init wizard | ✅ | ✅ | ✅ | ✅ REPL |
| Lite binary (edge/IoT) | ✅ SQLite tier | ❌ | ❌ | ✅ (standard binary is 10–20 MB) | ✅ libSQL backend |
| Air-gap / offline | ✅ Full self-hosted | ✅ | ✅ | ✅ | ❌ Requires NEAR AI Cloud |
| Backup & DR | ✅ Automated `pg_dump`/`pg_restore`; download + restore API | ❌ | ❌ | ❌ | ❌ |
| Audit log export | ✅ JSONL / CSV / syslog; filtered streaming | ❌ | ❌ | ❌ | ❌ |

### 8 · Testing & Quality

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|--|--|--|--|--|--|
| Test count | **9,533** | Limited (community-driven) | Minimal | Minimal | Not published (Rust type safety provides baseline) |
| Line coverage | **≥ 87%** | Not tracked | Not tracked | Not tracked | Not tracked |
| Test files | **378** | Unknown | Unknown | Unknown | Unknown |
| ADR records | **153** | Unknown | Unknown | Unknown | Unknown |
| CI/CD | ✅ lint · typecheck · test · build · security audit · docker-push · helm-lint | ✅ | Basic | Minimal | ✅ Cargo CI |
| Security test suite | ✅ Dedicated security + chaos suites; vitest-axe a11y smoke tests | ❌ Multiple CVEs 2026 | ❌ | ❌ | ✅ Memory-safe by language; WASM sandbox tests |
| Storybook | ✅ | ❌ | ❌ | ❌ | ❌ |

---

## Where SecureYeoman Leads

### Unique to SecureYeoman

| # | Capability | Note |
|---|-----------|------|
| 1 | **RBAC + SSO/OIDC + SAML 2.0** | Admin / Operator / Auditor / Viewer; Okta, Azure AD, Auth0; SP-initiated SAML with group→role mapping |
| 2 | **SecretsManager + Vault/OpenBao** | env / keyring / file / vault / auto backends; process.env mirroring |
| 3 | **TLS lifecycle management** | Auto-generate dev certs; expiry monitoring; `GET /api/v1/security/tls` |
| 4 | **ToolOutputScanner** | 18-pattern credential redaction on every LLM response (ADR 092) |
| 5 | **ResponseGuard** | Output-side injection scanner — 6 pattern types (instruction injection, cross-turn influence, self-escalation, role confusion, base64/hex exfiltration); block/warn/disabled modes (ADR 137) |
| 6 | **OPA + CEL governance** | OPA sidecar for hard boundary evaluation; CEL policy evaluator; output compliance via `IntentManager`; LLM-as-Judge for high-autonomy calls (ADR 132) |
| 7 | **Hybrid FTS + RRF** | tsvector GIN + pgvector merged via Reciprocal Rank Fusion (ADR 095) |
| 8 | **Content-chunked indexing** | 800-token overlapping chunks with independent FTS + vector indexes (ADR 096) |
| 9 | **Per-personality memory scoping** | `personalityId` scoped recall; omnipresent mind toggle; personality-scoped vector search (ADR 134) |
| 10 | **Proactive context compaction** | Summarises older turns at 80% window fill (ADR 097) |
| 11 | **Self-repairing `TaskLoop`** | Timeout + repeated-call detection; `buildRecoveryPrompt()` (ADR 098) |
| 12 | **Network Security Toolkit** | 37 MCP tools — device discovery, port scanning, SSH, NetBox, NVD/CVE, PCAP |
| 13 | **Twingate zero-trust MCP proxy** | 13 tools — GraphQL tenant management + private MCP server proxy |
| 14 | **Kali Security Toolkit** | `sec_*` MCP tools + `secureyeoman security` CLI (nmap, nuclei, sqlmap, gobuster, hydra) |
| 15 | **DAG Workflow Orchestration** | 9 step types; Mustache data-flow; ReactFlow visual builder; `allowWorkflows` gate |
| 16 | **Agnostic QA Bridge** | 10 `agnostic_*` MCP tools + A2A delegation (ADR 090) |
| 17 | **Skill routing quality** | `useWhen` / `doNotUseWhen` / `successCriteria` / `linkedWorkflowId` per skill |
| 18 | **Outbound Credential Proxy** | `CredentialProxy` injects `Authorization` headers; HTTPS CONNECT allowlist (ADR 099) |
| 19 | **HMAC-SHA256 audit chain** | Cryptographically verifiable event log; self-healing `repair()` + `createSnapshot()` |
| 20 | **Correlation IDs** | UUIDv7 per request via AsyncLocalStorage; `X-Correlation-ID` header; auto-enriched in audit entries and heartbeat cycles (ADR 145) |
| 21 | **Multi-tenancy** | RLS-enforced tenant isolation on all user-data tables; tenant CRUD API; blocks `'default'` deletion (ADR 144) |
| 22 | **Backup & DR API** | `pg_dump`/`pg_restore`; 6 REST endpoints; download + restore with confirm guard (ADR 142) |
| 23 | **Audit Log Export** | JSONL / CSV / syslog RFC 5424; filtered streaming; no server-side buffering (ADR 141) |
| 24 | **Risk Assessment & Reporting** | 5-domain composite score (security 30%, autonomy 25%, governance 20%, infrastructure 15%, external 10%); findings lifecycle; external feeds; JSON/HTML/MD/CSV report export |
| 25 | **Per-user notification preferences** | Quiet hours (UTC, overnight wrap), min level, fan-out across integrations; retention cleanup job |
| 26 | **Kubernetes production readiness** | Helm, HPA, PDBs, NetworkPolicies, ExternalSecret CRD |
| 27 | **mTLS** | Mutual TLS for service-to-service communication |
| 28 | **DAG visual builder** | ReactFlow editor — only framework in this category with this feature |
| 29 | **Admin Security Policy UI** | Per-feature toggles: `allowWorkflows`, `allowSubAgents`, `allowA2A`, `sandboxWasm`, `sandboxGvisor`, `allowCodeEditor`, `allowAdvancedEditor`, and more |
| 30 | **Multi-Theme System** | 18 named themes (dark, light, enterprise variants); CSS variable overrides; floating theme picker; Appearance tab in Settings |
| 31 | **Flexible network deployment** | `gateway.host` + `gateway.tls` switch local / LAN / public; `/health` returns `networkMode` |
| 32 | **31 messaging integrations** | vs ~2–3 for nearest competitor; real external dispatch with fan-out, quiet hours, and per-user prefs |
| 33 | **Accessibility compliance** | eslint-plugin-jsx-a11y at warn level; focus-visible ring; 44px touch targets; axe-core smoke tests |

---

## Gaps & Opportunities

### vs OpenClaw — What We Lack
- **Community skill volume** — ~3,286 validated ClawHub skills (post-cleanup from 5,705; 2,419+ removed) vs SecureYeoman's marketplace. The two coordinated supply-chain attacks (ClawHavoc; Snyk ToxicSkills at 36% injection rate) underscore SecureYeoman's Skill Trust Tier advantage.
- **Native mobile app** — OpenClaw added Android native (4-step onboarding, 5-tab) in v2026.2.23; SecureYeoman remains web/CLI only (roadmap Tier 3).
- **Governance uncertainty** — Creator Peter Steinberger joined OpenAI (Feb 14, 2026); project in foundation transition. This cuts both ways: less continuity risk for SecureYeoman, but also possible enterprise hesitation about OpenClaw's roadmap.

### vs PicoClaw — By Design Trade-offs
- **Ultra-low memory / sub-second startup** — 10–20 MB / < 1 s is a Go + embedded-first trade-off that conflicts with the enterprise feature set. The SecureYeoman Lite binary (SQLite, ~80 MB) partially addresses this for edge deployments. PicoClaw's lack of MCP support remains its biggest limitation for AI-tool integrations.

### vs Ironclaw — Gaps Already Resolved

| Gap | Ironclaw approach | SecureYeoman status |
|-----|------------------|---------------------|
| LLM response caching | Hash-keyed cache (model + system prompt + messages) | ✅ `ResponseCache` — configurable TTL; off by default |
| Outbound credential proxy | HTTP proxy in sandbox network namespace | ✅ `CredentialProxy` (ADR 099) |
| Flexible embedding dimensions | V9 migration | ✅ Configurable via vector backend |
| Confidential GPU access | Decentralized GPU marketplace on NEAR AI Cloud | Not applicable (local-first; no cloud dependency) |
| Signal channel | Added v0.12.0 (Feb 26) | ✅ Already shipped |
| Dynamic tool building | WASM tool generated at runtime from description | ✅ `allowDynamicTools` policy flag |

**Where SecureYeoman leads over Ironclaw**: RBAC, SSO/OIDC/SAML, mTLS, HMAC audit chain, multi-tenancy, backup & DR, Kubernetes, air-gap / on-premises deployment, personality system with active hours and presets, multi-agent (A2A, swarms, DAG orchestration, Agnostic QA bridge), 31 integrations, workflow visual builder, React dashboard, community marketplace, ResponseGuard, OPA/CEL governance, risk assessment, multi-theme system, correlation IDs.

**Where Ironclaw leads over SecureYeoman**: Rust memory safety (~200 MB estimated, < 10 ms startup), TEE-backed execution with hardware attestation, WASM tool sandboxing as the default (not a policy flag), Confidential GPU marketplace.

### vs Market
- **Native mobile app** — iOS/Android (roadmap Tier 3); OpenClaw has Android native

---

## 2026 Emerging Competitor Analysis

Four new entrants in early 2026 tighten specific competitive dimensions. None yet offer the full enterprise stack, but each targets a genuine pain-point.

### TrustClaw — Security-Focused OpenClaw Fork

**Threat level: HIGH — most direct architectural competitor.**

TrustClaw is a hardened fork of OpenClaw that strips the consumer-facing feature set in exchange for security primitives: Remote Sandboxing (agent code executes inside a cloud-isolated VM, not the user's machine) and Encrypted Credentials (a dedicated credential vault managed by TrustClaw's SaaS layer).

| | TrustClaw | SecureYeoman |
|---|---|---|
| **Architecture** | Cloud-backed "remote sandbox" (agent runs on TrustClaw servers) | Fully local / air-gapped — agent runs on your infrastructure |
| **Credential storage** | TrustClaw-managed cloud vault | SecretsManager: env / OS keyring / encrypted file / Vault / OpenBao — keys never leave your perimeter |
| **Data residency** | Encrypted in transit, TrustClaw holds keys | 100% local; no third party |
| **RBAC / SSO** | Basic role assignment, no OIDC/SAML | Full 4-level RBAC + Okta / Azure AD / Auth0 + SAML 2.0 |
| **Audit trail** | Structured JSON log (not cryptographic) | HMAC-SHA256 cryptographic chain + JSONL/CSV/syslog export |
| **Air-gap** | ❌ Requires TrustClaw cloud | ✅ Full self-hosted |
| **Multi-tenancy** | Single-tenant per account | PostgreSQL RLS multi-tenancy |
| **Open source** | Fork of OpenClaw (MIT) | MIT |

**SecureYeoman positioning vs TrustClaw**: The core argument is **sovereignty**. TrustClaw trades one cloud dependency (the AI provider) for two (AI provider + TrustClaw's own sandbox and vault). Every secret still passes through a third party. SecureYeoman's credential proxy keeps key material inside the customer's perimeter at every hop. For regulated industries (HIPAA, GDPR, financial services), TrustClaw's "remote sandbox" fails the data residency test that SecureYeoman passes.

---

### Manus AI — Cloud SaaS Agent Platform

**Threat level: MEDIUM — targets the "zero-friction onboarding" segment.**

Manus AI is a fully managed cloud agent service: no installation, browser-based, connected to user accounts via OAuth. It wins on time-to-first-result (measured in minutes, not hours) and appeals to individual contributors and small teams who lack DevOps support.

| | Manus AI | SecureYeoman |
|---|---|---|
| **Deployment** | SaaS (Manus-hosted cloud) | Self-hosted: binary / Docker / Kubernetes |
| **Setup time** | ~3 min (OAuth sign-in) | ~15 min (binary) to ~30 min (Kubernetes) |
| **Data residency** | Manus holds all conversation data and credentials | 100% local / sovereign |
| **RBAC** | Workspace-level sharing | 4-level RBAC + SSO/OIDC/SAML |
| **Air-gap** | ❌ Cloud-only | ✅ |
| **Enterprise auth** | Google/GitHub OAuth | Okta / Azure AD / Auth0 / SAML 2.0 |
| **Audit** | Activity log (non-cryptographic) | HMAC-SHA256 audit chain + export |
| **Price** | Subscription / consumption billing | Infrastructure cost only (open source) |
| **Compliance** | SOC 2 certification (claimed) | Technical controls for GDPR, SOC 2, HIPAA, EU AI Act |

**SecureYeoman positioning vs Manus AI**: Manus holds the data. Full stop. For any organization subject to GDPR, CCPA, HIPAA, or sector-specific data residency rules, "zero-setup" becomes zero-viable. SecureYeoman's sovereign architecture is the counter-argument: the same assistant capability, every byte under your control, with a Kubernetes Helm chart that enterprise platform teams can deploy and operate using existing tooling.

---

### ZeroClaw — Rust Performance / Edge Agent

**Threat level: MEDIUM-LOW — competes on binary size and startup, not feature depth.**

ZeroClaw is a Rust implementation targeting the performance and edge market: tiny binary, sub-second cold start, minimal memory footprint. It targets IoT gateways, CI runners, and developer workstations where the overhead of a Node.js or Python runtime is a blocker.

| | ZeroClaw | SecureYeoman |
|---|---|---|
| **Language** | Rust | TypeScript (Bun runtime) |
| **Binary size** | ~12 MB (estimated) | ~80 MB |
| **Startup time** | < 500 ms (estimated) | ~30 s |
| **RAM** | ~50 MB (estimated) | ~1 GB |
| **RBAC / SSO** | ❌ | ✅ Full enterprise auth stack |
| **Dashboard** | ❌ CLI only | ✅ React SPA |
| **MCP tools** | Minimal set | 180+ tools |
| **Database** | File-based | PostgreSQL + SQLite |
| **Air-gap** | ✅ | ✅ |
| **Multi-agent** | ❌ | ✅ Swarms, Teams, DAG, A2A |

**SecureYeoman positioning vs ZeroClaw**: ZeroClaw is PicoClaw's Rust cousin — a valid choice for resource-constrained single-agent deployments. The SecureYeoman Lite binary (SQLite backend, ~80 MB) partially bridges the gap for edge scenarios. For any use case requiring RBAC, audit, SSO, multi-agent orchestration, or a management dashboard, ZeroClaw has no answer. The competitive conversation reduces to: "Do you need one fast agent, or a governed fleet?"

---

### NanoBot — Minimal Research-Oriented Agent

**Threat level: LOW — targets academic / individual researcher segment.**

NanoBot is a deliberately small (~3,000 line) Python codebase designed to be fully readable and auditable by a single developer in an afternoon. It is popular in academic and research communities where the ability to understand and modify every line of the agent loop matters more than production features.

| | NanoBot | SecureYeoman |
|---|---|---|
| **Language** | Python | TypeScript |
| **Codebase size** | ~3,000 lines (intentional) | ~430,000+ lines |
| **Setup** | `pip install nanobot` | `curl install` / Docker / Helm |
| **RBAC / SSO** | ❌ | ✅ |
| **Audit trail** | Print-based logging | HMAC-SHA256 cryptographic chain |
| **Enterprise auth** | ❌ | Okta / Azure AD / Auth0 / SAML 2.0 |
| **MCP** | Basic client | 180+ server tools |
| **Skill marketplace** | ❌ | Community marketplace with Trust Tiers |
| **Multi-agent** | ❌ | Swarms, Teams, DAG, A2A, Federation |
| **Target user** | Researchers, educators | Enterprise security / ops teams |

**SecureYeoman positioning vs NanoBot**: NanoBot is not a direct competitive threat — it serves a different buyer entirely. The overlap risk is in the early-stage adoption funnel: a developer prototyping with NanoBot may never graduate to SecureYeoman if they perceive it as "too complex." The response is the `secureyeoman init` single-command onboarding wizard and the binary quick-start (`curl -fsSL https://secureyeoman.ai/install | bash`). The feature gap (SSO, RBAC, audit, multi-agent orchestration) becomes self-evident at enterprise pilot stage.

---

### Expanded Competitive Summary

| | SecureYeoman | TrustClaw | Manus AI | ZeroClaw | NanoBot |
|---|:---:|:---:|:---:|:---:|:---:|
| **Self-hosted / air-gap** | ✅ | ❌ cloud sandbox | ❌ SaaS | ✅ | ✅ |
| **Data sovereignty** | ✅ Full | ⚠️ Keys at TrustClaw | ❌ Manus holds data | ✅ | ✅ |
| **RBAC + SSO/SAML** | ✅ | ❌ | Basic | ❌ | ❌ |
| **Cryptographic audit** | ✅ HMAC-SHA256 | ❌ JSON log | ❌ | ❌ | ❌ |
| **Multi-tenancy** | ✅ RLS | ❌ | Per-account | ❌ | ❌ |
| **Vault / SecretsManager** | ✅ env/keyring/Vault/OpenBao | Cloud vault | OAuth tokens | ❌ | ❌ |
| **Multi-agent (swarms/teams)** | ✅ | ❌ | ❌ | ❌ | ❌ |
| **180+ MCP tools** | ✅ | Limited | Limited | Minimal | Basic |
| **Kubernetes / Helm** | ✅ | ❌ | N/A | ❌ | ❌ |
| **Open source** | ✅ MIT | ✅ MIT fork | ❌ Proprietary | ✅ | ✅ |
| **Binary size** | ~80 MB | Unknown | N/A | ~12 MB | N/A |
| **Primary threat** | — | Data residency framing | Zero-setup appeal | Edge/IoT hardware | Research mindshare |

---

## Competitive Positioning

| Segment | Position | Rationale |
|---------|----------|-----------|
| **Enterprise self-hosted AI** | **Leader** | Only option with RBAC, SSO/OIDC/SAML, multi-tenancy, HMAC audit, Vault, K8s Helm, Twingate, network security toolkit, OPA/CEL governance, backup & DR, and correlation ID observability |
| **Developer automation** | Challenger | OpenClaw leads on community volume (despite supply chain incidents); SecureYeoman leads on security posture, enterprise auth, and observability |
| **Privacy-first / high-security** | **Co-leader** | Ironclaw wins on Rust memory safety + TEE + confidential GPU; SecureYeoman wins on feature breadth, enterprise auth, multi-agent orchestration, and full dashboard. TrustClaw claims security but outsources key management to its own cloud |
| **Embedded / IoT AI** | Challenger | PicoClaw and ZeroClaw lead on hardware constraints; SecureYeoman Lite binary available for edge deployments |
| **Managed SaaS** | Not positioned | Self-hosted only by design; Ironclaw and Manus AI offer cloud-hosted options |
| **Research / education** | Not positioned | NanoBot serves this segment; SecureYeoman is overkill for single-researcher use |

**Key differentiator**: SecureYeoman is the only enterprise-grade, self-hosted AI agent platform that combines full RBAC/SSO/SAML, multi-tenancy, cryptographic audit chain, Vault/OpenBao secrets management, zero-trust network access (Twingate), a network security toolkit (37 MCP tools + Kali), ResponseGuard + OPA/CEL governance, vector memory with hybrid FTS+RRF and per-personality scoping, DAG workflow orchestration with a visual builder, backup & DR, audit log export, correlation ID observability, and Kubernetes production readiness — all in a single ~80 MB binary deployable fully air-gapped, with 9,916 tests at ≥ 87% coverage.

**The sovereignty argument**: Every new competitor (TrustClaw, Manus AI) that claims "security" while routing data through its own cloud reinforces SecureYeoman's core position. The answer to "but Manus AI is easier to set up" is `curl -fsSL https://secureyeoman.ai/install | bash && secureyeoman init`. The answer to "but TrustClaw is more secure" is the cryptographic audit chain, OPA governance, and the fact that SecureYeoman's Outbound Credential Proxy means neither TrustClaw nor any other third party ever sees your key material.

---

*Updated: 2026-02-28 — SecureYeoman: 9,916 tests (≥ 87% coverage), 166 ADRs; v2026.2.28 adds Teams (dynamic auto-manager, Phase 83), Workflow OR-trigger (`triggerMode: 'any'`), strict schema enforcement, `crew` CLI, Knowledge Base & RAG (Phase 82), Dashboard performance optimizations. OpenClaw: ~227K stars (1.36M npm/week), latest v2026.2.26; creator Peter Steinberger joined OpenAI (Feb 14, 2026); 30,000+ exposed instances; ClawHavoc 824–1,184+ malicious skills; foundation transition ongoing. Agent Zero: v0.9.8.2 with Skills framework (SKILL.md), WebSocket state sync, UI redesign. PicoClaw: v0.1.2 (Feb 17), ~21K stars, 10–20 MB; symlink escape patched; MCP on roadmap. Ironclaw: v0.12.0 (Feb 26), ~3.6K stars; Signal channel added; no air-gap (NEAR AI Cloud required for TEE). TrustClaw: OpenClaw fork with remote sandboxing; cloud-held credential vault. Manus AI: SaaS-only, zero-setup, cloud data residency. ZeroClaw: Rust edge agent, ~12 MB, no enterprise features. NanoBot: minimal Python research agent, ~3,000 LOC.*
