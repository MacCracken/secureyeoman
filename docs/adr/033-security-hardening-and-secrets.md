# ADR 033: Security Hardening, Secrets Internalization & Service Discovery

**Status**: Accepted
**Date**: 2026-03-09 (updated 2026-03-10)

## Context

### Secrets & Service Discovery

SecureYeoman previously required operators to manually generate and configure multiple cryptographic keys (`SECUREYEOMAN_SIGNING_KEY`, `SECUREYEOMAN_TOKEN_SECRET`, `SECUREYEOMAN_ENCRYPTION_KEY`) and integration API keys (`AGNOSTIC_API_KEY`, `AGNOS_GATEWAY_API_KEY`, etc.) in `.env` files. This created several problems:

1. **High setup friction**: New deployments required generating 4+ random secrets before the server could start.
2. **No rotation**: Manually-set keys were never rotated unless the operator intervened.
3. **Wasted secrets**: Integration API keys were generated for services that might not exist in the deployment.
4. **No centralized management**: Secrets lived in flat files with no audit trail or lifecycle tracking.

### Security Hardening

A deep architectural security audit conducted on 2026-03-09/10 identified 14 vulnerabilities across authentication, authorization, encryption, and sandboxing subsystems. Findings were categorized by severity (4 critical, 4 high, 4 medium, 2 low) and addressed in three batches over 2026-03-10.

The audit covered the full attack surface: OAuth/OIDC token storage, JWT issuance and verification, SSO callback flows, CSP headers, resource authorization, dynamic code execution, and MCP service token privileges.

## Decision

### 1. Auto-Generate Cryptographic Keys at Startup

The `SecurityModule.initializeSecrets()` method now auto-generates four core secrets on first boot when they are not externally provided:

| Secret | Category | Rotation |
|--------|----------|----------|
| `SECUREYEOMAN_SIGNING_KEY` | `signing` | 90 days |
| `SECUREYEOMAN_TOKEN_SECRET` | `signing` | 90 days |
| `SECUREYEOMAN_ENCRYPTION_KEY` | `encryption` | 90 days |
| `SECUREYEOMAN_WEBHOOK_SECRET` | `api_key` | 90 days |

Generated keys are 256-bit (`randomBytes(32).toString('base64url')`), stored in `SecretsManager`, and mirrored to `process.env` so downstream code (Fastify auth, HMAC verification) reads them transparently via `getSecret()`.

When an operator explicitly sets a key in `.env` or Vault, that key is imported into `SecretsManager` with `source: 'external'` and auto-rotation is disabled for that secret.

### 2. Vault / OpenBao Support via `secureyeoman init --vault`

The `init` CLI command gains five new flags:

```
--vault              Push keys to Vault/OpenBao KV v2 instead of .env
--vault-addr URL     Vault server address (also reads VAULT_ADDR)
--vault-token TOKEN  Vault token (also reads VAULT_TOKEN)
--vault-mount NAME   KV v2 mount path (default: "secret")
--vault-prefix PATH  Key prefix in Vault (default: "secureyeoman")
```

When `--vault` is used, all generated keys are written to `{mount}/data/{prefix}/{KEY_NAME}` and no `.env` file is created. The `VaultBackend` (existing SecretsManager backend) handles read/write operations.

### 3. Connection-Driven Service Discovery

