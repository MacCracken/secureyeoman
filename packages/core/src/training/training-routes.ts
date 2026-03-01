/**
 * Training Routes — Export conversation and memory data as structured training datasets.
 *
 * Supported output formats:
 *   sharegpt    — ShareGPT JSONL (recommended for chat fine-tuning)
 *   instruction — Alpaca-style instruction JSONL
 *   raw         — Plain text corpus (one conversation per block)
 *
 * Also provides distillation and fine-tuning job management (Phase 64).
 *
 * All exports stream line-by-line to avoid buffering large datasets in memory.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError } from '../utils/errors.js';
import type { DistillationJobConfig, TeacherClient } from './distillation-manager.js';
import type { FinetuneJobConfig } from './finetune-manager.js';
import type { AIMessage } from '@secureyeoman/shared';

export interface TrainingRoutesOptions {
  secureYeoman: SecureYeoman;
}

type ExportFormat = 'sharegpt' | 'instruction' | 'raw';

interface ExportBody {
  format?: ExportFormat;
  from?: number;
  to?: number;
  personalityIds?: string[];
  includeMemories?: boolean;
  includeKnowledge?: boolean;
  limit?: number;
}

// ── Format helpers ─────────────────────────────────────────────────────────

interface ShareGptMessage {
  from: 'human' | 'gpt' | 'system';
  value: string;
}

function toShareGpt(
  conversationId: string,
  personalityId: string | null,
  messages: { role: string; content: string }[]
): string {
  const converted: ShareGptMessage[] = messages.map((m) => ({
    from: m.role === 'user' ? 'human' : 'gpt',
    value: m.content,
  }));
  return (
    JSON.stringify({
      id: conversationId,
      personality_id: personalityId,
      conversations: converted,
    }) + '\n'
  );
}

function toInstruction(
  messages: { role: string; content: string }[],
  personalityId: string | null
): string[] {
  const lines: string[] = [];
  for (let i = 0; i < messages.length - 1; i++) {
    const cur = messages[i]!;
    const next = messages[i + 1]!;
    if (cur.role === 'user' && next.role === 'assistant') {
      lines.push(
        JSON.stringify({
          instruction: cur.content,
          output: next.content,
          personality_id: personalityId,
        }) + '\n'
      );
      i++; // consume the pair
    }
  }
  return lines;
}

function toRawText(conversationId: string, messages: { role: string; content: string }[]): string {
  const parts = [`=== Conversation ${conversationId} ===`];
  for (const m of messages) {
    parts.push(`[${m.role.toUpperCase()}]: ${m.content}`);
  }
  return parts.join('\n') + '\n\n';
}

// ── Route registration ─────────────────────────────────────────────────────

export function registerTrainingRoutes(app: FastifyInstance, opts: TrainingRoutesOptions): void {
  const { secureYeoman } = opts;

  /**
   * POST /api/v1/training/export
   * Streams a training dataset as JSONL or plain text.
   */
  app.post(
    '/api/v1/training/export',
    async (request: FastifyRequest<{ Body: ExportBody }>, reply: FastifyReply) => {
      const conversationStorage = secureYeoman.getConversationStorage();
      if (!conversationStorage) {
        return sendError(reply, 503, 'Conversation storage not available');
      }

      const body = request.body ?? {};
      const format: ExportFormat = body.format ?? 'sharegpt';
      const from = body.from;
      const to = body.to;
      const personalityIds = body.personalityIds;
      const cap = Math.min(body.limit ?? 10_000, 100_000);

      if (!['sharegpt', 'instruction', 'raw'].includes(format)) {
        return sendError(reply, 400, 'format must be sharegpt, instruction, or raw');
      }

      const contentType = format === 'raw' ? 'text/plain; charset=utf-8' : 'application/x-ndjson';
      const ext = format === 'raw' ? 'txt' : 'jsonl';
      const filename = `training-export-${new Date().toISOString().slice(0, 10)}.${ext}`;

      reply.raw.setHeader('Content-Type', contentType);
      reply.raw.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
      reply.raw.writeHead(200);

      let exported = 0;
      let offset = 0;
      const BATCH = 50;

      try {
        while (exported < cap) {
          // Fetch a batch of conversations
          const targets = personalityIds?.length ? personalityIds : [undefined];

          for (const pid of targets) {
            if (exported >= cap) break;

            const { conversations } = await conversationStorage.listConversations({
              limit: BATCH,
              offset,
              ...(pid !== undefined ? { personalityId: pid } : {}),
            });

            if (conversations.length === 0) break;

            for (const conv of conversations) {
              if (exported >= cap) break;

              // Filter by date range if specified
              if (from !== undefined && conv.createdAt < from) continue;
              if (to !== undefined && conv.createdAt > to) continue;

              const messages = await conversationStorage.getMessages(conv.id, {
                limit: 1000,
              });

              if (messages.length < 2) continue; // skip single-message conversations

              const plainMessages = messages.map((m) => ({
                role: m.role,
                content: m.content,
              }));

              if (format === 'sharegpt') {
                reply.raw.write(toShareGpt(conv.id, conv.personalityId, plainMessages));
              } else if (format === 'instruction') {
                const lines = toInstruction(plainMessages, conv.personalityId);
                for (const line of lines) {
                  reply.raw.write(line);
                }
              } else {
                reply.raw.write(toRawText(conv.id, plainMessages));
              }

              exported++;
            }

            offset += BATCH;
          }

          // If single personality or no pid, check if we got fewer than BATCH (end of results)
          if (!personalityIds?.length) {
            const { conversations: check } = await conversationStorage.listConversations({
              limit: 1,
              offset,
            });
            if (check.length === 0) break;
          } else {
            break; // personalityIds loop already exhausted
          }
        }
      } catch (err) {
        // Best-effort: stream an error marker and end
        const msg = err instanceof Error ? err.message : 'Unknown error';
        reply.raw.write(`{"error":${JSON.stringify(msg)}}\n`);
      }

      reply.raw.end();
      return reply;
    }
  );

  /**
   * GET /api/v1/training/stats
   * Returns row counts useful for estimating export size.
   */
  app.get('/api/v1/training/stats', async (_request, reply: FastifyReply) => {
    const conversationStorage = secureYeoman.getConversationStorage();
    if (!conversationStorage) {
      return sendError(reply, 503, 'Conversation storage not available');
    }

    const { total: conversations } = await conversationStorage.listConversations({ limit: 1 });

    let memories = 0;
    let knowledge = 0;
    try {
      const brainManager = secureYeoman.getBrainManager();
      const stats = await brainManager.getStats();
      memories = (stats.memories as { total?: number })?.total ?? 0;
      knowledge = (stats.knowledge as { total?: number })?.total ?? 0;
    } catch {
      /* non-fatal — brain may not be initialized */
    }

    return { conversations, memories, knowledge };
  });

  // ── Distillation endpoints ────────────────────────────────────────────────

  /**
   * POST /api/v1/training/distillation/jobs
   * Create a new distillation job.
   */
  app.post(
    '/api/v1/training/distillation/jobs',
    async (request: FastifyRequest<{ Body: DistillationJobConfig }>, reply: FastifyReply) => {
      const manager = secureYeoman.getDistillationManager();
      if (!manager) return sendError(reply, 503, 'Distillation manager not available');

      const body = request.body;
      if (!body.name?.trim()) return sendError(reply, 400, 'name is required');
      if (!body.teacherProvider?.trim())
        return sendError(reply, 400, 'teacherProvider is required');
      if (!body.teacherModel?.trim()) return sendError(reply, 400, 'teacherModel is required');
      if (!body.outputPath?.trim()) return sendError(reply, 400, 'outputPath is required');

      const job = await manager.createJob(body);
      return reply.status(201).send(job);
    }
  );

  /**
   * GET /api/v1/training/distillation/jobs
   * List all distillation jobs.
   */
  app.get('/api/v1/training/distillation/jobs', async (_request, reply: FastifyReply) => {
    const manager = secureYeoman.getDistillationManager();
    if (!manager) return sendError(reply, 503, 'Distillation manager not available');

    const jobs = await manager.listJobs();
    return { jobs };
  });

  /**
   * GET /api/v1/training/distillation/jobs/:id
   * Get a specific distillation job.
   */
  app.get(
    '/api/v1/training/distillation/jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getDistillationManager();
      if (!manager) return sendError(reply, 503, 'Distillation manager not available');

      const job = await manager.getJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Job not found');
      return job;
    }
  );

  /**
   * DELETE /api/v1/training/distillation/jobs/:id
   * Cancel and delete a distillation job.
   */
  app.delete(
    '/api/v1/training/distillation/jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getDistillationManager();
      if (!manager) return sendError(reply, 503, 'Distillation manager not available');

      const deleted = await manager.deleteJob(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Job not found');
      return reply.status(204).send();
    }
  );

  /**
   * POST /api/v1/training/distillation/jobs/:id/run
   * Start (or retry) a pending or failed distillation job in the background.
   * Returns 202 immediately; caller polls GET .../jobs/:id for status.
   */
  app.post(
    '/api/v1/training/distillation/jobs/:id/run',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { secureYeoman } = opts;
      const manager = secureYeoman.getDistillationManager();
      if (!manager) return sendError(reply, 503, 'Distillation manager not available');

      const conversationStorage = secureYeoman.getConversationStorage();
      if (!conversationStorage) return sendError(reply, 503, 'Conversation storage not available');

      let aiClient: ReturnType<typeof secureYeoman.getAIClient>;
      try {
        aiClient = secureYeoman.getAIClient();
      } catch {
        return sendError(reply, 503, 'AI client not available');
      }

      const job = await manager.getJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Job not found');
      if (manager.isRunning(job.id)) return sendError(reply, 409, 'Job is already running');
      if (job.status !== 'pending' && job.status !== 'failed') {
        return sendError(reply, 409, `Job cannot be run in status '${job.status}'`);
      }

      const { teacherModel } = job;
      const teacherClient: TeacherClient = {
        async chat(req) {
          const response = await aiClient.chat({
            messages: req.messages as AIMessage[],
            model: teacherModel,
            stream: false,
          });
          return { content: response.content };
        },
      };

      // Fire and forget — client polls GET .../jobs/:id for status updates
      void manager.runJob(job.id, conversationStorage, teacherClient);

      return reply.status(202).send({ id: job.id, status: 'running' });
    }
  );

  // ── Fine-tuning endpoints ─────────────────────────────────────────────────

  /**
   * POST /api/v1/training/finetune/jobs
   * Create a new fine-tuning job.
   */
  app.post(
    '/api/v1/training/finetune/jobs',
    async (request: FastifyRequest<{ Body: FinetuneJobConfig }>, reply: FastifyReply) => {
      const manager = secureYeoman.getFinetuneManager();
      if (!manager) return sendError(reply, 503, 'Finetune manager not available');

      const body = request.body;
      if (!body.name?.trim()) return sendError(reply, 400, 'name is required');
      if (!body.baseModel?.trim()) return sendError(reply, 400, 'baseModel is required');
      if (!body.adapterName?.trim()) return sendError(reply, 400, 'adapterName is required');
      if (!body.datasetPath?.trim()) return sendError(reply, 400, 'datasetPath is required');

      const job = await manager.createJob(body);

      // Start the Docker container
      try {
        await manager.startJob(job.id);
      } catch (err) {
        // Non-fatal: job is created, Docker may not be available in dev
        const msg = err instanceof Error ? err.message : 'Docker error';
        return reply.status(201).send({ ...job, startError: msg });
      }

      const started = await manager.getJob(job.id);
      return reply.status(201).send(started ?? job);
    }
  );

  /**
   * GET /api/v1/training/finetune/jobs
   * List all fine-tuning jobs.
   */
  app.get('/api/v1/training/finetune/jobs', async (_request, reply: FastifyReply) => {
    const manager = secureYeoman.getFinetuneManager();
    if (!manager) return sendError(reply, 503, 'Finetune manager not available');

    const jobs = await manager.listJobs();
    return { jobs };
  });

  /**
   * GET /api/v1/training/finetune/jobs/:id
   * Get a specific fine-tuning job.
   */
  app.get(
    '/api/v1/training/finetune/jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getFinetuneManager();
      if (!manager) return sendError(reply, 503, 'Finetune manager not available');

      const job = await manager.getJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Job not found');
      return job;
    }
  );

  /**
   * GET /api/v1/training/finetune/jobs/:id/logs
   * SSE stream of Docker container logs.
   */
  app.get(
    '/api/v1/training/finetune/jobs/:id/logs',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getFinetuneManager();
      if (!manager) return sendError(reply, 503, 'Finetune manager not available');

      const job = await manager.getJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Job not found');

      reply.raw.writeHead(200, {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        Connection: 'keep-alive',
      });

      try {
        for await (const line of manager.streamLogs(request.params.id)) {
          reply.raw.write(`data: ${JSON.stringify({ log: line })}\n\n`);
        }
      } catch (err) {
        const msg = err instanceof Error ? err.message : 'Log stream error';
        reply.raw.write(`data: ${JSON.stringify({ error: msg })}\n\n`);
      }

      reply.raw.end();
      return reply;
    }
  );

  /**
   * POST /api/v1/training/finetune/jobs/:id/register
   * Register a completed adapter with Ollama.
   */
  app.post(
    '/api/v1/training/finetune/jobs/:id/register',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getFinetuneManager();
      if (!manager) return sendError(reply, 503, 'Finetune manager not available');

      const job = await manager.getJob(request.params.id);
      if (!job) return sendError(reply, 404, 'Job not found');
      if (job.status !== 'complete') {
        return sendError(reply, 400, `Job is not complete (status=${job.status})`);
      }

      const ollamaBaseUrl = 'http://localhost:11434';
      await manager.registerWithOllama(request.params.id, ollamaBaseUrl);
      return { success: true, adapterName: job.adapterName };
    }
  );

  /**
   * DELETE /api/v1/training/finetune/jobs/:id
   * Cancel and delete a fine-tuning job.
   */
  app.delete(
    '/api/v1/training/finetune/jobs/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getFinetuneManager();
      if (!manager) return sendError(reply, 503, 'Finetune manager not available');

      const deleted = await manager.deleteJob(request.params.id);
      if (!deleted) return sendError(reply, 404, 'Job not found');
      return reply.status(204).send();
    }
  );

  // ── Human Approval endpoints (Phase 73) ───────────────────────────────────

  /**
   * GET /api/v1/training/approvals
   * List approval requests. Pass ?status=pending to filter.
   */
  app.get(
    '/api/v1/training/approvals',
    async (
      request: FastifyRequest<{ Querystring: { runId?: string; status?: string } }>,
      reply: FastifyReply
    ) => {
      const manager = secureYeoman.getPipelineApprovalManager();
      if (!manager) return sendError(reply, 503, 'Approval manager not available');

      const { runId, status } = request.query as { runId?: string; status?: string };
      const requests =
        status === 'pending' ? await manager.listPending() : await manager.listAll(runId);
      return { requests };
    }
  );

  /**
   * GET /api/v1/training/approvals/:id
   * Get a specific approval request.
   */
  app.get(
    '/api/v1/training/approvals/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = secureYeoman.getPipelineApprovalManager();
      if (!manager) return sendError(reply, 503, 'Approval manager not available');

      const req = await manager.getRequest(request.params.id);
      if (!req) return sendError(reply, 404, 'Approval request not found');
      return req;
    }
  );

  /**
   * POST /api/v1/training/approvals/:id/approve
   * Approve a pending human approval request.
   */
  app.post(
    '/api/v1/training/approvals/:id/approve',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      const manager = secureYeoman.getPipelineApprovalManager();
      if (!manager) return sendError(reply, 503, 'Approval manager not available');

      const body = (request.body ?? {}) as { reason?: string };
      const ok = await manager.approve(request.params.id, undefined, body.reason);
      if (!ok) return sendError(reply, 404, 'Approval request not found or already decided');
      return { approved: true };
    }
  );

  /**
   * POST /api/v1/training/approvals/:id/reject
   * Reject a pending human approval request.
   */
  app.post(
    '/api/v1/training/approvals/:id/reject',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      const manager = secureYeoman.getPipelineApprovalManager();
      if (!manager) return sendError(reply, 503, 'Approval manager not available');

      const body = (request.body ?? {}) as { reason?: string };
      const ok = await manager.reject(request.params.id, undefined, body.reason);
      if (!ok) return sendError(reply, 404, 'Approval request not found or already decided');
      return { rejected: true };
    }
  );

  // ── Pipeline Lineage endpoints (Phase 73) ─────────────────────────────────

  /**
   * GET /api/v1/training/lineage
   * List recent pipeline lineage records (most recent first).
   */
  app.get('/api/v1/training/lineage', async (_request, reply: FastifyReply) => {
    const lineage = secureYeoman.getPipelineLineageStorage();
    if (!lineage) return sendError(reply, 503, 'Pipeline lineage storage not available');

    const records = await lineage.list(50);
    return { records };
  });

  /**
   * GET /api/v1/training/lineage/:runId
   * Get lineage record for a specific workflow run.
   */
  app.get(
    '/api/v1/training/lineage/:runId',
    async (request: FastifyRequest<{ Params: { runId: string } }>, reply: FastifyReply) => {
      const lineage = secureYeoman.getPipelineLineageStorage();
      if (!lineage) return sendError(reply, 503, 'Pipeline lineage storage not available');

      const record = await lineage.getByRunId(request.params.runId);
      if (!record) return sendError(reply, 404, 'Lineage record not found');
      return record;
    }
  );
}
