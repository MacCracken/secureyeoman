/**
 * Agent Replay Routes — REST API for trace management and replay.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { TraceStore } from './trace-store.js';
import type { ReplayEngine } from './replay-engine.js';
import { diffTraces } from './trace-differ.js';
import { ReplayOptionsSchema } from '@secureyeoman/shared';
import { sendError } from '../utils/errors.js';

export interface ReplayRouteOptions {
  traceStore: TraceStore;
  replayEngine: ReplayEngine;
}

export function registerReplayRoutes(app: FastifyInstance, opts: ReplayRouteOptions): void {
  const { traceStore, replayEngine } = opts;

  // ── List traces ────────────────────────────────────────────────────

  app.get(
    '/api/v1/agent-replay/traces',
    async (
      req: FastifyRequest<{
        Querystring: {
          conversationId?: string;
          personalityId?: string;
          isReplay?: string;
          tags?: string;
          limit?: string;
          offset?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const q = req.query;
      const result = await traceStore.listTraces({
        conversationId: q.conversationId,
        personalityId: q.personalityId,
        isReplay: q.isReplay === 'true' ? true : q.isReplay === 'false' ? false : undefined,
        tags: q.tags ? q.tags.split(',') : undefined,
        limit: q.limit ? parseInt(q.limit, 10) : undefined,
        offset: q.offset ? parseInt(q.offset, 10) : undefined,
      });
      return reply.send(result);
    }
  );

  // ── Get trace by ID ────────────────────────────────────────────────

  app.get(
    '/api/v1/agent-replay/traces/:traceId',
    async (req: FastifyRequest<{ Params: { traceId: string } }>, reply: FastifyReply) => {
      const trace = await traceStore.getTrace(req.params.traceId);
      if (!trace) return sendError(reply, 404, 'Trace not found');
      return reply.send(trace);
    }
  );

  // ── Delete trace ───────────────────────────────────────────────────

  app.delete(
    '/api/v1/agent-replay/traces/:traceId',
    async (req: FastifyRequest<{ Params: { traceId: string } }>, reply: FastifyReply) => {
      const deleted = await traceStore.deleteTrace(req.params.traceId);
      if (!deleted) return sendError(reply, 404, 'Trace not found');
      return reply.send({ ok: true });
    }
  );

  // ── Get replay chain ──────────────────────────────────────────────

  app.get(
    '/api/v1/agent-replay/traces/:traceId/chain',
    async (req: FastifyRequest<{ Params: { traceId: string } }>, reply: FastifyReply) => {
      const chain = await traceStore.getReplayChain(req.params.traceId);
      return reply.send({ chain });
    }
  );

  // ── Diff two traces ────────────────────────────────────────────────

  app.get(
    '/api/v1/agent-replay/diff',
    async (
      req: FastifyRequest<{ Querystring: { traceA: string; traceB: string } }>,
      reply: FastifyReply
    ) => {
      const { traceA: idA, traceB: idB } = req.query;
      if (!idA || !idB) return sendError(reply, 400, 'traceA and traceB query params required');

      const [traceA, traceB] = await Promise.all([
        traceStore.getTrace(idA),
        traceStore.getTrace(idB),
      ]);

      if (!traceA) return sendError(reply, 404, `Trace A not found: ${idA}`);
      if (!traceB) return sendError(reply, 404, `Trace B not found: ${idB}`);

      const diff = diffTraces(traceA, traceB);
      return reply.send(diff);
    }
  );

  // ── Replay a trace (mock) ─────────────────────────────────────────

  app.post(
    '/api/v1/agent-replay/traces/:traceId/replay',
    async (
      req: FastifyRequest<{
        Params: { traceId: string };
        Body: Record<string, unknown>;
      }>,
      reply: FastifyReply
    ) => {
      const sourceTrace = await traceStore.getTrace(req.params.traceId);
      if (!sourceTrace) return sendError(reply, 404, 'Source trace not found');

      const parsed = ReplayOptionsSchema.safeParse(req.body ?? {});
      if (!parsed.success) {
        return sendError(reply, 400, `Invalid replay options: ${parsed.error.message}`);
      }

      // For now, only mock replay is available via API (live replay requires wiring executeAndTrace)
      const options = { ...parsed.data, mockToolCalls: true };

      try {
        const replayTrace = await replayEngine.replay(sourceTrace, options, {
          executeAndTrace: async () => {
            throw new Error('Live replay not available via API — use mock mode');
          },
        });

        await traceStore.saveTrace(replayTrace);
        return reply.send(replayTrace);
      } catch (err) {
        return sendError(reply, 429, err instanceof Error ? err.message : 'Replay failed');
      }
    }
  );

  // ── Trace summary stats ────────────────────────────────────────────

  app.get(
    '/api/v1/agent-replay/traces/:traceId/summary',
    async (req: FastifyRequest<{ Params: { traceId: string } }>, reply: FastifyReply) => {
      const trace = await traceStore.getTrace(req.params.traceId);
      if (!trace) return sendError(reply, 404, 'Trace not found');

      const toolCalls = trace.steps.filter((s) => s.type === 'tool_call');
      const llmCalls = trace.steps.filter((s) => s.type === 'llm_call');
      const guards = trace.steps.filter((s) => s.type === 'guard_check');
      const errors = trace.steps.filter((s) => s.type === 'error');

      return reply.send({
        id: trace.id,
        model: trace.model,
        provider: trace.provider,
        success: trace.success,
        totalDurationMs: trace.totalDurationMs,
        totalTokens: trace.totalInputTokens + trace.totalOutputTokens,
        totalCostUsd: trace.totalCostUsd,
        stepCount: trace.steps.length,
        llmCallCount: llmCalls.length,
        toolCallCount: toolCalls.length,
        guardCheckCount: guards.length,
        errorCount: errors.length,
        toolNames: [...new Set(toolCalls.map((s) => (s as { toolName: string }).toolName))],
        blockedTools: toolCalls.filter((s) => (s as { blocked: boolean }).blocked).length,
        isReplay: trace.isReplay,
        sourceTraceId: trace.sourceTraceId,
      });
    }
  );
}
