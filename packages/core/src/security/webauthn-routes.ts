/**
 * WebAuthn/FIDO2 Routes — passwordless and second-factor authentication.
 *
 * Community tier — no license gate required.
 *
 * POST /api/v1/auth/webauthn/register/options       — generate registration options (requires auth)
 * POST /api/v1/auth/webauthn/register/verify         — verify registration response (requires auth)
 * POST /api/v1/auth/webauthn/authenticate/options     — generate authentication options (no auth)
 * POST /api/v1/auth/webauthn/authenticate/verify      — verify authentication response (no auth)
 * GET  /api/v1/auth/webauthn/credentials              — list user's credentials (requires auth)
 * DELETE /api/v1/auth/webauthn/credentials/:id        — remove credential (requires auth)
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { WebAuthnManager } from './webauthn.js';
import { sendError, toErrorMessage } from '../utils/errors.js';
import type { SecureYeoman } from '../secureyeoman.js';

// ── Route options ────────────────────────────────────────────────────

export interface WebAuthnRoutesOptions {
  webAuthnManager: WebAuthnManager;
  secureYeoman?: SecureYeoman;
}

// ── Helper to extract auth user ──────────────────────────────────────

interface AuthenticatedRequest {
  authUser?: { userId: string; userName?: string };
}

function getAuthUser(request: FastifyRequest): { userId: string; userName: string } | null {
  const authReq = request as unknown as AuthenticatedRequest;
  if (!authReq.authUser?.userId) return null;
  return {
    userId: authReq.authUser.userId,
    userName: authReq.authUser.userName ?? authReq.authUser.userId,
  };
}

// ── Registration ─────────────────────────────────────────────────────

export function registerWebAuthnRoutes(app: FastifyInstance, opts: WebAuthnRoutesOptions): void {
  const { webAuthnManager: mgr } = opts;

  // ── POST /api/v1/auth/webauthn/register/options ─────────────────
  // Requires authentication — generates registration challenge for current user.

  app.post(
    '/api/v1/auth/webauthn/register/options',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = getAuthUser(request);
      if (!user) {
        return sendError(reply, 401, 'Authentication required');
      }

      try {
        const body = request.body as
          | { displayName?: string; existingCredentialIds?: string[] }
          | undefined;
        const options = await mgr.generateRegistrationOptions(
          user.userId,
          body?.displayName ?? user.userName,
          body?.existingCredentialIds
        );
        return reply.send(options);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/auth/webauthn/register/verify ─────────────────
  // Requires authentication — verifies the registration response from the authenticator.

  app.post(
    '/api/v1/auth/webauthn/register/verify',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = getAuthUser(request);
      if (!user) {
        return sendError(reply, 401, 'Authentication required');
      }

      const body = request.body as
        | {
            challenge?: string;
            response?: {
              id: string;
              rawId: string;
              type: string;
              response: { clientDataJSON: string; attestationObject: string };
            };
          }
        | undefined;

      if (!body?.challenge || !body?.response) {
        return sendError(reply, 400, 'challenge and response are required');
      }

      try {
        const result = await mgr.verifyRegistration(body.challenge, body.response);
        if (!result.verified) {
          return sendError(reply, 400, 'Registration verification failed');
        }
        return reply.code(201).send({ verified: true, credential: result.credential });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/auth/webauthn/authenticate/options ─────────────
  // No auth required — pre-login. Optionally accepts userId to scope allowCredentials.

  app.post(
    '/api/v1/auth/webauthn/authenticate/options',
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const body = request.body as { userId?: string } | undefined;
        const options = await mgr.generateAuthenticationOptions(body?.userId);
        return reply.send(options);
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── POST /api/v1/auth/webauthn/authenticate/verify ──────────────
  // No auth required — this IS the login. Verifies the authentication assertion.

  app.post(
    '/api/v1/auth/webauthn/authenticate/verify',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const body = request.body as
        | {
            challenge?: string;
            response?: {
              id: string;
              rawId: string;
              type: string;
              response: { clientDataJSON: string; authenticatorData: string; signature: string };
            };
          }
        | undefined;

      if (!body?.challenge || !body?.response) {
        return sendError(reply, 400, 'challenge and response are required');
      }

      try {
        const result = await mgr.verifyAuthentication(body.challenge, body.response);
        if (!result.verified) {
          return sendError(reply, 401, 'Authentication failed');
        }
        return reply.send({ verified: true, credentialId: result.credentialId });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── GET /api/v1/auth/webauthn/credentials ──────────────────────
  // Requires authentication — lists the current user's registered credentials.

  app.get(
    '/api/v1/auth/webauthn/credentials',
    async (request: FastifyRequest, reply: FastifyReply) => {
      const user = getAuthUser(request);
      if (!user) {
        return sendError(reply, 401, 'Authentication required');
      }

      try {
        const credentials = await mgr.listCredentials(user.userId);
        // Strip public keys from response for security
        const safe = credentials.map((c) => ({
          id: c.id,
          credentialId: c.credential_id,
          deviceType: c.device_type,
          backedUp: c.backed_up,
          transports: c.transports,
          displayName: c.display_name,
          createdAt: c.created_at,
          lastUsedAt: c.last_used_at,
        }));
        return reply.send({ credentials: safe });
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );

  // ── DELETE /api/v1/auth/webauthn/credentials/:id ───────────────
  // Requires authentication — removes a credential by its credential_id.

  app.delete<{ Params: { id: string } }>(
    '/api/v1/auth/webauthn/credentials/:id',
    async (request: FastifyRequest<{ Params: { id: string } }>, reply: FastifyReply) => {
      const user = getAuthUser(request);
      if (!user) {
        return sendError(reply, 401, 'Authentication required');
      }

      const { id } = request.params;

      try {
        const deleted = await mgr.removeCredential(id);
        if (deleted === 0) {
          return sendError(reply, 404, 'Credential not found');
        }
        return reply.code(204).send();
      } catch (err) {
        return sendError(reply, 500, toErrorMessage(err));
      }
    }
  );
}
