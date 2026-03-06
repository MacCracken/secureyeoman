/**
 * Brain Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerBrainTools } from './brain-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ entries: [{ id: '1', content: 'test' }] }),
    post: vi.fn().mockResolvedValue({ id: '1', content: 'stored' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
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

describe('brain-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 7 brain tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerBrainTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('knowledge_search', () => {
    it('calls GET /api/v1/brain/knowledge with query params', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('knowledge_search')!;
      await handler({ query: 'security policy', limit: 5 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/knowledge', {
        q: 'security policy',
        limit: '5',
      });
    });

    it('uses federation endpoint when instanceId is provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('knowledge_search')!;
      await handler({ query: 'test', limit: 10, instanceId: 'peer-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/federation/peers/peer-1/knowledge/search', {
        q: 'test',
        limit: '10',
      });
    });
  });

  describe('knowledge_get', () => {
    it('calls GET /api/v1/brain/knowledge/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('knowledge_get')!;
      await handler({ id: 'k-42' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/knowledge/k-42');
    });
  });

  describe('knowledge_store', () => {
    it('calls POST /api/v1/brain/knowledge', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('knowledge_store')!;
      await handler({ content: 'Important fact', type: 'fact', source: 'manual' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/brain/knowledge', {
        content: 'Important fact',
        type: 'fact',
        source: 'manual',
      });
    });
  });

  describe('memory_recall', () => {
    it('calls GET /api/v1/brain/memories with query', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('memory_recall')!;
      await handler({ query: 'last meeting' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/memories', {
        q: 'last meeting',
      });
    });

    it('includes types filter when provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('memory_recall')!;
      await handler({ query: 'test', types: ['episodic', 'semantic'] });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/memories', {
        q: 'test',
        types: 'episodic,semantic',
      });
    });
  });

  describe('memory_activation_stats', () => {
    it('calls GET /api/v1/brain/cognitive-stats', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('memory_activation_stats')!;
      await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/cognitive-stats', {});
    });

    it('includes personalityId filter when provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('memory_activation_stats')!;
      await handler({ personalityId: 'p-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/cognitive-stats', {
        personalityId: 'p-1',
      });
    });
  });

  describe('memory_associations', () => {
    it('calls GET /api/v1/brain/associations/:itemId with query', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('memory_associations')!;
      await handler({ itemId: 'mem-1', limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/associations/mem-1', {
        limit: '10',
      });
    });

    it('includes minWeight filter when provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('memory_associations')!;
      await handler({ itemId: 'mem-1', limit: 20, minWeight: 0.5 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/brain/associations/mem-1', {
        limit: '20',
        minWeight: '0.5',
      });
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerBrainTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('knowledge_search')!;
      const result = await handler({ query: 'test', limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Connection refused');
    });
  });

  describe('input validation blocking', () => {
    it('returns blocked error for injection attempt', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const mw = noopMiddleware();
      mw.inputValidator.validate = () => ({
        valid: false,
        blocked: true,
        blockReason: 'SQL injection detected',
        warnings: [],
      });
      registerBrainTools(server, mockClient(), mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('knowledge_search')!;
      const result = await handler({ query: "'; DROP TABLE --", limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('SQL injection');
    });
  });
});
