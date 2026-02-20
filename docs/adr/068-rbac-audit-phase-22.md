# ADR 068: RBAC Audit — Phase 22

**Date**: 2026-02-19
**Status**: Accepted

---

## Context

A full RBAC audit of the SecureYeoman gateway was performed in Phase 22 across three passes:

1. **Role Inventory** — enumerate defined roles and their permission sets
2. **Permission Validation** — verify every registered API route has a ROUTE_PERMISSIONS entry and that each role can reach the routes it should
3. **Edge Cases** — mTLS role assignment, auth management wildcards, missing resources in roles

The audit revealed four classes of defect:

### P0 — Broken Functionality

`role_operator` and `role_viewer` both defined a `connections` resource (rbac.ts lines 30 and 73) but every integration route in auth-middleware.ts requires the `integrations` resource. This naming mismatch meant operator and viewer could not access `/api/v1/integrations/*` at all.

### P1 — Security Issues

1. **mTLS role hardcoding** — `createAuthHook` (auth-middleware.ts line 373) hardcoded `role: 'operator'` for all certificate-authenticated clients regardless of their actual assigned role. Any client with a valid certificate received operator-level access even if assigned viewer.

2. **Wildcard auth-management permissions** — Auth routes (lines 47–56) used `{ resource: '*', action: '*' }` — only admin satisfies a wildcard match. This made `/api/v1/auth/api-keys` and `/api/v1/auth/verify` effectively admin-only by accident rather than by design.

3. **9 unmapped resources** — The following resources appeared in ROUTE_PERMISSIONS but were absent from every non-admin role definition: `dashboards`, `workspaces`, `experiments`, `marketplace`, `multimodal`, `brain`, `comms`, `model`, `mcp`. Non-admin users received 403 on all these routes.

### P2 — Route Coverage Gaps

Approximately 140 API routes were registered in route files but absent from ROUTE_PERMISSIONS. These fell through to the admin-only default-deny path. Key groups: `chat`, `conversations`, `execution`, `spirit`, `agents`, `proactive`, `a2a`, `browser`, `extensions`, `terminal`, `webhooks`, auth management sub-routes, soul sub-routes, integration extras, model extras.

---

## Decision

### 1. Fix `connections` → `integrations` naming (P0)

Replace `connections` with `integrations` in both `role_operator` and `role_viewer` permission blocks in `rbac.ts`.

### 2. Fix mTLS role lookup (P1)

`createAuthHook` now accepts an optional `rbac: RBAC` parameter. When a mTLS connection is authenticated, the hook calls `rbac.getUserRole(cert.subject.CN)` to look up the client's persisted role assignment, falling back to `'operator'` only when no assignment exists.

### 3. Replace wildcard auth permissions with specific `auth` resource (P1)

- `POST /api/v1/auth/verify` → `auth:read`
- `GET /api/v1/auth/api-keys` → `auth:read`
- `POST /api/v1/auth/api-keys` → `auth:write`
- `DELETE /api/v1/auth/api-keys/:id` → `auth:write`

`auth:read` is granted to `role_operator` (so operators can manage their own API keys). `auth:write` is granted only to `role_admin` (via wildcard `*:*`). Role/assignment CRUD routes (`/api/v1/auth/roles/*`, `/api/v1/auth/assignments/*`) also map to `auth:write` — admin-only by design.

### 4. Expand role definitions to cover unmapped resources (P1)

`role_operator` gains: `spirit`, `brain`, `comms`, `model`, `mcp`, `dashboards`, `workspaces`, `experiments`, `marketplace`, `multimodal`, `chat`, `execution`, `agents`, `proactive`, `browser`, `extensions`, `auth:read`.

`role_viewer` gains read-only access to: `integrations`, `spirit`, `brain`, `model`, `mcp`, `marketplace`, `dashboards`, `workspaces`, `reports`, `chat`.

`role_auditor` gains read access to: `execution`, `agents`, `proactive`, `browser`.

### 5. Add ~80 missing ROUTE_PERMISSIONS entries (P2)

All previously uncovered route groups are now enumerated in `ROUTE_PERMISSIONS`: soul sub-routes, spirit routes, chat/conversations, execution, terminal, agents, proactive, A2A, browser, extensions, auth management, OAuth management, integration extras, webhooks, model extras.

### 6. Add `/api/v1/auth/reset-password` to TOKEN_ONLY_ROUTES

Password reset is token-authenticated (the reset link carries a token) and does not go through RBAC.

---

## Consequences

- **Positive**: All non-admin roles now have correct access to integration, brain, model, mcp, spirit, chat, and other system resources. mTLS clients honour their persisted role assignment. Auth management routes are explicitly mapped rather than relying on wildcard accidents.
- **Positive**: ~80 previously admin-only routes are now accessible to the appropriate roles.
- **Positive**: The audit surface is fully documented and testable.
- **Neutral**: `auth:write` is admin-only (only `role_admin` has `*:*`). Operators can read/list API keys but cannot create or delete them (except their own through the normal UI flow which uses the admin token).
- **Risk mitigated**: mTLS clients can no longer escalate to operator by default — they are bound to their assigned role.

---

## Phase 25 Corrections (2026-02-20)

Phase 22 left six workspace-related route entries missing from `ROUTE_PERMISSIONS`, discovered
during the Phase 25 workspace RBAC audit:

| Route | Method | Was | Now |
|-------|--------|-----|-----|
| `/api/v1/workspaces/:id` | PUT | admin-only (unmapped) | `workspaces:write` |
| `/api/v1/workspaces/:id/members` | GET | admin-only (unmapped) | `workspaces:read` |
| `/api/v1/workspaces/:id/members/:userId` | PUT | admin-only (unmapped) | `workspaces:write` |
| `/api/v1/users` | GET | admin-only (unmapped) | `auth:read` |
| `/api/v1/users` | POST | admin-only (unmapped) | `auth:write` |
| `/api/v1/users/:id` | DELETE | admin-only (unmapped) | `auth:write` |

These were omitted when the Phase 22 audit added the workspace group — likely because the routes
existed in `workspace-routes.ts` but were not enumerated in the checklist used during that audit.
All six are now covered, along with workspace-scoped admin enforcement and member edge-case
hardening (see ADR 005 Phase 25 Corrections for full details).
