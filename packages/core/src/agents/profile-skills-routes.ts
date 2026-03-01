/**
 * Profile Skills Routes — CRUD for skills attached to sub-agent profiles (Phase 89).
 *
 * Skills assigned to a profile are injected into that agent's system prompt when
 * the profile is used as a swarm role.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SwarmStorage } from './swarm-storage.js';
import type { SubAgentStorage } from './storage.js';
import { sendError } from '../utils/errors.js';

export interface ProfileSkillsRoutesOpts {
  swarmStorage: SwarmStorage;
  subAgentStorage: SubAgentStorage;
}

export function registerProfileSkillsRoutes(
  app: FastifyInstance,
  opts: ProfileSkillsRoutesOpts
): void {
  const { swarmStorage, subAgentStorage } = opts;

  // ── GET /api/v1/agents/profiles/:id/skills ────────────────────

  app.get(
    '/api/v1/agents/profiles/:id/skills',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const profile = await subAgentStorage.getProfile(request.params.id);
      if (!profile) return sendError(reply, 404, 'Profile not found');
      const skills = await swarmStorage.getProfileSkills(request.params.id);
      return { skills };
    }
  );

  // ── POST /api/v1/agents/profiles/:id/skills ───────────────────

  app.post(
    '/api/v1/agents/profiles/:id/skills',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { skillId: string } }>,
      reply: FastifyReply
    ) => {
      const { skillId } = request.body ?? {};
      if (!skillId) return sendError(reply, 400, 'skillId is required');

      const profile = await subAgentStorage.getProfile(request.params.id);
      if (!profile) return sendError(reply, 404, 'Profile not found');

      try {
        await swarmStorage.addProfileSkill(request.params.id, skillId);
        const skills = await swarmStorage.getProfileSkills(request.params.id);
        const added = skills.find((s) => s.id === skillId);
        if (!added) return sendError(reply, 404, 'Skill not found');
        return reply.code(201).send({ skill: added });
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Failed to add skill';
        return sendError(reply, msg.includes('violates foreign key') ? 404 : 400, msg);
      }
    }
  );

  // ── DELETE /api/v1/agents/profiles/:id/skills/:skillId ────────

  app.delete(
    '/api/v1/agents/profiles/:id/skills/:skillId',
    async (
      request: FastifyRequest<{ Params: { id: string; skillId: string } }>,
      reply: FastifyReply
    ) => {
      const profile = await subAgentStorage.getProfile(request.params.id);
      if (!profile) return sendError(reply, 404, 'Profile not found');

      await swarmStorage.removeProfileSkill(request.params.id, request.params.skillId);
      return reply.code(204).send();
    }
  );
}
