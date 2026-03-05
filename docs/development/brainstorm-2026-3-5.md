# Brainstorm — 2026-03-05

> Archive of improvement opportunities. Open items have been moved to the [Roadmap](roadmap.md) as phased workloads. See [Changelog](../../CHANGELOG.md) for completed work.

---

## Completed

| # | Item | Delivered |
|---|------|-----------|
| 1 | Startup & Resource Optimization | [2026.3.5f] — lazy loading, cold-start CLI, connection pooling, memory profiling, binary size audit |
| 4 | Quick Wins | [2026.3.5f] — compliance report generator, cost optimizer, event subscriptions |
| — | Agent Eval Harness | Phase 135 |
| — | Data Loss Prevention | Phase 136 |
| — | Multi-Region & HA | Phase 137 |
| — | OpenAPI spec generation | `scripts/generate-openapi.ts` |

## Moved to Roadmap

| # | Item | Phase |
|---|------|-------|
| 2 | Supply Chain Security & Compliance Artifacts | Phase 138, ADR 209, [2026.3.5g] |
| 3 | OpenTelemetry & SIEM Integration | Phase 138 |
| 5 | RAG Evaluation Metrics | Phase 139 |
| 6 | Prompt Versioning & A/B Testing | Phase 141 |
| 7 | Developer Ecosystem & Community Growth | Roadmap → Future Features |
| 8 | Extensible Guardrail Pipeline | Phase 142 |

## Remaining Ideas (Lower Priority)

| Idea | Category | Effort | Impact | Notes |
|------|----------|--------|--------|-------|
| **Agent replay & debugging** | Observability | MEDIUM | HIGH | Complements eval harness (Phase 135). Record + replay execution traces. |
| **Policy-as-Code repository** | Governance | LOW | MEDIUM | Git-backed OPA/CEL bundles. PR-based policy changes. |
| **WebAuthn/FIDO2 auth** | Security | LOW | MEDIUM | Hardware key auth for admins. |
| **Agent sandboxing profiles** | Security | LOW | MEDIUM | Named sandbox configs (dev/prod/high-security). |
| **Offline-first PWA** | UX | MEDIUM | MEDIUM | ServiceWorker + IndexedDB. Closes mobile gap. |
| **Chaos engineering toolkit** | Testing | MEDIUM | MEDIUM | Fault injection for workflow resilience testing. |
| **Conversation branching visualization** | UX | LOW | LOW | Visual tree with diff view. |
| **Federated learning** | AI/ML | HIGH | HIGH (long-term) | Multi-instance model improvement. Differential privacy. Future. |

---

*Archived: 2026-03-05. Open items tracked in [Roadmap](roadmap.md).*
