# Licensing Guide

SecureYeoman uses a **dual-license model**: AGPL-3.0 for open-source use, and a commercial license for enterprises that cannot accept AGPL terms.

---

## Which license applies to you?

| Situation | License |
|-----------|---------|
| Self-hosting for personal or internal use, publishing any modifications | **AGPL-3.0** (free) |
| Contributing to the open-source project | **AGPL-3.0** + CLA |
| Offering SecureYeoman as a hosted service to third parties | **Commercial license required** |
| Enterprise with internal policy that prohibits AGPL | **Commercial license required** |
| Academic research or non-profit use | **AGPL-3.0** (free) |

---

## Community Tier

No license key is needed for community use. All core features are available under AGPL-3.0:

- Full agent system (personalities, memories, skills)
- All integrations (Telegram, Slack, Discord, Gmail, GitHub, …)
- Multi-agent swarms and A2A delegation
- Workflow engine and CI/CD webhooks
- MCP tools and marketplace
- Audit chain, RBAC, rate limiting
- REST API and dashboard

---

## Enterprise Features

The following capabilities are part of the enterprise tier and require a valid license key:

| Feature | Identifier |
|---------|-----------|
| Adaptive Learning Pipeline (Phase 92) | `adaptive_learning` |
| SSO / SAML integration | `sso_saml` |
| Multi-tenancy / Row-Level Security | `multi_tenancy` |
| CI/CD Integration (Phase 90) | `cicd_integration` |
| Advanced Observability (Phase 83) | `advanced_observability` |

> **Note**: Runtime enforcement (API gating, UI locks) is planned — see the roadmap item "License-gated feature reveal". Until that ships, the license system is instrumented but not enforced.

---

## Setting a License Key

### Environment variable (recommended for production)

```bash
# In your .env file:
SECUREYEOMAN_LICENSE_KEY=<your-key>
```

The key is read at startup. No restart is required if you use the API or CLI method below.

### CLI

```bash
secureyeoman license set <your-key>
secureyeoman license status
```

### Dashboard

Navigate to **Settings → General → License** and paste the key into the input field, then click **Apply**.

### API

```bash
# Set key
curl -X POST https://localhost:18789/api/v1/license/key \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"key":"<your-key>"}'

# Read status
curl https://localhost:18789/api/v1/license/status \
  -H "Authorization: Bearer $TOKEN"
```

---

## Purchasing a Commercial License

Contact the project maintainers to purchase a commercial license key. Keys encode your organisation name, seat count, enabled features, and optional expiry date.

Keys are validated entirely offline — no network call is made, no telemetry is sent.

---

## Maintainer: Issuing Keys

Keys are generated with the signing script. First-time setup:

```bash
# Generate the Ed25519 keypair (one-time; stores .license-private.pem)
npx tsx scripts/generate-license-key.ts --init
# Copy the printed public key into packages/core/src/licensing/license-manager.ts → PUBLIC_KEY_PEM
```

Issue a key:

```bash
npx tsx scripts/generate-license-key.ts \
  --org "Acme Corp" \
  --tier enterprise \
  --seats 50 \
  --features adaptive_learning,sso_saml,cicd_integration \
  --expires 365
```

The `--init` flag must only be run once. The private key in `.license-private.pem` must never be committed or shared.

---

## Contributor License Agreement

By submitting a pull request you agree to the CLA in `CONTRIBUTING.md`, which allows your contribution to be included in commercial distributions of SecureYeoman.

---

## References

- [LICENSE](../../LICENSE) — AGPL-3.0 full text
- [LICENSE.commercial](../../LICENSE.commercial) — Commercial license template
- [ADR 171 — Dual Licensing](../adr/171-dual-licensing.md) — Architectural decision record
- [Getting Started](./getting-started.md) — Installation and first run
