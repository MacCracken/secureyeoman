# Brainstorm — 2026-03-05

> Improvement opportunities beyond the current roadmap. Ranked by strategic ROI. Items here are brainstorm-level — not yet scoped into phases.

---

## 1. Supply Chain Security & Compliance Artifacts

**ROI**: HIGH — Low effort, massive enterprise credibility. Direct counter to ClawHavoc narrative.

The ClawHavoc supply chain attack (1,184+ malicious skills, 135,000+ exposed instances) and Snyk ToxicSkills study (36% injection rate) are the strongest possible advertisement for SecureYeoman's security-first approach. Formalizing supply chain security turns marketing narrative into verifiable fact.

- **SBOM generation** — CycloneDX or SPDX bill of materials generated on every release. Required by US Executive Order 14028 (2021) and the EU Cyber Resilience Act (2024). Include transitive dependency tree, license inventory, and vulnerability cross-reference. Ship as `secureyeoman sbom` CLI command and include in release artifacts.
- **SLSA Level 3 compliance** — Reproducible builds with signed provenance attestations and build isolation. Provenance metadata answers "who built this, from what source, on what infrastructure." Level 3 requires build platform integrity — achievable with GitHub Actions reusable workflows + Sigstore.
- **Signed releases** — GPG or Sigstore cosign signatures on all release artifacts (binary, Docker image, Helm chart). `secureyeoman verify` CLI command to validate signatures before upgrade. Docker Content Trust for image signing.
- **Compliance mapping documentation** — Map SecureYeoman's technical controls to NIST 800-53, SOC 2 Type II, ISO 27001 Annex A, HIPAA Technical Safeguards, and EU AI Act requirements. Format: control ID → SecureYeoman feature → evidence location. Enterprise procurement teams need this document to bypass months of security review.
- **Dependency provenance tracking** — Record the provenance of every npm dependency at install time. Alert on new transitive dependencies, author changes, or packages with no published source. Integrate with Socket.dev or similar supply chain security scanner in CI.
- **Reproducible Docker builds** — Pin all base images by digest (not tag). Lock apt/apk package versions. Verify build output hash matches across independent builds.

---

## 2. Startup & Resource Optimization

