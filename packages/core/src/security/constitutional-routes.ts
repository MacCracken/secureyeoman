/**
 * Constitutional AI REST endpoints.
 *
 * GET  /api/v1/security/constitutional/principles — list active principles
 * POST /api/v1/security/constitutional/critique    — critique a response
 * POST /api/v1/security/constitutional/revise      — critique + revise a response
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { sendError } from '../utils/errors.js';
import { ConstitutionalEngine } from './constitutional.js';

export function registerConstitutionalRoutes(
  app: FastifyInstance,
  secureYeoman: SecureYeoman
): void {
  const config = secureYeoman.getConfig().security.constitutional;
  if (!config.enabled) return;

  let engine: ConstitutionalEngine | null = null;

  function getEngine(): ConstitutionalEngine {
    if (!engine) {
      const aiClient = secureYeoman.getAIClient();
      engine = new ConstitutionalEngine(config, {
        logger: secureYeoman.getLogger(),
        chat: async (msgs, opts) => {
          const resp = await aiClient.chat({
            messages: msgs.map((m) => ({ role: m.role, content: m.content })),
            model: opts?.model,
            temperature: opts?.temperature,
            stream: false,
          });
          return resp.content;
        },
        getIntentBoundaries: () => {
          const intentMgr = secureYeoman.getIntentManager?.();
          if (!intentMgr) return [];
          const doc = intentMgr.getActiveIntent?.();
          return doc?.hardBoundaries ?? [];
        },
      });
    }
    return engine;
  }

  // GET /api/v1/security/constitutional/principles
  app.get(
    '/api/v1/security/constitutional/principles',
    async (_req: FastifyRequest, reply: FastifyReply) => {
      const eng = getEngine();
      return reply.send({
        enabled: eng.isEnabled,
        mode: config.mode,
        principles: eng.getPrinciples().map((p) => ({
          id: p.id,
          name: p.name,
          description: p.description,
          weight: p.weight,
        })),
      });
    }
  );

  // POST /api/v1/security/constitutional/critique
  app.post(
    '/api/v1/security/constitutional/critique',
    async (
      req: FastifyRequest<{ Body: { prompt: string; response: string } }>,
      reply: FastifyReply
    ) => {
      const { prompt, response } = req.body ?? {};
      if (!prompt || !response) {
        return sendError(reply, 400, 'prompt and response are required');
      }

      const eng = getEngine();
      const critiques = await eng.critique(prompt, response);
      return reply.send({
        critiques,
        violationCount: critiques.filter((c) => c.violated).length,
      });
    }
  );

  // POST /api/v1/security/constitutional/revise
  app.post(
    '/api/v1/security/constitutional/revise',
    async (
      req: FastifyRequest<{ Body: { prompt: string; response: string } }>,
      reply: FastifyReply
    ) => {
      const { prompt, response } = req.body ?? {};
      if (!prompt || !response) {
        return sendError(reply, 400, 'prompt and response are required');
      }

      const eng = getEngine();
      const revision = await eng.critiqueAndRevise(prompt, response);

      // Record preference pair if configured
      if (revision.revised && config.recordPreferencePairs) {
        try {
          const prefMgr = secureYeoman.getPreferenceManager?.();
          if (prefMgr) {
            await prefMgr.recordAnnotation({
              prompt,
              chosen: revision.revisedResponse,
              rejected: revision.originalResponse,
              source: 'constitutional',
              metadata: {
                critiques: revision.critiques
                  .filter((c) => c.violated)
                  .map((c) => ({ id: c.principleId, severity: c.severity })),
                round: revision.revisionRound,
                source: 'api',
              },
            });
          }
        } catch {
          // Non-critical
        }
      }

      return reply.send(revision);
    }
  );
}
