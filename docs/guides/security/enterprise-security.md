# Enterprise Security Features

Six security features added in the [2026.3.11] release, spanning passwordless authentication, emergency access, identity provisioning, access governance, tenant resource controls, and compliance reporting.

## License Requirements

| Feature | Tier | License Feature |
|---------|------|-----------------|
| WebAuthn/FIDO2 | Community | None |
| Break-Glass Emergency Access | Enterprise | `break_glass` |
| SCIM 2.0 Provisioning | Enterprise | `sso_saml` |
| Access Review & Entitlements | Enterprise | `compliance_governance` |
| Per-Tenant Quotas | Enterprise | `multi_tenancy` |
| Compliance SoA Generator | Enterprise | `compliance_governance` |

## WebAuthn/FIDO2

Passwordless authentication using hardware security keys and platform authenticators. Available to all tiers with no license requirement. Uses pure `node:crypto` with no external dependencies.

Supports ES256 (P-256 ECDSA) and RS256 key algorithms. Counter-based replay protection rejects authenticator responses with a non-incrementing counter.

### Endpoints

```
POST /api/v1/auth/webauthn/register/options    — Generate registration challenge
POST /api/v1/auth/webauthn/register/verify     — Verify registration response
POST /api/v1/auth/webauthn/authenticate/options — Generate authentication challenge
POST /api/v1/auth/webauthn/authenticate/verify  — Verify authentication response
GET  /api/v1/auth/webauthn/credentials          — List registered credentials
DELETE /api/v1/auth/webauthn/credentials/:id    — Remove a credential
```

### Usage

```bash
# 1. Get registration options (returns challenge + RP info)
curl -X POST http://localhost:3000/api/v1/auth/webauthn/register/options \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json'

# 2. Pass the options to navigator.credentials.create(), then verify
curl -X POST http://localhost:3000/api/v1/auth/webauthn/register/verify \
  -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d '{"id": "...", "rawId": "...", "response": {...}, "type": "public-key"}'
```

## Break-Glass Emergency Access

Provides emergency administrative access when normal authentication is unavailable. Generates a 256-bit sealed recovery key (SHA-256 hashed at rest) that grants a 1-hour JWT session. All password comparisons use constant-time algorithms.

### Endpoints

```
POST /api/v1/security/break-glass/activate     — Activate emergency session (unauthenticated)
GET  /api/v1/security/break-glass/sessions      — List active break-glass sessions
POST /api/v1/security/break-glass/sessions/:id/revoke — Revoke a session
POST /api/v1/security/break-glass/keys          — Generate a new recovery key
```

The `/activate` endpoint is unauthenticated by design but rate-limited to 5 requests per 15 minutes to prevent brute-force attempts.

### CLI

```bash
secureyeoman break-glass        # Interactive emergency activation
secureyeoman bg                 # Alias
secureyeoman bg --key <key>     # Non-interactive activation
```

## SCIM 2.0 Provisioning

Full SCIM 2.0 server for automated user and group provisioning from identity providers (Okta, Azure AD, OneLogin, etc.). Supports SCIM filter parsing and PatchOp for partial updates.

### Endpoints

```
GET    /api/v1/scim/v2/Users                    — List/filter users
POST   /api/v1/scim/v2/Users                    — Create user
GET    /api/v1/scim/v2/Users/:id                — Get user
PUT    /api/v1/scim/v2/Users/:id                — Replace user
PATCH  /api/v1/scim/v2/Users/:id                — Patch user
DELETE /api/v1/scim/v2/Users/:id                — Deactivate user
GET    /api/v1/scim/v2/Groups                   — List/filter groups
POST   /api/v1/scim/v2/Groups                   — Create group
GET    /api/v1/scim/v2/Groups/:id               — Get group
PUT    /api/v1/scim/v2/Groups/:id               — Replace group
PATCH  /api/v1/scim/v2/Groups/:id               — Patch group
DELETE /api/v1/scim/v2/Groups/:id               — Delete group
GET    /api/v1/scim/v2/ServiceProviderConfig    — SCIM capabilities
GET    /api/v1/scim/v2/ResourceTypes            — Supported resource types
GET    /api/v1/scim/v2/Schemas                  — SCIM schemas
```

