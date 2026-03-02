# White Paper: Architectural Sovereignty & Agentic Governance

**Project:** SecureYeoman
**Date:** March 2026
**Subject:** Mitigating the Risks of Autonomous AI in Enterprise Environments

---

## Executive Summary

As autonomous agents move from experimental scripts to enterprise tools, they introduce three critical attack vectors: **Data Exfiltration**, **Unauthorized System Mutation**, and **Credential Exposure**. While "viral" agents prioritize autonomy at the expense of security, SecureYeoman is engineered as a **Governed AI Framework**. It provides the utility of an autonomous agent within a Zero-Trust architectural boundary — every tool call gated, every action logged, every secret kept from the model.

SecureYeoman ships today (v2026.3.2) with 12,408 tests, 151 Architecture Decision Records, and a production Kubernetes Helm chart. It runs fully air-gapped on your infrastructure: no cloud dependency, no behavioral extraction, no AI that answers to someone else.

---

## 1. The Three Pillars of SecureYeoman

### I. Execution Sovereignty — Sandboxing

Unlike agents that run directly on the host OS with inherited user permissions, SecureYeoman uses multi-layer isolation:

- **Kernel-Level Restriction** — Landlock and seccomp confine the agent to specific file paths and system calls. On macOS the equivalent `sandbox-exec` profile is applied automatically.
- **WASM / gVisor Support** — For high-risk tasks, code execution is offloaded to userspace kernels (wasmtime or gVisor), preventing container escapes. Controlled via the `sandboxWasm` / `sandboxGvisor` Security Policy toggles.
- **Skill Trust Tiers** — Community-imported skills receive a restricted tool allow-list (26-prefix) and cannot call write-capable or network-egress tools without operator promotion to a higher trust tier.
- **ToolOutputScanner** — Before any LLM response reaches the user or a downstream tool, an 18-pattern credential redaction pass replaces API keys, JWTs, and private key material with `[REDACTED:<type>]`.

### II. Hardened Policy Gating — The OPA Layer

Intent is decoupled from execution. Even if an LLM is compromised via Prompt Injection, it cannot bypass the policy layer:

- **Organizational Intent** — A machine-readable governance file declares Hard Boundaries (e.g., "The agent may never access `/etc/shadow` or call `rm -rf` outside of `/tmp`") and Soft Policies evaluated at runtime by the OPA sidecar or the built-in CEL evaluator.
- **Authorized Tool Gating** — Every tool call is validated against the active policy before execution. The `LLM-as-Judge` secondary review fires on calls that exceed a configurable autonomy threshold.
- **ResponseGuard** — A six-pattern output-side injection scanner (instruction injection, cross-turn influence, self-escalation, role confusion, base64/hex exfiltration) runs on every response before it surfaces to the user; configured per-personality as `block`, `warn`, or `disabled`.
- **Prompt Security** — Jailbreak scoring (weighted pattern match, threshold-configurable), system-prompt trigram leak detection, and an `AbuseDetector` (topic pivots, tool anomaly, blocked-retry cool-down) guard the ingress channel.

### III. Cryptographic Accountability — Audit Trails

Standard application logs are insufficient for forensic analysis of AI actions. SecureYeoman implements a tamper-evident record for every operation:

- **HMAC-SHA256 Audit Chain** — Each event record is hashed with the previous record's hash, producing a cryptographically verifiable chain. `repair()` and `createSnapshot()` self-heal detected gaps; export covers JSONL, CSV, and syslog RFC 5424.
- **Correlation IDs** — UUIDv7 per request flows through AsyncLocalStorage and appears in every audit entry, every heartbeat, and the `X-Correlation-ID` response header — enabling end-to-end trace reconstruction without a distributed tracing sidecar.
- **mTLS Everywhere** — All internal communications (agent core ↔ dashboard ↔ MCP servers) are secured via Mutual TLS. The TLS lifecycle manager auto-generates development certificates and monitors expiry.
- **SecretsManager** — Secrets are stored via pluggable backends (env / OS keyring / encrypted file / HashiCorp Vault / OpenBao). The Outbound Credential Proxy injects `Authorization` headers for known hosts so the model never sees raw key material.

---

## 2. Why Enterprise Teams Choose SecureYeoman

| Risk Category | Consumer / Open-Source Agents | SecureYeoman Implementation |
|---|---|---|
| **Credential Management** | Plaintext `.env` or hardcoded keys | Outbound Credential Proxy + SecretsManager; the model never sees raw keys |
| **Data Residency** | Cloud-based processing (SaaS) | 100% local / sovereign; compatible with Ollama, LM Studio, LocalAI, DeepSeek |
| **Identity & Access** | Single-user / no auth | SSO/OIDC (Okta, Azure AD, Auth0) + SAML 2.0 with group → role mapping; 4-level RBAC |
| **Action Validation** | "Ask for permission" prompts | Automated Policy Gating via OPA + CEL + Skill Trust Tiers |
| **Audit & Forensics** | Text log files | HMAC-SHA256 cryptographic audit chain; JSONL / CSV / syslog export; correlation IDs |
| **Multi-Tenancy** | Single-tenant by design | PostgreSQL RLS-enforced tenant isolation; tenant CRUD API; `'default'` deletion blocked |
| **Supply Chain Risk** | Unvetted plugin ecosystems | Skill Trust Tiers + ToolOutputScanner + community install pipeline with code review gate |
| **Incident Response** | Ad-hoc log review | Risk Assessment (5-domain composite score, 0–100), findings lifecycle, external feed ingestion |

