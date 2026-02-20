import { describe, it, expect, vi, beforeEach } from 'vitest';
import { LMStudioProvider } from './lmstudio.js';
import type { AIRequest, ModelConfig } from '@secureyeoman/shared';

const mockCreate = vi.fn();

vi.mock('openai', () => {
  class MockOpenAI {
    chat = { completions: { create: mockCreate } };
    constructor(_opts?: unknown) {}
  }
  return { default: MockOpenAI };
});

function makeConfig(): { model: ModelConfig; retryConfig: { maxRetries: number } } {
  return {
    model: {
      provider: 'lmstudio' as any,
      model: 'llama-3',
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

describe('LMStudioProvider', () => {
  let provider: LMStudioProvider;

  beforeEach(() => {
    vi.clearAllMocks();
    provider = new LMStudioProvider(makeConfig());
  });

  it('has name lmstudio', () => {
    expect(provider.name).toBe('lmstudio');
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
      expect(res.provider).toBe('lmstudio');
      expect(res.usage.inputTokens).toBe(10);
      expect(res.usage.outputTokens).toBe(5);
      expect(res.stopReason).toBe('end_turn');
    });

    it('maps tool_calls finish reason to tool_use', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-2',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                {
                  id: 'call-1',
                  function: { name: 'search', arguments: '{"query":"test"}' },
                },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: { prompt_tokens: 5, completion_tokens: 8, total_tokens: 13 },
      });

      const res = await provider.chat(simpleRequest);
      expect(res.stopReason).toBe('tool_use');
      expect(res.toolCalls).toHaveLength(1);
      expect(res.toolCalls![0].name).toBe('search');
      expect(res.toolCalls![0].arguments).toEqual({ query: 'test' });
    });

    it('maps length finish reason to max_tokens', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-3',
        choices: [{ message: { content: 'truncated', role: 'assistant' }, finish_reason: 'length' }],
        usage: { prompt_tokens: 5, completion_tokens: 1024, total_tokens: 1029 },
      });

      const res = await provider.chat(simpleRequest);
      expect(res.stopReason).toBe('max_tokens');
    });

    it('handles malformed tool_call arguments', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-4',
        choices: [
          {
            message: {
              role: 'assistant',
              content: null,
              tool_calls: [
                { id: 'call-1', function: { name: 'tool', arguments: 'not-json' } },
              ],
            },
            finish_reason: 'tool_calls',
          },
        ],
        usage: null,
      });

      const res = await provider.chat(simpleRequest);
      expect(res.toolCalls![0].arguments).toHaveProperty('_raw');
    });

    it('maps system messages correctly', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-5',
        choices: [{ message: { content: 'OK', role: 'assistant' }, finish_reason: 'stop' }],
        usage: null,
      });

      await provider.chat({
        messages: [
          { role: 'system', content: 'You are helpful.' },
          { role: 'user', content: 'Hi' },
        ],
        stream: false,
      });

      const callArg = mockCreate.mock.calls[0][0] as any;
      expect(callArg.messages[0]).toEqual({ role: 'system', content: 'You are helpful.' });
    });

    it('maps tool result messages', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-6',
        choices: [{ message: { content: 'Done', role: 'assistant' }, finish_reason: 'stop' }],
        usage: null,
      });

      await provider.chat({
        messages: [
          { role: 'tool', content: null, toolResult: { toolCallId: 'call-1', content: 'result' } },
        ],
        stream: false,
      });

      const callArg = mockCreate.mock.calls[0][0] as any;
      expect(callArg.messages[0]).toEqual({
        role: 'tool',
        tool_call_id: 'call-1',
        content: 'result',
      });
    });

    it('includes tools in request when provided', async () => {
      mockCreate.mockResolvedValue({
        id: 'cmpl-7',
        choices: [{ message: { content: 'OK', role: 'assistant' }, finish_reason: 'stop' }],
        usage: null,
      });

      await provider.chat({
        messages: [{ role: 'user', content: 'Use tool' }],
        tools: [{ name: 'search', description: 'Search', parameters: { type: 'object' } }],
        stream: false,
      });

      const callArg = mockCreate.mock.calls[0][0] as any;
      expect(callArg.tools).toHaveLength(1);
      expect(callArg.tools[0].function.name).toBe('search');
    });
  });

  describe('fetchAvailableModels', () => {
    it('returns models from API', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({
        ok: true,
        json: async () => ({
          data: [
            { id: 'llama-3', owned_by: 'meta' },
            { id: 'mistral-7b', owned_by: 'mistral' },
          ],
        }),
      }));

      const models = await LMStudioProvider.fetchAvailableModels('http://localhost:1234/v1');
      expect(models).toHaveLength(2);
      expect(models[0].id).toBe('llama-3');
      expect(models[0].ownedBy).toBe('meta');

      vi.unstubAllGlobals();
    });

    it('returns empty array on HTTP error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false }));
      const models = await LMStudioProvider.fetchAvailableModels();
      expect(models).toEqual([]);
      vi.unstubAllGlobals();
    });

    it('returns empty array on network error', async () => {
      vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('ECONNREFUSED')));
      const models = await LMStudioProvider.fetchAvailableModels();
      expect(models).toEqual([]);
      vi.unstubAllGlobals();
    });
  });
});
