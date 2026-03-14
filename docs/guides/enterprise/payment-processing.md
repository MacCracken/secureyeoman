# Payment Processing: LemonSqueezy

> Overview of SecureYeoman's payment processor, why we chose it, and how it compares to alternatives.

---

## What Is LemonSqueezy?

[LemonSqueezy](https://www.lemonsqueezy.com) is a **Merchant of Record (MoR)** platform purpose-built for software companies selling digital products, SaaS subscriptions, and license keys. As your MoR, LemonSqueezy is the legal seller of your product — it handles:

- **Global tax compliance** — calculates, collects, files, and remits sales tax / VAT in every jurisdiction on your behalf
- **Payment processing** — credit cards, PayPal, and 21+ payment methods across 95 currencies
- **Subscription billing** — recurring charges, upgrades, downgrades, cancellations
- **License key management** — automatic key issuance after purchase, with revocation and reissue controls
- **Fraud protection** — AI-based risk scoring to reduce chargebacks
- **Chargeback & dispute handling** — LemonSqueezy handles disputes as the merchant of record
- **Abandoned cart recovery** — timed email sequences to recover incomplete checkouts
- **Checkout overlay** — embeddable overlay widget (no redirect needed)

In July 2024, **Stripe acquired LemonSqueezy**. The platform now runs on Stripe's infrastructure via Stripe Managed Payments, combining LemonSqueezy's simplicity with Stripe's scale and reliability.

---

## Why LemonSqueezy for SecureYeoman

| Requirement | LemonSqueezy Fit |
|---|---|
| **No business tax burden** | MoR handles all tax filing — critical for a solo/small-team open-source project |
| **Software license keys** | Built-in license key issuance per sale, webhook-driven — maps directly to our Ed25519 signing flow |
| **Subscription billing** | Native annual subscription support for Pro / Solopreneur / Enterprise tiers |
| **Checkout overlay** | Embeddable JS widget — no redirect away from dashboard, seamless UX |
| **No monthly fees** | Pay-per-sale model — zero cost until revenue flows |
| **Webhook-driven** | Order events fire webhooks to our `secureyeoman-licensing` service for key minting |
| **Stripe infrastructure** | Post-acquisition, benefits from Stripe's payment reliability and global reach |

---

## Fee Structure

### Base Fees

| Component | Rate |
|---|---|
| Platform fee | **5% + $0.50** per transaction |
| International transactions (outside US) | +1.5% |
| PayPal payments | +1.5% |
| Subscription billing | +0.5% |

### Payout Fees

| Destination | Fee |
|---|---|
| US bank account (via Stripe) | Free |
| International bank (via Stripe) | 1% per payout |
| US PayPal | $0.50 per payout |
| International PayPal | 3% (capped at $30) per payout |

### Marketing Feature Fees (optional)

| Feature | Fee |
|---|---|
| Abandoned cart recovery | +5% on recovered sales |
| Affiliate referral tracking | +3% on referred sales |
| Affiliate payouts | +2% on affiliate commissions |

### Effective Fee Examples (SecureYeoman Tiers)

| Scenario | Sale Price | Effective Fee | You Receive |
|---|---|---|---|
| US customer, card, Pro annual | $20 | 5% + $0.50 = **$1.50** (7.5%) | $18.50 |
| US customer, card, Solopreneur | $100 | 5% + $0.50 = **$5.50** (5.5%) | $94.50 |
| US customer, card, Enterprise | $1,000 | 5% + $0.50 = **$50.50** (5.05%) | $949.50 |
| EU customer, PayPal, Pro annual | $20 | 5% + 1.5% + 1.5% + $0.50 = **$2.10** (10.5%) | $17.90 |
| EU customer, card, Enterprise | $1,000 | 5% + 1.5% + $0.50 = **$65.50** (6.55%) | $934.50 |

> Higher-priced tiers absorb the fixed $0.50 component better. The Enterprise tier at $1,000 keeps effective rates around 5-6.5%.

---

## Competitive Comparison

### Processor Overview

| Platform | Type | Base Fee | Tax Handling | License Keys | Checkout Widget |
|---|---|---|---|---|---|
| **LemonSqueezy** | MoR | 5% + $0.50 | Included (files & remits) | Built-in | Overlay widget |
| **Paddle** | MoR | 5% + $0.50 | Included (files & remits) | Via API | Overlay widget |
| **Stripe** (direct) | Payment processor | 2.9% + $0.30 | Stripe Tax add-on (extra) | None | Checkout redirect |
| **Gumroad** | MoR | 10% + $0.50 | Included | Built-in | Hosted page |
| **FastSpring** | MoR | ~5.5-8.9% | Included (files & remits) | Built-in | Popup / embed |
| **Polar** | MoR | 4% + $0.40 | Included | Via API | Checkout page |

### Why Not the Alternatives?

**Stripe (direct)** — Lowest fees at 2.9% + $0.30, but Stripe is a payment processor, not a merchant of record. You become the legal seller, meaning you must register for sales tax in every jurisdiction, file returns, handle VAT, and manage disputes yourself. For a small team, the tax compliance burden alone negates the fee savings. No built-in license key management.

**Paddle** — Very similar to LemonSqueezy (same fee structure, MoR, overlay checkout). Paddle is a strong alternative and was the leading MoR before LemonSqueezy entered the market. The trade-offs are minor: Paddle's fees are all-inclusive (no add-ons for international/PayPal), but their onboarding process is longer and historically more enterprise-focused. LemonSqueezy's built-in license key support and simpler dashboard made it a better fit for our use case.

**Gumroad** — 10% base fee is double LemonSqueezy's rate. At $25K annual revenue, you'd pay ~$3,225 with Gumroad vs ~$1,250 with LemonSqueezy. Gumroad is oriented toward creators selling digital downloads, not software license subscriptions.

**FastSpring** — Established MoR with strong B2B features, but fees are higher and less transparent. Better suited for large software companies with complex pricing models and dedicated finance teams.

**Polar** — Newer entrant at 4% + $0.40 (cheapest MoR). Open-source friendly. However, the platform is younger, has a smaller track record, and lacks built-in license key management. Worth watching as the ecosystem matures.

### Fee Comparison at Scale

Annual revenue of **$25,000** (mixed tiers):

| Platform | Approximate Annual Cost | Effective Rate |
|---|---|---|
| Stripe (direct) | ~$725 + tax compliance costs | 2.9% + tax ops |
| Polar | ~$1,000 | ~4% |
| LemonSqueezy | ~$1,250 | ~5% |
| Paddle | ~$1,250 | ~5% |
| Gumroad | ~$3,225 | ~10%+ |

> LemonSqueezy and Paddle are comparable at ~5%. The ~$525 premium over Stripe buys you full tax compliance, dispute handling, and license key management — easily worth it for a small team.

---

## SecureYeoman Integration Architecture

```
┌─────────────┐     checkout overlay      ┌──────────────────┐
│  Dashboard   │ ──────────────────────►  │  LemonSqueezy    │
│  (React)     │                          │  Checkout        │
│              │ ◄── success event ────── │                  │
└──────┬───────┘                          └────────┬─────────┘
       │                                           │
       │ poll GET /api/v1/licenses/by-order/:id    │ webhook POST
       │                                           │ /webhook/lemonsqueezy
       ▼                                           ▼
┌──────────────────────────────────────────────────────────┐
│                secureyeoman-licensing                     │
│                                                          │
│  • Validates webhook signature                           │
│  • Mints Ed25519-signed license key                      │
│  • Stores key + order metadata in SQLite                 │
│  • Serves key to dashboard via API                       │
└──────────────────────────────────────────────────────────┘
       │
       │ POST /api/v1/license/key
       ▼
┌─────────────┐
│  SY Core    │  Validates signature, extracts tier,
│  Instance   │  gates enterprise features
└─────────────┘
```

### Key Integration Points

1. **`useLemonCheckout.ts`** — React hook that loads `lemon.js` overlay and handles checkout success events
2. **Environment variables** — `VITE_LEMONSQUEEZY_PRO_URL`, `VITE_LEMONSQUEEZY_SOLOPRENEUR_URL`, `VITE_LEMONSQUEEZY_ENTERPRISE_URL`
3. **Webhook handler** — `POST /webhook/lemonsqueezy` in the licensing service validates the signing secret and triggers key minting
4. **License enforcement** — Controlled by `SECUREYEOMAN_LICENSE_ENFORCEMENT` env var (defaults to `false` for community edition)

---

## Risks and Considerations

| Risk | Mitigation |
|---|---|
| **Stripe acquisition uncertainty** — product roadmap and fee changes post-acquisition | LemonSqueezy checkout URLs are the only integration point; switching to Paddle or Polar would require changing 3 env vars and a webhook handler |
| **International fee stacking** — EU + PayPal + subscription can push fees to ~8.5% | Enterprise tier ($1,000) absorbs this well; Pro tier ($20) is less efficient but acceptable at launch scale |
| **Single point of failure** — LemonSqueezy outage blocks purchases | License enforcement defaults to off; existing keys continue working. Purchases can wait. Manual key minting via CLI is always available as fallback |
| **Fee increases** — post-acquisition pricing may change | Architecture is processor-agnostic by design; the licensing service only cares about webhook payloads, not the payment source |

---

## References

- [LemonSqueezy Pricing](https://www.lemonsqueezy.com/pricing)
- [LemonSqueezy Fee Documentation](https://docs.lemonsqueezy.com/help/getting-started/fees)
- [LemonSqueezy Merchant of Record](https://docs.lemonsqueezy.com/help/payments/merchant-of-record)
- [2026 Update: LemonSqueezy + Stripe Managed Payments](https://www.lemonsqueezy.com/blog/2026-update)
- [Fee Comparison: Stripe vs Polar vs LemonSqueezy vs Gumroad](https://userjot.com/blog/stripe-polar-lemon-squeezy-gumroad-transaction-fees)
- [LemonSqueezy Alternatives (post-acquisition)](https://www.creem.io/blog/lemonsqueezy-alternatives-after-stripe-acquisition)

---

*See also: [Licensing Guide](licensing.md) | [Go-Live Checklist](../../development/go-live-checklist.md) | [Roadmap](../../development/roadmap.md)*
