import { describe, it, expect, vi, afterEach } from 'vitest';
import { HooshProvider } from './hoosh.js';
import type { ProviderConfig } from './base.js';
import type { ModelConfig } from '@secureyeoman/shared';

function makeModelConfig(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    provider: 'hoosh',
    model: 'gpt-4o',
    apiKeyEnv: 'HOOSH_API_KEY',
    baseUrl: 'http://127.0.0.1:8088',
    maxTokens: 1024,
    temperature: 0.7,
    requestTimeoutMs: 30000,
    fallbacks: [],
    responseCache: { enabled: false, maxSize: 0, ttlMs: 0 },
    localFirst: false,
    confidentialCompute: 'off',
    ...overrides,
  } as ModelConfig;
}

function makeProviderConfig(overrides?: Partial<ProviderConfig>): ProviderConfig {
  return {
    model: makeModelConfig(),
    apiKey: 'test-key',
    retryConfig: { maxRetries: 0 },
    ...overrides,
  };
}

function mockFetchResponse(data: unknown, ok = true, status = 200) {
  return vi.fn().mockResolvedValue({
    ok,
    status,
    json: () => Promise.resolve(data),
    text: () => Promise.resolve(JSON.stringify(data)),
    body: null,
  });
}

const CHAT_RESPONSE = {
  id: 'chatcmpl-123',
  model: 'gpt-4o',
  choices: [
    {
      index: 0,
      message: { role: 'assistant', content: 'Hello!' },
      finish_reason: 'stop',
    },
  ],
  usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
};

describe('HooshProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('has name hoosh', () => {
    const provider = new HooshProvider(makeProviderConfig());
    expect(provider.name).toBe('hoosh');
  });

  describe('chat', () => {
    it('sends request and maps response', async () => {
      const fetchSpy = mockFetchResponse(CHAT_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      const provider = new HooshProvider(makeProviderConfig());
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello!');
      expect(response.provider).toBe('hoosh');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.stopReason).toBe('end_turn');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8088/v1/chat/completions',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes Authorization header', async () => {
      const fetchSpy = mockFetchResponse(CHAT_RESPONSE);
      vi.stubGlobal('fetch', fetchSpy);

      const provider = new HooshProvider(makeProviderConfig({ apiKey: 'secret' }));
      await provider.chat({ messages: [{ role: 'user', content: 'test' }] });

      const headers = (fetchSpy.mock.calls[0][1] as RequestInit).headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer secret');
    });

    it('maps tool_calls response', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchResponse({
          id: 'x',
          model: 'gpt-4o',
          choices: [
            {
              index: 0,
              message: {
                role: 'assistant',
                content: null,
                tool_calls: [
                  {
                    id: 'call-1',
                    type: 'function',
                    function: { name: 'search', arguments: '{"q":"test"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      );

      const provider = new HooshProvider(makeProviderConfig());
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'search' }],
        tools: [{ name: 'search', parameters: { type: 'object' } }],
      });

      expect(response.stopReason).toBe('tool_use');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('search');
    });

    it('throws ProviderUnavailableError on 429', async () => {
      vi.stubGlobal('fetch', mockFetchResponse({}, false, 429));
      const provider = new HooshProvider(makeProviderConfig());
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('unavailable');
    });

    it('throws ProviderUnavailableError on 500+', async () => {
      vi.stubGlobal('fetch', mockFetchResponse({}, false, 502));
      const provider = new HooshProvider(makeProviderConfig());
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('unavailable');
    });

    it('throws ProviderUnavailableError on ECONNREFUSED', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')));
      const provider = new HooshProvider(makeProviderConfig());
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('unavailable');
    });

    it('handles response with no usage', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchResponse({
          id: 'x',
          model: 'gpt-4o',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
          ],
        })
      );
      const provider = new HooshProvider(makeProviderConfig());
      const response = await provider.chat({ messages: [{ role: 'user', content: 'test' }] });
      expect(response.usage.totalTokens).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('returns true when gateway responds ok', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true }));
      const provider = new HooshProvider(makeProviderConfig());
      expect(await provider.isHealthy()).toBe(true);
    });

    it('returns false when gateway is unreachable', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const provider = new HooshProvider(makeProviderConfig());
      expect(await provider.isHealthy()).toBe(false);
    });
  });

  describe('listModels', () => {
    it('returns model IDs from gateway', async () => {
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue({
          ok: true,
          json: () =>
            Promise.resolve({
              data: [{ id: 'gpt-4o' }, { id: 'claude-sonnet' }],
            }),
        })
      );
      const provider = new HooshProvider(makeProviderConfig());
      const models = await provider.listModels();
      expect(models).toEqual(['gpt-4o', 'claude-sonnet']);
    });

    it('returns empty array on failure', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fail')));
      const provider = new HooshProvider(makeProviderConfig());
      expect(await provider.listModels()).toEqual([]);
    });
  });
});
