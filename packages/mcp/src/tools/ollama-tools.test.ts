/**
 * Ollama Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerOllamaTools } from './ollama-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({}),
    post: vi.fn().mockResolvedValue({ success: true }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    ...overrides,
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: { log: vi.fn(), wrap: (_t: string, _a: unknown, fn: () => unknown) => fn() },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('ollama-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers ollama_pull and ollama_rm without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerOllamaTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('ollama_pull', () => {
    it('calls POST /api/v1/model/ollama/pull with model name', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerOllamaTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ollama_pull')!;
      const result = await handler({ model: 'llama3:8b' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/model/ollama/pull', {
        model: 'llama3:8b',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.model).toBe('llama3:8b');
    });

    it('returns error when pull fails with error message', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({ error: 'model not found' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerOllamaTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ollama_pull')!;
      const result = await handler({ model: 'nonexistent:latest' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Pull failed: model not found');
    });

    it('returns error when API throws', async () => {
      const client = mockClient({
        post: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerOllamaTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ollama_pull')!;
      const result = await handler({ model: 'llama3:8b' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Connection refused');
    });
  });

  describe('ollama_rm', () => {
    it('calls DELETE /api/v1/model/ollama/:model', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerOllamaTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ollama_rm')!;
      const result = await handler({ model: 'llama3:8b' });

      expect(client.delete).toHaveBeenCalledWith('/api/v1/model/ollama/llama3%3A8b');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.success).toBe(true);
      expect(parsed.model).toBe('llama3:8b');
    });

    it('returns error when delete fails', async () => {
      const client = mockClient({
        delete: vi.fn().mockRejectedValue(new Error('Not found')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerOllamaTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('ollama_rm')!;
      const result = await handler({ model: 'missing:latest' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not found');
    });
  });
});
