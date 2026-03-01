# ADR 160: Multi-Instance Federation (Phase 79)

**Date**: 2026-02-28
**Status**: Accepted
**Phase**: 79

## Context

SecureYeoman instances running in different environments (on-prem, cloud, team-specific) need to share knowledge, marketplace skills, and personality configurations without merging their databases or exposing internal APIs to the internet without authentication.

## Decision

Implement a **federation layer** with the following design:

### Peer Authentication
Each peer pair establishes a shared secret. The accepting instance stores:
- `shared_secret_hash` — SHA-256 hex for inbound Bearer validation
- `shared_secret_enc` — AES-256-GCM (HKDF-SHA256, `federation-peer-secret-v1` info string) encrypted raw secret for outbound calls

This means neither the hash nor the encrypted form is plaintext; even a DB leak does not expose usable credentials.

### SSRF Guard
All peer URLs go through `assertSafeUrl()` which rejects loopback, private RFC-1918, and link-local ranges before any network call is made.

### Federated Surfaces
- **Knowledge search** — peer's `/api/v1/federation/knowledge/search` proxied via `GET /api/v1/federation/peers/:id/knowledge/search` on the origin
- **Marketplace** — read-only browse + install from peer's skill catalog
- **Personality bundles** — AES-256-GCM encrypted `.syi` files for air-gapped transport; `integrationAccess` downgraded to `suggest` on import

### Standard Auth Routes vs. Peer-Incoming Routes
- Outward management routes (CRUD, bundle export/import) use standard JWT/API-key auth
- Peer-incoming routes (`/api/v1/federation/knowledge/search`, `/api/v1/federation/marketplace`) use a custom `preHandler` that validates the Bearer token against `shared_secret_hash`. These routes are in `PUBLIC_ROUTES` to bypass the standard auth hook.

### Health Cycle
`FederationManager` runs a 60-second interval that pings all peers' `/health/ready` endpoints. Status + `last_seen` are updated in `federation.peers`.

## Consequences

**Positive:**
- Zero-trust federation: no inter-instance JWT sharing, secrets are encrypted at rest
- Federated knowledge search extends `knowledge_search` MCP tool via optional `instanceId` param
- Air-gapped personality transport via passphrase-encrypted bundles

**Negative:**
- Shared secret rotation requires manual update on both instances
- Personality bundle import does not currently re-create brain skills (knowledge entries only)
- Federation peer routes bypass standard RBAC enforcement (use their own auth)

## Migrations
- 065 — `federation.peers`, `federation.sync_log`
