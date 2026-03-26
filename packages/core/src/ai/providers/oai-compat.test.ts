import { describe, it, expect } from 'vitest';
import {
  mapMessagesToOAI,
  mapToolsToOAI,
  mapOAIUsage,
  mapOAIFinishReason,
  mapOAIToolCalls,
  mapOAIResponse,
  buildOAIRequestBody,
  mapOAIStreamChunk,
} from './oai-compat.js';
import type { AIMessage, Tool } from '@secureyeoman/shared';

describe('oai-compat mappers', () => {
  describe('mapMessagesToOAI', () => {
    it('maps user and system messages', () => {
      const messages: AIMessage[] = [
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ];
      const result = mapMessagesToOAI(messages);
      expect(result).toEqual([
        { role: 'system', content: 'You are helpful.' },
        { role: 'user', content: 'Hello' },
      ]);
    });

    it('maps assistant message with tool calls', () => {
      const messages: AIMessage[] = [
        {
          role: 'assistant',
          content: null,
          toolCalls: [{ id: 'call-1', name: 'get_weather', arguments: { city: 'NYC' } }],
        },
      ];
      const result = mapMessagesToOAI(messages);
      expect(result[0].role).toBe('assistant');
      expect(result[0].content).toBeNull();
      expect(result[0].tool_calls).toHaveLength(1);
      expect(result[0].tool_calls![0].id).toBe('call-1');
      expect(result[0].tool_calls![0].function.name).toBe('get_weather');
      expect(result[0].tool_calls![0].function.arguments).toBe('{"city":"NYC"}');
    });

    it('maps tool result message', () => {
      const messages: AIMessage[] = [
        {
          role: 'tool',
          toolResult: { toolCallId: 'call-1', content: '72F' },
        },
      ];
      const result = mapMessagesToOAI(messages);
      expect(result[0].role).toBe('tool');
      expect(result[0].content).toBe('72F');
      expect(result[0].tool_call_id).toBe('call-1');
    });

    it('defaults missing content to empty string', () => {
      const messages: AIMessage[] = [{ role: 'user' }];
      const result = mapMessagesToOAI(messages);
      expect(result[0].content).toBe('');
    });
  });

  describe('mapToolsToOAI', () => {
    it('maps tools to OpenAI function format', () => {
      const tools: Tool[] = [
        {
          name: 'search',
          description: 'Search the web',
          parameters: { type: 'object', properties: { q: { type: 'string' } } },
        },
      ];
      const result = mapToolsToOAI(tools);
      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('function');
      expect(result[0].function.name).toBe('search');
      expect(result[0].function.description).toBe('Search the web');
    });
  });

  describe('mapOAIUsage', () => {
    it('maps usage fields', () => {
      const usage = mapOAIUsage({
        prompt_tokens: 10,
        completion_tokens: 20,
        total_tokens: 30,
      });
      expect(usage.inputTokens).toBe(10);
      expect(usage.outputTokens).toBe(20);
      expect(usage.totalTokens).toBe(30);
      expect(usage.cachedTokens).toBe(0);
    });

    it('returns zeroes when undefined', () => {
      const usage = mapOAIUsage(undefined);
      expect(usage.totalTokens).toBe(0);
    });
  });

  describe('mapOAIFinishReason', () => {
    it('maps stop to end_turn', () => {
      expect(mapOAIFinishReason('stop')).toBe('end_turn');
    });

    it('maps tool_calls to tool_use', () => {
      expect(mapOAIFinishReason('tool_calls')).toBe('tool_use');
    });

    it('maps length to max_tokens', () => {
      expect(mapOAIFinishReason('length')).toBe('max_tokens');
    });

    it('defaults unknown to end_turn', () => {
      expect(mapOAIFinishReason('whatever')).toBe('end_turn');
    });
  });

  describe('mapOAIToolCalls', () => {
    it('parses valid tool call arguments', () => {
      const result = mapOAIToolCalls([
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'test', arguments: '{"key":"value"}' },
        },
      ]);
      expect(result).toHaveLength(1);
      expect(result![0].arguments).toEqual({ key: 'value' });
    });

    it('returns empty object for malformed JSON arguments', () => {
      const result = mapOAIToolCalls([
        {
          id: 'call-1',
          type: 'function',
          function: { name: 'test', arguments: '{broken' },
        },
      ]);
      expect(result![0].arguments).toEqual({});
    });

    it('returns undefined for empty array', () => {
      expect(mapOAIToolCalls([])).toBeUndefined();
    });

    it('returns undefined for undefined input', () => {
      expect(mapOAIToolCalls(undefined)).toBeUndefined();
    });
  });

  describe('mapOAIResponse', () => {
    it('maps a complete response', () => {
      const result = mapOAIResponse(
        {
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
        },
        'gpt-4o',
        'hoosh'
      );
      expect(result.id).toBe('chatcmpl-123');
      expect(result.content).toBe('Hello!');
      expect(result.provider).toBe('hoosh');
      expect(result.stopReason).toBe('end_turn');
      expect(result.usage.inputTokens).toBe(10);
    });

    it('throws when no choices', () => {
      expect(() => mapOAIResponse({ id: 'x', model: 'y', choices: [] }, 'y', 'hoosh')).toThrow(
        'No choices'
      );
    });
  });

  describe('buildOAIRequestBody', () => {
    it('builds non-streaming body', () => {
      const body = buildOAIRequestBody(
        [{ role: 'user', content: 'hi' }],
        undefined,
        'gpt-4o',
        0.7,
        1024,
        false
      );
      expect(body.model).toBe('gpt-4o');
      expect(body.stream).toBe(false);
      expect(body).not.toHaveProperty('stream_options');
      expect(body).not.toHaveProperty('tools');
    });

    it('builds streaming body with usage option', () => {
      const body = buildOAIRequestBody(
        [{ role: 'user', content: 'hi' }],
        undefined,
        'gpt-4o',
        0.7,
        1024,
        true
      );
      expect(body.stream).toBe(true);
      expect(body.stream_options).toEqual({ include_usage: true });
    });

    it('includes tools and stop sequences when provided', () => {
      const body = buildOAIRequestBody(
        [{ role: 'user', content: 'hi' }],
        [{ type: 'function', function: { name: 'test', parameters: {} } }],
        'gpt-4o',
        0.7,
        1024,
        false,
        ['STOP']
      );
      expect(body.tools).toHaveLength(1);
      expect(body.stop).toEqual(['STOP']);
    });
  });

  describe('mapOAIStreamChunk', () => {
    it('yields content_delta for content', () => {
      const chunks = [
        ...mapOAIStreamChunk({
          id: 'x',
          model: 'y',
          choices: [{ index: 0, delta: { content: 'Hello' }, finish_reason: null }],
        }),
      ];
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('content_delta');
    });

    it('yields tool_call_delta for tool calls', () => {
      const chunks = [
        ...mapOAIStreamChunk({
          id: 'x',
          model: 'y',
          choices: [
            {
              index: 0,
              delta: {
                tool_calls: [{ index: 0, id: 'call-1', function: { name: 'test', arguments: '' } }],
              },
              finish_reason: null,
            },
          ],
        }),
      ];
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('tool_call_delta');
    });

    it('yields done with usage on finish', () => {
      const chunks = [
        ...mapOAIStreamChunk({
          id: 'x',
          model: 'y',
          choices: [{ index: 0, delta: {}, finish_reason: 'stop' }],
          usage: { prompt_tokens: 10, completion_tokens: 5, total_tokens: 15 },
        }),
      ];
      expect(chunks).toHaveLength(1);
      expect(chunks[0].type).toBe('done');
      if (chunks[0].type === 'done') {
        expect(chunks[0].stopReason).toBe('end_turn');
        expect(chunks[0].usage.totalTokens).toBe(15);
      }
    });

    it('yields nothing for empty choices', () => {
      const chunks = [
        ...mapOAIStreamChunk({
          id: 'x',
          model: 'y',
          choices: [],
        }),
      ];
      expect(chunks).toHaveLength(0);
    });
  });
});
