/**
 * Inline Completion Routes — Copilot-style ghost text suggestions.
 *
 * POST /api/v1/ai/inline-complete — Returns a code completion given prefix/suffix context.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { getLogger } from '../logging/logger.js';

interface InlineCompleteBody {
  prefix: string;
  suffix: string;
  language: string;
  personalityId?: string;
}

export interface InlineCompleteOptions {
  aiClient: {
    complete(
      prompt: string,
      options?: { maxTokens?: number; temperature?: number; stop?: string[] }
    ): Promise<string>;
  };
  personalityManager?: {
    getById(id: string): Promise<{ systemPrompt?: string } | null>;
  };
}

export function registerInlineCompleteRoutes(
  app: FastifyInstance,
  opts: InlineCompleteOptions
): void {
  const log = getLogger();

  app.post(
    '/api/v1/ai/inline-complete',
    async (request: FastifyRequest<{ Body: InlineCompleteBody }>, reply: FastifyReply) => {
      const { prefix, suffix, language, personalityId } = request.body ?? {};

      if (typeof prefix !== 'string') {
        return sendError(reply, 400, 'prefix is required');
      }
      if (typeof suffix !== 'string') {
        return sendError(reply, 400, 'suffix is required');
      }

      // Limit context size to avoid excessive token usage
      const maxContextChars = 4000;
      const trimmedPrefix = prefix.slice(-maxContextChars);
      const trimmedSuffix = suffix.slice(0, maxContextChars);

      try {
        // Build a fill-in-the-middle style prompt
        let systemContext = '';
        if (personalityId && opts.personalityManager) {
          const personality = await opts.personalityManager.getById(personalityId);
          if (personality?.systemPrompt) {
            systemContext = `You are a coding assistant with the following persona:\n${personality.systemPrompt.slice(0, 500)}\n\n`;
          }
        }

        const prompt = [
          systemContext,
          `Complete the following ${language || 'code'} at the cursor position. `,
          'Return ONLY the completion text, no explanation, no markdown fences.\n\n',
          `<prefix>\n${trimmedPrefix}</prefix>\n`,
          '<cursor/>\n',
          `<suffix>\n${trimmedSuffix}</suffix>`,
        ].join('');

        const completion = await opts.aiClient.complete(prompt, {
          maxTokens: 256,
          temperature: 0.2,
          stop: ['\n\n\n', '</suffix>', '<|endoftext|>'],
        });

        return { completion: completion.trim() };
      } catch (err) {
        log.error('Inline completion failed', { error: toErrorMessage(err) });
        return sendError(reply, 500, 'Completion failed');
      }
    }
  );
}
