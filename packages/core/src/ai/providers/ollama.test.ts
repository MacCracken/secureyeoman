import { describe, it, expect, vi, beforeEach } from 'vitest';
import { OllamaProvider } from './ollama.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';
import { ProviderUnavailableError, InvalidResponseError } from '../errors.js';

function makeConfig(): { model: ModelConfig; retryConfig: { maxRetries: number } } {
  return {
    model: {
      provider: 'ollama',
      model: 'llama3',
      apiKeyEnv: 'ANTHROPIC_API_KEY',
      baseUrl: 'http://localhost:11434',
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

describe('OllamaProvider', () => {
  let provider: OllamaProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new OllamaProvider(makeConfig());
  });

  describe('chat', () => {
    it('should map request and response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'llama3',
            message: { role: 'assistant', content: 'Hello from Ollama!' },
            done: true,
            prompt_eval_count: 10,
            eval_count: 20,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      const response = await provider.chat(simpleRequest);
      expect(response.content).toBe('Hello from Ollama!');
      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
      expect(response.provider).toBe('ollama');
    });

    it('should handle tool calls', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'llama3',
            message: {
              role: 'assistant',
              content: '',
              tool_calls: [{ function: { name: 'search', arguments: { query: 'test' } } }],
            },
            done: true,
            prompt_eval_count: 15,
            eval_count: 10,
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      const response = await provider.chat(simpleRequest);
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0].name).toBe('search');
      expect(response.stopReason).toBe('tool_use');
    });

    it('should send correct request body', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            model: 'llama3',
            message: { role: 'assistant', content: 'ok' },
            done: true,
          }),
          { status: 200 }
        )
      );

      await provider.chat(simpleRequest);

      expect(fetchSpy).toHaveBeenCalledWith(
        'http://localhost:11434/api/chat',
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
        })
      );

      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.model).toBe('llama3');
      expect(body.stream).toBe(false);
      expect(body.messages).toHaveLength(1);
    });
  });

  describe('error handling', () => {
    it('should throw ProviderUnavailableError on connection refused', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('fetch failed: ECONNREFUSED'));

      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });

    it('should throw InvalidResponseError on 404 (model not found)', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('not found', { status: 404 }));

      await expect(provider.chat(simpleRequest)).rejects.toThrow(InvalidResponseError);
    });

    it('should throw ProviderUnavailableError on 500', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('server error', { status: 500 }));

      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });
  });

  describe('fetchAvailableModels', () => {
    it('should return all locally downloaded models', async () => {
      const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({
            models: [
              { name: 'llama3:latest', size: 4700000000 },
              { name: 'codellama:7b', size: 3800000000 },
            ],
          }),
          { status: 200, headers: { 'content-type': 'application/json' } }
        )
      );

      const models = await OllamaProvider.fetchAvailableModels('http://localhost:11434');

      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama3:latest');
      expect(models[0].size).toBe(4700000000);
      expect(models[1].id).toBe('codellama:7b');
      expect(fetchSpy).toHaveBeenCalledWith('http://localhost:11434/api/tags');
    });

    it('should return empty array when Ollama is not running', async () => {
      vi.spyOn(global, 'fetch').mockRejectedValue(new Error('ECONNREFUSED'));

      const models = await OllamaProvider.fetchAvailableModels();
      expect(models).toEqual([]);
    });

    it('should return empty array on non-ok response', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('error', { status: 500 }));

      const models = await OllamaProvider.fetchAvailableModels();
      expect(models).toEqual([]);
    });
  });

  describe('message mapping', () => {
    it('maps tool role messages', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(
          JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true }),
          { status: 200 }
        )
      );
      await provider.chat({
        messages: [
          {
            role: 'tool',
            content: 'result',
            toolResult: { toolCallId: 'tc-1', content: 'tool output' },
          },
        ],
        stream: false,
      });
      const body = JSON.parse(
        (vi.spyOn(global, 'fetch').mock.calls[0]?.[1]?.body as string) ?? '{}'
      );
      expect(body.messages?.[0]?.role).toBe('tool');
    });

    it('maps assistant messages with tool calls', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true }),
            { status: 200 }
          )
        );
      await provider.chat({
        messages: [
          {
            role: 'assistant',
            content: 'Let me search',
            toolCalls: [{ id: 'tc-1', name: 'search', arguments: { query: 'hello' } }],
          },
        ],
        stream: false,
      });
      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.messages[0].role).toBe('assistant');
      expect(body.messages[0].tool_calls).toHaveLength(1);
      expect(body.messages[0].tool_calls[0].function.name).toBe('search');
    });

    it('maps stop sequences in request body', async () => {
      const fetchSpy = vi
        .spyOn(global, 'fetch')
        .mockResolvedValue(
          new Response(
            JSON.stringify({ message: { role: 'assistant', content: 'ok' }, done: true }),
            { status: 200 }
          )
        );
      await provider.chat({
        messages: [{ role: 'user', content: 'hi' }],
        stream: false,
        stopSequences: ['END', 'STOP'],
      });
      const body = JSON.parse(fetchSpy.mock.calls[0][1]!.body as string);
      expect(body.options.stop).toEqual(['END', 'STOP']);
    });
  });

  describe('streaming', () => {
    it('should parse NDJSON stream', async () => {
      const chunks = [
        JSON.stringify({ message: { content: 'Hello' }, done: false }) + '\n',
        JSON.stringify({ message: { content: ' world' }, done: false }) + '\n',
        JSON.stringify({
          message: { content: '' },
          done: true,
          prompt_eval_count: 5,
          eval_count: 10,
        }) + '\n',
      ];

      const encoder = new TextEncoder();
      const stream = new ReadableStream({
        start(controller) {
          for (const chunk of chunks) {
            controller.enqueue(encoder.encode(chunk));
          }
          controller.close();
        },
      });

      vi.spyOn(global, 'fetch').mockResolvedValue(new Response(stream, { status: 200 }));

      const received: any[] = [];
      const streamReq: AIRequest = { ...simpleRequest, stream: true };
      for await (const chunk of provider.chatStream(streamReq)) {
        received.push(chunk);
      }

      expect(received.length).toBeGreaterThanOrEqual(2);
      expect(received[0].type).toBe('content_delta');
      expect(received[0].content).toBe('Hello');
      const doneChunk = received.find((c) => c.type === 'done');
      expect(doneChunk).toBeDefined();
      expect(doneChunk.usage.totalTokens).toBe(15);
    });
  });

  describe('pull()', () => {
    function makeNdjsonStream(lines: object[]): ReadableStream {
      const encoder = new TextEncoder();
      const ndjson = lines.map((l) => JSON.stringify(l)).join('\n') + '\n';
      return new ReadableStream({
        start(controller) {
          controller.enqueue(encoder.encode(ndjson));
          controller.close();
        },
      });
    }

    it('yields progress lines from NDJSON stream', async () => {
      const lines = [
        { status: 'pulling manifest' },
        { status: 'downloading', total: 100, completed: 50 },
        { status: 'downloading', total: 100, completed: 100 },
      ];
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(makeNdjsonStream(lines), { status: 200 })
      );

      const collected: any[] = [];
      for await (const p of OllamaProvider.pull('http://localhost:11434', 'llama3:8b')) {
        collected.push(p);
      }

      expect(collected.length).toBe(3);
      expect(collected[0].status).toBe('pulling manifest');
      expect(collected[1].completed).toBe(50);
    });

    it('throws on error line', async () => {
      const lines = [
        { status: 'pulling manifest' },
        { error: 'model not found' },
      ];
      vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response(makeNdjsonStream(lines), { status: 200 })
      );

      await expect(async () => {
        for await (const _p of OllamaProvider.pull('http://localhost:11434', 'bad-model')) {
          // consume
        }
      }).rejects.toThrow('model not found');
    });

    it('throws when HTTP response is not ok', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      await expect(async () => {
        for await (const _p of OllamaProvider.pull('http://localhost:11434', 'llama3:8b')) {
          // consume
        }
      }).rejects.toThrow('Ollama pull failed: HTTP 500');
    });
  });

  describe('deleteModel()', () => {
    it('calls DELETE /api/delete and resolves on 200', async () => {
      const mockFetch = vi.spyOn(global, 'fetch').mockResolvedValue(
        new Response('', { status: 200 })
      );

      await expect(
        OllamaProvider.deleteModel('http://localhost:11434', 'llama3:8b')
      ).resolves.toBeUndefined();

      expect(mockFetch).toHaveBeenCalledWith(
        'http://localhost:11434/api/delete',
        expect.objectContaining({
          method: 'DELETE',
          body: JSON.stringify({ name: 'llama3:8b' }),
        })
      );
    });

    it('throws "Model not found" on 404', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 404 }));
      await expect(
        OllamaProvider.deleteModel('http://localhost:11434', 'nonexistent')
      ).rejects.toThrow('Model not found');
    });

    it('throws on other HTTP errors', async () => {
      vi.spyOn(global, 'fetch').mockResolvedValue(new Response('', { status: 500 }));
      await expect(
        OllamaProvider.deleteModel('http://localhost:11434', 'llama3:8b')
      ).rejects.toThrow('Ollama delete failed: HTTP 500');
    });
  });
});
