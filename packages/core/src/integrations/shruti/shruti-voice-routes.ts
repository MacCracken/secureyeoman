/**
 * Shruti Voice Routes — REST endpoints for voice-driven DAW control.
 *
 * POST /api/v1/shruti/voice/command  — text transcript → execute → confirmation
 * POST /api/v1/shruti/voice/parse    — text transcript → parsed intent (no execution)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { ShrutiVoiceBridge } from './shruti-voice-bridge.js';
import { parseVoiceInput } from './voice-intent-parser.js';
import { sendError } from '../../utils/errors.js';

export interface ShrutiVoiceRouteDeps {
  voiceBridge: ShrutiVoiceBridge;
}

export function registerShrutiVoiceRoutes(
  app: FastifyInstance,
  deps: ShrutiVoiceRouteDeps
): void {
  const { voiceBridge } = deps;

  // ── Execute a voice command ────────────────────────────────────────

  app.post(
    '/api/v1/shruti/voice/command',
    async (
      req: FastifyRequest<{ Body: { transcript: string } }>,
      reply: FastifyReply
    ) => {
      const { transcript } = req.body ?? {};

      if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
        return sendError(reply, 400, 'transcript is required');
      }

      const result = await voiceBridge.processTranscript(transcript.trim());

      return reply.send({
        executed: result.executed,
        confirmation: result.confirmation,
        intent: {
          action: result.intent.action.kind,
          confidence: result.intent.confidence,
        },
        error: result.error ?? null,
      });
    }
  );

  // ── Parse only (no execution) ──────────────────────────────────────

  app.post(
    '/api/v1/shruti/voice/parse',
    async (
      req: FastifyRequest<{ Body: { transcript: string } }>,
      reply: FastifyReply
    ) => {
      const { transcript } = req.body ?? {};

      if (!transcript || typeof transcript !== 'string' || transcript.trim().length === 0) {
        return sendError(reply, 400, 'transcript is required');
      }

      const intent = parseVoiceInput(transcript.trim());

      return reply.send({
        action: intent.action,
        confidence: intent.confidence,
        original: intent.original,
      });
    }
  );
}
