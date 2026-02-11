/**
 * Auth Routes — login, refresh, logout, API-key CRUD.
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { AuthService } from '../security/auth.js';
import { AuthError } from '../security/auth.js';
import type { RateLimiterLike } from '../security/rate-limiter.js';
import type { Role } from '@friday/shared';

export interface AuthRoutesOptions {
  authService: AuthService;
  rateLimiter: RateLimiterLike;
}

export function registerAuthRoutes(
  app: FastifyInstance,
  opts: AuthRoutesOptions,
): void {
  const { authService, rateLimiter } = opts;

  // ── POST /api/v1/auth/login ───────────────────────────────────────
  app.post('/api/v1/auth/login', async (
    request: FastifyRequest<{ Body: { password: string; rememberMe?: boolean } }>,
    reply: FastifyReply,
  ) => {
    const { password, rememberMe } = request.body ?? {};
    if (!password || typeof password !== 'string') {
      return reply.code(400).send({ error: 'Password is required' });
    }

    try {
      const result = await authService.login(password, request.ip, !!rememberMe);
      return result;
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ── POST /api/v1/auth/refresh ─────────────────────────────────────
  app.post('/api/v1/auth/refresh', async (
    request: FastifyRequest<{ Body: { refreshToken: string } }>,
    reply: FastifyReply,
  ) => {
    const { refreshToken } = request.body ?? {};
    if (!refreshToken || typeof refreshToken !== 'string') {
      return reply.code(400).send({ error: 'Refresh token is required' });
    }

    try {
      const result = await authService.refresh(refreshToken);
      return result;
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ── POST /api/v1/auth/logout ──────────────────────────────────────
  app.post('/api/v1/auth/logout', async (
    request: FastifyRequest,
    reply: FastifyReply,
  ) => {
    const user = request.authUser;
    if (!user?.jti || !user.exp) {
      return reply.code(400).send({ error: 'No active JWT session' });
    }

    await authService.logout(user.jti, user.userId, user.exp);
    return { message: 'Logged out' };
  });

  // ── POST /api/v1/auth/reset-password ─────────────────────────────
  app.post('/api/v1/auth/reset-password', async (
    request: FastifyRequest<{ Body: { currentPassword: string; newPassword: string } }>,
    reply: FastifyReply,
  ) => {
    const { currentPassword, newPassword } = request.body ?? {};
    if (!currentPassword || typeof currentPassword !== 'string') {
      return reply.code(400).send({ error: 'Current password is required' });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return reply.code(400).send({ error: 'New password is required' });
    }

    try {
      await authService.resetPassword(currentPassword, newPassword);
      return { message: 'Password reset successfully. All sessions have been invalidated.' };
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ── POST /api/v1/auth/api-keys ────────────────────────────────────
  app.post('/api/v1/auth/api-keys', async (
    request: FastifyRequest<{
      Body: { name: string; role: Role; expiresInDays?: number };
    }>,
    reply: FastifyReply,
  ) => {
    const { name, role, expiresInDays } = request.body ?? {};
    if (!name || typeof name !== 'string') {
      return reply.code(400).send({ error: 'Name is required' });
    }
    if (!role || typeof role !== 'string') {
      return reply.code(400).send({ error: 'Role is required' });
    }

    try {
      const result = await authService.createApiKey({
        name,
        role: role as Role,
        userId: request.authUser!.userId,
        expiresInDays,
      });
      return reply.code(201).send(result);
    } catch (err) {
      if (err instanceof AuthError) {
        return reply.code(err.statusCode).send({ error: err.message });
      }
      return reply.code(500).send({ error: 'Internal server error' });
    }
  });

  // ── GET /api/v1/auth/api-keys ─────────────────────────────────────
  app.get('/api/v1/auth/api-keys', async (request: FastifyRequest) => {
    const keys = authService.listApiKeys(request.authUser?.userId);
    return { keys };
  });

  // ── DELETE /api/v1/auth/api-keys/:id ──────────────────────────────
  app.delete('/api/v1/auth/api-keys/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply,
  ) => {
    const ok = await authService.revokeApiKey(
      request.params.id,
      request.authUser!.userId,
    );
    if (!ok) {
      return reply.code(404).send({ error: 'API key not found or already revoked' });
    }
    return { message: 'API key revoked' };
  });
}
