# ADR 209: Supply Chain Security & Compliance Artifacts

**Status**: Accepted
**Date**: 2026-03-05
**Phase**: 138

## Context

The ClawHavoc supply chain attack (1,184+ malicious skills, 135,000+ exposed instances) demonstrates the critical need for verifiable supply chain security. Enterprise procurement increasingly requires SBOM (US EO 14028, EU Cyber Resilience Act), signed releases, and compliance framework mappings. SecureYeoman's security-first approach needs formal artifacts to convert marketing narrative into verifiable fact.

## Decisions

### SBOM Generation (CycloneDX 1.5)

- `supply-chain/sbom-generator.ts`: Generates CycloneDX 1.5 JSON from `package-lock.json`.
- Supports lockfile versions 1, 2, and 3.
- Extracts: name, version, purl, integrity hashes, licenses, registry URLs, scope (optional/required).
- CLI: `secureyeoman sbom generate [--dir PATH] [--include-dev] [--output FILE]`.
- CI: SBOM generated and attached to every GitHub Release as `secureyeoman-sbom.cdx.json`.

### Release Signing (Sigstore Cosign)

- `supply-chain/release-verifier.ts`: Verifies SHA256 checksums and optional Sigstore cosign signatures.
- SHA256 checksum verification uses streaming hash for large binaries.
- Cosign keyless signing in CI via `sigstore/cosign-installer@v3` GitHub Action.
- Each binary gets `.sig` (signature) and `.cert` (certificate) files.
- CLI: `secureyeoman verify <binary> [--sums FILE] [--cosign]`.

### SLSA Provenance (Level 3)

- `actions/attest-build-provenance@v2` generates SLSA provenance attestations in CI.
- GitHub Actions workflow gets `id-token: write` and `attestations: write` permissions for OIDC-based keyless attestation.
- Provenance is attached to the GitHub Release, verifiable via `gh attestation verify`.

### Compliance Framework Mapping

- `supply-chain/compliance-mapping.ts`: Static mapping of SecureYeoman features to compliance controls.
- 5 frameworks: NIST SP 800-53 Rev 5 (24 controls), SOC 2 Type II (14 criteria), ISO 27001:2022 (14 controls), HIPAA Security Rule (13 requirements), EU AI Act (9 articles).
- Each mapping: control ID, title, feature, evidence path, implementation status.
- CLI: `secureyeoman sbom compliance [--framework NAME] [--format json|md]`.
- Summary view shows coverage percentage per framework.

### Dependency Provenance Tracking

- `supply-chain/dependency-tracker.ts`: Compares current `package-lock.json` against a saved baseline.
- Detects: new/removed deps, version changes, integrity hash changes, registry URL changes.
- Risk analysis: critical (registry change, integrity mismatch without version bump), high (bulk new deps), medium (new prod dep, major version bump), info (new dev dep).
- Baseline stored at `.secureyeoman/dependency-baseline.json`.
- CLI: `secureyeoman sbom deps [--dir PATH] [--json]` and `secureyeoman sbom deps baseline`.

### Reproducible Docker Builds

- Base image `debian:bookworm-slim` pinned by SHA256 digest in `Dockerfile`.
- Ensures identical base layer across builds regardless of tag mutation.

## Consequences

### Positive

- **Enterprise credibility**: Machine-readable SBOM + signed releases + SLSA provenance = verifiable supply chain.
- **Regulatory compliance**: SBOM satisfies US EO 14028 and EU CRA requirements. Compliance mappings accelerate audits.
- **Tamper detection**: Cosign signatures and SHA256 checksums enable end-to-end artifact verification.
- **Dependency hygiene**: Provenance tracking catches supply chain attacks (registry redirects, integrity mismatches) before they reach production.

### Negative

- **CI time**: Signing and attestation add ~30s to release pipeline.
- **External dependency**: Cosign verification requires `cosign` CLI (graceful degradation when absent).

## Tests

- 57 tests across 6 files: sbom-generator (10), release-verifier (4), compliance-mapping (14), dependency-tracker (17), sbom CLI (8), verify CLI (4).
