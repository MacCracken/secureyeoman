/**
 * Marketplace Routes — REST API for skill marketplace
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Config } from '@secureyeoman/shared';
import type { MarketplaceManager } from './manager.js';
import { toErrorMessage, sendError } from '../utils/errors.js';

export interface MarketplaceRoutesOptions {
  marketplaceManager: MarketplaceManager;
  getConfig?: () => Config;
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
        Querystring: {
          query?: string;
          category?: string;
          limit?: string;
          offset?: string;
          source?: string;
        };
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
      if (!skill) return sendError(reply, 404, 'Skill not found');
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
        return sendError(reply, 404, 'Skill not found');
      return { message: 'Skill installed' };
    }
  );

  app.post(
    '/api/v1/marketplace/:id/uninstall',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await marketplaceManager.uninstall(request.params.id)))
        return sendError(reply, 404, 'Skill not found');
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
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  app.delete(
    '/api/v1/marketplace/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      if (!(await marketplaceManager.delete(request.params.id)))
        return sendError(reply, 404, 'Skill not found');
      return reply.code(204).send();
    }
  );

  // Community sync — accepts optional repoUrl when allowCommunityGitFetch policy is enabled.
  app.post(
    '/api/v1/marketplace/community/sync',
    async (request: FastifyRequest<{ Body?: { repoUrl?: string } }>, reply: FastifyReply) => {
      const repoUrl = request.body?.repoUrl;
      if (repoUrl && opts.getConfig && !opts.getConfig().security.allowCommunityGitFetch) {
        return sendError(reply, 403, 'Community git fetch is disabled by security policy');
      }
      try {
        const result = await marketplaceManager.syncFromCommunity(undefined, repoUrl);
        return result;
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  app.get('/api/v1/marketplace/community/status', async (_request, reply: FastifyReply) => {
    try {
      const status = await marketplaceManager.getCommunityStatus();
      return status;
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
