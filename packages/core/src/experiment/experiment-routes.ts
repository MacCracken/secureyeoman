/**
 * Experiment Routes — REST API for A/B testing
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ExperimentManager } from './manager.js';

export interface ExperimentRoutesOptions {
  experimentManager: ExperimentManager;
}

function errorMessage(err: unknown): string { return err instanceof Error ? err.message : 'Unknown error'; }

export function registerExperimentRoutes(app: FastifyInstance, opts: ExperimentRoutesOptions): void {
  const { experimentManager } = opts;

  app.get('/api/v1/experiments', async () => { const experiments = experimentManager.list(); return { experiments, total: experiments.length }; });

  app.post('/api/v1/experiments', async (request: FastifyRequest<{ Body: { name: string; description?: string; variants: unknown[] } }>, reply: FastifyReply) => {
    try { const exp = experimentManager.create(request.body as any); return reply.code(201).send({ experiment: exp }); }
    catch (err) { return reply.code(400).send({ error: errorMessage(err) }); }
  });

  app.get('/api/v1/experiments/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const exp = experimentManager.get(request.params.id);
    if (!exp) return reply.code(404).send({ error: 'Experiment not found' });
    return { experiment: exp };
  });

  app.post('/api/v1/experiments/:id/start', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const exp = experimentManager.start(request.params.id);
    if (!exp) return reply.code(404).send({ error: 'Experiment not found' });
    return { experiment: exp };
  });

  app.post('/api/v1/experiments/:id/stop', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    const exp = experimentManager.stop(request.params.id);
    if (!exp) return reply.code(404).send({ error: 'Experiment not found' });
    return { experiment: exp };
  });

  app.delete('/api/v1/experiments/:id', async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
    if (!experimentManager.delete(request.params.id)) return reply.code(404).send({ error: 'Experiment not found' });
    return { message: 'Experiment deleted' };
  });
}
