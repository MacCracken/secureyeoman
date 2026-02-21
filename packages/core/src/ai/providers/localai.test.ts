import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LocalAIProvider } from './localai.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';

const mockCreate = vi.fn();

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
    constructor(_opts?: unknown) {}
  }
  return { default: MockOpenAI, APIError };
});

function makeConfig(): { model: ModelConfig; retryConfig: { maxRetries: number } } {
  return {
    model: {
      provider: 'localai' as any,
      model: 'gpt-4-all',
      apiKeyEnv: '',
      maxTokens: 1024,
      temperature: 0.7,
      maxRequestsPerMinute: 60,
      requestTimeoutMs: 30000,
      maxRetries: 0,
      retryDelayMs: 100,
    },
    retryConfig: { maxRetries: 0 },
  };
}

const simpleRequest: AIRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

describe('LocalAIProvider', () => {
  let provider: LocalAIProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LocalAIProvider(makeConfig());
  });

  it('has name localai', () => {
    expect(provider.name).toBe('localai');
  });

  describe('doChat', () => {
    it('returns mapped response from API', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-1',
        choices: [
          {
            message: { role: 'assistant', content: 'Hello back!', tool_calls: undefined },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });

      const res = await provider.chat(simpleRequest);
      expect(res.content).toBe('Hello back!');
      expect(res.provider).toBe('localai');
      expect(res.usage.inputTokens).toBe(10);
      expect(res.stopReason).toBe('end_turn');
    });

    it('maps tool_calls finish reason', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-2',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [{ id: 'call-1', function: { name: 'compute', arguments: '{"x":1}' } }],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
      });

      const res = await provider.chat(simpleRequest);
      expect(res.stopReason).toBe('tool_use');
      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0].name).toBe('compute');
    });

    it('maps length finish reason to max_tokens', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-3',
        choices: [{ message: { content: 'cut off', role: 'assistant' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 5, completion_tokens: 1024, total_tokens: 1029 },
      });

      const res = await provider.chat(simpleRequest);
      expect(res.stopReason).toBe('max_tokens');
    });

    it('includes stop sequences in request', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-4',
        choices: [{ message: { content: 'OK', role: 'assistant' }, finish_reason: 'stop' }],
        usage: null,
      });

      await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
        stopSequences: ['###', '---'],
        stream: false,
      });

      const callArg = mockCreate.mock.calls[0][0] as any;
      expect(callArg.stop).toEqual(['###', '---']);
    });

    it('maps assistant messages with tool calls', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-5',
        choices: [{ message: { content: 'Done', role: 'assistant' }, finish_reason: 'stop' }],
        usage: null,
      });

      await provider.chat({
        messages: [
          {
            role: 'assistant',
            content: null,
            toolCalls: [{ id: 'call-1', name: 'fn', arguments: { a: 1 } }],
          },
        ],
        stream: false,
      });

      const callArg = mockCreate.mock.calls[0][0] as any;
      expect(callArg.messages[0].tool_calls).toHaveLength(1);
      expect(callArg.messages[0].tool_calls[0].function.name).toBe('fn');
    });
  });

  describe('fetchAvailableModels', () => {
    it('returns models from API', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({
            data: [{ id: 'gpt-4-all', owned_by: 'localai' }],
          }),
        })
      );

      const models = await LocalAIProvider.fetchAvailableModels('http://localhost:8080/v1');
      expect(models).toHaveLength(1);
      expect(models[0].id).toBe('gpt-4-all');
      expect(models[0].ownedBy).toBe('localai');

      vi.unstubAllGlobals();
    });

    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const models = await LocalAIProvider.fetchAvailableModels();
      expect(models).toEqual([]);
      vi.unstubAllGlobals();
    });

    it('returns empty array on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const models = await LocalAIProvider.fetchAvailableModels();
      expect(models).toEqual([]);
      vi.unstubAllGlobals();
    });
  });

  describe('chatStream', () => {
    it('yields content_delta and done chunks', async () => {
      async function* mockStream() {
        yield { choices: [{ delta: { content: 'Hello' }, finish_reason: null }], usage: null };
        yield { choices: [{ delta: { content: ' world' }, finish_reason: null }], usage: null };
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
      expect(chunks.some((c) => c.type === 'usage')).toBe(true);
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
      const { RateLimitError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(new (APIError as any)(429, 'rate limited'));
      await expect(async () => {
        for await (const _ of provider.chatStream(simpleRequest)) {
          /* consume */
        }
      }).rejects.toThrow(RateLimitError);
    });
  });

  describe('error handling', () => {
    it('maps 429 to RateLimitError', async () => {
      const { APIError } = await import('openai');
      const { RateLimitError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(new (APIError as any)(429, 'rate limited'));
      await expect(provider.chat(simpleRequest)).rejects.toThrow(RateLimitError);
    });

    it('maps 400 token error to TokenLimitError', async () => {
      const { APIError } = await import('openai');
      const { TokenLimitError } = await import('../errors.js');
      mockCreate.mockRejectedValueOnce(
        new (APIError as any)(400, 'context length exceeded token limit')
      );
      await expect(provider.chat(simpleRequest)).rejects.toThrow(TokenLimitError);
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

    it('rethrows non-Error as Error', async () => {
      mockCreate.mockRejectedValueOnce('plain string');
      await expect(provider.chat(simpleRequest)).rejects.toThrow('plain string');
    });
  });
});
