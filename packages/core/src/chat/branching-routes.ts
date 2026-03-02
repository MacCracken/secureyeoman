/**
 * Branching Routes — Conversation branching and replay endpoints (Phase 99).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BranchingManager } from './branching-manager.js';
import { sendError } from '../utils/errors.js';

export interface BranchingRoutesOptions {
  branchingManager: BranchingManager;
}

export function registerBranchingRoutes(
  app: FastifyInstance,
  opts: BranchingRoutesOptions
): void {
  const { branchingManager } = opts;

  // ── Branch from a specific message ───────────────────────────────────────

  app.post(
    '/api/v1/conversations/:id/branch',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { messageIndex: number; title?: string; branchLabel?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { messageIndex, title, branchLabel } = request.body;
      if (messageIndex == null || typeof messageIndex !== 'number' || messageIndex < 0) {
        return sendError(reply, 400, 'Valid messageIndex is required');
      }
      try {
        const branch = await branchingManager.branchFromMessage(
          request.params.id,
          messageIndex,
          { title, branchLabel }
        );
        return reply.code(201).send(branch);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        if (msg.includes('Invalid message index')) return sendError(reply, 400, msg);
        throw err;
      }
    }
  );

  // ── List child branches ──────────────────────────────────────────────────

  app.get(
    '/api/v1/conversations/:id/branches',
    async (request: FastifyRequest<{ Params: { id: string } }>) => {
      const branches = await branchingManager.getChildBranches(request.params.id);
      return { branches };
    }
  );

  // ── Get branch tree ──────────────────────────────────────────────────────

  app.get(
    '/api/v1/conversations/:id/tree',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const tree = await branchingManager.getBranchTree(request.params.id);
        return tree;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        throw err;
      }
    }
  );

  // ── Replay a single conversation ─────────────────────────────────────────

  app.post(
    '/api/v1/conversations/:id/replay',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { model: string; provider: string; personalityId?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { model, provider, personalityId } = request.body;
      if (!model || !provider) {
        return sendError(reply, 400, 'model and provider are required');
      }
      try {
        const result = await branchingManager.replayConversation(request.params.id, {
          model,
          provider,
          personalityId,
        });
        return reply.code(201).send(result);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        if (msg.includes('No user messages')) return sendError(reply, 400, msg);
        throw err;
      }
    }
  );

  // ── Batch replay ─────────────────────────────────────────────────────────

  app.post(
    '/api/v1/conversations/replay-batch',
    async (
      request: FastifyRequest<{
        Body: {
          sourceConversationIds: string[];
          replayModel: string;
          replayProvider: string;
          replayPersonalityId?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { sourceConversationIds, replayModel, replayProvider, replayPersonalityId } =
        request.body;
      if (!sourceConversationIds?.length || !replayModel || !replayProvider) {
        return sendError(
          reply,
          400,
          'sourceConversationIds, replayModel, and replayProvider are required'
        );
      }
      const job = await branchingManager.replayBatch({
        sourceConversationIds,
        replayModel,
        replayProvider,
        replayPersonalityId,
      });
      return reply.code(201).send(job);
    }
  );

  // ── Replay job list ──────────────────────────────────────────────────────

  app.get('/api/v1/replay-jobs', async () => {
    const jobs = await branchingManager.listReplayJobs();
    return { jobs };
  });

  // ── Replay job detail ────────────────────────────────────────────────────

  app.get(
    '/api/v1/replay-jobs/:id',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      const job = await branchingManager.getReplayJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Replay job not found');
      return job;
    }
  );

  // ── Replay job report ────────────────────────────────────────────────────

  app.get(
    '/api/v1/replay-jobs/:id/report',
    async (
      request: FastifyRequest<{ Params: { id: string } }>,
      reply: FastifyReply
    ) => {
      try {
        const report = await branchingManager.getReplayReport(request.params.id);
        return report;
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        throw err;
      }
    }
  );
}
