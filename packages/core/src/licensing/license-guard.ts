/**
 * License Guard — Fastify preHandler hook factory for licensed feature gating.
 *
 * Usage:
 *   app.post('/api/v1/admin/tenants', {
 *     preHandler: [requiresLicense('multi_tenancy', () => secureYeoman.getLicenseManager())],
 *   }, handler);
 *
 *   // Or use the convenience helper that handles optional SecureYeoman:
 *   const featureGuardOpts = licenseGuard('multi_tenancy', secureYeoman);
 *   app.post('/api/v1/admin/tenants', featureGuardOpts, handler);
 *
 * When enforcement is disabled (default), the hook always passes through.
 * When enforcement is enabled and the feature is not licensed, returns 402.
 */

import type { FastifyReply, FastifyRequest, preHandlerHookHandler } from 'fastify';
import type { LicensedFeature, LicenseManager } from './license-manager.js';
import { sendError } from '../utils/errors.js';

/** @deprecated Use LicensedFeature */
export type { LicensedFeature as EnterpriseFeature } from './license-manager.js';

export function requiresLicense(
  feature: LicensedFeature,
  getLicenseManager: () => LicenseManager
): preHandlerHookHandler {
  return (_request: FastifyRequest, reply: FastifyReply, done: (err?: Error) => void) => {
    const lm = getLicenseManager();
    if (lm.isFeatureAllowed(feature)) {
      done();
      return;
    }

    sendError(reply, 402, 'License required', { extra: { feature, tier: lm.getTier() } });
  };
}

/**
 * Convenience helper that builds Fastify route options with a license preHandler.
 * When `secureYeoman` is nullish, returns an empty object (no guard).
 */
export function licenseGuard(
  feature: LicensedFeature,
  secureYeoman: { getLicenseManager(): LicenseManager } | null | undefined
): Record<string, unknown> {
  return secureYeoman
    ? { preHandler: [requiresLicense(feature, () => secureYeoman.getLicenseManager())] }
    : {};
}
