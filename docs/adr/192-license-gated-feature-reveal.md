# ADR 192: License-Gated Feature Reveal (Phase 106)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 106

---

## Context

Enterprise features (`adaptive_learning`, `sso_saml`, `multi_tenancy`, `cicd_integration`, `advanced_observability`) are fully implemented but have no runtime gating. Any installation can access all features regardless of license tier. Before public release, a gating mechanism is needed so that community-tier installs see upgrade prompts and enterprise installs unlock the full feature set.

However, enabling enforcement immediately would break existing development and community workflows. The gating infrastructure must ship with enforcement **disabled by default**, allowing all features to remain accessible. A future phase (106-B) will enable enforcement after a comprehensive tier audit.

---

## Decision

### 1. Enforcement Flag in LicenseManager

`LicenseManager` reads `SECUREYEOMAN_LICENSE_ENFORCEMENT` (default `false`). New methods:

- `isEnforcementEnabled(): boolean` — whether gating is active.
- `isFeatureAllowed(feature): boolean` — returns `true` when enforcement is off OR the feature is licensed.
- `toStatusObject()` now includes `enforcementEnabled: boolean`.

### 2. Backend Route Guards

`requiresLicense(feature, getLicenseManager)` — a Fastify `preHandler` hook factory in `license-guard.ts`. Returns `402 Payment Required` with `{ error: 'enterprise_license_required', feature, tier }` when the feature is not allowed. Pure CPU, no DB call.

Guards are applied to:

| Feature | Routes | File |
|---------|--------|------|
| `adaptive_learning` | 6 distillation + finetune write endpoints | `training-routes.ts` |
| `sso_saml` | 3 admin SSO CRUD endpoints | `sso-routes.ts` |
| `multi_tenancy` | 5 tenant CRUD endpoints | `tenant-routes.ts` |
| `cicd_integration` | 1 webhook endpoint | `cicd-webhook-routes.ts` |
| `advanced_observability` | 4 alert rule write endpoints | `alert-routes.ts` |

Public/discovery and read-only GET routes remain unguarded.

### 3. Dashboard FeatureLock Component

`<FeatureLock feature="..." />` wraps enterprise content. When enforcement is off (default), children render normally. When enforcement is on and the feature is not licensed, children are dimmed with a lock overlay showing the feature name, description, and an "Upgrade to Enterprise" link.

`useLicense()` hook updated: `hasFeature()` always returns `true` when `enforcementEnabled` is `false`.

### 4. Enforcement Disabled by Default

`SECUREYEOMAN_LICENSE_ENFORCEMENT` defaults to `false`. All features remain accessible in both community and enterprise tiers. Enforcement activation is deferred to Phase 106-B (tier audit + commercial launch).

---

## Consequences

### Positive

- Gating infrastructure is in place and tested before enforcement is needed.
- Zero disruption to existing installations — all features remain accessible.
- 402 response code is semantically correct (payment required) and distinct from 401/403.
- `FeatureLock` component provides graceful degradation with upgrade prompts rather than blank 403 screens.
- Route guards are stateless (no DB call), adding negligible latency.

### Negative

- Two-phase rollout means enterprise features are technically accessible to community users until 106-B ships.
- `as Record<string, unknown>` cast needed on route options due to Fastify websocket plugin overload ambiguity — cosmetic, not a type safety issue.

### Risks

- If 106-B is delayed, there is no enforcement. Acceptable for pre-release.
- Adding future enterprise features requires remembering to add both route guard and FeatureLock wrapper.

---

## Alternatives Considered

1. **Enable enforcement immediately** — Would break all existing community installations. Rejected: too disruptive before tier audit.
2. **Feature flags per route in config** — More flexible but over-engineered for the current 5-feature scope. Rejected: YAGNI.
3. **Middleware-level gating** — Apply to entire route prefixes. Rejected: too coarse (would gate read-only endpoints).
