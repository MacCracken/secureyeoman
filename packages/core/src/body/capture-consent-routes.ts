/**
 * Capture Consent Routes (Phase 108-D)
 *
 * REST endpoints for the consent workflow:
 *   POST /api/v1/capture/consent/request  — Request consent for a capture operation
 *   GET  /api/v1/capture/consent/pending  — List pending consents for current user
 *   GET  /api/v1/capture/consent/:id      — Get consent details
 *   POST /api/v1/capture/consent/:id/grant — Approve a consent request
 *   POST /api/v1/capture/consent/:id/deny  — Deny a consent request
 *   POST /api/v1/capture/consent/:id/revoke — Revoke active consent
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError } from '../utils/errors.js';
import type { ConsentManager } from './consent-manager.js';
import type { CaptureResource } from './types.js';

export interface CaptureConsentRoutesOpts {
  getConsentManager: () => ConsentManager | null;
}

export function registerCaptureConsentRoutes(
  app: FastifyInstance,
  opts: CaptureConsentRoutesOpts
): void {
  const { getConsentManager } = opts;

  function getAuthUser(request: FastifyRequest): { userId: string } {
    const authUser = (request as unknown as Record<string, unknown>).authUser as
      | { id?: string; userId?: string }
      | undefined;
    return { userId: authUser?.id ?? authUser?.userId ?? 'anonymous' };
  }

  // Request consent
  app.post(
    '/api/v1/capture/consent/request',
    async (
      request: FastifyRequest<{
        Body: {
          scope: { resource: CaptureResource; duration: number; purpose: string };
          userId?: string;
          timeoutMs?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const manager = getConsentManager();
      if (!manager) return sendError(reply, 503, 'Consent manager not available');

      const { userId: authUserId } = getAuthUser(request);
      const { scope, userId, timeoutMs } = request.body ?? {};

      if (!scope?.resource || !scope?.purpose) {
        return sendError(reply, 400, 'scope.resource and scope.purpose are required');
      }

      try {
        const consent = await manager.requestConsent(
          userId ?? authUserId,
          authUserId,
          {
            resource: scope.resource,
            duration: scope.duration ?? 60,
            quality: 'medium',
            purpose: scope.purpose,
          },
          `session-${Date.now()}`,
          timeoutMs
        );
        return reply.code(201).send(consent);
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // List pending consents for current user
  app.get('/api/v1/capture/consent/pending', async (request, reply: FastifyReply) => {
    const manager = getConsentManager();
    if (!manager) return sendError(reply, 503, 'Consent manager not available');

    const { userId } = getAuthUser(request);
    try {
      const pending = await manager.getPendingConsents(userId);
      return { consents: pending };
    } catch (err) {
      return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
    }
  });

  // Get consent details
  app.get(
    '/api/v1/capture/consent/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = getConsentManager();
      if (!manager) return sendError(reply, 503, 'Consent manager not available');

      try {
        const consent = await manager.getConsent(request.params.id);
        if (!consent) return sendError(reply, 404, 'Consent not found');
        return consent;
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // Grant consent
  app.post(
    '/api/v1/capture/consent/:id/grant',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = getConsentManager();
      if (!manager) return sendError(reply, 503, 'Consent manager not available');

      const { userId } = getAuthUser(request);
      try {
        const result = await manager.grantConsent(request.params.id, userId);
        if (!result.success) {
          return sendError(reply, 400, result.error ?? 'Grant failed');
        }
        return result.consent;
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // Deny consent
  app.post(
    '/api/v1/capture/consent/:id/deny',
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { reason?: string } }>,
      reply: FastifyReply
    ) => {
      const manager = getConsentManager();
      if (!manager) return sendError(reply, 503, 'Consent manager not available');

      const { userId } = getAuthUser(request);
      try {
        const result = await manager.denyConsent(
          request.params.id,
          userId,
          request.body?.reason ?? 'User denied'
        );
        if (!result.success) {
          return sendError(reply, 400, result.error ?? 'Deny failed');
        }
        return result.consent;
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );

  // Revoke consent
  app.post(
    '/api/v1/capture/consent/:id/revoke',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const manager = getConsentManager();
      if (!manager) return sendError(reply, 503, 'Consent manager not available');

      const { userId } = getAuthUser(request);
      try {
        const result = await manager.revokeConsent(request.params.id, userId);
        if (!result.success) {
          return sendError(reply, 400, result.error ?? 'Revoke failed');
        }
        return result.consent;
      } catch (err) {
        return reply.code(500).send({ error: err instanceof Error ? err.message : String(err) });
      }
    }
  );
}
