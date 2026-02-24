/**
 * Diagnostic Tools — two-channel agent diagnostics.
 *
 * Channel B (MCP): sub-agent/external reporting tools.
 * Channel A (prompt injection) lives in packages/core/src/soul/manager.ts.
 *
 * All three tools check that 'diagnostics' is in the active personality's
 * body.capabilities[] before executing — same guard pattern as other capability-
 * gated tools. diag_report_status and diag_query_agent additionally require
 * allowSubAgents to be true in SecurityConfig.
 */

import { z } from 'zod';
import type { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { CoreApiClient } from '../core-client.js';
import type { ToolMiddleware } from './index.js';
import { wrapToolHandler } from './tool-utils.js';

const CAPABILITY_DISABLED = {
  content: [
    {
      type: 'text' as const,
      text: JSON.stringify({
        error: 'capability_disabled',
        reason: "'diagnostics' capability not enabled on active personality",
      }),
    },
  ],
};

async function hasDiagnosticsCapability(client: CoreApiClient): Promise<boolean> {
  try {
    const result = await client.get('/api/v1/soul/personality');
    const caps: string[] = (result as any)?.personality?.body?.capabilities ?? [];
    return caps.includes('diagnostics');
  } catch {
    return false;
  }
}

export function registerDiagnosticTools(
  server: McpServer,
  client: CoreApiClient,
  middleware: ToolMiddleware
): void {
  // ── diag_report_status ────────────────────────────────────────────────────
  // Sub-agent pushes a structured health report to the orchestrator.
  // Requires 'diagnostics' capability AND allowSubAgents.

  server.registerTool(
    'diag_report_status',
    {
      description:
        "Push this sub-agent's health status to the orchestrator. Call this at the start of a delegated task and after significant state changes so the orchestrator can track your health.",
      inputSchema: {
        agentId: z.string().describe("This sub-agent's personality ID"),
        uptime: z.number().describe('Process uptime in seconds'),
        taskCount: z.number().optional().describe('Number of active tasks'),
        lastError: z.string().optional().describe('Most recent error message, if any'),
        memoryRssMb: z.number().optional().describe('Process memory RSS in MB'),
        notes: z.string().max(500).optional().describe('Free-text status notes'),
      },
    },
    wrapToolHandler('diag_report_status', middleware, async (args) => {
      if (!(await hasDiagnosticsCapability(client))) return CAPABILITY_DISABLED;

      await middleware.auditLogger.log({
        event: 'diagnostic_call',
        level: 'info',
        message: `Sub-agent ${args.agentId} reported status`,
        metadata: { tool: 'diag_report_status', agentId: args.agentId, direction: 'report' },
      });

      const result = await client.post('/api/v1/diagnostics/agent-report', args);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── diag_query_agent ──────────────────────────────────────────────────────
  // Orchestrator queries the most recent status report from a spawned agent.
  // Requires 'diagnostics' capability AND allowSubAgents.

  server.registerTool(
    'diag_query_agent',
    {
      description:
        "Retrieve the most recent health report submitted by a spawned sub-agent. Returns the report or a 404 if the agent has not reported yet.",
      inputSchema: {
        agentId: z.string().describe('Personality ID of the sub-agent to query'),
      },
    },
    wrapToolHandler('diag_query_agent', middleware, async (args) => {
      if (!(await hasDiagnosticsCapability(client))) return CAPABILITY_DISABLED;

      await middleware.auditLogger.log({
        event: 'diagnostic_call',
        level: 'info',
        message: `Querying agent status for ${args.agentId}`,
        metadata: { tool: 'diag_query_agent', agentId: args.agentId, direction: 'query' },
      });

      const result = await client.get(`/api/v1/diagnostics/agent-report/${args.agentId}`);
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );

  // ── diag_ping_integrations ────────────────────────────────────────────────
  // Ping all MCP servers and integrations connected to the active personality.

  server.registerTool(
    'diag_ping_integrations',
    {
      description:
        'Ping all MCP servers and integrations connected to the active personality. Returns reachable/unreachable status with latency per connection. Useful before starting a long task that depends on external tools.',
      inputSchema: {},
    },
    wrapToolHandler('diag_ping_integrations', middleware, async () => {
      if (!(await hasDiagnosticsCapability(client))) return CAPABILITY_DISABLED;

      await middleware.auditLogger.log({
        event: 'diagnostic_call',
        level: 'info',
        message: 'Integration ping executed',
        metadata: { tool: 'diag_ping_integrations', direction: 'ping' },
      });

      const result = await client.get('/api/v1/diagnostics/ping-integrations');
      return { content: [{ type: 'text' as const, text: JSON.stringify(result, null, 2) }] };
    })
  );
}
