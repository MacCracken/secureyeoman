# ADR 057: Swarms Security Policy & Per-Personality Sub-Agent Settings

**Status**: Accepted
**Phase**: 17
**Date**: 2026-02-18

---

## Context

Phase 17 introduced Agent Swarms (ADR 055) but the global security policy had no way to gate swarm access separately from sub-agent delegation. Additionally, per-personality creation config (`CreationConfigSchema`) allowed enabling sub-agents but had no fine-grained control over whether that personality could also use A2A networking or agent swarms.

Two related requests arrived simultaneously:

1. **Security policy**: Add an `allowSwarms` toggle to the Security Settings dashboard under Sub-Agent Delegation, analogous to the existing `allowA2A` toggle. The Swarms tab in Sub-Agents view should be hidden when the policy is disabled.

2. **Per-personality settings**: When a personality has `creationConfig.subAgents = true`, add nested A2A and Swarms enablement toggles (`allowA2A`, `allowSwarms`) so each personality can independently opt in or out of those capabilities, subject to the global policy ceiling.

---

## Decision

### 1. Global Security Policy — `allowSwarms`

Added `allowSwarms: z.boolean().default(false)` to `SecurityConfigSchema` in `packages/shared/src/types/config.ts`, alongside the existing `allowSubAgents` and `allowA2A` fields.

Propagated throughout the stack:
- `secureyeoman.ts`: `updateSecurityPolicy()` and `loadSecurityPolicyFromDb()` handle `allowSwarms`
- `gateway/server.ts`: GET and PATCH `/api/v1/security/policy` include `allowSwarms`
- `dashboard/api/client.ts`: `SecurityPolicy` interface and default fallback updated
- `SecuritySettings.tsx`: Swarms toggle rendered inside the `{subAgentsAllowed && ...}` nested block alongside A2A, using `Layers` icon

The Swarms tab in `SubAgentsPage.tsx` is filtered out when `securityPolicy.allowSwarms` is false. If the active tab is 'swarms' and the policy is later disabled, a `useEffect` resets to 'active'. The tab order is `active → swarms → history → profiles` (Swarms moved to second position, closer to the primary content).

### 2. Per-Personality Sub-Agent Settings — `allowA2A` and `allowSwarms` in `CreationConfig`

Added `allowA2A` and `allowSwarms` boolean fields to `CreationConfigSchema` in `packages/shared/src/types/soul.ts`.

In `PersonalityEditor.tsx`, these appear as nested items below the "New Sub-Agents" row when `creationConfig.subAgents === true`. Each shows:
- The label, icon, and enabled/disabled state
- A "disabled by security policy" indicator when the global policy blocks the feature
- A toggle that is disabled (not interactive) when globally blocked

The `toggleCreationItem` function accepts the two new keys. The "Enable All" toggle intentionally excludes `allowA2A` and `allowSwarms` — they must be explicitly enabled since they represent opt-in capabilities within sub-agent delegation.

---

## Consequences

- **Backward-compatible**: `allowSwarms` defaults to `false`; `CreationConfig.allowA2A` and `CreationConfig.allowSwarms` default to `false` via Zod schema. Existing personalities and configs are unaffected.
- **Security model**: Swarms are now a first-class citizen in the security policy hierarchy: global kill switch → personality opt-in → runtime execution.
- **Test coverage**: New tests in `SecuritySettings.test.tsx` (hide/show Swarms toggle, toggle mutation) and `SubAgentsPage.test.tsx` (Swarms tab hidden/shown, tab ordering).
- **Related**: ADR 034 (sub-agent delegation), ADR 037 (A2A protocol), ADR 055 (agent swarms), ADR 056 (per-personality model fallbacks).
