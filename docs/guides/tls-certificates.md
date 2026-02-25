# TLS / HTTPS Certificates

SecureYeoman's API gateway can serve over HTTPS. The `TlsManager` handles certificate lifecycle — loading configured certs, detecting expiry, and auto-generating development certs when needed.

## Quick Start (Development)

Enable TLS with automatic self-signed cert generation:

```yaml
# ~/.config/secureyeoman/config.yaml
gateway:
  tls:
    enabled: true
    autoGenerate: true   # generates certs in <dataDir>/tls/
```

On first startup, SecureYeoman generates:
- `<dataDir>/tls/ca-cert.pem` — self-signed CA
- `<dataDir>/tls/server-cert.pem` — server certificate (signed by CA)
- `<dataDir>/tls/server-key.pem` — server private key

> **Requires** `openssl` on `PATH`. Most systems have it pre-installed.
> Self-signed certs will trigger browser warnings — trust the CA cert or use a proper cert for any shared environment.

## Production (Bring Your Own Cert)

Supply your certificate and key files directly:

```yaml
gateway:
  tls:
    enabled: true
    certPath: /etc/ssl/certs/secureyeoman.crt
    keyPath:  /etc/ssl/private/secureyeoman.key
    # caPath: /etc/ssl/certs/ca.crt   # enable mTLS (client cert verification)
```

> **`caPath` enables mTLS** — when set, the server requires every client to present a certificate signed by that CA. Only set this if you explicitly want mutual TLS (e.g. machine-to-machine with client certs). Do **not** set `caPath` just to provide the intermediate chain — it is not needed for standard HTTPS.

### AWS ACM Wildcard Certificates

AWS Certificate Manager exports certs as plain-text PEM files. ACM-exported private keys are **encrypted with a passphrase** — you must decrypt before use:

```bash
# Export from ACM (note the passphrase you choose)
aws acm export-certificate \
  --certificate-arn arn:aws:acm:REGION:ACCOUNT:certificate/CERT-ID \
  --passphrase $(echo -n "yourpassphrase" | base64) \
  --region us-east-1 \
  --query PrivateKey --output text > certs/private_key.txt

# Decrypt (enter passphrase when prompted)
openssl rsa -in certs/private_key.txt -out certs/private_key_decrypted.txt
chmod 600 certs/private_key_decrypted.txt
```

ACM also provides the certificate and chain as separate downloads. Map them to config:

```yaml
gateway:
  tls:
    enabled: true
    certPath: certs/certificate.txt        # the leaf cert (or fullchain)
    keyPath:  certs/private_key_decrypted.txt
    caPath:   certs/certificate_chain.txt  # intermediate chain
```

> **Note:** ACM-managed public certs (created inside ACM) cannot have their private key exported — they are only usable with AWS-native services (ALB, CloudFront, API Gateway). To use a cert on your own server you need an ACM Private CA cert, a Let's Encrypt cert, or another externally-managed cert.

> **Security:** Keep `certs/` in `.gitignore`. Never commit private keys.

## Certificate Expiry

`TlsManager` checks the configured cert's `notAfter` date at startup (via `openssl x509`). An expiry warning is issued 30 days before the certificate expires.

The dashboard Security overview card shows:
- TLS enabled / disabled
- Days until expiry
- Warning badge when within 30 days
- Expired badge when past expiry

## Dashboard

**Security → Overview** includes a **TLS / HTTPS** status card showing:

| State | Display |
|-------|---------|
| TLS disabled | Grayed lock icon |
| Valid cert | Green lock · N days remaining |
| Expiring soon | Yellow lock · "Expires in Nd" |
| Expired | Red lock · "Cert expired" |
| Self-signed | "(self-signed)" badge + regenerate button |

## REST API

| Method | Path | Description |
|--------|------|-------------|
| `GET`  | `/api/v1/security/tls` | Cert status (expiry, paths, flags) |
| `POST` | `/api/v1/security/tls/generate` | Regenerate self-signed cert (dev only, blocked in production) |

## Remote Access

SecureYeoman is **local-first by default**. The gateway only accepts connections from RFC 1918 private ranges and loopback (`127.0.0.1`, `10.x`, `172.16–31.x`, `192.168.x`). All other IPs get a `403 Access Denied`. This is intentional and is not configurable via environment variables — it requires an explicit opt-in in the config file.

To allow access from a routable IP (e.g. enterprise network, cloud VM, or custom hostname resolving to a public IP), set `allowRemoteAccess: true`. **Always pair this with TLS** — accepting credentials over plain HTTP from a public network exposes session tokens to interception.

