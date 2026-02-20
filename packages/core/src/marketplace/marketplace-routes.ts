/**
 * Marketplace Routes — REST API for skill marketplace
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { MarketplaceManager } from './manager.js';

export interface MarketplaceRoutesOptions {
  marketplaceManager: MarketplaceManager;
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : 'Unknown error';
}

export function registerMarketplaceRoutes(
  app: FastifyInstance,
  opts: MarketplaceRoutesOptions
): void {
  const { marketplaceManager } = opts;

  app.get(
    '/api/v1/marketplace',
    async (
      request: FastifyRequest<{
        Querystring: { query?: string; category?: string; limit?: string; offset?: string; source?: string };
      }>
    ) => {
      const q = request.query;
      return await marketplaceManager.search(
        q.query,
        q.category,
        q.limit ? Number(q.limit) : undefined,
        q.offset ? Number(q.offset) : undefined,
        q.source
      );
    }
  );

  app.get(
    '/api/v1/marketplace/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const skill = await marketplaceManager.getSkill(request.params.id);
      if (!skill) return reply.code(404).send({ error: 'Skill not found' });
      return { skill };
    }
  );

  app.post(
    '/api/v1/marketplace/:id/install',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { personalityId?: string } }>,
      reply: FastifyReply
    ) => {
      const personalityId = request.body?.personalityId || undefined;
      if (!(await marketplaceManager.install(request.params.id, personalityId)))
        return reply.code(404).send({ error: 'Skill not found' });
      return { message: 'Skill installed' };
    }
  );

  app.post(
    '/api/v1/marketplace/:id/uninstall',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await marketplaceManager.uninstall(request.params.id)))
        return reply.code(404).send({ error: 'Skill not found' });
      return { message: 'Skill uninstalled' };
    }
  );

  app.post(
    '/api/v1/marketplace/publish',
    async (request: FastifyRequest<{ Body: Record<string, unknown> }>, reply: FastifyReply) => {
      try {
        const skill = await marketplaceManager.publish(request.body as any);
        return reply.code(201).send({ skill });
      } catch (err) {
        return reply.code(400).send({ error: errorMessage(err) });
      }
    }
  );

  app.delete(
    '/api/v1/marketplace/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await marketplaceManager.delete(request.params.id)))
        return reply.code(404).send({ error: 'Skill not found' });
      return reply.code(204).send();
    }
  );

  // Community sync — uses the config-locked communityRepoPath; no path accepted
  // from the request body to prevent path traversal attacks.
  app.post('/api/v1/marketplace/community/sync', async (_request, reply: FastifyReply) => {
    try {
      const result = await marketplaceManager.syncFromCommunity();
      return result;
    } catch (err) {
      return reply.code(500).send({ error: errorMessage(err) });
    }
  });

  app.get('/api/v1/marketplace/community/status', async (_request, reply: FastifyReply) => {
    try {
      const status = await marketplaceManager.getCommunityStatus();
      return status;
    } catch (err) {
      return reply.code(500).send({ error: errorMessage(err) });
    }
  });
}
