/**
 * License routes — expose license status and allow key updates at runtime.
 *
 * Supports two key types:
 *   - Ed25519 keys (header.payload.signature) — offline validation
 *   - LemonSqueezy keys (UUID format) — online validation via LS API, cached
 *
 *   GET  /api/v1/license/status   — returns tier, features, expiry (public read)
 *   POST /api/v1/license/key      — set a new license key (admin write)
 */

import type { FastifyInstance } from 'fastify';
import type { SecureYeoman } from '../secureyeoman.js';
import { LicenseManager } from './license-manager.js';
import { LemonSqueezyValidator } from './lemonsqueezy-validator.js';
import { sendError } from '../utils/errors.js';

interface LicenseRouteDeps {
  secureYeoman: SecureYeoman;
}

export function registerLicenseRoutes(app: FastifyInstance, deps: LicenseRouteDeps): void {
  const { secureYeoman } = deps;

  // Lazy-init LS validator with config from env
  let lsValidator: LemonSqueezyValidator | null = null;
  function getLSValidator(): LemonSqueezyValidator {
    if (!lsValidator) {
      const variantTierMap: Record<string, string> = {};
      const proVar = process.env.LEMONSQUEEZY_PRO_VARIANT_ID;
      const soloVar = process.env.LEMONSQUEEZY_SOLOPRENEUR_VARIANT_ID;
      const entVar = process.env.LEMONSQUEEZY_ENTERPRISE_VARIANT_ID;
      if (proVar) variantTierMap[proVar] = 'pro';
      if (soloVar) variantTierMap[soloVar] = 'enterprise';
      if (entVar) variantTierMap[entVar] = 'enterprise';

      lsValidator = new LemonSqueezyValidator({
        variantTierMap: variantTierMap as any,
      });

      // Restore cache from brain.meta if available
      try {
        const brainStorage = secureYeoman.getBrainStorage();
        if (brainStorage) {
          void brainStorage.getMeta('license:ls-cache').then((cached) => {
            if (cached) {
              try {
                lsValidator!.restoreCache(JSON.parse(cached));
              } catch {
                // Ignore corrupt cache
              }
            }
          });
        }
      } catch {
        // Non-fatal
      }
    }
    return lsValidator;
  }

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

    if (LemonSqueezyValidator.isLemonSqueezyKey(key)) {
      // ── LemonSqueezy key: validate via API ──
      const validator = getLSValidator();
      const result = await validator.activate(key);

      if (!result.valid || !result.claims) {
        return sendError(reply, 422, `Invalid license key: ${result.error ?? 'validation failed'}`);
      }

      // Persist the LS key and cached result
      process.env.SECUREYEOMAN_LICENSE_KEY = key;
      secureYeoman.reloadLicenseKeyFromClaims(result.claims);
      try {
        const brainStorage = secureYeoman.getBrainStorage();
        if (brainStorage) {
          await brainStorage.setMeta('license:key', key);
          await brainStorage.setMeta('license:key-type', 'lemonsqueezy');
          await brainStorage.setMeta('license:ls-cache', JSON.stringify(result));
        }
      } catch {
        // Non-fatal
      }

      return reply.send(secureYeoman.getLicenseManager().toStatusObject());
    }

    // ── Ed25519 key: offline validation ──
    try {
      LicenseManager.validate(key);
    } catch (err) {
      return sendError(reply, 422, `Invalid license key: ${(err as Error).message}`);
    }

    process.env.SECUREYEOMAN_LICENSE_KEY = key;
    secureYeoman.reloadLicenseKey(key);
    try {
      const brainStorage = secureYeoman.getBrainStorage();
      if (brainStorage) {
        await brainStorage.setMeta('license:key', key);
        await brainStorage.setMeta('license:key-type', 'ed25519');
      }
    } catch {
      // Non-fatal
    }

    return reply.send(secureYeoman.getLicenseManager().toStatusObject());
  });
}
