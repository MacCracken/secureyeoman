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

> **Note**: Dashboard UI shows feature availability via green/grey chips and expiry countdown banners (Phase 106 partial). Backend route guards (`402 Payment Required`) and CLI guards are planned — see the roadmap item "License-gated feature reveal".

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

The license card shows your current tier, organisation, seat count, and expiry date. All five enterprise features are listed with green chips (available) or grey/locked chips (not included in your key). If your license expires within 30 days, a countdown banner appears.

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

## Trial Period

New installations include a **45-day grace period** during which all features are unlocked, regardless of the enforcement configuration. This gives you time to evaluate Pro and Enterprise features before deciding whether to purchase a license.

- The grace period starts automatically on first boot
- The dashboard shows a trial banner with the number of days remaining
- After the grace period expires, unlicensed features are gated (if enforcement is enabled)
- Applying a valid license key at any time — during or after the trial — unlocks features permanently

The grace period duration is configurable via `licensing.gracePeriodDays` in your system config (default: 45, set to 0 to disable).

---

## Purchasing a Commercial License

Purchase a license through the in-app checkout (Settings → License → Upgrade) or via the LemonSqueezy store page. After purchase:

- **In-app checkout**: License key is applied automatically
- **External purchase**: You'll receive your license key via email — paste it into Settings → License or set it via the CLI/API

Keys are validated via the LemonSqueezy API on first use, then cached locally for offline resilience (24-hour refresh cycle, 7-day offline grace). Ed25519 self-signed keys (issued via CLI) are validated entirely offline.

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
- [ADR 012 — Operations & Lifecycle](../adr/012-operations-and-lifecycle.md) — Architectural decision record
- [Getting Started](./getting-started.md) — Installation and first run
