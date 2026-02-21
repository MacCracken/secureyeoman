import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { LettaProvider } from './letta.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';
import {
  RateLimitError,
  TokenLimitError,
  AuthenticationError,
  ProviderUnavailableError,
  InvalidResponseError,
} from '../errors.js';

// ─── Mock global fetch ────────────────────────────────────────────────────────

const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeConfig(): { model: ModelConfig; apiKey: string; retryConfig: { maxRetries: number } } {
  return {
    model: {
      provider: 'letta',
      model: 'openai/gpt-4o',
      apiKeyEnv: 'LETTA_API_KEY',
      maxTokens: 1024,
      temperature: 0.7,
      maxRequestsPerMinute: 60,
      requestTimeoutMs: 30000,
      maxRetries: 0,
      retryDelayMs: 100,
    },
    apiKey: 'test-letta-key',
    retryConfig: { maxRetries: 0 },
  };
}

function mockAgentCreate(agentId = 'agent-test-123') {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({ id: agentId, name: 'secureyeoman-test' }),
  });
}

function mockMessageResponse(
  overrides: Partial<{
    messages: object[];
    usage: object;
    stop_reason: string;
  }> = {}
) {
  mockFetch.mockResolvedValueOnce({
    ok: true,
    json: async () => ({
      messages: [
        { message_type: 'reasoning_message', content: 'thinking...' },
        { message_type: 'assistant_message', content: 'Hello from Letta!' },
      ],
      usage: { prompt_tokens: 10, completion_tokens: 20, total_tokens: 30 },
      stop_reason: 'end_turn',
      ...overrides,
    }),
  });
}

