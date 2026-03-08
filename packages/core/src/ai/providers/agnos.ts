/**
 * AGNOS Gateway Provider
 *
 * Routes LLM calls through the AGNOS LLM gateway, which provides:
 * - Multi-provider routing (Ollama, llama.cpp, OpenAI, Anthropic)
 * - Token accounting per agent
 * - Response caching and rate limiting
 * - Local-first with cloud fallback
 *
 * Uses OpenAI-compatible /v1/chat/completions endpoint.
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
import { ProviderUnavailableError, InvalidResponseError } from '../errors.js';
import type { SecureLogger } from '../../logging/logger.js';

const DEFAULT_BASE_URL = 'http://127.0.0.1:8088';

// OpenAI-compatible types used by AGNOS gateway
interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

interface OAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

interface OAIChatResponse {
  id: string;
  model: string;
  choices: {
    index: number;
    message: {
      role: string;
      content: string | null;
      tool_calls?: OAIToolCall[];
    };
    finish_reason: string;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

interface OAIStreamChunk {
  id: string;
  model: string;
  choices: {
    index: number;
    delta: {
      role?: string;
      content?: string | null;
      tool_calls?: {
        index: number;
        id?: string;
        function?: { name?: string; arguments?: string };
      }[];
    };
    finish_reason: string | null;
  }[];
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

export class AGNOSProvider extends BaseProvider {
  readonly name: AIProviderName = 'agnos';
  private readonly baseUrl: string;

  constructor(config: ProviderConfig, logger?: SecureLogger) {
    super(config, logger);
    this.baseUrl = config.model.baseUrl ?? DEFAULT_BASE_URL;
  }

  protected async doChat(request: AIRequest): Promise<AIResponse> {
    const model = this.resolveModel(request);
    const body = this.buildRequestBody(request, model, false);
    const response = await this.fetchApi(body);
    const data = (await response.json()) as OAIChatResponse;
    return this.mapResponse(data, model);
  }

  async *chatStream(request: AIRequest): AsyncGenerator<AIStreamChunk, void, unknown> {
    const model = this.resolveModel(request);
    const body = this.buildRequestBody(request, model, true);
    const response = await this.fetchApi(body);

    if (!response.body) {
      throw new InvalidResponseError('agnos', 'No response body for streaming');
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
          const trimmed = line.trim();
          if (!trimmed || trimmed === 'data: [DONE]') continue;
          if (!trimmed.startsWith('data: ')) continue;

          const chunk = JSON.parse(trimmed.slice(6)) as OAIStreamChunk;
          const choice = chunk.choices[0];
          if (!choice) continue;

          if (choice.delta.content) {
            yield { type: 'content_delta', content: choice.delta.content };
          }

          if (choice.delta.tool_calls?.length) {
            for (const tc of choice.delta.tool_calls) {
              if (tc.id && tc.function?.name) {
                yield {
                  type: 'tool_call_delta',
                  toolCall: { id: tc.id, name: tc.function.name },
                };
              }
            }
          }

          if (choice.finish_reason) {
            const usage: TokenUsage = chunk.usage
              ? {
                  inputTokens: chunk.usage.prompt_tokens,
                  outputTokens: chunk.usage.completion_tokens,
                  cachedTokens: 0,
                  totalTokens: chunk.usage.total_tokens,
                }
              : { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 };

            yield {
              type: 'done',
              stopReason: this.mapFinishReason(choice.finish_reason),
              usage,
            };
          }
        }
      }
    } finally {
      reader.releaseLock();
    }
  }

  // ─── Helpers ─────────────────────────────────────────────────

  private buildRequestBody(
    request: AIRequest,
    model: string,
    stream: boolean
  ): Record<string, unknown> {
    return {
      model,
      messages: this.mapMessages(request.messages),
      temperature: this.resolveTemperature(request),
      max_tokens: this.resolveMaxTokens(request),
      stream,
      ...(stream ? { stream_options: { include_usage: true } } : {}),
      ...(request.stopSequences?.length ? { stop: request.stopSequences } : {}),
      ...(request.tools?.length ? { tools: this.mapTools(request.tools) } : {}),
    };
  }

  private mapMessages(messages: AIMessage[]): OAIMessage[] {
    return messages.map((msg): OAIMessage => {
      if (msg.role === 'tool' && msg.toolResult) {
        return {
          role: 'tool',
          content: msg.toolResult.content,
          tool_call_id: msg.toolResult.toolCallId,
        };
      }

      if (msg.role === 'assistant' && msg.toolCalls?.length) {
        return {
          role: 'assistant',
          content: msg.content ?? null,
          tool_calls: msg.toolCalls.map((tc) => ({
            id: tc.id,
            type: 'function' as const,
            function: { name: tc.name, arguments: JSON.stringify(tc.arguments) },
          })),
        };
      }

      return { role: msg.role, content: msg.content ?? '' };
    });
  }

  private mapTools(tools: Tool[]): OAITool[] {
    return tools.map((t) => ({
      type: 'function' as const,
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as Record<string, unknown>,
      },
    }));
  }

  private mapResponse(data: OAIChatResponse, model: string): AIResponse {
    const choice = data.choices[0];
    if (!choice) {
      throw new InvalidResponseError('agnos', 'No choices in response');
    }

    const toolCalls: ToolCall[] = [];
    if (choice.message.tool_calls?.length) {
      for (const tc of choice.message.tool_calls) {
        toolCalls.push({
          id: tc.id,
          name: tc.function.name,
          arguments: JSON.parse(tc.function.arguments),
        });
      }
    }

    const usage: TokenUsage = data.usage
      ? {
          inputTokens: data.usage.prompt_tokens,
          outputTokens: data.usage.completion_tokens,
          cachedTokens: 0,
          totalTokens: data.usage.total_tokens,
        }
      : { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 };

    return {
      id: data.id,
      content: choice.message.content ?? '',
      toolCalls: toolCalls.length > 0 ? toolCalls : undefined,
      usage,
      stopReason: this.mapFinishReason(choice.finish_reason),
      model: data.model ?? model,
      provider: 'agnos',
    };
  }

  private mapFinishReason(reason: string): AIResponse['stopReason'] {
    switch (reason) {
      case 'stop':
        return 'end_turn';
      case 'tool_calls':
        return 'tool_use';
      case 'length':
        return 'max_tokens';
      default:
        return 'end_turn';
    }
  }

  private async fetchApi(body: Record<string, unknown>): Promise<Response> {
    const url = `${this.baseUrl}/v1/chat/completions`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    if (this.apiKey) headers.Authorization = `Bearer ${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers,
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(this.modelConfig.requestTimeoutMs),
      });

      if (!response.ok) {
        if (response.status === 429) {
          throw new ProviderUnavailableError('agnos', 429);
        }
        if (response.status >= 500) {
          throw new ProviderUnavailableError('agnos', response.status);
        }
        throw new InvalidResponseError(
          'agnos',
          `HTTP ${response.status}: ${await response.text().catch(() => '')}`
        );
      }

      return response;
    } catch (error) {
      if (error instanceof InvalidResponseError || error instanceof ProviderUnavailableError) {
        throw error;
      }
      const msg = error instanceof Error ? error.message : String(error);
      if (msg.includes('ECONNREFUSED') || msg.includes('fetch failed')) {
        throw new ProviderUnavailableError(
          'agnos',
          undefined,
          error instanceof Error ? error : undefined
        );
      }
      throw error;
    }
  }
}