SCIM endpoints authenticate via bearer token. Configure your IdP with the base URL `https://your-host/api/v1/scim/v2/` and a service account token.

## Access Review & Entitlement Reporting

Campaign-based access reviews for periodic entitlement certification. Campaigns follow a lifecycle: `open` -> `in_review` -> `closed` or `expired`. When a campaign is closed, entitlements marked as `denied` are automatically revoked.

### Endpoints

```
POST /api/v1/security/access-review/campaigns          — Create a campaign
GET  /api/v1/security/access-review/campaigns          — List campaigns
GET  /api/v1/security/access-review/campaigns/:id      — Get campaign details
POST /api/v1/security/access-review/campaigns/:id/close — Close campaign (triggers revocation)
GET  /api/v1/security/access-review/campaigns/:id/entitlements — List entitlements in campaign
POST /api/v1/security/access-review/campaigns/:id/decisions    — Submit review decisions
```

### Usage

```bash
# Create a review campaign
curl -X POST http://localhost:3000/api/v1/security/access-review/campaigns \
  -H 'Content-Type: application/json' \
  -d '{"name": "Q1 2026 Access Review", "scope": "all", "dueDate": "2026-04-01"}'

# Submit decisions (approve or deny each entitlement)
curl -X POST http://localhost:3000/api/v1/security/access-review/campaigns/{id}/decisions \
  -H 'Content-Type: application/json' \
  -d '{"decisions": [{"entitlementId": "...", "action": "approve"}, {"entitlementId": "...", "action": "deny"}]}'
```

## Per-Tenant Rate Limiting & Token Budgets

Sliding-window rate limits and token budgets on a per-tenant basis. Rate limits are enforced per-minute and per-hour. Token budgets are enforced per-day and per-month.

### Endpoints

```
GET    /api/v1/tenants/:tenantId/quotas           — Get current quotas
PUT    /api/v1/tenants/:tenantId/quotas           — Set quota limits
GET    /api/v1/tenants/:tenantId/quotas/usage     — Get current usage counters
POST   /api/v1/tenants/:tenantId/quotas/reset     — Reset usage counters
GET    /api/v1/tenants/:tenantId/quotas/history    — Usage history over time
PUT    /api/v1/tenants/:tenantId/quotas/tokens    — Set token budget limits
```

### Usage

```bash
# Set rate limits and token budgets for a tenant
curl -X PUT http://localhost:3000/api/v1/tenants/tenant-1/quotas \
  -H 'Content-Type: application/json' \
  -d '{"requestsPerMinute": 60, "requestsPerHour": 1000}'

curl -X PUT http://localhost:3000/api/v1/tenants/tenant-1/quotas/tokens \
  -H 'Content-Type: application/json' \
  -d '{"tokensPerDay": 500000, "tokensPerMonth": 10000000}'
```

## Compliance SoA Generator

Generates a Statement of Applicability mapping SecureYeoman capabilities to controls across five compliance frameworks. Covers 74 controls total.

| Framework | Controls |
|-----------|----------|
| NIST 800-53 | Access Control, Audit, System Integrity, etc. |
| SOC 2 | Trust Services Criteria (CC series) |
| ISO 27001 | Annex A controls |
| HIPAA | Administrative, Physical, Technical Safeguards |
| EU AI Act | Risk management, transparency, human oversight |

### Endpoints

```
GET  /api/v1/compliance/soa/frameworks              — List available frameworks
GET  /api/v1/compliance/soa/controls                — List all 74 controls
GET  /api/v1/compliance/soa/controls/:framework     — Controls for one framework
GET  /api/v1/compliance/soa/generate                — Generate full SoA (JSON)
GET  /api/v1/compliance/soa/generate?format=markdown — Generate full SoA (Markdown)
GET  /api/v1/compliance/soa/status                  — Compliance status summary
```

```bash
# Generate a HIPAA-only SoA in Markdown
curl 'http://localhost:3000/api/v1/compliance/soa/generate?framework=hipaa&format=markdown'
```
