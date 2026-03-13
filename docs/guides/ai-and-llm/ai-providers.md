# AI Providers & Models

This guide covers provider setup, API key management, multi-account cost tracking, local model quantization, and reasoning/cost controls.

---

## Provider Setup & API Keys

### The Rule

| Method | Status | Notes |
|--------|--------|-------|
| **API key** (`sk-...`, `AIza...`) | **Required** | The only compliant way to use AI provider APIs in third-party applications |
| OAuth token from Claude.ai / Claude Code | **Banned** | Violates Anthropic ToS; triggers account suspension |
| Browser session cookie / localStorage token | **Banned** | Violates all major providers' ToS |
| Reverse-engineered endpoints | **Banned** | Violates ToS and potentially computer fraud laws |

> **Short answer**: Connect SecureYeoman to AI providers using API keys only. Never use OAuth tokens,
> session cookies, or browser-sourced credentials. Violating provider Terms of Service can result in
> account suspension, bans, or permanent loss of access.

### Why API Keys Are the Right Choice

- **Compliance** -- API keys are the authentication mechanism providers intend for third-party applications. Using them is the only way to stay within Terms of Service across all major providers.
- **Billing transparency** -- API key usage is billed at published API rates. OAuth tokens from consumer plans blur this accountability and can result in unexpected suspensions.
- **Granular control** -- API keys can be scoped, rotated, and revoked without affecting your main account.
- **Rate limits designed for automation** -- Consumer OAuth sessions have limits intended for a single human user; automation will exhaust them quickly and may trigger abuse detection.
- **Stable, documented endpoints** -- Provider REST APIs are versioned and stable. Internal endpoints used by consumer products are undocumented and can change without notice.

### Environment Variables

```bash
# .env -- use your API keys, not OAuth tokens

# Anthropic -- get from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI -- get from platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Google Gemini -- get from aistudio.google.com/app/apikey
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...

# x.ai Grok -- get from console.x.ai
XAI_API_KEY=xai-...

# OpenCode Zen (BYOK model -- API key from opencode.ai/settings)
OPENCODE_API_KEY=...
```

### Getting Your API Keys

#### Anthropic (Claude)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account or sign in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the `sk-ant-api03-...` key -- it is only shown once

Cost: Usage-based billing starting at $0. Free tier has limited credits.

#### OpenAI (GPT-4o, GPT-4o-mini)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy the `sk-...` key

Cost: Usage-based. Add billing at [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing).

#### Google (Gemini)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key**
3. Copy the `AIzaSy...` key

Cost: Gemini Flash has a generous free tier; Pro requires billing.

#### x.ai (Grok)

