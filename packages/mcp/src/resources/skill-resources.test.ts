/**
 * Skill Resources — unit tests
 *
 * Verifies that skill-markdown resource handler works correctly
 * by capturing and invoking it.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSkillResources } from './skill-resources.js';
import type { CoreApiClient } from '../core-client.js';

type ResourceHandler = (uri: URL) => Promise<{
  contents: { uri: string; mimeType: string; text: string }[];
}>;

function mockClient(): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({
      name: 'code-review',
      description: 'Reviews code for quality and security',
      instructions: 'Review the code carefully for bugs and security issues.',
      source: 'built-in',
      status: 'active',
      routing: 'fuzzy',
      useWhen: 'User asks for code review',
      doNotUseWhen: 'User is just chatting',
      successCriteria: 'Identified at least one issue or confirmed no issues',
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

  registerSkillResources(server, client);
  return handlers;
}

describe('skill-resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers skill-markdown resource without error', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSkillResources(server, mockClient())).not.toThrow();
  });

  describe('skill-markdown handler', () => {
    it('calls GET /api/v1/soul/skills/:id and returns markdown', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      const result = await handlers['skill-markdown'](
        new URL('yeoman://skills/code-review')
      );

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/skills/code-review');
      expect(result.contents).toHaveLength(1);
      expect(result.contents[0].mimeType).toBe('text/markdown');
      expect(result.contents[0].text).toContain('---');
      expect(result.contents[0].text).toContain('code-review');
      expect(result.contents[0].text).toContain('Review the code carefully');
    });

    it('includes all front matter fields', async () => {
      const client = mockClient();
      const handlers = captureResourceHandlers(client);

      const result = await handlers['skill-markdown'](
        new URL('yeoman://skills/code-review')
      );

      const text = result.contents[0].text;
      expect(text).toContain('source:');
      expect(text).toContain('status:');
      expect(text).toContain('routing:');
      expect(text).toContain('tokens:');
    });

    it('handles skill with minimal fields', async () => {
      const client = mockClient();
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue({
        name: 'minimal',
      });
      const handlers = captureResourceHandlers(client);

      const result = await handlers['skill-markdown'](
        new URL('yeoman://skills/minimal')
      );

      expect(result.contents[0].text).toContain('minimal');
      expect(result.contents[0].text).toContain('---');
    });

    it('throws when skill is null', async () => {
      const client = mockClient();
      (client.get as ReturnType<typeof vi.fn>).mockResolvedValue(null);
      const handlers = captureResourceHandlers(client);

      await expect(
        handlers['skill-markdown'](new URL('yeoman://skills/nonexistent'))
      ).rejects.toThrow('not found');
    });
  });
});
