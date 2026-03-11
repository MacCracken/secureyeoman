/**
 * Ecosystem service discovery routes.
 *
 * Exposes REST endpoints for the dashboard to probe, enable, and disable
 * ecosystem services (Agnostic, AGNOS) on demand instead of at startup.
 */

import type { FastifyInstance } from 'fastify';
import { sendError } from '../utils/errors.js';
import type { ServiceDiscoveryManager, EcosystemServiceId } from './service-discovery.js';
import { AgnosClient } from './agnos/agnos-client.js';
import type { SecureLogger } from '../logging/logger.js';

export interface EcosystemRoutesOptions {
  discoveryManager: ServiceDiscoveryManager;
  logger: SecureLogger;
}

export function registerEcosystemRoutes(app: FastifyInstance, opts: EcosystemRoutesOptions): void {
  const { discoveryManager, logger } = opts;

  // GET /api/v1/ecosystem/services — list all ecosystem services
  app.get('/api/v1/ecosystem/services', async (_req, reply) => {
    const services = discoveryManager.getServices();
    return reply.send({ services });
  });

  // GET /api/v1/ecosystem/services/:id — get a single service
  app.get('/api/v1/ecosystem/services/:id', async (req, reply) => {
    const { id } = req.params as { id: string };
    const service = discoveryManager.getService(id as EcosystemServiceId);
    if (!service) {
      return sendError(reply, 404, `Unknown ecosystem service: ${id}`);
    }
    return reply.send(service);
  });

  // POST /api/v1/ecosystem/services/:id/probe — probe health endpoint
  app.post('/api/v1/ecosystem/services/:id/probe', async (req, reply) => {
    const { id } = req.params as { id: string };
    const service = discoveryManager.getService(id as EcosystemServiceId);
    if (!service) {
      return sendError(reply, 404, `Unknown ecosystem service: ${id}`);
    }
    const result = await discoveryManager.probe(id as EcosystemServiceId);
    return reply.send(result);
  });

  // POST /api/v1/ecosystem/services/:id/enable — enable service and provision keys
  app.post('/api/v1/ecosystem/services/:id/enable', async (req, reply) => {
    const { id } = req.params as { id: string };
    const service = discoveryManager.getService(id as EcosystemServiceId);
    if (!service) {
      return sendError(reply, 404, `Unknown ecosystem service: ${id}`);
    }
    const result = await discoveryManager.enable(id as EcosystemServiceId);
    if (result.status === 'unreachable') {
      return sendError(reply, 502, `Service ${id} is unreachable`, {
        extra: { service: result },
      });
    }
    return reply.send(result);
  });

  // POST /api/v1/ecosystem/services/:id/disable — disable service and clear keys
  app.post('/api/v1/ecosystem/services/:id/disable', async (req, reply) => {
    const { id } = req.params as { id: string };
    const service = discoveryManager.getService(id as EcosystemServiceId);
    if (!service) {
      return sendError(reply, 404, `Unknown ecosystem service: ${id}`);
    }
    const result = await discoveryManager.disable(id as EcosystemServiceId);
    return reply.send(result);
  });

  // GET /api/v1/ecosystem/services/agnos/sandbox-profiles — fetch AGNOS sandbox profiles
  app.get('/api/v1/ecosystem/services/agnos/sandbox-profiles', async (_req, reply) => {
    const service = discoveryManager.getService('agnos');
    if (!service) {
      return sendError(reply, 404, 'AGNOS service not registered');
    }
    if (service.status !== 'connected') {
      return reply.send({ profiles: [], status: service.status });
    }
    try {
      const client = new AgnosClient({ runtimeUrl: service.url }, logger);
      const profiles = await client.listSandboxProfiles();
      return reply.send({ profiles });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      logger.warn({ error: message }, 'Failed to fetch AGNOS sandbox profiles');
      return sendError(reply, 502, `Failed to fetch sandbox profiles: ${message}`);
    }
  });
}
