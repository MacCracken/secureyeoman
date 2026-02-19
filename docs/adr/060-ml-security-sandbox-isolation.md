# ADR 060 — ML Security & Sandbox Isolation

**Status**: Accepted
**Phase**: 17
**Date**: 2026-02-18

---

## Context

Phase 17 had three remaining roadmap items after Dynamic Tool Creation (ADR 059):

1. **Anomaly Detection** — ML-based detection of unusual patterns in agent behavior, API calls, and security events.
2. **gVisor Integration** — Kernel-level sandbox isolation via gVisor (`runsc`), providing an additional layer of isolation beyond the existing container sandbox.
3. **WASM Isolation** — WebAssembly-based code execution isolation for additional memory-safety and capability confinement.

All three features are operator-controlled security enhancements. They are off by default to avoid breaking existing deployments and to require explicit opt-in from operators who have the required host dependencies (e.g., gVisor installation).

The system already has a global security policy pattern (`GET`/`PATCH /api/v1/security/policy`) with key-value persistence in the `security.policy` database table, Dashboard toggles (`SecuritySettings.tsx` via `PolicyToggle`), and CLI controls (`secureyeoman policy`). This ADR extends that pattern with three new flags.

---

## Decision

Add three new global security policy flags to `SecurityConfigSchema`:

| Flag | Default | Description |
|------|---------|-------------|
| `allowAnomalyDetection` | `false` | Enable ML-based anomaly detection engine for agent behavior, API calls, and security events |
| `sandboxGvisor` | `false` | Enable gVisor (`runsc`) kernel-level isolation layer; requires gVisor installed on host |
| `sandboxWasm` | `false` | Enable WebAssembly-based isolation for code execution |

All three flags follow the same lifecycle as existing policy flags:

- Defined in `SecurityConfigSchema` (shared package) with Zod validation and `false` defaults.
- Loaded from the `security.policy` DB table at startup by `loadSecurityPolicyFromDb`.
- Updated at runtime via `updateSecurityPolicy()` (persisted to DB).
- Exposed via `GET /api/v1/security/policy` and `PATCH /api/v1/security/policy`.
- Listed in `ALL_POLICY_FLAGS` in the CLI `policy` command.
- Available in the Dashboard under Settings → Security in two new cards.

---

## Architecture

### Shared Types (`packages/shared/src/types/config.ts`)

Three new optional boolean fields added to `SecurityConfigSchema` after `sandboxDynamicTools`.

### Backend (`packages/core`)

- `secureyeoman.ts` — `updateSecurityPolicy()` type extended; assignment blocks added; `loadSecurityPolicyFromDb` `policyKeys` array extended.
- `gateway/server.ts` — GET response object and PATCH Body type/handler/response extended with the three new fields.
- `cli/commands/policy.ts` — `ALL_POLICY_FLAGS` extended; USAGE string auto-updated via `join`.

### Dashboard (`packages/dashboard`)

- `api/client.ts` — `SecurityPolicy` interface extended; fallback defaults added.
- `SecuritySettings.tsx` — Two new cards added:
  - **ML Security** (Brain icon) — contains the Anomaly Detection toggle, placed after the Dynamic Tool Creation card.
  - **Sandbox Isolation** (Cpu icon) — contains gVisor Isolation and WASM Isolation toggles, placed after the Code Execution card.

### Persistence

No schema changes required. Flags are stored as key-value pairs in the existing `security.policy` table (keys: `allowAnomalyDetection`, `sandboxGvisor`, `sandboxWasm`).

---

## Consequences

### Positive

- Incremental adoption: operators enable only the features their infrastructure supports.
- gVisor gate (`sandboxGvisor: false` default) prevents failures on hosts without gVisor installed.
- WASM isolation adds memory-safety guarantees at the execution layer with no host dependencies.
- Anomaly detection can be enabled without any infrastructure changes; the ML engine activates on flag enable.
- Consistent operator experience: same Dashboard + CLI surface as all other policy flags.

### Negative / Risks

- gVisor requires host-level installation and configuration; the platform does not validate this at flag toggle time. Operators must ensure host compatibility before enabling.
- WASM isolation may add execution overhead for compute-intensive tasks.
- Anomaly detection false-positive rate depends on ML model tuning; operators should monitor alerts after enabling.

### Neutral

- No breaking changes; all three flags default to `false`.
- Existing test suites updated to carry the three new fields in all mock `SecurityPolicy` objects.
