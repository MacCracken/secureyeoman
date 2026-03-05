# Brainstorm — 2026-03-05

> Improvement opportunities beyond the current roadmap. Re-ranked after completing Phases 135 (Agent Eval), 136 (DLP), and 137 (Multi-Region HA). See [Changelog](../../CHANGELOG.md) for completed work.

---

## Priority Ranking

| # | Item | ROI | Effort | Status |
|---|------|-----|--------|--------|
| 1 | Startup & Resource Optimization | **CRITICAL** | MEDIUM | **Near-complete** — binary size audit remains |
| 2 | Supply Chain Security & Compliance Artifacts | HIGH | LOW | Open |
| 3 | OpenTelemetry & SIEM Integration | HIGH | MEDIUM | Open — OTel basic tracing exists |
| 5 | RAG Evaluation Metrics | HIGH | MEDIUM | Open — overlaps Phase 125-E |
| 6 | Prompt Versioning & A/B Testing | MEDIUM | MEDIUM | Open — personality versioning (Phase 114) exists |
| 7 | Developer Ecosystem & Community Growth | MEDIUM | HIGH | Open — moved to roadmap Future Features |
| 8 | Extensible Guardrail Pipeline | MEDIUM | MEDIUM | Open — DLP + ContentGuardrail overlap |

### Completed (moved to Changelog)
- ~~Agent Eval Harness~~ → Phase 135
- ~~Data Loss Prevention~~ → Phase 136
- ~~Multi-Region & HA~~ → Phase 137
- ~~OpenAPI spec generation~~ → `scripts/generate-openapi.ts`
- ~~Compliance Audit Mode~~ → [2026.3.5f] compliance report generator
- ~~Model Cost Optimizer~~ → [2026.3.5f] enhanced cost-optimizer.ts
- ~~Startup lazy loading~~ → [2026.3.5f] TrainingModule/AnalyticsModule conditional, 20 dynamic route imports
- ~~Webhook/Event System~~ → [2026.3.5f] event subscription + dispatcher

---

## 1. Startup & Resource Optimization

**ROI**: CRITICAL — The most visible competitive weakness. 30s startup and ~1GB RAM vs PicoClaw's <1s / 10-20MB. Every user's first impression. Blocks CLI adoption.

**What's already done**: 31 integration adapters lazy-loaded (Optimization Audit 2). DelegationModule and BrainModule use dynamic imports. Optional managers (Extensions, Execution, A2A, Proactive, Multimodal, Browser) are config-gated with `await import()`. CLI router uses `registerLazy()`. ~~TrainingModule conditional~~ (done — `config.training.enabled`). ~~AnalyticsModule conditional~~ (done — `config.analytics.enabled`). ~~20 lazy gateway route imports~~ (done — all tryRegister routes use dynamic import). ~~Startup profiling~~ (done — `performance.now()` timing table in `initialize()`). ~~Cold-start CLI mode~~ (done — `liteBootstrap()` + `--local` flag on `memory` and `risk` commands). ~~Connection pooling optimization~~ (done — lite mode pool size 2, configurable `idleTimeoutMillis`). ~~Memory profiling~~ (done — `process.memoryUsage()` in `/health/deep`, `status --profile` CLI).

**What remains** (ordered by impact):

- **Binary size audit** — Identify bundled assets inflating the ~80MB binary. Tree-shake unused code paths. Consider splitting MCP tool manifest into a lazy-loaded module.

---

## 2. Supply Chain Security & Compliance Artifacts

**ROI**: HIGH — Low effort, massive enterprise credibility. Direct counter to ClawHavoc narrative.

The ClawHavoc supply chain attack (1,184+ malicious skills, 135,000+ exposed instances) is the strongest advertisement for SecureYeoman's security-first approach. Formalizing supply chain security turns marketing narrative into verifiable fact.

- **SBOM generation** — CycloneDX or SPDX BOM on every release. Required by US EO 14028 and EU Cyber Resilience Act. Ship as `secureyeoman sbom` CLI command.
- **SLSA Level 3 compliance** — Reproducible builds with signed provenance (GitHub Actions + Sigstore).
- **Signed releases** — Sigstore cosign on binary, Docker image, Helm chart. `secureyeoman verify` CLI.
- **Compliance mapping documentation** — NIST 800-53, SOC 2 Type II, ISO 27001, HIPAA, EU AI Act. Format: control ID → feature → evidence.
- **Dependency provenance tracking** — Alert on author changes, new transitive deps. Socket.dev integration.
- **Reproducible Docker builds** — Pin base images by digest. Lock apt/apk versions. Verify hash.

---

## 3. OpenTelemetry & SIEM Integration

**ROI**: HIGH — Enterprise procurement checkbox. Unblocks deals where Prometheus alone isn't sufficient.

