# Competitive Analysis

> Last updated: **2026-03-09** | SecureYeoman **v2026.3.9**

---

## Executive Summary

SecureYeoman is the only enterprise-grade, self-hosted AI agent platform that ships RBAC, SSO/SAML, multi-tenancy, cryptographic audit trails, Vault integration, OPA/CEL governance, DLP, and Kubernetes Helm in a single ~123 MB binary deployable fully air-gapped.

No competitor matches this combination. The closest — Ironclaw — leads on Rust memory safety and TEE hardware attestation but requires cloud infrastructure (no air-gap) and lacks RBAC, SSO, multi-agent orchestration, and a dashboard.

---

## Landscape

| | SecureYeoman | OpenClaw | Agent Zero | PicoClaw | Ironclaw |
|---|---|---|---|---|---|
| **Version** | 2026.3.9 | 2026.3.1 | v0.9.8.2 | v0.2.0 | v0.13.1 |
| **Stars** | — | ~234K | ~15.7K | ~21.7K | ~4K |
| **Language** | TypeScript | TypeScript | Python | Go | Rust |
| **Focus** | Enterprise self-hosted | Personal AI | Personal assistant | Embedded/edge | Privacy-first TEE |
| **RAM** | ~1 GB | ~1.5 GB | 4 GB | **10-20 MB** | Unknown |
| **Startup** | ~30 s | ~6 s | > 30 s | **< 1 s** | Unknown |

### New entrants (2026)

| | TrustClaw | Manus AI (Meta) | OpenAI Frontier | Devin 2.0 | OpenHands | ZeroClaw | NanoBot |
|---|---|---|---|---|---|---|---|
| **Type** | OpenClaw fork | SaaS (acquired ~$2B) | Enterprise SaaS | AI coding agent | OSS code agent | Rust edge agent | Research agent |
| **Threat** | High | Medium-High | High | Medium | Medium | Low | Low |
| **Self-hosted** | No (cloud sandbox) | No | No | No | Yes | Yes | Yes |

---

## Competitors

**OpenClaw** (~234K stars) — Most popular agent by adoption, but severe ongoing security issues: 9+ CVEs in 2026 including an RCE (CVSS 8.8), 1,184+ malicious skills in ClawHub (ClawHavoc), 135,000+ publicly exposed instances. Gartner rated it "unacceptable cybersecurity risk." Creator joined OpenAI (Feb 2026); project transitioning to foundation. $300-750/month typical API cost. Unrestricted host access by default. Android native app added.

**Agent Zero** (~15.7K stars) — Python framework, major v0.9.8 release with new Skills framework, WebSocket sync, MCP client + server, UI redesign. No enterprise features (RBAC, SSO, encryption). Docker, 4 GB minimum.

**PicoClaw** (~21.7K stars) — Go binary, 10-20 MB, < 1 s startup on $10 hardware. MCP client in v0.2.0. Growing fast but lacks security, RBAC, persistent memory.

**Ironclaw** (~4K stars) — Rust, NEAR AI. TEE + WASM execution. AES-256-GCM encryption. Cannot self-host air-gapped (requires NEAR AI Cloud). No RBAC, SSO, K8s, or dashboard.

**TrustClaw** — Hardened OpenClaw fork with cloud sandbox and managed vault. Trades one cloud dependency for two. Keys still pass through a third party — fails data residency for regulated industries.

**Manus AI** — Was a $100M ARR cloud agent; acquired by Meta (~$2B, March 2026). Data now flows through Meta infrastructure. Zero-viable for GDPR/HIPAA organizations.

**OpenAI Frontier** — Enterprise agent platform (Feb 2026). OpenAI models only, premium subscription, cloud-hosted. Strong brand but vendor lock-in and no data sovereignty.

**Devin 2.0** — AI coding agent, price dropped to $20/mo. Acquired Windsurf IDE. Cloud-only, single-agent, code-specific.

