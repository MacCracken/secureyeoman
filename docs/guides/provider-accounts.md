# Multi-Account Provider Keys & Cost Tracking

SecureYeoman supports multiple API keys per AI provider, enabling per-team cost attribution, key rotation without downtime, and personality-level account routing.

## Quick Start

### Via Dashboard

1. Navigate to **Settings > Keys**.
2. Click **Add Account** and select a provider.
3. Enter a label (e.g. "Team Alpha — OpenAI"), paste the API key, and save.
4. The key is validated automatically; status shows green (active) or red (invalid).
5. To make an account the default for its provider, click the star icon.

### Via CLI

```bash
# Add an account
secureyeoman provider add anthropic --label "Production Key" --key sk-ant-xxx --default

# List all accounts
secureyeoman provider list

# Validate an account
secureyeoman provider validate acc-1234

# Set default
secureyeoman provider set-default acc-1234

# Rotate a key
secureyeoman provider rotate acc-1234 --key sk-ant-new-xxx

# View costs
secureyeoman provider costs
secureyeoman provider costs --json
```

### Via API

```bash
# Create account
curl -X POST http://localhost:3000/api/v1/provider-accounts \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"provider":"anthropic","label":"Team Alpha","apiKey":"sk-ant-xxx"}'

# List accounts
curl http://localhost:3000/api/v1/provider-accounts \
  -H "Authorization: Bearer $TOKEN"

# Validate
curl -X POST http://localhost:3000/api/v1/provider-accounts/acc-1/validate \
  -H "Authorization: Bearer $TOKEN"

# Cost summary
curl "http://localhost:3000/api/v1/provider-accounts/costs?from=1709251200000" \
  -H "Authorization: Bearer $TOKEN"

# Export CSV
curl "http://localhost:3000/api/v1/provider-accounts/costs/export" \
  -H "Authorization: Bearer $TOKEN" -o costs.csv
```

## Key Resolution

When a personality sends a chat request, the system resolves the API key through a deterministic fallback chain:

1. **Explicit account** — If `defaultModel.accountId` is set on the personality, that account's key is used.
2. **Provider default** — The account marked as default for that provider.
3. **Sole account** — If only one account exists for the provider, it's used implicitly.
4. **Environment variable** — Falls back to the legacy `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` etc.

This means existing deployments with a single env var per provider continue to work with zero changes.

## Assigning Accounts to Personalities

In the Personality Editor, when a provider has multiple accounts, a "Provider Account" dropdown appears below the model selector. Select the account to use for that personality. If only one account exists, the dropdown is hidden (implicit).

## Auto-Import from Environment

On startup, SecureYeoman scans environment variables for known provider keys (`ANTHROPIC_API_KEY`, `OPENAI_API_KEY`, `GROQ_API_KEY`, etc.) and creates default accounts for any provider that has a key set but no accounts configured. This bootstraps the multi-account system from existing deployments.

## Key Validation

Each provider's key is validated against its API:

| Provider | Validation Method |
|----------|------------------|
| Anthropic | `GET /v1/models` with `x-api-key` header |
| OpenAI | `GET /v1/models` with `Bearer` token |
| Groq | `GET /v1/models` with `Bearer` token |
| OpenRouter | `GET /v1/models` with `Bearer` + referer headers |
| Gemini | `GET /v1beta/models?key=` query param |
| Ollama | `GET /api/tags` health check |
| LM Studio | `GET /v1/models` health check |

Validation returns available model IDs on success, stored in `account_info` for reference.

## Cost Tracking

Every AI request records token counts and calculated USD cost against the resolved account. View costs in:

- **Dashboard**: Settings > Keys > Provider Costs section. Overview cards (total spend, daily average, top provider, total requests), per-account cost table, and daily cost trend bars. Filter by period (7d / 30d / 90d).
- **CLI**: `secureyeoman provider costs` for a formatted table, `--json` for raw data.
- **API**: `GET /api/v1/provider-accounts/costs` for summary, `/costs/trend` for daily trend, `/costs/export` for CSV.

## Supported Providers

SecureYeoman supports 14 providers:

| Provider | Env Variable | Type |
|----------|-------------|------|
| Anthropic | `ANTHROPIC_API_KEY` | Cloud |
| OpenAI | `OPENAI_API_KEY` | Cloud |
| Gemini | `GEMINI_API_KEY` | Cloud |
| DeepSeek | `DEEPSEEK_API_KEY` | Cloud |
| Mistral | `MISTRAL_API_KEY` | Cloud |
| Grok (xAI) | `XAI_API_KEY` | Cloud |
| Groq | `GROQ_API_KEY` | Cloud |
| OpenRouter | `OPENROUTER_API_KEY` | Cloud |
| Ollama | — | Local |
| LM Studio | — | Local |
| LocalAI | — | Local |
| Letta | `LETTA_API_KEY` | Cloud/Local |
| OpenCode Zen | `OPENCODE_ZEN_API_KEY` | Cloud |

## Permissions

Provider account endpoints require the following permissions:

| Endpoint | Permission |
|----------|-----------|
| List, get, costs, trend, export | `ai:read` |
| Create, update, delete, validate, set-default, rotate | `ai:write` |
