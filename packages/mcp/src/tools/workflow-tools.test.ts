/**
 * Workflow Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerWorkflowTools } from './workflow-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ workflows: [] }),
    post: vi.fn().mockResolvedValue({ runId: 'run-1' }),
    put: vi.fn().mockResolvedValue({}),
    delete: vi.fn().mockResolvedValue({ cancelled: true }),
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

describe('workflow-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 5 workflow tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerWorkflowTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('workflow_list', () => {
    it('calls GET /api/v1/workflows with limit', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_list')!;
      await handler({ limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/workflows', { limit: '10' });
    });
  });

  describe('workflow_get', () => {
    it('calls GET /api/v1/workflows/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_get')!;
      await handler({ id: 'wf-1' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/workflows/wf-1');
    });
  });

  describe('workflow_run', () => {
    it('calls POST /api/v1/workflows/:id/run with input', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_run')!;
      await handler({ id: 'wf-1', input: { key: 'value' }, triggeredBy: 'user-1' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/workflows/wf-1/run', {
        input: { key: 'value' },
        triggeredBy: 'user-1',
      });
    });

    it('defaults triggeredBy to mcp', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_run')!;
      await handler({ id: 'wf-1' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/workflows/wf-1/run', {
        input: undefined,
        triggeredBy: 'mcp',
      });
    });
  });

  describe('workflow_run_status', () => {
    it('calls GET /api/v1/workflows/runs/:runId', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_run_status')!;
      await handler({ runId: 'run-42' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/workflows/runs/run-42');
    });
  });

  describe('workflow_cancel', () => {
    it('calls DELETE /api/v1/workflows/runs/:runId', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_cancel')!;
      const result = await handler({ runId: 'run-42' });

      expect(client.delete).toHaveBeenCalledWith('/api/v1/workflows/runs/run-42');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.cancelled).toBe(true);
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Timeout')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerWorkflowTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('workflow_list')!;
      const result = await handler({ limit: 10 });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Timeout');
    });
  });
});
