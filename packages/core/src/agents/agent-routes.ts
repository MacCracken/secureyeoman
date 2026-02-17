/**
 * Agent Routes — REST API for sub-agent delegation system.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SubAgentManager } from './manager.js';

export function registerAgentRoutes(
  app: FastifyInstance,
  deps: { subAgentManager: SubAgentManager },
): void {
  const { subAgentManager } = deps;

  // ── Profile routes ──────────────────────────────────────────

  app.get('/api/v1/agents/profiles', async () => {
    const profiles = await subAgentManager.listProfiles();
    return { profiles };
  });

  app.get(
    '/api/v1/agents/profiles/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const profile = await subAgentManager.getProfile(request.params.id);
      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }
      return profile;
    },
  );

  app.post(
    '/api/v1/agents/profiles',
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          description?: string;
          systemPrompt: string;
          maxTokenBudget?: number;
          allowedTools?: string[];
          defaultModel?: string | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const data = {
          name: request.body.name,
          description: request.body.description ?? '',
          systemPrompt: request.body.systemPrompt,
          maxTokenBudget: request.body.maxTokenBudget ?? 50000,
          allowedTools: request.body.allowedTools ?? [],
          defaultModel: request.body.defaultModel ?? null,
        };
        const profile = await subAgentManager.createProfile(data);
        return reply.code(201).send({ profile });
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Failed to create profile',
        });
      }
    },
  );

  app.put(
    '/api/v1/agents/profiles/:id',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          name?: string;
          description?: string;
          systemPrompt?: string;
          maxTokenBudget?: number;
          allowedTools?: string[];
          defaultModel?: string | null;
        };
      }>,
      reply: FastifyReply,
    ) => {
      const profile = await subAgentManager.updateProfile(request.params.id, request.body);
      if (!profile) {
        return reply.code(404).send({ error: 'Profile not found' });
      }
      return { profile };
    },
  );

  app.delete(
    '/api/v1/agents/profiles/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      // Check if it's a built-in profile
      const existing = await subAgentManager.getProfile(request.params.id);
      if (!existing) {
        return reply.code(404).send({ error: 'Profile not found' });
      }
      if (existing.isBuiltin) {
        return reply.code(403).send({ error: 'Cannot delete built-in profiles' });
      }
      const deleted = await subAgentManager.deleteProfile(request.params.id);
      if (!deleted) {
        return reply.code(500).send({ error: 'Failed to delete profile' });
      }
      return { success: true };
    },
  );

  // ── Delegation routes ───────────────────────────────────────

  app.post(
    '/api/v1/agents/delegate',
    async (
      request: FastifyRequest<{
        Body: {
          profile: string;
          task: string;
          context?: string;
          maxTokenBudget?: number;
          maxDepth?: number;
          timeout?: number;
        };
      }>,
      reply: FastifyReply,
    ) => {
      try {
        const result = await subAgentManager.delegate(request.body);
        return reply.code(201).send(result);
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Delegation failed',
        });
      }
    },
  );

  app.get(
    '/api/v1/agents/delegations',
    async (
      request: FastifyRequest<{
        Querystring: {
          status?: string;
          profileId?: string;
          limit?: string;
          offset?: string;
        };
      }>,
    ) => {
      const q = request.query;
      return subAgentManager.listDelegations({
        status: q.status,
        profileId: q.profileId,
        limit: q.limit ? Number(q.limit) : undefined,
        offset: q.offset ? Number(q.offset) : undefined,
      });
    },
  );

  app.get('/api/v1/agents/delegations/active', async () => {
    const active = await subAgentManager.listActive();
    return { delegations: active };
  });

  app.get(
    '/api/v1/agents/delegations/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      const delegation = await subAgentManager.getDelegation(request.params.id);
      if (!delegation) {
        return reply.code(404).send({ error: 'Delegation not found' });
      }
      // Include tree for detail view
      const tree = await subAgentManager.getDelegationTree(request.params.id);
      return { delegation, tree };
    },
  );

  app.post(
    '/api/v1/agents/delegations/:id/cancel',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply,
    ) => {
      try {
        await subAgentManager.cancel(request.params.id);
        return { success: true };
      } catch (err) {
        return reply.code(400).send({
          error: err instanceof Error ? err.message : 'Cancel failed',
        });
      }
    },
  );

  app.get(
    '/api/v1/agents/delegations/:id/messages',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
    ) => {
      const messages = await subAgentManager.getDelegationMessages(request.params.id);
      return { messages };
    },
  );

  // ── Config route ────────────────────────────────────────────

  app.get('/api/v1/agents/config', async () => {
    return {
      config: subAgentManager.getConfig(),
      allowedBySecurityPolicy: subAgentManager.isAllowedBySecurityPolicy(),
    };
  });
}
