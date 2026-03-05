/**
 * DLP Routes — REST endpoints for Data Loss Prevention & Content Classification.
 */

import type { FastifyInstance } from 'fastify';
import type { ClassificationEngine } from './classification-engine.js';
import type { ClassificationStore } from './classification-store.js';
import type { ClassificationLevel } from './types.js';
import { sendError, toErrorMessage } from '../../utils/errors.js';

export interface DlpRouteDeps {
  classificationEngine: ClassificationEngine;
  classificationStore: ClassificationStore;
}

export function registerDlpRoutes(app: FastifyInstance, deps: DlpRouteDeps): void {
  const { classificationEngine, classificationStore } = deps;

  // ── POST /api/v1/security/dlp/classify ──────────────────────────────────

  app.post<{ Body: { text: string; contentId?: string; contentType?: string } }>(
    '/api/v1/security/dlp/classify',
    async (req, reply) => {
      try {
        const { text, contentId, contentType } = req.body;
        if (!text && text !== '') {
          return sendError(reply, 400, 'Missing required field: text');
        }
        const result = classificationEngine.classify(text);

        if (contentId && contentType) {
          await classificationStore.create({
            contentId,
            contentType: contentType as 'conversation' | 'document' | 'memory' | 'knowledge' | 'message',
            classificationLevel: result.level,
            autoLevel: result.autoLevel,
            manualOverride: false,
            overriddenBy: null,
            rulesTriggered: result.rulesTriggered,
            classifiedAt: Date.now(),
            tenantId: 'default',
          });
        }

        return reply.send({ classification: result });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/security/dlp/classifications/:contentId ─────────────────

  app.get<{ Params: { contentId: string }; Querystring: { contentType?: string } }>(
    '/api/v1/security/dlp/classifications/:contentId',
    async (req, reply) => {
      try {
        const { contentId } = req.params;
        const contentType = (req.query as { contentType?: string }).contentType ?? 'message';
        const record = await classificationStore.getByContentId(contentId, contentType);
        return reply.send({ classification: record });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── PUT /api/v1/security/dlp/classifications/:contentId ─────────────────

  app.put<{
    Params: { contentId: string };
    Body: { level: ClassificationLevel; contentType?: string };
  }>(
    '/api/v1/security/dlp/classifications/:contentId',
    async (req, reply) => {
      try {
        const { contentId } = req.params;
        const { level, contentType } = req.body;
        if (!level) {
          return sendError(reply, 400, 'Missing required field: level');
        }
        const updated = await classificationStore.override(
          contentId,
          contentType ?? 'message',
          level,
          (req as any).authUser?.userId ?? 'system'
        );
        return reply.send({ updated: updated > 0 });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/security/dlp/classifications ────────────────────────────

  app.get<{
    Querystring: { level?: ClassificationLevel; contentType?: string; limit?: string; offset?: string };
  }>('/api/v1/security/dlp/classifications', async (req, reply) => {
    try {
      const query = req.query as {
        level?: ClassificationLevel;
        contentType?: string;
        limit?: string;
        offset?: string;
      };
      const result = await classificationStore.list({
        level: query.level,
        contentType: query.contentType,
        limit: query.limit ? parseInt(query.limit, 10) : undefined,
        offset: query.offset ? parseInt(query.offset, 10) : undefined,
      });
      return reply.send(result);
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
