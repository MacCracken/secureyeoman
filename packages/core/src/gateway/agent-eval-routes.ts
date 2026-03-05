/**
 * Agent Eval Routes — REST endpoints for the evaluation harness.
 *
 * All routes are under /api/v1/eval/*.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { EvalScenarioSchema, EvalSuiteSchema } from '@secureyeoman/shared';
import type { EvalManager } from '../agent-eval/eval-manager.js';
import { sendError } from './error-utils.js';

export interface AgentEvalRoutesOptions {
  evalManager: EvalManager;
}

export function registerAgentEvalRoutes(
  app: FastifyInstance,
  opts: AgentEvalRoutesOptions
): void {
  const { evalManager } = opts;

  // ── Scenarios ───────────────────────────────────────────

  app.get(
    '/api/v1/eval/scenarios',
    async (
      request: FastifyRequest<{ Querystring: { category?: string; limit?: string; offset?: string } }>,
      _reply: FastifyReply
    ) => {
      const { category, limit, offset } = request.query;
      return evalManager.listScenarios({
        category,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
    }
  );

  app.get(
    '/api/v1/eval/scenarios/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const scenario = await evalManager.getScenario(request.params.id);
      if (!scenario) return sendError(reply, 404, 'Scenario not found');
      return scenario;
    }
  );

  app.post(
    '/api/v1/eval/scenarios',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'name', 'input'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            input: { type: 'string', minLength: 1 },
          },
        },
      },
    } as Record<string, unknown>,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const parsed = EvalScenarioSchema.parse(request.body);
        const scenario = await evalManager.createScenario(parsed);
        reply.code(201);
        return scenario;
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Invalid scenario');
      }
    }
  );

  app.put(
    '/api/v1/eval/scenarios/:id',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: Record<string, unknown> }>,
      reply: FastifyReply
    ) => {
      const updated = await evalManager.updateScenario(request.params.id, request.body);
      if (!updated) return sendError(reply, 404, 'Scenario not found');
      return updated;
    }
  );

  app.delete(
    '/api/v1/eval/scenarios/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const deleted = await evalManager.deleteScenario(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Scenario not found');
      reply.code(204);
      return;
    }
  );

  // ── Suites ──────────────────────────────────────────────

  app.get(
    '/api/v1/eval/suites',
    async (
      request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>,
      _reply: FastifyReply
    ) => {
      const { limit, offset } = request.query;
      return evalManager.listSuites({
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
    }
  );

  app.get(
    '/api/v1/eval/suites/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const suite = await evalManager.getSuite(request.params.id);
      if (!suite) return sendError(reply, 404, 'Suite not found');
      return suite;
    }
  );

  app.post(
    '/api/v1/eval/suites',
    {
      schema: {
        body: {
          type: 'object',
          required: ['id', 'name', 'scenarioIds'],
          properties: {
            id: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
          },
        },
      },
    } as Record<string, unknown>,
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const parsed = EvalSuiteSchema.parse(request.body);
        const suite = await evalManager.createSuite(parsed);
        reply.code(201);
        return suite;
      } catch (err) {
        return sendError(reply, 400, err instanceof Error ? err.message : 'Invalid suite');
      }
    }
  );

  app.delete(
    '/api/v1/eval/suites/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const deleted = await evalManager.deleteSuite(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Suite not found');
      reply.code(204);
      return;
    }
  );

  // ── Execution ─────────────────────────────────────────────

  app.post(
    '/api/v1/eval/suites/:id/run',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await evalManager.runSuite(request.params.id);
        return result;
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return sendError(reply, 404, err.message);
        }
        return sendError(reply, 500, err instanceof Error ? err.message : 'Suite run failed');
      }
    }
  );

  app.post(
    '/api/v1/eval/scenarios/:id/run',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await evalManager.runSingleScenario(request.params.id);
        return result;
      } catch (err) {
        if (err instanceof Error && err.message.includes('not found')) {
          return sendError(reply, 404, err.message);
        }
        return sendError(reply, 500, err instanceof Error ? err.message : 'Scenario run failed');
      }
    }
  );

  // ── Run History ───────────────────────────────────────────

  app.get(
    '/api/v1/eval/runs',
    async (
      request: FastifyRequest<{ Querystring: { suiteId?: string; limit?: string; offset?: string } }>,
      _reply: FastifyReply
    ) => {
      const { suiteId, limit, offset } = request.query;
      return evalManager.listSuiteRuns({
        suiteId,
        limit: limit ? parseInt(limit, 10) : undefined,
        offset: offset ? parseInt(offset, 10) : undefined,
      });
    }
  );

  app.get(
    '/api/v1/eval/runs/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const run = await evalManager.getSuiteRun(request.params.id);
      if (!run) return sendError(reply, 404, 'Suite run not found');
      return run;
    }
  );
}
