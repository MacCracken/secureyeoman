# ADR 115 — CSRF Protection: Not Applicable to Bearer-Token API

**Date:** 2026-02-23
**Status:** Accepted
**Deciders:** SecureYeoman Core Team

---

## Context

Friday's security suggestions listed "CSRF Protection: Implement anti-CSRF tokens" as a priority item. This ADR evaluates whether CSRF protection is required for the SecureYeoman API and documents the architectural decision.

---

## Decision

**CSRF protection is not required** for the SecureYeoman REST API in its current form. The API is stateless and uses HTTP Bearer tokens exclusively for authentication. No session cookies are used.

### Why CSRF does not apply

CSRF (Cross-Site Request Forgery) attacks exploit the browser's automatic attachment of **cookies** to cross-origin requests. The attack flow is:

1. User logs into `victim.com` — browser stores a session cookie.
2. User visits `attacker.com` — the attacker's page makes a cross-origin request to `victim.com`.
3. Browser automatically attaches the session cookie → victim.com processes the request as authenticated.

This attack vector **does not exist** when:
- Authentication is done via `Authorization: Bearer <token>` headers.
- Custom headers (`Authorization`) cannot be added by cross-origin requests without a CORS preflight (which the SecureYeoman server rejects for untrusted origins).
- The JWT/API key is stored in browser memory or localStorage, not in a cookie.

The SecureYeoman gateway uses:
- JWT Bearer tokens (issued by `POST /api/v1/auth/login`)
- API keys via `X-API-Key` header
- No `Set-Cookie` headers anywhere in the authentication flow

### CORS as the actual defence

The `@fastify/cors` plugin (or equivalent) restricts which origins can make credentialed cross-origin requests. This is the appropriate protection for a Bearer-token API — it ensures that even if an attacker tricks a browser into making a request, the `Authorization` header cannot be added by untrusted origin scripts.

---

## Consequences

**If cookies are ever introduced** (e.g., for SSO session refresh, persistent login, or remember-me tokens), the following MUST be implemented before shipping:
1. `SameSite=Strict` or `SameSite=Lax` on all session cookies.
2. A synchronizer token (or Double Submit Cookie) pattern for state-changing endpoints.
3. A `csrf-protection` middleware (e.g., `@fastify/csrf-protection`).

A lint guard is added as a comment in `server.ts` near cookie-related code to remind future developers.

---

## Files Changed

| File | Change |
|---|---|
| `docs/adr/115-csrf-not-applicable-bearer-token-api.md` | This document |
| `docs/security/security-model.md` | Add explicit CSRF section clarifying the Bearer-token stance |
| `packages/core/src/gateway/server.ts` | Add comment guard near cookie/session code |
