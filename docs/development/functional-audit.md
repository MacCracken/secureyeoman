# Competitive Analysis

> Last updated: **2026-03-11** | SecureYeoman **v2026.3.10**

---

## Executive Summary

SecureYeoman is the only enterprise-grade, self-hosted AI agent platform that ships RBAC, SSO/SAML, multi-tenancy, cryptographic audit trails, Vault integration, OPA/CEL governance, DLP, and Kubernetes Helm in a single ~123 MB binary deployable fully air-gapped.

No competitor matches this combination. The closest — Ironclaw — leads on Rust memory safety and TEE hardware attestation but requires NEAR AI Cloud infrastructure (no air-gap) and lacks RBAC, SSO, multi-agent orchestration, and a dashboard. OpenAI Frontier offers enterprise governance but is cloud-hosted with limited availability and no data sovereignty.

---

## Landscape

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| **Version** | 2026.3.10 | 2026.3.8 | v0.9.8.2 | v0.2.0 | v0.13.1 |
| **Stars** | — | ~250K | ~15.7K | ~21.7K | ~4K |
| **Language** | TypeScript | TypeScript | Python | Go | Rust |
| **Focus** | Enterprise self-hosted | Personal AI | Personal assistant | Embedded/edge | Privacy-first TEE |
| **RAM** | ~1 GB | ~1.5 GB | 4 GB | **10-20 MB** | Unknown |
| **Startup** | ~30 s | ~6 s | > 30 s | **< 1 s** | Unknown |

### New entrants (2026)

| | TrustClaw | Manus AI (Meta) | OpenAI Frontier | Devin 2.0 | OpenHands | ZeroClaw | NanoBot |
|---|---|---|---|---|---|---|---|
| **Type** | OpenClaw fork | SaaS (acquired ~$2B) | Enterprise SaaS | AI coding agent | OSS code agent | Rust edge agent | Research agent |
| **Threat** | High | Medium-High | High | Medium | Medium | Low | Low |
| **Self-hosted** | No (cloud sandbox) | No | Partial (on-prem option) | No | Yes | Yes | Yes |

---

## Competitors

**OpenClaw** (~250K stars) — Most popular agent by adoption. Surpassed React on GitHub in March 2026 to become the most-starred software project. Severe ongoing security crisis: 9+ CVEs including RCE (CVE-2026-25253, CVSS 8.8), ClawJacked WebSocket hijack, command injection, SSRF, authentication bypass, and path traversal. 1,184+ malicious skills in ClawHub (ClawHavoc), 135,000+ publicly exposed instances. Gartner rated it "unacceptable cybersecurity risk." Creator joined OpenAI (Feb 2026); project transitioning to foundation. v2026.3.8 adds ACP provenance, backup tool, and 12+ security patches. $300-750/month typical API cost. Unrestricted host access by default. Android native app added.

**Agent Zero** (~15.7K stars) — Python framework, major v0.9.8 release with new Skills framework (replacing Instruments), WebSocket sync, MCP client + server, complete UI redesign with process groups, message queue, and Git projects. Voice interaction added: Kokoro TTS + Whisper STT. Enhanced attachment system. Four new LLM providers. Subordinate agent extensibility with dedicated prompts and tools. No enterprise features (RBAC, SSO, encryption). Docker, 4 GB minimum.

**PicoClaw** (~21.7K stars) — Go binary, 10-20 MB, < 1 s startup on $10 hardware. MCP client in v0.2.0. Added Telegram, Discord, QQ, DingTalk, LINE, WeCom, and Slack integrations. New agent memory system, cron scheduler, ClawdChat social network, and security sandbox. Growing fast but still early development — no RBAC, persistent memory, or production security guarantees.

**Ironclaw** (~4K stars) — Rust, NEAR AI. Launched at NEARCON 2026 alongside Confidential GPU Marketplace. TEE + WASM execution. AES-256-GCM encryption. PostgreSQL storage with comprehensive audit log. Free Starter tier (1 hosted agent) with paid tiers for scaling. Cannot self-host air-gapped (requires NEAR AI Cloud). No RBAC, SSO, K8s, multi-agent orchestration, or dashboard.

**TrustClaw** — Cloud-native OpenClaw fork with 1,000+ tools, OAuth authentication, and sandboxed cloud execution. All execution in cloud — nothing runs locally. Trades one cloud dependency for two. Keys still pass through a third party — fails data residency for regulated industries. Limited infrastructure visibility problematic for compliance demonstration.

**Manus AI** — Was a $100M ARR cloud agent; acquired by Meta (~$2B, Dec 2025). China regulatory probe launched (export control compliance review). Customer flight reported post-acquisition. Data now flows through Meta infrastructure. Zero-viable for GDPR/HIPAA organizations.

