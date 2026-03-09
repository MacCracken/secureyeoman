/**
 * TEE Attestation REST Routes — Phase 129B
 *
 * Exposes TEE provider information, attestation history,
 * and on-demand async verification via REST.
 */

import type { FastifyInstance } from 'fastify';
import { TeeAttestationVerifier } from './tee-attestation.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';

export interface TeeRouteDeps {
  teeVerifier: TeeAttestationVerifier;
  secureYeoman?: SecureYeoman;
}

export function registerTeeRoutes(app: FastifyInstance, deps: TeeRouteDeps): void {
  const { teeVerifier, secureYeoman } = deps;
  const featureGuardOpts = licenseGuard('confidential_computing', secureYeoman);

  // ── GET /api/v1/security/tee/providers ──────────────────────────────────

  app.get('/api/v1/security/tee/providers', async (_req, reply) => {
    try {
      const providers = teeVerifier.getTeeCapableProviders();
      const hardware = TeeAttestationVerifier.detectHardware();
      const cache = teeVerifier.getCacheStats();
      return reply.send({ providers, hardware, cache });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── GET /api/v1/security/tee/attestation/:provider ──────────────────────

  app.get('/api/v1/security/tee/attestation/:provider', async (req, reply) => {
    const { provider } = req.params as { provider: string };
    try {
      const history = teeVerifier.getAttestationHistory(provider, 10);
      const info = teeVerifier.getProviderTeeInfo(provider);
      if (!info && history.length === 0) {
        return sendError(reply, 404, `Unknown provider: ${provider}`);
      }
      return reply.send({ provider, info, history });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });

  // ── POST /api/v1/security/tee/verify/:provider ─────────────────────────

  app.post('/api/v1/security/tee/verify/:provider', featureGuardOpts, async (req, reply) => {
    const { provider } = req.params as { provider: string };
    try {
      const { allowed, result } = await teeVerifier.verifyAsync(provider);
      return reply.send({ allowed, result });
    } catch (err) {
      return sendError(reply, 500, toErrorMessage(err));
    }
  });
}
