# ADR 086: Letta Stateful Agent Provider

**Status**: Accepted

**Date**: 2026-02-21

---

## Context

SecureYeoman supports 10 AI providers: Anthropic, OpenAI, Gemini, Ollama, OpenCode Zen, LM Studio,
LocalAI, DeepSeek, Mistral, and Grok. All existing providers offer stateless chat completions —
each request is independent with no persistent state between calls.

[Letta](https://letta.com) (formerly MemGPT) is a stateful agent platform that provides AI agents
with persistent memory, long-term context, and self-improvement capabilities. Letta agents maintain
their own memory across conversations, making them fundamentally different from stateless completion
providers. Notable properties:

- **Persistent memory**: Agents store and recall information across sessions using in-context memory
  blocks (`persona`, `human`, `custom`) and archival memory backed by vector search.
- **Self-managing context**: Letta handles context window overflow automatically by moving memories
  to archival storage and recalling them when relevant — callers never hit hard token limits.
- **Agent-scoped API**: The API surface is `POST /v1/agents/{agent_id}/messages` rather than a
  generic `/v1/chat/completions` endpoint.
- **Reasoning transparency**: Responses include distinct `reasoning_message` objects containing the
  agent's internal chain of thought, separate from the final `assistant_message`.
- **Cloud and self-hosted**: Available as a managed cloud service (`api.letta.com`) or as a
  self-hosted Docker container on `localhost:8283`.

Letta's model identifiers follow a `provider/model-id` format (e.g. `openai/gpt-4o`,
`anthropic/claude-sonnet-4-20250514`) since Letta itself routes to the underlying LLM provider.

---

## Decision

Implement `LettaProvider` as the 11th AI provider using native `fetch` against the Letta REST API.

**API surface**: `https://api.letta.com/v1` (cloud) or `LETTA_BASE_URL` (self-hosted)

**Authentication**: `LETTA_API_KEY` — Bearer token obtained from `app.letta.com/settings/keys`.

**Agent lifecycle**:

Each `LettaProvider` instance manages a single Letta agent. On the first chat request, an agent is
created with `POST /v1/agents` (using `LETTA_AGENT_ID` if pre-configured to skip creation). The
agent ID is cached for the lifetime of the provider instance. Concurrent first requests share a
single creation promise to avoid racing.

**Message mapping**:

Letta's `POST /v1/agents/{agent_id}/messages` accepts a `messages` array with `system`, `user`,
and `assistant` roles. The adapter passes the full SecureYeoman conversation through this array.
`tool` role messages are filtered out (Letta manages tool results internally via its own memory).

**Response mapping**:

Letta responses contain multiple message types. The adapter extracts the `assistant_message` entry
and maps its `content` to the unified `AIResponse.content` field. `reasoning_message` objects are
discarded — their presence is transparent to callers. Tool calls in `assistant_message.tool_calls`
are mapped to the unified `ToolCall[]` format.

**Streaming**:

`chatStream()` uses `POST /v1/agents/{agent_id}/messages/stream` with `streaming: true`. The
response is a Server-Sent Events stream. The adapter reads line-by-line, parses `data:` lines as
JSON, extracts `assistant_message` delta text, `usage`, and `stop_reason` chunks, and yields them
in the unified `AIStreamChunk` format.

**Known models** (registered in pricing table and model-router tier map):

| Model (Letta ID) | Underlying Model | Tier | Input / 1M | Output / 1M |
|------------------|-----------------|------|-----------|------------|
| `openai/gpt-4o` | GPT-4o | capable | $2.50 | $10.00 |
| `openai/gpt-4o-mini` | GPT-4o mini | fast | $0.15 | $0.60 |
| `anthropic/claude-sonnet-4-20250514` | Claude Sonnet 4 | capable | $3.00 | $15.00 |
| `anthropic/claude-haiku-3-5-20241022` | Claude Haiku 3.5 | fast | $0.80 | $4.00 |

**Configuration**:
- `LETTA_API_KEY` — required
- `LETTA_BASE_URL` — optional; overrides base URL (default `https://api.letta.com`)
- `LETTA_AGENT_ID` — optional; reuse a pre-existing agent instead of creating one
- `LETTA_LOCAL=true` — optional shorthand for `http://localhost:8283`

**No new npm dependencies**: The adapter uses the native `fetch` API (Node.js 18+). The
`@letta-ai/letta-client` TypeScript SDK is not required since the REST API is straightforward.