**OpenAI Frontier** — Enterprise agent platform (Feb 2026). Vendor-agnostic: supports OpenAI, Google, Microsoft, and Anthropic agents. On-premises, enterprise cloud, and OpenAI-hosted runtime options. AWS distribution deal ($110B round, Amazon exclusive third-party cloud distributor). Business context integration (CRM, data warehouses, ticketing). Enterprise IAM with scoped agent identities. Early customers: HP, Oracle, State Farm, Uber, Intuit, Thermo Fisher. Currently limited availability.

**Devin 2.0** — AI coding agent, price dropped from $500 to $20/mo ($2.00-2.25 per Agent Compute Unit). Acquired Windsurf IDE. Interactive Planning for codebase-aware task scoping. Devin Wiki (auto-generated architecture docs). Devin Review (intelligent PR analysis with change grouping and bug detection). 83% more tasks per ACU vs v1. Cloud-only, single-agent, code-specific.

**OpenHands** — OSS code agent (MIT), v1.4.0 (Feb 2026). Raised $18.8M. New Planning Agent with Plan Mode / Code Mode switching. Claims 87% of bug tickets resolved same day. SDK for composable agents (local or 1000s in cloud). CLI powered by Claude/GPT/any LLM. Kubernetes-native. Strongest OSS alternative for coding workflows. Minimal enterprise features.

**ZeroClaw** — Rust-based edge AI runtime. 3.4 MB binary, <5 MB RAM, sub-10ms cold starts. Runs on $10 Raspberry Pi. Swappable provider traits (OpenAI, Anthropic, Ollama, OpenRouter). Secure by design with pairing, strict sandboxing, explicit allowlists, and workspace scoping. 98% cheaper to operate than standard runtimes. Early stage, minimal features.

---

## Feature Matrix

**Y** = shipped, **P** = partial, **-** = absent

| Category | Feature | SY | OC | AZ | PC | IC |
|----------|---------|:--:|:--:|:--:|:--:|:--:|
| **Security** | RBAC (4 levels) | Y | - | - | - | - |
| | SSO/OIDC + SAML 2.0 | Y | - | - | - | - |
| | Encryption at rest (AES-256-GCM) | Y | - | - | - | Y |
| | Secrets management (Vault/OpenBao) | Y | - | - | - | P |
| | TLS lifecycle + mTLS | Y | - | - | - | - |
| | Cryptographic audit (HMAC-SHA256) | Y | - | - | - | Y |
| | Credential redaction (20 patterns) | Y | - | - | - | Y |
| | Output injection scanner | Y | - | - | - | - |
| | OPA + CEL governance | Y | - | - | - | - |
| | Sandboxing (Landlock/seccomp/V8 isolate/WASM/gVisor) | Y | P | P | P | Y |
| | DLP (classification, egress, watermarking) | Y | - | - | - | - |
| | Supply chain (SBOM, SLSA L3, cosign) | Y | - | - | - | - |
| | Multi-tenancy (PostgreSQL RLS) | Y | - | - | - | - |
| | Chaos engineering | Y | - | - | - | - |
| **Knowledge** | Vector memory (FAISS/Qdrant/ChromaDB) | Y | - | Y | - | Y |
| | Hybrid FTS + vector (RRF) | Y | - | - | - | Y |
| | Per-personality memory scoping | Y | - | - | - | - |
| | Proactive context compaction | Y | Y | - | - | Y |
| **Orchestration** | MCP tools | 462 | P | P | P | P |
| | DAG workflow engine (19 step types) | Y | - | - | - | - |
| | Visual workflow builder (ReactFlow) | Y | - | - | - | - |
| | Agent swarms (3 strategies) | Y | - | Y | - | - |
| | A2A protocol | Y | - | Y | - | - |
| | Agent evaluation harness | Y | - | - | - | - |
| | Browser automation (Playwright) | Y | Y | Y | - | - |
| | Network security toolkit (38 tools) | Y | - | - | - | - |
| **Integrations** | Platform count | 38 | 23+ | 2 | 11+ | 4 |
| | OAuth2 auto-refresh | Y | - | - | - | - |
| | Per-user notification prefs | Y | - | - | - | - |
| **Dashboard** | Web dashboard | Y | Y | Y | - | Y |
| | Terminal UI (TUI) | Y | - | - | - | Y |
| | CLI commands | 56 | Y | Y | Y | REPL |
| | Monaco code editor | Y | - | - | - | - |
| | Inline AI completion | Y | - | - | - | - |
| | Mission Control | Y | - | - | - | - |
| | 45 themes | Y | - | - | - | - |
| | CRDT collaborative editing | Y | - | - | - | - |
| | Mobile app | - | Y | - | - | - |
| **Enterprise** | Kubernetes / Helm | Y | P | - | - | - |
| | Prometheus / Grafana | Y | - | - | - | - |
| | Multi-region HA | Y | - | - | - | - |
| | Backup & DR API | Y | - | - | - | - |
| | Single binary | Y | - | - | Y | Y |
| | Docker (GHCR, multi-arch, cosign) | Y | Y | Y | - | Y |
| | Air-gap / offline | Y | Y | Y | Y | - |
| | Dual DB (PostgreSQL + SQLite) | Y | - | - | - | Y |
| **Quality** | Tests | ~20,500 | Limited | Minimal | Minimal | Unknown |
| | Coverage | ~89% | - | - | - | - |
| | ADRs | 37 | - | - | - | - |

