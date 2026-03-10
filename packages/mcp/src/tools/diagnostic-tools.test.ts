/**
 * Tests for diagnostic-tools.ts — Channel B MCP tools.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { registerDiagnosticTools } from './diagnostic-tools.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';

function mockClientWithDiagnostics(hasCap = true): CoreApiClient {
  return {
    get: vi.fn().mockImplementation((url: string) => {
      if (url === '/api/v1/soul/personality') {
        return Promise.resolve({
          personality: {
            name: 'TestAgent',
            body: { capabilities: hasCap ? ['diagnostics'] : [] },
          },
        });
      }
      if (url.startsWith('/api/v1/diagnostics/agent-report/')) {
        return Promise.resolve({
          report: { agentId: 'agent-1', uptime: 120, reportedAt: Date.now() },
        });
      }
      if (url === '/api/v1/diagnostics/ping-integrations') {
        return Promise.resolve({
          personality: 'TestAgent',
          integrations: [{ name: 'slack', status: 'ok' }],
          mcpServers: [],
          checkedAt: new Date().toISOString(),
        });
      }
      return Promise.resolve({});
    }),
    post: vi.fn().mockResolvedValue({ ok: true, reportedAt: Date.now() }),
    delete: vi.fn().mockResolvedValue({}),
    put: vi.fn().mockResolvedValue({}),
    healthCheck: vi.fn().mockResolvedValue(true),
  } as unknown as CoreApiClient;
}

function noopMiddleware(): ToolMiddleware {
  return {
    rateLimiter: { check: () => ({ allowed: true }), reset: vi.fn(), wrap: vi.fn() },
    inputValidator: {
      validate: () => ({ valid: true, blocked: false, warnings: [], injectionScore: 0 }),
    },
    auditLogger: {
      log: vi.fn().mockResolvedValue(undefined),
      wrap: (_t: string, _a: unknown, fn: () => unknown) => fn(),
    },
    secretRedactor: { redact: (v: unknown) => v },
  } as unknown as ToolMiddleware;
}

describe('diagnostic-tools', () => {
  let server: McpServer;

  beforeEach(() => {
    server = new McpServer({ name: 'test', version: '1.0.0' });
    vi.clearAllMocks();
  });

  it('registers all three diagnostic tools', () => {
    expect(() =>
      registerDiagnosticTools(server, mockClientWithDiagnostics(), noopMiddleware())
    ).not.toThrow();
  });

  describe('diag_report_status', () => {
    it('posts agent status when diagnostics capability is present', async () => {
      const client = mockClientWithDiagnostics(true);
      const mw = noopMiddleware();
      registerDiagnosticTools(server, client, mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_report_status')!;
      const result = await handler({
        agentId: 'agent-1',
        uptime: 60,
        taskCount: 3,
        notes: 'All good',
      });

      expect(result.isError).toBeFalsy();
      expect(client.post).toHaveBeenCalledWith('/api/v1/diagnostics/agent-report', {
        agentId: 'agent-1',
        uptime: 60,
        taskCount: 3,
        notes: 'All good',
      });
      expect(mw.auditLogger.log).toHaveBeenCalledWith(
        expect.objectContaining({ event: 'diagnostic_call' })
      );
    });

    it('returns capability_disabled when diagnostics not enabled', async () => {
      const client = mockClientWithDiagnostics(false);
      registerDiagnosticTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_report_status')!;
      const result = await handler({ agentId: 'agent-1', uptime: 60 });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('capability_disabled');
    });
  });

  describe('diag_query_agent', () => {
    it('queries agent status when diagnostics capability is present', async () => {
      const client = mockClientWithDiagnostics(true);
      const mw = noopMiddleware();
      registerDiagnosticTools(server, client, mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_query_agent')!;
      const result = await handler({ agentId: 'agent-1' });

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/diagnostics/agent-report/agent-1');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.report.agentId).toBe('agent-1');
    });

    it('returns capability_disabled when diagnostics not enabled', async () => {
      const client = mockClientWithDiagnostics(false);
      registerDiagnosticTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_query_agent')!;
      const result = await handler({ agentId: 'agent-1' });

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('capability_disabled');
    });
  });

  describe('diag_ping_integrations', () => {
    it('pings integrations when diagnostics capability is present', async () => {
      const client = mockClientWithDiagnostics(true);
      const mw = noopMiddleware();
      registerDiagnosticTools(server, client, mw);

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_ping_integrations')!;
      const result = await handler({});

      expect(result.isError).toBeFalsy();
      expect(client.get).toHaveBeenCalledWith('/api/v1/diagnostics/ping-integrations');
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.personality).toBe('TestAgent');
      expect(parsed.integrations).toHaveLength(1);
    });

    it('returns capability_disabled when diagnostics not enabled', async () => {
      const client = mockClientWithDiagnostics(false);
      registerDiagnosticTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_ping_integrations')!;
      const result = await handler({});

      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('capability_disabled');
    });
  });

  describe('error handling', () => {
    it('returns error when hasDiagnosticsCapability call fails', async () => {
      const client = mockClientWithDiagnostics(true);
      // Override to throw on personality fetch
      (client.get as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Timeout'));
      registerDiagnosticTools(server, client, noopMiddleware());

      const { globalToolRegistry } = await import('./tool-utils.js');
      const handler = globalToolRegistry.get('diag_report_status')!;
      const result = await handler({ agentId: 'agent-1', uptime: 60 });

      // hasDiagnosticsCapability catches errors and returns false
      const parsed = JSON.parse(result.content[0].text);
      expect(parsed.error).toBe('capability_disabled');
    });
  });
});
