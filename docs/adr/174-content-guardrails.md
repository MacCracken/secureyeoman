# ADR 174: Content Guardrails

**Status:** Accepted
**Date:** 2026-03-01
**Phase:** 95

## Context

The security stack guards input (Phase 77: InputValidator, AbuseDetector) and LLM output for injection/exfiltration (ResponseGuard), but lacks output-side content policy enforcement. PII leaks, off-topic responses, toxic content, and hallucinated citations pass through unchecked. Regulated industries require these guardrails for compliance.

## Decision

Add a `ContentGuardrail` class that runs after ResponseGuard in the chat output pipeline, enforcing six capabilities:

1. **PII detection/redaction** — regex-based scanning for emails, phone numbers, SSNs, credit cards, and IP addresses with configurable detect-only or redact modes.
2. **Topic restrictions** — keyword-based Jaccard overlap to block responses touching restricted topics.
3. **Toxicity filtering** — external classifier integration with configurable block/warn/audit modes and fail-open on errors.
4. **Custom block lists** — plain strings (word boundary) or regex patterns compiled at construction time.
5. **Guardrail audit trail** — all findings recorded via the audit chain with content hashes.
6. **Grounding checks** — verify quoted citations and "according to" patterns against the knowledge base.

### Architecture

- **Sync path** (fast, <5ms): PII detection + block list scanning
- **Async path**: topic restriction, toxicity classification, grounding verification
- **Combined scan**: sync first; if sync fails, short-circuits async

### Configuration

- Global: `security.contentGuardrails` in `SecurityConfigSchema`
- Per-personality: `body.contentGuardrails` in `BodyConfigSchema` (block list additions, topic additions, PII mode override)
- Dashboard: security policy API + SecuritySettings UI card

## Consequences

- Output content can now be filtered before reaching users, meeting healthcare/finance/legal compliance requirements
- PII redaction prevents accidental data exposure in AI responses
- Toxicity filtering depends on external classifier availability (fail-open by design)
- Topic restrictions use keyword overlap which may produce false positives/negatives at extreme threshold values
- Grounding checks require a populated knowledge base to be effective