---

## Where SecureYeoman Leads

Capabilities no other framework in this competitive set offers:

- **Governance stack** — RBAC + SSO/OIDC/SAML + multi-tenancy + OPA/CEL + DLP + cryptographic audit + compliance reporting
- **DAG workflow orchestration** — 19 step types with visual ReactFlow builder and human approval gates
- **Agent evaluation harness** — structured scenarios with expected/forbidden tool calls and multi-metric scoring
- **Network security toolkit** — 38 tools (device discovery, port scan, SSH, NetBox, NVD/CVE, PCAP) + Kali toolkit
- **Twingate zero-trust MCP proxy** — 13 tools for private network access without VPN
- **Community skills ecosystem** — 87 community skills, 7 workflows, security templates, personality presets, all with Trust Tier enforcement
- **Mission Control dashboard** — multi-panel command center with KPI bar, topology, live feeds, resource monitoring
- **Training pipeline** — distillation + LoRA fine-tuning + pre-training from scratch + LLM-as-Judge + federated learning
- **Voice & Speech platform** — 14 TTS providers, 10 STT providers, voice profiles, streaming, Orpheus/Piper/faster-whisper

## Known Gaps

### Competitive Gaps

| Gap | Leader | SY status |
|-----|--------|-----------|
| Community skill volume | OpenClaw (13,729 ClawHub) | 87 community + 24 builtin (Trust Tier advantage offsets volume gap) |
| Native mobile app | OpenClaw (Android) | Web/CLI only; Capacitor scaffold exists (roadmap Tier 3); PWA planned but not priority |
| Ultra-low resource / edge | PicoClaw (10-20 MB, < 1 s) / ZeroClaw (3.4 MB, sub-10ms) | Lite binary 123 MB — design trade-off for enterprise features; planned slim-IoT/edge variant targets sub-10 s |
| TEE hardware attestation | Ironclaw (NEAR AI Cloud) | Not applicable (local-first, no cloud dependency) |
| Startup time | PicoClaw (< 1 s) / ZeroClaw (sub-10ms) | ~30 s — conditional module loading helps; further reduction not feasible without slim-IoT/edge variant |
| Enterprise brand / distribution | OpenAI Frontier (HP, Oracle, Uber) | Self-hosted niche; no cloud sales force |

### Consumer Gaps

| Gap | Impact | Status |
|-----|--------|--------|
| No one-click cloud deploy templates | High barrier for non-DevOps users; every consumer competitor offers zero-setup | Planned — Railway, Render, DigitalOcean templates |
| No conversation share/export UX | Users cannot share chats or download history from dashboard; export exists only via training API (`POST /api/v1/training/export`) | Planned — dashboard share link + download-as-markdown/JSON |
| No web push notifications | Notification system uses WebSocket + external fan-out (Slack/email); browser must be open to receive | Low priority — WebSocket covers primary use case |

### Enterprise Gaps

| Gap | Impact | Status |
|-----|--------|--------|
| No SCIM provisioning | Enterprise IT expects automated user lifecycle from Okta/Azure AD/Google Workspace alongside SSO | Planned |
| No per-tenant rate limiting / token budgets | Rate limiter is global rules only (per-user/IP); no tenant-specific quotas or LLM spend caps per team | Planned |
| No break-glass / emergency access | No documented recovery when admin is locked out; emergency stop exists for personalities but not for platform access | Planned — break-glass with audit trail and accountability |
| No access review / entitlement reporting | RBAC audit logs exist but no "who has access to what" report, no periodic review workflow, no SOC 2/SOX attestation | Planned |
| No formal compliance audit scope docs | Compliance mapping code covers 5 frameworks (NIST, SOC 2, ISO 27001, HIPAA, EU AI Act) but no published audit scope document or Statement of Applicability | Planned |
| No public status page | SLO monitoring and health endpoints exist internally; no customer-facing uptime/status dashboard | Low priority |
| No per-tenant data residency enforcement | Multi-region HA with `allowContentReplication` flag exists; no per-tenant region locking for GDPR | Future consideration |

