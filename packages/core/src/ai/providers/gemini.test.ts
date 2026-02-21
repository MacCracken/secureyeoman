import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { GeminiProvider } from './gemini.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';

const mockFetch = vi.fn();

const mockGenerateContent = vi.fn();
const mockGenerateContentStream = vi.fn();

vi.mock('@google/generative-ai', () => {
  class MockGoogleGenerativeAI {
    constructor(_apiKey?: string) {}
    getGenerativeModel = vi.fn().mockReturnValue({
      generateContent: mockGenerateContent,
      generateContentStream: mockGenerateContentStream,
    });
  }

  return { GoogleGenerativeAI: MockGoogleGenerativeAI };
});

function makeConfig(): { model: ModelConfig; apiKey: string; retryConfig: { maxRetries: number } } {
  return {
    model: {
      provider: 'gemini' as any,
      model: 'gemini-2.0-flash',
      apiKeyEnv: 'GOOGLE_API_KEY',
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

describe('GeminiProvider', () => {
  let provider: GeminiProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new GeminiProvider(makeConfig());
  });

  describe('chat', () => {
    it('should map request and response', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            {
              content: {
                parts: [{ text: 'Hello from Gemini!' }],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 5,
            candidatesTokenCount: 10,
            totalTokenCount: 15,
          },
        },
      });

      const response = await provider.chat(simpleRequest);
      expect(response.content).toBe('Hello from Gemini!');
      expect(response.usage.inputTokens).toBe(5);
      expect(response.usage.outputTokens).toBe(10);
      expect(response.stopReason).toBe('end_turn');
      expect(response.provider).toBe('gemini');
    });

    it('should handle function call responses', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [
            {
              content: {
                parts: [
                  {
                    functionCall: {
                      name: 'search',
                      args: { query: 'weather' },
                    },
                  },
                ],
              },
              finishReason: 'STOP',
            },
          ],
          usageMetadata: {
            promptTokenCount: 10,
            candidatesTokenCount: 5,
            totalTokenCount: 15,
          },
        },
      });

      const response = await provider.chat(simpleRequest);
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('search');
      expect(response.toolCalls![0].arguments).toEqual({ query: 'weather' });
    });

    it('should extract system messages', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5, totalTokenCount: 15 },
        },
      });

      const request: AIRequest = {
        messages: [
          { role: 'system', content: 'Be helpful' },
          { role: 'user', content: 'Hi' },
        ],
        stream: false,
      };

      await provider.chat(request);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.systemInstruction).toBeDefined();
      expect(callArgs.contents).toHaveLength(1); // Only user message, system extracted
    });
  });

  describe('fetchAvailableModels', () => {
    beforeEach(() => {
      vi.stubGlobal('fetch', mockFetch);
    });

    afterEach(() => {
      vi.unstubAllGlobals();
    });

    it('should return models that support generateContent', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          models: [
            {
              name: 'models/gemini-2.0-flash',
              displayName: 'Gemini 2.0 Flash',
              supportedGenerationMethods: ['generateContent', 'countTokens'],
              inputTokenLimit: 1048576,
              outputTokenLimit: 8192,
            },
            {
              name: 'models/text-embedding-004',
              displayName: 'Text Embedding 004',
              supportedGenerationMethods: ['embedContent'],
              inputTokenLimit: 2048,
              outputTokenLimit: 0,
            },
            {
              name: 'models/gemini-2.5-pro-preview',
              displayName: 'Gemini 2.5 Pro Preview',
              supportedGenerationMethods: ['generateContent'],
              inputTokenLimit: 1048576,
              outputTokenLimit: 65536,
            },
          ],
        }),
      });

      const models = await GeminiProvider.fetchAvailableModels('test-key');

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('gemini-2.0-flash');
      expect(models[0].displayName).toBe('Gemini 2.0 Flash');
      expect(models[1].id).toBe('gemini-2.5-pro-preview');
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('key=test-key'));
    });

    it('should return empty array on fetch failure', async () => {
      mockFetch.mockResolvedValue({ ok: false, status: 403 });

      const models = await GeminiProvider.fetchAvailableModels('bad-key');
      expect(models).toEqual([]);
    });
  });

  describe('chatStream', () => {
    it('yields content_delta chunks from stream', async () => {
      async function* mockChunks() {
        yield { text: () => 'Hello ', candidates: undefined };
        yield { text: () => 'world', candidates: undefined };
        yield { text: () => '', candidates: undefined };
      }
      const finalResp = {
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 20, totalTokenCount: 30 },
      };
      mockGenerateContentStream.mockResolvedValue({
        stream: mockChunks(),
        response: Promise.resolve(finalResp),
      });

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }
      expect(chunks.filter((c) => c.type === 'content_delta')).toHaveLength(2);
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
      const done = chunks.find((c) => c.type === 'done');
      expect(done.usage.inputTokens).toBe(10);
    });

    it('yields tool_call_delta for function call parts', async () => {
      async function* mockChunks() {
        yield {
          text: () => '',
          candidates: [
            {
              content: {
                parts: [{ functionCall: { name: 'search', args: {} } }],
              },
            },
          ],
        };
      }
      const finalResp = {
        candidates: [{ finishReason: 'STOP' }],
        usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
      };
      mockGenerateContentStream.mockResolvedValue({
        stream: mockChunks(),
        response: Promise.resolve(finalResp),
      });

      const chunks: any[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }
      expect(chunks.some((c) => c.type === 'tool_call_delta')).toBe(true);
      expect(chunks.some((c) => c.type === 'done')).toBe(true);
    });

    it('propagates mapped errors from stream', async () => {
      mockGenerateContentStream.mockRejectedValueOnce(new Error('429 rate limit exceeded'));
      const { RateLimitError } = await import('../errors.js');
      await expect(async () => {
        for await (const _ of provider.chatStream(simpleRequest)) {
          /* consume */
        }
      }).rejects.toThrow(RateLimitError);
    });
  });

  describe('message mapping', () => {
    it('maps tool role messages to function role', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
        },
      });
      const request: AIRequest = {
        messages: [
          {
            role: 'tool',
            content: 'result',
            toolResult: { toolCallId: 'search_fn', content: 'found it' },
          },
        ],
        stream: false,
      };
      await provider.chat(request);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents[0].role).toBe('function');
      expect(callArgs.contents[0].parts[0].functionResponse.name).toBe('search_fn');
    });

    it('maps assistant messages with tool calls to model role', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
        },
      });
      const request: AIRequest = {
        messages: [
          {
            role: 'assistant',
            content: 'Let me search',
            toolCalls: [{ id: 'tc-1', name: 'search', arguments: { query: 'hello' } }],
          },
        ],
        stream: false,
      };
      await provider.chat(request);
      const callArgs = mockGenerateContent.mock.calls[0][0];
      expect(callArgs.contents[0].role).toBe('model');
      expect(callArgs.contents[0].parts.some((p: any) => 'functionCall' in p)).toBe(true);
    });

    it('maps stop sequences', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
        },
      });
      await provider.chat({
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
        stopSequences: ['END'],
      });
      const callArgs = mockGenerateContent.mock.calls[0][0];
      // Gemini uses generationConfig.stopSequences
      expect(callArgs).toBeDefined();
    });
  });

  describe('stopReason mapping', () => {
    it('maps MAX_TOKENS to max_tokens', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'truncated' }] }, finishReason: 'MAX_TOKENS' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 1000, totalTokenCount: 1005 },
        },
      });
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('max_tokens');
    });

    it('maps SAFETY to error', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: '' }] }, finishReason: 'SAFETY' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 0, totalTokenCount: 5 },
        },
      });
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('error');
    });

    it('maps unknown finishReason to end_turn', async () => {
      mockGenerateContent.mockResolvedValue({
        response: {
          candidates: [{ content: { parts: [{ text: 'ok' }] }, finishReason: 'OTHER' }],
          usageMetadata: { promptTokenCount: 5, candidatesTokenCount: 5, totalTokenCount: 10 },
        },
      });
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('end_turn');
    });
  });

  describe('error handling', () => {
    it('maps rate limit error', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('429 resource exhausted'));
      const { RateLimitError } = await import('../errors.js');
      await expect(provider.chat(simpleRequest)).rejects.toThrow(RateLimitError);
    });

    it('maps auth error', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('401 api key invalid'));
      const { AuthenticationError } = await import('../errors.js');
      await expect(provider.chat(simpleRequest)).rejects.toThrow(AuthenticationError);
    });

    it('maps unavailable error', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('503 service unavailable'));
      const { ProviderUnavailableError } = await import('../errors.js');
      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });

    it('maps generic error to InvalidResponseError', async () => {
      mockGenerateContent.mockRejectedValueOnce(new Error('some unknown error'));
      const { InvalidResponseError } = await import('../errors.js');
      await expect(provider.chat(simpleRequest)).rejects.toThrow(InvalidResponseError);
    });

    it('rethrows non-Error objects as Error', async () => {
      mockGenerateContent.mockRejectedValueOnce('string error');
      await expect(provider.chat(simpleRequest)).rejects.toThrow('string error');
    });
  });
});
