/**
 * Letta Provider
 *
 * Letta is a stateful agent platform with advanced persistent memory. Each
 * LettaProvider instance lazily initialises one Letta agent and reuses it
 * across calls.  If LETTA_AGENT_ID is set, that agent is used directly.
 *
 * Authentication: LETTA_API_KEY (Bearer token)
 * Cloud base URL: https://api.letta.com
 * Self-hosted:    LETTA_BASE_URL (default http://localhost:8283)
 *
 * Docs: https://docs.letta.com/api-reference/overview/
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
import {
  RateLimitError,
  TokenLimitError,
  AuthenticationError,
  ProviderUnavailableError,
  InvalidResponseError,
} from '../errors.js';
import type { SecureLogger } from '../../logging/logger.js';

const LETTA_CLOUD_URL = 'https://api.letta.com';
const LETTA_LOCAL_URL = 'http://localhost:8283';

// ─── Letta API Types ──────────────────────────────────────────────────────────

export interface LettaModelInfo {
  id: string;
  contextWindowSize?: number;
}

interface LettaContentBlock {
  type: string;
  text?: string;
}

interface LettaFunctionCall {
  name: string;
  arguments: string;
}

interface LettaToolCall {
  id: string;
  tool_call_type: 'function';
  function: LettaFunctionCall;
}

interface LettaMessage {
  message_type: string;
  id?: string;
  content?: string | LettaContentBlock[];
  tool_calls?: LettaToolCall[];
}

interface LettaUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
  cached_input_tokens?: number;
}

interface LettaMessagesResponse {
  messages: LettaMessage[];
  usage?: LettaUsage;
  stop_reason?: string;
}

interface LettaAgent {
  id: string;
  name: string;
}

interface LettaErrorBody {
  error?: { message?: string };
  detail?: string;
}

// ─── Provider ─────────────────────────────────────────────────────────────────

export class LettaProvider extends BaseProvider {
  readonly name: AIProviderName = 'letta';

  private readonly lettaApiKey: string;
  private readonly lettaBaseUrl: string;

  /** Cached agent ID — set on first request or from LETTA_AGENT_ID. */
  private lettaAgentId: string | undefined;
  /** In-flight agent creation promise to prevent races. */
  private agentCreatePromise: Promise<string> | undefined;

  constructor(config: ProviderConfig, logger?: SecureLogger) {
    super(config, logger);
    const key = config.apiKey ?? process.env.LETTA_API_KEY;
    if (!key) {
      throw new Error('Letta provider requires LETTA_API_KEY');
    }
    this.lettaApiKey = key;
    this.lettaBaseUrl =
      this.modelConfig.baseUrl ??
      process.env.LETTA_BASE_URL ??
      (process.env.LETTA_LOCAL === 'true' ? LETTA_LOCAL_URL : LETTA_CLOUD_URL);

    // Use a pre-configured agent if the user supplies one.
    const presetId = process.env.LETTA_AGENT_ID;
    if (presetId) {
      this.lettaAgentId = presetId;
    }
  }

  // ─── Agent Lifecycle ────────────────────────────────────────────────────────

  /**
   * Return the cached agent ID, or create a fresh Letta agent and cache it.
   * Concurrent callers share the same creation promise.
   */
  private async getOrCreateAgent(): Promise<string> {
    if (this.lettaAgentId) return this.lettaAgentId;

    if (!this.agentCreatePromise) {
      this.agentCreatePromise = this.createAgent().then((id) => {
        this.lettaAgentId = id;
        return id;
      });
    }

    return this.agentCreatePromise;
  }

  private async createAgent(): Promise<string> {
    const model = this.modelConfig.model;
    const response = await fetch(`${this.lettaBaseUrl}/v1/agents`, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({
        model,
        name: `secureyeoman-${Date.now()}`,
        memory_blocks: [
          { label: 'persona', value: 'You are a helpful AI assistant.' },
          { label: 'human', value: 'The user is interacting via SecureYeoman.' },
        ],
      }),
    });

    if (!response.ok) {
      throw await this.buildHttpError(response);
    }

    const agent = (await response.json()) as LettaAgent;
    return agent.id;
  }

  // ─── Core Chat ──────────────────────────────────────────────────────────────

  protected async doChat(request: AIRequest): Promise<AIResponse> {
    try {
      const agentId = await this.getOrCreateAgent();
      const body = this.buildBody(request);

      const response = await fetch(`${this.lettaBaseUrl}/v1/agents/${agentId}/messages`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw await this.buildHttpError(response);
      }

      const data = (await response.json()) as LettaMessagesResponse;
      return this.mapResponse(data, agentId);
    } catch (error) {
      throw this.mapError(error);
    }
  }

  async *chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    let agentId: string;
    try {
      agentId = await this.getOrCreateAgent();
    } catch (error) {
      throw this.mapError(error);
    }

    const body = { ...this.buildBody(request), streaming: true };

    let response: Response;
    try {
      response = await fetch(`${this.lettaBaseUrl}/v1/agents/${agentId}/messages/stream`, {
        method: 'POST',
        headers: this.buildHeaders(),
        body: JSON.stringify(body),
      });
    } catch (error) {
      throw this.mapError(error);
    }

    if (!response.ok) {
      throw this.mapError(await this.buildHttpError(response));
    }

    if (!response.body) {
      throw new InvalidResponseError('letta', 'No response body for stream');
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() ?? '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const raw = line.slice(6).trim();
          if (raw === '[DONE]') {
            yield { type: 'done', stopReason: 'end_turn' };
            return;
          }

          let chunk: {
            message_type?: string;
            delta?: { text?: string };
            usage?: LettaUsage;
            stop_reason?: string;
          };

          try {
            chunk = JSON.parse(raw) as typeof chunk;
          } catch {
            continue; // skip malformed SSE lines
          }

          if (chunk.message_type === 'assistant_message' && chunk.delta?.text) {
            yield { type: 'content_delta', content: chunk.delta.text };
          }

          if (chunk.usage) {
            yield { type: 'usage', usage: this.mapUsage(chunk.usage) };
          }

          if (chunk.stop_reason) {
            yield { type: 'done', stopReason: this.mapStopReason(chunk.stop_reason) };
            return;
          }
        }
      }
    } catch (error) {
      throw this.mapError(error);
    } finally {
      reader.releaseLock();
    }

    yield { type: 'done', stopReason: 'end_turn' };
  }

  // ─── Static Methods ─────────────────────────────────────────────────────────

  /**
   * Attempt to fetch available models from the Letta server.
   * Falls back gracefully to an empty array on any error.
   */
  static async fetchAvailableModels(apiKey?: string): Promise<LettaModelInfo[]> {
    const key = apiKey ?? process.env.LETTA_API_KEY;
    if (!key) return [];

    const baseUrl = process.env.LETTA_BASE_URL ?? LETTA_CLOUD_URL;
    try {
      const res = await fetch(`${baseUrl}/v1/models`, {
        headers: {
          Authorization: `Bearer ${key}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) return [];

      const data = (await res.json()) as {
        models?: { id?: string; context_window?: number }[];
      };
      return (data.models ?? [])
        .map((m) => ({ id: m.id ?? '', contextWindowSize: m.context_window }))
        .filter((m) => m.id.length > 0);
    } catch {
      return [];
    }
  }

  /**
   * Return the well-known Letta model identifiers.
   * These follow Letta's `provider/model-id` naming convention.
   */
  static getKnownModels(): LettaModelInfo[] {
    return [
      { id: 'openai/gpt-4o', contextWindowSize: 128000 },
      { id: 'openai/gpt-4o-mini', contextWindowSize: 128000 },
      { id: 'anthropic/claude-sonnet-4-20250514', contextWindowSize: 200000 },
      { id: 'anthropic/claude-haiku-3-5-20241022', contextWindowSize: 200000 },
    ];
  }

  // ─── Mapping Helpers ─────────────────────────────────────────────────────────

  private buildBody(request: AIRequest): Record<string, unknown> {
    const messages = this.mapMessages(request.messages);
    const body: Record<string, unknown> = { messages };
    if (request.tools?.length) {
      body['client_tools'] = this.mapTools(request.tools);
    }
    return body;
  }

  private mapMessages(messages: AIMessage[]): { role: string; content: string }[] {
    const mapped: { role: string; content: string }[] = [];
    for (const msg of messages) {
      if (msg.role === 'tool') continue; // Letta manages tool results internally
      const role = msg.role === 'assistant' ? 'assistant' : msg.role === 'system' ? 'system' : 'user';
      mapped.push({ role, content: msg.content ?? '' });
    }
    return mapped;
  }

  private mapTools(tools: Tool[]): unknown[] {
    return tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description ?? '',
        parameters: t.parameters as Record<string, unknown>,
      },
    }));
  }

  private mapResponse(data: LettaMessagesResponse, agentId: string): AIResponse {
    const assistantMsg = data.messages.find((m) => m.message_type === 'assistant_message');
    const content = this.extractContent(assistantMsg);
    const toolCalls = this.extractToolCalls(assistantMsg);

    return {
      id: agentId,
      content,
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage: this.mapUsage(data.usage),
      stopReason: this.mapStopReason(data.stop_reason),
      model: this.modelConfig.model,
      provider: 'letta',
    };
  }

  private extractContent(msg: LettaMessage | undefined): string {
    if (!msg) return '';
    if (typeof msg.content === 'string') return msg.content;
    if (Array.isArray(msg.content)) {
      return msg.content
        .filter((b) => b.type === 'text')
        .map((b) => b.text ?? '')
        .join('');
    }
    return '';
  }

  private extractToolCalls(msg: LettaMessage | undefined): ToolCall[] {
    if (!msg?.tool_calls?.length) return [];
    return msg.tool_calls.map((tc) => {
      let args: Record<string, unknown> = {};
      try {
        args = JSON.parse(tc.function.arguments) as Record<string, unknown>;
      } catch {
        args = { _raw: tc.function.arguments };
      }
      return { id: tc.id, name: tc.function.name, arguments: args };
    });
  }

  private mapUsage(usage: LettaUsage | undefined): TokenUsage {
    return {
      inputTokens: usage?.prompt_tokens ?? 0,
      outputTokens: usage?.completion_tokens ?? 0,
      cachedTokens: usage?.cached_input_tokens ?? 0,
      totalTokens: usage?.total_tokens ?? 0,
    };
  }

  private mapStopReason(reason: string | undefined): AIResponse['stopReason'] {
    switch (reason) {
      case 'end_turn':
      case 'stop':
        return 'end_turn';
      case 'tool_use':
      case 'tool_calls':
        return 'tool_use';
      case 'max_steps':
      case 'length':
        return 'max_tokens';
      default:
        return 'end_turn';
    }
  }

  private buildHeaders(): Record<string, string> {
    return {
      Authorization: `Bearer ${this.lettaApiKey}`,
      'Content-Type': 'application/json',
    };
  }

  private async buildHttpError(response: Response): Promise<Error> {
    let message = `HTTP ${response.status}`;
    try {
      const body = (await response.json()) as LettaErrorBody;
      if (body.error?.message) message = body.error.message;
      else if (body.detail) message = body.detail;
    } catch {
      // ignore JSON parse failures
    }

    if (response.status === 429) return new RateLimitError('letta', undefined, new Error(message));
    if (response.status === 401 || response.status === 403)
      return new AuthenticationError('letta', new Error(message));
    if (response.status === 400 && message.toLowerCase().includes('token'))
      return new TokenLimitError('letta', new Error(message));
    if (response.status === 502 || response.status === 503)
      return new ProviderUnavailableError('letta', response.status, new Error(message));
    return new InvalidResponseError('letta', message, new Error(message));
  }

  private mapError(error: unknown): Error {
    if (
      error instanceof RateLimitError ||
      error instanceof TokenLimitError ||
      error instanceof AuthenticationError ||
      error instanceof ProviderUnavailableError ||
      error instanceof InvalidResponseError
    ) {
      return error;
    }
    return error instanceof Error ? error : new Error(String(error));
  }
}
