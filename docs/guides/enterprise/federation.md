# Multi-Instance Federation Guide (Phase 79)

Federation allows multiple SecureYeoman instances to share knowledge, marketplace skills, and personality configurations securely.

## Concepts

- **Peer**: another SecureYeoman instance you trust
- **Shared Secret**: a random string (e.g. `openssl rand -hex 32`) agreed by both sides
- **Feature Flags**: per-peer toggles for knowledge sharing, marketplace access, and personality bundle exchange

## Setting Up Federation

### 1. Generate a shared secret
```bash
openssl rand -hex 32
# Example: a3f8c2e1d4b7a096...
```

Both Instance A and Instance B must use the same secret.

### 2. Register the peer on Instance A
```bash
curl -X POST https://instance-a.example.com/api/v1/federation/peers \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://instance-b.example.com",
    "name": "Instance B",
    "sharedSecret": "a3f8c2e1d4b7a096..."
  }'
```

### 3. Register the peer on Instance B (same secret, reversed URL)
```bash
curl -X POST https://instance-b.example.com/api/v1/federation/peers \
  -H "Authorization: Bearer <your-jwt>" \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://instance-a.example.com",
    "name": "Instance A",
    "sharedSecret": "a3f8c2e1d4b7a096..."
  }'
```

Both instances are now peers. The status will be checked every 60 seconds automatically.

## Dashboard — Federation Tab

In **Connections → Federation**:
- View all peers with their status badges (online/offline/unknown) and last-seen time
- **Add Peer** — enter URL, name, and shared secret
- **Check Health** — manually trigger a health ping
- **Browse Marketplace** — view a peer's published skills and install them locally
- **Feature Toggles** — enable/disable knowledge, marketplace, or personality exchange per peer
- **Personality Bundles** — export/import personalities as encrypted `.syi` files

## Federated Knowledge Search (MCP)

The `knowledge_search` MCP tool now accepts an optional `instanceId` parameter:

```json
{
  "name": "knowledge_search",
  "arguments": {
    "query": "deployment best practices",
    "instanceId": "peer-uuid-here"
  }
}
```

This searches the remote instance's knowledge base through the federation proxy.

## Personality Bundles

Export a personality from Instance A:
```bash
curl -X POST https://instance-a.example.com/api/v1/federation/personalities/<id>/export \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d '{"passphrase": "my-strong-passphrase"}' \
  --output personality.syi
```

Import on Instance B:
```bash
# Convert to base64 first
BUNDLE=$(base64 -w0 personality.syi)
curl -X POST https://instance-b.example.com/api/v1/federation/personalities/import \
  -H "Authorization: Bearer <jwt>" \
  -H "Content-Type: application/json" \
  -d "{\"bundle\": \"${BUNDLE}\", \"passphrase\": \"my-strong-passphrase\", \"nameOverride\": \"Imported from A\"}"
```

> **Note**: `integrationAccess` settings are automatically downgraded to `suggest` mode on import to prevent unintended write access.

## Security Notes

- Shared secrets are stored AES-256-GCM encrypted at rest (HKDF-SHA256 key derivation)
- SSRF protection blocks private/loopback addresses (RFC-1918, 127.x.x.x, etc.)
- Peer-incoming routes only accept Bearer tokens matching a stored peer's shared secret hash
- TLS is required for production peers (use `https://` URLs)