### Feature Matrix Coverage Gap

The feature matrix (above) covers 5 primary competitors. The 7 new 2026 entrants (TrustClaw, Manus/Meta, OpenAI Frontier, Devin 2.0, OpenHands, ZeroClaw, NanoBot) are described in prose but absent from the comparison table. Adding columns would make the matrix unwieldy; a separate "new entrants" mini-matrix may be warranted as these products mature.

### Pricing & Cost Advantage

SecureYeoman is self-hosted, BYOK (bring-your-own-keys), with $0 infrastructure cost for fully local models (Ollama, LM Studio, LocalAI). Users only pay for the license — not for platform hosting, API markup, or per-seat cloud fees.

**Planned pricing:**

| Tier | Price | Target | Includes |
|------|-------|--------|----------|
| **Community** | Free | Hobbyists, evaluators | Core platform, 13+ LLM providers, CLI, dashboard, community skills |
| **Pro** | $20/yr | Developers, power users | + Advanced brain, provider management, computer use, custom integrations, prompt engineering, batch inference |
| **Solopreneur** | $100/yr | Solo operators, consultants, small teams | All enterprise features for individuals — SSO, DLP, governance, training pipeline, federated learning, full orchestration |
| **Enterprise** | $1,000/yr | Organizations, regulated industries | All features + multi-tenancy, dedicated support channels, SLA guarantees, compliance assistance |
| **Support** | Additional | All paid tiers | Priority support, onboarding assistance, custom integration help — priced separately based on scope |

SY is BYOK — users bring their own API keys and run on their own infrastructure. SecureYeoman does not proxy, meter, or markup AI calls. This means near-zero marginal cost per user, enabling aggressive pricing that cloud-hosted competitors cannot match.

**Competitive comparison:**

| Platform | Monthly cost | What you get | Data sovereignty |
|----------|-------------|--------------|-----------------|
| **SecureYeoman Pro** | $20/yr ($10/yr) | Full self-hosted platform + BYOK | Complete — your infra |
| **Devin 2.0** | $20/mo ($240/yr) | Cloud coding agent only, per-ACU billing | None — Cognition cloud |
| **OpenClaw** | $300-750 (API costs) | Personal agent, no enterprise features, 9+ CVEs | Partial — keys transit host |
| **OpenAI Frontier** | Enterprise pricing (undisclosed) | Cloud/on-prem agent platform | Partial — AWS distribution |
| **Manus AI (Meta)** | Unknown | Cloud agent, Meta infrastructure | None — Meta cloud |

The Pro tier at $20/yr vs Devin's $20/mo ($480 over the same period) is a 24x price advantage — possible because SY has no AI compute costs to recoup. The Solopreneur tier is unique in the market — no competitor offers enterprise-grade governance (SSO, DLP, OPA/CEL, cryptographic audit, training pipeline) to individuals at $100/yr. This directly targets consultants and freelancers serving regulated clients who need compliance posture without enterprise contracts.

---

## Market Positioning

| Segment | Position | Rationale |
|---------|----------|-----------|
| **Enterprise self-hosted** | **Leader** | Only platform combining full security + governance + orchestration + deployment stack |
| **Developer automation** | Challenger | OpenClaw leads on community; Devin at $20/mo captures individuals; OpenHands raised $18.8M; SY leads on security posture |
| **Privacy-first** | **Co-leader** | Ironclaw: Rust + TEE. SY: feature breadth + enterprise auth + air-gap + dashboard |
| **Embedded / IoT** | Challenger | PicoClaw + ZeroClaw lead on constraints; SY Lite available |
| **Managed SaaS** | Not positioned | Self-hosted by design; Frontier + Manus/Meta own this segment |

**The sovereignty argument**: Every competitor claiming "enterprise-ready" while routing data through its own cloud reinforces SecureYeoman's position. OpenAI Frontier's AWS deal and Manus's Meta acquisition concentrate data in hyperscaler infrastructure — the opposite of sovereignty. The answer to "easier setup" is `curl -fsSL https://secureyeoman.ai/install | bash`. The answer to "bigger brand" is vendor lock-in and 13 providers including fully local models. The answer to "more secure" is: your key material never leaves your perimeter.

---

*Updated: 2026-03-11 (gap analysis validated against codebase)*
