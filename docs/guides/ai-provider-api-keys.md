# AI Provider Authentication: Why You Must Use API Keys

> **Short answer**: Connect SECUREYEOMAN to AI providers using API keys only. Never use OAuth tokens,
> session cookies, or browser-sourced credentials. Violating provider Terms of Service can result in
> account suspension, bans, or permanent loss of access.

---

## The Rule

| Method | Status | Notes |
|--------|--------|-------|
| **API key** (`sk-...`, `AIza...`) | **Required** | The only compliant way to use AI provider APIs in third-party applications |
| OAuth token from Claude.ai / Claude Code | **Banned** | Violates Anthropic ToS; triggers account suspension |
| Browser session cookie / localStorage token | **Banned** | Violates all major providers' ToS |
| Reverse-engineered endpoints | **Banned** | Violates ToS and potentially computer fraud laws |

---

## Anthropic Policy (Claude)

Anthropic's Terms of Service explicitly prohibit using OAuth tokens or session credentials obtained
from Claude.ai or Claude Code in third-party applications.

**What changed:**

- **January 9, 2026** — Anthropic deployed server-side enforcement that blocks OAuth tokens issued
  to Free, Pro, and Max plan accounts from being used outside of Claude Code and Claude.ai. Requests
  authenticated with these tokens from other applications are rejected.

- **February 19, 2026** — Anthropic's documentation was updated to formally state this policy.
  The enforcement is active: accounts that bypass this restriction face suspension.

**A documented real-world consequence:**

The [OpenCode](https://opencode.ai/) project issue tracker documents a case (issue #6930) where a
user's Claude account was suspended after OpenCode used an OAuth token to call the Anthropic API.
The user was a Max plan subscriber who upgraded — Anthropic engineers confirmed to the reporter that
the usage violated their Terms of Service.

**Why Anthropic enforces this:**

OAuth tokens from consumer accounts (Free/Pro/Max) are subsidized — they carry a different cost
structure than paid API access. Using them in third-party applications bypasses the API billing
model Anthropic uses to fund infrastructure.

---

## What This Means for SECUREYEOMAN

SECUREYEOMAN communicates with AI providers exclusively through their official APIs using keys you
supply in `.env`. It never handles OAuth flows to provider accounts or captures browser tokens.

**Correct setup:**

```bash
# .env — use your API keys, not OAuth tokens

# Anthropic — get from console.anthropic.com
ANTHROPIC_API_KEY=sk-ant-api03-...

# OpenAI — get from platform.openai.com/api-keys
OPENAI_API_KEY=sk-...

# Google Gemini — get from aistudio.google.com/app/apikey
GOOGLE_GENERATIVE_AI_API_KEY=AIzaSy...

# x.ai Grok — get from console.x.ai
XAI_API_KEY=xai-...

# OpenCode Zen (BYOK model — API key from opencode.ai/settings)
OPENCODE_API_KEY=...
```

---

## Why API Keys Are the Right Choice

### 1. Compliance

API keys are the authentication mechanism providers **intend** for third-party applications. Using
them is the only way to stay within Terms of Service across all major providers (Anthropic, OpenAI,
Google, Mistral, DeepSeek, x.ai).

### 2. Billing transparency

API key usage is billed at published API rates. You see every token charged on your provider
dashboard. OAuth tokens from consumer plans blur this accountability and can result in unexpected
suspensions when usage is flagged.

### 3. Granular control

API keys can be scoped, rotated, and revoked without affecting your main account. If a key is
compromised, you rotate it — your Claude.ai or OpenAI account remains unaffected.

### 4. Rate limits designed for automation

API keys have rate limits designed for programmatic use. Consumer OAuth sessions have limits
intended for a single human user typing in a chat interface — automation will exhaust them quickly
and may trigger abuse detection.

### 5. Stable, documented endpoints

Provider REST APIs (`api.anthropic.com`, `api.openai.com`) are versioned and stable. Internal
endpoints used by consumer products are undocumented, can change without notice, and are explicitly
off-limits.

---

## Getting Your API Keys

### Anthropic (Claude)

1. Go to [console.anthropic.com](https://console.anthropic.com)
2. Create an account or sign in
3. Navigate to **API Keys**
4. Click **Create Key**
5. Copy the `sk-ant-api03-...` key — it's only shown once

Cost: Usage-based billing starting at $0. Free tier has limited credits.

### OpenAI (GPT-4o, GPT-4o-mini)

1. Go to [platform.openai.com/api-keys](https://platform.openai.com/api-keys)
2. Click **Create new secret key**
3. Copy the `sk-...` key

Cost: Usage-based. Add billing at [platform.openai.com/settings/billing](https://platform.openai.com/settings/billing).

### Google (Gemini)

1. Go to [aistudio.google.com/app/apikey](https://aistudio.google.com/app/apikey)
2. Click **Create API key**
3. Copy the `AIzaSy...` key

Cost: Gemini Flash has a generous free tier; Pro requires billing.

### x.ai (Grok)

1. Go to [console.x.ai](https://console.x.ai)
2. Sign in with your X/Twitter account
3. Navigate to **API Keys**
4. Click **Create API Key**
5. Copy the key — it's only shown once

Set in `.env`:
```bash
XAI_API_KEY=xai-...
```

Available models: `grok-3`, `grok-3-mini`, `grok-2-1212`, `grok-2-vision-1212`.

Cost: Usage-based. See [docs.x.ai/docs/models](https://docs.x.ai/docs/models) for current pricing.

### Local Models (Ollama, LM Studio, LocalAI)

No key needed. Configure the base URL in `.env`:

```bash
OLLAMA_BASE_URL=http://localhost:11434
```

Local models are the most private option — no data leaves your machine.

---

## If You See This Error

```
AuthenticationError: Your OAuth token cannot be used with third-party applications.
Use an API key from console.anthropic.com instead.
```

Or a generic 401/403 from Anthropic after connecting a token from Claude.ai:

1. Stop using that token immediately — continued use risks account suspension
2. Generate an API key at [console.anthropic.com/api-keys](https://console.anthropic.com/api-keys)
3. Update your `.env`: `ANTHROPIC_API_KEY=sk-ant-api03-...`
4. Restart SECUREYEOMAN

---

## Summary

- Always use official **API keys** from provider dashboards
- Never paste OAuth tokens, session cookies, or Claude.ai/ChatGPT login credentials into `.env`
- If in doubt, check the provider's API documentation — every major provider has an explicit "API
  keys" section for third-party/programmatic access
