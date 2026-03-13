# Secrets Management

SecureYeoman provides a unified `SecretsManager` that stores sensitive values (API keys, tokens, passwords) in your chosen backend. The backend is selected once at startup and all reads/writes go through it — existing code that calls `getSecret()` / `requireSecret()` continues to work unchanged.

## Backends

| Backend  | Description |
|----------|-------------|
| `auto`   | **Default.** Prefers system keyring if available; falls back to the file backend when a `storePath` is configured, otherwise uses environment variables. |
| `env`    | Read from `process.env`. Writes update in-process only. Good for read-only external secrets (e.g., Docker/Kubernetes secrets mounted as env vars). |
| `keyring`| System OS keyring — macOS Keychain or Linux Secret Service. Requires `secret-tool` (Linux) or the `security` CLI (macOS). |
| `file`   | AES-256-GCM encrypted file on disk. Requires `masterKey` and `storePath`. |
| `vault`  | OpenBao / HashiCorp Vault KV v2. Supports AppRole and static-token authentication. |

## Configuration

```yaml
# ~/.config/secureyeoman/config.yaml
security:
  secretBackend: vault   # auto | env | keyring | file | vault

  vault:
    address: http://127.0.0.1:8200   # Vault / OpenBao URL
    mount: secret                     # KV v2 mount path
    namespace: ""                     # (optional) Vault Enterprise namespace
    roleIdEnv: VAULT_ROLE_ID          # env-var name holding AppRole role_id
    secretIdEnv: VAULT_SECRET_ID      # env-var name holding AppRole secret_id
    tokenEnv: VAULT_TOKEN             # env-var name holding a static token (overrides AppRole)
    fallback: true                    # fall back to env when Vault unreachable
```

## Using Vault / OpenBao

### AppRole (recommended)

1. Enable AppRole auth on your Vault server:
   ```sh
   vault auth enable approle
   vault write auth/approle/role/secureyeoman \
     token_ttl=1h token_max_ttl=4h policies=secureyeoman
   ```

2. Export the credentials:
   ```sh
   export VAULT_ROLE_ID=$(vault read -field=role_id auth/approle/role/secureyeoman/role-id)
   export VAULT_SECRET_ID=$(vault write -field=secret_id -f auth/approle/role/secureyeoman/secret-id)
   ```

3. Set the backend:
   ```yaml
   security:
     secretBackend: vault
     vault:
       address: https://vault.example.com
       mount: secret
   ```

The application caches the short-lived token in memory and re-authenticates automatically on 403 responses (token expiry).

### Static Token

For development or CI:
```sh
export VAULT_TOKEN=my-dev-token
```
```yaml
security:
  secretBackend: vault
  vault:
    tokenEnv: VAULT_TOKEN
```

## Dashboard

The **Settings → Security** tab exposes a **Secrets** panel:

- **List** — displays all stored secret names (values are never shown)
- **Add** — enter a name (uppercase alphanumeric/underscore) and value; secret is stored immediately in the configured backend
- **Delete** — removes the secret from the backend

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/secrets` | List secret names |
| `GET`  | `/api/v1/secrets/:name` | Check existence |
| `PUT`  | `/api/v1/secrets/:name` | Create / update `{ value }` |
| `DELETE` | `/api/v1/secrets/:name` | Delete |

All mutating operations are recorded as `secret_access` security audit events.

## Secret Rotation

Enable automatic rotation to receive warnings and trigger callbacks when secrets approach expiry:

```yaml
security:
  rotation:
    enabled: true
    checkIntervalMs: 3600000           # check every hour
    warningDaysBeforeExpiry: 7
    tokenRotationIntervalDays: 30
    signingKeyRotationIntervalDays: 90
```

When a secret is rotated, the new value is automatically persisted through `SecretsManager` to the configured backend (vault, file, keyring) in addition to updating in-memory services.
