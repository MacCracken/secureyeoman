# ADR 071: SSO/OIDC via openid-client (Okta, Azure AD, Auth0)

**Status:** Accepted  
**Date:** 2026-02-19  
**Phase:** 20b

## Context

SecureYeoman had OAuth 2.0 for integrations but no user-authentication SSO. Enterprise deployments require OIDC support for Okta, Azure AD, and Auth0.

SAML is left as a future extension — the schema supports it via `type IN ('oidc', 'saml')`.

## Decision

**Library:** `openid-client` v6 — standards-compliant, handles discovery, PKCE, token exchange, and userinfo.

1. **Migration 024:** `auth.identity_providers` (OIDC + future SAML fields) and `auth.identity_mappings` (IDP user → local user).
2. **Migration 025:** `auth.sso_state` for PKCE code_verifier + state (10-minute TTL, PG-backed — survives restarts).
3. **SsoStorage:** IDP CRUD, mapping lookup/update, state store/fetch/delete with TTL enforcement.
4. **SsoManager:** OIDC discovery via `openid-client`, PKCE authorization URL generation, callback handling, user provisioning (JIT creation when `auto_provision=true`).
5. **sso-routes.ts:** Public routes (list providers, authorize redirect, callback), admin routes (CRUD providers).
6. **secureyeoman.ts:** Initialize `SsoStorage` + `SsoManager` after `AuthService`.
7. **server.ts:** Register SSO routes; dashboard redirect on callback with token in URL fragment.

## Consequences

### Positive
- Supports any standards-compliant OIDC provider without provider-specific code.
- JIT user provisioning: no manual user creation required for SSO users.
- State persisted in DB → survives restarts / multi-instance deployments.

### Negative
- `openid-client` adds ~300 KB to the bundle.
- Client secrets stored in plaintext in DB (future: encrypt via keyring).

### Risks
- PKCE state expiry (10 min) must align with IDP session timeout.
- `auto_provision: false` mode requires pre-creating users by email.

## Files Changed
- `packages/core/src/storage/migrations/024_sso_identity_providers.sql` — NEW
- `packages/core/src/storage/migrations/025_sso_state.sql` — NEW
- `packages/core/src/security/sso-storage.ts` — NEW
- `packages/core/src/security/sso-manager.ts` — NEW
- `packages/core/src/gateway/sso-routes.ts` — NEW
- `packages/core/src/gateway/server.ts` — register SSO routes
- `packages/core/src/secureyeoman.ts` — initialize SsoManager
- `packages/core/package.json` — add openid-client ^6.0.0

---

## Phase 25 Corrections (2026-02-20)

Two defects discovered during the Phase 25 bug hunt:

1. **Operator precedence in authorize route scheme calculation** — In
   `sso-routes.ts`, the expression
   `header ?? (app.server as any).encrypted ? 'https' : 'http'`
   was parsed by JavaScript as `(header ?? encrypted) ? 'https' : 'http'` because
   `??` has higher precedence than the ternary operator. When a reverse proxy sets
   `x-forwarded-proto: http`, the header value (`'http'`) was truthy, so the
   ternary always evaluated to `'https'` — the redirect URI sent to the IDP used
   `https://` even for plain-HTTP deployments, causing a redirect URI mismatch.
   Fixed by adding explicit parentheses:
   `header ?? ((app.server as any).encrypted ? 'https' : 'http')`.

2. **PKCE state not consumed on provider mismatch** — In `sso-manager.ts`,
   `deleteSsoState()` was called *after* the provider ID mismatch check. When the
   provider IDs didn't match, the exception was thrown before the state was deleted,
   leaving it valid in the DB until its 10-minute TTL. An attacker who intercepted
   a state value could try it against different provider IDs without the state being
   invalidated. Fixed by moving `deleteSsoState()` to immediately after the null
   check, before any other validation — ensuring the one-time token is consumed
   regardless of what happens next.

### New Tests (Phase 25)
- `sso-manager.test.ts` — state consumed on provider mismatch; IDP error response
  (`access_denied`); malformed callback (bad/missing code); missing code param
- `sso-routes.test.ts` — `x-forwarded-proto: http` → `http://` redirect URI;
  `x-forwarded-proto: https` → `https://` redirect URI; absent header → fallback;
  workspace param forwarded; missing state param; IDP error in callback; expired
  state redirect

### Files Changed (Phase 25)
- `packages/core/src/security/sso-manager.ts` — state consumed before mismatch check
- `packages/core/src/gateway/sso-routes.ts` — operator-precedence fix in authorize route
- `packages/core/src/security/sso-manager.test.ts` — new edge-case tests
- `packages/core/src/gateway/sso-routes.test.ts` — new scheme + callback error tests
