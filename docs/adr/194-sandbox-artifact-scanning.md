# ADR 194: Sandbox Artifact Scanning & Externalization Gate

**Date**: 2026-03-03
**Status**: Accepted
**Phase**: 116

## Context

SecureYeoman's sandbox subsystem (Landlock, seccomp, `sandbox-exec`) isolates code execution but returns results to callers unchecked. Any artifact — code, data, files, serialized objects — can flow out of the sandbox without review. This creates a security gap where the sandbox prevents inbound threats but allows outbound exfiltration, malicious payloads, embedded secrets, or policy violations to pass through.

The existing `secrets-filter.ts` provides some regex-based pattern matching for secrets in execution output, but it operates on a best-effort basis without policy enforcement, quarantine, or audit.

## Decision

We introduce a mandatory scanning and approval gate — the **Externalization Gate** — between sandbox execution and result delivery. Four sub-phases:

### 1. Scanning Engine (116-A)

Three specialized scanners run in parallel via `ScannerPipeline`:

- **CodeScanner** — 24 regex-based static analysis patterns covering command injection, data exfiltration, privilege escalation, supply chain attacks, obfuscation, SQL injection, and reverse shells. Anti-ReDoS guards (line length limits, max findings cap).
- **SecretsScanner** — 18 patterns for API keys (AWS/GCP/GitHub/Stripe/Slack), credentials, PII (email, SSN, credit card), private keys, JWTs, connection strings. Includes `redact()` method.
- **DataScanner** — Magic byte detection (ELF/PE/Mach-O), polyglot files, serialization attacks (pickle/Java/PHP/YAML), oversized payloads, CSV/JSONL formula injection.

Pipeline uses `Promise.allSettled` for fault tolerance. `AbortController` support for `failFast` mode. Verdict calculation via `worstSeverity()` helper.

### 2. Externalization Gate & Quarantine (116-B)

- **ExternalizationGate** wraps `SandboxResult<T>` transparently. Gate decisions: pass, redact (secrets), quarantine (persist + alert), block (reject).
- **QuarantineStorage** — File-based under `<dataDir>/quarantine/<uuid>/`. CRUD with approve/release workflow.
- **ScanHistoryStore** — `PgBaseStorage` subclass for `sandbox.scan_history` table. Full audit trail regardless of verdict.

### 3. Threat Classification & Active Defense (116-C)

- **ThreatClassifier** — 17 built-in threat patterns across 7 categories (reverse shells, web shells, cryptominers, ransomware, credential harvesters, supply chain, data exfiltration). Intent scoring 0.0–1.0 with kill chain stage mapping and co-occurrence amplification.
- **RuntimeGuard** — Network (host allowlist), filesystem (path blocklist), process (fork bomb detection), time anomaly guards.
- **EscalationManager** — 4-tier response: log → alert → personality suspension → privilege revocation + risk register entry.
- **OffenderTracker** — Rolling window repeat-offender detection with configurable thresholds and time decay.

### 4. Observability (116-D)

- 10 REST API routes under `/api/v1/sandbox/`.
- CLI `sandbox` command with `scan`, `quarantine`, `policy`, `threats`, `stats` subcommands.
- Dashboard `Sandbox` tab in Security page with stats cards, quarantine management, threat intelligence panel, and recent scans table.
- 5 alert rule templates in `Sandbox` category.
- 6 audit event types.

## Consequences

### Positive

- Complete security boundary: sandbox outputs are inspected before reaching callers.
- Configurable policy: organizations can tune scanning sensitivity via `ExternalizationPolicy`.
- Threat intelligence: built-in pattern library with kill chain mapping enables security teams to understand attack vectors.
- Audit trail: every scan is recorded regardless of verdict.
- Graceful degradation: scanning failures don't block sandbox operation when `failOpen` is configured.

### Negative

- Adds latency to sandbox result delivery (typically <100ms for the scanning pipeline).
- File-based quarantine storage has no built-in replication (acceptable for single-node deployments).
- Regex-based scanning has inherent false positive/negative rates; not a replacement for full static analysis.

## Alternatives Considered

1. **External scanning service** (ClamAV, VirusTotal) — rejected due to network dependency and latency. Can be added later as an additional scanner.
2. **Pre-execution scanning only** — rejected because outputs may differ from inputs (code generation, data transformation).
3. **Blocking-only policy** — rejected in favor of quarantine workflow that allows human review.
