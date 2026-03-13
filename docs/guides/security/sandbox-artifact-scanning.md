# Sandbox Artifact Scanning Guide

Phase 116 adds mandatory scanning and an externalization gate for sandbox outputs. This guide covers configuration, scanners, quarantine workflow, CLI usage, and threat patterns.

## Overview

The **Externalization Gate** sits between sandbox execution and result delivery. Every artifact produced by the sandbox is scanned before being returned to the caller. The gate can:

- **Pass** — clean artifact, returned as-is
- **Redact** — secrets found, redacted before delivery
- **Quarantine** — suspicious artifact, stored for human review
- **Block** — critical threat, artifact rejected

## Configuration

The externalization policy is configured in the security config:

```json
{
  "security": {
    "sandboxArtifactScanning": {
      "enabled": true,
      "maxArtifactSizeBytes": 10000000,
      "redactSecrets": true
    }
  }
}
```

- `enabled` — Master toggle for scanning (default: `true`)
- `maxArtifactSizeBytes` — Maximum artifact size before automatic blocking (default: 10MB)
- `redactSecrets` — Whether to redact detected secrets in `warn` verdicts (default: `true`)

## Scanners

### Code Scanner

Static analysis for 24 threat patterns across 8 categories:

- Command injection (`eval`, `exec`, backticks)
- Data exfiltration (network calls with sensitive data)
- Privilege escalation (`sudo`, `chmod 777`, SUID)
- Supply chain attacks (typosquatting, postinstall scripts)
- Obfuscation (base64 decode + eval, `String.fromCharCode`)
- SQL injection (UNION, DROP, template literals)
- Filesystem access (sensitive paths)
- Reverse shells (bash, python, netcat)

### Secrets Scanner

Detects 18 types of secrets and PII:

- API keys: AWS, GCP, GitHub, Stripe, Slack
- Credentials: passwords, Bearer tokens, JWTs
- Private keys (PEM format)
- PII: email, SSN, credit card numbers
- Connection strings (database URLs)

The `redact()` method replaces detected secrets with `[REDACTED:type]` labels.

### Data Scanner

Binary and structural analysis:

- Embedded executables (ELF, PE, Mach-O, Java, WebAssembly)
- Polyglot file detection (magic bytes vs. declared type)
- Serialization attacks (Python pickle, Java, PHP, YAML `!!python/`)
- Oversized payloads
- Formula injection in CSV/JSONL (`=`, `+@`, `-@`, `|`)

## Threat Classification

The threat classifier analyzes scan findings using 17 built-in patterns organized by MITRE ATT&CK kill chain stages:

| Category | Patterns | Kill Chain Stage |
|----------|----------|-----------------|
| Reverse shells | bash, python, node.js | Command & Control |
| Web shells | PHP eval, JSP | Installation |
| Cryptominers | stratum protocol, Coinhive | Actions on Objectives |
| Ransomware | bulk encryption, ransom notes | Actions on Objectives |
| Credential harvesters | keyloggers, phishing forms | Exploitation |
| Supply chain | typosquatting, postinstall | Delivery |
| Data exfiltration | DNS exfil | Actions on Objectives |
| Privilege escalation | sudo, SUID | Exploitation |

**Intent scoring**: 0.0–1.0, combining pattern weight (60%) and finding severity weight (40%), amplified by co-occurrence patterns. Classifications: benign (<0.2), suspicious (0.2–0.5), likely_malicious (0.5–0.8), malicious (0.8–1.0).

## Escalation Tiers

| Tier | Action |
|------|--------|
| `tier1_log` | Audit log only |
| `tier2_alert` | Log + fire AlertManager |
| `tier3_suspend` | Log + alert + personality suspension |
| `tier4_revoke` | Log + alert + privilege revocation + risk register entry |

The **OffenderTracker** automatically escalates response tiers for repeat offenders using a rolling time window with configurable thresholds and decay.

## Quarantine Workflow

1. Artifact flagged by scanning pipeline → stored in quarantine
2. Alert fired via AlertManager
3. Admin reviews via dashboard (Security → Sandbox tab) or CLI
4. Admin approves (releases artifact) or deletes (permanent removal)

## CLI Usage

```bash
# Scan a file
secureyeoman sandbox scan myfile.js

# Scan from stdin
cat suspicious.py | secureyeoman sandbox scan -

# List quarantined items
secureyeoman sandbox quarantine list

# Approve a quarantined item
secureyeoman sandbox quarantine approve <id>

# Delete a quarantined item
secureyeoman sandbox quarantine delete <id>

# Show current policy
secureyeoman sandbox policy

# View threat intelligence
secureyeoman sandbox threats

# View scan statistics
secureyeoman sandbox stats

# JSON output
secureyeoman sandbox stats --json
```

## Dashboard

Navigate to **Security → Sandbox** tab to see:

- **Stats Cards** — Total scans, quarantined, blocked, passed counts
- **Policy Banner** — Current externalization policy settings
- **Quarantine Table** — Approve or delete quarantined artifacts
- **Threat Intelligence Panel** — Built-in pattern categories and kill chain stages
- **Recent Scans Table** — Paginated scan history with verdict and severity badges

## API Endpoints

| Method | Path | Purpose |
|--------|------|---------|
| GET | `/api/v1/sandbox/scans` | List scan history |
| GET | `/api/v1/sandbox/scans/stats` | Aggregated statistics |
| GET | `/api/v1/sandbox/scans/:id` | Scan record details |
| GET | `/api/v1/sandbox/quarantine` | List quarantined items |
| GET | `/api/v1/sandbox/quarantine/:id` | Quarantine entry details |
| POST | `/api/v1/sandbox/quarantine/:id/approve` | Approve and release |
| DELETE | `/api/v1/sandbox/quarantine/:id` | Permanently delete |
| GET | `/api/v1/sandbox/threats` | Threat intelligence |
| POST | `/api/v1/sandbox/scan` | Manual scan (admin) |
| GET | `/api/v1/sandbox/policy` | Current policy |

All endpoints require `sandbox:read` or `sandbox:write`/`sandbox:execute` permissions.

## Runtime Guards

The `RuntimeGuard` monitors sandbox behavior during execution:

- **Network** — Host allowlist (empty = all blocked)
- **Filesystem** — Sensitive path blocklist (`/etc/shadow`, `/root/.ssh`, etc.)
- **Process** — Fork bomb detection (configurable max, default 10)
- **Time** — Duration anomaly flagging (>2x expected)
