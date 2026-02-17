import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { MistralProvider } from './mistral.js';
import type { AIRequest, ModelConfig } from '@friday/shared';
import { RateLimitError } from '../errors.js';

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
      provider: 'mistral',
      model: 'mistral-large-latest',
      apiKeyEnv: 'MISTRAL_API_KEY',
      maxTokens: 1024,
      temperature: 0.7,
      maxRequestsPerMinute: 60,
      requestTimeoutMs: 30000,
      maxRetries: 0,
      retryDelayMs: 100,
    },
    apiKey: 'test-mistral-key',
    retryConfig: { maxRetries: 0 },
  };
}

const simpleRequest: AIRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

describe('MistralProvider', () => {
  let provider: MistralProvider;
  let mockClient: any;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new MistralProvider(makeConfig());
    mockClient = { chat: { completions: { create: mockCreate } } };
  });

  describe('chat', () => {
    it('should map request and response', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-mistral-123',
        choices: [
          {
            message: { role: 'assistant', content: 'Hi from Mistral!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
      });

      const response = await provider.chat(simpleRequest);
      expect(response.id).toBe('chatcmpl-mistral-123');
      expect(response.content).toBe('Hi from Mistral!');
      expect(response.usage.inputTokens).toBe(5);
      expect(response.usage.outputTokens).toBe(10);
      expect(response.stopReason).toBe('end_turn');
      expect(response.provider).toBe('mistral');
    });

    it('should map tool_calls to unified ToolCall format', async () => {
      mockClient.chat.completions.create.mockResolvedValue({
        id: 'chatcmpl-mistral-124',
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
        id: 'chatcmpl-mistral-125',
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
  });

  describe('fetchAvailableModels', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return models from Mistral endpoint', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'mistral-large-latest', owned_by: 'mistralai' },
            { id: 'mistral-small-latest', owned_by: 'mistralai' },
          ],
        }),
      });

      const models = await MistralProvider.fetchAvailableModels('test-key');

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('mistral-large-latest');
      expect(models[1].id).toBe('mistral-small-latest');
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.mistral.ai/v1/models',
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        })
      );
    });

    it('should return empty array on fetch failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 500 });

      const models = await MistralProvider.fetchAvailableModels('bad-key');
      expect(models).toEqual([]);
    });

    it('should return empty array on network error', async () => {
      mockFetch.mockRejectedValue(new Error('network error'));

      const models = await MistralProvider.fetchAvailableModels('test-key');
      expect(models).toEqual([]);
    });

    it('should return empty array when no key provided', async () => {
      const models = await MistralProvider.fetchAvailableModels();
      expect(models).toEqual([]);
    });
  });

  describe('getKnownModels', () => {
    it('should return known Mistral models', () => {
      const models = MistralProvider.getKnownModels();
      expect(models).toHaveLength(5);
      expect(models.map((m) => m.id)).toEqual([
        'mistral-large-latest',
        'mistral-medium-latest',
        'mistral-small-latest',
        'codestral-latest',
        'open-mistral-nemo',
      ]);
    });
  });
});