const simpleRequest: AIRequest = {
  messages: [{ role: 'user', content: 'Hello' }],
  stream: false,
};

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('LettaProvider', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.LETTA_AGENT_ID;
    delete process.env.LETTA_BASE_URL;
    delete process.env.LETTA_LOCAL;
    delete process.env.LETTA_API_KEY;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  // ── Constructor ─────────────────────────────────────────────────────────────

  describe('constructor', () => {
    it('throws when no API key is provided', () => {
      const config = makeConfig();
      expect(() => new LettaProvider({ model: config.model })).toThrow(
        'Letta provider requires LETTA_API_KEY'
      );
    });

    it('accepts API key from LETTA_API_KEY env var', () => {
      process.env.LETTA_API_KEY = 'env-key';
      const config = makeConfig();
      expect(() => new LettaProvider({ model: config.model })).not.toThrow();
    });

    it('constructs successfully with config.apiKey', () => {
      expect(() => new LettaProvider(makeConfig())).not.toThrow();
    });

    it('uses LETTA_AGENT_ID env var to skip agent creation', async () => {
      process.env.LETTA_AGENT_ID = 'agent-preset-456';
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat(simpleRequest);

      // Only one fetch call: the messages endpoint (no agent creation)
      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('agent-preset-456/messages'),
        expect.any(Object)
      );
    });

    it('uses LETTA_LOCAL env var to set base URL', async () => {
      process.env.LETTA_LOCAL = 'true';
      process.env.LETTA_AGENT_ID = 'agent-local';
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat(simpleRequest);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('localhost:8283'),
        expect.any(Object)
      );
    });

    it('uses LETTA_BASE_URL env var when set', async () => {
      process.env.LETTA_BASE_URL = 'http://my-letta:9000';
      process.env.LETTA_AGENT_ID = 'agent-custom';
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat(simpleRequest);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('my-letta:9000'),
        expect.any(Object)
      );
    });
  });

  // ── Agent Creation ──────────────────────────────────────────────────────────

  describe('agent creation', () => {
    it('creates an agent on first chat call', async () => {
      mockAgentCreate('agent-new-999');
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat(simpleRequest);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      const [agentCall] = mockFetch.mock.calls;
      expect(agentCall![0]).toContain('/v1/agents');
      expect(agentCall![1].method).toBe('POST');
    });

    it('reuses the agent on subsequent calls (no double creation)', async () => {
      mockAgentCreate('agent-cached');
      mockMessageResponse();
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat(simpleRequest);
      await provider.chat(simpleRequest);

      // 1 agent creation + 2 message calls = 3 total
      expect(mockFetch).toHaveBeenCalledTimes(3);
    });

    it('shares a single creation promise for concurrent calls', async () => {
      let resolveAgent!: (v: Response) => void;
      const agentPromise = new Promise<Response>((res) => {
        resolveAgent = res;
      });

      mockFetch
        .mockReturnValueOnce(agentPromise) // agent creation (delayed)
        .mockResolvedValue({
          ok: true,
          json: async () => ({
            messages: [{ message_type: 'assistant_message', content: 'ok' }],
            stop_reason: 'end_turn',
          }),
        });

      const provider = new LettaProvider(makeConfig());
      const p1 = provider.chat(simpleRequest);
      const p2 = provider.chat(simpleRequest);

      // Resolve agent creation
      resolveAgent({
        ok: true,
        json: async () => ({ id: 'agent-concurrent', name: 'test' }),
      } as Response);

      await Promise.all([p1, p2]);

      // agent creation called exactly once
      const agentCalls = mockFetch.mock.calls.filter((c) =>
        (c[0] as string).endsWith('/v1/agents')
      );
      expect(agentCalls).toHaveLength(1);
    });
  });

  // ── chat ────────────────────────────────────────────────────────────────────

  describe('chat', () => {
    it('returns content from assistant_message', async () => {
      mockAgentCreate();
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);

      expect(response.content).toBe('Hello from Letta!');
      expect(response.provider).toBe('letta');
      expect(response.model).toBe('openai/gpt-4o');
    });

    it('maps token usage correctly', async () => {
      mockAgentCreate();
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);

      expect(response.usage.inputTokens).toBe(10);
      expect(response.usage.outputTokens).toBe(20);
      expect(response.usage.totalTokens).toBe(30);
    });

    it('maps stop_reason end_turn', async () => {
      mockAgentCreate();
      mockMessageResponse({ stop_reason: 'end_turn' });
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('end_turn');
    });

    it('maps stop_reason max_steps to max_tokens', async () => {
      mockAgentCreate();
      mockMessageResponse({ stop_reason: 'max_steps' });
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('max_tokens');
    });

    it('maps stop_reason tool_calls to tool_use', async () => {
      mockAgentCreate();
      mockMessageResponse({
        messages: [
          {
            message_type: 'assistant_message',
            content: null,
            tool_calls: [
              {
                id: 'tc_1',
                tool_call_type: 'function',
                function: { name: 'search', arguments: '{"query":"test"}' },
              },
            ],
          },
        ],
        stop_reason: 'tool_calls',
      });
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);
      expect(response.stopReason).toBe('tool_use');
      expect(response.toolCalls).toHaveLength(1);
      expect(response.toolCalls![0]).toEqual({
        id: 'tc_1',
        name: 'search',
        arguments: { query: 'test' },
      });
    });

    it('returns empty content when no assistant_message in response', async () => {
      mockAgentCreate();
      mockMessageResponse({
        messages: [{ message_type: 'reasoning_message', content: 'thinking' }],
      });
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);
      expect(response.content).toBe('');
    });

    it('handles array content blocks', async () => {
      mockAgentCreate();
      mockMessageResponse({
        messages: [
          {
            message_type: 'assistant_message',
            content: [
              { type: 'text', text: 'Hello ' },
              { type: 'text', text: 'world' },
            ],
          },
        ],
      });
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);
      expect(response.content).toBe('Hello world');
    });

    it('includes Authorization header with Bearer token', async () => {
      mockAgentCreate();
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat(simpleRequest);

      const msgCall = mockFetch.mock.calls[1]!;
      expect(msgCall[1].headers['Authorization']).toBe('Bearer test-letta-key');
    });

    it('sends system messages in the messages array', async () => {
      mockAgentCreate();
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat({
        messages: [
          { role: 'system', content: 'Be concise' },
          { role: 'user', content: 'Hi' },
        ],
        stream: false,
      });

      const msgCall = mockFetch.mock.calls[1]!;
      const body = JSON.parse(msgCall[1].body as string) as { messages: { role: string }[] };
      expect(body.messages[0]).toEqual({ role: 'system', content: 'Be concise' });
      expect(body.messages[1]).toEqual({ role: 'user', content: 'Hi' });
    });

    it('filters tool role messages from the messages array', async () => {
      mockAgentCreate();
      mockMessageResponse();
      const provider = new LettaProvider(makeConfig());
      await provider.chat({
        messages: [
          { role: 'user', content: 'Run search' },
          { role: 'tool', toolResult: { toolCallId: 'tc_1', content: 'result', isError: false } },
        ],
        stream: false,
      });

      const msgCall = mockFetch.mock.calls[1]!;
      const body = JSON.parse(msgCall[1].body as string) as { messages: { role: string }[] };
      expect(body.messages).toHaveLength(1);
      expect(body.messages[0]!.role).toBe('user');
    });

    it('handles malformed tool call arguments gracefully', async () => {
      mockAgentCreate();
      mockMessageResponse({
        messages: [
          {
            message_type: 'assistant_message',
            tool_calls: [
              {
                id: 'tc_bad',
                tool_call_type: 'function',
                function: { name: 'bad', arguments: 'not-json' },
              },
            ],
          },
        ],
      });
      const provider = new LettaProvider(makeConfig());
      const response = await provider.chat(simpleRequest);
      expect(response.toolCalls![0]!.arguments).toEqual({ _raw: 'not-json' });
    });
  });

  // ── Error Handling ──────────────────────────────────────────────────────────

  describe('error handling', () => {
    it('maps 429 from agent creation to RateLimitError', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'rate limited' } }),
      });
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow(RateLimitError);
    });

    it('maps 401 from messages to AuthenticationError', async () => {
      mockAgentCreate();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({ error: { message: 'unauthorized' } }),
      });
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow(AuthenticationError);
    });

    it('maps 403 to AuthenticationError', async () => {
      mockAgentCreate();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({ detail: 'forbidden' }),
      });
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow(AuthenticationError);
    });

    it('maps 400 token error to TokenLimitError', async () => {
      mockAgentCreate();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({ error: { message: 'token limit exceeded' } }),
      });
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow(TokenLimitError);
    });

    it('maps 503 to ProviderUnavailableError', async () => {
      mockAgentCreate();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503,
        json: async () => ({ error: { message: 'service unavailable' } }),
      });
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow(ProviderUnavailableError);
    });

    it('maps 500 to InvalidResponseError', async () => {
      mockAgentCreate();
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: 'internal error' } }),
      });
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow(InvalidResponseError);
    });

    it('propagates generic errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network failure'));
      const provider = new LettaProvider(makeConfig());
      await expect(provider.chat(simpleRequest)).rejects.toThrow('network failure');
    });
  });

  // ── chatStream ──────────────────────────────────────────────────────────────

  describe('chatStream', () => {
    function makeStreamResponse(lines: string[]) {
      const encoder = new TextEncoder();
      const data = lines.map((l) => `data: ${l}\n`).join('\n');
      let done = false;
      return {
        ok: true,
        body: {
          getReader() {
            return {
              read: vi
                .fn()
                .mockResolvedValueOnce({ done: false, value: encoder.encode(data) })
                .mockResolvedValueOnce({ done: true, value: undefined }),
              releaseLock: vi.fn(),
            };
          },
        },
      };
    }

    it('yields content_delta chunks from SSE stream', async () => {
      process.env.LETTA_AGENT_ID = 'agent-stream-1';
      mockFetch.mockResolvedValueOnce(
        makeStreamResponse([
          JSON.stringify({ message_type: 'assistant_message', delta: { text: 'Hello' } }),
          JSON.stringify({ message_type: 'assistant_message', delta: { text: ' world' } }),
          '[DONE]',
        ])
      );

      const provider = new LettaProvider(makeConfig());
      const chunks: { type: string; content?: string }[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }

      const contentChunks = chunks.filter((c) => c.type === 'content_delta');
      expect(contentChunks).toHaveLength(2);
      expect(contentChunks[0]!.content).toBe('Hello');
      expect(contentChunks[1]!.content).toBe(' world');
    });

    it('yields usage chunk from SSE stream', async () => {
      process.env.LETTA_AGENT_ID = 'agent-stream-2';
      mockFetch.mockResolvedValueOnce(
        makeStreamResponse([
          JSON.stringify({
            usage: { prompt_tokens: 5, completion_tokens: 10, total_tokens: 15 },
          }),
          '[DONE]',
        ])
      );

      const provider = new LettaProvider(makeConfig());
      const chunks: { type: string; usage?: { inputTokens: number; outputTokens: number } }[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }

      const usageChunk = chunks.find((c) => c.type === 'usage');
      expect(usageChunk).toBeTruthy();
      expect(usageChunk!.usage!.inputTokens).toBe(5);
      expect(usageChunk!.usage!.outputTokens).toBe(10);
    });

    it('yields done chunk from stop_reason', async () => {
      process.env.LETTA_AGENT_ID = 'agent-stream-3';
      mockFetch.mockResolvedValueOnce(
        makeStreamResponse([JSON.stringify({ stop_reason: 'end_turn' })])
      );

      const provider = new LettaProvider(makeConfig());
      const chunks: { type: string; stopReason?: string }[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }

      expect(chunks.find((c) => c.type === 'done')).toBeTruthy();
    });

    it('skips malformed SSE lines', async () => {
      process.env.LETTA_AGENT_ID = 'agent-stream-4';
      mockFetch.mockResolvedValueOnce(
        makeStreamResponse([
          'not-valid-json-{{{',
          JSON.stringify({ message_type: 'assistant_message', delta: { text: 'ok' } }),
          '[DONE]',
        ])
      );

      const provider = new LettaProvider(makeConfig());
      const chunks: { type: string }[] = [];
      for await (const chunk of provider.chatStream(simpleRequest)) {
        chunks.push(chunk);
      }

      expect(chunks.find((c) => c.type === 'content_delta')).toBeTruthy();
    });

    it('throws on non-ok stream response', async () => {
      process.env.LETTA_AGENT_ID = 'agent-stream-5';
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 429,
        json: async () => ({ error: { message: 'rate limited' } }),
      });

      const provider = new LettaProvider(makeConfig());
      await expect(async () => {
        for await (const _ of provider.chatStream(simpleRequest)) {
          /* drain */
        }
      }).rejects.toThrow(RateLimitError);
    });
  });

  // ── fetchAvailableModels ────────────────────────────────────────────────────

  describe('fetchAvailableModels', () => {
    it('returns models from the Letta models endpoint', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { id: 'openai/gpt-4o', context_window: 128000 },
            { id: 'anthropic/claude-sonnet-4-20250514', context_window: 200000 },
          ],
        }),
      });

      const models = await LettaProvider.fetchAvailableModels('test-key');
      expect(models).toHaveLength(2);
      expect(models[0]!.id).toBe('openai/gpt-4o');
      expect(models[0]!.contextWindowSize).toBe(128000);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/v1/models'),
        expect.objectContaining({
          headers: expect.objectContaining({ Authorization: 'Bearer test-key' }),
        })
      );
    });

    it('returns empty array when no API key', async () => {
      const models = await LettaProvider.fetchAvailableModels();
      expect(models).toEqual([]);
    });

    it('returns empty array on non-ok response', async () => {
      mockFetch.mockResolvedValueOnce({ ok: false, status: 500 });
      const models = await LettaProvider.fetchAvailableModels('bad-key');
      expect(models).toEqual([]);
    });

    it('returns empty array on network error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('network error'));
      const models = await LettaProvider.fetchAvailableModels('test-key');
      expect(models).toEqual([]);
    });

    it('filters out models with empty IDs', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          models: [
            { id: 'openai/gpt-4o' },
            { id: '' },
            { id: 'anthropic/claude-haiku-3-5-20241022' },
          ],
        }),
      });

      const models = await LettaProvider.fetchAvailableModels('key');
      expect(models).toHaveLength(2);
    });
  });

  // ── getKnownModels ──────────────────────────────────────────────────────────

  describe('getKnownModels', () => {
    it('returns the four known Letta model identifiers', () => {
      const models = LettaProvider.getKnownModels();
      expect(models).toHaveLength(4);
      const ids = models.map((m) => m.id);
      expect(ids).toContain('openai/gpt-4o');
      expect(ids).toContain('openai/gpt-4o-mini');
      expect(ids).toContain('anthropic/claude-sonnet-4-20250514');
      expect(ids).toContain('anthropic/claude-haiku-3-5-20241022');
    });
  });
});
