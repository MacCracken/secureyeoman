/**
 * Federation Routes — endpoints for managing federation peers,
 * searching peer knowledge/marketplace, and personality bundle import/export.
 *
 * Two categories:
 *   - Authenticated outward routes (JWT/API-key via standard auth middleware)
 *   - Peer-incoming routes (shared-secret Bearer auth via custom preHandler)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { sendError, toErrorMessage } from '../utils/errors.js';
import { parsePagination } from '../utils/pagination.js';
import type { FederationManager } from './federation-manager.js';
import type { FederationStorage } from './federation-storage.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { requiresLicense } from '../licensing/license-guard.js';

export interface FederationRoutesOptions {
  federationManager: FederationManager;
  federationStorage: FederationStorage;
  brainManager?: {
    semanticSearch(query: string, opts?: { limit?: number }): Promise<unknown[]>;
  };
  marketplaceManager?: {
    search(query?: string, opts?: { origin?: string; limit?: number }): Promise<unknown[]>;
    getSkill(id: string): Promise<unknown | null>;
  };
  soulManager?: {
    getPersonality(id: string): Promise<unknown>;
    createPersonality(data: unknown): Promise<unknown>;
  };
  secureYeoman?: SecureYeoman;
}

/**
 * Validate the incoming federation Bearer token.
 * Returns true if authenticated, false if a 401 was already sent via reply.
 */
async function peerAuthPreHandler(
  request: FastifyRequest,
  reply: FastifyReply,
  federationManager: FederationManager
): Promise<boolean> {
  const authHeader = request.headers.authorization;
  if (!authHeader?.startsWith('Bearer ')) {
    await sendError(reply, 401, 'Missing federation Bearer token');
    return false;
  }
  const rawSecret = authHeader.slice(7);
  const peer = await federationManager.validateIncomingSecret(rawSecret);
  if (!peer) {
    await sendError(reply, 401, 'Invalid federation secret');
    return false;
  }
  // Attach peer to request for downstream use
  (request as any).federationPeer = peer;
  return true;
}

