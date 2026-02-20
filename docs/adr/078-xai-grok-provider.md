# ADR 078: x.ai Grok Provider

**Status**: Accepted

**Date**: 2026-02-20

---

## Context

SecureYeoman supports 9 AI providers: Anthropic, OpenAI, Gemini, Ollama, OpenCode Zen, LM Studio,
LocalAI, DeepSeek, and Mistral. x.ai released Grok as a publicly available API in late 2024. Grok
exposes an OpenAI-compatible chat completions endpoint at `https://api.x.ai/v1`, making it
low-cost to integrate using the existing pattern established for DeepSeek (ADR 046) and Mistral
(ADR 046).

Grok models (particularly `grok-3` and `grok-2-1212`) are positioned as cost-competitive
alternatives to GPT-4o and Claude Sonnet with strong coding and reasoning capabilities. Adding
Grok expands the provider diversity available in fallback chains and gives users another
cost tier to optimize against.

---

## Decision

Implement `GrokProvider` as the 10th AI provider, following the identical OpenAI-compatible
adapter pattern used for DeepSeek and Mistral.

**API surface**: `https://api.x.ai/v1` (OpenAI-compatible)

**Authentication**: `XAI_API_KEY` environment variable — x.ai's official naming convention.

**Known models** (registered in static model list and pricing table):

| Model | Input / 1M tokens | Output / 1M tokens |
|-------|-------------------|--------------------|
| `grok-3` | $3.00 | $15.00 |
| `grok-3-mini` | $0.30 | $0.50 |
| `grok-2-1212` | $2.00 | $10.00 |
| `grok-2-vision-1212` | $2.00 | $10.00 |

**Configuration**:
- `XAI_API_KEY` — required
- `XAI_BASE_URL` — optional, defaults to `https://api.x.ai/v1`
- Provider key in config: `grok`

**Scope**:
- Full non-streaming and streaming chat completions
- Tool/function calling (OpenAI-compatible function call format)
- Dynamic model discovery via `GET https://api.x.ai/v1/models` with key-present check
- Fallback to `getKnownModels()` when API is unreachable
- Included in fallback chain support
- Pricing-aware cost calculator entries
- `PROVIDER_KEY_ENV` registration in both `cost-calculator.ts` and `chat-routes.ts`

**Bonus fix**: `POST /api/v1/model/switch` `validProviders` list was missing `mistral` despite
Mistral being a fully implemented provider since Phase 11. Both `mistral` and `grok` were added
to the list in the same change.

**Bonus addition**: `getAvailableModelsAsync()` in `cost-calculator.ts` now also performs
dynamic Mistral model discovery (matching the DeepSeek pattern) — this was previously
missing, meaning Mistral's live model list was never fetched.

---

## Alternatives Considered

### Use a dedicated x.ai SDK

x.ai does not publish an official JavaScript/TypeScript SDK beyond the OpenAI-compatible
endpoint. The OpenAI npm package with a custom `baseURL` is the documented integration path
in x.ai's developer documentation. No alternative was warranted.

### Defer until Grok has a stable model lineup

Grok's model naming has changed frequently (v1 → v2 → grok-3). The `getKnownModels()`
fallback pattern handles this gracefully — if known models become stale, dynamic discovery
returns whatever the live endpoint reports, and unknown models fall back to the provider-level
pricing estimate. Deferral is not necessary.

---

## Consequences

### Positive

- **Provider coverage**: 10 providers gives users a wide spectrum from ultra-cheap local
  inference to frontier cloud models, with multiple competitive mid-tier options.
- **Fallback diversity**: Grok models can serve as cost-effective fallback targets behind
  Anthropic or OpenAI primary configs.
- **Zero new dependencies**: The implementation reuses the existing `openai` npm package
  with a custom `baseURL` — no additional runtime dependencies.
- **Mistral model-switch bug fixed**: `POST /api/v1/model/switch` now correctly accepts
  Mistral requests, which were silently rejected since Phase 11.

### Negative / Trade-offs

- **Pricing table staleness**: x.ai pricing has changed frequently. The static table will
  need manual updates as x.ai adjusts rates. Mitigated by the provider-level fallback
  pricing and the fact that dynamic discovery always returns the current model list.
- **Model naming instability**: x.ai has released models under varying naming schemes.
  `getKnownModels()` reflects the lineup as of 2026-02-20; additions require a code
  update (same constraint applies to all providers).

---

## Related

- ADR 046: Phase 11 — Mistral Provider (same OpenAI-compatible adapter pattern)
- ADR 002: Runtime Model Switching
- ADR 011: Dynamic Model Discovery
- ADR 056: Per-Personality Model Fallbacks
- [CHANGELOG.md](../../CHANGELOG.md)
- [Configuration Reference](../configuration.md#model)
- [AI Provider API Keys Guide](../guides/ai-provider-api-keys.md)
