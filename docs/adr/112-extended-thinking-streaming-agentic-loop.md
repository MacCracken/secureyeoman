# ADR 112 — Extended Thinking + Streaming Agentic Loop

**Date**: 2026-02-23
**Status**: Accepted
**Deciders**: macro

---

## Context

Two separate but related defects were identified in the chat execution path:

**Problem 1 — Thinking blocks discarded**: The Anthropic API returns `thinking` content blocks when extended thinking is enabled. These blocks carry an opaque `signature` field that the API requires to be round-tripped verbatim in subsequent requests — any request that includes assistant messages containing thinking blocks must reproduce them in order before the corresponding `text` and `tool_use` blocks. The original `mapMessages()` implementation in the Anthropic provider filtered content blocks by type and silently dropped thinking blocks from the message history, violating the API contract and causing 400 errors when extended thinking was used across multi-turn conversations.

**Problem 2 — Blocking agentic loop**: The `POST /api/v1/chat` route ran with `stream: false` throughout the full tool-execution chain. In practice this means: the AI reasons, calls tools, re-reasons, and eventually produces a final response — all before the first byte is sent to the client. For agentic chains with multiple MCP or creation tool calls (each of which can take several seconds), users would wait 20–60 seconds staring at a spinner. Additionally, `executeCreationTool` had no routing path for MCP tool names, so any MCP tool call in the chat path returned `"Unknown tool"` regardless of the tool being present on a connected MCP server.

Both problems were solved together because the SSE streaming infrastructure required revisiting the entire chat execution loop, which is where the MCP routing fix and thinking block round-trip were most naturally placed.

---

## Decision

### 1. SSE Streaming Endpoint (`POST /api/v1/chat/stream`)

A new endpoint emits a `text/event-stream` of `ChatStreamEvent` objects as the agentic loop progresses. The loop is identical to the non-streaming path in logic, but each meaningful step emits an SSE event immediately rather than accumulating into a final response:

| Event type | When emitted |
|---|---|
| `thinking_delta` | Each chunk of thinking text from the provider's streaming response |
| `content_delta` | Each chunk of assistant response text |
| `tool_start` | Before executing a creation tool (includes `toolName`, `label`, `iteration`) |
| `tool_result` | After a creation tool completes (includes `success`, `isError`) |
| `mcp_tool_start` | Before executing an MCP tool (includes `toolName`, `serverName`, `iteration`) |
| `mcp_tool_result` | After an MCP tool completes (includes `toolName`, `serverName`, `success`) |
| `creation_event` | When a resource is created/updated/deleted (the sparkle card payload) |
| `done` | Stream complete; carries the final `content`, `model`, `provider`, `tokensUsed`, `thinkingContent`, and `creationEvents` |
| `error` | Any unhandled exception during the loop |

The agentic loop iterates up to the existing `MAX_ITERATIONS` limit. Tool results are accumulated into a synthetic `user` turn (as the Anthropic/OpenAI APIs require) and appended to `history` before the next AI call. The loop exits when the AI returns a response with no tool calls.

The `ChatStreamEventSchema` union type is defined in `packages/shared/src/types/ai.ts` so that both the server (emitter) and all clients (consumers) share the same discriminated union without duplication.

### 2. Extended Thinking — Anthropic Provider

Extended thinking is enabled by setting `thinkingBudgetTokens` in the personality's `body.thinkingConfig`. The Anthropic provider enforces three constraints imposed by the API:

**Temperature override** — `resolveTemperature()` forces `temperature: 1` whenever thinking is enabled, regardless of the personality's configured temperature. The Anthropic API rejects any other value when `thinking.type` is `'enabled'`.

**Thinking block round-trip** — `mapMessages()` now preserves thinking blocks before the text and tool-use blocks they precede. The Anthropic API requires that within any assistant message, thinking content blocks appear in the exact order they were originally returned, and before any non-thinking content. The updated implementation collects thinking blocks from stored `thinkingBlocks` on `AIMessage` and emits them first, followed by text/tool-use blocks.