```yaml
gateway:
  allowRemoteAccess: true
  tls:
    enabled: true
    certPath: /path/to/certificate.pem
    keyPath:  /path/to/private_key.pem
```

> When running in Docker, the gateway sees inter-container traffic as `::ffff:172.x.x.x` (IPv6-mapped IPv4). These addresses are correctly identified as private — inter-container proxy traffic does **not** require `allowRemoteAccess`.

### File Permissions in Docker

The gateway runs as a non-root user inside the container. Private key files must be readable by that user when bind-mounted. There are three approaches, in order of preference:

**Option 1 — Match container UID (most secure)**

Find the UID the container runs as, then `chown` the key to match:

```bash
# Find the container UID
docker exec secureyeoman-core-1 id secureyeoman

# Set ownership and keep tight permissions
chown <UID> certs/private_key_decrypted.txt
chmod 600 certs/private_key_decrypted.txt
```

**Option 2 — World-readable (dev only)**

Acceptable on a single-user dev machine where no other OS users can access the file:

```bash
chmod 644 certs/private_key_decrypted.txt
```

> Do not use `644` in shared or production environments.

**Option 3 — Secrets manager (production)**

Don't bind-mount key files at all. Store the key in HashiCorp Vault or your cloud provider's secrets manager and configure SecureYeoman to retrieve it via the secrets backend (see [Secrets Management](./secrets-management.md)). The `keyPath` config then points to a path written by the secrets manager at startup.

## Full TLS Setup via Environment Variables

All gateway TLS settings are configured through environment variables — no `secureyeoman.yaml` required. Add the following to `.env.dev` (gitignored):

```bash
# Gateway TLS
SECUREYEOMAN_TLS_ENABLED=true
SECUREYEOMAN_TLS_CERT_PATH=/app/certs/certificate.txt    # path inside the Docker container
SECUREYEOMAN_TLS_KEY_PATH=/app/certs/private_key_decrypted.txt
SECUREYEOMAN_ALLOW_REMOTE_ACCESS=true                    # allow non-LAN access; pair with TLS
SECUREYEOMAN_CORS_ORIGINS=https://dev.yourdomain.com:3000

# Gateway URLs (must match — use https:// when TLS is enabled)
VITE_GATEWAY_URL=https://core:18789
MCP_CORE_URL=https://core:18789

# Vite dev server HTTPS (paths relative to repo root)
VITE_ALLOWED_HOSTS=dev.yourdomain.com    # comma-separated; allows custom hostnames
VITE_TLS_CERT=certs/certificate.txt
VITE_TLS_KEY=certs/private_key_decrypted.txt
```

**To revert to plain HTTP**, comment out everything above. The defaults (`SECUREYEOMAN_TLS_ENABLED` unset → `false`, gateway URLs `http://`) take effect automatically on next container restart.

When `VITE_TLS_CERT` and `VITE_TLS_KEY` are set, Vite starts an HTTPS server on port 3000. Without them it falls back to plain HTTP.

> The `VITE_TLS_KEY` must be an **unencrypted** PEM key. Decrypt with `openssl rsa` first (see AWS ACM section above).

### MCP → Core over HTTPS

The MCP service reaches the core gateway at `https://core:18789` (Docker-internal hostname). Because the TLS cert is issued for a public hostname (e.g. `dev.yourhost.com`) rather than `core`, a standard TLS handshake would fail hostname verification.

The MCP `CoreApiClient` handles this automatically: when `MCP_CORE_URL` starts with `https://`, it uses a per-connection undici `Agent` with `rejectUnauthorized: false` for all MCP→core calls. All other HTTPS calls made by the MCP process (web scraping, external APIs) still use the default agent and perform full certificate verification.

No `NODE_TLS_REJECT_UNAUTHORIZED` env var is needed.

### DNS

Add a DNS A record pointing your chosen hostname to your machine's IP. For local-only use, `/etc/hosts` works:

```
127.0.0.1  dev.secureyeoman.ai
```

## Trusting the Self-Signed CA (macOS / Linux)

### macOS
```sh
sudo security add-trusted-cert -d -r trustRoot \
  -k /Library/Keychains/System.keychain ~/.secureyeoman/data/tls/ca-cert.pem
```

### Linux (Debian / Ubuntu)
```sh
sudo cp ~/.secureyeoman/data/tls/ca-cert.pem /usr/local/share/ca-certificates/secureyeoman-dev.crt
sudo update-ca-certificates
```

### curl / httpie
```sh
curl --cacert ~/.secureyeoman/data/tls/ca-cert.pem https://localhost:18789/api/v1/health
```