1. Go to [console.x.ai](https://console.x.ai)
2. Sign in with your X/Twitter account
3. Navigate to **API Keys**
4. Click **Create API Key**
5. Copy the key -- it is only shown once

Available models: `grok-3`, `grok-3-mini`, `grok-2-1212`, `grok-2-vision-1212`.
Cost: Usage-based. See [docs.x.ai/docs/models](https://docs.x.ai/docs/models) for current pricing.

#### Letta (Stateful Agent Platform)

Letta provides AI agents with persistent memory that survives context window limits. Unlike other providers, Letta agents remember information across conversations and self-improve over time.

1. Go to [app.letta.com](https://app.letta.com)
2. Create an account or sign in
3. Navigate to **Settings > API Keys**
4. Click **Create API Key**
5. Copy the key -- it is only shown once

```bash
LETTA_API_KEY=sk-letta-...
# Optional: reuse an existing agent instead of creating a new one
# LETTA_AGENT_ID=agent-<uuid>
# Optional: self-hosted Letta server
# LETTA_BASE_URL=http://my-letta-server:8283
# Optional: local Docker container shorthand
# LETTA_LOCAL=true
```

Available models (Letta `provider/model-id` format):
- `openai/gpt-4o` -- GPT-4o via Letta (requires OpenAI key in Letta settings)
- `openai/gpt-4o-mini` -- Fast, cost-effective
- `anthropic/claude-sonnet-4-6` -- Claude Sonnet via Letta
- `anthropic/claude-haiku-4-5-20251001` -- Fast Claude via Letta

Cost: Letta charges for the underlying model's tokens plus any Letta platform fee.
See [letta.com/pricing](https://letta.com/pricing) for current rates.

> **Note**: The Letta provider creates one agent per `LettaProvider` instance. Set
> `LETTA_AGENT_ID` to reuse a pre-existing agent and preserve memory across restarts.

#### Local Models (Ollama, LM Studio, LocalAI)

No key needed. Configure the base URL in `.env`:

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

Local models are the most private option -- no data leaves your machine.

### Supported Providers

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
| Ollama | -- | Local |
| LM Studio | -- | Local |
| LocalAI | -- | Local |
| Letta | `LETTA_API_KEY` | Cloud/Local |
| OpenCode Zen | `OPENCODE_ZEN_API_KEY` | Cloud |

### Anthropic OAuth Token Enforcement

Anthropic's Terms of Service explicitly prohibit using OAuth tokens or session credentials obtained from Claude.ai or Claude Code in third-party applications. Server-side enforcement blocks OAuth tokens issued to Free, Pro, and Max plan accounts from being used outside of Claude Code and Claude.ai. Accounts that bypass this restriction face suspension.

If you see this error:

```
AuthenticationError: Your OAuth token cannot be used with third-party applications.
Use an API key from console.anthropic.com instead.
```

1. Stop using that token immediately -- continued use risks account suspension
2. Generate an API key at [console.anthropic.com/api-keys](https://console.anthropic.com/api-keys)
3. Update your `.env`: `ANTHROPIC_API_KEY=sk-ant-api03-...`
4. Restart SecureYeoman

### Key Validation

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

---

## Multi-Account Management

SecureYeoman supports multiple API keys per AI provider, enabling per-team cost attribution, key rotation without downtime, and personality-level account routing.

### Adding Accounts

#### Via Dashboard

1. Navigate to **Settings > Keys**.
2. Click **Add Account** and select a provider.
3. Enter a label (e.g. "Team Alpha -- OpenAI"), paste the API key, and save.
4. The key is validated automatically; status shows green (active) or red (invalid).
5. To make an account the default for its provider, click the star icon.

#### Via CLI

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

#### Via API

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

### Key Resolution Order

When a personality sends a chat request, the system resolves the API key through a deterministic fallback chain:

1. **Explicit account** -- If `defaultModel.accountId` is set on the personality, that account's key is used.
2. **Provider default** -- The account marked as default for that provider.
3. **Sole account** -- If only one account exists for the provider, it is used implicitly.
4. **Environment variable** -- Falls back to the legacy `ANTHROPIC_API_KEY` / `OPENAI_API_KEY` etc.

Existing deployments with a single env var per provider continue to work with zero changes.

### Assigning Accounts to Personalities

In the Personality Editor, when a provider has multiple accounts, a "Provider Account" dropdown appears below the model selector. Select the account to use for that personality. If only one account exists, the dropdown is hidden.

### Auto-Import from Environment

On startup, SecureYeoman scans environment variables for known provider keys and creates default accounts for any provider that has a key set but no accounts configured. This bootstraps the multi-account system from existing deployments.

### Cost Tracking

Every AI request records token counts and calculated USD cost against the resolved account. View costs in:

- **Dashboard**: Settings > Keys > Provider Costs section. Overview cards (total spend, daily average, top provider, total requests), per-account cost table, and daily cost trend bars. Filter by period (7d / 30d / 90d).
- **CLI**: `secureyeoman provider costs` for a formatted table, `--json` for raw data.
- **API**: `GET /api/v1/provider-accounts/costs` for summary, `/costs/trend` for daily trend, `/costs/export` for CSV.

### Permissions

| Endpoint | Permission |
|----------|-----------|
| List, get, costs, trend, export | `ai:read` |
| Create, update, delete, validate, set-default, rotate | `ai:write` |

---

## Model Quantization

Quantization reduces the memory footprint of large language models by compressing weight precision from 32-bit floats down to 4-8 bits. This section helps you choose the right quantization level for your hardware when using Ollama.

### Hardware Tiers

| RAM Available | Recommended Quant | Notes |
|---|---|---|
| < 8 GB | `Q2_K` | Minimum quality -- last resort |
| 8-16 GB | `Q4_K_M` | Best balance (default recommendation) |
| 16-32 GB | `Q5_K_S` or `Q5_K_M` | Higher quality, still fast |
| 32+ GB | `Q8_0` | Near-lossless, best for production |

### Quantization Levels

| Level | Bits | Quality | Speed | Typical VRAM |
|---|---|---|---|---|
| `Q2_K` | ~2.5b | Low | Fastest | ~2-3 GB / 7B model |
| `Q3_K_M` | ~3.3b | Moderate | Fast | ~3-4 GB / 7B model |
| `Q4_K_M` | ~4.8b | Good (recommended) | Balanced | ~4-5 GB / 7B model |
| `Q5_K_S` | ~5.5b | Very good | Moderate | ~5-6 GB / 7B model |
| `Q5_K_M` | ~5.7b | Very good | Moderate | ~5-6 GB / 7B model |
| `Q8_0` | 8b | Best | Slowest | ~8-9 GB / 7B model |

### Model Family VRAM Estimates

| Model | Size | Q4_K_M | Q5_K_M | Q8_0 |
|---|---|---|---|---|
| Llama 3 8B | 8B | ~4.9 GB | ~5.7 GB | ~8.5 GB |
| Llama 3 70B | 70B | ~39 GB | ~46 GB | ~74 GB |
| Mistral 7B v0.3 | 7B | ~4.4 GB | ~5.1 GB | ~7.7 GB |
| Phi-3.5 Mini | 3.8B | ~2.4 GB | ~2.8 GB | ~4.2 GB |
| Phi-3 Medium | 14B | ~8.9 GB | ~10.4 GB | ~15.6 GB |
| Gemma 2 9B | 9B | ~5.5 GB | ~6.4 GB | ~9.6 GB |
| Gemma 2 27B | 27B | ~16.6 GB | ~19.3 GB | ~29 GB |
| DeepSeek-R1 Distill 7B | 7B | ~4.4 GB | ~5.1 GB | ~7.7 GB |
| DeepSeek-R1 Distill 14B | 14B | ~8.9 GB | ~10.4 GB | ~15.6 GB |

> **Note**: These are rough estimates. Actual usage varies by context window size, prompt length, and system overhead (typically +1-2 GB for OS/framework).

### Choosing a Quantization in Ollama

Ollama model names include the quantization tag after a colon:

```bash
# Pull a specific quantization
ollama pull llama3:8b-instruct-q4_K_M
ollama pull mistral:7b-instruct-q5_K_M
ollama pull phi3:3.8b-mini-instruct-q4_K_M

# Check available tags on the Ollama library
# https://ollama.com/library/llama3/tags
```

To set a quantized model as the active model:

```bash
# Via CLI
secureyeoman model switch ollama llama3:8b-instruct-q4_K_M

# Via API
curl -X POST http://localhost:18789/api/v1/model/switch \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"provider":"ollama","model":"llama3:8b-instruct-q4_K_M"}'
```

### Memory Warning

SecureYeoman automatically checks at startup whether the configured Ollama model fits in available RAM. If the model file exceeds 80% of system RAM, a warning is logged:

```
WARN Ollama model "llama3:70b" (39.6 GB) may exceed available RAM (16.0 GB).
     Consider a lower quantization (e.g. Q4_K_M).
```

The same warning is included in `GET /api/v1/ai/health` as a `memoryWarning` field when applicable.

### Local-First Routing

If you have a local Ollama model and a cloud model configured as primary, enable **local-first mode** to try the local model before making cloud API calls:

```bash
curl -X PATCH http://localhost:18789/api/v1/model/config \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer $TOKEN" \
  -d '{"localFirst":true}'
```

Or toggle it in the dashboard's **Model Selection** widget. The system falls back to the cloud primary automatically if the local model is unreachable.

### Quantization Tips

- **Start with Q4_K_M** unless you have a specific quality requirement -- it offers the best balance across most use cases.
- **Upgrade to Q5_K_M** if you need better reasoning quality and have spare RAM.
- **Use Q8_0** only for production deployments with dedicated GPU/RAM resources.
- **Avoid Q2_K** for production -- it noticeably degrades reasoning and instruction following.
- For coding tasks, higher quantization (Q5+ or Q8) produces measurably better code completion.

---

## Reasoning & Cost Controls

### Reasoning Effort (OpenAI o-series)

OpenAI's o1/o3 models support a `reasoning_effort` parameter that controls how much compute the model uses for chain-of-thought reasoning.

In the Personality Editor, go to Brain > Reasoning Effort:

1. **Enable** the reasoning effort toggle
2. **Select effort level**: Low, Medium, or High
   - **Low**: Faster, cheaper, suitable for simple tasks
   - **Medium** (default): Balanced reasoning depth
   - **High**: Maximum reasoning, best for complex analysis

Reasoning effort only applies when the personality uses an OpenAI reasoning model (o1, o1-mini, o3, o3-mini). For other providers, the setting is ignored.

```json
POST /api/v1/model/estimate-cost
{
  "task": "analyze security report",
  "context": "quarterly review"
}
```

The estimate-cost endpoint factors in the personality's reasoning effort setting.

### Provider Health Tracking

Each provider's reliability is tracked via a rolling window of the last 100 requests.

| Status | Error Rate | Indicator |
|--------|-----------|-----------|
| Healthy | < 5% | Green |
| Degraded | 5-20% | Amber |
| Unhealthy | >= 20% | Red |

The Model Widget shows a colored health dot next to each provider name. Hover for details (error rate, p95 latency).

```
GET /api/v1/model/health
```

Returns per-provider health metrics:

```json
{
  "openai": {
    "errorRate": 0.02,
    "p95LatencyMs": 450,
    "status": "healthy",
    "consecutiveFailures": 0,
    "totalRequests": 100
  }
}
```

### Cost Budgets

Per-personality daily and monthly cost limits prevent runaway AI spending.

In the Personality Editor, go to Brain > Cost Budget:

- **Daily limit (USD)**: Maximum spend per UTC day
- **Monthly limit (USD)**: Maximum spend per UTC month

Leave blank for no limit.

Behavior:

- At **80%** of either limit: an alert is emitted via the Alert Manager
- At **100%**: requests are blocked with HTTP 429 ("Cost budget exceeded")
- Budget check uses a 30-second cache to minimize database load
- If the budget checker is unavailable, requests proceed (graceful degradation)

### Context Overflow Strategy

Controls what happens when a conversation exceeds the model's context window.

| Strategy | Behavior |
|----------|----------|
| **Summarise** (default) | Compact oldest messages using the context compactor |
| **Truncate** | Drop oldest non-system messages until under 80% of the context limit |
| **Error** | Reject the request (413 for REST, SSE error for streaming) |

Configure in the Personality Editor, under Brain > Context Overflow.

### Local Model Refresh

The model discovery cache TTL is 60 seconds. After pulling or deleting an Ollama model, the updated model list appears within one minute.
