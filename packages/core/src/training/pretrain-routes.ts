/**
 * Pre-Training Routes — REST API for pre-training job management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PretrainManager } from './pretrain-manager.js';
import type { CorpusLoader } from './corpus-loader.js';
import { sendError } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';

export interface PretrainRouteOptions {
  pretrainManager: PretrainManager;
  corpusLoader: CorpusLoader;
  secureYeoman?: SecureYeoman;
}

export function registerPretrainRoutes(app: FastifyInstance, opts: PretrainRouteOptions): void {
  const { pretrainManager, corpusLoader, secureYeoman } = opts;
  const featureGuardOpts = licenseGuard('adaptive_learning', secureYeoman);

  // ── Jobs ──────────────────────────────────────────────────────────

  app.get(
    '/api/v1/training/pretrain/jobs',
    async (req: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) => {
      const jobs = await pretrainManager.listJobs(req.query.status);
      return reply.send({ items: jobs, total: jobs.length });
    }
  );

  app.get(
    '/api/v1/training/pretrain/jobs/:jobId',
    async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const job = await pretrainManager.getJob(req.params.jobId);
      if (!job) return sendError(reply, 404, 'Job not found');
      return reply.send(job);
    }
  );

  app.post(
    '/api/v1/training/pretrain/jobs',
    featureGuardOpts,
    async (req: FastifyRequest, reply: FastifyReply) => {
      try {
        const job = await pretrainManager.createJob(req.body as any);
        return reply.code(201).send(job);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  app.post(
    '/api/v1/training/pretrain/jobs/:jobId/cancel',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const ok = await pretrainManager.cancelJob(req.params.jobId);
      if (!ok) return sendError(reply, 404, 'Job not found or not cancellable');
      return reply.send({ ok: true });
    }
  );

  app.delete(
    '/api/v1/training/pretrain/jobs/:jobId',
    featureGuardOpts,
    async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      const ok = await pretrainManager.deleteJob(req.params.jobId);
      if (!ok) return sendError(reply, 404, 'Job not found');
      return reply.send({ ok: true });
    }
  );

  app.post(
    '/api/v1/training/pretrain/jobs/:jobId/progress',
    async (req: FastifyRequest<{ Params: { jobId: string } }>, reply: FastifyReply) => {
      try {
        const job = await pretrainManager.updateProgress(req.params.jobId, req.body as any);
        if (!job) return sendError(reply, 404, 'Job not found');
        return reply.send(job);
      } catch (err) {
        return sendError(reply, 400, (err as Error).message);
      }
    }
  );

  // ── Corpus ────────────────────────────────────────────────────────

  app.get('/api/v1/training/pretrain/corpus', async (_req: FastifyRequest, reply: FastifyReply) => {
    const sources = corpusLoader.listSources();
    return reply.send({ items: sources, total: sources.length });
  });

  app.post(
    '/api/v1/training/pretrain/corpus/validate',
    async (req: FastifyRequest, reply: FastifyReply) => {
      const body = req.body as { path: string; format?: string; textField?: string };
      if (!body.path) return sendError(reply, 400, 'path is required');
      const result = corpusLoader.validateSource(body.path, body.format as any, body.textField);
      return reply.send(result);
    }
  );

  app.get(
    '/api/v1/training/pretrain/corpus/stats',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      return reply.send(corpusLoader.getStats());
    }
  );
}
