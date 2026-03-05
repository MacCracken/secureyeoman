# ADR 003: AI Providers & Model Routing

## Status

Accepted

## Context

SecureYeoman's AI subsystem must support a diverse ecosystem of language model providers -- from frontier cloud APIs to local inference servers -- while giving operators fine-grained control over which model handles each request. The system must handle provider failures gracefully, route tasks to cost-appropriate models, support multiple billing accounts per provider, cache redundant API calls, manage context window limits, and stream extended thinking content to users in real time.

Early versions locked the model at startup via configuration files and supported only a handful of providers. As the platform matured, requirements emerged for runtime model switching, per-personality model preferences, intelligent cost-aware routing, multi-account billing, local-first privacy modes, and multimodal capabilities spanning vision, speech, and image generation.

## Decisions

### Provider Architecture

SecureYeoman supports 13 AI providers spanning three categories:

| Category | Providers |
|----------|-----------|
| **Cloud inference** | Anthropic, OpenAI, Google Gemini, DeepSeek, Mistral, Grok (x.ai), Groq, OpenRouter |
| **Local inference** | Ollama, LM Studio, LocalAI |
| **Stateful agent** | Letta (formerly MemGPT), OpenCode Zen |

All cloud providers that expose OpenAI-compatible endpoints (DeepSeek, Mistral, Grok, Groq, OpenRouter) share a common adapter pattern: the `openai` npm package configured with a custom `baseURL` and provider-specific API key. This eliminates per-provider SDK dependencies and keeps the integration surface consistent.

The **Letta provider** is architecturally distinct. Rather than stateless chat completions, it manages a persistent agent with cross-session memory. Each `LettaProvider` instance maintains a single Letta agent, created on the first request and reused for the provider's lifetime. Letta agents store and recall information across conversations, handle context window overflow by moving memories to archival storage, and expose reasoning transparency via separate `reasoning_message` objects. Configuration supports both the managed cloud service and self-hosted Docker containers via `LETTA_BASE_URL` or the `LETTA_LOCAL=true` shorthand.

**Dynamic model discovery** keeps the model list current across all providers. Each provider implements a `fetchAvailableModels()` static method that queries the provider's models API. All providers are queried in parallel via `Promise.allSettled`, with a shared 10-minute cache (reduced to 60 seconds for local providers to reflect rapid model pull/delete cycles). When a provider's API is unreachable, the system falls back to a static known-models list. Models without explicit pricing entries use provider-level fallback estimates.

**Runtime model switching** allows operators to change the active model without restarting the process. `POST /api/v1/model/switch` validates the provider, creates a new `AIClient` instance inheriting existing settings, and records an audit event. The switch affects only new requests; in-flight requests complete with the previous model. Changes are not persisted to disk -- restarts revert to the configuration file, preserving the principle that persistent changes go through configuration management.

### Model Routing & Fallbacks

**Intelligent model routing** automatically selects cost-appropriate models based on task characteristics. The `ModelRouter` performs heuristic task profiling, classifying each request by type (summarize, classify, extract, QA, code, reason, plan, general) and complexity (simple, moderate, complex). Tasks are mapped to three cost tiers:

| Tier | Typical Models | Default Task Types |
|------|---------------|-------------------|
| `fast` | Claude Haiku, GPT-4o-mini, Gemini Flash, Grok-3-mini | summarize, classify, extract, QA |
| `capable` | Claude Sonnet, GPT-4o, Grok-3 | code, reason, plan, general |
| `premium` | Claude Opus, GPT-4-turbo, o1 | Never auto-selected; explicit override only |

Complexity modifiers adjust tier selection: simple tasks never escalate above their type's default tier, while complex fast-tier tasks promote to capable. The router selects the cheapest available model in the target tier, falling back to adjacent tiers when no candidates are available. A confidence score governs whether the routing decision is applied or the system defaults are used.

**Pre-execution cost estimation** is available via `POST /api/v1/model/estimate-cost`, which returns the routing decision, estimated cost, and cheaper alternatives. This enables dashboards and CLI tools to show cost projections before committing to a swarm or delegation.

**Per-personality model binding** allows each personality to declare a preferred model and an ordered fallback chain of up to five entries. When a chat request targets a personality, the system switches to that personality's default model automatically. The fallback chain is tried in sequence after the primary model fails, before system-level fallbacks apply. Manual model overrides within a session take precedence until the session resets.

**Local-first routing** adds a `localFirst` flag to the model configuration. When enabled and the primary provider is a cloud service, all configured local-provider fallbacks are attempted before the primary provider. Only `ProviderUnavailableError` triggers fallback progression; other errors are re-thrown immediately. The flag is persisted to system preferences and togglable via REST API, dashboard, or programmatic call.

**Provider health scoring** tracks recent request outcomes in a per-provider in-memory ring buffer (100 entries). Providers are classified as healthy (under 5% error rate), degraded (5--20%), or unhealthy (20% or above). Health data is ephemeral and resets on restart, with all providers starting as healthy.

### Multi-Account Management

Organizations that use separate billing accounts per team or project can register multiple API keys per provider as first-class entities. Each provider account stores a label, a reference to the secrets manager, and optional metadata. A deterministic resolution chain selects the API key for each request:

1. Explicit account ID from the personality's model configuration
2. The provider's designated default account
3. The sole account for the provider (implicit selection)
4. Legacy environment variable fallback

On startup, `importFromEnv()` scans existing provider environment variables and creates default accounts automatically, ensuring zero-configuration upgrades for existing deployments. Key validation tests each key against the provider's health or models endpoint before activation. Per-account cost records enable spending analysis by team, project, or cost center via summary, trend, and CSV export endpoints.

