/**
 * OpenAI WebSocket Provider — Persistent-connection variant of the OpenAI provider.
 *
 * Uses the Responses API over WebSocket (`wss://api.openai.com/v1/responses`)
 * for ~40% faster multi-turn interactions. Key advantages:
 *   - Persistent connections avoid TCP+TLS handshake per request
 *   - Incremental turn submission via `previous_response_id` (no full context replay)
 *   - Connection pooling across conversations
 *
 * Falls back to HTTP automatically when the WebSocket connection is unavailable
 * (circuit-breaker style: after 3 consecutive WS failures, disables WS for 60s).
 *
 * Implements the same AIProvider interface as OpenAIProvider — the AIClient
 * selects this variant when `modelConfig.useWebSocket` is true.
 */

import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  AIMessage,
  ToolCall,
  TokenUsage,
  Tool,
  AIProviderName,
} from '@secureyeoman/shared';
import { BaseProvider, type ProviderConfig } from './base.js';
import { OpenAIProvider } from './openai.js';
import {
  OpenAIWsTransport,
  type WsTransportConfig,
  type WsServerEvent,
} from '../transports/openai-ws-transport.js';
import {
  RateLimitError,
  AuthenticationError,
  ProviderUnavailableError,
  InvalidResponseError,
} from '../errors.js';
import type { SecureLogger } from '../../logging/logger.js';

// ── Constants ────────────────────────────────────────────────────────────────

/** After this many consecutive WS failures, fall back to HTTP. */
const WS_FAILURE_THRESHOLD = 3;
/** How long to disable WS after hitting the failure threshold (ms). */
const WS_COOLDOWN_MS = 60_000;

// ── Provider ─────────────────────────────────────────────────────────────────

export class OpenAIWsProvider extends BaseProvider {
  readonly name: AIProviderName = 'openai';
  private readonly transport: OpenAIWsTransport;
  private readonly httpFallback: OpenAIProvider;
  private wsFailureCount = 0;
  private wsDisabledUntil = 0;

  constructor(config: ProviderConfig, logger?: SecureLogger) {
    super(config, logger);

    const apiKey = config.apiKey ?? '';
    const wsConfig: WsTransportConfig = {
      apiKey,
      ...(config.model.baseUrl
        ? { endpoint: config.model.baseUrl.replace(/^http/, 'ws') + '/v1/responses' }
        : {}),
    };

    this.transport = new OpenAIWsTransport(wsConfig, logger);
    this.httpFallback = new OpenAIProvider(config, logger);
  }

  private isWsAvailable(): boolean {
    if (Date.now() < this.wsDisabledUntil) return false;
    return this.wsFailureCount < WS_FAILURE_THRESHOLD;
  }

  private recordWsSuccess(): void {
    this.wsFailureCount = 0;
  }

  private recordWsFailure(): void {
    this.wsFailureCount++;
    if (this.wsFailureCount >= WS_FAILURE_THRESHOLD) {
      this.wsDisabledUntil = Date.now() + WS_COOLDOWN_MS;
      this.logger?.warn(
        { failures: this.wsFailureCount, cooldownMs: WS_COOLDOWN_MS },
        'OpenAI WS disabled temporarily, falling back to HTTP'
      );
    }
  }

  // ── AIProvider interface ──────────────────────────────────────────────────

