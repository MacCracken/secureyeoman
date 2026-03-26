/**
 * OpenAI-Compatible Types & Mappers
 *
 * Shared types and conversion utilities for providers that use the OpenAI-compatible
 * /v1/chat/completions API format (hoosh, AGNOS gateway, and any future OAI-compat providers).
 */

import type {
  AIMessage,
  AIResponse,
  AIStreamChunk,
  AIProviderName,
  TokenUsage,
  Tool,
  ToolCall,
} from '@secureyeoman/shared';

// ─── OpenAI-Compatible Wire Types ─────────────────────────────────

export interface OAIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string | null;
  tool_calls?: OAIToolCall[];
  tool_call_id?: string;
}

export interface OAIToolCall {
  id: string;
  type: 'function';
  function: { name: string; arguments: string };
}

export interface OAITool {
  type: 'function';
  function: {
    name: string;
    description?: string;
    parameters: Record<string, unknown>;
  };
}

export interface OAIChatResponse {
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
  usage?: OAIUsage;
}

export interface OAIUsage {
  prompt_tokens: number;
  completion_tokens: number;
  total_tokens: number;
}

export interface OAIStreamChunk {
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
  usage?: OAIUsage;
}

// ─── Mappers ──────────────────────────────────────────────────────

export function mapMessagesToOAI(messages: AIMessage[]): OAIMessage[] {
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

export function mapToolsToOAI(tools: Tool[]): OAITool[] {
  return tools.map((t) => ({
    type: 'function' as const,
    function: {
      name: t.name,
      description: t.description,
      parameters: t.parameters as Record<string, unknown>,
    },
  }));
}

export function mapOAIUsage(usage?: OAIUsage): TokenUsage {
  if (!usage) {
    return { inputTokens: 0, outputTokens: 0, cachedTokens: 0, totalTokens: 0 };
  }
  return {
    inputTokens: usage.prompt_tokens,
    outputTokens: usage.completion_tokens,
    cachedTokens: 0,
    totalTokens: usage.total_tokens,
  };
}

export function mapOAIFinishReason(reason: string): AIResponse['stopReason'] {
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

export function mapOAIToolCalls(toolCalls?: OAIToolCall[]): ToolCall[] | undefined {
  if (!toolCalls?.length) return undefined;
  return toolCalls.map((tc) => {
    let parsedArgs: Record<string, unknown>;
    try {
      parsedArgs = JSON.parse(tc.function.arguments) as Record<string, unknown>;
    } catch {
      parsedArgs = {};
    }
    return { id: tc.id, name: tc.function.name, arguments: parsedArgs };
  });
}

export function mapOAIResponse(
  data: OAIChatResponse,
  model: string,
  providerName: AIProviderName
): AIResponse {
  const choice = data.choices[0];
  if (!choice) {
    throw new Error(`No choices in ${providerName} response`);
  }

  return {
    id: data.id,
    content: choice.message.content ?? '',
    toolCalls: mapOAIToolCalls(choice.message.tool_calls),
    usage: mapOAIUsage(data.usage),
    stopReason: mapOAIFinishReason(choice.finish_reason),
    model: data.model ?? model,
    provider: providerName,
  };
}

export function buildOAIRequestBody(
  messages: OAIMessage[],
  tools: OAITool[] | undefined,
  model: string,
  temperature: number,
  maxTokens: number,
  stream: boolean,
  stopSequences?: string[]
): Record<string, unknown> {
  return {
    model,
    messages,
    temperature,
    max_tokens: maxTokens,
    stream,
    ...(stream ? { stream_options: { include_usage: true } } : {}),
    ...(stopSequences?.length ? { stop: stopSequences } : {}),
    ...(tools?.length ? { tools } : {}),
  };
}

/**
 * Parse SSE stream chunks from a ReadableStream. Yields parsed OAIStreamChunk objects.
 * Handles buffering, `data: [DONE]`, and malformed lines gracefully.
 */
export async function* parseOAISSEStream(
  reader: ReadableStreamDefaultReader<Uint8Array>,
  decoder: TextDecoder
): AsyncGenerator<OAIStreamChunk, void, unknown> {
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

        try {
          yield JSON.parse(trimmed.slice(6)) as OAIStreamChunk;
        } catch {
          // skip malformed SSE data
        }
      }
    }
  } finally {
    reader.releaseLock();
  }
}

/**
 * Convert a parsed OAI stream chunk into SY AIStreamChunk yields.
 */
export function* mapOAIStreamChunk(chunk: OAIStreamChunk): Generator<AIStreamChunk, void, unknown> {
  const choice = chunk.choices[0];
  if (!choice) return;

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
    yield {
      type: 'done',
      stopReason: mapOAIFinishReason(choice.finish_reason),
      usage: mapOAIUsage(chunk.usage),
    };
  }
}
