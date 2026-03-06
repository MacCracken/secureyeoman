/**
 * Sandbox Profile Routes — REST API for sandbox profile management.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { SandboxProfileRegistry } from './sandbox-profiles.js';
import { sendError } from '../utils/errors.js';

export interface SandboxProfileRouteOptions {
  profileRegistry: SandboxProfileRegistry;
}

export function registerSandboxProfileRoutes(
  app: FastifyInstance,
  opts: SandboxProfileRouteOptions
): void {
  const { profileRegistry } = opts;

  app.get('/api/v1/sandbox/profiles', async (_req: FastifyRequest, reply: FastifyReply) => {
    const profiles = profileRegistry.listProfiles();
    return reply.send({ items: profiles, total: profiles.length });
  });

  app.get(
    '/api/v1/sandbox/profiles/:name',
    async (req: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const profile = profileRegistry.getProfile(req.params.name);
      if (!profile) return sendError(reply, 404, 'Profile not found');
      return reply.send(profile);
    }
  );

  app.post('/api/v1/sandbox/profiles', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const body = req.body as any;
      if (!body.label) return sendError(reply, 400, 'label is required');
      const profile = profileRegistry.saveCustomProfile({
        name: 'custom',
        label: body.label,
        description: body.description ?? '',
        enabled: body.enabled ?? true,
        technology: body.technology ?? 'auto',
        filesystem: body.filesystem ?? {},
        resources: body.resources ?? {},
        network: body.network ?? {},
        credentialProxy: body.credentialProxy ?? {},
        toolRestrictions: body.toolRestrictions ?? {},
        tenantId: body.tenantId ?? 'default',
      });
      return reply.code(201).send(profile);
    } catch (err) {
      return sendError(reply, 400, (err as Error).message);
    }
  });

  app.delete(
    '/api/v1/sandbox/profiles/:label',
    async (req: FastifyRequest<{ Params: { label: string } }>, reply: FastifyReply) => {
      const deleted = profileRegistry.deleteCustomProfile(req.params.label);
      if (!deleted) return sendError(reply, 404, 'Custom profile not found');
      return reply.send({ ok: true });
    }
  );

  app.get(
    '/api/v1/sandbox/profiles/:name/config',
    async (req: FastifyRequest<{ Params: { name: string } }>, reply: FastifyReply) => {
      const profile = profileRegistry.getProfile(req.params.name);
      if (!profile) return sendError(reply, 404, 'Profile not found');
      return reply.send(profileRegistry.toManagerConfig(profile));
    }
  );
}
