# Payment Processing

> Overview of SecureYeoman's payment processing architecture and provider evaluation.

---

## Current Status

**Payment provider: TBD.** LemonSqueezy rejected our application (2026-03-18) citing chargeback risk concerns for the product category. We are evaluating alternatives.

The licensing architecture is **provider-agnostic by design** — swapping the payment backend requires changing webhook handlers and a few environment variables, not the core license validation flow.

---

## Requirements

| Requirement | Notes |
|---|---|
| **Merchant of Record (MoR)** | Critical for a solo/small-team project — MoR handles global tax compliance, filing, and remittance |
| **Software license keys** | Built-in or API-driven key issuance per sale |
| **Subscription billing** | Annual subscriptions for Pro / Solopreneur / Enterprise tiers |
| **Checkout widget** | Embeddable overlay preferred (no redirect away from dashboard) |
| **No monthly fees** | Pay-per-sale model — zero cost until revenue flows |
| **Webhook-driven** | Order events fire webhooks for key provisioning |

---

## Provider Evaluation

| Platform | Type | Base Fee | Tax Handling | License Keys | Checkout Widget | Status |
|---|---|---|---|---|---|---|
| **Polar** | MoR | 4% + $0.40 | Included | Via API | Checkout page | **Evaluating** |
| **Paddle** | MoR | 5% + $0.50 | Included | Via API | Overlay widget | **Evaluating** |
| **Stripe** (direct) | Processor | 2.9% + $0.30 | Stripe Tax add-on | None | Checkout redirect | Backup option |
| **Gumroad** | MoR | 10% + $0.50 | Included | Built-in | Hosted page | Too expensive |
| **FastSpring** | MoR | ~5.5-8.9% | Included | Built-in | Popup / embed | Enterprise-focused |
| ~~LemonSqueezy~~ | ~~MoR~~ | ~~5% + $0.50~~ | ~~Included~~ | ~~Built-in~~ | ~~Overlay widget~~ | **Rejected** |

### Leading Candidates

**Polar** — Newest entrant at 4% + $0.40 (cheapest MoR). Open-source friendly. License key management via API. Worth serious evaluation as the ecosystem has matured.

**Paddle** — Established MoR, same fee tier as LemonSqueezy. Strong B2B features, overlay checkout, good API. Longer onboarding but proven track record.

**Stripe (direct)** — Lowest fees at 2.9% + $0.30, but not a MoR. You become the legal seller and must handle global tax compliance yourself. No built-in license keys. Best as a fallback if MoR options don't work out.

### Fee Comparison at $25K Annual Revenue

| Platform | Approximate Annual Cost | Effective Rate |
|---|---|---|
| Stripe (direct) | ~$725 + tax compliance costs | 2.9% + tax ops |
| Polar | ~$1,000 | ~4% |
| Paddle | ~$1,250 | ~5% |
| Gumroad | ~$3,225 | ~10%+ |

---

## Integration Architecture (Provider-Agnostic)

```
┌─────────────┐     checkout overlay      ┌──────────────────┐
│  Dashboard   │ ──────────────────────►  │  Payment Provider │
│  (React)     │                          │  Checkout         │
│              │ ◄── success + key ────── │  (generates key)  │
└──────┬───────┘                          └────────┬──────────┘
       │                                           │
       │ POST /api/v1/license/key                  │ webhook POST
       │ (key applied directly)                    │ /webhook/payment
       ▼                                           ▼
┌─────────────┐                          ┌──────────────────────┐
│  SY Core    │                          │ sy-licensing (admin)  │
│  Instance   │                          │                      │
│             │──→ Provider API: validate │ • Audit log          │
│  Cache tier │    (once + periodic)     │ • Purchase records   │
│  Gate feats │                          │ • Revenue dashboard  │
└─────────────┘                          └──────────────────────┘
```

### Key Integration Points

1. **Checkout hook** — React hook that loads provider's checkout widget, receives license key on success, auto-applies to SY instance
2. **Provider validator** — Validates keys via provider API with local caching (24h TTL, 7-day offline grace period)
3. **Dual key support** — SY accepts both provider-issued keys (online validation, cached) and Ed25519 keys (offline validation via embedded public key)
4. **Environment variables** — Checkout URLs per tier, plus optional variant IDs for tier mapping
5. **License enforcement** — Controlled by `SECUREYEOMAN_LICENSE_ENFORCEMENT` env var (defaults to `false` for community edition)
6. **`secureyeoman-licensing`** — Admin dashboard and audit log; Ed25519 key minting preserved as fallback

---

## Tiers & Pricing

| Tier | Price | Billing | Target Audience |
|------|-------|---------|-----------------|
| **Community** | Free | — | Hobbyists, evaluators |
| **Pro** | $20/year | Annual | Developers, power users |
| **Solopreneur** | $100/year | Annual | Solo operators, consultants |
| **Enterprise** | $1,000/year | Annual | Organizations, regulated industries |

---

## Risks and Mitigations

| Risk | Mitigation |
|---|---|
| **Provider rejection** — MoR platforms may decline based on product category | Architecture is provider-agnostic; Ed25519 CLI key minting always available as offline fallback |
| **Fee changes** — post-acquisition or policy changes | Swapping providers requires changing webhook handlers and env vars, not core logic |
| **Provider outage** — blocks purchases | License enforcement defaults to off; existing keys continue working; manual key minting via CLI |

---

## References

- [Polar Pricing](https://polar.sh/pricing)
- [Paddle Pricing](https://www.paddle.com/pricing)
- [Stripe Pricing](https://stripe.com/pricing)

---

*See also: [Licensing Guide](licensing.md) | [Go-Live Checklist](../../development/go-live-checklist.md) | [Roadmap](../../development/roadmap.md)*
