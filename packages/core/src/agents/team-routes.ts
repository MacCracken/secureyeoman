/**
 * Team Routes — REST API for the Team primitive (Phase 83).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TeamManager } from './team-manager.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import { TeamCreateSchema, TeamUpdateSchema, TeamRunParamsSchema } from '@secureyeoman/shared';

export function registerTeamRoutes(app: FastifyInstance, opts: { teamManager: TeamManager }): void {
  const { teamManager } = opts;

  // GET /api/v1/agents/teams — list teams
  app.get(
    '/api/v1/agents/teams',
    async (request: FastifyRequest<{ Querystring: { limit?: string; offset?: string } }>) => {
      const { limit, offset } = parsePagination(request.query);
      return teamManager.listTeams({ limit, offset });
    }
  );

  // POST /api/v1/agents/teams — create team
  app.post('/api/v1/agents/teams', async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = TeamCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
    }
    try {
      const team = await teamManager.createTeam(parsed.data);
      return reply.code(201).send({ team });
    } catch (err) {
      return sendError(reply, 400, toErrorMessage(err));
    }
  });

  // GET /api/v1/agents/teams/runs/:runId — get run (must come before /:id)
  app.get(
    '/api/v1/agents/teams/runs/:runId',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const run = await teamManager.getRun(request.params.runId);
      if (!run) return sendError(reply, 404, 'Run not found');
      return { run };
    }
  );

  // GET /api/v1/agents/teams/:id — get team
  app.get(
    '/api/v1/agents/teams/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const team = await teamManager.getTeam(request.params.id);
      if (!team) return sendError(reply, 404, 'Team not found');
      return { team };
    }
  );

  // PUT /api/v1/agents/teams/:id — update team
  app.put(
    '/api/v1/agents/teams/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const parsed = TeamUpdateSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      try {
        const team = await teamManager.updateTeam(request.params.id, parsed.data);
        return { team };
      } catch (err) {
        const msg = toErrorMessage(err);
        const code = msg.includes('not found') ? 404 : msg.includes('builtin') ? 403 : 400;
        return sendError(reply, code, msg);
      }
    }
  );

  // DELETE /api/v1/agents/teams/:id — delete team
  app.delete(
    '/api/v1/agents/teams/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        await teamManager.deleteTeam(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        const msg = toErrorMessage(err);
        const code = msg.includes('not found') ? 404 : msg.includes('builtin') ? 403 : 400;
        return sendError(reply, code, msg);
      }
    }
  );

  // POST /api/v1/agents/teams/:id/run — start a team run (202, fire-and-forget)
  app.post(
    '/api/v1/agents/teams/:id/run',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Headers: { authorization?: string };
      }>,
      reply: FastifyReply
    ) => {
      const parsed = TeamRunParamsSchema.safeParse(request.body);
      if (!parsed.success) {
        return sendError(reply, 400, parsed.error.issues.map((i) => i.message).join('; '));
      }
      try {
        const teamRun = await teamManager.run(request.params.id, parsed.data, {
          initiatedBy: 'api',
        });
        return reply.code(202).send({ run: teamRun });
      } catch (err) {
        const msg = toErrorMessage(err);
        const code = msg.includes('not found') ? 404 : 400;
        return sendError(reply, code, msg);
      }
    }
  );
}
