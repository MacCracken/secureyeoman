/**
 * Access Review Routes (enterprise)
 *
 * GET  /api/v1/security/access-review/entitlements          — entitlement report
 * POST /api/v1/security/access-review/campaigns             — create campaign
 * GET  /api/v1/security/access-review/campaigns             — list campaigns
 * GET  /api/v1/security/access-review/campaigns/:id         — campaign detail
 * POST /api/v1/security/access-review/campaigns/:id/decisions  — submit decision
 * POST /api/v1/security/access-review/campaigns/:id/close   — close campaign
 *
 * All routes gated by licenseGuard('compliance_governance').
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../../utils/errors.js';
import { licenseGuard } from '../../licensing/license-guard.js';
import type { SecureYeoman } from '../../secureyeoman.js';
import type { AccessReviewManager } from './access-review-manager.js';
import type { CampaignStatus, DecisionValue } from './access-review-storage.js';

export interface AccessReviewRoutesOptions {
  manager: AccessReviewManager;
  secureYeoman?: SecureYeoman;
}

export function registerAccessReviewRoutes(
  app: FastifyInstance,
  opts: AccessReviewRoutesOptions
): void {
  const { manager, secureYeoman } = opts;
  const guard = licenseGuard('compliance_governance', secureYeoman);

  // ── GET /api/v1/security/access-review/entitlements ──────────────────────

  app.get(
    '/api/v1/security/access-review/entitlements',
    guard,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const entries = await manager.getEntitlementReport();
        return reply.send({ entitlements: entries, total: entries.length });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/security/access-review/campaigns ────────────────────────

  app.post(
    '/api/v1/security/access-review/campaigns',
    guard,
    async (
      request: FastifyRequest<{
        Body: {
          name: string;
          reviewerIds: string[];
          scope?: string;
          createdBy?: string;
          expiryDays?: number;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { name, reviewerIds, scope, createdBy, expiryDays } = request.body ?? {};
      if (!name) return sendError(reply, 400, 'name is required');
      if (!reviewerIds || reviewerIds.length === 0) {
        return sendError(reply, 400, 'reviewerIds must be a non-empty array');
      }
      try {
        const campaign = await manager.createCampaign(name, reviewerIds, {
          scope,
          createdBy,
          expiryMs: expiryDays ? expiryDays * 24 * 60 * 60 * 1000 : undefined,
        });
        return reply.code(201).send({ campaign });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/security/access-review/campaigns ────────────────────────

  app.get(
    '/api/v1/security/access-review/campaigns',
    guard,
    async (request: FastifyRequest<{ Querystring: { status?: string } }>, reply: FastifyReply) => {
      try {
        const validStatuses: CampaignStatus[] = ['open', 'in_review', 'closed', 'expired'];
        const statusFilter = request.query.status as CampaignStatus | undefined;
        if (statusFilter && !validStatuses.includes(statusFilter)) {
          return sendError(
            reply,
            400,
            `Invalid status. Must be one of: ${validStatuses.join(', ')}`
          );
        }
        const campaigns = await manager.listCampaigns(
          statusFilter ? { status: statusFilter } : undefined
        );
        return reply.send({ campaigns, total: campaigns.length });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/security/access-review/campaigns/:id ────────────────────

  app.get(
    '/api/v1/security/access-review/campaigns/:id',
    guard,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      try {
        const campaign = await manager.getCampaign(request.params.id);
        if (!campaign) return sendError(reply, 404, 'Campaign not found');
        return reply.send({ campaign });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/security/access-review/campaigns/:id/decisions ──────────

  app.post(
    '/api/v1/security/access-review/campaigns/:id/decisions',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: {
          entitlementId: string;
          decision: string;
          reviewerId: string;
          justification?: string;
        };
      }>,
      reply: FastifyReply
    ) => {
      const { entitlementId, decision, reviewerId, justification } = request.body ?? {};
      if (!entitlementId) return sendError(reply, 400, 'entitlementId is required');
      if (!decision) return sendError(reply, 400, 'decision is required');
      if (!reviewerId) return sendError(reply, 400, 'reviewerId is required');

      const validDecisions: DecisionValue[] = ['approve', 'revoke', 'flag'];
      if (!validDecisions.includes(decision as DecisionValue)) {
        return sendError(
          reply,
          400,
          `Invalid decision. Must be one of: ${validDecisions.join(', ')}`
        );
      }

      try {
        const recorded = await manager.submitDecision(
          request.params.id,
          entitlementId,
          decision as DecisionValue,
          reviewerId,
          justification
        );
        return reply.code(201).send({ decision: recorded });
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        if (msg.includes('closed') || msg.includes('expired') || msg.includes('not an assigned')) {
          return sendError(reply, 409, msg);
        }
        return sendError(reply, 400, msg);
      }
    }
  );

  // ── POST /api/v1/security/access-review/campaigns/:id/close ──────────────

  app.post(
    '/api/v1/security/access-review/campaigns/:id/close',
    guard,
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { closedBy?: string };
      }>,
      reply: FastifyReply
    ) => {
      const { closedBy } = request.body ?? {};
      try {
        const campaign = await manager.closeCampaign(request.params.id, closedBy);
        return reply.send({ campaign });
      } catch (err) {
        const msg = toErrorMessage(err);
        if (msg.includes('not found')) return sendError(reply, 404, msg);
        if (msg.includes('already closed') || msg.includes('expired')) {
          return sendError(reply, 409, msg);
        }
        return sendError(reply, 500, msg);
      }
    }
  );
}
