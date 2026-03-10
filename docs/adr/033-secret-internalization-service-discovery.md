# ADR 033: Secret Internalization & Connection-Driven Service Discovery

**Status**: Accepted
**Date**: 2026-03-09

## Context

SecureYeoman previously required operators to manually generate and configure multiple cryptographic keys (`SECUREYEOMAN_SIGNING_KEY`, `SECUREYEOMAN_TOKEN_SECRET`, `SECUREYEOMAN_ENCRYPTION_KEY`) and integration API keys (`AGNOSTIC_API_KEY`, `AGNOS_GATEWAY_API_KEY`, etc.) in `.env` files. This created several problems:

1. **High setup friction**: New deployments required generating 4+ random secrets before the server could start.
2. **No rotation**: Manually-set keys were never rotated unless the operator intervened.
3. **Wasted secrets**: Integration API keys were generated for services that might not exist in the deployment.
4. **No centralized management**: Secrets lived in flat files with no audit trail or lifecycle tracking.

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

## Consequences

### Positive
- **Zero-config startup**: `SECUREYEOMAN_ADMIN_PASSWORD` is the only required env var.
- **Automatic rotation**: All auto-generated keys have 90-day rotation tracked by `SecretRotationManager`.
- **No wasted secrets**: Integration keys only exist when the service is actively connected.
- **Vault-native deployments**: Enterprise operators can skip `.env` entirely with `init --vault`.
- **Audit trail**: All secret lifecycle events flow through SecretsManager with metadata tracking.

### Negative
- **SecretsManager dependency**: Core startup now requires SecretsManager to be initialized before route registration.
- **State in database**: Auto-generated keys live in the secrets store (database-backed by default), adding a database dependency for key material. Mitigated by `process.env` mirroring and Vault backend option.

### Neutral
- Externally-provided keys continue to work exactly as before — the only change is they're now optional.
- The `init` command still generates a `.env` file by default; `--vault` is opt-in.
