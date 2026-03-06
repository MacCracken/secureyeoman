/**
 * Task Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerTaskTools } from './task-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ tasks: [] }),
    post: vi.fn().mockResolvedValue({ id: 'task-1', name: 'New Task' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({ cancelled: true }),
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

describe('task-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 4 task tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerTaskTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('task_create', () => {
    it('calls POST /api/v1/tasks with args', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTaskTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_create')!;
      const result = await handler({ name: 'My Task', type: 'build', description: 'Build it' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/tasks', {
        name: 'My Task',
        type: 'build',
        description: 'Build it',
      });
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.id).toBe('task-1');
    });
  });

  describe('task_list', () => {
    it('calls GET /api/v1/tasks with filters', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTaskTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_list')!;
      await handler({ status: 'running', type: 'build', limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/tasks', {
        status: 'running',
        type: 'build',
        limit: '10',
      });
    });

    it('sends only limit when no filters provided', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTaskTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_list')!;
      await handler({ limit: 20 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/tasks', { limit: '20' });
    });
  });

  describe('task_get', () => {
    it('calls GET /api/v1/tasks/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTaskTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_get')!;
      await handler({ id: 'task-42' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/tasks/task-42');
    });
  });

  describe('task_cancel', () => {
    it('calls DELETE /api/v1/tasks/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTaskTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_cancel')!;
      const result = await handler({ id: 'task-42' });

      expect(client.delete).toHaveBeenCalledWith('/api/v1/tasks/task-42');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.cancelled).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns error when task_create API fails', async () => {
      const client = mockClient({
        post: vi.fn().mockRejectedValue(new Error('Validation failed')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerTaskTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_create')!;
      const result = await handler({ name: 'Bad', type: 'x' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Validation failed');
    });
  });

  describe('rate limiting', () => {
    it('returns rate limit error when not allowed', async () => {
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      const mw = noopMiddleware();
      mw.rateLimiter.check = () => ({ allowed: false, retryAfterMs: 500 });
      registerTaskTools(server, mockClient(), mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('task_create')!;
      const result = await handler({ name: 'Test', type: 'build' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Rate limit');
    });
  });
});
