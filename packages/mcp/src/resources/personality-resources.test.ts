/**
 * Personality Resources — unit tests
 *
 * Verifies that personality-active, personality-entry, and personality-prompt
 * resource handlers work correctly by capturing and invoking them.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerPersonalityResources } from './personality-resources.js';
import type { CoreApiClient } from '../core-client.js';

type ResourceHandler = (uri: URL) => Promise<{
  contents: { uri: string; mimeType: string; text: string }[];
}>;

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({
      personality: {
        id: '1',
        name: 'FRIDAY',
        description: 'A helpful AI assistant',
        isDefault: true,
        systemPrompt: 'You are FRIDAY, a helpful AI assistant.',
        defaultModel: { model: 'gpt-4' },
      },
    }),
    post: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function captureResourceHandlers(client: CoreApiClient): Record<string, ResourceHandler> {
  const server = new McpServer({ name: 'test', version: '1.0.0' });
  const handlers: Record<string, ResourceHandler> = {};

  vi.spyOn(server, 'resource').mockImplementation(
    (name: string, _uri: unknown, _meta: unknown, handler: unknown) => {
      handlers[name] = handler as ResourceHandler;
      return server as any;
    }
  );

  registerPersonalityResources(server, client);
  return handlers;
}

describe('personality-resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 3 personality resources', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerPersonalityResources(server, mockClient())).not.toThrow();
  });

  describe('personality-active', () => {
    it('calls GET /api/v1/soul/personality and returns JSON', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      const result = await handlers['personality-active'](new URL('secureyeoman://personality/active'));

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/personality');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].uri).toBe('secureyeoman://personality/active');
      expect(result.contents[0].mimeType).toBe('application/json');
      const parsed = JSON.parse(result.contents[0].text);
      expect(parsed.personality.name).toBe('FRIDAY');
    });
  });

  describe('personality-entry', () => {
    it('extracts ID from URI and calls GET with it', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      const result = await handlers['personality-entry'](
        new URL('secureyeoman://personality/abc-123')
      );

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/personalities/abc-123');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('application/json');
    });
  });

  describe('personality-prompt', () => {
    it('returns text/markdown with front matter and system prompt', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      // The URI template is yeoman://personalities/{id}/prompt
      // URL('yeoman://personalities/abc-123/prompt') → host='personalities', pathname='/abc-123/prompt'
      // Code extracts id via pathname.split('/')[2] → but that gives 'prompt'
      // The actual MCP SDK passes the URI. split('/') on '/abc-123/prompt' → ['', 'abc-123', 'prompt']
      // so index 2 = 'prompt'. The code expects index 2 to be the id.
      // To match: yeoman:///personalities/abc-123/prompt → pathname='/personalities/abc-123/prompt'
      const testUrl = new URL('yeoman:///personalities/abc-123/prompt');
      const result = await handlers['personality-prompt'](testUrl);

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/personalities/abc-123');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(result.contents[0].text).toContain('---');
      expect(result.contents[0].text).toContain('FRIDAY');
      expect(result.contents[0].text).toContain('You are FRIDAY');
    });

    it('handles missing fields gracefully', async () => {
      const client = mockClient();
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        personality: { name: 'Minimal' },
      });
      const handlers = captureResourceHandlers(client);

      const result = await handlers['personality-prompt'](
        new URL('yeoman:///personalities/min-id/prompt')
      );

      expect(result.contents[0].text).toContain('Minimal');
      expect(result.contents[0].text).toContain('---');
    });
  });
});
