/**
 * Eval Tools — unit tests
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerEvalTools } from './eval-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClient(overrides: Partial<CoreApiClient> = {}): CoreApiClient {
  return {
    get: vi.fn().mockResolvedValue({ scenarios: [] }),
    post: vi.fn().mockResolvedValue({ id: 'created' }),
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

describe('eval-tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('registers all 8 eval tools without throwing', () => {
    const server = new McpServer({ name: 'test', version: '1.0.0' });
    expect(() => registerEvalTools(server, mockClient(), noopMiddleware())).not.toThrow();
  });

  describe('eval_list_scenarios', () => {
    it('calls GET /api/v1/eval/scenarios with query params', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_list_scenarios')!;
      await handler({ category: 'security', limit: 10 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/eval/scenarios', {
        category: 'security',
        limit: '10',
      });
    });

    it('calls with empty query when no args', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_list_scenarios')!;
      await handler({});

      expect(client.get).toHaveBeenCalledWith('/api/v1/eval/scenarios', {});
    });
  });

  describe('eval_create_scenario', () => {
    it('calls POST /api/v1/eval/scenarios with scenario data', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_create_scenario')!;
      const args = {
        id: 'scen-1',
        name: 'Test Scenario',
        input: 'Hello agent',
        category: 'security',
      };
      await handler(args);

      expect(client.post).toHaveBeenCalledWith('/api/v1/eval/scenarios', args);
    });
  });

  describe('eval_run_scenario', () => {
    it('calls POST /api/v1/eval/scenarios/:id/run', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_run_scenario')!;
      await handler({ scenarioId: 'scen-1' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/eval/scenarios/scen-1/run', {});
    });
  });

  describe('eval_list_suites', () => {
    it('calls GET /api/v1/eval/suites with query params', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_list_suites')!;
      await handler({ limit: 5 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/eval/suites', { limit: '5' });
    });
  });

  describe('eval_create_suite', () => {
    it('calls POST /api/v1/eval/suites with suite data', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_create_suite')!;
      const args = {
        id: 'suite-1',
        name: 'Security Suite',
        scenarioIds: ['scen-1', 'scen-2'],
        concurrency: 2,
      };
      await handler(args);

      expect(client.post).toHaveBeenCalledWith('/api/v1/eval/suites', args);
    });
  });

  describe('eval_run_suite', () => {
    it('calls POST /api/v1/eval/suites/:id/run', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_run_suite')!;
      await handler({ suiteId: 'suite-1' });

      expect(client.post).toHaveBeenCalledWith('/api/v1/eval/suites/suite-1/run', {});
    });
  });

  describe('eval_list_runs', () => {
    it('calls GET /api/v1/eval/runs with query params', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_list_runs')!;
      await handler({ suiteId: 'suite-1', limit: 20 });

      expect(client.get).toHaveBeenCalledWith('/api/v1/eval/runs', {
        suiteId: 'suite-1',
        limit: '20',
      });
    });
  });

  describe('eval_get_run', () => {
    it('calls GET /api/v1/eval/runs/:id', async () => {
      const client = mockClient();
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_get_run')!;
      await handler({ runId: 'run-42' });

      expect(client.get).toHaveBeenCalledWith('/api/v1/eval/runs/run-42', undefined);
    });
  });

  describe('error handling', () => {
    it('returns error when API call fails', async () => {
      const client = mockClient({
        get: vi.fn().mockRejectedValue(new Error('Connection refused')),
      });
      const server = new McpServer({ name: 'test', version: '1.0.0' });
      registerEvalTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('eval_list_scenarios')!;
      const result = await handler({ category: 'test' });

      expect(result.isError).toBe(true);
      expect(result.content[0].text).toContain('Connection refused');
    });
  });
});