  protected async doChat(request: AIRequest): Promise<AIResponse> {
    if (!this.isWsAvailable()) {
      return this.httpFallback.chat(request);
    }

    try {
      const response = await this.doChatWs(request);
      this.recordWsSuccess();
      return response;
    } catch (error) {
      this.recordWsFailure();
      this.logger?.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'OpenAI WS chat failed, falling back to HTTP'
      );
      return this.httpFallback.chat(request);
    }
  }

  async *chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    if (!this.isWsAvailable()) {
      yield* this.httpFallback.chatStream(request);
      return;
    }

    try {
      yield* this.doChatStreamWs(request);
      this.recordWsSuccess();
    } catch (error) {
      this.recordWsFailure();
      this.logger?.debug(
        { error: error instanceof Error ? error.message : String(error) },
        'OpenAI WS stream failed, falling back to HTTP'
      );
      yield* this.httpFallback.chatStream(request);
    }
  }

  // ── WebSocket chat implementation ─────────────────────────────────────────

  private async doChatWs(request: AIRequest): Promise<AIResponse> {
    const model = this.resolveModel(request);
    const sessionKey =
      ((request as Record<string, unknown>).conversationId as string | undefined) ?? 'default';
    const conn = await this.transport.acquire(sessionKey);

    const payload = this.buildWsPayload(model, request, conn.lastResponseId, false);

    let response: AIResponse | null = null;
    const toolCalls: ToolCall[] = [];
    const contentParts: string[] = [];
    let usage: TokenUsage = { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 };
    let responseId = '';
    let stopReason: AIResponse['stopReason'] = 'end_turn';

    for await (const event of this.transport.send(conn, payload)) {
      this.processNonStreamEvent(
        event,
        { toolCalls, contentParts, model },
        (u) => {
          usage = u;
        },
        (id) => {
          responseId = id;
        },
        (sr) => {
          stopReason = sr;
        }
      );

      if (event.type === 'error') {
        this.transport.release(conn);
        throw this.mapWsError(event);
      }
    }

    this.transport.release(conn);

    response = {
      id: responseId || `ws-${Date.now()}`,
      content: contentParts.join(''),
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      stopReason,
      model,
      provider: 'openai',
    };

    return response;
  }

  private async *doChatStreamWs(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    const model = this.resolveModel(request);
    const sessionKey =
      ((request as Record<string, unknown>).conversationId as string | undefined) ?? 'default';
    const conn = await this.transport.acquire(sessionKey);

    const payload = this.buildWsPayload(model, request, conn.lastResponseId, true);

    let currentToolId = '';
    let currentToolName = '';

    try {
      for await (const event of this.transport.send(conn, payload)) {
        // Content delta
        if (event.type === 'response.output_item.added' && event.item?.type === 'message') {
          // New message output item — no action needed, deltas follow
        }

        if (event.type === 'response.content_part.delta' && event.delta) {
          yield { type: 'content_delta', content: event.delta };
        }

        // Tool call events
        if (event.type === 'response.output_item.added' && event.item?.type === 'function_call') {
          currentToolId = event.item.call_id ?? event.item.id ?? '';
          currentToolName = event.item.name ?? '';
          yield {
            type: 'tool_call_delta',
            toolCall: { id: currentToolId, name: currentToolName },
          };
        }

        if (event.type === 'response.function_call_arguments.delta') {
          yield {
            type: 'tool_call_delta',
            toolCall: { id: currentToolId, name: currentToolName },
          };
        }

        // Response completed
        if (event.type === 'response.completed' && event.response) {
          const usage = this.mapWsUsage(event.response.usage);
          yield { type: 'usage', usage };
          yield {
            type: 'done',
            stopReason: this.mapWsStopReason(event.response.status),
            usage,
          };
        }

        // Error
        if (event.type === 'error') {
          throw this.mapWsError(event);
        }

        // Cancelled / failed
        if (event.type === 'response.failed') {
          throw new ProviderUnavailableError('openai', undefined, new Error('Response failed'));
        }
      }
    } finally {
      this.transport.release(conn);
    }
  }

  // ── Payload building ──────────────────────────────────────────────────────

  private buildWsPayload(
    model: string,
    request: AIRequest,
    previousResponseId: string | null,
    stream: boolean
  ): Record<string, unknown> {
    const reasoning = /^o[13](-mini)?$/.test(model);
    const payload: Record<string, unknown> = {
      type: 'response.create',
      response: {
        model,
        modalities: ['text'],
        ...(request.maxTokens ? { max_output_tokens: this.resolveMaxTokens(request) } : {}),
        ...(request.tools?.length ? { tools: this.mapWsTools(request.tools) } : {}),
        ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
        ...(!reasoning ? { temperature: this.resolveTemperature(request) } : {}),
        ...(reasoning && request.reasoningEffort
          ? { reasoning: { effort: request.reasoningEffort } }
          : {}),
        // Incremental turn: send only new messages if we have a previous response
        ...(previousResponseId
          ? {
              previous_response_id: previousResponseId,
              input: this.mapInputMessages(request.messages, true),
            }
          : {
              input: this.mapInputMessages(request.messages, false),
            }),
      },
    };

    if (stream) {
      (payload.response as Record<string, unknown>).stream = true;
    }

    return payload;
  }

  /**
   * Map messages to Responses API input format.
   * When `incrementalOnly` is true, only the last user turn is sent
   * (previous context is carried by `previous_response_id`).
   */
  private mapInputMessages(messages: AIMessage[], incrementalOnly: boolean): unknown[] {
    const messagesToMap = incrementalOnly ? this.getIncrementalMessages(messages) : messages;

    return messagesToMap
      .map((msg) => {
        if (msg.role === 'system') {
          return {
            type: 'message',
            role: 'system',
            content: [{ type: 'input_text', text: msg.content ?? '' }],
          };
        }

        if (msg.role === 'tool' && msg.toolResult) {
          return {
            type: 'function_call_output',
            call_id: msg.toolResult.toolCallId,
            output: msg.toolResult.content,
          };
        }

        if (msg.role === 'assistant') {
          const items: unknown[] = [];
          if (msg.content) {
            items.push({
              type: 'message',
              role: 'assistant',
              content: [{ type: 'output_text', text: msg.content }],
            });
          }
          if (msg.toolCalls?.length) {
            for (const tc of msg.toolCalls) {
              items.push({
                type: 'function_call',
                call_id: tc.id,
                name: tc.name,
                arguments: JSON.stringify(tc.arguments),
              });
            }
          }
          return items.length === 1 ? items[0] : items;
        }

        return {
          type: 'message',
          role: 'user',
          content: [{ type: 'input_text', text: msg.content ?? '' }],
        };
      })
      .flat();
  }

  /**
   * For incremental mode: extract only messages after the last assistant response.
   * This is the new user turn + any tool results that need to be submitted.
   */
  private getIncrementalMessages(messages: AIMessage[]): AIMessage[] {
    // Find the last assistant message index
    let lastAssistantIdx = -1;
    for (let i = messages.length - 1; i >= 0; i--) {
      if (messages[i]!.role === 'assistant') {
        lastAssistantIdx = i;
        break;
      }
    }

    // If no assistant message, send everything (first turn)
    if (lastAssistantIdx === -1) return messages;

    // Return messages after the last assistant message
    return messages.slice(lastAssistantIdx + 1);
  }

  private mapWsTools(tools: Tool[]): unknown[] {
    return tools.map((t) => ({
      type: 'function',
      name: t.name,
      description: t.description,
      parameters: t.parameters,
    }));
  }

  // ── Response mapping ──────────────────────────────────────────────────────

  private processNonStreamEvent(
    event: WsServerEvent,
    acc: { toolCalls: ToolCall[]; contentParts: string[]; model: string },
    setUsage: (u: TokenUsage) => void,
    setResponseId: (id: string) => void,
    setStopReason: (sr: AIResponse['stopReason']) => void
  ): void {
    if (event.type === 'response.completed' && event.response) {
      if (event.response.id) setResponseId(event.response.id);
      if (event.response.usage) setUsage(this.mapWsUsage(event.response.usage));
      setStopReason(this.mapWsStopReason(event.response.status));

      // Extract content and tool calls from output
      for (const item of event.response.output ?? []) {
        if (item.type === 'message' && item.content) {
          for (const part of item.content) {
            if (part.type === 'output_text' && part.text) {
              acc.contentParts.push(part.text);
            }
          }
        }
        if (item.type === 'function_call') {
          let args: Record<string, unknown> = {};
          try {
            args = JSON.parse(item.arguments ?? '{}') as Record<string, unknown>;
          } catch {
            args = { _raw: item.arguments };
          }
          acc.toolCalls.push({
            id: item.call_id ?? item.id ?? '',
            name: item.name ?? '',
            arguments: args,
          });
        }
      }
    }

    // Accumulate content from deltas in non-stream mode
    if (event.type === 'response.content_part.delta' && event.delta) {
      acc.contentParts.push(event.delta);
    }
  }

  private mapWsUsage(usage?: {
    input_tokens?: number;
    output_tokens?: number;
    total_tokens?: number;
  }): TokenUsage {
    return {
      inputTokens: usage?.input_tokens ?? 0,
      outputTokens: usage?.output_tokens ?? 0,
      cachedTokens: 0,
      totalTokens: usage?.total_tokens ?? (usage?.input_tokens ?? 0) + (usage?.output_tokens ?? 0),
    };
  }

  private mapWsStopReason(status?: string): AIResponse['stopReason'] {
    switch (status) {
      case 'completed':
        return 'end_turn';
      case 'incomplete':
        return 'max_tokens';
      case 'cancelled':
        return 'end_turn';
      default:
        return 'end_turn';
    }
  }

  private mapWsError(event: WsServerEvent): Error {
    const err = event.error;
    if (!err) return new InvalidResponseError('openai', 'Unknown WebSocket error');

    if (err.code === 'rate_limit_exceeded') {
      return new RateLimitError('openai');
    }
    if (err.code === 'invalid_api_key' || err.code === 'authentication_error') {
      return new AuthenticationError('openai');
    }
    if (err.code === 'server_error') {
      return new ProviderUnavailableError('openai', 500);
    }

    return new InvalidResponseError('openai', err.message ?? 'WebSocket error');
  }

  // ── Cleanup ───────────────────────────────────────────────────────────────

  /**
   * Get transport stats for monitoring.
   */
  getTransportStats(): ReturnType<OpenAIWsTransport['getPoolStats']> {
    return this.transport.getPoolStats();
  }

  /**
   * Dispose the transport (close all connections).
   */
  async dispose(): Promise<void> {
    await this.transport.dispose();
  }
}
