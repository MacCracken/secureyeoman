import { describe, it, expect, vi, beforeEach } from 'vitest';
import { AIClient } from './client.js';
import { ResponseCache } from './response-cache.js';
import type {
  AIRequest,
  AIResponse,
  AIStreamChunk,
  ModelConfig,
  FallbackModelConfig,
} from '@secureyeoman/shared';
import {
  RateLimitError,
  ProviderUnavailableError,
  AuthenticationError,
  TokenLimitError,
} from './errors.js';
import { UsageTracker } from './usage-tracker.js';

// Mock getSecret to return a fake key
vi.mock('../config/loader.js', () => ({
  getSecret: vi.fn().mockReturnValue('test-api-key'),
}));

// Mock all providers with proper class constructors
vi.mock('./providers/anthropic.js', () => ({
  AnthropicProvider: class {
    name = 'anthropic';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/openai.js', () => ({
  OpenAIProvider: class {
    name = 'openai';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/gemini.js', () => ({
  GeminiProvider: class {
    name = 'gemini';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/ollama.js', () => ({
  OllamaProvider: class {
    name = 'ollama';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/opencode.js', () => ({
  OpenCodeProvider: class {
    name = 'opencode';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/lmstudio.js', () => ({
  LMStudioProvider: class {
    name = 'lmstudio';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/localai.js', () => ({
  LocalAIProvider: class {
    name = 'localai';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/deepseek.js', () => ({
  DeepSeekProvider: class {
    name = 'deepseek';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/mistral.js', () => ({
  MistralProvider: class {
    name = 'mistral';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/grok.js', () => ({
  GrokProvider: class {
    name = 'grok';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

vi.mock('./providers/letta.js', () => ({
  LettaProvider: class {
    name = 'letta';
    chat = vi.fn();
    chatStream = vi.fn();
    constructor() {}
  },
}));

function makeModelConfig(provider: string, fallbacks?: FallbackModelConfig[]): ModelConfig {
  return {
    provider: provider as ModelConfig['provider'],
    model: 'test-model',
    apiKeyEnv: 'TEST_API_KEY',
    maxTokens: 1024,
    temperature: 0.7,
    maxRequestsPerMinute: 60,
    requestTimeoutMs: 30000,
    maxRetries: 2,
    retryDelayMs: 100,
    fallbacks: fallbacks ?? [],
    responseCache: { enabled: false, ttlMs: 300_000, maxEntries: 500 },
  };
}

const mockRequest: AIRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

const mockResponse: AIResponse = {
  id: 'test-id',
  content: 'Hello world',
  usage: { inputTokens: 10, outputTokens: 20, cachedTokens: 0, totalTokens: 30 },
  stopReason: 'end_turn',
  model: 'test-model',
  provider: 'anthropic',
};

describe('AIClient', () => {
  describe('provider factory', () => {
    it('should create AnthropicProvider for anthropic config', () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      expect(client.getProviderName()).toBe('anthropic');
    });

    it('should create OpenAIProvider for openai config', () => {
      const client = new AIClient({ model: makeModelConfig('openai') });
      expect(client.getProviderName()).toBe('openai');
    });

    it('should create GeminiProvider for gemini config', () => {
      const client = new AIClient({ model: makeModelConfig('gemini') });
      expect(client.getProviderName()).toBe('gemini');
    });

    it('should create OllamaProvider for ollama config', () => {
      const client = new AIClient({ model: makeModelConfig('ollama') });
      expect(client.getProviderName()).toBe('ollama');
    });
  });

  describe('chat', () => {
    let client: AIClient;

    beforeEach(() => {
      client = new AIClient({ model: makeModelConfig('anthropic') });
      // Access the private provider and mock its chat method
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);
    });

    it('should delegate to provider chat method', async () => {
      const response = await client.chat(mockRequest);
      expect(response.content).toBe('Hello world');
      expect(response.usage.totalTokens).toBe(30);
    });

    it('should track usage after successful call', async () => {
      await client.chat(mockRequest);
      const stats = client.getUsageStats();
      expect(stats.tokensUsedToday).toBe(30);
      expect(stats.apiCallsTotal).toBe(1);
    });

    it('should track errors on failure', async () => {
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockRejectedValue(new Error('fail'));

      await expect(client.chat(mockRequest)).rejects.toThrow('fail');
      const stats = client.getUsageStats();
      expect(stats.apiErrorsTotal).toBe(1);
    });

    it('should record audit events', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const auditClient = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any }
      );
      const provider = (auditClient as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await auditClient.chat(mockRequest);
      // Should record request + response
      expect(mockAuditChain.record).toHaveBeenCalledTimes(2);
      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai_request' })
      );
      expect(mockAuditChain.record).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'ai_response' })
      );
    });
  });

  describe('chatStream', () => {
    it('should yield chunks from provider', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const chunks: AIStreamChunk[] = [
        { type: 'content_delta', content: 'Hello' },
        { type: 'content_delta', content: ' world' },
        {
          type: 'done',
          stopReason: 'end_turn',
          usage: { inputTokens: 5, outputTokens: 10, cachedTokens: 0, totalTokens: 15 },
        },
      ];

      const provider = (client as any).provider;
      provider.chatStream = vi.fn().mockImplementation(async function* () {
        for (const chunk of chunks) {
          yield chunk;
        }
      });

      const received: AIStreamChunk[] = [];
      for await (const chunk of client.chatStream(mockRequest)) {
        received.push(chunk);
      }

      expect(received).toHaveLength(3);
      expect(received[0]).toEqual({ type: 'content_delta', content: 'Hello' });
      expect(received[2]!.type).toBe('done');
    });
  });

  describe('usage tracking', () => {
    it('should return empty stats initially', () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const stats = client.getUsageStats();
      expect(stats.tokensUsedToday).toBe(0);
      expect(stats.costUsdToday).toBe(0);
      expect(stats.apiCallsTotal).toBe(0);
    });
  });

  describe('fallback', () => {
    const fallbacks: FallbackModelConfig[] = [
      { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      { provider: 'gemini', model: 'gemini-2.0-flash', apiKeyEnv: 'GOOGLE_API_KEY' },
    ];

    const fallbackResponse: AIResponse = {
      id: 'fb-id',
      content: 'Fallback response',
      usage: { inputTokens: 5, outputTokens: 10, cachedTokens: 0, totalTokens: 15 },
      stopReason: 'end_turn',
      model: 'gpt-4o',
      provider: 'openai',
    };

    it('should fall back on RateLimitError', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      const primaryProvider = (client as any).provider;
      primaryProvider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      // The fallback provider gets created lazily — we need to mock it after first access
      const _response = await (async () => {
        // Trigger fallback creation
        try {
          return await client.chat(mockRequest);
        } catch {
          // First attempt may fail if fallback provider isn't mocked
          return null;
        }
      })();

      // Since providers are mocked globally, the fallback OpenAI provider's chat is a vi.fn()
      // We need to set up the fallback provider mock before calling
      const client2 = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client2 as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      // Pre-set a mock fallback provider
      const mockFbProvider = {
        name: 'openai',
        chat: vi.fn().mockResolvedValue(fallbackResponse),
        chatStream: vi.fn(),
      };
      (client2 as any).fallbackProviders.set(0, mockFbProvider);

      const result = await client2.chat(mockRequest);
      expect(result.content).toBe('Fallback response');
      expect(result.provider).toBe('openai');
    });

    it('should fall back on ProviderUnavailableError', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client as any).provider.chat = vi
        .fn()
        .mockRejectedValue(new ProviderUnavailableError('anthropic', 503));

      const mockFbProvider = {
        name: 'openai',
        chat: vi.fn().mockResolvedValue(fallbackResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFbProvider);

      const result = await client.chat(mockRequest);
      expect(result.content).toBe('Fallback response');
    });

    it('should NOT fall back on AuthenticationError', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client as any).provider.chat = vi
        .fn()
        .mockRejectedValue(new AuthenticationError('anthropic'));

      await expect(client.chat(mockRequest)).rejects.toThrow('Authentication failed');
    });

    it('should try multiple fallbacks in order', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      // First fallback also rate-limited
      const mockFb0 = {
        name: 'openai',
        chat: vi.fn().mockRejectedValue(new RateLimitError('openai')),
        chatStream: vi.fn(),
      };
      const geminiResponse = {
        ...fallbackResponse,
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        content: 'Gemini response',
      };
      const mockFb1 = {
        name: 'gemini',
        chat: vi.fn().mockResolvedValue(geminiResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFb0);
      (client as any).fallbackProviders.set(1, mockFb1);

      const result = await client.chat(mockRequest);
      expect(result.content).toBe('Gemini response');
      expect(mockFb0.chat).toHaveBeenCalledOnce();
      expect(mockFb1.chat).toHaveBeenCalledOnce();
    });

    it('should throw original error when all fallbacks exhausted', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      const originalError = new RateLimitError('anthropic', 30);
      (client as any).provider.chat = vi.fn().mockRejectedValue(originalError);

      const mockFb0 = {
        name: 'openai',
        chat: vi.fn().mockRejectedValue(new RateLimitError('openai')),
        chatStream: vi.fn(),
      };
      const mockFb1 = {
        name: 'gemini',
        chat: vi.fn().mockRejectedValue(new ProviderUnavailableError('gemini')),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFb0);
      (client as any).fallbackProviders.set(1, mockFb1);

      await expect(client.chat(mockRequest)).rejects.toBe(originalError);
    });

    it('should lazily instantiate fallback providers', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });

      // No fallback providers created yet
      expect((client as any).fallbackProviders.size).toBe(0);

      // Trigger a non-fallback error — no providers should be created
      (client as any).provider.chat = vi.fn().mockRejectedValue(new Error('generic'));
      await expect(client.chat(mockRequest)).rejects.toThrow('generic');
      expect((client as any).fallbackProviders.size).toBe(0);
    });

    it('should audit-log fallback_triggered, fallback_attempt, fallback_success', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic', fallbacks) },
        { auditChain: mockAuditChain as any }
      );
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      const mockFbProvider = {
        name: 'openai',
        chat: vi.fn().mockResolvedValue(fallbackResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFbProvider);

      await client.chat(mockRequest);

      const events = mockAuditChain.record.mock.calls.map((c: any) => c[0].event);
      expect(events).toContain('ai_fallback_triggered');
      expect(events).toContain('ai_fallback_attempt');
      expect(events).toContain('ai_fallback_success');
    });

    it('should audit-log fallback_exhausted when all fail', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic', fallbacks) },
        { auditChain: mockAuditChain as any }
      );
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      const mockFb0 = {
        name: 'openai',
        chat: vi.fn().mockRejectedValue(new RateLimitError('openai')),
        chatStream: vi.fn(),
      };
      const mockFb1 = {
        name: 'gemini',
        chat: vi.fn().mockRejectedValue(new RateLimitError('gemini')),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFb0);
      (client as any).fallbackProviders.set(1, mockFb1);

      await expect(client.chat(mockRequest)).rejects.toThrow();

      const events = mockAuditChain.record.mock.calls.map((c: any) => c[0].event);
      expect(events).toContain('ai_fallback_exhausted');
    });

    it('should work with no fallbacks configured (existing behavior)', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      (client as any).provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const result = await client.chat(mockRequest);
      expect(result.content).toBe('Hello world');
    });

    it('should fall back on stream error', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client as any).provider.chatStream = vi.fn().mockImplementation(async function* () {
        throw new RateLimitError('anthropic');
      });

      const fbChunks: AIStreamChunk[] = [
        { type: 'content_delta', content: 'Fallback' },
        {
          type: 'done',
          stopReason: 'end_turn',
          usage: { inputTokens: 3, outputTokens: 5, cachedTokens: 0, totalTokens: 8 },
        },
      ];
      const mockFbProvider = {
        name: 'openai',
        chat: vi.fn(),
        chatStream: vi.fn().mockImplementation(async function* () {
          for (const chunk of fbChunks) yield chunk;
        }),
      };
      (client as any).fallbackProviders.set(0, mockFbProvider);

      const received: AIStreamChunk[] = [];
      for await (const chunk of client.chatStream(mockRequest)) {
        received.push(chunk);
      }

      expect(received).toHaveLength(2);
      expect(received[0]).toEqual({ type: 'content_delta', content: 'Fallback' });
    });

    it('should fall back when stream fails mid-delivery', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });

      // Primary yields one chunk then throws
      (client as any).provider.chatStream = vi.fn().mockImplementation(async function* () {
        yield { type: 'content_delta', content: 'Partial' } as AIStreamChunk;
        throw new ProviderUnavailableError('anthropic', 502);
      });

      const fbChunks: AIStreamChunk[] = [
        { type: 'content_delta', content: 'Complete fallback' },
        {
          type: 'done',
          stopReason: 'end_turn',
          usage: { inputTokens: 3, outputTokens: 5, cachedTokens: 0, totalTokens: 8 },
        },
      ];
      const mockFbProvider = {
        name: 'openai',
        chat: vi.fn(),
        chatStream: vi.fn().mockImplementation(async function* () {
          for (const chunk of fbChunks) yield chunk;
        }),
      };
      (client as any).fallbackProviders.set(0, mockFbProvider);

      const received: AIStreamChunk[] = [];
      for await (const chunk of client.chatStream(mockRequest)) {
        received.push(chunk);
      }

      // Should see partial from primary + complete from fallback
      expect(received).toHaveLength(3);
      expect(received[0]).toEqual({ type: 'content_delta', content: 'Partial' });
      expect(received[1]).toEqual({ type: 'content_delta', content: 'Complete fallback' });
    });
  });

  describe('response cache integration', () => {
    it('should return cached response on second identical request', async () => {
      const cache = new ResponseCache({ enabled: true, ttlMs: 60_000, maxEntries: 100 });
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { responseCache: cache }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);
      await client.chat(mockRequest);

      // Provider should only be called once — second call is served from cache
      expect(provider.chat).toHaveBeenCalledTimes(1);
    });

    it('should not count cached responses in token usage', async () => {
      const cache = new ResponseCache({ enabled: true, ttlMs: 60_000, maxEntries: 100 });
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { responseCache: cache }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);
      await client.chat(mockRequest);

      const stats = client.getUsageStats();
      // Only one real API call, so token count reflects one call only
      expect(stats.tokensUsedToday).toBe(30);
      expect(stats.apiCallsTotal).toBe(1);
    });

    it('should call provider when cache is disabled', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);
      await client.chat(mockRequest);

      expect(provider.chat).toHaveBeenCalledTimes(2);
    });

    it('should audit-log cache hits', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const cache = new ResponseCache({ enabled: true, ttlMs: 60_000, maxEntries: 100 });
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any, responseCache: cache }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);
      await client.chat(mockRequest);

      const events = mockAuditChain.record.mock.calls.map((c: any) => c[0].event);
      expect(events).toContain('ai_cache_hit');
    });

    it('should return null cache stats when cache is disabled', () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      expect(client.getCacheStats()).toBeNull();
    });

    it('should return cache stats when cache is enabled', async () => {
      const cache = new ResponseCache({ enabled: true, ttlMs: 60_000, maxEntries: 100 });
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { responseCache: cache }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);
      await client.chat(mockRequest); // cache hit

      const stats = client.getCacheStats();
      expect(stats).not.toBeNull();
      expect(stats!.hits).toBe(1);
      expect(stats!.misses).toBe(1);
      expect(stats!.entries).toBe(1);
    });

    it('should not cache fallback responses', async () => {
      const cache = new ResponseCache({ enabled: true, ttlMs: 60_000, maxEntries: 100 });
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      ];
      const client = new AIClient(
        { model: makeModelConfig('anthropic', fallbacks) },
        { responseCache: cache }
      );
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      const fallbackResponse: AIResponse = {
        id: 'fb-id',
        content: 'Fallback',
        usage: { inputTokens: 5, outputTokens: 10, cachedTokens: 0, totalTokens: 15 },
        stopReason: 'end_turn',
        model: 'gpt-4o',
        provider: 'openai',
      };
      const mockFbProvider = {
        name: 'openai',
        chat: vi.fn().mockResolvedValue(fallbackResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFbProvider);

      await client.chat(mockRequest);

      // Cache should have no entries — fallback responses are not cached
      const stats = client.getCacheStats();
      expect(stats!.entries).toBe(0);
    });
  });

  // ─── local-first branch coverage ─────────────────────────────────────

  describe('local-first pre-attempts', () => {
    function makeLocalFirstConfig(fallbacks: FallbackModelConfig[]): ModelConfig {
      return {
        ...makeModelConfig('anthropic', fallbacks),
        localFirst: true,
      } as ModelConfig;
    }

    it('getLocalFirstPreAttemptIndices returns [] when localFirst is false', () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const indices = (client as any).getLocalFirstPreAttemptIndices();
      expect(indices).toEqual([]);
    });

    it('getLocalFirstPreAttemptIndices returns [] when primary is already a local provider', () => {
      const client = new AIClient({
        model: { ...makeModelConfig('ollama'), localFirst: true } as ModelConfig,
      });
      const indices = (client as any).getLocalFirstPreAttemptIndices();
      expect(indices).toEqual([]);
    });

    it('getLocalFirstPreAttemptIndices returns [] when no local fallbacks exist', () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      ];
      const client = new AIClient({ model: makeLocalFirstConfig(fallbacks) });
      const indices = (client as any).getLocalFirstPreAttemptIndices();
      expect(indices).toEqual([]);
    });

    it('getLocalFirstPreAttemptIndices returns index of ollama fallback', () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
        { provider: 'ollama', model: 'llama3', apiKeyEnv: 'OLLAMA_KEY' },
      ];
      const client = new AIClient({ model: makeLocalFirstConfig(fallbacks) });
      const indices = (client as any).getLocalFirstPreAttemptIndices();
      expect(indices).toEqual([1]);
    });

    it('uses local fallback first when localFirst=true and local succeeds', async () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'ollama', model: 'llama3', apiKeyEnv: 'OLLAMA_KEY' },
      ];
      const client = new AIClient({ model: makeLocalFirstConfig(fallbacks) });

      const localResponse: AIResponse = {
        ...mockResponse,
        provider: 'ollama',
        model: 'llama3',
      };
      const mockLocalProvider = {
        name: 'ollama',
        chat: vi.fn().mockResolvedValue(localResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockLocalProvider);

      const result = await client.chat(mockRequest);

      expect(result.provider).toBe('ollama');
      // Primary provider should NOT have been called
      expect((client as any).provider.chat).not.toHaveBeenCalled();
    });

    it('falls through to primary when local pre-attempt throws ProviderUnavailableError', async () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'ollama', model: 'llama3', apiKeyEnv: 'OLLAMA_KEY' },
      ];
      const client = new AIClient({ model: makeLocalFirstConfig(fallbacks) });

      const mockLocalProvider = {
        name: 'ollama',
        chat: vi.fn().mockRejectedValue(new ProviderUnavailableError('ollama')),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockLocalProvider);
      (client as any).provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const result = await client.chat(mockRequest);

      // Primary (anthropic) should have been called after local failed
      expect((client as any).provider.chat).toHaveBeenCalled();
      expect(result).toMatchObject(mockResponse);
    });

    it('rethrows non-ProviderUnavailableError from local pre-attempt', async () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'ollama', model: 'llama3', apiKeyEnv: 'OLLAMA_KEY' },
      ];
      const client = new AIClient({ model: makeLocalFirstConfig(fallbacks) });

      const mockLocalProvider = {
        name: 'ollama',
        chat: vi.fn().mockRejectedValue(new RateLimitError('ollama')),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockLocalProvider);

      await expect(client.chat(mockRequest)).rejects.toThrow(RateLimitError);
    });
  });

  // ─── Request-Level Fallback Override ──────────────────────────────────

  describe('request-level fallback override', () => {
    const systemFallbacks: FallbackModelConfig[] = [
      { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
    ];

    const requestFallbacks: FallbackModelConfig[] = [
      { provider: 'gemini', model: 'gemini-2.0-flash', apiKeyEnv: 'GOOGLE_API_KEY' },
    ];

    it('uses per-request fallbacks instead of system fallbacks', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', systemFallbacks) });
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      const geminiResponse: AIResponse = {
        ...mockResponse,
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        content: 'Gemini fallback',
      };

      // Override createProvider so the lazily-created fallback is our mock
      (client as any).createProvider = () => ({
        name: 'gemini',
        chat: vi.fn().mockResolvedValue(geminiResponse),
        chatStream: vi.fn(),
      });

      const result = await client.chat(mockRequest, undefined, requestFallbacks);
      expect(result.content).toBe('Gemini fallback');
      expect(result.provider).toBe('gemini');
    });

    it('does NOT cache per-request fallback providers that differ from system config', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', systemFallbacks) });
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      const geminiResponse: AIResponse = {
        ...mockResponse,
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        content: 'Request fallback',
      };

      // Intercept createProvider to inject a mock
      const originalCreate = (client as any).createProvider.bind(client);
      let _createdCount = 0;
      (client as any).createProvider = (config: any) => {
        _createdCount++;
        const p = originalCreate(config);
        p.chat = vi.fn().mockResolvedValue(geminiResponse);
        return p;
      };

      // First call with request fallbacks
      await client.chat(mockRequest, undefined, requestFallbacks);

      // The fallback provider should NOT have been cached since the system config
      // at index 0 is 'openai' but the request fallback is 'gemini'
      // Verify by checking fallbackProviders map doesn't contain the request fallback
      const cachedProvider = (client as any).fallbackProviders.get(0);
      // If cached, its name would be 'gemini'; but since system config differs, it should not be cached
      expect(cachedProvider?.name).not.toBe('gemini');
    });

    it('chatStream uses per-request fallbacks instead of system fallbacks', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic', systemFallbacks) });
      (client as any).provider.chatStream = vi.fn().mockImplementation(async function* () {
        throw new RateLimitError('anthropic');
      });

      const fbChunks: AIStreamChunk[] = [
        { type: 'content_delta', content: 'Stream fallback' },
        {
          type: 'done',
          stopReason: 'end_turn',
          usage: { inputTokens: 3, outputTokens: 5, cachedTokens: 0, totalTokens: 8 },
        },
      ];

      // Override createProvider so the lazily-created fallback is our mock
      (client as any).createProvider = () => ({
        name: 'gemini',
        chat: vi.fn(),
        chatStream: vi.fn().mockImplementation(async function* () {
          for (const chunk of fbChunks) yield chunk;
        }),
      });

      const received: AIStreamChunk[] = [];
      for await (const chunk of client.chatStream(mockRequest, undefined, requestFallbacks)) {
        received.push(chunk);
      }

      expect(received).toHaveLength(2);
      expect(received[0]).toEqual({ type: 'content_delta', content: 'Stream fallback' });
    });
  });

  // ─── Daily Token Limit ────────────────────────────────────────────────

  describe('daily token limit', () => {
    it('throws TokenLimitError when daily limit is exceeded in chat()', async () => {
      const config = makeModelConfig('anthropic');
      config.maxTokensPerDay = 50; // set a low limit
      const client = new AIClient({ model: config });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      // First call uses 30 tokens
      await client.chat(mockRequest);

      // Second call uses another 30 tokens = 60 total > 50 limit
      await client.chat(mockRequest);

      // Third call should be blocked
      await expect(client.chat(mockRequest)).rejects.toThrow(TokenLimitError);
      // Provider should NOT have been called for the blocked request
      expect(provider.chat).toHaveBeenCalledTimes(2);
    });

    it('throws TokenLimitError when daily limit is exceeded in chatStream()', async () => {
      const config = makeModelConfig('anthropic');
      config.maxTokensPerDay = 10; // very low limit
      const client = new AIClient({ model: config });
      const provider = (client as any).provider;

      const chunks: AIStreamChunk[] = [
        { type: 'content_delta', content: 'Hi' },
        {
          type: 'done',
          stopReason: 'end_turn',
          usage: { inputTokens: 5, outputTokens: 10, cachedTokens: 0, totalTokens: 15 },
        },
      ];
      provider.chatStream = vi.fn().mockImplementation(async function* () {
        for (const chunk of chunks) yield chunk;
      });

      // First call uses 15 tokens > 10 limit (usage tracked on 'done' chunk)
      const received: AIStreamChunk[] = [];
      for await (const chunk of client.chatStream(mockRequest)) {
        received.push(chunk);
      }

      // Second call should be blocked before calling provider
      await expect(async () => {
        for await (const _ of client.chatStream(mockRequest)) {
          /* drain */
        }
      }).rejects.toThrow(TokenLimitError);
    });

    it('does not block when no daily limit is configured', async () => {
      const config = makeModelConfig('anthropic');
      // maxTokensPerDay is undefined by default
      const client = new AIClient({ model: config });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      // Should not throw regardless of usage
      await client.chat(mockRequest);
      await client.chat(mockRequest);
      await client.chat(mockRequest);
      expect(provider.chat).toHaveBeenCalledTimes(3);
    });
  });

  // ─── Fallback Provider Cache Invalidation ─────────────────────────────

  describe('fallback provider cache invalidation', () => {
    it('does not reuse cached provider when fallback config at the same index changes provider type', async () => {
      const systemFallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      ];
      const client = new AIClient({ model: makeModelConfig('anthropic', systemFallbacks) });

      // Simulate a cached fallback provider from a previous call
      const cachedOpenAI = {
        name: 'openai',
        chat: vi.fn().mockResolvedValue(mockResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, cachedOpenAI);

      // Call getOrCreateFallbackProvider with a DIFFERENT provider config at the same index
      const differentConfig: FallbackModelConfig = {
        provider: 'gemini',
        model: 'gemini-2.0-flash',
        apiKeyEnv: 'GOOGLE_API_KEY',
      };
      const provider = (client as any).getOrCreateFallbackProvider(0, differentConfig);

      // Should NOT return the cached openai provider
      expect(provider).not.toBe(cachedOpenAI);
      expect(provider.name).toBe('gemini');
    });

    it('reuses cached provider when fallback config matches', async () => {
      const systemFallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      ];
      const client = new AIClient({ model: makeModelConfig('anthropic', systemFallbacks) });

      const cachedOpenAI = {
        name: 'openai',
        chat: vi.fn().mockResolvedValue(mockResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, cachedOpenAI);

      // Same config as system fallback at index 0
      const sameConfig: FallbackModelConfig = {
        provider: 'openai',
        model: 'gpt-4o',
        apiKeyEnv: 'OPENAI_API_KEY',
      };
      const provider = (client as any).getOrCreateFallbackProvider(0, sameConfig);

      // Should return the cached provider
      expect(provider).toBe(cachedOpenAI);
    });

    it('does not reuse cached provider when model changes at the same index', async () => {
      const systemFallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      ];
      const client = new AIClient({ model: makeModelConfig('anthropic', systemFallbacks) });

      const cachedOpenAI = {
        name: 'openai',
        chat: vi.fn(),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, cachedOpenAI);

      // Same provider but different model
      const differentModelConfig: FallbackModelConfig = {
        provider: 'openai',
        model: 'gpt-4o-mini',
        apiKeyEnv: 'OPENAI_API_KEY',
      };
      const provider = (client as any).getOrCreateFallbackProvider(0, differentModelConfig);

      // Should create a new provider, not return cached
      expect(provider).not.toBe(cachedOpenAI);
    });
  });

  // ─── Usage Tracker Integration ────────────────────────────────────────

  describe('usage tracker integration', () => {
    it('calls recordError and recordLatency on provider exception', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockRejectedValue(new Error('provider failure'));

      const tracker = (client as any).usageTracker;
      const spyRecordError = vi.spyOn(tracker, 'recordError');
      const spyRecordLatency = vi.spyOn(tracker, 'recordLatency');

      await expect(client.chat(mockRequest)).rejects.toThrow('provider failure');

      expect(spyRecordError).toHaveBeenCalledWith('anthropic', 'default');
      expect(spyRecordLatency).toHaveBeenCalledWith(expect.any(Number));
    });

    it('records error with explicit model name when request specifies model', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockRejectedValue(new Error('fail'));

      const tracker = (client as any).usageTracker;
      const spyRecordError = vi.spyOn(tracker, 'recordError');

      const requestWithModel: AIRequest = {
        messages: [{ role: 'user', content: 'Hello' }],
        stream: false,
        model: 'claude-sonnet-4-20250514',
      };

      await expect(client.chat(requestWithModel)).rejects.toThrow('fail');

      expect(spyRecordError).toHaveBeenCalledWith('anthropic', 'claude-sonnet-4-20250514');
    });

    it('tracks cost via costCalculator on successful call', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const tracker = (client as any).usageTracker;
      const spyRecord = vi.spyOn(tracker, 'record');

      await client.chat(mockRequest);

      expect(spyRecord).toHaveBeenCalledTimes(1);
      const recordArg = spyRecord.mock.calls[0][0];
      expect(recordArg.provider).toBe('anthropic');
      expect(recordArg.model).toBe('test-model');
      expect(recordArg.usage).toEqual(mockResponse.usage);
      expect(typeof recordArg.costUsd).toBe('number');
      expect(recordArg.costUsd).toBeGreaterThanOrEqual(0);
      expect(typeof recordArg.latencyMs).toBe('number');
    });

    it('includes personality ID in usage record when soulManager is set', async () => {
      const mockSoulManager = {
        getActivePersonality: vi.fn().mockResolvedValue({ id: 'pers-123', name: 'default' }),
      };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { soulManager: mockSoulManager as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const tracker = (client as any).usageTracker;
      const spyRecord = vi.spyOn(tracker, 'record');

      await client.chat(mockRequest);

      const recordArg = spyRecord.mock.calls[0][0];
      expect(recordArg.personalityId).toBe('pers-123');
    });

    it('records null personalityId when soulManager.getActivePersonality rejects', async () => {
      const mockSoulManager = {
        getActivePersonality: vi.fn().mockRejectedValue(new Error('no personality')),
      };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { soulManager: mockSoulManager as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const tracker = (client as any).usageTracker;
      const spyRecord = vi.spyOn(tracker, 'record');

      await client.chat(mockRequest);

      const recordArg = spyRecord.mock.calls[0][0];
      expect(recordArg.personalityId).toBeUndefined();
    });
  });

  // ─── Audit Event Metadata ─────────────────────────────────────────────

  describe('audit event metadata', () => {
    it('records ai_error events with warn level', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockRejectedValue(new Error('provider failure'));

      await expect(client.chat(mockRequest)).rejects.toThrow('provider failure');

      const errorCall = mockAuditChain.record.mock.calls.find(
        (c: any) => c[0].event === 'ai_error'
      );
      expect(errorCall).toBeDefined();
      expect(errorCall![0].level).toBe('warn');
      expect(errorCall![0].metadata.error).toBe('provider failure');
      expect(typeof errorCall![0].metadata.latencyMs).toBe('number');
    });

    it('records ai_response events with info level', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);

      const responseCall = mockAuditChain.record.mock.calls.find(
        (c: any) => c[0].event === 'ai_response'
      );
      expect(responseCall).toBeDefined();
      expect(responseCall![0].level).toBe('info');
      expect(responseCall![0].metadata.inputTokens).toBe(10);
      expect(responseCall![0].metadata.outputTokens).toBe(20);
    });

    it('records ai_request events with info level', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest);

      const requestCall = mockAuditChain.record.mock.calls.find(
        (c: any) => c[0].event === 'ai_request'
      );
      expect(requestCall).toBeDefined();
      expect(requestCall![0].level).toBe('info');
      expect(requestCall![0].metadata.messageCount).toBe(1);
      expect(requestCall![0].metadata.stream).toBe(false);
    });

    it('records ai_fallback_exhausted with warn level', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
      ];
      const client = new AIClient(
        { model: makeModelConfig('anthropic', fallbacks) },
        { auditChain: mockAuditChain as any }
      );
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      const mockFb = {
        name: 'openai',
        chat: vi.fn().mockRejectedValue(new RateLimitError('openai')),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFb);

      await expect(client.chat(mockRequest)).rejects.toThrow();

      const exhaustedCall = mockAuditChain.record.mock.calls.find(
        (c: any) => c[0].event === 'ai_fallback_exhausted'
      );
      expect(exhaustedCall).toBeDefined();
      expect(exhaustedCall![0].level).toBe('warn');
    });

    it('records ai_stream_error with warn level', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any }
      );
      const provider = (client as any).provider;
      provider.chatStream = vi.fn().mockImplementation(async function* () {
        throw new Error('stream failure');
      });

      await expect(async () => {
        for await (const _ of client.chatStream(mockRequest)) {
          /* drain */
        }
      }).rejects.toThrow('stream failure');

      const errorCall = mockAuditChain.record.mock.calls.find(
        (c: any) => c[0].event === 'ai_stream_error'
      );
      expect(errorCall).toBeDefined();
      expect(errorCall![0].level).toBe('warn');
    });

    it('silently swallows audit chain failures without blocking AI operations', async () => {
      const mockAuditChain = {
        record: vi.fn().mockRejectedValue(new Error('audit db down')),
      };
      const mockLogger = {
        warn: vi.fn(),
        info: vi.fn(),
        error: vi.fn(),
        debug: vi.fn(),
      };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any, logger: mockLogger as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      // Should NOT throw despite audit chain failure
      const result = await client.chat(mockRequest);
      expect(result.content).toBe('Hello world');
      // Logger should have warned about the failure
      expect(mockLogger.warn).toHaveBeenCalled();
    });

    it('passes context to ai_request audit event', async () => {
      const mockAuditChain = { record: vi.fn().mockResolvedValue(undefined) };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { auditChain: mockAuditChain as any }
      );
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      await client.chat(mockRequest, { conversationId: 'conv-abc', userId: 'user-1' });

      const requestCall = mockAuditChain.record.mock.calls.find(
        (c: any) => c[0].event === 'ai_request'
      );
      expect(requestCall![0].metadata.conversationId).toBe('conv-abc');
      expect(requestCall![0].metadata.userId).toBe('user-1');
    });
  });

  // ─── Provider Factory Edge Cases ──────────────────────────────────────

  describe('provider factory edge cases', () => {
    it('should throw for unknown provider', () => {
      expect(() => new AIClient({ model: makeModelConfig('unknown-provider') })).toThrow(
        'Unknown AI provider: unknown-provider'
      );
    });

    it('should create providers for all supported types', () => {
      const providers = [
        'anthropic',
        'openai',
        'gemini',
        'ollama',
        'opencode',
        'lmstudio',
        'localai',
        'deepseek',
        'mistral',
        'grok',
        'letta',
      ];
      for (const p of providers) {
        const client = new AIClient({ model: makeModelConfig(p) });
        expect(client.getProviderName()).toBe(p);
      }
    });
  });

  // ─── setSoulManager ───────────────────────────────────────────────────

  describe('setSoulManager', () => {
    it('allows injecting a SoulManager after construction', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const tracker = (client as any).usageTracker;
      const spyRecord = vi.spyOn(tracker, 'record');

      // No soul manager initially
      await client.chat(mockRequest);
      expect(spyRecord.mock.calls[0][0].personalityId).toBeUndefined();

      spyRecord.mockClear();

      // Inject soul manager
      const mockSoulManager = {
        getActivePersonality: vi.fn().mockResolvedValue({ id: 'pers-injected' }),
      };
      client.setSoulManager(mockSoulManager as any);

      await client.chat(mockRequest);
      expect(spyRecord.mock.calls[0][0].personalityId).toBe('pers-injected');
    });
  });

  // ─── init / ensureInitialized idempotency ─────────────────────────────

  describe('init idempotency', () => {
    it('calling init() multiple times only invokes tracker.init() once', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const tracker = (client as any).usageTracker;
      const spyInit = vi.spyOn(tracker, 'init').mockResolvedValue(undefined);

      await client.init();
      await client.init();
      await client.init();

      expect(spyInit).toHaveBeenCalledTimes(1);
    });

    it('chat() auto-initializes on first call', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat = vi.fn().mockResolvedValue(mockResponse);

      const tracker = (client as any).usageTracker;
      const spyInit = vi.spyOn(tracker, 'init').mockResolvedValue(undefined);

      await client.chat(mockRequest);

      expect(spyInit).toHaveBeenCalledTimes(1);
    });
  });

  // ─── Fallback: non-recoverable error from fallback stops chain ────────

  describe('fallback non-recoverable error', () => {
    it('stops the fallback chain when a fallback throws a non-recoverable error', async () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
        { provider: 'gemini', model: 'gemini-2.0-flash', apiKeyEnv: 'GOOGLE_API_KEY' },
      ];
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client as any).provider.chat = vi.fn().mockRejectedValue(new RateLimitError('anthropic'));

      // First fallback throws a non-recoverable error (AuthenticationError)
      const mockFb0 = {
        name: 'openai',
        chat: vi.fn().mockRejectedValue(new AuthenticationError('openai')),
        chatStream: vi.fn(),
      };
      const mockFb1 = {
        name: 'gemini',
        chat: vi.fn().mockResolvedValue(mockResponse),
        chatStream: vi.fn(),
      };
      (client as any).fallbackProviders.set(0, mockFb0);
      (client as any).fallbackProviders.set(1, mockFb1);

      // Should throw the AuthenticationError and NOT try gemini
      await expect(client.chat(mockRequest)).rejects.toThrow(AuthenticationError);
      expect(mockFb1.chat).not.toHaveBeenCalled();
    });

    it('stops the stream fallback chain on non-recoverable error', async () => {
      const fallbacks: FallbackModelConfig[] = [
        { provider: 'openai', model: 'gpt-4o', apiKeyEnv: 'OPENAI_API_KEY' },
        { provider: 'gemini', model: 'gemini-2.0-flash', apiKeyEnv: 'GOOGLE_API_KEY' },
      ];
      const client = new AIClient({ model: makeModelConfig('anthropic', fallbacks) });
      (client as any).provider.chatStream = vi.fn().mockImplementation(async function* () {
        throw new RateLimitError('anthropic');
      });

      const mockFb0 = {
        name: 'openai',
        chat: vi.fn(),
        chatStream: vi.fn().mockImplementation(async function* () {
          throw new AuthenticationError('openai');
        }),
      };
      const mockFb1 = {
        name: 'gemini',
        chat: vi.fn(),
        chatStream: vi.fn().mockImplementation(async function* () {
          yield { type: 'content_delta', content: 'ok' } as AIStreamChunk;
        }),
      };
      (client as any).fallbackProviders.set(0, mockFb0);
      (client as any).fallbackProviders.set(1, mockFb1);

      await expect(async () => {
        for await (const _ of client.chatStream(mockRequest)) {
          /* drain */
        }
      }).rejects.toThrow(AuthenticationError);
      expect(mockFb1.chatStream).not.toHaveBeenCalled();
    });
  });

  // ─── Stream usage tracking with soulManager ───────────────────────────

  describe('stream usage tracking', () => {
    it('tracks usage from done chunk in stream with personality', async () => {
      const mockSoulManager = {
        getActivePersonality: vi.fn().mockResolvedValue({ id: 'pers-stream' }),
      };
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { soulManager: mockSoulManager as any }
      );
      const provider = (client as any).provider;

      const chunks: AIStreamChunk[] = [
        { type: 'content_delta', content: 'Hi' },
        {
          type: 'done',
          stopReason: 'end_turn',
          usage: { inputTokens: 5, outputTokens: 10, cachedTokens: 0, totalTokens: 15 },
        },
      ];
      provider.chatStream = vi.fn().mockImplementation(async function* () {
        for (const chunk of chunks) yield chunk;
      });

      const tracker = (client as any).usageTracker;
      const spyRecord = vi.spyOn(tracker, 'record');

      for await (const _ of client.chatStream(mockRequest)) {
        /* drain */
      }

      expect(spyRecord).toHaveBeenCalledTimes(1);
      const recordArg = spyRecord.mock.calls[0][0];
      expect(recordArg.personalityId).toBe('pers-stream');
      expect(recordArg.usage.totalTokens).toBe(15);
    });

    it('records stream errors in usage tracker', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chatStream = vi.fn().mockImplementation(async function* () {
        throw new Error('stream fail');
      });

      const tracker = (client as any).usageTracker;
      const spyRecordError = vi.spyOn(tracker, 'recordError');

      await expect(async () => {
        for await (const _ of client.chatStream(mockRequest)) {
          /* drain */
        }
      }).rejects.toThrow('stream fail');

      expect(spyRecordError).toHaveBeenCalledWith('anthropic', 'default');
    });
  });

  // ─── getUsageTracker / getCostCalculator ──────────────────────────────

  describe('accessor methods', () => {
    it('getUsageTracker returns the tracker instance', () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const tracker = client.getUsageTracker();
      expect(tracker).toBeDefined();
      expect(typeof tracker.checkLimit).toBe('function');
    });

    it('getCostCalculator returns the calculator instance', () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const calc = client.getCostCalculator();
      expect(calc).toBeDefined();
      expect(typeof calc.calculate).toBe('function');
    });

    it('reuses provided usageTracker from deps', () => {
      const externalTracker = new UsageTracker(100_000);
      const client = new AIClient(
        { model: makeModelConfig('anthropic') },
        { usageTracker: externalTracker }
      );
      expect(client.getUsageTracker()).toBe(externalTracker);
    });
  });

  // ─── Provider Health Tracking (Phase 119) ────────────────────────────

  describe('health tracking', () => {
    it('records success to health tracker', async () => {
      const { ProviderHealthTracker } = await import('./provider-health.js');
      const healthTracker = new ProviderHealthTracker();
      const client = new AIClient({ model: makeModelConfig('anthropic') }, { healthTracker });
      const provider = (client as any).provider;
      provider.chat.mockResolvedValue(mockResponse);

      await client.chat(mockRequest);
      const health = healthTracker.getHealth('anthropic');
      expect(health.totalRequests).toBe(1);
      expect(health.errorRate).toBe(0);
    });

    it('records failure to health tracker', async () => {
      const { ProviderHealthTracker } = await import('./provider-health.js');
      const healthTracker = new ProviderHealthTracker();
      const client = new AIClient({ model: makeModelConfig('anthropic') }, { healthTracker });
      const provider = (client as any).provider;
      provider.chat.mockRejectedValue(new AuthenticationError('anthropic'));

      await expect(client.chat(mockRequest)).rejects.toThrow();
      const health = healthTracker.getHealth('anthropic');
      expect(health.totalRequests).toBe(1);
      expect(health.errorRate).toBe(1);
    });

    it('works without health tracker', async () => {
      const client = new AIClient({ model: makeModelConfig('anthropic') });
      const provider = (client as any).provider;
      provider.chat.mockResolvedValue(mockResponse);

      const response = await client.chat(mockRequest);
      expect(response.content).toBe('Hello world');
      expect(client.getHealthTracker()).toBeNull();
    });
  });
});
