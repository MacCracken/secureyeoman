import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerSoulTools } from './soul-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ personality: { id: '1', name: 'Default' } }),
    post: vi.fn().mockResolvedValue({ message: 'Activated' }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
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

describe('soul-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 4 soul tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerSoulTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('personality_get', () => {
    it('calls GET /api/v1/soul/personality', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('personality_get')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/personality');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.personality.id).toBe('1');
    });
  });

  describe('personality_switch', () => {
    it('calls POST /api/v1/soul/personalities/:id/activate', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('personality_switch')!;
      const result = await handler({ id: 'personality-2' });

      expect(result.isError).toBeFalsy();
      expect(client.post).toHaveBeenCalledWith('/api/v1/soul/personalities/personality-2/activate');
    });
  });

  describe('skill_list', () => {
    it('calls GET /api/v1/soul/skills with no query when no status', async () => {
      const client = mockClient({
        get: vi.fn().mockResolvedValue({ skills: [{ id: 's-1', name: 'analyze' }] }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('skill_list')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/skills', {});
    });

    it('includes status filter when provided', async () => {
      const client = mockClient({
        get: vi.fn().mockResolvedValue({ skills: [] }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('skill_list')!;
      await handler({ status: 'active' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/soul/skills', { status: 'active' });
    });
  });

  describe('skill_execute', () => {
    it('calls POST /api/v1/soul/skills/:id/execute', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({ output: 'done' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('skill_execute')!;
      const result = await handler({ skillId: 's-1', input: { data: 'test' } });

      expect(result.isError).toBeFalsy();
      expect(client.post).toHaveBeenCalledWith('/api/v1/soul/skills/s-1/execute', {
        input: { data: 'test' },
      });
    });

    it('passes empty input when not provided', async () => {
      const client = mockClient({
        post: vi.fn().mockResolvedValue({ output: 'done' }),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('skill_execute')!;
      await handler({ skillId: 's-1' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/soul/skills/s-1/execute', {
        input: {},
      });
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Not Found')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerSoulTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('personality_get')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Not Found');
    });
  });

  describe('rate limiting', () => {
    it('returns error when rate limited', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const mw = noopMiddleware();
      mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 200 });
      registerSoulTools(server, mockClient(), mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('personality_get')!;
      const result = await handler({});

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit');
    });
  });
});
