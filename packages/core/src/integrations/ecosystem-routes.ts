/**
 * Ecosystem service discovery routes.
 *
 * Exposes REST endpoints for the dashboard to probe, enable, and disable
 * ecosystem services (Agnostic, AGNOS) on demand instead of at startup.
 */

import type { FastifyInstance } from 'fastify';
import { sendError } from '../utils/errors.js';
import type { ServiceDiscoveryManager, EcosystemServiceId } from './service-discovery.js';

export interface EcosystemRoutesOptions {
  discoveryManager: ServiceDiscoveryManager;
}

export function registerEcosystemRoutes(app: FastifyInstance, opts: EcosystemRoutesOptions): void {
  const { discoveryManager } = opts;

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
}