**Signature preservation** — Each `ThinkingBlock` stores both the `thinking` text (the model's visible reasoning) and the `signature` (an opaque token the API uses for integrity verification). Only the `signature` is required for round-tripping; the `thinking` text is preserved for display purposes. The `ThinkingBlockSchema` (`{ thinking: string, signature: string }`) is defined in shared types so both storage and display layers share the same shape.

`chatStream()` handles incoming `thinking` content block events from the Anthropic streaming API, accumulating delta text and emitting `thinking_delta` chunks. When the stream closes, `finalMessage()` extracts the complete `ThinkingBlock[]` array and includes it in the `done` event payload. `mapResponse()` populates `thinkingContent` (concatenated text) and `thinkingBlocks` (full array with signatures) on the `AIResponse`. `mapUsage()` includes `thinkingTokens` from the `thinking_input_tokens` usage field.

### 3. MCP Tool Routing Fix

Both the streaming and non-streaming chat paths now route unrecognised tool names through `mcpClient.callTool()` before falling back to `"Unknown tool"`. Previously, `executeCreationTool` was the sole dispatch point and had no MCP-awareness — any tool whose name was not in the static creation tool registry was silently treated as unknown.

The fix adds an explicit branch: if the tool name is not found in the creation tool registry, and `mcpClient` is available on the context, the call is forwarded to `mcpClient.callTool(toolName, args)`. This matches the same resolution order used by the task execution path. The branch applies in both the blocking `POST /api/v1/chat` route and the new streaming route, so the fix is consistent across all chat surfaces.

### 4. Integration Platform Thinking Display

When a task completes via the integration path (Telegram, Discord, Slack), the `MessageRouter` passes `thinkingContent` from the task result into the message metadata. Each platform adapter renders it in a platform-appropriate collapsible or spoiler format:

| Platform | Rendering |
|---|---|
| **Telegram** | `<blockquote expandable>` HTML — collapsed by default, tappable to expand |
| **Discord** | Spoiler text `\|\|...\|\|` inside an embed field labelled "Thinking" |
| **Slack** | Context block prepended before the main message block |

Thinking is only included when non-empty, so messages from models or personalities without thinking enabled are unaffected.

### 5. Personality Thinking Config

`ThinkingPersonalityConfigSchema` is added to `packages/shared/src/types/soul.ts`:

```ts
ThinkingPersonalityConfigSchema = z.object({
  enabled: z.boolean(),
  budgetTokens: z.number().int().min(1024),
})
```

`BodyConfigSchema` gains an optional `thinkingConfig?: ThinkingPersonalityConfig` field. The chat route reads `personality.body?.thinkingConfig` and, when `enabled` is `true`, passes `thinkingBudgetTokens` to the AI request. The dashboard `PersonalityEditor` exposes the config as an "Extended Thinking" subsection in the Brain tab: an enable checkbox and a budget-tokens slider (range: 1024–32768, with common presets labelled).

---

## Consequences

**Positive**
- Users see the AI's progress in real time — thinking text appears as the model reasons, tool badges show which tool is executing, and the response streams in character-by-character. The perceived latency for long agentic chains drops dramatically even when wall-clock time is unchanged.
- Extended thinking round-tripping fixes a silent correctness bug that would have manifested as 400 errors in multi-turn conversations with thinking-enabled personalities.
- The MCP tool routing fix removes a category of silent failures where MCP tools appeared to run (the AI called them) but returned no results.
- All four chat surfaces (dashboard chat, editor chat, TUI, integrations) share the same SSE-based loop, so improvements to the loop benefit all surfaces simultaneously.
- `ChatStreamEventSchema` is defined once in shared types and reused by all consumers, preventing drift between server emission and client parsing.

**Negative / Trade-offs**
- `POST /api/v1/chat` (blocking) remains available for programmatic callers and integrations that do not support SSE. Two code paths now need to be kept in sync when the loop logic changes.
- The temperature override for thinking (forced `1`) overrides any personality-configured temperature. Operators who have tuned temperature for a personality and then enable thinking will silently lose their temperature setting during thinking-enabled calls.
- `budgetTokens` is a best-effort hint; the Anthropic API may return fewer thinking tokens than budgeted if the model determines less reasoning is needed. Operators setting large budgets will see higher costs on complex queries.
- Thinking blocks are stored in the message history in `AIMessage.thinkingBlocks`. The size of conversation history grows with each turn that uses thinking, which increases prompt token costs on subsequent turns.

---

## Alternatives Considered

**WebSocket instead of SSE** — rejected for this use case. The existing WebSocket channel is used for system-level broadcasts (task updates, health events). Chat streaming is a point-to-point request/response interaction that maps naturally to SSE's unidirectional, connection-per-request model. SSE also works transparently through HTTP/2 multiplexing and most reverse proxies without additional configuration.

**Storing only `signature`, not `thinking` text** — the Anthropic API only requires the `signature` for round-tripping. However, storing the full thinking text enables display in the dashboard, TUI, and integration platforms without a second API call. Storage overhead is acceptable given that thinking is opt-in per personality.

**Separate `canThink` capability gate in `creationConfig`** — deferred. Thinking is currently gated only by the personality's `thinkingConfig.enabled` flag and the provider being Anthropic. A future RBAC story may add a capability gate so operators can prevent certain personalities from using thinking even if globally configured.

---

## Files Changed

| File | Change |
|---|---|
| `packages/shared/src/types/ai.ts` | `ThinkingBlockSchema`, `CreationEventSchema`, `thinkingTokens` in `TokenUsageSchema`, `thinkingBlocks` in `AIMessageSchema`, `thinkingBudgetTokens` in `AIRequestSchema`, `thinkingContent`/`thinkingBlocks` in `AIResponseSchema`, `thinking_delta` variant in `AIStreamChunkSchema`, `ChatStreamEventSchema` (new) |
| `packages/shared/src/types/soul.ts` | `ThinkingPersonalityConfigSchema`, `thinkingConfig?` in `BodyConfigSchema` |
| `packages/core/src/ai/providers/anthropic.ts` | `resolveTemperature()` override; thinking params in `doChat()`; `thinking_delta` chunks and `thinkingBlocks` in `chatStream()`; thinking block ordering in `mapMessages()`; `thinkingContent`/`thinkingBlocks` in `mapResponse()`; `thinkingTokens` in `mapUsage()` |
| `packages/core/src/ai/chat-routes.ts` | `thinkingBudgetTokens` from personality in non-streaming path; MCP routing fix; new `POST /api/v1/chat/stream` SSE endpoint with full agentic loop |
| `packages/dashboard/src/components/ThinkingBlock.tsx` | New collapsible thinking display component; auto-opens during active streaming |
| `packages/dashboard/src/hooks/useChat.ts` | New `useChatStream()` hook consuming SSE events |
| `packages/dashboard/src/pages/ChatPage.tsx` | Switched to `useChatStream`; renders `ThinkingBlock` and active tool badges |
| `packages/dashboard/src/pages/EditorPage.tsx` | Switched to `useChatStream`; renders `ThinkingBlock` and active tool badges |
| `packages/dashboard/src/components/PersonalityEditor.tsx` | "Extended Thinking" config in Brain section (enable checkbox + budget token slider) |
| `packages/dashboard/src/types.ts` | `ChatMessage.thinkingContent`, `ChatResponse.thinkingContent`, `Personality.body.thinkingConfig` |
| `packages/core/src/cli/commands/tui.ts` | Switched to streaming endpoint; ANSI thinking box; `⚙ Using [tool]…` tool progress |
| `packages/core/src/integrations/telegram/` | Thinking as `<blockquote expandable>` HTML |
| `packages/core/src/integrations/discord/` | Thinking as spoiler `\|\|...\|\|` in embed |
| `packages/core/src/integrations/slack/` | Thinking as context block before message |
| `packages/core/src/integrations/message-router.ts` | Passes `thinkingContent` from task result to metadata |

---

### 6. Chat Message Phase Separation + Persistence (2026-02-24)

Two follow-on improvements built on the SSE streaming infrastructure:

#### Three-phase visual layout

Assistant messages in `ChatPage` and `EditorPage` (both streaming and historical) are rendered in three visually distinct phases separated by `border-t` dividers:

1. **Thinking** — `ThinkingBlock` (collapsible; auto-opens while streaming, collapses on completion).
2. **Tools used** — `Wrench` icon section with grey tool-call badges + primary-coloured creation sparkle cards. Creation events are ordered before the response text to match execution order.
3. **Response** — `ChatMarkdown` / streaming text.

The `border-t` divider before Phase 3 fires when either `toolCalls` or `creationEvents` are present (previously only when `creationEvents` was non-empty).

#### Tool call and thinking persistence

Previously, animated tool-call badges and thinking content disappeared after streaming completed because they were held only in transient component state and never saved to the database. On conversation reload, historical messages showed neither.

**Fix — client-side accumulation**: `completedToolCalls` is accumulated during streaming from `tool_start` / `mcp_tool_start` events and included in the `done`-event message stored in `messages` state. Historical messages restore these as grey (non-animated) badges.

**Fix — database columns** (migration `039_message_thinking_tools.sql`):
- `tool_calls_json JSONB` — stores the array of tool call objects on each assistant message row.
- `thinking_content TEXT` — stores the concatenated thinking text (always present in the `done` SSE event but never previously written to the DB).

Both columns are read on conversation load and surfaced to the client as part of the message history.

#### `delegate_task` badge enrichment

The `delegate_task` streaming badge now shows `"Delegation → {profile}: {task…}"` (first 50 characters of the task description) instead of the generic `"Delegation"` label, applied in the streaming path of `chat-routes.ts`.

---

## Future Work

- **Streaming for integration platforms** — Telegram, Discord, and Slack currently receive thinking as a static block in the final message. Progressive streaming (editing the message as chunks arrive) would require platform-specific polling or edit-message APIs.
- **Per-personality thinking capability gate** — add a `creationConfig`-style toggle so operators can allow or deny thinking independently of the provider configuration.
- **Thinking token budget auto-scaling** — dynamically adjust `budgetTokens` based on estimated task complexity (e.g. number of tools in scope, conversation length) rather than relying on a fixed operator-set value.
- **Single streaming loop** — the non-streaming `POST /api/v1/chat` path could be reimplemented as a thin wrapper over the streaming loop that accumulates all events and returns the `done` payload, eliminating the dual-path maintenance burden.
- **Thinking block compression** — for very long conversations with thinking enabled, `thinkingBlocks` in history may become a significant fraction of the prompt. A future compression pass could replace thinking blocks in deep history with a summary, similar to the progressive history compression in ADR 033.
