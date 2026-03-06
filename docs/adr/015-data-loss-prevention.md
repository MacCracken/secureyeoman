# ADR 015 — Data Loss Prevention & Content Classification

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 136

## Context

SecureYeoman handles sensitive data across conversations, documents, knowledge entries, and outbound integrations (Slack, email, webhooks). Without DLP controls, confidential content can leak through integrations, and organizations cannot enforce data classification policies required for HIPAA, SOC 2, and financial services compliance.

Existing `ContentGuardrail` provides PII detection, toxicity filtering, and blocklists for *inbound* content. Phase 136 extends this to *outbound* data flows and adds a full classification lifecycle.

## Decision

Implement a six-layer DLP system:

### 1. Content Classification Engine (136-A)
- Four-tier classification: `public < internal < confidential < restricted`
- Three detection layers: PII regex (reuse from content-guardrail), keyword dictionaries, custom regex patterns
- Highest triggered level wins
- Classification stored in `dlp.classifications` with audit trail
- Manual override support (overrides auto-classification, records who/when)

### 2. Outbound DLP Scanning (136-B)
- Intercepts `IntegrationManager.sendMessage()` and `OutboundWebhookDispatcher.dispatch()`
- Runs content through classification engine, then evaluates against DLP policies
- Three actions: `block` (prevent send, return error), `warn` (send but log), `log` (silent audit)
- Policy rules match on classification level, PII type, keywords, and custom patterns
- All scans logged to `dlp.egress_log` for compliance

### 3. Classification-Aware RBAC (136-C)
- Extends existing RBAC condition system with `classification` field evaluator
- Ordered comparison: `public(0) < internal(1) < confidential(2) < restricted(3)`
- Example: `{ field: 'classification', operator: 'lte', value: 'confidential' }` allows access to public, internal, and confidential but not restricted

### 4. Data Retention Policies (136-D)
- Per-content-type retention periods (conversations, memories, documents, knowledge, audit logs)
- Classification-aware: restricted content can have different retention than public
- Timer-based purge (configurable interval, default 24h)
- Audit log entries soft-deleted (marked as purged) to preserve chain integrity

### 5. Egress Monitoring (136-F)
- Dashboard showing outbound data flows by destination type, volume, and classification level
- Anomaly detection via z-score on hourly egress volume
- Alerts on: new destinations, restricted content egress, volume spikes

### 6. Watermarking (136-E)
- Invisible watermarks in AI-generated text for provenance tracking
- Three algorithms: unicode-steganography (zero-width chars), whitespace encoding, homoglyph substitution
- Encodes: tenant_id, user_id, timestamp, content_id
- Applied post-DLP scan on outbound messages and AI responses

## Schema

New `dlp` schema with 5 tables:
- `dlp.classifications` — content classification records with audit trail
- `dlp.policies` — DLP policy definitions (rules, actions, scope)
- `dlp.egress_log` — outbound data flow audit log
- `dlp.retention_policies` — per-type/per-level retention configuration
- `dlp.watermarks` — watermark registry for provenance verification

## Configuration

`DlpConfigSchema` added to `SecurityConfigSchema` with sub-objects:
- `classification` — engine settings, keywords, PII handling
- `scanning` — default action, scope (integrations/webhooks/email)
- `retention` — purge interval, per-type defaults
- `watermarking` — algorithm selection, metadata inclusion

Feature gate: `exposeDlp` in McpServiceConfig (default false).

## Integration Points

1. **PII patterns** — Extracted from `content-guardrail.ts`, shared by both guardrail and classifier
2. **Integration intercept** — `IntegrationManager.sendMessage()` gets optional `dlpManager` dependency
3. **Webhook intercept** — `OutboundWebhookDispatcher.dispatch()` scans before fetch
4. **RBAC conditions** — Existing condition evaluator extended with `classification` field
5. **SecurityModule** — All DLP managers initialized in `initCore()`/`initLate()`, cleaned up in `destroy()`

## Alternatives Considered

1. **External DLP service** — Rejected. Adds latency and dependency. Inline scanning is faster and self-contained.
2. **ML-based classification** — Deferred. Regex + keyword is fast and interpretable. ML classification can be added later as a fourth layer.
3. **Separate microservice** — Rejected. Monolith pattern is established. DLP is a cross-cutting concern best handled in-process.

## Consequences

- All outbound data flows gain classification awareness
- Organizations can enforce data handling policies without external tools
- RBAC becomes content-aware, enabling need-to-know access patterns
- Automated retention reduces data exposure surface
- Watermarking enables post-incident provenance investigation
- ~200 new tests across 6 sub-phases
