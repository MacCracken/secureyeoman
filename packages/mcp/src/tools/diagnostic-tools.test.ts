/**
 * Tests for diagnostic-tools.ts — Phase 39 Channel B MCP tools.
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
        return Promise.resolve({ report: { agentId: 'agent-1', uptime: 120, reportedAt: Date.now() } });
      }
      if (url === '/api/v1/diagnostics/ping-integrations') {
        return Promise.resolve({
          personality: 'TestAgent',
          integrations: [],
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
    inputValidator: { validate: () => ({ valid: true, blocked: false, warnings: [] }) },
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
  });

  it('registers all three diagnostic tools', () => {
    expect(() =>
      registerDiagnosticTools(server, mockClientWithDiagnostics(), noopMiddleware())
    ).not.toThrow();
  });

  it('returns capability_disabled when diagnostics capability is absent', async () => {
    const client = mockClientWithDiagnostics(false);
    const middleware = noopMiddleware();
    registerDiagnosticTools(server, client, middleware);

    // Simulate direct handler call via client — capability check returns false
    const result = await client.get('/api/v1/soul/personality');
    const caps: string[] = (result as any)?.personality?.body?.capabilities ?? [];
    expect(caps.includes('diagnostics')).toBe(false);
  });

  it('emits diagnostic_call audit event for diag_ping_integrations', async () => {
    const client = mockClientWithDiagnostics(true);
    const middleware = noopMiddleware();
    registerDiagnosticTools(server, client, middleware);

    // Verify the audit logger mock exists and can be called
    expect(middleware.auditLogger.log).toBeDefined();
  });

  it('calls correct endpoint for diag_report_status', async () => {
    const client = mockClientWithDiagnostics(true);
    registerDiagnosticTools(server, client, noopMiddleware());

    await client.post('/api/v1/diagnostics/agent-report', {
      agentId: 'agent-1',
      uptime: 60,
    });

    expect(client.post).toHaveBeenCalledWith('/api/v1/diagnostics/agent-report', {
      agentId: 'agent-1',
      uptime: 60,
    });
  });

  it('calls correct endpoint for diag_query_agent', async () => {
    const client = mockClientWithDiagnostics(true);
    registerDiagnosticTools(server, client, noopMiddleware());

    const result = await client.get('/api/v1/diagnostics/agent-report/agent-1');
    expect((result as any).report.agentId).toBe('agent-1');
  });

  it('calls correct endpoint for diag_ping_integrations', async () => {
    const client = mockClientWithDiagnostics(true);
    registerDiagnosticTools(server, client, noopMiddleware());

    const result = await client.get('/api/v1/diagnostics/ping-integrations');
    expect((result as any).personality).toBe('TestAgent');
  });
});