export function registerFederationRoutes(
  app: FastifyInstance,
  opts: FederationRoutesOptions
): void {
  const { federationManager, federationStorage, brainManager, marketplaceManager, secureYeoman } =
    opts;
  const featureGuardOpts = (
    secureYeoman
      ? { preHandler: [requiresLicense('a2a_federation', () => secureYeoman.getLicenseManager())] }
      : {}
  ) as Record<string, unknown>;

  // ── Authenticated outward routes ──────────────────────────────────────────

  // List peers
  app.get('/api/v1/federation/peers', async (_request, reply) => {
    try {
      const peers = await federationManager.listPeers();
      return reply.send({ peers });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // Add peer
  app.post(
    '/api/v1/federation/peers',
    {
      ...featureGuardOpts,
      schema: {
        body: {
          type: 'object',
          required: ['url', 'name', 'sharedSecret'],
          additionalProperties: false,
          properties: {
            url: { type: 'string', minLength: 1 },
            name: { type: 'string', minLength: 1 },
            sharedSecret: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Body: { url: string; name: string; sharedSecret: string } }>,
      reply
    ) => {
      const { url, name, sharedSecret } = request.body;
      try {
        const peer = await federationManager.addPeer(url, name, sharedSecret);
        const { sharedSecretEnc: _enc, sharedSecretHash: _hash, ...safe } = peer as any;
        return reply.code(201).send({ peer: safe });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // Remove peer
  app.delete(
    '/api/v1/federation/peers/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        await federationManager.removePeer(request.params.id);
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Update peer features
  app.put(
    '/api/v1/federation/peers/:id/features',
    async (
      request: FastifyRequest<{
        Params: { id: string };
        Body: { knowledge?: boolean; marketplace?: boolean; personalities?: boolean };
      }>,
      reply
    ) => {
      try {
        await federationStorage.updateFeatures(request.params.id, request.body ?? {});
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Check peer health
  app.post(
    '/api/v1/federation/peers/:id/health',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply) => {
      try {
        const status = await federationManager.checkHealth(request.params.id);
        return reply.send({ status });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // List peer marketplace
  app.get(
    '/api/v1/federation/peers/:id/marketplace',
    async (
      request: FastifyRequest<{ Params: { id: string }; Querystring: { query?: string } }>,
      reply
    ) => {
      try {
        const skills = await federationManager.listPeerMarketplace(
          request.params.id,
          request.query.query
        );
        return reply.send({ skills });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Install skill from peer
  app.post(
    '/api/v1/federation/peers/:id/marketplace/:skillId/install',
    async (
      request: FastifyRequest<{
        Params: { id: string; skillId: string };
        Body: { personalityId?: string };
      }>,
      reply
    ) => {
      try {
        await federationManager.installSkillFromPeer(
          request.params.id,
          request.params.skillId,
          request.body?.personalityId
        );
        return reply.send({ ok: true });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Export personality bundle
  app.post(
    '/api/v1/federation/personalities/:id/export',
    {
      schema: {
        body: {
          type: 'object',
          required: ['passphrase'],
          additionalProperties: false,
          properties: {
            passphrase: { type: 'string', minLength: 1 },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{ Params: { id: string }; Body: { passphrase: string } }>,
      reply
    ) => {
      const { passphrase } = request.body;
      try {
        const bundle = await federationManager.exportPersonalityBundle(
          request.params.id,
          passphrase
        );
        return reply
          .header('Content-Type', 'application/octet-stream')
          .header(
            'Content-Disposition',
            `attachment; filename="personality-${request.params.id}.syi"`
          )
          .send(bundle);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // Import personality bundle
  app.post(
    '/api/v1/federation/personalities/import',
    {
      schema: {
        body: {
          type: 'object',
          required: ['bundle', 'passphrase'],
          additionalProperties: false,
          properties: {
            bundle: { type: 'string', minLength: 1 },
            passphrase: { type: 'string', minLength: 1 },
            nameOverride: { type: 'string' },
          },
        },
      },
    },
    async (
      request: FastifyRequest<{
        Body: { bundle: string; passphrase: string; nameOverride?: string };
      }>,
      reply
    ) => {
      const { bundle, passphrase, nameOverride } = request.body;
      try {
        const personality = await federationManager.importPersonalityBundle(
          Buffer.from(bundle, 'base64'),
          passphrase,
          nameOverride ? { nameOverride } : undefined
        );
        return reply.code(201).send({ personality });
      } catch (err) {
        return sendError(reply, 400, toErrorMessage(err));
      }
    }
  );

  // ── Peer-incoming routes (custom Bearer auth) ─────────────────────────────

  // Federated knowledge search — called by peer instances
  app.get('/api/v1/federation/knowledge/search', async (request, reply) => {
    const ok = await peerAuthPreHandler(request, reply, federationManager);
    if (!ok) return;
    if (!brainManager) return sendError(reply, 503, 'Brain manager not available');
    const qs = request.query as Record<string, string>;
    const query = qs.q ?? '';
    const { limit } = parsePagination(qs, { maxLimit: 100, defaultLimit: 10 });
    try {
      const entries = await brainManager.semanticSearch(query, { limit });
      return reply.send({ entries });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // Federated marketplace listing — called by peer instances
  app.get('/api/v1/federation/marketplace', async (request, reply) => {
    const ok = await peerAuthPreHandler(request, reply, federationManager);
    if (!ok) return;
    if (!marketplaceManager) return sendError(reply, 503, 'Marketplace manager not available');
    const qs = request.query as Record<string, string>;
    try {
      const skills = await marketplaceManager.search(qs.query, { limit: 100 });
      return reply.send({ skills });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // Federated skill detail — called by peer instances
  app.get(
    '/api/v1/federation/marketplace/:skillId',
    async (request: FastifyRequest<{ Params: { skillId: string } }>, reply) => {
      const ok = await peerAuthPreHandler(request, reply, federationManager);
      if (!ok) return;
      if (!marketplaceManager) return sendError(reply, 503, 'Marketplace manager not available');
      const { skillId } = request.params;
      try {
        const skill = await marketplaceManager.getSkill(skillId);
        if (!skill) return sendError(reply, 404, 'Skill not found');
        return reply.send(skill);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