**Personality-level cost budgets** define spending limits per personality. A `CostBudgetChecker` uses a 30-second in-memory cache to avoid per-request database queries. At 80% budget utilization an alert is emitted; at 100% requests are blocked with HTTP 429.

### Caching & Optimization

**LLM response caching** is an opt-in, in-memory cache keyed by SHA-256 hash of provider, model, messages, temperature, max tokens, and sorted tool names. It is designed primarily for repetitive workloads such as heartbeat probes and scheduled system-state queries that issue identical API calls on aggressive intervals. Configuration:

- `enabled`: off by default (opt-in)
- `ttlMs`: 5 minutes default
- `maxEntries`: 500 default with FIFO eviction

Cache hits are audit-logged as `ai_cache_hit` events. Token usage counters are not incremented for cache hits. Streaming responses bypass the cache entirely. Fallback-provider responses are not cached to avoid masking primary-provider failures.

**Proactive context compaction** prevents `context length exceeded` failures before they occur. Before each LLM call, the system estimates token count and triggers compaction when usage exceeds 80% of the model's context window. The compaction strategy preserves system messages and the most recent conversation turns verbatim, summarizes older turns via an LLM call, and injects the summary as a context-summary system message. Compaction is best-effort: if the summarizer fails, the original context is sent unchanged.

Three **context overflow strategies** are configurable per personality:
- `summarise` (default): the compaction behavior described above
- `truncate`: drop oldest non-system messages until under the 80% threshold
- `error`: reject the request with HTTP 413

### Multimodal Support

SecureYeoman provides five multimodal capabilities: vision (image analysis), speech-to-text, text-to-speech, image generation, and haptic feedback. All operations are tracked as jobs in a PostgreSQL table for monitoring and analytics, and gated by an `allowMultimodal` security policy toggle.

**Vision** uses the existing `AIClient` chat completion endpoint with image content parts, compatible with Claude and GPT-4o. **Speech-to-text and text-to-speech** support a provider abstraction with two backends:

| Provider | Capabilities | Deployment |
|----------|-------------|------------|
| OpenAI | Whisper STT, TTS (tts-1, tts-1-hd), DALL-E 3 image generation | Cloud |
| Voicebox | Qwen3-TTS with voice cloning from 2--30s sample, Whisper STT via MLX | Local (FastAPI server) |

Provider selection is configured via `TTS_PROVIDER` and `STT_PROVIDER` environment variables. ElevenLabs integration is available as an MCP prebuilt for cloud-quality voice cloning via the tool layer.

**Haptic feedback** dispatches vibration patterns via the extension hook system. The server defines the pattern; connected clients (browser dashboard, native apps) subscribe to the `multimodal:haptic-triggered` hook and drive device haptics directly.

**OpenAI reasoning effort** is exposed as a first-class field on `AIRequest`, supporting personality-level configuration for OpenAI o-series models. Temperature is suppressed for reasoning models as required by the API.

### Extended Thinking & Streaming

**SSE streaming** (`POST /api/v1/chat/stream`) provides real-time visibility into the agentic loop. Events are emitted as each step progresses:

| Event | Content |
|-------|---------|
| `thinking_delta` | Chunks of the model's internal reasoning |
| `content_delta` | Chunks of the assistant's response text |
| `tool_start` / `tool_result` | Creation tool execution progress |
| `mcp_tool_start` / `mcp_tool_result` | MCP tool execution progress |
| `creation_event` | Resource created/updated/deleted |
| `done` | Final response with token usage, thinking content, and creation events |

**Extended thinking** for Anthropic models is configurable per personality via `thinkingConfig` (enable flag and budget token slider, range 1024--32768). The Anthropic provider enforces three API constraints: temperature is forced to 1 during thinking-enabled calls; thinking blocks are preserved and round-tripped with their opaque signatures in subsequent requests; and `thinkingTokens` are tracked in usage metrics. Thinking content and tool call history are persisted to the database for display in historical conversations.

Integration platforms render thinking content in platform-appropriate formats: Telegram uses collapsible blockquotes, Discord uses spoiler text, and Slack uses context blocks.

## Consequences

**Positive:**
- Thirteen providers spanning cloud, local, and stateful-agent paradigms give operators maximum flexibility in balancing cost, privacy, latency, and capability.
- Intelligent routing reduces costs by 30% or more on mixed workloads by sending simple tasks to cheaper models automatically.
- Per-personality model binding and fallback chains allow each use case to have tailored model preferences without affecting other personalities.
- Local-first routing enables privacy-sensitive deployments to prefer on-premise inference with automatic cloud fallback.
- Multi-account management supports enterprise cost attribution without changing the single-key deployment experience.
- Response caching eliminates redundant API costs for repetitive scheduled workloads.
- Proactive context compaction prevents silent failures on long conversations.
- SSE streaming dramatically reduces perceived latency for multi-step agentic chains.

**Negative / Trade-offs:**
- Runtime model switches are not persisted; restarts revert to configuration file settings.
- The heuristic task classifier may mis-categorize ambiguous requests; operators can override via `allowedModels` constraints.
- Response caching is exact-match only; semantically similar but textually different requests are not deduplicated.
- Context compaction is lossy; summarized details may not be recoverable from the summary.
- Extended thinking increases per-turn token costs and conversation history size.
- Provider health data is lost on restart; cold-start providers default to healthy.
- Letta agent memory lives in the Letta service, not in the SecureYeoman database; portability is the operator's responsibility.
- Static pricing tables require manual updates as providers adjust rates; dynamic discovery mitigates model-list staleness but not pricing.
