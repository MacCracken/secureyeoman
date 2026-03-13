/**
 * Break-Glass Emergency Access Routes
 *
 * POST /api/v1/auth/break-glass                — activate emergency access (no auth required)
 * GET  /api/v1/admin/break-glass/sessions      — list sessions (admin + enterprise)
 * POST /api/v1/admin/break-glass/revoke/:id    — revoke a session (admin + enterprise)
 * POST /api/v1/admin/break-glass/rotate        — generate a new recovery key (admin + enterprise)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { BreakGlassManager } from './break-glass.js';
import { BreakGlassError } from './break-glass.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';
import { licenseGuard } from '../licensing/license-guard.js';

// ── Rate limiting constants ──────────────────────────────────────────

/** Max break-glass activation attempts per IP per sliding window. */
const BREAK_GLASS_RATE_LIMIT_MAX = 5;
const BREAK_GLASS_RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000; // 15 minutes

// ── In-memory rate limiter for the unauthenticated endpoint ──────────

interface RateLimitState {
  count: number;
  windowStart: number;
}

const rateLimitMap = new Map<string, RateLimitState>();

/** Reset rate limit state (for testing only). */
export function resetBreakGlassRateLimit(): void {
  rateLimitMap.clear();
}

function checkRateLimit(ip: string): boolean {
  const now = Date.now();
  let state = rateLimitMap.get(ip);

  if (!state || now - state.windowStart > BREAK_GLASS_RATE_LIMIT_WINDOW_MS) {
    state = { count: 0, windowStart: now };
  }

  state.count++;
  rateLimitMap.set(ip, state);

  return state.count <= BREAK_GLASS_RATE_LIMIT_MAX;
}

// ── Route options ────────────────────────────────────────────────────

export interface BreakGlassRoutesOptions {
  breakGlassManager: BreakGlassManager;
  secureYeoman?: SecureYeoman;
}

// ── Registration ─────────────────────────────────────────────────────

export function registerBreakGlassRoutes(
  app: FastifyInstance,
  opts: BreakGlassRoutesOptions
): void {
  const { breakGlassManager, secureYeoman } = opts;
  const adminGuardOpts = licenseGuard('break_glass', secureYeoman);

  // ── POST /api/v1/auth/break-glass ────────────────────────────────
  // Unauthenticated emergency activation. Heavily rate-limited.

  app.post(
    '/api/v1/auth/break-glass',
    async (request: FastifyRequest<{ Body: { recoveryKey?: string } }>, reply: FastifyReply) => {
      const ip = request.ip ?? 'unknown';

      if (!checkRateLimit(ip)) {
        return sendError(reply, 429, 'Too many break-glass activation attempts. Try again later.');
      }

      const { recoveryKey } = request.body ?? {};
      if (!recoveryKey || typeof recoveryKey !== 'string') {
        return sendError(reply, 400, 'recoveryKey is required');
      }

      try {
        const result = await breakGlassManager.activateBreakGlass(recoveryKey, ip);
        return reply.code(200).send({
          token: result.token,
          expiresAt: result.expiresAt,
          sessionId: result.sessionId,
          tokenType: 'Bearer',
          message:
            'Break-glass session activated. This token expires in 1 hour. Rotate your recovery key after recovery.',
        });
      } catch (err) {
        if (err instanceof BreakGlassError) {
          return sendError(reply, err.statusCode, err.message);
        }
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/admin/break-glass/sessions ───────────────────────
  // List all sessions for audit review. Requires admin auth + enterprise license.

  app.get(
    '/api/v1/admin/break-glass/sessions',
    adminGuardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const sessions = await breakGlassManager.listSessions();
        return reply.send({ sessions });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/admin/break-glass/revoke/:id ────────────────────
  // Revoke a specific session. Requires admin auth.

  app.post(
    '/api/v1/admin/break-glass/revoke/:id',
    adminGuardOpts,
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const { id } = request.params;
      try {
        const ok = await breakGlassManager.revokeSession(id);
        if (!ok) return sendError(reply, 404, 'Session not found or already revoked');
        return reply.code(200).send({ revoked: true, sessionId: id });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/admin/break-glass/rotate ────────────────────────
  // Generate a new recovery key (rotates the old one). Returns raw key ONCE.

  app.post(
    '/api/v1/admin/break-glass/rotate',
    adminGuardOpts,
    async (_request: FastifyRequest, reply: FastifyReply) => {
      try {
        const rawKey = await breakGlassManager.generateRecoveryKey();
        return reply.code(201).send({
          recoveryKey: rawKey,
          message:
            'New recovery key generated. Store it securely offline. This is the ONLY time it will be shown.',
        });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
