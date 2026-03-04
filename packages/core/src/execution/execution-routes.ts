/**
 * Execution Routes — REST API for sandboxed code execution.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CodeExecutionManager, ApprovalRequiredError } from './manager.js';
import type { RuntimeType } from './types.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';

export function registerExecutionRoutes(
  app: FastifyInstance,
  opts: { executionManager: CodeExecutionManager }
): void {
  const { executionManager } = opts;

  // ── Execute code ──────────────────────────────────────────────

  app.post(
    '/api/v1/execution/run',
    {
      schema: {
        body: {
          type: 'object',
          required: ['runtime', 'code'],
          additionalProperties: false,
          properties: {
            runtime: { type: 'string', enum: ['node', 'python', 'shell'] },
            code: { type: 'string', minLength: 1 },
            sessionId: { type: 'string' },
            timeout: { type: 'number', minimum: 100, maximum: 300000 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: {
          runtime: RuntimeType;
          code: string;
          sessionId?: string;
          timeout?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      try {
        const result = await executionManager.execute({
          runtime: request.body.runtime,
          code: request.body.code,
          sessionId: request.body.sessionId,
          timeout: request.body.timeout,
        });
        return reply.code(202).send(result);
      } catch (err) {
        if (err instanceof ApprovalRequiredError) {
          return reply.code(202).send({
            error: err.message,
            approvalId: err.approvalId,
            status: 'pending_approval',
          });
        }
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── Session routes ────────────────────────────────────────────

  app.get(
    '/api/v1/execution/sessions',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      return executionManager.listSessions({ limit, offset });
    }
  );

  app.get(
    '/api/v1/execution/sessions/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const session = await executionManager.getSession(request.params.id);
      if (!session) {
        return sendError(reply, 404, 'Session not found');
      }
      return session;
    }
  );

  app.delete(
    '/api/v1/execution/sessions/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const terminated = await executionManager.terminateSession(request.params.id);
      if (!terminated) {
        return sendError(reply, 404, 'Session not found or not active');
      }
      return reply.code(204).send();
    }
  );

  // ── Execution history ─────────────────────────────────────────

  app.get(
    '/api/v1/execution/history',
    async (
      request: FastifyRequest<{
        Querystring: {
          sessionId?: string;
          limit?: string;
          offset?: string;
        };
      }>
    ) => {
      const q = request.query;
      const { limit, offset } = parsePagination(q);
      return executionManager.getExecutionHistory({
        sessionId: q.sessionId,
        limit,
        offset,
      });
    }
  );

  // ── Approval routes ───────────────────────────────────────────

  app.post(
    '/api/v1/execution/approve/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const approval = await executionManager.approve(request.params.id);
      if (!approval) {
        return sendError(reply, 404, 'Pending approval not found');
      }
      return { approval };
    }
  );

  app.delete(
    '/api/v1/execution/approve/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const approval = await executionManager.reject(request.params.id);
      if (!approval) {
        return sendError(reply, 404, 'Pending approval not found');
      }
      return reply.code(204).send();
    }
  );

  // ── Config route ──────────────────────────────────────────────

  app.get('/api/v1/execution/config', async () => {
    return { config: executionManager.getConfig() };
  });
}
