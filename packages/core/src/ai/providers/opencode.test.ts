import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { OpenCodeProvider } from './opencode.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';
import { RateLimitError, AuthenticationError } from '../errors.js';

const mockCreate = vi.fn();
const mockFetch = vi.fn();

vi.mock('openai', () => {
  class APIError extends Error {
    status: number;
    constructor(status: number, message: string) {
      super(message);
      this.status = status;
      this.name = 'APIError';
    }
  }

  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    static APIError = APIError;
    constructor(_opts?: any) {}
  }

  return { default: MockOpenAI, APIError };
});

function makeConfig(): { model: ModelConfig; apiKey: string; retryConfig: { maxRetries: number } } {
  return {
    model: {
      provider: 'opencode',
      model: 'gpt-5.2',
      apiKeyEnv: 'OPENCODE_API_KEY',
      maxTokens: 1024,
      temperature: 0.7,
      maxRequestsPerMinute: 60,
      requestTimeoutMs: 30000,
      maxRetries: 0,
      retryDelayMs: 100,
    },
    apiKey: 'test-key',
    retryConfig: { maxRetries: 0 },
  };
}

const simpleRequest: AIRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

describe('OpenCodeProvider', () => {
  let provider: OpenCodeProvider;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OpenCodeProvider(makeConfig());
    mockClient = { chat: { completions: { create: mockCreate } } };
  });

  describe('chat', () => {
    it('should map request and response', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-123',
        choices: [
          {
            message: { role: 'assistant', content: 'Hi there!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });

      const response = await provider.chat(simpleRequest);
      expect(response.id).toBe('chatcmpl-123');
      expect(response.content).toBe('Hi there!');
      expect(response.usage.inputTokens).toBe(5);
      expect(response.usage.outputTokens).toBe(10);
      expect(response.stopReason).toBe('end_turn');
      expect(response.provider).toBe('opencode');
    });

    it('should map tool_calls to unified ToolCall format', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-124',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call_1',
                  type: 'function',
                  function: { name: 'search', arguments: '{"query":"weather"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const response = await provider.chat(simpleRequest);
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0]).toEqual({
        id: 'call_1',
        name: 'search',
        arguments: { query: 'weather' },
      });
      expect(response.stopReason).toBe('tool_use');
    });

    it('should map system messages correctly', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-125',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const request: AIRequest = {
        messages: [
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hi' },
        ],
        stream: false,
      };

      await provider.chat(request);
      const callArgs = mockClient.chat.completions.create.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({ role: 'system', content: 'Be helpful' });
    });
  });

  describe('error handling', () => {
    it('should map 429 to RateLimitError', async () => {
      const { APIError } = await import('openai');
      mockClient.chat.completions.create.mockRejectedValue(
        new (APIError as any)(429, 'rate limited')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(RateLimitError);
    });

    it('should map 401 to AuthenticationError', async () => {
      const { APIError } = await import('openai');
      mockClient.chat.completions.create.mockRejectedValue(
        new (APIError as any)(401, 'invalid key')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(AuthenticationError);
    });
  });

  describe('fetchAvailableModels', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return all models from OpenCode endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'gpt-5.2', owned_by: 'opencode' },
            { id: 'claude-sonnet-4-5', owned_by: 'opencode' },
          ],
        }),
      });

      const models = await OpenCodeProvider.fetchAvailableModels('test-key');

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('gpt-5.2');
      expect(models[1].id).toBe('claude-sonnet-4-5');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://opencode.ai/zen/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        })
      );
    });

    it('should use custom base URL', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({ data: [] }),
      });

      await OpenCodeProvider.fetchAvailableModels('test-key', 'https://custom.api.com/v1');

      expect(mockFetch).toHaveBeenCalledWith('https://custom.api.com/v1/models', expect.anything());
    });

    it('should return empty array on fetch failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const models = await OpenCodeProvider.fetchAvailableModels('bad-key');
      expect(models).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const models = await OpenCodeProvider.fetchAvailableModels('test-key');
      expect(models).toEqual([]);
    });
  });

  describe('chatStream', () => {
    it('yields content_delta chunks', async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null };
        yield { choices: [{ delta: { content: ' there' }, finish_reason: null }], usage: null };
        yield {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        };
      }
      mockCreate.mockResolvedValueOnce(mockStream());
      const chunks: any[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'content_delta')).toBe(true);
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });

    it('yields tool_call_delta chunks', async () => {
      async function* mockStream() {
        yield {
          choices: [
            {
              delta: {
                tool_calls: [{ id: 'call_1', function: { name: 'search', arguments: '' } }],
              },
              finish_reason: null,
            },
          ],
          usage: null,
        };
        yield { choices: [{ delta: {}, finish_reason: 'tool_calls' }], usage: null };
      }
      mockCreate.mockResolvedValueOnce(mockStream());
      const chunks: any[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'tool_call_delta')).toBe(true);
    });

    it('propagates mapped errors from stream', async () => {
      const { APIError } = await import('openai');
      mockCreate.mockRejectedValueOnce(new (APIError as any)(429, 'rate limited'));
      await expect(async () => {
        for await (const _ of provider.chatStream(simpleRequest)) {
          /* consume */
        }
      }).rejects.toThrow(RateLimitError);
    });
  });

  describe('message mapping', () => {
    it('maps tool role messages', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'r1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });
      const request: AIRequest = {
        messages: [
          {
            role: 'tool',
            content: 'result',
            toolResult: { toolCallId: 'tc-1', content: 'tool output' },
          },
        ],
        stream: false,
      };
      await provider.chat(request);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0]).toEqual({
        role: 'tool',
        tool_call_id: 'tc-1',
        content: 'tool output',
      });
    });

    it('maps assistant messages with tool calls', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'r1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });
      const request: AIRequest = {
        messages: [
          {
            role: 'assistant',
            content: null,
            toolCalls: [{ id: 'tc-1', name: 'search', arguments: { q: 'hello' } }],
          },
        ],
        stream: false,
      };
      await provider.chat(request);
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.messages[0].tool_calls).toHaveLength(1);
      expect(callArgs.messages[0].tool_calls[0].id).toBe('tc-1');
    });

    it('maps stop sequences', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'r1',
        choices: [{ message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });
      await provider.chat({
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
        stopSequences: ['END'],
      });
      const callArgs = mockCreate.mock.calls[0][0];
      expect(callArgs.stop).toEqual(['END']);
    });
  });

  describe('stopReason mapping', () => {
    it('maps length finish_reason to max_tokens', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'r1',
        choices: [
          { message: { role: 'assistant', content: 'truncated' }, finish_reason: 'length' },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 1000, total_tokens: 1005 },
      });
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('max_tokens');
    });

    it('maps tool_calls finish_reason to tool_use', async () => {
      mockCreate.mockResolvedValueOnce({
        id: 'r1',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'tc-1', type: 'function', function: { name: 'f', arguments: '{}' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 5, total_tokens: 10 },
      });
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('tool_use');
    });
  });

  describe('additional error handling', () => {
    it('maps 400 token error to TokenLimitError', async () => {
      const { APIError } = await import('openai');
      const { TokenLimitError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(
        new (APIError as any)(400, 'context length exceeded token limit')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(TokenLimitError);
    });

    it('maps 502 to ProviderUnavailableError', async () => {
      const { APIError } = await import('openai');
      const { ProviderUnavailableError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(new (APIError as any)(502, 'bad gateway'));
      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });

    it('maps 503 to ProviderUnavailableError', async () => {
      const { APIError } = await import('openai');
      const { ProviderUnavailableError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(new (APIError as any)(503, 'service unavailable'));
      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });

    it('maps 400 non-token error to InvalidResponseError', async () => {
      const { APIError } = await import('openai');
      const { InvalidResponseError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(new (APIError as any)(400, 'bad request'));
      await expect(provider.chat(simpleRequest)).rejects.toThrow(InvalidResponseError);
    });

    it('rethrows non-Error objects as Error', async () => {
      mockCreate.mockRejectedValueOnce('string error');
      await expect(provider.chat(simpleRequest)).rejects.toThrow('string error');
    });
  });
});
