/**
 * Diagnostic Routes — Phase 39 Channel B endpoints.
 *
 * Provides three endpoints:
 *   POST /api/v1/diagnostics/agent-report         — sub-agent stores its status
 *   GET  /api/v1/diagnostics/agent-report/:agentId — orchestrator reads a report
 *   GET  /api/v1/diagnostics/ping-integrations     — ping active personality's connections
 *
 * Agent reports are ephemeral (in-memory Map). No DB persistence is needed —
 * reports are live status data, not audit records.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { IntegrationManager } from '../integrations/manager.js';
import type { SoulManager } from '../soul/manager.js';
import type { McpClientManager } from '../mcp/client.js';
import { sendError } from '../utils/errors.js';

interface AgentReport {
  agentId: string;
  uptime: number;
  taskCount?: number;
  lastError?: string;
  memoryRssMb?: number;
  notes?: string;
  reportedAt: number;
}

// Ephemeral store — one report per agent ID, replaced on each call.
const agentReports = new Map<string, AgentReport>();

// Evict stale reports (no heartbeat for > 10 minutes) every 5 minutes.
// .unref() ensures this timer does not prevent process exit.
const AGENT_REPORT_TTL_MS = 10 * 60 * 1000;
const agentReportEvictTimer = setInterval(
  () => {
    const cutoff = Date.now() - AGENT_REPORT_TTL_MS;
    for (const [id, report] of agentReports) {
      if (report.reportedAt < cutoff) agentReports.delete(id);
    }
  },
  5 * 60 * 1000
);
agentReportEvictTimer.unref();

export interface DiagnosticRoutesOptions {
  integrationManager: IntegrationManager;
  soulManager: SoulManager;
  mcpClientManager?: McpClientManager;
}

export function registerDiagnosticRoutes(
  app: FastifyInstance,
  opts: DiagnosticRoutesOptions
): void {
  const { integrationManager, soulManager, mcpClientManager } = opts;

  // ── POST /api/v1/diagnostics/agent-report ─────────────────────────────────

  app.post(
    '/api/v1/diagnostics/agent-report',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Partial<AgentReport>;
      if (!body?.agentId) {
        return sendError(reply, 400, 'agentId is required');
      }
      const report: AgentReport = {
        agentId: body.agentId,
        uptime: body.uptime ?? 0,
        taskCount: body.taskCount,
        lastError: body.lastError,
        memoryRssMb: body.memoryRssMb,
        notes: body.notes,
        reportedAt: Date.now(),
      };
      agentReports.set(report.agentId, report);
      return { ok: true, reportedAt: report.reportedAt };
    }
  );

  // ── GET /api/v1/diagnostics/agent-report/:agentId ─────────────────────────

  app.get(
    '/api/v1/diagnostics/agent-report/:agentId',
    async (request: FastifyRequest<{ Params: { agentId: string } }>, reply: FastifyReply) => {
      const report = agentReports.get(request.params.agentId);
      if (!report) {
        return sendError(reply, 404, 'No report found for agent');
      }
      return { report };
    }
  );

  // ── GET /api/v1/diagnostics/ping-integrations ─────────────────────────────

  app.get(
    '/api/v1/diagnostics/ping-integrations',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const personality = await soulManager.getActivePersonality();
        const selectedIntegrations = personality?.body?.selectedIntegrations ?? [];
        const selectedServers = personality?.body?.selectedServers ?? [];

        const integrationResults = selectedIntegrations.map((id) => ({
          id,
          type: 'integration' as const,
          running: integrationManager.isRunning(id),
          healthy: integrationManager.isHealthy(id),
        }));

        // Ping MCP servers: check tool count as connectivity proxy, then HTTP health check
        const mcpServerResults = await Promise.all(
          selectedServers.map(async (serverId) => {
            const tools = mcpClientManager
              ? await mcpClientManager.discoverTools(serverId).catch(() => [])
              : [];
            // Attempt health check via the server's stored URL
            let reachable = false;
            let url: string | undefined;
            let latencyMs: number | undefined;
            if (mcpClientManager) {
              try {
                const serverInfo = await (mcpClientManager as any).storage?.getServer?.(serverId);
                url = serverInfo?.url;
                if (url) {
                  const start = Date.now();
                  const res = await fetch(`${url}/health`, { signal: AbortSignal.timeout(3000) });
                  latencyMs = Date.now() - start;
                  reachable = res.ok;
                }
              } catch {
                /* unreachable */
              }
            }
            return {
              id: serverId,
              type: 'mcp_server' as const,
              toolCount: tools.length,
              reachable,
              ...(url ? { url } : {}),
              ...(latencyMs !== undefined ? { latencyMs } : {}),
            };
          })
        );

        return {
          personality: personality?.name ?? 'unknown',
          integrations: integrationResults,
          mcpServers: mcpServerResults,
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return sendError(reply, 500, 'Failed to ping integrations');
      }
    }
  );
}