**ROI**: HIGH — Addresses the most visible competitive weakness (30s startup, 1GB RAM vs PicoClaw's <1s / 10-20MB).

- **Lazy module loading** — Only boot modules that are configured. Skip TEE, training, PDF, excalidraw, risk register, LLM lifecycle if their feature flags are disabled. Target: modules not referenced in config don't touch the event loop at startup.
- **Startup profiling** — Instrument the boot sequence end-to-end. Identify the slowest init calls (likely: migration check, vector store connection, integration adapter loading, marketplace seeding). Publish a flamegraph in docs.
- **Cold-start CLI mode** — For one-shot CLI commands (`secureyeoman brain search`, `secureyeoman risk summary`), skip gateway, dashboard, WebSocket, integrations, and cron. Boot only the storage layer + the targeted module. Target: <3s for CLI commands.
- **Connection pooling optimization** — Review PostgreSQL pool size defaults. Lazy-create pools per schema (brain, risk, training) instead of a single eager pool. Close idle connections aggressively in Lite/SQLite mode.
- **Binary size audit** — Identify bundled assets that inflate the ~80MB binary. Tree-shake unused code paths. Consider splitting the MCP tool manifest into a lazy-loaded module.
- **Memory profiling** — Heap snapshot at steady state. Identify the largest retained objects. Target: <600MB idle RSS with all modules loaded, <300MB with minimal config.

---

## 3. Agent Evaluation & Guardrails Framework

**ROI**: HIGH — Emerging category with no competitor offering. High differentiation.

No competitor in the audit (OpenClaw, Agent Zero, PicoClaw, Ironclaw, TrustClaw, Manus, Devin, OpenHands, OpenAI Frontier) has a structured agent evaluation framework. This is the next frontier after "can the agent do the task" — "can we prove the agent does the task reliably, safely, and consistently."

### ~~3a. Agent Eval Harness~~ → Completed as Phase 135

### 3b. RAG Evaluation Metrics

Quantitative quality metrics for every knowledge retrieval operation.

- **Faithfulness score** — Does the agent's answer contain only information present in the retrieved context? LLM-as-Judge or NLI-based scoring.
- **Answer relevance** — Does the answer address the user's question? Semantic similarity between question and answer.
- **Context recall** — Did the retrieval system find all relevant documents? Requires ground-truth annotations for eval datasets.
- **Context precision** — What fraction of retrieved chunks were actually used in the answer? Track via citation analysis.
- **Retrieval latency percentiles** — p50/p95/p99 for vector search, FTS, and hybrid RRF. Surface in Prometheus and dashboard.
- **Chunk utilization rate** — How many retrieved chunks are referenced in the final answer vs discarded. Indicates chunking strategy quality.
- **Dashboard integration** — RAG quality metrics widget with time-series trends. Alert when faithfulness drops below threshold.

### 3c. Prompt Versioning & A/B Testing

Version control for system prompts and skill instructions.

- **Prompt version store** — Every change to a personality's system prompt, skill instructions, or tool descriptions creates a versioned snapshot. Diff view between versions. Rollback to any prior version.
- **A/B testing** — Route a percentage of conversations to variant prompts. Track outcome metrics (user satisfaction, task completion, tool error rate, token cost). Statistical significance calculator.
- **Prompt changelog** — Annotated history of prompt changes with rationale. Exportable for compliance (auditors want to know what the AI was told to do, and when).
- **Template variables** — Parameterized prompts with `{{variable}}` substitution. Centrally manage common instructions (safety preamble, compliance disclaimers) across all personalities.
- **Prompt linting** — Static analysis of prompt text: detect conflicting instructions, overly long system prompts, missing safety boundaries, deprecated tool references.

### 3d. Extensible Guardrail Pipeline

Pluggable input/output filter chain beyond ResponseGuard.

- **Filter plugin interface** — `GuardrailFilter` with `onInput(message)` and `onOutput(response)` hooks. Filters return `pass`, `warn`, or `block` with reason. Chain of responsibility pattern.
- **Built-in filters** — PII detection (names, emails, SSNs, credit cards via regex + NER), topic restriction (configurable deny-list with semantic matching), language detection (restrict to allowed languages), toxicity scoring, code injection detection.
- **Custom filter SDK** — Users write custom filters in TypeScript. Load from a `guardrails/` directory. Schema-validated configuration per filter.
- **Filter metrics** — Per-filter activation rate, false positive tracking, latency impact. Dashboard widget.
- **Per-personality filter config** — Different personalities can have different guardrail configurations. A customer-facing personality gets strict PII filtering; an internal DevOps personality gets relaxed code filters.
- **Dry-run mode** — Run filters in observation mode (log but don't block) to tune thresholds before enforcement.
- **Integration with OPA/CEL** — Guardrail filter decisions can be overridden by policy. OPA policy can reference filter outputs in its decision.

---

## 4. OpenTelemetry & SIEM Integration

**ROI**: HIGH — Enterprise procurement checkbox. Unblocks deals where Prometheus alone isn't sufficient.

- **OpenTelemetry SDK integration** — Instrument Fastify routes, AI provider calls, tool executions, workflow steps, and A2A calls with OTel spans. Export via OTLP to any collector (Jaeger, Tempo, Datadog, New Relic).
- **Distributed trace context** — Propagate trace IDs across multi-agent workflows, sub-agent delegations, and A2A calls. Correlation ID (existing UUIDv7) becomes the trace ID.
- **Trace-aware logging** — Enrich Pino log entries with `traceId` and `spanId`. Enables log-to-trace correlation in observability platforms.
- **SIEM log forwarding** — Structured log output compatible with Splunk HEC, Elastic Common Schema (ECS), Azure Sentinel CEF, and AWS CloudWatch. Configurable via `observability.siem` config section.
- **Audit chain → SIEM bridge** — Forward audit chain events to SIEM in real-time. Map audit event types to SIEM severity levels and categories.
- **Cost attribution dashboards** — Per-tenant, per-personality, per-workflow LLM token cost tracking. Budget alerts when a tenant approaches their allocation. Chargeback reports exportable as CSV.
- **SLO monitoring** — Define SLOs for agent response latency, tool success rate, and retrieval quality. Burn-rate alerting. Dashboard widget with error budget visualization.

---

## ~~5. Data Loss Prevention (DLP) & Content Classification~~ → Completed as Phase 136

---

## 6. Developer Ecosystem & Community Growth

**ROI**: MEDIUM — Only way to close the community skill gap (87 vs 13,729) at scale.

- **Skill SDK** — `npx create-secureyeoman-skill` scaffolding tool. Generates skill directory with schema, test harness, README template, and CI config. `secureyeoman skill test` runs the harness locally.
- **Skill testing framework** — Mock MCP context, simulate tool calls, assert outputs. `SkillTestRunner` class that loads a skill, provides mock tool responses, and validates the skill's behavior against expected outcomes.
- **Skill submission pipeline** — `secureyeoman skill publish` validates schema, runs tests, and opens a PR to the community repo. Automated CI on the community repo validates, lints, and scores submissions.
- **API client libraries** — Python (`secureyeoman-py`) and Go (`secureyeoman-go`) SDKs wrapping the REST API. Generated from OpenAPI spec. Enables programmatic integration beyond MCP.
- **Webhook/event system** — Subscribe to agent lifecycle events (conversation.started, tool.called, workflow.completed, memory.created, eval.failed). HTTP webhook delivery with retry. Enables external integrations without polling.
- **Interactive tutorials** — Guided onboarding flows in the dashboard: "Create your first skill," "Set up SSO," "Build a workflow." Step-by-step with contextual help.
- ~~**OpenAPI spec generation**~~ — Completed. `scripts/generate-openapi.ts` auto-generates spec. See `docs/api/openapi.yaml`.

---

## ~~7. Multi-Region & High Availability~~ → Completed as Phase 137

---

## 8. Additional Differentiated Ideas

| Idea | Category | Effort | Impact |
|------|----------|--------|--------|
| **Agent replay & debugging** — Record full agent execution trace. Replay in dashboard with step-through. Invaluable for debugging and compliance. | Observability | MEDIUM | HIGH |
| **Policy-as-Code repository** — Git-backed OPA/CEL policy bundles. Version, review, deploy governance policies like code. PR-based policy changes with approval workflows. | Governance | LOW | MEDIUM |
| **Federated learning** — Multiple SecureYeoman instances contribute to model improvement without sharing raw data. Differential privacy guarantees. | AI/ML | HIGH | HIGH (long-term) |
| **WebAuthn/FIDO2 auth** — Hardware security key authentication for admin accounts. Strong complement to SSO for high-security environments. | Security | LOW | MEDIUM |
| **Offline-first PWA** — Service worker + IndexedDB cache for chat history. Closes the mobile gap without native app investment. Works on any device with a browser. | UX | MEDIUM | MEDIUM |
| **Chaos engineering toolkit** — Fault injection for agent workflows: simulate tool failures, slow LLM responses, network partitions. Validates resilience configuration. | Testing | MEDIUM | MEDIUM |
| **Model cost optimizer** — Analyze conversation history to recommend cheaper models for routine tasks. Auto-route simple queries to smaller models, complex ones to capable models. Extends existing model router. | Cost | LOW | HIGH |
| **Compliance audit mode** — One-click compliance report: "Show me everything this agent did in the last 30 days that touched PII / financial data / external systems." Cross-references audit chain, DLP logs, and tool invocations. | Compliance | MEDIUM | HIGH |
| **Agent sandboxing profiles** — Named sandbox configurations (e.g., "development", "production", "high-security") with pre-set Landlock/seccomp/WASM policies. Quick-switch in dashboard. | Security | LOW | MEDIUM |
| **Conversation branching visualization** — Visual tree of conversation branches (existing feature) with diff view between branches. Useful for prompt engineering and eval. | UX | LOW | LOW |

---

*Generated: 2026-03-05. Items here are brainstorm-level and require scoping before implementation.*