**OpenHands** — OSS code agent (MIT), Kubernetes-native. Strongest OSS alternative for coding workflows. Minimal enterprise features.

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
| | Cryptographic audit (HMAC-SHA256) | Y | - | - | - | - |
| | Credential redaction (20 patterns) | Y | - | - | - | Y |
| | Output injection scanner | Y | - | - | - | - |
| | OPA + CEL governance | Y | - | - | - | - |
| | Sandboxing (Landlock/seccomp/WASM/gVisor) | Y | P | P | P | Y |
| | DLP (classification, egress, watermarking) | Y | - | - | - | - |
| | Supply chain (SBOM, SLSA L3, cosign) | Y | - | - | - | - |
| | Multi-tenancy (PostgreSQL RLS) | Y | - | - | - | - |
| | Chaos engineering | Y | - | - | - | - |
| **Knowledge** | Vector memory (FAISS/Qdrant/ChromaDB) | Y | - | Y | - | Y |
| | Hybrid FTS + vector (RRF) | Y | - | - | - | Y |
| | Per-personality memory scoping | Y | - | - | - | - |
| | Proactive context compaction | Y | Y | - | - | Y |
| **Orchestration** | MCP tools | 400+ | P | P | P | P |
| | DAG workflow engine (19 step types) | Y | - | - | - | - |
| | Visual workflow builder (ReactFlow) | Y | - | - | - | - |
| | Agent swarms (3 strategies) | Y | - | Y | - | - |
| | A2A protocol | Y | - | Y | - | - |
| | Agent evaluation harness | Y | - | - | - | - |
| | Browser automation (Playwright) | Y | Y | Y | - | - |
| | Network security toolkit (38 tools) | Y | - | - | - | - |
| **Integrations** | Platform count | 32 | 23+ | 2 | 11+ | 4 |
| | OAuth2 auto-refresh | Y | - | - | - | - |
| | Per-user notification prefs | Y | - | - | - | - |
| **Dashboard** | Web dashboard | Y | Y | Y | - | Y |
| | Terminal UI (TUI) | Y | - | - | - | Y |
| | CLI commands | 56 | Y | Y | Y | REPL |
| | Monaco code editor | Y | - | - | - | - |
| | Inline AI completion | Y | - | - | - | - |
| | Mission Control | Y | - | - | - | - |
| | 42 themes | Y | - | - | - | - |
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
| | ADRs | 32 | - | - | - | - |

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

## Known Gaps

| Gap | Leader | SY status |
|-----|--------|-----------|
| Community skill volume | OpenClaw (13,729 ClawHub) | 87 community + 24 builtin (Trust Tier advantage offsets volume gap) |
| Native mobile app | OpenClaw (Android) | Web/CLI only (roadmap Tier 3) |
| Ultra-low resource / edge | PicoClaw (10-20 MB, < 1 s) | Lite binary 123 MB — design trade-off for enterprise features |
| TEE hardware attestation | Ironclaw (NEAR AI Cloud) | Not applicable (local-first, no cloud dependency) |
| Startup time | PicoClaw (< 1 s) | ~30 s — conditional module loading helps |

---

## Market Positioning

| Segment | Position | Rationale |
|---------|----------|-----------|
| **Enterprise self-hosted** | **Leader** | Only platform combining full security + governance + orchestration + deployment stack |
| **Developer automation** | Challenger | OpenClaw leads on community; Devin at $20/mo captures individuals; SY leads on security posture |
| **Privacy-first** | **Co-leader** | Ironclaw: Rust + TEE. SY: feature breadth + enterprise auth + air-gap + dashboard |
| **Embedded / IoT** | Challenger | PicoClaw + ZeroClaw lead on constraints; SY Lite available |
| **Managed SaaS** | Not positioned | Self-hosted by design |

**The sovereignty argument**: Every competitor claiming "enterprise-ready" while routing data through its own cloud reinforces SecureYeoman's position. The answer to "easier setup" is `curl -fsSL https://secureyeoman.ai/install | bash`. The answer to "bigger brand" is vendor lock-in and 13 providers including fully local models. The answer to "more secure" is: your key material never leaves your perimeter.

---

*Updated: 2026-03-09*
