/**
 * Execution Routes — REST API for sandboxed code execution.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { CodeExecutionManager, ApprovalRequiredError } from './manager.js';
import type { RuntimeType } from './types.js';

export function registerExecutionRoutes(
  app: FastifyInstance,
  deps: { executionManager: CodeExecutionManager },
): void {
  const { executionManager } = deps;

  // ── Execute code ──────────────────────────────────────────────

  app.post(
    '/api/v1/execution/run',
    async (
      request: FastifyRequest<{
        Body: {
          runtime: RuntimeType;
          code: string;
          sessionId?: string;
          timeout?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await executionManager.execute({
          runtime: request.body.runtime,
          code: request.body.code,
          sessionId: request.body.sessionId,
          timeout: request.body.timeout,
        });
        return reply.code(200).send(result);
      } catch (err) {
        if (err instanceof ApprovalRequiredError) {
          return reply.code(202).send({
            error: err.message,
            approvalId: err.approvalId,
            status: 'pending_approval',
          });
        }
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Execution failed',
        });
      }
    },
  );

  // ── Session routes ────────────────────────────────────────────

  app.get('/api/v1/execution/sessions', async () => {
    const sessions = await executionManager.listSessions();
    return { sessions };
  });

  app.get(
    '/api/v1/execution/sessions/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const session = await executionManager.getSession(request.params.id);
      if (!session) {
        return reply.code(404).send({ error: 'Session not found' });
      }
      return session;
    },
  );

  app.delete(
    '/api/v1/execution/sessions/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const terminated = await executionManager.terminateSession(
        request.params.id,
      );
      if (!terminated) {
        return reply.code(404).send({ error: 'Session not found or not active' });
      }
      return { success: true };
    },
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
      }>,
    ) => {
      const q = request.query;
      return executionManager.getExecutionHistory({
        sessionId: q.sessionId,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    },
  );

  // ── Approval routes ───────────────────────────────────────────

  app.post(
    '/api/v1/execution/approve/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const approval = await executionManager.approve(request.params.id);
      if (!approval) {
        return reply.code(404).send({ error: 'Pending approval not found' });
      }
      return { approval };
    },
  );

  app.delete(
    '/api/v1/execution/approve/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const approval = await executionManager.reject(request.params.id);
      if (!approval) {
        return reply.code(404).send({ error: 'Pending approval not found' });
      }
      return { approval };
    },
  );

  // ── Config route ──────────────────────────────────────────────

  app.get('/api/v1/execution/config', async () => {
    return { config: executionManager.getConfig() };
  });
}