**What exists**: `otel.ts` with `initTracing()` at startup. `otel-fastify-plugin.ts` for route spans. UUIDv7 correlation IDs on all requests.

**What remains**:

- **Deep OTel instrumentation** — Extend spans to AI provider calls, tool executions, workflow steps, A2A calls. Currently only Fastify request-level spans.
- **Distributed trace context** — Propagate trace IDs across sub-agent delegations and cross-cluster federation calls.
- **Trace-aware logging** — Enrich Pino entries with `traceId` and `spanId` for log-to-trace correlation.
- **SIEM log forwarding** — Structured output for Splunk HEC, Elastic ECS, Azure Sentinel CEF, AWS CloudWatch. Configurable via `observability.siem`.
- **Audit chain → SIEM bridge** — Real-time forwarding of audit chain events with severity mapping.
- **Cost attribution dashboards** — Per-tenant, per-personality, per-workflow cost tracking. Budget alerts. CSV chargeback reports.
- **SLO monitoring** — Response latency, tool success rate, retrieval quality SLOs. Burn-rate alerting.

---

## ~~4. Quick Wins from #8~~ → Completed in [2026.3.5f]

---

## 5. RAG Evaluation Metrics

**ROI**: HIGH — Quantitative proof of knowledge retrieval quality. No competitor measures this.

*Overlap note*: Phase 125-E (Cognitive ML) includes retrieval optimizer, context retrieval, and salience scoring. RAG metrics should be co-developed with 125-E to share the evaluation infrastructure.

- **Faithfulness score** — LLM-as-Judge or NLI-based scoring against retrieved context.
- **Answer relevance** — Semantic similarity between question and answer.
- **Context recall / precision** — Did retrieval find all relevant docs? Were retrieved chunks used?
- **Retrieval latency percentiles** — p50/p95/p99 for vector search, FTS, hybrid RRF.
- **Chunk utilization rate** — Referenced chunks vs discarded. Indicates chunking quality.
- **Dashboard widget** — RAG quality metrics with time-series trends and threshold alerts.

---

## 6. Prompt Versioning & A/B Testing

**ROI**: MEDIUM — Valuable for teams iterating on prompts. Compliance teams want audit trails.

*Overlap note*: Phase 114 (Versioning) already stores `PersonalityVersion` snapshots with diff support. This extends that to structured A/B testing and prompt-specific tooling.

- **Prompt version store** — Versioned snapshots of system prompts, skill instructions, tool descriptions. Diff view. Rollback.
- **A/B testing** — Route % of conversations to variant prompts. Track outcomes. Statistical significance.
- **Prompt changelog** — Annotated history with rationale. Exportable for compliance.
- **Template variables** — `{{variable}}` substitution. Centralized safety preamble, compliance disclaimers.
- **Prompt linting** — Detect conflicting instructions, overly long prompts, missing safety boundaries.

---

## 7. Developer Ecosystem & Community Growth

**ROI**: MEDIUM — Only way to close the skill gap (87 vs 13,729) at scale. High effort.

- **Skill SDK** — `npx create-secureyeoman-skill` scaffolding. Schema, test harness, README, CI config.
- **Skill testing framework** — Mock MCP context, simulate tool calls, assert outputs. `SkillTestRunner`.
- **Skill submission pipeline** — `secureyeoman skill publish` with validation, tests, auto-PR.
- **API client libraries** — Python (`secureyeoman-py`) and Go (`secureyeoman-go`) from OpenAPI spec.
- ~~**Webhook/event system**~~ — Completed in [2026.3.5f].
- **Interactive tutorials** — Guided onboarding in dashboard.

---

## 8. Extensible Guardrail Pipeline

**ROI**: MEDIUM — Pluggable filter chain beyond ResponseGuard.

*Overlap note*: Phase 136 (DLP) added PII detection, content classification, and egress scanning. Phase 95 (ContentGuardrail) added input/output guardrails with sync/async evaluation. This extends those into a user-pluggable pipeline with custom filters and per-personality configuration.

**Remaining unique value**:

- **Filter plugin interface** — `GuardrailFilter` with `onInput`/`onOutput` hooks. Chain of responsibility.
- **Custom filter SDK** — User-written TypeScript filters loaded from `guardrails/` directory.
- **Per-personality filter config** — Different guardrail configs per personality.
- **Dry-run mode** — Observation mode for threshold tuning.
- **Filter metrics** — Activation rate, false positives, latency impact.

*De-scoped (already covered)*: ~~PII detection~~ (DLP), ~~topic restriction~~ (ContentGuardrail), ~~OPA/CEL integration~~ (existing governance).

---

## 9. Remaining Ideas (Lower Priority)

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

*Re-ranked: 2026-03-05. Items here are brainstorm-level and require scoping before implementation.*
