# ADR 191: Multi-Account AI Provider Keys & Per-Account Cost Tracking (Phase 112)

**Status**: Accepted
**Date**: 2026-03-03
**Phase**: 112

---

## Context

Each AI provider has a single API key stored as an environment variable (e.g.
`ANTHROPIC_API_KEY`) via `SecretsManager`. Personalities reference a provider +
model but not *which account*. Organizations that use separate billing accounts
per team, project, or cost center have no way to route personality A through one
API key and personality B through another. There is also no visibility into
per-key spending.

Additionally, the provider catalog was missing Groq and OpenRouter — two popular
inference platforms that offer OpenAI-compatible APIs.

---

## Decision

### 1. Provider Accounts as First-Class Entities

Introduce `ai.provider_accounts` and `ai.account_cost_records` tables in a new
`ai` schema (migration `003_provider_accounts.sql`). Each account stores a
provider name, a user-chosen label, a reference to the `SecretsManager` key
(`secret_name`), and metadata fields (`status`, `account_info`, `base_url`).

A partial unique index enforces at most one default account per provider per
tenant: `CREATE UNIQUE INDEX ... ON (provider, tenant_id) WHERE is_default = true`.

### 2. Key Resolution Chain

`ProviderAccountManager.resolveApiKey(provider, accountId?)` resolves the API
key via a deterministic fallback chain:

1. **Explicit accountId** — if the personality's `defaultModel.accountId` is set,
   use that account.
2. **Provider default** — the account marked `is_default = true` for that
   provider.
3. **Sole account** — if only one account exists for the provider, use it
   implicitly.
4. **Null** — fall back to `SecretsManager.get(config.model.apiKeyEnv)` (the
   legacy env-var path).

This preserves backward compatibility: existing deployments with a single env
var per provider continue to work with zero configuration changes.

### 3. Environment Import

`importFromEnv()` scans the `PROVIDER_KEY_ENV` map on startup and creates
default accounts for any provider whose env var is set. Idempotent — skips
providers that already have accounts. This bootstraps the multi-account system
from existing deployments.

### 4. Key Validation

`ProviderKeyValidator.validate(provider, apiKey, baseUrl?)` tests the key
against each provider's models/health endpoint:

- **Cloud providers** (anthropic, openai, groq, openrouter, gemini, deepseek,
  mistral, grok): call the models-list endpoint with the key; extract available
  model IDs on success.
- **Local providers** (ollama, lmstudio, localai): HTTP ping to health/tags
  endpoint.
- **Unknown providers**: pass-through valid.

### 5. Per-Account Cost Recording

`AIClient.trackUsage()` fires-and-forgets a `recordCost()` call with the
resolved `accountId`, personality ID, model, token counts, and calculated USD
cost. Cost data is queryable via summary, trend, and CSV export endpoints.

### 6. Groq and OpenRouter Providers

Both providers use the `openai` npm package with a custom `baseURL`:
- **Groq**: `https://api.groq.com/openai/v1`, env `GROQ_API_KEY`
- **OpenRouter**: `https://openrouter.ai/api/v1`, env `OPENROUTER_API_KEY`
  (with extra `HTTP-Referer` and `X-Title` headers)

Registered in `AIClient.createProvider()`, `cost-calculator.ts`, `chat-routes.ts`,
and `model-routes.ts`.

---

## Consequences

### Positive

- Organizations can track spending per team/project/cost center.
- Key rotation is non-disruptive (update secret, re-validate, done).
- Personality-level account assignment enables fine-grained cost attribution.
- Backward compatible — zero-config upgrade path from single-key deployments.
- Two new popular providers (Groq, OpenRouter) expand model coverage.

### Negative

- Additional database tables and storage overhead for cost records.
- Fire-and-forget cost recording could silently drop records on DB errors.
- Key validation adds latency on account creation (mitigated by async validation
  after save).

### Risks

- Partial unique index on `(provider, tenant_id) WHERE is_default = true`
  requires PostgreSQL; not portable to other databases.
- `importFromEnv()` creates accounts on every restart if the env var is set but
  no accounts exist — need idempotency guard (implemented via
  `getAccountsByProvider` check).

---

## Alternatives Considered

1. **Config-file-based multi-key** — Store multiple keys in `.env` with suffixes
   (e.g. `OPENAI_API_KEY_TEAM_A`). Rejected: no UI, no validation, no cost
   tracking.
2. **External cost tracking service** — Delegate cost tracking to an external
   system like OpenMeter. Rejected: adds external dependency, violates
   sovereign-first design.
3. **Per-personality env var override** — Let each personality specify its own
   `apiKeyEnv`. Rejected: doesn't scale and provides no cost visibility.
