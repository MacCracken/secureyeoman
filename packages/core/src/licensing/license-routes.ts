/**
 * License routes — expose license status and allow key updates at runtime.
 *
 *   GET  /api/v1/license/status   — returns tier, features, expiry (public read)
 *   POST /api/v1/license/key      — set a new license key (admin write)
 */

import type { FastifyInstance } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { LicenseManager } from './license-manager.js';
import { sendError } from '../utils/errors.js';

interface LicenseRouteDeps {
  secureYeoman: SecureYeoman;
}

export function registerLicenseRoutes(app: FastifyInstance, deps: LicenseRouteDeps): void {
  const { secureYeoman } = deps;

  // GET /api/v1/license/status
  app.get('/api/v1/license/status', async (_req, reply) => {
    const lm = secureYeoman.getLicenseManager();
    return reply.send(lm.toStatusObject());
  });

  // POST /api/v1/license/key  { key: string }
  app.post('/api/v1/license/key', async (req, reply) => {
    const body = req.body as { key?: unknown };
    if (typeof body?.key !== 'string' || !body.key.trim()) {
      return sendError(reply, 400, 'key is required');
    }

    const key = body.key.trim();

    // Validate before accepting
    try {
      LicenseManager.validate(key);
    } catch (err) {
      return sendError(reply, 422, `Invalid license key: ${(err as Error).message}`);
    }

    // Persist to env (runtime only) and reinitialise the manager
    process.env.SECUREYEOMAN_LICENSE_KEY = key;
    secureYeoman.reloadLicenseKey(key);

    return reply.send(secureYeoman.getLicenseManager().toStatusObject());
  });
}
