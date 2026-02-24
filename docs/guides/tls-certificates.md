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

For mTLS, set `caPath` to the CA that signed client certificates.

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
