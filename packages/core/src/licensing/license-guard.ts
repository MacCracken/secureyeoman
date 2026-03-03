/**
 * License Guard — Fastify preHandler hook factory for enterprise feature gating.
 *
 * Usage:
 *   app.post('/api/v1/admin/tenants', {
 *     preHandler: [requiresLicense('multi_tenancy', () => secureYeoman.getLicenseManager())],
 *   }, handler);
 *
 * When enforcement is disabled (default), the hook always passes through.
 * When enforcement is enabled and the feature is not licensed, returns 402.
 */

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { EnterpriseFeature, LicenseManager } from './license-manager.js';

export function requiresLicense(
  feature: EnterpriseFeature,
  getLicenseManager: () => LicenseManager
): preHandlerHookHandler {
  return (_request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    const lm = getLicenseManager();
    if (lm.isFeatureAllowed(feature)) {
      done();
      return;
    }

    reply.code(402).send({
      error: 'enterprise_license_required',
      feature,
      tier: lm.getTier(),
    });
  };
}
