# Functionality Audit: SecureYeoman vs Competitors

> Comparative analysis as of **2026-03-02** — SecureYeoman against OpenClaw, Agent Zero, PicoClaw, Ironclaw, TrustClaw, Manus AI (Meta), Devin 2.0, OpenHands, OpenAI Frontier, ZeroClaw, and NanoBot.

---

## Executive Summary

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| **Vendor** | Open source | Open source (→ foundation; creator joined OpenAI Feb 14) | agent0ai | Sipeed (sipeed/picoclaw) | NEAR AI |
| **Latest version** | 2026.3.2 | 2026.3.1 | v0.9.8.2 | v0.2.0 (Feb 28) | **v0.13.1** (Mar 2) |
| **GitHub stars** | — | ~234K (1.36M npm/week) | ~15.7K | ~21.7K (launched Feb 9) | ~4K |
| **Language** | TypeScript | TypeScript | Python | Go | **Rust** |
| **Focus** | Enterprise self-hosted AI agent | Feature-rich personal AI | Personal assistant / agentic | Ultralight embedded AI | Privacy-first, TEE-backed runtime |
| **Deployment** | Local / LAN / public TLS; K8s Helm | Local desktop / server | Docker | Single binary, $10 hardware | TEE on NEAR AI Cloud **(no air-gap)** |
| **RAM** | ~1 GB | ~1.5 GB baseline (2 GB min; 8 GB for browser skills) | 4 GB recommended | **10–20 MB** (v0.1.2) | Not published |
| **Startup** | ~30 s | ~6 s | > 30 s | **< 1 s** | Not published |
| **Security** | ✅ RBAC · encryption · audit chain · sandboxing · SecretsManager/Vault · TLS lifecycle · ResponseGuard · OPA/CEL governance | ⚠️ CVE-2026-25253 RCE (CVSS 8.8) + CVE-2026-25157, CVE-2026-24763 + 6 more; 1,184+ malicious ClawHub skills (ClawHavoc); Cline supply chain; Gartner: "unacceptable enterprise risk" | Basic (Docker isolation) | Experimental; network security issues (self-disclosed) | ✅ TEE · WASM sandbox · AES-256-GCM · credential vault |
| **MCP** | ✅ Full server + client (200+ tools) | Limited client integration | ✅ Client + server | ✅ (v0.2.0) | ✅ As tool implementation path |
| **Enterprise-ready** | ✅ RBAC · SSO/OIDC/SAML · multi-tenancy · K8s · Prometheus | ❌ | ❌ | ❌ | ❌ |

---

## Competitor Profiles

### OpenClaw
Open-source AI agent at **~234,621 GitHub stars** (43,412 forks; 1.36 million npm downloads/week) as of March 2, 2026 — one of the fastest-growing open source projects in history. Written in TypeScript (~430,000 lines). Latest release: `2026.3.1`. Creator Peter Steinberger announced joining OpenAI on **February 14, 2026** (Sam Altman personally announced it on X); project transitioning to an open-source foundation with OpenAI as sponsor. Active development continues, but serious and ongoing security and governance concerns:

