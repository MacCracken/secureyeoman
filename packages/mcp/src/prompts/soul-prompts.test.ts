/**
 * Soul Prompts — unit tests
 *
 * Verifies that secureyeoman:compose-prompt prompt handler works correctly,
 * including personality lookup, config fallback, and error handling.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSoulPrompts } from './soul-prompts.js';
import type { CoreApiClient } from '../core-client.js';

type PromptHandler = (args: Record<string, string | undefined>) => Promise<{
  messages: { role: string; content: { type: string; text: string } }[];
}>;

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/soul/personality') {
        return Promise.resolve({
          personality: { name: 'FRIDAY', systemPrompt: 'I am FRIDAY' },
        });
      }
      if (url.startsWith('/api/v1/soul/personalities/')) {
        return Promise.resolve({
          personality: { name: 'Custom', systemPrompt: 'I am a custom personality' },
        });
      }
      if (url === '/api/v1/soul/prompt/preview') {
        return Promise.resolve({ prompt: 'Composed system prompt' });
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function capturePromptHandlers(client: CoreApiClient): Record<string, PromptHandler> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, PromptHandler> = {};

  vi.spyOn(server, 'prompt').mockImplementation(
    (name: string, _desc: unknown, _schema: unknown, handler: unknown) => {
      handlers[name] = handler as PromptHandler;
      return server as any;
    }
  );

  registerSoulPrompts(server, client);
  return handlers;
}

describe('soul-prompts', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers secureyeoman:compose-prompt', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSoulPrompts(server, mockClient())).not.toThrow();
  });

  describe('secureyeoman:compose-prompt', () => {
    it('uses composed prompt from /api/v1/soul/prompt/preview', async () => {
      const client = mockClient();
      const handlers = capturePromptHandlers(client);
      const result = await handlers['secureyeoman:compose-prompt']({});

      expect(result.messages).toHaveLength(1);
      expect(result.messages[0].role).toBe('user');
      expect(result.messages[0].content.text).toBe('Composed system prompt');
    });

    it('fetches specific personality when personalityId is provided', async () => {
      const client = mockClient();
      const handlers = capturePromptHandlers(client);
      await handlers['secureyeoman:compose-prompt']({ personalityId: 'custom-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/personalities/custom-1');
    });

    it('fetches active personality when personalityId is omitted', async () => {
      const client = mockClient();
      const handlers = capturePromptHandlers(client);
      await handlers['secureyeoman:compose-prompt']({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/personality');
    });

    it('falls back to personality systemPrompt when config.prompt is undefined', async () => {
      const client = mockClient();
      (
        client.get as ReturnType<typeof vi.fn<(url: string) => Promise<unknown>>>
      ).mockImplementation((url: string) => {
        if (url === '/api/v1/soul/personality') {
          return Promise.resolve({
            personality: { name: 'FRIDAY', systemPrompt: 'Custom system prompt' },
          });
        }
        if (url === '/api/v1/soul/prompt/preview') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });
      const handlers = capturePromptHandlers(client);
      const result = await handlers['secureyeoman:compose-prompt']({});

      expect(result.messages[0].content.text).toBe('Custom system prompt');
    });

    it('falls back to default when both prompt and systemPrompt are undefined', async () => {
      const client = mockClient();
      (
        client.get as ReturnType<typeof vi.fn<(url: string) => Promise<unknown>>>
      ).mockImplementation((url: string) => {
        if (url === '/api/v1/soul/personality') {
          return Promise.resolve({ personality: { name: 'FRIDAY' } });
        }
        if (url === '/api/v1/soul/prompt/preview') {
          return Promise.resolve({});
        }
        return Promise.resolve({});
      });
      const handlers = capturePromptHandlers(client);
      const result = await handlers['secureyeoman:compose-prompt']({});

      expect(result.messages[0].content.text).toBe('You are FRIDAY, a helpful AI assistant.');
    });

    it('returns default prompt when API throws', async () => {
      const client = mockClient();
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Server error'));
      const handlers = capturePromptHandlers(client);
      const result = await handlers['secureyeoman:compose-prompt']({});

      expect(result.messages[0].content.text).toBe('You are FRIDAY, a helpful AI assistant.');
    });
  });
});