**Scope**:
- Full non-streaming and streaming chat completions
- System, user, and assistant message roles
- Tool/function calling (mapped from Letta's `tool_calls` format)
- Cached token usage tracking (`cached_input_tokens`)
- Dynamic model discovery via `GET /v1/models` with key-present check
- Fallback to `getKnownModels()` when API is unreachable
- `PROVIDER_KEY_ENV` registration in `cost-calculator.ts` and `model-routes.ts`
- Included in fallback chain support

---

## Alternatives Considered

### Use `@letta-ai/letta-client` npm package

Letta publishes an official TypeScript SDK. It provides type-safe wrappers for all API operations
and handles authentication. However:

1. **No new dependency**: The REST API is simple enough that native `fetch` covers all required
   operations without adding a dependency to the monorepo.
2. **SDK stability**: The SDK is actively developed alongside the platform. Using REST directly
   insulates the provider from SDK-level breaking changes.
3. **Pattern consistency**: All other providers in the codebase that don't wrap the OpenAI npm
   package use native `fetch` (Ollama, LocalAI). Using `fetch` keeps this pattern consistent.

Adopting the SDK can be revisited if Letta's API surface grows significantly in complexity.

### Map Letta agents to OpenAI-compatible endpoints

Letta exposes an OpenAI-compatible proxy (`/v1/chat/completions`) as documented in
[ADR docs](https://docs.letta.com/guides/server/providers/openai-proxy/). This would allow reusing
the OpenAI npm package pattern (as done for Grok, DeepSeek, Mistral). However:

1. **No agent persistence**: The OpenAI-compatible endpoint routes to the underlying model directly,
   bypassing Letta's agent memory. The key differentiator of Letta — persistent memory — is lost.
2. **Distinct value proposition**: Users choosing Letta specifically want the stateful agent
   behavior. Proxying through the OpenAI endpoint would render Letta indistinguishable from
   direct OpenAI/Anthropic access.

### Create a fresh agent per request

Instead of caching the agent across calls, create a new agent for every `doChat()` invocation.
This is simpler but:

1. **No memory persistence**: Letta's main value is cross-request memory. Ephemeral agents discard
   all learnings after each call.
2. **Agent proliferation**: High-volume deployments would create thousands of orphaned agents in
   the Letta service.
3. **Latency overhead**: Agent creation adds a round-trip before every chat call.

The cached-per-instance approach (current decision) preserves memory within a SecureYeoman session
and is far more aligned with Letta's design intent.

---

## Consequences

### Positive

- **11 providers**: SecureYeoman now covers stateless completion providers (Anthropic, OpenAI,
  Gemini, DeepSeek, Mistral, Grok, OpenCode), local inference (Ollama, LM Studio, LocalAI), and
  stateful agent platform (Letta).
- **Persistent memory support**: Users can route SecureYeoman's Brain to a Letta agent and gain
  long-term memory that survives context window limits — complementary to SecureYeoman's own
  vector memory (ADR 031).
- **Self-hosted option**: `LETTA_LOCAL=true` routes to the self-hosted Docker container, keeping
  all data on-premise.
- **Zero new runtime dependencies**: Uses native `fetch`; no package.json changes.

### Negative / Trade-offs

- **Agent state is external**: The Letta agent's memory lives in the Letta service, not in
  SecureYeoman's database. Backup, export, and portability of that memory is the user's
  responsibility via the Letta platform.
- **Single agent per provider instance**: The current design creates one agent per `LettaProvider`
  instance. Multi-user deployments that share a single `SecureYeoman` process will share one Letta
  agent. For true per-user isolation, users should configure separate `LETTA_AGENT_ID` values
  per personality or connection — this is a documented usage constraint.
- **Model ID format**: Letta's `provider/model-id` naming is non-standard relative to other
  providers. Users configuring `model: letta/openai/gpt-4o` need to understand this nesting.
  Mitigated by clear documentation.
- **Pricing is pass-through**: Letta itself is priced separately from the underlying model. The
  cost calculator reflects the underlying model's token costs only; Letta's platform fee (if any)
  is not tracked.

---

## Related

- ADR 078: x.ai Grok Provider (same fetch-based pattern as DeepSeek/Mistral/Grok)
- ADR 031: Vector Semantic Memory (complementary persistent memory in SecureYeoman)
- ADR 002: Runtime Model Switching
- ADR 011: Dynamic Model Discovery
- ADR 056: Per-Personality Model Fallbacks
- ADR 085: Intelligent Model Routing
- [CHANGELOG.md](../../CHANGELOG.md)
- [Configuration Reference](../configuration.md#model)
- [AI Provider API Keys Guide](../guides/ai-provider-api-keys.md)
