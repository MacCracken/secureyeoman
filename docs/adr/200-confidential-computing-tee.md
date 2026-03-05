# ADR 200: Confidential Computing — TEE-Aware Provider Routing

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 128 (Tier 1), 129 (Full Stack — planned)

## Context

Competitors (Azure Confidential Computing, NVIDIA CC, Opaque Systems, Fortanix) are offering Trusted Execution Environment (TEE) integration for AI workloads. Enterprise customers processing sensitive data (healthcare, finance, legal) need assurance that AI inference runs in hardware-isolated environments where even the cloud provider cannot access plaintext data.

SecureYeoman already has defense-in-depth security (sandbox isolation, RBAC, audit chains, encryption at rest), but lacks TEE-aware provider selection and attestation verification.

## Decision

Implement TEE support in three tiers:

### Tier 1 (Phase 128 — Implemented)
- **Config-driven TEE requirements**: `security.tee` section in `SecurityConfigSchema` with `providerLevel`, `attestationStrategy`, `failureAction`.
- **Per-model override**: `confidentialCompute` field on `ModelConfigSchema` and `FallbackModelConfigSchema`.
- **Per-personality override**: `confidentialCompute` field on `BodyConfigSchema`.
- **Static provider capability table**: `PROVIDER_TEE_SUPPORT` maps 13 providers to known TEE capabilities.
- **AIClient integration**: `verifyTeeCompliance()` called before every provider API call. Non-compliant providers throw `ProviderUnavailableError`, triggering fallback chain to TEE-capable alternatives.
- **ModelRouter filtering**: `confidentialCompute: 'required'` in `RouterOptions` filters out non-TEE providers during model selection.

### Tier 2 (Phase 129 — Planned)
- Remote attestation APIs (Azure MAA, NVIDIA RAA, AWS Nitro)
- SGX/SEV sandbox backends
- Encrypted model weights at rest (sealed storage)
- Nitro Enclaves for key management

### Tier 3 (Phase 129 — Planned)
- Confidential GPU inference (NVIDIA CC mode detection)
- End-to-end confidential pipeline with chain-of-custody attestation
- TEE-aware training pipeline
- Dashboard TEE status indicators

## Architecture

```
┌─────────────────────────────────────────────────┐
│  SecurityConfig.tee                              │
│  ├── enabled: boolean                            │
│  ├── providerLevel: off | optional | required    │
│  ├── attestationStrategy: none | cached | ...    │
│  ├── attestationCacheTtlMs: number               │
│  └── failureAction: block | warn | audit_only    │
└──────────────────┬──────────────────────────────┘
                   │
    ┌──────────────▼──────────────┐
    │  TeeAttestationVerifier      │
    │  ├── verify(provider)        │
    │  ├── PROVIDER_TEE_SUPPORT    │
    │  └── cache (TTL-based)       │
    └──────┬──────────┬───────────┘
           │          │
    ┌──────▼──┐  ┌────▼─────────┐
    │AIClient │  │ ModelRouter   │
    │(pre-call│  │(candidate    │
    │ check)  │  │ filtering)   │
    └─────────┘  └──────────────┘
```

## Precedence Chain

TEE requirements resolve in this order (first non-`off` wins):
1. Per-request `confidentialCompute` (future)
2. Per-personality `body.confidentialCompute`
3. Per-model `model.confidentialCompute`
4. Security-level `security.tee.providerLevel`

## Failure Modes

| `failureAction` | Behavior |
|-----------------|----------|
| `block` | Throws `ProviderUnavailableError` → triggers fallback chain |
| `warn` | Logs warning, allows request to proceed |
| `audit_only` | Silent allow, records in audit log only |

## Consequences

- **Positive**: Competitive parity with enterprise TEE offerings. Config-driven, zero-overhead when disabled. Fallback chain integration means TEE requirements don't break availability.
- **Negative**: Static provider table requires manual updates as providers add TEE support. No actual remote attestation in Tier 1 (planned for Tier 2).
- **Risk**: Provider TEE claims may not be independently verifiable without remote attestation APIs (mitigated by Tier 2 plan).

## References

- Phase 128 changelog entry (2026-03-05)
- `packages/core/src/security/tee-attestation.ts` — verifier implementation
- `packages/shared/src/types/config.ts` — `TeeConfigSchema`, `ModelConfigSchema.confidentialCompute`
- `packages/core/src/ai/client.ts` — `verifyTeeCompliance()`
- `packages/core/src/ai/model-router.ts` — TEE filtering in `route()`