Instead of auto-generating integration API keys at startup (wasteful for services that don't exist), ecosystem services use an on-demand activation model:

**Lifecycle**: `unknown` → probe → `reachable`/`unreachable` → enable → `enabled` → disable → `disabled`

The `ServiceDiscoveryManager` maintains a registry of known ecosystem services:

| Service | Health Endpoint | Secrets Generated |
|---------|----------------|-------------------|
| `agnostic` | `{AGNOSTIC_URL}/api/v1/health` | `AGNOSTIC_API_KEY`, `AGNOSTIC_WEBHOOK_SECRET` |
| `agnos` | `{AGNOS_RUNTIME_URL}/health` | `AGNOS_GATEWAY_API_KEY`, `AGNOS_RUNTIME_API_KEY` |

**Enable flow**:
1. Probe health endpoint with 5s timeout
2. If unreachable → reject with 502
3. Generate 256-bit keys for each secret in the service definition
4. Store in SecretsManager + mirror to `process.env`
5. Mark service as `enabled`

**Disable flow**:
1. Delete secrets from SecretsManager
2. Clear from `process.env`
3. Mark service as `disabled`

This is exposed via:
- **REST API**: `GET/POST /api/v1/ecosystem/services[/:id][/probe|enable|disable]`
- **Dashboard UI**: Toggle cards in Connections > MCP > YEOMAN MCP

### 4. Secret Resolution via `getSecret()`

All route handlers that previously read secrets from `process.env` directly now use `getSecret()` from the config loader. This function checks `process.env` (which is mirrored from SecretsManager at startup), providing a single resolution path regardless of whether the secret was auto-generated, imported from Vault, or set in `.env`.

Affected routes:
- `cicd-webhook-routes.ts` — `SECUREYEOMAN_WEBHOOK_SECRET`, `NORTHFLANK_WEBHOOK_SECRET`
- `integration-routes.ts` — `AGNOSTIC_API_KEY`

### 5. Encrypt Secrets at Rest

OAuth tokens (`access_token_enc`, `refresh_token_enc`), OIDC client secrets (`client_secret_enc`), and pending OAuth tokens are encrypted using AES-256-GCM envelope encryption before storage. The encryption key is derived via SHA-256 from `SECUREYEOMAN_TOKEN_ENCRYPTION_KEY` (preferred) or `SECUREYEOMAN_TOKEN_SECRET` to produce a 32-byte key. A backward-compatible fallback reads unencrypted values from pre-migration rows.

### 6. Move Ephemeral Auth State to Database

OAuth state parameters, pending OAuth tokens, and SSO authorization codes were previously stored in in-memory Maps. These are now persisted in PostgreSQL tables (`auth.oauth_state`, `auth.pending_oauth_tokens`, `auth.sso_auth_codes`), each with TTL-based expiry. This survives process restarts and eliminates unbounded memory growth from abandoned auth flows.

### 7. JWT Hardening

All issued JWTs now include `iss: 'secureyeoman'` and `aud: 'secureyeoman-api'` claims. Verification validates both claims. Tokens issued before this change (missing `iss`/`aud`) are still accepted to avoid breaking active sessions during rollout.

### 8. PKCE for OAuth

All OAuth authorization code flows now use RFC 7636 Proof Key for Code Exchange with S256 code challenge method. `generateCodeVerifier()` produces a cryptographically random verifier; `generateCodeChallenge()` computes the SHA-256 challenge. The verifier is stored with the OAuth state and sent during token exchange.

### 9. Authorization Code Pattern for SSO

SSO callbacks no longer embed JWT tokens in URL fragments. Instead, a short-lived (60 second) authorization code is generated and stored in `auth.sso_auth_codes`. The frontend exchanges this code for a JWT via `POST /api/v1/auth/sso/exchange`. Codes are single-use and deleted on exchange or expiry.

### 10. Nonce-Based CSP

Content Security Policy headers now use per-request nonces generated from `randomBytes(16)`. The `script-src` directive is set to `'self' 'nonce-{n}' 'strict-dynamic'`, replacing the previous static policy. The nonce is injected into the HTML response for inline script tags.

### 11. IDOR Ownership Guard

A `canAccessResource()` guard was added to document, memory, and knowledge routes. It checks that the requesting user matches the resource's `createdBy`, `userId`, or `personalityId` field. Users with `admin`, `operator`, or `service` roles bypass the ownership check.

### 12. V8 Isolate Sandbox

Dynamic tool execution now uses `isolated-vm` (optional dependency) to run untrusted code in a true V8 isolate with a 128 MB memory limit. When `isolated-vm` is not installed, execution falls back to `vm.runInNewContext` with a reduced timeout. The isolate approach provides process-level memory isolation that the `vm` module cannot guarantee.

### 13. Least-Privilege Service Token

The MCP service token was changed from the `admin` role to a dedicated `service` role with 6 scoped permissions covering only the resources MCP tools actually access. This limits blast radius if the service token is compromised.

## Consequences

### Positive

- **Zero-config startup**: `SECUREYEOMAN_ADMIN_PASSWORD` is the only required env var.
- **Automatic rotation**: All auto-generated keys have 90-day rotation tracked by `SecretRotationManager`.
- **No wasted secrets**: Integration keys only exist when the service is actively connected.
- **Vault-native deployments**: Enterprise operators can skip `.env` entirely with `init --vault`.
- **Audit trail**: All secret lifecycle events flow through SecretsManager with metadata tracking.
- **14 vulnerabilities addressed**: All critical and high severity findings resolved in a single release cycle.
- **Defense in depth**: Layered protections (encryption at rest, PKCE, nonce CSP, IDOR guards) reduce the impact of any single bypass.
- **Restart resilience**: Auth state survives process restarts without requiring sticky sessions or external session stores.
- **Audit-friendly**: JWT claims and ownership guards produce clear audit trails for access decisions.

### Negative

- **SecretsManager dependency**: Core startup now requires SecretsManager to be initialized before route registration.
- **State in database**: Auto-generated keys live in the secrets store (database-backed by default), adding a database dependency for key material. Mitigated by `process.env` mirroring and Vault backend option.
- **Migration complexity**: Three new `auth.*` tables and column additions to existing OAuth tables require a coordinated migration.
- **Backward-compatibility fallbacks**: Pre-migration tokens (unencrypted values, JWTs without `iss`/`aud`) are accepted temporarily, creating a transitional period where both old and new formats coexist.
- **Optional dependency**: The `isolated-vm` package requires native compilation. Environments without a C++ toolchain fall back to the weaker `vm` sandbox.

### Neutral

- Externally-provided keys continue to work exactly as before — the only change is they're now optional.
- The `init` command still generates a `.env` file by default; `--vault` is opt-in.
- Existing test suites were updated to include the new JWT claims and encrypted token flows. No test coverage regression.
- The `SECUREYEOMAN_TOKEN_SECRET` fallback for key derivation means no new environment variable is strictly required for existing deployments.

## References

- RFC 7636: Proof Key for Code Exchange (PKCE)
- `packages/core/src/security/` — RBAC, DLP, and auth subsystem
- `packages/core/src/gateway/server.ts` — CSP header middleware
- ADR 015: Data Loss Prevention (complementary data protection layer)
