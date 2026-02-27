/**
 * Training Routes — Export conversation and memory data as structured training datasets.
 *
 * Supported output formats:
 *   sharegpt    — ShareGPT JSONL (recommended for chat fine-tuning)
 *   instruction — Alpaca-style instruction JSONL
 *   raw         — Plain text corpus (one conversation per block)
 *
 * All exports stream line-by-line to avoid buffering large datasets in memory.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError } from '../utils/errors.js';

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
    JSON.stringify({ id: conversationId, personality_id: personalityId, conversations: converted }) +
    '\n'
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

function toRawText(
  conversationId: string,
  messages: { role: string; content: string }[]
): string {
  const parts = [`=== Conversation ${conversationId} ===`];
  for (const m of messages) {
    parts.push(`[${m.role.toUpperCase()}]: ${m.content}`);
  }
  return parts.join('\n') + '\n\n';
}

// ── Route registration ─────────────────────────────────────────────────────

export function registerTrainingRoutes(
  app: FastifyInstance,
  opts: TrainingRoutesOptions
): void {
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

      const body = (request.body as ExportBody) ?? {};
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
}
