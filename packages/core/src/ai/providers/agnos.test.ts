import { describe, it, expect, vi, afterEach } from 'vitest';
import { AGNOSProvider } from './agnos.js';
import type { ProviderConfig } from './base.js';
import type { ModelConfig } from '@secureyeoman/shared';

function makeModelConfig(overrides?: Partial<ModelConfig>): ModelConfig {
  return {
    provider: 'agnos',
    model: 'llama3',
    apiKeyEnv: 'AGNOS_GATEWAY_API_KEY',
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
    apiKey: 'gw-test-key',
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

describe('AGNOSProvider', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('constructs with default base URL when none specified', () => {
    const config = makeProviderConfig({
      model: makeModelConfig({ baseUrl: undefined }),
    });
    const provider = new AGNOSProvider(config);
    expect(provider.name).toBe('agnos');
  });

  it('constructs with custom base URL', () => {
    const provider = new AGNOSProvider(makeProviderConfig());
    expect(provider.name).toBe('agnos');
  });

  describe('chat', () => {
    it('sends OpenAI-compatible request and maps response', async () => {
      const fetchSpy = mockFetchResponse({
        id: 'chatcmpl-123',
        model: 'llama3',
        choices: [
          {
            index: 0,
            message: { role: 'assistant', content: 'Hello!' },
            finish_reason: 'stop',
          },
        ],
        usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
      });
      vi.stubGlobal('fetch', fetchSpy);

      const provider = new AGNOSProvider(makeProviderConfig());
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'Hi' }],
      });

      expect(response.content).toBe('Hello!');
      expect(response.provider).toBe('agnos');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(5);
      expect(response.stopReason).toBe('end_turn');

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://127.0.0.1:8088/v1/chat/completions',
        expect.objectContaining({ method: 'POST' })
      );
    });

    it('includes Authorization header when API key is set', async () => {
      const fetchSpy = mockFetchResponse({
        id: 'x',
        model: 'llama3',
        choices: [{ index: 0, message: { role: 'assistant', content: '' }, finish_reason: 'stop' }],
        usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
      });
      vi.stubGlobal('fetch', fetchSpy);

      const provider = new AGNOSProvider(makeProviderConfig({ apiKey: 'secret-key' }));
      await provider.chat({ messages: [{ role: 'user', content: 'test' }] });

      const callArgs = fetchSpy.mock.calls[0][1] as RequestInit;
      const headers = callArgs.headers as Record<string, string>;
      expect(headers.Authorization).toBe('Bearer secret-key');
    });

    it('maps tool_calls finish reason correctly', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchResponse({
          id: 'x',
          model: 'llama3',
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
                    function: { name: 'get_weather', arguments: '{"city":"NYC"}' },
                  },
                ],
              },
              finish_reason: 'tool_calls',
            },
          ],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        })
      );

      const provider = new AGNOSProvider(makeProviderConfig());
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'weather' }],
        tools: [
          {
            name: 'get_weather',
            parameters: { type: 'object', properties: { city: { type: 'string' } } },
          },
        ],
      });

      expect(response.stopReason).toBe('tool_use');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('get_weather');
      expect(response.toolCalls![0].arguments).toEqual({ city: 'NYC' });
    });

    it('throws ProviderUnavailableError on 429', async () => {
      vi.stubGlobal('fetch', mockFetchResponse({}, false, 429));

      const provider = new AGNOSProvider(makeProviderConfig());
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('unavailable');
    });

    it('throws ProviderUnavailableError on 500+', async () => {
      vi.stubGlobal('fetch', mockFetchResponse({}, false, 503));

      const provider = new AGNOSProvider(makeProviderConfig());
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('unavailable');
    });

    it('throws ProviderUnavailableError on ECONNREFUSED', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('fetch failed: ECONNREFUSED')));

      const provider = new AGNOSProvider(makeProviderConfig());
      await expect(
        provider.chat({ messages: [{ role: 'user', content: 'test' }] })
      ).rejects.toThrow('unavailable');
    });

    it('handles response with no usage field', async () => {
      vi.stubGlobal(
        'fetch',
        mockFetchResponse({
          id: 'x',
          model: 'llama3',
          choices: [
            { index: 0, message: { role: 'assistant', content: 'ok' }, finish_reason: 'stop' },
          ],
        })
      );

      const provider = new AGNOSProvider(makeProviderConfig());
      const response = await provider.chat({
        messages: [{ role: 'user', content: 'test' }],
      });

      expect(response.usage.totalTokens).toBe(0);
    });
  });
});