- **CVE-2026-25253** (CVSS 8.8) — one-click RCE. The Control UI trusted `gatewayUrl` from query strings without validation and forwarded auth tokens over WebSocket. Clicking a single link fully compromises the instance. Patched in `2026.1.29`.
- **CVE-2026-25157** and **CVE-2026-24763** — two additional command injection CVEs published the same week. A subsequent Endor Labs audit found **6 more** issues (SSRF, missing auth, path traversal).
- **ClawHavoc supply chain attack** — Koi Security initially found 341 malicious skills in ClawHub; by Feb 16, 2026, confirmed malicious count grew to **824–1,184+** across an expanded registry of 13,729+ skills (Bitdefender: ~900, ≈ 20% of ecosystem at time of audit). A separate `Cline CLI 2.3.0` supply chain attack installed OpenClaw on developer systems without consent — delivered as a payload masquerading as Cline updates. **135,000+ publicly exposed instances** detected (Censys: 21,639 by Jan 31, growing to 40,000+ by mid-Feb, **135,000+** by March 2026).
- **Snyk ToxicSkills study** — prompt injection found in 36% of examined skills; 1,467 malicious payloads identified across the skill supply chain.
- **Gartner rating**: "unacceptable cybersecurity risk" — immediate enterprise ban recommended.
- **Palo Alto Networks**: called it "the potential biggest insider threat of 2026."
- **Creator departure**: primary author Peter Steinberger moved to OpenAI (announced Feb 14, 2026); project transitioning to an independent open source foundation that OpenAI will support.
- **135,000+ exposed instances** detected in the wild (Censys: 21,639 by Jan 31, 40,000+ by mid-Feb, **135,000+** by March 2026).
- **Cost**: $300–750/month in API tokens for the Claude Opus "proactive assistant" experience.
- ~1.5 GB baseline RAM; hard floor 2 GB (crashes during onboarding below this); 8 GB for browser automation skills; gateway peaks at 6 GB under sustained load (GitHub issue #24689).
- Runs with **unrestricted host-machine access** by default; Docker sandbox is opt-in only.
- **ClawHub**: **13,729 total skills** (up from 5,705 pre-ClawHavoc); validated count post-cleanup lower but registry continues rapid growth.
- **Android**: native 4-step onboarding flow and 5-tab interface (Connect, Chat, Voice, Screen, Settings) added in 2026.2.23.
- Security analyses published by: **ExtraHop**, **Kaspersky**, **Jamf Threat Labs**, **Immersive Labs**, **Adversa AI**, **Trend Micro** (Atomic MacOS Stealer distribution via skills), **Bitdefender**, **Authmind**, **Snyk**, **Aryaka**, **Conscia**, **SecurityWeek** — all highlighting enterprise risk.

### Agent Zero
Python-based general-purpose agent framework. Latest release: **v0.9.8.2** (February 2026 — described as "one of the largest releases in Agent Zero history"). ~**15,700 GitHub stars** (up from ~13.5K). Key state:

- v0.9.8 introduced: **Skills framework** replacing legacy Instruments (new `SKILL.md` standard for portable skills), **real-time WebSocket state sync** replacing polling, **complete UI redesign** with process groups, message queue, and Git project support, **4 new LLM providers**.
- **17 new features, 13 improvements, 37 bug fixes** in v0.9.8.
- Full **MCP client + server** integration (use thousands of external MCP tools; expose Agent Zero as an MCP server).
- Default model changed to **claude-sonnet-4-6** (previously Claude 3.5 Sonnet).
- TTS/STT speech capabilities; web UI and Docker-based deployment.
- **Projects Management System** (v0.9.7, Nov 2025) — per-project custom instructions, memory, knowledge, files, and secrets.
- **Welcome screen** redesigned with security info/warning banners (missing API keys, system resources).
- No RBAC, SSO, or persistent encryption — experimental status.
- Docker recommended with **4 GB RAM** minimum (unchanged); local models require 8 GB+.

### PicoClaw
Ultra-lightweight Go binary by Sipeed, launched **2026-02-09**. Current version: **v0.2.0** (released Feb 28, 2026). ~**21,700 GitHub stars** (2,600+ forks) — 5,000 stars in 4 days, 12,000 in one week:

- Single binary **10–20 MB** (originally <10 MB; grew with added features); targets RISC-V, ARM, x86 — runs on $10 Sipeed LicheeRV-Nano (256 MB DDR3). Boot time: < 1 s even on 0.6 GHz single-core.
- **MCP support merged** in v0.2.0 — full MCP client integration; connects to Google Drive, Slack, GitHub, local databases via MCP servers.
- **v0.1.1 (Feb 13)**: Ollama local AI, I2C/SPI hardware tools, K8s health check endpoints, 32-bit arch support, Discord typing indicator, skill validation, Goreleaser CI/CD (270+ merged PRs).
- **v0.1.2 (Feb 17)**: Heartbeat improvements, cron re-enabled, concurrency/persistence safety fixes, GitHub Copilot provider, **symlink workspace escape security fix**.
- **v0.2.0 (Feb 28)**: **MCP PR merged** (major milestone), **WhatsApp channel** added, **4 new LLM providers**, **web launcher UI** (basic browser-based setup), **multi-agent routing** (experimental), improved embedded hardware support.
- Messaging: Telegram, Discord, QQ, DingTalk, LINE, WeCom, Slack, **WhatsApp** (v0.2.0).
- Web launcher UI is basic — not a full dashboard. No browser automation. No persistent memory. No RBAC, no SSO.
- Positioned as a constrained assistant growing toward agentic capability. Not an enterprise competitor but MCP support closes a major gap.

### Ironclaw
NEAR AI's Rust-based privacy-first agent runtime, publicly launched **2026-02-23**. Latest version: **v0.13.1** (released Mar 2, 2026). ~**4,037 GitHub stars**:

- Deployed inside encrypted **TEEs (Trusted Execution Environments)** on NEAR AI Cloud. **Cannot be self-hosted in an air-gapped environment** — requires NEAR AI Cloud infrastructure for TEE execution (dealbreaker for regulated industries).
- All tools run in **WASM containers** (wasmtime) with capability-based permissions; endpoint allowlisting enforced. Dynamic tool building: describe what you need, system builds it as a WASM tool at runtime.
- **v0.4.0 (Feb 17)**: Per-invocation approval checks, boot screen polish, lifecycle hooks system (6 interception points), tool-message sanitization, multi-tool approval resume flow.
- **v0.12.0 (Feb 26)**: Web improvements for WASM channel setup, **Signal channel implemented**, OpenRouter preset in setup wizard, thread session resolution improvements, sandbox config defaults updated.
- **v0.13.1 (Mar 2)**: **`web_fetch` built-in tool** (no WASM needed), **Jobs tab** with scheduler for recurring tasks, **CLI tool setup** wizard, **Brave Search WASM** tool, **TLS for PostgreSQL** connections, Signal attachment support, improved error handling.
- **NVIDIA Inception program** membership for hardware isolation and privacy verification.
- **Confidential GPU marketplace** — TEE-secured compute network for enterprise/government AI; hardware-signed attestation in < 30 s.
- **Multimodal Confidential Inference** — vision/audio models inside TEEs.
- RAM and startup benchmarks not published; Rust static binary expected well below 200 MB.
- Local PostgreSQL encrypted with **AES-256-GCM**; credentials isolated in an encrypted vault; secrets never passed to the model. **TLS for PostgreSQL** connections added in v0.13.1.
- Audit log stored in local DB — functional but not cryptographically chained.
- No RBAC, SSO/OIDC, Kubernetes, or dashboard (Jobs tab is the closest to workflow management).
- Messaging integrations: Telegram WASM, Slack WASM, **Signal** (v0.12.0, attachments v0.13.1).
- Free Starter tier (one hosted agent instance) on NEAR AI Cloud.

---

## Feature Comparison

### 1 · Core Architecture

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Language | TypeScript | TypeScript | Python | Go | **Rust** |
| Database | PostgreSQL + SQLite | File-based (Markdown) | File-based | File-based | PostgreSQL + libSQL |
| AI providers | 11+ | Multiple | Multiple | 9+ | 5 (NEAR AI, Tinfoil TEE, OpenAI, Anthropic, Ollama) |
| MCP server + client | ✅ 200+ tools | Limited | ✅ | ✅ (v0.2.0 client) | ✅ |
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
| MCP tool count | ✅ **200+** | Limited | External via MCP | ✅ MCP client (v0.2.0) | Via MCP path |
| Browser automation | ✅ Playwright | ✅ Built-in | ✅ browser-use (Playwright) | ❌ | ❌ |
| Shell execution | ✅ Sandboxed; cd navigation fixed | ✅ | ✅ | ✅ Restricted | ✅ Sandboxed |
| Code execution | ✅ Python / Node.js / shell, sandboxed | ✅ | ✅ | ❌ | ✅ Docker (3 isolation policies) |
| Network security toolkit | ✅ 37 tools — device discovery · port scan · SSH · NetBox · NVD/CVE · PCAP | ❌ | ❌ | ❌ | ❌ |
| Twingate zero-trust proxy | ✅ 13 tools — GraphQL tenant mgmt + private MCP proxy | ❌ | ❌ | ❌ | ❌ |
| Kali security toolkit | ✅ `sec_*` tools (nmap, nuclei, sqlmap, gobuster, hydra, etc.) | ❌ | ❌ | ❌ | ❌ |
| DAG workflow orchestration | ✅ 14 step types; ReactFlow visual builder; `allowWorkflows` gate | ❌ | ❌ | ❌ | ❌ |
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
| **WhatsApp** | ✅ | ✅ | ❌ | ✅ (v0.2.0) | ❌ |
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
| **Total platforms** | **36** | **23+** | CLI / Web | **11+** | **4 stable** |

### 6 · Dashboard & UX

| Feature | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---------|:---:|:---:|:---:|:---:|:---:|
| Web dashboard | ✅ React SPA | ✅ | ✅ Web (redesigned v0.9.8) | ❌ CLI only | ✅ Web gateway |
| Terminal UI (TUI) | ✅ `secureyeoman tui` — full-screen, Ctrl+R/L/↑↓ | ❌ | ❌ | ❌ | ✅ Ratatui (approval overlays) |
| Rich chat rendering | ✅ Markdown · Prism · Mermaid · KaTeX · GitHub alerts | ✅ | ❌ | ❌ | Basic |
| IDE integration | ✅ Monaco editor (Standard + Advanced Editor modes) | ❌ | ❌ | ❌ | ❌ |
| Workflow visual builder | ✅ ReactFlow DAG, 14 step types | ❌ | ❌ | ❌ | ❌ |
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
| CLI | ✅ 35 commands; completions; `--json`; 5-step init wizard | ✅ | ✅ | ✅ | ✅ REPL |
| Lite binary (edge/IoT) | ✅ SQLite tier | ❌ | ❌ | ✅ (standard binary is 10–20 MB) | ✅ libSQL backend |
| Air-gap / offline | ✅ Full self-hosted | ✅ | ✅ | ✅ | ❌ Requires NEAR AI Cloud |
| Backup & DR | ✅ Automated `pg_dump`/`pg_restore`; download + restore API | ❌ | ❌ | ❌ | ❌ |
| Audit log export | ✅ JSONL / CSV / syslog; filtered streaming | ❌ | ❌ | ❌ | ❌ |

### 8 · Testing & Quality

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|--|--|--|--|--|--|
| Test count | **13,097** | Limited (community-driven) | Minimal | Minimal | Not published (Rust type safety provides baseline) |
| Line coverage | **≥ 87%** | Not tracked | Not tracked | Not tracked | Not tracked |
| Test files | **397+** | Unknown | Unknown | Unknown | Unknown |
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
| 6 | **OPA + CEL governance** | OPA sidecar for hard boundary evaluation; CEL policy evaluator; output compliance via `IntentManager`; LLM-as-Judge for high-autonomy calls (ADR 128) |
| 7 | **Hybrid FTS + RRF** | tsvector GIN + pgvector merged via Reciprocal Rank Fusion (ADR 095) |
| 8 | **Content-chunked indexing** | 800-token overlapping chunks with independent FTS + vector indexes (ADR 095) |
| 9 | **Per-personality memory scoping** | `personalityId` scoped recall; omnipresent mind toggle; personality-scoped vector search (ADR 133) |
| 10 | **Proactive context compaction** | Summarises older turns at 80% window fill (ADR 097) |
| 11 | **Self-repairing `TaskLoop`** | Timeout + repeated-call detection; `buildRecoveryPrompt()` (ADR 098) |
| 12 | **Network Security Toolkit** | 37 MCP tools — device discovery, port scanning, SSH, NetBox, NVD/CVE, PCAP |
| 13 | **Twingate zero-trust MCP proxy** | 13 tools — GraphQL tenant management + private MCP server proxy |
| 14 | **Kali Security Toolkit** | `sec_*` MCP tools + `secureyeoman security` CLI (nmap, nuclei, sqlmap, gobuster, hydra) |
| 15 | **DAG Workflow Orchestration** | 14 step types; Mustache data-flow; ReactFlow visual builder; `allowWorkflows` gate |
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
| 32 | **36 messaging integrations** | vs ~2–3 for nearest competitor; real external dispatch with fan-out, quiet hours, and per-user prefs |
| 33 | **Accessibility compliance** | eslint-plugin-jsx-a11y at warn level; focus-visible ring; 44px touch targets; axe-core smoke tests |

---

## Gaps & Opportunities

### vs OpenClaw — What We Lack
- **Community skill volume** — 13,729 total ClawHub skills (growing rapidly despite ClawHavoc cleanup) vs SecureYeoman's marketplace. The ongoing supply-chain attacks (ClawHavoc 1,184+ malicious; Snyk ToxicSkills at 36% injection rate; Cline supply chain) underscore SecureYeoman's Skill Trust Tier advantage, but volume gap remains.
- **Native mobile app** — OpenClaw added Android native (4-step onboarding, 5-tab) in v2026.2.23; SecureYeoman remains web/CLI only (roadmap Tier 3).
- **Governance uncertainty** — Creator Peter Steinberger joined OpenAI (Feb 14, 2026); project in foundation transition. This cuts both ways: less continuity risk for SecureYeoman, but also possible enterprise hesitation about OpenClaw's roadmap.

### vs PicoClaw — By Design Trade-offs
- **Ultra-low memory / sub-second startup** — 10–20 MB / < 1 s is a Go + embedded-first trade-off that conflicts with the enterprise feature set. The SecureYeoman Lite binary (SQLite, ~80 MB) partially addresses this for edge deployments. PicoClaw's v0.2.0 MCP support closes its biggest integration gap, and WhatsApp + multi-agent routing show accelerating feature velocity. Still lacks security, RBAC, and persistent memory.

### vs Ironclaw — Gaps Already Resolved

| Gap | Ironclaw approach | SecureYeoman status |
|-----|------------------|---------------------|
| LLM response caching | Hash-keyed cache (model + system prompt + messages) | ✅ `ResponseCache` — configurable TTL; off by default |
| Outbound credential proxy | HTTP proxy in sandbox network namespace | ✅ `CredentialProxy` (ADR 099) |
| Flexible embedding dimensions | V9 migration | ✅ Configurable via vector backend |
| Confidential GPU access | Decentralized GPU marketplace on NEAR AI Cloud | Not applicable (local-first; no cloud dependency) |
| Signal channel | Added v0.12.0 (Feb 26) | ✅ Already shipped |
| Dynamic tool building | WASM tool generated at runtime from description | ✅ `allowDynamicTools` policy flag |
| Jobs / scheduling | Jobs tab + scheduler (v0.13.1) | ✅ Cron scheduling + DAG workflows |
| Built-in web fetch | `web_fetch` tool (v0.13.1) | ✅ `http_*` MCP tools |
| PostgreSQL TLS | Added v0.13.1 | ✅ Already shipped |

**Where SecureYeoman leads over Ironclaw**: RBAC, SSO/OIDC/SAML, mTLS, HMAC audit chain, multi-tenancy, backup & DR, Kubernetes, air-gap / on-premises deployment, personality system with active hours and presets, multi-agent (A2A, swarms, DAG orchestration, Agnostic QA bridge), 36 integrations, workflow visual builder, React dashboard, community marketplace, ResponseGuard, OPA/CEL governance, risk assessment, multi-theme system, correlation IDs.

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
| **Open source** | Fork of OpenClaw (MIT) | AGPL-3.0 + Commercial |

**SecureYeoman positioning vs TrustClaw**: The core argument is **sovereignty**. TrustClaw trades one cloud dependency (the AI provider) for two (AI provider + TrustClaw's own sandbox and vault). Every secret still passes through a third party. SecureYeoman's credential proxy keeps key material inside the customer's perimeter at every hop. For regulated industries (HIPAA, GDPR, financial services), TrustClaw's "remote sandbox" fails the data residency test that SecureYeoman passes.

---

### Manus AI — Cloud SaaS Agent Platform (Acquired by Meta)

**Threat level: MEDIUM-HIGH — Meta acquisition transforms competitive dynamics.**

Manus AI was a fully managed cloud agent service: no installation, browser-based, connected to user accounts via OAuth. **Acquired by Meta for ~$2 billion** (reported March 2026) after hitting $100M ARR in approximately 8 months — one of the fastest enterprise SaaS ramps in history. The acquisition validates the AI agent market but fundamentally changes Manus's competitive posture: it will likely be absorbed into Meta's enterprise AI stack rather than continuing as an independent product.

| | Manus AI | SecureYeoman |
|---|---|---|
| **Deployment** | SaaS (Manus-hosted cloud → Meta infrastructure) | Self-hosted: binary / Docker / Kubernetes |
| **Setup time** | ~3 min (OAuth sign-in) | ~15 min (binary) to ~30 min (Kubernetes) |
| **Data residency** | Meta holds all conversation data and credentials | 100% local / sovereign |
| **RBAC** | Workspace-level sharing | 4-level RBAC + SSO/OIDC/SAML |
| **Air-gap** | ❌ Cloud-only | ✅ |
| **Enterprise auth** | Google/GitHub OAuth | Okta / Azure AD / Auth0 / SAML 2.0 |
| **Audit** | Activity log (non-cryptographic) | HMAC-SHA256 audit chain + export |
| **Price** | Subscription / consumption billing | Infrastructure cost only (open source) |
| **Compliance** | SOC 2 certification (claimed) | Technical controls for GDPR, SOC 2, HIPAA, EU AI Act |
| **Status** | **Acquired by Meta (~$2B, Mar 2026)** | Independent, dual-licensed |

**SecureYeoman positioning vs Manus AI**: The Meta acquisition reinforces SecureYeoman's sovereignty argument. Organizations wary of cloud vendor lock-in now face Manus data flowing through Meta's infrastructure. For any organization subject to GDPR, CCPA, HIPAA, or sector-specific data residency rules, "zero-setup" becomes zero-viable — now with additional concerns about Meta's data practices. SecureYeoman's sovereign architecture is the counter-argument: the same assistant capability, every byte under your control, with a Kubernetes Helm chart that enterprise platform teams can deploy and operate using existing tooling.

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
| **MCP tools** | Minimal set | 200+ tools |
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
| **MCP** | Basic client | 200+ server tools |
| **Skill marketplace** | ❌ | Community marketplace with Trust Tiers |
| **Multi-agent** | ❌ | Swarms, Teams, DAG, A2A, Federation |
| **Target user** | Researchers, educators | Enterprise security / ops teams |

**SecureYeoman positioning vs NanoBot**: NanoBot is not a direct competitive threat — it serves a different buyer entirely. The overlap risk is in the early-stage adoption funnel: a developer prototyping with NanoBot may never graduate to SecureYeoman if they perceive it as "too complex." The response is the `secureyeoman init` single-command onboarding wizard and the binary quick-start (`curl -fsSL https://secureyeoman.ai/install | bash`). The feature gap (SSO, RBAC, audit, multi-agent orchestration) becomes self-evident at enterprise pilot stage.

---

### Devin 2.0 — AI Software Engineer (Cognition Labs)

**Threat level: MEDIUM — price collapse expands addressable market; acquisition spree signals platform ambitions.**

Devin is Cognition Labs' autonomous AI software engineer. Devin 2.0 launched in early 2026 with a dramatic price drop from **$500/month to $20/month** (Teams plan), signaling a shift from enterprise-only to mass-market adoption. Cognition also **acquired Windsurf** (formerly Codeium IDE) to integrate agentic AI directly into development environments.

| | Devin 2.0 | SecureYeoman |
|---|---|---|
| **Deployment** | SaaS (Cognition cloud) | Self-hosted: binary / Docker / Kubernetes |
| **Price** | $20/mo (Teams); Enterprise tier | Infrastructure cost only (open source) |
| **Focus** | Autonomous coding agent | General-purpose AI agent platform |
| **Data residency** | Cognition holds code + conversation data | 100% local / sovereign |
| **Air-gap** | ❌ Cloud-only | ✅ |
| **RBAC / SSO** | Teams workspace roles | Full 4-level RBAC + SSO/OIDC/SAML |
| **IDE integration** | ✅ Windsurf (acquired) + VS Code | ✅ Monaco editor (Standard + Advanced) |
| **Multi-agent** | Single-agent workflows | ✅ Swarms, Teams, DAG, A2A |
| **MCP** | Limited | ✅ 200+ tools |
| **Audit** | Activity log | HMAC-SHA256 cryptographic chain |

**SecureYeoman positioning vs Devin**: Different target markets — Devin is a coding-specific autonomous agent; SecureYeoman is a general-purpose platform. Overlap occurs when DevSecOps teams evaluate both for CI/CD automation. SecureYeoman's code execution is sandboxed and policy-gated; Devin's is cloud-hosted. The $20/mo price point makes Devin extremely accessible but creates cloud dependency. The Windsurf acquisition suggests Cognition is building toward a platform play.

---

### OpenHands — Open-Source AI Software Agent

**Threat level: MEDIUM — strongest OSS alternative for code-focused agent workflows.**

OpenHands (formerly OpenDevin) is an open-source autonomous AI software engineer. Latest release: **v1.4.0** (Feb 17, 2026). Kubernetes-native deployment model with sandboxed execution environments.

| | OpenHands | SecureYeoman |
|---|---|---|
| **Deployment** | Kubernetes-native; Docker; local | Self-hosted: binary / Docker / Kubernetes |
| **Language** | Python | TypeScript |
| **Focus** | Autonomous software engineering | General-purpose AI agent platform |
| **Sandboxing** | Docker-based isolation | Landlock / seccomp / WASM / gVisor |
| **RBAC / SSO** | Basic workspace auth | Full 4-level RBAC + SSO/OIDC/SAML |
| **Multi-agent** | Task delegation | ✅ Swarms, Teams, DAG, A2A |
| **MCP** | Limited integration | ✅ 200+ tools |
| **Audit** | Structured logs | HMAC-SHA256 cryptographic chain |
| **Enterprise features** | Minimal | Full stack (multi-tenancy, Vault, K8s Helm, backup & DR) |
| **Open source** | ✅ MIT | ✅ AGPL-3.0 + Commercial |

**SecureYeoman positioning vs OpenHands**: OpenHands is code-focused; SecureYeoman is platform-focused. OpenHands competes with Devin on coding autonomy; SecureYeoman competes on governed enterprise automation across all domains. For teams that want a self-hosted coding agent, OpenHands is strong. For teams that need security, compliance, multi-agent orchestration, and 36 platform integrations alongside code automation — SecureYeoman is the only option.

---

### OpenAI Frontier — Enterprise Agent Platform

**Threat level: HIGH — OpenAI's enterprise brand and distribution create serious top-of-funnel competition.**

OpenAI Frontier launched **February 5, 2026** as OpenAI's enterprise-focused autonomous agent platform. Positioned for large organizations with existing OpenAI API relationships.

| | OpenAI Frontier | SecureYeoman |
|---|---|---|
| **Deployment** | SaaS (OpenAI-hosted) | Self-hosted: binary / Docker / Kubernetes |
| **AI providers** | OpenAI models only | 12 providers (Anthropic, OpenAI, Gemini, Ollama, etc.) |
| **Data residency** | OpenAI holds data (Enterprise tier: data not used for training) | 100% local / sovereign |
| **Air-gap** | ❌ Cloud-only | ✅ |
| **RBAC / SSO** | Enterprise SSO via OpenAI org | Full 4-level RBAC + SSO/OIDC/SAML |
| **Multi-agent** | Agent orchestration | ✅ Swarms, Teams, DAG, A2A |
| **Audit** | Enterprise compliance features | HMAC-SHA256 cryptographic chain + export |
| **Price** | Enterprise subscription (premium) | Infrastructure cost only (open source) |
| **Open source** | ❌ Proprietary | ✅ AGPL-3.0 + Commercial |

**SecureYeoman positioning vs OpenAI Frontier**: OpenAI's enterprise brand is its primary weapon — CISOs and CTOs already have OpenAI contracts. The counter-arguments are: (1) vendor lock-in to a single model provider vs SecureYeoman's 12-provider flexibility, (2) data sovereignty — OpenAI holds the data even in Enterprise tier, (3) cost — open-source vs premium subscription, (4) air-gap capability for regulated industries. OpenAI Frontier is the most dangerous competitor for net-new enterprise deals, but cannot compete on sovereignty, model flexibility, or self-hosted compliance.

---

### Expanded Competitive Summary

| | SecureYeoman | TrustClaw | Manus AI | Devin 2.0 | OpenHands | OpenAI Frontier | ZeroClaw | NanoBot |
|---|:---:|:---:|:---:|:---:|:---:|:---:|:---:|:---:|
| **Self-hosted / air-gap** | ✅ | ❌ cloud sandbox | ❌ SaaS (Meta) | ❌ SaaS | ✅ | ❌ SaaS | ✅ | ✅ |
| **Data sovereignty** | ✅ Full | ⚠️ Keys at TrustClaw | ❌ Meta holds data | ❌ Cognition holds data | ✅ | ❌ OpenAI holds data | ✅ | ✅ |
| **RBAC + SSO/SAML** | ✅ | ❌ | Basic | Teams workspace | Basic | Enterprise SSO | ❌ | ❌ |
| **Cryptographic audit** | ✅ HMAC-SHA256 | ❌ JSON log | ❌ | ❌ | ❌ | Enterprise features | ❌ | ❌ |
| **Multi-tenancy** | ✅ RLS | ❌ | Per-account | Per-workspace | ❌ | Enterprise tier | ❌ | ❌ |
| **Vault / SecretsManager** | ✅ env/keyring/Vault/OpenBao | Cloud vault | OAuth tokens | ❌ | ❌ | Enterprise vault | ❌ | ❌ |
| **Multi-agent (swarms/teams)** | ✅ | ❌ | ❌ | Single-agent | Task delegation | Agent orchestration | ❌ | ❌ |
| **200+ MCP tools** | ✅ | Limited | Limited | Limited | Limited | Limited | Minimal | Basic |
| **Kubernetes / Helm** | ✅ | ❌ | N/A | N/A | ✅ | N/A | ❌ | ❌ |
| **Open source** | ✅ AGPL-3.0 + Commercial | ✅ MIT fork | ❌ Proprietary (Meta) | ❌ Proprietary | ✅ MIT | ❌ Proprietary | ✅ | ✅ |
| **Binary size** | ~80 MB | Unknown | N/A | N/A | N/A | N/A | ~12 MB | N/A |
| **Primary threat** | — | Data residency framing | Meta acquisition + zero-setup | $20/mo price + Windsurf | OSS code-agent mindshare | Enterprise brand + distribution | Edge/IoT hardware | Research mindshare |

---

## Competitive Positioning

| Segment | Position | Rationale |
|---------|----------|-----------|
| **Enterprise self-hosted AI** | **Leader** | Only option with RBAC, SSO/OIDC/SAML, multi-tenancy, HMAC audit, Vault, K8s Helm, Twingate, network security toolkit, OPA/CEL governance, backup & DR, and correlation ID observability |
| **Developer automation** | Challenger | OpenClaw leads on community volume (despite supply chain incidents); Devin 2.0 at $20/mo captures individual developers; OpenHands is the strongest OSS coding agent. SecureYeoman leads on security posture, enterprise auth, and observability |
| **Privacy-first / high-security** | **Co-leader** | Ironclaw wins on Rust memory safety + TEE + confidential GPU; SecureYeoman wins on feature breadth, enterprise auth, multi-agent orchestration, and full dashboard. TrustClaw claims security but outsources key management to its own cloud |
| **Embedded / IoT AI** | Challenger | PicoClaw (now with MCP) and ZeroClaw lead on hardware constraints; SecureYeoman Lite binary available for edge deployments |
| **Managed SaaS** | Not positioned | Self-hosted only by design; OpenAI Frontier targets enterprise SaaS; Manus AI (acquired by Meta) shifts to Meta's platform; Ironclaw offers cloud-hosted TEE |
| **Research / education** | Not positioned | NanoBot serves this segment; SecureYeoman is overkill for single-researcher use |

**Key differentiator**: SecureYeoman is the only enterprise-grade, self-hosted AI agent platform that combines full RBAC/SSO/SAML, multi-tenancy, cryptographic audit chain, Vault/OpenBao secrets management, zero-trust network access (Twingate), a network security toolkit (37 MCP tools + Kali), ResponseGuard + OPA/CEL governance, vector memory with hybrid FTS+RRF and per-personality scoping, DAG workflow orchestration with a visual builder, AI training pipeline (distillation + LoRA + LLM-as-Judge), ML lifecycle platform (A/B testing, experiment registry, conversation branching), backup & DR, audit log export, correlation ID observability, and Kubernetes production readiness — all in a single ~80 MB binary deployable fully air-gapped, with 13,097 tests across core, dashboard, and MCP packages.

**The sovereignty argument**: Every new competitor — TrustClaw, Manus AI (now Meta), OpenAI Frontier, Devin — that claims "security" or "enterprise-ready" while routing data through its own cloud reinforces SecureYeoman's core position. The answer to "but Manus AI is easier to set up" is `curl -fsSL https://secureyeoman.ai/install | bash && secureyeoman init`. The answer to "but OpenAI Frontier has enterprise brand" is model-provider lock-in, data sovereignty, and the fact that SecureYeoman supports 12 providers including fully local models. The answer to "but TrustClaw is more secure" is the cryptographic audit chain, OPA governance, and the fact that SecureYeoman's Outbound Credential Proxy means neither TrustClaw nor any other third party ever sees your key material.

---

*Updated: 2026-03-02 — SecureYeoman: 13,097 tests (core 10,231 + dashboard 981 + MCP 660 + DB 1,225), 153 ADRs, 200+ MCP tools, 35 CLI commands, AGPL-3.0 + Commercial; v2026.3.2 adds Adaptive Learning Pipeline (Phase 92), Marketplace Shareables (Phase 89), Dual Licensing, Editor Unification, Soul Improvements, Teams (dynamic auto-manager, Phase 83), Workflow OR-trigger, strict schema enforcement, `crew` CLI, Knowledge Base & RAG (Phase 82), Code Audit Hardening (Phase 103), Job Completion Notifications (Phase 104), Security Prompt Templates (Phase 107-B), Departmental Risk Register (Phase 111). OpenClaw: ~234K stars (1.36M npm/week), latest v2026.3.1; creator joined OpenAI (Feb 14); 135,000+ exposed instances; ClawHub 13,729 skills; ClawHavoc 1,184+ malicious; Cline supply chain attack; foundation transition. Agent Zero: v0.9.8.2, ~15.7K stars; default model now claude-sonnet-4-6. PicoClaw: v0.2.0 (Feb 28), ~21.7K stars; MCP merged; WhatsApp added; multi-agent routing (experimental). Ironclaw: v0.13.1 (Mar 2), ~4K stars; web_fetch tool; Jobs tab; PostgreSQL TLS; Signal attachments. Manus AI: acquired by Meta (~$2B); $100M ARR in 8 months. Devin 2.0: $20/mo (down from $500); acquired Windsurf. OpenHands: v1.4.0, K8s-native, strongest OSS code agent. OpenAI Frontier: enterprise agent platform (Feb 5, 2026). TrustClaw: OpenClaw fork; cloud sandbox + vault. ZeroClaw: Rust edge agent, ~12 MB. NanoBot: minimal Python research agent.*
