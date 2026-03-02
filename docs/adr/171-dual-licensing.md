# ADR 171 — Dual Licensing: AGPL-3.0 + Commercial

**Status**: Accepted
**Date**: 2026-03-01
**Deciders**: SecureYeoman core team

---

## Context

SecureYeoman was MIT-licensed. MIT imposes no restrictions on SaaS providers wrapping the software and offering it as a hosted service without contributing back — a pattern colloquially called the "SaaS loophole."

As the project adds enterprise features (Adaptive Learning Pipeline, SSO/SAML, Multi-Tenancy, CI/CD Integration, Advanced Observability) there is a commercial need to:

1. Close the SaaS loophole for operators who modify and host the software commercially.
2. Generate revenue to fund continued development without requiring cloud lock-in.
3. Allow enterprise customers with legal constraints (e.g. AGPL-incompatible internal policies) to acquire a proprietary license.

---

## Decision

Move to a **dual-license model**:

| License | Audience | Key terms |
|---------|----------|-----------|
| **AGPL-3.0** | Open-source users, developers, self-hosters who publish modifications | Full copyleft; network use = distribution; modifications must be published |
| **Commercial** | Enterprises unable to accept AGPL terms; hosted-service providers | Proprietary; grants internal use only; no SaaS resale without agreement |

This is the same model used by Grafana Labs, Elasticsearch (pre-SSPL), GitLab, and others.

### License key system

Enterprise features are gated behind Ed25519-signed JWT-style license keys:

- Keys are three base64url segments: `<header>.<payload>.<signature>`
- The public key is embedded in `LicenseManager` (no network call required)
- The private key is held only by the project maintainers (in `.license-private.pem`, gitignored)
- Keys encode: `tier`, `organization`, `seats`, `features[]`, `licenseId`, `iat`, `exp`
- Runtime validation is pure CPU — no call-home, no DNS, no telemetry

### CLA

Contributors must agree to a Contributor License Agreement granting the project a license to include their contributions in commercial distributions. This is documented in `CONTRIBUTING.md`.

---

## Consequences

### Positive

- SaaS providers who fork and host must either publish their modifications (AGPL) or purchase a commercial license — eliminating the free-rider problem.
- Enterprise revenue funds the open-source core.
- Offline validation means enterprise deployments in air-gapped environments work without modification.
- Community users are unaffected — the open-source core remains fully functional under AGPL.

### Negative

- Some contributors or organisations may be unwilling to sign a CLA.
- AGPL may reduce casual adoption in commercial contexts (intended effect, but worth noting).
- Maintaining two license tracks adds operational overhead (key issuance, renewal).

### Neutral

- Existing MIT-licensed code is relicensed by the copyright holders (SecureYeoman Project Contributors) — no third-party copyright is affected.
- Enterprise features are partially gated at the dashboard level (Phase 106 in progress). `LicenseContext` provides app-wide license state; the `LicenseCard` shows feature availability with green/grey chips and expiry countdown banners. Backend route guards and CLI guards are tracked as remaining Phase 106 work (see `docs/development/roadmap.md`).

---

## Implementation

| Artifact | Location |
|----------|----------|
| Open-source license | `LICENSE` (AGPL-3.0) |
| Commercial license template | `LICENSE.commercial` |
| `LicenseManager` class + tests | `packages/core/src/licensing/` |
| License routes (`/api/v1/license/*`) | `packages/core/src/licensing/license-routes.ts` |
| Key issuance tool | `scripts/generate-license-key.ts` |
| CLI command | `secureyeoman license status|set` |
| Dashboard card | Settings > General > License |
| Dashboard context | `packages/dashboard/src/hooks/useLicense.tsx` (`LicenseProvider`, `useLicense()`) |
| User guide | `docs/guides/licensing.md` |

---

## References

- Grafana dual-licensing announcement (2021)
- AGPL-3.0 full text: https://www.gnu.org/licenses/agpl-3.0.html
- HashiCorp BSL model (for comparison — we chose AGPL instead)
