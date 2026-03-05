/**
 * Continual Learning Routes — dataset refresh, drift detection, online updates.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError, toErrorMessage } from '../utils/errors.js';

export interface ContinualLearningRoutesOptions {
  secureYeoman: SecureYeoman;
}

export function registerContinualLearningRoutes(
  app: FastifyInstance,
  opts: ContinualLearningRoutesOptions
): void {
  const { secureYeoman } = opts;

  // ── Dataset Refresh ──────────────────────────────────────────────────

  app.post(
    '/api/v1/training/dataset-refresh/jobs',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          targetDatasetId?: string;
          curationRules: Record<string, unknown>;
          scheduleCron?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const manager = secureYeoman.getDatasetRefreshManager?.();
      if (!manager) return sendError(reply, 503, 'Dataset refresh manager not available');

      const body = request.body;
      if (!body?.name?.trim()) return sendError(reply, 400, 'name is required');
      if (!body.curationRules) return sendError(reply, 400, 'curationRules is required');

      try {
        const job = await manager.create(body);
        return reply.code(201).send(job);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/training/dataset-refresh/jobs',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const manager = secureYeoman.getDatasetRefreshManager?.();
      if (!manager) return sendError(reply, 503, 'Dataset refresh manager not available');
      return manager.list();
    }
  );

  app.post(
    '/api/v1/training/dataset-refresh/jobs/:id/run',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getDatasetRefreshManager?.();
      if (!manager) return sendError(reply, 503, 'Dataset refresh manager not available');

      try {
        const result = await manager.runRefresh(request.params.id);
        return result;
      } catch (err) {
        return sendError(reply, 404, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/training/dataset-refresh/jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getDatasetRefreshManager?.();
      if (!manager) return sendError(reply, 503, 'Dataset refresh manager not available');

      const deleted = await manager.delete(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Refresh job not found');
      return { ok: true };
    }
  );

  // ── Drift Detection ──────────────────────────────────────────────────

  app.post(
    '/api/v1/training/drift/baselines',
    async (
      request: FastifyRequest<{
        Body: { personalityId: string; threshold?: number };
      }>,
      reply: FastifyReply
    ) => {
      const manager = secureYeoman.getDriftDetectionManager?.();
      if (!manager) return sendError(reply, 503, 'Drift detection manager not available');

      const body = request.body;
      if (!body?.personalityId?.trim()) return sendError(reply, 400, 'personalityId is required');

      try {
        const baseline = await manager.computeBaseline(body.personalityId, body.threshold);
        return reply.code(201).send(baseline);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/training/drift/baselines',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const manager = secureYeoman.getDriftDetectionManager?.();
      if (!manager) return sendError(reply, 503, 'Drift detection manager not available');
      return manager.listBaselines();
    }
  );

  app.get(
    '/api/v1/training/drift/baselines/:id/snapshots',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getDriftDetectionManager?.();
      if (!manager) return sendError(reply, 503, 'Drift detection manager not available');
      return manager.getSnapshots(request.params.id);
    }
  );

  app.post(
    '/api/v1/training/drift/check',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const manager = secureYeoman.getDriftDetectionManager?.();
      if (!manager) return sendError(reply, 503, 'Drift detection manager not available');

      try {
        const snapshots = await manager.checkAllDrift();
        return { snapshots };
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── Online Updates ───────────────────────────────────────────────────

  app.post(
    '/api/v1/training/online-updates',
    async (
      request: FastifyRequest<{
        Body: {
          personalityId: string;
          adapterName: string;
          conversationIds: string[];
          gradientAccumulationSteps?: number;
          replayBufferSize?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const manager = secureYeoman.getOnlineUpdateManager?.();
      if (!manager) return sendError(reply, 503, 'Online update manager not available');

      const body = request.body;
      if (!body?.personalityId?.trim()) return sendError(reply, 400, 'personalityId is required');
      if (!body?.adapterName?.trim()) return sendError(reply, 400, 'adapterName is required');
      if (!body?.conversationIds?.length)
        return sendError(reply, 400, 'conversationIds is required');

      try {
        const job = await manager.create(body);
        // Start in background
        manager.startJob(job.id).catch(() => {
          /* error recorded in DB */
        });
        return reply.code(202).send(job);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get(
    '/api/v1/training/online-updates',
    async (_request: FastifyRequest, reply: FastifyReply) => {
      const manager = secureYeoman.getOnlineUpdateManager?.();
      if (!manager) return sendError(reply, 503, 'Online update manager not available');
      return manager.list();
    }
  );

  app.get(
    '/api/v1/training/online-updates/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getOnlineUpdateManager?.();
      if (!manager) return sendError(reply, 503, 'Online update manager not available');

      const job = await manager.get(request.params.id);
      if (!job) return sendError(reply, 404, 'Online update job not found');
      return job;
    }
  );
}