---

## 3. Compliance Readiness

SecureYeoman provides the technical controls necessary to satisfy modern regulatory frameworks:

| Framework | Relevant Control | SecureYeoman Feature |
|---|---|---|
| **GDPR / CCPA** | No third-party transfer of PII | Local-first processing; no data leaves the deployment boundary |
| **SOC 2 / ISO 27001** | Access control + audit logging | RBAC, HMAC audit chain, SSO/SAML, backup & DR |
| **HIPAA** | Air-gapped deployment for PHI | Full self-hosted mode; Ollama local-model routing; no cloud dependency |
| **NIST AI RMF** | Governance & accountability | Organizational Intent policy file, OPA sidecar, LLM-as-Judge |
| **EU AI Act (High-Risk)** | Human oversight of AI decisions | L3 autonomy level with `human_approval` workflow gates; Autonomy Level field per workflow |

---

## 4. Multi-Agent Governance

As systems grow from a single agent to autonomous fleets, governance surface area expands:

- **Swarms** — Sequential, parallel, and dynamic topologies with built-in templates. Each swarm run is audited as a named delegation chain.
- **Teams** — A coordinator LLM reads member descriptions and dynamically assigns tasks per run; no pre-wired graphs required. The coordinator's reasoning is stored on the run record for post-hoc review.
- **DAG Workflow Orchestration** — 14 step types, `triggerMode: 'any'` OR-trigger, `outputSchemaMode: 'strict'` enforcement, and a visual ReactFlow builder. Autonomy levels (`L2` human-on-the-loop / `L3` human-in-the-loop with mandatory approval gate) are declared per workflow definition.
- **A2A Protocol** — Agent-to-Agent delegation with E2E encryption and mDNS/DNS-SD peer discovery. Enforced via `allowA2A` security policy toggle.
- **Sub-Agent Depth & Budget Controls** — Maximum delegation depth and token budget are enforced at the engine level, not by prompt.
- **Multi-Instance Federation** — Encrypted peer sync and federated knowledge search across deployment nodes, with personality bundle export/import.

---

## 5. Observability & Operations

Enterprise deployments require operational visibility beyond chat logs:

- **Mission Control Dashboard** — 12 customizable drag-and-drop cards (S/M/L resize): KPI bar, active tasks, security events, audit stream, cost breakdown, agent world map, topology graph, and more.
- **Agent World** — Real-time animated ASCII (CLI) and React (dashboard) view of all active agents, sub-agents, and their cognitive state.
- **API Gateway Mode** — Expose personalities as API endpoints with per-key RPM/TPD rate limits and p50/p95 latency analytics.
- **Prometheus / Grafana** — Metrics endpoint ready; Kubernetes Helm chart includes HPA, PDBs, and NetworkPolicies.
- **Backup & DR** — `pg_dump`/`pg_restore` via 6 REST endpoints; download + restore with confirm guard; scheduling examples for cron-based automation.
- **Rate Limiting** — Sliding-window, per-user/per-IP/global buckets backed by Redis for multi-instance deployments; `Retry-After` headers on all rate-limited responses.

---

## Conclusion

The choice is no longer between AI Productivity and Corporate Security. SecureYeoman offers a third path: **Governed Autonomy**.

By treating the AI as a high-privilege user that requires continuous monitoring and strict technical boundaries, we enable the enterprise to harness the power of autonomous agents without sacrificing the integrity of the network, the privacy of sensitive data, or the auditability of AI-driven decisions.

SecureYeoman is the only enterprise-grade, fully self-hosted AI agent platform that ships today with:

- Full RBAC + SSO/OIDC + SAML 2.0 + multi-tenancy
- Cryptographic audit chain + correlation IDs
- SecretsManager with Vault/OpenBao + Outbound Credential Proxy
- OPA + CEL governance + LLM-as-Judge
- ResponseGuard + ToolOutputScanner + Prompt Security
- DAG workflow orchestration with visual builder + human approval gates
- 31 messaging integrations + 180+ MCP tools
- Single ~80 MB binary, fully air-gapped, Kubernetes-ready

All in a single deployable binary. A yeoman owns their land. So should you.

---

*SecureYeoman v2026.3.2 — 12,408 tests · 151 ADRs · AGPL-3.0 + Commercial License*
*security@secureyeoman.ai · https://github.com/MacCracken/secureyeoman*
