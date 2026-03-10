# ADR 035: Security Hardening — Architectural Audit

**Status**: Accepted
**Date**: 2026-03-10

## Context

A deep architectural security audit conducted on 2026-03-09/10 identified 14 vulnerabilities across authentication, authorization, encryption, and sandboxing subsystems. Findings were categorized by severity (4 critical, 4 high, 4 medium, 2 low) and addressed in three batches over 2026-03-10.

The audit covered the full attack surface: OAuth/OIDC token storage, JWT issuance and verification, SSO callback flows, CSP headers, resource authorization, dynamic code execution, and MCP service token privileges.

## Decision

### 1. Encrypt Secrets at Rest

OAuth tokens (`access_token_enc`, `refresh_token_enc`), OIDC client secrets (`client_secret_enc`), and pending OAuth tokens are encrypted using AES-256-GCM envelope encryption before storage. The encryption key is derived via SHA-256 from `SECUREYEOMAN_TOKEN_ENCRYPTION_KEY` (preferred) or `SECUREYEOMAN_TOKEN_SECRET` to produce a 32-byte key. A backward-compatible fallback reads unencrypted values from pre-migration rows.

### 2. Move Ephemeral Auth State to Database

OAuth state parameters, pending OAuth tokens, and SSO authorization codes were previously stored in in-memory Maps. These are now persisted in PostgreSQL tables (`auth.oauth_state`, `auth.pending_oauth_tokens`, `auth.sso_auth_codes`), each with TTL-based expiry. This survives process restarts and eliminates unbounded memory growth from abandoned auth flows.

### 3. JWT Hardening

All issued JWTs now include `iss: 'secureyeoman'` and `aud: 'secureyeoman-api'` claims. Verification validates both claims. Tokens issued before this change (missing `iss`/`aud`) are still accepted to avoid breaking active sessions during rollout.

### 4. PKCE for OAuth

All OAuth authorization code flows now use RFC 7636 Proof Key for Code Exchange with S256 code challenge method. `generateCodeVerifier()` produces a cryptographically random verifier; `generateCodeChallenge()` computes the SHA-256 challenge. The verifier is stored with the OAuth state and sent during token exchange.

### 5. Authorization Code Pattern for SSO

SSO callbacks no longer embed JWT tokens in URL fragments. Instead, a short-lived (60 second) authorization code is generated and stored in `auth.sso_auth_codes`. The frontend exchanges this code for a JWT via `POST /api/v1/auth/sso/exchange`. Codes are single-use and deleted on exchange or expiry.

### 6. Nonce-Based CSP

Content Security Policy headers now use per-request nonces generated from `randomBytes(16)`. The `script-src` directive is set to `'self' 'nonce-{n}' 'strict-dynamic'`, replacing the previous static policy. The nonce is injected into the HTML response for inline script tags.

### 7. IDOR Ownership Guard

A `canAccessResource()` guard was added to document, memory, and knowledge routes. It checks that the requesting user matches the resource's `createdBy`, `userId`, or `personalityId` field. Users with `admin`, `operator`, or `service` roles bypass the ownership check.

### 8. V8 Isolate Sandbox

Dynamic tool execution now uses `isolated-vm` (optional dependency) to run untrusted code in a true V8 isolate with a 128 MB memory limit. When `isolated-vm` is not installed, execution falls back to `vm.runInNewContext` with a reduced timeout. The isolate approach provides process-level memory isolation that the `vm` module cannot guarantee.

### 9. Least-Privilege Service Token

The MCP service token was changed from the `admin` role to a dedicated `service` role with 6 scoped permissions covering only the resources MCP tools actually access. This limits blast radius if the service token is compromised.

## Consequences

### Positive

- **14 vulnerabilities addressed**: All critical and high severity findings resolved in a single release cycle.
- **Defense in depth**: Layered protections (encryption at rest, PKCE, nonce CSP, IDOR guards) reduce the impact of any single bypass.
- **Restart resilience**: Auth state survives process restarts without requiring sticky sessions or external session stores.
- **Audit-friendly**: JWT claims and ownership guards produce clear audit trails for access decisions.

### Negative

- **Migration complexity**: Three new `auth.*` tables and column additions to existing OAuth tables require a coordinated migration.
- **Backward-compatibility fallbacks**: Pre-migration tokens (unencrypted values, JWTs without `iss`/`aud`) are accepted temporarily, creating a transitional period where both old and new formats coexist.
- **Optional dependency**: The `isolated-vm` package requires native compilation. Environments without a C++ toolchain fall back to the weaker `vm` sandbox.

### Neutral

- Existing test suites were updated to include the new JWT claims and encrypted token flows. No test coverage regression.
- The `SECUREYEOMAN_TOKEN_SECRET` fallback for key derivation means no new environment variable is strictly required for existing deployments.

## References

- RFC 7636: Proof Key for Code Exchange (PKCE)
- `packages/core/src/security/` — RBAC, DLP, and auth subsystem
- `packages/core/src/gateway/server.ts` — CSP header middleware
- ADR 015: Data Loss Prevention (complementary data protection layer)
