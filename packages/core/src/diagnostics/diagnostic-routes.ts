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

export interface DiagnosticRoutesOptions {
  integrationManager: IntegrationManager;
  soulManager: SoulManager;
}

export function registerDiagnosticRoutes(
  app: FastifyInstance,
  opts: DiagnosticRoutesOptions
): void {
  const { integrationManager, soulManager } = opts;

  // ── POST /api/v1/diagnostics/agent-report ─────────────────────────────────

  app.post(
    '/api/v1/diagnostics/agent-report',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as Partial<AgentReport>;
      if (!body?.agentId) {
        return reply.code(400).send({ error: 'agentId is required' });
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
    async (
      request: FastifyRequest<{ Params: { agentId: string } }>,
      reply: FastifyReply
    ) => {
      const report = agentReports.get(request.params.agentId);
      if (!report) {
        return reply.code(404).send({
          error: 'No report found for agent',
          agentId: request.params.agentId,
        });
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

        return {
          personality: personality?.name ?? 'unknown',
          integrations: integrationResults,
          mcpServers: selectedServers.map((s) => ({ id: s, type: 'mcp_server' as const })),
          checkedAt: new Date().toISOString(),
        };
      } catch (err) {
        return reply
          .code(500)
          .send({ error: 'Failed to ping integrations', details: String(err) });
      }
    }
  );
}
