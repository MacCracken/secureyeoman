import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GrokProvider } from './grok.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';
import {
  RateLimitError,
  TokenLimitError,
  ProviderUnavailableError,
  InvalidResponseError,
} from '../errors.js';

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
      provider: 'grok',
      model: 'grok-2-1212',
      apiKeyEnv: 'XAI_API_KEY',
      maxTokens: 1024,
      temperature: 0.7,
      maxRequestsPerMinute: 60,
      requestTimeoutMs: 30000,
      maxRetries: 0,
      retryDelayMs: 100,
    },
    apiKey: 'test-xai-key',
    retryConfig: { maxRetries: 0 },
  };
}

const simpleRequest: AIRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

describe('GrokProvider', () => {
  let provider: GrokProvider;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GrokProvider(makeConfig());
    mockClient = { chat: { completions: { create: mockCreate } } };
  });

  describe('constructor', () => {
    it('should throw when no API key is provided', () => {
      const config = makeConfig();
      config.apiKey = '';
      delete process.env.XAI_API_KEY;
      expect(() => new GrokProvider({ model: config.model })).toThrow(
        'Grok provider requires XAI_API_KEY'
      );
    });

    it('should construct successfully with an API key', () => {
      expect(() => new GrokProvider(makeConfig())).not.toThrow();
    });
  });

  describe('chat', () => {
    it('should map request and response', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-grok-123',
        choices: [
          {
            message: { role: 'assistant', content: 'Hi from Grok!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });

      const response = await provider.chat(simpleRequest);
      expect(response.id).toBe('chatcmpl-grok-123');
      expect(response.content).toBe('Hi from Grok!');
      expect(response.usage.inputTokens).toBe(5);
      expect(response.usage.outputTokens).toBe(10);
      expect(response.stopReason).toBe('end_turn');
      expect(response.provider).toBe('grok');
    });

    it('should map tool_calls to unified ToolCall format', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-grok-124',
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
        id: 'chatcmpl-grok-125',
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

    it('should map 400 token error to TokenLimitError', async () => {
      const { APIError } = await import('openai');
      mockClient.chat.completions.create.mockRejectedValue(
        new (APIError as any)(400, 'token limit exceeded')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(TokenLimitError);
    });

    it('should map 503 to ProviderUnavailableError', async () => {
      const { APIError } = await import('openai');
      mockClient.chat.completions.create.mockRejectedValue(
        new (APIError as any)(503, 'service unavailable')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });

    it('should map other API errors to InvalidResponseError', async () => {
      const { APIError } = await import('openai');
      mockClient.chat.completions.create.mockRejectedValue(
        new (APIError as any)(422, 'unprocessable entity')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(InvalidResponseError);
    });
  });

  describe('chatStream', () => {
    it('should yield content_delta chunks', async () => {
      const chunks = [
        { choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null },
        { choices: [{ delta: { content: ' world' }, finish_reason: null }], usage: null },
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) yield chunk;
      }

      mockCreate.mockResolvedValue(mockStream());

      const results: any[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        results.push(chunk);
      }

      expect(results.find((r) => r.type === 'content_delta' && r.content === 'Hello')).toBeTruthy();
      expect(
        results.find((r) => r.type === 'content_delta' && r.content === ' world')
      ).toBeTruthy();
      expect(results.find((r) => r.type === 'done')).toBeTruthy();
    });

    it('should yield usage chunk', async () => {
      const chunks = [
        {
          choices: [{ delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
        },
      ];

      async function* mockStream() {
        for (const chunk of chunks) yield chunk;
      }

      mockCreate.mockResolvedValue(mockStream());

      const results: any[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        results.push(chunk);
      }

      const usageChunk = results.find((r) => r.type === 'usage');
      expect(usageChunk).toBeTruthy();
      expect(usageChunk.usage.inputTokens).toBe(5);
      expect(usageChunk.usage.outputTokens).toBe(10);
    });
  });

  describe('fetchAvailableModels', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return models from x.ai endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'grok-3', owned_by: 'xai' },
            { id: 'grok-2-1212', owned_by: 'xai' },
          ],
        }),
      });

      const models = await GrokProvider.fetchAvailableModels('test-key');

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('grok-3');
      expect(models[1].id).toBe('grok-2-1212');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.x.ai/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        })
      );
    });

    it('should return empty array on fetch failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const models = await GrokProvider.fetchAvailableModels('bad-key');
      expect(models).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const models = await GrokProvider.fetchAvailableModels('test-key');
      expect(models).toEqual([]);
    });

    it('should return empty array when no key provided', async () => {
      const models = await GrokProvider.fetchAvailableModels();
      expect(models).toEqual([]);
    });
  });

  describe('getKnownModels', () => {
    it('should return known Grok models', () => {
      const models = GrokProvider.getKnownModels();
      expect(models).toHaveLength(4);
      expect(models.map((m) => m.id)).toEqual([
        'grok-3',
        'grok-3-mini',
        'grok-2-1212',
        'grok-2-vision-1212',
      ]);
    });
  });
});
